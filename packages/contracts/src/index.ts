import { z } from "zod";

import {
  listingPrepPilotFixtureIds,
  listingPrepPilotFixtureManifestSha256,
  listingPrepPilotFixtureProfiles,
  listingPrepPilotMeasurementTemplates,
  listingPrepPilotProtocolVersion,
  listingPrepPilotWarmupFixture,
  type ListingPrepPilotFixtureProfile,
  type ListingPrepPilotMeasurementTemplateId,
} from "./pilot-fixtures.generated.js";

export {
  listingPrepPilotFixtureIds,
  listingPrepPilotFixtureManifestSha256,
  listingPrepPilotFixtureProfiles,
  listingPrepPilotMeasurementTemplates,
  listingPrepPilotProtocolVersion,
  listingPrepPilotWarmupFixture,
  type ListingPrepPilotFixtureProfile,
  type ListingPrepPilotMeasurementTemplateId,
};

export const workspaceIdSchema = z.string().uuid();

export function codeCheckDigit(baseCode: string): number {
  const normalized = baseCode.trim().toUpperCase();
  let total = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    const distanceFromRight = normalized.length - 1 - index;
    const weight = distanceFromRight % 2 === 0 ? 3 : 1;
    total += (normalized.codePointAt(index) ?? 0) * weight;
  }
  return total % 10;
}

export function appendCodeCheckDigit(baseCode: string): string {
  const normalized = baseCode.trim().toUpperCase();
  return `${normalized}-${codeCheckDigit(normalized)}`;
}

export function hasValidCodeCheckDigit(code: string): boolean {
  const normalized = code.trim().toUpperCase();
  const separator = normalized.lastIndexOf("-");
  if (separator <= 0 || !/^[0-9]$/u.test(normalized.slice(separator + 1))) return false;
  const base = normalized.slice(0, separator);
  return Number(normalized.slice(separator + 1)) === codeCheckDigit(base);
}

export const inventoryNumberSchema = z
  .string()
  .regex(/^INV-[0-9]{6}-[0-9]$/u)
  .refine(hasValidCodeCheckDigit, "Inventory number check digit is invalid");

export const checkedLocationCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(5)
  .max(66)
  .regex(/^[A-Z0-9]+(?:-[A-Z0-9]+)+-[0-9]$/u)
  .refine(hasValidCodeCheckDigit, "Location code check digit is invalid");

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("resale-ops-api"),
  time: z.iso.datetime(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const createSkuRequestSchema = z.object({
  skuCode: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[A-Z0-9-]+$/u),
  title: z.string().trim().min(1).max(160),
  category: z.string().trim().min(1).max(80),
});

export const skuResponseSchema = z.object({
  id: z.string().uuid(),
  workspaceId: workspaceIdSchema,
  skuCode: z.string(),
  title: z.string(),
  category: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

export const inventorySummarySchema = z.object({
  available: z.number().int().nonnegative(),
  putawayPending: z.number().int().nonnegative(),
  reserved: z.number().int().nonnegative(),
  discrepancies: z.number().int().nonnegative(),
  olderThan90Days: z.number().int().nonnegative(),
  lastSyncedAt: z.iso.datetime(),
});

export const ownerPulseResponseSchema = z.object({
  periodStart: z.iso.datetime(),
  periodEnd: z.iso.datetime(),
  completedOrderCount: z.number().int().nonnegative(),
  completedSalesMinor: z.number().int().nonnegative(),
  refundsMinor: z.number().int().nonnegative(),
  netSalesMinor: z.number().int(),
  costOfGoodsMinor: z.number().int().nonnegative(),
  grossProfitMinor: z.number().int().nullable(),
  sellingFeesMinor: z.number().int(),
  shippingCostMinor: z.number().int().nonnegative(),
  packagingCostMinor: z.number().int().nonnegative(),
  contributionProfitMinor: z.number().int().nullable(),
  inventoryCostMinor: z.number().int().nonnegative().nullable(),
  missingCostCount: z.number().int().nonnegative(),
  missingShippingCount: z.number().int().nonnegative(),
  approvalPendingCount: z.number().int().nonnegative(),
  approvalPendingBreakdown: z.object({
    stocktakeDiscrepancyCount: z.number().int().nonnegative(),
    locationPhotoCount: z.number().int().nonnegative(),
    disposalCandidateCount: z.number().int().nonnegative(),
    listingReviewCount: z.number().int().nonnegative(),
  }),
  aging: z.object({
    days0To30: z.number().int().nonnegative(),
    days31To60: z.number().int().nonnegative(),
    days61To90: z.number().int().nonnegative(),
    olderThan90Days: z.number().int().nonnegative(),
  }),
  supplierOverview: z
    .array(
      z.object({
        supplierName: z.string().trim().min(1).max(160),
        itemCount: z.number().int().nonnegative(),
        coreDataCompletenessPercent: z.number().int().min(0).max(100),
      }),
    )
    .max(3),
  formulaVersion: z.literal("financial_formula_v1.0.0"),
  disclaimer: z.literal(
    "運用分析の参考値です。会計上の売上・利益・所得・税額を示すものではありません。",
  ),
  lastCalculatedAt: z.iso.datetime(),
});

export const workspaceRoleSchema = z.enum([
  "owner",
  "inventory_manager",
  "field_worker",
  "shipping",
  "accounting",
]);

export const sessionContextResponseSchema = z.object({
  identityId: z.string().uuid(),
  workspaceId: workspaceIdSchema,
  role: workspaceRoleSchema,
});

export const putawayInventoryRequestSchema = z
  .object({
    inventoryNumber: inventoryNumberSchema,
    locationCode: checkedLocationCodeSchema,
    inventoryLabelVersion: z.number().int().positive().max(10_000),
    locationLabelVersion: z.number().int().positive().max(10_000),
    inventoryScannedAt: z.iso.datetime(),
    locationScannedAt: z.iso.datetime(),
    confirmedAt: z.iso.datetime(),
    idempotencyKey: z.string().uuid(),
    humanConfirmed: z.literal(true),
  })
  .strict()
  .refine(
    (value) =>
      Date.parse(value.confirmedAt) >=
      Math.max(Date.parse(value.inventoryScannedAt), Date.parse(value.locationScannedAt)),
    { message: "Human confirmation must follow both label scans", path: ["confirmedAt"] },
  );

export const putawayInventoryResponseSchema = z.object({
  inventoryUnitId: z.string().uuid(),
  inventoryNumber: inventoryNumberSchema,
  status: z.literal("available"),
  locationId: z.string().uuid(),
  locationCode: checkedLocationCodeSchema,
  movementSequence: z.number().int().positive(),
  scanSessionId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
  syncedAt: z.iso.datetime(),
});

export const putawayCatalogResponseSchema = z.object({
  workspaceId: workspaceIdSchema,
  inventory: z.array(
    z.object({
      inventoryNumber: inventoryNumberSchema,
      labelVersion: z.number().int().positive(),
      status: z.literal("putaway_pending"),
    }),
  ),
  locations: z.array(
    z.object({
      code: checkedLocationCodeSchema,
      name: z.string(),
      labelVersion: z.number().int().positive(),
    }),
  ),
  loadedAt: z.iso.datetime(),
});

export const locationPhotoKindSchema = z.enum(["room", "shelf", "exact_position"]);

export const uploadLocationPhotoQuerySchema = z
  .object({
    photoId: z.string().uuid(),
    originalAssetId: z.string().uuid(),
    photoKind: locationPhotoKindSchema,
    capturedAt: z.iso.datetime(),
    humanConfirmed: z.literal("true").transform(() => true as const),
  })
  .strict();

export const reviewLocationPhotoRequestSchema = z
  .object({
    reviewedAt: z.iso.datetime(),
    humanApproved: z.literal(true),
  })
  .strict();

export const registerLocationPhotoRequestSchema = z
  .object({
    photoId: z.string().uuid(),
    originalAssetId: z.string().uuid(),
    photoKind: locationPhotoKindSchema,
    originalSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    originalStorageKey: z.string().trim().min(1).max(500),
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/heic"]),
    sizeBytes: z
      .number()
      .int()
      .positive()
      .max(25 * 1024 * 1024),
    width: z.number().int().positive().max(12_000),
    height: z.number().int().positive().max(12_000),
    capturedAt: z.iso.datetime(),
    humanConfirmed: z.literal(true),
  })
  .strict();

export const approveLocationPhotoRequestSchema = z
  .object({
    derivativeAssetId: z.string().uuid(),
    derivativeSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    derivativeStorageKey: z.string().trim().min(1).max(500),
    gpsExifCount: z.literal(0),
    reviewedAt: z.iso.datetime(),
    humanApproved: z.literal(true),
  })
  .strict();

export const locationPhotoResponseSchema = z.object({
  photoId: z.string().uuid(),
  workspaceId: workspaceIdSchema,
  locationId: z.string().uuid(),
  photoKind: locationPhotoKindSchema,
  reviewState: z.enum(["pending", "approved", "rejected"]),
  originalAssetId: z.string().uuid(),
  originalSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  derivativeAssetId: z.string().uuid().nullable(),
  derivativeSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/u)
    .nullable(),
  contentUrl: z.string().startsWith("/v1/workspaces/").nullable(),
  gpsExifCount: z.literal(0),
  capturedBy: z.string().uuid(),
  capturedAt: z.iso.datetime(),
  reviewedBy: z.string().uuid().nullable(),
  reviewedAt: z.iso.datetime().nullable(),
});

export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  requestId: z.string(),
});

export const loginRequestSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    password: z.string().min(12).max(128),
  })
  .strict();

export const p0WorkflowStateSchema = z.enum([
  "sku_created",
  "purchase_confirmed",
  "capture_confirmed",
  "listing_confirmed",
  "order_confirmed",
  "picked",
  "packed",
  "shipped",
  "journal_approved",
]);

export const p0WorkflowActionSchema = z.enum([
  "confirm_purchase",
  "confirm_capture",
  "confirm_listing",
  "confirm_order",
  "confirm_pick",
  "confirm_pack",
  "confirm_ship",
  "approve_journal",
]);

export const listingPrepPilotFixtures = listingPrepPilotFixtureIds;

export const pilotFixtureIdSchema = z.enum(listingPrepPilotFixtures);

export function listingPrepPilotItemIdentifiers(
  runId: string,
  productFixtureId: z.infer<typeof pilotFixtureIdSchema>,
): { skuCode: string; receiptReference: string } {
  const canonicalRunId = workspaceIdSchema.parse(runId).toUpperCase();
  const canonicalFixtureId = pilotFixtureIdSchema.parse(productFixtureId);
  return {
    skuCode: `PILOT-${canonicalFixtureId}-${canonicalRunId}`,
    receiptReference: `PILOT-REC-${canonicalFixtureId}-${canonicalRunId}`,
  };
}

export const pilotCategorySchema = z.enum(["tops", "outer", "pants", "knit"]);
export const pilotFixtureCategories = Object.fromEntries(
  listingPrepPilotFixtureProfiles.map((profile) => [profile.fixtureId, profile.category]),
) as Record<(typeof listingPrepPilotFixtures)[number], z.infer<typeof pilotCategorySchema>>;

const listingPrepPilotMeasurementTemplateIds = Object.keys(
  listingPrepPilotMeasurementTemplates,
) as [ListingPrepPilotMeasurementTemplateId, ...ListingPrepPilotMeasurementTemplateId[]];

export const measurementTemplateIdSchema = z.enum(listingPrepPilotMeasurementTemplateIds);

export const measurementDefinitionSchema = z
  .object({
    definitionId: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/u),
    label: z.string().trim().min(1).max(80),
    definitionVersion: z.number().int().positive().max(100),
    basis: z.enum(["flat_width", "circumference", "length"]),
    state: z.enum(["natural", "closed", "unstretched"]),
  })
  .strict();

export const measurementProfileResponseSchema = z
  .object({
    category: pilotCategorySchema,
    measurementTemplateId: measurementTemplateIdSchema,
    measurementTemplateVersion: z.literal(1),
    definitions: measurementDefinitionSchema.array().min(1).max(12),
    confirmedBy: z.string().uuid(),
    confirmedAt: z.iso.datetime(),
  })
  .strict()
  .superRefine((value, context) => {
    const template = listingPrepPilotMeasurementTemplates[value.measurementTemplateId];
    if (
      template.category !== value.category ||
      template.version !== value.measurementTemplateVersion
    ) {
      context.addIssue({
        code: "custom",
        message: "Measurement template does not match its category or version",
        path: ["measurementTemplateId"],
      });
    }
    const expectedDefinitions = template.measurements.map((definition) => ({
      ...definition,
      state: template.state,
    }));
    if (JSON.stringify(value.definitions) !== JSON.stringify(expectedDefinitions)) {
      context.addIssue({
        code: "custom",
        message: "Measurement profile definitions must exactly match the generated template",
        path: ["definitions"],
      });
    }
  });

export const pilotExceptionMetricsSchema = z
  .object({
    invalidAttemptCount: z.number().int().nonnegative().max(100).default(0),
    missingRequiredImageCount: z.number().int().nonnegative().max(100).default(0),
    measurementReworkCount: z.number().int().nonnegative().max(100).default(0),
    labelLocationMismatchCount: z.number().int().nonnegative().max(100).default(0),
    misputawayCount: z.number().int().nonnegative().max(100).default(0),
    networkRetryCount: z.number().int().nonnegative().max(100).default(0),
    manualCorrectionCount: z.number().int().nonnegative().max(100).default(0),
  })
  .strict();

export const pilotEventTypeSchema = z.enum([
  "invalid_attempt",
  "missing_required_image",
  "measurement_rework",
  "label_location_mismatch",
  "misputaway",
  "network_retry",
]);

export const recordPilotExceptionRequestSchema = z
  .object({
    eventType: pilotEventTypeSchema,
    detailCode: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9_]+$/u),
    idempotencyKey: z.string().uuid(),
    humanConfirmed: z.literal(true),
  })
  .strict();

export const pilotExternalInvalidationReasonSchema = z.enum([
  "power_outage",
  "os_forced_update",
  "device_hardware_failure",
]);

export const invalidatePilotRunRequestSchema = z
  .object({
    reasonCode: pilotExternalInvalidationReasonSchema,
    idempotencyKey: z.string().uuid(),
    humanConfirmed: z.literal(true),
  })
  .strict();

export const advanceP0WorkflowRequestSchema = z
  .object({
    action: p0WorkflowActionSchema,
    idempotencyKey: z.string().uuid(),
    evidenceReferenceIds: z.array(z.string().uuid()).min(1).max(20),
    requiredFactsConfirmed: z.literal(true),
    manualChannelHandoff: z.boolean().default(false),
  })
  .strict();

export const p0WorkflowResponseSchema = z.object({
  workspaceId: workspaceIdSchema,
  skuId: z.string().uuid(),
  state: p0WorkflowStateSchema,
  lastAction: p0WorkflowActionSchema.nullable(),
  version: z.number().int().positive(),
  updatedAt: z.iso.datetime(),
});

export const photoRoleSchema = z.enum(["front", "back", "brand_tag", "care_label", "flaw"]);

export const registerMediaAssetRequestSchema = z
  .object({
    assetId: z.string().uuid(),
    role: photoRoleSchema,
    originalSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    originalStorageKey: z.string().trim().min(1).max(500),
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/heic"]),
    sizeBytes: z
      .number()
      .int()
      .positive()
      .max(25 * 1024 * 1024),
    width: z.number().int().positive().max(12_000),
    height: z.number().int().positive().max(12_000),
  })
  .strict();

export const uploadProductMediaQuerySchema = z
  .object({
    assetId: z.string().uuid(),
    role: z.enum(["front", "back", "brand_tag", "care_label", "flaw"]),
  })
  .strict();

export const mediaAssetResponseSchema = registerMediaAssetRequestSchema.extend({
  workspaceId: workspaceIdSchema,
  skuId: z.string().uuid(),
  createdAt: z.iso.datetime(),
});

export const productMediaUploadResponseSchema = mediaAssetResponseSchema.omit({
  originalStorageKey: true,
});

export const inspectionCheckStatusSchema = z.enum([
  "unconfirmed",
  "no_issue_confirmed",
  "concern_present",
]);

export const inspectionConcernTypeSchema = z.enum([
  "stain",
  "scratch",
  "pilling",
  "fray",
  "fade",
  "peel",
  "odor",
  "other",
]);

export const inspectionConcernSeveritySchema = z.enum(["small", "noticeable", "affects_use"]);

export const inspectionConcernReviewStateSchema = z
  .enum(["draft", "pending_review", "human_confirmed", "changes_requested", "human_dismissed"])
  .describe(
    "Draft, pending, changes-requested, and human-confirmed remain active; only terminal human-dismissed resolves the concern",
  );

const inspectionItemKeySchema = z.string().regex(/^[a-z][a-z0-9_]{1,63}$/u);
const inspectionProductCategorySchema = z.string().regex(/^[a-z][a-z0-9_]{1,63}$/u);
const inspectionDefinitionVersionSchema = z.number().int().min(1).max(1000);
const inspectionRevisionSchema = z.number().int().min(1).max(10_000);

function validateInspectionRevisionLink(
  value: { revision: number; supersedesRevisionId: string | null },
  context: z.RefinementCtx,
) {
  if (value.revision === 1 && value.supersedesRevisionId !== null) {
    context.addIssue({
      code: "custom",
      path: ["supersedesRevisionId"],
      message: "The first inspection revision cannot supersede another revision",
    });
  }
  if (value.revision > 1 && value.supersedesRevisionId === null) {
    context.addIssue({
      code: "custom",
      path: ["supersedesRevisionId"],
      message: "A later inspection revision must identify its predecessor",
    });
  }
}

function validateInspectionConcernReferences(
  value: { status: z.infer<typeof inspectionCheckStatusSchema>; concernRevisionIds: string[] },
  context: z.RefinementCtx,
) {
  const expectedCount = value.status === "concern_present" ? value.concernRevisionIds.length : 0;
  if (
    (value.status === "concern_present" && (expectedCount < 1 || expectedCount > 20)) ||
    (value.status !== "concern_present" && value.concernRevisionIds.length !== 0)
  ) {
    context.addIssue({
      code: "custom",
      path: ["concernRevisionIds"],
      message: "Only concern-present checks may reference one to twenty concern revisions",
    });
  }
  if (new Set(value.concernRevisionIds).size !== value.concernRevisionIds.length) {
    context.addIssue({
      code: "custom",
      path: ["concernRevisionIds"],
      message: "Concern revision IDs must not contain duplicates",
    });
  }
}

function validateInspectionResponsePredecessor(
  value: {
    revision: number;
    supersedesRevisionId: string | null;
    supersededRecordedBy: string | null;
  },
  context: z.RefinementCtx,
) {
  if ((value.supersedesRevisionId === null) !== (value.supersededRecordedBy === null)) {
    context.addIssue({
      code: "custom",
      path: ["supersededRecordedBy"],
      message: "The predecessor recorder must accompany the predecessor revision ID",
    });
  }
}

export const recordInspectionCheckResultRequestSchema = z
  .object({
    revisionId: z.string().uuid(),
    inspectionItemKey: inspectionItemKeySchema,
    productCategory: inspectionProductCategorySchema,
    definitionVersion: inspectionDefinitionVersionSchema,
    status: inspectionCheckStatusSchema,
    concernRevisionIds: z
      .array(z.string().uuid())
      .max(20)
      .describe(
        "Exact complete set of latest human-confirmed concern revision IDs; never media storage keys",
      ),
    revision: inspectionRevisionSchema,
    supersedesRevisionId: z.string().uuid().nullable(),
    humanConfirmed: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    validateInspectionRevisionLink(value, context);
    validateInspectionConcernReferences(value, context);
    if (value.humanConfirmed !== (value.status !== "unconfirmed")) {
      context.addIssue({
        code: "custom",
        path: ["humanConfirmed"],
        message: "Human confirmation must match the inspection check status",
      });
    }
    if (value.status !== "unconfirmed" && value.revision <= 1) {
      context.addIssue({
        code: "custom",
        path: ["revision"],
        message: "A confirmed check must supersede an unconfirmed revision",
      });
    }
  });

export const inspectionCheckResultRevisionResponseSchema = z
  .object({
    revisionId: z.string().uuid(),
    workspaceId: workspaceIdSchema,
    skuId: z.string().uuid(),
    inspectionItemKey: inspectionItemKeySchema,
    productCategory: inspectionProductCategorySchema,
    definitionVersion: inspectionDefinitionVersionSchema,
    status: inspectionCheckStatusSchema,
    concernRevisionIds: z
      .array(z.string().uuid())
      .max(20)
      .describe(
        "Exact complete set of latest human-confirmed concern revision IDs; never media storage keys",
      ),
    revision: inspectionRevisionSchema,
    supersedesRevisionId: z.string().uuid().nullable(),
    supersededRecordedBy: z
      .string()
      .uuid()
      .nullable()
      .describe("Actor who recorded the immediately preceding revision"),
    supersededStatus: inspectionCheckStatusSchema
      .nullable()
      .describe("Status of the immutable immediately preceding revision"),
    createdBy: z.string().uuid().describe("Actor who created the first revision in the chain"),
    createdAt: z.iso.datetime(),
    recordedBy: z.string().uuid().describe("Actor who recorded this exact revision"),
    recordedAt: z.iso.datetime(),
    confirmedBy: z.string().uuid().nullable().describe("Actor who confirmed this exact revision"),
    confirmedAt: z.iso.datetime().nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    validateInspectionRevisionLink(value, context);
    validateInspectionConcernReferences(value, context);
    validateInspectionResponsePredecessor(value, context);
    const isConfirmed = value.status !== "unconfirmed";
    if (isConfirmed !== (value.confirmedBy !== null && value.confirmedAt !== null)) {
      context.addIssue({
        code: "custom",
        path: ["confirmedBy"],
        message: "Confirmation metadata must match the inspection check status",
      });
    }
    if (isConfirmed && value.confirmedBy === value.supersededRecordedBy) {
      context.addIssue({
        code: "custom",
        path: ["confirmedBy"],
        message: "The prior revision recorder cannot confirm their own submission",
      });
    }
    if (isConfirmed && value.revision <= 1) {
      context.addIssue({
        code: "custom",
        path: ["revision"],
        message: "A confirmed check must supersede an unconfirmed revision",
      });
    }
    if (
      (value.supersedesRevisionId === null) !== (value.supersededStatus === null) ||
      (isConfirmed && value.supersededStatus !== "unconfirmed")
    ) {
      context.addIssue({
        code: "custom",
        path: ["supersededStatus"],
        message: "A confirmed check must directly supersede an unconfirmed revision",
      });
    }
  });

export const inspectionConcernMarkerSchema = z
  .object({
    sourceAssetId: z.string().uuid(),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
  })
  .strict();

export const recordInspectionConcernRevisionRequestSchema = z
  .object({
    revisionId: z.string().uuid(),
    concernId: z.string().uuid(),
    inspectionItemKey: inspectionItemKeySchema,
    productCategory: inspectionProductCategorySchema,
    definitionVersion: inspectionDefinitionVersionSchema,
    revision: inspectionRevisionSchema,
    supersedesRevisionId: z.string().uuid().nullable(),
    itemLocation: z.string().trim().min(1).max(120),
    concernType: inspectionConcernTypeSchema,
    severity: inspectionConcernSeveritySchema,
    marker: inspectionConcernMarkerSchema.nullable(),
    contextEvidenceAssetId: z.string().uuid().nullable(),
    detailEvidenceAssetId: z.string().uuid().nullable(),
    memo: z.string().trim().min(1).max(500).nullable(),
    reviewState: inspectionConcernReviewStateSchema,
    humanReviewed: z
      .boolean()
      .describe(
        "True only for human-confirmed, changes-requested, or human-dismissed review revisions",
      ),
  })
  .strict()
  .superRefine((value, context) => {
    validateInspectionRevisionLink(value, context);
    const hasAnyPhoto =
      value.marker !== null ||
      value.contextEvidenceAssetId !== null ||
      value.detailEvidenceAssetId !== null;
    if (value.concernType !== "odor" && value.marker === null) {
      context.addIssue({
        code: "custom",
        path: ["marker"],
        message: "A visible concern requires a marker on its source photo",
      });
    }
    if (value.concernType !== "odor" && value.contextEvidenceAssetId === null) {
      context.addIssue({
        code: "custom",
        path: ["contextEvidenceAssetId"],
        message: "A visible concern requires a context evidence photo",
      });
    }
    if (value.concernType === "odor" && value.memo === null) {
      context.addIssue({
        code: "custom",
        path: ["memo"],
        message: "An odor concern always requires an explanation",
      });
    } else if (!hasAnyPhoto && value.concernType !== "odor") {
      context.addIssue({
        code: "custom",
        path: ["memo"],
        message: "Only a non-visual odor concern may omit photos, and it requires an explanation",
      });
    }
    const isHumanReview =
      value.reviewState === "human_confirmed" ||
      value.reviewState === "changes_requested" ||
      value.reviewState === "human_dismissed";
    if (value.humanReviewed !== isHumanReview) {
      context.addIssue({
        code: "custom",
        path: ["humanReviewed"],
        message: "Human review must match the concern review state",
      });
    }
    if (isHumanReview && value.revision <= 1) {
      context.addIssue({
        code: "custom",
        path: ["revision"],
        message: "A concern review must supersede a pending-review revision",
      });
    }
  });

export const inspectionConcernRevisionResponseSchema = z
  .object({
    revisionId: z.string().uuid(),
    concernId: z.string().uuid(),
    workspaceId: workspaceIdSchema,
    skuId: z.string().uuid(),
    inspectionItemKey: inspectionItemKeySchema,
    productCategory: inspectionProductCategorySchema,
    definitionVersion: inspectionDefinitionVersionSchema,
    revision: inspectionRevisionSchema,
    supersedesRevisionId: z.string().uuid().nullable(),
    itemLocation: z.string().trim().min(1).max(120),
    concernType: inspectionConcernTypeSchema,
    severity: inspectionConcernSeveritySchema,
    marker: inspectionConcernMarkerSchema.nullable(),
    contextEvidenceAssetId: z.string().uuid().nullable(),
    detailEvidenceAssetId: z.string().uuid().nullable(),
    memo: z.string().trim().min(1).max(500).nullable(),
    reviewState: inspectionConcernReviewStateSchema,
    supersededRecordedBy: z
      .string()
      .uuid()
      .nullable()
      .describe("Actor who recorded the immediately preceding revision"),
    supersededReviewState: inspectionConcernReviewStateSchema
      .nullable()
      .describe("Review state of the immutable immediately preceding revision"),
    createdBy: z.string().uuid().describe("Actor who created the first revision in the chain"),
    createdAt: z.iso.datetime(),
    recordedBy: z.string().uuid().describe("Actor who recorded this exact revision"),
    recordedAt: z.iso.datetime(),
    reviewedBy: z.string().uuid().nullable().describe("Actor who reviewed this exact revision"),
    reviewedAt: z.iso.datetime().nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    validateInspectionRevisionLink(value, context);
    validateInspectionResponsePredecessor(value, context);
    const hasAnyPhoto =
      value.marker !== null ||
      value.contextEvidenceAssetId !== null ||
      value.detailEvidenceAssetId !== null;
    if (value.concernType !== "odor" && value.marker === null) {
      context.addIssue({ code: "custom", path: ["marker"], message: "Marker is required" });
    }
    if (value.concernType !== "odor" && value.contextEvidenceAssetId === null) {
      context.addIssue({
        code: "custom",
        path: ["contextEvidenceAssetId"],
        message: "Context evidence is required",
      });
    }
    if (value.concernType === "odor" && value.memo === null) {
      context.addIssue({
        code: "custom",
        path: ["memo"],
        message: "An odor concern always requires an explanation",
      });
    } else if (!hasAnyPhoto && value.concernType !== "odor") {
      context.addIssue({
        code: "custom",
        path: ["memo"],
        message: "A photo-free non-visual concern requires an explanation",
      });
    }
    const isReviewed =
      value.reviewState === "human_confirmed" ||
      value.reviewState === "changes_requested" ||
      value.reviewState === "human_dismissed";
    if (isReviewed !== (value.reviewedBy !== null && value.reviewedAt !== null)) {
      context.addIssue({
        code: "custom",
        path: ["reviewedBy"],
        message: "Reviewer metadata must match the concern review state",
      });
    }
    if (isReviewed && value.reviewedBy === value.supersededRecordedBy) {
      context.addIssue({
        code: "custom",
        path: ["reviewedBy"],
        message: "The prior revision recorder cannot review their own submission",
      });
    }
    if (isReviewed && value.revision <= 1) {
      context.addIssue({
        code: "custom",
        path: ["revision"],
        message: "A concern review must supersede a pending-review revision",
      });
    }
    if (
      (value.supersedesRevisionId === null) !== (value.supersededReviewState === null) ||
      (isReviewed && value.supersededReviewState !== "pending_review")
    ) {
      context.addIssue({
        code: "custom",
        path: ["supersededReviewState"],
        message: "A concern review must directly supersede a pending-review revision",
      });
    }
  });

export const recordMeasurementRequestSchema = z
  .object({
    definitionId: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/u),
    definitionVersion: z.number().int().positive().max(100),
    value: z.number().positive().max(250),
    unit: z.literal("cm"),
    basis: z.enum(["flat_width", "circumference", "length"]),
    state: z.enum(["natural", "closed", "unstretched"]),
    measuredAt: z.iso.datetime(),
    evidenceAssetId: z.string().uuid(),
    attempt: z.number().int().positive().max(20),
    reviewReasonCode: z
      .enum(["garment_stretch", "measurement_definition_corrected", "previous_entry_error"])
      .nullable()
      .optional(),
    humanConfirmed: z.literal(true),
  })
  .strict();

export const measurementResponseSchema = recordMeasurementRequestSchema
  .omit({ humanConfirmed: true })
  .extend({
    id: z.string().uuid(),
    workspaceId: workspaceIdSchema,
    skuId: z.string().uuid(),
    measuredBy: z.string().uuid(),
    confirmedBy: z.string().uuid(),
    requiresReview: z.boolean(),
    differenceCm: z.number().nonnegative().nullable(),
    violations: z.array(z.string()),
    reviewReasonCode: z
      .enum(["garment_stretch", "measurement_definition_corrected", "previous_entry_error"])
      .nullable(),
    createdAt: z.iso.datetime(),
  });

export const captureSummarySchema = z.object({
  workspaceId: workspaceIdSchema,
  skuId: z.string().uuid(),
  measurementProfile: measurementProfileResponseSchema.nullable(),
  photoRoles: z.array(photoRoleSchema),
  measurementDefinitionIds: z.array(z.string()),
  requiredPhotoRolesComplete: z.boolean(),
  requiredMeasurementsComplete: z.boolean(),
  hasReviewWarnings: z.boolean(),
  readyForHumanReview: z.boolean(),
  updatedAt: z.iso.datetime(),
});

export const createOrderRequestSchema = z
  .object({
    orderNumber: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[A-Z0-9-]+$/u),
    skuId: z.string().uuid(),
    inventoryUnitId: z.string().uuid(),
    saleAmountMinor: z.number().int().positive().max(100_000_000).nullable(),
    costAmountMinor: z.number().int().nonnegative().max(100_000_000),
    sellingFeeMinor: z.number().int().nonnegative().max(100_000_000),
    shippingCostMinor: z.number().int().nonnegative().max(100_000_000),
    packagingCostMinor: z.number().int().nonnegative().max(100_000_000),
    taxBasis: z.enum(["tax_included", "tax_excluded", "unknown"]),
    sourceMeaning: z.string().trim().min(1).max(160),
    occurredAt: z.iso.datetime(),
    shippingAddress: z.string().trim().min(1).max(1000),
    idempotencyKey: z.string().uuid(),
    humanConfirmed: z.literal(true),
  })
  .strict();

export const createP0ItemRequestSchema = z
  .object({
    skuCode: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[A-Z0-9-]+$/u),
    title: z.string().trim().min(1).max(160),
    category: z.string().trim().min(1).max(80),
    measurementTemplateId: measurementTemplateIdSchema,
    supplierName: z.string().trim().min(1).max(160),
    receiptReference: z.string().trim().min(1).max(120),
    purchasedAt: z.iso.datetime(),
    receiptAmountMinor: z.number().int().nonnegative().max(100_000_000),
    allocatedCostMinor: z.number().int().nonnegative().max(100_000_000),
    idempotencyKey: z.string().uuid(),
    humanConfirmed: z.literal(true),
    pilot: z
      .object({
        runId: z.string().uuid(),
        productFixtureId: pilotFixtureIdSchema,
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((value) => value.allocatedCostMinor <= value.receiptAmountMinor, {
    message: "Allocated cost cannot exceed the receipt amount",
    path: ["allocatedCostMinor"],
  })
  .superRefine((value, context) => {
    const template = listingPrepPilotMeasurementTemplates[value.measurementTemplateId];
    const acceptedCategoryNames: Record<z.infer<typeof pilotCategorySchema>, readonly string[]> = {
      tops: ["tops", "トップス"],
      outer: ["outer", "アウター"],
      pants: ["pants", "パンツ"],
      knit: ["knit", "ニット"],
    };
    if (!acceptedCategoryNames[template.category].includes(value.category)) {
      context.addIssue({
        code: "custom",
        message: "The measurement template does not match the product category",
        path: ["measurementTemplateId"],
      });
    }
  });

export const listingPrepPilotMigrationVersion = "0033" as const;

export const startPilotRunRequestSchema = z
  .object({
    protocolVersion: z.literal(listingPrepPilotProtocolVersion),
    fixtureManifestSha256: z.literal(listingPrepPilotFixtureManifestSha256),
    commitSha: z.string().regex(/^[a-f0-9]{40}$/u),
    migrationVersion: z.literal(listingPrepPilotMigrationVersion),
    platform: z.string().trim().min(1).max(120),
    browser: z.string().trim().min(1).max(200),
    viewport: z.literal("390x844"),
    warmupCompleted: z.literal(true),
    humanConfirmed: z.literal(true),
  })
  .strict();

export const pilotItemMeasurementSchema = z
  .object({
    measurementId: z.string().uuid(),
    skuId: z.string().uuid(),
    productFixtureId: pilotFixtureIdSchema,
    category: pilotCategorySchema,
    measurementTemplateId: measurementTemplateIdSchema.nullable(),
    measurementTemplateVersion: z.literal(1).nullable(),
    startedAt: z.iso.datetime(),
    completedAt: z.iso.datetime().nullable(),
    elapsedSeconds: z.number().nonnegative().nullable(),
    metrics: pilotExceptionMetricsSchema,
    copyReadyWorkflowVersion: z.number().int().positive().nullable(),
  })
  .superRefine((value, context) => {
    if ((value.measurementTemplateId === null) !== (value.measurementTemplateVersion === null)) {
      context.addIssue({
        code: "custom",
        message: "Pilot measurement template ID and version must both be present or absent",
        path: ["measurementTemplateId"],
      });
      return;
    }
    if (value.measurementTemplateId !== null) {
      const template = listingPrepPilotMeasurementTemplates[value.measurementTemplateId];
      if (template.category !== value.category) {
        context.addIssue({
          code: "custom",
          message: "Pilot measurement template does not match its category",
          path: ["measurementTemplateId"],
        });
      }
    }
  });

export const pilotRunSummarySchema = z.object({
  itemCount: z.number().int().min(0).max(10),
  completedItemCount: z.number().int().min(0).max(10),
  p50Seconds: z.number().nonnegative().nullable(),
  p75Seconds: z.number().nonnegative().nullable(),
  minSeconds: z.number().nonnegative().nullable(),
  maxSeconds: z.number().nonnegative().nullable(),
  invalidAttemptCount: z.number().int().nonnegative(),
  missingRequiredImageCount: z.number().int().nonnegative(),
  measurementReworkCount: z.number().int().nonnegative(),
  labelLocationMismatchCount: z.number().int().nonnegative(),
  misputawayCount: z.number().int().nonnegative(),
  networkRetryCount: z.number().int().nonnegative(),
  manualCorrectionCount: z.number().int().nonnegative(),
  passed: z.boolean().nullable(),
});

const pilotRunResponseBaseSchema = z.object({
  runId: z.string().uuid(),
  workspaceId: workspaceIdSchema,
  commitSha: z.string().regex(/^[a-f0-9]{40}$/u),
  platform: z.string(),
  browser: z.string(),
  viewport: z.literal("390x844"),
  actorId: z.string().uuid(),
  state: z.enum(["active", "completed", "failed", "externally_invalidated"]),
  externallyInvalidated: z.boolean(),
  externalInvalidationReason: z.string().nullable(),
  warmupCompletedAt: z.iso.datetime(),
  startedAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
  summary: pilotRunSummarySchema,
});

const historicalPilotItemMeasurementSchema = pilotItemMeasurementSchema.safeExtend({
  measurementTemplateId: z.null(),
  measurementTemplateVersion: z.null(),
});

const currentPilotItemMeasurementSchema = pilotItemMeasurementSchema.safeExtend({
  measurementTemplateId: measurementTemplateIdSchema,
  measurementTemplateVersion: z.literal(1),
});

export const pilotRunResponseSchema = z.discriminatedUnion("protocolVersion", [
  pilotRunResponseBaseSchema.extend({
    protocolVersion: z.literal("listing_prep_pilot_v1.0.0"),
    fixtureManifestSha256: z.null(),
    migrationVersion: z.enum([
      "0023",
      "0024",
      "0025",
      "0026",
      "0027",
      "0028",
      "0029",
      "0030",
      "0031",
      "0032",
    ]),
    items: historicalPilotItemMeasurementSchema.array().max(10),
  }),
  pilotRunResponseBaseSchema.extend({
    protocolVersion: z.literal(listingPrepPilotProtocolVersion),
    fixtureManifestSha256: z.literal(listingPrepPilotFixtureManifestSha256),
    migrationVersion: z.literal(listingPrepPilotMigrationVersion),
    items: currentPilotItemMeasurementSchema.array().max(10),
  }),
]);

export const p0CaptureMeasurementSchema = z.object({
  id: z.string().uuid(),
  definitionId: z.string(),
  definitionVersion: z.number().int().positive(),
  value: z.number().positive(),
  unit: z.literal("cm"),
  basis: z.enum(["flat_width", "circumference", "length"]),
  state: z.enum(["natural", "closed", "unstretched"]),
  evidenceAssetId: z.string().uuid(),
  measuredAt: z.iso.datetime(),
  confirmedBy: z.string().uuid(),
  requiresReview: z.boolean(),
  attempt: z.number().int().positive(),
  differenceCm: z.number().nonnegative().nullable(),
  violations: z.array(z.string()),
  reviewReasonCode: z
    .enum(["garment_stretch", "measurement_definition_corrected", "previous_entry_error"])
    .nullable(),
});

export const captureTaskResponseSchema = z.object({
  workspaceId: workspaceIdSchema,
  skuId: z.string().uuid(),
  skuCode: z.string(),
  title: z.string(),
  category: z.string().nullable(),
  measurementProfile: measurementProfileResponseSchema.nullable(),
  photoAssetIds: z.array(z.string().uuid()),
  photoRoles: z.array(photoRoleSchema),
  measurements: z.array(p0CaptureMeasurementSchema),
  assignmentExpiresAt: z.iso.datetime(),
});

export const createIdentityCandidateRequestSchema = z
  .object({
    sourceAssetId: z.string().uuid(),
    rawOcrText: z.string().trim().min(1).max(4000),
    humanConfirmedSource: z.literal(true),
  })
  .strict();

export const identityCandidateResponseSchema = z.object({
  candidateId: z.string().uuid(),
  skuId: z.string().uuid(),
  sourceAssetId: z.string().uuid(),
  brandCandidate: z.string().nullable(),
  modelCandidate: z.string().nullable(),
  materialCandidate: z.string().nullable(),
  sizeCandidate: z.string().nullable(),
  colorCandidate: z.string().nullable(),
  status: z.enum(["candidate", "human_confirmed", "rejected"]),
  createdAt: z.iso.datetime(),
});

export const confirmIdentityCandidateRequestSchema = z
  .object({
    status: z.enum(["human_confirmed", "rejected"]),
    humanConfirmed: z.literal(true),
  })
  .strict();

export const confirmProductAttributesRequestSchema = z
  .object({
    brand: z.string().trim().min(1).max(160),
    sizeLabel: z.string().trim().min(1).max(80),
    color: z.string().trim().min(1).max(80),
    evidenceAssetId: z.string().uuid(),
    sourceCandidateId: z.string().uuid().nullable().optional(),
    supersedesConfirmationId: z.string().uuid().nullable().optional(),
    humanConfirmed: z.literal(true),
  })
  .strict();

export const productAttributeConfirmationResponseSchema = z.object({
  confirmationId: z.string().uuid(),
  skuId: z.string().uuid(),
  revision: z.number().int().positive(),
  brand: z.string().min(1),
  sizeLabel: z.string().min(1),
  color: z.string().min(1),
  evidenceAssetId: z.string().uuid(),
  sourceCandidateId: z.string().uuid().nullable(),
  supersedesConfirmationId: z.string().uuid().nullable(),
  confirmedBy: z.string().uuid(),
  confirmedAt: z.iso.datetime(),
});

export const createMarketplaceReferenceRequestSchema = z
  .object({
    sourceUrl: z.string().url().startsWith("https://"),
    displayedPriceMinor: z.number().int().nonnegative().max(100_000_000),
    soldState: z.boolean(),
    itemCondition: z.string().trim().min(1).max(80),
    shippingBasis: z.enum(["included", "separate", "unknown"]),
    included: z.boolean(),
    exclusionReason: z.string().trim().min(1).max(160).nullable(),
    checkedAt: z.iso.datetime(),
    humanConfirmed: z.literal(true),
  })
  .strict()
  .refine((value) => value.included || Boolean(value.exclusionReason), {
    message: "Excluded evidence requires a reason",
    path: ["exclusionReason"],
  });

export const marketplaceReferenceResponseSchema = z.object({
  referenceId: z.string().uuid(),
  skuId: z.string().uuid(),
  sourceUrl: z.string().url().startsWith("https://"),
  displayedPriceMinor: z.number().int().nonnegative().max(100_000_000),
  soldState: z.boolean(),
  itemCondition: z.string().trim().min(1).max(80),
  shippingBasis: z.enum(["included", "separate", "unknown"]),
  included: z.boolean(),
  exclusionReason: z.string().trim().min(1).max(160).nullable(),
  checkedAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});

export const productResearchResponseSchema = z.object({
  workspaceId: workspaceIdSchema,
  skuId: z.string().uuid(),
  candidates: identityCandidateResponseSchema.array(),
  confirmedAttributes: productAttributeConfirmationResponseSchema.nullable(),
  references: marketplaceReferenceResponseSchema.array(),
  includedSoldCount: z.number().int().nonnegative(),
  displayedPriceMedianMinor: z.number().int().nonnegative().nullable(),
  status: z.enum(["no_evidence", "insufficient_evidence", "human_review_required"]),
});

export const p0ListingCandidateSchema = z.object({
  text: z.string().min(1),
  referenceIds: z.array(z.string().uuid()),
  unconfirmedFields: z.array(z.string()),
  status: z.enum(["candidate", "human_confirmed"]),
  confirmedBy: z.string().uuid().nullable(),
  confirmedAt: z.iso.datetime().nullable(),
});

export const p0ItemResponseSchema = z.object({
  workspaceId: workspaceIdSchema,
  skuId: z.string().uuid(),
  skuCode: z.string(),
  title: z.string(),
  category: z.string().nullable(),
  measurementProfile: measurementProfileResponseSchema.nullable(),
  confirmedAttributes: productAttributeConfirmationResponseSchema.nullable(),
  inventoryUnitId: z.string().uuid(),
  inventoryNumber: inventoryNumberSchema,
  inventoryStatus: z.enum([
    "putaway_pending",
    "available",
    "reserved",
    "picked",
    "packed",
    "shipped",
    "quarantined",
    "disposal_pending",
    "lost",
    "disposed",
  ]),
  locationCode: checkedLocationCodeSchema.nullable(),
  inventoryLabelVersion: z.number().int().positive(),
  locationLabelVersion: z.number().int().positive().nullable(),
  receiptId: z.string().uuid(),
  receiptReference: z.string(),
  purchasedAt: z.iso.datetime(),
  allocatedCostMinor: z.number().int().nonnegative(),
  capture: z.object({
    photoAssetIds: z.array(z.string().uuid()),
    photoRoles: z.array(photoRoleSchema),
    measurements: z.array(p0CaptureMeasurementSchema),
    confirmedBy: z.string().uuid().nullable(),
    confirmedAt: z.iso.datetime().nullable(),
  }),
  listingCandidate: p0ListingCandidateSchema,
  workflowState: z.enum([
    "sku_created",
    "purchase_confirmed",
    "capture_confirmed",
    "listing_confirmed",
    "order_confirmed",
    "picked",
    "packed",
    "shipped",
    "journal_approved",
  ]),
  orderId: z.string().uuid().nullable(),
  orderNumber: z.string().nullable(),
  orderState: z.enum(["confirmed", "picking", "packed", "shipped", "returned"]).nullable(),
  accountingExport: z
    .object({
      exportId: z.string().uuid(),
      workspaceId: workspaceIdSchema,
      orderId: z.string().uuid(),
      filename: z.literal("journal-candidates.csv"),
      sha256: z.string().regex(/^[a-f0-9]{64}$/u),
      rowCount: z.number().int().positive(),
      contentUrl: z.string(),
      createdAt: z.iso.datetime(),
    })
    .nullable(),
  updatedAt: z.iso.datetime(),
});

export const createLocationRequestSchema = z
  .object({
    parentId: z.string().uuid().nullable(),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .min(3)
      .max(64)
      .regex(/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/u),
    name: z.string().trim().min(1).max(120),
    canStoreInventory: z.boolean(),
    singleItemOnly: z.boolean(),
    allowMixedSku: z.boolean(),
    maxUnits: z.number().int().positive().max(100_000).nullable(),
    humanConfirmed: z.literal(true),
  })
  .strict()
  .refine((value) => value.canStoreInventory || value.maxUnits === null, {
    message: "A non-storage location cannot have inventory capacity",
    path: ["maxUnits"],
  });

export const locationNodeResponseSchema = z.object({
  id: z.string().uuid(),
  workspaceId: workspaceIdSchema,
  parentId: z.string().uuid().nullable(),
  code: checkedLocationCodeSchema,
  name: z.string(),
  depth: z.number().int().min(0).max(7),
  state: z.literal("active"),
  canStoreInventory: z.boolean(),
  singleItemOnly: z.boolean(),
  allowMixedSku: z.boolean(),
  maxUnits: z.number().int().positive().nullable(),
  activeInventoryCount: z.number().int().nonnegative(),
  approvedPhotoCount: z.number().int().nonnegative(),
  labelVersion: z.number().int().positive(),
  createdAt: z.iso.datetime(),
});

export const orderOperationResponseSchema = z.object({
  workspaceId: workspaceIdSchema,
  orderId: z.string().uuid(),
  orderNumber: z.string(),
  skuId: z.string().uuid(),
  inventoryUnitId: z.string().uuid(),
  state: z.enum(["confirmed", "picking", "packed", "shipped", "returned"]),
  inventoryStatus: z.enum([
    "reserved",
    "picked",
    "packed",
    "shipped",
    "quarantined",
    "available",
    "disposal_pending",
    "disposed",
  ]),
  updatedAt: z.iso.datetime(),
});

export const assignOrderRequestSchema = z
  .object({
    assigneeEmail: z.string().trim().toLowerCase().email().max(320),
    startsAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    humanConfirmed: z.literal(true),
  })
  .strict()
  .refine((value) => Date.parse(value.expiresAt) > Date.parse(value.startsAt), {
    message: "Assignment expiry must be after its start",
    path: ["expiresAt"],
  })
  .refine(
    (value) => Date.parse(value.expiresAt) - Date.parse(value.startsAt) <= 24 * 60 * 60 * 1000,
    {
      message: "Assignment duration must not exceed 24 hours",
      path: ["expiresAt"],
    },
  );

export const createLocalMemberRequestSchema = z
  .object({
    displayName: z.string().trim().min(1).max(120),
    email: z.string().trim().toLowerCase().email().max(320),
    initialPassword: z.string().min(12).max(128),
    role: z.enum(["inventory_manager", "field_worker", "shipping", "accounting"]),
    humanConfirmed: z.literal(true),
  })
  .strict();

export const teamMemberResponseSchema = z.object({
  identityId: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(["owner", "inventory_manager", "field_worker", "shipping", "accounting"]),
  active: z.boolean(),
});

export const teamAssignmentTypeSchema = z.enum([
  "capture",
  "location_putaway",
  "location_photo",
  "inventory_putaway",
  "shipping",
]);

export const createTeamAssignmentRequestSchema = z
  .object({
    identityId: z.string().uuid(),
    assignmentType: teamAssignmentTypeSchema.exclude(["shipping"]),
    targetId: z.string().uuid(),
    startsAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    humanConfirmed: z.literal(true),
  })
  .strict()
  .refine((value) => Date.parse(value.expiresAt) > Date.parse(value.startsAt), {
    message: "Assignment expiry must be after its start",
    path: ["expiresAt"],
  })
  .refine(
    (value) => Date.parse(value.expiresAt) - Date.parse(value.startsAt) <= 24 * 60 * 60 * 1000,
    {
      message: "Assignment duration must not exceed 24 hours",
      path: ["expiresAt"],
    },
  );

export const revokeTeamAssignmentRequestSchema = z
  .object({
    assignmentType: teamAssignmentTypeSchema,
    reasonCode: z.enum([
      "assignment_error",
      "assignment_changed",
      "device_lost",
      "worker_unavailable",
    ]),
    humanConfirmed: z.literal(true),
  })
  .strict();

export const teamAssignmentResponseSchema = z.object({
  assignmentId: z.string().uuid(),
  assignmentType: teamAssignmentTypeSchema,
  identityId: z.string().uuid(),
  assigneeEmail: z.string().email(),
  targetId: z.string().uuid(),
  targetLabel: z.string(),
  startsAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  revokedAt: z.iso.datetime().nullable(),
});

export const teamStateResponseSchema = z.object({
  workspaceId: workspaceIdSchema,
  members: teamMemberResponseSchema.array(),
  assignments: teamAssignmentResponseSchema.array(),
});

export const startStocktakeRequestSchema = z
  .object({ locationId: z.string().uuid(), humanConfirmed: z.literal(true) })
  .strict();

export const stocktakeObservationRequestSchema = z.discriminatedUnion("readResult", [
  z
    .object({
      readResult: z.literal("readable"),
      inventoryNumber: inventoryNumberSchema,
      observedAt: z.iso.datetime(),
      humanConfirmed: z.literal(true),
    })
    .strict(),
  z
    .object({
      readResult: z.literal("unreadable"),
      failureReason: z.enum(["camera_blur", "damaged_label", "no_label", "manual_unreadable"]),
      observedAt: z.iso.datetime(),
      humanConfirmed: z.literal(true),
    })
    .strict(),
]);

export const stocktakeObservationRecordSchema = z.object({
  ordinal: z.number().int().positive(),
  inventoryUnitId: z.string().uuid().nullable(),
  observedCode: inventoryNumberSchema.nullable(),
  result: z.enum(["matched", "misplaced", "unexpected", "duplicate", "unreadable"]),
  failureReason: z
    .enum(["camera_blur", "damaged_label", "no_label", "manual_unreadable"])
    .nullable(),
  observedAt: z.iso.datetime(),
});

export const stocktakeDiscrepancySchema = z.object({
  discrepancyId: z.string().uuid(),
  inventoryUnitId: z.string().uuid().nullable(),
  inventoryNumber: inventoryNumberSchema.nullable(),
  expectedLocationId: z.string().uuid().nullable(),
  expectedLocationCode: checkedLocationCodeSchema.nullable(),
  currentLocationId: z.string().uuid().nullable(),
  currentLocationCode: checkedLocationCodeSchema.nullable(),
  kind: z.enum(["missing_candidate", "misplaced", "unexpected", "duplicate", "unreadable"]),
  state: z.enum(["reconfirmation_required", "candidate_confirmed", "restored", "resolved"]),
  resolution: z.string().nullable(),
  confirmationMode: z.enum(["solo_reversible", "dual_actor"]),
  activeMembershipCountAtSelection: z.number().int().positive(),
  membershipRevisionAtSelection: z.number().int().nonnegative(),
  evidenceCount: z.number().int().nonnegative(),
  reasonCode: z.string().nullable(),
  confirmedReasonCode: z.string().nullable(),
  restoredReasonCode: z.string().nullable(),
  confirmedAt: z.iso.datetime().nullable(),
  restoredAt: z.iso.datetime().nullable(),
});

export const stocktakePostStartMovementSchema = z.object({
  inventoryUnitId: z.string().uuid(),
  inventoryNumber: inventoryNumberSchema,
  expectedLocationId: z.string().uuid(),
  expectedLocationCode: checkedLocationCodeSchema,
  currentLocationId: z.string().uuid().nullable(),
  currentLocationCode: checkedLocationCodeSchema.nullable(),
  snapshotMovementSequence: z.number().int().nonnegative(),
  currentMovementSequence: z.number().int().positive(),
  detectedAt: z.iso.datetime(),
});

export const stocktakeResponseSchema = z.object({
  stocktakeId: z.string().uuid(),
  workspaceId: workspaceIdSchema,
  locationId: z.string().uuid(),
  locationCode: checkedLocationCodeSchema,
  state: z.enum(["counting", "reconciliation", "approved"]),
  initialCounterId: z.string().uuid(),
  confirmationMode: z.enum(["solo_reversible", "dual_actor"]),
  activeMembershipCountAtSelection: z.number().int().positive(),
  membershipRevisionAtSelection: z.number().int().nonnegative(),
  observationCount: z.number().int().nonnegative(),
  observations: stocktakeObservationRecordSchema.array(),
  discrepancies: stocktakeDiscrepancySchema.array(),
  postStartMovements: stocktakePostStartMovementSchema.array(),
  startedAt: z.iso.datetime(),
  approvedAt: z.iso.datetime().nullable(),
});

export const resolveStocktakeDiscrepancyRequestSchema = z
  .object({
    resolution: z.enum(["found_in_place", "moved_to_correct_place", "no_inventory_adjustment"]),
    humanConfirmed: z.literal(true),
  })
  .strict();

export const uploadDiscrepancyEvidenceQuerySchema = z
  .object({ mimeType: z.enum(["image/jpeg", "image/png"]) })
  .strict();

export const discrepancyEvidenceResponseSchema = z.object({
  evidenceId: z.string().uuid(),
  discrepancyId: z.string().uuid(),
  mimeType: z.enum(["image/jpeg", "image/png"]),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  sizeBytes: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  serverInspected: z.literal(true),
  createdAt: z.iso.datetime(),
});

export const discrepancyEvidenceListItemSchema = z.object({
  evidenceId: z.string().uuid(),
  discrepancyId: z.string().uuid(),
  mimeType: z.enum(["image/jpeg", "image/png"]),
  width: z.number().int().positive().max(12_000),
  height: z.number().int().positive().max(12_000),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(25 * 1024 * 1024),
  contentUrl: z.string().startsWith("/v1/workspaces/"),
  createdAt: z.iso.datetime(),
});

export const createDiscrepancyChallengeRequestSchema = z
  .object({
    action: z.enum(["confirm", "restore"]),
    inventoryNumber: inventoryNumberSchema,
    locationCode: checkedLocationCodeSchema,
    inventoryLabelVersion: z.number().int().positive(),
    locationLabelVersion: z.number().int().positive(),
    inventoryScannedAt: z.iso.datetime(),
    locationScannedAt: z.iso.datetime(),
    humanInitiated: z.literal(true),
  })
  .strict();

export const discrepancyChallengeResponseSchema = z.object({
  challengeId: z.string().uuid(),
  discrepancyId: z.string().uuid(),
  action: z.enum(["confirm", "restore"]),
  notBefore: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  consumedAt: z.iso.datetime().nullable(),
});

const discrepancyScanEvidenceSchema = z.object({
  inventoryNumber: inventoryNumberSchema,
  locationCode: checkedLocationCodeSchema,
  inventoryLabelVersion: z.number().int().positive(),
  locationLabelVersion: z.number().int().positive(),
  inventoryScannedAt: z.iso.datetime(),
  locationScannedAt: z.iso.datetime(),
});

export const confirmMissingCandidateRequestSchema = discrepancyScanEvidenceSchema
  .omit({
    inventoryNumber: true,
    locationCode: true,
    inventoryLabelVersion: true,
    locationLabelVersion: true,
    inventoryScannedAt: true,
    locationScannedAt: true,
  })
  .extend({
    challengeId: z.string().uuid(),
    evidenceId: z.string().uuid(),
    reasonCode: z.enum(["not_seen_during_count", "label_unreadable", "location_mismatch"]),
    reasonNote: z.string().trim().min(1).max(500),
    confirmedAt: z.iso.datetime(),
    humanConfirmed: z.literal(true),
  })
  .strict();

export const restoreMissingCandidateRequestSchema = discrepancyScanEvidenceSchema
  .omit({
    inventoryNumber: true,
    locationCode: true,
    inventoryLabelVersion: true,
    locationLabelVersion: true,
    inventoryScannedAt: true,
    locationScannedAt: true,
  })
  .extend({
    challengeId: z.string().uuid(),
    reasonCode: z.enum(["found_in_place", "found_after_move", "counting_error"]),
    reasonNote: z.string().trim().min(1).max(500),
    confirmedAt: z.iso.datetime(),
    humanConfirmed: z.literal(true),
  })
  .strict();

export const approveStocktakeRequestSchema = z.object({ humanConfirmed: z.literal(true) }).strict();

export const reissueInventoryLabelRequestSchema = z
  .object({
    targetType: z.enum(["inventory_unit", "location"]),
    targetId: z.string().uuid(),
    reasonCode: z.enum(["damaged", "lost", "unreadable", "security_reissue"]),
    humanConfirmed: z.literal(true),
  })
  .strict();

export const reissuedInventoryLabelResponseSchema = z.object({
  labelId: z.string().uuid(),
  targetType: z.enum(["inventory_unit", "location"]),
  targetId: z.string().uuid(),
  shortCode: z.string(),
  version: z.number().int().positive(),
  issuedAt: z.iso.datetime(),
});

export const orderAssignmentResponseSchema = z.object({
  assignmentId: z.string().uuid(),
  workspaceId: workspaceIdSchema,
  orderId: z.string().uuid(),
  identityId: z.string().uuid(),
  startsAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  revokedAt: z.iso.datetime().nullable(),
});

export const shippingTaskResponseSchema = z.object({
  orderId: z.string().uuid(),
  orderNumber: z.string(),
  state: z.enum(["confirmed", "picking", "packed"]),
  inventoryNumber: inventoryNumberSchema,
  inventoryUnitId: z.string().uuid(),
  skuId: z.string().uuid(),
  locationCode: checkedLocationCodeSchema,
  inventoryLabelVersion: z.number().int().positive(),
  locationLabelVersion: z.number().int().positive(),
  assignmentExpiresAt: z.iso.datetime(),
});

export const shippingPhotoPolicyModeSchema = z.enum(["high_value_only", "all", "disabled"]);
export const shippingPhotoRoleSchema = z.enum(["product", "packed_package"]);
export const shippingPhotoDecisionReasonSchema = z.enum([
  "policy_missing",
  "policy_all",
  "policy_disabled",
  "threshold_met",
  "threshold_below",
  "sale_amount_missing",
  "manual_use",
  "manual_skip",
]);
export const shippingPhotoPreflightStateSchema = z.enum([
  "choice_required",
  "capture_required",
  "awaiting_confirmation",
  "confirmed",
  "satisfied_without_photo",
]);

export const updateShippingPhotoPolicyRequestSchema = z
  .object({
    mode: shippingPhotoPolicyModeSchema,
    highValueThresholdMinor: z.number().int().positive().max(100_000_000).nullable(),
    expectedRevision: z.number().int().positive().max(10_000).nullable(),
    idempotencyKey: z.string().uuid(),
    humanConfirmed: z.literal(true),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.mode === "high_value_only" && value.highValueThresholdMinor === null) {
      context.addIssue({
        code: "custom",
        path: ["highValueThresholdMinor"],
        message: "High-value-only policy requires a positive threshold",
      });
    }
    if (value.mode !== "high_value_only" && value.highValueThresholdMinor !== null) {
      context.addIssue({
        code: "custom",
        path: ["highValueThresholdMinor"],
        message: "Only high-value-only policy accepts a threshold",
      });
    }
  });

export const shippingPhotoPolicyResponseSchema = z
  .object({
    policyRevisionId: z.string().uuid(),
    mode: shippingPhotoPolicyModeSchema,
    highValueThresholdMinor: z.number().int().positive().max(100_000_000).nullable(),
    revision: z.number().int().positive().max(10_000),
    supersedesRevisionId: z.string().uuid().nullable(),
    changedBy: z.string().uuid(),
    changedAt: z.iso.datetime(),
  })
  .strict();

export const evaluateShippingPhotoPreflightRequestSchema = z
  .object({
    expectedDecisionRevision: z.number().int().positive().max(10_000).nullable(),
    idempotencyKey: z.string().uuid(),
    humanConfirmed: z.literal(true),
  })
  .strict();

export const overrideShippingPhotoDecisionRequestSchema = z
  .object({
    choice: z.enum(["use_photos", "skip_photos"]),
    expectedDecisionRevision: z.number().int().positive().max(10_000).nullable(),
    idempotencyKey: z.string().uuid(),
    humanConfirmed: z.literal(true),
  })
  .strict();

export const uploadShippingPhotoQuerySchema = z
  .object({
    role: shippingPhotoRoleSchema,
    idempotencyKey: z.string().uuid(),
    humanConfirmed: z.enum(["true"]).transform(() => true as const),
  })
  .strict();

export const shippingPhotoAssetResponseSchema = z
  .object({
    assetId: z.string().uuid(),
    orderId: z.string().uuid(),
    role: shippingPhotoRoleSchema,
    mimeType: z.enum(["image/jpeg", "image/png"]),
    sizeBytes: z
      .number()
      .int()
      .positive()
      .max(25 * 1024 * 1024),
    width: z.number().int().positive().max(12_000),
    height: z.number().int().positive().max(12_000),
    capturedBy: z.string().uuid(),
    capturedAt: z.iso.datetime(),
  })
  .strict();

export const confirmShippingPhotosRequestSchema = z
  .object({
    assetIds: z.array(z.string().uuid()).min(2).max(100),
    idempotencyKey: z.string().uuid(),
    humanConfirmed: z.literal(true),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.assetIds).size !== value.assetIds.length) {
      context.addIssue({
        code: "custom",
        path: ["assetIds"],
        message: "Shipping photo confirmation asset IDs must be unique",
      });
    }
  });

export const shippingPhotoConfirmationResponseSchema = z
  .object({
    confirmationId: z.string().uuid(),
    orderId: z.string().uuid(),
    decisionRevisionId: z.string().uuid(),
    assetIds: z.array(z.string().uuid()).min(2).max(100),
    confirmedBy: z.string().uuid(),
    confirmedAt: z.iso.datetime(),
  })
  .strict();

export const shippingPhotoPreflightResponseSchema = z
  .object({
    orderId: z.string().uuid(),
    decisionRevisionId: z.string().uuid().nullable(),
    decisionRevision: z.number().int().positive().max(10_000).nullable(),
    state: shippingPhotoPreflightStateSchema,
    photoRequired: z.boolean().nullable(),
    decisionReason: shippingPhotoDecisionReasonSchema.nullable(),
    saleAmountStatus: z.enum(["present", "missing"]),
    assets: z.array(shippingPhotoAssetResponseSchema),
    confirmedAssetIds: z.array(z.string().uuid()),
    photoConfirmationId: z.string().uuid().nullable(),
    packingHumanConfirmed: z.boolean(),
    shipmentHumanConfirmed: z.boolean(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const recordOrderSaleAmountRequestSchema = z
  .object({
    saleAmountMinor: z.number().int().positive().max(100_000_000),
    taxBasis: z.enum(["tax_included", "tax_excluded", "unknown"]),
    sourceMeaning: z.string().trim().min(1).max(160),
    occurredAt: z.iso.datetime(),
    idempotencyKey: z.string().uuid(),
    humanConfirmed: z.literal(true),
  })
  .strict();

export const recordOrderSaleAmountResponseSchema = z
  .object({
    orderId: z.string().uuid(),
    financialEventId: z.string().uuid(),
    saleAmountMinor: z.number().int().positive().max(100_000_000),
    recordedBy: z.string().uuid(),
    recordedAt: z.iso.datetime(),
  })
  .strict();

export const createAddressLeaseRequestSchema = z
  .object({ purpose: z.literal("shipping_label"), humanConfirmed: z.literal(true) })
  .strict();

export const addressLeaseResponseSchema = z.object({
  leaseId: z.string().uuid(),
  workspaceId: workspaceIdSchema,
  orderId: z.string().uuid(),
  expiresAt: z.iso.datetime(),
});

export const addressLeaseQuerySchema = z.object({ leaseId: z.string().uuid() }).strict();

export const shippingAddressResponseSchema = z.object({
  orderId: z.string().uuid(),
  shippingAddress: z.string(),
  expiresAt: z.iso.datetime(),
});

export const pickOrderRequestSchema = putawayInventoryRequestSchema
  .safeExtend({
    addressLeaseId: z.string().uuid().nullable(),
  })
  .strict();

export const packOrderRequestSchema = z
  .object({
    addressLeaseId: z.string().uuid().nullable(),
    idempotencyKey: z.string().uuid(),
    humanConfirmed: z.literal(true),
  })
  .strict();

export const shipOrderRequestSchema = z
  .object({
    addressLeaseId: z.string().uuid().nullable(),
    idempotencyKey: z.string().uuid(),
    humanConfirmed: z.literal(true),
  })
  .strict();

export const returnOrderRequestSchema = z
  .object({
    returnedAt: z.iso.datetime(),
    idempotencyKey: z.string().uuid(),
    humanConfirmed: z.literal(true),
  })
  .strict();

export const quarantineReturnRequestSchema = putawayInventoryRequestSchema
  .safeExtend({ orderId: z.string().uuid() })
  .strict();

export const inspectReturnRequestSchema = z
  .object({
    resolution: z.enum(["restock", "dispose"]),
    inspectedAt: z.iso.datetime(),
    idempotencyKey: z.string().uuid(),
    humanConfirmed: z.literal(true),
  })
  .strict();

export const financialSummaryResponseSchema = z.object({
  workspaceId: workspaceIdSchema,
  orderId: z.string().uuid(),
  skuId: z.string().uuid(),
  saleAmountMinor: z.number().int(),
  costAmountMinor: z.number().int(),
  sellingFeeMinor: z.number().int(),
  shippingCostMinor: z.number().int(),
  packagingCostMinor: z.number().int(),
  netRevenueMinor: z.number().int(),
  contributionProfitMinor: z.number().int().nullable(),
  formulaVersion: z.literal("financial_formula_v1.0.0"),
  missingInputs: z
    .enum([
      "orderPrice",
      "sellerDiscount",
      "channelCoupon",
      "successfulRefund",
      "sellingFeeCharged",
      "sellingFeeRefund",
      "promotionCost",
      "sellerShipping",
      "packagingCost",
      "returnDirectCost",
      "costOfGoods",
      "costReturnedToInventory",
      "taxBasis",
    ])
    .array(),
  currency: z.literal("JPY"),
  disclaimer: z.literal(
    "運用分析の参考値です。会計上の売上・利益・所得・税額を示すものではありません。",
  ),
});

export const createAccountingExportRequestSchema = z
  .object({
    approvedAt: z.iso.datetime(),
    idempotencyKey: z.string().uuid(),
    humanApproved: z.literal(true),
  })
  .strict();

export const accountingExportResponseSchema = z.object({
  exportId: z.string().uuid(),
  orderId: z.string().uuid(),
  filename: z.literal("journal-candidates.csv"),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  rowCount: z.number().int().positive(),
  contentUrl: z.string().startsWith("/v1/workspaces/"),
  createdAt: z.iso.datetime(),
});

export const accountingProfileSchema = z.object({
  workspaceId: workspaceIdSchema,
  businessContext: z.enum(["unconfigured", "individual_business", "company"]),
  filingContext: z.enum(["unconfigured", "blue_return", "white_return", "corporate_return"]),
  consumptionTaxTreatment: z.enum([
    "unconfigured",
    "tax_exempt",
    "general_taxation",
    "simplified_taxation",
  ]),
  invoiceRegistrationStatus: z.enum(["unconfigured", "not_registered", "registered"]),
  bookkeepingMethod: z.enum(["unconfigured", "single_entry", "double_entry"]),
  revision: z.number().int().positive(),
  humanConfirmedBy: z.string().uuid().nullable(),
  humanConfirmedAt: z.iso.datetime().nullable(),
  updatedAt: z.iso.datetime(),
});

export const accountingOrderOptionSchema = z.object({
  orderId: z.string().uuid(),
  orderNumber: z.string().min(1),
  orderState: z.enum(["confirmed", "picking", "packed", "shipped", "returned"]),
  skuCode: z.string().min(1),
  title: z.string().min(1),
  financialEventCount: z.number().int().nonnegative(),
});

export const updateAccountingProfileRequestSchema = accountingProfileSchema
  .pick({
    businessContext: true,
    filingContext: true,
    consumptionTaxTreatment: true,
    invoiceRegistrationStatus: true,
    bookkeepingMethod: true,
  })
  .extend({ expectedRevision: z.number().int().positive(), humanConfirmed: z.literal(true) })
  .strict();

export const accountMappingChangeReasonSchema = z.enum([
  "account_review",
  "tax_review",
  "bookkeeping_policy_update",
  "correction",
  "other_reviewed_change",
]);

export const accountMappingRuleSchema = z
  .object({
    ruleId: z.string().uuid(),
    eventType: z.enum(["sale", "refund", "fee", "fee_reversal", "shipping", "packaging", "cost"]),
    version: z.string().min(1).max(80),
    debitAccount: z.string().min(1).max(30),
    debitSubaccount: z.string().max(30),
    debitTaxCategory: z.string().min(1).max(50),
    debitInvoiceCategory: z.enum([
      "適格",
      "80％控除",
      "70％控除",
      "50％控除",
      "30％控除",
      "控除なし",
    ]),
    creditAccount: z.string().min(1).max(30),
    creditSubaccount: z.string().max(30),
    creditTaxCategory: z.string().min(1).max(50),
    creditInvoiceCategory: z.enum([
      "適格",
      "80％控除",
      "70％控除",
      "50％控除",
      "30％控除",
      "控除なし",
    ]),
    effectiveFrom: z.iso.datetime(),
    effectiveUntil: z.iso.datetime().nullable(),
    status: z.enum(["draft", "active", "retired"]),
    approvedBy: z.string().uuid().nullable(),
    approvedAt: z.iso.datetime().nullable(),
    replacesRuleId: z.string().uuid().nullable(),
    changeReasonCode: accountMappingChangeReasonSchema.nullable(),
    confirmationStatus: z.enum(["candidate", "human_confirmed"]),
  })
  .strict();

export const createAccountMappingRuleRequestSchema = accountMappingRuleSchema
  .omit({
    ruleId: true,
    approvedBy: true,
    approvedAt: true,
    status: true,
    replacesRuleId: true,
    changeReasonCode: true,
    confirmationStatus: true,
  })
  .extend({ humanApproved: z.literal(true) })
  .strict();

export const replaceAccountMappingRuleRequestSchema = accountMappingRuleSchema
  .pick({
    debitAccount: true,
    debitSubaccount: true,
    debitTaxCategory: true,
    debitInvoiceCategory: true,
    creditAccount: true,
    creditSubaccount: true,
    creditTaxCategory: true,
    creditInvoiceCategory: true,
    effectiveFrom: true,
  })
  .extend({
    expectedVersion: z.string().min(1).max(80),
    expectedStatus: z.literal("active"),
    changeReasonCode: accountMappingChangeReasonSchema,
    humanConfirmed: z.literal(true),
  })
  .strict();

export const replaceAccountMappingRuleResponseSchema = z
  .object({
    retiredRule: accountMappingRuleSchema,
    activeRule: accountMappingRuleSchema,
    changeReasonCode: accountMappingChangeReasonSchema,
    humanConfirmed: z.literal(true),
  })
  .strict();

export const createVersionedAccountingExportRequestSchema = z
  .object({
    format: z.enum(["money_forward_journal_v1", "generic_journal_v1"]),
    orderId: z.string().uuid(),
    idempotencyKey: z.string().uuid(),
    approvedAt: z.iso.datetime(),
    humanApproved: z.literal(true),
    duplicateOverrideConfirmed: z.boolean().default(false),
    supersedesBatchId: z.string().uuid().nullable().default(null),
  })
  .strict();

export const versionedAccountingExportResponseSchema = z.object({
  batchId: z.string().uuid(),
  orderId: z.string().uuid(),
  format: z.enum(["money_forward_journal_v1", "generic_journal_v1"]),
  formatVersion: z.enum(["money_forward_journal_v1.0.0", "generic_journal_v1.0.0"]),
  filename: z.enum(["money-forward-journal-v1.csv", "generic-journal-v1.csv"]),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  sourceSetSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  schemaSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  fixtureSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  rowCount: z.number().int().positive(),
  columnCount: z.union([z.literal(27), z.literal(19)]),
  state: z.enum(["ready", "downloaded", "import_confirmed", "voided", "superseded"]),
  supersedesBatchId: z.string().uuid().nullable(),
  contentUrl: z.string().startsWith("/v1/workspaces/"),
  createdAt: z.iso.datetime(),
});

const accountingExportDuplicateReferenceSchema = z.object({
  batchId: z.string().uuid(),
  format: z.enum(["money_forward_journal_v1", "generic_journal_v1"]),
  filename: z.enum(["money-forward-journal-v1.csv", "generic-journal-v1.csv"]),
  sourceSetSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  state: z.enum(["ready", "downloaded", "import_confirmed", "superseded"]),
});

export const accountingExportPreflightResponseSchema = z
  .object({
    orderId: z.string().uuid(),
    currentSourceSetSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .nullable(),
    exactPriorDuplicate: accountingExportDuplicateReferenceSchema.nullable(),
    canCreateFresh: z.boolean(),
    canSupersede: z.boolean(),
  })
  .superRefine((value, context) => {
    const hasCurrentSources = value.currentSourceSetSha256 !== null;
    const hasExactPrior = value.exactPriorDuplicate !== null;
    if (value.canCreateFresh !== (hasCurrentSources && !hasExactPrior)) {
      context.addIssue({
        code: "custom",
        path: ["canCreateFresh"],
        message: "Fresh export permission does not match the exact duplicate result",
      });
    }
    if (value.canSupersede !== (hasCurrentSources && hasExactPrior)) {
      context.addIssue({
        code: "custom",
        path: ["canSupersede"],
        message: "Supersession permission does not match the exact duplicate result",
      });
    }
    if (
      value.exactPriorDuplicate &&
      value.exactPriorDuplicate.sourceSetSha256 !== value.currentSourceSetSha256
    ) {
      context.addIssue({
        code: "custom",
        path: ["exactPriorDuplicate", "sourceSetSha256"],
        message: "Prior duplicate must match the current source set",
      });
    }
  });

export const accountingExportPreviewResponseSchema = z
  .object({
    batchId: z.string().uuid(),
    formatVersion: z.enum(["money_forward_journal_v1.0.0", "generic_journal_v1.0.0"]),
    filename: z.enum(["money-forward-journal-v1.csv", "generic-journal-v1.csv"]),
    sha256: z.string().regex(/^[a-f0-9]{64}$/u),
    columnCount: z.union([z.literal(27), z.literal(19)]),
    totalRowCount: z.number().int().positive(),
    previewRowCount: z.number().int().min(0).max(10),
    truncated: z.boolean(),
    headers: z.string().max(100).array().min(19).max(27),
    rows: z.string().max(500).array().max(27).array().max(10),
  })
  .superRefine((value, context) => {
    if (value.headers.length !== value.columnCount) {
      context.addIssue({ code: "custom", message: "Preview header count does not match format" });
    }
    if (value.rows.some((row) => row.length !== value.columnCount)) {
      context.addIssue({ code: "custom", message: "Preview row count does not match format" });
    }
    if (value.previewRowCount !== value.rows.length) {
      context.addIssue({ code: "custom", message: "Preview row count does not match rows" });
    }
    if (value.truncated !== value.totalRowCount > value.previewRowCount) {
      context.addIssue({ code: "custom", message: "Preview truncation flag is inconsistent" });
    }
  });

export const confirmAccountingImportRequestSchema = z
  .object({
    idempotencyKey: z.string().uuid(),
    result: z.enum(["success", "failed"]),
    importedRowCount: z.number().int().nonnegative(),
    note: z.string().trim().max(500).nullable(),
    confirmedAt: z.iso.datetime(),
    humanConfirmed: z.literal(true),
  })
  .strict();

export type CreateSkuRequest = z.infer<typeof createSkuRequestSchema>;
export type SkuResponse = z.infer<typeof skuResponseSchema>;
export type InventorySummary = z.infer<typeof inventorySummarySchema>;
export type OwnerPulseResponse = z.infer<typeof ownerPulseResponseSchema>;
export type PutawayCatalogResponse = z.infer<typeof putawayCatalogResponseSchema>;
export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;
export type SessionContextResponse = z.infer<typeof sessionContextResponseSchema>;
export type PutawayInventoryRequest = z.infer<typeof putawayInventoryRequestSchema>;
export type PutawayInventoryResponse = z.infer<typeof putawayInventoryResponseSchema>;
export type RegisterLocationPhotoRequest = z.infer<typeof registerLocationPhotoRequestSchema>;
export type ApproveLocationPhotoRequest = z.infer<typeof approveLocationPhotoRequestSchema>;
export type UploadLocationPhotoQuery = z.infer<typeof uploadLocationPhotoQuerySchema>;
export type ReviewLocationPhotoRequest = z.infer<typeof reviewLocationPhotoRequestSchema>;
export type LocationPhotoResponse = z.infer<typeof locationPhotoResponseSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type AdvanceP0WorkflowRequest = z.infer<typeof advanceP0WorkflowRequestSchema>;
export type P0WorkflowResponse = z.infer<typeof p0WorkflowResponseSchema>;
export type RegisterMediaAssetRequest = z.infer<typeof registerMediaAssetRequestSchema>;
export type MediaAssetResponse = z.infer<typeof mediaAssetResponseSchema>;
export type RecordInspectionCheckResultRequest = z.infer<
  typeof recordInspectionCheckResultRequestSchema
>;
export type InspectionCheckResultRevisionResponse = z.infer<
  typeof inspectionCheckResultRevisionResponseSchema
>;
export type RecordInspectionConcernRevisionRequest = z.infer<
  typeof recordInspectionConcernRevisionRequestSchema
>;
export type InspectionConcernRevisionResponse = z.infer<
  typeof inspectionConcernRevisionResponseSchema
>;
export type RecordMeasurementRequest = z.infer<typeof recordMeasurementRequestSchema>;
export type MeasurementResponse = z.infer<typeof measurementResponseSchema>;
export type CaptureTaskResponse = z.infer<typeof captureTaskResponseSchema>;
export type CreateIdentityCandidateRequest = z.infer<typeof createIdentityCandidateRequestSchema>;
export type ConfirmIdentityCandidateRequest = z.infer<typeof confirmIdentityCandidateRequestSchema>;
export type IdentityCandidateResponse = z.infer<typeof identityCandidateResponseSchema>;
export type ConfirmProductAttributesRequest = z.infer<typeof confirmProductAttributesRequestSchema>;
export type ProductAttributeConfirmationResponse = z.infer<
  typeof productAttributeConfirmationResponseSchema
>;
export type MeasurementProfileResponse = z.infer<typeof measurementProfileResponseSchema>;
export type CreateMarketplaceReferenceRequest = z.infer<
  typeof createMarketplaceReferenceRequestSchema
>;
export type MarketplaceReferenceResponse = z.infer<typeof marketplaceReferenceResponseSchema>;
export type ProductResearchResponse = z.infer<typeof productResearchResponseSchema>;
export type CaptureSummary = z.infer<typeof captureSummarySchema>;
export type CreateOrderRequest = z.infer<typeof createOrderRequestSchema>;
export type CreateP0ItemRequest = z.infer<typeof createP0ItemRequestSchema>;
export type P0ItemResponse = z.infer<typeof p0ItemResponseSchema>;
export type StartPilotRunRequest = z.infer<typeof startPilotRunRequestSchema>;
export type RecordPilotExceptionRequest = z.infer<typeof recordPilotExceptionRequestSchema>;
export type InvalidatePilotRunRequest = z.infer<typeof invalidatePilotRunRequestSchema>;
export type PilotExceptionMetrics = z.infer<typeof pilotExceptionMetricsSchema>;
export type PilotItemMeasurement = z.infer<typeof pilotItemMeasurementSchema>;
export type PilotRunResponse = z.infer<typeof pilotRunResponseSchema>;
export type CreateLocationRequest = z.infer<typeof createLocationRequestSchema>;
export type LocationNodeResponse = z.infer<typeof locationNodeResponseSchema>;
export type OrderOperationResponse = z.infer<typeof orderOperationResponseSchema>;
export type AssignOrderRequest = z.infer<typeof assignOrderRequestSchema>;
export type OrderAssignmentResponse = z.infer<typeof orderAssignmentResponseSchema>;
export type CreateLocalMemberRequest = z.infer<typeof createLocalMemberRequestSchema>;
export type TeamMemberResponse = z.infer<typeof teamMemberResponseSchema>;
export type CreateTeamAssignmentRequest = z.infer<typeof createTeamAssignmentRequestSchema>;
export type RevokeTeamAssignmentRequest = z.infer<typeof revokeTeamAssignmentRequestSchema>;
export type TeamAssignmentResponse = z.infer<typeof teamAssignmentResponseSchema>;
export type TeamStateResponse = z.infer<typeof teamStateResponseSchema>;
export type StartStocktakeRequest = z.infer<typeof startStocktakeRequestSchema>;
export type StocktakeObservationRequest = z.infer<typeof stocktakeObservationRequestSchema>;
export type StocktakeDiscrepancy = z.infer<typeof stocktakeDiscrepancySchema>;
export type StocktakeResponse = z.infer<typeof stocktakeResponseSchema>;
export type ResolveStocktakeDiscrepancyRequest = z.infer<
  typeof resolveStocktakeDiscrepancyRequestSchema
>;
export type UploadDiscrepancyEvidenceQuery = z.infer<typeof uploadDiscrepancyEvidenceQuerySchema>;
export type DiscrepancyEvidenceResponse = z.infer<typeof discrepancyEvidenceResponseSchema>;
export type DiscrepancyEvidenceListItem = z.infer<typeof discrepancyEvidenceListItemSchema>;
export type CreateDiscrepancyChallengeRequest = z.infer<
  typeof createDiscrepancyChallengeRequestSchema
>;
export type DiscrepancyChallengeResponse = z.infer<typeof discrepancyChallengeResponseSchema>;
export type ConfirmMissingCandidateRequest = z.infer<typeof confirmMissingCandidateRequestSchema>;
export type RestoreMissingCandidateRequest = z.infer<typeof restoreMissingCandidateRequestSchema>;
export type ApproveStocktakeRequest = z.infer<typeof approveStocktakeRequestSchema>;
export type ReissueInventoryLabelRequest = z.infer<typeof reissueInventoryLabelRequestSchema>;
export type ReissuedInventoryLabelResponse = z.infer<typeof reissuedInventoryLabelResponseSchema>;
export type ShippingTaskResponse = z.infer<typeof shippingTaskResponseSchema>;
export type ShippingPhotoPolicyMode = z.infer<typeof shippingPhotoPolicyModeSchema>;
export type ShippingPhotoRole = z.infer<typeof shippingPhotoRoleSchema>;
export type UpdateShippingPhotoPolicyRequest = z.infer<
  typeof updateShippingPhotoPolicyRequestSchema
>;
export type ShippingPhotoPolicyResponse = z.infer<typeof shippingPhotoPolicyResponseSchema>;
export type EvaluateShippingPhotoPreflightRequest = z.infer<
  typeof evaluateShippingPhotoPreflightRequestSchema
>;
export type OverrideShippingPhotoDecisionRequest = z.infer<
  typeof overrideShippingPhotoDecisionRequestSchema
>;
export type UploadShippingPhotoQuery = z.infer<typeof uploadShippingPhotoQuerySchema>;
export type ShippingPhotoAssetResponse = z.infer<typeof shippingPhotoAssetResponseSchema>;
export type ConfirmShippingPhotosRequest = z.infer<typeof confirmShippingPhotosRequestSchema>;
export type ShippingPhotoConfirmationResponse = z.infer<
  typeof shippingPhotoConfirmationResponseSchema
>;
export type ShippingPhotoPreflightResponse = z.infer<typeof shippingPhotoPreflightResponseSchema>;
export type RecordOrderSaleAmountRequest = z.infer<typeof recordOrderSaleAmountRequestSchema>;
export type RecordOrderSaleAmountResponse = z.infer<typeof recordOrderSaleAmountResponseSchema>;
export type CreateAddressLeaseRequest = z.infer<typeof createAddressLeaseRequestSchema>;
export type AddressLeaseResponse = z.infer<typeof addressLeaseResponseSchema>;
export type ShippingAddressResponse = z.infer<typeof shippingAddressResponseSchema>;
export type PickOrderRequest = z.infer<typeof pickOrderRequestSchema>;
export type PackOrderRequest = z.infer<typeof packOrderRequestSchema>;
export type ShipOrderRequest = z.infer<typeof shipOrderRequestSchema>;
export type ReturnOrderRequest = z.infer<typeof returnOrderRequestSchema>;
export type QuarantineReturnRequest = z.infer<typeof quarantineReturnRequestSchema>;
export type InspectReturnRequest = z.infer<typeof inspectReturnRequestSchema>;
export type FinancialSummaryResponse = z.infer<typeof financialSummaryResponseSchema>;
export type CreateAccountingExportRequest = z.infer<typeof createAccountingExportRequestSchema>;
export type AccountingExportResponse = z.infer<typeof accountingExportResponseSchema>;
export type AccountingProfileResponse = z.infer<typeof accountingProfileSchema>;
export type AccountingOrderOptionResponse = z.infer<typeof accountingOrderOptionSchema>;
export type UpdateAccountingProfileRequest = z.infer<typeof updateAccountingProfileRequestSchema>;
export type AccountMappingRuleResponse = z.infer<typeof accountMappingRuleSchema>;
export type CreateAccountMappingRuleRequest = z.infer<typeof createAccountMappingRuleRequestSchema>;
export type AccountMappingChangeReason = z.infer<typeof accountMappingChangeReasonSchema>;
export type ReplaceAccountMappingRuleRequest = z.infer<
  typeof replaceAccountMappingRuleRequestSchema
>;
export type ReplaceAccountMappingRuleResponse = z.infer<
  typeof replaceAccountMappingRuleResponseSchema
>;
export type CreateVersionedAccountingExportRequest = z.infer<
  typeof createVersionedAccountingExportRequestSchema
>;
export type VersionedAccountingExportResponse = z.infer<
  typeof versionedAccountingExportResponseSchema
>;
export type AccountingExportPreflightResponse = z.infer<
  typeof accountingExportPreflightResponseSchema
>;
export type AccountingExportPreviewResponse = z.infer<typeof accountingExportPreviewResponseSchema>;
export type ConfirmAccountingImportRequest = z.infer<typeof confirmAccountingImportRequestSchema>;
