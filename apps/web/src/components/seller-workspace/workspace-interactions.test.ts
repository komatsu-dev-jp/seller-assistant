import React, { type ReactElement, type ReactNode } from "react";
import ts from "typescript";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as intake from "../approved-mobile/box-intake-store";
import * as lease from "../approved-mobile/box-intake-write-lease";
import * as routes from "../approved-mobile/review-workflow-routes";
import * as paths from "../approved-mobile/review-path";
import * as commerce from "./sales-store";
import * as controls from "../approved-mobile/review-controls-state";
import * as accountingView from "../approved-mobile/accounting-settings-view";

// Execute production JSX handlers and domain functions. This does not replace
// native dialog, input preservation, accessibility, or visual browser verification.
type Props = {
  children?: ReactNode;
  title?: string;
  name?: string;
  type?: string;
  value?: string | number;
  max?: number;
  disabled?: boolean;
  role?: string;
  "aria-label"?: string;
  onClick?: (event: unknown) => void;
  onChange?: (event: { target: { value: string } }) => void;
  onSubmit?: (event: unknown) => void;
};
type Tab = "home" | "products" | "shipping" | "reports" | "settings";
const values: unknown[] = [];
let cursor = 0;
let effects: (() => void)[] = [];
const cleanup = new Map<number, () => void>();
const hooks = {
  useState(initial: unknown) {
    const index = cursor++;
    if (!(index in values)) values[index] = typeof initial === "function" ? initial() : initial;
    return [
      values[index],
      (next: unknown) => {
        values[index] = typeof next === "function" ? next(values[index]) : next;
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
    const previous = values[index] as unknown[] | undefined;
    if (!previous || deps.some((value, i) => !Object.is(previous[i], value))) {
      values[index] = deps;
      effects.push(() => {
        cleanup.get(index)?.();
        const dispose = effect();
        if (dispose) cleanup.set(index, dispose);
      });
    }
  },
};
const modules = new Map<string, unknown>();
function load(name: string): unknown {
  if (name === "react") return hooks;
  if (name.endsWith(".css")) return { default: new Proxy({}, { get: (_, key) => key }) };
  if (name.endsWith("/box-intake-store")) return intake;
  if (name.endsWith("/box-intake-write-lease")) return lease;
  if (name.endsWith("/review-workflow-routes")) return routes;
  if (name.endsWith("/review-path")) return paths;
  if (name.endsWith("/review-controls-state")) return controls;
  if (name.endsWith("/accounting-settings-view")) return accountingView;
  if (name === "./sales-store") return commerce;
  if (modules.has(name)) return modules.get(name);
  if (!["./seller-workspace", "./navigation", "./sample-data", "./product-adapter"].includes(name))
    throw new Error(`Unexpected production import: ${name}`);
  const extension = ["./seller-workspace", "./navigation"].includes(name) ? "tsx" : "ts";
  const source = readFileSync(
    resolve(
      process.cwd(),
      `apps/web/src/components/seller-workspace/${name.slice(2)}.${extension}`,
    ),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.React,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const exports: Record<string, unknown> = {};
  new Function("require", "exports", "React", compiled)(load, exports, React);
  modules.set(name, exports);
  return exports;
}
const { SellerWorkspace } = load("./seller-workspace") as {
  SellerWorkspace: (props: { initialTab: Tab }) => ReactElement;
};
function expand(node: ReactNode): ReactNode {
  if (Array.isArray(node)) return node.map(expand);
  if (!React.isValidElement<Props>(node)) return node;
  if (typeof node.type === "function") {
    // Native dialog lifecycle is browser-owned; retain its actual production children.
    if (node.type.name === "Modal")
      return React.createElement(
        "dialog",
        { "aria-label": node.props.title },
        expand(node.props.children),
      );
    return expand((node.type as (props: Props) => ReactNode)(node.props));
  }
  return React.cloneElement(node, {}, expand(node.props.children));
}
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
const saved = new Map<string, string>();
let denyWrite = false;
let lockAvailable = true;
const setItem = vi.fn((key: string, value: string) => {
  if (denyWrite) throw new Error("quota");
  saved.set(key, value);
});
function page(initialTab: Tab = "home") {
  const render = () => {
    cursor = 0;
    const tree = expand(SellerWorkspace({ initialTab }));
    const pending = effects;
    effects = [];
    pending.forEach((effect) => effect());
    return tree;
  };
  render();
  const find = (predicate: (node: ReactElement<Props>) => boolean) => {
    const found = nodes(render()).find(predicate);
    if (!found) throw new Error(`Control not found: ${text(render())}`);
    return found;
  };
  const event = {
    preventDefault: vi.fn(),
    button: 0,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
  };
  return {
    text: () => text(render()),
    click: (label: string) => {
      const control = find(
        (node) =>
          node.type === "button" && (text(node) === label || node.props["aria-label"] === label),
      );
      if (!control.props.disabled) control.props.onClick?.(event);
    },
    navigate: (label: string) =>
      find((node) => node.type === "a" && text(node) === label).props.onClick?.(event),
    change: (predicate: (node: ReactElement<Props>) => boolean, value: string) =>
      find(predicate).props.onChange?.({ target: { value } }),
    submit: (fields: Record<string, string>) =>
      find((node) => node.type === "form").props.onSubmit?.({
        preventDefault: vi.fn(),
        currentTarget: fields,
      }),
    dialogs: () => nodes(render()).filter((node) => node.type === "dialog").length,
    progress: () => nodes(render()).filter((node) => node.type === "progress"),
    alerts: () =>
      nodes(render())
        .filter((node) => node.props.role === "alert")
        .map(text)
        .join(""),
  };
}
async function settle() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}
function seedProduct() {
  const box = intake.confirmBox({
    ...intake.createBox("box"),
    count: 1,
    purchaseYen: "1000",
    inboundShippingYen: "0",
  });
  box.items[0] = {
    ...intake.createItem("product-1"),
    name: "架空の赤シャツ",
    condition: "中古",
    registered: true,
    inspection: "sellable",
  };
  const state = { version: 2 as const, activeBoxId: box.id, boxes: [box] };
  saved.set(intake.intakeKey, JSON.stringify(state));
}
const fields = () => ({
  channel: "メルカリ",
  soldOn: "2026-10-20",
  deadline: "2026-10-22",
  price: "5000",
  cost: "1000",
  fee: "500",
  shipping: "210",
  packing: "50",
});
function openSale(screen: ReturnType<typeof page>) {
  screen.click("売れたを記録");
  screen.change((node) => node.type === "select" && !node.props.name, "product-1");
}
function persisted() {
  return commerce.parseCommerce(saved.get(commerce.commerceKey) ?? null);
}
beforeEach(() => {
  values.length = 0;
  cursor = 0;
  effects = [];
  saved.clear();
  setItem.mockClear();
  denyWrite = false;
  lockAvailable = true;
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 20, 12));
  const location = { search: "", pathname: "/mobile/screens/04/" };
  vi.stubGlobal("window", {
    sessionStorage: { getItem: (key: string) => saved.get(key) ?? null },
    localStorage: { getItem: (key: string) => saved.get(key) ?? null, setItem },
    location,
    history: {
      pushState: vi.fn((_state: unknown, _title: unknown, path: string) => {
        const url = new URL(path, "https://example.com");
        location.search = url.search;
        location.pathname = url.pathname;
      }),
    },
    confirm: vi.fn(() => true),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    scrollTo: vi.fn(),
  });
  vi.stubGlobal("navigator", {
    locks: {
      request: vi.fn(
        (_name: string, _options: unknown, callback: (lock: object | null) => unknown) =>
          Promise.resolve(callback(lockAvailable ? {} : null)),
      ),
    },
  });
  vi.stubGlobal(
    "FormData",
    class {
      constructor(private readonly fields: Record<string, string>) {}
      get(key: string) {
        return this.fields[key] ?? null;
      }
    },
  );
});
afterEach(() => {
  cleanup.forEach((dispose) => dispose());
  cleanup.clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("seller workspace production interaction handlers", () => {
  it("reads accounting status without writing or confusing tab-only settings with local records", () => {
    const state = { ...controls.initialControls(), settings: ["青色申告", "免税", "", ""] };
    const raw = JSON.stringify(state);
    saved.set(controls.controlsKey, raw);
    const screen = page("settings");
    expect(screen.text()).toContain("初期設定の進捗2 / 3 完了");
    expect(screen.text()).toContain("会計年度の設定が残っています。");
    expect(screen.progress()[0]?.props).toMatchObject({ value: 2, max: 3 });
    expect(screen.text()).toContain("青色申告");
    expect(screen.text()).toContain("会計・税務");
    expect(screen.text()).toContain("データ管理");
    expect(screen.text()).toContain("アプリ・ヘルプ");
    expect(screen.text()).toContain("使い方・操作見本");
    expect(screen.text()).toContain("アプリについて");
    expect(screen.text()).toContain("税務上の正しさを示すものではありません。");
    expect(saved.get(controls.controlsKey)).toBe(raw);
    expect(setItem).not.toHaveBeenCalled();
  });
  it("shows unreadable accounting state without overwriting it or blocking other settings", () => {
    saved.set(controls.controlsKey, "{broken");
    const screen = page("settings");
    expect(screen.text()).toContain("読取不可");
    expect(screen.text()).not.toContain("0 / 3項目");
    expect(screen.progress()).toEqual([]);
    expect(screen.text()).toContain("記録の控えを保存");
    expect(saved.get(controls.controlsKey)).toBe("{broken");
    expect(setItem).not.toHaveBeenCalled();
  });
  it.each([
    {
      settings: ["", "", "", ""],
      completed: 0,
      message: "申告区分・消費税区分・会計年度の設定が残っています。",
    },
    {
      settings: ["青色申告", "免税", "2026-01-01", "2026-12-31"],
      completed: 3,
      message: "すべての項目が入力されています。",
    },
    {
      settings: ["青色申告", "免税", "2026-12-31", "2026-01-01"],
      completed: 2,
      message: "会計年度の設定が残っています。",
    },
  ])(
    "shows the real setup progress for $completed completed groups",
    ({ settings, completed, message }) => {
      const raw = JSON.stringify({ ...controls.initialControls(), settings });
      saved.set(controls.controlsKey, raw);
      const screen = page("settings");
      expect(screen.progress()[0]?.props).toMatchObject({ value: completed, max: 3 });
      expect(screen.text()).toContain(message);
      expect(saved.get(controls.controlsKey)).toBe(raw);
      expect(setItem).not.toHaveBeenCalled();
    },
  );
  it("downloads the same backup payload without adding accounting settings or changing storage", async () => {
    seedProduct();
    saved.set(
      controls.controlsKey,
      JSON.stringify({ ...controls.initialControls(), settings: ["青色申告", "免税", "", ""] }),
    );
    const blobs: Blob[] = [];
    const click = vi.fn();
    const link = { href: "", download: "", click };
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      blobs.push(blob as Blob);
      return "blob:backup-test";
    });
    vi.stubGlobal("document", { createElement: () => link });
    window.setTimeout = vi.fn() as unknown as typeof window.setTimeout;
    const before = new Map(saved);
    const screen = page("settings");
    screen.click("記録の控えを保存");
    expect(click).toHaveBeenCalledOnce();
    expect(link.download).toBe("seller-records-2026-10-20.json");
    const backup = JSON.parse(await blobs[0]!.text());
    expect(Object.keys(backup)).toEqual(["scope", "exportedAt", "intake", "commerce"]);
    expect(backup.scope).toBe("seller-workspace-backup");
    expect(backup.intake).toEqual(intake.parseIntake(saved.get(intake.intakeKey) ?? null));
    expect(backup.commerce).toEqual(commerce.emptyCommerce());
    expect(saved).toEqual(before);
    expect(setItem).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
  it("reads existing products, searches them, and never rewrites intake", () => {
    seedProduct();
    const original = saved.get(intake.intakeKey);
    const screen = page("products");
    expect(screen.text()).toContain("架空の赤シャツ");
    screen.change((node) => node.props["aria-label"] === "商品を検索", "不一致");
    expect(screen.text()).not.toContain("架空の赤シャツ");
    expect(screen.text()).toContain("条件に一致する商品はありません");
    screen.change((node) => node.props["aria-label"] === "商品を検索", "赤シャツ");
    expect(screen.text()).toContain("架空の赤シャツ");
    expect(saved.get(intake.intakeKey)).toBe(original);
    expect(setItem).not.toHaveBeenCalled();
  });

  it("keeps sample actions isolated and returns to unchanged personal records", async () => {
    seedProduct();
    const original = [...saved.entries()];
    const screen = page();
    screen.click("見本を見る");
    expect(screen.text()).toContain("見本データ");
    screen.navigate("発送");
    screen.click("梱包した");
    screen.click("確認して進捗を保存");
    await settle();
    expect(screen.text()).toContain("発送待ち");
    expect(screen.text()).toContain("保存はしません");
    screen.click("自分の記録へ");
    screen.navigate("商品");
    expect(screen.text()).toContain("架空の赤シャツ");
    expect(screen.text()).not.toContain("トートバッグ");
    expect([...saved.entries()]).toEqual(original);
    expect(setItem).not.toHaveBeenCalled();
  });

  it("records a sale, shows shipping and reports, then advances only after confirmation", async () => {
    seedProduct();
    const screen = page();
    openSale(screen);
    screen.submit(fields());
    await settle();
    expect(screen.dialogs()).toBe(0);
    expect(screen.text()).toContain("梱包した");
    expect(screen.text()).toContain("このブラウザーに保存しました");
    expect(persisted().sales[0]).toMatchObject({
      productId: "product-1",
      stage: "unpacked",
      priceYen: 5000,
    });
    screen.click("梱包した");
    expect(screen.dialogs()).toBe(1);
    expect(persisted().sales[0]?.stage).toBe("unpacked");
    screen.click("確認して進捗を保存");
    await settle();
    expect(window.confirm).not.toHaveBeenCalled();
    expect(persisted().sales[0]?.stage).toBe("packed");
    screen.navigate("レポート");
    expect(screen.text()).toContain("¥3,240");
    expect(screen.text()).toContain("¥5,000");
    expect(setItem.mock.calls.every(([key]) => key === commerce.commerceKey)).toBe(true);
  });

  it("requires in-app confirmation for every shipping step and one-step rollback", async () => {
    seedProduct();
    const screen = page();
    openSale(screen);
    screen.submit(fields());
    await settle();
    for (const [action, from, to] of [
      ["梱包した", "unpacked", "packed"],
      ["発送した", "packed", "shipped"],
      ["入金を確認した", "shipped", "paid"],
    ] as const) {
      const calls = setItem.mock.calls.length;
      screen.click(action);
      await settle();
      expect(screen.dialogs()).toBe(1);
      expect(persisted().sales[0]?.stage).toBe(from);
      expect(setItem).toHaveBeenCalledTimes(calls);
      screen.click("変更せず戻る");
      expect(screen.dialogs()).toBe(0);
      expect(persisted().sales[0]?.stage).toBe(from);
      expect(setItem).toHaveBeenCalledTimes(calls);
      screen.click(action);
      screen.click("確認して進捗を保存");
      await settle();
      expect(screen.dialogs()).toBe(0);
      expect(persisted().sales[0]?.stage).toBe(to);
      expect(setItem).toHaveBeenCalledTimes(calls + 1);
    }
    expect(screen.text()).toContain("入金確認まで完了しました");
    screen.click("記録の詳細・進捗の訂正 ›");
    const calls = setItem.mock.calls.length;
    screen.click("進捗を1段階戻して訂正");
    await settle();
    expect(persisted().sales[0]?.stage).toBe("paid");
    expect(setItem).toHaveBeenCalledTimes(calls);
    screen.click("確認して進捗を保存");
    await settle();
    expect(persisted().sales[0]?.stage).toBe("shipped");
    expect(setItem).toHaveBeenCalledTimes(calls + 1);
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it("amends sale costs through its detail form and recomputes reports without duplicating the sale", async () => {
    seedProduct();
    const screen = page();
    openSale(screen);
    screen.submit(fields());
    await settle();
    screen.click("梱包した");
    screen.click("確認して進捗を保存");
    await settle();
    const original = persisted().sales[0]!;
    const calls = setItem.mock.calls.length;
    screen.click("記録の詳細・進捗の訂正 ›");
    screen.click("売上の金額・日付を訂正");
    expect(screen.dialogs()).toBe(1);
    expect(screen.text()).toContain("確認して訂正を保存");
    expect(setItem).toHaveBeenCalledTimes(calls);
    screen.submit({
      ...fields(),
      price: "6000",
      cost: "1200",
      fee: "600",
      shipping: "300",
      packing: "100",
    });
    await settle();
    expect(screen.dialogs()).toBe(0);
    expect(persisted().sales).toHaveLength(1);
    expect(persisted().sales[0]).toMatchObject({
      id: original.id,
      productId: original.productId,
      stage: "packed",
      priceYen: 6000,
      costYen: 1200,
      feeYen: 600,
      shippingYen: 300,
      packingYen: 100,
    });
    screen.navigate("レポート");
    expect(screen.text()).toContain("¥6,000");
    expect(screen.text()).toContain("¥3,800");
    expect(screen.text()).not.toContain("¥3,240");
    screen.navigate("ホーム");
    expect(screen.text()).toContain("¥3,800");
  });

  it("keeps an amendment open and its prior saved amount unchanged on save failure", async () => {
    seedProduct();
    const screen = page();
    openSale(screen);
    screen.submit(fields());
    await settle();
    const raw = saved.get(commerce.commerceKey);
    screen.click("記録の詳細・進捗の訂正 ›");
    screen.click("売上の金額・日付を訂正");
    denyWrite = true;
    screen.submit({ ...fields(), fee: "900" });
    await settle();
    expect(screen.dialogs()).toBe(1);
    expect(screen.text()).toContain("確認して訂正を保存");
    expect(screen.alerts()).toContain("入力は残っています");
    expect(saved.get(commerce.commerceKey)).toBe(raw);
    expect(screen.text()).not.toContain("このブラウザーに保存しました");
    denyWrite = false;
    screen.submit({ ...fields(), fee: "900" });
    await settle();
    expect(screen.dialogs()).toBe(0);
    expect(persisted().sales).toHaveLength(1);
    expect(persisted().sales[0]?.feeYen).toBe(900);
  });

  it("keeps failed sale forms mounted without success and retries the same supplied values", async () => {
    seedProduct();
    const screen = page();
    openSale(screen);
    const input = fields();
    denyWrite = true;
    screen.submit(input);
    await settle();
    expect(screen.dialogs()).toBe(1);
    expect(screen.alerts()).toContain("入力は残っています");
    expect(screen.text()).not.toContain("このブラウザーに保存しました");
    expect(persisted().sales).toEqual([]);
    expect(input).toEqual(fields());
    denyWrite = false;
    screen.submit(input);
    await settle();
    expect(screen.dialogs()).toBe(0);
    expect(persisted().sales[0]?.priceYen).toBe(5000);
  });

  it.each([intake.intakeKey, commerce.commerceKey])(
    "blocks personal actions for malformed %s",
    (key) => {
      saved.set(key, "{broken");
      const screen = page();
      expect(screen.alerts()).not.toBe("");
      expect(screen.text()).toContain("読み込みを再試行");
      expect(screen.text()).not.toContain("売れたを記録");
      expect(setItem).not.toHaveBeenCalled();
      expect(saved.get(key)).toBe("{broken");
    },
  );

  it("refuses stale commerce writes without closing the sale form or overwriting new records", async () => {
    seedProduct();
    const screen = page();
    openSale(screen);
    const concurrent = commerce.addExpense(commerce.emptyCommerce(), {
      id: "other",
      title: "別画面の架空経費",
      date: "2026-10-20",
      amountYen: 100,
    });
    const raw = JSON.stringify(concurrent);
    saved.set(commerce.commerceKey, raw);
    screen.submit(fields());
    await settle();
    expect(screen.dialogs()).toBe(1);
    expect(screen.alerts()).toContain("別の画面");
    expect(saved.get(commerce.commerceKey)).toBe(raw);
    expect(setItem).not.toHaveBeenCalled();
  });

  it("does not change the current-month home totals when reports select a previous month", async () => {
    seedProduct();
    const screen = page();
    openSale(screen);
    screen.submit(fields());
    await settle();
    screen.navigate("レポート");
    screen.change((node) => node.props.type === "month", "2026-09");
    expect(screen.text()).toContain("この月の売上記録はありません");
    expect(screen.text()).not.toContain("¥3,240");
    screen.navigate("ホーム");
    expect(screen.text()).toContain("今月の利益");
    expect(screen.text()).toContain("¥3,240");
  });

  it("rejects blank fees and unavailable locks without silently saving defaults", async () => {
    seedProduct();
    const screen = page();
    openSale(screen);
    screen.submit({ ...fields(), fee: "" });
    await settle();
    expect(screen.alerts()).toContain("整数");
    expect(setItem).not.toHaveBeenCalled();
    lockAvailable = false;
    screen.submit(fields());
    await settle();
    expect(screen.alerts()).toContain("別のタブ");
    expect(screen.dialogs()).toBe(1);
    expect(setItem).not.toHaveBeenCalled();
  });
});
