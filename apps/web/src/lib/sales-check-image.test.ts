import { describe, expect, it } from "vitest";

import {
  isCurrentSalesCheckImagePreview,
  releaseSalesCheckImagePreviews,
  replaceSalesCheckImagePreview,
  SALES_CHECK_IMAGE_MAX_BYTES,
  validateSalesCheckImageDimensions,
  validateSalesCheckImageFile,
} from "./sales-check-image";

describe("sales-check image safety", () => {
  it.each(["image/jpeg", "image/png", "image/webp"])("accepts supported %s images", (type) => {
    expect(validateSalesCheckImageFile({ type, size: 1024 })).toBeNull();
  });

  it("rejects unsupported, empty and oversized files with Japanese guidance", () => {
    expect(validateSalesCheckImageFile({ type: "image/gif", size: 1024 })).toMatch(/JPEG/u);
    expect(validateSalesCheckImageFile({ type: "image/png", size: 0 })).toMatch(/空か壊/u);
    expect(
      validateSalesCheckImageFile({ type: "image/png", size: SALES_CHECK_IMAGE_MAX_BYTES + 1 }),
    ).toMatch(/10MB/u);
  });

  it("rejects invalid or excessively large decoded dimensions", () => {
    expect(validateSalesCheckImageDimensions(1179, 2556)).toBeNull();
    expect(validateSalesCheckImageDimensions(0, 2556)).toMatch(/表示できません/u);
    expect(validateSalesCheckImageDimensions(10_001, 100)).toMatch(/大きすぎ/u);
    expect(validateSalesCheckImageDimensions(8000, 6000)).toMatch(/4,000万画素/u);
  });

  it("replaces and removes only the selected item's temporary URL", () => {
    const revoked: string[] = [];
    const initial = {
      "ITM-0006": { previewUrl: "blob:pants-old", state: "ready" as const },
      "ITM-0005": { previewUrl: "blob:shirt", state: "ready" as const },
    };

    const replaced = replaceSalesCheckImagePreview(
      initial,
      "ITM-0006",
      { previewUrl: "blob:pants-new", state: "loading" },
      (url) => revoked.push(url),
    );
    expect(revoked).toEqual(["blob:pants-old"]);
    expect(replaced["ITM-0005"]).toEqual(initial["ITM-0005"]);
    expect(replaced["ITM-0006"]?.previewUrl).toBe("blob:pants-new");

    const ready = replaceSalesCheckImagePreview(
      replaced,
      "ITM-0006",
      { previewUrl: "blob:pants-new", state: "ready" },
      (url) => revoked.push(url),
    );
    expect(revoked).toEqual(["blob:pants-old"]);

    const removed = replaceSalesCheckImagePreview(ready, "ITM-0005", null, (url) =>
      revoked.push(url),
    );
    expect(revoked).toEqual(["blob:pants-old", "blob:shirt"]);
    expect(removed["ITM-0005"]).toBeUndefined();
    expect(removed["ITM-0006"]?.previewUrl).toBe("blob:pants-new");
  });

  it("releases each remaining temporary URL once on screen exit", () => {
    const revoked: string[] = [];
    releaseSalesCheckImagePreviews(
      {
        "ITM-0006": { previewUrl: "blob:shared", state: "ready" },
        "ITM-0005": { previewUrl: "blob:shared", state: "ready" },
        "ITM-0004": { previewUrl: "blob:backpack", state: "loading" },
      },
      (url) => revoked.push(url),
    );
    expect(revoked).toEqual(["blob:shared", "blob:backpack"]);
  });

  it("rejects stale URL and stale loading-state callbacks", () => {
    const current = {
      "ITM-0006": { previewUrl: "blob:current", state: "ready" as const },
    };
    expect(isCurrentSalesCheckImagePreview(current, "ITM-0006", "blob:current")).toBe(true);
    expect(isCurrentSalesCheckImagePreview(current, "ITM-0006", "blob:old")).toBe(false);
    expect(isCurrentSalesCheckImagePreview(current, "ITM-0006", "blob:current", "loading")).toBe(
      false,
    );
    expect(isCurrentSalesCheckImagePreview(current, "ITM-0005", "blob:current")).toBe(false);
  });
});
