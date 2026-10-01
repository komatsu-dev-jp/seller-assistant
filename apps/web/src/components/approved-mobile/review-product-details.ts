// Synthetic product information shared by the preparation page and product list.
export const conditionOptions = [
  ["S", "S · 新品・未使用"],
  ["A", "A · 使用感が少ない"],
  ["B+", "B+ · 一般的な中古品"],
  ["B-", "B- · 小さな汚れあり"],
  ["C", "C · 使用感・目立つ汚れあり"],
] as const;

export type ProductDetails = {
  name: string;
  brand: string;
  size: string;
  color: string;
  material: string;
  design: string;
  season: string;
  condition: string;
  note: string;
};

export function sampleProductDetails(): ProductDetails {
  return {
    name: "確認用シャツ",
    brand: "CleanStyle",
    size: "M",
    color: "ネイビー",
    material: "綿100%",
    design: "",
    season: "",
    condition: "",
    note: "",
  };
}

export function validateProductDetails(value: unknown): ProductDetails {
  if (!value || typeof value !== "object") throw new Error("商品情報を読み取れません。");
  const fields = Object.keys(sampleProductDetails()) as (keyof ProductDetails)[];
  const data = value as ProductDetails;
  if (
    !fields.every(
      (key) => typeof data[key] === "string" && data[key].length <= (key === "note" ? 1000 : 120),
    ) ||
    (data.condition !== "" && !conditionOptions.some(([key]) => key === data.condition))
  ) {
    throw new Error("商品情報を読み取れません。保存済みの内容は上書きしていません。");
  }
  return Object.fromEntries(fields.map((key) => [key, data[key]])) as ProductDetails;
}
