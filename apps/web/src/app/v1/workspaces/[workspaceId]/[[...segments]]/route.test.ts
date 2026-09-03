import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const ruleId = "22222222-2222-4222-8222-222222222222";
const skuId = "33333333-3333-4333-8333-333333333333";
const orderId = "44444444-4444-4444-8444-444444444444";
const inventoryUnitId = "55555555-5555-4555-8555-555555555555";
const appOrigin = "http://127.0.0.1:3000";

const exactSegments = ["accounting", "mapping-rules", ruleId, "replacements"];

describe("workspace accounting mapping-rules proxy allowlist", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("forwards the exact replacement route to the API", async () => {
    vi.stubEnv("API_INTERNAL_ORIGIN", "http://api.invalid");
    vi.stubEnv("APP_ORIGIN", appOrigin);
    const upstream = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const request = new NextRequest(
      `http://127.0.0.1:3000/v1/workspaces/${workspaceId}/${exactSegments.join("/")}`,
      { method: "POST", headers: { origin: appOrigin } },
    );

    const response = await POST(request, {
      params: Promise.resolve({ workspaceId, segments: exactSegments }),
    });

    expect(response.status).toBe(200);
    expect(upstream).toHaveBeenCalledOnce();
    expect(String(upstream.mock.calls[0]?.[0])).toBe(
      `http://api.invalid/v1/workspaces/${workspaceId}/${exactSegments.join("/")}`,
    );
  });

  it("rejects a near-match replacement path instead of widening the allowlist", async () => {
    vi.stubEnv("API_INTERNAL_ORIGIN", "http://api.invalid");
    vi.stubEnv("APP_ORIGIN", appOrigin);
    const upstream = vi.spyOn(globalThis, "fetch");
    const nearMatchSegments = [...exactSegments.slice(0, -1), "replacements-extra"];
    const request = new NextRequest(
      `http://127.0.0.1:3000/v1/workspaces/${workspaceId}/${nearMatchSegments.join("/")}`,
      { method: "POST", headers: { origin: appOrigin } },
    );

    const response = await POST(request, {
      params: Promise.resolve({ workspaceId, segments: nearMatchSegments }),
    });

    expect(response.status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });
});

describe("assigned order location-photo proxy allowlist", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("forwards only the exact GET path and binding query as private image bytes", async () => {
    vi.stubEnv("API_INTERNAL_ORIGIN", "http://api.invalid");
    const bytes = new TextEncoder().encode("approved-zero-gps-derivative");
    const upstream = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(bytes, {
        status: 200,
        headers: { "content-type": "image/jpeg", "content-disposition": "inline" },
      }),
    );
    const segments = ["orders", orderId, "pick-location-photo", "content"];
    const query = `?inventoryUnitId=${inventoryUnitId}&movementSequence=7`;
    const response = await GET(
      new NextRequest(
        `http://127.0.0.1:3000/v1/workspaces/${workspaceId}/${segments.join("/")}${query}`,
        { headers: { accept: "image/avif,image/webp,image/jpeg,image/png" } },
      ),
      { params: Promise.resolve({ workspaceId, segments }) },
    );

    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(upstream).toHaveBeenCalledOnce();
    expect(String(upstream.mock.calls[0]?.[0])).toBe(
      `http://api.invalid/v1/workspaces/${workspaceId}/${segments.join("/")}${query}`,
    );
  });

  it("rejects near-match paths and non-GET methods without contacting the API", async () => {
    vi.stubEnv("API_INTERNAL_ORIGIN", "http://api.invalid");
    vi.stubEnv("APP_ORIGIN", appOrigin);
    const upstream = vi.spyOn(globalThis, "fetch");
    const nearMatch = ["orders", orderId, "pick-location-photo", "content-extra"];
    const rejectedNearMatch = await GET(
      new NextRequest(`http://127.0.0.1:3000/v1/workspaces/${workspaceId}/${nearMatch.join("/")}`),
      { params: Promise.resolve({ workspaceId, segments: nearMatch }) },
    );
    const exact = ["orders", orderId, "pick-location-photo", "content"];
    const rejectedPost = await POST(
      new NextRequest(`http://127.0.0.1:3000/v1/workspaces/${workspaceId}/${exact.join("/")}`, {
        method: "POST",
        headers: { origin: appOrigin },
      }),
      { params: Promise.resolve({ workspaceId, segments: exact }) },
    );

    expect(rejectedNearMatch.status).toBe(404);
    expect(rejectedPost.status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });
});

describe("workspace product attribute proxy allowlist", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("forwards only the exact POST product-attributes route", async () => {
    vi.stubEnv("API_INTERNAL_ORIGIN", "http://api.invalid");
    vi.stubEnv("APP_ORIGIN", appOrigin);
    const upstream = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const segments = ["skus", skuId, "product-attributes"];
    const response = await POST(
      new NextRequest(`http://127.0.0.1:3000/v1/workspaces/${workspaceId}/${segments.join("/")}`, {
        method: "POST",
        headers: { origin: appOrigin },
      }),
      { params: Promise.resolve({ workspaceId, segments }) },
    );
    expect(response.status).toBe(200);
    expect(upstream).toHaveBeenCalledOnce();
  });

  it("rejects a near-match product attribute route", async () => {
    vi.stubEnv("API_INTERNAL_ORIGIN", "http://api.invalid");
    vi.stubEnv("APP_ORIGIN", appOrigin);
    const upstream = vi.spyOn(globalThis, "fetch");
    const segments = ["skus", skuId, "product-attributes-extra"];
    const response = await POST(
      new NextRequest(`http://127.0.0.1:3000/v1/workspaces/${workspaceId}/${segments.join("/")}`, {
        method: "POST",
        headers: { origin: appOrigin },
      }),
      { params: Promise.resolve({ workspaceId, segments }) },
    );
    expect(response.status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("rejects GET for product attributes", async () => {
    vi.stubEnv("API_INTERNAL_ORIGIN", "http://api.invalid");
    const upstream = vi.spyOn(globalThis, "fetch");
    const segments = ["skus", skuId, "product-attributes"];
    const response = await GET(
      new NextRequest(`http://127.0.0.1:3000/v1/workspaces/${workspaceId}/${segments.join("/")}`),
      { params: Promise.resolve({ workspaceId, segments }) },
    );
    expect(response.status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });
});

describe("workspace pilot external invalidation proxy allowlist", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("forwards only the exact POST external-invalidation route", async () => {
    vi.stubEnv("API_INTERNAL_ORIGIN", "http://api.invalid");
    vi.stubEnv("APP_ORIGIN", appOrigin);
    const upstream = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const segments = ["pilot-runs", skuId, "external-invalidation"];
    const response = await POST(
      new NextRequest(`http://127.0.0.1:3000/v1/workspaces/${workspaceId}/${segments.join("/")}`, {
        method: "POST",
        headers: { origin: appOrigin },
      }),
      { params: Promise.resolve({ workspaceId, segments }) },
    );
    expect(response.status).toBe(200);
    expect(upstream).toHaveBeenCalledOnce();
  });

  it("rejects a near-match and GET without widening the pilot routes", async () => {
    vi.stubEnv("API_INTERNAL_ORIGIN", "http://api.invalid");
    vi.stubEnv("APP_ORIGIN", appOrigin);
    const upstream = vi.spyOn(globalThis, "fetch");
    const nearMatch = ["pilot-runs", skuId, "external-invalidation-extra"];
    const rejectedPost = await POST(
      new NextRequest(`http://127.0.0.1:3000/v1/workspaces/${workspaceId}/${nearMatch.join("/")}`, {
        method: "POST",
        headers: { origin: appOrigin },
      }),
      { params: Promise.resolve({ workspaceId, segments: nearMatch }) },
    );
    const exact = ["pilot-runs", skuId, "external-invalidation"];
    const rejectedGet = await GET(
      new NextRequest(`http://127.0.0.1:3000/v1/workspaces/${workspaceId}/${exact.join("/")}`),
      { params: Promise.resolve({ workspaceId, segments: exact }) },
    );
    expect(rejectedPost.status).toBe(404);
    expect(rejectedGet.status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });
});
