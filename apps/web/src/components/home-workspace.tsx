"use client";

import type { InventorySummary, P0ItemResponse } from "@resale/contracts";
import { useCallback, useEffect, useState } from "react";

export function HomeWorkspace({ workspaceId }: { workspaceId: string }) {
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [items, setItems] = useState<P0ItemResponse[]>([]);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    const [nextSummary, nextItems] = await Promise.all([
      requestJson<InventorySummary>(`/v1/workspaces/${workspaceId}/inventory/summary`),
      requestJson<P0ItemResponse[]>(`/v1/workspaces/${workspaceId}/p0-items`),
    ]);
    setSummary(nextSummary);
    setItems(nextItems);
  }, [workspaceId]);

  useEffect(() => {
    void refresh().catch((reason: unknown) => setError(errorMessage(reason)));
  }, [refresh]);

  const current = items[0];
  const checks = [
    { label: "未格納", count: summary?.putawayPending ?? "—", tone: "warning" },
    { label: "引当済み", count: summary?.reserved ?? "—", tone: "info" },
    { label: "棚卸差異", count: summary?.discrepancies ?? "—", tone: "warning" },
    { label: "90日超", count: summary?.olderThan90Days ?? "—", tone: "neutral" },
  ] as const;
  const flow = current ? itemFlow(current) : [];

  return (
    <>
      {error ? (
        <p className="accountingDisclaimer" role="alert">
          {error}
        </p>
      ) : null}
      <section className="checkGrid" aria-label="実データの概要">
        {checks.map((check) => (
          <article className={`checkCard ${check.tone}`} key={check.label}>
            <span>{check.label}</span>
            <strong>{check.count}</strong>
            <a href="/inventory">在庫で確認 →</a>
          </article>
        ))}
      </section>

      <section className="workbench" aria-labelledby="current-item">
        {current ? (
          <>
            <div className="workbenchTitle">
              <div>
                <p className="eyebrow">DB・現在の商品</p>
                <h2 id="current-item">
                  {current.inventoryNumber}｜{current.title}
                </h2>
              </div>
              <span className="status">{inventoryStatusLabel(current.inventoryStatus)}</span>
            </div>
            <div className="flow" aria-label="商品の進行状況">
              {flow.map(([label, state], index) => (
                <div
                  className={`flowStep ${state === "完了" ? "done" : state === "進行中" ? "active" : ""}`}
                  key={label}
                >
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <strong>{label}</strong>
                    <small>{state}</small>
                  </div>
                </div>
              ))}
            </div>
            <div className="nextAction">
              <div>
                <span className="actionLabel">現在地</span>
                <h3>{current.locationCode ?? "未格納"}</h3>
                <p>在庫番号・場所・写真・工程は同じSKUで追跡しています。</p>
              </div>
              <a className="primaryButton" href="/workflow">
                一気通貫作業を開く
              </a>
            </div>
          </>
        ) : (
          <div className="nextAction">
            <div>
              <span className="actionLabel">最初の作業</span>
              <h2 id="current-item">仕入商品を1点登録</h2>
              <p>証憑参照、原価、SKU、在庫番号をDBへまとめて保存します。</p>
            </div>
            <a className="primaryButton" href="/workflow">
              商品を登録
            </a>
          </div>
        )}
      </section>

      <section className="lowerGrid">
        <article className="panel notice">
          <div className="panelHead">
            <h2>保存状況</h2>
          </div>
          <p>{items.length}点の商品をDBから取得しました。架空の固定件数は表示しません。</p>
          <p>未取得や欠損は0と見なさず「—」で表示します。</p>
        </article>
        <article className="panel notice">
          <div className="panelHead">
            <h2>安全な運用</h2>
          </div>
          <p>個人向け販売は、画像と文章を準備した後に本人が公式画面で操作します。</p>
          <p>AIは候補です。商品・価格・公開・税務は自動確定しません。</p>
        </article>
      </section>
    </>
  );
}

function itemFlow(item: P0ItemResponse): Array<[string, "完了" | "進行中" | "未着手"]> {
  const ranks = [
    "purchase_confirmed",
    "capture_confirmed",
    "listing_confirmed",
    "order_confirmed",
    "picked",
    "packed",
    "shipped",
    "journal_approved",
  ];
  const rank = ranks.indexOf(item.workflowState);
  const state = (threshold: number): "完了" | "進行中" | "未着手" =>
    rank >= threshold ? "完了" : rank === threshold - 1 ? "進行中" : "未着手";
  return [
    ["仕入", "完了"],
    ["格納", item.inventoryStatus === "putaway_pending" ? "進行中" : "完了"],
    ["撮影・採寸", state(1)],
    ["出品準備", state(2)],
    ["発送", state(6)],
    ["会計CSV", state(7)],
  ];
}

function inventoryStatusLabel(status: P0ItemResponse["inventoryStatus"]): string {
  return {
    putaway_pending: "格納待ち",
    available: "在庫中",
    reserved: "引当済み",
    picked: "ピッキング済み",
    packed: "梱包済み",
    shipped: "発送済み",
    quarantined: "返品隔離",
    lost: "紛失確認",
    disposed: "廃棄確認",
  }[status];
}

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const payload = (await response.json().catch(() => null)) as T | { message?: string } | null;
  if (!response.ok)
    throw new Error(
      (payload as { message?: string } | null)?.message ?? "DBを確認できませんでした。",
    );
  return payload as T;
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : "DBを確認できませんでした。";
}
