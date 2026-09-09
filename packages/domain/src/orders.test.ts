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
        addressRequired: true,
        addressLeaseActive: false,
      }),
    ).toContain("active_allocation_required");
  });

  it("requires every allowed role to hold its own temporary lease for stored-address orders", () => {
    expect(
      validateOrderTransition({
        from: "packed",
        to: "shipped",
        actorRole: "inventory_manager",
        hasActiveAllocation: true,
        hasConfirmedPickScan: true,
        hasPackingEvidence: true,
        addressRequired: true,
        addressLeaseActive: false,
      }),
    ).toContain("active_address_lease_required");
  });

  it("allows anonymous orders to move without creating an address lease", () => {
    expect(
      validateOrderTransition({
        from: "packed",
        to: "shipped",
        actorRole: "shipping",
        hasActiveAllocation: true,
        hasConfirmedPickScan: true,
        hasPackingEvidence: true,
        addressRequired: false,
        addressLeaseActive: false,
      }),
    ).not.toContain("active_address_lease_required");
  });

  it("forces returned inventory through quarantine and inspection", () => {
    expect(canTransitionReturn("return_received", "available")).toBe(false);
    expect(canTransitionReturn("return_received", "quarantined")).toBe(true);
    expect(canTransitionReturn("quarantined", "inspected")).toBe(true);
    expect(canTransitionReturn("inspected", "available")).toBe(true);
  });
});
