import React, { type ReactElement, type ReactNode } from "react";
import ts from "typescript";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reviewPath } from "../approved-mobile/review-path";
import * as routes from "../approved-mobile/review-workflow-routes";

// This checks component routing and mount boundaries, not native rendering or layout.
let reviewOnly = true;
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
  href?: string;
  "data-shared"?: string;
  "data-props"?: Record<string, unknown>;
};
function shared(name: string) {
  return (props: Record<string, unknown>) =>
    React.createElement("div", { "data-shared": name, "data-props": props });
}
function nodes(node: ReactNode): ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!React.isValidElement<Props>(node)) return [];
  if (typeof node.type === "function")
    return nodes((node.type as (props: Props) => ReactNode)(node.props));
  return [node, ...nodes(node.props.children)];
}
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (React.isValidElement<Props>(node))
    return typeof node.type === "function"
      ? text((node.type as (props: Props) => ReactNode)(node.props))
      : text(node.props.children);
  return typeof node === "string" ? node : "";
}
const root = resolve(process.cwd(), "apps/web/src/components/approved-pc");
const source = readFileSync(resolve(root, "pc-browser-workflow.tsx"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    jsx: ts.JsxEmit.React,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const exported: {
  PcBrowserWorkflow?: (props: {
    screenNumber?: number;
    kind?: "products" | "preparation" | "recipes" | "workflow";
  }) => ReactElement;
  pcBrowserWorkflowScreens?: readonly number[];
} = {};
new Function("require", "exports", "React", compiled)(
  (name: string) => {
    if (name === "react") return hooks;
    if (name.endsWith(".css")) return { default: new Proxy({}, { get: (_, key) => key }) };
    if (name === "../approved-review-environment")
      return {
        get isStaticApprovedReview() {
          return reviewOnly;
        },
      };
    if (name === "../approved-mobile/review-path") return { reviewPath };
    if (name === "../approved-mobile/review-workflow-routes") return routes;
    if (name === "../approved-mobile/mobile-screen-data")
      return { getMobileScreen: (id: string) => ({ title: `screen ${id}` }) };
    if (name === "./pc-ui-glyph") return { PcUiGlyph: shared("glyph") };
    if (name === "../seller-workspace/seller-workspace")
      return { SellerWorkspace: shared("seller") };
    if (name === "../seller-workspace/navigation")
      return { sellerHref: (_platform: string, tab: string) => `/pc/products/?tab=${tab}` };
    const modules: Record<string, Record<string, unknown>> = {
      "../approved-mobile/box-intake-flow": {
        BoxIntakeFlow: shared("intake"),
        IntakeProductList: shared("catalog"),
      },
      "../approved-mobile/product-preparation": {
        ProductPreparation: shared("preparation"),
        PreparationProductCard: shared("preparation-card"),
      },
      "../approved-mobile/reported-review-flow": { ReportedReviewFlow: shared("accounting") },
      "../approved-mobile/local-review-flow": { LocalReviewFlow: shared("local-work") },
      "../approved-mobile/review-recipe-picker": { ReviewRecipePicker: shared("recipe") },
    };
    if (modules[name]) return modules[name];
    throw Error(name);
  },
  exported,
  React,
);
function page(props: Parameters<NonNullable<typeof exported.PcBrowserWorkflow>>[0]) {
  const render = () => {
    cursor = 0;
    const result = exported.PcBrowserWorkflow!(props);
    effects.splice(0).forEach((effect) => effect());
    return result;
  };
  render();
  return { text: () => text(render()), nodes: () => nodes(render()) };
}
beforeEach(() => {
  reviewOnly = true;
  values.length = 0;
  cursor = 0;
  effects = [];
  vi.stubGlobal("window", { location: { search: "" } });
});
afterEach(() => {
  vi.unstubAllGlobals();
});
describe("PC uses the mobile workflow modules instead of duplicate business rules", () => {
  it.each([6, 7, 8])(
    "mounts the shared intake flow on PC%d with a meaningful initial stage",
    (number) => {
      const tree = page({ screenNumber: number }).nodes();
      expect(
        tree.find((node) => node.props["data-shared"] === "intake")?.props["data-props"],
      ).toMatchObject({
        platform: "pc",
        defaultStep: number === 6 ? "count" : number === 7 ? "item" : "list",
      });
    },
  );
  it.each([3])("has actionable entries and the saved catalog on PC%d", (number) => {
    const view = page({ screenNumber: number });
    expect(view.text()).toContain("届いた箱を検品する");
    expect(view.nodes().some((node) => node.props["data-shared"] === "catalog")).toBe(true);
    const links = view.nodes().map((node) => node.props.href);
    for (const href of ["/pc/6/", "/pc/products/", "/pc/preparation/", "/pc/46/"])
      expect(links).toContain(href);
  });
  it("uses the shared C home and B product workspace on PC, with old intake preserved", () => {
    for (const [props, tab] of [
      [{ screenNumber: 2 }, "home"],
      [{ kind: "products" }, "products"],
    ] as const) {
      expect(
        page(props)
          .nodes()
          .find((node) => node.props["data-shared"] === "seller")?.props["data-props"],
      ).toEqual({ platform: "pc", initialTab: tab });
    }
  });
  it.each(["file", "history", "import", "__proto__"])(
    "uses a guarded accounting stage query %s",
    (stage) => {
      window.location.search = `?stage=${stage}`;
      const account = page({ screenNumber: 48 })
        .nodes()
        .find((node) => node.props["data-shared"] === "accounting");
      expect(account?.props["data-props"]).toEqual({
        platform: "pc",
        screenId: routes.pcAccountingScreen(stage),
      });
    },
  );
  it("offers the existing sample work without arbitrary screen IDs", () => {
    window.location.search = "?screen=28";
    expect(
      page({ kind: "workflow" })
        .nodes()
        .find((node) => node.props["data-shared"] === "local-work")?.props["data-props"],
    ).toEqual({ screenId: "28", platform: "pc" });
  });
  it("does not mount the browser-only stores in the live environment", () => {
    reviewOnly = false;
    const view = page({ screenNumber: 6 });
    expect(
      view
        .nodes()
        .some((node) =>
          ["intake", "catalog", "preparation", "accounting", "local-work"].includes(
            node.props["data-shared"] ?? "",
          ),
        ),
    ).toBe(false);
    expect(view.text()).toContain("公開の操作確認版で使います");
  });
  it("adds static export pages on both apps and keeps actions in document flow on PC", () => {
    for (const kind of ["products", "preparation", "recipes", "workflow"]) {
      for (const path of [
        `apps/web/src/app/pc/${kind}/page.tsx`,
        `apps/review/app/pc/${kind}/page.tsx`,
      ]) {
        expect(readFileSync(resolve(process.cwd(), path), "utf8")).toContain(`kind="${kind}"`);
      }
    }
    const styles = readFileSync(resolve(root, "pc-browser-workflow.module.css"), "utf8");
    expect(styles).toMatch(/\[data-shared-actions\]\s*\{\s*position: static/u);
    expect(source).not.toMatch(
      /\bfetch\s*\(|XMLHttpRequest|sendBeacon|PcCanvas|localStorage\.clear/u,
    );
  });
});
