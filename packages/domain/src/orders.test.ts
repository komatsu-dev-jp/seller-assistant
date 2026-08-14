import { describe, expect, it } from "vitest";
import { canTransitionReturn, validateOrderTransition } from "./orders.js";

describe("order transitions", () => {
  it("requires an allocation before picking", () => {
    expect(
      validateOrderTransition({
        from: "confirmed",
        to: "picking",
        actorRole: "inventory_manager",
        hasActiveAllocation: false,
        hasConfirmedPickScan: false,
        hasPackingEvidence: false,
        addressLeaseActive: false,
      }),
    ).toContain("active_allocation_required");
  });

  it("requires a temporary address lease for shipping workers", () => {
    expect(
      validateOrderTransition({
        from: "packed",
        to: "shipped",
        actorRole: "shipping",
        hasActiveAllocation: true,
        hasConfirmedPickScan: true,
        hasPackingEvidence: true,
        addressLeaseActive: false,
      }),
    ).toContain("active_address_lease_required");
  });

  it("forces returned inventory through quarantine and inspection", () => {
    expect(canTransitionReturn("return_received", "available")).toBe(false);
    expect(canTransitionReturn("return_received", "quarantined")).toBe(true);
    expect(canTransitionReturn("quarantined", "inspected")).toBe(true);
    expect(canTransitionReturn("inspected", "available")).toBe(true);
  });
});
