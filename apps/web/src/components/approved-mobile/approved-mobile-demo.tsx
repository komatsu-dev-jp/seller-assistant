"use client";

import { useState, type ReactNode } from "react";

import {
  getMobileNext,
  getMobilePrevious,
  getMobileScreen,
  getMobileScreenIndex,
  mobileScreens,
  type MobileScreen,
} from "./mobile-screen-data";
import styles from "./approved-mobile-demo.module.css";

type Choice = "first" | "second" | "third" | "none";

function cn(...names: Array<string | false | undefined>): string {
  return names.filter(Boolean).join(" ");
}

function Logo({ small = false }: { small?: boolean }) {
  return (
    <span className={cn(styles.logo, small && styles.logoSmall)} aria-label="C採用">
      <span className={styles.logoLens} />
      <b>C</b>
    </span>
  );
}

function LoginHeroArt() {
  return (
    <div className={styles.loginHeroArt} aria-label="商品を確認するマーク">
      <span className={cn(styles.heroCorner, styles.heroCornerTl)} />
      <span className={cn(styles.heroCorner, styles.heroCornerTr)} />
      <span className={cn(styles.heroCorner, styles.heroCornerBl)} />
      <span className={cn(styles.heroCorner, styles.heroCornerBr)} />
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

function CheckMark({ tone = "blue" }: { tone?: "blue" | "green" | "amber" }) {
  return <span className={cn(styles.checkMark, styles[`check${tone}`])}>✓</span>;
}

function AssetImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string | undefined;
}) {
  return <img className={cn(styles.assetPhoto, className)} src={src} alt={alt} />;
}

function GarmentArt({
  kind = "shirt",
  marked = false,
  tone = "default",
}: {
  kind?: "shirt" | "coat" | "pants" | "bag";
  marked?: boolean;
  tone?: "default" | "beige";
}) {
  if (kind === "bag") {
    return (
      <div className={styles.artStage}>
        <svg className={styles.bagArt} viewBox="0 0 180 150" role="img" aria-label="架空のバッグ">
          <path d="M31 53h118l-8 74H39z" fill="#c58b59" />
          <path
            d="M58 55c0-40 64-40 64 0"
            fill="none"
            stroke="#6e4934"
            strokeWidth="9"
            strokeLinecap="round"
          />
          <path d="M48 76h84M45 98h90" stroke="#e9c39b" strokeWidth="4" opacity=".8" />
        </svg>
        {marked ? (
          <span className={styles.marker} style={{ left: "61%", top: "46%" }}>
            1
          </span>
        ) : null}
      </div>
    );
  }

  const coat = kind === "coat";
  const pants = kind === "pants";
  return (
    <div className={styles.artStage}>
      <svg
        className={cn(styles.garmentArt, coat && styles.coatArt, pants && styles.pantsArt)}
        viewBox="0 0 180 190"
        role="img"
        aria-label={coat ? "架空のアウター" : pants ? "架空のパンツ" : "架空のシャツ"}
      >
        {pants ? (
          <path d="M49 18h82l14 143-43 0-12-76-12 76-43 0z" fill="#415b87" />
        ) : (
          <>
            <path
              d="M64 21 31 43 11 94l27 16 14-39 2 103h72l2-103 14 39 27-16-20-51-33-22c-8 9-16 14-26 14s-18-5-26-14z"
              fill={coat ? (tone === "beige" ? "#d2bea2" : "#55738e") : "#274d77"}
            />
            <path
              d="M90 34v121M66 61l24 17 24-17"
              fill="none"
              stroke="#b8d1e7"
              strokeWidth="3"
              opacity=".7"
            />
            <path d="M81 22c1 9 4 15 9 17 5-2 8-8 9-17" fill="#e6b891" />
          </>
        )}
        <path d="M47 111h86" stroke="#c8daea" strokeWidth="2" opacity=".65" />
        {marked ? (
          <circle cx="119" cy="88" r="10" fill="#ffb547" stroke="#fff" strokeWidth="4" />
        ) : null}
      </svg>
      {marked ? (
        <span className={styles.marker} style={{ left: "64%", top: "43%" }}>
          1
        </span>
      ) : null}
    </div>
  );
}

function Barcode({ label = "0128" }: { label?: string }) {
  const bars = [2, 1, 3, 1, 1, 2, 4, 1, 2, 3, 1, 1, 3, 2, 1, 4, 2, 1, 2, 3, 1, 2, 4, 1];
  return (
    <div className={styles.barcodeWrap} aria-label={`在庫番号 ${label}`}>
      <div className={styles.barcodeBars}>
        {bars.map((width, index) => (
          <i style={{ width: `${width}px` }} key={`${label}-${index}`} />
        ))}
      </div>
      <small>{label}</small>
    </div>
  );
}

function ShelfArt({ highlight = false }: { highlight?: boolean }) {
  return (
    <div className={styles.shelfArt} aria-label="洋室Aの棚写真">
      <div className={styles.shelfBeam} />
      <div className={styles.shelfBeam} />
      {["A-1", "A-2", "A-3"].map((label, index) => (
        <div
          className={cn(styles.shelfBox, highlight && index === 1 && styles.shelfBoxSelected)}
          key={label}
        >
          <span>{label}</span>
        </div>
      ))}
      <small>洋室A · 棚02 · 段3</small>
    </div>
  );
}

function CameraFrame({
  kind = "shirt",
  measure = false,
  assetSrc,
  showCorners = true,
  showHint = true,
}: {
  kind?: "shirt" | "coat" | "pants" | "bag";
  measure?: boolean;
  assetSrc?: string | undefined;
  showCorners?: boolean;
  showHint?: boolean;
}) {
  return (
    <div className={styles.cameraFrame}>
      {showCorners ? (
        <>
          <span className={cn(styles.corner, styles.cornerTl)} />
          <span className={cn(styles.corner, styles.cornerTr)} />
          <span className={cn(styles.corner, styles.cornerBl)} />
          <span className={cn(styles.corner, styles.cornerBr)} />
        </>
      ) : null}
      {assetSrc ? (
        <AssetImage src={assetSrc} alt="撮影中の商品" className={styles.cameraAsset} />
      ) : (
        <GarmentArt kind={kind} marked={!measure} />
      )}
      {measure ? (
        <span className={styles.measureLine}>
          <b>54 cm</b>
        </span>
      ) : null}
      {showHint ? (
        <span className={styles.cameraHint}>
          {measure ? "身幅を合わせる" : "商品を枠に合わせる"}
        </span>
      ) : null}
    </div>
  );
}

function PhotoTile({
  label,
  active = false,
  kind = "shirt",
  empty = false,
  assetSrc,
  issueMarker = false,
}: {
  label: string;
  active?: boolean;
  kind?: "shirt" | "coat" | "pants" | "bag";
  empty?: boolean;
  assetSrc?: string | undefined;
  issueMarker?: boolean;
}) {
  return (
    <div
      className={cn(
        styles.photoTile,
        active && styles.photoTileActive,
        empty && styles.photoTileEmpty,
      )}
    >
      {empty ? (
        <span className={styles.photoPlus}>＋</span>
      ) : assetSrc ? (
        <AssetImage src={assetSrc} alt={label} />
      ) : (
        <GarmentArt kind={kind} />
      )}
      {issueMarker ? <span className={styles.photoIssueMarker} aria-hidden="true" /> : null}
      <small>{label}</small>
      {active ? <CheckMark tone="green" /> : null}
    </div>
  );
}

function IssuePhoto({ number, src, alt }: { number: string; src: string; alt: string }) {
  return (
    <div className={styles.issuePhotoTile}>
      <AssetImage src={src} alt={alt} className={styles.issuePhotoAsset} />
      <span>{number}</span>
    </div>
  );
}

function HistoryEntry({
  date,
  detail,
  status,
  tone,
}: {
  date: string;
  detail: string;
  status: string;
  tone: "blue" | "green" | "amber";
}) {
  const statusToneClass = {
    blue: styles.historyStatusBlue,
    green: styles.historyStatusGreen,
    amber: styles.historyStatusAmber,
  }[tone];

  return (
    <div className={styles.historyEntry}>
      <div className={styles.historyEntryCopy}>
        <span>{date}</span>
        <strong>{detail}</strong>
        <small>作成者：担当者</small>
      </div>
      <span className={cn(styles.historyStatus, statusToneClass)}>{status}</span>
      <span className={styles.chevron} aria-hidden="true">
        ›
      </span>
    </div>
  );
}

function ChoiceCard({
  label,
  detail,
  active,
  onClick,
  tone = "blue",
  visual,
  indicator = "check",
}: {
  label: string;
  detail: string;
  active: boolean;
  onClick: () => void;
  tone?: "blue" | "green" | "amber";
  visual?: ReactNode;
  indicator?: "check" | "radio";
}) {
  return (
    <button
      type="button"
      className={cn(
        styles.choiceCard,
        Boolean(visual) && styles.choiceCardWithVisual,
        active && styles.choiceCardActive,
        active && styles[`choice${tone}`],
      )}
      onClick={onClick}
      aria-pressed={active}
    >
      {visual ? <span className={styles.choiceVisual}>{visual}</span> : null}
      <span className={cn(styles.choiceRadio, indicator === "radio" && styles.choiceRadioDot)}>
        {active && indicator === "check" ? "✓" : ""}
      </span>
      <span>
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
      <span className={styles.chevron}>›</span>
    </button>
  );
}

function ShippingMethodRow({
  label,
  fee,
  active,
  onClick,
}: {
  label: string;
  fee: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(styles.shippingMethodRow, active && styles.shippingMethodRowActive)}
      aria-pressed={active}
      onClick={onClick}
    >
      <span className={styles.shippingMethodRadio} aria-hidden="true" />
      <strong>{label}</strong>
      <b>{fee}</b>
    </button>
  );
}

function RoleOption({
  label,
  detail,
  onClick,
}: {
  label: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className={styles.roleOption} onClick={onClick}>
      <span className={styles.personIcon} aria-hidden="true">
        <svg viewBox="0 0 28 28">
          <circle cx="14" cy="8" r="4.1" />
          <path d="M6.5 24c.7-5 3.2-7.5 7.5-7.5s6.8 2.5 7.5 7.5" />
        </svg>
      </span>
      <span>
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
    </button>
  );
}

function DataRow({
  label,
  value,
  tone = "plain",
  className,
}: {
  label: string;
  value: string;
  tone?: "plain" | "ok" | "review";
  className?: string | undefined;
}) {
  return (
    <div
      className={cn(
        styles.dataRow,
        tone === "ok" && styles.dataRowOk,
        tone === "review" && styles.dataRowReview,
        className,
      )}
    >
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function FooterIcon({ kind }: { kind: "home" | "work" | "product" | "inventory" | "accounting" }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {kind === "home" ? (
        <>
          <path d="m3.5 10 8.5-7 8.5 7v9.5H15v-5H9v5H3.5z" />
        </>
      ) : kind === "work" ? (
        <>
          <path d="m4 16 10.8-10.8 4 4L8 20H4z" />
          <path d="m13.5 6.5 4 4M4 20h5" />
        </>
      ) : kind === "product" ? (
        <>
          <path d="M4 6h7l2 2h7v11H4z" />
          <path d="M4 6v12M11 6v2" />
        </>
      ) : kind === "inventory" ? (
        <>
          <rect x="5" y="3.5" width="14" height="17" rx="1.5" />
          <path d="M8 8h8M8 12h8M8 16h5" />
        </>
      ) : (
        <>
          <rect x="4" y="4" width="16" height="16" rx="3" />
          <path d="M8 8h7M8 12h5M8 16h8" />
          <path d="M16 7.5v9" />
        </>
      )}
    </svg>
  );
}

function Footer({ screen }: { screen: MobileScreen }) {
  if (Number(screen.id) >= 1 && Number(screen.id) <= 3) return null;
  const number = Number(screen.id);
  const active: "home" | "work" | "product" | "accounting" =
    screen.id === "04"
      ? "home"
      : screen.flow !== "canonical" || (number >= 5 && number <= 38)
        ? "work"
        : number >= 39 && number <= 43
          ? "work"
          : number >= 44
            ? "accounting"
            : "work";
  return (
    <nav className={styles.footer} aria-label="モバイルナビゲーション">
      <a
        className={cn(active === "home" && styles.footerActive)}
        href="/mobile/screens/04"
        aria-current={active === "home" ? "page" : undefined}
      >
        <span>
          <FooterIcon kind="home" />
        </span>
        ホーム
      </a>
      <a
        className={cn(active === "work" && styles.footerActive)}
        href="/mobile/screens/05"
        aria-current={active === "work" ? "page" : undefined}
      >
        <span>
          <FooterIcon kind="work" />
        </span>
        作業
      </a>
      <a href="/mobile/screens/31">
        <span>
          <FooterIcon kind="product" />
        </span>
        商品
      </a>
      <a href="/mobile/screens/39">
        <span>
          <FooterIcon kind="inventory" />
        </span>
        在庫
      </a>
      <a
        className={cn(active === "accounting" && styles.footerActive)}
        href="/mobile/screens/44"
        aria-current={active === "accounting" ? "page" : undefined}
      >
        <span>
          <FooterIcon kind="accounting" />
        </span>
        会計
      </a>
    </nav>
  );
}

function Header({ screen, isFirst }: { screen: MobileScreen; isFirst: boolean }) {
  const isHome = screen.id === "04";
  const hideBack = ["02", "03", "04", "05", "06", "sales-01"].includes(screen.id);
  const showHelp = ["07", "08", "09", "10", "11"].includes(screen.id);
  const showQuestion = ["12", "13", "14", "15", "16"].includes(screen.id) || screen.flow === "box";
  const showBell =
    [
      "23",
      "24",
      "25",
      "26",
      "27",
      "28",
      "34",
      "35",
      "36",
      "37",
      "38",
      "39",
      "40",
      "41",
      "42",
      "43",
    ].includes(screen.id) || screen.id === "sales-01";
  return (
    <header className={cn(styles.header, isHome && styles.headerHome)}>
      {isHome ? null : hideBack ? (
        <span className={styles.headerSidePlaceholder} aria-hidden="true" />
      ) : (
        <a
          href={
            isFirst ? "/mobile/screens" : `/mobile/screens/${getMobilePrevious(screen.id) ?? "01"}`
          }
          aria-label="前の画面へ"
          className={styles.backButton}
        >
          ‹
        </a>
      )}
      <h1 className={styles.headerTitle}>{screen.title}</h1>
      {isHome ? (
        <svg className={styles.bellIcon} viewBox="0 0 24 24" aria-label="通知">
          <path d="M6.5 9.5a5.5 5.5 0 0 1 11 0v4l1.7 2.1H4.8l1.7-2.1v-4Z" />
          <path d="M9.5 18.1a2.8 2.8 0 0 0 5 0" />
        </svg>
      ) : showHelp ? (
        <span className={styles.headerHelp}>ヘルプ</span>
      ) : showQuestion ? (
        <span className={styles.headerQuestion}>?</span>
      ) : showBell ? (
        <svg className={styles.bellIcon} viewBox="0 0 24 24" aria-label="通知">
          <path d="M6.5 9.5a5.5 5.5 0 0 1 11 0v4l1.7 2.1H4.8l1.7-2.1v-4Z" />
          <path d="M9.5 18.1a2.8 2.8 0 0 0 5 0" />
        </svg>
      ) : (
        <span className={styles.headerPlaceholder} aria-hidden="true" />
      )}
    </header>
  );
}

function ActionBar({ screen, next }: { screen: MobileScreen; next: string | undefined }) {
  if (screen.id === "01") return null;
  const noContinue =
    (Number(screen.id) >= 1 && Number(screen.id) <= 11) ||
    (Number(screen.id) >= 29 && Number(screen.id) <= 33) ||
    screen.id === "22" ||
    screen.flow === "photo" ||
    screen.flow === "box" ||
    screen.flow === "sales" ||
    screen.id === "genre-suit-01" ||
    screen.id === "genre-suit-04";
  return (
    <div className={styles.actionBar}>
      <a
        className={styles.primaryButton}
        href={next ? `/mobile/screens/${next}` : "/mobile/screens"}
      >
        {screen.primary}
      </a>
      {!noContinue ? (
        <a className={styles.secondaryAction} href="/mobile/screens/05">
          作業を続ける <span>›</span>
        </a>
      ) : null}
    </div>
  );
}

function FormField({
  label,
  value,
  placeholder,
  type = "text",
}: {
  label: string;
  value?: string;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className={styles.formField}>
      <span>{label}</span>
      <input type={type} defaultValue={value} placeholder={placeholder} />
    </label>
  );
}

function LoginInput({
  label,
  type = "text",
  icon,
}: {
  label: string;
  type?: "text" | "password";
  icon: "mail" | "lock";
}) {
  return (
    <label className={styles.loginInput}>
      <span className={styles.loginInputIcon} aria-hidden="true">
        {icon === "mail" ? (
          <svg viewBox="0 0 24 24">
            <rect x="3.5" y="5.5" width="17" height="13" rx="1.8" />
            <path d="m4.7 7 7.3 5.8L19.3 7" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24">
            <rect x="4.5" y="10" width="15" height="10" rx="2" />
            <path d="M8 10V7.7a4 4 0 0 1 8 0V10" />
            <circle cx="12" cy="14.5" r="1.2" />
            <path d="M12 15.7v1.6" />
          </svg>
        )}
      </span>
      <input type={type} aria-label={label} placeholder={label} />
      {type === "password" ? (
        <button type="button" className={styles.passwordEye} aria-label="パスワードを表示">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M2.5 12s3.4-5.5 9.5-5.5S21.5 12 21.5 12 18.1 17.5 12 17.5 2.5 12 2.5 12Z" />
            <circle cx="12" cy="12" r="2.6" />
          </svg>
        </button>
      ) : null}
    </label>
  );
}

function InspectionSummaryStat({
  tone,
  label,
  value,
  icon,
}: {
  tone: "green" | "amber" | "gray";
  label: string;
  value: string;
  icon: string;
}) {
  return (
    <div className={cn(styles.inspectionSummaryStat, styles[`inspectionSummary${tone}`])}>
      <span>{icon}</span>
      <strong>{label}</strong>
      <b>{value}</b>
      <small>件</small>
    </div>
  );
}

function PreflightRow({ label, detail }: { label: string; detail: string }) {
  return (
    <div className={styles.preflightRow}>
      <CheckMark tone="green" />
      <div>
        <strong>{label}</strong>
        <small>{detail}</small>
      </div>
      <span className={styles.preflightHelp}>?</span>
    </div>
  );
}

function LongPressHand() {
  return (
    <svg className={styles.longPressHand} viewBox="0 0 126 134" aria-hidden="true">
      <circle cx="62" cy="31" r="27" fill="none" stroke="#d8dce2" strokeWidth="3" />
      <circle cx="62" cy="31" r="19" fill="none" stroke="#e9ebee" strokeWidth="3" />
      <path
        d="M56 120 41 94c-2-4 2-8 6-6l12 12V48c0-8 11-8 11 0v32l3-7c3-6 12-4 11 3l-2 10 4-5c4-5 12-1 10 5l-8 20c-4 10-11 17-22 20l-9 3"
        fill="#fff"
        stroke="#111827"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function PhotoSavedNotice() {
  return (
    <div className={styles.photoSavedNotice}>
      <CheckMark tone="green" />
      <strong>5枚保存済み</strong>
    </div>
  );
}

function ListRow({
  icon,
  title,
  detail,
  status,
  tone = "plain",
}: {
  icon: string;
  title: string;
  detail: string;
  status?: string;
  tone?: "plain" | "ok" | "review";
}) {
  return (
    <div
      className={cn(
        styles.listRow,
        tone === "ok" && styles.listRowOk,
        tone === "review" && styles.listRowReview,
      )}
    >
      <span className={styles.rowIcon}>{icon}</span>
      <div>
        <strong>{title}</strong>
        <small>{detail}</small>
      </div>
      {status ? <b>{status}</b> : <span className={styles.chevron}>›</span>}
    </div>
  );
}

function InspectionState({
  label,
  detail,
  active,
  onClick,
  tone,
  stateIcon,
}: {
  label: string;
  detail: string;
  active: boolean;
  onClick: () => void;
  tone: "green" | "amber" | "gray";
  stateIcon?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        styles.inspectionState,
        active && styles.inspectionStateActive,
        styles[`state${tone}`],
      )}
    >
      <span>{stateIcon ?? (active ? "✓" : "○")}</span>
      <b>{label}</b>
      <small>{detail}</small>
    </button>
  );
}

function GenrePartCard({
  label,
  count,
  kind,
}: {
  label: string;
  count: string;
  kind: "coat" | "pants" | "shirt";
}) {
  const assetSrc =
    kind === "coat"
      ? "/approved-assets/product/suit-jacket.png"
      : kind === "pants"
        ? "/approved-assets/product/suit-pants.png"
        : "/approved-assets/product/setup-top.png";
  return (
    <article className={styles.genrePartCard}>
      <div className={styles.genrePartVisual}>
        <AssetImage src={assetSrc} alt={label} />
      </div>
      <div>
        <strong>{label}</strong>
        <span>{count}</span>
      </div>
    </article>
  );
}

function GenreComposition({ setup = false }: { setup?: boolean }) {
  return (
    <section className={styles.genreContentStack}>
      <div className={styles.genrePartList}>
        <GenrePartCard
          label={setup ? "トップス" : "上着"}
          count="1点"
          kind={setup ? "shirt" : "coat"}
        />
        <GenrePartCard label={setup ? "ボトムス" : "パンツ"} count="1点" kind="pants" />
      </div>
      <div className={styles.genreInfoCard}>
        <span className={styles.genreInfoIcon}>ⓘ</span>
        <span>{setup ? "組み合わせを一組で確認" : "上下を一組で確認"}</span>
      </div>
    </section>
  );
}

function GenreChecklist({
  items,
  doneCount,
  finalNote,
}: {
  items: readonly string[];
  doneCount: number;
  finalNote?: string;
}) {
  return (
    <section className={styles.genreContentStack}>
      <div className={styles.genreChecklist}>
        {items.map((item, index) => {
          const done = index < doneCount;
          return (
            <div className={styles.genreCheckRow} key={item}>
              <span className={styles.genreCheckNumber}>{index + 1}</span>
              <strong>{item}</strong>
              <span
                className={cn(
                  styles.genreCheckState,
                  done ? styles.genreCheckStateDone : styles.genreCheckStateOpen,
                )}
              >
                {done ? "✓" : "○"}
              </span>
            </div>
          );
        })}
      </div>
      {finalNote ? (
        <div className={styles.genreCompleteNote}>
          <CheckMark tone="green" />
          <strong>{finalNote}</strong>
        </div>
      ) : null}
    </section>
  );
}

const suitJacketItems = [
  "正面",
  "背面",
  "襟・ラペル",
  "袖口",
  "裏地",
  "ブランド・サイズ",
  "気になる箇所",
] as const;
const suitPantsItems = [
  "正面",
  "背面",
  "ウエスト",
  "留め具",
  "裾",
  "品質表示",
  "気になる箇所",
] as const;
const setupTopItems = ["正面", "背面", "首元", "袖口", "ブランド・サイズ", "気になる箇所"] as const;
const setupBottomItems = ["正面", "背面", "ウエスト", "裾", "品質表示", "気になる箇所"] as const;

function PhotoStrip({ active = 3 }: { active?: number }) {
  const assets = [
    "/approved-assets/mobile-fidelity/short-sleeve-front.png",
    "/approved-assets/mobile-fidelity/short-sleeve-back.png",
    "/approved-assets/product/brand-tag.png",
    "/approved-assets/product/quality-label.png",
    "/approved-assets/mobile-fidelity/short-sleeve-front.png",
  ];
  return (
    <div className={styles.photoStrip}>
      {["正面", "背面", "ブランドタグ", "品質表示", "気になる箇所"].map((label, index) => (
        <PhotoTile
          label={label}
          active={index < active}
          kind={index === 1 ? "coat" : index === 4 ? "pants" : "shirt"}
          assetSrc={assets[index]}
          issueMarker={index === 4}
          key={label}
        />
      ))}
    </div>
  );
}

function DocumentArt({ kind }: { kind: "invoice" | "receipt" }) {
  return (
    <span className={styles.documentArt} aria-hidden="true">
      <svg viewBox="0 0 48 56">
        {kind === "invoice" ? (
          <>
            <path d="M7 2h25l9 9v43H7z" />
            <path d="M32 2v10h9M13 22h22M13 29h22M13 36h15" />
          </>
        ) : (
          <>
            <path d="M10 4h28v47l-4-3-4 3-4-3-4 3-4-3-4 3-4-3-4 3z" />
            <path d="M16 15h16M16 22h16M16 29h11" />
          </>
        )}
      </svg>
    </span>
  );
}

function SourceArt({ kind }: { kind: "phone" | "cloud" | "folder" }) {
  return (
    <span className={styles.sourceArt} aria-hidden="true">
      <svg viewBox="0 0 32 32">
        {kind === "phone" ? (
          <>
            <rect x="9" y="3" width="14" height="26" rx="2" />
            <path d="M14 25h4" />
          </>
        ) : kind === "cloud" ? (
          <path d="M8 24h16a5 5 0 0 0 .5-10A8 8 0 0 0 9 12a6 6 0 0 0-1 12Zm8-9v7m0 0-3-3m3 3 3-3" />
        ) : (
          <>
            <path d="M4 9h9l3 3h12v15H4z" />
            <path d="M4 9V6h9l3 3" />
          </>
        )}
      </svg>
    </span>
  );
}

function HumanConfirmIcon() {
  return (
    <span className={styles.humanConfirmIcon} aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="7" r="3.3" />
        <path d="M5.5 21c.7-4.2 2.8-6.2 6.5-6.2s5.8 2 6.5 6.2" />
      </svg>
    </span>
  );
}

function LockIcon() {
  return (
    <span className={styles.lockIcon} aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </svg>
    </span>
  );
}

function MethodIcon({ kind }: { kind: "wand" | "folder" | "play" }) {
  return (
    <span
      className={cn(styles.methodIcon, kind === "folder" && styles.methodIconBlue)}
      aria-hidden="true"
    >
      <svg viewBox="0 0 28 28">
        {kind === "wand" ? (
          <>
            <path d="m6 22 13-13" />
            <path d="m17 4 1.2 3.8L22 9l-3.8 1.2L17 14l-1.2-3.8L12 9l3.8-1.2z" />
          </>
        ) : kind === "folder" ? (
          <path d="M3 7h8l2 3h12v13H3z" />
        ) : (
          <circle cx="14" cy="14" r="10" />
        )}
        {kind === "play" ? <path d="m12 10 6 4-6 4z" fill="currentColor" stroke="none" /> : null}
      </svg>
    </span>
  );
}

function StorageRow({ label }: { label: string }) {
  return (
    <div className={styles.storageRow}>
      <strong>{label}</strong>
      <span>
        <b>保存済み</b>
        <CheckMark tone="green" />
      </span>
    </div>
  );
}

function EditableValueRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.editableValueRow}>
      <strong>{label}</strong>
      <span>{value}</span>
      <button type="button" aria-label={`${label}を編集`}>
        ✎
      </button>
    </div>
  );
}

function RecipeOption({
  label,
  detail,
  visual,
  onClick,
}: {
  label: string;
  detail: string;
  visual: ReactNode;
  onClick: () => void;
}) {
  return (
    <button type="button" className={styles.recipeOption} onClick={onClick}>
      <span className={styles.recipeOptionVisual}>{visual}</span>
      <span>
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
    </button>
  );
}

function MethodOption({
  kind,
  label,
  detail,
  active,
  status,
  onClick,
}: {
  kind: "wand" | "folder" | "play";
  label: string;
  detail: string;
  active: boolean;
  status?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(styles.methodOption, active && styles.methodOptionActive)}
      onClick={onClick}
      aria-pressed={active}
    >
      <MethodIcon kind={kind} />
      <span>
        <strong>{label}</strong>
        <small>{detail}</small>
        {status ? <em>{status}</em> : null}
      </span>
      {active ? <CheckMark tone="blue" /> : <span />}
    </button>
  );
}

function ScanOption({
  kind,
  label,
  detail,
  onClick,
}: {
  kind: "scan" | "number" | "none";
  label: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className={styles.scanOption} onClick={onClick}>
      <span className={styles.scanOptionVisual} aria-hidden="true">
        <svg viewBox="0 0 52 52">
          {kind === "scan" ? (
            <>
              <path d="M9 20V9h11M32 9h11v11M43 32v11H32M20 43H9V32" />
              <path d="M17 25h18M19 21v9M23 19v13M27 21v9M31 19v13" />
            </>
          ) : kind === "number" ? (
            <>
              <rect x="5" y="5" width="42" height="42" rx="6" />
              <text x="26" y="33" textAnchor="middle">
                123
              </text>
            </>
          ) : (
            <circle cx="26" cy="26" r="18" />
          )}
          {kind === "none" ? <path d="m13 13 26 26" /> : null}
        </svg>
      </span>
      <span>
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
      <span className={styles.scanOptionChevron}>›</span>
    </button>
  );
}

function ExceptionCard({ icon, label, count }: { icon: string; label: string; count: string }) {
  return (
    <div className={styles.exceptionCard}>
      <span className={styles.exceptionIcon}>{icon}</span>
      <strong>{label}</strong>
      <b>{count}</b>
    </div>
  );
}

function SettingCard({ icon, label, detail }: { icon: string; label: string; detail: string }) {
  return (
    <div className={styles.settingCard}>
      <span className={styles.settingIcon}>{icon}</span>
      <div>
        <strong>{label}</strong>
        <small>{detail}</small>
      </div>
      <span className={styles.settingStatus}>未設定</span>
      <span className={styles.settingChevron}>›</span>
      <span className={styles.settingHelp}>?</span>
    </div>
  );
}

function BoxEntryRow({ label, value, icon }: { label: string; value: string; icon?: string }) {
  return (
    <div className={styles.boxEntryRow}>
      <span>{label}</span>
      <strong>{value}</strong>
      {icon ? <b>{icon}</b> : null}
    </div>
  );
}

function SalesCandidateCard({
  icon,
  label,
  count,
}: {
  icon: string;
  label: string;
  count: string;
}) {
  return (
    <div className={styles.salesCandidateCard}>
      <span className={styles.salesCandidateIcon}>{icon}</span>
      <div>
        <strong>{label}</strong>
        <b>{count}</b>
      </div>
      <span className={styles.salesCandidateChevron}>›</span>
    </div>
  );
}

function RenderScreenContent({ id }: { id: string }) {
  const [choice, setChoice] = useState<Choice>(id === "sales-04" ? "second" : "first");
  const [saved, setSaved] = useState(false);

  switch (id) {
    case "01":
      return (
        <section className={styles.loginContent}>
          <div className={styles.loginLogo}>
            <LoginHeroArt />
          </div>
          <div className={styles.loginForm}>
            <LoginInput label="メールアドレス" icon="mail" />
            <LoginInput label="パスワード" icon="lock" type="password" />
          </div>
          <a className={styles.loginButton} href="/mobile/screens/02">
            ログイン
          </a>
          <div className={styles.loginSafety}>安全に作業を始めます</div>
        </section>
      );
    case "02":
      return (
        <section className={styles.contentStack}>
          <p className={styles.boardInstruction}>まず、基本情報を設定します</p>
          <div className={styles.formCard}>
            <FormField label="事業所名" placeholder="事業所名を入力" />
            <small className={styles.fieldHint}>あとから変更できます</small>
          </div>
          <div className={styles.featureCard}>
            <h2>使う機能</h2>
            <small>必要な機能だけを選びます</small>
            <label className={styles.featureCheck}>
              <input type="checkbox" defaultChecked />
              検品
            </label>
            <label className={styles.featureCheck}>
              <input type="checkbox" defaultChecked />
              撮影
            </label>
            <label className={styles.featureCheck}>
              <input type="checkbox" defaultChecked />
              採寸
            </label>
            <label className={styles.featureCheck}>
              <input type="checkbox" />
              会計
            </label>
          </div>
        </section>
      );
    case "03":
      return (
        <section className={styles.contentStack}>
          <p className={styles.boardInstruction}>招待する担当を選びます</p>
          <div className={styles.roleList}>
            <RoleOption
              label="オーナー"
              detail="すべての設定と管理"
              onClick={() => setChoice("first")}
            />
            <RoleOption
              label="検品・撮影"
              detail="検品と撮影を担当"
              onClick={() => setChoice("second")}
            />
            <RoleOption label="発送" detail="梱包と発送を担当" onClick={() => setChoice("third")} />
            <RoleOption
              label="会計"
              detail="入出金と集計を担当"
              onClick={() => setChoice("none")}
            />
          </div>
          <small className={styles.roleHint}>必要な情報だけを表示</small>
        </section>
      );
    case "04":
      return (
        <section className={styles.contentStack}>
          <div className={styles.homeTaskCard}>
            <div className={styles.homeTaskHead}>
              <strong>今日やること</strong>
              <span>5件</span>
            </div>
            <div className={styles.homeTaskRow}>
              <div>
                <strong>検品</strong>
                <small>残り 3件</small>
                <i>
                  <b style={{ width: "48%" }} />
                </i>
              </div>
              <CheckMark tone="green" />
            </div>
            <div className={styles.homeTaskRow}>
              <div>
                <strong>撮影</strong>
                <small>残り 2件</small>
                <i>
                  <b style={{ width: "58%" }} />
                </i>
              </div>
              <CheckMark tone="green" />
            </div>
            <div className={styles.homeTaskRow}>
              <div>
                <strong>採寸</strong>
                <small>残り 4件</small>
                <i>
                  <b style={{ width: "68%" }} />
                </i>
              </div>
              <CheckMark tone="green" />
            </div>
          </div>
        </section>
      );
    case "05":
      return (
        <section className={styles.contentStack}>
          <p className={styles.boardInstruction}>作業の種類を選びます</p>
          <div className={styles.taskList}>
            <ListRow icon="⇩" title="仕入れ" detail="2件" />
            <ListRow icon="☑" title="検品" detail="3件" />
            <ListRow icon="▣" title="撮影" detail="2件" />
            <ListRow icon="／" title="採寸" detail="4件" />
          </div>
        </section>
      );
    case "06":
      return (
        <section className={styles.contentStack}>
          <p className={styles.boardInstruction}>通信が復帰したら自動で送信します</p>
          <div className={styles.offlineCards}>
            <div className={styles.offlineInfoCard}>
              <span className={styles.offlineIcon}>▣</span>
              <div>
                <strong>端末に保存済み</strong>
                <small>送信前に端末へ保存しています</small>
              </div>
              <CheckMark tone="green" />
            </div>
            <div className={styles.offlineInfoCard}>
              <span className={styles.offlineIcon}>!</span>
              <div>
                <strong>送信待ち</strong>
                <small>未送信のデータがあります</small>
              </div>
              <b className={styles.waitingCount}>2件</b>
            </div>
            <div className={styles.offlineInfoCard}>
              <span className={styles.offlineIcon}>◷</span>
              <div>
                <strong>最後に送れた時刻</strong>
                <small>今日 14:35</small>
              </div>
            </div>
          </div>
        </section>
      );
    case "07":
      return (
        <section className={styles.contentStack}>
          <p className={styles.boardInstruction}>仕入れ書類を選んでください</p>
          <div className={styles.documentChoiceList}>
            <button
              type="button"
              className={cn(
                styles.documentChoiceCard,
                choice === "first" && styles.documentChoiceCardActive,
              )}
              onClick={() => setChoice("first")}
              aria-pressed={choice === "first"}
            >
              <DocumentArt kind="invoice" />
              <span>
                <strong>請求書ファイル</strong>
                <small>卸仕入れ</small>
              </span>
              {choice === "first" ? (
                <CheckMark tone="blue" />
              ) : (
                <span className={styles.emptyCircle} />
              )}
            </button>
            <button
              type="button"
              className={cn(
                styles.documentChoiceCard,
                choice === "second" && styles.documentChoiceCardActive,
              )}
              onClick={() => setChoice("second")}
              aria-pressed={choice === "second"}
            >
              <DocumentArt kind="receipt" />
              <span>
                <strong>レシートを撮る</strong>
                <small>店舗で購入</small>
              </span>
              {choice === "second" ? (
                <CheckMark tone="blue" />
              ) : (
                <span className={styles.emptyCircle} />
              )}
            </button>
          </div>
        </section>
      );
    case "08":
      return (
        <section className={styles.contentStack}>
          <p className={styles.boardInstruction}>ファイルの保存先を選んでください</p>
          <div className={styles.filePickerCard}>
            <span className={styles.folderIcon}>
              <SourceArt kind="folder" />
            </span>
            <strong>ファイルから選ぶ</strong>
            <small>PDF・画像</small>
          </div>
          <strong className={styles.sourceLabel}>保存先</strong>
          <div className={styles.fileSourceList}>
            <button
              type="button"
              onClick={() => setChoice("first")}
              className={cn(styles.fileSourceRow, choice === "first" && styles.fileSourceActive)}
            >
              <SourceArt kind="phone" />
              <strong>このiPhone内</strong>
              <span className={styles.sourceChevron}>›</span>
            </button>
            <button
              type="button"
              onClick={() => setChoice("second")}
              className={cn(styles.fileSourceRow, choice === "second" && styles.fileSourceActive)}
            >
              <SourceArt kind="cloud" />
              <strong>iCloud Drive</strong>
              <span className={styles.sourceChevron}>›</span>
            </button>
            <button
              type="button"
              onClick={() => setChoice("third")}
              className={cn(styles.fileSourceRow, choice === "third" && styles.fileSourceActive)}
            >
              <SourceArt kind="folder" />
              <strong>Google Drive</strong>
              <span className={styles.sourceChevron}>›</span>
            </button>
          </div>
          <div className={styles.filePrivacy}>
            <span>⌁</span>
            <span>メール添付は一度ファイルに保存</span>
          </div>
          <div className={styles.filePrivacyMuted}>
            <span>♙</span>
            <span>Googleのログイン情報は預かりません</span>
          </div>
        </section>
      );
    case "09":
      return (
        <section className={styles.contentStack}>
          <div className={styles.fileIdentity}>
            <span className={styles.fileIcon}>PDF</span>
            <div>
              <strong>invoice-2026-08.pdf</strong>
              <small>2ページ</small>
            </div>
          </div>
          <div className={styles.reviewBadgeAmber}>◉ 原本を人が確認</div>
          <div className={styles.paperPreview}>
            <div className={styles.paperTop}>
              <span>株式会社サンプル商事　御中</span>
              <strong>請 求 書</strong>
              <span>
                No.INV-2608001
                <br />
                2026年8月1日
              </span>
            </div>
            <div className={styles.paperLine} />
            <div className={styles.invoiceTable}>
              <div className={styles.invoiceTableHead}>
                <span>商品名</span>
                <span>数量</span>
                <span>単価</span>
                <span>金額</span>
              </div>
              <div>
                <span>ネイビーシャツ</span>
                <span>10枚</span>
                <span>2,980円</span>
                <span>29,800円</span>
              </div>
              <div>
                <span>収納ボックス</span>
                <span>5個</span>
                <span>1,480円</span>
                <span>7,400円</span>
              </div>
              <div>
                <span>ファイルA4</span>
                <span>20冊</span>
                <span>760円</span>
                <span>15,200円</span>
              </div>
            </div>
            <div className={styles.paperTotal}>
              <span>合計</span>
              <strong>¥52,400</strong>
            </div>
          </div>
        </section>
      );
    case "10":
      return (
        <section className={styles.contentStack}>
          <div className={styles.reviewBadgeAmber}>◉ 読み取り候補・人が確認</div>
          <p className={styles.boardInstruction}>読み取った内容を確認・編集してください</p>
          <div className={styles.editableRows}>
            <EditableValueRow label="仕入先" value="株式会社サンプル商事" />
            <EditableValueRow label="請求日" value="2026年8月1日" />
            <EditableValueRow label="合計" value="¥52,400" />
          </div>
        </section>
      );
    case "11":
      return (
        <section className={styles.contentStack}>
          <p className={styles.boardInstruction}>読み取った商品行を確認・編集してください</p>
          <div className={styles.lineItem}>
            <div className={styles.lineItemTitle}>
              <div>
                <small>商品名</small>
                <strong>ネイビーシャツ</strong>
              </div>
              <button type="button" aria-label="ネイビーシャツを編集">
                ✎
              </button>
            </div>
            <div className={styles.miniGrid}>
              <DataRow label="数量" value="10枚" />
              <DataRow label="単価" value="2,980円" />
            </div>
          </div>
          <div className={styles.lineItem}>
            <div className={styles.lineItemTitle}>
              <div>
                <small>商品名</small>
                <strong>収納ボックス</strong>
              </div>
              <button type="button" aria-label="収納ボックスを編集">
                ✎
              </button>
            </div>
            <div className={styles.miniGrid}>
              <DataRow label="数量" value="5個" />
              <DataRow label="単価" value="1,480円" />
            </div>
          </div>
          <div className={styles.lineItem}>
            <div className={styles.lineItemTitle}>
              <div>
                <small>商品名</small>
                <strong>ファイルA4</strong>
              </div>
              <button type="button" aria-label="ファイルA4を編集">
                ✎
              </button>
            </div>
            <div className={styles.miniGrid}>
              <DataRow label="数量" value="20冊" />
              <DataRow label="単価" value="760円" />
            </div>
          </div>
        </section>
      );
    case "12":
      return (
        <section className={styles.contentStack}>
          <p className={styles.boardInstruction}>
            商品の確認方法を
            <br />
            選択してください
          </p>
          <div className={styles.scanActions}>
            <ScanOption
              kind="scan"
              label="ラベルを読む"
              detail="商品のラベルをカメラで読み取ります"
              onClick={() => setChoice("first")}
            />
            <ScanOption
              kind="number"
              label="番号を入力"
              detail="商品番号を手入力します"
              onClick={() => setChoice("second")}
            />
            <ScanOption
              kind="none"
              label="今回は使わない"
              detail="一時的に確認方法を使わずに進みます"
              onClick={() => setChoice("third")}
            />
          </div>
          <p className={styles.boardInstruction}>中古品などラベルがない時も進めます</p>
        </section>
      );
    case "13":
      return (
        <section className={styles.contentStack}>
          <p className={styles.boardInstruction}>商品番号と写真を確認してください</p>
          <div className={styles.productNumberCard}>
            <span>商品番号（手入力）</span>
            <strong>AP-0825-00421</strong>
            <div className={styles.confirmRow}>
              <CheckMark tone="green" />
              <strong>確認済み</strong>
            </div>
          </div>
          <div className={styles.productPhotoCard}>
            <span>商品写真</span>
            <AssetImage
              src="/approved-assets/product/putaway-shirt-confirm.png"
              alt="商品写真"
              className={styles.productPhotoAsset}
            />
            <div className={styles.confirmRow}>
              <CheckMark tone="green" />
              <strong>確認済み</strong>
            </div>
          </div>
          <p className={styles.boardInstruction}>番号と写真を人が確認</p>
        </section>
      );
    case "14":
      return (
        <section className={styles.contentStack}>
          <p className={styles.boardInstruction}>保管場所を確認してください</p>
          <div className={styles.scanPhoto}>
            <AssetImage
              src="/approved-assets/storage/shelf-location-mobile.png"
              alt="保管場所の写真"
              className={styles.locationPhotoAsset}
            />
          </div>
          <div className={styles.locationCard}>
            <div>
              <span>保管場所</span>
              <strong>作業部屋・棚A・2段目・箱3</strong>
            </div>
            <div className={styles.confirmRow}>
              <CheckMark tone="green" />
              <strong>確認済み</strong>
            </div>
          </div>
          <p className={styles.locationHumanCheck}>保管場所を人が確認</p>
        </section>
      );
    case "15":
      return (
        <section className={styles.contentStack}>
          <p className={styles.boardInstruction}>商品と保管場所を確認してください</p>
          <div className={styles.matchStack}>
            <div className={styles.matchCard}>
              <span>商品</span>
              <AssetImage
                src="/approved-assets/product/shirt-front.png"
                alt="商品"
                className={styles.matchPhotoAsset}
              />
              <strong>AP-0825-00421</strong>
              <span className={styles.inlineStatus}>
                <CheckMark tone="green" />
                確認済み
              </span>
            </div>
            <div className={styles.matchCard}>
              <span>保管場所</span>
              <AssetImage
                src="/approved-assets/storage/shelf-location-mobile.png"
                alt="棚A・2段目・箱3の保管場所"
                className={styles.matchPhotoAsset}
              />
              <strong>作業部屋・棚A・2段目・箱3</strong>
              <span className={styles.inlineStatus}>
                <CheckMark tone="green" />
                確認済み
              </span>
            </div>
          </div>
          <p className={styles.boardInstruction}>上記の内容を人が確認しました</p>
        </section>
      );
    case "16":
      return (
        <section className={styles.contentStack}>
          <p className={styles.boardInstruction}>次の工程に進みます</p>
          <div className={styles.readyHero}>
            <div className={styles.workflowChecklistIcon} aria-hidden="true">
              <svg viewBox="0 0 72 76" focusable="false">
                <path d="M27 12v-2.5a7 7 0 0 1 14 0V12" />
                <rect x="14" y="12" width="42" height="53" rx="5" />
                <path d="m24 29 3.5 3.5 6-7" />
                <path d="M38 28h10M38 36h10" />
                <path d="m24 43 3.5 3.5 6-7" />
                <path d="M38 42h10M38 50h7" />
                <circle cx="57" cy="58" r="13" />
                <path className={styles.workflowChecklistTick} d="m51.5 58 3.8 3.8 7.1-8" />
              </svg>
            </div>
            <div>
              <h2>使わない工程は表示しません</h2>
              <span className={styles.workflowConfirm}>
                <CheckMark tone="green" />
                確認済み
              </span>
            </div>
          </div>
          <div className={styles.nextStageCard}>商品ラベル：省略済み</div>
          <div className={styles.workflowDots}>
            <span className={cn(styles.workflowStep, styles.workflowStepDone)}>
              <i>✓</i>
              <b>格納</b>
            </span>
            <em />
            <span className={cn(styles.workflowStep, styles.workflowStepNext)}>
              <i />
              <b>検品</b>
            </span>
            <em />
            <span className={styles.workflowStep}>
              <i />
              <b>撮影</b>
            </span>
            <em />
            <span className={styles.workflowStep}>
              <i />
              <b>出品</b>
            </span>
          </div>
        </section>
      );
    case "17":
      return (
        <section className={styles.contentStack}>
          <p className={styles.boardInstruction}>商品の全体の状態を確認してください</p>
          <div className={styles.inspectProgress}>
            <span>2 / 6</span>
          </div>
          <div className={styles.stateGrid}>
            <InspectionState
              label="未確認"
              detail="まだ確認していません"
              active={false}
              onClick={() => setChoice("first")}
              tone="gray"
              stateIcon="?"
            />
            <InspectionState
              label="問題なしを確認"
              detail="問題がないことを確認しました"
              active={false}
              onClick={() => setChoice("second")}
              tone="green"
              stateIcon="✓"
            />
            <InspectionState
              label="気になる点あり"
              detail="汚れや傷などがあります"
              active={false}
              onClick={() => setChoice("third")}
              tone="amber"
              stateIcon="!"
            />
          </div>
          <div className={styles.itemHint}>
            <span>ⓘ</span>
            <strong>すべての項目を確認するまで次のステップへ進めません</strong>
          </div>
        </section>
      );
    case "18":
      return (
        <section className={styles.contentStack}>
          <p className={styles.boardInstruction}>気になる箇所をタップしてください</p>
          <div className={styles.markedPhoto}>
            <AssetImage
              src="/approved-assets/mobile-fidelity/inspection-shirt-full.png"
              alt="気になる箇所を確認するシャツ"
              className={styles.inspectionPhotoAsset}
            />
          </div>
          <div className={styles.issueForm}>
            <DataRow label="場所" value="左袖" />
            <DataRow label="種類" value="小さな汚れ" />
            <DataRow label="程度" value="小さい" />
            <div className={styles.issuePhotoLink}>
              <AssetImage
                src="/approved-assets/product/defect-detail.png"
                alt="選択した気になる箇所"
                className={styles.issuePhotoThumb}
              />
              <span>写真</span>
              <b>›</b>
            </div>
            <DataRow
              className={styles.issueMemoRow}
              label="メモ"
              value="左袖の外側にうっすらとした汚れがあります"
            />
          </div>
        </section>
      );
    case "19":
      return (
        <section className={styles.contentStack}>
          <p className={styles.boardInstruction}>この商品の検品結果をまとめました</p>
          <div className={styles.inspectionSummaryCard}>
            <div className={styles.summaryRows}>
              <InspectionSummaryStat tone="green" icon="✓" label="問題なし" value="4" />
              <InspectionSummaryStat tone="amber" icon="!" label="気になる点" value="2" />
              <InspectionSummaryStat tone="gray" icon="?" label="未確認" value="0" />
            </div>
            <div className={styles.issueSummaryPhotos}>
              <strong>気になる箇所（2件）</strong>
              <div>
                <IssuePhoto
                  number="1"
                  src="/approved-assets/product/defect-detail.png"
                  alt="気になる箇所1"
                />
                <IssuePhoto
                  number="2"
                  src="/approved-assets/product/cuff-large.png"
                  alt="気になる箇所2"
                />
              </div>
            </div>
          </div>
        </section>
      );
    case "20":
      return (
        <section className={styles.contentStack}>
          <div className={styles.photoChecklist}>
            <div className={styles.photoChecklistHead}>
              <span>すべての写真を撮影してください</span>
              <strong>残り 5 / 8</strong>
            </div>
            <div className={styles.photoTodo}>
              <ListRow icon="📷" title="正面" detail="未撮影" status="›" />
              <ListRow icon="📷" title="背面" detail="未撮影" status="›" />
              <ListRow icon="📷" title="ブランド・サイズ" detail="未撮影" status="›" />
              <ListRow icon="📷" title="品質表示" detail="未撮影" status="›" />
              <ListRow icon="📷" title="襟元" detail="未撮影" status="›" />
              <ListRow icon="📷" title="袖口" detail="未撮影" status="›" />
              <ListRow icon="📷" title="裾" detail="未撮影" status="›" />
              <ListRow icon="📷" title="気になる箇所" detail="未撮影" status="›" />
            </div>
            <div className={styles.photoGuideNotice}>
              ⓘ すべての写真を撮影すると検品を完了できます
            </div>
          </div>
        </section>
      );
    case "21":
      return (
        <section className={styles.contentStack}>
          <p className={styles.boardInstruction}>枠の中に商品を入れてください</p>
          <div className={styles.cameraGuide}>
            <CameraFrame
              assetSrc="/approved-assets/mobile-fidelity/capture-shirt-full.png"
              showCorners
              showHint={false}
            />
          </div>
          <div className={styles.guideChecks}>
            <ListRow
              icon="✓"
              title="明るい場所で撮影してください"
              detail="確認済み"
              status="✓"
              tone="ok"
            />
            <ListRow
              icon="✓"
              title="全体を枠の中に入れてください"
              detail="確認済み"
              status="✓"
              tone="ok"
            />
            <ListRow
              icon="✓"
              title="影が入らないようにしてください"
              detail="確認済み"
              status="✓"
              tone="ok"
            />
          </div>
        </section>
      );
    case "22":
      return (
        <section className={styles.contentStack}>
          <p className={styles.boardInstruction}>写真を確認してください</p>
          <div className={styles.reviewPhoto}>
            <AssetImage
              src="/approved-assets/mobile-fidelity/review-shirt-full.png"
              alt="撮影した正面写真"
              className={styles.reviewPhotoAsset}
            />
          </div>
          <div className={styles.photoQualityChecks}>
            <ListRow icon="✓" title="ぶれなし" detail="ピントが合っています" status="✓" tone="ok" />
            <ListRow icon="✓" title="明るさよし" detail="明るさは適切です" status="✓" tone="ok" />
            <ListRow
              icon="✓"
              title="切れなし"
              detail="全体が枠内に収まっています"
              status="✓"
              tone="ok"
            />
          </div>
          <button
            type="button"
            className={styles.outlineButton}
            onClick={() => setChoice("second")}
          >
            撮り直す
          </button>
        </section>
      );
    case "23":
      return (
        <section className={styles.contentStack}>
          <div className={styles.retakeBanner}>
            <span>!</span>
            <strong>袖口が暗い</strong>
          </div>
          <div className={styles.retakeCompare}>
            <div>
              <strong>選択中の写真</strong>
              <div className={styles.dimPhoto}>
                <AssetImage
                  src="/approved-assets/product/cuff-large.png"
                  alt="袖口の写真"
                  className={styles.cuffPhotoAsset}
                />
              </div>
              <span className={styles.retakePhotoLabel}>袖口</span>
            </div>
            <div>
              <strong>改善のポイント</strong>
              <div className={styles.improvementCard}>☼ 明るい場所でもう一度</div>
            </div>
          </div>
        </section>
      );
    case "24":
      return (
        <section className={styles.contentStack}>
          <div className={styles.photoSummaryCard}>
            <div className={styles.photoProgressBanner}>
              <CheckMark tone="green" />
              <strong>8 / 8枚</strong>
              <span className={styles.photoProgressLine}>
                <span />
              </span>
            </div>
            <div className={styles.photoSummaryGrid}>
              <PhotoTile label="正面" assetSrc="/approved-assets/product/shirt-front.png" />
              <PhotoTile label="背面" assetSrc="/approved-assets/product/shirt-back.png" />
              <PhotoTile label="タグ" assetSrc="/approved-assets/product/brand-tag.png" />
              <PhotoTile label="品質表示" assetSrc="/approved-assets/product/quality-label.png" />
              <PhotoTile label="細部" assetSrc="/approved-assets/product/button-detail.png" />
              <PhotoTile
                label="気になる箇所"
                assetSrc="/approved-assets/product/defect-detail.png"
              />
            </div>
          </div>
        </section>
      );
    case "25":
      return (
        <section className={styles.contentStack}>
          <div className={styles.measurePrep}>
            <div className={styles.flatlay}>
              <AssetImage
                src="/approved-assets/product/shirt-flat-lay.png"
                alt="平置きしたシャツ"
                className={styles.flatlayAsset}
              />
            </div>
            <div>
              <h2>採寸する箇所</h2>
              <p>肩幅・身幅・着丈・袖丈を順番に確認します。</p>
            </div>
          </div>
          <div className={styles.measureSteps}>
            <ListRow icon="／" title="肩幅" detail="肩先から肩先まで" status="未" />
            <ListRow icon="／" title="身幅" detail="脇下から脇下まで" status="未" />
            <ListRow icon="／" title="着丈" detail="首元から裾まで" status="未" />
            <ListRow icon="／" title="袖丈" detail="肩先から袖口まで" status="未" />
          </div>
          <div className={styles.confirmRow}>
            <CheckMark tone="green" />
            <div>
              <strong>伸ばさずきれいに置く</strong>
              <small>平らな場所で採寸します</small>
            </div>
          </div>
        </section>
      );
    case "26":
      return (
        <section className={styles.contentStack}>
          <div className={styles.measureHeader}>
            <span>1 / 4　肩幅</span>
          </div>
          <div className={styles.measureStage}>
            <AssetImage
              src="/approved-assets/mobile-fidelity/capture-shirt-full.png"
              alt="肩幅の採寸写真"
              className={styles.measureAsset}
            />
            <span className={styles.measureArrow} />
            <span className={styles.measureStart}>肩先</span>
            <span className={styles.measureEnd}>肩先</span>
          </div>
          <div className={styles.measureReading}>
            <span>端から端まで水平に測る</span>
            <strong>47.5</strong>
            <b>cm</b>
          </div>
        </section>
      );
    case "27":
      return (
        <section className={styles.contentStack}>
          <div className={styles.measureCamera}>
            <AssetImage
              src="/approved-assets/measurement/shoulder-ruler.png"
              alt="メジャーを置いた採寸写真"
              className={styles.measureCameraAsset}
            />
          </div>
          <div className={styles.measurePhotoCopy}>
            <span>📷 肩幅 · 47.5 cm</span>
            <div className={styles.measurePhotoGuide}>
              <strong>メジャーの目盛りが読めるように</strong>
              <small>端から端まで水平に配置します</small>
            </div>
          </div>
        </section>
      );
    case "28":
      return (
        <section className={styles.contentStack}>
          <div className={styles.measureCompare}>
            <div>
              <span>前回</span>
              <strong>47.5 cm</strong>
            </div>
            <span className={styles.compareArrow}>→</span>
            <div className={styles.compareActive}>
              <span>今回</span>
              <strong>51.0 cm</strong>
            </div>
          </div>
          <div className={styles.measureWarning}>
            <strong>⚠ 差が大きい</strong>
            <small>測り方を確認してください</small>
          </div>
          <div className={styles.reasonList}>
            <strong>差が出た理由</strong>
            <label>
              <input type="radio" name="measure-reason" /> 測る位置が違う
            </label>
            <label>
              <input type="radio" name="measure-reason" /> メジャーが斜めだった
            </label>
            <label>
              <input type="radio" name="measure-reason" /> 生地を引っ張った
            </label>
            <label>
              <input type="radio" name="measure-reason" /> その他
            </label>
          </div>
        </section>
      );
    case "29":
      return (
        <section className={styles.contentStack}>
          <PhotoSavedNotice />
          <p className={styles.boardInstruction}>商品ごとにまとめます</p>
          <PhotoStrip active={5} />
        </section>
      );
    case "30":
      return (
        <section className={styles.contentStack}>
          <div className={styles.storagePath}>
            <span>商品</span>
            <b>›</b>
            <span>AP-2608-0142</span>
            <b>›</b>
            <strong>写真</strong>
          </div>
          <div className={styles.storageRows}>
            <StorageRow label="正面" />
            <StorageRow label="背面" />
            <StorageRow label="タグ2枚" />
            <StorageRow label="気になる箇所" />
          </div>
          <div className={styles.externalNotice}>
            <LockIcon />
            <div>
              <strong>PC内の非公開写真保管庫</strong>
              <span>✓ GitHub・Slack・Notionには保存しません</span>
              <span>✓ 原本は上書きしません</span>
            </div>
          </div>
        </section>
      );
    case "31":
      return (
        <section className={styles.contentStack}>
          <p className={styles.boardInstruction}>編集前に人が確認</p>
          <div className={styles.metadataRows}>
            <div>
              <strong>ブランド</strong>
              <span>CleanStyle</span>
              <button type="button" aria-label="ブランドを編集">
                ✎
              </button>
            </div>
            <div>
              <strong>サイズ</strong>
              <span>M</span>
              <button type="button" aria-label="サイズを編集">
                ✎
              </button>
            </div>
            <div>
              <strong>色</strong>
              <span>ネイビー</span>
              <button type="button" aria-label="色を編集">
                ✎
              </button>
            </div>
            <div>
              <strong>素材</strong>
              <span>綿100%</span>
              <button type="button" aria-label="素材を編集">
                ✎
              </button>
            </div>
          </div>
          <div className={styles.humanConfirmAmber}>
            <HumanConfirmIcon />
            <span>人が確認</span>
          </div>
        </section>
      );
    case "32":
      return (
        <section className={styles.contentStack}>
          <p className={styles.boardInstruction}>役割ごとに適したレシピを選択してください</p>
          <div className={styles.recipeList}>
            <RecipeOption
              label="正面・背面"
              detail="白背景／中央／余白"
              onClick={() => setChoice("first")}
              visual={
                <AssetImage
                  src="/approved-assets/mobile-fidelity/short-sleeve-front.png"
                  alt="正面写真の編集例"
                  className={styles.recipeAsset}
                />
              }
            />
            <RecipeOption
              label="正面だけ"
              detail="ブランド左上・サイズ右下"
              onClick={() => setChoice("second")}
              visual={
                <AssetImage
                  src="/approved-assets/mobile-fidelity/short-sleeve-front.png"
                  alt="正面だけの編集例"
                  className={styles.recipeAsset}
                />
              }
            />
            <RecipeOption
              label="タグ・気になる箇所"
              detail="向き／明るさのみ"
              onClick={() => setChoice("third")}
              visual={
                <span className={styles.recipePhotoPair}>
                  <AssetImage
                    src="/approved-assets/product/brand-tag.png"
                    alt="ブランドタグ"
                    className={styles.recipeAsset}
                  />
                  <AssetImage
                    src="/approved-assets/product/defect-detail.png"
                    alt="気になる箇所"
                    className={styles.recipeAsset}
                  />
                </span>
              }
            />
          </div>
          <div className={styles.recipeInfoBlue}>ⓘ 役割ごとに型を設定</div>
        </section>
      );
    case "33":
      return (
        <section className={styles.contentStack}>
          <p className={styles.boardInstruction}>現在の利用可能な方法</p>
          <div className={styles.methodCards}>
            <MethodOption
              kind="wand"
              label="自作画像編集（準備中）"
              detail="同じレシピで将来差し替え"
              active={choice === "third"}
              status="準備中"
              onClick={() => setChoice("third")}
            />
            <MethodOption
              kind="folder"
              label="編集用セットを作る"
              detail="PCで本人が編集する"
              active={choice === "first"}
              onClick={() => setChoice("first")}
            />
            <MethodOption
              kind="play"
              label="編集せず進む"
              detail="原本をそのまま使用"
              active={choice === "second"}
              onClick={() => setChoice("second")}
            />
          </div>
          <div className={styles.infoBanner}>外部アプリを自動操作しません。</div>
        </section>
      );
    case "34":
      return (
        <section className={styles.contentStack}>
          <p className={styles.boardInstruction}>必要な情報を入力してください</p>
          <div className={styles.orderFormCard}>
            <FormField label="アプリ内注文番号（自動生成／変更不可）" value="ORD-20260826-0012" />
            <div className={cn(styles.formField, styles.salesChannelField)}>
              <span>販売先</span>
              <div className={styles.salesChannelControl}>
                <select defaultValue="メルカリ" aria-label="販売先">
                  <option>メルカリ</option>
                  <option>Yahoo!フリマ</option>
                </select>
                <span aria-hidden="true">⌄</span>
              </div>
            </div>
            <FormField label="販売先の取引ID" placeholder="例）TX-260826-012" />
            <FormField label="購入者表示名（任意）" placeholder="例）たろう" />
            <small className={styles.fieldHint}>匿名配送なら住所は保存しません</small>
          </div>
        </section>
      );
    case "35":
      return (
        <section className={styles.contentStack}>
          <p className={styles.boardInstruction}>手順にそって取り出してください</p>
          <div className={styles.pickupChecklist}>
            <div className={styles.pickupChecklistRow}>
              <CheckMark tone="green" />
              <div>
                <strong>商品を確認済み</strong>
                <small>商品コード・数量を確認しました　10:18</small>
              </div>
            </div>
            <div className={styles.pickupChecklistRow}>
              <CheckMark tone="green" />
              <div>
                <strong>棚を確認済み</strong>
                <small>棚A・2段目・箱3を確認しました　10:19</small>
              </div>
            </div>
          </div>
          <div className={styles.pickupShelfPhoto}>
            <strong>保管場所の写真</strong>
            <div className={styles.pickupShelfImageWrap}>
              <AssetImage
                src="/approved-assets/shipping/mobile-pickup-shelf-approved.png"
                alt="注文商品の保管場所"
                className={styles.pickupShelfAsset}
              />
            </div>
          </div>
          <div className={styles.pickupCheck}>
            <CheckMark tone="green" />
            <div>
              <strong>商品と棚が一致しました</strong>
              <small>一致</small>
            </div>
          </div>
        </section>
      );
    case "36":
      return (
        <section className={styles.contentStack}>
          <div className={styles.salesChannelChip}>メルカリで使える方法を選んでください</div>
          <div className={styles.shippingOptions}>
            <ShippingMethodRow
              label="ゆうパケットポストmini"
              fee="160円"
              active={choice === "first"}
              onClick={() => setChoice("first")}
            />
            <ShippingMethodRow
              label="ネコポス"
              fee="210円"
              active={choice === "second"}
              onClick={() => setChoice("second")}
            />
            <ShippingMethodRow
              label="ゆうパケットポスト"
              fee="215円"
              active={choice === "third"}
              onClick={() => setChoice("third")}
            />
            <ShippingMethodRow
              label="宅急便コンパクト"
              fee="450円＋箱"
              active={choice === "none"}
              onClick={() => setChoice("none")}
            />
            <ShippingMethodRow
              label="ゆうパケットプラス"
              fee="455円"
              active={false}
              onClick={() => setChoice("none")}
            />
          </div>
          <button type="button" className={styles.textAction}>
            ほかのサイズを見る　›
          </button>
          <div className={styles.officialDate}>
            <svg className={styles.officialCheckIcon} viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 2.8 19 5.6v5.2c0 4.7-2.8 8.1-7 10.4-4.2-2.3-7-5.7-7-10.4V5.6L12 2.8Z" />
              <path d="m8.7 11.8 2.1 2.1 4.6-5" />
            </svg>
            <strong>公式確認　2026/08/26</strong>
          </div>
        </section>
      );
    case "37":
      return (
        <section className={styles.contentStack}>
          <p className={styles.boardInstruction}>内容を確認してください</p>
          <div className={cn(styles.summaryRows, styles.shippingReviewRows)}>
            <DataRow label="商品" value="オックスフォードシャツ" />
            <DataRow label="販売先" value="メルカリ" />
            <DataRow label="取引ID" value="TX-260826-012" />
            <DataRow label="配送方法" value="ネコポス" />
            <DataRow label="送料" value="210円" />
          </div>
          <button type="button" className={styles.outlineButton}>
            公式料金を確認
          </button>
          <div className={styles.warningBanner}>⚠ 料金は変わることがあります</div>
        </section>
      );
    case "38":
      return (
        <section className={styles.contentStack}>
          <p className={styles.boardInstruction}>内容を記録してください</p>
          <div className={cn(styles.confirmRow, styles.shipConfirm)}>
            <CheckMark tone="green" />
            <div>
              <strong>確認済み</strong>
              <small>記録日時：2026/08/26 15:30</small>
            </div>
          </div>
          <div className={styles.shippingDetailsCard}>
            <DataRow label="配送方法" value="ネコポス" />
            <DataRow label="送料" value="210円" />
            <DataRow label="発送日時" value="2026/08/26 15:30" />
            <DataRow label="担当" value="本人" />
          </div>
          <div className={styles.settingsCard}>
            <strong>⚙ 送料一覧</strong>
            <small>
              メルカリ / Yahoo!フリマ・オークション
              <br />
              公式確認日つき
            </small>
            <button type="button">送料一覧を編集　›</button>
          </div>
        </section>
      );
    case "39":
      return (
        <section className={styles.contentStack}>
          <div className={styles.filterBarSingle}>
            <span>今日の担当</span>
            <strong>すべて　⌄</strong>
          </div>
          <p className={styles.boardInstruction}>確認する内容</p>
          <div className={styles.mismatchList}>
            <ExceptionCard icon="⌕" label="見つからない" count="3件" />
            <ExceptionCard icon="▥" label="別の棚にある" count="2件" />
            <ExceptionCard icon="□" label="予定外の商品" count="1件" />
          </div>
        </section>
      );
    case "40":
      return (
        <section className={styles.contentStack}>
          <div className={styles.filterBarSingle}>
            <span>今日の担当</span>
            <strong>すべて　⌄</strong>
          </div>
          <p className={styles.instruction}>仮状態にする前に確認してください</p>
          <div className={styles.exceptionCheckCard}>
            <ListRow icon="▣" title="商品を再確認" detail="" status="✓" tone="ok" />
            <ListRow icon="▥" title="棚を再確認" detail="" status="✓" tone="ok" />
            <ListRow icon="□" title="写真" detail="" status="✓" tone="ok" />
            <ListRow icon="!" title="理由" detail="" status="✓" tone="ok" />
          </div>
          <div className={styles.longPressPanel}>
            <div>
              <h2>
                仮状態にする場合は
                <br />
                下のボタンを3秒押してください
              </h2>
            </div>
            <LongPressHand />
          </div>
        </section>
      );
    case "41":
      return (
        <section className={styles.contentStack}>
          <div className={styles.filterBarSingle}>
            <span>今日の担当</span>
            <strong>すべて　⌄</strong>
          </div>
          <p className={styles.instruction}>商品を確認してください</p>
          <div className={styles.restoreRows}>
            <ListRow icon="◇" title="商品番号" detail="AH-3201-7782" />
            <ListRow icon="▥" title="現在の棚" detail="B-12-04" />
          </div>
          <div className={styles.restoreHero}>
            <CheckMark tone="green" />
            <div>
              <h2>再確認済み</h2>
            </div>
          </div>
          <div className={styles.historyCard}>
            <span>履歴</span>
            <strong>2025/05/20 10:35 に仮状態にしました</strong>
          </div>
        </section>
      );
    case "42":
      return (
        <section className={styles.contentStack}>
          <div className={styles.filterBarSingle}>
            <span>今日の担当</span>
            <strong>すべて　⌄</strong>
          </div>
          <p className={styles.instruction}>返品商品を確認してください</p>
          <div className={styles.returnDetailsList}>
            <div className={styles.returnDetailCard}>
              <span className={styles.returnDetailIcon}>⌾</span>
              <div>
                <small>別場所で保管</small>
                <strong>返品棚　R-01</strong>
              </div>
              <span className={styles.chevron}>›</span>
            </div>
            <div className={styles.returnDetailCard}>
              <span className={styles.returnDetailIcon}>□</span>
              <div>
                <small>状態</small>
                <strong>箱に傷あり・未使用</strong>
              </div>
              <span className={styles.chevron}>›</span>
            </div>
            <div className={styles.returnDetailCard}>
              <span className={styles.returnDetailIcon}>↻</span>
              <div>
                <small>再販売できるか</small>
                <strong>再販売可能</strong>
              </div>
              <span className={styles.chevron}>›</span>
            </div>
          </div>
          <div className={styles.returnHumanCheck}>
            <strong>人の確認</strong>
            <div className={styles.returnHumanRows}>
              <div className={styles.returnHumanRow}>
                <CheckMark tone="green" />
                <span>担当者が確認しました</span>
              </div>
              <div className={styles.returnHumanRowWarning}>
                <span>!</span>
                <span>気になる点が1件あります</span>
              </div>
            </div>
          </div>
        </section>
      );
    case "43":
      return (
        <section className={styles.contentStack}>
          <div className={styles.filterBarSingle}>
            <span>今日の担当</span>
            <strong>すべて　⌄</strong>
          </div>
          <p className={styles.instruction}>事実を分けて確認してください</p>
          <div className={styles.salesFactList}>
            <div className={styles.salesFactRow}>
              <span className={styles.salesFactIcon}>▣</span>
              <strong>売上</strong>
              <b>¥18,800</b>
            </div>
            <div className={styles.salesFactRow}>
              <span className={styles.salesFactIcon}>◷</span>
              <strong>手数料</strong>
              <b>¥1,900</b>
            </div>
            <div className={styles.salesFactRow}>
              <span className={styles.salesFactIcon}>▤</span>
              <strong>送料</strong>
              <b>¥600</b>
            </div>
            <div className={styles.salesFactRow}>
              <span className={styles.salesFactIcon}>◎</span>
              <strong>仕入れ代</strong>
              <b>¥9,200</b>
            </div>
          </div>
          <div className={styles.salesFactNotice}>金額は事実ごとに分けて記録します</div>
        </section>
      );
    case "44":
      return (
        <section className={styles.contentStack}>
          <p className={styles.boardInstruction}>
            会計ファイルの作成に必要な設定を
            <br />
            確認してください。
          </p>
          <div className={styles.accountList}>
            <SettingCard
              icon="▤"
              label="申告の設定"
              detail="申告区分や提出方法などの設定を確認してください。"
            />
            <SettingCard
              icon="▦"
              label="消費税"
              detail="課税方式や課税売上などの設定を確認してください。"
            />
            <SettingCard
              icon="▦"
              label="会計年度"
              detail="会計年度の開始日と終了日を設定してください。"
            />
          </div>
          <div className={cn(styles.infoBanner, styles.accountHelper)}>
            設定した内容は、いつでも変更できます。
            <br />
            内容をご確認のうえ、人が確認してください。
          </div>
        </section>
      );
    case "45":
      return (
        <section className={styles.contentStack}>
          <p className={styles.boardInstruction}>
            候補として提出された項目を確認し、
            <br />
            必要な項目を確認してください
          </p>
          <div className={styles.accountCandidateRows}>
            {[
              ["▣", "売上", "売上に関する取引の候補です。"],
              ["▤", "販売手数料", "販売手数料に関する取引の候補です。"],
              ["▧", "送料", "送料に関する取引の候補です。"],
              ["▥", "仕入れ代", "仕入れに関する取引の候補です。"],
            ].map(([icon, title, detail]) => (
              <div className={styles.accountCandidateRow} key={title}>
                <span className={styles.accountCandidateIcon}>{icon}</span>
                <div>
                  <strong>{title}</strong>
                  <small>{detail}</small>
                </div>
                <b>候補・人が確認</b>
              </div>
            ))}
          </div>
          <div className={cn(styles.infoBanner, styles.accountHelper)}>
            候補は自動で確定されません。
            <br />
            最終的に人が内容を確認します。
          </div>
        </section>
      );
    case "46":
      return (
        <section className={styles.contentStack}>
          <p className={styles.instruction}>
            会計ファイルを作成する前に、
            <br />
            以下の項目を確認してください。
          </p>
          <div className={styles.preflightRowsApproved}>
            <PreflightRow label="設定" detail="すべての設定が完了しています。" />
            <PreflightRow label="資料" detail="必要な資料がそろっています。" />
            <PreflightRow label="重複" detail="重複の可能性は検出されていません。" />
          </div>
          <div className={styles.readyToCreate}>
            <CheckMark tone="green" />
            <strong>作成できます</strong>
            <small>
              この内容で会計ファイルを作成できます。
              <br />
              人が最終確認してください。
            </small>
          </div>
        </section>
      );
    case "47":
      return (
        <section className={styles.contentStack}>
          <div className={styles.accountRows}>
            <DataRow label="列名" value="主要な列の一覧を確認できます。⌄" />
            <DataRow label="件数" value="5件" />
            <div className={styles.csvPreviewRow}>
              <strong>先頭行（抜粋）</strong>
              <small>先頭の行を表示しています。</small>
              <div className={styles.csvMiniTable}>
                <b>日付</b>
                <b>取引区分</b>
                <b>金額（円）</b>
                <b>摘要</b>
                <span>2024/04/01</span>
                <span>売上</span>
                <span>120,000</span>
                <span>商品A売上</span>
              </div>
            </div>
          </div>
          <div className={styles.infoBanner}>
            このファイルは外部へ自動送信しません。
            <br />
            ダウンロードして内容を確認してください。
          </div>
        </section>
      );
    case "48":
      return (
        <section className={styles.contentStack}>
          <p className={styles.boardInstruction}>
            作成したファイルを会計ソフトへ
            <br />
            手動で取込んだ結果を選択してください。
          </p>
          <div className={styles.importChoices}>
            <ChoiceCard
              label="取込できた"
              detail="すべてのデータを取込できました。"
              active={choice === "first"}
              onClick={() => setChoice("first")}
            />
            <ChoiceCard
              label="一部できなかった"
              detail="一部のデータが取込できませんでした。"
              active={choice === "second"}
              onClick={() => setChoice("second")}
              tone="amber"
            />
            <ChoiceCard
              label="取込していない"
              detail="まだ取込を行っていません。"
              active={choice === "third"}
              onClick={() => setChoice("third")}
            />
          </div>
          <label className={styles.memoField}>
            <span>メモ（任意）</span>
            <textarea placeholder="メモを入力してください" rows={4} />
            <small>0/200</small>
          </label>
        </section>
      );
    case "49":
      return (
        <section className={styles.contentStack}>
          <p className={styles.boardInstruction}>会計ファイルの作成と取込の履歴を確認できます</p>
          <div className={styles.timeline}>
            <HistoryEntry
              date="2024/04/28 10:15"
              detail="会計ファイル（5件）"
              status="ダウンロード済み"
              tone="blue"
            />
            <HistoryEntry
              date="2024/04/25 16:42"
              detail="会計ファイル（5件）"
              status="取込確認済み"
              tone="green"
            />
            <HistoryEntry
              date="2024/04/20 09:30"
              detail="会計ファイル（4件）"
              status="置き換え済み"
              tone="amber"
            />
            <HistoryEntry
              date="2024/04/15 14:08"
              detail="会計ファイル（4件）"
              status="取込確認済み"
              tone="green"
            />
            <HistoryEntry
              date="2024/04/10 11:22"
              detail="会計ファイル（3件）"
              status="置き換え済み"
              tone="amber"
            />
          </div>
        </section>
      );
    case "photo-01":
      return (
        <section className={styles.contentStack}>
          <PhotoSavedNotice />
          <p className={styles.boardInstruction}>商品ごとにまとめます</p>
          <PhotoStrip active={5} />
        </section>
      );
    case "photo-02":
      return (
        <section className={styles.contentStack}>
          <div className={styles.storagePath}>
            <span>商品</span>
            <b>›</b>
            <span>AP-2608-0142</span>
            <b>›</b>
            <strong>写真</strong>
          </div>
          <div className={styles.storageRows}>
            <StorageRow label="正面" />
            <StorageRow label="背面" />
            <StorageRow label="タグ2枚" />
            <StorageRow label="気になる箇所" />
          </div>
          <div className={styles.externalNotice}>
            <LockIcon />
            <div>
              <strong>PC内の非公開写真保管庫</strong>
              <span>✓ GitHub・Slack・Notionには保存しません</span>
              <span>✓ 原本は上書きしません</span>
            </div>
          </div>
        </section>
      );
    case "photo-03":
      return (
        <section className={styles.contentStack}>
          <p className={styles.boardInstruction}>編集前に人が確認</p>
          <div className={styles.metadataRows}>
            <div>
              <strong>ブランド</strong>
              <span>CleanStyle</span>
              <button type="button" aria-label="ブランドを編集">
                ✎
              </button>
            </div>
            <div>
              <strong>サイズ</strong>
              <span>M</span>
              <button type="button" aria-label="サイズを編集">
                ✎
              </button>
            </div>
            <div>
              <strong>色</strong>
              <span>ネイビー</span>
              <button type="button" aria-label="色を編集">
                ✎
              </button>
            </div>
            <div>
              <strong>素材</strong>
              <span>綿100%</span>
              <button type="button" aria-label="素材を編集">
                ✎
              </button>
            </div>
          </div>
          <div className={styles.humanConfirmAmber}>
            <HumanConfirmIcon />
            <span>人が確認</span>
          </div>
        </section>
      );
    case "photo-04":
      return (
        <section className={styles.contentStack}>
          <p className={styles.boardInstruction}>役割ごとに適したレシピを選択してください</p>
          <div className={styles.recipeList}>
            <RecipeOption
              label="正面・背面"
              detail="白背景／中央／余白"
              onClick={() => setChoice("first")}
              visual={
                <AssetImage
                  src="/approved-assets/mobile-fidelity/short-sleeve-front.png"
                  alt="正面と背面の編集例"
                  className={styles.recipeAsset}
                />
              }
            />
            <RecipeOption
              label="正面だけ"
              detail="ブランド左上・サイズ右下"
              onClick={() => setChoice("second")}
              visual={
                <AssetImage
                  src="/approved-assets/mobile-fidelity/short-sleeve-front.png"
                  alt="正面だけの編集例"
                  className={styles.recipeAsset}
                />
              }
            />
            <RecipeOption
              label="タグ・気になる箇所"
              detail="向き／明るさのみ"
              onClick={() => setChoice("third")}
              visual={
                <span className={styles.recipePhotoPair}>
                  <AssetImage
                    src="/approved-assets/product/brand-tag.png"
                    alt="ブランドタグ"
                    className={styles.recipeAsset}
                  />
                  <AssetImage
                    src="/approved-assets/product/defect-detail.png"
                    alt="気になる箇所"
                    className={styles.recipeAsset}
                  />
                </span>
              }
            />
          </div>
          <div className={styles.recipeInfoBlue}>ⓘ 役割ごとに型を設定</div>
        </section>
      );
    case "photo-05":
      return (
        <section className={styles.contentStack}>
          <p className={styles.boardInstruction}>現在の利用可能な方法</p>
          <div className={styles.methodCards}>
            <MethodOption
              kind="wand"
              label="自作画像編集（準備中）"
              detail="同じレシピで将来差し替え"
              active={choice === "third"}
              status="準備中"
              onClick={() => setChoice("third")}
            />
            <MethodOption
              kind="folder"
              label="編集用セットを作る"
              detail="PCで本人が編集する"
              active={choice === "first"}
              onClick={() => setChoice("first")}
            />
            <MethodOption
              kind="play"
              label="編集せず進む"
              detail="原本をそのまま使用"
              active={choice === "second"}
              onClick={() => setChoice("second")}
            />
          </div>
          <div className={styles.infoBanner}>外部アプリを自動操作しません。</div>
        </section>
      );
    case "photo-06":
      return (
        <section className={styles.contentStack}>
          <div className={styles.photoBundleCard}>
            <div className={styles.photoBundleHeading}>
              <span className={styles.zipIcon}>ZIP</span>
              <strong>5枚を1つにまとめる</strong>
            </div>
            <div className={styles.photoBundleFiles}>
              <span>AP-2608-0142_01_front.jpg</span>
              <span>AP-2608-0142_02_back.jpg</span>
              <span>AP-2608-0142_03_brand-tag.jpg</span>
              <span>…</span>
            </div>
          </div>
          <div className={styles.photoBundleCard}>
            <div className={styles.photoBundleMeta}>
              <span>manifest</span>
              <b>JSON</b>
            </div>
            <div className={styles.photoBundleMeta}>
              <span>編集レシピ</span>
              <b>JSON</b>
            </div>
          </div>
          <div className={styles.bundleGreenNotice}>
            <CheckMark tone="green" />
            <strong>位置情報を除いたコピー</strong>
          </div>
          <div className={styles.bundleBlueNotice}>ⓘ 原本はアプリに残ります。</div>
        </section>
      );
    case "photo-07":
      return (
        <section className={styles.contentStack}>
          <button type="button" className={styles.fileChooseButton}>
            ZIPまたは画像を選ぶ
          </button>
          <div className={styles.photoMatchBanner}>
            <CheckMark tone="green" />
            <strong>5 / 5枚 一致</strong>
          </div>
          <div className={cn(styles.beforeAfter, styles.beforeAfterCompact)}>
            <div>
              <span>加工前</span>
              <AssetImage
                src="/approved-assets/mobile-fidelity/short-sleeve-front.png"
                alt="編集前の原本"
                className={styles.beforeAfterAsset}
              />
            </div>
            <span className={styles.compareArrow}>→</span>
            <div className={styles.editedFrame}>
              <span>加工後</span>
              <AssetImage
                src="/approved-assets/mobile-fidelity/short-sleeve-front.png"
                alt="加工後の画像"
                className={styles.beforeAfterAsset}
              />
            </div>
          </div>
          <div className={styles.approveChecklist}>
            <ListRow icon="✓" title="色を確認" detail="原本と加工後を比較" status="✓" tone="ok" />
            <ListRow icon="✓" title="ロゴを確認" detail="位置と形を比較" status="✓" tone="ok" />
            <ListRow icon="✓" title="傷を確認" detail="気になる箇所を比較" status="✓" tone="ok" />
          </div>
          <div className={styles.infoBanner}>
            <span>・契約済み編集ソフトで手動編集</span>
            <span>・将来の自作編集も同じ確認</span>
          </div>
        </section>
      );
    case "box-01":
      return (
        <section className={styles.contentStack}>
          <div className={styles.boxEntryList}>
            <BoxEntryRow label="仕入箱番号" value="BOX-2026-014" />
            <BoxEntryRow label="仕入先" value="卸A" />
            <BoxEntryRow label="仕入日" value="2026/08/26" icon="▣" />
            <BoxEntryRow label="箱の仕入額" value="¥75,000" />
            <BoxEntryRow label="入っている数" value="まだ不明" />
          </div>
          <div className={styles.boxInfoCard}>
            <span>ⓘ</span>
            <strong>点数は箱を開けて数えます</strong>
          </div>
        </section>
      );
    case "box-02":
      return (
        <section className={styles.contentStack}>
          <div className={styles.counterHero}>
            <span>箱の中を数える</span>
            <strong>48点</strong>
            <small>数えてから検品を始めます</small>
          </div>
          <div className={styles.counterButtons}>
            <button type="button" onClick={() => setSaved(true)}>
              ＋1点
            </button>
            <button type="button" onClick={() => setSaved(false)}>
              1点戻す
            </button>
          </div>
          <div className={styles.boxCountInfo}>
            <span>ⓘ</span>
            <strong>数えてから検品を始めます</strong>
          </div>
        </section>
      );
    case "box-03":
      return (
        <section className={styles.contentStack}>
          <div className={styles.quickProgress}>
            <span>1 / 48</span>
            <i>
              <b />
            </i>
          </div>
          <div className={styles.quickProductCard}>
            <AssetImage
              src="/approved-assets/product/box-item-shirt.png"
              alt="仮登録する商品"
              className={styles.quickProductAsset}
            />
            <div className={styles.quickNumberBlock}>
              <strong>0128</strong>
              <span>商品番号</span>
            </div>
          </div>
          <div className={styles.boxDetailsCard}>
            <DataRow label="ブランド" value="CleanStyle" />
            <DataRow label="種類" value="Tシャツ" />
            <DataRow label="状態" value="販売候補" tone="ok" />
            <DataRow label="価格の目安" value="¥3,000〜4,000" />
          </div>
        </section>
      );
    case "box-04":
      return (
        <section className={styles.contentStack}>
          <div className={styles.deferredList}>
            <button
              type="button"
              className={styles.deferredCard}
              onClick={() => setChoice("first")}
            >
              <span className={styles.deferredIcon}>↑</span>
              <span>
                <strong>高く売れそう</strong>
                <small>優先して詳しく調査</small>
              </span>
              <b>5点</b>
              <i>›</i>
            </button>
            <button
              type="button"
              className={styles.deferredCard}
              onClick={() => setChoice("second")}
            >
              <span className={styles.deferredIcon}>⌕</span>
              <span>
                <strong>状態を確認</strong>
                <small>汚れ・傷を詳しく確認</small>
              </span>
              <b>3点</b>
              <i>›</i>
            </button>
          </div>
          <div className={styles.boxReviewNote}>ⓘ 全商品を最初から詳しく調べません</div>
        </section>
      );
    case "box-05":
      return (
        <section className={styles.contentStack}>
          <div className={styles.boxMetricsCard}>
            <DataRow label="実数" value="48着" />
            <DataRow label="販売候補" value="39着" className={styles.metricGreen} />
            <DataRow label="見込売上" value="¥138,000〜169,000" className={styles.metricBlue} />
            <DataRow label="仕入額" value="¥75,000" />
            <DataRow
              label="見込手数料・送料"
              value="¥32,000〜41,000"
              className={styles.metricOrange}
            />
            <DataRow label="見込粗利" value="¥31,000〜53,000" className={styles.metricGreen} />
            <DataRow label="損益分岐" value="24着" />
          </div>
          <div className={styles.reviewBadgeAmber}>⚠ 見込み・人が確認</div>
        </section>
      );
    case "box-06":
      return (
        <section className={styles.contentStack}>
          <div className={styles.boxMetricsCard}>
            <DataRow label="販売済み" value="31 / 48着" className={styles.metricGreen} />
            <DataRow label="実売上" value="¥124,000" className={styles.metricGreen} />
            <DataRow label="実手数料・送料" value="¥29,600" className={styles.metricGreen} />
            <DataRow label="仕入額" value="¥75,000" />
            <DataRow label="実粗利" value="¥19,400" className={styles.metricGreen} />
            <DataRow label="未販売" value="17着" className={styles.metricOrange} />
          </div>
          <div className={styles.confirmRow}>
            <span className={styles.barChartIcon}>▮▮▮</span>
            <strong>販売記録から集計</strong>
          </div>
        </section>
      );
    case "box-07":
      return (
        <section className={styles.contentStack}>
          <div className={styles.boxMetricsCard}>
            <DataRow label="30日販売率（回転）" value="35%" />
            <DataRow label="9月 売上見込" value="¥54,000" className={styles.metricGreen} />
            <DataRow label="9月 粗利見込" value="¥16,000" className={styles.metricGreen} />
            <DataRow label="10月 売上見込" value="¥47,000" className={styles.metricGreen} />
            <DataRow label="10月 粗利見込" value="¥13,000" className={styles.metricGreen} />
            <DataRow label="残り在庫" value="31着" />
          </div>
          <div className={styles.reviewBadgeAmber}>⚠ 見込み・人が確認</div>
          <div className={styles.boxKpiNote}>ⓘ 運用の参考値です</div>
        </section>
      );
    case "sales-01":
      return (
        <section className={styles.contentStack}>
          <div className={styles.salesTargetSelect}>
            <strong>販売先A</strong>
            <span>⌄</span>
          </div>
          <div className={styles.salesCandidateList}>
            <SalesCandidateCard icon="◷" label="今週見直す" count="3件" />
            <SalesCandidateCard icon="◒" label="季節に合う" count="2件" />
            <SalesCandidateCard icon="!" label="値下げ依頼あり" count="1件" />
          </div>
          <div className={styles.salesInfoCard}>
            <span>ⓘ</span>
            <strong>自動で価格は変えません</strong>
            <small>予定や判断は人が確認します。</small>
          </div>
        </section>
      );
    case "sales-02":
      return (
        <section className={styles.contentStack}>
          <div className={styles.salesProductHead}>
            <AssetImage
              src="/approved-assets/mobile-fidelity/sales-product-beige-jacket.png"
              alt="ベージュのジャケット"
              className={styles.salesProductAsset}
            />
            <div>
              <span>AP-2608-0142</span>
              <h2>メンズジャケット</h2>
              <small>ベージュ / M</small>
            </div>
          </div>
          <div className={styles.salesActualCard}>
            <DataRow label="出品から" value="18日" />
            <DataRow label="現在" value="¥6,800" />
            <DataRow label="下限" value="¥5,900" />
            <DataRow label="閲覧" value="128" />
            <DataRow label="いいね" value="7" />
          </div>
          <div className={styles.infoBanner}>
            ⓘ 公式画面を見て入力　最新の情報を入力してください。
          </div>
        </section>
      );
    case "sales-03":
      return (
        <section className={styles.contentStack}>
          <div className={styles.salesReasonCards}>
            <div className={styles.salesReasonCard}>
              <span className={cn(styles.salesReasonIcon, styles.salesReasonBlue)}>▥</span>
              <div>
                <strong>自分の販売履歴</strong>
                <b>同じ種類は平均21日</b>
                <small>過去の販売データをもとに算出しています。</small>
              </div>
            </div>
            <div className={styles.salesReasonCard}>
              <span className={cn(styles.salesReasonIcon, styles.salesReasonGreen)}>♧</span>
              <div>
                <strong>季節</strong>
                <b>9月は秋物の準備時期</b>
                <small>公開情報をもとに判断しています。</small>
              </div>
            </div>
            <div className={styles.salesReasonCard}>
              <span className={cn(styles.salesReasonIcon, styles.salesReasonPurple)}>▤</span>
              <div>
                <strong>公式公開情報</strong>
                <b>確認 2026/08/26</b>
                <small>公式の公開情報をもとにしています。</small>
              </div>
            </div>
          </div>
          <div className={styles.humanReviewNote}>
            👤 参考・人が確認　この提案は参考の表示です。
          </div>
          <div className={styles.infoBanner}>
            ⓘ 販売サイトから自動取得しません。人が確認した情報です。
          </div>
        </section>
      );
    case "sales-04":
      return (
        <section className={styles.contentStack}>
          <div className={styles.priceCompare}>
            <button
              type="button"
              className={cn(choice === "first" && styles.priceChoiceActive)}
              onClick={() => setChoice("first")}
            >
              <span>5% OFF</span>
              <strong>¥6,460</strong>
              <small>粗利見込 ¥1,660</small>
            </button>
            <button
              type="button"
              className={cn(choice === "second" && styles.priceChoiceActive)}
              onClick={() => setChoice("second")}
            >
              <span>10% OFF　おすすめ</span>
              <strong>¥6,120</strong>
              <small>粗利見込 ¥1,320</small>
            </button>
            <button type="button" className={styles.priceChoiceBlocked} disabled>
              <span>15% OFF</span>
              <strong>¥5,780</strong>
              <small>下限より低い</small>
            </button>
          </div>
          <div className={styles.priceGuidance}>
            <strong>ⓘ 正解を固定せず利益も確認</strong>
            <small>大切なのは利益が残るか。見ながら決めることです。</small>
          </div>
        </section>
      );
    case "sales-05":
      return (
        <section className={styles.contentStack}>
          <div className={styles.salesEventCards}>
            <div className={styles.salesEventCard}>
              <span className={cn(styles.salesEventIcon, styles.salesEventIconGreen)}>♧</span>
              <div>
                <span>衣替え</span>
                <strong>9月上旬</strong>
                <small>出典・確認日：公開情報 2026/08/26</small>
                <small className={styles.salesEventCheck}>
                  <CheckMark tone="green" />
                  この商品に合うか確認
                </small>
              </div>
              <b>›</b>
            </div>
            <div className={styles.salesEventCard}>
              <span className={cn(styles.salesEventIcon, styles.salesEventIconGreen)}>▦</span>
              <div>
                <span>Green Friday / Black Friday</span>
                <strong>11月</strong>
                <small>出典・確認日：公開情報 2026/08/26</small>
                <small className={styles.salesEventCheck}>
                  <CheckMark tone="green" />
                  この商品に合うか確認
                </small>
              </div>
              <b>›</b>
            </div>
            <div className={styles.salesEventCard}>
              <span className={cn(styles.salesEventIcon, styles.salesEventIconGreen)}>♧</span>
              <div>
                <span>クリスマス前</span>
                <strong>12月上旬</strong>
                <small>出典・確認日：公開情報 2026/08/26</small>
                <small className={styles.salesEventCheck}>
                  <CheckMark tone="green" />
                  この商品に合うか確認
                </small>
              </div>
              <b>›</b>
            </div>
          </div>
          <div className={styles.humanReviewNote}>
            👤 予定・人が確認　行事が合うかは人が判断します。
          </div>
        </section>
      );
    case "sales-06":
      return (
        <section className={styles.contentStack}>
          <div className={styles.salesManualSummary}>
            <DataRow label="候補" value="¥6,120" />
            <DataRow label="見込み粗利" value="¥1,320" />
            <DataRow label="下限より" value="¥220上" tone="ok" />
          </div>
          <div className={styles.salesManualActions}>
            <button type="button" className={styles.salesManualAction}>
              <span>↗</span>
              <strong>公式の価格機能を開く</strong>
              <small>公式画面で本人が操作</small>
              <b>›</b>
            </button>
            <button type="button" className={styles.salesManualAction}>
              <span>▤</span>
              <strong>変更内容をコピー</strong>
              <small>価格や理由をコピーします</small>
              <b>›</b>
            </button>
          </div>
          <div className={styles.salesManualNotice}>
            ⓘ このアプリは自動値下げしません。価格の変更は公式画面で本人が行ってください。
          </div>
        </section>
      );
    case "genre-suit-01":
      return <GenreComposition />;
    case "genre-suit-02":
      return <GenreChecklist items={suitJacketItems} doneCount={6} />;
    case "genre-suit-03":
      return <GenreChecklist items={suitPantsItems} doneCount={6} />;
    case "genre-suit-04":
      return <GenreComposition setup />;
    case "genre-suit-05":
      return <GenreChecklist items={setupTopItems} doneCount={5} />;
    case "genre-suit-06":
      return <GenreChecklist items={setupBottomItems} doneCount={5} finalNote="不足 0点" />;
    default:
      return (
        <section className={styles.contentStack}>
          <div className={styles.emptyState}>
            <Logo />
            <h2>画面を読み込めません</h2>
            <p>一覧から画面を選び直してください。</p>
          </div>
        </section>
      );
  }
}

export function ApprovedMobileDemo({ screenId }: { screenId: string }) {
  const screen = getMobileScreen(screenId);
  if (!screen) return null;
  const index = getMobileScreenIndex(screen.id);
  const next = getMobileNext(screen.id);
  const isFirst = index === 0;

  return (
    <main className={styles.page}>
      <div className={styles.phoneShell}>
        {screen.id === "01" ? null : <Header screen={screen} isFirst={isFirst} />}
        <div className={styles.scrollArea}>
          <RenderScreenContent id={screen.id} />
          <ActionBar screen={screen} next={next} />
        </div>
        <Footer screen={screen} />
      </div>
    </main>
  );
}

export function ApprovedMobileIndex() {
  const groups = mobileScreens.reduce<Record<string, MobileScreen[]>>((accumulator, screen) => {
    const group = accumulator[screen.group] ?? [];
    group.push(screen);
    accumulator[screen.group] = group;
    return accumulator;
  }, {});
  return (
    <main className={styles.indexPage}>
      <div className={styles.indexHeader}>
        <Logo />
        <div>
          <span>承認済みUI</span>
          <h1>モバイル画面一覧</h1>
          <p>49画面＋追加26画面を、前後ボタンで確認できます。</p>
        </div>
        <span className={styles.indexSafety}>無料・外部接続なし</span>
      </div>
      <div className={styles.indexLegend}>
        <span>
          <i className={styles.dotBlue} />
          canonical 01–49
        </span>
        <span>
          <i className={styles.dotGreen} />
          承認済み追加フロー
        </span>
        <span>人が確認して進む</span>
      </div>
      <div className={styles.indexGroups}>
        {Object.entries(groups).map(([group, screens]) => (
          <section className={styles.indexGroup} key={group}>
            <div className={styles.indexGroupHead}>
              <h2>{group}</h2>
              <span>{screens.length}画面</span>
            </div>
            <div className={styles.indexGrid}>
              {screens.map((screen) => (
                <a
                  className={styles.indexCard}
                  href={`/mobile/screens/${screen.id}`}
                  key={screen.id}
                >
                  <span className={styles.indexNumber}>
                    {screen.id.length <= 2 ? screen.id : "＋"}
                  </span>
                  <span>
                    <strong>{screen.title}</strong>
                    <small>{screen.primary}</small>
                  </span>
                  <span className={styles.chevron}>›</span>
                </a>
              ))}
            </div>
          </section>
        ))}
      </div>
      <div className={styles.indexFooter}>
        正本デザインに沿った実装確認用。外部API・DB更新・自動公開はありません。
      </div>
    </main>
  );
}

export const approvedMobileScreenCount = mobileScreens.length;
