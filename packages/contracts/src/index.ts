import { z } from "zod";

export const workspaceIdSchema = z.string().uuid();
export const inventoryNumberSchema = z.string().regex(/^INV-[0-9]{6}$/u);

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("resale-ops-api"),
  time: z.iso.datetime(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
