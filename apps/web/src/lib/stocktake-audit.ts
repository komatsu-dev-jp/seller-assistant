import type { StocktakeResponse } from "@resale/contracts";

export type StocktakeAuditEntry = {
  key: string;
  occurredAt: string;
  label: string;
  detail: string;
};

export function stocktakeAuditEntries(stocktake: StocktakeResponse): StocktakeAuditEntry[] {
  const entries = [
    {
      key: `started-${stocktake.stocktakeId}`,
      occurredAt: stocktake.startedAt,
      label: "棚卸開始",
      detail: `${stocktake.locationCode} / ${
        stocktake.confirmationMode === "solo_reversible" ? "単独・復元可能" : "2名確認"
      }`,
    },
    ...stocktake.observations.map((observation) => ({
      key: `observation-${observation.ordinal}`,
      occurredAt: observation.observedAt,
      label: `読取 #${observation.ordinal}`,
      detail: `${observation.observedCode ?? "コードなし"} / ${observation.result}${
        observation.failureReason ? ` / ${observation.failureReason}` : ""
      }`,
    })),
    ...stocktake.discrepancies.flatMap((discrepancy) => [
      ...(discrepancy.confirmedAt
        ? [
            {
              key: `confirmed-${discrepancy.discrepancyId}`,
              occurredAt: discrepancy.confirmedAt,
              label: "不足候補を確認",
              detail: `${discrepancy.inventoryNumber ?? "在庫番号不明"} / ${
                discrepancy.confirmedReasonCode ?? "理由未記録"
              }`,
            },
          ]
        : []),
      ...(discrepancy.restoredAt
        ? [
            {
              key: `restored-${discrepancy.discrepancyId}`,
              occurredAt: discrepancy.restoredAt,
              label: "販売可能へ復元",
              detail: `${discrepancy.inventoryNumber ?? "在庫番号不明"} / 現在地 ${
                discrepancy.currentLocationCode ?? "未記録"
              } / ${discrepancy.restoredReasonCode ?? "理由未記録"}`,
            },
          ]
        : []),
    ]),
  ];
  return entries
    .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))
    .slice(0, 12);
}
