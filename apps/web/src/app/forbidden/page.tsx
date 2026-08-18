import { LogoutButton } from "../../components/logout-button";

export default function ForbiddenPage() {
  return (
    <main className="loginShell">
      <section className="loginCard" aria-labelledby="forbidden-heading">
        <p className="eyebrow">ACCESS LIMITED</p>
        <h1 id="forbidden-heading">この画面は担当外です</h1>
        <p>原価・利益・全在庫は、オーナーまたは在庫責任者だけが確認できます。</p>
        <a className="primaryButton" href="/mobile">
          今日の担当作業へ戻る
        </a>
        <LogoutButton />
      </section>
    </main>
  );
}
