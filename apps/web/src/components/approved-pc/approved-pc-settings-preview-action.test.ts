import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const componentRoot = resolve(process.cwd(), "apps/web/src/components");
const source = readFileSync(
  resolve(componentRoot, "approved-pc/approved-pc-late-screens.tsx"),
  "utf8",
);
const settingsSource = source.slice(
  source.indexOf("function Settings()"),
  source.indexOf("function Storage()"),
);
const storageSource = source.slice(
  source.indexOf("function Storage()"),
  source.indexOf("function Backup()"),
);
const backupSource = source.slice(
  source.indexOf("function Backup()"),
  source.indexOf("function Connections()"),
);
const connectionsSource = source.slice(
  source.indexOf("function Connections()"),
  source.indexOf("export function ApprovedPcLateScreens"),
);

describe("approved PC settings preview boundaries", () => {
  it("does not save the PC49 fictional rates or lose edits behind a fake success route", () => {
    expect(settingsSource).toContain("架空設定の表示見本です");
    expect(settingsSource).toContain("この画面では実際の料金を変更・保存しません");
    expect(settingsSource).toContain("手数料率（%）");
    expect(settingsSource).toContain("最低手数料（円）");
    expect(settingsSource).toContain("変更保存は準備中");
    expect(settingsSource).toContain("写真保存先の見本へ");
    expect(settingsSource).toContain("readOnly");
    expect(settingsSource).not.toContain("<Btn n={49}");
    expect(settingsSource).not.toMatch(/fetch\(|requestJson\(|XMLHttpRequest/u);
  });

  it("keeps PC50 destination changes local and disables unsupported folder access", () => {
    expect(storageSource).toContain("架空の保存先見本です");
    expect(storageSource).toContain("選択はこの画面内だけ");
    expect(storageSource).toContain("保存先機能は準備中");
    expect(storageSource).toContain("書き出し画面の見本へ");
    expect(storageSource).not.toContain("href={go(50)}");
    expect(storageSource).not.toMatch(/showDirectoryPicker|webkitdirectory|type="file"/u);
  });

  it("keeps PC51 format selection honest without creating a fictional file", () => {
    expect(backupSource).toContain("実ファイルは作成しません");
    expect(backupSource).toContain("実バックアップは作成しません");
    expect(backupSource).toContain('aria-pressed={exportFormat === "csv"}');
    expect(backupSource).toContain('aria-pressed={exportFormat === "json"}');
    expect(backupSource).toContain('aria-pressed={backupFormat === "csv"}');
    expect(backupSource).toContain('aria-pressed={backupFormat === "json"}');
    expect(backupSource).toContain("{exportFormat.toUpperCase()}で保存は準備中");
    expect(backupSource).toContain("{backupFormat.toUpperCase()}バックアップは準備中");
    expect(backupSource).toContain("履歴（表示例）");
    expect(backupSource).toContain("完了例");
    expect(backupSource).toContain("外部連携状態の見本へ");
    expect(backupSource).not.toContain("href={go(51)}");
  });

  it("does not claim PC52 checked the real connection or billing state", () => {
    expect(connectionsSource).toContain("接続状態の表示例：外部連携なし・無料");
    expect(connectionsSource).toContain("実際の接続・料金を確認した結果ではありません");
    expect(connectionsSource).toContain("未接続（表示例）");
    expect(connectionsSource).toContain("許可なく外部へ接続しません");
    expect(connectionsSource).not.toMatch(/fetch\(|requestJson\(|XMLHttpRequest/u);
  });

  it("uses an SVG shield instead of clipping a rectangular border", () => {
    expect(source).toContain("function OutlineShield");
    expect(storageSource).toContain("<OutlineShield />");
    expect(connectionsSource).toContain("<OutlineShield />");
  });
});
