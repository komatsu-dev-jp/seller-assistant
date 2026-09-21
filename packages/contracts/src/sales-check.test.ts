import { describe, expect, it } from "vitest";
import {
  recordSalesCheckRequestSchema,
  salesCheckFields,
  salesCheckResponseSchema,
} from "./sales-check";
const input = {
  listingDays: null,
  currentPriceYen: "0",
  viewCount: "2147483647",
  searchCount: null,
  likeCount: null,
  priceReductionRequestCount: null,
  checkedOn: "2026-09-21",
  nextCheckOn: "2026-09-22",
  inputSource: "official_page_human_checked",
  idempotencyKey: "10000000-0000-4000-8000-000000000001",
};
describe("sales check contract", () => {
  it("preserves nullable counts and explicit zero", () => {
    expect(recordSalesCheckRequestSchema.parse(input)).toEqual(input);
  });
  it.each(salesCheckFields)("strictly validates %s", (field) => {
    for (const value of [
      "",
      " ",
      "01",
      "+1",
      "-1",
      "1.0",
      "1e3",
      "1,000",
      "1,00",
      "2147483648",
      "９",
      0,
      1000,
      undefined,
    ]) {
      expect(recordSalesCheckRequestSchema.safeParse({ ...input, [field]: value }).success).toBe(
        false,
      );
    }
  });
  it("requires real dates, a fixed source and no extra fields", () => {
    for (const field of ["checkedOn", "nextCheckOn"]) {
      for (const value of ["", "0000-01-01", "2026-02-29", "2026-04-31", "2026-13-01", undefined]) {
        expect(recordSalesCheckRequestSchema.safeParse({ ...input, [field]: value }).success).toBe(
          false,
        );
      }
      expect(
        recordSalesCheckRequestSchema.safeParse({ ...input, [field]: "2024-02-29" }).success,
      ).toBe(true);
    }
    expect(
      recordSalesCheckRequestSchema.safeParse({ ...input, inputSource: "image" }).success,
    ).toBe(false);
    expect(
      recordSalesCheckRequestSchema.safeParse({ ...input, productUrl: "private" }).success,
    ).toBe(false);
  });
  it("returns numbers without treating a listed price as a sale", () => {
    const { idempotencyKey, ...values } = input;
    expect(
      salesCheckResponseSchema.parse({
        ...values,
        currentPriceYen: 0,
        viewCount: 2147483647,
        observationId: idempotencyKey,
        skuId: idempotencyKey,
        workspaceId: idempotencyKey,
        confirmedBy: idempotencyKey,
        savedAt: "2026-09-21T00:00:00.000Z",
      }).currentPriceYen,
    ).toBe(0);
  });
});
