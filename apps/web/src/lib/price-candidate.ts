export function formatPriceCandidate(rawValue: string): string | null {
  const compactValue = rawValue.normalize("NFKC").replaceAll(/\s/gu, "");
  const match = compactValue.match(/^(?:[¥￥])?((?:\d+)|(?:\d{1,3}(?:,\d{3})+))円?$/u);
  if (!match) {
    return null;
  }

  const digits = match[1]?.replaceAll(",", "") ?? "";
  const amount = Number(digits);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return null;
  }

  return `${amount.toLocaleString("ja-JP")}円`;
}
