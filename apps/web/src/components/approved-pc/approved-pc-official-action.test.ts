import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const componentRoot = resolve(process.cwd(), "apps/web/src/components");
const source = readFileSync(
  resolve(componentRoot, "approved-pc/approved-pc-middle-screens.tsx"),
  "utf8",
);
const officialSource = source.slice(
  source.indexOf("function Official()"),
  source.indexOf("function GalleryVisual"),
);

describe("approved PC official handoff actions", () => {
  it("edits and copies the listing description only after a person clicks", () => {
    expect(officialSource).toContain('aria-label="コピーする商品説明"');
    expect(officialSource).toContain("const nextDescription = event.target.value");
    expect(officialSource).toContain("setListingDescription(nextDescription)");
    expect(officialSource).toContain("navigator.clipboard.writeText(text)");
    expect(officialSource).toContain("onClick={() => void copyListingDescription()}");
    expect(officialSource).not.toContain("<a href={to(24)}>商品説明をコピー");
  });

  it("opens the public official page without adding automatic publishing", () => {
    expect(officialSource).toContain('href="https://jp.mercari.com/"');
    expect(officialSource).toContain('target="_blank"');
    expect(officialSource).toContain('rel="noopener noreferrer"');
    expect(officialSource).not.toMatch(/fetch\(|requestJson\(|XMLHttpRequest/u);
  });

  it("keeps unfinished photo export and listing persistence distinguishable", () => {
    expect(officialSource).toContain("↓ 写真（12枚）の保存は準備中");
    expect(officialSource).toContain("実商品写真はまだ保存されません");
    expect(officialSource).toContain("販売先・商品ID・URL・確認日はまだ保存されません");
    expect(officialSource).toContain("出品情報の保存は準備中");
    expect(officialSource).not.toContain("href={to(24)}>↓ 写真（12枚）");
    expect(officialSource).not.toContain("<Button n={24}>出品情報を保存</Button>");
  });
});
