import { describe, expect, it } from "vitest";
import { isAllowedPath } from "../app/v1/workspaces/[workspaceId]/[[...segments]]/route";
describe("sales check proxy", () => {
  it("allows only exact UUID-scoped GET and POST", () => {
    const path = ["skus", "11111111-1111-4111-8111-111111111111", "sales-checks"];
    expect(isAllowedPath("GET", path)).toBe(true);
    expect(isAllowedPath("POST", path)).toBe(true);
    expect(isAllowedPath("PATCH", path)).toBe(false);
    expect(isAllowedPath("PUT", path)).toBe(false);
    expect(isAllowedPath("GET", [...path, "extra"])).toBe(false);
    expect(isAllowedPath("GET", ["skus", "invalid", "sales-checks"])).toBe(false);
  });
});
