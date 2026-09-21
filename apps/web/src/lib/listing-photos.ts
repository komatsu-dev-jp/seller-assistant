import type { P0ItemResponse } from "@resale/contracts";

type CapturePhotos = Pick<P0ItemResponse["capture"], "photoRoles" | "photoAssetIds">;

/** The authorized P0 response orders photo history by created_at, then id, ascending. */
export function latestListingPhoto(capture: CapturePhotos, role: string): string | undefined {
  const index = capture.photoRoles.lastIndexOf(role as CapturePhotos["photoRoles"][number]);
  return index < 0 ? undefined : capture.photoAssetIds[index];
}

export function hasListingPhotos(capture: CapturePhotos): boolean {
  return ["front", "back", "brand_tag", "care_label"].every((role) =>
    Boolean(latestListingPhoto(capture, role)),
  );
}

/** Leave the extension to the browser so it follows the private response's real MIME type. */
export function listingPhotoDownloadBaseName(skuCode: string, role: string): string {
  return `${skuCode}-${role}`;
}
