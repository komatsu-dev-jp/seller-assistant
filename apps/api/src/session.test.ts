import { describe, expect, it } from "vitest";
import {
  createCookieAuthenticator,
  createSignedSession,
  serializeClearedSessionCookie,
  serializeSessionCookie,
  verifySignedSession,
} from "./session.js";

const secret = "test-only-session-secret-with-at-least-32-bytes";
const claims = {
  sessionId: "90000000-0000-4000-8000-000000000001",
  identityId: "90000000-0000-4000-8000-000000000002",
  workspaceId: "90000000-0000-4000-8000-000000000003",
  issuedAt: 1_000,
  expiresAt: 2_000,
};

describe("signed HttpOnly sessions", () => {
  it("accepts a valid signed cookie and returns its actor and session identity", async () => {
    const token = createSignedSession(claims, secret);
    expect(verifySignedSession(token, secret, 1_500)).toEqual(claims);
    const authenticate = createCookieAuthenticator(secret, () => 1_500);
    await expect(authenticate({ cookie: `resale_session=${token}` })).resolves.toEqual({
      identityId: claims.identityId,
      sessionId: claims.sessionId,
      workspaceId: claims.workspaceId,
    });
  });

  it("rejects tampering, expiry, duplicate cookies and actor headers", async () => {
    const token = createSignedSession(claims, secret);
    expect(verifySignedSession(`${token}x`, secret, 1_500)).toBeNull();
    expect(verifySignedSession(token, secret, 2_000)).toBeNull();
    const authenticate = createCookieAuthenticator(secret, () => 1_500);
    await expect(
      authenticate({ cookie: `resale_session=${token}; resale_session=${token}` }),
    ).resolves.toBeNull();
    await expect(authenticate({ "x-actor-id": claims.identityId })).resolves.toBeNull();
  });

  it("uses secure cookie flags and fails closed on weak secrets", () => {
    const token = createSignedSession(claims, secret);
    expect(serializeSessionCookie(token, 900)).toContain(
      "Path=/; Max-Age=900; HttpOnly; Secure; SameSite=Strict",
    );
    expect(serializeClearedSessionCookie()).toContain(
      "Max-Age=0; HttpOnly; Secure; SameSite=Strict",
    );
    expect(() => createSignedSession(claims, "too-short")).toThrow(/32 bytes/u);
  });
});
