"use client";

import type {
  InventorySummary,
  OwnerPulseResponse,
  P0ItemResponse,
  SessionContextResponse,
} from "@resale/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { OfflineSyncStatus } from "./offline-sync-status";
import { loadCaptureUploads } from "../lib/capture-outbox";
import styles from "./navigation-home-team.module.css";

type HomeRole = SessionContextResponse["role"];
type FlowState = "完了" | "進行中" | "未着手" | "要確認";
type HomeMode = "home" | "work" | "outbox";

export function HomeWorkspace({ workspaceId, role }: { workspaceId: string; role: HomeRole }) {
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [pulse, setPulse] = useState<OwnerPulseResponse | null>(null);
  const [items, setItems] = useState<P0ItemResponse[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<HomeMode>("home");
  const [capturePending, setCapturePending] = useState<number | null>(null);
  const [outboxError, setOutboxError] = useState("");
  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [nextSummary, nextItems, nextPulse] = await Promise.all([
        requestJson<InventorySummary>(`/v1/workspaces/${workspaceId}/inventory/summary`),
        requestJson<P0ItemResponse[]>(`/v1/workspaces/${workspaceId}/p0-items`),
        role === "owner"
          ? requestJson<OwnerPulseResponse>(`/v1/workspaces/${workspaceId}/owner-pulse`)
          : Promise.resolve(null),
      ]);
      setSummary(nextSummary);
      setItems(nextItems);
      setPulse(nextPulse);
    } catch (reason) {
      setError(errorMessage(reason));
      throw reason;
    } finally {
      setLoading(false);
    }
  }, [role, workspaceId]);

  useEffect(() => {
    void refresh().catch(() => undefined);
  }, [refresh]);

  useEffect(() => {
    if (mode !== "outbox") return;
    let cancelled = false;
    setCapturePending(null);
    setOutboxError("");
    void Promise.all(
      items.map(async (item) => {
        const records = await loadCaptureUploads(workspaceId, item.skuId);
        return records.filter((record) => !record.uploaded).length;
      }),
    )
      .then((counts) => {
        if (!cancelled) setCapturePending(counts.reduce((total, count) => total + count, 0));
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setCapturePending(null);
          setOutboxError(
            reason instanceof Error ? reason.message : "端末内の撮影途中データを確認できません。",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [items, mode, workspaceId]);

  const current = items[0];
  const checks = [
    {
      label: "原価未配賦",
      count: pulse?.missingCostCount ?? "—",
      tone: "warning",
      icon: "◇",
      href: "/workflow",
      detail: "仕入・原価の確認へ",
    },
    {
      label: "送料未確定",
      count: pulse?.missingShippingCount ?? "—",
      tone: "info",
      icon: "▱",
      href: "/shipping",
      detail: "注文・配送の確認へ",
    },
    {
      label: "90日超在庫",
      count: pulse?.aging.olderThan90Days ?? summary?.olderThan90Days ?? "—",
      tone: "warning",
      icon: "□",
      href: "/inventory",
      detail: "在庫一覧へ",
    },
    {
      label: "承認待ち",
      count: pulse?.approvalPendingCount ?? "—",
      tone: "neutral",
      icon: "▣",
      href: approvalDestination(pulse),
      detail: approvalBreakdownLabel(pulse),
    },
  ] as const;
  const firstUnresolved =
    checks.find((check) => typeof check.count === "number" && check.count > 0)?.href ??
    "/inventory";
  const flow = current ? itemFlow(current) : [];
  const waterfall = useMemo(() => ownerWaterfall(pulse), [pulse]);

  return (
    <>
      {error ? (
        <div className={styles.loadError} role="alert">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => void refresh().catch(() => undefined)}
            disabled={loading}
          >
            {loading ? "再読み込み中…" : "再読み込み"}
          </button>
        </div>
      ) : null}
      <nav className={styles.homeModes} aria-label="ホームの表示切替" role="tablist">
        {(
          [
            ["home", "ホーム", "今日の確認"],
            ["work", "作業一覧", "工程別に見る"],
            ["outbox", "送信待ち", "端末内を確認"],
          ] as const
        ).map(([nextMode, label, detail]) => (
          <button
            key={nextMode}
            type="button"
            role="tab"
            aria-selected={mode === nextMode}
            onClick={() => setMode(nextMode)}
          >
            <strong>{label}</strong>
            <small>{detail}</small>
          </button>
        ))}
      </nav>

      {mode === "work" ? <HomeWorkList items={items} /> : null}
      {mode === "outbox" ? (
        <section className={styles.outboxView} aria-labelledby="home-outbox-heading">
          <div className={styles.modeHeading}>
            <div>
              <p className="eyebrow">M06 / 送信待ち</p>
              <h2 id="home-outbox-heading">送信待ちを確認</h2>
              <p>端末内に残っている作業だけを表示します。外部へ自動送信しません。</p>
            </div>
            <a className="secondaryButton" href="/mobile">
              現場作業を開く
            </a>
          </div>
          <OfflineSyncStatus />
          <section className={`panel ${styles.captureOutboxCard}`} aria-label="撮影途中データ">
            <div>
              <span className={styles.sectionLabel}>撮影・採寸の途中保存</span>
              <h3>未送信の写真</h3>
              <p>撮影画面で端末に保存した未送信ファイルです。件数だけを読み取ります。</p>
            </div>
            <strong>{capturePending === null ? "確認中" : `${capturePending}件`}</strong>
            {outboxError ? (
              <p className="formError" role="alert">
                {outboxError}
              </p>
            ) : null}
            <a className="primaryButton" href="/mobile/capture">
              撮影・採寸を開く
            </a>
          </section>
          <p className={styles.modeNote} role="note">
            保存先はこの端末内です。同期・再送は人が内容を確認してから行います。
          </p>
        </section>
      ) : null}

      {mode === "home" ? (
        <div className={`homeDashboard ownerPulseDashboard ${styles.homeDashboard}`}>
          {role === "owner" ? (
            <section className="ownerMetricGrid" aria-label="運用収支の実データ">
              <OwnerMetric
                label="取引完了売上"
                value={money(pulse?.completedSalesMinor)}
                note={`${pulse?.completedOrderCount ?? "—"}件・当月JST`}
              />
              <OwnerMetric
                label="商品粗利益"
                value={money(pulse?.grossProfitMinor)}
                note={
                  pulse?.missingCostCount
                    ? `原価未配賦 ${pulse.missingCostCount}件`
                    : "原価反映済み"
                }
                warning={Boolean(pulse?.missingCostCount)}
              />
              <OwnerMetric
                label="取引貢献利益"
                value={money(pulse?.contributionProfitMinor)}
                note={
                  pulse?.missingShippingCount
                    ? `送料未確定 ${pulse.missingShippingCount}件`
                    : "手数料・送料・梱包費反映"
                }
                warning={Boolean(pulse?.missingShippingCount)}
              />
              <OwnerMetric
                label="期末在庫原価"
                value={money(pulse?.inventoryCostMinor)}
                note={
                  pulse?.inventoryCostMinor === null
                    ? "未配賦を解消すると表示"
                    : "現在庫の配賦済み原価"
                }
                warning={pulse?.inventoryCostMinor === null}
              />
            </section>
          ) : (
            <section className="ownerMetricGrid" aria-label="在庫運用の実データ">
              <OwnerMetric
                label="在庫中"
                value={count(summary?.available)}
                note="現在販売できる在庫"
              />
              <OwnerMetric
                label="未格納"
                value={count(summary?.putawayPending)}
                note="場所の確定待ち"
                warning={Boolean(summary?.putawayPending)}
              />
              <OwnerMetric
                label="引当済み"
                value={count(summary?.reserved)}
                note="発送工程へ引継ぎ"
              />
              <OwnerMetric
                label="棚卸差異"
                value={count(summary?.discrepancies)}
                note="差異だけで在庫は変えません"
                warning={Boolean(summary?.discrepancies)}
              />
            </section>
          )}

          <div className="ownerPulsePrimaryGrid">
            <section className="panel ownerFinancePanel" aria-labelledby="monthly-operations">
              <div className="panelHead">
                <div>
                  <span className="sectionKicker">運用収支</span>
                  <h2 id="monthly-operations">{periodLabel(pulse)}の収支</h2>
                </div>
                <span className="safeBadge">{pulse?.formulaVersion ?? "DB読込中"}</span>
              </div>
              {role === "owner" ? (
                <div className="ownerWaterfall" aria-label="当月の運用収支内訳">
                  {waterfall.map((entry) => (
                    <div className={`ownerWaterfallItem ${entry.tone}`} key={entry.label}>
                      <div className="ownerWaterfallBar" aria-hidden="true">
                        <span style={{ height: `${entry.height}%` }} />
                      </div>
                      <strong>{money(entry.value)}</strong>
                      <small>{entry.label}</small>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="ownerRestrictedState">
                  <strong>収支情報はオーナーだけに表示します</strong>
                  <p>在庫責任者には、担当に必要な在庫・差異情報だけを表示しています。</p>
                </div>
              )}
            </section>

            <section className="panel ownerConfirmPanel" aria-labelledby="today-checks">
              <div className="panelHead">
                <div>
                  <span className="sectionKicker">確認候補</span>
                  <h2 id="today-checks">今日の確認</h2>
                </div>
                <span className="safeBadge">DB実データ</span>
              </div>
              <div className="ownerCheckList">
                {checks.map((check) => (
                  <a
                    className={`ownerCheckRow ${check.tone}`}
                    href={check.href}
                    key={check.label}
                    aria-label={`${check.label} ${check.count}件、${check.detail}`}
                    title={check.detail}
                  >
                    <span className="ownerCheckIcon" aria-hidden="true">
                      {check.icon}
                    </span>
                    <strong>{check.label}</strong>
                    <b>{check.count}</b>
                    <span aria-hidden="true">›</span>
                  </a>
                ))}
              </div>
              {role === "owner" ? <ApprovalBreakdown pulse={pulse} /> : null}
              <a className="primaryButton fullButton" href={firstUnresolved}>
                未解決を確認
              </a>
            </section>
          </div>

          <div className="ownerPulseSecondaryGrid">
            <section className="panel ownerAgingPanel" aria-labelledby="inventory-aging">
              <div className="panelHead">
                <div>
                  <span className="sectionKicker">在庫日数</span>
                  <h2 id="inventory-aging">在庫年齢</h2>
                </div>
                <a href="/inventory">在庫を開く</a>
              </div>
              <div className="ownerAgingGrid">
                {[
                  ["0–30日", pulse?.aging.days0To30 ?? "—", "normal"],
                  ["31–60日", pulse?.aging.days31To60 ?? "—", "normal"],
                  ["61–90日", pulse?.aging.days61To90 ?? "—", "normal"],
                  [
                    "90日超",
                    pulse?.aging.olderThan90Days ?? summary?.olderThan90Days ?? "—",
                    "warning",
                  ],
                ].map(([label, value, tone]) => (
                  <div className={`ownerAgingCell ${tone}`} key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            </section>

            {role === "owner" ? (
              <section className="panel ownerSupplierPanel" aria-labelledby="supplier-overview">
                <div className="panelHead">
                  <div>
                    <span className="sectionKicker">基本データ充足率</span>
                    <h2 id="supplier-overview">仕入先の概要</h2>
                  </div>
                  <span className="safeBadge">上位3件</span>
                </div>
                {pulse?.supplierOverview.length ? (
                  <div className="ownerSupplierList">
                    {pulse.supplierOverview.map((supplier) => (
                      <div className="ownerSupplierRow" key={supplier.supplierName}>
                        <strong>{supplier.supplierName}</strong>
                        <span>n={supplier.itemCount}</span>
                        <small>充足率 {supplier.coreDataCompletenessPercent}%</small>
                        <span className="ownerSupplierBar" aria-hidden="true">
                          <i style={{ width: `${supplier.coreDataCompletenessPercent}%` }} />
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="ownerSupplierEmpty">
                    <strong>仕入先データはまだありません</strong>
                    <p>商品登録後、原価・格納・撮影の基本データ充足率を表示します。</p>
                    <a href="/workflow">仕入商品を登録</a>
                  </div>
                )}
                <p className="ownerSupplierNote">
                  件数とデータの揃い具合です。仕入継続・停止を自動判断しません。
                </p>
              </section>
            ) : (
              <section className="workbench ownerCurrentWork" aria-labelledby="current-item">
                {current ? (
                  <>
                    <div className="workbenchTitle">
                      <div>
                        <p className="eyebrow">次の作業・DB現在値</p>
                        <h2 id="current-item">
                          {current.inventoryNumber}｜{current.title}
                        </h2>
                      </div>
                      <span
                        className={requiresInventoryReview(current) ? "status warning" : "status"}
                      >
                        {inventoryStatusLabel(current.inventoryStatus)}
                      </span>
                    </div>
                    <div className="flow ownerCompactFlow" aria-label="商品の進行状況">
                      {flow.map(([label, state], index) => (
                        <div
                          className={`flowStep ${
                            state === "完了"
                              ? "done"
                              : state === "進行中"
                                ? "active"
                                : state === "要確認"
                                  ? "review"
                                  : ""
                          }`}
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
                        <p>
                          {requiresInventoryReview(current)
                            ? "返品・隔離・廃棄候補は未解決です。確認が終わるまで完了にしません。"
                            : "在庫番号・場所・写真・工程を同じSKUで追跡しています。"}
                        </p>
                      </div>
                      <a
                        className="primaryButton"
                        href={
                          requiresInventoryReview(current) ? "/inventory/stocktake" : "/workflow"
                        }
                      >
                        {requiresInventoryReview(current) ? "差異・隔離を確認" : "商品作業を開く"}
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
            )}
          </div>

          <p className="ownerPulseDisclaimer" role="note">
            {pulse?.disclaimer ??
              "運用分析の参考値です。会計上の売上・利益・所得・税額を示すものではありません。"}
          </p>
        </div>
      ) : null}
    </>
  );
}

function HomeWorkList({ items }: { items: P0ItemResponse[] }) {
  const stages = [
    ["purchase", "仕入・確認"],
    ["capture", "撮影・採寸"],
    ["listing", "出品準備"],
    ["shipping", "注文・発送"],
    ["inventory", "在庫確認"],
  ] as const;
  const counts = stages.map(([key]) => items.filter((item) => itemWorkStage(item) === key).length);
  return (
    <section className={styles.workListView} aria-labelledby="home-work-heading">
      <div className={styles.modeHeading}>
        <div>
          <p className="eyebrow">M05 / 作業一覧</p>
          <h2 id="home-work-heading">作業一覧</h2>
          <p>データベースにある商品だけを、次の工程ごとに表示します。</p>
        </div>
        <a className="secondaryButton" href="/workflow">
          商品作業を開く
        </a>
      </div>
      <div className={styles.workSummaryGrid} aria-label="工程別件数">
        {stages.map(([key, label], index) => (
          <div className={styles.workSummaryCard} key={key}>
            <span>{label}</span>
            <strong>{counts[index]}件</strong>
          </div>
        ))}
      </div>
      <div className={styles.workCards}>
        {items.length === 0 ? (
          <p className={styles.emptyState}>作業中の商品はありません。商品作業から登録できます。</p>
        ) : (
          items.map((item) => {
            const stage = itemWorkStage(item);
            return (
              <article className={styles.workCard} key={item.skuId}>
                <div className={styles.workCardHead}>
                  <span className={styles.workStage}>{workStageLabel(stage)}</span>
                  <span className={styles.workStatus}>
                    {inventoryStatusLabel(item.inventoryStatus)}
                  </span>
                </div>
                <h3>{item.skuCode}</h3>
                <p>{item.title}</p>
                <small>
                  {item.inventoryNumber}・{item.locationCode ?? "場所未登録"}
                </small>
                <a className="primaryButton" href={workItemHref(item)}>
                  この作業を開く
                </a>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}

function OwnerMetric({
  label,
  value,
  note,
  warning = false,
}: {
  label: string;
  value: string;
  note: string;
  warning?: boolean;
}) {
  return (
    <article className={`ownerMetricCard ${warning ? "warning" : ""}`}>
      <span>運用参考値</span>
      <p>{label}</p>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

function ownerWaterfall(pulse: OwnerPulseResponse | null) {
  const entries = [
    { label: "取引完了売上", value: pulse?.completedSalesMinor ?? null, tone: "positive" },
    { label: "返金", value: pulse ? -pulse.refundsMinor : null, tone: "negative" },
    { label: "商品原価", value: pulse ? -pulse.costOfGoodsMinor : null, tone: "negative" },
    { label: "商品粗利益", value: pulse?.grossProfitMinor ?? null, tone: "result" },
    { label: "販売手数料", value: pulse ? -pulse.sellingFeesMinor : null, tone: "negative" },
    {
      label: "送料・梱包",
      value: pulse ? -(pulse.shippingCostMinor + pulse.packagingCostMinor) : null,
      tone: "negative",
    },
    { label: "取引貢献利益", value: pulse?.contributionProfitMinor ?? null, tone: "result" },
  ];
  const maximum = Math.max(1, ...entries.map((entry) => Math.abs(entry.value ?? 0)));
  return entries.map((entry) => ({
    ...entry,
    height:
      entry.value === null ? 8 : Math.max(8, Math.round((Math.abs(entry.value) / maximum) * 100)),
  }));
}

function itemFlow(item: P0ItemResponse): Array<[string, FlowState]> {
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
  const state = (threshold: number): FlowState =>
    rank >= threshold ? "完了" : rank === threshold - 1 ? "進行中" : "未着手";
  const review = requiresInventoryReview(item);
  return [
    ["仕入", "完了"],
    ["格納", item.inventoryStatus === "putaway_pending" ? "進行中" : "完了"],
    ["撮影・採寸", state(1)],
    ["出品準備", state(2)],
    [review ? "返品・隔離" : "発送", review ? "要確認" : state(6)],
    ["会計CSV", review ? "要確認" : state(7)],
  ];
}

function requiresInventoryReview(item: P0ItemResponse): boolean {
  return ["quarantined", "disposal_pending", "lost"].includes(item.inventoryStatus);
}

function inventoryStatusLabel(status: P0ItemResponse["inventoryStatus"]): string {
  return {
    putaway_pending: "格納待ち",
    available: "在庫中",
    reserved: "引当済み",
    picked: "ピッキング済み",
    packed: "梱包済み",
    shipped: "発送済み",
    quarantined: "返品隔離・要確認",
    disposal_pending: "廃棄候補・要確認",
    lost: "紛失確認",
    disposed: "廃棄確認",
  }[status];
}

type WorkStage = "purchase" | "capture" | "listing" | "shipping" | "inventory";

function itemWorkStage(item: P0ItemResponse): WorkStage {
  if (
    ["putaway_pending", "quarantined", "disposal_pending", "lost", "disposed"].includes(
      item.inventoryStatus,
    )
  ) {
    return "inventory";
  }
  if (["order_confirmed", "picked", "packed", "shipped"].includes(item.workflowState)) {
    return "shipping";
  }
  if (item.workflowState === "listing_confirmed") return "listing";
  if (item.workflowState === "capture_confirmed") return "listing";
  if (item.workflowState === "purchase_confirmed") {
    return item.capture.photoAssetIds.length > 0 || item.capture.measurements.length > 0
      ? "capture"
      : "purchase";
  }
  if (item.workflowState === "sku_created") return "purchase";
  return "capture";
}

function workStageLabel(stage: WorkStage): string {
  return {
    purchase: "仕入・確認",
    capture: "撮影・採寸",
    listing: "出品準備",
    shipping: "注文・発送",
    inventory: "在庫確認",
  }[stage];
}

function workItemHref(item: P0ItemResponse): string {
  const stage = itemWorkStage(item);
  if (stage === "inventory") {
    return item.inventoryStatus === "putaway_pending" ? "/mobile/scan" : "/inventory/stocktake";
  }
  if (stage === "shipping") return "/shipping";
  return "/workflow";
}

function money(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : `¥${value.toLocaleString("ja-JP")}`;
}

function count(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : `${value.toLocaleString("ja-JP")}件`;
}

function periodLabel(pulse: OwnerPulseResponse | null): string {
  if (!pulse) return "当月";
  return new Intl.DateTimeFormat("ja-JP", { month: "long", timeZone: "Asia/Tokyo" }).format(
    new Date(pulse.periodStart),
  );
}

function approvalDestination(pulse: OwnerPulseResponse | null): string {
  const pending = pulse?.approvalPendingBreakdown;
  if (!pending) return "/inventory/stocktake";
  if (pending.stocktakeDiscrepancyCount > 0) return "/inventory/stocktake?focus=approval-pending";
  if (pending.locationPhotoCount > 0) return "/inventory?focus=pending-location-photo";
  if (pending.disposalCandidateCount > 0) return "/inventory?focus=disposal-candidate";
  if (pending.listingReviewCount > 0) return "/workflow";
  return "/inventory";
}

function approvalBreakdownLabel(pulse: OwnerPulseResponse | null): string {
  const pending = pulse?.approvalPendingBreakdown;
  if (!pending) return "承認内容を確認";
  return (
    [
      ["棚卸", pending.stocktakeDiscrepancyCount],
      ["場所写真", pending.locationPhotoCount],
      ["廃棄候補", pending.disposalCandidateCount],
      ["出品準備", pending.listingReviewCount],
    ]
      .filter(([, count]) => Number(count) > 0)
      .map(([label, count]) => `${label}${count}件`)
      .join("・") || "承認待ちなし"
  );
}

function ApprovalBreakdown({ pulse }: { pulse: OwnerPulseResponse | null }) {
  const pending = pulse?.approvalPendingBreakdown;
  if (!pending) return <p className="accountingDisclaimer">承認待ちの内訳を確認中です。</p>;

  const entries = [
    {
      label: "棚卸差異",
      count: pending.stocktakeDiscrepancyCount,
      href: "/inventory/stocktake?focus=approval-pending",
      detail: "差異・即時確認キューを開く",
    },
    {
      label: "場所写真",
      count: pending.locationPhotoCount,
      href: "/inventory?focus=pending-location-photo",
      detail: "未承認写真がある保管場所を開く",
    },
    {
      label: "廃棄候補",
      count: pending.disposalCandidateCount,
      href: "/inventory?focus=disposal-candidate",
      detail: "廃棄候補の現物一覧を開く",
    },
    {
      label: "出品準備の確認",
      count: pending.listingReviewCount,
      href: "/workflow",
      detail: "出品準備の確認を開く",
    },
  ] as const;

  return (
    <div className="ownerCheckList" aria-label="承認待ちの内訳">
      {entries.map((entry) =>
        entry.count > 0 ? (
          <a
            className="ownerCheckRow neutral"
            href={entry.href}
            key={entry.label}
            aria-label={`${entry.label} ${entry.count}件、${entry.detail}`}
            title={entry.detail}
          >
            <strong>{entry.label}</strong>
            <b>{entry.count}</b>
            <span aria-hidden="true">›</span>
          </a>
        ) : (
          <p className="accountingDisclaimer" key={entry.label}>
            {entry.label} 0件（該当なし）
          </p>
        ),
      )}
    </div>
  );
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
