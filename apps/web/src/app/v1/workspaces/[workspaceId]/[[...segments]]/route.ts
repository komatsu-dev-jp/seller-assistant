import type { NextRequest } from "next/server";
import { matchesConfiguredAppOrigin } from "../../../../../lib/request-origin";

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const orderActions = new Set([
  "address-leases",
  "pick",
  "pack",
  "ship",
  "return",
  "return-quarantine",
  "return-inspection",
  "financial-summary",
  "accounting-exports",
  "assignment",
]);

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ workspaceId: string; segments?: string[] }> },
) {
  return proxyWorkspaceRequest(request, context, "GET");
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ workspaceId: string; segments?: string[] }> },
) {
  return proxyWorkspaceRequest(request, context, "POST");
}

async function proxyWorkspaceRequest(
  request: NextRequest,
  context: { params: Promise<{ workspaceId: string; segments?: string[] }> },
  method: "GET" | "POST",
): Promise<Response> {
  const apiOrigin = process.env.API_INTERNAL_ORIGIN;
  const appOrigin = process.env.APP_ORIGIN;
  if (!apiOrigin) return apiError(503, "api_not_connected", "ローカルAPIが未接続です。");
  if (method === "POST" && !matchesConfiguredAppOrigin(request, appOrigin, true)) {
    return apiError(403, "app_origin_rejected", "アプリのURLを確認できません。");
  }

  const { workspaceId, segments = [] } = await context.params;
  if (!uuid.test(workspaceId) || !isAllowedPath(method, segments)) {
    return apiError(404, "route_not_available", "この操作はPWAから利用できません。");
  }
  try {
    const binaryUpload =
      method === "POST" &&
      segments.length === 3 &&
      (segments[2] === "media-uploads" ||
        (segments[0] === "locations" && segments[2] === "photos"));
    const encodedPath = segments.map(encodeURIComponent).join("/");
    const endpoint = new URL(
      `/v1/workspaces/${encodeURIComponent(workspaceId)}/${encodedPath}${request.nextUrl.search}`,
      apiOrigin,
    );
    const upstreamInit: RequestInit = {
      method,
      headers: {
        accept: request.headers.get("accept") ?? "application/json",
        ...(method === "POST"
          ? {
              "content-type": binaryUpload
                ? (request.headers.get("content-type") ?? "")
                : "application/json",
            }
          : {}),
        cookie: request.headers.get("cookie") ?? "",
        ...(appOrigin ? { origin: appOrigin } : {}),
        "sec-fetch-site": "same-origin",
      },
      cache: "no-store",
      redirect: "manual",
    };
    if (method === "POST") {
      upstreamInit.body = binaryUpload ? await request.arrayBuffer() : await request.text();
    }
    const upstream = await fetch(endpoint, upstreamInit);
    const safeStatus = [200, 201, 400, 401, 403, 404, 409].includes(upstream.status)
      ? upstream.status
      : 503;
    const contentType = upstream.headers.get("content-type") ?? "application/json";
    if (contentType.startsWith("text/csv")) {
      const headers = new Headers({
        "content-type": contentType,
        "cache-control": "private, no-store",
      });
      for (const name of ["content-disposition", "x-content-sha256"]) {
        const value = upstream.headers.get(name);
        if (value) headers.set(name, value);
      }
      return new Response(await upstream.arrayBuffer(), { status: safeStatus, headers });
    }
    if (contentType.startsWith("image/jpeg") || contentType.startsWith("image/png")) {
      return new Response(await upstream.arrayBuffer(), {
        status: safeStatus,
        headers: { "content-type": contentType, "cache-control": "private, no-store" },
      });
    }
    const payload = (await upstream.json().catch(() => null)) as Record<string, unknown> | null;
    return Response.json(
      payload ?? { code: "upstream_response_invalid", message: "API応答を確認できません。" },
      { status: safeStatus, headers: { "cache-control": "private, no-store" } },
    );
  } catch {
    return apiError(503, "api_unreachable", "APIへ接続できません。");
  }
}

function isAllowedPath(method: "GET" | "POST", segments: string[]): boolean {
  if (method === "GET" && segments.length === 1 && segments[0] === "shipping-tasks") {
    return true;
  }
  if (segments.length === 1 && ["p0-items", "locations"].includes(segments[0] ?? "")) {
    return true;
  }
  if (
    method === "GET" &&
    segments.length === 2 &&
    segments[0] === "inventory" &&
    ["summary", "putaway-catalog"].includes(segments[1] ?? "")
  ) {
    return true;
  }
  if (
    segments.length === 3 &&
    segments[0] === "locations" &&
    uuid.test(segments[1] ?? "") &&
    ["photos", "photo-review-queue"].includes(segments[2] ?? "")
  ) {
    return method === "GET" || segments[2] === "photos";
  }
  if (
    segments.length === 5 &&
    segments[0] === "locations" &&
    uuid.test(segments[1] ?? "") &&
    segments[2] === "photos" &&
    uuid.test(segments[3] ?? "")
  ) {
    return (
      (method === "POST" && segments[4] === "approval") ||
      (method === "GET" && segments[4] === "content")
    );
  }
  if (method === "POST" && segments.length === 1 && segments[0] === "orders") return true;
  if (
    method === "POST" &&
    segments.length === 3 &&
    segments[0] === "skus" &&
    uuid.test(segments[1] ?? "") &&
    ["p0-actions", "measurements", "media-uploads"].includes(segments[2] ?? "")
  ) {
    return true;
  }
  if (
    method === "GET" &&
    segments.length === 3 &&
    segments[0] === "skus" &&
    uuid.test(segments[1] ?? "") &&
    segments[2] === "capture-summary"
  ) {
    return true;
  }
  if (segments[0] !== "orders" || !uuid.test(segments[1] ?? "")) return false;
  if (segments.length === 3 && orderActions.has(segments[2] ?? "")) {
    if (method === "GET") return segments[2] === "financial-summary";
    return segments[2] !== "financial-summary";
  }
  if (method === "GET" && segments.length === 3 && segments[2] === "address") return true;
  return (
    method === "GET" &&
    segments.length === 5 &&
    segments[2] === "accounting-exports" &&
    uuid.test(segments[3] ?? "") &&
    segments[4] === "content"
  );
}

function apiError(status: number, code: string, message: string): Response {
  return Response.json({ code, message }, { status });
}
