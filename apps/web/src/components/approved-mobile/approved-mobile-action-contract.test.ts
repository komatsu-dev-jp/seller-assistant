import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "apps/web/src/components/approved-mobile/approved-mobile-demo.tsx"),
  "utf8",
);
const styles = readFileSync(
  resolve(process.cwd(), "apps/web/src/components/approved-mobile/approved-mobile-demo.module.css"),
  "utf8",
);

describe("approved mobile preview actions", () => {
  it("does not leave enabled raw buttons without a click action", () => {
    const rawButtons = [...source.matchAll(/<button\b[\s\S]*?>/gu)].map(([tag]) => tag);
    const inertButtons = rawButtons.filter(
      (tag) => !/\bonClick=/u.test(tag) && !/\bdisabled\b/u.test(tag),
    );
    expect(inertButtons).toEqual([]);
  });

  it("explains preview-only actions without external or save side effects", () => {
    expect(source).toContain("function PreviewActionButton");
    expect(source).toContain("この機能は準備中です。保存や外部送信は行いません。");
    expect(source).toContain('liveHref="/workflow"');
    expect(source).toContain('liveHref="/shipping"');
    expect(source).toContain("公式URLが未設定のため、この画面から外部サイトを勝手に開きません。");
  });

  it("makes mobile help, question, and notification controls operable", () => {
    expect(source).toContain('ariaLabel="通知を開く"');
    expect(source).toContain('ariaLabel="この画面のヘルプを開く"');
    expect(source).toContain('ariaLabel="この画面について開く"');
    expect(source).toContain("notificationButton");
    expect(source).not.toContain("<span className={styles.headerHelp}>ヘルプ</span>");
    expect(source).not.toContain("<span className={styles.headerQuestion}>?</span>");
    expect(styles).toContain(".headerIconAction");
  });

  it("keeps keyboard focus inside the modal guidance and isolates its backdrop styles", () => {
    expect(source).toContain('aria-modal="true"');
    expect(source).toContain("createPortal(");
    expect(source).toContain("document.body");
    expect(source).toContain('if (event.key !== "Tab") return');
    expect(source).toContain("panelRef.current?.querySelectorAll<HTMLElement>");
    expect(source).toContain("event.preventDefault()");
    expect(styles).toContain("button.previewActionBackdrop.previewActionBackdrop");
  });

  it("copies only the displayed price candidate and reports failure honestly", () => {
    expect(source).toContain("navigator.clipboard.writeText(copyText)");
    expect(source).toContain("価格候補: ¥6,120");
    expect(source).toContain("変更内容をコピーしました");
    expect(source).toContain(
      "コピーできませんでした。端末の許可を確認して、もう一度お試しください",
    );
  });
});
