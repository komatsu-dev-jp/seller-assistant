import { measurementLabels, validateReviewState, type ReviewState } from "./local-review-store";
import { sampleProductDetails, type ProductDetails } from "./review-product-details";

export type RecoveryChange = { label: string; saved: string; input: string };
const labels: Record<keyof ProductDetails, string> = {
  name: "商品名",
  brand: "ブランド",
  size: "サイズ",
  color: "色",
  material: "素材",
  design: "柄・デザイン",
  season: "季節感",
  condition: "商品の状態",
  note: "補足",
};

// Only the fields this page edits are merged. Work results from the latest
// snapshot (location/inspection/photos) are never replaced with the old tab.
export function prepareProductRecovery(
  base: ReviewState,
  input: ReviewState,
  latest: ReviewState,
): { state: ReviewState; changes: RecoveryChange[] } {
  const original = base.details ?? sampleProductDetails();
  const edited = input.details ?? sampleProductDetails();
  const saved = latest.details ?? sampleProductDetails();
  const next = { ...latest, details: { ...saved }, measurements: [...latest.measurements] };
  const changes: RecoveryChange[] = [];
  for (const key of Object.keys(labels) as (keyof ProductDetails)[]) {
    if (edited[key] === original[key]) continue;
    next.details[key] = edited[key];
    changes.push({ label: labels[key], saved: saved[key], input: edited[key] });
  }
  input.measurements.forEach((value, i) => {
    if (value === base.measurements[i]) return;
    next.measurements[i] = value;
    next.measurementsComplete = false;
    changes.push({
      label: `${measurementLabels[i]}（cm）`,
      saved: latest.measurements[i]!,
      input: value,
    });
  });
  return { state: validateReviewState(next), changes };
}
