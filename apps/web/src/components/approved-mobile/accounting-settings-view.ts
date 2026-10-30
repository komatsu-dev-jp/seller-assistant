import { settingsReady, type ControlsState } from "./review-controls-state";

export const accountingSections = [
  { id: "accounting-filing", label: "申告区分" },
  { id: "accounting-tax", label: "消費税区分" },
  { id: "accounting-year", label: "会計年度" },
] as const;

// Read-only presentation. Use the existing gate, never change the saved values
// or treat a selected tax category as a legal/tax correctness determination.
export function accountingSettingsView(state: ControlsState) {
  const [filing = "", tax = "", start = "", end = ""] = state.settings;
  const dateReady = (from: string, to: string) =>
    settingsReady({ ...state, settings: ["入力あり", "入力あり", from, to] });
  const startValid = dateReady(start, start);
  const endValid = dateReady(end, end);
  const yearReady = dateReady(start, end);
  const startError =
    start && !startValid
      ? "有効な開始日を入力してください。"
      : end && !start
        ? "開始日を入力してください。"
        : "";
  const endError =
    end && !endValid
      ? "有効な終了日を入力してください。"
      : startValid && endValid && start > end
        ? "終了日は開始日以降にしてください。"
        : start && !end
          ? "終了日を入力してください。"
          : "";
  const groups = [
    { ...accountingSections[0], value: filing || "未設定", ready: !!filing.trim() },
    { ...accountingSections[1], value: tax || "未設定", ready: !!tax.trim() },
    {
      ...accountingSections[2],
      value: start || end ? `${start || "開始日未入力"} 〜 ${end || "終了日未入力"}` : "未設定",
      ready: yearReady,
    },
  ].map((group) => ({
    ...group,
    status: group.ready ? "入力済み" : group.value === "未設定" ? "未設定" : "要確認",
  }));
  return { groups, completed: groups.filter((group) => group.ready).length, startError, endError };
}
