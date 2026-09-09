import { describe, expect, it } from "vitest";

import {
  FINANCIAL_FORMULA_VERSION,
  calculateContribution,
  calculateFinancialsV1,
  calculateFixedDiscountPriceFloor,
  calculateRateDiscountPriceFloor,
  type MoneyFact,
  type TransactionFacts,
  type VersionedTransactionFacts,
} from "./finance.js";

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

const versionedFacts = (
  overrides: Partial<VersionedTransactionFacts> = {},
): VersionedTransactionFacts => ({
  orderPrice: money(10_000),
  sellerDiscount: money(1_000),
  channelCoupon: { ...money(500), bearer: "channel" },
  sellerRevenueBeforeRefund: null,
  successfulRefund: money(2_000),
  sourceRevenueAlreadyNetOfRefund: false,
  sellingFeeCharged: money(900),
  sellingFeeRefund: money(100),
  promotionCost: money(200),
  sellerShipping: money(750),
  packagingCost: money(100),
  returnDirectCost: money(300),
  costOfGoods: money(3_000),
  costReturnedToInventory: money(500),
  ...overrides,
});

describe("financial_formula_v1.0.0", () => {
  it("separates buyer coupon, seller revenue, fee refund and returned inventory cost", () => {
    expect(calculateFinancialsV1(versionedFacts())).toEqual({
      formulaVersion: FINANCIAL_FORMULA_VERSION,
      buyerItemPaid: 8_500,
      sellerRevenuePreRefund: 9_000,
      netProductSales: 7_000,
      netSalesFee: 800,
      netCostOfGoods: 2_500,
      productGrossProfit: 4_500,
      transactionContribution: 2_350,
      productGrossMarginBasisPoints: 6_429,
      missing: [],
    });
  });

  it("subtracts a refund exactly once when the source is already net", () => {
    expect(
      calculateFinancialsV1(
        versionedFacts({
          sellerRevenueBeforeRefund: money(7_000),
          sourceRevenueAlreadyNetOfRefund: true,
        }),
      ).netProductSales,
    ).toBe(7_000);
  });

  it("keeps unknown expenses missing instead of silently treating them as zero", () => {
    const result = calculateFinancialsV1(versionedFacts({ sellerShipping: null }));
    expect(result.missing).toContain("sellerShipping");
    expect(result.transactionContribution).toBeNull();
  });

  it("rejects invalid negative or floating JPY facts", () => {
    expect(() => calculateFinancialsV1(versionedFacts({ packagingCost: money(-1) }))).toThrow(
      "non-negative",
    );
    expect(() => calculateFinancialsV1(versionedFacts({ packagingCost: money(1.5) }))).toThrow(
      "safe integer",
    );
  });

  it("rounds both price floor formulas upward in integer basis points", () => {
    expect(
      calculateFixedDiscountPriceFloor({
        productCost: 3_000,
        fixedShipping: 750,
        packagingCost: 100,
        fixedFee: 0,
        targetContribution: 2_000,
        plannedDiscount: 500,
        feeRateBasisPoints: 1_000,
      }),
    ).toBe(7_000);
    expect(
      calculateRateDiscountPriceFloor({
        productCost: 3_000,
        fixedShipping: 750,
        packagingCost: 100,
        fixedFee: 0,
        targetContribution: 2_000,
        plannedDiscountRateBasisPoints: 500,
        feeRateBasisPoints: 1_000,
      }),
    ).toBe(6_843);
  });
});
