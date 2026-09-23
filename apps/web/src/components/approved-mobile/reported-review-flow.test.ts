import React, { type ReactElement, type ReactNode } from "react";
import ts from "typescript";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import * as stateModule from "./review-controls-state";
import { reviewPath } from "./review-path";
import { validatePhoto } from "./local-review-store";

// Execute production handlers; native rendering/focus/touch are separately checked in the browser.
const values: unknown[] = [];
let cursor = 0;
let effects: (() => void)[] = [];
let cleanup: (() => void)[] = [];
const hooks = {
  useState(initial: unknown) {
    const index = cursor++;
    if (!(index in values)) values[index] = initial;
    return [
      values[index],
      (value: unknown) => {
        values[index] = typeof value === "function" ? value(values[index]) : value;
      },
    ];
  },
  useRef(initial: unknown) {
    const index = cursor++;
    if (!(index in values)) values[index] = { current: initial };
    return values[index];
  },
  useEffect(effect: () => void | (() => void), deps: unknown[]) {
    const index = cursor++;
    const old = values[index] as unknown[] | undefined;
    if (!old || deps.some((v, i) => old[i] !== v)) {
      values[index] = deps;
      effects.push(() => {
        const result = effect();
        if (result) cleanup.push(result);
      });
    }
  },
};
type Props = {
  children?: ReactNode;
  label?: string;
  disabled?: boolean;
  checked?: boolean;
  value?: string;
  href?: string;
  "aria-label"?: string;
  onClick?: () => void;
  onChange?: (value: string) => void;
  onConfirm?: () => void;
  onPointerDown?: (e: unknown) => void;
  onPointerUp?: () => void;
  onPointerCancel?: () => void;
  onKeyDown?: (e: unknown) => void;
  onKeyUp?: (e: unknown) => void;
};
function nodes(node: ReactNode): ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!React.isValidElement<Props>(node)) return [];
  return [node, ...nodes(node.props.children)];
}
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (React.isValidElement<Props>(node)) return text(node.props.children);
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}
const source = readFileSync(
  resolve(process.cwd(), "apps/web/src/components/approved-mobile/reported-review-flow.tsx"),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    jsx: ts.JsxEmit.React,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const exports: {
  ReportedReviewFlow?: (props: { screenId: string }) => ReactElement;
  HoldToConfirm?: (props: { disabled: boolean; onConfirm: () => void }) => ReactElement;
} = {};
new Function("require", "exports", "React", compiled)(
  (name: string) => {
    if (name === "react") return hooks;
    if (name.endsWith(".css")) return { default: new Proxy({}, { get: (_, key) => key }) };
    if (name === "./review-path") return { reviewPath };
    if (name === "./local-review-store") return { validatePhoto };
    if (name === "./review-controls-state") return stateModule;
    throw new Error(name);
  },
  exports,
  React,
);
let saved: string | null;
let denyWrite: boolean;
let denyRead: boolean;
const winEvents = new Map<string, (e: unknown) => void>();
const docEvents = new Map<string, (e: unknown) => void>();
function screen(id: string) {
  const render = () => {
    cursor = 0;
    const tree = exports.ReportedReviewFlow!({ screenId: id });
    const current = effects;
    effects = [];
    current.forEach((e) => e());
    return tree;
  };
  render();
  const find = (match: (node: ReactElement<Props>) => boolean) => {
    const node = nodes(render()).find(match);
    if (!node) throw new Error("Control missing");
    return node;
  };
  return {
    text: () => text(render()),
    click: (label: string) => {
      const button = find((n) => n.type === "button" && text(n) === label);
      if (!button.props.disabled) button.props.onClick?.();
    },
    disabled: (label: string) =>
      find((n) => n.type === "button" && text(n) === label).props.disabled,
    invoke: (label: string) =>
      find((n) => n.type === "button" && text(n) === label).props.onClick?.(),
    edit: (label: string, value: string) =>
      find((n) => n.props.label === label).props.onChange?.(value),
    check: (label: string) => find((n) => n.props.label === label).props.onChange?.(""),
    hold: () => find((n) => !!n.props.onConfirm).props,
    links: () =>
      nodes(render())
        .filter((n) => n.type === "a")
        .map((n) => n.props.href),
  };
}
function remount() {
  cleanup.forEach((fn) => fn());
  cleanup = [];
  values.length = 0;
  effects = [];
  cursor = 0;
}
beforeEach(() => {
  saved = null;
  denyWrite = false;
  denyRead = false;
  remount();
  winEvents.clear();
  docEvents.clear();
  vi.stubGlobal("window", {
    sessionStorage: {
      getItem: () => {
        if (denyRead) throw Error("denied");
        return saved;
      },
      setItem: (_: string, value: string) => {
        if (denyWrite) throw Error("denied");
        saved = value;
      },
    },
    location: { assign: vi.fn() },
    addEventListener: (name: string, fn: (e: unknown) => void) => winEvents.set(name, fn),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal("document", {
    addEventListener: (name: string, fn: (e: unknown) => void) => docEvents.set(name, fn),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});
afterEach(() => {
  remount();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("reported screen production handlers", () => {
  it("increments/decrements the actual count, confirms it and restores after remount", () => {
    let page = screen("box-02");
    page.click("＋1点");
    expect(page.text()).toContain("49点");
    page.click("49点で確定");
    expect(page.text()).toContain("49点で確認済み");
    page.click("1点戻す");
    expect(page.text()).not.toContain("49点で確認済み");
    remount();
    page = screen("box-02");
    expect(page.text()).toContain("48点");
  });
  it("does not claim confirmation when storage fails and retries the exact pending operation", () => {
    const page = screen("box-02");
    denyWrite = true;
    page.click("48点で確定");
    expect(page.text()).not.toContain("48点で確認済み");
    expect(page.text()).toContain("一時保存できません");
    const event = { preventDefault: vi.fn(), returnValue: undefined };
    winEvents.get("beforeunload")?.(event);
    expect(event.preventDefault).toHaveBeenCalled();
    denyWrite = false;
    page.click("保存を再試行");
    expect(page.text()).toContain("48点で確認済み");
  });
  it("protects unreadable existing data from accidental overwrite", () => {
    saved = "corrupt";
    const page = screen("44");
    expect(page.text()).toContain("上書きせず停止");
    expect(saved).toBe("corrupt");
  });
  it("can recover a temporary read failure", () => {
    denyRead = true;
    const page = screen("44");
    expect(page.text()).toContain("読み込みを再試行");
    denyRead = false;
    page.click("読み込みを再試行");
    expect(page.text()).toContain("会計の設定を入力");
  });
  it("connects settings, candidate selection and explicit preflight, resetting checks on edit", () => {
    let page = screen("44");
    expect(page.disabled("内容を確認して保存")).toBe(true);
    page.edit("申告の設定", "確認用");
    page.edit("消費税", "確認用");
    page.edit("開始日", "2026-01-01");
    page.edit("終了日", "2026-12-31");
    expect(page.disabled("内容を確認して保存")).toBe(false);
    page.click("内容を確認して保存");
    expect(window.location.assign).toHaveBeenCalledWith(expect.stringContaining("/45/"));
    remount();
    page = screen("45");
    page.check("売上");
    page.click("確認した項目を保存");
    remount();
    page = screen("46");
    expect(page.disabled("ファイル内容を確認")).toBe(true);
    page.check("資料（このファイルが架空例であることを確認）");
    page.check("重複（見本の選択項目を確認）");
    expect(page.disabled("ファイル内容を確認")).toBe(false);
    remount();
    page = screen("44");
    page.edit("消費税", "変更した確認用");
    remount();
    page = screen("46");
    expect(page.disabled("ファイル内容を確認")).toBe(true);
  });
  it("does not fabricate preflight or export when entering directly", () => {
    const page = screen("47");
    expect(page.disabled("見本CSVをダウンロード")).toBe(true);
    expect(page.text()).toContain("設定と確認を完了");
  });
  it("blocks CSV retry until pending history is saved, including a direct handler call", () => {
    vi.useFakeTimers();
    saved = JSON.stringify({
      ...stateModule.initialControls(),
      settings: ["確認用", "確認用", "2026-01-01", "2026-12-31"],
      candidates: [true, false, false, false],
      preflight: [true, true],
    });
    const clicked = vi.fn();
    Object.assign(document, {
      createElement: () => ({ click: clicked, remove: vi.fn() }),
      body: { appendChild: vi.fn() },
    });
    const page = screen("47");
    denyWrite = true;
    page.click("見本CSVをダウンロード");
    expect(clicked).toHaveBeenCalledTimes(1);
    expect(page.text()).toContain("一時保存できません");
    expect(page.disabled("見本CSVをダウンロード")).toBe(true);
    denyWrite = false;
    page.invoke("見本CSVをダウンロード");
    expect(clicked).toHaveBeenCalledTimes(1);
    expect(page.text()).not.toContain("ダウンロードを開始しました");
    expect(stateModule.parseControls(saved).history).toHaveLength(0);
    page.click("保存を再試行");
    expect(stateModule.parseControls(saved).history).toHaveLength(1);
    expect(page.disabled("見本CSVをダウンロード")).toBe(false);
    vi.advanceTimersByTime(60000);
  });
  it("does not invent previous accounting history", () => {
    expect(screen("49").text()).toContain("履歴はまだありません");
  });
  it("does not mark inventory missing until checks and reason are complete", () => {
    const page = screen("40");
    expect(page.hold().disabled).toBe(true);
    page.check("商品を再確認");
    page.check("棚を再確認");
    page.check("写真を確認");
    page.edit("理由", "確認用の理由");
    expect(page.hold().disabled).toBe(false);
    denyWrite = true;
    page.hold().onConfirm?.();
    expect(page.text()).not.toContain("仮状態を記録済み");
    denyWrite = false;
    page.click("保存を再試行");
    expect(page.text()).toContain("仮状態を記録済み");
  });
  it("shows copy failure separately and clears it only after a successful copy", async () => {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error("denied"));
    const page = screen("sales-06");
    page.click("▤変更内容をコピー確認用の候補をコピーします›");
    await vi.waitFor(() => expect(page.text()).toContain("コピーできません"));
    expect(page.text()).not.toContain("保存を再試行");
    page.click("▤変更内容をコピー確認用の候補をコピーします›");
    await vi.waitFor(() => expect(page.text()).toContain("変更内容をコピーしました"));
    expect(page.text()).not.toContain("コピーできません");
  });
  it("requires an exact official URL before offering external navigation", () => {
    const page = screen("sales-06");
    page.edit("公式の商品URL", "https://evil.test/");
    expect(page.links().some((url) => url?.includes("evil.test"))).toBe(false);
    page.edit("公式の商品URL", "https://jp.mercari.com/item/m123");
    expect(page.links()).toContain("https://jp.mercari.com/item/m123");
  });
  it("cancels a short hold, blur, and keyboard release; confirms only after 3 seconds", () => {
    vi.useFakeTimers();
    const confirm = vi.fn();
    const render = () => {
      cursor = 0;
      const node = exports.HoldToConfirm!({ disabled: false, onConfirm: confirm });
      const current = effects;
      effects = [];
      current.forEach((fn) => fn());
      return node.props as Props;
    };
    let button = render();
    button.onPointerDown?.({
      button: 0,
      pointerId: 1,
      currentTarget: { setPointerCapture: vi.fn() },
    });
    vi.advanceTimersByTime(2999);
    button.onPointerUp?.();
    vi.advanceTimersByTime(1);
    expect(confirm).not.toHaveBeenCalled();
    button = render();
    button.onKeyDown?.({ key: "Enter", repeat: false, preventDefault: vi.fn() });
    winEvents.get("blur")?.({});
    vi.advanceTimersByTime(3000);
    expect(confirm).not.toHaveBeenCalled();
    button.onKeyDown?.({ key: " ", repeat: false, preventDefault: vi.fn() });
    button.onKeyUp?.({ key: " ", preventDefault: vi.fn() });
    vi.advanceTimersByTime(3000);
    expect(confirm).not.toHaveBeenCalled();
    button.onKeyDown?.({ key: "Enter", repeat: false, preventDefault: vi.fn() });
    vi.advanceTimersByTime(3000);
    expect(confirm).toHaveBeenCalledTimes(1);
  });
  it("unmount cancels a pending hold", () => {
    vi.useFakeTimers();
    const confirm = vi.fn();
    cursor = 0;
    const button = exports.HoldToConfirm!({ disabled: false, onConfirm: confirm }).props as Props;
    effects.splice(0).forEach((fn) => fn());
    button.onKeyDown?.({ key: "Enter", repeat: false, preventDefault: vi.fn() });
    remount();
    vi.advanceTimersByTime(3000);
    expect(confirm).not.toHaveBeenCalled();
  });
  it("has no automatic external API, broad deletion or fabricated network calls", () => {
    expect(source).not.toMatch(
      /\bfetch\s*\(|XMLHttpRequest|sendBeacon|localStorage\.clear|sessionStorage\.clear/u,
    );
  });
});
