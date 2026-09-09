"use client";

import type { P0ItemResponse } from "@resale/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  buildInventoryBarcodePayload,
  inventoryCodeKindLabel,
  shortInventoryNumber,
} from "../lib/inventory-label";
import { Code128Barcode } from "./code128-barcode";
import styles from "./inventory-live.module.css";
import { selectedInventoryLabels } from "../lib/inventory-live-safety";

const labelsPerSheet = 24;

export function InventoryLabelWorkspace({ workspaceId }: { workspaceId: string }) {
  const [items, setItems] = useState<P0ItemResponse[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [labelMode, setLabelMode] = useState<"manual" | "barcode">("manual");

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch(`/v1/workspaces/${workspaceId}/p0-items`, {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as
        P0ItemResponse[] | { message?: string } | null;
      if (!response.ok || !Array.isArray(payload)) {
        throw new Error(
          payload && !Array.isArray(payload) && payload.message
            ? payload.message
            : "商品一覧を読み込めませんでした。",
        );
      }
      const printable = payload
        .filter((item) => !["shipped", "disposed"].includes(item.inventoryStatus))
        .sort((left, right) => left.inventoryNumber.localeCompare(right.inventoryNumber));
      setItems(printable);
      setSelectedIds([]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "商品一覧を読み込めませんでした。");
    } finally {
      setLoaded(true);
    }
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedItems = useMemo(
    () => selectedInventoryLabels(items, selectedIds),
    [items, selectedIds],
  );
  const normalizedQuery = query.trim().toUpperCase();
  const visibleItems = items.filter((item) => {
    if (!normalizedQuery) return true;
    return [
      item.inventoryNumber,
      shortInventoryNumber(item.inventoryNumber),
      item.title,
      item.skuCode,
    ]
      .join(" ")
      .toUpperCase()
      .includes(normalizedQuery);
  });

  function toggleItem(item: P0ItemResponse) {
    setSelectedIds((current) => {
      if (current.includes(item.inventoryUnitId)) {
        return current.filter((id) => id !== item.inventoryUnitId);
      }
      if (current.length >= labelsPerSheet) return current;
      return [...current, item.inventoryUnitId];
    });
  }

  return (
    <>
      <nav className={styles.stages} aria-label="ラベルの使い方">
        <button
          type="button"
          aria-pressed={labelMode === "manual"}
          onClick={() => setLabelMode("manual")}
        >
          手書き番号で始める
        </button>
        <button
          type="button"
          aria-pressed={labelMode === "barcode"}
          onClick={() => setLabelMode("barcode")}
        >
          バーコードを印刷（任意）
        </button>
      </nav>
      {labelMode === "manual" ? (
        <div className={styles.manualNote}>
          <strong>プリンターがなくても使えます</strong>
          <p>
            自社内部コード（このアプリ専用）です。商品を選び、短い商品番号をラベルに書いて貼ってください。格納時は商品番号と場所番号を入力し、現物を確認します。
          </p>
          <a href="/mobile/scan">番号を入力して格納する</a>
        </div>
      ) : null}
      <section className="panel inventoryLabelControls noPrint">
        <div>
          <p className="eyebrow">A4 LABEL SHEET</p>
          <h2>商品ラベルを選ぶ</h2>
          <p>
            {labelMode === "manual"
              ? "番号を確認する商品を選んでください。"
              : "1枚のA4用紙に最大24点。商品ごとに異なるバーコードを作ります。"}
          </p>
        </div>
        <div className="inventoryLabelSummary" aria-live="polite">
          <strong>{selectedItems.length}</strong>
          <span>/ 24点</span>
          <small>同じ商品番号なし</small>
        </div>
        <label className="inventoryLabelSearch">
          商品を検索
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="商品名・在庫番号・0123"
          />
        </label>
        <div className="inventoryLabelButtons">
          <button
            type="button"
            className="secondaryButton"
            onClick={() => setSelectedIds([])}
            disabled={selectedItems.length === 0}
          >
            選択を外す
          </button>
          {labelMode === "barcode" ? (
            <button
              type="button"
              onClick={() => window.print()}
              disabled={selectedItems.length === 0}
            >
              選んだラベルを印刷
            </button>
          ) : null}
        </div>
        <p className="safeNotice">
          番号の種類は{inventoryCodeKindLabel}
          （このアプリ専用）です。印刷前に商品名と番号を確認してください。バーコードには在庫番号とラベル版だけを入れ、住所・原価・購入者情報は入れません。
        </p>
      </section>

      {error ? (
        <p className="accountingDisclaimer noPrint" role="alert">
          {error}
          <button type="button" onClick={() => void load()}>
            再読み込み
          </button>
        </p>
      ) : null}

      <section className="inventoryLabelLayout">
        <div className="inventoryLabelPicker noPrint" role="list" aria-label="印刷する商品">
          {!loaded ? <p>商品を読み込んでいます。</p> : null}
          {loaded && visibleItems.length === 0 ? <p>該当する商品はありません。</p> : null}
          {visibleItems.map((item) => {
            const selected = selectedSet.has(item.inventoryUnitId);
            const limitReached = selectedItems.length >= labelsPerSheet && !selected;
            return (
              <label className={selected ? "isSelected" : ""} key={item.inventoryUnitId}>
                <input
                  type="checkbox"
                  checked={selected}
                  disabled={limitReached}
                  onChange={() => toggleItem(item)}
                />
                <strong>{shortInventoryNumber(item.inventoryNumber)}</strong>
                <span>{item.title}</span>
                <small>
                  {item.inventoryNumber} / {item.locationCode ?? "未格納"}
                </small>
              </label>
            );
          })}
        </div>

        <div
          className={labelMode === "barcode" ? "inventoryLabelSheet" : styles.manualLabels}
          aria-label={labelMode === "barcode" ? "A4商品ラベル印刷プレビュー" : "手書きする在庫番号"}
        >
          {selectedItems.length === 0 ? (
            <p className="inventoryLabelEmpty noPrint">左の一覧から商品を選んでください。</p>
          ) : (
            selectedItems.map((item) => {
              const shortNumber = shortInventoryNumber(item.inventoryNumber);
              const payload = buildInventoryBarcodePayload(
                item.inventoryNumber,
                item.inventoryLabelVersion,
              );
              return (
                <article
                  className={labelMode === "barcode" ? "inventoryPrintLabel" : undefined}
                  key={item.inventoryUnitId}
                >
                  <div>
                    <strong>{shortNumber}</strong>
                    <span>{item.title}</span>
                  </div>
                  {labelMode === "barcode" ? (
                    <Code128Barcode
                      value={payload}
                      label={`商品番号 ${shortNumber} のバーコード`}
                    />
                  ) : null}
                  <small>
                    {inventoryCodeKindLabel} ・ {item.inventoryNumber} ・{" "}
                    {item.locationCode ?? "未格納"} ・ V{item.inventoryLabelVersion}
                  </small>
                </article>
              );
            })
          )}
        </div>
      </section>
    </>
  );
}
