import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "apps/web/src");
const source = readFileSync(resolve(root, "components/workflow-live-layout.tsx"), "utf8");
const workspace = readFileSync(resolve(root, "components/p0-workspace.tsx"), "utf8");
const css = readFileSync(resolve(root, "components/workflow-live-layout.module.css"), "utf8");
const route = readFileSync(resolve(root, "app/workflow/page.tsx"), "utf8");

describe("live workflow presentation contract", () => {
  it("retains page authorization and uses a dedicated shell", () => {
    expect(route).toContain('requirePageSession(["owner", "inventory_manager"])');
    expect(route).not.toContain("AppSidebar");
    expect(workspace).toContain("<WorkflowLiveLayout>");
    expect(source).toContain('aria-label="共通フッター"');
    const navigation = source.slice(
      source.indexOf("const navigation"),
      source.indexOf("export function"),
    );
    expect(navigation.match(/"ホーム"|"作業"|"商品"|"在庫"|"会計"/gu)).toEqual([
      '"ホーム"',
      '"作業"',
      '"商品"',
      '"在庫"',
      '"会計"',
    ]);
  });
  it("separates photo and measurement purposes with reversible client state", () => {
    for (const value of [
      "撮る写真一覧",
      "撮影ガイド",
      "写真確認",
      "採寸の準備",
      "1か所ずつ採寸",
      "採寸まとめ",
      "‹ 戻る",
    ])
      expect(source).toContain(value);
    expect(source).toContain("data-workflow-screen={step}");
    expect(source).toContain("setMeasurementIndex(measurementIndex - 1)");
    expect(workspace).toContain("data-workflow-screen={`purchase-${purchaseStep}`}");
    expect(workspace).toContain('hidden={listingStep !== "research"}');
  });
  it("preserves save and human confirmation boundaries", () => {
    for (const boundary of [
      "prepareCaptureUpload",
      "markCaptureUploaded",
      "clearCaptureUploads",
      "confirm_capture",
      "humanConfirmed: true",
      "ensurePilotEventsSynced",
      "completed.capture",
      "completed.listing",
    ])
      expect(workspace).toContain(boundary);
    expect(source).toContain("disabled={disabled || completed || !canSave}");
    expect(source).toContain("最後のまとめ画面で保存します");
    expect(source).not.toMatch(/fetch\s*\(/u);
    expect(source).not.toMatch(/https?:\/\//u);
  });
  it("keeps preview files private and releases object URLs", () => {
    expect(source).toContain("URL.createObjectURL(file)");
    expect(source).toContain("URL.revokeObjectURL(url)");
    expect(source).toContain('accept="image/jpeg,image/png"');
    expect(source).toContain("掲載用の正面写真は流用しません");
    expect(source).toContain("採寸の根拠写真");
    expect(source).toContain("項目の確認待ち");
    expect(source).not.toContain("shot_key");
  });
  it("renders loading, empty, failure and retry in the same layout", () => {
    expect(workspace).toContain("商品を読み込んでいます");
    expect(workspace).toContain("まだ商品がありません");
    expect(workspace).toContain('role="alert"');
    expect(workspace).toContain("もう一度読み込む");
    expect(workspace).toContain("field.reportValidity()");
  });
  it("has scoped responsive geometry and safe touch targets", () => {
    expect(css).toContain("env(safe-area-inset-top)");
    expect(css).toContain("env(safe-area-inset-bottom)");
    expect(css).toContain("min-height: 44px");
    expect(css).toContain(":focus-visible");
    expect(css).toContain("grid-template-columns: repeat(5, minmax(0, 1fr))");
    expect(css).toContain(".footer a > span");
    expect(css).not.toContain(".footer span {");
    expect(css).toContain(".content [hidden]");
    expect(source).not.toContain("9:41");
  });
  it("blocks photographs until a real location has been refreshed", () => {
    expect(workspace).toContain('stage === "capture" && item && !item.locationCode');
    expect(workspace).toContain('stage === "capture" && item && item.locationCode');
    expect(workspace).toContain("data-workflow-screen={`putaway-${putawayStep}`}");
    expect(workspace).toContain('href="/inventory"');
    expect(workspace).toContain('href="/mobile/scan"');
    expect(workspace).toContain("格納後に更新する");
    expect(workspace).toContain("void run(refreshItems)");
    expect(source).toContain('data-implementation-state="WAITING_HUMAN"');
    expect(source).not.toContain('photos: "M20 M24 PC17"');
  });
  it("uses the checked clipboard helper and explicitly scopes edited descriptions", () => {
    expect(workspace).toContain("copyBeforeWorkflowHandoff(description, navigator.clipboard");
    expect(workspace).not.toContain("navigator.clipboard?.writeText");
    expect(workspace).toContain("setDescriptionDraft(event.target.value)");
    expect(workspace).toContain("データベースの商品説明は変更しません");
    expect(workspace).toContain('rel="noopener noreferrer"');
    expect(workspace).toContain('href="https://jp.mercari.com/sell"');
    expect(workspace).toContain("メルカリ公式の出品画面を開く");
    expect(workspace).toContain("掲載写真を端末に保存");
    expect(workspace).toContain("product-photos");
    expect(workspace).toContain("PrivateListingPhotoGallery");
    expect(workspace).toContain("URL.revokeObjectURL");
    expect(workspace).toContain('cache: "no-store"');
    expect(workspace).toContain('pilotRun?.state === "active"');
    expect(workspace).toContain("計測中は出品画面を開けません");
  });
  it("requires private receipt and per-measurement evidence before advancing", () => {
    expect(workspace).toContain("prepareReceiptEvidenceUpload");
    expect(workspace).toContain("receiptEvidenceAssetId: receipt.assetId");
    expect(workspace).toContain("receipt.purchaseIdempotencyKey");
    expect(workspace).toContain("prepareMeasurementEvidenceUpload");
    expect(workspace).toContain("role=measurement_evidence");
    expect(workspace).not.toContain("evidenceAssetId: assetIds[0]");
    expect(source).toContain("measurementEvidence");
    expect(source).toContain("掲載用の正面写真は流用しません");
    expect(source).toContain("写真はこの画面を開いている間だけ端末内に保持します");
    expect(source).toContain("画面を読み直した場合は、もう一度選んでください。");
    expect(source).toContain("前回:");
  });
});
