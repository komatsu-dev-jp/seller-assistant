"use client";

import type {
  InventorySummary,
  LocationNodeResponse,
  LocationPhotoResponse,
  P0ItemResponse,
} from "@resale/contracts";
import { useCallback, useEffect, useState } from "react";

export function InventoryWorkspace({ workspaceId }: { workspaceId: string }) {
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [locations, setLocations] = useState<LocationNodeResponse[]>([]);
  const [items, setItems] = useState<P0ItemResponse[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [locationPhotos, setLocationPhotos] = useState<LocationPhotoResponse[]>([]);
  const [photoNotice, setPhotoNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
    refreshLocationPhotos().catch((reason: unknown) => setError(errorMessage(reason)));
  }, [refreshLocationPhotos]);

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
          maxUnits: canStoreInventory && maxUnitsText ? Number(maxUnitsText) : null,
          humanConfirmed: true,
        }),
      });
      await refresh();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function uploadLocationPhoto(form: FormData) {
    if (!selectedLocationId) throw new Error("写真を登録する場所を選んでください。");
    const file = form.get("photo");
    if (!(file instanceof File) || file.size === 0)
      throw new Error("JPEGまたはPNGを選んでください。");
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      throw new Error("JPEGまたはPNGだけ登録できます。");
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

  return (
    <>
      {error ? (
        <p className="accountingDisclaimer" role="alert">
          {error}
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

      <div className="inventoryGrid">
        <section className="panel locationTree" aria-labelledby="location-tree-heading">
          <div className="panelHead">
            <h2 id="location-tree-heading">場所ツリー</h2>
            <span className="safeBadge">DB実データ</span>
          </div>
          {locations.length === 0 ? (
            <p>場所がありません。最初に部屋を登録してください。</p>
          ) : (
            locations.map((location) => (
              <div
                className="locationRow"
                key={location.id}
                style={{ paddingInlineStart: `${location.depth * 18 + 8}px` }}
              >
                <div>
                  <strong>{location.name}</strong>
                  <small>{location.code}</small>
                </div>
                <span>
                  {location.activeInventoryCount}点 / 写真{location.approvedPhotoCount}枚
                </span>
              </div>
            ))
          )}
        </section>

        <section className="panel" aria-labelledby="location-create-heading">
          <div className="panelHead">
            <h2 id="location-create-heading">場所を登録</h2>
          </div>
          <form action={createLocation} className="measurementGrid">
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
              <input name="canStoreInventory" type="checkbox" /> 商品を直接置ける
            </label>
            <label>
              <input name="singleItemOnly" type="checkbox" /> 1点専用
            </label>
            <label>
              <input name="allowMixedSku" type="checkbox" defaultChecked /> 異なるSKUを混載可
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

      <section className="panel inventoryTablePanel" aria-labelledby="location-photo-heading">
        <div className="panelHead">
          <h2 id="location-photo-heading">保管場所の写真</h2>
          <span className="safeBadge">原本は非公開・GPS除去</span>
        </div>
        <div className="measurementGrid">
          <label>
            写真を登録する場所
            <select
              value={selectedLocationId}
              onChange={(event) => setSelectedLocationId(event.target.value)}
            >
              <option value="">場所を選択</option>
              {locations.map((location) => (
                <option value={location.id} key={location.id}>
                  {"　".repeat(location.depth)}
                  {location.name} / {location.code}
                </option>
              ))}
            </select>
          </label>
          <form action={uploadLocationPhoto} className="measurementGrid">
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
              写真原本を安全に登録
            </button>
          </form>
        </div>
        {photoNotice ? <p className="accountingDisclaimer">{photoNotice}</p> : null}
        <p className="accountingDisclaimer">
          撮影者本人は承認できません。別の在庫管理担当が内容を確認すると、位置情報を除去した写真だけが表示されます。
        </p>
        <div className="inventoryTable" role="table" aria-label="場所写真の確認一覧">
          <div className="inventoryTableHead" role="row">
            <span>種類</span>
            <span>状態</span>
            <span>撮影日時</span>
            <span>位置情報</span>
            <span>操作</span>
          </div>
          {locationPhotos.map((photo) => (
            <div role="row" key={photo.photoId}>
              <strong>{photoKindLabel(photo.photoKind)}</strong>
              <span>{photo.reviewState === "approved" ? "確認済み" : "別担当の確認待ち"}</span>
              <span>{new Date(photo.capturedAt).toLocaleString("ja-JP")}</span>
              <span>{photo.reviewState === "approved" ? "GPS 0件" : "表示前"}</span>
              <span>
                {photo.reviewState === "pending" ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void approveLocationPhoto(photo)}
                  >
                    別担当として確認
                  </button>
                ) : photo.contentUrl ? (
                  <a href={photo.contentUrl} target="_blank" rel="noreferrer">
                    写真を開く
                  </a>
                ) : (
                  "—"
                )}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel inventoryTablePanel" aria-labelledby="inventory-list-heading">
        <div className="panelHead">
          <h2 id="inventory-list-heading">現物在庫</h2>
          <span>{items.length}点</span>
        </div>
        <div className="inventoryTable" role="table" aria-label="実在庫一覧">
          <div className="inventoryTableHead" role="row">
            <span>在庫番号</span>
            <span>SKU</span>
            <span>商品</span>
            <span>状態</span>
            <span>場所</span>
          </div>
          {items.map((item) => (
            <div role="row" key={item.inventoryUnitId}>
              <strong>{item.inventoryNumber}</strong>
              <span>{item.skuCode}</span>
              <span>{item.title}</span>
              <span>{item.inventoryStatus}</span>
              <span>{item.locationCode ?? "未格納"}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

async function requestJson<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
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
