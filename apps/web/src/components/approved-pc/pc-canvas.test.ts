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

  it("opens honest common header panels without changing external or business data", () => {
    expect(source).toContain(
      'type HeaderPanel = "sidebar" | "work" | "notifications" | "help" | "account"',
    );
    expect(source).toContain("data-pc-header-panel");
    expect(source).toContain("data-pc-header-action");
    expect(source).toContain("この確認版では新しい通知を取得しません");
    expect(source).toContain("この画面だけでは保存・公開・外部送信を行いません。");
    expect(source).toContain("この確認版では、アカウントや権限を変更しません。");
    expect(source).toContain('if (event.key === "Escape") closeHeaderPanel(true)');
  });

  it("moves keyboard focus into the panel and restores its opener when closed", () => {
    expect(source).toContain("autoFocus");
    expect(source).toContain("key={headerPanel}");
    expect(source).toContain("headerTriggerRef.current = target");
    expect(source).toContain("opener?.isConnected");
    expect(source).toContain("window.requestAnimationFrame(() => opener.focus())");
    expect(source).toContain("onClose={() => closeHeaderPanel(true)}");
    expect(source).toContain("closeHeaderPanel(false)");
  });
});
