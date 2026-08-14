import { afterEach, describe, expect, it } from "vitest";
import { healthResponseSchema } from "@resale/contracts";
import { buildApp } from "./app.js";
import { InMemoryWorkflowRepository } from "./repository.js";
import { createWriteOriginValidator } from "./security.js";
import { createCookieAuthenticator, createSignedSession } from "./session.js";
import type { LoginService } from "./auth.js";

const apps: ReturnType<typeof buildApp>[] = [];

function buildTestApp() {
  return buildApp({
    repository: new InMemoryWorkflowRepository(),
    authenticate: (headers) => {
      const identityId = headers["x-actor-id"];
      return typeof identityId === "string" ? { identityId } : null;
    },
    validateWriteOrigin: () => true,
  });
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

describe("POST /v1/session/login", () => {
  function appWithLogin(login: LoginService["login"]) {
    const loginService: LoginService = { login, close: () => Promise.resolve() };
    const app = buildApp({ loginService, validateWriteOrigin: () => true });
    apps.push(app);
    return app;
  }

  it("sets only the secure session cookie after valid credentials", async () => {
    const app = appWithLogin(() =>
      Promise.resolve({
        kind: "success",
        setCookie:
          "resale_session=signed; Path=/; Max-Age=28800; HttpOnly; Secure; SameSite=Strict",
      }),
    );
    const response = await app.inject({
      method: "POST",
      url: "/v1/session/login",
      payload: { email: "owner@example.test", password: "a-safe-test-password" },
    });
    expect(response.statusCode).toBe(204);
    expect(response.headers["set-cookie"]).toBe(
      "resale_session=signed; Path=/; Max-Age=28800; HttpOnly; Secure; SameSite=Strict",
    );
    expect(response.body).toBe("");
  });

  it("returns the same generic failure without exposing which credential was wrong", async () => {
    const app = appWithLogin(() => Promise.resolve({ kind: "invalid" }));
    const response = await app.inject({
      method: "POST",
      url: "/v1/session/login",
      payload: { email: "missing@example.test", password: "wrong-password-value" },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      code: "invalid_credentials",
      message: "メールアドレスまたはパスワードを確認してください。",
    });
    expect(response.body).not.toContain("missing@example.test");
    expect(response.body).not.toContain("wrong-password-value");
  });

  it("rate limits repeated failures and rejects malformed input before password work", async () => {
    let called = 0;
    const app = appWithLogin(() => {
      called += 1;
      return Promise.resolve({ kind: "rate_limited", retryAfterSeconds: 900 });
    });
    const malformed = await app.inject({
      method: "POST",
      url: "/v1/session/login",
      payload: { email: "not-an-email", password: "short" },
    });
    expect(malformed.statusCode).toBe(400);
    expect(called).toBe(0);

    const limited = await app.inject({
      method: "POST",
      url: "/v1/session/login",
      payload: { email: "owner@example.test", password: "wrong-password-value" },
    });
    expect(limited.statusCode).toBe(429);
    expect(limited.headers["retry-after"]).toBe("900");
  });
});

describe("GET /health", () => {
  it("returns the versioned health contract", async () => {
    const app = buildApp();
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(() => healthResponseSchema.parse(response.json())).not.toThrow();
  });
});

describe("P0 workspace API", () => {
  const workspaceId = "11111111-1111-4111-8111-111111111111";
  const actorId = "22222222-2222-4222-8222-222222222222";

  it("creates a SKU and includes it in putaway pending summary", async () => {
    const app = buildTestApp();
    apps.push(app);
    const created = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/skus`,
      headers: { "x-actor-id": actorId },
      payload: { skuCode: "SKU-000001", title: "ネイビーシャツ", category: "トップス" },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ workspaceId, skuCode: "SKU-000001" });

    const summary = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/inventory/summary`,
      headers: { "x-actor-id": actorId },
    });
    expect(summary.statusCode).toBe(200);
    expect(summary.json()).toMatchObject({ putawayPending: 1, available: 0 });
  });

  it("rejects invalid actors and duplicate SKU codes", async () => {
    const app = buildTestApp();
    apps.push(app);
    const invalid = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/skus`,
      payload: { skuCode: "SKU-000001", title: "商品", category: "トップス" },
    });
    expect(invalid.statusCode).toBe(401);

    const request = {
      method: "POST" as const,
      url: `/v1/workspaces/${workspaceId}/skus`,
      headers: { "x-actor-id": actorId },
      payload: { skuCode: "SKU-000001", title: "商品", category: "トップス" },
    };
    expect((await app.inject(request)).statusCode).toBe(201);
    expect((await app.inject(request)).statusCode).toBe(409);
  });

  it("accepts a signed session cookie and ignores unsigned actor headers by default", async () => {
    const secret = "test-only-session-secret-with-at-least-32-bytes";
    const app = buildApp({
      repository: new InMemoryWorkflowRepository(),
      authenticate: createCookieAuthenticator(secret, () => 1_500),
      validateWriteOrigin: () => true,
    });
    apps.push(app);
    const payload = { skuCode: "SKU-000008", title: "認証試験", category: "トップス" };
    const unsigned = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/skus`,
      headers: { "x-actor-id": actorId },
      payload,
    });
    expect(unsigned.statusCode).toBe(401);

    const token = createSignedSession(
      {
        sessionId: "91000000-0000-4000-8000-000000000001",
        identityId: actorId,
        issuedAt: 1_000,
        expiresAt: 2_000,
      },
      secret,
    );
    const signed = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/skus`,
      headers: { cookie: `resale_session=${token}` },
      payload,
    });
    expect(signed.statusCode).toBe(201);
  });

  it("rejects writes without the exact configured app origin", async () => {
    const app = buildApp({
      repository: new InMemoryWorkflowRepository(),
      authenticate: () => ({ identityId: actorId }),
      validateWriteOrigin: createWriteOriginValidator("https://resale.example"),
    });
    apps.push(app);
    const request = (origin?: string) =>
      app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/skus`,
        headers: origin ? { origin, "sec-fetch-site": "same-origin" } : {},
        payload: { skuCode: "SKU-000010", title: "Origin試験", category: "トップス" },
      });
    expect((await request()).statusCode).toBe(403);
    expect((await request("https://evil.example")).statusCode).toBe(403);
    expect((await request("https://resale.example")).statusCode).toBe(201);
  });

  it("revokes the server session and clears the cookie on logout", async () => {
    const secret = "test-only-session-secret-with-at-least-32-bytes";
    const sessionId = "92000000-0000-4000-8000-000000000001";
    const active = new Set([sessionId]);
    const registry = {
      isActive: (candidateSessionId: string) => Promise.resolve(active.has(candidateSessionId)),
      revoke: (candidateSessionId: string) => {
        active.delete(candidateSessionId);
        return Promise.resolve();
      },
      close: () => Promise.resolve(),
    };
    const app = buildApp({
      repository: new InMemoryWorkflowRepository(),
      authenticate: createCookieAuthenticator(secret, () => 1_500, registry),
      revokeSession: async (actor) => {
        if (!actor.sessionId) throw new Error("session ID missing");
        await registry.revoke(actor.sessionId);
      },
      validateWriteOrigin: () => true,
    });
    apps.push(app);
    const token = createSignedSession(
      { sessionId, identityId: actorId, issuedAt: 1_000, expiresAt: 2_000 },
      secret,
    );
    const cookie = `resale_session=${token}`;
    const logout = await app.inject({
      method: "POST",
      url: "/v1/session/logout",
      headers: { cookie },
    });
    expect(logout.statusCode).toBe(204);
    expect(logout.headers["set-cookie"]).toContain("Max-Age=0; HttpOnly; Secure; SameSite=Strict");

    const reuse = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/skus`,
      headers: { cookie },
      payload: { skuCode: "SKU-000009", title: "失効試験", category: "トップス" },
    });
    expect(reuse.statusCode).toBe(401);
  });

  it("advances the P0 workflow in order and replays the same idempotent request", async () => {
    const app = buildTestApp();
    apps.push(app);
    const created = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/skus`,
      headers: { "x-actor-id": actorId },
      payload: { skuCode: "SKU-000002", title: "試験シャツ", category: "トップス" },
    });
    const skuId = (created.json() as { id: string }).id;
    const request = {
      method: "POST" as const,
      url: `/v1/workspaces/${workspaceId}/skus/${skuId}/p0-actions`,
      headers: { "x-actor-id": actorId },
      payload: {
        action: "confirm_purchase",
        idempotencyKey: "33333333-3333-4333-8333-333333333333",
        evidenceReferenceIds: ["44444444-4444-4444-8444-444444444444"],
        requiredFactsConfirmed: true,
        manualChannelHandoff: false,
      },
    };
    const first = await app.inject(request);
    const replay = await app.inject(request);
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ state: "purchase_confirmed", version: 2 });
    expect(replay.json()).toEqual(first.json());
  });

  it("completes the representative P0 journey without skipping a human gate", async () => {
    const app = buildTestApp();
    apps.push(app);
    const created = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/skus`,
      headers: { "x-actor-id": actorId },
      payload: { skuCode: "SKU-000004", title: "一気通貫試験商品", category: "トップス" },
    });
    const skuId = (created.json() as { id: string }).id;
    const actionUrl = `/v1/workspaces/${workspaceId}/skus/${skuId}/p0-actions`;
    const journey = [
      ["confirm_purchase", "10000000-0000-4000-8000-000000000001", false],
      ["confirm_capture", "10000000-0000-4000-8000-000000000002", false],
      ["confirm_listing", "10000000-0000-4000-8000-000000000003", true],
      ["confirm_order", "10000000-0000-4000-8000-000000000004", false],
      ["confirm_pick", "10000000-0000-4000-8000-000000000005", false],
      ["confirm_pack", "10000000-0000-4000-8000-000000000006", false],
      ["confirm_ship", "10000000-0000-4000-8000-000000000007", false],
      ["approve_journal", "10000000-0000-4000-8000-000000000008", false],
    ] as const;

    for (const [action, idempotencyKey, manualChannelHandoff] of journey) {
      const response = await app.inject({
        method: "POST",
        url: actionUrl,
        headers: { "x-actor-id": actorId },
        payload: {
          action,
          idempotencyKey,
          evidenceReferenceIds: [idempotencyKey.replace("10000000", "20000000")],
          requiredFactsConfirmed: true,
          manualChannelHandoff,
        },
      });
      expect(response.statusCode, response.body).toBe(200);
    }

    const finalResponse = await app.inject({
      method: "POST",
      url: actionUrl,
      headers: { "x-actor-id": actorId },
      payload: {
        action: "approve_journal",
        idempotencyKey: "10000000-0000-4000-8000-000000000008",
        evidenceReferenceIds: ["20000000-0000-4000-8000-000000000008"],
        requiredFactsConfirmed: true,
        manualChannelHandoff: false,
      },
    });
    expect(finalResponse.json()).toMatchObject({
      state: "journal_approved",
      lastAction: "approve_journal",
      version: 9,
    });
  });

  it("rejects workflow skips and idempotency payload conflicts", async () => {
    const app = buildTestApp();
    apps.push(app);
    const created = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/skus`,
      headers: { "x-actor-id": actorId },
      payload: { skuCode: "SKU-000003", title: "試験商品", category: "トップス" },
    });
    const skuId = (created.json() as { id: string }).id;
    const actionUrl = `/v1/workspaces/${workspaceId}/skus/${skuId}/p0-actions`;
    const skipped = await app.inject({
      method: "POST",
      url: actionUrl,
      headers: { "x-actor-id": actorId },
      payload: {
        action: "confirm_listing",
        idempotencyKey: "55555555-5555-4555-8555-555555555555",
        evidenceReferenceIds: ["66666666-6666-4666-8666-666666666666"],
        requiredFactsConfirmed: true,
        manualChannelHandoff: true,
      },
    });
    expect(skipped.statusCode).toBe(409);

    const basePayload = {
      action: "confirm_purchase",
      idempotencyKey: "77777777-7777-4777-8777-777777777777",
      evidenceReferenceIds: ["88888888-8888-4888-8888-888888888888"],
      requiredFactsConfirmed: true,
      manualChannelHandoff: false,
    };
    expect(
      (
        await app.inject({
          method: "POST",
          url: actionUrl,
          headers: { "x-actor-id": actorId },
          payload: basePayload,
        })
      ).statusCode,
    ).toBe(200);
    const conflict = await app.inject({
      method: "POST",
      url: actionUrl,
      headers: { "x-actor-id": actorId },
      payload: { ...basePayload, manualChannelHandoff: true },
    });
    expect(conflict.statusCode).toBe(409);
  });

  it("registers immutable photo evidence and human measurements for capture readiness", async () => {
    const app = buildTestApp();
    apps.push(app);
    const created = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/skus`,
      headers: { "x-actor-id": actorId },
      payload: { skuCode: "SKU-000005", title: "撮影採寸試験", category: "トップス" },
    });
    const skuId = (created.json() as { id: string }).id;
    const roles = ["front", "back", "brand_tag", "care_label"] as const;
    const assetIds = [
      "30000000-0000-4000-8000-000000000001",
      "30000000-0000-4000-8000-000000000002",
      "30000000-0000-4000-8000-000000000003",
      "30000000-0000-4000-8000-000000000004",
    ];

    for (const [index, role] of roles.entries()) {
      const response = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/skus/${skuId}/media-assets`,
        headers: { "x-actor-id": actorId },
        payload: {
          assetId: assetIds[index],
          role,
          originalSha256: String(index + 1).repeat(64),
          originalStorageKey: `workspaces/${workspaceId}/originals/${assetIds[index]}.jpg`,
          mimeType: "image/jpeg",
          sizeBytes: 1_024,
          width: 2_000,
          height: 2_000,
        },
      });
      expect(response.statusCode, response.body).toBe(201);
    }

    const definitions = [
      ["shoulder_width", 42],
      ["chest_width", 52],
      ["sleeve_length", 61],
      ["garment_length", 70],
    ] as const;
    for (const [definitionId, value] of definitions) {
      const response = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/skus/${skuId}/measurements`,
        headers: { "x-actor-id": actorId },
        payload: {
          definitionId,
          definitionVersion: 1,
          value,
          unit: "cm",
          basis: definitionId === "chest_width" ? "flat_width" : "length",
          state: "natural",
          measuredAt: "2026-08-15T00:00:00.000Z",
          evidenceAssetId: assetIds[0],
          attempt: 1,
          humanConfirmed: true,
        },
      });
      expect(response.statusCode, response.body).toBe(201);
      expect(response.json()).toMatchObject({ requiresReview: false, confirmedBy: actorId });
    }

    const ready = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/skus/${skuId}/capture-summary`,
      headers: { "x-actor-id": actorId },
    });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({
      requiredPhotoRolesComplete: true,
      requiredMeasurementsComplete: true,
      hasReviewWarnings: false,
      readyForHumanReview: true,
    });

    const repeat = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/skus/${skuId}/measurements`,
      headers: { "x-actor-id": actorId },
      payload: {
        definitionId: "chest_width",
        definitionVersion: 1,
        value: 55,
        unit: "cm",
        basis: "flat_width",
        state: "natural",
        measuredAt: "2026-08-15T00:05:00.000Z",
        evidenceAssetId: assetIds[0],
        attempt: 2,
        humanConfirmed: true,
      },
    });
    expect(repeat.statusCode).toBe(201);
    expect(repeat.json()).toMatchObject({
      requiresReview: true,
      differenceCm: 3,
      violations: ["repeat_difference_exceeded"],
    });

    const warning = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/skus/${skuId}/capture-summary`,
      headers: { "x-actor-id": actorId },
    });
    expect(warning.json()).toMatchObject({
      requiredMeasurementsComplete: false,
      hasReviewWarnings: true,
      readyForHumanReview: false,
    });
  });

  it("rejects media path changes and measurement evidence from another SKU", async () => {
    const app = buildTestApp();
    apps.push(app);
    const first = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/skus`,
      headers: { "x-actor-id": actorId },
      payload: { skuCode: "SKU-000006", title: "商品A", category: "トップス" },
    });
    const second = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/skus`,
      headers: { "x-actor-id": actorId },
      payload: { skuCode: "SKU-000007", title: "商品B", category: "トップス" },
    });
    const firstSkuId = (first.json() as { id: string }).id;
    const secondSkuId = (second.json() as { id: string }).id;
    const assetId = "40000000-0000-4000-8000-000000000001";
    const assetPayload = {
      assetId,
      role: "front",
      originalSha256: "a".repeat(64),
      originalStorageKey: `workspaces/${workspaceId}/originals/${assetId}.jpg`,
      mimeType: "image/jpeg",
      sizeBytes: 2_048,
      width: 2_000,
      height: 2_000,
    };
    const mediaUrl = `/v1/workspaces/${workspaceId}/skus/${firstSkuId}/media-assets`;
    expect(
      (
        await app.inject({
          method: "POST",
          url: mediaUrl,
          headers: { "x-actor-id": actorId },
          payload: assetPayload,
        })
      ).statusCode,
    ).toBe(201);
    const changed = await app.inject({
      method: "POST",
      url: mediaUrl,
      headers: { "x-actor-id": actorId },
      payload: { ...assetPayload, role: "back" },
    });
    expect(changed.statusCode).toBe(409);

    const foreignEvidence = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/skus/${secondSkuId}/measurements`,
      headers: { "x-actor-id": actorId },
      payload: {
        definitionId: "chest_width",
        definitionVersion: 1,
        value: 52,
        unit: "cm",
        basis: "flat_width",
        state: "natural",
        measuredAt: "2026-08-15T00:00:00.000Z",
        evidenceAssetId: assetId,
        attempt: 1,
        humanConfirmed: true,
      },
    });
    expect(foreignEvidence.statusCode).toBe(403);
  });
});
