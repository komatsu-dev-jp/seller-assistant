import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "./app.js";
import type { P0ItemRepository } from "./p0-item-repository.js";
import { RepositoryError } from "./repository.js";
const workspaceId = "81111111-1111-4111-8111-111111111111";
const skuId = "82222222-2222-4222-8222-222222222222";
const identityId = "83333333-3333-4333-8333-333333333333";
const path = `/v1/workspaces/${workspaceId}/skus/${skuId}/sales-checks`;
const headers = { authorization: "test" };
const input = {
  listingDays: null,
  currentPriceYen: "0",
  viewCount: "123",
  searchCount: null,
  likeCount: null,
  priceReductionRequestCount: null,
  checkedOn: "2026-09-21",
  nextCheckOn: "2026-09-22",
  inputSource: "official_page_human_checked" as const,
  idempotencyKey: "84444444-4444-4444-8444-444444444444",
};
const record = {
  observationId: input.idempotencyKey,
  workspaceId,
  skuId,
  confirmedBy: identityId,
  savedAt: "2026-09-21T00:00:00.000Z",
  listingDays: null,
  currentPriceYen: 0,
  viewCount: 123,
  searchCount: null,
  likeCount: null,
  priceReductionRequestCount: null,
  checkedOn: input.checkedOn,
  nextCheckOn: input.nextCheckOn,
  inputSource: input.inputSource,
};
const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
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
describe("sales check API", () => {
  it("requires authenticated workspace and returns private noncached observations", async () => {
    const summary = { workspaceId, skuId, eligible: true, latest: record, recordCount: 1 };
    const read = vi.fn(async () => summary);
    const write = vi.fn(async () => record);
    const app = appFor({ salesCheck: read, recordSalesCheck: write });
    for (const method of ["GET", "POST"] as const) {
      expect(
        (await app.inject({ method, url: path, ...(method === "POST" ? { payload: input } : {}) }))
          .statusCode,
      ).toBe(401);
      expect(
        (
          await app.inject({
            method,
            url: path.replace(workspaceId, identityId),
            headers,
            ...(method === "POST" ? { payload: input } : {}),
          })
        ).statusCode,
      ).toBe(403);
    }
    expect(read).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    const saved = await app.inject({ method: "POST", url: path, headers, payload: input });
    expect(saved.statusCode).toBe(201);
    expect(saved.json()).toEqual(record);
    expect(saved.headers["cache-control"]).toBe("private, no-store");
    expect(write).toHaveBeenCalledWith(workspaceId, skuId, { identityId, workspaceId }, input);
    const loaded = await app.inject({ url: path, headers });
    expect(loaded.json()).toEqual(summary);
    expect(loaded.headers.pragma).toBe("no-cache");
  });
  it("rejects invalid and private extra fields before dispatch", async () => {
    const write = vi.fn(async () => record);
    const app = appFor({ recordSalesCheck: write });
    for (const payload of [
      { ...input, viewCount: "1e3" },
      { ...input, viewCount: -1 },
      { ...input, nextCheckOn: "2026-02-29" },
      { ...input, image: "secret" },
      { ...input, inputSource: "ocr" },
    ]) {
      expect((await app.inject({ method: "POST", url: path, headers, payload })).statusCode).toBe(
        400,
      );
    }
    expect(write).not.toHaveBeenCalled();
  });
  it.each([
    ["forbidden", 403],
    ["conflict", 409],
    ["database_error", 503],
  ] as const)("maps %s safely", async (code, status) => {
    const fail = async () => {
      throw new RepositoryError(code, "Sales check unavailable");
    };
    const app = appFor({ salesCheck: fail, recordSalesCheck: fail });
    for (const method of ["GET", "POST"] as const) {
      const response = await app.inject({
        method,
        url: path,
        headers,
        ...(method === "POST" ? { payload: input } : {}),
      });
      expect(response.statusCode).toBe(status);
      expect(response.body).not.toContain("currentPriceYen");
    }
  });
  it("returns 503 without a service", async () => {
    const app = appFor();
    expect((await app.inject({ url: path, headers })).statusCode).toBe(503);
    expect(
      (await app.inject({ method: "POST", url: path, headers, payload: input })).statusCode,
    ).toBe(503);
  });
});
