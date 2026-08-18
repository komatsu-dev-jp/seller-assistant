import { describe, expect, it } from "vitest";

import { calculateContribution, type MoneyFact, type TransactionFacts } from "./finance.js";

const money = (amountMinor: number): MoneyFact => ({
  amountMinor,
  currency: "JPY",
  taxBasis: "unknown",
  bearer: "seller",
  source: "manual",
  sourceMeaning: "test fixture",
  roundingRuleVersion: "v1",
});

const facts = (overrides: Partial<TransactionFacts> = {}): TransactionFacts => ({
  orderPrice: money(10_000),
  sellerDiscount: money(1_000),
  channelCoupon: { ...money(500), bearer: "channel" },
  sellerRevenueBeforeRefund: money(9_000),
  successfulRefund: money(2_000),
  sourceRevenueAlreadyNetOfRefund: false,
  costOfGoods: money(3_000),
  sellingFee: money(900),
  sellerShipping: money(750),
  packagingCost: money(100),
  ...overrides,
});

describe("financial facts", () => {
  it("subtracts a successful refund exactly once", () => {
    expect(calculateContribution(facts())).toEqual({
      netRevenue: 7_000,
      contributionProfit: 2_250,
      missing: [],
    });
    expect(
      calculateContribution(
        facts({ sellerRevenueBeforeRefund: money(7_000), sourceRevenueAlreadyNetOfRefund: true }),
      ).netRevenue,
    ).toBe(7_000);
  });

  it("does not turn missing expenses into zero", () => {
    expect(calculateContribution(facts({ sellerShipping: null }))).toEqual({
      netRevenue: 7_000,
      contributionProfit: null,
      missing: ["sellerShipping"],
    });
  });

  it("rejects floating point JPY amounts", () => {
    expect(() => calculateContribution(facts({ orderPrice: money(100.5) }))).toThrow(
      "JPY amount must be a safe integer",
    );
  });
});
