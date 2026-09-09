import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("./", import.meta.url);
const read = (name: string) => readFileSync(new URL(name, root), "utf8");

describe("approved live navigation, home, and team presentation", () => {
  it("keeps the five fixed mobile destinations in their approved order", () => {
    const sidebar = read("app-sidebar.tsx");

    expect(sidebar).toMatch(
      /const mobileLinks = \[[\s\S]*?"ホーム"[\s\S]*?"作業"[\s\S]*?"商品"[\s\S]*?"在庫"[\s\S]*?"会計"[\s\S]*?\]/u,
    );
    expect(sidebar).toContain('aria-label="モバイルナビゲーション"');
    expect(sidebar).toContain('["/mobile", "作業", "mobile", "✓"]');
  });

  it("keeps the PC workbench navigation and makes unavailable settings explicit", () => {
    const sidebar = read("app-sidebar.tsx");

    for (const label of [
      "ホーム",
      "作業",
      "仕入れ",
      "商品",
      "注文・発送",
      "在庫",
      "会計",
      "メンバー",
    ]) {
      expect(sidebar).toContain(label);
    }
    expect(sidebar).toContain("設定");
    expect(sidebar).toContain("P0対象外");
    expect(sidebar).toContain('aria-disabled="true"');
  });

  it("uses real home and team data while showing loading, confirmation, and safe boundaries", () => {
    const home = read("home-workspace.tsx");
    const team = read("team-workspace.tsx");

    expect(home).toContain("/owner-pulse");
    expect(home).toContain("今日の確認");
    expect(home).toContain('"作業一覧"');
    expect(home).toContain('"送信待ち"');
    expect(home).toContain("loadCaptureUploads");
    expect(home).toContain("OfflineSyncStatus");
    expect(home).toContain("工程別件数");
    expect(home).toContain("再読み込み");
    expect(home).toContain("運用分析の参考値です");
    expect(team).toContain("/team/members");
    expect(team).toContain("/team/assignments");
    expect(team).toContain("3ステップで準備を確認");
    expect(team).toContain("isActiveAssignment");
    expect(team).toContain("開始待ち");
    expect(team).toContain("期限終了");
    expect(team).toContain("PC37 / メンバー");
    expect(team).toContain("PC38 / 担当");
    expect(team).toContain("PC39 / 変更を確認");
    expect(team).toContain("PC40 / 変更履歴");
    expect(team).toContain("解除を申請");
    expect(team).toContain("別の管理者が確認してください");
    expect(team).not.toContain("/revoke");
    expect(team).not.toContain("今すぐ解除");
  });

  it("keeps retry controls on the first data load for home, team, and accounting", () => {
    const home = read("home-workspace.tsx");
    const team = read("team-workspace.tsx");
    const accounting = read("accounting-page-workspace.tsx");

    for (const source of [home, team, accounting]) {
      expect(source).toContain('role="alert"');
      expect(source).toMatch(/reload|refresh/u);
      expect(source).toContain("再読み込み");
    }
    expect(accounting).toContain('setLoadError("")');
  });

  it("keeps change review append-only and exports only safe returned fields", () => {
    const team = read("team-workspace.tsx");

    expect(team).toContain("team/change-requests");
    expect(team).toContain("expectedAssignmentVersion: assignment.assignmentVersion");
    expect(team).not.toContain("expectedStartsAt");
    expect(team).not.toContain("expectedExpiresAt");
    expect(team).toContain("expectedRevision");
    expect(team).toContain("承認");
    expect(team).toContain("差し戻す");
    expect(team).toContain("却下");
    expect(team).toContain("コメントを追記");
    expect(team).toContain("履歴をCSVで保存");
    expect(team).toContain("URL.revokeObjectURL");
    expect(team).toContain("targetLabel");
    expect(team).not.toMatch(/team\/change-requests[^`]*delete/u);
  });

  it("uses safe-area CSS and does not add a fake device status display", () => {
    const css = read("navigation-home-team.module.css");
    const source = [
      read("app-sidebar.tsx"),
      read("home-workspace.tsx"),
      read("team-workspace.tsx"),
    ].join("\n");

    expect(css).toContain("env(safe-area-inset-bottom)");
    expect(css).toContain("min-height: 44px");
    expect(css).toContain(".sidebar .mobileNav");
    expect(css).toContain("grid-template-columns: repeat(5, minmax(0, 1fr))");
    expect(source).not.toMatch(/9:41|Dynamic Island|IOSStatusBar|電池残量/u);
  });
});
