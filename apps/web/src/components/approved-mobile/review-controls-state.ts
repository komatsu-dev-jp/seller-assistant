export const controlsKey = "seller-assistant:review-controls:v1";
export type ReviewHistory = { at: string; kind: string; detail: string };
export type ControlsState = {
  version: 1;
  count: number;
  confirmedCount: number | null;
  missingChecks: boolean[];
  reason: string;
  provisional: boolean;
  settings: string[];
  candidates: boolean[];
  preflight: boolean[];
  history: ReviewHistory[];
};
export function initialControls(): ControlsState {
  return {
    version: 1,
    count: 48,
    confirmedCount: null,
    missingChecks: [false, false, false],
    reason: "",
    provisional: false,
    settings: ["", "", "", ""],
    candidates: [false, false, false, false],
    preflight: [false, false],
    history: [],
  };
}
function flags(value: unknown, length: number): value is boolean[] {
  return (
    Array.isArray(value) && value.length === length && value.every((v) => typeof v === "boolean")
  );
}
function boundedText(value: unknown): value is string {
  return typeof value === "string" && value.length <= 500;
}
export function parseControls(raw: string | null): ControlsState {
  if (raw === null) return initialControls();
  const s = JSON.parse(raw) as ControlsState;
  if (
    !s ||
    s.version !== 1 ||
    !Number.isInteger(s.count) ||
    s.count < 0 ||
    s.count > 9999 ||
    !(
      s.confirmedCount === null ||
      (Number.isInteger(s.confirmedCount) && s.confirmedCount >= 0 && s.confirmedCount <= 9999)
    ) ||
    !flags(s.missingChecks, 3) ||
    !boundedText(s.reason) ||
    typeof s.provisional !== "boolean" ||
    !Array.isArray(s.settings) ||
    s.settings.length !== 4 ||
    !s.settings.every(boundedText) ||
    !flags(s.candidates, 4) ||
    !flags(s.preflight, 2) ||
    !Array.isArray(s.history) ||
    s.history.length > 30 ||
    !s.history.every((h) => h && boundedText(h.at) && boundedText(h.kind) && boundedText(h.detail))
  ) {
    throw new Error("確認用の保存内容を読み取れません。上書きせず停止しました。");
  }
  return s;
}
export function changeCount(state: ControlsState, delta: number): ControlsState {
  return {
    ...state,
    count: Math.max(0, Math.min(9999, state.count + delta)),
    confirmedCount: null,
  };
}
export function settingsReady(state: ControlsState): boolean {
  const [filing, tax, start, end] = state.settings;
  const validDate = (s: string | undefined) =>
    !!s &&
    /^\d{4}-\d{2}-\d{2}$/u.test(s) &&
    !Number.isNaN(Date.parse(s)) &&
    new Date(s).toISOString().slice(0, 10) === s;
  return !!filing?.trim() && !!tax?.trim() && validDate(start) && validDate(end) && start! <= end!;
}
export function canPreviewFile(state: ControlsState): boolean {
  return settingsReady(state) && state.candidates.some(Boolean) && state.preflight.every(Boolean);
}
export function canMarkMissing(state: ControlsState): boolean {
  return state.missingChecks.every(Boolean) && !!state.reason.trim();
}
export function recordReview(
  state: ControlsState,
  kind: string,
  detail: string,
  at = new Date().toISOString(),
): ControlsState {
  return { ...state, history: [{ at, kind, detail }, ...state.history].slice(0, 30) };
}
export const candidateLabels = ["売上", "販売手数料", "送料", "仕入れ代"] as const;
export function reviewCsv(state: ControlsState): string {
  if (!canPreviewFile(state)) throw new Error("設定・項目・作成前の確認を完了してください。");
  return (
    "\uFEFF用途,項目,金額（架空例）\r\n" +
    candidateLabels
      .filter((_, i) => state.candidates[i])
      .map((label) => `操作確認用・取込禁止,${label},0`)
      .join("\r\n") +
    "\r\n"
  );
}
export function officialProductUrl(input: string): string | null {
  try {
    const url = new URL(input.trim());
    return url.protocol === "https:" &&
      url.hostname === "jp.mercari.com" &&
      !url.username &&
      !url.password &&
      !url.port &&
      /^\/item\/m\d+\/?$/u.test(url.pathname) &&
      !url.search &&
      !url.hash
      ? url.href
      : null;
  } catch {
    return null;
  }
}
