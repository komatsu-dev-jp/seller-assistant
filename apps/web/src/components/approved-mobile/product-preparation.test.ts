import React, { type ReactElement, type ReactNode } from "react";
import ts from "typescript";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import * as store from "./local-review-store";
import * as description from "./product-description";
import * as details from "./review-product-details";
import { reviewPath } from "./review-path";
import * as recovery from "./product-preparation-recovery";

// Execute the actual handlers with storage/clipboard failures. Native layout/dialog
// behaviour must additionally be verified in the browser; this harness does not cover layout.
let values: unknown[] = [];
let cursor = 0;
let effects: (() => void)[] = [];
let cleanup: (() => void)[] = [];
const hooks = {
  useState(initial: unknown) {
    const i = cursor++;
    if (!(i in values)) values[i] = initial;
    return [
      values[i],
      (v: unknown) => {
        values[i] = typeof v === "function" ? v(values[i]) : v;
      },
    ];
  },
  useRef(initial: unknown) {
    const i = cursor++;
    if (!(i in values)) values[i] = { current: initial };
    return values[i];
  },
  useEffect(effect: () => void | (() => void), deps: unknown[]) {
    const i = cursor++;
    const old = values[i] as unknown[] | undefined;
    if (!old || deps.some((v, j) => v !== old[j])) {
      values[i] = deps;
      effects.push(() => {
        const close = effect();
        if (close) cleanup.push(close);
      });
    }
  },
};
type Props = {
  children?: ReactNode;
  value?: string;
  disabled?: boolean;
  onClick?: () => void;
  onChange?: (e: { target: { value: string } }) => void;
  role?: string;
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
  resolve(process.cwd(), "apps/web/src/components/approved-mobile/product-preparation.tsx"),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    jsx: ts.JsxEmit.React,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const exported: { ProductPreparation?: (props: { screenId: string }) => ReactElement } = {};
new Function("require", "exports", "React", compiled)(
  (name: string) => {
    if (name === "react") return hooks;
    if (name.endsWith(".css")) return { default: new Proxy({}, { get: (_, key) => key }) };
    if (name === "./local-review-store") return { ...store, readReviewPhotos: async () => ({}) };
    if (name === "./product-description") return description;
    if (name === "./review-product-details") return details;
    if (name === "./review-path") return { reviewPath };
    if (name === "./product-preparation-recovery") return recovery;
    throw Error(name);
  },
  exported,
  React,
);

let raw: string | null;
let denyRead: boolean;
let denyWrite: boolean;
const docEvents = new Map<string, (e: unknown) => void>();
const copy = vi.fn<(value: string) => Promise<void>>();
function remount() {
  cleanup.forEach((fn) => fn());
  cleanup = [];
  values = [];
  effects = [];
}
function page(id = "photo-03") {
  const render = () => {
    cursor = 0;
    const tree = exported.ProductPreparation!({ screenId: id });
    const pending = effects;
    effects = [];
    pending.forEach((e) => e());
    return tree;
  };
  render();
  function button(label: string) {
    const item = nodes(render()).find((n) => n.type === "button" && text(n) === label);
    if (!item) throw Error("Missing button: " + label);
    return item;
  }
  return {
    text: () => text(render()),
    input: (label: string) => {
      const item = nodes(render()).find((n) => n.type === "label" && text(n).startsWith(label));
      const input =
        item &&
        nodes(item).find((n) => n.type === "input" || n.type === "select" || n.type === "textarea");
      if (!input) throw Error("Missing input: " + label);
      return input.props;
    },
    click: (label: string) => {
      const b = button(label);
      if (!b.props.disabled) b.props.onClick?.();
    },
    disabled: (label: string) => !!button(label).props.disabled,
  };
}
beforeEach(() => {
  raw = null;
  denyRead = denyWrite = false;
  remount();
  docEvents.clear();
  copy.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal("window", {
    localStorage: {
      getItem: () => {
        if (denyRead) throw Error("denied");
        return raw;
      },
      setItem: (_: string, value: string) => {
        if (denyWrite) throw Error("denied");
        raw = value;
      },
    },
    indexedDB: {},
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal("document", {
    addEventListener: (name: string, fn: (e: unknown) => void) => docEvents.set(name, fn),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal("navigator", { clipboard: { writeText: copy } });
  vi.stubGlobal("requestAnimationFrame", (fn: () => void) => fn());
});
afterEach(() => {
  remount();
  vi.unstubAllGlobals();
});

describe("product preparation handlers", () => {
  it("reuses measurements and metadata, saves changes and copies only after the user's action", async () => {
    raw = JSON.stringify({
      ...store.createReviewState(),
      location: "内部専用の棚",
      measurements: ["44", "52", "", ""],
      details: { ...details.sampleProductDetails(), condition: "A" },
    });
    let p = page();
    expect(p.input("肩幅").value).toBe("44");
    p.input("ブランド").onChange?.({ target: { value: "架空ブランドB" } });
    expect(JSON.parse(raw!).details.brand).toBe("架空ブランドB");
    remount();
    p = page();
    expect(p.input("ブランド").value).toBe("架空ブランドB");
    p.click("出品文を見る　›");
    expect(p.input("コピーする本文").value).toContain("肩幅：44cm");
    expect(p.input("コピーする本文").value).not.toContain("内部専用の棚");
    expect(copy).not.toHaveBeenCalled();
    p.click("内容を確認してコピー");
    await Promise.resolve();
    expect(copy).toHaveBeenCalledTimes(1);
    expect(copy.mock.calls[0]![0]).toContain("架空ブランドB");
    expect(p.text()).toContain("見本文をコピーしました");
  });
  it("retains unsaved inputs and blocks copying until a quota failure is recovered", () => {
    const p = page();
    denyWrite = true;
    p.input("商品名").onChange?.({ target: { value: "消してはいけない入力" } });
    expect(p.input("商品名").value).toBe("消してはいけない入力");
    expect(raw).toBeNull();
    expect(p.text()).toContain("未保存");
    denyWrite = false;
    p.click("入力の保存を再試行");
    expect(JSON.parse(raw!).details.name).toBe("消してはいけない入力");
    p.click("出品文を見る　›");
    expect(p.disabled("内容を確認してコピー")).toBe(true);
    expect(p.text()).toContain("商品の状態を選んでください");
  });
  it("does not overwrite unread existing information when initial storage access is denied", () => {
    raw = JSON.stringify({
      ...store.createReviewState(),
      details: { ...details.sampleProductDetails(), brand: "既存の入力" },
    });
    const original = raw;
    denyRead = true;
    const p = page();
    expect(p.text()).toContain("読み込みを再試行");
    expect(raw).toBe(original);
    denyRead = false;
    p.click("読み込みを再試行");
    expect(p.input("ブランド").value).toBe("既存の入力");
  });
  it("rejects stale tabs and keeps the current text visible", () => {
    const p = page();
    raw = JSON.stringify({
      ...store.createReviewState(),
      details: { ...details.sampleProductDetails(), brand: "他画面で保存済み" },
    });
    const newer = raw;
    p.input("ブランド").onChange?.({ target: { value: "今の未保存入力" } });
    expect(raw).toBe(newer);
    expect(p.input("ブランド").value).toBe("今の未保存入力");
    expect(p.text()).toContain("別の画面で内容が変わりました");
  });
  it("recovers a stale tab after comparing values without losing either set of changes", () => {
    const p = page();
    raw = JSON.stringify({
      ...store.createReviewState(),
      location: "他画面の棚",
      details: {
        ...details.sampleProductDetails(),
        brand: "他画面のブランド",
        color: "他画面の色",
      },
    });
    p.input("ブランド").onChange?.({ target: { value: "この画面のブランド" } });
    p.click("保存済みの内容と見比べる");
    expect(p.text()).toContain("保存済み：他画面のブランド");
    expect(p.text()).toContain("この画面：この画面のブランド");
    p.click("確認して変更した項目だけ反映");
    expect(JSON.parse(raw!).details.brand).toBe("この画面のブランド");
    expect(JSON.parse(raw!).details.color).toBe("他画面の色");
    expect(JSON.parse(raw!).location).toBe("他画面の棚");
    expect(p.input("色").value).toBe("他画面の色");
    expect(p.text()).toContain("ほかの画面で保存した項目も保持");
  });
  it("requires another comparison if saved data changes while recovery is displayed", () => {
    const p = page();
    raw = JSON.stringify(store.createReviewState());
    p.input("ブランド").onChange?.({ target: { value: "未保存入力" } });
    p.click("保存済みの内容と見比べる");
    raw = JSON.stringify({ ...store.createReviewState(), location: "さらに新しい棚" });
    const newer = raw;
    p.click("確認して変更した項目だけ反映");
    expect(raw).toBe(newer);
    expect(p.input("ブランド").value).toBe("未保存入力");
    p.click("保存済みの内容と見比べる");
    p.click("確認して変更した項目だけ反映");
    expect(JSON.parse(raw!).location).toBe("さらに新しい棚");
    expect(JSON.parse(raw!).details.brand).toBe("未保存入力");
  });
  it("suppresses a late clipboard success after the source has changed", async () => {
    raw = JSON.stringify({
      ...store.createReviewState(),
      details: { ...details.sampleProductDetails(), condition: "A" },
    });
    let finish: (() => void) | undefined;
    copy.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const p = page();
    p.click("出品文を見る　›");
    p.click("内容を確認してコピー");
    p.click("商品情報");
    p.input("ブランド").onChange?.({ target: { value: "コピー後の内容" } });
    finish?.();
    await Promise.resolve();
    expect(p.text()).not.toContain("見本文をコピーしました");
  });
  it("explains clipboard denial and never claims the copy succeeded", async () => {
    raw = JSON.stringify({
      ...store.createReviewState(),
      details: { ...details.sampleProductDetails(), condition: "A" },
    });
    copy.mockRejectedValue(new Error("denied"));
    const p = page();
    p.click("出品文を見る　›");
    p.click("内容を確認してコピー");
    await Promise.resolve();
    expect(p.text()).toContain("本文を長押し");
    expect(p.text()).not.toContain("見本文をコピーしました");
  });
  it.each(["photo-01", "photo-06", "photo-07"])(
    "removes forced per-photo approval and ZIP steps at %s",
    (id) => {
      const p = page(id);
      expect(p.text()).toContain("写真加工をしなくても出品文へ進めます");
      expect(p.text()).not.toContain("正面を確認");
      expect(p.text()).not.toContain("ZIPを作成");
      expect(p.text()).not.toContain("manifest");
      expect(p.text()).toContain("出品文を見る");
    },
  );
});
