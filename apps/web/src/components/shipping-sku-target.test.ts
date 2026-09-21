import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve("apps/web/src/components/shipping-workspace.tsx"), "utf8");
const page = readFileSync(resolve("apps/web/src/app/shipping/page.tsx"), "utf8");

describe("shipping SKU handoff", () => {
  it("prioritizes explicit order including invalid order and rejects repeated SKU", () => {
    expect(page).toContain("order !== undefined || sku === undefined");
    expect(page).toContain('typeof sku === "string"');
    expect(page).toContain("requestedSkuId={requestedSkuId}");
  });
  it("presets only one eligible authorized inventory without filling sales or address choices", () => {
    const refresh = source.slice(
      source.indexOf("const refresh = useCallback"),
      source.indexOf("refreshRef.current = refresh"),
    );
    expect(refresh).toContain("privateSessionGate.current.isCurrent(sessionToken)");
    expect(refresh).toContain("entry.orderId === null");
    expect(refresh).toContain('entry.inventoryStatus === "available"');
    expect(refresh).toContain('entry.workflowState === "listing_confirmed"');
    expect(refresh).toContain("if (matches.length === 1)");
    expect(refresh).toContain("!skuPresetApplied.current");
    expect(refresh).toContain("setSelectedInventoryUnitId(matches[0]!.inventoryUnitId)");
    expect(refresh).not.toContain("setNewOrderAddressMode");
    expect(refresh).not.toContain("setSalesChannelKey");
  });
  it("blocks forbidden or missing SKU targets instead of falling back", () => {
    expect(source).toContain("explicitOrderTarget || explicitSkuTarget");
    expect(source).toContain("!explicitSkuTargetRef.current &&");
    expect(source).toContain("!canManage ||");
    expect(source).toContain("この担当では新しい注文を登録できません。");
    expect(source).toContain("別の商品は選んでいません。");
  });
  it("moves successful creation to the created order URL before refreshing", () => {
    const create = source.slice(
      source.indexOf("async function createOrder()"),
      source.indexOf("async function selectOrderShippingMethod"),
    );
    const replace = create.indexOf("window.history.replaceState(");
    expect(replace).toBeGreaterThan(create.indexOf("async (created) =>"));
    expect(replace).toBeLessThan(create.indexOf("await refresh()"));
    expect(create).toContain("encodeURIComponent(created.orderId)");
    expect(create).toContain("explicitSkuTargetRef.current = false");
  });
});
