import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (name: string) =>
  readFileSync(resolve(process.cwd(), `apps/web/src/components/approved-pc/${name}`), "utf8");

const early = read("approved-pc-early-screens.tsx");
const late = read("approved-pc-late-screens.tsx");
const styles = read("approved-pc-early-screens.module.css");

describe("approved PC form accessibility and putaway layout", () => {
  it("marks the actual PC12 warehouse destination as the current sidebar item", () => {
    expect(early).toContain('screen === 11\n                  ? "在庫"');
    expect(early).toContain('screen === 12\n                    ? "倉庫"');
  });

  it("gives editable and read-only form fields explicit names", () => {
    expect(early).toContain('aria-label="ブランド"');
    expect(early).toContain('aria-label="特徴・カテゴリ"');
    expect(early).toContain('aria-label="販売可否"');
    expect(early).toContain('aria-label="メモ（任意）"');
    expect(early).toContain('aria-label="格納時の備考"');
    expect(late).toContain('["項目名", "手数料率（%）", "最低手数料（円）"][cellIndex]');
  });

  it("keeps the PC12 notes field inside the checklist card", () => {
    expect(styles).toMatch(/\.putaway \.putTop > \.card:nth-child\(3\) label \{\s+margin: 0;/u);
    expect(styles).toMatch(
      /\.putaway \.putTop > \.card:nth-child\(3\) label input \{[\s\S]*?width: 12px;[\s\S]*?height: 12px;/u,
    );
    expect(styles).toMatch(
      /\.putaway \.putTop > \.card:nth-child\(3\) textarea \{[\s\S]*?width: 100%;[\s\S]*?padding: 4px 6px;[\s\S]*?resize: none;/u,
    );
  });
});
