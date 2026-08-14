import type { IncomingHttpHeaders } from "node:http";

export function createWriteOriginValidator(
  allowedOrigin: string,
): (headers: IncomingHttpHeaders) => boolean {
  let configured: URL;
  try {
    configured = new URL(allowedOrigin);
  } catch {
    throw new Error("APP_ORIGIN must be an absolute http(s) origin");
  }
  if (
    !["http:", "https:"].includes(configured.protocol) ||
    configured.origin !== allowedOrigin ||
    configured.username ||
    configured.password
  ) {
    throw new Error("APP_ORIGIN must contain only an absolute http(s) origin");
  }
  return (headers) => {
    if (headers.origin !== configured.origin) return false;
    const fetchSite = headers["sec-fetch-site"];
    return fetchSite === undefined || fetchSite === "same-origin";
  };
}
