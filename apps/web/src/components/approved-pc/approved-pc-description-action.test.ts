import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const componentRoot = resolve(process.cwd(), "apps/web/src/components");
const source = readFileSync(
  resolve(componentRoot, "approved-pc/approved-pc-middle-screens.tsx"),
  "utf8",
);
const styles = readFileSync(
  resolve(componentRoot, "approved-pc/approved-pc-middle-screens.module.css"),
  "utf8",
);
const descriptionSource = source.slice(
  source.indexOf("function Description()"),
  source.indexOf("function Official()"),
);
const officialSource = source.slice(
  source.indexOf("function Official()"),
  source.indexOf("function GalleryVisual"),
);

describe("approved PC description review flow", () => {
  it("keeps edited text and note separately in this browser tab", () => {
    expect(descriptionSource).toContain('aria-label="編集する商品説明"');
    expect(descriptionSource).toContain('aria-label="補足メモ"');
    expect(descriptionSource).toContain(
      "writeApprovedPcListingDraft(getApprovedPcListingStorage()",
    );
    expect(descriptionSource).toContain("description: nextDescription");
    expect(descriptionSource).toContain("note: nextNote");
    expect(descriptionSource).not.toMatch(/localStorage|fetch\(|requestJson\(/u);
  });

  it("replaces the two self-links with working preview and guarded reset actions", () => {
    expect(descriptionSource).toContain("previewDialog.current?.showModal()");
    expect(descriptionSource).toContain("previewDialog.current?.close()");
    expect(descriptionSource).toContain("resetDialog.current?.showModal()");
    expect(descriptionSource).toContain("resetDialog.current?.close()");
    expect(descriptionSource).toContain("編集内容を元に戻しますか？");
    expect(descriptionSource).toContain("元の候補へ戻す");
    expect(descriptionSource).toContain("補足メモは商品説明へ含まれません。");
    expect(descriptionSource).not.toContain("<a href={to(23)}>プレビュー</a>");
    expect(descriptionSource).not.toContain("<a href={to(23)}>リセット</a>");
  });

  it("updates the count and stops an empty description before navigation", () => {
    expect(descriptionSource).toContain("Array.from(description).length");
    expect(descriptionSource).toContain("if (!description.trim())");
    expect(descriptionSource).toContain("event.preventDefault()");
    expect(descriptionSource).toContain("descriptionInput.current?.focus()");
    expect(descriptionSource).toContain("href={to(24)}");
  });

  it("loads the PC23 draft in PC24 and keeps later edits for the back action", () => {
    expect(officialSource).toContain("loadApprovedPcListingDraft(getApprovedPcListingStorage())");
    expect(officialSource).toContain("setListingDescription(saved.description)");
    expect(officialSource).toContain("note: listingNote.current");
    expect(officialSource).toContain("const saved = writeApprovedPcListingDraft");
    expect(officialSource).toContain("if (saveListingDraft(listingDescription)) return");
    expect(officialSource).toContain("event.preventDefault()");
    expect(officialSource).toContain("戻る操作を止めました");
    expect(officialSource).not.toMatch(/localStorage|fetch\(|requestJson\(/u);
  });

  it("keeps preview content inside a bounded dialog", () => {
    expect(styles).toMatch(/\.descriptionPreview\s*\{[^}]*max-height:/su);
    expect(styles).toMatch(/\.descriptionPreview pre\s*\{[^}]*overflow-wrap:\s*anywhere;/su);
    expect(styles).not.toMatch(/\.descriptionPreview\s*\{[^}]*position:\s*fixed;/su);
  });
});
