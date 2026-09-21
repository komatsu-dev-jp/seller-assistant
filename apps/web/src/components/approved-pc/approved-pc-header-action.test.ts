import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (name: string) =>
  readFileSync(resolve(process.cwd(), `apps/web/src/components/approved-pc/${name}`), "utf8");

const screenSources = [
  read("approved-pc-early-screens.tsx"),
  read("approved-pc-middle-screens.tsx"),
  read("approved-pc-late-screens.tsx"),
];

describe("approved PC common header actions", () => {
  it.each(screenSources)("uses real buttons for common header actions", (source) => {
    expect(source).toContain('data-pc-header-action="notifications"');
    expect(source).toContain('data-pc-header-action="help"');
    expect(source).toContain('data-pc-header-action="account"');
    expect(source).not.toMatch(/<span[^>]+aria-label="(?:通知|ヘルプ)"/u);
  });

  it("connects every compact sidebar control to the shared menu", () => {
    for (const source of screenSources) {
      expect(source).toContain('data-pc-header-action="sidebar"');
      expect(source).toContain('aria-controls="approved-pc-header-panel"');
    }
  });

  it("keeps the order and shipping worker menu operable", () => {
    const middleSource = screenSources[1] ?? "";
    expect(middleSource).toContain('data-pc-header-action="work"');
    expect(middleSource).toContain("作業者メニュー　⌄");
  });

  it("keeps the preview account control and gallery pagination inside the 768px board", () => {
    const middleSource = screenSources[1] ?? "";
    const middleStyles = read("approved-pc-middle-screens.module.css");
    expect(middleSource).toContain("styles.previewTopbar");
    expect(middleStyles).toContain(".previewTopbar .topbarTitle");
    expect(middleStyles).toMatch(/\.screen25 \.galleryPagination \{\s+margin-top: 12px;/u);
  });
});
