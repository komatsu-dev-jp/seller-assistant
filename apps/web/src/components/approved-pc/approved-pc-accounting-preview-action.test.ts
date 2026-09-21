import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const componentRoot = resolve(process.cwd(), "apps/web/src/components");
const source = readFileSync(
  resolve(componentRoot, "approved-pc/approved-pc-late-screens.tsx"),
  "utf8",
);
const css = readFileSync(
  resolve(componentRoot, "approved-pc/approved-pc-late-screens.module.css"),
  "utf8",
);
const page = readFileSync(resolve(componentRoot, "../app/accounting/page.tsx"), "utf8");
const livePicker = readFileSync(resolve(componentRoot, "accounting-page-workspace.tsx"), "utf8");
const sessionGuard = readFileSync(resolve(componentRoot, "../lib/server-session.ts"), "utf8");
const loginForm = readFileSync(resolve(componentRoot, "login-form.tsx"), "utf8");
const factsSource = source.slice(
  source.indexOf("function Facts()"),
  source.indexOf("function BasicAccounting()"),
);
const profileSource = source.slice(
  source.indexOf("function BasicAccounting()"),
  source.indexOf("function Mapping()"),
);
const mappingSource = source.slice(
  source.indexOf("function Mapping()"),
  source.indexOf("function FileHistory()"),
);
const fileSource = source.slice(
  source.indexOf("function FileHistory()"),
  source.indexOf("function Settings()"),
);

describe("approved PC accounting preview to live-route boundary", () => {
  it("labels PC45 fixed facts as fictional and separates preview from live data", () => {
    expect(factsSource).toContain("承認デザインの架空データ例です");
    expect(factsSource).toContain('accountingRoute("format")');
    expect(factsSource).toContain("実データを確認・更新する");
    expect(factsSource).toContain("href={go(46)}");
    expect(factsSource).not.toContain("<Btn n={44}");
    expect(factsSource).not.toContain("<Btn n={45}");
  });

  it("opens PC46 changes and save confirmation in the real profile without fake saving", () => {
    expect(profileSource).toContain("架空設定の表示見本です");
    expect(profileSource).toContain("この見本では保存せず");
    expect(profileSource).toContain('href={accountingRoute("profile")}');
    expect(profileSource).toContain("会計項目の候補の見本を見る");
    expect(profileSource).toContain("href={go(47)}");
    expect(profileSource).not.toContain("href={go(46)}");
    expect(profileSource).not.toContain("<Btn n={46}");
  });

  it("keeps PC47 example counts consistent and routes real approvals to mappings", () => {
    expect(mappingSource).toContain("承認デザインの架空候補です");
    expect(mappingSource).toContain("採用可能 3　　要確認 1　　ブロック 1");
    expect(mappingSource).toContain('href={accountingRoute("mappings")}');
    expect(mappingSource).toContain("ファイル作成画面の見本を見る");
    expect(mappingSource).toContain("href={go(48)}");
    expect(mappingSource).not.toContain("href={go(47)}");
    expect(mappingSource).not.toContain("<Btn n={47}");
  });

  it("does not present PC48 fictional creation, import, or history as live success", () => {
    expect(fileSource).toContain("この画面では実ファイルを作成しません");
    expect(fileSource).toContain("作成チェックリスト（表示例）");
    expect(fileSource).toContain("手動インポート結果（表示例）");
    expect(fileSource).toContain("成功例");
    expect(fileSource).toContain("差し替え・キャンセル履歴（表示例）");
    expect(fileSource).toContain('accountingRoute("export", "money_forward_journal_v1")');
    expect(fileSource).toContain('accountingRoute("export", "generic_journal_v1")');
    expect(fileSource).toContain('accountingRoute("preview", liveFormat)');
    expect(fileSource).toContain('accountingRoute("import", liveFormat)');
    expect(fileSource).toContain('accountingRoute("history", liveFormat)');
    expect(fileSource).not.toContain("href={go(48)}");
    expect(fileSource).not.toContain('role="button"');
    expect(fileSource).toContain('aria-pressed={format === "moneyForward"}');
    expect(fileSource).toContain('aria-pressed={format === "csv"}');
    expect(css).toContain("grid-template-rows: 52px 82px");
  });

  it("lets approved links open the requested live accounting stage and format", () => {
    for (const stage of [
      "format",
      "profile",
      "mappings",
      "export",
      "preview",
      "import",
      "history",
    ]) {
      expect(page).toContain(`"${stage}"`);
    }
    expect(page).toContain("await searchParams");
    expect(page).toContain("initialStage={initialStage}");
    expect(page).toContain("initialFormat={initialFormat}");
    expect(page).toContain('requirePageSession(["owner", "accounting"], returnTo)');
    expect(livePicker).toContain("useState<AccountingMobileStage>(initialStage)");
    expect(livePicker).toContain("useState<AccountingPageFormat>(initialFormat)");
    expect(sessionGuard.indexOf("await cookies()")).toBeLessThan(
      sessionGuard.indexOf("process.env.API_INTERNAL_ORIGIN"),
    );
    expect(sessionGuard).toContain("safeInternalReturnPath(returnTo)");
    expect(sessionGuard).toContain("encodeURIComponent(safeReturnTo)");
    expect(loginForm).toContain("loginDestination(context.role, requestedReturnTo)");
  });
});
