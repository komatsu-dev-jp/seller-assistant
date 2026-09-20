import { describe, expect, it } from "vitest";

import {
  dedicatedMeasurementReuseMessage,
  knownDatabaseConflictMessage,
} from "./database-error.js";

describe("knownDatabaseConflictMessage", () => {
  it("preserves the dedicated measurement photo conflict without exposing other database details", () => {
    expect(
      knownDatabaseConflictMessage({
        code: "23514",
        message: "Dedicated measurement media cannot share original bytes with another photo",
      }),
    ).toBe(dedicatedMeasurementReuseMessage);
  });

  it("does not relabel unrelated constraints or non-constraint errors", () => {
    expect(
      knownDatabaseConflictMessage({ code: "23514", message: "another constraint" }),
    ).toBeNull();
    expect(
      knownDatabaseConflictMessage({
        code: "23505",
        message: "Dedicated measurement media cannot share original bytes with another photo",
      }),
    ).toBeNull();
    expect(knownDatabaseConflictMessage(null)).toBeNull();
  });
});
