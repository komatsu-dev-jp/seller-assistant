import { describe, expect, it } from "vitest";

import { photoAndPackingSatisfied, shippingApprovedScreen } from "./shipping-approved-stage";

const ready = {
  taskState: "packed" as const,
  registrationReviewed: true,
  preflightState: "confirmed" as const,
  packingHumanConfirmed: true,
  shippingMethodSelected: false,
  shippingReviewConfirmed: false,
  shipmentCompleted: false,
};

describe("shipping approved screen mapping", () => {
  it("keeps the approved order and pick screens distinct", () => {
    expect(shippingApprovedScreen({ ...ready, taskState: null })).toEqual({
      stage: "order",
      mobileScreen: 34,
      pcScreen: 29,
    });
    expect(shippingApprovedScreen({ ...ready, taskState: "confirmed" })).toEqual({
      stage: "pick",
      mobileScreen: 35,
      pcScreen: 30,
    });
    expect(
      shippingApprovedScreen({ ...ready, taskState: "confirmed", registrationReviewed: false }),
    ).toEqual({
      stage: "order",
      mobileScreen: 34,
      pcScreen: 29,
    });
  });

  it("never mislabels approved mobile 36 as the photo step", () => {
    for (const preflightState of [
      null,
      "choice_required",
      "capture_required",
      "awaiting_confirmation",
    ] as const) {
      expect(
        shippingApprovedScreen({
          ...ready,
          taskState: "picking",
          preflightState,
          packingHumanConfirmed: false,
        }),
      ).toEqual({ stage: "photo_and_pack", mobileScreen: null, pcScreen: 31 });
    }
  });

  it("opens method, human review, and completed screens in order", () => {
    expect(shippingApprovedScreen(ready)).toEqual({
      stage: "method",
      mobileScreen: 36,
      pcScreen: 32,
    });
    expect(shippingApprovedScreen({ ...ready, shippingMethodSelected: true })).toEqual({
      stage: "review",
      mobileScreen: 37,
      pcScreen: 32,
    });
    expect(
      shippingApprovedScreen({
        ...ready,
        shippingMethodSelected: true,
        shippingReviewConfirmed: true,
      }),
    ).toEqual({
      stage: "ship",
      mobileScreen: 38,
      pcScreen: 32,
    });
    expect(shippingApprovedScreen({ ...ready, shipmentCompleted: true })).toEqual({
      stage: "complete",
      mobileScreen: 38,
      pcScreen: 32,
    });
  });

  it("requires both a satisfied photo decision and a human packing confirmation", () => {
    expect(
      photoAndPackingSatisfied({ preflightState: "confirmed", packingHumanConfirmed: true }),
    ).toBe(true);
    expect(
      photoAndPackingSatisfied({
        preflightState: "satisfied_without_photo",
        packingHumanConfirmed: true,
      }),
    ).toBe(true);
    expect(
      photoAndPackingSatisfied({ preflightState: "confirmed", packingHumanConfirmed: false }),
    ).toBe(false);
    expect(
      photoAndPackingSatisfied({
        preflightState: "awaiting_confirmation",
        packingHumanConfirmed: true,
      }),
    ).toBe(false);
  });
});
