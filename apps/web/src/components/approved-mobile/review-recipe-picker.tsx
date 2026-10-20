"use client";

import { useEffect, useState } from "react";
import {
  describeReviewRecipes,
  readReviewRecipes,
  toggleReviewRecipe,
  writeReviewRecipes,
  type ReviewRecipe,
} from "./review-recipe-store";
import { reviewPath } from "./review-path";
import styles from "./approved-mobile-demo.module.css";

const basePath = process.env.NEXT_PUBLIC_REVIEW_BASE_PATH ?? "";

const options = [
  { id: "front-back", label: "正面・背面", detail: "白背景／中央／余白" },
  { id: "front-only", label: "正面だけ", detail: "ブランド左上・サイズ右下" },
  { id: "details", label: "タグ・気になる箇所", detail: "向き／明るさのみ" },
] as const;

export function ReviewRecipePicker() {
  const [selected, setSelected] = useState<ReviewRecipe[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const load = () => {
    try {
      setSelected(readReviewRecipes(window.localStorage));
      setError("");
      setReady(true);
    } catch {
      setReady(false);
      setError("保存内容を読み込めません。端末の保存設定を確認して再試行してください。");
    }
  };
  useEffect(() => {
    load();
  }, []);
  const select = (recipe: ReviewRecipe) => {
    if (!ready) return;
    try {
      // Use the latest browser value so another tab's selection is not silently lost.
      const next = toggleReviewRecipe(readReviewRecipes(window.localStorage), recipe);
      writeReviewRecipes(window.localStorage, next);
      setSelected(next);
      setError("");
    } catch {
      setError("選択を保存できませんでした。端末の保存設定を確認して再度お試しください。");
    }
  };
  return (
    <section className={styles.contentStack} data-shared-recipe>
      <p className={styles.boardInstruction}>役割ごとに適したレシピを選択してください</p>
      <div className={styles.recipeList}>
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`${styles.recipeOption} ${selected.includes(option.id) ? styles.recipeOptionSelected : ""}`}
            aria-pressed={selected.includes(option.id)}
            disabled={!ready}
            onClick={() => select(option.id)}
          >
            <span className={styles.recipeOptionVisual}>
              {option.id === "details" ? (
                <span className={styles.recipePhotoPair}>
                  <img
                    className={styles.recipeAsset}
                    src={reviewPath("/approved-assets/product/brand-tag.png", basePath)}
                    alt="ブランドタグ"
                  />
                  <img
                    className={styles.recipeAsset}
                    src={reviewPath("/approved-assets/product/defect-detail.png", basePath)}
                    alt="気になる箇所"
                  />
                </span>
              ) : (
                <img
                  className={styles.recipeAsset}
                  src={reviewPath(
                    "/approved-assets/mobile-fidelity/short-sleeve-front.png",
                    basePath,
                  )}
                  alt={`${option.label}の編集例`}
                />
              )}
            </span>
            <span>
              <strong>{option.label}</strong>
              <small>{option.detail}</small>
            </span>
            <span className={styles.recipeOptionCheck} aria-hidden="true">
              {selected.includes(option.id) ? "✓" : ""}
            </span>
          </button>
        ))}
      </div>
      {error ? (
        <p role="alert">
          {error}
          <button type="button" onClick={load}>
            読み込みを再試行
          </button>
        </p>
      ) : null}
      <div className={styles.recipeInfoBlue} role="status">
        {!ready
          ? "保存内容を確認中…"
          : selected.length
            ? `選択中：${describeReviewRecipes(selected)}。このブラウザーに保存しました。`
            : "レシピを選んでください。編集せず進むこともできます。"}
      </div>
    </section>
  );
}
