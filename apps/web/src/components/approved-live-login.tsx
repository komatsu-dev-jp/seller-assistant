"use client";

import { useState, type FormEvent, type ReactNode } from "react";

import mobileStyles from "./approved-mobile/approved-mobile-demo.module.css";
import { PcCanvas } from "./approved-pc/pc-canvas";
import pcStyles from "./approved-pc/approved-pc-early-screens.module.css";
import { PcUiGlyph, pcNavGlyphs } from "./approved-pc/pc-ui-glyph";
import liveStyles from "./approved-live-login.module.css";

export type ApprovedLiveLoginProps = {
  email: string;
  password: string;
  error?: ReactNode;
  busy?: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: () => void;
};

const nav = ["ホーム", "作業", "仕入れ", "商品", "注文・発送", "在庫", "会計", "メンバー", "設定"];

function cn(...names: Array<string | false | undefined>): string {
  return names.filter(Boolean).join(" ");
}

function LoginHeroArt() {
  return (
    <div className={mobileStyles.loginHeroArt} aria-label="商品を確認するマーク">
      <span className={cn(mobileStyles.heroCorner, mobileStyles.heroCornerTl)} />
      <span className={cn(mobileStyles.heroCorner, mobileStyles.heroCornerTr)} />
      <span className={cn(mobileStyles.heroCorner, mobileStyles.heroCornerBl)} />
      <span className={cn(mobileStyles.heroCorner, mobileStyles.heroCornerBr)} />
      <svg viewBox="0 0 160 160" role="img" aria-hidden="true">
        <path
          d="M80 23c-8 0-13 5-13 12 0 6 4 9 10 11l3 1v7"
          fill="none"
          stroke="#0d2b55"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="4.5"
        />
        <path
          d="m80 49-24 15h48L80 49Z"
          fill="none"
          stroke="#0d2b55"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="4"
        />
        <path
          d="m57 62-16 8-12 17 10 18 15-9 3 28h46l3-28 15 9 10-18-12-17-16-8-11 10H68L57 62Z"
          fill="#0d2b55"
          stroke="#0d2b55"
          strokeLinejoin="round"
          strokeWidth="3"
        />
        <path
          d="m58 62 22 17 22-17M68 72l12 9 12-9"
          fill="none"
          stroke="#fff"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="4"
        />
        <circle cx="80" cy="94" r="3" fill="#fff" />
        <circle cx="80" cy="108" r="3" fill="#fff" />
        <circle cx="119" cy="41" r="11" fill="#f4a41b" />
      </svg>
    </div>
  );
}

function IOSStatusBar() {
  return (
    <div className={mobileStyles.statusBar} aria-hidden="true">
      <strong>9:41</strong>
      <span className={mobileStyles.dynamicIsland} />
      <span className={mobileStyles.statusBarRight}>
        <i className={mobileStyles.signalIcon} />
        <i className={mobileStyles.wifiIcon}>⌁</i>
        <i className={mobileStyles.batteryIcon}>77</i>
      </span>
    </div>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3.5" y="5.5" width="17" height="13" rx="1.8" />
      <path d="m4.7 7 7.3 5.8L19.3 7" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4.5" y="10" width="15" height="10" rx="2" />
      <path d="M8 10V7.7a4 4 0 0 1 8 0V10" />
      <circle cx="12" cy="14.5" r="1.2" />
      <path d="M12 15.7v1.6" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2.5 12s3.4-5.5 9.5-5.5S21.5 12 21.5 12 18.1 17.5 12 17.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  );
}

function MobileLoginInput({
  label,
  value,
  type,
  icon,
  onChange,
  onTogglePassword,
  passwordVisible,
}: {
  label: string;
  value: string;
  type: "email" | "password" | "text";
  icon: "mail" | "lock";
  onChange: (value: string) => void;
  onTogglePassword?: (() => void) | undefined;
  passwordVisible?: boolean | undefined;
}) {
  const password = icon === "lock";
  return (
    <label className={mobileStyles.loginInput}>
      <span className={mobileStyles.loginInputIcon} aria-hidden="true">
        {icon === "mail" ? <MailIcon /> : <LockIcon />}
      </span>
      <input
        type={type}
        name={password ? "password" : "email"}
        value={value}
        aria-label={label}
        placeholder={label}
        inputMode={password ? undefined : "email"}
        autoComplete={password ? "current-password" : "username"}
        minLength={password ? 12 : undefined}
        maxLength={password ? 128 : 254}
        required
        onChange={(event) => onChange(event.target.value)}
      />
      {password ? (
        <button
          type="button"
          className={cn(mobileStyles.passwordEye, liveStyles.passwordToggle)}
          aria-label={passwordVisible ? "パスワードを隠す" : "パスワードを表示"}
          aria-pressed={passwordVisible}
          onClick={onTogglePassword}
        >
          <EyeIcon />
        </button>
      ) : null}
    </label>
  );
}

function LoginError({ children }: { children: ReactNode }) {
  return (
    <p className={liveStyles.error} role="alert" aria-live="assertive">
      {children}
    </p>
  );
}

function MobileLogin(props: ApprovedLiveLoginProps) {
  const [showPassword, setShowPassword] = useState(false);
  return (
    <div className={liveStyles.mobile} aria-label="モバイル 01 ログイン">
      <main className={mobileStyles.page}>
        <div className={mobileStyles.phoneShell}>
          <IOSStatusBar />
          <div className={mobileStyles.scrollArea}>
            <form
              action="/v1/session/login"
              method="post"
              className={mobileStyles.loginContent}
              aria-busy={props.busy}
              onSubmit={(event) => handleSubmit(event, props)}
            >
              <h1 className={liveStyles.srOnly}>ログイン</h1>
              <div className={mobileStyles.loginLogo}>
                <LoginHeroArt />
              </div>
              <div className={mobileStyles.loginForm}>
                <MobileLoginInput
                  label="メールアドレス"
                  value={props.email}
                  type="email"
                  icon="mail"
                  onChange={props.onEmailChange}
                />
                <MobileLoginInput
                  label="パスワード"
                  value={props.password}
                  type={showPassword ? "text" : "password"}
                  icon="lock"
                  onChange={props.onPasswordChange}
                  onTogglePassword={() => setShowPassword((current) => !current)}
                  passwordVisible={showPassword}
                />
              </div>
              {props.error ? <LoginError>{props.error}</LoginError> : null}
              <button
                className={cn(
                  mobileStyles.loginButton,
                  liveStyles.buttonReset,
                  liveStyles.mobileSubmit,
                )}
                type="submit"
                disabled={props.busy}
              >
                {props.busy ? "確認中…" : "ログイン"}
              </button>
              <div className={mobileStyles.loginSafety}>安全に作業を始めます</div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}

function PcTop() {
  return (
    <header className={pcStyles.top}>
      <div className={pcStyles.title}>
        <b>01</b>
        <h1>ログイン</h1>
      </div>
      <label className={pcStyles.search} aria-label="検索">
        ⌕ <span>商品名・作業・注文を検索</span>
      </label>
      <span className={pcStyles.help} aria-label="ヘルプ">
        <PcUiGlyph name="help" />
      </span>
      <span className={pcStyles.bell} aria-label="通知">
        <PcUiGlyph name="bell" />
      </span>
      <span className={pcStyles.user}>
        <PcUiGlyph name="user" />
        未ログイン
      </span>
    </header>
  );
}

function PcSide() {
  return (
    <aside className={pcStyles.side} aria-hidden="true" inert>
      {nav.map((label, index) => (
        <a
          href="/login"
          aria-disabled="true"
          onClick={(event) => event.preventDefault()}
          key={label}
        >
          <i>
            <PcUiGlyph name={pcNavGlyphs[index] ?? "home"} />
          </i>
          {label}
        </a>
      ))}
    </aside>
  );
}

function PcLogin(props: ApprovedLiveLoginProps) {
  return (
    <div className={liveStyles.pc} aria-label="PC 01 ログイン">
      <PcCanvas className={`${pcStyles.app} ${pcStyles.legacyApp}`}>
        <PcTop />
        <PcSide />
        <section className={pcStyles.frame}>
          <div className={pcStyles.loginWrap}>
            <form
              action="/v1/session/login"
              method="post"
              className={`${pcStyles.card} ${pcStyles.login}`}
              aria-busy={props.busy}
              onSubmit={(event) => handleSubmit(event, props)}
            >
              <div className={pcStyles.loginLogo}>
                <img
                  className={pcStyles.loginLogoAsset}
                  src="/approved-assets/pc-fidelity/login/logo-blue-garment.png"
                  alt="衣類の青いロゴ"
                />
              </div>
              <label>
                メールアドレス
                <input
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="username"
                  value={props.email}
                  maxLength={254}
                  placeholder="メールアドレスを入力"
                  required
                  onChange={(event) => props.onEmailChange(event.target.value)}
                />
              </label>
              <label>
                パスワード
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={props.password}
                  minLength={12}
                  maxLength={128}
                  placeholder="パスワードを入力"
                  required
                  onChange={(event) => props.onPasswordChange(event.target.value)}
                />
              </label>
              {props.error ? <LoginError>{props.error}</LoginError> : null}
              <button
                className={cn(pcStyles.primary, liveStyles.buttonReset)}
                type="submit"
                disabled={props.busy}
              >
                {props.busy ? "確認中…" : "ログイン"}
              </button>
              <small>PC内の業務データへ安全に入ります</small>
            </form>
          </div>
        </section>
      </PcCanvas>
    </div>
  );
}

function handleSubmit(event: FormEvent<HTMLFormElement>, props: ApprovedLiveLoginProps) {
  event.preventDefault();
  if (!props.busy) props.onSubmit();
}

export function ApprovedLiveLogin(props: ApprovedLiveLoginProps) {
  return (
    <div className={liveStyles.page} data-approved-live-login="v2">
      <MobileLogin {...props} />
      <PcLogin {...props} />
    </div>
  );
}

export default ApprovedLiveLogin;
