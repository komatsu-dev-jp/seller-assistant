import { measurementLabels, validMeasurement, type ReviewState } from "./local-review-store";
import { conditionOptions, sampleProductDetails } from "./review-product-details";

export function descriptionProblems(state: ReviewState): string[] {
  const details = state.details ?? sampleProductDetails();
  const problems: string[] = [];
  if (!details.name.trim()) problems.push("商品名を入力してください。");
  if (!details.condition) problems.push("商品の状態を選んでください。");
  state.measurements.forEach((value, i) => {
    if (value !== "" && !validMeasurement(value))
      problems.push(`${measurementLabels[i]}は0より大きく300cm以下の数値で入力してください。`);
  });
  return problems;
}

export function buildReviewDescription(state: ReviewState): string {
  const d = state.details ?? sampleProductDetails();
  const condition = conditionOptions.find(([key]) => key === d.condition)?.[1].split(" · ")[1];
  const entries = [
    ["ブランド", d.brand],
    ["サイズ", d.size],
    ["カラー", d.color],
    ["素材", d.material],
    ["柄・デザイン", d.design],
    ["季節感", d.season],
    ["状態", condition ?? ""],
  ];
  const measures = state.measurements.flatMap((value, i) =>
    validMeasurement(value) ? [`${measurementLabels[i]}：${value}cm`] : [],
  );
  return [
    "【操作確認用の見本文です。実際には出品しないでください】",
    d.name.trim(),
    "",
    "【商品詳細】",
    ...entries
      .filter(([, value]) => value!.trim())
      .map(([label, value]) => `${label}：${value!.trim()}`),
    ...(measures.length ? ["", "【平置き採寸】", ...measures] : []),
    ...(state.inspection.includes("issue")
      ? [
          "",
          "【気になる箇所】",
          [state.issue.location, state.issue.kind, state.issue.note].filter(Boolean).join(" / "),
        ]
      : []),
    ...(d.note.trim() ? ["", d.note.trim()] : []),
  ].join("\n");
}

export const preparationScreenIds = [
  "29",
  "30",
  "31",
  "photo-01",
  "photo-02",
  "photo-03",
  "photo-06",
  "photo-07",
] as const;
export function isProductPreparationScreen(id: string): boolean {
  return (preparationScreenIds as readonly string[]).includes(id);
}
