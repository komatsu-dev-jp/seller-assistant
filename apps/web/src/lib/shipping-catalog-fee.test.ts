import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseShippingCatalogFee } from "./shipping-catalog-fee";

describe("shipping catalog fee input", () => {
  it.each(["", " ", "\t\n", "　"])("rejects missing fee %j instead of storing zero", (input) => {
    expect(() => parseShippingCatalogFee(input)).toThrow("無料の場合は0");
  });
  it.each([
    ["0", 0],
    [" 0 ", 0],
    ["750", 750],
    [" 750 ", 750],
    [String(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER],
  ] as const)("accepts explicit integer %j", (input, expected) => {
    expect(parseShippingCatalogFee(input)).toBe(expected);
  });
  it.each([
    "-1",
    "0.5",
    "750.1",
    "NaN",
    "Infinity",
    "-Infinity",
    "abc",
    "9007199254740992",
    "1e309",
    "0x10",
    "9007199254740991.1",
  ])("rejects invalid or unsafe fee %j", (input) => {
    expect(() => parseShippingCatalogFee(input)).toThrow("0円以上");
  });
  it("validates before constructing the catalog mutation", () => {
    const source = readFileSync(resolve("apps/web/src/components/shipping-workspace.tsx"), "utf8");
    expect(source).toContain("parseShippingCatalogFee(shippingCatalogDraft.feeYen)");
    expect(source).not.toContain("Number(shippingCatalogDraft.feeYen)");
  });
});
