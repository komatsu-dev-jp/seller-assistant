import { afterEach, describe, expect, it, vi } from "vitest";

import { buildApp } from "./app.js";
import type { P0ItemRepository } from "./p0-item-repository.js";
import { RepositoryError } from "./repository.js";

const workspaceId = "81111111-1111-4111-8111-111111111111";
const skuId = "82222222-2222-4222-8222-222222222222";
const identityId = "83333333-3333-4333-8333-333333333333";
const registrationId = "84444444-4444-4444-8444-444444444444";
const headers = { authorization: "test" };
const page = {
  registrationId,
  workspaceId,
  skuId,
  salesChannelKey: "mercari" as const,
  salesChannelName: "メルカリ" as const,
  productId: "m123456789",
  productUrl: "https://jp.mercari.com/item/m123456789",
  confirmedBy: identityId,
  confirmedAt: "2026-09-21T00:00:00.000Z",
};
const request = {
  salesChannelKey: "mercari" as const,
  salesChannelName: "メルカリ" as const,
  productId: page.productId,
  productUrl: page.productUrl,
  idempotencyKey: "85555555-5555-4555-8555-555555555555",
  humanConfirmed: true as const,
};

const apps: ReturnType<typeof buildApp>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

function appFor(repository?: Partial<P0ItemRepository>) {
  const app = buildApp({
    ...(repository
      ? { p0ItemRepository: { close: async () => {}, ...repository } as P0ItemRepository }
      : {}),
    authenticate: (requestHeaders) =>
      requestHeaders.authorization ? { identityId, workspaceId } : null,
    validateWriteOrigin: () => true,
  });
  apps.push(app);
  return app;
}

describe("published product page API", () => {
  it("reads and registers only authenticated same-workspace requests", async () => {
    const read = vi.fn(async () => ({ workspaceId, skuId, page }));
    const register = vi.fn(async () => page);
    const app = appFor({ publishedProductPage: read, registerPublishedProductPage: register });
    const path = `/v1/workspaces/${workspaceId}/skus/${skuId}/published-product-page`;

    expect((await app.inject({ url: path })).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          url: `/v1/workspaces/86666666-6666-4666-8666-666666666666/skus/${skuId}/published-product-page`,
          headers,
        })
      ).statusCode,
    ).toBe(403);
    expect(read).not.toHaveBeenCalled();

    const readResponse = await app.inject({ url: path, headers });
    expect(readResponse.statusCode).toBe(200);
    expect(readResponse.json()).toEqual({ workspaceId, skuId, page });
    expect(readResponse.headers["cache-control"]).toBe("private, no-store");
    expect(readResponse.headers.pragma).toBe("no-cache");

    const saved = await app.inject({ method: "POST", url: path, headers, payload: request });
    expect(saved.statusCode).toBe(201);
    expect(saved.json()).toEqual(page);
    expect(saved.headers["cache-control"]).toBe("private, no-store");
    expect(register).toHaveBeenCalledWith(workspaceId, skuId, { identityId, workspaceId }, request);
  });

  it("rejects unconfirmed, mismatched and extra URL input before repository dispatch", async () => {
    const register = vi.fn(async () => page);
    const app = appFor({ registerPublishedProductPage: register });
    const path = `/v1/workspaces/${workspaceId}/skus/${skuId}/published-product-page`;
    for (const payload of [
      { ...request, humanConfirmed: false },
      { ...request, productUrl: "https://jp.mercari.com/item/m987654321" },
      { ...request, automaticFetch: true },
    ]) {
      const response = await app.inject({ method: "POST", url: path, headers, payload });
      expect(response.statusCode).toBe(400);
    }
    expect(register).not.toHaveBeenCalled();
  });

  it.each([
    ["forbidden", 403],
    ["conflict", 409],
    ["database_error", 503],
  ] as const)(
    "maps %s repository failures without exposing private values",
    async (code, status) => {
      const app = appFor({
        registerPublishedProductPage: async () => {
          throw new RepositoryError(code, "The confirmed page could not be stored");
        },
      });
      const response = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/skus/${skuId}/published-product-page`,
        headers,
        payload: request,
      });
      expect(response.statusCode).toBe(status);
      expect(response.body).not.toContain(page.productUrl);
      expect(response.body).not.toContain(page.productId);
    },
  );

  it("returns 503 when the product service is unavailable", async () => {
    const app = appFor();
    const response = await app.inject({
      url: `/v1/workspaces/${workspaceId}/skus/${skuId}/published-product-page`,
      headers,
    });
    expect(response.statusCode).toBe(503);
  });
});
