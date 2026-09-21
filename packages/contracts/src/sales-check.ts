import { z } from "zod";

export const salesCheckMaximum = 2147483647;
// Decimal strings preserve lexical validation across JSON parsing (including exponent rejection).
const inputInteger = z
  .string()
  .regex(/^(0|[1-9][0-9]{0,9})$/u)
  .refine((value) => Number(value) <= salesCheckMaximum)
  .nullable();
const outputInteger = z.number().int().min(0).max(salesCheckMaximum).nullable();
const calendarDate = z.iso.date().refine((value) => !value.startsWith("0000"));
export const salesCheckFields = [
  "listingDays",
  "currentPriceYen",
  "viewCount",
  "searchCount",
  "likeCount",
  "priceReductionRequestCount",
] as const;
export const recordSalesCheckRequestSchema = z
  .object({
    listingDays: inputInteger,
    currentPriceYen: inputInteger,
    viewCount: inputInteger,
    searchCount: inputInteger,
    likeCount: inputInteger,
    priceReductionRequestCount: inputInteger,
    checkedOn: calendarDate,
    nextCheckOn: calendarDate,
    inputSource: z.literal("official_page_human_checked"),
    idempotencyKey: z.uuid(),
  })
  .strict();
export const salesCheckResponseSchema = z
  .object({
    observationId: z.uuid(),
    workspaceId: z.uuid(),
    skuId: z.uuid(),
    listingDays: outputInteger,
    currentPriceYen: outputInteger,
    viewCount: outputInteger,
    searchCount: outputInteger,
    likeCount: outputInteger,
    priceReductionRequestCount: outputInteger,
    checkedOn: calendarDate,
    nextCheckOn: calendarDate,
    inputSource: z.literal("official_page_human_checked"),
    confirmedBy: z.uuid(),
    savedAt: z.iso.datetime(),
  })
  .strict();
export const salesCheckSummarySchema = z
  .object({
    workspaceId: z.uuid(),
    skuId: z.uuid(),
    eligible: z.boolean(),
    latest: salesCheckResponseSchema.nullable(),
    recordCount: z.number().int().nonnegative(),
  })
  .strict();
export type RecordSalesCheckRequest = z.infer<typeof recordSalesCheckRequestSchema>;
export type SalesCheckResponse = z.infer<typeof salesCheckResponseSchema>;
export type SalesCheckSummary = z.infer<typeof salesCheckSummarySchema>;
