import type { StocktakeResponse } from "@resale/contracts";

export function selectFocusedStocktake(
  stocktakes: StocktakeResponse[],
  selectedStocktakeId: string | null,
): StocktakeResponse | null {
  const unresolved = stocktakes.find(hasUnresolvedDiscrepancies);
  const retainedUnapproved = stocktakes.find(
    (stocktake) => stocktake.stocktakeId === selectedStocktakeId && stocktake.state !== "approved",
  );
  const approvedRestoreCandidate = stocktakes.find(hasApprovedRestoreCandidate);
  return (
    unresolved ??
    retainedUnapproved ??
    approvedRestoreCandidate ??
    stocktakes.find((stocktake) => stocktake.state !== "approved") ??
    null
  );
}

function hasUnresolvedDiscrepancies(stocktake: StocktakeResponse): boolean {
  return (
    stocktake.state !== "approved" &&
    stocktake.discrepancies.some(
      (discrepancy) =>
        discrepancy.state === "reconfirmation_required" ||
        discrepancy.state === "candidate_confirmed",
    )
  );
}

function hasApprovedRestoreCandidate(stocktake: StocktakeResponse): boolean {
  return (
    stocktake.state === "approved" &&
    stocktake.discrepancies.some((discrepancy) => discrepancy.state === "candidate_confirmed")
  );
}
