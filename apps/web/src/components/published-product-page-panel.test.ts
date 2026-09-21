import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./published-product-page-panel.tsx", import.meta.url), "utf8");

describe("published product page panel contract", () => {
  it("loads saved data, posts only after confirmation and reads it back", () => {
    expect(source).toContain("loadPublishedProductPage(workspaceId, skuId, controller.signal)");
    expect(source).toContain('method: "POST"');
    expect(source).toContain("humanConfirmed: true");
    expect(source).toContain("const saved = await loadPublishedProductPage(workspaceId, skuId)");
    expect(source).toContain("setHumanConfirmed(false)");
  });

  it("does not fetch the external product page and opens only a saved link by user action", () => {
    expect(source).toContain('href={page.productUrl} target="_blank" rel="noopener noreferrer"');
    expect(source).not.toContain("fetch(page.productUrl");
    expect(source).not.toContain("window.open");
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("sessionStorage");
  });

  it("clears confirmation when either identifying field changes", () => {
    expect(source).toMatch(/function changeProductId[\s\S]*setHumanConfirmed\(false\)/u);
    expect(source).toMatch(/function changeProductUrl[\s\S]*setHumanConfirmed\(false\)/u);
  });
});
