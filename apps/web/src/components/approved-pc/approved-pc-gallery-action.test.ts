import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const componentRoot = resolve(process.cwd(), "apps/web/src/components");
const source = readFileSync(
  resolve(componentRoot, "approved-pc/approved-pc-middle-screens.tsx"),
  "utf8",
);
const gallerySource = source.slice(
  source.indexOf("function Gallery()"),
  source.indexOf("function SalesCheck()"),
);

describe("approved PC saved product controls", () => {
  it("provides real list/gallery and channel filter controls", () => {
    expect(gallerySource).toContain('aria-label="商品ページの表示方法"');
    expect(gallerySource).toContain('onClick={() => setViewMode("list")}');
    expect(gallerySource).toContain('onClick={() => setViewMode("gallery")}');
    expect(gallerySource).toContain('aria-label="販売先で絞り込む"');
    expect(gallerySource).toContain("filterSavedProducts(items, filter)");
  });

  it("uses truthful fixture counts and a one-page boundary", () => {
    expect(gallerySource).toContain("items.length");
    expect(gallerySource).toContain("channelACount");
    expect(gallerySource).toContain("channelBCount");
    expect(gallerySource).toContain("pageSummary.first");
    expect(gallerySource).toContain('aria-current="page"');
    expect(gallerySource).not.toContain("48件中 1〜6件");
    expect(gallerySource).not.toContain("[1, 2, 3]");
  });

  it("does not invent product URLs or redirect missing URLs to PC26", () => {
    expect(gallerySource).toContain("この見本6件に商品URLはまだ登録されていません。");
    expect(gallerySource).toContain("URL未登録");
    expect(gallerySource).toContain("商品ページを開く");
    expect(gallerySource).not.toContain("<a href={to(26)}>商品ページを開く</a>");
    expect(gallerySource).not.toMatch(/fetch\(|requestJson\(|XMLHttpRequest/u);
  });
});
