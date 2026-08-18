import { describe, expect, it } from "vitest";
import {
  appendCodeCheckDigit,
  assignOrderRequestSchema,
  checkedLocationCodeSchema,
  createMarketplaceReferenceRequestSchema,
  createTeamAssignmentRequestSchema,
  hasValidCodeCheckDigit,
  inventoryNumberSchema,
  recordMeasurementRequestSchema,
} from "./index.js";

describe("checked inventory and location codes", () => {
  it("generates stable human-readable check digits", () => {
    expect(appendCodeCheckDigit("INV-000123")).toBe("INV-000123-8");
    expect(appendCodeCheckDigit(" bx-014-3 ")).toBe("BX-014-3-2");
  });

  it("rejects a one-character mistype instead of accepting the wrong item or place", () => {
    expect(hasValidCodeCheckDigit("INV-000123-8")).toBe(true);
    expect(hasValidCodeCheckDigit("INV-000124-8")).toBe(false);
    expect(inventoryNumberSchema.safeParse("INV-000124-8").success).toBe(false);
    expect(checkedLocationCodeSchema.safeParse("BX-014-4-2").success).toBe(false);
  });

  it("applies the same 24-hour limit to SKU, place and inventory work", () => {
    const base = {
      identityId: "10000000-0000-4000-8000-000000000001",
      assignmentType: "inventory_putaway",
      targetId: "10000000-0000-4000-8000-000000000002",
      startsAt: "2026-08-15T00:00:00.000Z",
      humanConfirmed: true,
    } as const;
    expect(
      createTeamAssignmentRequestSchema.safeParse({
        ...base,
        expiresAt: "2026-08-16T00:00:00.000Z",
      }).success,
    ).toBe(true);
    expect(
      createTeamAssignmentRequestSchema.safeParse({
        ...base,
        expiresAt: "2026-08-16T00:00:00.001Z",
      }).success,
    ).toBe(false);
  });
});

describe("human-reviewed capture and market evidence", () => {
  it("requires a reason whenever a market observation is excluded", () => {
    const base = {
      sourceUrl: "https://example.test/human-checked",
      displayedPriceMinor: 3200,
      soldState: true,
      itemCondition: "目立った傷なし",
      shippingBasis: "included",
      included: false,
      checkedAt: "2026-08-15T00:00:00.000Z",
      humanConfirmed: true,
    } as const;
    expect(
      createMarketplaceReferenceRequestSchema.safeParse({ ...base, exclusionReason: null }).success,
    ).toBe(false);
    expect(
      createMarketplaceReferenceRequestSchema.safeParse({
        ...base,
        exclusionReason: "別型番",
      }).success,
    ).toBe(true);
  });

  it("accepts only fixed review reasons for a human-confirmed remeasurement", () => {
    const base = {
      definitionId: "shoulder_width",
      definitionVersion: 1,
      value: 42,
      unit: "cm",
      basis: "flat_width",
      state: "natural",
      measuredAt: "2026-08-15T00:00:00.000Z",
      evidenceAssetId: "10000000-0000-4000-8000-000000000001",
      attempt: 2,
      humanConfirmed: true,
    } as const;
    expect(
      recordMeasurementRequestSchema.safeParse({
        ...base,
        reviewReasonCode: "previous_entry_error",
      }).success,
    ).toBe(true);
    expect(
      recordMeasurementRequestSchema.safeParse({ ...base, reviewReasonCode: "free text" }).success,
    ).toBe(false);
  });
});

describe("time-bounded external assignments", () => {
  it("accepts at most 24 hours and rejects a longer shipping assignment", () => {
    const startsAt = "2026-08-15T00:00:00.000Z";
    expect(
      assignOrderRequestSchema.safeParse({
        assigneeEmail: "shipping@example.test",
        startsAt,
        expiresAt: "2026-08-16T00:00:00.000Z",
        humanConfirmed: true,
      }).success,
    ).toBe(true);
    expect(
      assignOrderRequestSchema.safeParse({
        assigneeEmail: "shipping@example.test",
        startsAt,
        expiresAt: "2026-08-16T00:00:00.001Z",
        humanConfirmed: true,
      }).success,
    ).toBe(false);
  });
});
