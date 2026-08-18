import "server-only";

import {
  sessionContextResponseSchema,
  type SessionContextResponse,
  type WorkspaceRole,
} from "@resale/contracts";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function requirePageSession(
  allowedRoles: readonly WorkspaceRole[],
): Promise<SessionContextResponse> {
  const apiOrigin = process.env.API_INTERNAL_ORIGIN;
  const appOrigin = process.env.APP_ORIGIN;
  if (!apiOrigin || !appOrigin) {
    throw new Error("認証サービスの接続設定を確認できません。");
  }

  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ");
  if (!cookieHeader) redirect("/login");

  let response: Response;
  try {
    response = await fetch(new URL("/v1/session/context", apiOrigin), {
      method: "GET",
      headers: { accept: "application/json", cookie: cookieHeader, origin: appOrigin },
      cache: "no-store",
      redirect: "manual",
    });
  } catch {
    throw new Error("認証サービスへ接続できません。");
  }

  if (response.status === 401 || response.status === 403) redirect("/login");
  if (!response.ok) throw new Error("認証サービスから安全な応答を受け取れませんでした。");

  const parsed = sessionContextResponseSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new Error("ログイン情報の形式を確認できませんでした。");
  if (!allowedRoles.includes(parsed.data.role)) redirect("/forbidden");
  return parsed.data;
}
