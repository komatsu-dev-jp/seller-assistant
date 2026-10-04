import React, { type ReactElement, type ReactNode } from "react";
import ts from "typescript";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import * as store from "./box-intake-store";
import * as controls from "./review-controls-state";
import { reviewPath } from "./review-path";
import * as leaseModule from "./box-intake-write-lease";
import * as productOptions from "./intake-product-options";

// Run the real component and its real input/button handlers. Native layout/touch need browser QA.
const values: unknown[] = [];
let cursor = 0;
let effects: (() => void)[] = [];
let cleanups: (() => void)[] = [];
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
    if (!(index in values)) {
      values[index] = deps;
      effects.push(() => {
        const cleanup = effect();
        if (cleanup) cleanups.push(cleanup);
      });
    }
  },
};
type Props = {
  children?: ReactNode;
  type?: string;
  disabled?: boolean;
  value?: string | number;
  checked?: boolean;
  href?: string;
  "aria-label"?: string;
  onClick?: () => void;
  onChange?: (event: { target: { value: string; checked: boolean } }) => void;
};
function expand(node: ReactElement<Props>): ReactNode {
  return typeof node.type === "function"
    ? (node.type as (props: Props) => ReactNode)(node.props)
    : node;
}
function nodes(node: ReactNode): ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!React.isValidElement<Props>(node)) return [];
  if (typeof node.type === "function") return nodes(expand(node));
  return [node, ...nodes(node.props.children)];
}
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (React.isValidElement<Props>(node))
    return typeof node.type === "function" ? text(expand(node)) : text(node.props.children);
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}
const compiled = ts.transpileModule(
  readFileSync(
    resolve(process.cwd(), "apps/web/src/components/approved-mobile/box-intake-flow.tsx"),
    "utf8",
  ),
  {
    compilerOptions: {
      jsx: ts.JsxEmit.React,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const exports: {
  BoxIntakeFlow?: (props: { screenId: string }) => ReactElement;
  IntakeProductList?: () => ReactElement;
  isBoxIntakeScreen?: (id: string) => boolean;
} = {};
new Function("require", "exports", "React", compiled)(
  (name: string) => {
    if (name === "react") return hooks;
    if (name.endsWith(".css")) return { default: new Proxy({}, { get: (_, key) => key }) };
    if (name === "./box-intake-store") return store;
    if (name === "./intake-product-options") return productOptions;
    if (name === "./review-controls-state") return controls;
    if (name === "./box-intake-write-lease") return leaseModule;
    if (name === "./review-path") return { reviewPath };
    throw Error(name);
  },
  exports,
  React,
);

const saved = new Map<string, string>();
const events = new Map<string, (event: unknown) => void>();
let denyWrite = false;
let denyRead = false;
let failNewBox = false;
let lockAvailable = true;
let legacy: string | null = null;
function remount() {
  cleanups.forEach((cleanup) => cleanup());
  cleanups = [];
  values.length = 0;
  effects = [];
  cursor = 0;
}
function screen(screenId = "box-02", list = false) {
  const render = () => {
    cursor = 0;
    const result = list ? exports.IntakeProductList!() : exports.BoxIntakeFlow!({ screenId });
    const pending = effects;
    effects = [];
    pending.forEach((effect) => effect());
    return result;
  };
  render();
  const find = (match: (node: ReactElement<Props>) => boolean) => {
    const result = nodes(render()).find(match);
    if (!result) throw Error(`Control missing; ${text(render())}`);
    return result;
  };
  return {
    text: () => text(render()),
    click: (label: string) => {
      const button = find((node) => node.type === "button" && text(node) === label);
      if (!button.props.disabled) button.props.onClick?.();
    },
    clickContaining: (label: string) => {
      const button = find((node) => node.type === "button" && text(node).includes(label));
      if (!button.props.disabled) button.props.onClick?.();
    },
    edit: (label: string, value: string) =>
      find((node) => node.props["aria-label"] === label).props.onChange?.({
        target: { value, checked: false },
      }),
    value: (label: string) => find((node) => node.props["aria-label"] === label).props.value,
    controlType: (label: string) => find((node) => node.props["aria-label"] === label).type,
    inspect: (value: string) =>
      find((node) => node.props.type === "radio" && node.props.value === value).props.onChange?.({
        target: { value, checked: true },
      }),
    verifySale: () =>
      find((node) => node.props.type === "checkbox").props.onChange?.({
        target: { value: "", checked: true },
      }),
    disabled: (label: string) =>
      find((node) => node.type === "button" && text(node) === label).props.disabled,
    links: () =>
      nodes(render())
        .filter((node) => node.type === "a")
        .map((node) => node.props.href),
  };
}
const persisted = () => store.parseIntake(saved.get(store.intakeKey) ?? null);
function startTwo() {
  const page = screen();
  page.edit("箱の仕入れ代（円）", "2000");
  page.edit("箱を受け取る送料（円）", "200");
  page.click("＋1点");
  page.click("＋1点");
  page.click("2点で確定して検品へ");
  return page;
}
function registerFirst(page: ReturnType<typeof screen>) {
  page.edit("商品名・種類（必須）", "紺のシャツ");
  page.edit("商品の状態", "一般的な中古品");
  page.inspect("sellable");
  page.click("保存して2点目へ");
}
beforeEach(() => {
  remount();
  saved.clear();
  events.clear();
  denyWrite = false;
  denyRead = false;
  failNewBox = false;
  lockAvailable = true;
  legacy = null;
  const location = { search: "" };
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => {
        if (denyRead) throw Error("denied");
        return saved.get(key) ?? null;
      },
      setItem: (key: string, value: string) => {
        if (denyWrite) throw Error("quota");
        if (failNewBox && store.parseIntake(value).boxes.length > persisted().boxes.length)
          throw Error("quota");
        saved.set(key, value);
      },
    },
    sessionStorage: { getItem: () => legacy },
    location,
    history: {
      pushState: vi.fn((_a: unknown, _b: unknown, path: string) => {
        location.search = new URL(path, "https://example.com").search;
      }),
      replaceState: vi.fn((_a: unknown, _b: unknown, path: string) => {
        location.search = new URL(path, "https://example.com").search;
      }),
    },
    confirm: vi.fn(() => true),
    addEventListener: (name: string, handler: (event: unknown) => void) =>
      events.set(name, handler),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal("document", { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal("navigator", {
    locks: {
      request: vi.fn(
        (_name: string, _options: unknown, callback: (lock: object | null) => unknown) =>
          Promise.resolve(callback(lockAvailable ? {} : null)),
      ),
    },
  });
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => {
    callback();
    return 1;
  });
});
afterEach(() => {
  remount();
  vi.unstubAllGlobals();
});

describe("box receipt production UI handlers", () => {
  it("saves a long generated title as a draft, returns from brand selection and requires shortening before registration", () => {
    const page = startTwo();
    page.edit("サイズ（任意）", "M");
    page.click("ブランドを検索・選択›");
    const brand = "A".repeat(100);
    page.edit("ブランドを検索", brand);
    page.click("入力したブランド名を使う");
    expect(window.location.search).toContain("step=item");
    expect(page.value("商品名・種類（必須）")).toBe(`${brand} M`);
    expect(page.text()).toContain("商品登録の前に短く");
    expect(persisted().boxes[0]!.items[0]!.brand).toBe(brand);
    page.edit("商品の状態", "一般的な中古品");
    page.inspect("sellable");
    page.click("保存して2点目へ");
    expect(page.text()).toContain("1点目を検品・登録");
    expect(persisted().boxes[0]!.items[0]!.registered).toBe(false);
    remount();
    const reloaded = screen();
    expect(reloaded.value("商品名・種類（必須）")).toBe(`${brand} M`);
    reloaded.edit("商品名・種類（必須）", "短く直した商品名 M");
    reloaded.click("保存して2点目へ");
    expect(reloaded.text()).toContain("2点目を検品・登録");
    expect(persisted().boxes[0]!.items[0]!.name).toBe("短く直した商品名 M");
  });
  it("selects a searchable brand on its own page and builds the product title from dropdowns", () => {
    const page = startTwo();
    page.click("ブランドを検索・選択›");
    expect(window.location.search).toContain("step=brand");
    expect(window.history.pushState).toHaveBeenCalled();
    page.edit("ブランドを検索", "Ralph");
    expect(page.text()).toContain("ラルフローレン");
    expect(page.text()).not.toContain("ユニクロ");
    page.click("ラルフローレン›");
    expect(window.location.search).toContain("step=item");
    expect(page.text()).toContain("1点目を検品・登録");
    for (const [label, value] of [
      ["対象（任意）", "レディース"],
      ["種類（任意）", "シャツ"],
      ["袖（任意）", "半袖"],
      ["色（任意）", "ネイビー"],
      ["サイズ（任意）", "M"],
    ]) {
      expect(page.controlType(label!)).toBe("select");
      page.edit(label!, value!);
    }
    expect(page.value("商品名・種類（必須）")).toBe(
      "ラルフローレン 半袖シャツ レディース ネイビー M",
    );
    remount();
    expect(screen().value("商品名・種類（必須）")).toBe(
      "ラルフローレン 半袖シャツ レディース ネイビー M",
    );
  });
  it("keeps manual names, supports custom brands and sizes, and explicitly restores automatic naming", () => {
    const page = startTwo();
    page.edit("商品名・種類（必須）", "本人が付けた名前");
    page.click("ブランドを検索・選択›");
    page.edit("ブランドを検索", "  架空ブランド  ");
    page.click("入力したブランド名を使う");
    page.edit("種類（任意）", "シャツ");
    page.edit("サイズ（任意）", "__custom__");
    page.edit("サイズを入力", "W30");
    expect(page.value("商品名・種類（必須）")).toBe("本人が付けた名前");
    page.click("選んだ内容から商品名を作り直す");
    expect(page.value("商品名・種類（必須）")).toBe("架空ブランド シャツ W30");
    page.click("架空ブランド›");
    page.click("登録で使ったブランド");
    expect(page.text()).toContain("架空ブランド");
    expect(page.text()).not.toContain("ラルフローレン");
    page.click("選択せず商品登録へ戻る");
    expect(page.value("サイズ（任意）")).toBe("W30");
  });
  it("returns to the same item on browser Back and does not leave the brand page on save failure", () => {
    const page = startTwo();
    registerFirst(page);
    page.click("ブランドを検索・選択›");
    window.location.search = window.location.search.replace("step=brand", "step=item");
    events.get("popstate")?.({});
    expect(page.text()).toContain("2点目を検品・登録");
    page.click("ブランドを検索・選択›");
    page.edit("ブランドを検索", "UNIQLO");
    denyWrite = true;
    page.click("ユニクロ›");
    expect(window.location.search).toContain("step=brand");
    expect(page.text()).toContain("未保存");
    window.location.search = window.location.search.replace("step=brand", "step=item");
    events.get("popstate")?.({});
    expect(window.location.search).toContain("step=brand");
    denyWrite = false;
    page.click("保存を再試行");
    page.click("選択せず商品登録へ戻る");
    expect(page.value("商品名・種類（必須）")).toBe("ユニクロ");
    expect(persisted().boxes[0]!.items[0]!.name).toBe("紺のシャツ");
  });
  it("confirms the count, advances to registration, and keeps two separate products", () => {
    const page = startTwo();
    expect(page.text()).toContain("1点目を検品・登録");
    registerFirst(page);
    expect(page.text()).toContain("2点目を検品・登録");
    expect(page.value("商品名・種類（必須）")).toBe("");
    page.edit("商品名・種類（必須）", "白いTシャツ");
    page.inspect("hold");
    page.click("保存して箱の一覧へ");
    expect(page.text()).toContain("箱の商品を確認");
    expect(page.text()).toContain("紺のシャツ");
    expect(page.text()).toContain("白いTシャツ");
    expect(persisted().boxes[0]!.items.map((item) => item.registered)).toEqual([true, true]);
    expect(page.text()).toContain("全点の確認後に表示");
  });
  it("requires registration, sold evidence, and all costs before showing real computed gross", () => {
    const page = startTwo();
    registerFirst(page);
    page.edit("商品名・種類（必須）", "破れた服");
    page.inspect("unsellable");
    page.click("保存して箱の一覧へ");
    page.clickContaining("紺のシャツ");
    expect(page.text()).toContain("まだ計算できません");
    page.click("＋ 販売事例を追加");
    page.edit("事例1のURL", "https://jp.mercari.com/item/m-example-1");
    page.edit("事例1の売れた価格（円）", "4000");
    expect(page.text()).not.toContain("確認済み1件");
    page.verifySale();
    page.click("安めの4,000円を見込み販売価格に使う");
    expect(page.text()).toContain("まだ計算できません");
    page.edit("発送する送料（円）", "750");
    page.edit("梱包代（円）", "50");
    expect(page.text()).toContain("1,700円");
    page.click("保存して箱の一覧へ");
    expect(page.text()).toContain("-1,100円");
    expect(page.text()).toContain("箱全体の見込み粗利600円");
    expect(store.itemProfit(persisted().boxes[0]!, 0)?.gross).toBe(1700);
  });
  it("restores the current item and unfinished input after reload", () => {
    let page = startTwo();
    registerFirst(page);
    page.edit("商品名・種類（必須）", "途中の入力");
    remount();
    page = screen();
    expect(page.text()).toContain("2点目を検品・登録");
    expect(page.value("商品名・種類（必須）")).toBe("途中の入力");
    expect(persisted().boxes[0]!.items[0]!.name).toBe("紺のシャツ");
  });
  it("does not advance or report saved on storage failure; retry preserves inputs", () => {
    const page = screen();
    page.click("＋1点");
    denyWrite = true;
    page.click("1点で確定して検品へ");
    expect(page.text()).toContain("未保存の入力があります");
    expect(page.text()).toContain("箱の中を数える");
    const event = { preventDefault: vi.fn() };
    events.get("beforeunload")?.(event);
    expect(event.preventDefault).toHaveBeenCalled();
    denyWrite = false;
    page.click("保存を再試行");
    page.click("1点で確定して検品へ");
    expect(page.text()).toContain("1点目を検品・登録");
  });
  it("rejects stale-tab writes without replacing the other tab's box", () => {
    const page = startTwo();
    const external = persisted();
    external.boxes[0]!.name = "別タブの保存";
    const raw = JSON.stringify(external);
    saved.set(store.intakeKey, raw);
    page.edit("商品名・種類（必須）", "未保存の商品");
    expect(page.text()).toContain("別の画面で保存内容が変わりました");
    expect(page.value("商品名・種類（必須）")).toBe("未保存の商品");
    page.click("3 商品一覧");
    expect(page.text()).toContain("1点目を検品・登録");
    expect(saved.get(store.intakeKey)).toBe(raw);
  });
  it("keeps the same box, item and input when switching to a smaller box cannot save", () => {
    const a = store.confirmBox({ ...store.createBox("A", "箱A"), count: 2 });
    const b = store.confirmBox({ ...store.createBox("B", "箱B"), count: 1 });
    a.items[1]!.name = "2点目の入力";
    a.items[1]!.nameMode = "manual";
    saved.set(store.intakeKey, JSON.stringify({ version: 2, activeBoxId: "A", boxes: [a, b] }));
    window.location.search = "?box=A&step=item&item=1";
    const page = screen();
    denyWrite = true;
    page.click("箱B · 1点");
    expect(page.text()).toContain("2点目を検品・登録");
    expect(page.value("商品名・種類（必須）")).toBe("2点目の入力");
    expect(persisted().activeBoxId).toBe("A");
    denyWrite = false;
    page.click("箱B · 1点");
    expect(page.text()).toContain("箱の商品を確認");
    expect(persisted().activeBoxId).toBe("B");
  });
  it("does not switch into an unsaved new box even if the current box saved successfully", () => {
    const page = startTwo();
    registerFirst(page);
    page.edit("商品名・種類（必須）", "この入力を維持");
    failNewBox = true;
    page.click("別の箱を登録する");
    expect(page.text()).toContain("2点目を検品・登録");
    expect(page.value("商品名・種類（必須）")).toBe("この入力を維持");
    expect(persisted().boxes).toHaveLength(1);
    failNewBox = false;
    page.click("別の箱を登録する");
    expect(page.text()).toContain("箱の中を数える");
    expect(persisted().boxes).toHaveLength(2);
  });
  it("does not load or expose editable inputs without exclusive browser write access", () => {
    lockAvailable = false;
    const page = screen();
    expect(page.text()).toContain("別のタブで箱を編集中です");
    expect(saved.size).toBe(0);
    expect(page.text()).not.toContain("箱の中を数える");
    lockAvailable = true;
    page.click("読み込みを再試行");
    expect(page.text()).toContain("箱の中を数える");
    expect(navigator.locks.request).toHaveBeenCalledWith(
      leaseModule.intakeWriteLock,
      { mode: "exclusive", ifAvailable: true },
      expect.any(Function),
    );
  });
  it("keeps existing entered products when the count is changed", () => {
    const page = startTwo();
    registerFirst(page);
    page.edit("商品名・種類（必須）", "2点目の入力");
    page.click("1 点数");
    page.click("−1点");
    expect(page.text()).toContain("入力済みの商品が消えるため");
    expect(page.value("入っている点数")).toBe(2);
    page.click("＋1点");
    expect(persisted().boxes[0]!.count).toBe(3);
    expect(persisted().boxes[0]!.items[1]!.name).toBe("2点目の入力");
    page.click("3点で確定して検品へ");
    expect(page.text()).toContain("2点目を検品・登録");
  });
  it("keeps multiple boxes separate and exposes them from the product list", () => {
    let page = startTwo();
    registerFirst(page);
    page.click("別の箱を登録する");
    expect(page.value("入っている点数")).toBe(0);
    page.edit("箱の名前・番号", "2箱目");
    page.click("＋1点");
    page.click("1点で確定して検品へ");
    expect(page.value("商品名・種類（必須）")).toBe("");
    expect(persisted().boxes).toHaveLength(2);
    expect(persisted().boxes[0]!.items[0]!.name).toBe("紺のシャツ");
    remount();
    page = screen("", true);
    expect(page.text()).toContain("2箱目");
    expect(page.links().filter((link) => link?.includes("&step=list"))).toHaveLength(2);
  });
  it("migrates only the old count and leaves all old review data untouched", () => {
    legacy = JSON.stringify({ ...controls.initialControls(), count: 2 });
    const old = legacy;
    const page = screen();
    expect(page.text()).toContain("以前に数えた2点を引き継ぎました");
    page.click("2点で確定して検品へ");
    expect(persisted().boxes[0]!.items).toHaveLength(2);
    expect(legacy).toBe(old);
    expect([...saved.keys()]).toEqual([store.intakeKey]);
  });
  it("does not allow zero-count completion or incomplete product registration", () => {
    const page = screen();
    expect(page.disabled("1点以上を数えてください")).toBe(true);
    page.click("＋1点");
    page.click("1点で確定して検品へ");
    page.click("保存して箱の一覧へ");
    expect(page.text()).toContain("商品名を1〜100文字");
    expect(page.text()).toContain("1点目を検品・登録");
    expect(persisted().boxes[0]!.items[0]!.registered).toBe(false);
  });
  it("never overwrites damaged saved data and can retry a temporary read error", () => {
    saved.set(store.intakeKey, "broken");
    let page = screen();
    expect(page.text()).toContain("元の保存内容は変更していません");
    expect(saved.get(store.intakeKey)).toBe("broken");
    remount();
    saved.clear();
    denyRead = true;
    page = screen();
    expect(page.text()).toContain("読み込みを再試行");
    denyRead = false;
    page.click("読み込みを再試行");
    expect(page.text()).toContain("箱の中を数える");
  });
  it("routes every legacy intake page to the new flow before the old confirmation-only flow", () => {
    for (const id of ["box-01", "box-02", "box-03", "box-04", "box-05"])
      expect(exports.isBoxIntakeScreen!(id)).toBe(true);
    expect(exports.isBoxIntakeScreen!("box-06")).toBe(false);
    const integration = readFileSync(
      resolve(process.cwd(), "apps/web/src/components/approved-mobile/approved-mobile-demo.tsx"),
      "utf8",
    );
    expect(integration.indexOf("<BoxIntakeFlow")).toBeLessThan(
      integration.indexOf("<ReportedReviewFlow"),
    );
    expect(integration).toContain("<IntakeProductList />");
  });
});
