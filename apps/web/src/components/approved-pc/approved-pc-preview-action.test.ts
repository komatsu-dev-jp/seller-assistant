import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (name: string) =>
  readFileSync(resolve(process.cwd(), `apps/web/src/components/approved-pc/${name}`), "utf8");

const canvas = read("pc-canvas.tsx");
const trigger = read("pc-preview-action-button.tsx");
const middle = read("approved-pc-middle-screens.tsx");

describe("approved PC preview actions", () => {
  it("opens an honest modal instead of pretending that preview data was saved", () => {
    expect(trigger).toContain("data-pc-preview-action={title}");
    expect(trigger).toContain("aria-label={ariaLabel}");
    expect(canvas).toContain('aria-modal="true"');
    expect(canvas).toContain("この確認版では保存・外部送信を行いません。");
    expect(canvas).toContain("event.preventDefault()");
  });

  it("keeps keyboard focus in the modal and restores the trigger", () => {
    expect(canvas).toContain('if (event.key !== "Tab") return');
    expect(canvas).toContain("previewPanelRef.current?.querySelectorAll<HTMLElement>");
    expect(canvas).toContain("previewTriggerRef.current = previewTarget");
    expect(canvas).toContain("window.requestAnimationFrame(() => opener.focus())");
  });

  it("separates PC20-22 live work from the next approved preview", () => {
    expect(middle).toContain('title="採寸値の保存"');
    expect(middle).toContain('title="タグ内容の保存"');
    expect(middle).toContain('title="商品説明候補の作成"');
    expect(middle.match(/liveHref="\/workflow"/gu)?.length).toBeGreaterThanOrEqual(5);
    expect(middle).toContain("previewHref={to(21)}");
    expect(middle).toContain("previewHref={to(22)}");
    expect(middle).toContain("previewHref={to(23)}");
    expect(middle).toContain("<a href={to(17)}>すべての写真を確認</a>");
    expect(middle).not.toContain("<a href={to(17)}>写真を並べ替え</a>");
    expect(middle).not.toContain("<a href={to(21)}>写真を追加</a>");
  });
});
