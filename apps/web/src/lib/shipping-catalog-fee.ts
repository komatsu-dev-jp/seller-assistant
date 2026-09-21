/** A blank shipping fee is unknown, not an explicit free-shipping amount. */
export function parseShippingCatalogFee(input: string): number {
  const value = input.trim();
  if (value.length === 0) {
    throw new Error("送料を入力してください。無料の場合は0を入力してください。");
  }
  const fee = Number(value);
  if (!/^\d+$/u.test(value) || !Number.isSafeInteger(fee) || fee < 0) {
    throw new Error("送料は0円以上の安全な範囲の整数で入力してください。");
  }
  return fee;
}
