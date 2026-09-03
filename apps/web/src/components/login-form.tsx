"use client";

import { useState } from "react";

import { ApprovedLiveLogin } from "./approved-live-login";

export function LoginForm() {
  const [status, setStatus] = useState<"idle" | "sending" | "error">("idle");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function submit() {
    setStatus("sending");
    setMessage("");
    try {
      const response = await fetch("/v1/session/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          password,
        }),
        cache: "no-store",
      });
      if (response.status !== 204) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "ログインを確認できませんでした。");
      }
      const contextResponse = await fetch("/v1/session/context", { cache: "no-store" });
      const context = (await contextResponse.json().catch(() => null)) as { role?: string } | null;
      if (!contextResponse.ok || !context?.role) {
        throw new Error("ログイン後の担当範囲を確認できませんでした。");
      }
      window.location.assign(
        context.role === "shipping"
          ? "/shipping"
          : context.role === "field_worker"
            ? "/mobile"
            : context.role === "accounting"
              ? "/accounting"
              : "/",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ログインを確認できませんでした。");
      setStatus("error");
    }
  }

  return (
    <ApprovedLiveLogin
      email={email}
      password={password}
      error={status === "error" ? message : null}
      busy={status === "sending"}
      onEmailChange={setEmail}
      onPasswordChange={setPassword}
      onSubmit={() => void submit()}
    />
  );
}
