import { describe, expect, it } from "vitest";
import { accountingSummaryMissingInputs } from "./order-repository.js";

describe("accounting financial readiness", () => {
  it("adds an unknown tax basis to the visible blockers without hiding other missing facts", () => {
    expect(accountingSummaryMissingInputs(["sellerShipping"], true)).toEqual([
      "sellerShipping",
      "taxBasis",
    ]);
  });

  it("does not invent a blocker when every tax basis is confirmed", () => {
    expect(accountingSummaryMissingInputs([], false)).toEqual([]);
  });
});
