"use client";

import { useState, type FormEvent } from "react";

export function LoginForm() {
  const [status, setStatus] = useState<"idle" | "sending" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    setMessage("");
    const form = new FormData(event.currentTarget);
    const email = form.get("email");
    const password = form.get("password");
    try {
      const response = await fetch("/v1/session/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: typeof email === "string" ? email : "",
          password: typeof password === "string" ? password : "",
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
            : "/",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ログインを確認できませんでした。");
      setStatus("error");
    }
  }

  return (
    <form className="loginForm" onSubmit={(event) => void submit(event)}>
      <label>
        メールアドレス
        <input
          autoComplete="username"
          inputMode="email"
          maxLength={254}
          name="email"
          required
          type="email"
        />
      </label>
      <label>
        パスワード
        <input
          autoComplete="current-password"
          maxLength={128}
          minLength={12}
          name="password"
          required
          type="password"
        />
      </label>
      <button disabled={status === "sending"} type="submit">
        {status === "sending" ? "確認中…" : "ログイン"}
      </button>
      {status === "error" ? <p role="alert">{message}</p> : null}
    </form>
  );
}
