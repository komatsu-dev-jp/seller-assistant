"use client";

import {
  hasValidCodeCheckDigit,
  type PutawayCatalogResponse,
  type WorkspaceRole,
  type LocationNodeResponse,
  type LocationPhotoResponse,
} from "@resale/contracts";
import { useEffect, useMemo, useState } from "react";

import { shortInventoryNumber } from "../lib/inventory-label";
import {
  inventoryFooterLinks,
  resolveInventoryCatalog,
  resolvePutawayLocationCatalog,
  createPrivateInventoryPhotoSession,
} from "../lib/inventory-live-safety";
import { createPendingPutaway, savePutawayOnlineFirst } from "../lib/offline-outbox";
import { LocalBarcodeScanner } from "./local-barcode-scanner";
import styles from "./inventory-live.module.css";

type Step = "inventory" | "location" | "confirm" | "saved";

const locationPattern = /^[A-Z0-9]+(?:-[A-Z0-9]+)+-[0-9]$/u;

export function MobileScanWorkflow({
  workspaceId,
  role,
}: {
  workspaceId: string;
  role: WorkspaceRole;
}) {
  const [step, setStep] = useState<Step>("inventory");
  const [value, setValue] = useState("");
  const [inventoryNumber, setInventoryNumber] = useState<string | null>(null);
  const [locationCode, setLocationCode] = useState<string | null>(null);
  const [inventoryScannedAt, setInventoryScannedAt] = useState<string | null>(null);
  const [locationScannedAt, setLocationScannedAt] = useState<string | null>(null);
  const [saveMode, setSaveMode] = useState<"synced" | "queued" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [catalog, setCatalog] = useState<PutawayCatalogResponse | null>(null);
  const [inventoryLabelVersion, setInventoryLabelVersion] = useState<number | null>(null);
  const [locationLabelVersion, setLocationLabelVersion] = useState<number | null>(null);

  useEffect(() => {
    fetch(`/v1/workspaces/${workspaceId}/inventory/putaway-catalog`, { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as PutawayCatalogResponse | { message?: string };
        if (!response.ok) throw new Error("message" in payload ? payload.message : undefined);
        setCatalog(payload as PutawayCatalogResponse);
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "有効なラベル版を取得できません。"),
      );
  }, [workspaceId]);

  const title = useMemo(() => {
    if (step === "inventory") return "商品ラベルを確認";
    if (step === "location") return "場所ラベルを確認";
    if (step === "confirm") return "現物を人が確認";
    return "同期待ちに保存";
  }, [step]);

  function acceptValue(candidate = value) {
    let normalized = candidate.trim().toUpperCase();
    if (normalized.length > 256 || /address|token|secret/iu.test(normalized)) {
      setError("ラベルに保存できない情報が含まれています。");
      return;
    }
    if (
      step === "location" &&
      (!locationPattern.test(normalized) || !hasValidCodeCheckDigit(normalized))
    ) {
      setError("場所コードは末尾のチェック値まで入力してください。");
      return;
    }
    if (step === "inventory") {
      let match: PutawayCatalogResponse["inventory"][number];
      try {
        match = resolveInventoryCatalog(normalized, catalog?.inventory ?? []);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "番号を確認できません。");
        return;
      }
      normalized = match.inventoryNumber;
      setInventoryNumber(normalized);
      setInventoryLabelVersion(match.labelVersion);
      setInventoryScannedAt(new Date().toISOString());
      setLocationCode(null);
      setLocationScannedAt(null);
      setLocationLabelVersion(null);
      setStep("location");
    } else {
      let match: PutawayCatalogResponse["locations"][number];
      try {
        match = resolvePutawayLocationCatalog(normalized, catalog?.locations ?? []);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "通常の保管場所を確認してください。");
        return;
      }
      setLocationCode(normalized);
      setLocationLabelVersion(match.labelVersion);
      setLocationScannedAt(new Date().toISOString());
      setStep("confirm");
    }
    setValue("");
    setError(null);
  }

  if (step === "saved") {
    return (
      <main className={`mobileScanPage successScreen ${styles.page} ${styles.scan}`}>
        <div className="successIcon">✓</div>
        <p className="eyebrow">{saveMode === "synced" ? "SERVER CONFIRMED" : "OFFLINE READY"}</p>
        <h1>{saveMode === "synced" ? "サーバーへ格納しました" : "同期待ちに保存しました"}</h1>
        <p>
          {saveMode === "synced"
            ? "商品と場所の二重読取をDBで再確認し、格納履歴を保存しました。"
            : "接続後に現在地を再確認します。競合時は自動上書きしません。"}
        </p>
        <a className="primaryButton" href="/mobile">
          今日の作業へ戻る
        </a>
        <InventoryMobileFooter role={role} />
      </main>
    );
  }

  return (
    <main className={`mobileScanPage ${styles.page} ${styles.scan}`}>
      <header>
        <a href="/mobile" aria-label="戻る">
          ‹
        </a>
        <div>
          <p className="eyebrow">PUTAWAY</p>
          <h1>{title}</h1>
        </div>
      </header>

      <ol className="scanSteps" aria-label="読取の進行状況">
        <li className={step !== "inventory" ? "done" : "active"}>商品</li>
        <li className={step === "confirm" ? "done" : step === "location" ? "active" : ""}>場所</li>
        <li className={step === "confirm" ? "active" : ""}>確認</li>
      </ol>

      <section className="scanEvidence panel">
        <div>
          <span>商品</span>
          <strong>{inventoryNumber ? shortInventoryNumber(inventoryNumber) : "未確認"}</strong>
          {inventoryNumber ? <small>{inventoryNumber}</small> : null}
        </div>
        <div>
          <span>場所</span>
          <strong>{locationCode ?? "未確認"}</strong>
        </div>
      </section>

      {step === "location" ? (
        <section className="panel">
          <h2>商品と写真を確認</h2>
          <PrivateInventoryPhoto
            workspaceId={workspaceId}
            url={
              catalog?.inventory.find((entry) => entry.inventoryNumber === inventoryNumber)
                ?.productPhotoUrl
            }
            label="商品写真"
          />
        </section>
      ) : null}

      {step !== "confirm" ? (
        <section className="scanInput panel">
          <label>
            {step === "inventory" ? "手書きラベルの在庫番号を入力" : "場所の番号を入力"}
            <input
              type="text"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={step === "inventory" ? "0001" : "ROOM-A-9"}
              autoCapitalize="characters"
              autoComplete="off"
            />
          </label>
          {error ? <p className="formError">{error}</p> : null}
          <button type="button" onClick={() => acceptValue()}>
            この番号を確認
          </button>
          <p className="fieldHelp">
            自社内部コード（このアプリ専用）です。商品は手書きの短い番号、場所は末尾のチェック値まで入力できます。
          </p>
          <details>
            <summary>印刷バーコードで読み取る（任意）</summary>
            <LocalBarcodeScanner
              key={step}
              label={step === "inventory" ? "商品バーコード" : "場所バーコード"}
              onDetected={acceptValue}
            />
          </details>
        </section>
      ) : (
        <section className="scanConfirm panel">
          <PrivateInventoryPhoto
            workspaceId={workspaceId}
            url={
              catalog?.inventory.find((entry) => entry.inventoryNumber === inventoryNumber)
                ?.productPhotoUrl
            }
            label="商品写真"
          />
          <ScanLocationPhotos
            workspaceId={workspaceId}
            role={role}
            locationCode={locationCode}
            name={catalog?.locations.find((entry) => entry.code === locationCode)?.name}
            approvedPhotoUrl={
              catalog?.locations.find((entry) => entry.code === locationCode)?.approvedPhotoUrl
            }
          />
          <h2>現物と場所は一致していますか？</h2>
          <p>
            {inventoryNumber} を {locationCode} へ格納します。
          </p>
          <p>読取だけでは確定しません。最後に人が現物を確認してください。</p>
          {error ? <p className="formError">{error}</p> : null}
          <button
            type="button"
            disabled={isSaving}
            onClick={() => {
              if (
                !inventoryNumber ||
                !locationCode ||
                !inventoryScannedAt ||
                !locationScannedAt ||
                !inventoryLabelVersion ||
                !locationLabelVersion
              )
                return;
              setIsSaving(true);
              setError(null);
              const operation = createPendingPutaway(
                inventoryNumber,
                locationCode,
                inventoryLabelVersion,
                locationLabelVersion,
                inventoryScannedAt,
                locationScannedAt,
              );
              void savePutawayOnlineFirst(operation)
                .then((mode) => {
                  setSaveMode(mode);
                  setStep("saved");
                })
                .catch((saveError) =>
                  setError(
                    saveError instanceof Error
                      ? saveError.message
                      : "格納を確認できませんでした。最初から読み直してください。",
                  ),
                )
                .finally(() => setIsSaving(false));
            }}
          >
            {isSaving ? "端末内へ保存中…" : "一致を確認して保存"}
          </button>
          <button
            type="button"
            className="secondaryButton"
            disabled={isSaving}
            onClick={() => {
              setInventoryNumber(null);
              setLocationCode(null);
              setInventoryScannedAt(null);
              setLocationScannedAt(null);
              setInventoryLabelVersion(null);
              setLocationLabelVersion(null);
              setStep("inventory");
            }}
          >
            最初から読み直す
          </button>
        </section>
      )}
      <InventoryMobileFooter role={role} />
    </main>
  );
}

export function InventoryMobileFooter({ role }: { role: WorkspaceRole }) {
  return (
    <nav className={`${styles.footer} ${styles.scanFooter}`} aria-label="メインメニュー">
      {inventoryFooterLinks(role).map(({ label, href }) =>
        href ? (
          <a key={label} href={href} aria-current={label === "在庫" ? "page" : undefined}>
            {label}
          </a>
        ) : (
          <span key={label} aria-disabled="true" title="この担当では利用できません">
            {label}
            <small>担当外</small>
          </span>
        ),
      )}
    </nav>
  );
}

function ScanLocationPhotos({
  workspaceId,
  role,
  locationCode,
  name,
  approvedPhotoUrl,
}: {
  workspaceId: string;
  role: WorkspaceRole;
  locationCode: string | null;
  name: string | undefined;
  approvedPhotoUrl: string | null | undefined;
}) {
  const [photos, setPhotos] = useState<LocationPhotoResponse[]>([]);
  const [message, setMessage] = useState("場所写真を読み込んでいます。");
  const [path, setPath] = useState("");
  useEffect(() => {
    let cancelled = false;
    setPhotos([]);
    if (!locationCode) return;
    if (approvedPhotoUrl) return;
    if (role !== "owner" && role !== "inventory_manager") {
      setMessage("この担当権限では場所写真を取得できません。現物の場所と番号を確認してください。");
      return;
    }
    void (async () => {
      const response = await fetch(`/v1/workspaces/${workspaceId}/locations`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("保管場所の情報を取得できません。");
      const places = (await response.json()) as LocationNodeResponse[];
      const place = places.find((entry) => entry.code === locationCode);
      if (!place) throw new Error("写真に対応する保管場所を確認できません。");
      const names: string[] = [];
      let current: LocationNodeResponse | undefined = place;
      const visited = new Set<string>();
      while (current && !visited.has(current.id)) {
        visited.add(current.id);
        names.unshift(current.name);
        const parentId: string | null = current.parentId;
        current = places.find((entry) => entry.id === parentId);
      }
      if (!cancelled) setPath(names.join(" › "));
      const result = await fetch(
        `/v1/workspaces/${workspaceId}/locations/${place.id}/photo-review-queue`,
        { cache: "no-store" },
      );
      if (!result.ok) throw new Error("場所写真を取得できません。現物を確認してください。");
      const allApproved = ((await result.json()) as LocationPhotoResponse[])
        .filter((entry) => entry.reviewState === "approved" && entry.contentUrl)
        .sort((left, right) => right.capturedAt.localeCompare(left.capturedAt));
      const approved = allApproved.filter(
        (photo, index) =>
          allApproved.findIndex((entry) => entry.photoKind === photo.photoKind) === index,
      );
      if (!cancelled) {
        setPhotos(approved);
        setMessage(
          approved.length
            ? "位置情報を除いた承認済み写真です。現物と一致するか確認してください。"
            : "確認済みの場所写真はありません。現物の場所を確認してください。",
        );
      }
    })().catch((reason: unknown) => {
      if (!cancelled)
        setMessage(reason instanceof Error ? reason.message : "写真を取得できません。");
    });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, locationCode, role, approvedPhotoUrl]);
  if (approvedPhotoUrl)
    return (
      <section>
        <h2>{name ?? "保管場所"}</h2>
        <PrivateInventoryPhoto
          workspaceId={workspaceId}
          url={approvedPhotoUrl}
          label="承認済みの保管場所"
        />
      </section>
    );
  return (
    <section>
      <h2>{path || name || "保管場所"}</h2>
      <p role="status">{message}</p>
      {photos.map((photo) => (
        <PrivateInventoryPhoto
          key={photo.photoId}
          workspaceId={workspaceId}
          url={photo.contentUrl}
          label="承認済みの保管場所"
        />
      ))}
    </section>
  );
}

export function PrivateInventoryPhoto({
  workspaceId,
  url,
  label,
}: {
  workspaceId: string;
  url: string | null | undefined;
  label: string;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const session = createPrivateInventoryPhotoSession({
      workspaceId,
      url,
      origin: window.location.origin,
      fetchImage: fetch,
      createObjectUrl: (blob) => URL.createObjectURL(blob),
      revokeObjectUrl: (objectUrl) => URL.revokeObjectURL(objectUrl),
      onChange: (state) => {
        setObjectUrl(state.url);
        setMessage(state.message);
      },
    });
    const revisit = () => {
      void session.load();
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") session.conceal();
      else revisit();
    };
    if (document.visibilityState !== "hidden") revisit();
    window.addEventListener("blur", session.conceal);
    window.addEventListener("focus", revisit);
    window.addEventListener("pagehide", session.conceal);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      session.dispose();
      window.removeEventListener("blur", session.conceal);
      window.removeEventListener("focus", revisit);
      window.removeEventListener("pagehide", session.conceal);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [workspaceId, url, retry]);
  return (
    <div>
      <strong>{label}</strong>
      <p role="status">{message}</p>
      {objectUrl ? (
        <img
          src={objectUrl}
          alt={label}
          style={{ maxWidth: "100%", maxHeight: 220, objectFit: "contain" }}
        />
      ) : url ? (
        <button type="button" onClick={() => setRetry((value) => value + 1)}>
          写真を再確認
        </button>
      ) : null}
    </div>
  );
}
