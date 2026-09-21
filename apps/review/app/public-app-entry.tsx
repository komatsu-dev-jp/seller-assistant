"use client";

import { useEffect } from "react";

import styles from "./review-home.module.css";

// Keep these paths root-relative. The static-export postprocessor adds the
// GitHub Pages base path once to both the HTML and the hydrated client bundle.
const mobileHome = "/mobile/screens/04/";
const pcHome = "/pc/2/";

export function PublicAppEntry() {
  useEffect(() => {
    const destination = window.matchMedia("(max-width: 900px)").matches ? mobileHome : pcHome;
    if (window.location.pathname !== destination) window.location.replace(destination);
  }, []);

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-live="polite">
        <div className={styles.logo} aria-hidden="true">
          ♙
        </div>
        <p className={styles.eyebrow}>フリマ物販業務アプリ</p>
        <h1>端末に合う画面を開いています</h1>
        <p className={styles.lead}>
          スマホではモバイル版、パソコンではPC版を自動で開きます。切り替わらない場合は下のボタンを押してください。
        </p>
        <div className={styles.actions}>
          <a className={styles.primary} href={mobileHome}>
            スマホ版を開く
          </a>
          <a className={styles.secondary} href={pcHome}>
            PC版を開く
          </a>
        </div>
        <small>
          この公開版は架空データで操作を確認します。実データ保存・外部API・有料サービスへの接続は行いません。
        </small>
      </section>
    </main>
  );
}
