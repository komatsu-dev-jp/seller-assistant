import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("./", import.meta.url);
const workspace = readFileSync(new URL("accounting-workspace.tsx", root), "utf8");
const page = readFileSync(new URL("../app/accounting/page.tsx", root), "utf8");
const picker = readFileSync(new URL("accounting-page-workspace.tsx", root), "utf8");
const css = readFileSync(new URL("accounting-live-layout.module.css", root), "utf8");
const sidebar = readFileSync(new URL("app-sidebar.tsx", root), "utf8");
const navigationCss = readFileSync(new URL("navigation-home-team.module.css", root), "utf8");

describe("approved live accounting presentation contract", () => {
  it("keeps seven purposeful stages and the existing workspace mounted during navigation", () => {
    for (const stage of [
      "format",
      "profile",
      "mappings",
      "export",
      "preview",
      "import",
      "history",
    ]) {
      expect(workspace).toContain(`${stage}:`);
    }
    expect(picker).toContain('key={`${selectedOrderId ?? "none"}:${format}`}');
    expect(picker).not.toContain("key={mobileStage}");
    expect(css).toContain(".board :global(.accountingMobilePanel):not(:global(.isActive))");
    expect(css).toContain('[data-mobile-stage="history"] :global(.accountingExportPrimary)');
  });

  it("retains human confirmation and real file/import operations, with progression only after success", () => {
    for (const operation of [
      "saveProfile",
      "saveCandidateMappings",
      "replaceMappingRule",
      "loadFinancials",
      "loadPreview",
      "downloadExport",
      "confirmImport",
    ]) {
      expect(workspace).toContain(operation);
    }
    expect(workspace).toContain("checked={previewConfirmed}");
    expect(workspace).toContain("!previewConfirmed || preview?.batchId !== batch.batchId");
    expect(workspace).toContain("checked={mappingConfirmed}");
    expect(workspace).toContain("checked={supersedeConfirmed}");
    expect(workspace).toContain("isAccountingImportActionDisabled(batch, busy)");
    expect(workspace).toContain('onMobileStageChange?.("preview")');
    expect(workspace).toContain('onMobileStageChange?.("import")');
    expect(workspace).toContain('onMobileStageChange?.("history")');
    expect(workspace).not.toMatch(/https?:\/\//u);
  });

  it("provides the approved five mobile destinations and device safe areas without fake status UI", () => {
    expect(page).toContain('<AppSidebar current="accounting" />');
    expect(sidebar).toMatch(/"ホーム"[\s\S]*"作業"[\s\S]*"商品"[\s\S]*"在庫"[\s\S]*"会計"/u);
    expect(navigationCss).toContain("grid-template-columns: repeat(5, minmax(0, 1fr))");
    expect(css).toContain("env(safe-area-inset-top)");
    expect(css).toContain("env(safe-area-inset-bottom)");
    expect(css).toContain("min-height: 44px");
    expect(css).toContain("margin-inline: -12px");
    expect(css).toContain("padding-inline: 12px");
    expect(page + workspace).not.toMatch(/9:41|Dynamic Island|IOSStatusBar/u);
  });

  it("replaces legacy compressed grids and preserves unknown facts instead of displaying zero", () => {
    expect(css).toContain("grid-template-areas: none");
    expect(css).toContain(".board :global(.accountingFieldGrid)");
    expect(css).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(css).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(css).toContain("font-size: 16px");
    expect(workspace).toContain('financial.missingInputs.includes("orderPrice")');
    expect(workspace).toContain('financial.missingInputs.includes("costOfGoods")');
    expect(workspace).toContain("返金（個別金額はこの画面では未取得）");
  });
});
