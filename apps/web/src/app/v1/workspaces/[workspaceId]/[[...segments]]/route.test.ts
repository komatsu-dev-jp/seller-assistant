import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const ruleId = "22222222-2222-4222-8222-222222222222";
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
