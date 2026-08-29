import Link from "next/link";

import styles from "./review-home.module.css";

export default function ReviewHomePage() {
  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div className={styles.logo} aria-hidden="true">
          ♙
        </div>
        <p className={styles.eyebrow}>承認デザイン確認用</p>
        <h1>表示する画面を選んでください</h1>
        <p className={styles.lead}>
          スマホではモバイル版、パソコンではPC版を開くと、承認済みの全画面を順番に確認できます。
        </p>
        <div className={styles.actions}>
          <Link className={styles.primary} href="/mobile/screens/04">
            モバイル版を開く
          </Link>
          <Link className={styles.secondary} href="/pc/2">
            PC版を開く
          </Link>
        </div>
        <small>外部APIや有料サービスには接続しません。</small>
      </section>
    </main>
  );
}
