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

export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  requestId: z.string(),
});

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

export type CreateSkuRequest = z.infer<typeof createSkuRequestSchema>;
export type SkuResponse = z.infer<typeof skuResponseSchema>;
export type InventorySummary = z.infer<typeof inventorySummarySchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
export type AdvanceP0WorkflowRequest = z.infer<typeof advanceP0WorkflowRequestSchema>;
export type P0WorkflowResponse = z.infer<typeof p0WorkflowResponseSchema>;
