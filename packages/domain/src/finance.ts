export type TaxBasis = "tax_included" | "tax_excluded" | "unknown";
export type MoneySource = "manual" | "channel_csv" | "receipt" | "accounting_import";

export interface MoneyFact {
  amountMinor: number;
  currency: "JPY";
  taxBasis: TaxBasis;
  bearer: "seller" | "channel" | "buyer" | "unknown";
  source: MoneySource;
  sourceMeaning: string;
  roundingRuleVersion: string;
}

export interface TransactionFacts {
  orderPrice: MoneyFact;
  sellerDiscount: MoneyFact;
  channelCoupon: MoneyFact;
  sellerRevenueBeforeRefund: MoneyFact;
  successfulRefund: MoneyFact | null;
  sourceRevenueAlreadyNetOfRefund: boolean;
  costOfGoods: MoneyFact | null;
  sellingFee: MoneyFact | null;
  sellerShipping: MoneyFact | null;
  packagingCost: MoneyFact | null;
}

export interface ContributionResult {
  netRevenue: number;
  contributionProfit: number | null;
  missing: Array<"costOfGoods" | "sellingFee" | "sellerShipping" | "packagingCost">;
}

function assertJPYInteger(fact: MoneyFact): void {
  if (!Number.isSafeInteger(fact.amountMinor)) {
    throw new Error("JPY amount must be a safe integer");
  }
}

export function calculateContribution(facts: TransactionFacts): ContributionResult {
  Object.values(facts)
    .filter(
      (value): value is MoneyFact =>
        Boolean(value) && typeof value === "object" && "amountMinor" in value,
    )
    .forEach(assertJPYInteger);

  const refund = facts.sourceRevenueAlreadyNetOfRefund
    ? 0
    : (facts.successfulRefund?.amountMinor ?? 0);
  const netRevenue = facts.sellerRevenueBeforeRefund.amountMinor - refund;
  const missing: ContributionResult["missing"] = [];

  const { costOfGoods, sellingFee, sellerShipping, packagingCost } = facts;
  if (!costOfGoods) missing.push("costOfGoods");
  if (!sellingFee) missing.push("sellingFee");
  if (!sellerShipping) missing.push("sellerShipping");
  if (!packagingCost) missing.push("packagingCost");

  if (!costOfGoods || !sellingFee || !sellerShipping || !packagingCost) {
    return { netRevenue, contributionProfit: null, missing };
  }

  return {
    netRevenue,
    contributionProfit:
      netRevenue -
      costOfGoods.amountMinor -
      sellingFee.amountMinor -
      sellerShipping.amountMinor -
      packagingCost.amountMinor,
    missing,
  };
}
