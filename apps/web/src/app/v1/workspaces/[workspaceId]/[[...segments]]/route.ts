import type { NextRequest } from "next/server";
import { matchesConfiguredAppOrigin } from "../../../../../lib/request-origin";
import {
  createWorkspaceProxyRequestInit,
  isAllowedOrderShippingProxyPath,
  isAllowedShippingPhotoProxyPath,
  privateNoStoreNoContentResponse,
  readShippingPhotoUpload,
  ShippingPhotoUploadError,
  type WorkspaceProxyMethod,
  type WorkspaceProxyRequestBody,
} from "../../../../../lib/workspace-proxy-request";

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

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ workspaceId: string; segments?: string[] }> },
) {
  return proxyWorkspaceRequest(request, context, "PUT");
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ workspaceId: string; segments?: string[] }> },
) {
  return proxyWorkspaceRequest(request, context, "PATCH");
}

async function proxyWorkspaceRequest(
  request: NextRequest,
  context: { params: Promise<{ workspaceId: string; segments?: string[] }> },
  method: WorkspaceProxyMethod,
): Promise<Response> {
  const apiOrigin = process.env.API_INTERNAL_ORIGIN;
  const appOrigin = process.env.APP_ORIGIN;
  if (!apiOrigin) return apiError(503, "api_not_connected", "ローカルAPIが未接続です。");
  if (method !== "GET" && !matchesConfiguredAppOrigin(request, appOrigin, true)) {
    return apiError(403, "app_origin_rejected", "アプリのURLを確認できません。");
  }

  const { workspaceId, segments = [] } = await context.params;
  if (
    !uuid.test(workspaceId) ||
    !isAllowedPath(method, segments) ||
    !hasAllowedReceiptEvidenceQuery(method, segments, request.nextUrl.searchParams)
  ) {
    return apiError(404, "route_not_available", "この操作はPWAから利用できません。");
  }
  try {
    const shippingPhotoUpload =
      method === "POST" &&
      segments.length === 3 &&
      segments[0] === "orders" &&
      segments[2] === "shipping-photos";
    const binaryUpload =
      method === "POST" &&
      ((segments.length === 1 && segments[0] === "receipt-evidence") ||
        (segments.length === 3 &&
          (segments[2] === "media-uploads" ||
            (segments[0] === "locations" && segments[2] === "photos") ||
            (segments[0] === "orders" && segments[2] === "shipping-photos"))) ||
        (segments.length === 5 &&
          segments[0] === "stocktakes" &&
          segments[2] === "discrepancies" &&
          segments[4] === "evidence"));
    const encodedPath = segments.map(encodeURIComponent).join("/");
    const endpoint = new URL(
      `/v1/workspaces/${encodeURIComponent(workspaceId)}/${encodedPath}${request.nextUrl.search}`,
      apiOrigin,
    );
    const body: WorkspaceProxyRequestBody | undefined =
      method !== "GET"
        ? binaryUpload
          ? { kind: "binary", ...(await readShippingPhotoUpload(request)) }
          : { kind: "json", text: await request.text() }
        : undefined;
    const upstreamInit = createWorkspaceProxyRequestInit({
      method,
      accept: request.headers.get("accept") ?? "application/json",
      cookie: request.headers.get("cookie") ?? "",
      ...(appOrigin ? { appOrigin } : {}),
      ...(body ? { body } : {}),
    });
    const upstream = await fetch(endpoint, upstreamInit);
    if (
      upstream.status === 204 &&
      shippingPhotoUpload === false &&
      segments[0] === "shipping-photo-policy"
    ) {
      return privateNoStoreNoContentResponse();
    }
    const safeStatus = [200, 201, 204, 400, 401, 403, 404, 409, 413].includes(upstream.status)
      ? upstream.status
      : 503;
    const contentType = upstream.headers.get("content-type") ?? "application/json";
    if (contentType.startsWith("text/csv")) {
      const headers = new Headers({
        "content-type": contentType,
        "cache-control": "private, no-store",
        pragma: "no-cache",
        "x-content-type-options": "nosniff",
      });
      for (const name of ["content-disposition", "x-content-sha256"]) {
        const value = upstream.headers.get(name);
        if (value) headers.set(name, value);
      }
      return new Response(await upstream.arrayBuffer(), { status: safeStatus, headers });
    }
    if (contentType.startsWith("image/jpeg") || contentType.startsWith("image/png")) {
      const headers = new Headers({
        "content-type": contentType,
        "cache-control": "private, no-store",
        pragma: "no-cache",
        "x-content-type-options": "nosniff",
      });
      for (const name of ["content-disposition", "x-content-type-options"]) {
        const value = upstream.headers.get(name);
        if (value) headers.set(name, value);
      }
      return new Response(await upstream.arrayBuffer(), {
        status: safeStatus,
        headers,
      });
    }
    const source = await upstream.text();
    let payload: unknown;
    try {
      payload = JSON.parse(source) as unknown;
    } catch {
      return apiError(503, "upstream_response_invalid", "API応答を確認できません。");
    }
    return Response.json(payload, {
      status: safeStatus,
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof ShippingPhotoUploadError) {
      return apiError(error.status, "shipping_photo_rejected", error.message);
    }
    return apiError(503, "api_unreachable", "APIへ接続できません。");
  }
}

export function isAllowedPath(method: WorkspaceProxyMethod, segments: string[]): boolean {
  const shippingPhotoPath = isAllowedShippingPhotoProxyPath(method, segments, uuid);
  if (shippingPhotoPath !== null) return shippingPhotoPath;
  const orderShippingPath = isAllowedOrderShippingProxyPath(method, segments, uuid);
  if (orderShippingPath !== null) return orderShippingPath;
  if (
    method === "GET" &&
    segments.length === 4 &&
    segments[0] === "orders" &&
    uuid.test(segments[1] ?? "") &&
    segments[2] === "pick-location-photo" &&
    segments[3] === "content"
  ) {
    return true;
  }
  if (method === "GET" && segments.length === 1 && segments[0] === "owner-pulse") {
    return true;
  }
  if (method === "POST" && segments.length === 1 && segments[0] === "pilot-runs") {
    return true;
  }
  if (
    method === "POST" &&
    segments.length === 3 &&
    segments[0] === "pilot-runs" &&
    uuid.test(segments[1] ?? "") &&
    segments[2] === "events"
  ) {
    return true;
  }
  if (
    method === "POST" &&
    segments.length === 3 &&
    segments[0] === "pilot-runs" &&
    uuid.test(segments[1] ?? "") &&
    segments[2] === "external-invalidation"
  ) {
    return true;
  }
  if (
    method === "GET" &&
    segments.length === 2 &&
    segments[0] === "pilot-runs" &&
    segments[1] === "latest"
  ) {
    return true;
  }
  if (method === "GET" && segments.length === 1 && segments[0] === "shipping-tasks") {
    return true;
  }
  if (method === "GET" && segments.length === 1 && segments[0] === "team") return true;
  if (
    method === "GET" &&
    segments.length === 2 &&
    segments[0] === "team" &&
    segments[1] === "change-requests"
  ) {
    return true;
  }
  if (method === "GET" && segments.length === 1 && segments[0] === "capture-tasks") return true;
  if (segments.length === 1 && segments[0] === "stocktakes") return true;
  if (
    method === "POST" &&
    segments.length === 2 &&
    segments[0] === "inventory-labels" &&
    segments[1] === "reissue"
  )
    return true;
  if (
    method === "GET" &&
    segments[0] === "stocktakes" &&
    uuid.test(segments[1] ?? "") &&
    segments[2] === "discrepancies" &&
    uuid.test(segments[3] ?? "") &&
    ((segments.length === 5 && segments[4] === "evidence") ||
      (segments.length === 7 &&
        segments[4] === "evidence" &&
        uuid.test(segments[5] ?? "") &&
        segments[6] === "content"))
  ) {
    return true;
  }
  if (
    method === "POST" &&
    segments[0] === "stocktakes" &&
    uuid.test(segments[1] ?? "") &&
    ((segments.length === 3 &&
      ["observations", "reconcile", "approve"].includes(segments[2] ?? "")) ||
      (segments.length === 5 &&
        segments[2] === "discrepancies" &&
        uuid.test(segments[3] ?? "") &&
        ["resolve", "evidence", "challenges", "confirm", "restore"].includes(segments[4] ?? "")))
  )
    return true;
  if (
    method === "POST" &&
    segments[0] === "team" &&
    ((segments.length === 2 &&
      ["members", "assignments", "change-requests"].includes(segments[1] ?? "")) ||
      (segments.length === 4 &&
        segments[1] === "change-requests" &&
        uuid.test(segments[2] ?? "") &&
        segments[3] === "events") ||
      (segments.length === 4 &&
        segments[1] === "assignments" &&
        uuid.test(segments[2] ?? "") &&
        segments[3] === "revoke"))
  ) {
    return true;
  }
  if (segments.length === 1 && ["p0-items", "locations"].includes(segments[0] ?? "")) {
    return true;
  }
  if (
    method === "GET" &&
    segments.length === 2 &&
    segments[0] === "inventory" &&
    ["summary", "putaway-catalog", "return-catalog"].includes(segments[1] ?? "")
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
  if (method === "POST" && segments.length === 1 && segments[0] === "receipt-evidence") return true;
  if (
    method === "GET" &&
    segments.length === 3 &&
    segments[0] === "receipt-evidence" &&
    uuid.test(segments[1] ?? "") &&
    segments[2] === "content"
  )
    return true;
  if (
    method === "POST" &&
    segments.length === 3 &&
    segments[0] === "skus" &&
    uuid.test(segments[1] ?? "") &&
    ["p0-actions", "measurements", "media-uploads", "product-attributes"].includes(
      segments[2] ?? "",
    )
  ) {
    return true;
  }
  if (
    segments[0] === "skus" &&
    uuid.test(segments[1] ?? "") &&
    ((method === "GET" && segments.length === 3 && segments[2] === "research") ||
      (method === "POST" &&
        segments.length === 3 &&
        ["identity-candidates", "market-references"].includes(segments[2] ?? "")) ||
      (method === "POST" &&
        segments.length === 5 &&
        segments[2] === "identity-candidates" &&
        uuid.test(segments[3] ?? "") &&
        segments[4] === "decision"))
  )
    return true;
  if (
    method === "GET" &&
    segments.length === 3 &&
    segments[0] === "skus" &&
    uuid.test(segments[1] ?? "") &&
    segments[2] === "capture-summary"
  ) {
    return true;
  }
  if (
    method === "GET" &&
    segments.length === 5 &&
    segments[0] === "skus" &&
    uuid.test(segments[1] ?? "") &&
    segments[2] === "product-photos" &&
    uuid.test(segments[3] ?? "") &&
    segments[4] === "content"
  ) {
    return true;
  }
  if (
    segments[0] === "accounting" &&
    ((method === "GET" && segments.length === 2 && segments[1] === "orders") ||
      (segments.length === 2 && ["profile", "mapping-rules"].includes(segments[1] ?? "")) ||
      (method === "GET" && segments.length === 2 && segments[1] === "exports") ||
      (method === "POST" &&
        segments.length === 4 &&
        segments[1] === "mapping-rules" &&
        uuid.test(segments[2] ?? "") &&
        segments[3] === "replacements") ||
      (method === "GET" &&
        segments.length === 3 &&
        segments[1] === "exports" &&
        segments[2] === "preflight") ||
      (method === "POST" && segments.length === 2 && segments[1] === "exports") ||
      (method === "GET" &&
        segments.length === 4 &&
        segments[1] === "exports" &&
        uuid.test(segments[2] ?? "") &&
        segments[3] === "preview") ||
      (method === "POST" &&
        segments.length === 4 &&
        segments[1] === "exports" &&
        uuid.test(segments[2] ?? "") &&
        ["download", "import-confirmation"].includes(segments[3] ?? "")))
  ) {
    return true;
  }
  if (segments[0] !== "orders" || !uuid.test(segments[1] ?? "")) return false;
  if (segments.length === 3 && orderActions.has(segments[2] ?? "")) {
    if (method === "GET") return segments[2] === "financial-summary";
    return segments[2] !== "financial-summary";
  }
  if (method === "GET" && segments.length === 3 && segments[2] === "address") return true;
  return false;
}

function hasAllowedReceiptEvidenceQuery(
  method: WorkspaceProxyMethod,
  segments: string[],
  query: URLSearchParams,
): boolean {
  if (!(method === "POST" && segments.length === 1 && segments[0] === "receipt-evidence")) {
    return true;
  }
  return (
    query.size === 2 &&
    uuid.test(query.get("assetId") ?? "") &&
    query.get("humanConfirmed") === "true"
  );
}

function apiError(status: number, code: string, message: string): Response {
  return Response.json({ code, message }, { status });
}
