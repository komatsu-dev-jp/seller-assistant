import { afterEach, describe, expect, it } from "vitest";
import { healthResponseSchema } from "@resale/contracts";
import { buildApp } from "./app.js";
import { InMemoryWorkflowRepository } from "./repository.js";

const apps: ReturnType<typeof buildApp>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
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
    const app = buildApp({ repository: new InMemoryWorkflowRepository() });
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
    const app = buildApp({ repository: new InMemoryWorkflowRepository() });
    apps.push(app);
    const invalid = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/skus`,
      payload: { skuCode: "SKU-000001", title: "商品", category: "トップス" },
    });
    expect(invalid.statusCode).toBe(400);

    const request = {
      method: "POST" as const,
      url: `/v1/workspaces/${workspaceId}/skus`,
      headers: { "x-actor-id": actorId },
      payload: { skuCode: "SKU-000001", title: "商品", category: "トップス" },
    };
    expect((await app.inject(request)).statusCode).toBe(201);
    expect((await app.inject(request)).statusCode).toBe(409);
  });
});
