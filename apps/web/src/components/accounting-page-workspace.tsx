"use client";

import type { AccountingOrderOptionResponse } from "@resale/contracts";
import { useCallback, useEffect, useState } from "react";
import { AccountingWorkspace, type AccountingMobileStage } from "./accounting-workspace";
import styles from "./accounting-live-layout.module.css";

export function AccountingPageWorkspace({ workspaceId }: { workspaceId: string }) {
  const [orders, setOrders] = useState<AccountingOrderOptionResponse[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mobileStage, setMobileStage] = useState<AccountingMobileStage>("format");
  const [format, setFormat] = useState<"money_forward_journal_v1" | "generic_journal_v1">(
    "money_forward_journal_v1",
  );

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch(`/v1/workspaces/${workspaceId}/accounting/orders`, {
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as
        AccountingOrderOptionResponse[] | { message?: string } | null;
      if (!response.ok || !Array.isArray(payload)) {
        throw new Error(
          (!Array.isArray(payload) ? payload?.message : null) ??
            "会計候補のある注文を取得できませんでした。",
        );
      }
      setOrders(payload);
      setSelectedOrderId((current) =>
        current && payload.some((order) => order.orderId === current)
          ? current
          : (payload[0]?.orderId ?? null),
      );
    } catch (reason) {
      setLoadError(reason instanceof Error ? reason.message : "注文一覧を取得できませんでした。");
      throw reason;
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void reload().catch(() => undefined);
  }, [reload]);

  const selected = orders.find((order) => order.orderId === selectedOrderId) ?? null;
  return (
    <div className={`workflowBoard accountingPageBoard ${styles.board}`}>
      <nav className={styles.stages} aria-label="会計の作業画面">
        {(
          [
            ["format", "売上の事実"],
            ["profile", "基本設定"],
            ["mappings", "会計項目"],
            ["export", "ファイル・履歴"],
          ] as const
        ).map(([stage, label], index) => (
          <button
            key={stage}
            type="button"
            aria-pressed={
              mobileStage === stage ||
              (stage === "export" && ["preview", "import", "history"].includes(mobileStage))
            }
            onClick={() => setMobileStage(stage)}
          >
            <span>{index + 1}</span>
            {label}
          </button>
        ))}
      </nav>
      {["export", "preview", "import", "history"].includes(mobileStage) ? (
        <nav className={styles.substages} aria-label="ファイル作成と取込の工程">
          {(
            [
              ["export", "作成前の確認"],
              ["preview", "ファイル内容"],
              ["import", "手動取込の結果"],
              ["history", "作成・取込履歴"],
            ] as const
          ).map(([stage, label]) => (
            <button
              key={stage}
              type="button"
              aria-pressed={mobileStage === stage}
              onClick={() => setMobileStage(stage)}
            >
              {label}
            </button>
          ))}
        </nav>
      ) : null}
      {loadError ? (
        <div className={styles.loadError} role="alert">
          <p>{loadError}</p>
          <button
            type="button"
            onClick={() => void reload().catch(() => undefined)}
            disabled={loading}
          >
            {loading ? "再読み込み中…" : "再読み込み"}
          </button>
        </div>
      ) : null}
      <div
        className={`accountingFormatTabs accountingMobilePanel ${
          mobileStage === "export" ? "isActive" : ""
        }`}
        aria-label="CSV出力形式"
      >
        <button
          type="button"
          className={format === "money_forward_journal_v1" ? "active" : undefined}
          aria-pressed={format === "money_forward_journal_v1"}
          onClick={() => {
            setFormat("money_forward_journal_v1");
          }}
        >
          <strong>Money Forward向けCSV</strong>
          <span>公式画面へ手動で取り込む27列のCSV候補</span>
        </button>
        <button
          type="button"
          className={format === "generic_journal_v1" ? "active" : undefined}
          aria-pressed={format === "generic_journal_v1"}
          onClick={() => {
            setFormat("generic_journal_v1");
          }}
        >
          <strong>汎用CSV</strong>
          <span>他の会計ソフトや表計算で確認する19列のCSV候補</span>
        </button>
        <small>API連携なし・人が確認して出力</small>
      </div>
      <section
        className={`panel accountingOrderPicker accountingMobilePanel ${
          mobileStage === "format" ? "isActive" : ""
        }`}
        aria-labelledby="accounting-order-heading"
      >
        <div>
          <h2 id="accounting-order-heading">対象取引</h2>
          {selected ? (
            <p className="candidateReferences">
              状態:{" "}
              {selected.orderState === "shipped"
                ? "発送済み"
                : selected.orderState === "returned"
                  ? "返品済み"
                  : "確認中"}{" "}
              / 金額の根拠: {selected.financialEventCount}件
            </p>
          ) : null}
        </div>
        {orders.length > 0 ? (
          <label>
            発送済み・返品済みの取引
            <select
              value={selectedOrderId ?? ""}
              onChange={(event) => setSelectedOrderId(event.target.value)}
            >
              {orders.map((order) => (
                <option key={order.orderId} value={order.orderId}>
                  {order.orderNumber} / {order.skuCode} / {order.title} / 根拠
                  {order.financialEventCount}件
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p>会計候補を作れる発送済み取引はまだありません。</p>
        )}
      </section>
      <AccountingWorkspace
        key={`${selectedOrderId ?? "none"}:${format}`}
        workspaceId={workspaceId}
        orderId={selectedOrderId}
        preferredFormat={format}
        mobileStage={mobileStage}
        onMobileStageChange={setMobileStage}
      />
    </div>
  );
}
