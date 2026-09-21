import { describe, expect, it } from "vitest";

import { formatPriceCandidate } from "./price-candidate";

describe("formatPriceCandidate", () => {
  it.each([
    ["4200", "4,200円"],
    ["4,200", "4,200円"],
    ["４２００円", "4,200円"],
    ["￥ 4,200 ", "4,200円"],
  ])("formats a human-entered price without changing it automatically", (input, expected) => {
    expect(formatPriceCandidate(input)).toBe(expected);
  });

  it.each(["", "0", "-1", "4.2", "4,20", "値下げ", "9007199254740992"])(
    "rejects an unsafe or unclear price: %s",
    (input) => {
      expect(formatPriceCandidate(input)).toBeNull();
    },
  );
});
