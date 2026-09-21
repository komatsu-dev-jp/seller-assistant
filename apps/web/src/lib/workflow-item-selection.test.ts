import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { refreshedWorkflowSelection, workflowItemHref } from "./workflow-item-selection";

const items = [{ skuId: "first" }, { skuId: "second" }];

describe("workflow item links and authorized selection", () => {
  it("encodes only a workflow target SKU", () => {
    expect(workflowItemHref("second")).toBe("/workflow?sku=second");
    expect(workflowItemHref("a&sku=b")).toBe("/workflow?sku=a%26sku%3Db");
  });
  it("opens the requested non-first item from the authorized response", () => {
    expect(refreshedWorkflowSelection(items, "second", "second")).toBe("second");
  });
  it.each(["unknown", ""])("never silently replaces unresolved URL target %j", (sku) => {
    expect(refreshedWorkflowSelection(items, sku, sku)).toBe(sku);
    expect(refreshedWorkflowSelection([], sku, sku)).toBe(sku);
  });
  it("preserves manual selection on refresh instead of resetting to the URL", () => {
    expect(refreshedWorkflowSelection(items, "first", "second")).toBe("first");
  });
  it("keeps existing no-query defaults and removed manual-selection fallback", () => {
    expect(refreshedWorkflowSelection(items, null, undefined)).toBe("first");
    expect(refreshedWorkflowSelection(items, "removed", undefined)).toBe("first");
    expect(refreshedWorkflowSelection([], null, undefined)).toBeNull();
  });
  it("retains an explicitly targeted item if it disappears on refresh", () => {
    expect(refreshedWorkflowSelection(items.slice(0, 1), "second", "second")).toBe("second");
  });
  it("passes awaited search parameters through the authorized page", () => {
    const page = readFileSync(resolve(process.cwd(), "apps/web/src/app/workflow/page.tsx"), "utf8");
    expect(page).toContain('requirePageSession(["owner", "inventory_manager"])');
    expect(page).toContain("await searchParams");
    expect(page).toContain('typeof sku === "string" ? sku : ""');
    expect(page).toContain("requestedSkuId={requestedSkuId}");
  });
  it("wires product links and blocks unresolved targets without changing pilot selection lock", () => {
    const home = readFileSync(
      resolve(process.cwd(), "apps/web/src/components/home-workspace.tsx"),
      "utf8",
    );
    const workspace = readFileSync(
      resolve(process.cwd(), "apps/web/src/components/p0-workspace.tsx"),
      "utf8",
    );
    expect(home).toContain("return workflowItemHref(item.skuId)");
    expect(home).toContain("workflowItemHref(current.skuId)");
    expect(workspace).toContain("selectedSkuId === requestedSkuId && !item");
    expect(workspace).toContain("別の商品は開いていません。");
    expect(workspace).toContain('disabled={busy || pilotRun?.state === "active"}');
  });
  it("separates new purchases from existing items and retains the saved SKU on reload", () => {
    const page = readFileSync(resolve(process.cwd(), "apps/web/src/app/workflow/page.tsx"), "utf8");
    const workspace = readFileSync(
      resolve(process.cwd(), "apps/web/src/components/p0-workspace.tsx"),
      "utf8",
    );
    expect(page).toContain('sku === undefined && newPurchase === "1"');
    expect(workspace).toContain('newPurchase && (!pilotChecked || pilotRun?.state === "active")');
    expect(workspace).toContain(
      'window.history.replaceState(null, "", workflowItemHref(created.skuId))',
    );
    expect(workspace).toContain("setNewPurchase(false)");
    expect(workspace).toContain("!awaitingNextPilotItem && !newPurchase");
    for (const file of [
      "components/app-sidebar.tsx",
      "components/workflow-live-layout.tsx",
      "app/inventory/page.tsx",
      "components/home-workspace.tsx",
    ]) {
      expect(readFileSync(resolve(process.cwd(), "apps/web/src", file), "utf8")).toContain(
        "/workflow?new=1",
      );
    }
  });
});
