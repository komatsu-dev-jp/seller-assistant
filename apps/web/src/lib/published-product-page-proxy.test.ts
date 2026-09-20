import { describe, expect, it } from "vitest";

import { isAllowedPath } from "../app/v1/workspaces/[workspaceId]/[[...segments]]/route";

const skuId = "11111111-1111-4111-8111-111111111111";

describe("published product page PWA proxy", () => {
  it("allows only the exact read and human-confirmed registration route", () => {
    const path = ["skus", skuId, "published-product-page"];

    expect(isAllowedPath("GET", path)).toBe(true);
    expect(isAllowedPath("POST", path)).toBe(true);
    expect(isAllowedPath("PUT", path)).toBe(false);
    expect(isAllowedPath("PATCH", path)).toBe(false);
    expect(isAllowedPath("GET", ["skus", "not-a-uuid", "published-product-page"])).toBe(false);
    expect(isAllowedPath("GET", [...path, "content"])).toBe(false);
  });
});
