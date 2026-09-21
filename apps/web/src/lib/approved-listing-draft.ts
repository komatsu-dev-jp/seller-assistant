export const APPROVED_PC_LISTING_DESCRIPTION =
  "サンプルブランドのオックスフォードシャツです。\n爽やかなライトブルーのカラーで、幅広いコーディネートに合わせやすいベーシックなデザインです。\n\n程よい厚みの綿100%生地で、通年でご着用いただけます。\nカジュアルからきれいめまで活躍する一枚です。\n\n【ブランド】サンプルブランド\n【サイズ】M\n【カラー】ライトブルー\n【素材】綿100%\n\n【実寸（cm）】\n着丈 72.5 / 肩幅 45.0 / 身幅54.0 / 袖丈61.0 / 裄丈83.5\n\n【状態】\n目立つ汚れやダメージはなく、全体的にきれいな状態です。";

const APPROVED_PC_LISTING_DRAFT_KEY = "resale-ops:approved-pc:listing-draft:v1";
const APPROVED_PC_LISTING_ITEM_KEY = "approved-sample-shirt";

type DraftStorage = Pick<Storage, "getItem" | "setItem">;

export type ApprovedPcListingDraft = Readonly<{
  description: string;
  note: string;
}>;

export function getApprovedPcListingStorage(): DraftStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function readApprovedPcListingDraft(
  storage: DraftStorage | null | undefined,
): ApprovedPcListingDraft | null {
  return loadApprovedPcListingDraft(storage).draft;
}

export function loadApprovedPcListingDraft(
  storage: DraftStorage | null | undefined,
):
  | { status: "read"; draft: ApprovedPcListingDraft | null }
  | { status: "unavailable"; draft: null } {
  if (!storage) return { status: "unavailable", draft: null };
  let saved: string | null;
  try {
    saved = storage.getItem(APPROVED_PC_LISTING_DRAFT_KEY);
  } catch {
    return { status: "unavailable", draft: null };
  }
  if (!saved) return { status: "read", draft: null };

  try {
    const value: unknown = JSON.parse(saved);
    if (
      typeof value !== "object" ||
      value === null ||
      !("version" in value) ||
      value.version !== 1 ||
      !("itemKey" in value) ||
      value.itemKey !== APPROVED_PC_LISTING_ITEM_KEY ||
      !("description" in value) ||
      typeof value.description !== "string" ||
      !("note" in value) ||
      typeof value.note !== "string"
    ) {
      return { status: "read", draft: null };
    }

    return { status: "read", draft: { description: value.description, note: value.note } };
  } catch {
    return { status: "read", draft: null };
  }
}

export function writeApprovedPcListingDraft(
  storage: DraftStorage | null | undefined,
  draft: ApprovedPcListingDraft,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(
      APPROVED_PC_LISTING_DRAFT_KEY,
      JSON.stringify({
        version: 1,
        itemKey: APPROVED_PC_LISTING_ITEM_KEY,
        description: draft.description,
        note: draft.note,
      }),
    );
    return true;
  } catch {
    return false;
  }
}
