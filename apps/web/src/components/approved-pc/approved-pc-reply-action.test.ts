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
const replySource = source.slice(
  source.indexOf("function Reply()"),
  source.indexOf("function Order()"),
);

describe("approved PC reply action", () => {
  it("edits and copies only after an explicit user action", () => {
    expect(source).toContain(
      'import { copyResearchText } from "../../lib/product-research-handoff"',
    );
    expect(replySource).toContain("const [drafts, setDrafts] = useState");
    expect(replySource).toContain("navigator.clipboard.writeText(text)");
    expect(replySource).toContain("onChange={(event) => {");
    expect(replySource).toContain("onClick={() => void copyTemplate(index)}");
    expect(replySource).toContain("onClick={() => void copyTemplate(selectedTemplate)}");
    expect(replySource).not.toContain("<a href={to(28)}>コピー</a>");
  });

  it("opens only the public official page and explains copy failure", () => {
    expect(replySource).toContain('href="https://jp.mercari.com/"');
    expect(replySource).toContain('target="_blank"');
    expect(replySource).toContain('rel="noopener noreferrer"');
    expect(replySource).toContain("文章欄を選択して手動でコピーしてください。");
    expect(replySource).not.toMatch(/fetch\(|requestJson\(|XMLHttpRequest/u);
  });

  it("keeps the approved compact layout while exposing focus and disabled states", () => {
    expect(styles).toMatch(/\.replyTemplateText:focus\s*\{[^}]*outline:/su);
    expect(styles).toMatch(/\.replyCopyButton:disabled,[\s\S]*?opacity:\s*0\.5;/u);
    expect(styles).toContain('.reply article[data-selected="true"]');
    expect(styles).toContain(".replyFooter");
    expect(styles).toContain(".replyCopyNotice");
    expect(styles).not.toMatch(/\.replyCopyNotice\s*\{[^}]*position:\s*fixed/su);
    expect(styles).not.toMatch(/\.screen28 \.reply textarea\s*\{/u);
    expect(styles.match(/\.screen28 \.reply > \.card:last-child textarea\s*\{/gu)).toHaveLength(2);
  });
});
