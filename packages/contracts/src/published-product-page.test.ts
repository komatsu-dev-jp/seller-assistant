import { describe, expect, it } from "vitest";

import {
  publishedProductPageResponseSchema,
  registerPublishedProductPageRequestSchema,
} from "./index";

const valid = {
  salesChannelKey: "mercari",
  salesChannelName: "メルカリ",
  productId: "m123456789",
  productUrl: "https://jp.mercari.com/item/m123456789",
  idempotencyKey: "10000000-0000-4000-8000-000000000001",
  humanConfirmed: true,
} as const;

describe("published product page contract", () => {
  it("accepts only the matching canonical personal Mercari item URL", () => {
    expect(registerPublishedProductPageRequestSchema.safeParse(valid).success).toBe(true);
    for (const productUrl of [
      "http://jp.mercari.com/item/m123456789",
      "https://example.test/item/m123456789",
      "https://jp.mercari.com/item/m987654321",
      "https://jp.mercari.com/item/m123456789?tracking=1",
      "https://jp.mercari.com/item/m123456789#details",
      "https://jp.mercari.com/item/m123456789/",
      "https://user@jp.mercari.com/item/m123456789",
    ]) {
      expect(
        registerPublishedProductPageRequestSchema.safeParse({ ...valid, productUrl }).success,
        productUrl,
      ).toBe(false);
    }
  });

  it("requires one explicit human confirmation and rejects unsupported channels or fields", () => {
    expect(
      registerPublishedProductPageRequestSchema.safeParse({ ...valid, humanConfirmed: false })
        .success,
    ).toBe(false);
    expect(
      registerPublishedProductPageRequestSchema.safeParse({
        ...valid,
        salesChannelKey: "yahoo_fleamarket",
      }).success,
    ).toBe(false);
    expect(
      registerPublishedProductPageRequestSchema.safeParse({ ...valid, correctionReason: "typo" })
        .success,
    ).toBe(false);
  });

  it("keeps response URLs paired with their stored product IDs", () => {
    const response = {
      registrationId: "10000000-0000-4000-8000-000000000002",
      workspaceId: "10000000-0000-4000-8000-000000000003",
      skuId: "10000000-0000-4000-8000-000000000004",
      salesChannelKey: "mercari",
      salesChannelName: "メルカリ",
      productId: valid.productId,
      productUrl: valid.productUrl,
      confirmedBy: "10000000-0000-4000-8000-000000000005",
      confirmedAt: "2026-09-21T00:00:00.000Z",
    } as const;
    expect(publishedProductPageResponseSchema.safeParse(response).success).toBe(true);
    expect(
      publishedProductPageResponseSchema.safeParse({
        ...response,
        productUrl: "https://jp.mercari.com/item/m987654321",
      }).success,
    ).toBe(false);
  });
});
