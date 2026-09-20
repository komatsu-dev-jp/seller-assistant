export type SalesCheckVisualKind =
  | "catalogTote"
  | "catalogWallet"
  | "catalogShoe"
  | "catalogBackpack"
  | "catalogShirt"
  | "catalogPants";

export type SalesCheckItem = {
  id: string;
  name: string;
  channel: string;
  checkedAt: string;
  kind: SalesCheckVisualKind;
  initialDraft: SalesCheckDraft;
};

export type SalesCheckDraft = {
  listingDays: string;
  currentPrice: string;
  views: string;
  searches: string;
  likes: string;
  priceRequests: string;
  recordedAt: string;
  source: string;
  nextCheckAt: string;
};

export type SalesCheckDraftField = keyof SalesCheckDraft;
export type SalesCheckDrafts = Record<string, SalesCheckDraft>;

export const SALES_CHECK_REFERENCE_DATE = "2025-05-20";

export const SALES_CHECK_ITEMS: readonly SalesCheckItem[] = [
  {
    id: "ITM-0004",
    name: "リュックサック（ブラック）",
    channel: "販売先B",
    checkedAt: "2025-05-17",
    kind: "catalogBackpack",
    initialDraft: {
      listingDays: "24",
      currentPrice: "6480",
      views: "",
      searches: "",
      likes: "",
      priceRequests: "",
      recordedAt: "2025-05-17",
      source: "本人が公式ページで確認",
      nextCheckAt: "2025-05-22",
    },
  },
  {
    id: "ITM-0006",
    name: "ワイドパンツ（カーキ）",
    channel: "販売先B",
    checkedAt: "2025-05-15",
    kind: "catalogPants",
    initialDraft: {
      listingDays: "35",
      currentPrice: "4280",
      views: "132",
      searches: "58",
      likes: "7",
      priceRequests: "3",
      recordedAt: "2025-05-20",
      source: "本人が公式ページで確認",
      nextCheckAt: "2025-05-25",
    },
  },
  {
    id: "ITM-0002",
    name: "コンパクト財布（ネイビー）",
    channel: "販売先B",
    checkedAt: "2025-05-18",
    kind: "catalogWallet",
    initialDraft: {
      listingDays: "18",
      currentPrice: "3280",
      views: "",
      searches: "",
      likes: "",
      priceRequests: "",
      recordedAt: "2025-05-18",
      source: "本人が公式ページで確認",
      nextCheckAt: "2025-05-23",
    },
  },
  {
    id: "ITM-0003",
    name: "メッシュスニーカー（ホワイト）",
    channel: "販売先A",
    checkedAt: "2025-05-19",
    kind: "catalogShoe",
    initialDraft: {
      listingDays: "12",
      currentPrice: "5980",
      views: "",
      searches: "",
      likes: "",
      priceRequests: "",
      recordedAt: "2025-05-19",
      source: "本人が公式ページで確認",
      nextCheckAt: "2025-05-24",
    },
  },
  {
    id: "ITM-0001",
    name: "ライトトートバッグ（グレー）",
    channel: "販売先A",
    checkedAt: "2025-05-20",
    kind: "catalogTote",
    initialDraft: {
      listingDays: "8",
      currentPrice: "4580",
      views: "",
      searches: "",
      likes: "",
      priceRequests: "",
      recordedAt: "2025-05-20",
      source: "本人が公式ページで確認",
      nextCheckAt: "2025-05-25",
    },
  },
  {
    id: "ITM-0005",
    name: "リネンシャツ（ベージュ）",
    channel: "販売先A",
    checkedAt: "2025-05-16",
    kind: "catalogShirt",
    initialDraft: {
      listingDays: "27",
      currentPrice: "2980",
      views: "",
      searches: "",
      likes: "",
      priceRequests: "",
      recordedAt: "2025-05-16",
      source: "本人が公式ページで確認",
      nextCheckAt: "2025-05-21",
    },
  },
] as const;

export function orderSalesCheckItems<T extends { checkedAt: string }>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => left.checkedAt.localeCompare(right.checkedAt));
}

export function getSalesCheckAge(
  checkedAt: string,
  referenceDate = SALES_CHECK_REFERENCE_DATE,
): string {
  const checked = Date.parse(`${checkedAt}T00:00:00Z`);
  const reference = Date.parse(`${referenceDate}T00:00:00Z`);
  if (!Number.isFinite(checked) || !Number.isFinite(reference) || checked > reference) {
    return "確認日を確認";
  }
  const days = Math.floor((reference - checked) / 86_400_000);
  return days === 0 ? "今日確認" : `${days}日未確認`;
}

export function createSalesCheckDrafts(items: readonly SalesCheckItem[]): SalesCheckDrafts {
  return Object.fromEntries(items.map((item) => [item.id, { ...item.initialDraft }]));
}

export function updateSalesCheckDraft(
  drafts: SalesCheckDrafts,
  itemId: string,
  field: SalesCheckDraftField,
  value: string,
): SalesCheckDrafts {
  const current = drafts[itemId];
  if (!current) return drafts;
  return {
    ...drafts,
    [itemId]: {
      ...current,
      [field]: value,
    },
  };
}
