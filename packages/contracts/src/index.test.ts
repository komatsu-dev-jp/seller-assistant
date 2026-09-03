import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  appendCodeCheckDigit,
  accountingExportPreflightResponseSchema,
  accountingExportPreviewResponseSchema,
  accountMappingRuleSchema,
  assignOrderRequestSchema,
  checkedLocationCodeSchema,
  confirmShippingPhotosRequestSchema,
  createOrderRequestSchema,
  createMarketplaceReferenceRequestSchema,
  createP0ItemRequestSchema,
  createTeamAssignmentRequestSchema,
  financialSummaryResponseSchema,
  hasValidCodeCheckDigit,
  inventoryNumberSchema,
  invalidatePilotRunRequestSchema,
  listingPrepPilotFixtureManifestSha256,
  listingPrepPilotItemIdentifiers,
  listingPrepPilotMigrationVersion,
  listingPrepPilotMeasurementTemplates,
  listingPrepPilotProtocolVersion,
  measurementProfileResponseSchema,
  inspectionCheckResultRevisionResponseSchema,
  inspectionConcernRevisionResponseSchema,
  evaluateShippingPhotoPreflightRequestSchema,
  overrideShippingPhotoDecisionRequestSchema,
  packOrderRequestSchema,
  pilotRunResponseSchema,
  recordInspectionCheckResultRequestSchema,
  recordInspectionConcernRevisionRequestSchema,
  recordPilotExceptionRequestSchema,
  replaceAccountMappingRuleRequestSchema,
  replaceAccountMappingRuleResponseSchema,
  startPilotRunRequestSchema,
  advanceP0WorkflowRequestSchema,
  recordMeasurementRequestSchema,
  stocktakeDiscrepancySchema,
  shippingPhotoAssetResponseSchema,
  shippingPhotoPreflightResponseSchema,
  shipOrderRequestSchema,
  updateShippingPhotoPolicyRequestSchema,
  uploadShippingPhotoQuerySchema,
} from "./index.js";

describe("P13 shipping preflight photo contracts", () => {
  const firstId = "10000000-0000-4000-8000-000000000001";
  const secondId = "10000000-0000-4000-8000-000000000002";
  const basePolicy = {
    mode: "high_value_only",
    highValueThresholdMinor: 30_000,
    expectedRevision: null,
    idempotencyKey: firstId,
    humanConfirmed: true,
  } as const;

  it("supports all three policy modes without seeding a threshold", () => {
    expect(updateShippingPhotoPolicyRequestSchema.safeParse(basePolicy).success).toBe(true);
    expect(
      updateShippingPhotoPolicyRequestSchema.safeParse({
        ...basePolicy,
        highValueThresholdMinor: null,
      }).success,
    ).toBe(false);
    expect(
      updateShippingPhotoPolicyRequestSchema.safeParse({
        ...basePolicy,
        mode: "all",
        highValueThresholdMinor: null,
      }).success,
    ).toBe(true);
    expect(
      updateShippingPhotoPolicyRequestSchema.safeParse({
        ...basePolicy,
        mode: "disabled",
        highValueThresholdMinor: null,
      }).success,
    ).toBe(true);
    expect(
      updateShippingPhotoPolicyRequestSchema.safeParse({ ...basePolicy, mode: "all" }).success,
    ).toBe(false);
  });

  it("keeps a missing order sale amount distinct from zero", () => {
    const request = {
      orderNumber: "OD-20260829-001",
      skuId: firstId,
      inventoryUnitId: secondId,
      saleAmountMinor: null,
      costAmountMinor: 1_000,
      sellingFeeMinor: 0,
      shippingCostMinor: 0,
      packagingCostMinor: 0,
      taxBasis: "unknown",
      sourceMeaning: "架空の手入力",
      occurredAt: "2026-08-29T00:00:00.000Z",
      addressMode: "stored",
      shippingAddress: "架空住所",
      idempotencyKey: "10000000-0000-4000-8000-000000000003",
      humanConfirmed: true,
    } as const;
    expect(createOrderRequestSchema.safeParse(request).success).toBe(true);
    expect(createOrderRequestSchema.safeParse({ ...request, saleAmountMinor: 0 }).success).toBe(
      false,
    );
  });

  it("rejects actor, workspace, SKU, storage, digest and confirmation-time input", () => {
    const preflight = {
      expectedDecisionRevision: null,
      idempotencyKey: firstId,
      humanConfirmed: true,
    } as const;
    expect(evaluateShippingPhotoPreflightRequestSchema.safeParse(preflight).success).toBe(true);
    for (const privateField of [
      { actorId: secondId },
      { workspaceId: secondId },
      { skuId: secondId },
      { storageKey: "workspaces/private/original.jpg" },
      { sha256: "a".repeat(64) },
      { confirmedAt: "2026-08-29T00:00:00.000Z" },
    ]) {
      expect(
        evaluateShippingPhotoPreflightRequestSchema.safeParse({
          ...preflight,
          ...privateField,
        }).success,
      ).toBe(false);
    }
    expect(
      uploadShippingPhotoQuerySchema.safeParse({
        role: "product",
        idempotencyKey: firstId,
        humanConfirmed: "true",
        sha256: "a".repeat(64),
      }).success,
    ).toBe(false);
  });

  it("accepts only the two shipping photo roles and a unique confirmation set", () => {
    expect(
      uploadShippingPhotoQuerySchema.safeParse({
        role: "product",
        idempotencyKey: firstId,
        humanConfirmed: "true",
      }).success,
    ).toBe(true);
    expect(
      uploadShippingPhotoQuerySchema.safeParse({
        role: "packed_package",
        idempotencyKey: firstId,
        humanConfirmed: "true",
      }).success,
    ).toBe(true);
    expect(
      uploadShippingPhotoQuerySchema.safeParse({
        role: "shipping_label",
        idempotencyKey: firstId,
        humanConfirmed: "true",
      }).success,
    ).toBe(false);
    expect(
      confirmShippingPhotosRequestSchema.safeParse({
        assetIds: [firstId, secondId],
        idempotencyKey: firstId,
        humanConfirmed: true,
      }).success,
    ).toBe(true);
    expect(
      confirmShippingPhotosRequestSchema.safeParse({
        assetIds: [firstId, firstId],
        idempotencyKey: firstId,
        humanConfirmed: true,
      }).success,
    ).toBe(false);
  });

  it("separates override, packing and shipment confirmations", () => {
    expect(
      overrideShippingPhotoDecisionRequestSchema.safeParse({
        choice: "use_photos",
        expectedDecisionRevision: 1,
        idempotencyKey: firstId,
        humanConfirmed: true,
      }).success,
    ).toBe(true);
    const packing = {
      addressLeaseId: null,
      idempotencyKey: firstId,
      humanConfirmed: true,
    } as const;
    expect(packOrderRequestSchema.safeParse(packing).success).toBe(true);
    expect(
      packOrderRequestSchema.safeParse({ ...packing, packingEvidenceReferenceId: secondId })
        .success,
    ).toBe(false);
    expect(
      shipOrderRequestSchema.safeParse({
        addressLeaseId: null,
        idempotencyKey: secondId,
        humanConfirmed: true,
      }).success,
    ).toBe(true);
    expect(
      shipOrderRequestSchema.safeParse({
        addressLeaseId: null,
        shippedAt: "2026-08-29T00:00:00.000Z",
        idempotencyKey: secondId,
        humanConfirmed: true,
      }).success,
    ).toBe(false);
  });

  it("keeps private storage and financial thresholds out of shipping responses", () => {
    const asset = {
      assetId: firstId,
      orderId: secondId,
      role: "product",
      mimeType: "image/png",
      sizeBytes: 100,
      width: 10,
      height: 10,
      capturedBy: firstId,
      capturedAt: "2026-08-29T00:00:00.000Z",
    } as const;
    expect(shippingPhotoAssetResponseSchema.safeParse(asset).success).toBe(true);
    expect(
      shippingPhotoAssetResponseSchema.safeParse({ ...asset, originalStorageKey: "private" })
        .success,
    ).toBe(false);
    const preflight = {
      orderId: secondId,
      decisionRevisionId: firstId,
      decisionRevision: 1,
      state: "capture_required",
      photoRequired: true,
      decisionReason: "policy_all",
      saleAmountStatus: "present",
      assets: [asset],
      confirmedAssetIds: [],
      photoConfirmationId: null,
      packingHumanConfirmed: false,
      shipmentHumanConfirmed: false,
      updatedAt: "2026-08-29T00:00:00.000Z",
    } as const;
    expect(shippingPhotoPreflightResponseSchema.safeParse(preflight).success).toBe(true);
    expect(
      shippingPhotoPreflightResponseSchema.safeParse({
        ...preflight,
        saleAmountMinor: 30_000,
      }).success,
    ).toBe(false);
    expect(
      shippingPhotoPreflightResponseSchema.safeParse({
        ...preflight,
        highValueThresholdMinor: 30_000,
      }).success,
    ).toBe(false);
  });
});

describe("safe discrepancy and accounting preview read models", () => {
  it("keeps an unknown tax basis visible as an accounting export blocker", () => {
    const parsed = financialSummaryResponseSchema.parse({
      workspaceId: "10000000-0000-4000-8000-000000000001",
      orderId: "10000000-0000-4000-8000-000000000002",
      skuId: "10000000-0000-4000-8000-000000000003",
      saleAmountMinor: 5800,
      costAmountMinor: 1800,
      sellingFeeMinor: 580,
      shippingCostMinor: 750,
      packagingCostMinor: 120,
      netRevenueMinor: 5800,
      contributionProfitMinor: 2550,
      formulaVersion: "financial_formula_v1.0.0",
      missingInputs: ["taxBasis"],
      currency: "JPY",
      disclaimer: "運用分析の参考値です。会計上の売上・利益・所得・税額を示すものではありません。",
    });
    expect(parsed.missingInputs).toEqual(["taxBasis"]);
  });

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
      confirmedReasonCode: "not_seen_during_count",
      restoredReasonCode: "found_after_move",
      confirmedAt: "2026-08-21T00:00:00.000Z",
      restoredAt: "2026-08-21T00:01:00.000Z",
    });
    expect(parsed.expectedLocationCode).not.toBe(parsed.currentLocationCode);
    expect(parsed.confirmedReasonCode).toBe("not_seen_during_count");
    expect(parsed.restoredReasonCode).toBe("found_after_move");
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

  it("allows current sources to remain blocked when required financial facts are missing", () => {
    expect(
      accountingExportPreflightResponseSchema.safeParse({
        orderId: "10000000-0000-4000-8000-000000000001",
        currentSourceSetSha256: "a".repeat(64),
        exactPriorDuplicate: null,
        canCreateFresh: false,
        canSupersede: false,
      }).success,
    ).toBe(true);
  });
});

describe("P12 inspection and concern contracts", () => {
  const revisionId = "10000000-0000-4000-8000-000000000201";
  const predecessorId = "10000000-0000-4000-8000-000000000202";
  const concernId = "10000000-0000-4000-8000-000000000203";
  const markerAssetId = "10000000-0000-4000-8000-000000000204";
  const contextAssetId = "10000000-0000-4000-8000-000000000205";
  const creatorId = "10000000-0000-4000-8000-000000000206";
  const reviewerId = "10000000-0000-4000-8000-000000000207";

  it("requires a contiguous revision reference and rejects unknown check fields", () => {
    const firstRevision = {
      revisionId,
      inspectionItemKey: "front_body",
      productCategory: "tops",
      definitionVersion: 1,
      status: "unconfirmed",
      concernRevisionIds: [],
      revision: 1,
      supersedesRevisionId: null,
      humanConfirmed: false,
    } as const;

    expect(recordInspectionCheckResultRequestSchema.safeParse(firstRevision).success).toBe(true);
    for (const forbiddenInput of [
      { createdBy: creatorId },
      { recordedBy: creatorId },
      { confirmedBy: reviewerId },
      { confirmedAt: "2026-08-29T00:01:00.000Z" },
      { originalStorageKey: "workspaces/private/originals/secret.jpg" },
    ]) {
      expect(
        recordInspectionCheckResultRequestSchema.safeParse({
          ...firstRevision,
          ...forbiddenInput,
        }).success,
      ).toBe(false);
    }
    expect(
      recordInspectionCheckResultRequestSchema.safeParse({
        ...firstRevision,
        revision: 2,
      }).success,
    ).toBe(false);
    expect(
      recordInspectionCheckResultRequestSchema.safeParse({
        ...firstRevision,
        status: "no_issue_confirmed",
        humanConfirmed: false,
      }).success,
    ).toBe(false);
  });

  it("separates the reviewer from the immediately prior check recorder", () => {
    const response = {
      revisionId,
      workspaceId: "10000000-0000-4000-8000-000000000208",
      skuId: "10000000-0000-4000-8000-000000000209",
      inspectionItemKey: "front_body",
      productCategory: "tops",
      definitionVersion: 1,
      status: "no_issue_confirmed",
      concernRevisionIds: [],
      revision: 2,
      supersedesRevisionId: predecessorId,
      supersededRecordedBy: creatorId,
      supersededStatus: "unconfirmed",
      createdBy: creatorId,
      createdAt: "2026-08-29T00:00:00.000Z",
      recordedBy: reviewerId,
      recordedAt: "2026-08-29T00:01:00.000Z",
      confirmedBy: reviewerId,
      confirmedAt: "2026-08-29T00:01:00.000Z",
    } as const;

    expect(inspectionCheckResultRevisionResponseSchema.safeParse(response).success).toBe(true);
    expect(
      inspectionCheckResultRevisionResponseSchema.safeParse({
        ...response,
        confirmedBy: creatorId,
      }).success,
    ).toBe(false);
    expect(
      inspectionCheckResultRevisionResponseSchema.safeParse({
        ...response,
        createdBy: reviewerId,
        supersededRecordedBy: creatorId,
      }).success,
    ).toBe(true);
    expect(
      inspectionCheckResultRevisionResponseSchema.safeParse({
        ...response,
        supersededStatus: "concern_present",
      }).success,
    ).toBe(false);
  });

  it("requires exact, unique concern revision IDs only for concern-present checks", () => {
    const concernPresent = {
      revisionId,
      inspectionItemKey: "front_body",
      productCategory: "tops",
      definitionVersion: 1,
      status: "concern_present",
      concernRevisionIds: [concernId],
      revision: 2,
      supersedesRevisionId: predecessorId,
      humanConfirmed: true,
    } as const;

    expect(recordInspectionCheckResultRequestSchema.safeParse(concernPresent).success).toBe(true);
    expect(
      recordInspectionCheckResultRequestSchema.safeParse({
        ...concernPresent,
        concernRevisionIds: [],
      }).success,
    ).toBe(false);
    expect(
      recordInspectionCheckResultRequestSchema.safeParse({
        ...concernPresent,
        concernRevisionIds: [concernId, concernId],
      }).success,
    ).toBe(false);
    expect(
      recordInspectionCheckResultRequestSchema.safeParse({
        ...concernPresent,
        status: "no_issue_confirmed",
      }).success,
    ).toBe(false);
  });

  it("requires normalized markers and context photos for visible concerns", () => {
    const visibleConcern = {
      revisionId,
      concernId,
      inspectionItemKey: "front_body",
      productCategory: "tops",
      definitionVersion: 1,
      revision: 1,
      supersedesRevisionId: null,
      itemLocation: "前身頃の右下",
      concernType: "stain",
      severity: "noticeable",
      marker: { sourceAssetId: markerAssetId, x: 0.25, y: 0.75 },
      contextEvidenceAssetId: contextAssetId,
      detailEvidenceAssetId: null,
      memo: "薄いしみがあります",
      reviewState: "pending_review",
      humanReviewed: false,
    } as const;

    expect(recordInspectionConcernRevisionRequestSchema.safeParse(visibleConcern).success).toBe(
      true,
    );
    expect(
      recordInspectionConcernRevisionRequestSchema.safeParse({
        ...visibleConcern,
        marker: { ...visibleConcern.marker, x: -0.001 },
      }).success,
    ).toBe(false);
    expect(
      recordInspectionConcernRevisionRequestSchema.safeParse({
        ...visibleConcern,
        marker: { ...visibleConcern.marker, y: 1.001 },
      }).success,
    ).toBe(false);
    expect(
      recordInspectionConcernRevisionRequestSchema.safeParse({
        ...visibleConcern,
        marker: null,
      }).success,
    ).toBe(false);
    expect(
      recordInspectionConcernRevisionRequestSchema.safeParse({
        ...visibleConcern,
        contextEvidenceAssetId: null,
      }).success,
    ).toBe(false);
    expect(
      recordInspectionConcernRevisionRequestSchema.safeParse({
        ...visibleConcern,
        marker: { ...visibleConcern.marker, displayX: 320 },
      }).success,
    ).toBe(false);
  });

  it("allows only an explained non-visual odor concern to omit photos", () => {
    const odorConcern = {
      revisionId,
      concernId,
      inspectionItemKey: "odor",
      productCategory: "tops",
      definitionVersion: 1,
      revision: 2,
      supersedesRevisionId: predecessorId,
      itemLocation: "商品全体",
      concernType: "odor",
      severity: "small",
      marker: null,
      contextEvidenceAssetId: null,
      detailEvidenceAssetId: null,
      memo: "保管時のにおいを確認しました",
      reviewState: "human_confirmed",
      humanReviewed: true,
    } as const;

    expect(recordInspectionConcernRevisionRequestSchema.safeParse(odorConcern).success).toBe(true);
    expect(
      recordInspectionConcernRevisionRequestSchema.safeParse({ ...odorConcern, memo: null })
        .success,
    ).toBe(false);
    expect(
      recordInspectionConcernRevisionRequestSchema.safeParse({
        ...odorConcern,
        concernType: "other",
      }).success,
    ).toBe(false);
    expect(
      recordInspectionConcernRevisionRequestSchema.safeParse({
        ...odorConcern,
        marker: { sourceAssetId: markerAssetId, x: 0.5, y: 0.5 },
        contextEvidenceAssetId: contextAssetId,
        memo: null,
      }).success,
    ).toBe(false);
    const trimmed = recordInspectionConcernRevisionRequestSchema.parse({
      ...odorConcern,
      memo: "  保管時のにおいを確認しました  ",
    });
    expect(trimmed.memo).toBe("保管時のにおいを確認しました");
  });

  it("never publishes storage keys and rejects self-reviewed concern responses", () => {
    const response = {
      revisionId,
      concernId,
      workspaceId: "10000000-0000-4000-8000-000000000208",
      skuId: "10000000-0000-4000-8000-000000000209",
      inspectionItemKey: "front_body",
      productCategory: "tops",
      definitionVersion: 1,
      revision: 2,
      supersedesRevisionId: predecessorId,
      itemLocation: "前身頃の右下",
      concernType: "stain",
      severity: "noticeable",
      marker: { sourceAssetId: markerAssetId, x: 0.25, y: 0.75 },
      contextEvidenceAssetId: contextAssetId,
      detailEvidenceAssetId: null,
      memo: "薄いしみがあります",
      reviewState: "human_confirmed",
      supersededRecordedBy: creatorId,
      supersededReviewState: "pending_review",
      createdBy: creatorId,
      createdAt: "2026-08-29T00:00:00.000Z",
      recordedBy: reviewerId,
      recordedAt: "2026-08-29T00:01:00.000Z",
      reviewedBy: reviewerId,
      reviewedAt: "2026-08-29T00:01:00.000Z",
    } as const;

    expect(inspectionConcernRevisionResponseSchema.safeParse(response).success).toBe(true);
    expect(
      inspectionConcernRevisionResponseSchema.safeParse({
        ...response,
        originalStorageKey: "workspaces/private/originals/secret.jpg",
      }).success,
    ).toBe(false);
    expect(
      inspectionConcernRevisionResponseSchema.safeParse({
        ...response,
        reviewedBy: creatorId,
      }).success,
    ).toBe(false);
    expect(
      inspectionConcernRevisionResponseSchema.safeParse({
        ...response,
        createdBy: reviewerId,
        supersededRecordedBy: creatorId,
      }).success,
    ).toBe(true);
    expect(
      inspectionConcernRevisionResponseSchema.safeParse({
        ...response,
        supersededReviewState: "draft",
      }).success,
    ).toBe(false);
  });

  it("treats confirmation, changes-requested and dismissal as human review revisions", () => {
    const reviewedConcern = {
      revisionId,
      concernId,
      inspectionItemKey: "front_body",
      productCategory: "tops",
      definitionVersion: 1,
      revision: 2,
      supersedesRevisionId: predecessorId,
      itemLocation: "前身頃の右下",
      concernType: "stain",
      severity: "noticeable",
      marker: { sourceAssetId: markerAssetId, x: 0.25, y: 0.75 },
      contextEvidenceAssetId: contextAssetId,
      detailEvidenceAssetId: null,
      memo: "薄いしみがあります",
      reviewState: "changes_requested",
      humanReviewed: true,
    } as const;

    expect(recordInspectionConcernRevisionRequestSchema.safeParse(reviewedConcern).success).toBe(
      true,
    );
    expect(
      recordInspectionConcernRevisionRequestSchema.safeParse({
        ...reviewedConcern,
        humanReviewed: false,
      }).success,
    ).toBe(false);
    expect(
      recordInspectionConcernRevisionRequestSchema.safeParse({
        ...reviewedConcern,
        revision: 1,
        supersedesRevisionId: null,
      }).success,
    ).toBe(false);
    expect(
      recordInspectionConcernRevisionRequestSchema.safeParse({
        ...reviewedConcern,
        reviewState: "human_dismissed",
      }).success,
    ).toBe(true);
  });

  it("rejects actor, time and private storage fields from concern write input", () => {
    const draft = {
      revisionId,
      concernId,
      inspectionItemKey: "front_body",
      productCategory: "tops",
      definitionVersion: 1,
      revision: 1,
      supersedesRevisionId: null,
      itemLocation: "前身頃の右下",
      concernType: "stain",
      severity: "small",
      marker: { sourceAssetId: markerAssetId, x: 0.25, y: 0.75 },
      contextEvidenceAssetId: contextAssetId,
      detailEvidenceAssetId: null,
      memo: "入力境界の確認用",
      reviewState: "draft",
      humanReviewed: false,
    } as const;

    expect(recordInspectionConcernRevisionRequestSchema.safeParse(draft).success).toBe(true);
    for (const forbiddenInput of [
      { createdBy: creatorId },
      { recordedBy: creatorId },
      { reviewedBy: reviewerId },
      { reviewedAt: "2026-08-29T00:01:00.000Z" },
      { originalStorageKey: "workspaces/private/originals/secret.jpg" },
    ]) {
      expect(
        recordInspectionConcernRevisionRequestSchema.safeParse({
          ...draft,
          ...forbiddenInput,
        }).success,
      ).toBe(false);
    }
  });

  it("publishes human-dismissed as a reviewed terminal response state", () => {
    const dismissed = {
      revisionId,
      concernId,
      workspaceId: "10000000-0000-4000-8000-000000000208",
      skuId: "10000000-0000-4000-8000-000000000209",
      inspectionItemKey: "front_body",
      productCategory: "tops",
      definitionVersion: 1,
      revision: 2,
      supersedesRevisionId: predecessorId,
      itemLocation: "前身頃の右下",
      concernType: "stain",
      severity: "small",
      marker: { sourceAssetId: markerAssetId, x: 0.25, y: 0.75 },
      contextEvidenceAssetId: contextAssetId,
      detailEvidenceAssetId: null,
      memo: "人が問題なしと判断しました",
      reviewState: "human_dismissed",
      supersededRecordedBy: creatorId,
      supersededReviewState: "pending_review",
      createdBy: creatorId,
      createdAt: "2026-08-29T00:00:00.000Z",
      recordedBy: reviewerId,
      recordedAt: "2026-08-29T00:01:00.000Z",
      reviewedBy: reviewerId,
      reviewedAt: "2026-08-29T00:01:00.000Z",
    } as const;

    expect(inspectionConcernRevisionResponseSchema.safeParse(dismissed).success).toBe(true);
    expect(
      inspectionConcernRevisionResponseSchema.safeParse({
        ...dismissed,
        reviewedBy: creatorId,
      }).success,
    ).toBe(false);
  });
});

describe("ten-product pilot contract", () => {
  it("derives restart-safe v1.1 SKU and receipt identifiers from the complete run UUID", () => {
    const runId = "a0000000-b111-4c22-8d33-e44444444444";
    expect(listingPrepPilotItemIdentifiers(runId, "TOP-01")).toEqual({
      skuCode: "PILOT-TOP-01-A0000000-B111-4C22-8D33-E44444444444",
      receiptReference: "PILOT-REC-TOP-01-A0000000-B111-4C22-8D33-E44444444444",
    });
    expect(listingPrepPilotItemIdentifiers(runId, "TOP-01").skuCode.length).toBeLessThanOrEqual(64);
    expect(
      listingPrepPilotItemIdentifiers(runId, "TOP-01").receiptReference.length,
    ).toBeLessThanOrEqual(120);
    expect(() => listingPrepPilotItemIdentifiers("not-a-run-id", "TOP-01")).toThrow();
  });

  it("keeps v1.1 starts on their verified 0033 snapshot after additive P12/P13/P14 migrations", () => {
    const latestMigrationVersion = readdirSync(new URL("../../db/migrations/", import.meta.url))
      .filter((name) => /^\d{4}_.+\.sql$/u.test(name))
      .sort()
      .at(-1)
      ?.slice(0, 4);
    const valid = {
      protocolVersion: listingPrepPilotProtocolVersion,
      fixtureManifestSha256: listingPrepPilotFixtureManifestSha256,
      commitSha: "a".repeat(40),
      migrationVersion: listingPrepPilotMigrationVersion,
      platform: "Windows",
      browser: "Chrome 140",
      viewport: "390x844",
      warmupCompleted: true,
      humanConfirmed: true,
    } as const;
    expect(startPilotRunRequestSchema.safeParse(valid).success).toBe(true);
    expect(listingPrepPilotMigrationVersion).toBe("0033");
    expect(latestMigrationVersion).toBe("0039");
    expect(
      startPilotRunRequestSchema.safeParse({ ...valid, migrationVersion: "0028" }).success,
    ).toBe(false);
    expect(
      startPilotRunRequestSchema.safeParse({
        ...valid,
        fixtureManifestSha256: "b".repeat(64),
      }).success,
    ).toBe(false);
    expect(startPilotRunRequestSchema.safeParse({ ...valid, viewport: "1440x1000" }).success).toBe(
      false,
    );
  });

  it("keeps historical v1.0 runs readable while accepting only v1.1 at migration 0033", () => {
    const base = {
      runId: "10000000-0000-4000-8000-000000000001",
      workspaceId: "10000000-0000-4000-8000-000000000002",
      commitSha: "a".repeat(40),
      platform: "Windows",
      browser: "Chrome 140",
      viewport: "390x844",
      actorId: "10000000-0000-4000-8000-000000000003",
      state: "active",
      externallyInvalidated: false,
      externalInvalidationReason: null,
      warmupCompletedAt: "2026-08-24T00:00:00.000Z",
      startedAt: "2026-08-24T00:01:00.000Z",
      completedAt: null,
      items: [],
      summary: {
        itemCount: 0,
        completedItemCount: 0,
        p50Seconds: null,
        p75Seconds: null,
        minSeconds: null,
        maxSeconds: null,
        invalidAttemptCount: 0,
        missingRequiredImageCount: 0,
        measurementReworkCount: 0,
        labelLocationMismatchCount: 0,
        misputawayCount: 0,
        networkRetryCount: 0,
        manualCorrectionCount: 0,
        passed: null,
      },
    } as const;
    const historical = {
      ...base,
      protocolVersion: "listing_prep_pilot_v1.0.0",
      fixtureManifestSha256: null,
      migrationVersion: "0028",
    } as const;
    const current = {
      ...base,
      protocolVersion: listingPrepPilotProtocolVersion,
      fixtureManifestSha256: listingPrepPilotFixtureManifestSha256,
      migrationVersion: "0033",
    } as const;

    expect(pilotRunResponseSchema.safeParse(historical).success).toBe(true);
    expect(pilotRunResponseSchema.safeParse(current).success).toBe(true);
    expect(
      pilotRunResponseSchema.safeParse({ ...historical, migrationVersion: "0033" }).success,
    ).toBe(false);
    expect(pilotRunResponseSchema.safeParse({ ...current, migrationVersion: "0034" }).success).toBe(
      false,
    );
    expect(
      pilotRunResponseSchema.safeParse({ ...current, fixtureManifestSha256: null }).success,
    ).toBe(false);
  });

  it("publishes exact category measurement templates and rejects category mismatches", () => {
    const pantsDefinitions =
      listingPrepPilotMeasurementTemplates.pants_standard_v1.measurements.map((definition) => ({
        ...definition,
        state: listingPrepPilotMeasurementTemplates.pants_standard_v1.state,
      }));
    expect(pantsDefinitions).toHaveLength(5);
    expect(pantsDefinitions.map((definition) => definition.definitionId)).toEqual([
      "waist_flat_width",
      "rise_length",
      "inseam_length",
      "thigh_width",
      "hem_width",
    ]);
    expect(
      measurementProfileResponseSchema.safeParse({
        category: "pants",
        measurementTemplateId: "pants_standard_v1",
        measurementTemplateVersion: 1,
        definitions: pantsDefinitions,
        confirmedBy: "10000000-0000-4000-8000-000000000001",
        confirmedAt: "2026-08-24T00:00:00.000Z",
      }).success,
    ).toBe(true);

    const item = {
      skuCode: "SKU-PANTS-001",
      title: "テスト用パンツ",
      category: "pants",
      measurementTemplateId: "pants_standard_v1",
      receiptReference: "RCPT-PANTS-001",
      supplierName: "テスト仕入先",
      purchasedAt: "2026-08-24T00:00:00.000Z",
      receiptAmountMinor: 1000,
      allocatedCostMinor: 1000,
      idempotencyKey: "10000000-0000-4000-8000-000000000002",
      humanConfirmed: true,
    } as const;
    expect(createP0ItemRequestSchema.safeParse(item).success).toBe(true);
    expect(
      createP0ItemRequestSchema.safeParse({
        ...item,
        measurementTemplateId: "tops_standard_v1",
      }).success,
    ).toBe(false);
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
    expect(
      recordPilotExceptionRequestSchema.safeParse({
        eventType: "manual_correction",
        detailCode: "client_claimed_correction",
        idempotencyKey: "10000000-0000-4000-8000-000000000005",
        humanConfirmed: true,
      }).success,
    ).toBe(false);
    const invalidation = {
      reasonCode: "power_outage",
      idempotencyKey: "10000000-0000-4000-8000-000000000004",
      humanConfirmed: true,
    } as const;
    expect(invalidatePilotRunRequestSchema.safeParse(invalidation).success).toBe(true);
    expect(
      invalidatePilotRunRequestSchema.safeParse({
        ...invalidation,
        reasonCode: "user_break",
      }).success,
    ).toBe(false);
    expect(
      invalidatePilotRunRequestSchema.safeParse({
        ...invalidation,
        manualCorrectionCount: 0,
      }).success,
    ).toBe(false);
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
