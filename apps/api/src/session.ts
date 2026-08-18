import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import postgres from "postgres";
import { z } from "zod";
import type { RequestActor } from "./repository.js";

const sessionClaimsSchema = z
  .object({
    sessionId: z.string().uuid(),
    identityId: z.string().uuid(),
    workspaceId: z.string().uuid(),
    issuedAt: z.number().int().nonnegative(),
    expiresAt: z.number().int().positive(),
  })
  .strict()
  .refine((claims) => claims.expiresAt > claims.issuedAt, "Session expiry must follow issue time");

export type SessionClaims = z.infer<typeof sessionClaimsSchema>;

export interface SessionRegistry {
  isActive(sessionId: string, identityId: string, workspaceId: string): Promise<boolean>;
  revoke(sessionId: string, identityId: string, workspaceId: string): Promise<void>;
  close(): Promise<void>;
}

const cookieName = "resale_session";

export function createSignedSession(claims: SessionClaims, secret: string): string {
  requireStrongSecret(secret);
  const payload = Buffer.from(JSON.stringify(sessionClaimsSchema.parse(claims)), "utf8").toString(
    "base64url",
  );
  return `${payload}.${sign(payload, secret)}`;
}

export function verifySignedSession(
  token: string,
  secret: string,
  nowEpochSeconds = Math.floor(Date.now() / 1000),
): SessionClaims | null {
  requireStrongSecret(secret);
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [payload, signature] = parts;
  const expected = sign(payload, secret);
  const actualBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }
  try {
    const parsed = sessionClaimsSchema.parse(
      JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
    );
    if (parsed.expiresAt <= nowEpochSeconds || parsed.issuedAt > nowEpochSeconds + 60) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function createCookieAuthenticator(
  secret: string,
  nowEpochSeconds?: () => number,
  registry?: SessionRegistry,
): (headers: IncomingHttpHeaders) => Promise<RequestActor | null> {
  requireStrongSecret(secret);
  return async (headers) => {
    const token = readSingleCookie(headers.cookie, cookieName);
    if (!token) return null;
    const claims = verifySignedSession(token, secret, nowEpochSeconds?.());
    if (!claims) return null;
    if (
      registry &&
      !(await registry.isActive(claims.sessionId, claims.identityId, claims.workspaceId))
    )
      return null;
    return {
      identityId: claims.identityId,
      sessionId: claims.sessionId,
      workspaceId: claims.workspaceId,
    };
  };
}

export function serializeSessionCookie(token: string, maxAgeSeconds: number): string {
  if (!Number.isSafeInteger(maxAgeSeconds) || maxAgeSeconds <= 0) {
    throw new Error("Session max age must be a positive integer");
  }
  return `${cookieName}=${token}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=Strict`;
}

export function serializeClearedSessionCookie(): string {
  return `${cookieName}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

export class PostgresSessionRegistry implements SessionRegistry {
  private readonly sql: postgres.Sql;

  constructor(databaseUrl: string) {
    this.sql = postgres(databaseUrl, { max: 2, idle_timeout: 20, connect_timeout: 10 });
  }

  async isActive(sessionId: string, identityId: string, workspaceId: string): Promise<boolean> {
    const rows = await this.sql<Array<{ active: boolean }>>`
      select (revoked_at is null and expires_at > now()) as active
      from auth_session
      where id = ${sessionId} and identity_id = ${identityId} and workspace_id = ${workspaceId}
    `;
    return rows[0]?.active === true;
  }

  async revoke(sessionId: string, identityId: string, workspaceId: string): Promise<void> {
    await this.sql`
      update auth_session set revoked_at = coalesce(revoked_at, now())
      where id = ${sessionId} and identity_id = ${identityId} and workspace_id = ${workspaceId}
    `;
  }

  async close(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("base64url");
}

function requireStrongSecret(secret: string): void {
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("SESSION_SECRET must be at least 32 bytes");
  }
}

function readSingleCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  const values = header
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${name}=`))
    .map((part) => part.slice(name.length + 1));
  return values.length === 1 && values[0] ? values[0] : null;
}
