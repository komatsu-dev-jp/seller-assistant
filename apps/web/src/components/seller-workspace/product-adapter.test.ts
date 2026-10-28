import { describe, expect, it } from "vitest";
import {
  confirmBox,
  createBox,
  emptyIntakeState,
  parseIntake,
} from "../approved-mobile/box-intake-store";
import { workspaceProducts } from "./product-adapter";
import { sampleCommerce } from "./sample-data";
import { monthlySummary } from "./sales-store";

function fixture() {
  const box = confirmBox({
    ...createBox("box-one", "箱A"),
    count: 2,
    purchaseYen: "1001",
    inboundShippingYen: "100",
  });
  box.items[0] = {
    ...box.items[0]!,
    name: "確認用シャツ",
    registered: true,
    inspection: "sellable",
    condition: "良好",
    size: "M",
  };
  return { ...emptyIntakeState(), activeBoxId: box.id, boxes: [box] };
}
describe("read-only intake to unified product catalog", () => {
  it("preserves original storage schema, names, IDs and registration status", () => {
    const state = fixture();
    const before = JSON.stringify(state);
    const products = workspaceProducts(state, "mobile");
    expect(products).toHaveLength(2);
    expect(products[0]).toMatchObject({
      id: "box-one-1",
      name: "確認用シャツ",
      registered: true,
      sellable: true,
      estimate: null,
      cost: 551,
      image: null,
    });
    expect(products[1]).toMatchObject({
      registered: false,
      sellable: false,
      cost: 550,
      estimate: null,
    });
    expect(JSON.stringify(state)).toBe(before);
    expect(parseIntake(before)).toEqual(state);
  });
  it.each(["mobile", "pc"] as const)("routes back to the same box and item on %s", (platform) => {
    const products = workspaceProducts(fixture(), platform);
    expect(products[0]!.href).toContain(
      `${platform === "mobile" ? "/mobile/screens/box-02/" : "/pc/6/"}?box=box-one&step=profit&item=0`,
    );
    expect(products[1]!.href).toContain("&step=item&item=1");
  });
  it("does not invent costs for an unpriced box or accept held merchandise as sellable", () => {
    const state = fixture();
    state.boxes[0]!.purchaseYen = "";
    state.boxes[0]!.items[0]!.inspection = "hold";
    expect(workspaceProducts(state, "mobile")[0]).toMatchObject({
      cost: null,
      estimate: null,
      sellable: false,
    });
  });
  it("does not inflate monthly sales with unsold expected profit", () => {
    expect(monthlySummary(sampleCommerce("2026-10"), "2026-10")).toEqual({
      revenue: 48000,
      productProfit: 23700,
      expenses: 1780,
      netProfit: 21920,
      cost: 18000,
      fees: 4800,
      shipping: 1200,
      packing: 300,
      count: 1,
      paidRevenue: 0,
    });
    expect(monthlySummary(sampleCommerce("2026-10"), "2026-09").netProfit).toBe(0);
  });
});
