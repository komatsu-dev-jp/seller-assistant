import { describe, expect, it } from "vitest";
import {
  hasListingPhotos,
  latestListingPhoto,
  listingPhotoDownloadBaseName,
} from "./listing-photos";

describe("listing photo history", () => {
  const capture = {
    photoRoles: ["brand_tag", "care_label", "front", "back", "brand_tag", "care_label"] as const,
    photoAssetIds: ["old-brand", "old-care", "front", "back", "new-brand", "new-care"],
  };
  const photos = { ...capture, photoRoles: [...capture.photoRoles] };
  it("accepts all four roles even when older photos remain", () => {
    expect(hasListingPhotos(photos)).toBe(true);
    expect(latestListingPhoto(photos, "brand_tag")).toBe("new-brand");
    expect(latestListingPhoto(photos, "care_label")).toBe("new-care");
  });
  it("does not mistake four copies of one role for four required roles", () => {
    expect(
      hasListingPhotos({
        photoRoles: ["front", "front", "front", "front"],
        photoAssetIds: ["a", "b", "c", "d"],
      }),
    ).toBe(false);
  });
  it("does not fall back to an older photo when the latest reference is missing", () => {
    expect(
      latestListingPhoto({ photoRoles: ["front", "front"], photoAssetIds: ["old"] }, "front"),
    ).toBeUndefined();
    expect(hasListingPhotos({ photoRoles: [], photoAssetIds: [] })).toBe(false);
  });
  it("lets the browser append the extension that matches the private image response", () => {
    const name = listingPhotoDownloadBaseName("UI-CAP-WORKER-DUP", "front");
    expect(name).toBe("UI-CAP-WORKER-DUP-front");
    expect(name).not.toMatch(/\.(?:jpe?g|png|webp)$/u);
  });
});
