export interface PilotMetricCounts {
  invalidAttemptCount: number;
  missingRequiredImageCount: number;
  measurementReworkCount: number;
  labelLocationMismatchCount: number;
  misputawayCount: number;
  networkRetryCount: number;
  manualCorrectionCount: number;
}

export interface PilotSummaryItem {
  elapsedSeconds: number | null;
  metrics: PilotMetricCounts;
}

export interface ListingPrepPilotSummary extends PilotMetricCounts {
  itemCount: number;
  completedItemCount: number;
  p50Seconds: number | null;
  p75Seconds: number | null;
  minSeconds: number | null;
  maxSeconds: number | null;
  passed: boolean | null;
}

const metricKeys = [
  "invalidAttemptCount",
  "missingRequiredImageCount",
  "measurementReworkCount",
  "labelLocationMismatchCount",
  "misputawayCount",
  "networkRetryCount",
  "manualCorrectionCount",
] as const;

export function summarizeListingPrepPilot(
  items: readonly PilotSummaryItem[],
  state: "active" | "completed" | "failed" | "externally_invalidated",
): ListingPrepPilotSummary {
  const elapsed = items
    .flatMap((item) => (item.elapsedSeconds === null ? [] : [item.elapsedSeconds]))
    .sort((left, right) => left - right);
  const metricTotals = Object.fromEntries(
    metricKeys.map((key) => [key, items.reduce((total, item) => total + item.metrics[key], 0)]),
  ) as unknown as PilotMetricCounts;
  const hasTenCompleted = items.length === 10 && elapsed.length === 10;
  const p50Seconds = hasTenCompleted ? (elapsed[4]! + elapsed[5]!) / 2 : null;
  const p75Seconds = hasTenCompleted ? elapsed[7]! : null;
  const safetyCountsAreZero =
    metricTotals.invalidAttemptCount === 0 &&
    metricTotals.missingRequiredImageCount === 0 &&
    metricTotals.labelLocationMismatchCount === 0 &&
    metricTotals.misputawayCount === 0;
  return {
    itemCount: items.length,
    completedItemCount: elapsed.length,
    p50Seconds,
    p75Seconds,
    minSeconds: hasTenCompleted ? elapsed[0]! : null,
    maxSeconds: hasTenCompleted ? elapsed[9]! : null,
    ...metricTotals,
    passed:
      state === "active"
        ? null
        : state === "completed" &&
          hasTenCompleted &&
          safetyCountsAreZero &&
          p50Seconds !== null &&
          p50Seconds <= 300,
  };
}
