import { describe, expect, it } from "vitest";
import { accountingSettingsView } from "./accounting-settings-view";
import { initialControls, settingsReady } from "./review-controls-state";

describe("read-only accounting settings presentation", () => {
  it.each([
    [["", "", "", ""], 0],
    [["青色申告", "免税", "", ""], 2],
    [["白色申告", "課税", "2026-01-01", "2026-12-31"], 3],
    [["確認中", "以前の入力", "2026-01-01", "2026-12-31"], 3],
    [[" ", "免税", "2026-01-01", "2026-12-31"], 2],
    [["青色申告", "免税", "2026-12-31", "2026-01-01"], 2],
    [["青色申告", "免税", "2026-02-30", "2026-12-31"], 2],
  ])("uses the original gate without rewriting %j", (settings, completed) => {
    const state = { ...initialControls(), settings };
    const before = JSON.stringify(state);
    const view = accountingSettingsView(state);
    expect(view.completed).toBe(completed);
    expect(view.completed === 3).toBe(settingsReady(state));
    expect(JSON.stringify(state)).toBe(before);
  });
  it("keeps legacy text visible and dates understandable", () => {
    const view = accountingSettingsView({
      ...initialControls(),
      settings: ["以前の申告", "免税", "2026-01-01", ""],
    });
    expect(view.groups[0]?.value).toBe("以前の申告");
    expect(view.groups[2]?.status).toBe("要確認");
    expect(view.endError).toBe("終了日を入力してください。");
  });
});
