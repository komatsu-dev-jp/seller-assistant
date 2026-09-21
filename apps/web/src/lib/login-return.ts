function defaultLoginDestination(role: string): string {
  return role === "shipping"
    ? "/shipping"
    : role === "field_worker"
      ? "/mobile"
      : role === "accounting"
        ? "/accounting"
        : "/";
}

const localReturnOrigin = "http://local.invalid";

function containsAsciiControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function isUnsafeReturnPath(value: string): boolean {
  return (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    containsAsciiControlCharacter(value)
  );
}

export function safeInternalReturnPath(value: string | null | undefined): string | null {
  if (!value || isUnsafeReturnPath(value)) {
    return null;
  }

  try {
    const parsed = new URL(value, localReturnOrigin);
    if (parsed.origin !== localReturnOrigin) return null;

    const normalizedPath = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    return isUnsafeReturnPath(normalizedPath) ? null : normalizedPath;
  } catch {
    return null;
  }
}

export function loginDestination(role: string, requestedReturnTo: string | null): string {
  const fallback = defaultLoginDestination(role);
  const safeReturnTo = safeInternalReturnPath(requestedReturnTo);
  if (!safeReturnTo) return fallback;

  const pathname = new URL(safeReturnTo, localReturnOrigin).pathname;
  const allowed = role === "owner" || (role === "accounting" && pathname === "/accounting");
  return allowed ? safeReturnTo : fallback;
}
