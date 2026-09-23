import { describe, expect, it } from "vitest";
import {
  initialControls,
  parseControls,
  changeCount,
  canMarkMissing,
  settingsReady,
  canPreviewFile,
  reviewCsv,
  recordReview,
  officialProductUrl,
} from "./review-controls-state";

describe("reported mobile control state", () => {
  it("starts unchecked, with no fabricated past success history", () => {
    const state = parseControls(null);
    expect(state.history).toEqual([]);
    expect(canMarkMissing(state)).toBe(false);
    expect(canPreviewFile(state)).toBe(false);
    expect(() => reviewCsv(state)).toThrow();
    expect(parseControls(JSON.stringify(state))).toEqual(state);
  });
  it("counts actual changes, clears old confirmation and clamps both bounds", () => {
    const start = { ...initialControls(), confirmedCount: 48 };
    expect(changeCount(start, 1)).toMatchObject({ count: 49, confirmedCount: null });
    expect(changeCount(changeCount(start, 1), -1).count).toBe(48);
    expect(changeCount({ ...start, count: 0 }, -1).count).toBe(0);
    expect(changeCount({ ...start, count: 9999 }, 1).count).toBe(9999);
  });
  it("requires all missing-product checks and nonblank reason", () => {
    const state = { ...initialControls(), missingChecks: [true, true, true], reason: " " };
    expect(canMarkMissing(state)).toBe(false);
    expect(canMarkMissing({ ...state, reason: "確認用の理由" })).toBe(true);
    expect(canMarkMissing({ ...state, missingChecks: [true, false, true], reason: "理由" })).toBe(
      false,
    );
  });
  it("validates calendar dates and requires each accounting gate", () => {
    const state = {
      ...initialControls(),
      settings: ["確認用", "確認用", "2026-01-01", "2026-12-31"],
    };
    expect(settingsReady(state)).toBe(true);
    expect(settingsReady({ ...state, settings: ["a", "b", "2026-02-30", "2026-12-31"] })).toBe(
      false,
    );
    expect(settingsReady({ ...state, settings: ["a", "b", "2026-12-31", "2026-01-01"] })).toBe(
      false,
    );
    expect(canPreviewFile(state)).toBe(false);
    expect(canPreviewFile({ ...state, candidates: [true, false, false, false] })).toBe(false);
    const ready = { ...state, candidates: [true, false, true, false], preflight: [true, true] };
    expect(canPreviewFile(ready)).toBe(true);
    expect(reviewCsv(ready)).toContain("操作確認用・取込禁止,売上,0");
    expect(reviewCsv(ready)).toContain("操作確認用・取込禁止,送料,0");
    expect(reviewCsv(ready)).not.toContain("仕入れ代");
  });
  it.each([
    "{}",
    "null",
    "{",
    JSON.stringify({ ...initialControls(), count: -1 }),
    JSON.stringify({ ...initialControls(), version: 2 }),
    JSON.stringify({ ...initialControls(), settings: ["a"] }),
  ])("refuses corrupted saved input without resetting it: %s", (raw) => {
    expect(() => parseControls(raw)).toThrow();
  });
  it("only adds explicitly recorded operations and bounds history", () => {
    let state = initialControls();
    for (let i = 0; i < 40; i++)
      state = recordReview(state, "確認用", `${i}`, "2026-09-24T00:00:00Z");
    expect(state.history).toHaveLength(30);
    expect(state.history[0]?.detail).toBe("39");
  });
  it.each([
    "javascript:alert(1)",
    "https://jp.mercari.com.evil.test/item/m123",
    "https://jp.mercari.com@evil.test/item/m123",
    "http://jp.mercari.com/item/m123",
    "https://jp.mercari.com/item/m123?x=1",
    "https://jp.mercari.com/item/m123#x",
    "https://jp.mercari.com:123/item/m123",
    "https://jp.mercari.com/",
  ])("does not expose an unapproved external link: %s", (url) => {
    expect(officialProductUrl(url)).toBeNull();
  });
  it("permits only a user-supplied canonical product URL", () => {
    expect(officialProductUrl("https://jp.mercari.com/item/m123456789")).toBe(
      "https://jp.mercari.com/item/m123456789",
    );
  });
});
