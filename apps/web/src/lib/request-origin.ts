import type { NextRequest } from "next/server";

export function matchesConfiguredAppOrigin(
  request: NextRequest,
  configuredOrigin: string | undefined,
  requireBrowserOrigin: boolean,
): boolean {
  if (!configuredOrigin) return false;
  let configured: URL;
  try {
    configured = new URL(configuredOrigin);
  } catch {
    return false;
  }
  const browserOrigin = request.headers.get("origin");
  if (browserOrigin) return browserOrigin === configured.origin;
  if (requireBrowserOrigin) return false;

  const forwardedHost = firstForwardedValue(request.headers.get("x-forwarded-host"));
  const forwardedProtocol = firstForwardedValue(request.headers.get("x-forwarded-proto"));
  const host = forwardedHost ?? request.headers.get("host");
  const protocol = forwardedProtocol ?? request.nextUrl.protocol.replace(/:$/u, "");
  return host === configured.host && `${protocol}:` === configured.protocol;
}

function firstForwardedValue(value: string | null): string | null {
  return value?.split(",")[0]?.trim() || null;
}
