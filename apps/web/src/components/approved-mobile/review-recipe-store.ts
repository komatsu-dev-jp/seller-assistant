export const reviewRecipeKey = "seller-assistant:review:REVIEW-0001:photo-recipe";

export const reviewRecipes = {
  "front-back": "正面・背面",
  "front-only": "正面だけ",
  details: "タグ・気になる箇所",
} as const;

export type ReviewRecipe = keyof typeof reviewRecipes;
const recipeOrder: readonly ReviewRecipe[] = ["front-back", "front-only", "details"];

function isReviewRecipe(value: unknown): value is ReviewRecipe {
  return typeof value === "string" && Object.hasOwn(reviewRecipes, value);
}

export function readReviewRecipes(storage: Pick<Storage, "getItem">): ReviewRecipe[] {
  const value = storage.getItem(reviewRecipeKey);
  if (!value) return [];
  if (isReviewRecipe(value)) return [value];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    const valid = parsed.filter(isReviewRecipe);
    const main = valid.includes("front-only") ? "front-only" : "front-back";
    return recipeOrder.filter(
      (recipe) => valid.includes(recipe) && (recipe === "details" || recipe === main),
    );
  } catch {
    return [];
  }
}

export function toggleReviewRecipe(
  selected: readonly ReviewRecipe[],
  target: ReviewRecipe,
): ReviewRecipe[] {
  if (selected.includes(target)) return selected.filter((recipe) => recipe !== target);
  const remaining =
    target === "details" ? selected : selected.filter((recipe) => recipe === "details");
  return recipeOrder.filter((recipe) => recipe === target || remaining.includes(recipe));
}

export function writeReviewRecipes(
  storage: Pick<Storage, "setItem">,
  selected: readonly ReviewRecipe[],
): void {
  storage.setItem(reviewRecipeKey, JSON.stringify(selected));
}

export function describeReviewRecipes(selected: readonly ReviewRecipe[]): string {
  return selected.map((recipe) => reviewRecipes[recipe]).join("、");
}
