export type ShippingApprovedStage =
  "order" | "pick" | "photo_and_pack" | "method" | "review" | "ship" | "complete";

export type ShippingApprovedStageInput = {
  taskState: "confirmed" | "picking" | "packed" | null;
  registrationReviewed: boolean;
  preflightState:
    | "choice_required"
    | "capture_required"
    | "awaiting_confirmation"
    | "confirmed"
    | "satisfied_without_photo"
    | null;
  packingHumanConfirmed: boolean;
  shippingMethodSelected: boolean;
  shippingReviewConfirmed: boolean;
  shipmentCompleted: boolean;
};

export type ShippingApprovedScreenMapping = {
  stage: ShippingApprovedStage;
  mobileScreen: 34 | 35 | 36 | 37 | 38 | null;
  pcScreen: 29 | 30 | 31 | 32;
};

/**
 * Maps server-backed shipping state to the Slack-approved screen sequence.
 *
 * Managers review the order registration on approved screen 34 before the
 * pick step. Shipping-only actors pass registrationReviewed=true because the
 * private buyer registration is outside their role.
 *
 * Mobile 34-38 deliberately has no shipping-photo screen. Returning null for
 * that one mobile state prevents callers from silently relabelling approved
 * mobile 36 (shipping method) as the P13 photo step.
 */
export function shippingApprovedScreen(
  input: ShippingApprovedStageInput,
): ShippingApprovedScreenMapping {
  if (input.shipmentCompleted) {
    return { stage: "complete", mobileScreen: 38, pcScreen: 32 };
  }
  if (input.taskState === null || !input.registrationReviewed) {
    return { stage: "order", mobileScreen: 34, pcScreen: 29 };
  }
  if (input.taskState === "confirmed") {
    return { stage: "pick", mobileScreen: 35, pcScreen: 30 };
  }
  if (!photoAndPackingSatisfied(input)) {
    return { stage: "photo_and_pack", mobileScreen: null, pcScreen: 31 };
  }
  if (!input.shippingMethodSelected) {
    return { stage: "method", mobileScreen: 36, pcScreen: 32 };
  }
  if (!input.shippingReviewConfirmed) {
    return { stage: "review", mobileScreen: 37, pcScreen: 32 };
  }
  return { stage: "ship", mobileScreen: 38, pcScreen: 32 };
}

export function photoAndPackingSatisfied(
  input: Pick<ShippingApprovedStageInput, "preflightState" | "packingHumanConfirmed">,
): boolean {
  const photoSatisfied =
    input.preflightState === "confirmed" || input.preflightState === "satisfied_without_photo";
  return photoSatisfied && input.packingHumanConfirmed;
}
