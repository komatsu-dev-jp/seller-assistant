import { describe, expect, it } from "vitest";

import {
  describeReviewRecipes,
  readReviewRecipes,
  reviewRecipeKey,
  toggleReviewRecipe,
  writeReviewRecipes,
} from "./review-recipe-store";

describe("confirmation-only photo recipe", () => {
  it("starts without a recipe and ignores unknown saved values", () => {
    expect(readReviewRecipes({ getItem: () => null })).toEqual([]);
    expect(readReviewRecipes({ getItem: () => "unknown" })).toEqual([]);
  });

  it("stores a front recipe and a detail recipe for the next page", () => {
    const saved = new Map<string, string>();
    const storage = {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => void saved.set(key, value),
    };

    const selected = toggleReviewRecipe(toggleReviewRecipe([], "front-only"), "details");
    writeReviewRecipes(storage, selected);

    expect(saved.get(reviewRecipeKey)).toBe('["front-only","details"]');
    expect(readReviewRecipes(storage)).toEqual(["front-only", "details"]);
    expect(describeReviewRecipes(selected)).toBe("正面だけ、タグ・気になる箇所");
  });

  it("switches between the two main-photo recipes without removing the detail recipe", () => {
    expect(toggleReviewRecipe(["front-back", "details"], "front-only")).toEqual([
      "front-only",
      "details",
    ]);
    expect(toggleReviewRecipe(["front-only", "details"], "details")).toEqual(["front-only"]);
    expect(readReviewRecipes({ getItem: () => '["front-back","front-only","details"]' })).toEqual([
      "front-only",
      "details",
    ]);
  });
});
