import { describe, expect, it } from "vitest";
import { reviewPath } from "./review-path";

describe("review URLs before and after static export postprocessing", () => {
  const paths = [
    ...Array.from(
      { length: 28 },
      (_, index) => `/mobile/screens/${String(index + 1).padStart(2, "0")}/`,
    ),
    "/approved-assets/storage/shelf-location-mobile.png",
  ];
  it.each(paths)("prefixes %s exactly once, including already processed literals", (path) => {
    const expected = `/seller-assistant${path}`;
    expect(reviewPath(path, "/seller-assistant")).toBe(expected);
    expect(reviewPath(expected, "/seller-assistant")).toBe(expected);
    expect(reviewPath(path, "")).toBe(path);
  });
  it("does not mistake a similarly named directory for the base path", () => {
    expect(reviewPath("/seller-assistant-other/image.png", "/seller-assistant")).toBe(
      "/seller-assistant/seller-assistant-other/image.png",
    );
  });
});
