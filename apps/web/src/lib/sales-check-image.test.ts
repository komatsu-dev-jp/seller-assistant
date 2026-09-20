import { describe, expect, it } from "vitest";

import {
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
});
