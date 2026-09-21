import {
  recordSalesCheckRequestSchema,
  salesCheckFields,
  type RecordSalesCheckRequest,
  type SalesCheckResponse,
} from "@resale/contracts";

export const salesCheckLabels = {
  listingDays: "出品日数",
  currentPriceYen: "現在価格（円）",
  viewCount: "閲覧数",
  searchCount: "検索数",
  likeCount: "いいね数",
  priceReductionRequestCount: "値下げ依頼数",
} as const;
export type SalesCheckDraft = Record<
  (typeof salesCheckFields)[number] | "checkedOn" | "nextCheckOn",
  string
>;
export function salesCheckDraft(record?: SalesCheckResponse | null): SalesCheckDraft {
  return {
    listingDays: record?.listingDays?.toString() ?? "",
    currentPriceYen: record?.currentPriceYen?.toString() ?? "",
    viewCount: record?.viewCount?.toString() ?? "",
    searchCount: record?.searchCount?.toString() ?? "",
    likeCount: record?.likeCount?.toString() ?? "",
    priceReductionRequestCount: record?.priceReductionRequestCount?.toString() ?? "",
    checkedOn: record?.checkedOn ?? "",
    nextCheckOn: record?.nextCheckOn ?? "",
  };
}
export function parseSalesCheckDraft(
  draft: SalesCheckDraft,
  idempotencyKey: string,
): RecordSalesCheckRequest {
  return recordSalesCheckRequestSchema.parse({
    ...draft,
    ...Object.fromEntries(
      salesCheckFields.map((field) => [field, draft[field] === "" ? null : draft[field]]),
    ),
    inputSource: "official_page_human_checked",
    idempotencyKey,
  });
}

// Keep an ambiguous submission through component/SKU switches. Never create a new key for a retry.
const pending = new Map<string, RecordSalesCheckRequest>();
export function pendingSalesCheck(path: string): RecordSalesCheckRequest | undefined {
  return pending.get(path);
}
export function rememberSalesCheck(path: string, input: RecordSalesCheckRequest) {
  pending.set(path, input);
}
export function completeSalesCheck(path: string, key: string) {
  if (pending.get(path)?.idempotencyKey === key) pending.delete(path);
}
