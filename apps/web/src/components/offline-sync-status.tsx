"use client";

import { useCallback, useEffect, useState } from "react";

import {
  acknowledgeLegacyPutawayConflicts,
  legacyPutawayConflictCount,
  pendingPutawayCount,
  syncPendingPutaways,
} from "../lib/offline-outbox";

export function OfflineSyncStatus() {
  const [pending, setPending] = useState(0);
  const [rereadRequired, setRereadRequired] = useState(0);
  const [state, setState] = useState<"idle" | "syncing" | "error">("idle");
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [message, setMessage] = useState("接続後も現在地を再確認し、競合は自動上書きしません。");

  const synchronize = useCallback(async () => {
    setState("syncing");
    setMessage("サーバーの現在地とラベル版を確認しています。");
    try {
      const result = await syncPendingPutaways();
      setPending(result.remaining);
      setMessage(
        result.loginRequired
          ? "ログイン期限が切れました。再ログイン後に同期待ちを再送します。端末内に保持しています。"
          : result.discarded > 0
            ? `${result.discarded}件は担当解除・変更のため端末から消去しました。同期${result.synced}件、残り${result.remaining}件です。`
            : result.synced > 0
              ? `${result.synced}件を同期しました。残り${result.remaining}件です。`
              : result.remaining > 0
                ? "通信できません。端末内の同期待ちを保持しています。"
                : "同期待ちはありません。",
      );
      setState(result.loginRequired ? "error" : "idle");
    } catch (error) {
      setState("error");
      setMessage(
        error instanceof Error
          ? `${error.message} 自動上書きせず、再読取してください。`
          : "同期できませんでした。自動上書きせず、再読取してください。",
      );
      const current = await pendingPutawayCount().catch(() => null);
      if (current !== null) setPending(current);
    }
  }, []);

  useEffect(() => {
    void pendingPutawayCount()
      .then(setPending)
      .catch(() => setState("error"));
    void legacyPutawayConflictCount()
      .then(setRereadRequired)
      .catch(() => setState("error"));
    const synchronizeWhenOnline = () => {
      setIsOnline(true);
      void synchronize();
    };
    const showOfflineStatus = () => {
      setIsOnline(false);
      setState("idle");
    };
    if (navigator.onLine) {
      setIsOnline(true);
    } else {
      showOfflineStatus();
    }
    window.addEventListener("online", synchronizeWhenOnline);
    window.addEventListener("offline", showOfflineStatus);
    return () => {
      window.removeEventListener("online", synchronizeWhenOnline);
      window.removeEventListener("offline", showOfflineStatus);
    };
  }, [synchronize]);

  return (
    <section className="mobileSyncStatus panel" aria-live="polite">
      <div>
        <span>同期待ち</span>
        <strong>{pending}件</strong>
      </div>
      <div>
        <span>接続状態</span>
        <strong>{isOnline === null ? "接続確認中" : isOnline ? "オンライン" : "オフライン"}</strong>
      </div>
      {isOnline === false ? (
        <p>同期待ちは端末内に保持し、接続が戻った後に現在地を再確認して同期します。</p>
      ) : null}
      <p className={state === "error" ? "formError" : undefined}>{message}</p>
      <button
        disabled={isOnline !== true || state === "syncing" || pending === 0}
        onClick={() => void synchronize()}
      >
        {state === "syncing" ? "確認中…" : "同期を再試行"}
      </button>
      {rereadRequired > 0 ? (
        <div className="accountingDisclaimer">
          <strong>{rereadRequired}件は旧ラベル形式のため再読取が必要です。</strong>
          <p>自動変換や自動上書きはしていません。商品と場所を読み直してください。</p>
          <button
            type="button"
            onClick={() =>
              void acknowledgeLegacyPutawayConflicts().then(() => setRereadRequired(0))
            }
          >
            再読取の案内を確認した
          </button>
        </div>
      ) : null}
    </section>
  );
}
