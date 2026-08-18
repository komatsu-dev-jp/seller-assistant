import { z } from "zod";

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
    saleAmountMinor: z.number().int().positive().max(100_000_000),
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
    supplierName: z.string().trim().min(1).max(160),
    receiptReference: z.string().trim().min(1).max(120),
    purchasedAt: z.iso.datetime(),
    receiptAmountMinor: z.number().int().nonnegative().max(100_000_000),
    allocatedCostMinor: z.number().int().nonnegative().max(100_000_000),
    idempotencyKey: z.string().uuid(),
    humanConfirmed: z.literal(true),
  })
  .strict()
  .refine((value) => value.allocatedCostMinor <= value.receiptAmountMinor, {
    message: "Allocated cost cannot exceed the receipt amount",
    path: ["allocatedCostMinor"],
  });

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
  status: z.enum(["candidate", "human_confirmed", "rejected"]),
  createdAt: z.iso.datetime(),
});

export const confirmIdentityCandidateRequestSchema = z
  .object({
    status: z.enum(["human_confirmed", "rejected"]),
    humanConfirmed: z.literal(true),
  })
  .strict();

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
  kind: z.enum(["missing_candidate", "misplaced", "unexpected", "duplicate", "unreadable"]),
  state: z.enum(["open", "reconfirmation_required", "approval_required", "resolved"]),
  resolution: z.string().nullable(),
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
    packingEvidenceReferenceId: z.string().uuid(),
    addressLeaseId: z.string().uuid().nullable(),
    confirmedAt: z.iso.datetime(),
    idempotencyKey: z.string().uuid(),
    humanConfirmed: z.literal(true),
  })
  .strict();

export const shipOrderRequestSchema = z
  .object({
    addressLeaseId: z.string().uuid().nullable(),
    shippedAt: z.iso.datetime(),
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

export type CreateSkuRequest = z.infer<typeof createSkuRequestSchema>;
export type SkuResponse = z.infer<typeof skuResponseSchema>;
export type InventorySummary = z.infer<typeof inventorySummarySchema>;
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
export type RecordMeasurementRequest = z.infer<typeof recordMeasurementRequestSchema>;
export type MeasurementResponse = z.infer<typeof measurementResponseSchema>;
export type CaptureTaskResponse = z.infer<typeof captureTaskResponseSchema>;
export type CreateIdentityCandidateRequest = z.infer<typeof createIdentityCandidateRequestSchema>;
export type ConfirmIdentityCandidateRequest = z.infer<typeof confirmIdentityCandidateRequestSchema>;
export type IdentityCandidateResponse = z.infer<typeof identityCandidateResponseSchema>;
export type CreateMarketplaceReferenceRequest = z.infer<
  typeof createMarketplaceReferenceRequestSchema
>;
export type MarketplaceReferenceResponse = z.infer<typeof marketplaceReferenceResponseSchema>;
export type ProductResearchResponse = z.infer<typeof productResearchResponseSchema>;
export type CaptureSummary = z.infer<typeof captureSummarySchema>;
export type CreateOrderRequest = z.infer<typeof createOrderRequestSchema>;
export type CreateP0ItemRequest = z.infer<typeof createP0ItemRequestSchema>;
export type P0ItemResponse = z.infer<typeof p0ItemResponseSchema>;
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
export type ApproveStocktakeRequest = z.infer<typeof approveStocktakeRequestSchema>;
export type ReissueInventoryLabelRequest = z.infer<typeof reissueInventoryLabelRequestSchema>;
export type ReissuedInventoryLabelResponse = z.infer<typeof reissuedInventoryLabelResponseSchema>;
export type ShippingTaskResponse = z.infer<typeof shippingTaskResponseSchema>;
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
