import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  appendCodeCheckDigit,
  accountingExportPreflightResponseSchema,
  accountingExportPreviewResponseSchema,
  accountMappingRuleSchema,
  assignOrderRequestSchema,
  checkedLocationCodeSchema,
  createMarketplaceReferenceRequestSchema,
  createTeamAssignmentRequestSchema,
  hasValidCodeCheckDigit,
  inventoryNumberSchema,
  listingPrepPilotMigrationVersion,
  pilotRunResponseSchema,
  recordPilotExceptionRequestSchema,
  replaceAccountMappingRuleRequestSchema,
  replaceAccountMappingRuleResponseSchema,
  startPilotRunRequestSchema,
  advanceP0WorkflowRequestSchema,
  recordMeasurementRequestSchema,
  stocktakeDiscrepancySchema,
} from "./index.js";

describe("safe discrepancy and accounting preview read models", () => {
  it("requires optimistic locking, a fixed reason, an effective date, and human confirmation", () => {
    const request = {
      expectedVersion: "sale-v1",
      expectedStatus: "active",
      debitAccount: "売掛金",
      debitSubaccount: "",
      debitTaxCategory: "対象外",
      debitInvoiceCategory: "控除なし",
      creditAccount: "売上高",
      creditSubaccount: "",
      creditTaxCategory: "対象外",
      creditInvoiceCategory: "控除なし",
      effectiveFrom: "2030-01-01T00:00:00.000Z",
      changeReasonCode: "account_review",
      humanConfirmed: true,
    } as const;
    expect(replaceAccountMappingRuleRequestSchema.safeParse(request).success).toBe(true);
    expect(
      replaceAccountMappingRuleRequestSchema.safeParse({ ...request, humanConfirmed: false })
        .success,
    ).toBe(false);
    expect(
      replaceAccountMappingRuleRequestSchema.safeParse({
        ...request,
        changeReasonCode: "顧客名を含む自由記述",
      }).success,
    ).toBe(false);
    expect(
      replaceAccountMappingRuleRequestSchema.safeParse({
        ...request,
        expectedStatus: "retired",
      }).success,
    ).toBe(false);
  });

  it("returns the retired and active human-confirmed versions as one replacement", () => {
    const baseRule = {
      ruleId: "10000000-0000-4000-8000-000000000001",
      eventType: "sale",
      version: "sale-v1",
      debitAccount: "普通預金",
      debitSubaccount: "",
      debitTaxCategory: "対象外",
      debitInvoiceCategory: "控除なし",
      creditAccount: "売上高",
      creditSubaccount: "",
      creditTaxCategory: "対象外",
      creditInvoiceCategory: "控除なし",
      effectiveFrom: "2020-01-01T00:00:00.000Z",
      effectiveUntil: null,
      status: "active",
      approvedBy: "10000000-0000-4000-8000-000000000002",
      approvedAt: "2026-08-23T00:00:00.000Z",
      replacesRuleId: null,
      changeReasonCode: null,
      confirmationStatus: "human_confirmed",
    } as const;
    expect(accountMappingRuleSchema.safeParse(baseRule).success).toBe(true);
    expect(accountMappingRuleSchema.safeParse({ ...baseRule, internalField: true }).success).toBe(
      false,
    );
    const replacementResponse = {
      retiredRule: {
        ...baseRule,
        effectiveUntil: "2030-01-01T00:00:00.000Z",
        status: "retired",
      },
      activeRule: {
        ...baseRule,
        ruleId: "10000000-0000-4000-8000-000000000003",
        version: "sale-2030-01-01-v2",
        debitAccount: "売掛金",
        effectiveFrom: "2030-01-01T00:00:00.000Z",
        replacesRuleId: baseRule.ruleId,
        changeReasonCode: "account_review",
      },
      changeReasonCode: "account_review",
      humanConfirmed: true,
    } as const;
    expect(replaceAccountMappingRuleResponseSchema.safeParse(replacementResponse).success).toBe(
      true,
    );
    expect(
      replaceAccountMappingRuleResponseSchema.safeParse({
        ...replacementResponse,
        internalField: true,
      }).success,
    ).toBe(false);
    expect(
      replaceAccountMappingRuleResponseSchema.safeParse({
        ...replacementResponse,
        activeRule: { ...replacementResponse.activeRule, internalField: true },
      }).success,
    ).toBe(false);
  });

  it("keeps expected and current stock locations separate", () => {
    const parsed = stocktakeDiscrepancySchema.parse({
      discrepancyId: "10000000-0000-4000-8000-000000000001",
      inventoryUnitId: "10000000-0000-4000-8000-000000000002",
      inventoryNumber: appendCodeCheckDigit("INV-000001"),
      expectedLocationId: "10000000-0000-4000-8000-000000000003",
      expectedLocationCode: appendCodeCheckDigit("BIN-A"),
      currentLocationId: "10000000-0000-4000-8000-000000000004",
      currentLocationCode: appendCodeCheckDigit("BIN-B"),
      kind: "missing_candidate",
      state: "restored",
      resolution: "restored_to_current_location",
      confirmationMode: "solo_reversible",
      activeMembershipCountAtSelection: 1,
      membershipRevisionAtSelection: 1,
      evidenceCount: 1,
      reasonCode: "found_after_move",
      confirmedAt: "2026-08-21T00:00:00.000Z",
      restoredAt: "2026-08-21T00:01:00.000Z",
    });
    expect(parsed.expectedLocationCode).not.toBe(parsed.currentLocationCode);
  });

  it("bounds CSV preview to ten rows and requires every saved column", () => {
    const valid = {
      batchId: "10000000-0000-4000-8000-000000000001",
      formatVersion: "generic_journal_v1.0.0",
      filename: "generic-journal-v1.csv",
      sha256: "a".repeat(64),
      columnCount: 19,
      totalRowCount: 12,
      previewRowCount: 10,
      truncated: true,
      headers: Array.from({ length: 19 }, (_, index) => `header-${index}`),
      rows: Array.from({ length: 10 }, () => Array.from({ length: 19 }, () => "value")),
    } as const;
    expect(accountingExportPreviewResponseSchema.safeParse(valid).success).toBe(true);
    expect(
      accountingExportPreviewResponseSchema.safeParse({
        ...valid,
        rows: [...valid.rows, Array.from({ length: 19 }, () => "extra")],
        previewRowCount: 11,
      }).success,
    ).toBe(false);
    expect(
      accountingExportPreviewResponseSchema.safeParse({
        ...valid,
        rows: valid.rows.map((row) => row.slice(1)),
      }).success,
    ).toBe(false);
  });

  it("allows only an exact current-source batch to become a supersession target", () => {
    const sourceSetSha256 = "a".repeat(64);
    const replacement = {
      orderId: "10000000-0000-4000-8000-000000000001",
      currentSourceSetSha256: sourceSetSha256,
      exactPriorDuplicate: {
        batchId: "10000000-0000-4000-8000-000000000002",
        format: "money_forward_journal_v1",
        filename: "money-forward-journal-v1.csv",
        sourceSetSha256,
        state: "superseded",
      },
      canCreateFresh: false,
      canSupersede: true,
    } as const;
    expect(accountingExportPreflightResponseSchema.safeParse(replacement).success).toBe(true);
    expect(
      accountingExportPreflightResponseSchema.safeParse({
        ...replacement,
        exactPriorDuplicate: {
          ...replacement.exactPriorDuplicate,
          sourceSetSha256: "b".repeat(64),
        },
      }).success,
    ).toBe(false);
    expect(
      accountingExportPreflightResponseSchema.safeParse({
        ...replacement,
        exactPriorDuplicate: null,
        canCreateFresh: true,
        canSupersede: false,
      }).success,
    ).toBe(true);
  });
});

describe("ten-product pilot contract", () => {
  it("locks the protocol, commit, migration and 390x844 viewport", () => {
    const latestMigrationVersion = readdirSync(new URL("../../db/migrations/", import.meta.url))
      .filter((name) => /^\d{4}_.+\.sql$/u.test(name))
      .sort()
      .at(-1)
      ?.slice(0, 4);
    const valid = {
      protocolVersion: "listing_prep_pilot_v1.0.0",
      commitSha: "a".repeat(40),
      migrationVersion: listingPrepPilotMigrationVersion,
      platform: "Windows",
      browser: "Chrome 140",
      viewport: "390x844",
      warmupCompleted: true,
      humanConfirmed: true,
    } as const;
    expect(startPilotRunRequestSchema.safeParse(valid).success).toBe(true);
    expect(listingPrepPilotMigrationVersion).toBe("0032");
    expect(listingPrepPilotMigrationVersion).toBe(latestMigrationVersion);
    expect(
      startPilotRunRequestSchema.safeParse({ ...valid, migrationVersion: "0028" }).success,
    ).toBe(false);
    expect(pilotRunResponseSchema.shape.migrationVersion.safeParse("0028").success).toBe(true);
    expect(pilotRunResponseSchema.shape.migrationVersion.safeParse("0032").success).toBe(true);
    expect(pilotRunResponseSchema.shape.migrationVersion.safeParse("0033").success).toBe(false);
    expect(startPilotRunRequestSchema.safeParse({ ...valid, viewport: "1440x1000" }).success).toBe(
      false,
    );
  });

  it("accepts append-only exception events and rejects client-computed totals", () => {
    const base = {
      idempotencyKey: "10000000-0000-4000-8000-000000000001",
      evidenceReferenceIds: ["10000000-0000-4000-8000-000000000002"],
      requiredFactsConfirmed: true,
      manualChannelHandoff: true,
    } as const;
    expect(
      advanceP0WorkflowRequestSchema.safeParse({ ...base, action: "confirm_listing" }).success,
    ).toBe(true);
    expect(
      advanceP0WorkflowRequestSchema.safeParse({
        ...base,
        action: "confirm_listing",
        pilotMetrics: { invalidAttemptCount: 0 },
      }).success,
    ).toBe(false);
    expect(
      recordPilotExceptionRequestSchema.safeParse({
        eventType: "measurement_rework",
        detailCode: "difference_over_two_cm",
        idempotencyKey: "10000000-0000-4000-8000-000000000003",
        humanConfirmed: true,
      }).success,
    ).toBe(true);
  });
});

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
