import { describe, expect, it } from "vitest";

import { canStartNextPilotFixture, stageAfterItemRefresh } from "./pilot-stage";

const listingConfirmedItem = {
  workflowState: "listing_confirmed",
  orderState: null,
} as const;

describe("pilot workflow stage after an item refresh", () => {
  it("treats a restarted active pilot with no items as awaiting its first fixture", () => {
    expect(
      canStartNextPilotFixture({
        state: "active",
        items: [],
      }),
    ).toBe(true);
  });

  it("keeps purchase selected when a completed pilot item has a next fixed fixture", () => {
    expect(
      stageAfterItemRefresh("purchase", listingConfirmedItem, {
        state: "active",
        items: [{ completedAt: "2026-08-25T00:00:00.000Z" }],
      }),
    ).toBe("purchase");
  });

  it("uses the normal item stage outside an active next-fixture transition", () => {
    expect(stageAfterItemRefresh("purchase", listingConfirmedItem, null)).toBe("order");
    expect(
      stageAfterItemRefresh("purchase", listingConfirmedItem, {
        state: "active",
        items: Array.from({ length: 10 }, () => ({
          completedAt: "2026-08-25T00:00:00.000Z",
        })),
      }),
    ).toBe("order");
    expect(stageAfterItemRefresh("listing", listingConfirmedItem, null)).toBe("listing");
  });
});
