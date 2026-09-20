export type SavedProductFilter = "all" | "channel-a" | "channel-b";

export function filterSavedProducts<T extends { channel: string }>(
  items: readonly T[],
  filter: SavedProductFilter,
): T[] {
  if (filter === "channel-a") return items.filter((item) => item.channel === "販売先A");
  if (filter === "channel-b") return items.filter((item) => item.channel === "販売先B");
  return [...items];
}

export function getSavedProductPageSummary(total: number, pageSize = 6) {
  const safeTotal = Math.max(0, Math.trunc(total));
  const safePageSize = Math.max(1, Math.trunc(pageSize));
  return {
    pageCount: Math.max(1, Math.ceil(safeTotal / safePageSize)),
    first: safeTotal === 0 ? 0 : 1,
    last: Math.min(safeTotal, safePageSize),
  };
}
