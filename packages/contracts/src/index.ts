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

export type CreateSkuRequest = z.infer<typeof createSkuRequestSchema>;
export type SkuResponse = z.infer<typeof skuResponseSchema>;
export type InventorySummary = z.infer<typeof inventorySummarySchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
