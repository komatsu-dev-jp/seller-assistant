export type WorkspaceProxyRequestBody =
  { kind: "json"; text: string } | { kind: "binary"; data: ArrayBuffer; contentType: string };

interface WorkspaceProxyRequestInitOptions {
  method: "GET" | "POST";
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

  if (method !== "POST" || !body) return init;
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
