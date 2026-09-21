import { readFileSync } from "node:fs";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as contracts from "@resale/contracts";
import * as helpers from "../lib/sales-check";

type Element = {
  type: string | ((props: unknown) => Element);
  props: Record<string, unknown>;
  key?: string;
};
const source = readFileSync(new URL("./sales-check-panel.tsx", import.meta.url), "utf8");
const workspaceId = "81111111-1111-4111-8111-111111111111";
const skuId = "82222222-2222-4222-8222-222222222222";
const path = `/v1/workspaces/${workspaceId}/skus/${skuId}/sales-checks`;
const record: contracts.SalesCheckResponse = {
  observationId: "84444444-4444-4444-8444-444444444444",
  workspaceId,
  skuId,
  listingDays: null,
  currentPriceYen: 0,
  viewCount: null,
  searchCount: null,
  likeCount: null,
  priceReductionRequestCount: null,
  checkedOn: "2026-09-21",
  nextCheckOn: "2026-09-22",
  inputSource: "official_page_human_checked",
  confirmedBy: workspaceId,
  savedAt: "2026-09-21T00:00:00.000Z",
};
const summary = (latest: contracts.SalesCheckResponse | null = null) => ({
  workspaceId,
  skuId,
  eligible: true,
  latest,
  recordCount: latest ? 1 : 0,
});
const response = (body: unknown, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => body,
});
async function flush() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

// Execute the real component with a minimal hook/JSX host; no source-string assertions for behavior.
function mount(props = { workspaceId, skuId, pilotActive: false }) {
  const slots: unknown[] = [];
  const cleanups: Array<() => void> = [];
  let cursor = 0;
  const effects: Array<() => void | (() => void)> = [];
  const react = {
    useState(initial: unknown) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [
        slots[index],
        (value: unknown) => {
          slots[index] = typeof value === "function" ? value(slots[index]) : value;
        },
      ];
    },
    useRef(initial: unknown) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useEffect(effect: () => void | (() => void), deps: unknown[]) {
      const index = cursor++;
      if (JSON.stringify(slots[index]) !== JSON.stringify(deps)) {
        slots[index] = deps;
        effects.push(effect);
      }
    },
  };
  const jsx = (type: Element["type"], elementProps: Element["props"], key?: string) => ({
    type,
    props: elementProps,
    key,
  });
  const exports: { SalesCheckPanel?: (props: unknown) => Element } = {};
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  new Function("require", "exports", compiled)((name: string) => {
    if (name === "react") return react;
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
    if (name === "@resale/contracts") return contracts;
    if (name === "../lib/sales-check") return helpers;
    if (name.endsWith(".css")) return {};
    throw new Error(name);
  }, exports);
  function render() {
    cursor = 0;
    const wrapper = exports.SalesCheckPanel!(props);
    const tree = (wrapper.type as (props: unknown) => Element)(wrapper.props);
    for (const effect of effects.splice(0)) {
      const cleanup = effect();
      if (cleanup) cleanups.push(cleanup);
    }
    return tree;
  }
  return {
    render,
    unmount() {
      for (const cleanup of cleanups) cleanup();
    },
  };
}
function elements(tree: unknown): Element[] {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(elements);
  const node = tree as Element;
  return [node, ...elements(node.props?.children)];
}
function text(tree: unknown): string {
  if (typeof tree === "string" || typeof tree === "number") return String(tree);
  if (Array.isArray(tree)) return tree.map(text).join("");
  return tree && typeof tree === "object" ? text((tree as Element).props.children) : "";
}
function button(tree: Element, label: string) {
  const found = elements(tree).find((node) => node.type === "button" && text(node).includes(label));
  if (!found) throw new Error(`Button missing: ${label}`);
  return found;
}
function input(tree: Element, label: string) {
  const node = elements(tree).find(
    (element) => element.type === "label" && text(element).startsWith(label),
  );
  const found = elements(node).find((element) => element.type === "input");
  if (!found) throw new Error(`Input missing: ${label}`);
  return found;
}
function fill(host: ReturnType<typeof mount>, label: string, value: string) {
  (input(host.render(), label).props.onChange as (event: unknown) => void)({ target: { value } });
}
afterEach(() => {
  const pending = helpers.pendingSalesCheck(path);
  if (pending) helpers.completeSalesCheck(path, pending.idempotencyKey);
  vi.unstubAllGlobals();
});
describe("sales check panel behavior", () => {
  it("recovers an initial 503 through a read-only reload", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(null, 503))
      .mockResolvedValueOnce(response(summary(record)));
    vi.stubGlobal("fetch", fetch);
    const host = mount();
    host.render();
    await flush();
    (button(host.render(), "もう一度読み込む").props.onClick as () => void)();
    host.render();
    await flush();
    expect(text(host.render())).toContain("保存済み");
    expect(fetch.mock.calls.every((call) => !call[1]?.method)).toBe(true);
    host.unmount();
  });
  it("keeps a delayed save scoped to the old SKU when the selection changes", async () => {
    let resolve!: (value: unknown) => void;
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(summary()))
      .mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      )
      .mockResolvedValueOnce(
        response({ ...summary(), skuId: record.observationId, eligible: false }),
      )
      .mockResolvedValueOnce(response(summary(record)));
    vi.stubGlobal("fetch", fetch);
    const old = mount();
    old.render();
    await flush();
    fill(old, "確認日", "2026-09-21");
    fill(old, "次回確認日", "2026-09-22");
    (button(old.render(), "入力内容を保存").props.onClick as () => void)();
    old.unmount();
    const current = mount({ workspaceId, skuId: record.observationId, pilotActive: false });
    current.render();
    await flush();
    resolve(response(record, 201));
    await flush();
    expect(text(current.render())).toContain("先に公開後の商品URL");
    expect(text(current.render())).not.toContain("保存済み");
    expect(fetch.mock.calls[3]?.[0]).toBe(path);
    current.unmount();
  });
  it("keeps the original retry key when an old save finishes after returning to the SKU", async () => {
    let resolveOldPost!: (value: unknown) => void;
    const otherSkuId = record.observationId;
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(summary()))
      .mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolveOldPost = done;
          }),
      )
      .mockResolvedValueOnce(response({ ...summary(), skuId: otherSkuId, eligible: false }))
      .mockResolvedValueOnce(response(summary()))
      .mockResolvedValueOnce(response(summary(record)))
      .mockResolvedValueOnce(response(record, 201))
      .mockResolvedValueOnce(response(summary(record)));
    vi.stubGlobal("fetch", fetch);

    const old = mount();
    old.render();
    await flush();
    fill(old, "確認日", "2026-09-21");
    fill(old, "次回確認日", "2026-09-22");
    (button(old.render(), "入力内容を保存").props.onClick as () => void)();
    const firstPayload = fetch.mock.calls[1]![1].body;
    old.unmount();

    const other = mount({ workspaceId, skuId: otherSkuId, pilotActive: false });
    other.render();
    await flush();
    other.unmount();

    const returned = mount();
    returned.render();
    await flush();
    expect(text(returned.render())).toContain("同じ内容で保存結果を確認");

    resolveOldPost(response(record, 201));
    await flush();
    expect(helpers.pendingSalesCheck(path)).toBeDefined();
    expect(text(returned.render())).toContain("同じ内容で保存結果を確認");

    (button(returned.render(), "同じ内容で保存結果を確認").props.onClick as () => void)();
    await flush();
    const posts = fetch.mock.calls.filter((call) => call[1]?.method === "POST");
    expect(posts).toHaveLength(2);
    expect(posts[1]![1].body).toBe(firstPayload);
    expect(text(returned.render())).toContain("保存済み");
    returned.unmount();
  });
  it("loads, preserves blank versus zero, saves and rereads all persisted fields", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(summary()))
      .mockResolvedValueOnce(response(record, 201))
      .mockResolvedValueOnce(response(summary(record)));
    vi.stubGlobal("fetch", fetch);
    const host = mount();
    expect(text(host.render())).toContain("読み込んでいます");
    await flush();
    fill(host, "現在価格", "0");
    fill(host, "確認日", "2026-09-21");
    fill(host, "次回確認日", "2026-09-22");
    (button(host.render(), "入力内容を保存").props.onClick as () => void)();
    expect(text(host.render())).toContain("保存して");
    await flush();
    const payload = JSON.parse(fetch.mock.calls[1]![1].body as string);
    expect(payload.currentPriceYen).toBe("0");
    expect(payload.viewCount).toBeNull();
    const rendered = text(host.render());
    expect(rendered).toContain("保存済み");
    expect(rendered).toContain("履歴 1件");
    expect(rendered).toContain("ログイン中の管理担当");
    expect(rendered).not.toContain(record.confirmedBy);
    expect(rendered).toContain(record.nextCheckOn);
    expect(button(host.render(), "入力内容を保存").props.disabled).toBe(true);
    host.unmount();
  });
  it("keeps every value when multiple fields change before React renders again", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response(summary(record)));
    vi.stubGlobal("fetch", fetch);
    const host = mount();
    host.render();
    await flush();
    const sameRender = host.render();
    (input(sameRender, "現在価格").props.onChange as (event: unknown) => void)({
      target: { value: "9965" },
    });
    (input(sameRender, "次回確認日").props.onChange as (event: unknown) => void)({
      target: { value: "2026-09-24" },
    });
    const updated = host.render();
    expect(input(updated, "現在価格").props.value).toBe("9965");
    expect(input(updated, "次回確認日").props.value).toBe("2026-09-24");
    host.unmount();
  });
  it.each(["post-loss", "get-loss"])(
    "reuses the identical key after %s, even after a SKU unmount",
    async (failure) => {
      const fetch = vi.fn().mockResolvedValueOnce(response(summary()));
      if (failure === "post-loss") fetch.mockRejectedValueOnce(new Error("lost"));
      else
        fetch
          .mockResolvedValueOnce(response(record, 201))
          .mockResolvedValueOnce(response(null, 503));
      vi.stubGlobal("fetch", fetch);
      const host = mount();
      host.render();
      await flush();
      fill(host, "確認日", "2026-09-21");
      fill(host, "次回確認日", "2026-09-22");
      (button(host.render(), "入力内容を保存").props.onClick as () => void)();
      await flush();
      expect(elements(host.render()).find((node) => node.type === "fieldset")?.props.disabled).toBe(
        true,
      );
      const firstPayload = fetch.mock.calls[1]![1].body;
      host.unmount();
      fetch
        .mockResolvedValueOnce(response(summary(record)))
        .mockResolvedValueOnce(response(record, 201))
        .mockResolvedValueOnce(response(summary(record)));
      const remounted = mount();
      remounted.render();
      await flush();
      (button(remounted.render(), "同じ内容で保存結果を確認").props.onClick as () => void)();
      await flush();
      const posts = fetch.mock.calls.filter((call) => call[1]?.method === "POST");
      expect(posts).toHaveLength(2);
      expect(posts[1]![1].body).toBe(firstPayload);
      expect(text(remounted.render())).toContain("保存済み");
      remounted.unmount();
    },
  );
  it("does not display late responses from an unmounted SKU and shows URL eligibility", async () => {
    let resolve!: (value: unknown) => void;
    const fetch = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      )
      .mockResolvedValueOnce(
        response({ ...summary(), skuId: record.observationId, eligible: false }),
      );
    vi.stubGlobal("fetch", fetch);
    const old = mount();
    old.render();
    old.unmount();
    const current = mount({ workspaceId, skuId: record.observationId, pilotActive: false });
    current.render();
    await flush();
    resolve(response(summary(record)));
    await flush();
    expect(text(current.render())).toContain("先に公開後の商品URL");
    expect(text(current.render())).not.toContain(record.confirmedBy);
    current.unmount();
  });
});
