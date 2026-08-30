import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { healthResponseSchema } from "@resale/contracts";
import { buildApp } from "./app.js";
import { InMemoryWorkflowRepository, RepositoryError } from "./repository.js";
import { createWriteOriginValidator } from "./security.js";
import { createCookieAuthenticator, createSignedSession } from "./session.js";
import type { LoginService } from "./auth.js";
import { LocalPrivateMediaStore, type PrivateMediaStore } from "./local-media-store.js";
import type { OrderRepository, RegisterShippingPhotoRecord } from "./order-repository.js";

const apps: ReturnType<typeof buildApp>[] = [];
const mediaRoots: string[] = [];

function buildTestApp(
  mediaStore?: PrivateMediaStore,
  repository: InMemoryWorkflowRepository = new InMemoryWorkflowRepository(),
) {
  return buildApp({
    repository,
    authenticate: (headers) => {
      const identityId = headers["x-actor-id"];
      const activeWorkspaceId = headers["x-workspace-id"];
      if (typeof identityId !== "string") return null;
      return typeof activeWorkspaceId === "string"
        ? { identityId, workspaceId: activeWorkspaceId }
        : { identityId };
    },
    validateWriteOrigin: () => true,
    ...(mediaStore ? { mediaStore } : {}),
  });
}

function buildOrderTestApp(orderRepository: OrderRepository, mediaStore?: PrivateMediaStore) {
  const app = buildApp({
    orderRepository,
    authenticate: (headers) => {
      const identityId = headers["x-actor-id"];
      const activeWorkspaceId = headers["x-workspace-id"];
      if (typeof identityId !== "string") return null;
      return typeof activeWorkspaceId === "string"
        ? { identityId, workspaceId: activeWorkspaceId }
        : { identityId };
    },
    validateWriteOrigin: () => true,
    ...(mediaStore ? { mediaStore } : {}),
  });
  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
  await Promise.all(mediaRoots.splice(0).map(async (root) => rm(root, { recursive: true })));
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

  it("binds session context and putaway writes to the signed active workspace", async () => {
    const app = buildTestApp();
    apps.push(app);
    const headers = { "x-actor-id": actorId, "x-workspace-id": workspaceId };
    const context = await app.inject({ method: "GET", url: "/v1/session/context", headers });
    expect(context.statusCode).toBe(200);
    expect(context.json()).toEqual({ identityId: actorId, workspaceId, role: "owner" });

    const request = {
      inventoryNumber: "INV-000123-8",
      locationCode: "BX-014-3-2",
      inventoryLabelVersion: 1,
      locationLabelVersion: 1,
      inventoryScannedAt: "2026-08-15T01:00:00.000Z",
      locationScannedAt: "2026-08-15T01:00:01.000Z",
      confirmedAt: "2026-08-15T01:00:02.000Z",
      idempotencyKey: "33333333-3333-4333-8333-333333333333",
      humanConfirmed: true,
    } as const;
    const first = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/inventory/putaway`,
      headers,
      payload: request,
    });
    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({
      inventoryNumber: request.inventoryNumber,
      locationCode: request.locationCode,
      status: "available",
    });
    const replay = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/inventory/putaway`,
      headers,
      payload: request,
    });
    expect(replay.statusCode).toBe(201);
    expect(replay.body).toBe(first.body);

    const otherWorkspace = "44444444-4444-4444-8444-444444444444";
    const forbidden = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${otherWorkspace}/inventory/putaway`,
      headers,
      payload: request,
    });
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json()).toMatchObject({ code: "active_workspace_mismatch" });
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
        workspaceId,
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
      { sessionId, identityId: actorId, workspaceId, issuedAt: 1_000, expiresAt: 2_000 },
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

  it("covers capture/listing while rejecting downstream workflow bypasses", async () => {
    const repository = new InMemoryWorkflowRepository();
    const app = buildTestApp(undefined, repository);
    apps.push(app);
    const created = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/skus`,
      headers: { "x-actor-id": actorId },
      payload: { skuCode: "SKU-000004", title: "一気通貫試験商品", category: "トップス" },
    });
    const skuId = (created.json() as { id: string }).id;
    const actionUrl = `/v1/workspaces/${workspaceId}/skus/${skuId}/p0-actions`;
    const advance = async (
      action:
        | "confirm_purchase"
        | "confirm_capture"
        | "confirm_listing"
        | "confirm_order"
        | "confirm_pick"
        | "confirm_pack"
        | "confirm_ship"
        | "approve_journal",
      idempotencyKey: string,
      evidenceReferenceIds: string[],
      manualChannelHandoff = false,
    ) =>
      app.inject({
        method: "POST",
        url: actionUrl,
        headers: { "x-actor-id": actorId },
        payload: {
          action,
          idempotencyKey,
          evidenceReferenceIds,
          requiredFactsConfirmed: true,
          manualChannelHandoff,
        },
      });

    const purchase = await advance("confirm_purchase", "10000000-0000-4000-8000-000000000001", [
      "20000000-0000-4000-8000-000000000001",
    ]);
    expect(purchase.statusCode, purchase.body).toBe(200);

    const prematureCapture = await advance(
      "confirm_capture",
      "10000000-0000-4000-8000-000000000009",
      ["20000000-0000-4000-8000-000000000009"],
    );
    expect(prematureCapture.statusCode).toBe(409);

    const roles = ["front", "back", "brand_tag", "care_label"] as const;
    const assetIds = roles.map((_, index) => `30000000-0000-4000-8000-00000000000${index + 1}`);
    for (const [index, role] of roles.entries()) {
      await repository.registerMediaAsset(
        workspaceId,
        skuId,
        { identityId: actorId },
        {
          assetId: assetIds[index]!,
          role,
          originalSha256: String(index + 1).repeat(64),
          originalStorageKey: `workspaces/${workspaceId}/originals/${assetIds[index]}.jpg`,
          mimeType: "image/jpeg",
          sizeBytes: 128,
          width: 16,
          height: 16,
        },
      );
    }
    const definitions = [
      ["shoulder_width", 42],
      ["chest_width", 52],
      ["sleeve_length", 61],
      ["body_length", 70],
    ] as const;
    const measurementIds: string[] = [];
    for (const [definitionId, value] of definitions) {
      const measurement = await repository.recordMeasurement(
        workspaceId,
        skuId,
        { identityId: actorId },
        {
          definitionId,
          definitionVersion: 1,
          value,
          unit: "cm",
          basis: definitionId === "chest_width" ? "flat_width" : "length",
          state: "natural",
          measuredAt: "2026-08-15T00:00:00.000Z",
          evidenceAssetId: assetIds[0]!,
          attempt: 1,
          humanConfirmed: true,
        },
      );
      measurementIds.push(measurement.id);
    }

    const capture = await advance(
      "confirm_capture",
      "10000000-0000-4000-8000-000000000002",
      assetIds,
    );
    expect(capture.statusCode, capture.body).toBe(200);
    const staleListing = await advance(
      "confirm_listing",
      "10000000-0000-4000-8000-000000000010",
      assetIds,
      true,
    );
    expect(staleListing.statusCode).toBe(409);
    const listing = await advance(
      "confirm_listing",
      "10000000-0000-4000-8000-000000000003",
      [...assetIds, ...measurementIds],
      true,
    );
    expect(listing.statusCode, listing.body).toBe(200);

    const forbiddenBypasses = [
      ["confirm_order", "10000000-0000-4000-8000-000000000004"],
      ["confirm_pick", "10000000-0000-4000-8000-000000000005"],
      ["confirm_pack", "10000000-0000-4000-8000-000000000006"],
      ["confirm_ship", "10000000-0000-4000-8000-000000000007"],
      ["approve_journal", "10000000-0000-4000-8000-000000000008"],
    ] as const;
    for (const [action, idempotencyKey] of forbiddenBypasses) {
      const response = await advance(action, idempotencyKey, [
        idempotencyKey.replace("100", "200"),
      ]);
      expect(response.statusCode, response.body).toBe(409);
    }
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
    const mediaRoot = await mkdtemp(join(tmpdir(), "resale-app-media-"));
    mediaRoots.push(mediaRoot);
    const app = buildTestApp(new LocalPrivateMediaStore(mediaRoot));
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

    const legacyMetadataOnly = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/skus/${skuId}/media-assets`,
      headers: { "x-actor-id": actorId },
      payload: {
        assetId: assetIds[0],
        role: "front",
        originalSha256: "a".repeat(64),
        originalStorageKey: `workspaces/${workspaceId}/originals/forged.jpg`,
        mimeType: "image/jpeg",
        sizeBytes: 128,
        width: 16,
        height: 16,
      },
    });
    expect(legacyMetadataOnly.statusCode).toBe(404);

    for (const [index, role] of roles.entries()) {
      const response = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/skus/${skuId}/media-uploads?assetId=${assetIds[index]}&role=${role}`,
        headers: { "content-type": "image/jpeg", "x-actor-id": actorId },
        payload: jpegWithGpsMetadata(),
      });
      expect(response.statusCode, response.body).toBe(201);
    }

    const definitions = [
      ["shoulder_width", 42],
      ["chest_width", 52],
      ["sleeve_length", 61],
      ["body_length", 70],
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
    const mediaRoot = await mkdtemp(join(tmpdir(), "resale-app-media-"));
    mediaRoots.push(mediaRoot);
    const app = buildTestApp(new LocalPrivateMediaStore(mediaRoot));
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
    const mediaUrl = `/v1/workspaces/${workspaceId}/skus/${firstSkuId}/media-uploads?assetId=${assetId}&role=front`;
    expect(
      (
        await app.inject({
          method: "POST",
          url: mediaUrl,
          headers: { "content-type": "image/jpeg", "x-actor-id": actorId },
          payload: jpegWithGpsMetadata(),
        })
      ).statusCode,
    ).toBe(201);
    const changed = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/skus/${firstSkuId}/media-uploads?assetId=${assetId}&role=back`,
      headers: { "content-type": "image/jpeg", "x-actor-id": actorId },
      payload: jpegWithGpsMetadata(),
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

  it("shows only a separately approved zero-GPS location photo", async () => {
    const mediaRoot = await mkdtemp(join(tmpdir(), "resale-app-media-"));
    mediaRoots.push(mediaRoot);
    const app = buildTestApp(new LocalPrivateMediaStore(mediaRoot));
    apps.push(app);
    const locationId = "50000000-0000-4000-8000-000000000001";
    const photoId = "50000000-0000-4000-8000-000000000002";
    const query = new URLSearchParams({
      photoId,
      originalAssetId: "50000000-0000-4000-8000-000000000003",
      photoKind: "exact_position",
      capturedAt: "2026-08-15T01:00:00.000Z",
      humanConfirmed: "true",
    });
    const captureUrl = `/v1/workspaces/${workspaceId}/locations/${locationId}/photos`;
    const captured = await app.inject({
      method: "POST",
      url: `${captureUrl}?${query.toString()}`,
      headers: { "content-type": "image/jpeg", "x-actor-id": actorId },
      payload: jpegWithGpsMetadata(),
    });
    expect(captured.statusCode, captured.body).toBe(201);
    expect(captured.json()).toMatchObject({
      reviewState: "pending",
      derivativeAssetId: null,
      contentUrl: null,
    });

    const beforeApproval = await app.inject({
      method: "GET",
      url: captureUrl,
      headers: { "x-actor-id": actorId },
    });
    expect(beforeApproval.json()).toEqual([]);

    const approvalUrl = `${captureUrl}/${photoId}/approval`;
    const approval = {
      reviewedAt: "2026-08-15T01:05:00.000Z",
      humanApproved: true,
    };
    const selfApproval = await app.inject({
      method: "POST",
      url: approvalUrl,
      headers: { "x-actor-id": actorId },
      payload: approval,
    });
    expect(selfApproval.statusCode).toBe(409);

    const reviewerId = "50000000-0000-4000-8000-000000000005";
    const approved = await app.inject({
      method: "POST",
      url: approvalUrl,
      headers: { "x-actor-id": reviewerId },
      payload: approval,
    });
    expect(approved.statusCode, approved.body).toBe(200);
    expect(approved.json()).toMatchObject({
      reviewState: "approved",
      gpsExifCount: 0,
      reviewedBy: reviewerId,
    });

    const visible = await app.inject({
      method: "GET",
      url: captureUrl,
      headers: { "x-actor-id": actorId },
    });
    expect(visible.statusCode).toBe(200);
    expect(visible.json()).toHaveLength(1);
    expect(visible.json()[0]).not.toHaveProperty("originalStorageKey");
    expect(visible.json()[0]).not.toHaveProperty("derivativeStorageKey");
    const content = await app.inject({
      method: "GET",
      url: visible.json()[0].contentUrl as string,
      headers: { "x-actor-id": actorId },
    });
    expect(content.statusCode).toBe(200);
    expect(content.headers["cache-control"]).toBe("private, no-store");
    expect(content.rawPayload.toString("utf8")).not.toContain("GPSLatitude");
  });

  it("removes a newly stored location original when database registration fails", async () => {
    const mediaRoot = await mkdtemp(join(tmpdir(), "resale-app-media-"));
    mediaRoots.push(mediaRoot);
    const repository = new InMemoryWorkflowRepository();
    repository.registerLocationPhoto = () =>
      Promise.reject(new RepositoryError("database_error", "simulated registration failure"));
    const app = buildTestApp(new LocalPrivateMediaStore(mediaRoot), repository);
    apps.push(app);
    const locationId = "51000000-0000-4000-8000-000000000001";
    const photoId = "51000000-0000-4000-8000-000000000002";
    const query = new URLSearchParams({
      photoId,
      originalAssetId: "51000000-0000-4000-8000-000000000003",
      photoKind: "room",
      capturedAt: "2026-08-15T01:00:00.000Z",
      humanConfirmed: "true",
    });
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/locations/${locationId}/photos?${query.toString()}`,
      headers: { "content-type": "image/jpeg", "x-actor-id": actorId },
      payload: jpegWithGpsMetadata(),
    });
    expect(response.statusCode).toBe(503);
    const originalPath = join(
      mediaRoot,
      "workspaces",
      workspaceId,
      "location-originals",
      `${photoId}.jpg`,
    );
    await expect(stat(originalPath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});

describe("P13 shipping photo API", () => {
  const workspaceId = "71111111-1111-4111-8111-111111111111";
  const actorId = "72222222-2222-4222-8222-222222222222";
  const orderId = "73333333-3333-4333-8333-333333333333";
  const policyRevisionId = "74444444-4444-4444-8444-444444444444";
  const decisionRevisionId = "75555555-5555-4555-8555-555555555555";
  const productAssetId = "76666666-6666-4666-8666-666666666666";
  const packedAssetId = "77777777-7777-4777-8777-777777777777";
  const confirmationId = "78888888-8888-4888-8888-888888888888";
  const headers = { "x-actor-id": actorId, "x-workspace-id": workspaceId };
  const policy = {
    policyRevisionId,
    mode: "high_value_only" as const,
    highValueThresholdMinor: 50_000,
    revision: 1,
    supersedesRevisionId: null,
    changedBy: actorId,
    changedAt: "2026-08-30T01:00:00.000Z",
  };
  const preflight = {
    orderId,
    decisionRevisionId,
    decisionRevision: 1,
    state: "capture_required" as const,
    photoRequired: true,
    decisionReason: "threshold_met" as const,
    saleAmountStatus: "present" as const,
    assets: [],
    confirmedAssetIds: [],
    photoConfirmationId: null,
    packingHumanConfirmed: false,
    shipmentHumanConfirmed: false,
    updatedAt: "2026-08-30T01:01:00.000Z",
  };

  it("keeps policy, decision, override and late sale inputs strict and sanitized", async () => {
    let policyUpdates = 0;
    let evaluations = 0;
    let overrides = 0;
    let saleRecords = 0;
    const repository = {
      close: () => Promise.resolve(),
      shippingPhotoPolicy: () => Promise.resolve(null),
      updateShippingPhotoPolicy: () => {
        policyUpdates += 1;
        return Promise.resolve(policy);
      },
      shippingPhotoPreflight: () => Promise.resolve(preflight),
      evaluateShippingPhotoPreflight: () => {
        evaluations += 1;
        return Promise.resolve(preflight);
      },
      overrideShippingPhotoDecision: () => {
        overrides += 1;
        return Promise.resolve({
          ...preflight,
          state: "satisfied_without_photo" as const,
          photoRequired: false,
          decisionReason: "manual_skip" as const,
        });
      },
      recordSaleAmount: () => {
        saleRecords += 1;
        return Promise.resolve({
          orderId,
          financialEventId: "79999999-9999-4999-8999-999999999999",
          saleAmountMinor: 50_000,
          recordedBy: actorId,
          recordedAt: "2026-08-30T01:02:00.000Z",
        });
      },
    } as unknown as OrderRepository;
    const app = buildOrderTestApp(repository);

    const missingPolicy = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/shipping-photo-policy`,
      headers,
    });
    expect(missingPolicy.statusCode).toBe(204);
    expect(missingPolicy.headers["cache-control"]).toBe("private, no-store");

    const privatePolicyInput = await app.inject({
      method: "PUT",
      url: `/v1/workspaces/${workspaceId}/shipping-photo-policy`,
      headers,
      payload: {
        mode: "high_value_only",
        highValueThresholdMinor: 50_000,
        expectedRevision: null,
        idempotencyKey: "7aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        humanConfirmed: true,
        actorId,
      },
    });
    expect(privatePolicyInput.statusCode).toBe(400);
    expect(policyUpdates).toBe(0);

    const savedPolicy = await app.inject({
      method: "PUT",
      url: `/v1/workspaces/${workspaceId}/shipping-photo-policy`,
      headers,
      payload: {
        mode: "high_value_only",
        highValueThresholdMinor: 50_000,
        expectedRevision: null,
        idempotencyKey: "7aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        humanConfirmed: true,
      },
    });
    expect(savedPolicy.statusCode).toBe(200);
    expect(savedPolicy.json()).toEqual(policy);

    const privateDecisionInput = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/orders/${orderId}/shipping-photo-preflight`,
      headers,
      payload: {
        expectedDecisionRevision: null,
        idempotencyKey: "7bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        humanConfirmed: true,
        confirmedAt: "2026-08-30T01:01:00.000Z",
      },
    });
    expect(privateDecisionInput.statusCode).toBe(400);
    expect(evaluations).toBe(0);

    const evaluated = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/orders/${orderId}/shipping-photo-preflight`,
      headers,
      payload: {
        expectedDecisionRevision: null,
        idempotencyKey: "7bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        humanConfirmed: true,
      },
    });
    expect(evaluated.statusCode).toBe(200);
    expect(evaluated.json()).not.toHaveProperty("saleAmountMinor");
    expect(evaluated.json()).not.toHaveProperty("highValueThresholdMinor");
    expect(evaluated.json()).not.toHaveProperty("storageKey");

    const overridden = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/orders/${orderId}/shipping-photo-override`,
      headers,
      payload: {
        choice: "skip_photos",
        expectedDecisionRevision: 1,
        idempotencyKey: "7ccccccc-cccc-4ccc-8ccc-cccccccccccc",
        humanConfirmed: true,
      },
    });
    expect(overridden.statusCode).toBe(200);
    expect(overridden.json()).toMatchObject({
      state: "satisfied_without_photo",
      photoRequired: false,
      decisionReason: "manual_skip",
    });

    const zeroSale = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/orders/${orderId}/sale-amount`,
      headers,
      payload: {
        saleAmountMinor: 0,
        taxBasis: "unknown",
        sourceMeaning: "販売額を本人確認",
        occurredAt: "2026-08-30T01:02:00.000Z",
        idempotencyKey: "7ddddddd-dddd-4ddd-8ddd-dddddddddddd",
        humanConfirmed: true,
      },
    });
    expect(zeroSale.statusCode).toBe(400);
    expect(saleRecords).toBe(0);

    const recordedSale = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/orders/${orderId}/sale-amount`,
      headers,
      payload: {
        saleAmountMinor: 50_000,
        taxBasis: "unknown",
        sourceMeaning: "販売額を本人確認",
        occurredAt: "2026-08-30T01:02:00.000Z",
        idempotencyKey: "7ddddddd-dddd-4ddd-8ddd-dddddddddddd",
        humanConfirmed: true,
      },
    });
    expect(recordedSale.statusCode).toBe(201);
    expect(recordedSale.json()).toMatchObject({ saleAmountMinor: 50_000, recordedBy: actorId });
    expect(policyUpdates).toBe(1);
    expect(evaluations).toBe(1);
    expect(overrides).toBe(1);
    expect(saleRecords).toBe(1);
  });

  it("stores private photo bytes outside public responses and serves only sanitized no-store content", async () => {
    const sha256 = "a".repeat(64);
    const removed: Array<{ storageKey: string; sha256: string }> = [];
    const saved: string[] = [];
    const privateReads: unknown[] = [];
    let registered: RegisterShippingPhotoRecord | undefined;
    const mediaStore: PrivateMediaStore = {
      saveOriginal: (storageKey, bytes) => {
        saved.push(storageKey);
        return Promise.resolve({ storageKey, sha256, sizeBytes: bytes.length, created: true });
      },
      readSanitizedOriginal: (input) => {
        privateReads.push(input);
        return Promise.resolve(Buffer.from("sanitized-image"));
      },
      removeOriginal: (storageKey, expectedSha256) => {
        removed.push({ storageKey, sha256: expectedSha256 });
        return Promise.resolve();
      },
      createSanitizedDisplay: () => Promise.reject(new Error("not used")),
      readDisplay: () => Promise.reject(new Error("not used")),
      removeDisplay: () => Promise.reject(new Error("not used")),
    };
    const assetResponse = {
      assetId: productAssetId,
      orderId,
      role: "product" as const,
      mimeType: "image/jpeg" as const,
      sizeBytes: jpegWithGpsMetadata().length,
      width: 2000,
      height: 1500,
      capturedBy: actorId,
      capturedAt: "2026-08-30T01:03:00.000Z",
    };
    const repository = {
      close: () => Promise.resolve(),
      registerShippingPhoto: (
        _workspaceId: string,
        _orderId: string,
        _actor: unknown,
        record: RegisterShippingPhotoRecord,
      ) => {
        registered = record;
        return Promise.resolve(assetResponse);
      },
      readShippingPhoto: () =>
        Promise.resolve({
          storageKey: `workspaces/${workspaceId}/originals/shipping-${orderId}-${productAssetId}.jpg`,
          sha256,
          mimeType: "image/jpeg" as const,
          sizeBytes: assetResponse.sizeBytes,
          width: 2000,
          height: 1500,
        }),
      confirmShippingPhotos: () =>
        Promise.resolve({
          confirmationId,
          orderId,
          decisionRevisionId,
          assetIds: [productAssetId, packedAssetId],
          confirmedBy: actorId,
          confirmedAt: "2026-08-30T01:04:00.000Z",
        }),
    } as unknown as OrderRepository;
    const app = buildOrderTestApp(repository, mediaStore);

    const privateQuery = new URLSearchParams({
      role: "product",
      idempotencyKey: "7eeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      humanConfirmed: "true",
      storageKey: "client-controlled",
    });
    const rejected = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/orders/${orderId}/shipping-photos?${privateQuery.toString()}`,
      headers: { ...headers, "content-type": "image/jpeg" },
      payload: jpegWithGpsMetadata(),
    });
    expect(rejected.statusCode).toBe(400);
    expect(saved).toHaveLength(0);

    const query = new URLSearchParams({
      role: "product",
      idempotencyKey: "7eeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      humanConfirmed: "true",
    });
    const uploaded = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/orders/${orderId}/shipping-photos?${query.toString()}`,
      headers: { ...headers, "content-type": "image/jpeg" },
      payload: jpegWithGpsMetadata(),
    });
    expect(uploaded.statusCode, uploaded.body).toBe(201);
    expect(uploaded.json()).toEqual(assetResponse);
    expect(uploaded.json()).not.toHaveProperty("storageKey");
    expect(uploaded.json()).not.toHaveProperty("sha256");
    expect(registered).toMatchObject({
      role: "product",
      mimeType: "image/jpeg",
      width: 2000,
      height: 1500,
      sha256,
    });
    expect(registered?.storageKey).toMatch(
      new RegExp(`^workspaces/${workspaceId}/originals/shipping-${orderId}-[0-9a-f-]{36}\\.jpg$`),
    );
    expect(removed).toEqual([{ storageKey: saved[0], sha256 }]);

    const content = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/orders/${orderId}/shipping-photos/${productAssetId}/content`,
      headers,
    });
    expect(content.statusCode).toBe(200);
    expect(content.rawPayload).toEqual(Buffer.from("sanitized-image"));
    expect(content.headers["cache-control"]).toBe("private, no-store");
    expect(content.headers.pragma).toBe("no-cache");
    expect(content.headers["x-content-type-options"]).toBe("nosniff");
    expect(privateReads).toHaveLength(1);

    const confirmed = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/orders/${orderId}/shipping-photo-confirmations`,
      headers,
      payload: {
        assetIds: [productAssetId, packedAssetId],
        idempotencyKey: "7fffffff-ffff-4fff-8fff-ffffffffffff",
        humanConfirmed: true,
      },
    });
    expect(confirmed.statusCode).toBe(201);
    expect(confirmed.json()).toMatchObject({
      confirmationId,
      assetIds: [productAssetId, packedAssetId],
      confirmedBy: actorId,
    });
  });

  it("removes newly saved bytes when photo registration is rejected", async () => {
    const sha256 = "b".repeat(64);
    const removed: string[] = [];
    const mediaStore: PrivateMediaStore = {
      saveOriginal: (storageKey, bytes) =>
        Promise.resolve({ storageKey, sha256, sizeBytes: bytes.length, created: true }),
      removeOriginal: (storageKey) => {
        removed.push(storageKey);
        return Promise.resolve();
      },
      createSanitizedDisplay: () => Promise.reject(new Error("not used")),
      readDisplay: () => Promise.reject(new Error("not used")),
      readSanitizedOriginal: () => Promise.reject(new Error("not used")),
      removeDisplay: () => Promise.reject(new Error("not used")),
    };
    const repository = {
      close: () => Promise.resolve(),
      registerShippingPhoto: () =>
        Promise.reject(new RepositoryError("conflict", "simulated stale decision")),
    } as unknown as OrderRepository;
    const app = buildOrderTestApp(repository, mediaStore);
    const query = new URLSearchParams({
      role: "packed_package",
      idempotencyKey: "7aaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      humanConfirmed: "true",
    });
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/orders/${orderId}/shipping-photos?${query.toString()}`,
      headers: { ...headers, "content-type": "image/jpeg" },
      payload: jpegWithGpsMetadata(),
    });
    expect(response.statusCode).toBe(409);
    expect(removed).toHaveLength(1);
  });
});

function jpegWithGpsMetadata(): Buffer {
  const exif = Buffer.from("Exif\0\0GPSLatitude=35.0;GPSLongitude=139.0", "utf8");
  const app1Length = Buffer.alloc(2);
  app1Length.writeUInt16BE(exif.length + 2);
  const dimensions = Buffer.from([
    0xff, 0xc0, 0x00, 0x11, 0x08, 0x05, 0xdc, 0x07, 0xd0, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00,
    0x03, 0x11, 0x00,
  ]);
  const scan = Buffer.from([0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0xff, 0xd9]);
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1]), app1Length, exif, dimensions, scan]);
}
