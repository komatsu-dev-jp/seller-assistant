"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { LocationNodeResponse, P0ItemResponse, StocktakeResponse } from "@resale/contracts";

export function StocktakeWorkspace({ workspaceId }: { workspaceId: string }) {
  const [stocktakes, setStocktakes] = useState<StocktakeResponse[]>([]);
  const [locations, setLocations] = useState<LocationNodeResponse[]>([]);
  const [items, setItems] = useState<P0ItemResponse[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const active = stocktakes.find((stocktake) => stocktake.state !== "approved") ?? null;

  const reload = useCallback(async () => {
    const [counts, places, products] = await Promise.all([
      requestJson<StocktakeResponse[]>(`/v1/workspaces/${workspaceId}/stocktakes`),
      requestJson<LocationNodeResponse[]>(`/v1/workspaces/${workspaceId}/locations`),
      requestJson<P0ItemResponse[]>(`/v1/workspaces/${workspaceId}/p0-items`),
    ]);
    setStocktakes(counts);
    setLocations(places);
    setItems(products);
  }, [workspaceId]);

  useEffect(() => {
    void reload().catch((error: unknown) =>
      setMessage(error instanceof Error ? error.message : "棚卸情報を取得できませんでした。"),
    );
  }, [reload]);

  async function act(url: string, body: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    try {
      await requestJson(url, { method: "POST", body: JSON.stringify(body) });
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作を完了できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  const labelTargets = useMemo(
    () => [
      ...items.map((item) => ({
        type: "inventory_unit",
        id: item.inventoryUnitId,
        label: item.inventoryNumber,
      })),
      ...locations.map((location) => ({ type: "location", id: location.id, label: location.code })),
    ],
    [items, locations],
  );

  return (
    <section className="panel inventoryMain">
      <p className="eyebrow">STOCKTAKE & LABELS</p>
      <h2>棚卸差異・別担当確認・ラベル再発行</h2>
      {!active ? (
        <form
          action={(form) =>
            act(`/v1/workspaces/${workspaceId}/stocktakes`, {
              locationId: form.get("locationId"),
              humanConfirmed: true,
            })
          }
          className="operationsFormGrid"
        >
          <label>
            棚卸場所
            <select name="locationId" required>
              {locations
                .filter((location) => location.canStoreInventory)
                .map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.code} / {location.name}
                  </option>
                ))}
            </select>
          </label>
          <button disabled={busy} type="submit">
            人が確認して棚卸開始
          </button>
        </form>
      ) : (
        <div className="candidateNotice">
          <strong>
            {active.locationCode} / {active.state}
          </strong>
          <p>
            読取 {active.observationCount}件、差異 {active.discrepancies.length}件
          </p>
          {active.postStartMovements.length > 0 ? (
            <div className="accountingDisclaimer">
              <strong>棚卸開始後の通常移動 {active.postStartMovements.length}件</strong>
              {active.postStartMovements.map((movement) => (
                <p key={movement.inventoryUnitId}>
                  {movement.inventoryNumber}: {movement.expectedLocationCode} →{" "}
                  {movement.currentLocationCode ?? "場所なし"}
                  （移動番号 {movement.snapshotMovementSequence} →{" "}
                  {movement.currentMovementSequence}）
                </p>
              ))}
              <small>未発見候補には含めず、移動履歴として別に照合します。</small>
            </div>
          ) : null}
          {active.state === "counting" ? (
            <>
              <form
                action={(form) =>
                  act(
                    `/v1/workspaces/${workspaceId}/stocktakes/${active.stocktakeId}/observations`,
                    {
                      readResult: "readable",
                      inventoryNumber: formText(form, "inventoryNumber").toUpperCase(),
                      observedAt: new Date().toISOString(),
                      humanConfirmed: true,
                    },
                  )
                }
              >
                <label>
                  在庫管理番号
                  <input name="inventoryNumber" required placeholder="INV-000001-7" />
                </label>
                <button disabled={busy}>読取を記録</button>
              </form>
              <form
                className="operationsFormGrid"
                action={(form) =>
                  act(
                    `/v1/workspaces/${workspaceId}/stocktakes/${active.stocktakeId}/observations`,
                    {
                      readResult: "unreadable",
                      failureReason: form.get("failureReason"),
                      observedAt: new Date().toISOString(),
                      humanConfirmed: true,
                    },
                  )
                }
              >
                <label>
                  読取不能の理由
                  <select name="failureReason" defaultValue="damaged_label">
                    <option value="camera_blur">カメラのぶれ</option>
                    <option value="damaged_label">ラベル破損</option>
                    <option value="no_label">ラベルなし</option>
                    <option value="manual_unreadable">手入力でも読取不能</option>
                  </select>
                </label>
                <button disabled={busy}>読取不能として記録</button>
              </form>
              {active.observations.length > 0 ? (
                <ul className="auditList" aria-label="棚卸の全読取記録">
                  {active.observations.map((observation) => (
                    <li key={observation.ordinal}>
                      <strong>
                        #{observation.ordinal} {observation.observedCode ?? "コードなし"}
                      </strong>
                      <span>
                        {observation.result}
                        {observation.failureReason ? ` / ${observation.failureReason}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <button
                disabled={busy}
                type="button"
                onClick={() =>
                  void act(
                    `/v1/workspaces/${workspaceId}/stocktakes/${active.stocktakeId}/reconcile`,
                    {},
                  )
                }
              >
                初回計数を提出
              </button>
            </>
          ) : null}
          {active.discrepancies.map((difference) => (
            <div key={difference.discrepancyId} className="humanGate">
              <div>
                <strong>{difference.inventoryNumber ?? difference.kind}</strong>
                <p>
                  {difference.kind} / {difference.state}
                </p>
              </div>
              {difference.state !== "resolved" ? (
                <button
                  disabled={busy}
                  type="button"
                  onClick={() =>
                    void act(
                      `/v1/workspaces/${workspaceId}/stocktakes/${active.stocktakeId}/discrepancies/${difference.discrepancyId}/resolve`,
                      { resolution: "no_inventory_adjustment", humanConfirmed: true },
                    )
                  }
                >
                  別担当として再確認
                </button>
              ) : null}
            </div>
          ))}
          {active.state === "reconciliation" ? (
            <button
              disabled={busy}
              type="button"
              onClick={() =>
                void act(`/v1/workspaces/${workspaceId}/stocktakes/${active.stocktakeId}/approve`, {
                  humanConfirmed: true,
                })
              }
            >
              別担当として棚卸承認
            </button>
          ) : null}
        </div>
      )}

      <form
        action={(form) => {
          const [targetType, targetId] = formText(form, "target").split(":");
          return act(`/v1/workspaces/${workspaceId}/inventory-labels/reissue`, {
            targetType,
            targetId,
            reasonCode: form.get("reasonCode"),
            humanConfirmed: true,
          });
        }}
        className="operationsFormGrid"
      >
        <label>
          再発行対象
          <select name="target" required>
            {labelTargets.map((target) => (
              <option key={`${target.type}:${target.id}`} value={`${target.type}:${target.id}`}>
                {target.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          理由
          <select name="reasonCode">
            <option value="damaged">破損</option>
            <option value="lost">紛失</option>
            <option value="unreadable">読取不能</option>
            <option value="security_reissue">安全上の再発行</option>
          </select>
        </label>
        <button disabled={busy} type="submit">
          旧ラベルを無効化して再発行
        </button>
      </form>
      {message ? <p role="alert">{message}</p> : null}
    </section>
  );
}

async function requestJson<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { accept: "application/json", "content-type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as { message?: string } | T | null;
  if (!response.ok)
    throw new Error(
      (payload as { message?: string } | null)?.message ?? "操作を確認できませんでした。",
    );
  return payload as T;
}

function formText(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}
