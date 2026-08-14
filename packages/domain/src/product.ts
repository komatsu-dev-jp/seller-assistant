export type PhotoRole = "front" | "back" | "brand_tag" | "care_label" | "flaw";

export interface MediaAsset {
  id: string;
  workspaceId: string;
  skuId: string;
  role: PhotoRole;
  originalSha256: string;
  originalStorageKey: string;
  createdAt: string;
}

export type MediaRegistration =
  | { kind: "created"; asset: MediaAsset }
  | { kind: "replay"; asset: MediaAsset }
  | { kind: "conflict"; reason: "same_id_different_hash" };

export function registerMediaAsset(
  existingById: MediaAsset | undefined,
  candidate: MediaAsset,
): MediaRegistration {
  if (!/^[a-f0-9]{64}$/u.test(candidate.originalSha256)) {
    throw new Error("originalSha256 must be a lowercase SHA-256 hex value");
  }
  if (!candidate.originalStorageKey.startsWith(`workspaces/${candidate.workspaceId}/originals/`)) {
    throw new Error("original storage key is outside the workspace prefix");
  }
  if (!existingById) return { kind: "created", asset: candidate };
  if (existingById.originalSha256 === candidate.originalSha256) {
    return { kind: "replay", asset: existingById };
  }
  return { kind: "conflict", reason: "same_id_different_hash" };
}

export type MeasurementBasis = "flat_width" | "circumference" | "length";

export interface Measurement {
  definitionId: string;
  definitionVersion: number;
  value: number;
  unit: "cm";
  basis: MeasurementBasis;
  state: "natural" | "closed" | "unstretched";
  measuredBy: string;
  measuredAt: string;
  evidenceAssetId: string;
  attempt: number;
  confirmedBy: string | null;
  confirmationReason: string | null;
}

export interface MeasurementReview {
  requiresReview: boolean;
  difference: number | null;
  violations: string[];
}

export function reviewMeasurement(
  measurement: Measurement,
  previous: Measurement | undefined,
  toleranceCm: number,
): MeasurementReview {
  const violations: string[] = [];
  if (!Number.isFinite(measurement.value) || measurement.value <= 0)
    violations.push("invalid_value");
  if (measurement.definitionVersion < 1) violations.push("invalid_definition_version");
  if (!measurement.measuredBy) violations.push("missing_measurer");
  if (!measurement.evidenceAssetId) violations.push("missing_evidence");
  if (measurement.confirmedBy === "ai") violations.push("ai_cannot_confirm");

  const difference = previous ? Math.abs(measurement.value - previous.value) : null;
  if (difference !== null && difference > toleranceCm)
    violations.push("repeat_difference_exceeded");

  return { requiresReview: violations.length > 0, difference, violations };
}

export interface ProductConclusion {
  aiCandidate: string | null;
  aiConfidence: number | null;
  humanConclusion: string | null;
  concludedBy: string | null;
  concludedAt: string | null;
}

export interface ListingReadinessInput {
  photoRoles: PhotoRole[];
  measurements: Measurement[];
  requiredMeasurementIds: string[];
  conclusion: ProductConclusion;
  descriptionCandidate: string | null;
  descriptionConfirmedBy: string | null;
}

export interface ListingReadiness {
  ready: boolean;
  missingPhotoRoles: PhotoRole[];
  missingMeasurementIds: string[];
  blockers: string[];
}

const requiredPhotoRoles: PhotoRole[] = ["front", "back", "brand_tag", "care_label"];

export function assessListingReadiness(input: ListingReadinessInput): ListingReadiness {
  const missingPhotoRoles = requiredPhotoRoles.filter((role) => !input.photoRoles.includes(role));
  const confirmedMeasurementIds = new Set(
    input.measurements
      .filter((measurement) => measurement.confirmedBy && measurement.confirmedBy !== "ai")
      .map((measurement) => measurement.definitionId),
  );
  const missingMeasurementIds = input.requiredMeasurementIds.filter(
    (id) => !confirmedMeasurementIds.has(id),
  );
  const blockers: string[] = [];
  if (!input.conclusion.humanConclusion || !input.conclusion.concludedBy) {
    blockers.push("human_product_conclusion_required");
  }
  if (!input.descriptionCandidate || !input.descriptionConfirmedBy) {
    blockers.push("human_description_confirmation_required");
  }
  if (input.descriptionConfirmedBy === "ai") blockers.push("ai_cannot_confirm_description");
  return {
    ready:
      missingPhotoRoles.length === 0 && missingMeasurementIds.length === 0 && blockers.length === 0,
    missingPhotoRoles,
    missingMeasurementIds,
    blockers,
  };
}
