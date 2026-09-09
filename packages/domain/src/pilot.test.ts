import { describe, expect, it } from "vitest";
import { summarizeListingPrepPilot, type PilotSummaryItem } from "./pilot.js";

const zeroMetrics = {
  invalidAttemptCount: 0,
  missingRequiredImageCount: 0,
  measurementReworkCount: 0,
  labelLocationMismatchCount: 0,
  misputawayCount: 0,
  networkRetryCount: 0,
  manualCorrectionCount: 0,
} as const;

function items(seconds: readonly number[]): PilotSummaryItem[] {
  return seconds.map((elapsedSeconds) => ({ elapsedSeconds, metrics: { ...zeroMetrics } }));
}

describe("summarizeListingPrepPilot", () => {
  it("uses the average of positions five and six for P50 and nearest-rank P75", () => {
    const result = summarizeListingPrepPilot(
      items([100, 200, 150, 300, 250, 180, 170, 160, 140, 130]),
      "completed",
    );
    expect(result).toMatchObject({
      itemCount: 10,
      completedItemCount: 10,
      p50Seconds: 165,
      p75Seconds: 200,
      minSeconds: 100,
      maxSeconds: 300,
      passed: true,
    });
  });

  it("does not pass an incomplete run or a run with a product-caused invalid attempt", () => {
    expect(summarizeListingPrepPilot(items([10, 20]), "active").passed).toBeNull();
    const failedItems = items([100, 110, 120, 130, 140, 150, 160, 170, 180, 190]);
    failedItems[0].metrics.invalidAttemptCount = 1;
    expect(summarizeListingPrepPilot(failedItems, "failed")).toMatchObject({
      invalidAttemptCount: 1,
      passed: false,
    });
  });

  it("keeps measurement rework visible without treating an otherwise valid run as hidden", () => {
    const measured = items([100, 110, 120, 130, 140, 150, 160, 170, 180, 190]);
    measured[4].metrics.measurementReworkCount = 2;
    expect(summarizeListingPrepPilot(measured, "completed")).toMatchObject({
      measurementReworkCount: 2,
      passed: true,
    });
  });
});
