import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "apps/web/src/components/approved-pc/approved-pc-early-screens.tsx"),
  "utf8",
);

describe("approved PC early-screen actions", () => {
  it("does not leave enabled raw buttons without an action or shared delegate", () => {
    const rawButtons = [...source.matchAll(/<button\b[\s\S]*?>/gu)].map(([tag]) => tag);
    const inertButtons = rawButtons.filter(
      (tag) =>
        !/\bonClick=/u.test(tag) &&
        !/\bdisabled\b/u.test(tag) &&
        !/\bdata-pc-header-action=/u.test(tag),
    );
    expect(inertButtons).toEqual([]);
  });

  it("makes the count, label method, inspection choice, and photo zoom change locally", () => {
    expect(source).toContain("setCount((value) => (value ?? 0) + 1)");
    expect(source).toContain("setCount((value) => (value ?? 0) + 10)");
    expect(source).toContain('setLabelMethod("hand")');
    expect(source).toContain('setLabelMethod("print")');
    expect(source).toContain('select(x, "ok")');
    expect(source).toContain('select(x, "warn")');
    expect(source).toContain("setPhotoZoom");
  });

  it("uses safe handoffs for file and print actions and a real scan route", () => {
    expect(source).toContain('title="仕入れ書類の選択"');
    expect(source).toContain('title="在庫ラベルの印刷"');
    expect(source).toContain('liveHref="/workflow"');
    expect(source).toContain('liveHref="/inventory/labels"');
    expect(source).toContain(
      '<PcLiveRouteLink href="/mobile/scan">スマホで読み取って商品を開く</PcLiveRouteLink>',
    );
  });

  it("copies only static preview text and reports clipboard failure", () => {
    expect(source).toContain("navigator.clipboard.writeText(text)");
    expect(source).toContain("コピーしました");
    expect(source).toContain("コピーできませんでした。ブラウザの許可を確認してください");
  });

  it("marks current navigation and uses a genuinely disabled completion control", () => {
    expect(source).toContain('aria-current={item === active ? "page" : undefined}');
    expect(source).toContain('<button type="button" className={styles.disabled} disabled>');
    expect(source).not.toContain("<a className={styles.disabled} href={go(16)}>");
  });
});
