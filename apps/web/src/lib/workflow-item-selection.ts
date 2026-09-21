export function workflowItemHref(skuId: string): string {
  return `/workflow?sku=${encodeURIComponent(skuId)}`;
}

/** Only items returned by the authorized workspace request may be selected. */
export function refreshedWorkflowSelection(
  items: readonly { skuId: string }[],
  current: string | null,
  requestedSkuId: string | undefined,
): string | null {
  if (current !== null && items.some((item) => item.skuId === current)) return current;
  // Keep the unresolved URL target so the caller can show an explicit error,
  // rather than opening an unrelated item (including after a refresh).
  if (requestedSkuId !== undefined && current === requestedSkuId) return current;
  return items[0]?.skuId ?? null;
}
