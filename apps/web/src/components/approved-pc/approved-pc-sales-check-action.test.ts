import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const componentRoot = resolve(process.cwd(), "apps/web/src/components");
const source = readFileSync(
  resolve(componentRoot, "approved-pc/approved-pc-middle-screens.tsx"),
  "utf8",
);
const salesSource = source.slice(
  source.indexOf("function SalesCheck()"),
  source.indexOf("function Price()"),
);

describe("approved PC sales check controls", () => {
  it("connects the selected product and keeps item-specific draft values", () => {
    expect(salesSource).toContain("orderSalesCheckItems(SALES_CHECK_ITEMS)");
    expect(salesSource).toContain("selectedItem.id");
    expect(salesSource).toContain("selectedItem.name");
    expect(salesSource).toContain("selectedItem.channel");
    expect(salesSource).toContain("aria-pressed={item.id === selectedItem.id}");
    expect(salesSource).toContain("updateSalesCheckDraft(current, selectedItemId, field, value)");
  });

  it("includes every approved manual fact and preserves mode state", () => {
    for (const label of [
      "出品日数",
      "現在価格",
      "閲覧数",
      "検索数",
      "いいね数",
      "値下げ依頼",
      "確認日",
      "入力元",
      "次回確認日",
    ]) {
      expect(salesSource).toContain(label);
    }
    expect(salesSource).toContain('aria-pressed={mode === "direct"}');
    expect(salesSource).toContain('aria-pressed={mode === "screenshot"}');
    expect(salesSource).toContain("value={selectedDraft[field]}");
  });

  it("previews a locally selected image without pretending that OCR or saving works", () => {
    expect(salesSource).toContain("SALES_CHECK_IMAGE_ACCEPT");
    expect(salesSource).toContain('type="file"');
    expect(salesSource).toContain("validateSalesCheckImageFile(file)");
    expect(salesSource).toContain("validateSalesCheckImageDimensions(");
    expect(salesSource).toContain("URL.createObjectURL(file)");
    expect(salesSource).toContain("URL.revokeObjectURL");
    expect(salesSource).toContain("画像から数字を自動入力しません");
    expect(salesSource).toContain("PC内だけの一時プレビュー・保存されません");
    expect(salesSource).toContain("本人が画像と比較して確認");
    expect(salesSource).toContain("商品URLは未登録です");
    expect(salesSource).toContain("数値の保存は準備中");
    expect(salesSource).toContain("まだ保存されません");
    expect(salesSource).not.toContain("<Button n={26}>");
    expect(salesSource).not.toContain("<a href={to(26)}>公式ページを開く</a>");
    expect(salesSource).not.toMatch(/fetch\(|requestJson\(|XMLHttpRequest/u);
  });

  it("keeps image previews separated by item and ignores stale load events", () => {
    expect(salesSource).toContain("imagePreviewsRef.current[itemId]");
    expect(salesSource).toContain("current.previewUrl !== previewUrl");
    expect(salesSource).toContain("selectedImagePreview = imagePreviews[selectedItemId]");
    expect(salesSource).toContain("selectedImageError = imageErrors[selectedItemId]");
  });
});
