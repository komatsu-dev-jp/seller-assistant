"use client";

import type { P0ItemResponse } from "@resale/contracts";
import { useCallback, useEffect, useState } from "react";

import { parseInventoryLookup, shortInventoryNumber } from "../lib/inventory-label";
import { LocalBarcodeScanner } from "./local-barcode-scanner";

export function MobileInventoryFind({ workspaceId }: { workspaceId: string }) {
  const [items, setItems] = useState<P0ItemResponse[]>([]);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<P0ItemResponse | null>(null);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
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
      setItems(payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "商品一覧を読み込めませんでした。");
    } finally {
      setLoaded(true);
    }
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  function find(value: string) {
    setQuery(value);
    setResult(null);
    setError("");
    const lookup = parseInventoryLookup(value);
    if (!lookup) {
      setError("商品バーコード、在庫番号、または4桁以上の短い番号を確認してください。");
      return;
    }

    const matches = items.filter((item) => {
      if (lookup.kind === "short") {
        return (
          shortInventoryNumber(item.inventoryNumber).replace(/^0+(?=[0-9])/u, "") ===
          lookup.shortNumber
        );
      }
      return item.inventoryNumber === lookup.inventoryNumber;
    });
    if (matches.length === 0) {
      setError("登録済みの商品が見つかりません。番号を確認してください。");
      return;
    }
    if (matches.length > 1) {
      setError("同じ短い番号が複数あります。商品バーコードか完全な在庫番号を使ってください。");
      return;
    }

    const match = matches[0];
    if (!match) return;
    if (lookup.kind === "barcode" && lookup.labelVersion !== match.inventoryLabelVersion) {
      setError("古い商品ラベルです。現在のラベルを印刷し直してください。");
      return;
    }
    setResult(match);
  }

  return (
    <main className="mobileScanPage mobileFindPage">
      <header>
        <a href="/mobile" aria-label="戻る">
          ‹
        </a>
        <div>
          <p className="eyebrow">FIND ITEM</p>
          <h1>バーコードで商品を探す</h1>
        </div>
      </header>

      <p className="mobileFindIntro">商品ラベルを読み取ると、今の保管場所を表示します。</p>

      <section className="panel mobileFindScanner">
        <LocalBarcodeScanner label="商品バーコード" onDetected={find} />
        <form
          onSubmit={(event) => {
            event.preventDefault();
            find(query);
          }}
        >
          <label>
            番号で探す
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="例：0123 または INV-000123-0"
              autoCapitalize="characters"
              autoComplete="off"
            />
          </label>
          <button type="submit" disabled={!loaded}>
            この番号を探す
          </button>
        </form>
        {error ? (
          <p className="formError" role="alert">
            {error}
          </p>
        ) : null}
      </section>

      {result ? (
        <section className="panel mobileFindResult" aria-live="polite">
          <div className="mobileFindSuccess">
            <span aria-hidden="true">✓</span>
            <div>
              <small>商品が見つかりました</small>
              <strong>{shortInventoryNumber(result.inventoryNumber)}</strong>
            </div>
          </div>
          <h2>{result.title}</h2>
          <dl>
            <div>
              <dt>保管場所</dt>
              <dd>{result.locationCode ?? "未格納"}</dd>
            </div>
            <div>
              <dt>状態</dt>
              <dd>{inventoryStatusLabel(result.inventoryStatus)}</dd>
            </div>
            <div>
              <dt>完全な在庫番号</dt>
              <dd>{result.inventoryNumber}</dd>
            </div>
          </dl>
          <p className="safeNotice">読取は検索だけです。保管場所の変更や在庫確定は行いません。</p>
          <button
            type="button"
            className="secondaryButton"
            onClick={() => {
              setQuery("");
              setResult(null);
              setError("");
            }}
          >
            次の商品を探す
          </button>
        </section>
      ) : null}
    </main>
  );
}

function inventoryStatusLabel(status: P0ItemResponse["inventoryStatus"]): string {
  return {
    putaway_pending: "格納待ち",
    available: "在庫中",
    reserved: "引当済み",
    picked: "取り出し済み",
    packed: "梱包済み",
    shipped: "発送済み",
    quarantined: "隔離・確認待ち",
    disposal_pending: "廃棄候補・確認待ち",
    lost: "所在確認中",
    disposed: "廃棄済み",
  }[status];
}
