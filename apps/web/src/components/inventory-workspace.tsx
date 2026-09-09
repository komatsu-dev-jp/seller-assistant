"use client";

import type {
  InventorySummary,
  LocationNodeResponse,
  LocationPhotoResponse,
  P0ItemResponse,
} from "@resale/contracts";
import { useCallback, useEffect, useState } from "react";
import styles from "./inventory-live.module.css";
import { shortInventoryNumber } from "../lib/inventory-label";
import { inventoryStateLabel } from "../lib/inventory-live-safety";
import { PrivateInventoryPhoto } from "./mobile-scan-workflow";

export type InventoryFocus = "all" | "pending-location-photo" | "disposal-candidate";

export function InventoryWorkspace({
  workspaceId,
  initialFocus = "all",
}: {
  workspaceId: string;
  initialFocus?: InventoryFocus;
}) {
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [locations, setLocations] = useState<LocationNodeResponse[]>([]);
  const [items, setItems] = useState<P0ItemResponse[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [locationPhotos, setLocationPhotos] = useState<LocationPhotoResponse[]>([]);
  const [pendingPhotoLocationIds, setPendingPhotoLocationIds] = useState<string[] | null>(null);
  const [photoNotice, setPhotoNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stage, setStage] = useState<"items" | "locations" | "photos" | "create">(
    initialFocus === "pending-location-photo" ? "photos" : "items",
  );

  const refresh = useCallback(async () => {
    const [nextSummary, nextLocations, nextItems] = await Promise.all([
      requestJson<InventorySummary>(`/v1/workspaces/${workspaceId}/inventory/summary`),
      requestJson<LocationNodeResponse[]>(`/v1/workspaces/${workspaceId}/locations`),
      requestJson<P0ItemResponse[]>(`/v1/workspaces/${workspaceId}/p0-items`),
    ]);
    setSummary(nextSummary);
    setLocations(nextLocations);
    setItems(nextItems);
    setSelectedLocationId((current) => current || nextLocations[0]?.id || "");
  }, [workspaceId]);

  useEffect(() => {
    refresh().catch((reason: unknown) => setError(errorMessage(reason)));
  }, [refresh]);

  const refreshLocationPhotos = useCallback(async () => {
    if (!selectedLocationId) {
      setLocationPhotos([]);
      return;
    }
    setLocationPhotos(
      await requestJson<LocationPhotoResponse[]>(
        `/v1/workspaces/${workspaceId}/locations/${selectedLocationId}/photo-review-queue`,
      ),
    );
  }, [selectedLocationId, workspaceId]);

  useEffect(() => {
    let cancelled = false;
    setLocationPhotos([]);
    if (!selectedLocationId) return;
    void requestJson<LocationPhotoResponse[]>(
      `/v1/workspaces/${workspaceId}/locations/${selectedLocationId}/photo-review-queue`,
    )
      .then((photos) => {
        if (!cancelled) setLocationPhotos(photos);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(errorMessage(reason));
      });
    return () => {
      cancelled = true;
    };
  }, [selectedLocationId, workspaceId]);

  useEffect(() => {
    if (initialFocus !== "pending-location-photo") {
      setPendingPhotoLocationIds(null);
      return;
    }
    if (locations.length === 0) {
      setPendingPhotoLocationIds([]);
      return;
    }

    let cancelled = false;
    void Promise.all(
      locations.map(async (location) => {
        const photos = await requestJson<LocationPhotoResponse[]>(
          `/v1/workspaces/${workspaceId}/locations/${location.id}/photo-review-queue`,
        );
        return {
          locationId: location.id,
          hasPendingPhoto: photos.some((photo) => photo.reviewState === "pending"),
        };
      }),
    )
      .then((results) => {
        if (cancelled) return;
        const ids = results
          .filter((result) => result.hasPendingPhoto)
          .map((result) => result.locationId);
        setPendingPhotoLocationIds(ids);
        if (ids[0]) setSelectedLocationId(ids[0]);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(errorMessage(reason));
      });

    return () => {
      cancelled = true;
    };
  }, [initialFocus, locations, workspaceId]);

  async function createLocation(form: FormData) {
    setBusy(true);
    setError("");
    try {
      const parentId = form.get("parentId");
      const canStoreInventory = form.get("canStoreInventory") === "on";
      const maxUnitsText = textField(form, "maxUnits", false);
      await requestJson(`/v1/workspaces/${workspaceId}/locations`, {
        method: "POST",
        body: JSON.stringify({
          parentId: typeof parentId === "string" && parentId ? parentId : null,
          code: textField(form, "code").toUpperCase(),
          name: textField(form, "name"),
          canStoreInventory,
          singleItemOnly: form.get("singleItemOnly") === "on",
          allowMixedSku: form.get("allowMixedSku") === "on",
          purpose: textField(form, "purpose"),
          maxUnits: canStoreInventory && maxUnitsText ? Number(maxUnitsText) : null,
          humanConfirmed: true,
        }),
      });
      await refresh();
      setStage("locations");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function uploadLocationPhoto(form: FormData) {
    if (!selectedLocationId) {
      setError("写真を登録する場所を選んでください。");
      return;
    }
    const file = form.get("photo");
    if (!(file instanceof File) || file.size === 0) {
      setError("JPEGまたはPNGを選んでください。");
      return;
    }
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setError("JPEGまたはPNGだけ登録できます。");
      return;
    }
    setBusy(true);
    setError("");
    setPhotoNotice("");
    try {
      const query = new URLSearchParams({
        photoId: crypto.randomUUID(),
        originalAssetId: crypto.randomUUID(),
        photoKind: textField(form, "photoKind"),
        capturedAt: new Date().toISOString(),
        humanConfirmed: "true",
      });
      await requestJson<LocationPhotoResponse>(
        `/v1/workspaces/${workspaceId}/locations/${selectedLocationId}/photos?${query.toString()}`,
        { method: "POST", headers: { "content-type": file.type }, body: file },
      );
      setPhotoNotice("原本を非公開保存しました。別の在庫管理担当による確認待ちです。");
      await refreshLocationPhotos();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function approveLocationPhoto(photo: LocationPhotoResponse) {
    setBusy(true);
    setError("");
    setPhotoNotice("");
    try {
      await requestJson(
        `/v1/workspaces/${workspaceId}/locations/${selectedLocationId}/photos/${photo.photoId}/approval`,
        {
          method: "POST",
          body: JSON.stringify({ reviewedAt: new Date().toISOString(), humanApproved: true }),
        },
      );
      setPhotoNotice("位置情報を除去した表示用写真を承認しました。");
      await Promise.all([refresh(), refreshLocationPhotos()]);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  const selectedLocation =
    locations.find((location) => location.id === selectedLocationId) ?? locations[0] ?? null;
  const visibleLocations =
    initialFocus === "pending-location-photo" &&
    pendingPhotoLocationIds !== null &&
    pendingPhotoLocationIds.length > 0
      ? locations.filter((location) => pendingPhotoLocationIds.includes(location.id))
      : locations;
  const visibleItems =
    initialFocus === "disposal-candidate"
      ? items.filter((item) => item.inventoryStatus === "disposal_pending")
      : items;

  return (
    <div className={styles.workspace} data-stage={stage}>
      <nav className={styles.stages} aria-label="在庫の作業画面">
        {(
          [
            ["items", "在庫一覧"],
            ["locations", "保管場所"],
            ["photos", "場所の写真"],
            ["create", "場所を登録"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={stage === value}
            disabled={busy}
            onClick={() => setStage(value)}
          >
            {label}
          </button>
        ))}
      </nav>
      {error ? (
        <p className="accountingDisclaimer" role="alert">
          {error}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setError("");
              void refresh().catch((reason: unknown) => setError(errorMessage(reason)));
            }}
          >
            在庫を再読み込み
          </button>
        </p>
      ) : null}
      {!summary && !error ? <p role="status">在庫と場所を読み込んでいます。</p> : null}
      {initialFocus === "pending-location-photo" ? (
        <p className="safeNotice" role="status">
          {pendingPhotoLocationIds === null
            ? "未承認の場所写真を確認しています。"
            : pendingPhotoLocationIds.length > 0
              ? "未承認の場所写真がある保管場所だけを表示しています。"
              : "未承認の場所写真はありません。通常の在庫画面を表示します。"}
        </p>
      ) : null}
      {initialFocus === "disposal-candidate" ? (
        <p className="safeNotice" role="status">
          廃棄候補の現物だけを表示しています。廃棄の確定はここでは行いません。
        </p>
      ) : null}
      <section className="inventoryKpis" aria-label="在庫の概要">
        {[
          ["在庫中", summary?.available ?? "—", "stable"],
          ["未格納", summary?.putawayPending ?? "—", "warning"],
          ["引当済み", summary?.reserved ?? "—", "success"],
          ["差異", summary?.discrepancies ?? "—", "danger"],
          ["90日超", summary?.olderThan90Days ?? "—", "neutral"],
        ].map(([label, value, tone]) => (
          <article className={`inventoryKpi ${tone}`} key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </section>

      <div className="inventoryWorkbenchGrid">
        <section className="panel locationTree" aria-labelledby="location-tree-heading">
          <div className="panelHead">
            <h2 id="location-tree-heading">保管場所の一覧</h2>
            <span className="safeBadge">DB実データ</span>
          </div>
          {visibleLocations.length === 0 ? (
            <p>
              {initialFocus === "pending-location-photo"
                ? "未承認の場所写真がある保管場所はありません。"
                : "場所がありません。最初に部屋を登録してください。"}
            </p>
          ) : (
            visibleLocations.map((location) => (
              <button
                type="button"
                disabled={busy}
                className={`locationRow ${location.id === selectedLocationId ? "selected" : ""}`}
                key={location.id}
                style={{ paddingInlineStart: `${location.depth * 18 + 8}px` }}
                onClick={() => {
                  if (selectedLocationId !== location.id) setLocationPhotos([]);
                  setSelectedLocationId(location.id);
                  setStage("photos");
                }}
              >
                <div>
                  <strong>{location.name}</strong>
                  <small>{location.code}</small>
                </div>
                <span>
                  {location.activeInventoryCount}点 / 写真{location.approvedPhotoCount}枚
                </span>
              </button>
            ))
          )}
        </section>

        <section className="panel locationPhotoWorkbench" aria-labelledby="location-photo-heading">
          <div className="locationWorkbenchHead">
            <div>
              <p className="breadcrumb">
                {selectedLocation
                  ? `${selectedLocation.name} › ${selectedLocation.code}`
                  : "場所未選択"}
              </p>
              <h2 id="location-photo-heading">保管場所の写真</h2>
            </div>
            <span className="safeBadge">原本非公開・表示画像はGPS 0件</span>
          </div>

          <div className="approvedLocationPhotos" aria-label="選択場所の写真">
            {(["room", "shelf", "exact_position"] as const).map((kind) => {
              const photo = locationPhotos.find(
                (candidate) => candidate.photoKind === kind && candidate.reviewState === "approved",
              );
              return (
                <article className="locationPhotoCard" key={kind}>
                  <span>{photoKindLabel(kind)}</span>
                  {photo?.contentUrl ? (
                    stage === "photos" ? (
                      <PrivateInventoryPhoto
                        key={`${selectedLocationId}:${photo.photoId}`}
                        workspaceId={workspaceId}
                        url={photo.contentUrl}
                        label={`${photoKindLabel(kind)}の確認済み写真`}
                      />
                    ) : null
                  ) : (
                    <div className="locationPhotoEmpty" aria-hidden="true">
                      <span>▧</span>
                      <small>確認済み写真なし</small>
                    </div>
                  )}
                  <small>{photo ? "確認済み" : "登録待ち"}</small>
                </article>
              );
            })}
          </div>

          <form action={uploadLocationPhoto} className="locationPhotoForm locationPhotoQuickForm">
            <label>
              写真の種類
              <select name="photoKind" defaultValue="exact_position">
                <option value="room">部屋の全景</option>
                <option value="shelf">棚・ラック</option>
                <option value="exact_position">商品の正確な位置</option>
              </select>
            </label>
            <label>
              iPhoneで撮影または写真を選択
              <input
                name="photo"
                type="file"
                accept="image/jpeg,image/png"
                capture="environment"
                required
              />
            </label>
            <button type="submit" disabled={busy || !selectedLocationId}>
              写真を登録
            </button>
          </form>
          {photoNotice ? <p className="safeNotice">{photoNotice}</p> : null}

          <div className="photoReviewQueue" role="table" aria-label="場所写真の確認一覧">
            <div className="photoReviewHead" role="row">
              <span>種類</span>
              <span>状態</span>
              <span>撮影日時</span>
              <span>操作</span>
            </div>
            {locationPhotos.map((photo) => (
              <div role="row" key={photo.photoId}>
                <strong>{photoKindLabel(photo.photoKind)}</strong>
                <span>{photo.reviewState === "approved" ? "確認済み" : "別担当の確認待ち"}</span>
                <span>{new Date(photo.capturedAt).toLocaleString("ja-JP")}</span>
                <span>
                  {photo.reviewState === "pending" ? (
                    <button
                      type="button"
                      className="tinyButton"
                      disabled={busy}
                      onClick={() => void approveLocationPhoto(photo)}
                    >
                      別担当で確認
                    </button>
                  ) : photo.contentUrl ? (
                    <span>上の確認済み写真で確認</span>
                  ) : (
                    "—"
                  )}
                </span>
              </div>
            ))}
          </div>
          <p className="accountingDisclaimer">
            撮影者本人は承認できません。別担当の確認後、位置情報を除いた写真だけを表示します。
          </p>
        </section>

        <section className="panel inventoryCreatePanel" aria-labelledby="location-create-heading">
          <div className="panelHead">
            <h2 id="location-create-heading">場所を登録</h2>
          </div>
          <form action={createLocation} className="inventoryFormGrid">
            <label>
              親の場所
              <select name="parentId" defaultValue="">
                <option value="">なし（拠点・部屋）</option>
                {locations.map((location) => (
                  <option value={location.id} key={location.id}>
                    {"　".repeat(location.depth)}
                    {location.name} / {location.code}
                  </option>
                ))}
              </select>
            </label>
            <label>
              場所コード
              <input name="code" required placeholder="ROOM-A / SHELF-03" />
            </label>
            <label>
              表示名
              <input name="name" required placeholder="洋室A / 棚03" />
            </label>
            <label>
              場所の用途
              <select name="purpose" defaultValue="general">
                <option value="general">通常の商品保管</option>
                <option value="return_quarantine">返品専用・検品前の隔離</option>
              </select>
            </label>
            <label>
              <input name="canStoreInventory" type="checkbox" /> 商品を直接置ける
            </label>
            <label>
              <input name="singleItemOnly" type="checkbox" /> 1点専用
            </label>
            <label>
              <input name="allowMixedSku" type="checkbox" defaultChecked />{" "}
              種類の異なる商品を一緒に置ける
            </label>
            <label>
              最大点数
              <input name="maxUnits" type="number" min="1" placeholder="空欄は上限なし" />
            </label>
            <button type="submit" disabled={busy}>
              場所と場所ラベルを発行
            </button>
          </form>
          <p className="accountingDisclaimer">
            部屋全景・棚・正確な位置の写真は非公開保存し、別担当の承認後だけ外注担当へ表示します。
          </p>
        </section>
      </div>

      <section className="panel inventoryTablePanel" aria-labelledby="inventory-list-heading">
        <div className="panelHead">
          <h2 id="inventory-list-heading">
            {initialFocus === "disposal-candidate" ? "廃棄候補の現物在庫" : "現物在庫"}
          </h2>
          <span>{visibleItems.length}点</span>
        </div>
        {visibleItems.length === 0 ? (
          <p className="safeNotice">
            {initialFocus === "disposal-candidate"
              ? "廃棄候補の現物はありません。"
              : "表示できる現物在庫はありません。"}
          </p>
        ) : (
          <div
            className="inventoryTable"
            role="table"
            aria-label={
              initialFocus === "disposal-candidate" ? "廃棄候補の実在庫一覧" : "実在庫一覧"
            }
          >
            <div className="inventoryTableHead" role="row">
              <span>在庫番号</span>
              <span>商品識別番号</span>
              <span>商品</span>
              <span>状態</span>
              <span>場所</span>
            </div>
            {visibleItems.map((item) => (
              <div role="row" key={item.inventoryUnitId}>
                <div>
                  <strong>{shortInventoryNumber(item.inventoryNumber)}</strong>
                  <small>{item.inventoryNumber}</small>
                </div>
                <span>{item.skuCode}</span>
                <span>{item.title}</span>
                <span>{inventoryStateLabel(item.inventoryStatus)}</span>
                <span>{item.locationCode ?? "未格納"}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

async function requestJson<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: { accept: "application/json", "content-type": "application/json", ...init?.headers },
  });
  const payload = (await response.json().catch(() => null)) as { message?: string } | T | null;
  if (!response.ok)
    throw new Error(
      (payload as { message?: string } | null)?.message ?? "操作を確認できませんでした。",
    );
  return payload as T;
}
function textField(form: FormData, name: string, required = true): string {
  const value = form.get(name);
  if (typeof value !== "string" || (required && !value.trim()))
    throw new Error(`${name}を入力してください。`);
  return typeof value === "string" ? value.trim() : "";
}
function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : "操作を確認できませんでした。";
}
function photoKindLabel(kind: LocationPhotoResponse["photoKind"]): string {
  return { room: "部屋の全景", shelf: "棚・ラック", exact_position: "商品の正確な位置" }[kind];
}
