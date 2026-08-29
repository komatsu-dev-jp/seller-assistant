import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { StocktakeResponse } from "@resale/contracts";

import manifest from "./app/manifest";
import { selectFocusedStocktake } from "./lib/stocktake-focus";

describe("zero-cost PWA contract", () => {
  it("binds the local web server to this PC only", () => {
    const packageManifest = JSON.parse(readFileSync(resolve("apps/web/package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(packageManifest.scripts?.dev).toContain("--hostname 127.0.0.1");
    expect(packageManifest.scripts?.start).toContain("--hostname 127.0.0.1");
  });

  it("is installable from the mobile route without a native app store", () => {
    const value = manifest();
    expect(value.display).toBe("standalone");
    expect(value.start_url).toBe("/mobile");
    expect(value.icons?.length).toBeGreaterThan(0);
  });

  it("never puts API responses into the service worker cache", () => {
    const worker = readFileSync(resolve("apps/web/public/sw.js"), "utf8");
    expect(worker).toContain('url.pathname.startsWith("/api/")');
    expect(worker).toContain('url.pathname.startsWith("/v1/")');
    expect(worker).toContain("CLEAR_BUSINESS_CACHE");
  });

  it("allows only the explicit operational proxy paths", () => {
    const proxy = readFileSync(
      resolve("apps/web/src/app/v1/workspaces/[workspaceId]/[[...segments]]/route.ts"),
      "utf8",
    );
    expect(proxy).toContain('segments[0] === "shipping-tasks"');
    expect(proxy).toContain('segments[0] === "pilot-runs"');
    expect(proxy).toContain('segments[1] === "latest"');
    expect(proxy).toContain('segments[2] === "events"');
    expect(proxy).toContain('segments[2] === "external-invalidation"');
    expect(proxy).toContain('segments[0] === "owner-pulse"');
    expect(proxy).toContain('segments[3] === "preview"');
    expect(proxy).toContain('segments[6] === "content"');
    expect(proxy).toContain('["content-disposition", "x-content-type-options"]');
    expect(proxy).toContain("if (value) headers.set(name, value)");
    expect(proxy).toContain('"assignment"');
    expect(proxy).toContain("orderActions.has");
    expect(proxy).toContain("Response.json(payload");
    expect(proxy).not.toContain("payload ??");
  });

  it("registers the worker even when React mounts after the window load event", () => {
    const registration = readFileSync(
      resolve("apps/web/src/components/pwa-registration.tsx"),
      "utf8",
    );
    expect(registration).toContain('document.readyState === "complete"');
    expect(registration).toContain('register("/sw.js"');
  });

  it("clears offline data only after server-side logout succeeds", () => {
    const logout = readFileSync(resolve("apps/web/src/components/logout-button.tsx"), "utf8");
    const requestIndex = logout.indexOf('fetch("/v1/session/logout"');
    const statusIndex = logout.indexOf("response.status !== 204");
    const clearIndex = logout.indexOf("await clearOfflineBusinessData()");
    expect(requestIndex).toBeGreaterThan(-1);
    expect(statusIndex).toBeGreaterThan(requestIndex);
    expect(clearIndex).toBeGreaterThan(statusIndex);
    const proxy = readFileSync(resolve("apps/web/src/app/v1/session/logout/route.ts"), "utf8");
    expect(proxy).toContain("API_INTERNAL_ORIGIN");
    expect(proxy).toContain("APP_ORIGIN");
    expect(proxy).toContain('"sec-fetch-site": "same-origin"');
    expect(proxy).toContain("sessionと端末データは変更していません");
    expect(proxy).not.toMatch(/console\.|localStorage|sessionStorage/u);
  });

  it("keeps login passwords out of URL and browser storage", () => {
    const form = readFileSync(resolve("apps/web/src/components/login-form.tsx"), "utf8");
    const proxy = readFileSync(resolve("apps/web/src/app/v1/session/login/route.ts"), "utf8");
    expect(form).toContain('type="password"');
    expect(form).toContain('fetch("/v1/session/login"');
    expect(form).toContain('action="/v1/session/login"');
    expect(form).toContain('method="post"');
    expect(form).toContain('method: "POST"');
    expect(form).not.toMatch(/localStorage|sessionStorage|indexedDB|URLSearchParams/u);
    expect(proxy).not.toMatch(/console\.|localStorage|sessionStorage/u);
    expect(proxy).toContain('cache: "no-store"');
  });

  it("routes accounting users to their allowed page and exposes keyboard-safe term help", () => {
    const form = readFileSync(resolve("apps/web/src/components/login-form.tsx"), "utf8");
    const accounting = readFileSync(
      resolve("apps/web/src/components/accounting-workspace.tsx"),
      "utf8",
    );
    const sidebar = readFileSync(resolve("apps/web/src/components/app-sidebar.tsx"), "utf8");
    expect(form).toContain('context.role === "accounting"');
    expect(form).toContain('? "/accounting"');
    expect(accounting).toContain('type="button"');
    expect(accounting).toContain('aria-controls="accounting-profile-terms"');
    expect(accounting).toContain("aria-expanded={profileHelpOpen}");
    expect(accounting).toContain("setProfileHelpOpen((open) => !open)");
    expect(accounting).toContain("key={`${name}-${current}`}");
    expect(sidebar).toContain("sidebar-${current}");
    expect(sidebar).toContain("nav-${key}");
  });

  it("keeps Slack-approved Home C priorities and never invents accounting mappings", () => {
    const home = readFileSync(resolve("apps/web/src/components/home-workspace.tsx"), "utf8");
    const accounting = readFileSync(
      resolve("apps/web/src/components/accounting-workspace.tsx"),
      "utf8",
    );
    for (const label of [
      "今日の確認",
      "取引完了売上",
      "商品粗利益",
      "取引貢献利益",
      "期末在庫原価",
      "在庫年齢",
      "仕入先の概要",
    ]) {
      expect(home).toContain(label);
    }
    expect(home.indexOf("今日の確認")).toBeLessThan(home.indexOf("在庫年齢"));
    expect(accounting).toContain('debitAccount: ""');
    expect(accounting).toContain('creditAccount: ""');
    expect(accounting).toContain('debitTaxCategory: ""');
    expect(accounting).toContain('creditTaxCategory: ""');
    expect(accounting).toContain('effectiveFrom: ""');
    expect(accounting).toContain("アプリは勘定科目・税区分を推測しません");
    expect(accounting).toContain('taxBasis: "税込・税抜・税区分"');
    expect(accounting).toContain("const financialReady =");
    expect(accounting).toContain("!financialReady");
    expect(accounting).toContain("原資料の未確認項目を解消してからCSVを作成してください。");
  });

  it("routes every Home approval breakdown to a real, safe review target", () => {
    const home = readFileSync(resolve("apps/web/src/components/home-workspace.tsx"), "utf8");
    const inventory = readFileSync(
      resolve("apps/web/src/components/inventory-workspace.tsx"),
      "utf8",
    );
    const inventoryPage = readFileSync(resolve("apps/web/src/app/inventory/page.tsx"), "utf8");
    const stocktake = readFileSync(
      resolve("apps/web/src/components/stocktake-workspace.tsx"),
      "utf8",
    );
    const stocktakePage = readFileSync(
      resolve("apps/web/src/app/inventory/stocktake/page.tsx"),
      "utf8",
    );
    const stocktakeFocus = readFileSync(resolve("apps/web/src/lib/stocktake-focus.ts"), "utf8");

    for (const [label, href] of [
      ["棚卸差異", "/inventory/stocktake?focus=approval-pending"],
      ["場所写真", "/inventory?focus=pending-location-photo"],
      ["廃棄候補", "/inventory?focus=disposal-candidate"],
      ["出品準備の確認", "/workflow"],
    ]) {
      expect(home).toContain(label);
      expect(home).toContain(href);
    }
    expect(home).toContain("entry.count > 0");
    expect(home).toContain("0件（該当なし）");
    expect(inventory).toContain('initialFocus === "pending-location-photo"');
    expect(inventory).toContain('photo.reviewState === "pending"');
    expect(inventory).toContain('item.inventoryStatus === "disposal_pending"');
    expect(inventory).toContain("未承認の場所写真はありません。通常の在庫画面を表示します。");
    expect(inventoryPage).toContain('return "all"');
    expect(inventoryPage).toContain("initialFocus={initialFocus}");
    expect(stocktakePage).toContain('if (value === "approval-pending") return value');
    expect(stocktakePage).toContain('return "all"');
    expect(stocktakePage).toContain("initialFocus={initialFocus}");
    expect(stocktakePage).toContain("currentIdentityId={session.identityId}");
    expect(stocktakePage).not.toContain("stocktakeId?:");

    expect(stocktake).toContain('import { selectFocusedStocktake } from "../lib/stocktake-focus"');
    const focusedSelector = stocktakeFocus.slice(
      stocktakeFocus.indexOf("export function selectFocusedStocktake"),
      stocktakeFocus.indexOf("function hasUnresolvedDiscrepancies"),
    );
    expect(focusedSelector).toMatch(
      /stocktake\.stocktakeId === selectedStocktakeId[\s\S]*stocktake\.state !== "approved"/u,
    );
    expect(focusedSelector.indexOf("unresolved ??")).toBeLessThan(
      focusedSelector.indexOf("retainedUnapproved ??"),
    );
    expect(focusedSelector.indexOf("retainedUnapproved ??")).toBeLessThan(
      focusedSelector.indexOf("approvedRestoreCandidate ??"),
    );
    expect(focusedSelector.indexOf("approvedRestoreCandidate ??")).toBeLessThan(
      focusedSelector.lastIndexOf('stocktake.state !== "approved"'),
    );
    expect(stocktake).toContain('initialFocus === "approval-pending"');
    expect(stocktakeFocus).toContain('discrepancy.state === "reconfirmation_required"');
    expect(stocktakeFocus).toContain('discrepancy.state === "candidate_confirmed"');
    expect(stocktake).toContain('active.state === "reconciliation"');
    expect(stocktake).toContain('active?.state !== "approved"');
    expect(stocktake).toContain("active.initialCounterId === currentIdentityId");
    expect(stocktake).toContain("active.initialCounterId !== currentIdentityId");
    expect(stocktake).toContain('difference.state === "reconfirmation_required"');
    expect(stocktake).toContain("handoffRequired={");
    expect(stocktake).toContain("別担当者でログインし、証拠写真・商品・場所を再確認してください。");
    expect(stocktake).toContain('difference.state === "resolved"');
    expect(stocktake).toContain('difference.state === "candidate_confirmed"');
    expect(stocktake).toContain('difference.state === "restored"');
    expect(stocktake).toContain(
      "const canApprove = isApprovalActorEligible && hasOnlyApprovalReadyDiscrepancies;",
    );
    expect(stocktake).toContain(
      'const action = discrepancy.state === "candidate_confirmed" ? "restore" : "confirm";',
    );
    expect(stocktake).toContain("disabled={busy || pendingChallenge !== null || !canApprove}");
    expect(stocktake).toContain("最初の担当者とは別の担当者でログインして承認してください");
    expect(stocktake).toContain("棚卸を開始した担当者でログインして承認してください");
    expect(stocktake).toContain("isApprovalActorEligible && !hasOnlyApprovalReadyDiscrepancies");
    expect(stocktake).toContain("差異の再確認を完了してから棚卸を承認してください。");
    expect(stocktake).toContain("successMessage?: string");
    expect(stocktake).toContain("if (successMessage) setMessage(successMessage);");
    expect(stocktake).toContain('"棚卸を承認しました。"');
    expect(stocktake).toContain('{message ? <p role="status">{message}</p> : null}');
  });

  it("selects an approved missing candidate from Home without accepting arbitrary ids", () => {
    const unresolved = stocktakeFixture("unresolved", "reconciliation", [
      "reconfirmation_required",
    ]);
    const retained = stocktakeFixture("retained", "reconciliation", ["resolved"]);
    const approvedCandidate = stocktakeFixture("approved-candidate", "approved", [
      "candidate_confirmed",
    ]);
    const fallback = stocktakeFixture("fallback", "counting", []);

    expect(
      selectFocusedStocktake(
        [approvedCandidate, retained, unresolved, fallback],
        retained.stocktakeId,
      )?.stocktakeId,
    ).toBe(unresolved.stocktakeId);
    expect(
      selectFocusedStocktake([approvedCandidate, retained, fallback], retained.stocktakeId)
        ?.stocktakeId,
    ).toBe(retained.stocktakeId);
    expect(selectFocusedStocktake([approvedCandidate, fallback], null)?.stocktakeId).toBe(
      approvedCandidate.stocktakeId,
    );
    expect(
      selectFocusedStocktake(
        [stocktakeFixture("approved-resolved", "approved", ["restored"]), fallback],
        null,
      )?.stocktakeId,
    ).toBe(fallback.stocktakeId);
  });

  it("keeps the approved mobile journeys to one purpose per screen", () => {
    const accountingPage = readFileSync(
      resolve("apps/web/src/components/accounting-page-workspace.tsx"),
      "utf8",
    );
    const accounting = readFileSync(
      resolve("apps/web/src/components/accounting-workspace.tsx"),
      "utf8",
    );
    const stocktake = readFileSync(
      resolve("apps/web/src/components/stocktake-workspace.tsx"),
      "utf8",
    );
    const styles = readFileSync(resolve("apps/web/src/app/globals.css"), "utf8");

    for (const label of ["出力形式", "会計設定", "科目候補", "CSV確認"]) {
      expect(accountingPage).toContain(label);
    }
    for (const label of ["運用モード", "商品を読む", "差異を確認", "復元・監査", "ラベル"]) {
      expect(stocktake).toContain(label);
    }
    expect(accounting).toContain("data-mobile-stage={mobileStage}");
    expect(stocktake).toContain("data-mobile-stage={mobileStage}");
    expect(styles).toContain(".accountingMobilePanel:not(.isActive)");
    expect(styles).toContain(".stocktakeMobilePanel:not(.isActive)");
    expect(accounting).toContain("保存済みCSVを出力前に確認");
    expect(accounting).toContain("previewConfirmed");
    expect(accounting).toContain("accountingSetupStack");
    expect(stocktake).toContain("現在のシステム場所");
    expect(stocktake).toContain("discrepancyEvidenceGallery");
  });

  it("reflows long mobile stocktake audit history details without clipping them", () => {
    const styles = readFileSync(resolve("apps/web/src/app/globals.css"), "utf8");
    const mobileStyles = styles.slice(
      styles.lastIndexOf("@media (max-width: 560px)"),
      styles.indexOf("/* Keep the approved Home C overrides after the legacy dashboard rules. */"),
    );

    expect(mobileStyles).toMatch(
      /\.stocktakeAuditTimeline \{[\s\S]*?min-width: 0;[\s\S]*?\.stocktakeAuditTimeline ol \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);/u,
    );
    expect(mobileStyles).toMatch(
      /\.stocktakeAuditTimeline li,[\s\S]*?\.stocktakeAuditTimeline li span \{[\s\S]*?min-width: 0;[\s\S]*?overflow-wrap: anywhere;/u,
    );
  });

  it("keeps the W12 desktop export check, CSV preview, help, and history in one view", () => {
    const accounting = readFileSync(
      resolve("apps/web/src/components/accounting-workspace.tsx"),
      "utf8",
    );
    const styles = readFileSync(resolve("apps/web/src/app/globals.css"), "utf8");

    expect(accounting).toContain('className="accountingExportPrimary"');
    expect(accounting).toContain('className="accountingExportSupport"');
    expect(accounting).toContain("accountingCsvPreviewScroll");
    expect(styles).toContain("@media (min-width: 1101px)");
    expect(styles).toContain("grid-template-columns: minmax(0, 1.05fr) minmax(600px, 1fr)");
    expect(styles).toContain('"primary support"');
    expect(styles).toContain("max-height: 96px");
  });

  it("keeps accounting history separate from preview and download operation states", () => {
    const accounting = readFileSync(
      resolve("apps/web/src/components/accounting-workspace.tsx"),
      "utf8",
    );
    const repository = readFileSync(resolve("apps/api/src/accounting-repository.ts"), "utf8");

    expect(accounting).toContain("setBatches(exports)");
    expect(accounting).toContain("selectActiveAccountingExport(exports, preferredFormat)");
    expect(accounting).toContain('candidate.state === "ready" || candidate.state === "downloaded"');
    expect(accounting).toContain('batch.state !== "downloaded"');
    expect(accounting).toContain('{batch.state === "downloaded" ? (');
    expect(accounting).toContain("新規作成と履歴の置換を別操作に分離");
    expect(accounting).toContain("過去batchは削除せず履歴へ残します");
    expect(repository).toContain("and state in ('ready', 'downloaded')");
    expect(repository).not.toContain("and state not in ('preparing', 'failed')\n      `;");
  });

  it("persists pilot exceptions on the server and queues transport failures without passing totals", () => {
    const workflow = readFileSync(resolve("apps/web/src/components/p0-workspace.tsx"), "utf8");
    const research = readFileSync(
      resolve("apps/web/src/components/product-research-panel.tsx"),
      "utf8",
    );
    const correctionRepository = readFileSync(
      resolve("apps/api/src/pilot-manual-correction.ts"),
      "utf8",
    );
    const p0Repository = readFileSync(resolve("apps/api/src/p0-item-repository.ts"), "utf8");
    expect(workflow).toContain("listingPrepPilotMigrationVersion");
    expect(workflow).toContain("migrationVersion: listingPrepPilotMigrationVersion");
    expect(workflow).not.toContain('migrationVersion: "0028"');
    expect(workflow).toContain("postPilotEventRequest");
    expect(workflow).toContain("flushPendingPilotEvents");
    expect(workflow).toContain('addEventListener("online"');
    expect(workflow).toContain("例外記録が同期待ちです");
    expect(workflow).toContain("pendingEventCount > 0");
    expect(workflow).toContain("resale-ops:pilot-pending-events:v1");
    expect(workflow).toContain('"browser_reload_or_reopen"');
    expect(workflow).toContain('"measurement_rework"');
    expect(workflow).toContain("専用ブラウザのrequest capture");
    expect(workflow).toContain("手動訂正");
    expect(workflow).toContain("通信再送");
    expect(workflow).toContain("external-invalidation");
    expect(workflow).toContain("listingPrepPilotWarmupFixture");
    expect(workflow).toContain("listingPrepPilotItemIdentifiers");
    expect(workflow).toContain("readOnly={pilotIdentifiers !== null}");
    expect(workflow).toContain("次の固定商品へ");
    expect(workflow).toContain("このrunは不合格です。履歴は削除せず保持します");
    expect(workflow).toContain("新しいrun IDでTOP-01からやり直してください");
    expect(workflow).toContain("必須画像不足");
    expect(workflow).toContain("ラベル・場所不一致");
    expect(workflow).not.toContain(
      'if (correction) await recordPilotEvent("manual_correction", correction.detailCode)',
    );
    expect(research).toContain("P06計測中は外部ページを開きません");
    expect(research).toContain("{!pilotActive ? (");
    expect(p0Repository).toContain(
      "Marketplace references are disabled during the local-only pilot",
    );
    expect(p0Repository).toContain("run.workspace_id = ${workspaceId} and run.state = 'active'");
    expect(correctionRepository).toContain("successful_append_only_correction");
    expect(correctionRepository).toContain("on conflict");
    expect(workflow).not.toContain("pilotMetrics:");
  });

  it("requires physical stocktake labels and never pre-fills normal order money", () => {
    const stocktake = readFileSync(
      resolve("apps/web/src/components/stocktake-workspace.tsx"),
      "utf8",
    );
    const workflow = readFileSync(resolve("apps/web/src/components/p0-workspace.tsx"), "utf8");
    expect(stocktake).toContain('placeholder="現物の商品ラベルをスキャン"');
    expect(stocktake).toContain('placeholder="現物の場所ラベルをスキャン"');
    expect(stocktake).not.toContain('defaultValue={item?.inventoryNumber ?? ""}');
    expect(stocktake).not.toContain('<select name="locationCode"');
    for (const amount of ["5000", "500", "750", "100"]) {
      expect(workflow).not.toContain(`defaultValue="${amount}"`);
    }
  });

  it("keeps offline putaway minimal and never auto-overwrites a conflict", () => {
    const outbox = readFileSync(resolve("apps/web/src/lib/offline-outbox.ts"), "utf8");
    const status = readFileSync(resolve("apps/web/src/components/offline-sync-status.tsx"), "utf8");
    expect(outbox).toContain("syncPendingPutaways");
    expect(outbox).toContain('status === 401) return "authentication_required"');
    expect(outbox).toContain('status === 403) return "forbidden"');
    expect(outbox).toContain('status >= 500) return "unavailable"');
    expect(outbox).toContain('result === "authentication_required"');
    expect(outbox).toContain("discarded += 1");
    expect(outbox).toContain("throw new Error(body?.message");
    expect(outbox).not.toMatch(/address|receiptText|purchasePrice|taxDocument/u);
    expect(status).toContain("useState<boolean | null>(null)");
    expect(status).toContain("if (navigator.onLine)");
    expect(status).toContain("showOfflineStatus();");
    expect(status).toContain('addEventListener("online"');
    expect(status).toContain('addEventListener("offline"');
    expect(status).toContain('removeEventListener("online", synchronizeWhenOnline)');
    expect(status).toContain('removeEventListener("offline", showOfflineStatus)');
    expect(status).toContain(
      'isOnline === null ? "接続確認中" : isOnline ? "オンライン" : "オフライン"',
    );
    expect(status).toContain(
      "同期待ちは端末内に保持し、接続が戻った後に現在地を再確認して同期します。",
    );
    expect(status).toContain(
      'disabled={isOnline !== true || state === "syncing" || pending === 0}',
    );
    expect(status).toContain("自動上書きせず、再読取してください");
    expect(status).toContain("担当解除・変更のため端末から消去しました");
    expect(status).toContain("再ログイン後に同期待ちを再送します。端末内に保持しています");
  });

  it("creates and reads unique inventory barcodes locally without an external API", () => {
    const packageManifest = JSON.parse(readFileSync(resolve("apps/web/package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    const labels = readFileSync(
      resolve("apps/web/src/components/inventory-label-workspace.tsx"),
      "utf8",
    );
    const scanner = readFileSync(
      resolve("apps/web/src/components/local-barcode-scanner.tsx"),
      "utf8",
    );
    const find = readFileSync(resolve("apps/web/src/components/mobile-inventory-find.tsx"), "utf8");
    const labelPage = readFileSync(resolve("apps/web/src/app/inventory/labels/page.tsx"), "utf8");
    const findPage = readFileSync(resolve("apps/web/src/app/mobile/find/page.tsx"), "utf8");

    expect(packageManifest.dependencies?.jsbarcode).toBe("3.12.3");
    expect(packageManifest.dependencies?.["@zxing/browser"]).toBe("0.2.1");
    expect(packageManifest.dependencies?.["@zxing/library"]).toBe("0.23.0");
    expect(labels).toContain("const labelsPerSheet = 24");
    expect(labels).toContain("buildInventoryBarcodePayload");
    expect(labels).toContain("window.print()");
    expect(labels).toContain("住所・原価・購入者情報は入れません");
    expect(scanner).toContain("BrowserMultiFormatOneDReader");
    expect(scanner).toContain("BarcodeFormat.CODE_128");
    expect(scanner).toContain('facingMode: { ideal: "environment" }');
    expect(scanner).not.toMatch(/fetch\(|https?:\/\//u);
    expect(find).toContain("読取は検索だけです");
    expect(find).toContain("古い商品ラベルです");
    expect(find).not.toMatch(/method: ["'](?:POST|PUT|PATCH|DELETE)["']/u);
    expect(labelPage).toContain('requirePageSession(["owner", "inventory_manager"])');
    expect(findPage).toContain('requirePageSession(["owner", "inventory_manager"])');
  });

  it("stages every capture file before network upload and clears revoked assignments", () => {
    const capture = readFileSync(
      resolve("apps/web/src/components/mobile-capture-workspace.tsx"),
      "utf8",
    );
    const save = capture.slice(capture.indexOf("async function save()"));
    const stageIndex = save.indexOf("await prepareCaptureUpload");
    const uploadIndex = save.indexOf("await requestJson(");
    expect(stageIndex).toBeGreaterThan(-1);
    expect(uploadIndex).toBeGreaterThan(stageIndex);
    expect(save).toContain("const stagedUploads = new Map");
    expect(save).toContain("clearCaptureUploads(workspaceId, task.skuId)");
    expect(capture).toContain("clearCaptureBusinessData");
    expect(capture).toContain("clearUnassignedCaptureUploads");
    expect(capture).toContain("reason.status === 403");
    expect(capture).not.toContain("reason.status === 401 || reason.status === 403");
    const outbox = readFileSync(resolve("apps/web/src/lib/capture-outbox.ts"), "utf8");
    const styles = readFileSync(resolve("apps/web/src/app/globals.css"), "utf8");
    expect(outbox).toContain('crypto.subtle.digest("SHA-256"');
    expect(outbox).toContain("existing.fileSha256 === fileSha256");
    expect(capture).toContain('capture="environment"');
    expect(capture).toContain('className="mobileCaptureSave"');

    const captureSaveStyles = styles.slice(
      styles.indexOf(".mobileCaptureSave {"),
      styles.indexOf(".researchPanel {"),
    );
    expect(captureSaveStyles).toContain("min-height: 48px");
    const headerLinkStyles = styles.slice(
      styles.indexOf(".mobileAppHeader > a {"),
      styles.indexOf(".mobileAppContent {"),
    );
    expect(headerLinkStyles).toContain("min-width: 44px");
    expect(headerLinkStyles).toContain("min-height: 44px");
    const measurementStyles = styles.slice(
      styles.indexOf(".measurementGrid input {"),
      styles.indexOf(".candidateNotice {"),
    );
    expect(measurementStyles).toContain("min-height: 44px");
  });

  it("keeps the mobile product summary readable and its next-step link touchable", () => {
    const styles = readFileSync(resolve("apps/web/src/app/globals.css"), "utf8");
    const workflow = readFileSync(resolve("apps/web/src/components/p0-workspace.tsx"), "utf8");
    const summaryStyles = styles.slice(
      styles.indexOf(".workflowItemSummary {"),
      styles.indexOf(".workflowPanel {"),
    );
    expect(summaryStyles).toContain(".workflowItemSummary > label");
    expect(summaryStyles).toContain(".workflowItemSummary select");
    expect(summaryStyles).toContain("min-width: 0");
    expect(summaryStyles).toContain("min-height: 44px");
    expect(styles).toMatch(
      /\.workflowItemSummary > label \{[\s\S]*?grid-column: 1 \/ -1;[\s\S]*?\.workflowItemSummary > div \{[\s\S]*?padding: 13px 11px;/u,
    );
    const noticeStyles = styles.slice(
      styles.indexOf(".candidateNotice a {"),
      styles.indexOf(".workflowPanel textarea {"),
    );
    expect(noticeStyles).toContain("min-height: 44px");
    expect(workflow).toContain("inventoryStatusLabel(item.inventoryStatus)");
    expect(workflow).toContain('putaway_pending: "格納待ち"');
  });

  it("clears the application cache even before a service worker controls the page", () => {
    const outbox = readFileSync(resolve("apps/web/src/lib/offline-outbox.ts"), "utf8");
    expect(outbox).toContain('if ("caches" in window)');
    expect(outbox).toContain('cacheName.startsWith("resale-ops-")');
    expect(outbox).toContain("caches.delete(cacheName)");
  });

  it("keeps cloud checks and validation publishing manual-only", () => {
    const workflow = readFileSync(resolve(".github/workflows/ci.yml"), "utf8");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toContain("pull_request:");
    expect(workflow).not.toContain("push:");
    expect(workflow).toContain("npm test");
    expect(workflow).toContain("npm run lint");
    expect(workflow).toContain("npm run build");
    expect(workflow).not.toContain("macos-");
    const pages = readFileSync(resolve(".github/workflows/pages.yml"), "utf8");
    expect(pages).toContain("workflow_dispatch:");
    expect(pages).not.toContain("push:");
    expect(pages).toContain("actions/deploy-pages@v4");
    expect(pages).toContain("pages: write");
  });

  it("protects sensitive pages with a server-side session and role allowlist", () => {
    const guard = readFileSync(resolve("apps/web/src/lib/server-session.ts"), "utf8");
    const home = readFileSync(resolve("apps/web/src/app/page.tsx"), "utf8");
    const inventory = readFileSync(resolve("apps/web/src/app/inventory/page.tsx"), "utf8");
    const stocktake = readFileSync(
      resolve("apps/web/src/app/inventory/stocktake/page.tsx"),
      "utf8",
    );
    const workflow = readFileSync(resolve("apps/web/src/app/workflow/page.tsx"), "utf8");
    const mobile = readFileSync(resolve("apps/web/src/app/mobile/page.tsx"), "utf8");
    const scan = readFileSync(resolve("apps/web/src/app/mobile/scan/page.tsx"), "utf8");
    const shipping = readFileSync(resolve("apps/web/src/app/shipping/page.tsx"), "utf8");

    expect(guard).toContain('import "server-only"');
    expect(guard).toContain('cache: "no-store"');
    expect(guard).toContain("sessionContextResponseSchema.safeParse");
    expect(guard).toContain('redirect("/login")');
    expect(guard).toContain('redirect("/forbidden")');
    expect(guard).not.toMatch(/console\.|localStorage|sessionStorage/u);
    for (const source of [home, inventory, stocktake, workflow]) {
      expect(source).toContain('export const dynamic = "force-dynamic"');
      expect(source).toContain('requirePageSession(["owner", "inventory_manager"])');
      expect(source).not.toContain('"field_worker"');
    }
    expect(mobile).toMatch(
      /requirePageSession\(\[\s*"owner",\s*"inventory_manager",\s*"field_worker",\s*"shipping",?\s*\]\)/u,
    );
    for (const source of [scan]) {
      expect(source).toContain('export const dynamic = "force-dynamic"');
      expect(source).toContain(
        'requirePageSession(["owner", "inventory_manager", "field_worker"])',
      );
    }
    expect(shipping).toContain('requirePageSession(["owner", "inventory_manager", "shipping"])');
    expect(mobile).toContain("canViewManagement");
  });
});

function stocktakeFixture(
  stocktakeId: string,
  state: StocktakeResponse["state"],
  discrepancyStates: Array<StocktakeResponse["discrepancies"][number]["state"]>,
): StocktakeResponse {
  return {
    stocktakeId,
    state,
    discrepancies: discrepancyStates.map((discrepancyState, index) => ({
      discrepancyId: `${stocktakeId}-${index}`,
      state: discrepancyState,
    })),
  } as StocktakeResponse;
}
