export type WorkspaceProxyRequestBody =
  { kind: "json"; text: string } | { kind: "binary"; data: ArrayBuffer; contentType: string };

export type WorkspaceProxyMethod = "GET" | "POST" | "PUT" | "PATCH";

export const shippingPhotoMimeTypes = new Set(["image/jpeg", "image/png"]);
export const maxShippingPhotoBytes = 25 * 1024 * 1024;

export function privateNoStoreHeaders(): Headers {
  return new Headers({
    "cache-control": "private, no-store",
    pragma: "no-cache",
    "x-content-type-options": "nosniff",
  });
}

export function privateNoStoreNoContentResponse(): Response {
  return new Response(null, { status: 204, headers: privateNoStoreHeaders() });
}

export class ShippingPhotoUploadError extends Error {
  constructor(
    readonly status: 400 | 413,
    message: string,
  ) {
    super(message);
  }
}

export async function readShippingPhotoUpload(request: Pick<Request, "body" | "headers">): Promise<{
  data: ArrayBuffer;
  contentType: "image/jpeg" | "image/png";
}> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.toLowerCase();
  if (contentType !== "image/jpeg" && contentType !== "image/png") {
    throw new ShippingPhotoUploadError(400, "写真はJPEGまたはPNGを選んでください。");
  }
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxShippingPhotoBytes) {
    throw new ShippingPhotoUploadError(413, "写真は25MB以下を選んでください。");
  }
  if (!request.body) throw new ShippingPhotoUploadError(400, "写真の内容を確認できません。");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > maxShippingPhotoBytes) {
        await reader.cancel();
        throw new ShippingPhotoUploadError(413, "写真は25MB以下を選んでください。");
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  if (size === 0) throw new ShippingPhotoUploadError(400, "写真の内容を確認できません。");
  const data = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { data: data.buffer, contentType };
}

export function isAllowedShippingPhotoProxyPath(
  method: WorkspaceProxyMethod,
  segments: string[],
  uuid: RegExp,
): boolean | null {
  // PUT is deliberately exclusive to the owner policy. Never let it fall through
  // to a broader order-action allowlist.
  if (method === "PUT") {
    return segments.length === 1 && segments[0] === "shipping-photo-policy";
  }
  if (segments.length === 1 && segments[0] === "shipping-photo-policy") {
    return method === "GET";
  }
  if (segments[0] !== "orders" || !uuid.test(segments[1] ?? "")) return null;
  if (
    segments.length === 3 &&
    [
      "shipping-photo-preflight",
      "shipping-photo-override",
      "shipping-photo-confirmations",
      "sale-amount",
      "shipping-photos",
    ].includes(segments[2] ?? "")
  ) {
    if (segments[2] === "shipping-photo-preflight") return method === "GET" || method === "POST";
    return method === "POST";
  }
  if (segments.length === 5 && segments[2] === "shipping-photos") {
    return method === "GET" && uuid.test(segments[3] ?? "") && segments[4] === "content";
  }
  return null;
}

export function isAllowedOrderShippingProxyPath(
  method: WorkspaceProxyMethod,
  segments: string[],
  uuid: RegExp,
): boolean | null {
  if (segments[0] === "shipping-methods") {
    return segments.length === 1 && (method === "GET" || method === "POST");
  }
  if (segments[0] !== "orders" || !uuid.test(segments[1] ?? "")) return null;

  const resource = segments[2] ?? "";
  if (
    ![
      "registration",
      "shipping-method-options",
      "shipping-method-selections",
      "shipping-readiness",
      "shipping-readiness-confirmations",
    ].includes(resource)
  ) {
    return null;
  }
  if (segments.length !== 3) return false;
  if (resource === "registration") return method === "GET" || method === "PATCH";
  if (resource === "shipping-method-options" || resource === "shipping-readiness") {
    return method === "GET";
  }
  return method === "POST";
}

interface WorkspaceProxyRequestInitOptions {
  method: WorkspaceProxyMethod;
  accept: string;
  cookie: string;
  appOrigin?: string;
  body?: WorkspaceProxyRequestBody;
}

export function createWorkspaceProxyRequestInit({
  method,
  accept,
  cookie,
  appOrigin,
  body,
}: WorkspaceProxyRequestInitOptions): RequestInit {
  const headers: Record<string, string> = {
    accept,
    cookie,
    ...(appOrigin ? { origin: appOrigin } : {}),
    "sec-fetch-site": "same-origin",
  };
  const init: RequestInit = {
    method,
    headers,
    cache: "no-store",
    redirect: "manual",
  };

  if (method === "GET" || !body) return init;
  if (body.kind === "binary") {
    headers["content-type"] = body.contentType;
    init.body = body.data;
    return init;
  }
  if (body.text.length > 0) {
    headers["content-type"] = "application/json";
    init.body = body.text;
  }
  return init;
}
