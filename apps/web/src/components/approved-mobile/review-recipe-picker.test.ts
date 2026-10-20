import React, { type ReactElement, type ReactNode } from "react";
import ts from "typescript";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import * as store from "./review-recipe-store";
import { reviewPath } from "./review-path";

const values: unknown[] = [];
let cursor = 0;
let effects: (() => void)[] = [];
const hooks = {
  useState(initial: unknown) {
    const index = cursor++;
    if (!(index in values)) values[index] = initial;
    return [
      values[index],
      (value: unknown) => {
        values[index] = value;
      },
    ];
  },
  useEffect(effect: () => void) {
    const index = cursor++;
    if (!(index in values)) {
      values[index] = true;
      effects.push(effect);
    }
  },
};
type Props = {
  children?: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  "aria-pressed"?: boolean;
};
function nodes(node: ReactNode): ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!React.isValidElement<Props>(node)) return [];
  return [node, ...nodes(node.props.children)];
}
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (React.isValidElement<Props>(node)) return text(node.props.children);
  return typeof node === "string" ? node : "";
}
const source = readFileSync(
  resolve(process.cwd(), "apps/web/src/components/approved-mobile/review-recipe-picker.tsx"),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    jsx: ts.JsxEmit.React,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const exported: { ReviewRecipePicker?: () => ReactElement } = {};
new Function("require", "exports", "React", compiled)(
  (name: string) => {
    if (name === "react") return hooks;
    if (name.endsWith(".css")) return { default: new Proxy({}, { get: (_, key) => key }) };
    if (name === "./review-recipe-store") return store;
    if (name === "./review-path") return { reviewPath };
    throw Error(name);
  },
  exported,
  React,
);
let raw: string | null;
let denyRead: boolean;
let denyWrite: boolean;
function remount() {
  values.length = 0;
  cursor = 0;
  effects = [];
}
function page() {
  const render = () => {
    cursor = 0;
    const result = exported.ReviewRecipePicker!();
    effects.splice(0).forEach((effect) => effect());
    return result;
  };
  render();
  const button = (label: string) =>
    nodes(render()).find((node) => node.type === "button" && text(node).startsWith(label))!;
  return {
    text: () => text(render()),
    selected: (label: string) => !!button(label).props["aria-pressed"],
    disabled: (label: string) => !!button(label).props.disabled,
    click: (label: string) => {
      const node = button(label);
      if (!node.props.disabled) node.props.onClick?.();
    },
  };
}
beforeEach(() => {
  remount();
  raw = null;
  denyRead = denyWrite = false;
  vi.stubGlobal("window", {
    localStorage: {
      getItem: () => {
        if (denyRead) throw Error("denied");
        return raw;
      },
      setItem: (_key: string, value: string) => {
        if (denyWrite) throw Error("denied");
        raw = value;
      },
    },
  });
});
afterEach(() => {
  remount();
  vi.unstubAllGlobals();
});
describe("the same photo recipe picker on both platforms", () => {
  it("saves a main recipe plus details and restores them without manufacturing an initial selection", () => {
    let view = page();
    expect(view.selected("正面・背面")).toBe(false);
    view.click("正面・背面");
    view.click("タグ・気になる箇所");
    expect(JSON.parse(raw!)).toEqual(["front-back", "details"]);
    remount();
    view = page();
    expect(view.selected("正面・背面")).toBe(true);
    expect(view.selected("タグ・気になる箇所")).toBe(true);
    view.click("正面だけ");
    expect(JSON.parse(raw!)).toEqual(["front-only", "details"]);
  });
  it("retains the last saved selection on write failure and can retry", () => {
    const view = page();
    denyWrite = true;
    view.click("正面だけ");
    expect(view.text()).toContain("選択を保存できません");
    expect(view.selected("正面だけ")).toBe(false);
    expect(raw).toBeNull();
    denyWrite = false;
    view.click("正面だけ");
    expect(view.selected("正面だけ")).toBe(true);
  });
  it("blocks writing after a read failure until the original selection can be recovered", () => {
    raw = '["details"]';
    denyRead = true;
    const view = page();
    expect(view.disabled("正面・背面")).toBe(true);
    view.click("正面・背面");
    expect(raw).toBe('["details"]');
    denyRead = false;
    view.click("読み込みを再試行");
    expect(view.selected("タグ・気になる箇所")).toBe(true);
  });
  it("reads the latest value before updating instead of erasing another tab's details selection", () => {
    const view = page();
    raw = '["details"]';
    view.click("正面・背面");
    expect(JSON.parse(raw!)).toEqual(["front-back", "details"]);
  });
  it("uses the shared picker from both mobile entry points with no external processing", () => {
    const entry = readFileSync(
      resolve(process.cwd(), "apps/web/src/components/approved-mobile/approved-mobile-demo.tsx"),
      "utf8",
    );
    expect(entry).toMatch(/case "32":\s+return <ReviewRecipePicker \/>/u);
    expect(entry).toMatch(/case "photo-04":\s+return <ReviewRecipePicker \/>/u);
    expect(source).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|sendBeacon/u);
  });
});
