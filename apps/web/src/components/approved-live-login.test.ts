import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "apps/web/src/components");
const source = readFileSync(resolve(root, "approved-live-login.tsx"), "utf8");
const styles = readFileSync(resolve(root, "approved-live-login.module.css"), "utf8");
const approvedMobileSource = readFileSync(
  resolve(root, "approved-mobile/approved-mobile-demo.tsx"),
  "utf8",
);
const shippingMobileSource = readFileSync(
  resolve(root, "shipping-approved-live-layout-v3.tsx"),
  "utf8",
);
const mobileStyles = readFileSync(
  resolve(root, "approved-mobile/approved-mobile-demo.module.css"),
  "utf8",
);

describe("ApprovedLiveLogin", () => {
  it("keeps the approved Japanese copy and both responsive shells", () => {
    for (const copy of [
      "メールアドレス",
      "パスワード",
      "メールアドレスを入力",
      "パスワードを入力",
      "ログイン",
      "安全に作業を始めます",
      "PC内の業務データへ安全に入ります",
      "商品名・作業・注文を検索",
    ]) {
      expect(source).toContain(copy);
    }
    expect(source).toContain('data-approved-live-login="v2"');
    expect(source).toContain("className={liveStyles.mobile}");
    expect(source).toContain("className={liveStyles.pc}");
    expect(source).toContain("approved-mobile-demo.module.css");
    expect(source).toContain("approved-pc-early-screens.module.css");
    expect(source).toContain("<PcCanvas");
  });

  it("wires controlled inputs, submit, busy state, and errors", () => {
    expect(source).toContain("onEmailChange");
    expect(source).toContain("onPasswordChange");
    expect(source).toContain("onSubmit");
    expect(source).toContain('type="submit"');
    expect(source).toContain('role="alert"');
    expect(source).toContain("disabled={props.busy}");
    expect(source).toContain("event.preventDefault()");
    expect(source).toContain("value={props.email}");
    expect(source).toContain("value={props.password}");
    expect(source).toContain('action="/v1/session/login"');
    expect(source).toContain('method="post"');
  });

  it("does not add external communication or remote images", () => {
    expect(source).not.toMatch(/fetch\s*\(/u);
    expect(source).not.toMatch(/https?:\/\//u);
    expect(source).toContain("/approved-assets/pc-fidelity/login/logo-blue-garment.png");
    expect(source).not.toMatch(/src=["']https?:\/\//u);
    expect(styles).not.toMatch(/url\s*\(/u);
  });

  it("does not render a duplicate iOS status bar in any mobile source", () => {
    for (const mobileSource of [source, approvedMobileSource, shippingMobileSource]) {
      expect(mobileSource).not.toContain("IOSStatusBar");
      expect(mobileSource).not.toContain("9:41");
      expect(mobileSource).not.toContain("dynamicIsland");
      expect(mobileSource).not.toContain("statusBar");
    }
    expect(mobileStyles).toContain("env(safe-area-inset-top)");
    expect(mobileStyles).toMatch(
      /@media\s*\(max-width:\s*620px\)\s*\{(?:(?!@media\s*\(max-width:\s*620px\)).)*?\.header\s*\{(?=[^}]*min-height:\s*56px;)(?=[^}]*padding-top:\s*max\(8px,\s*env\(safe-area-inset-top\)\);)(?=[^}]*flex:\s*none;)[^}]*\}/su,
    );
    expect(mobileStyles).toMatch(
      /@media\s*\(max-width:\s*620px\)\s*\{(?:(?!@media\s*\(max-width:\s*620px\)).)*?\.scrollArea\s*\{(?=[^}]*flex:\s*1 1 auto;)(?=[^}]*height:\s*auto;)(?=[^}]*min-height:\s*0;)[^}]*\}/su,
    );
    expect(mobileStyles).not.toContain("calc(100dvh - 29px)");
    expect(mobileStyles).toMatch(
      /\.phoneShell:has\(\.loginContent\) \.scrollArea\s*\{[^}]*env\(safe-area-inset-top\)[^}]*env\(safe-area-inset-bottom\)/su,
    );
    expect(mobileStyles).not.toMatch(
      /\.(?:statusBar|dynamicIsland|statusBarRight|signalIcon|wifiIcon|batteryIcon)\b/u,
    );
  });

  it("keeps the mobile interaction and overflow/focus guards", () => {
    expect(styles).toContain(".page .passwordToggle");
    expect(styles).toContain("min-height: 44px");
    expect(styles).not.toMatch(/\.buttonReset\s*\{[^}]*min-height/su);
    expect(styles).toContain(":focus-visible");
    expect(styles).toContain("box-shadow: 0 0 0 5px #0d2b55");
    expect(styles).toContain("overflow-x: hidden");
    expect(styles).toContain("display: none");
    expect(styles).toContain("@media (min-width: 768px)");
    expect(source).toContain('aria-hidden="true" inert');
    expect(source).toContain("className={liveStyles.srOnly}>ログイン</h1>");
  });
});
