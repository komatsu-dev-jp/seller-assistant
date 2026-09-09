import { beforeEach, describe, expect, it, vi } from "vitest";

const postgresMock = vi.hoisted(() => vi.fn());

vi.mock("postgres", () => ({ default: postgresMock }));

import {
  hashPassword,
  passwordSecurityProfile,
  PostgresLoginService,
  verifyPassword,
} from "./auth.js";

const sessionSecret = "test-only-login-session-secret-with-at-least-32-bytes";

function createSqlClient(responses: unknown[]) {
  const transaction = vi.fn(async () => []);
  const sql = vi.fn(async () => responses.shift()) as ReturnType<typeof vi.fn> & {
    begin: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
  };
  sql.begin = vi.fn(async (callback: (client: typeof transaction) => Promise<void>) =>
    callback(transaction),
  );
  sql.end = vi.fn(async () => undefined);
  postgresMock.mockReturnValueOnce(sql);
  return { sql, transaction };
}

describe("zero-cost password security", () => {
  beforeEach(() => {
    postgresMock.mockReset();
  });

  it("uses the OWASP scrypt floor and a unique 16-byte salt", async () => {
    const first = await hashPassword("長い試験パスワード-1234");
    const second = await hashPassword("長い試験パスワード-1234");
    expect(passwordSecurityProfile).toMatchObject({
      algorithm: "scrypt-v1",
      n: 2 ** 17,
      r: 8,
      p: 1,
      saltBytes: 16,
    });
    expect(first.salt).not.toEqual(second.salt);
    expect(first.hash).not.toEqual(second.hash);
    await expect(verifyPassword("長い試験パスワード-1234", first)).resolves.toBe(true);
    await expect(verifyPassword("間違った試験パスワード", first)).resolves.toBe(false);
  });

  it("rejects downgraded stored parameters", async () => {
    const record = await hashPassword("長い試験パスワード-1234");
    for (const invalid of [
      { ...record, hash: Buffer.alloc(16) },
      { ...record, salt: Buffer.alloc(8) },
      { ...record, n: 2 ** 14 },
      { ...record, r: 4 },
      { ...record, p: 2 },
    ]) {
      await expect(verifyPassword("長い試験パスワード-1234", invalid)).rejects.toThrow(
        "security floor",
      );
    }
  });

  it("covers blocked, invalid, rate-limited and successful database login outcomes", async () => {
    const now = new Date("2026-09-08T03:00:00.000Z");
    const blockedUntil = new Date(now.getTime() + 5_100);
    const rateLimitedUntil = new Date(now.getTime() + 15 * 60 * 1_000);
    const password = "正しい試験パスワード-5678";
    const record = await hashPassword(password);
    const identityId = "90000000-0000-4000-8000-000000000011";
    const workspaceId = "90000000-0000-4000-8000-000000000012";
    const credential = {
      identity_id: identityId,
      password_hash: record.hash,
      password_salt: record.salt,
      scrypt_n: record.n,
      scrypt_r: record.r,
      scrypt_p: record.p,
    };
    const { sql, transaction } = createSqlClient([
      [{ blocked_until: blockedUntil }],
      [],
      [],
      [{ failed_count: 1, blocked_until: null }],
      [],
      [credential],
      [{ failed_count: 5, blocked_until: rateLimitedUntil }],
      [],
      [credential],
      [{ workspace_id: workspaceId }],
    ]);
    const service = new PostgresLoginService("postgres://local-test", sessionSecret, () => now);

    await expect(
      service.login({ email: " OWNER@EXAMPLE.TEST ", password }, "browser-a"),
    ).resolves.toEqual({ kind: "rate_limited", retryAfterSeconds: 6 });
    await expect(
      service.login({ email: "unknown@example.test", password: "unknown-password" }, "browser-b"),
    ).resolves.toEqual({ kind: "invalid" });
    await expect(
      service.login({ email: "owner@example.test", password: "wrong-password" }, "browser-c"),
    ).resolves.toEqual({ kind: "rate_limited", retryAfterSeconds: 15 * 60 });

    const result = await service.login({ email: "owner@example.test", password }, "browser-d");
    expect(result.kind).toBe("success");
    expect(result.setCookie).toContain("HttpOnly; Secure; SameSite=Strict");
    expect(sql.begin).toHaveBeenCalledTimes(1);
    expect(transaction).toHaveBeenCalledTimes(2);

    await service.close();
    expect(sql.end).toHaveBeenCalledWith({ timeout: 5 });
  });
});
