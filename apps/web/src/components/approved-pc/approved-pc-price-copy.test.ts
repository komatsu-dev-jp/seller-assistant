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
const priceSource = source.slice(
  source.indexOf("function Price()"),
  source.indexOf("function Reply()"),
);

describe("approved PC price candidate copy", () => {
  it("copies only the price entered by a person", () => {
    expect(priceSource).toContain('aria-label="コピーする新価格"');
    expect(priceSource).toContain("formatPriceCandidate(customPrice)");
    expect(priceSource).toContain("navigator.clipboard.writeText(text)");
    expect(priceSource).toContain("onClick={() => void copyCustomPrice()}");
    expect(priceSource).not.toContain("<Button n={27}>この候補をコピー</Button>");
  });

  it("does not add automatic price changes, persistence, or external requests", () => {
    expect(priceSource).toContain("新価格を1円以上の数字で入力してください。");
    expect(priceSource).toContain("customPriceInput.current?.focus()");
    expect(priceSource).toContain("公式ページで本人が確認して反映してください。");
    expect(priceSource).not.toMatch(/fetch\(|requestJson\(|XMLHttpRequest|localStorage/u);
  });

  it("keeps the status and copy button in normal flow", () => {
    expect(styles).toMatch(/\.priceFooter\s*\{[^}]*flex-wrap:\s*wrap;/su);
    expect(styles).toContain(".priceCopyNotice");
    expect(styles).not.toMatch(/\.priceCopyNotice\s*\{[^}]*position:\s*fixed;/su);
  });
});
