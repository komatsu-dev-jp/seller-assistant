import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "apps/web/src/components/approved-pc/pc-canvas.tsx"),
  "utf8",
);

describe("PcCanvas", () => {
  it("resets retained focus scrolling between screens without hiding short-window footers", () => {
    expect(source).toContain('overflowX: "hidden"');
    expect(source).toContain('overflowY: "auto"');
    expect(source).toContain("}, [className]);");
    expect(source).toContain("viewportRef.current.scrollTop = 0");
    expect(source).toContain('transformOrigin: "top left"');
  });
});
