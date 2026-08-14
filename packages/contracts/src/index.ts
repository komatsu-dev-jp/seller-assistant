import { z } from "zod";

export const workspaceIdSchema = z.string().uuid();
export const inventoryNumberSchema = z.string().regex(/^INV-[0-9]{6}$/u);

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
    locationCode: z
      .string()
      .trim()
      .toUpperCase()
      .min(3)
      .max(64)
      .regex(/^[A-Z0-9]+(?:-[A-Z0-9]+)+$/u),
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
  locationCode: z.string(),
  movementSequence: z.number().int().positive(),
  scanSessionId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
  syncedAt: z.iso.datetime(),
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

export const mediaAssetResponseSchema = registerMediaAssetRequestSchema.extend({
  workspaceId: workspaceIdSchema,
  skuId: z.string().uuid(),
  createdAt: z.iso.datetime(),
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

export type CreateSkuRequest = z.infer<typeof createSkuRequestSchema>;
export type SkuResponse = z.infer<typeof skuResponseSchema>;
export type InventorySummary = z.infer<typeof inventorySummarySchema>;
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
export type CaptureSummary = z.infer<typeof captureSummarySchema>;
