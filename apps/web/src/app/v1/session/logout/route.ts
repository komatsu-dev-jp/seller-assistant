import type { NextRequest } from "next/server";
import { matchesConfiguredAppOrigin } from "../../../../lib/request-origin";

export async function POST(request: NextRequest) {
  const apiOrigin = process.env.API_INTERNAL_ORIGIN;
  if (!apiOrigin) {
    return Response.json(
      {
        code: "api_not_connected",
        message: "ローカルAPIが未接続です。sessionと端末データは変更していません。",
      },
      { status: 503 },
    );
  }

  const appOrigin = process.env.APP_ORIGIN;
  if (!appOrigin || !matchesConfiguredAppOrigin(request, appOrigin, true)) {
    return Response.json(
      { code: "app_origin_rejected", message: "アプリの公開URLを確認できません。" },
      { status: 403 },
    );
  }

  let endpoint: URL;
  try {
    endpoint = new URL("/v1/session/logout", apiOrigin);
  } catch {
    return Response.json(
      { code: "invalid_api_origin", message: "API接続先の設定が不正です。" },
      { status: 503 },
    );
  }
  try {
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        cookie: request.headers.get("cookie") ?? "",
        origin: appOrigin,
        "sec-fetch-site": "same-origin",
      },
      cache: "no-store",
      redirect: "manual",
    });
    if (upstream.status !== 204) {
      return Response.json(
        { code: "logout_not_confirmed", message: "APIのsession失効を確認できませんでした。" },
        { status: upstream.status >= 400 ? upstream.status : 503 },
      );
    }
    const response = new Response(null, { status: 204 });
    const clearedCookie = upstream.headers.get("set-cookie");
    if (clearedCookie) response.headers.set("set-cookie", clearedCookie);
    return response;
  } catch {
    return Response.json(
      { code: "api_unreachable", message: "APIへ接続できません。" },
      { status: 503 },
    );
  }
}
