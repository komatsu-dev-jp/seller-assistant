import { describe, expect, it } from "vitest";
import {
  assessListingReadiness,
  registerMediaAsset,
  reviewMeasurement,
  type Measurement,
} from "./product.js";

const measurement: Measurement = {
  definitionId: "chest_width",
  definitionVersion: 1,
  value: 52,
  unit: "cm",
  basis: "flat_width",
  state: "natural",
  measuredBy: "person-a",
  measuredAt: "2026-08-15T00:00:00Z",
  evidenceAssetId: "asset-measure",
  attempt: 1,
  confirmedBy: "person-a",
  confirmationReason: null,
};

describe("media originals", () => {
  it("replays identical originals and rejects same ID with another hash", () => {
    const asset = {
      id: "asset-a",
      workspaceId: "ws-a",
      skuId: "sku-a",
      role: "front" as const,
      originalSha256: "a".repeat(64),
      originalStorageKey: "workspaces/ws-a/originals/asset-a.jpg",
      createdAt: "2026-08-15T00:00:00Z",
    };
    expect(registerMediaAsset(undefined, asset).kind).toBe("created");
    expect(registerMediaAsset(asset, asset).kind).toBe("replay");
    expect(registerMediaAsset(asset, { ...asset, originalSha256: "b".repeat(64) }).kind).toBe(
      "conflict",
    );
    expect(registerMediaAsset(asset, { ...asset, role: "back" }).kind).toBe("conflict");
  });
});

describe("measurement and listing readiness", () => {
  it("requires review when repeated clothing measurement differs by more than 2 cm", () => {
    expect(reviewMeasurement({ ...measurement, value: 55 }, measurement, 2)).toMatchObject({
      requiresReview: true,
      difference: 3,
      violations: ["repeat_difference_exceeded"],
    });
  });

  it("does not allow AI to confirm a measurement", () => {
    expect(
      reviewMeasurement({ ...measurement, confirmedBy: "ai" }, undefined, 2).violations,
    ).toContain("ai_cannot_confirm");
  });

  it("requires photos, confirmed measurements and separate human conclusions", () => {
    const ready = assessListingReadiness({
      photoRoles: ["front", "back", "brand_tag", "care_label"],
      measurements: [measurement],
      requiredMeasurementIds: ["chest_width"],
      conclusion: {
        aiCandidate: "ブランド候補",
        aiConfidence: 0.8,
        humanConclusion: "人がタグを確認",
        concludedBy: "person-a",
        concludedAt: "2026-08-15T00:00:00Z",
      },
      descriptionCandidate: "商品説明候補",
      descriptionConfirmedBy: "person-a",
    });
    expect(ready).toEqual({
      ready: true,
      missingPhotoRoles: [],
      missingMeasurementIds: [],
      blockers: [],
    });
    expect(assessListingReadiness({ ...readyInput(), photoRoles: ["front"] }).ready).toBe(false);
  });
});

function readyInput() {
  return {
    photoRoles: ["front", "back", "brand_tag", "care_label"] as const,
    measurements: [measurement],
    requiredMeasurementIds: ["chest_width"],
    conclusion: {
      aiCandidate: null,
      aiConfidence: null,
      humanConclusion: "確認済み",
      concludedBy: "person-a",
      concludedAt: "2026-08-15T00:00:00Z",
    },
    descriptionCandidate: "候補",
    descriptionConfirmedBy: "person-a",
  };
}
