import type { NextRequest } from "next/server";
import { matchesConfiguredAppOrigin } from "../../../../lib/request-origin";

export async function GET(request: NextRequest) {
  const apiOrigin = process.env.API_INTERNAL_ORIGIN;
  const appOrigin = process.env.APP_ORIGIN;
  if (!apiOrigin) {
    return Response.json(
      { code: "api_not_connected", message: "ローカルAPIが未接続です。" },
      { status: 503 },
    );
  }
  if (!matchesConfiguredAppOrigin(request, appOrigin, false)) {
    return Response.json(
      { code: "app_origin_rejected", message: "アプリのURLを確認できません。" },
      { status: 403 },
    );
  }

  try {
    const endpoint = new URL("/v1/session/context", apiOrigin);
    const upstream = await fetch(endpoint, {
      method: "GET",
      headers: { accept: "application/json", cookie: request.headers.get("cookie") ?? "" },
      cache: "no-store",
      redirect: "manual",
    });
    const safeStatus = [200, 401, 403].includes(upstream.status) ? upstream.status : 503;
    const payload = (await upstream.json().catch(() => null)) as Record<string, unknown> | null;
    return Response.json(
      payload ?? { code: "context_not_confirmed", message: "事業所を確認できませんでした。" },
      { status: safeStatus },
    );
  } catch {
    return Response.json(
      { code: "api_unreachable", message: "APIへ接続できません。" },
      { status: 503 },
    );
  }
}
