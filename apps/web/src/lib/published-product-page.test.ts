import { describe, expect, it } from "vitest";

import {
  publishedProductPageDraftFingerprint,
  validatePublishedProductPageDraft,
} from "./published-product-page";

describe("published product page draft", () => {
  it("accepts the exact matching personal Mercari product page", () => {
    expect(
      validatePublishedProductPageDraft(" m123456789 ", " https://jp.mercari.com/item/m123456789 "),
    ).toEqual({
      ok: true,
      canonicalUrl: "https://jp.mercari.com/item/m123456789",
    });
  });

  it.each([
    ["123456789", "https://jp.mercari.com/item/123456789"],
    ["m123456789", "http://jp.mercari.com/item/m123456789"],
    ["m123456789", "https://example.test/item/m123456789"],
    ["m123456789", "https://jp.mercari.com/item/m987654321"],
    ["m123456789", "https://jp.mercari.com/item/m123456789?from=app"],
  ])("rejects a non-canonical or mismatched page", (productId, productUrl) => {
    expect(validatePublishedProductPageDraft(productId, productUrl).ok).toBe(false);
  });

  it("normalizes retry fingerprints without constructing a product URL", () => {
    expect(
      publishedProductPageDraftFingerprint(
        " m123456789 ",
        " https://jp.mercari.com/item/m123456789 ",
      ),
    ).toBe("m123456789\nhttps://jp.mercari.com/item/m123456789");
  });
});
