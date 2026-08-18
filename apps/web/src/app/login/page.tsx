import { LoginForm } from "../../components/login-form";

export default function LoginPage() {
  return (
    <main className="loginPage">
      <section className="loginCard" aria-labelledby="login-title">
        <div className="loginBrand" aria-hidden="true">
          R<span>O</span>
        </div>
        <p className="eyebrow">RESALE OPERATIONS</p>
        <h1 id="login-title">業務アプリへログイン</h1>
        <p className="loginLead">
          パスワードは端末やURLへ保存せず、サーバーで元に戻せない形にして照合します。
        </p>
        <LoginForm />
        <p className="loginSafety">外部の有料ログインサービスは使用しません。</p>
      </section>
    </main>
  );
}
