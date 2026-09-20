export type PublishedProductPageDraftValidation =
  { ok: true; canonicalUrl: string } | { ok: false; message: string };

export function validatePublishedProductPageDraft(
  rawProductId: string,
  rawProductUrl: string,
): PublishedProductPageDraftValidation {
  const productId = rawProductId.trim();
  const productUrl = rawProductUrl.trim();
  if (!/^m[0-9]{9,20}$/u.test(productId)) {
    return { ok: false, message: "商品IDは、mから始まる数字を入力してください。" };
  }
  const canonicalUrl = `https://jp.mercari.com/item/${productId}`;
  if (productUrl !== canonicalUrl) {
    return {
      ok: false,
      message: `商品URLは ${canonicalUrl} と完全に同じか確認してください。`,
    };
  }
  return { ok: true, canonicalUrl };
}

export function publishedProductPageDraftFingerprint(
  productId: string,
  productUrl: string,
): string {
  return `${productId.trim()}\n${productUrl.trim()}`;
}
