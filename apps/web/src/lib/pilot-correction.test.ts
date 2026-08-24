import { describe, expect, it } from "vitest";

import { recoverablePilotCorrection } from "./pilot-correction";

const recoverableMessages = [
  "The pilot requires the generated four current image roles",
  "A current pilot image does not match the fixture manifest",
  "The pilot measurement set is incomplete or unexpected",
  "A current pilot measurement does not match the fixture profile",
  "The confirmed pilot attributes do not match the fixture",
  "The confirmed pilot attributes lack tag evidence",
] as const;

describe("recoverable v1.1 pilot correction", () => {
  it("accepts only the six current human-input mismatch responses", () => {
    for (const message of recoverableMessages) {
      expect(
        recoverablePilotCorrection(409, message, "listing_prep_pilot_v1.1.0", true),
      ).not.toBeNull();
    }
  });

  it("rejects other statuses, inactive or legacy pilots, and protected conflicts", () => {
    for (const status of [400, 403, 500]) {
      expect(
        recoverablePilotCorrection(
          status,
          recoverableMessages[0],
          "listing_prep_pilot_v1.1.0",
          true,
        ),
      ).toBeNull();
    }
    expect(
      recoverablePilotCorrection(409, recoverableMessages[0], "listing_prep_pilot_v1.0.0", true),
    ).toBeNull();
    expect(
      recoverablePilotCorrection(409, recoverableMessages[0], "listing_prep_pilot_v1.1.0", false),
    ).toBeNull();
    expect(
      recoverablePilotCorrection(
        409,
        "The pilot manifest hash does not match",
        "listing_prep_pilot_v1.1.0",
        true,
      ),
    ).toBeNull();
    expect(
      recoverablePilotCorrection(
        409,
        "The pilot category or measurement template is invalid",
        "listing_prep_pilot_v1.1.0",
        true,
      ),
    ).toBeNull();
  });
});
