"use client";

import { useState } from "react";
import { clearOfflineBusinessData } from "../lib/offline-outbox";

export function LogoutButton() {
  const [state, setState] = useState<"idle" | "working" | "error">("idle");

  async function logout() {
    setState("working");
    try {
      const response = await fetch("/v1/session/logout", {
        method: "POST",
        credentials: "include",
        headers: { accept: "application/json" },
      });
      if (response.status !== 204) {
        throw new Error("サーバー側のsession失効を確認できませんでした。");
      }
      await clearOfflineBusinessData();
      window.location.replace("/?logged-out=1");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="logoutArea">
      <button type="button" disabled={state === "working"} onClick={() => void logout()}>
        {state === "working" ? "安全にログアウト中…" : "ログアウト"}
      </button>
      {state === "error" ? (
        <p role="alert">ログアウトを完了できません。通信を確認して再実行してください。</p>
      ) : null}
    </div>
  );
}
