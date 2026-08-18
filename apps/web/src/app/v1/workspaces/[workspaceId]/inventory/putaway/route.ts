import type { NextRequest } from "next/server";
import { matchesConfiguredAppOrigin } from "../../../../../../lib/request-origin";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ workspaceId: string }> },
) {
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
      { code: "app_origin_rejected", message: "アプリのURLを確認できません。" },
      { status: 403 },
    );
  }

  try {
    const { workspaceId } = await context.params;
    const endpoint = new URL(
      `/v1/workspaces/${encodeURIComponent(workspaceId)}/inventory/putaway`,
      apiOrigin,
    );
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        cookie: request.headers.get("cookie") ?? "",
        origin: appOrigin,
        "sec-fetch-site": "same-origin",
      },
      body: await request.text(),
      cache: "no-store",
      redirect: "manual",
    });
    const safeStatus = [201, 400, 401, 403, 409].includes(upstream.status) ? upstream.status : 503;
    const payload = (await upstream.json().catch(() => null)) as Record<string, unknown> | null;
    return Response.json(
      payload ?? { code: "putaway_not_confirmed", message: "格納を確認できませんでした。" },
      { status: safeStatus },
    );
  } catch {
    return Response.json(
      { code: "api_unreachable", message: "APIへ接続できません。" },
      { status: 503 },
    );
  }
}
