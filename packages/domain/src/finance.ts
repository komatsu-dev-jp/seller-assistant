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

export const FINANCIAL_FORMULA_VERSION = "financial_formula_v1.0.0" as const;

export type FinancialInputName =
  | "orderPrice"
  | "sellerDiscount"
  | "channelCoupon"
  | "successfulRefund"
  | "sellingFeeCharged"
  | "sellingFeeRefund"
  | "promotionCost"
  | "sellerShipping"
  | "packagingCost"
  | "returnDirectCost"
  | "costOfGoods"
  | "costReturnedToInventory";

export interface VersionedTransactionFacts {
  orderPrice: MoneyFact | null;
  sellerDiscount: MoneyFact | null;
  channelCoupon: MoneyFact | null;
  sellerRevenueBeforeRefund: MoneyFact | null;
  successfulRefund: MoneyFact | null;
  sourceRevenueAlreadyNetOfRefund: boolean;
  sellingFeeCharged: MoneyFact | null;
  sellingFeeRefund: MoneyFact | null;
  promotionCost: MoneyFact | null;
  sellerShipping: MoneyFact | null;
  packagingCost: MoneyFact | null;
  returnDirectCost: MoneyFact | null;
  costOfGoods: MoneyFact | null;
  costReturnedToInventory: MoneyFact | null;
}

export interface VersionedFinancialResult {
  formulaVersion: typeof FINANCIAL_FORMULA_VERSION;
  buyerItemPaid: number | null;
  sellerRevenuePreRefund: number | null;
  netProductSales: number | null;
  netSalesFee: number | null;
  netCostOfGoods: number | null;
  productGrossProfit: number | null;
  transactionContribution: number | null;
  productGrossMarginBasisPoints: number | null;
  missing: FinancialInputName[];
}

export interface FixedDiscountPriceFloorInput {
  productCost: number;
  fixedShipping: number;
  packagingCost: number;
  fixedFee: number;
  targetContribution: number;
  plannedDiscount: number;
  feeRateBasisPoints: number;
}

export interface RateDiscountPriceFloorInput {
  productCost: number;
  fixedShipping: number;
  packagingCost: number;
  fixedFee: number;
  targetContribution: number;
  plannedDiscountRateBasisPoints: number;
  feeRateBasisPoints: number;
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

export function calculateFinancialsV1(facts: VersionedTransactionFacts): VersionedFinancialResult {
  const required: FinancialInputName[] = [
    "orderPrice",
    "sellerDiscount",
    "channelCoupon",
    "successfulRefund",
    "sellingFeeCharged",
    "sellingFeeRefund",
    "promotionCost",
    "sellerShipping",
    "packagingCost",
    "returnDirectCost",
    "costOfGoods",
    "costReturnedToInventory",
  ];
  const missing = required.filter((name) => facts[name] === null);
  Object.values(facts)
    .filter(
      (value): value is MoneyFact =>
        Boolean(value) && typeof value === "object" && "amountMinor" in value,
    )
    .forEach(assertNonNegativeJPYInteger);

  const orderPrice = facts.orderPrice?.amountMinor ?? null;
  const sellerDiscount = facts.sellerDiscount?.amountMinor ?? null;
  const channelCoupon = facts.channelCoupon?.amountMinor ?? null;
  const buyerItemPaid = subtractAll(orderPrice, sellerDiscount, channelCoupon);
  const derivedSellerRevenue = subtractAll(orderPrice, sellerDiscount);
  const sellerRevenuePreRefund =
    facts.sellerRevenueBeforeRefund?.amountMinor ?? derivedSellerRevenue;
  const refund = facts.successfulRefund?.amountMinor ?? null;
  const netProductSales = facts.sourceRevenueAlreadyNetOfRefund
    ? sellerRevenuePreRefund
    : subtractAll(sellerRevenuePreRefund, refund);
  const netSalesFee = subtractAll(
    facts.sellingFeeCharged?.amountMinor ?? null,
    facts.sellingFeeRefund?.amountMinor ?? null,
  );
  const netCostOfGoods = subtractAll(
    facts.costOfGoods?.amountMinor ?? null,
    facts.costReturnedToInventory?.amountMinor ?? null,
  );
  const productGrossProfit = subtractAll(netProductSales, netCostOfGoods);
  const transactionContribution = subtractAll(
    productGrossProfit,
    netSalesFee,
    facts.promotionCost?.amountMinor ?? null,
    facts.sellerShipping?.amountMinor ?? null,
    facts.packagingCost?.amountMinor ?? null,
    facts.returnDirectCost?.amountMinor ?? null,
  );
  const productGrossMarginBasisPoints =
    productGrossProfit === null || netProductSales === null || netProductSales <= 0
      ? null
      : Math.round((productGrossProfit * 10_000) / netProductSales);

  return {
    formulaVersion: FINANCIAL_FORMULA_VERSION,
    buyerItemPaid,
    sellerRevenuePreRefund,
    netProductSales,
    netSalesFee,
    netCostOfGoods,
    productGrossProfit,
    transactionContribution,
    productGrossMarginBasisPoints,
    missing,
  };
}

export function calculateFixedDiscountPriceFloor(input: FixedDiscountPriceFloorInput): number {
  assertPriceFloorIntegers(input);
  assertRate(input.feeRateBasisPoints, "fee rate");
  const fixedCost = input.productCost + input.fixedShipping + input.packagingCost + input.fixedFee;
  return (
    input.plannedDiscount +
    divideAndCeil(
      (fixedCost + input.targetContribution) * 10_000,
      10_000 - input.feeRateBasisPoints,
    )
  );
}

export function calculateRateDiscountPriceFloor(input: RateDiscountPriceFloorInput): number {
  assertPriceFloorIntegers(input);
  assertRate(input.feeRateBasisPoints, "fee rate");
  assertRate(input.plannedDiscountRateBasisPoints, "discount rate");
  const fixedCost = input.productCost + input.fixedShipping + input.packagingCost + input.fixedFee;
  return divideAndCeil(
    (fixedCost + input.targetContribution) * 100_000_000,
    (10_000 - input.plannedDiscountRateBasisPoints) * (10_000 - input.feeRateBasisPoints),
  );
}

function subtractAll(minuend: number | null, ...subtrahends: Array<number | null>): number | null {
  if (minuend === null || subtrahends.some((value) => value === null)) return null;
  return subtrahends.reduce<number>((total, value) => total - (value ?? 0), minuend);
}

function assertNonNegativeJPYInteger(fact: MoneyFact): void {
  assertJPYInteger(fact);
  if (fact.currency !== "JPY" || fact.amountMinor < 0) {
    throw new Error("money fact must be a non-negative JPY integer");
  }
  if (!fact.sourceMeaning || !fact.roundingRuleVersion) {
    throw new Error("money fact source meaning and rounding rule are required");
  }
}

function assertPriceFloorIntegers(input: object): void {
  for (const value of Object.values(input)) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error("price floor inputs must be non-negative safe integers");
    }
  }
}

function assertRate(value: number, name: string): void {
  if (value < 0 || value >= 10_000) throw new Error(`${name} must be below 100 percent`);
}

function divideAndCeil(numerator: number, denominator: number): number {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)) {
    throw new Error("price floor calculation exceeds safe integer range");
  }
  return Math.ceil(numerator / denominator);
}
