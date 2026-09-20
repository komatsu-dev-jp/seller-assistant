const p0ErrorTranslations: Readonly<Record<string, string>> = {
  "The shipping assignee is not an active member":
    "発送担当には、チームに参加中の「発送担当」メンバーを指定してください。",
  "Dedicated measurement media cannot reuse another photo":
    "この商品ですでに使った写真は、別の採寸項目や掲載用写真には使えません。別の写真を選んでください。",
};

export function p0UserFacingErrorMessage(reason: unknown): string {
  if (!(reason instanceof Error)) return "操作を確認できませんでした。";
  return p0ErrorTranslations[reason.message] ?? reason.message;
}
