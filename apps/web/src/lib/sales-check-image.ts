export const SALES_CHECK_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const SALES_CHECK_IMAGE_MAX_PIXELS = 40_000_000;
export const SALES_CHECK_IMAGE_MAX_EDGE = 10_000;

export const SALES_CHECK_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";

const supportedSalesCheckImageTypes = new Set(SALES_CHECK_IMAGE_ACCEPT.split(","));

export type SalesCheckImageFileFact = {
  size: number;
  type: string;
};

export type SalesCheckImagePreview = {
  previewUrl: string;
  state: "loading" | "ready";
};

export type SalesCheckImagePreviews = Readonly<Record<string, SalesCheckImagePreview>>;

export function replaceSalesCheckImagePreview(
  current: SalesCheckImagePreviews,
  itemId: string,
  preview: SalesCheckImagePreview | null,
  revokeObjectUrl: (previewUrl: string) => void,
): Record<string, SalesCheckImagePreview> {
  const previous = current[itemId];
  if (previous && previous.previewUrl !== preview?.previewUrl) {
    revokeObjectUrl(previous.previewUrl);
  }

  const next = { ...current };
  if (preview) next[itemId] = preview;
  else delete next[itemId];
  return next;
}

export function releaseSalesCheckImagePreviews(
  current: SalesCheckImagePreviews,
  revokeObjectUrl: (previewUrl: string) => void,
): void {
  for (const previewUrl of new Set(Object.values(current).map((preview) => preview.previewUrl))) {
    revokeObjectUrl(previewUrl);
  }
}

export function isCurrentSalesCheckImagePreview(
  current: SalesCheckImagePreviews,
  itemId: string,
  previewUrl: string,
  state?: SalesCheckImagePreview["state"],
): boolean {
  const preview = current[itemId];
  return Boolean(
    preview && preview.previewUrl === previewUrl && (!state || preview.state === state),
  );
}

export function validateSalesCheckImageFile(file: SalesCheckImageFileFact): string | null {
  if (!supportedSalesCheckImageTypes.has(file.type)) {
    return "JPEG・PNG・WebPの画像を選んでください。";
  }
  if (!Number.isSafeInteger(file.size) || file.size <= 0) {
    return "画像ファイルが空か壊れています。別の画像を選んでください。";
  }
  if (file.size > SALES_CHECK_IMAGE_MAX_BYTES) {
    return "画像は10MB以下にしてください。";
  }
  return null;
}

export function validateSalesCheckImageDimensions(width: number, height: number): string | null {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    return "画像を表示できませんでした。別の画像を選んでください。";
  }
  if (
    width > SALES_CHECK_IMAGE_MAX_EDGE ||
    height > SALES_CHECK_IMAGE_MAX_EDGE ||
    width * height > SALES_CHECK_IMAGE_MAX_PIXELS
  ) {
    return "画像が大きすぎます。縦横10,000px以下・4,000万画素以下の画像を選んでください。";
  }
  return null;
}
