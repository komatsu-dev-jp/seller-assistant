import type { NextRequest } from "next/server";
import { matchesConfiguredAppOrigin } from "../../../../lib/request-origin";

export async function POST(request: NextRequest) {
  const apiOrigin = process.env.API_INTERNAL_ORIGIN;
  const appOrigin = process.env.APP_ORIGIN;
  if (!apiOrigin) {
    return Response.json(
      { code: "api_not_connected", message: "ローカルAPIが未接続です。" },
      { status: 503 },
    );
  }
  if (!appOrigin || !matchesConfiguredAppOrigin(request, appOrigin, true)) {
    return Response.json(
      { code: "app_origin_rejected", message: "アプリの公開URLを確認できません。" },
      { status: 403 },
    );
  }

  let endpoint: URL;
  try {
    endpoint = new URL("/v1/session/login", apiOrigin);
  } catch {
    return Response.json(
      { code: "invalid_api_origin", message: "API接続先の設定が不正です。" },
      { status: 503 },
    );
  }

  try {
    const body = await request.text();
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        origin: appOrigin,
        "sec-fetch-site": "same-origin",
      },
      body,
      cache: "no-store",
      redirect: "manual",
    });
    if (upstream.status === 204) {
      const response = new Response(null, { status: 204 });
      const sessionCookie = upstream.headers.get("set-cookie");
      if (!sessionCookie) {
        return Response.json(
          { code: "login_not_confirmed", message: "セッションを確認できませんでした。" },
          { status: 503 },
        );
      }
      response.headers.set("set-cookie", sessionCookie);
      return response;
    }
    const safeStatus = [400, 401, 403, 429].includes(upstream.status) ? upstream.status : 503;
    const payload = (await upstream.json().catch(() => null)) as {
      code?: string;
      message?: string;
    } | null;
    const response = Response.json(
      {
        code: payload?.code ?? "login_not_confirmed",
        message: payload?.message ?? "ログインを確認できませんでした。",
      },
      { status: safeStatus },
    );
    const retryAfter = upstream.headers.get("retry-after");
    if (retryAfter) response.headers.set("retry-after", retryAfter);
    return response;
  } catch {
    return Response.json(
      { code: "api_unreachable", message: "APIへ接続できません。" },
      { status: 503 },
    );
  }
}
