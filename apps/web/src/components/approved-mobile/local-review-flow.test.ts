import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "apps/web/src/components/approved-mobile");
const flow = readFileSync(resolve(root, "local-review-flow.tsx"), "utf8");
const entry = readFileSync(resolve(root, "approved-mobile-demo.tsx"), "utf8");
const store = readFileSync(resolve(root, "local-review-store.ts"), "utf8");
const styles = readFileSync(resolve(root, "approved-mobile-demo.module.css"), "utf8");

describe("browser-only mobile review boundary", () => {
  it("only mounts the persistence flow in the explicit static review mode", () => {
    expect(entry).toContain("isStaticApprovedReview && isLocalReviewScreen(screen.id)");
    expect(entry).toContain("<LocalReviewFlow key={screen.id} screenId={screen.id} />");
    expect(flow).toContain('id === "04"');
    expect(flow).toContain('id === "05"');
    expect(flow).toContain("Number(id) >= 14");
    expect(flow).toContain("Number(id) <= 28");
  });
  it("does not reproduce a phone status area or a second app header on the public home", () => {
    expect(entry).toContain('const isHeaderlessReviewHome = isLocalReview && screen.id === "04"');
    expect(entry).toContain('screen.id === "01" || isHeaderlessReviewHome ? null :');
    expect(entry).toContain("isHeaderlessReviewHome && styles.headerlessReviewHome");
    expect(styles).toContain(".headerlessReviewHome.headerlessReviewHome");
    expect(styles).toContain("env(safe-area-inset-top)");
    expect(entry).not.toMatch(/9:41|dynamicIsland|statusBar|batteryIcon/u);
  });
  it("contains no runtime API, upload, credentials, or broad storage clearing", () => {
    expect(flow + store).not.toMatch(
      /\bfetch\s*\(|XMLHttpRequest|sendBeacon|requestJson|\.localStorage\.clear\s*\(|\.sessionStorage\.clear\s*\(/u,
    );
    expect(store).toContain("storage.removeItem(reviewStorageKey)");
    expect(flow).toContain("実商品・個人情報は入力しないでください");
    expect(flow).toContain("外部送信・端末間共有はありません");
  });
  it("waits for photograph persistence and human confirmation before advancing", () => {
    expect(flow).toContain("await checkImage(file)");
    expect(flow).toContain("await saveReviewPhoto(window.indexedDB, slot, file)");
    expect(flow).toContain("await confirmReviewPhoto(window.indexedDB, selected[0], draft.token)");
    expect(flow).toContain('label = "確認してこの写真を使う"');
    expect(flow).toContain("disabled = !draft");
  });
  it("protects dirty data and blocks completion for missing prerequisites", () => {
    expect(flow).toContain('window.addEventListener("beforeunload", preventLoss)');
    expect(flow).toContain("if (next && persist(next)) window.location.assign(route(id))");
    expect(flow).toContain("n >= 25 && !allPhotos");
    expect(flow).toContain("disabled = !state.measurements.every(validMeasurement)");
    expect(flow).toContain("保存を再試行");
    expect(flow).toContain("確認用データを消去する");
  });
  it("preserves the approved home, work-list, and inspection structures", () => {
    const home = flow.slice(flow.indexOf('case "04":'), flow.indexOf('case "05":'));
    const work = flow.slice(flow.indexOf('case "05":'), flow.indexOf('case "14":'));
    const inspection = flow.slice(flow.indexOf('case "17":'), flow.indexOf('case "18":'));
    for (const part of [
      "styles.homeTaskCard",
      "styles.homeTaskRow",
      "styles.homeTaskHead",
      "styles.checkMark",
      "<i>",
      "width:",
      "今日やること",
    ])
      expect(home).toContain(part);
    for (const part of [
      "styles.boardInstruction",
      "作業の種類を選びます",
      "styles.taskList",
      "styles.listRow",
      "styles.rowIcon",
      "styles.chevron",
    ])
      expect(work).toContain(part);
    expect(work).not.toContain("homeTaskCard");
    for (const part of [
      "styles.inspectionState",
      "styles.inspectionStateActive",
      "styles[`state${tone}`]",
      "<span>{stateIcon}</span>",
      "<b>{title}</b>",
      "<small>{detail}</small>",
      "まだ確認していません",
      "問題がないことを確認しました",
      "汚れや傷などがあります",
      "6項目すべて確認しました",
      "残り${inspectionLabels.length - inspectionCount}項目を確認してください",
    ])
      expect(inspection).toContain(part);
    expect(inspection).not.toContain("local.choice");
    expect(inspection).toContain(
      "inspectionCount === inspectionLabels.length || inspectionIndex === 5",
    );
  });
  it("replaces stale state and photographs before reporting a partial reset failure", () => {
    const reset = flow.slice(
      flow.indexOf("const result = await resetReviewDataAndReload"),
      flow.indexOf('window.location.assign(route("04"))'),
    );
    expect(reset).toContain("savedRaw.current = result.raw");
    expect(reset).toContain("setState(result.state)");
    expect(reset).toContain("setPhotos(result.photos)");
    expect(reset).toContain("setDirty(false)");
    expect(reset).toContain("if (result.error) throw new Error(result.error)");
  });
});
