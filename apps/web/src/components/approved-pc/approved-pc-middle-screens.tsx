"use client";
import { type ChangeEvent, useEffect, useRef, useState } from "react";
import {
  APPROVED_PC_LISTING_DESCRIPTION,
  getApprovedPcListingStorage,
  loadApprovedPcListingDraft,
  writeApprovedPcListingDraft,
} from "../../lib/approved-listing-draft";
import { copyResearchText } from "../../lib/product-research-handoff";
import { formatPriceCandidate } from "../../lib/price-candidate";
import {
  filterSavedProducts,
  getSavedProductPageSummary,
  type SavedProductFilter,
} from "../../lib/saved-product-gallery";
import {
  createSalesCheckDrafts,
  getSalesCheckAge,
  orderSalesCheckItems,
  SALES_CHECK_ITEMS,
  SALES_CHECK_REFERENCE_DATE,
  type SalesCheckDraftField,
  updateSalesCheckDraft,
} from "../../lib/sales-check-draft";
import {
  isCurrentSalesCheckImagePreview,
  releaseSalesCheckImagePreviews,
  replaceSalesCheckImagePreview,
  SALES_CHECK_IMAGE_ACCEPT,
  type SalesCheckImagePreview,
  validateSalesCheckImageDimensions,
  validateSalesCheckImageFile,
} from "../../lib/sales-check-image";
import styles from "./approved-pc-middle-screens.module.css";
import { PcCanvas } from "./pc-canvas";
import { PcPreviewActionButton } from "./pc-preview-action-button";
import { PcUiGlyph, pcNavGlyphs } from "./pc-ui-glyph";
import { isP1ApprovedPcScreen } from "./approved-screen-scope";

const names = [
  "商品の写真",
  "写真の編集方法",
  "加工後を確認",
  "採寸",
  "タグの文字",
  "商品まとめ",
  "商品説明の候補",
  "公式画面へ移る",
  "保存した商品ページ",
  "販売状況を確認",
  "価格候補を比べる",
  "返信文と本人操作",
  "注文を記録",
  "商品を取り出す",
  "発送前の写真",
  "配送方法と発送",
];
const nav = ["ホーム", "作業", "仕入れ", "商品", "注文・発送", "在庫", "会計", "メンバー", "設定"];
const to = (n: number) => `/pc/${n}`;
function Button({ n, children }: { n: number; children: string }) {
  return (
    <a className={styles.primary} href={to(n + 1)}>
      {children}　›
    </a>
  );
}
function StandardHeader({ n }: { n: number }) {
  const workDetail = n >= 21 && n <= 24;
  const preview = isP1ApprovedPcScreen(n);
  return (
    <header className={`${styles.topbar} ${preview ? styles.previewTopbar : ""}`}>
      <div className={styles.topbarTitle}>
        <b>{String(n).padStart(2, "0")}</b>
        <h1>{names[n - 17]}</h1>
        {n === 23 && <em className={styles.headerStatus}>候補・人が確認</em>}
      </div>
      {preview ? <span className={styles.scopeBadge}>準備中・P0対象外</span> : null}
      <label className={styles.topbarSearch}>
        ⌕　<span>商品名・キーワード・メモを検索</span>
      </label>
      <button
        type="button"
        className={`${styles.topbarBell} ${styles.headerAction}`}
        aria-label="通知を開く"
        aria-controls="approved-pc-header-panel"
        data-pc-header-action="notifications"
      >
        <PcUiGlyph name="bell" />
      </button>
      {workDetail && (
        <button
          type="button"
          className={`${styles.topbarHelp} ${styles.headerAction}`}
          aria-label="ヘルプを開く"
          aria-controls="approved-pc-header-panel"
          data-pc-header-action="help"
        >
          <PcUiGlyph name="help" />
        </button>
      )}
      <button
        type="button"
        className={`${styles.topbarUser} ${styles.headerAction}`}
        aria-label="担当者メニューを開く"
        aria-controls="approved-pc-header-panel"
        data-pc-header-action="account"
      >
        <PcUiGlyph name="user" />
        {!workDetail && "スタッフA⌄"}
      </button>
    </header>
  );
}
function UtilityHeader() {
  return (
    <header className={styles.utilityHeader}>
      <button
        type="button"
        aria-label="サイドバーを開く"
        aria-controls="approved-pc-header-panel"
        className={styles.utilitySideToggle}
        data-pc-header-action="sidebar"
      >
        ☰
      </button>
      <div className={styles.utilityMainTools}>
        <button
          type="button"
          aria-label="作業者メニューを開く"
          aria-controls="approved-pc-header-panel"
          className={styles.utilityFrameToggle}
          data-pc-header-action="work"
        >
          ☰
        </button>
        <button
          type="button"
          className={styles.workerMenu}
          aria-controls="approved-pc-header-panel"
          data-pc-header-action="work"
        >
          作業者メニュー　⌄
        </button>
        <div className={styles.utilityTools}>
          <button
            type="button"
            className={styles.headerAction}
            aria-label="通知を開く"
            aria-controls="approved-pc-header-panel"
            data-pc-header-action="notifications"
          >
            <PcUiGlyph name="bell" />
          </button>
          <button
            type="button"
            className={styles.headerAction}
            aria-label="ヘルプを開く"
            aria-controls="approved-pc-header-panel"
            data-pc-header-action="help"
          >
            <PcUiGlyph name="help" />
          </button>
          <button
            type="button"
            className={`${styles.utilityUser} ${styles.headerAction}`}
            aria-label="担当者メニューを開く"
            aria-controls="approved-pc-header-panel"
            data-pc-header-action="account"
          >
            <PcUiGlyph name="user" />
            担当A⌄
          </button>
        </div>
      </div>
    </header>
  );
}
function Shell({ n, children }: { n: number; children: React.ReactNode }) {
  const active = n >= 29 ? "注文・発送" : n <= 20 ? "商品" : "作業";
  const utility = n >= 29 && n <= 32;
  const workDetail = n >= 21 && n <= 24;
  return (
    <PcCanvas
      screenNumber={n}
      className={`${styles.app} ${utility ? styles.utilityApp : ""} ${workDetail ? styles.workDetailApp : ""} ${styles[`screen${n}`] ?? ""}`}
    >
      {utility ? <UtilityHeader /> : <StandardHeader n={n} />}
      <aside>
        {nav.map((x, i) => (
          <a
            className={x === active ? styles.active : ""}
            href={to([2, 3, 5, 9, 29, 33, 45, 37, 49][i] ?? 2)}
            key={x}
            aria-current={x === active ? "page" : undefined}
          >
            <PcUiGlyph name={pcNavGlyphs[i] ?? "home"} className={styles.navGlyph ?? ""} />
            {x}
          </a>
        ))}
      </aside>
      <section className={styles.frame}>
        {utility && (
          <div className={styles.utilityPageHeading}>
            <b>{String(n).padStart(2, "0")}</b>
            <h1>{names[n - 17]}</h1>
            {n === 30 && <em>担当注文</em>}
            {n === 31 && <em>高額商品に該当</em>}
          </div>
        )}
        {children}
      </section>
    </PcCanvas>
  );
}
function Card({
  children,
  className = "",
  onClick,
  ariaPressed,
}: {
  children: React.ReactNode;
  className?: string | undefined;
  onClick?: () => void;
  ariaPressed?: boolean | undefined;
}) {
  return (
    <section
      className={`${styles.card} ${className}`}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-pressed={onClick ? ariaPressed : undefined}
    >
      {children}
    </section>
  );
}
function Bag() {
  return (
    <div className={styles.bag}>
      <i />
      <b />
    </div>
  );
}
function Shirt() {
  return (
    <div className={styles.shirt}>
      <i />
      <b />
      <em />
    </div>
  );
}
function Tag({ variant = "brand" }: { variant?: "brand" | "care" | "size" | "material" }) {
  const text =
    variant === "brand"
      ? "サンプルブランド"
      : variant === "care"
        ? "綿 100%\n洗濯表示"
        : variant === "size"
          ? "M"
          : "中綿なし";
  const variantClass = styles[`tag${variant.charAt(0).toUpperCase()}${variant.slice(1)}`] ?? "";
  return (
    <div className={`${styles.tagArt} ${variantClass}`}>
      <span>{text}</span>
      <i />
    </div>
  );
}
function Detail() {
  return (
    <div className={styles.detailArt}>
      <Shirt />
      <b>●</b>
    </div>
  );
}
function Photo({
  kind = "bag",
}: {
  kind?:
    | "bag"
    | "shirt"
    | "tag"
    | "care"
    | "size"
    | "material"
    | "detail"
    | "shirtFront"
    | "shirtBack"
    | "button"
    | "cuff"
    | "labelBrand"
    | "labelCare"
    | "toteFront"
    | "toteBack"
    | "toteBrand"
    | "toteQuality"
    | "toteDetail"
    | "summaryHero"
    | "summaryFront"
    | "summaryBack"
    | "summaryCollar"
    | "summaryCuff"
    | "summaryButton"
    | "summaryLabel";
}) {
  const asset = {
    bag: "/approved-assets/measurement/bag-measurement.png",
    shirt: "/approved-assets/product/listing-shirt.png",
    tag: "/approved-assets/product/brand-tag-pc.png",
    care: "/approved-assets/product/quality-label-pc.png",
    size: "/approved-assets/product/size-label-pc.png",
    material: "/approved-assets/product/text-label-pc.png",
    detail: "/approved-assets/product/defect-detail.png",
    shirtFront: "/approved-assets/product/shirt-front.png",
    shirtBack: "/approved-assets/product/shirt-back.png",
    button: "/approved-assets/product/button-detail.png",
    cuff: "/approved-assets/product/cuff-large.png",
    labelBrand: "/approved-assets/product/brand-tag.png",
    labelCare: "/approved-assets/product/quality-label.png",
    toteFront: "/approved-assets/pc-fidelity/product/beige-tote-front.png",
    toteBack: "/approved-assets/pc-fidelity/product/beige-tote-back.png",
    toteBrand: "/approved-assets/pc-fidelity/product/beige-tote-brand-tag.png",
    toteQuality: "/approved-assets/pc-fidelity/product/beige-tote-quality-label.png",
    toteDetail: "/approved-assets/pc-fidelity/product/beige-tote-detail.png",
    summaryHero: "/approved-assets/pc-fidelity/product/light-blue-shirt-hero.png",
    summaryFront: "/approved-assets/pc-fidelity/product/light-blue-shirt-front.png",
    summaryBack: "/approved-assets/pc-fidelity/product/light-blue-shirt-back.png",
    summaryCollar: "/approved-assets/pc-fidelity/product/light-blue-shirt-collar.png",
    summaryCuff: "/approved-assets/pc-fidelity/product/light-blue-shirt-cuff.png",
    summaryButton: "/approved-assets/pc-fidelity/product/light-blue-shirt-button.png",
    summaryLabel: "/approved-assets/pc-fidelity/product/light-blue-shirt-label.png",
  }[kind];
  const visual =
    kind === "bag" || kind === "toteFront" || kind === "toteBack" ? (
      <Bag />
    ) : kind === "shirt" || kind === "shirtFront" || kind === "shirtBack" ? (
      <Shirt />
    ) : kind === "detail" || kind === "toteDetail" || kind === "button" || kind === "cuff" ? (
      <Detail />
    ) : (
      <Tag
        variant={
          kind === "tag" || kind === "toteBrand" || kind === "labelBrand"
            ? "brand"
            : kind === "care" || kind === "toteQuality" || kind === "labelCare"
              ? "care"
              : kind === "size"
                ? "size"
                : "material"
        }
      />
    );
  const variantClass = styles[`photo${kind.charAt(0).toUpperCase()}${kind.slice(1)}`] ?? "";
  return (
    <div className={`${styles.photo} ${variantClass}`}>
      <img src={asset} alt={`${kind}の承認写真`} />
      <span className={styles.photoFallback}>{visual}</span>
    </div>
  );
}
function Notice({ children }: { children: React.ReactNode }) {
  return <p className={styles.notice}>ⓘ　{children}</p>;
}

function EditPolicyIcon({ kind }: { kind: "self" | "set" | "skip" }) {
  const stroke = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <svg className={styles.policyIcon} viewBox="0 0 72 56" aria-hidden="true">
      {kind === "self" && (
        <>
          <rect {...stroke} x="9" y="8" width="43" height="31" rx="3" />
          <path {...stroke} d="M24 47h18M33 39v8M46 19l13 13-8 8-13-13zM44 21l3-3" />
        </>
      )}
      {kind === "set" && (
        <>
          <rect {...stroke} x="11" y="13" width="35" height="27" rx="2" />
          <path {...stroke} d="m16 34 8-8 7 7 5-5 6 6M23 13V8h35v28H46" />
          <rect {...stroke} x="29" y="19" width="34" height="27" rx="2" />
          <path {...stroke} d="m34 40 7-7 6 5 7-8 5 10" />
        </>
      )}
      {kind === "skip" && (
        <>
          <rect {...stroke} x="12" y="8" width="38" height="39" rx="7" />
          <path {...stroke} d="M24 28h25M40 17l12 11-12 11" />
        </>
      )}
    </svg>
  );
}
function Crumbs({ children }: { children: string }) {
  return <p className={styles.crumb}>{children}</p>;
}
function ProductLabel() {
  return (
    <div className={styles.productLabel}>
      <div className={styles.barcode} />
      <strong>SKU-1001-BK</strong>
      <span>ワイヤレスヘッドホン ブラック</span>
      <b>数量：1</b>
    </div>
  );
}
function Headphones() {
  return (
    <div className={styles.headphones} aria-label="黒いヘッドホンの商品写真">
      <img
        src="/approved-assets/pc-fidelity/shipping/headphones.png"
        alt="黒いヘッドホンの商品写真"
      />
    </div>
  );
}
function LocationLabel() {
  return (
    <div className={styles.locationLabel}>
      <strong>棚A-03-2</strong>
      <span>● 棚A › 段3 › 列2</span>
    </div>
  );
}
function ShelfPhoto() {
  return (
    <div className={styles.shelfPhoto}>
      <img src="/approved-assets/shipping/shelf-order-photo.png" alt="棚の保管場所写真" />
      <span>棚A-03-2</span>
      <b>段3　列2</b>
    </div>
  );
}

function Photos() {
  const labels = ["正面", "背面", "ブランドタグ", "品質表示", "気になる箇所"] as const;
  const kinds = ["toteFront", "toteBack", "toteBrand", "toteQuality", "toteDetail"] as const;
  return (
    <Shell n={17}>
      <div className={styles.pad}>
        <Crumbs>商品　&gt;　0128　&gt;　写真</Crumbs>
        <div className={styles.photoHeaderActions}>
          <span className={styles.confirmedAction}>✓ 確認済み</span>
          <PcPreviewActionButton
            title="写真の並べ替え"
            message="この画面は並び順の確認見本です。実際の写真変更は商品作業画面で行います。"
            liveHref="/workflow"
          >
            写真を並べ替え
          </PcPreviewActionButton>
        </div>
        <div className={styles.photoFive}>
          {labels.map((x, i) => (
            <Card key={x}>
              <h3>{x}</h3>
              <Photo kind={kinds[i] ?? "bag"} />
              <b className={i === 4 ? styles.edited : ""}>{i === 4 ? "加工後" : "原本"}</b>
            </Card>
          ))}
        </div>
        <div className={styles.photoAdd}>
          <div className={styles.uploadCard}>
            <PcPreviewActionButton
              title="写真の追加"
              message="この確認版では端末のファイルを読み取りません。実際の写真追加は商品作業画面で行います。"
              liveHref="/workflow"
            >
              写真を追加
            </PcPreviewActionButton>
            <small>ドラッグ＆ドロップ または クリックして選択</small>
          </div>
          <Card>
            <b>◇　原本はPC内の非公開保管</b>
            <p>原本は別に保管せず、編集用コピーを別途作成して使用します。</p>
          </Card>
        </div>
      </div>
    </Shell>
  );
}
function EditPolicy() {
  const [policy, setPolicy] = useState<"self" | "set" | "skip">("set");
  const choices = [
    {
      id: "self" as const,
      title: "自作画像編集（準備中）",
      body: "自社で画像編集を行います。現時点では利用できません。",
    },
    {
      id: "set" as const,
      title: "編集用セットを作る",
      body: "原本をもとに、編集用のコピー（加工用セット）を作成します。",
    },
    {
      id: "skip" as const,
      title: "編集せず進む",
      body: "原本のまま次の工程に進みます。",
    },
  ];
  return (
    <Shell n={18}>
      <div className={styles.pad}>
        <Crumbs>商品　&gt;　0128　&gt;　写真　&gt;　編集方法の選択</Crumbs>
        <Notice>
          <b>外部サービスとの自動連携は行いません</b>
          <br />
          外部の自動処理サービスやAPI連携は使用しません。すべて手動での確認・操作となります。
        </Notice>
        <p className={styles.lock}>
          ▣　<b>原本の上書きは行いません</b>
          <br />
          原本はそのまま保管し、編集用のコピーを作成して作業します。
        </p>
        <p>以下から編集方針を選択してください。</p>
        <div className={styles.policies} role="radiogroup" aria-label="写真の編集方針">
          {choices.map((choice) => (
            <Card
              className={policy === choice.id ? styles.selected : ""}
              onClick={() => setPolicy(choice.id)}
              key={choice.id}
            >
              <b>
                <span className={styles.radioMark} aria-hidden="true">
                  {policy === choice.id ? "●" : ""}
                </span>
                {choice.title}
              </b>
              <EditPolicyIcon kind={choice.id} />
              <p>{choice.body}</p>
            </Card>
          ))}
        </div>
        <Button n={18}>{policy === "skip" ? "編集せず次へ進む" : "編集用セットを作る"}</Button>
      </div>
    </Shell>
  );
}
function Processed() {
  const labels = ["正面", "背面", "ブランドタグ", "品質表示", "気になる箇所"] as const;
  const kinds = ["toteFront", "toteBack", "toteBrand", "toteQuality", "toteDetail"] as const;
  return (
    <Shell n={19}>
      <div className={styles.pad}>
        <Crumbs>商品　&gt;　0128　&gt;　写真　&gt;　加工後を確認</Crumbs>
        <p className={styles.success}>
          ●　<b>5 / 5 一致</b>
          <br />
          <small>すべての項目で原本と加工後の内容が一致しています。</small>
          <em>確認済み</em>
        </p>
        <Card className={styles.compare}>
          {labels.map((x, i) => (
            <article key={x}>
              <h3>{x}</h3>
              <Photo kind={kinds[i] ?? "bag"} />
              <span>↓</span>
              <Photo kind={kinds[i] ?? "bag"} />
            </article>
          ))}
        </Card>
        <p className={styles.human}>
          ♙　<b>人の目で確認しています</b>
          <br />
          <small>自動判定ではなく、担当者が一つひとつ内容を確認しています。</small>
        </p>
        <footer>
          <a href={to(18)}>差し戻す</a>
          <Button n={19}>確認して採用</Button>
        </footer>
      </div>
    </Shell>
  );
}
function MeasurementDiagram() {
  return (
    <div className={styles.measureDiagram} role="img" aria-label="バッグの5か所の採寸線">
      <img
        className={styles.measureAsset}
        src="/approved-assets/measurement/bag-measurement.png"
        alt="バッグの採寸写真"
      />
      <svg viewBox="0 0 360 340" aria-hidden="true">
        <defs>
          <marker
            id="measureArrowBlue"
            markerWidth="7"
            markerHeight="7"
            refX="5"
            refY="3.5"
            orient="auto"
          >
            <path d="M0 0 L7 3.5 L0 7Z" fill="#1769d5" />
          </marker>
          <marker
            id="measureArrowGreen"
            markerWidth="7"
            markerHeight="7"
            refX="5"
            refY="3.5"
            orient="auto"
          >
            <path d="M0 0 L7 3.5 L0 7Z" fill="#22a36a" />
          </marker>
          <marker
            id="measureArrowOrange"
            markerWidth="7"
            markerHeight="7"
            refX="5"
            refY="3.5"
            orient="auto"
          >
            <path d="M0 0 L7 3.5 L0 7Z" fill="#ed8b19" />
          </marker>
          <marker
            id="measureArrowPink"
            markerWidth="7"
            markerHeight="7"
            refX="5"
            refY="3.5"
            orient="auto"
          >
            <path d="M0 0 L7 3.5 L0 7Z" fill="#db4fa1" />
          </marker>
        </defs>
        <path className={styles.diagramBag} d="M112 84 Q180 38 248 84 L269 277 Q180 316 91 277Z" />
        <path className={styles.diagramHandle} d="M132 90 Q132 19 180 19 Q228 19 228 90" />
        <path className={styles.diagramSeam} d="M126 108 H234 M126 108 V258 M234 108 V258" />
        <line
          x1="80"
          y1="85"
          x2="80"
          y2="278"
          stroke="#22a36a"
          strokeWidth="3"
          markerStart="url(#measureArrowGreen)"
          markerEnd="url(#measureArrowGreen)"
        />
        <text x="10" y="180" className={styles.diagramGreenText}>
          ① 高さ 32.0
        </text>
        <line
          x1="105"
          y1="72"
          x2="255"
          y2="72"
          stroke="#ed8b19"
          strokeWidth="3"
          markerStart="url(#measureArrowOrange)"
          markerEnd="url(#measureArrowOrange)"
        />
        <text x="116" y="58" className={styles.diagramOrangeText}>
          ② 上幅（開口部）45.0
        </text>
        <line
          x1="94"
          y1="287"
          x2="266"
          y2="287"
          stroke="#1769d5"
          strokeWidth="3"
          markerStart="url(#measureArrowBlue)"
          markerEnd="url(#measureArrowBlue)"
        />
        <text x="112" y="309" className={styles.diagramBlueText}>
          ③ 横幅（平置き）38.0
        </text>
        <line
          x1="122"
          y1="268"
          x2="238"
          y2="268"
          stroke="#7b4bd7"
          strokeWidth="3"
          markerStart="url(#measureArrowBlue)"
          markerEnd="url(#measureArrowBlue)"
        />
        <text x="146" y="257" className={styles.diagramPurpleText}>
          ④ 底幅 28.0
        </text>
        <path
          d="M273 105 Q322 170 273 238"
          fill="none"
          stroke="#db4fa1"
          strokeWidth="3"
          markerStart="url(#measureArrowPink)"
          markerEnd="url(#measureArrowPink)"
        />
        <text x="282" y="173" className={styles.diagramPinkText}>
          ⑤ マチ 14.0
        </text>
      </svg>
    </div>
  );
}
function MeasureEvidencePhoto({ src, label }: { src: string; label: string }) {
  return (
    <figure className={styles.measureEvidencePhoto}>
      <img src={src} alt={`${label}の採寸根拠写真`} />
      <figcaption>{label}</figcaption>
    </figure>
  );
}
function Measure() {
  const evidence = [
    ["/approved-assets/pc-fidelity/measurement/tote-height.png", "① 高さ"],
    ["/approved-assets/pc-fidelity/measurement/tote-opening-width.png", "② 上幅"],
    ["/approved-assets/pc-fidelity/measurement/tote-flat-width.png", "③ 横幅"],
    ["/approved-assets/pc-fidelity/measurement/tote-base-width.png", "④ 底幅"],
    ["/approved-assets/pc-fidelity/measurement/tote-gusset.png", "⑤ マチ"],
    ["/approved-assets/pc-fidelity/measurement/tote-circumference.png", "周囲"],
  ] as const;
  return (
    <Shell n={20}>
      <div className={styles.pad}>
        <Crumbs>商品　&gt;　0128　&gt;　採寸</Crumbs>
        <div className={styles.measure}>
          <Card>
            <h3>採寸部位（単位：cm）</h3>
            <div className={styles.measureBody}>
              <MeasurementDiagram />
              <table>
                <thead>
                  <tr>
                    <th>No.</th>
                    <th>部位</th>
                    <th>値（cm）</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["①", "高さ（持ち手含まず）", "32.0"],
                    ["②", "上幅（開口部）", "45.0"],
                    ["③", "横幅（平置き）", "38.0"],
                    ["④", "底幅", "28.0"],
                    ["⑤", "マチ", "14.0"],
                  ].map((r) => (
                    <tr key={r[0]}>
                      {r.map((x) => (
                        <td key={x}>{x}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Notice>
              <b>平置き幅と周囲は別項目です</b>
              <br />
              <small>
                横幅（平置き）は、ぱっと置いた状態の横の直線距離です。
                <br />
                周囲は下段の「周囲」で別途測定してください。
              </small>
            </Notice>
            <p className={styles.total}>
              周囲（ぐるり一周） ↓（cm）　<b>86.0</b>
            </p>
            <p className={styles.measureTolerance}>※ 誤差は ±1.0cm を許容範囲とします。</p>
          </Card>
          <section>
            <Card>
              <h3>採寸の根拠写真</h3>
              <div className={styles.evidence}>
                {evidence.map(([src, label]) => (
                  <MeasureEvidencePhoto src={src} label={label} key={label} />
                ))}
              </div>
            </Card>
            <Card>
              <h3>再撮影の理由（該当するものを選択）</h3>
              {[
                "前回値と差が大きい",
                "採寸箇所が不明瞭だった",
                "形状の影響を考慮するため",
                "その他",
              ].map((x) => (
                <label key={x}>
                  <input type="checkbox" /> {x}
                </label>
              ))}
              <input placeholder="理由を入力してください" />
            </Card>
          </section>
        </div>
        <footer>
          <a href={to(19)}>キャンセル</a>
          <PcPreviewActionButton
            className={styles.primary}
            title="採寸値の保存"
            message="表示値は承認デザイン用の架空例です。この画面では保存せず、実際の採寸保存は商品作業画面で行います。"
            liveHref="/workflow"
            previewHref={to(21)}
            previewLabel="次の見本を見る"
          >
            確認した値を保存　›
          </PcPreviewActionButton>
        </footer>
      </div>
    </Shell>
  );
}
function Tags() {
  const tagKinds = ["tag", "care", "size", "material"] as const;
  return (
    <Shell n={21}>
      <div className={styles.pad}>
        <p>タグやケアラベルの文字を確認し、候補を選択してください。</p>
        <div className={styles.tags}>
          <Card>
            <h3>
              タグ・ケアラベルの写真{" "}
              <PcPreviewActionButton
                className={styles.previewInlineAction}
                title="タグ写真の追加"
                message="この確認版では端末の写真を読み取りません。実際の写真追加は商品作業画面で行います。"
                liveHref="/workflow"
              >
                写真を追加
              </PcPreviewActionButton>
            </h3>
            <div className={styles.tagPhotos}>
              {tagKinds.map((kind) => (
                <Photo kind={kind} key={kind} />
              ))}
            </div>
            <small>⌕ ピンチ操作で拡大できます</small>
          </Card>
          <Card className={styles.tagForm}>
            <h3>候補の確認と選択</h3>
            {[
              "ブランド　サンプルブランド",
              "サイズ　M",
              "カラー　ライトブルー",
              "素材　綿 100%",
            ].map((x) => (
              <label key={x}>
                {x.split("　")[0]}
                <select defaultValue={x}>
                  <option>{x}</option>
                </select>
                <b>高い</b>
              </label>
            ))}
            <div className={styles.tagConfidence}>
              <p>
                参考の信頼度　<strong>92%</strong>
              </p>
              <i aria-hidden="true">
                <b />
              </i>
              <small>高い（十分な情報が確認できました）</small>
            </div>
          </Card>
        </div>
        <footer>
          <a href={to(20)}>戻る</a>
          <PcPreviewActionButton
            className={styles.primary}
            title="タグ内容の保存"
            message="表示候補は承認デザイン用の架空例です。この画面では保存せず、実際の確認・保存は商品作業画面で行います。"
            liveHref="/workflow"
            previewHref={to(22)}
            previewLabel="商品まとめの見本を見る"
          >
            確認した内容を保存　›
          </PcPreviewActionButton>
        </footer>
      </div>
    </Shell>
  );
}
function ProductSummary() {
  return (
    <Shell n={22}>
      <div className={styles.pad}>
        <div className={styles.productHero}>
          <Photo kind="summaryHero" />
          <div>
            <h2>
              ライトブルー オックスフォードシャツ　<em>確認中</em>
            </h2>
            <p>サンプルブランド / サイズ M / ライトブルー / 綿 100%</p>
            <div>
              {["検品 完了", "写真 12枚", "採寸 完了", "タグ 完了"].map((x) => (
                <b key={x}>● {x}</b>
              ))}
            </div>
          </div>
        </div>
        <div className={styles.productCols}>
          <Card>
            <h3>検品の結果</h3>
            {[
              "目立つ汚れ・シミなし",
              "破れ・ほつれなし",
              "ボタンの欠けなし",
              "においなし",
              "その他のダメージなし",
            ].map((x) => (
              <p key={x}>● {x}</p>
            ))}
          </Card>
          <Card>
            <h3>写真（12枚）</h3>
            <div className={styles.twelve}>
              {(
                [
                  "summaryFront",
                  "summaryBack",
                  "summaryCollar",
                  "summaryCuff",
                  "summaryButton",
                  "summaryLabel",
                ] as const
              ).map((kind) => (
                <Photo kind={kind} key={kind} />
              ))}
            </div>
            <a href={to(17)}>すべての写真を確認</a>
          </Card>
          <Card>
            <h3>採寸（cm）</h3>
            <p>着丈　72.5</p>
            <p>肩幅　45.0</p>
            <p>身幅　54.0</p>
            <p>袖丈　61.0</p>
            <p>裄丈　83.5</p>
            <a href={to(20)}>採寸を編集</a>
          </Card>
          <Card>
            <h3>タグ情報</h3>
            <p>ブランド　サンプルブランド</p>
            <p>サイズ　M</p>
            <p>カラー　ライトブルー</p>
            <p>素材　綿 100%</p>
            <a href={to(21)}>タグを編集</a>
          </Card>
        </div>
        <div className={styles.missing}>
          <Card>
            <b>不足している情報</b>
            <p>・特になし　ⓘ</p>
          </Card>
          <Card>
            <b>確認済みの項目</b>
            <p>● タグの文字を確認しました</p>
            <p>● 採寸を確認しました</p>
            <p>● 検品を確認しました</p>
          </Card>
        </div>
        <PcPreviewActionButton
          className={styles.primary}
          title="商品説明候補の作成"
          message="この画面ではAI生成や保存を行いません。実際の商品確認は商品作業画面で行い、次画面は文章候補の操作見本です。"
          liveHref="/workflow"
          previewHref={to(23)}
          previewLabel="文章候補の見本を見る"
        >
          商品説明の候補を作る　›
        </PcPreviewActionButton>
      </div>
    </Shell>
  );
}
function Description() {
  const [description, setDescription] = useState(APPROVED_PC_LISTING_DESCRIPTION);
  const [note, setNote] = useState("");
  const [descriptionStatus, setDescriptionStatus] = useState("");
  const [draftSaveFailed, setDraftSaveFailed] = useState(false);
  const [draftReadFailed, setDraftReadFailed] = useState(false);
  const draftLoaded = useRef(false);
  const descriptionInput = useRef<HTMLTextAreaElement>(null);
  const previewDialog = useRef<HTMLDialogElement>(null);
  const resetDialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const result = loadApprovedPcListingDraft(getApprovedPcListingStorage());
    draftLoaded.current = result.status === "read";
    setDraftReadFailed(!draftLoaded.current);
    const saved = result.draft;
    if (!saved) return;
    setDescription(saved.description);
    setNote(saved.note);
  }, []);

  function saveDraft(nextDescription: string, nextNote: string) {
    if (!draftLoaded.current) {
      const result = loadApprovedPcListingDraft(getApprovedPcListingStorage());
      if (result.status === "unavailable") return false;
      draftLoaded.current = true;
      setDraftReadFailed(false);
      if (result.draft) {
        nextDescription = result.draft.description;
        nextNote = result.draft.note;
        setDescription(nextDescription);
        setNote(nextNote);
        setDescriptionStatus(
          "一時保存した内容を読み込みました。内容を確認してから進んでください。",
        );
        return false;
      }
    }
    const saved = writeApprovedPcListingDraft(getApprovedPcListingStorage(), {
      description: nextDescription,
      note: nextNote,
    });
    setDraftSaveFailed(!saved);
    setDescriptionStatus("");
    return saved;
  }

  function requestDescriptionReset() {
    if (!draftLoaded.current) return;
    if (description === APPROVED_PC_LISTING_DESCRIPTION && note === "") {
      setDescriptionStatus("すでに元の候補です。");
      return;
    }
    setDescriptionStatus("");
    resetDialog.current?.showModal();
  }

  function resetDescription() {
    setDescription(APPROVED_PC_LISTING_DESCRIPTION);
    setNote("");
    if (saveDraft(APPROVED_PC_LISTING_DESCRIPTION, "")) {
      setDescriptionStatus("元の商品説明候補へ戻しました。");
    }
    resetDialog.current?.close();
  }

  function prepareDescriptionReview(event: React.MouseEvent<HTMLAnchorElement>) {
    setDescriptionStatus("");
    if (!description.trim()) {
      event.preventDefault();
      setDescriptionStatus("商品説明を入力してから、コピーする内容を確認してください。");
      descriptionInput.current?.focus();
      return;
    }
    if (!saveDraft(description, note)) event.preventDefault();
  }

  return (
    <Shell n={23}>
      <div className={styles.pad}>
        <div className={styles.desc}>
          <Card>
            <h3>
              商品説明（編集できます） <small>文字数：{Array.from(description).length}文字</small>
            </h3>
            <textarea
              aria-label="編集する商品説明"
              ref={descriptionInput}
              value={description}
              disabled={draftReadFailed}
              onChange={(event) => {
                if (!draftLoaded.current) return;
                const nextDescription = event.target.value;
                setDescription(nextDescription);
                setDescriptionStatus("");
                saveDraft(nextDescription, note);
              }}
            />
            <div className={styles.descriptionActions}>
              <button type="button" onClick={() => previewDialog.current?.showModal()}>
                プレビュー
              </button>
              <button type="button" disabled={draftReadFailed} onClick={requestDescriptionReset}>
                リセット
              </button>
              <small>改行はそのまま反映・このタブ内だけ保持</small>
            </div>
            {descriptionStatus ? (
              <small className={styles.descriptionStatus} role="status">
                {descriptionStatus}
              </small>
            ) : null}
            {draftSaveFailed || draftReadFailed ? (
              <div className={styles.draftRecovery}>
                <small role="alert">
                  {draftReadFailed
                    ? "一時保存した内容を読み込めませんでした。既存内容を上書きしないため、編集を止めています。画面を閉じずに再試行してください。"
                    : "本文と補足メモをこのタブ内に一時保存できませんでした。画面を閉じずに再試行してください。"}
                </small>
                <button type="button" onClick={() => saveDraft(description, note)}>
                  一時保存を再試行
                </button>
              </div>
            ) : null}
          </Card>
          <section>
            <Card>
              <h3>根拠（エビデンス）</h3>
              {[
                "タグの写真　4枚",
                "全体の写真　3枚",
                "ディテールの写真　5枚",
                "採寸の記録　5項目",
                "検品の結果　5項目",
              ].map((x) => (
                <p key={x}>▣　{x}</p>
              ))}
            </Card>
            <Card>
              <h3>未解決の項目</h3>
              <p>・特になし　ⓘ</p>
            </Card>
            <Card>
              <h3>補足メモ（任意）</h3>
              <textarea
                aria-label="補足メモ"
                placeholder="メモを入力してください"
                value={note}
                disabled={draftReadFailed}
                onChange={(event) => {
                  if (!draftLoaded.current) return;
                  const nextNote = event.target.value;
                  setNote(nextNote);
                  setDescriptionStatus("");
                  saveDraft(description, nextNote);
                }}
              />
            </Card>
          </section>
        </div>
        <footer>
          <a href={to(22)}>戻る</a>
          <a
            className={`${styles.primary} ${!description.trim() ? styles.primaryDisabled : ""}`}
            href={to(24)}
            aria-disabled={!description.trim()}
            onClick={prepareDescriptionReview}
          >
            コピーする内容を確認　›
          </a>
        </footer>
        <dialog
          ref={previewDialog}
          className={styles.descriptionPreview}
          aria-labelledby="description-preview-title"
        >
          <h2 id="description-preview-title">商品説明のプレビュー</h2>
          <p>補足メモは商品説明へ含まれません。</p>
          <pre>{description || "商品説明が空です。"}</pre>
          <button
            type="button"
            className={styles.outline}
            onClick={() => previewDialog.current?.close()}
          >
            編集へ戻る
          </button>
        </dialog>
        <dialog
          ref={resetDialog}
          className={`${styles.descriptionPreview} ${styles.descriptionReset}`}
          aria-labelledby="description-reset-title"
        >
          <h2 id="description-reset-title">編集内容を元に戻しますか？</h2>
          <p>商品説明と補足メモを、最初の候補へ戻します。</p>
          <div className={styles.descriptionResetActions}>
            <button
              type="button"
              className={styles.outline}
              onClick={() => {
                resetDialog.current?.close();
                setDescriptionStatus("編集内容を変更せず、編集を続けます。");
              }}
            >
              編集を続ける
            </button>
            <button type="button" className={styles.primary} onClick={resetDescription}>
              元の候補へ戻す
            </button>
          </div>
        </dialog>
      </div>
    </Shell>
  );
}
function Official() {
  const [listingDescription, setListingDescription] = useState(APPROVED_PC_LISTING_DESCRIPTION);
  const [descriptionCopyStatus, setDescriptionCopyStatus] = useState("");
  const [descriptionDraftStatus, setDescriptionDraftStatus] = useState("");
  const [draftReadFailed, setDraftReadFailed] = useState(false);
  const draftLoaded = useRef(false);
  const listingNote = useRef("");
  const copyRevision = useRef(0);
  const listingDescriptionInput = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const result = loadApprovedPcListingDraft(getApprovedPcListingStorage());
    draftLoaded.current = result.status === "read";
    setDraftReadFailed(!draftLoaded.current);
    if (!draftLoaded.current) {
      setDescriptionDraftStatus(
        "一時保存した内容を読み込めませんでした。既存内容を上書きしないため、編集とコピーを止めています。画面を閉じずに再試行してください。",
      );
    }
    const saved = result.draft;
    if (!saved) return;
    listingNote.current = saved.note;
    setListingDescription(saved.description);
  }, []);

  async function copyListingDescription() {
    if (!draftLoaded.current) return;
    const revision = ++copyRevision.current;
    setDescriptionCopyStatus("");
    const copied = await copyResearchText(listingDescription, (text) =>
      navigator.clipboard.writeText(text),
    );
    if (revision !== copyRevision.current) return;
    setDescriptionCopyStatus(
      copied
        ? "コピーしました"
        : "コピーできませんでした。文章欄を選択して手動でコピーしてください。",
    );
  }

  function saveListingDraft(nextDescription: string) {
    if (!draftLoaded.current) {
      const result = loadApprovedPcListingDraft(getApprovedPcListingStorage());
      if (result.status === "unavailable") return false;
      draftLoaded.current = true;
      setDraftReadFailed(false);
      if (result.draft) {
        nextDescription = result.draft.description;
        listingNote.current = result.draft.note;
        setListingDescription(nextDescription);
      }
    }
    const saved = writeApprovedPcListingDraft(getApprovedPcListingStorage(), {
      description: nextDescription,
      note: listingNote.current,
    });
    setDescriptionDraftStatus(
      saved
        ? ""
        : "本文と補足メモをこのタブ内に一時保存できませんでした。コピーしても一時保存は完了しません。画面を閉じずに再試行してください。",
    );
    return saved;
  }

  function protectUnsavedDescription(event: React.MouseEvent<HTMLAnchorElement>) {
    if (saveListingDraft(listingDescription)) return;
    event.preventDefault();
    setDescriptionDraftStatus(
      "一時保存できないため、戻る操作を止めました。コピーしても一時保存は完了しません。画面を閉じずに再試行してください。",
    );
    listingDescriptionInput.current?.focus();
  }

  return (
    <Shell n={24}>
      <div className={styles.pad}>
        <p>
          自動での出品は行いません。下記の手順で、公式の販売画面を開き、手動で入力してください。
        </p>
        <div className={styles.official}>
          <Card>
            <h3>1. 写真をダウンロード</h3>
            <p>必要な写真を保存してください。</p>
            <img
              className={styles.officialPhotoStack}
              src="/approved-assets/pc-fidelity/product/light-blue-shirt-stack.png"
              alt="ライトブルーシャツの12枚写真"
            />
            <button
              type="button"
              className={`${styles.outline} ${styles.officialPendingAction}`}
              aria-describedby="official-photo-export-pending"
              disabled
            >
              ↓ 写真（12枚）の保存は準備中
            </button>
            <small id="official-photo-export-pending" className={styles.officialPendingNote}>
              実商品写真はまだ保存されません
            </small>
          </Card>
          <Card>
            <h3>2. テキストをコピー</h3>
            <p>商品説明をコピーして貼り付けてください。</p>
            <textarea
              aria-label="コピーする商品説明"
              ref={listingDescriptionInput}
              value={listingDescription}
              disabled={draftReadFailed}
              onChange={(event) => {
                if (!draftLoaded.current) return;
                const nextDescription = event.target.value;
                setListingDescription(nextDescription);
                copyRevision.current += 1;
                setDescriptionCopyStatus("");
                saveListingDraft(nextDescription);
              }}
            />
            {descriptionDraftStatus ? (
              <div className={styles.draftRecovery}>
                <small role="alert">{descriptionDraftStatus}</small>
                <button type="button" onClick={() => saveListingDraft(listingDescription)}>
                  一時保存を再試行
                </button>
              </div>
            ) : null}
            <button
              type="button"
              className={`${styles.outline} ${styles.officialTextCopy}`}
              disabled={draftReadFailed || !listingDescription.trim()}
              aria-live="polite"
              onClick={() => void copyListingDescription()}
            >
              {descriptionCopyStatus === "コピーしました"
                ? "コピーしました　✓"
                : "商品説明をコピー　▣"}
            </button>
            {descriptionCopyStatus && descriptionCopyStatus !== "コピーしました" ? (
              <small className={styles.officialCopyError} role="alert">
                {descriptionCopyStatus}
              </small>
            ) : null}
          </Card>
          <Card>
            <h3>3. 公式の販売画面を開く</h3>
            <p>ご自身で公式の販売画面を開き、手動で入力してください。</p>
            <div className={styles.browser} aria-label="公式販売画面の見本">
              <div className={styles.browserBar}>
                <i />
                <i />
                <i />
                <span>販売画面</span>
              </div>
              <div className={styles.browserBody}>
                <b>商品情報を入力</b>
                <span />
                <span />
                <span />
                <em>写真　説明　価格</em>
              </div>
            </div>
            <a
              className={styles.primary}
              href="https://jp.mercari.com/"
              target="_blank"
              rel="noopener noreferrer"
            >
              公式画面を開く　↗
            </a>
          </Card>
        </div>
        <Card className={styles.after}>
          <h3>出品後に入力する情報</h3>
          <div>
            {[
              "販売先　選択してください⌄",
              "商品ID　本人が入力",
              "商品URL　本人が貼り付け",
              "最終確認日　未設定　▣",
            ].map((x) => (
              <input key={x} placeholder={x} />
            ))}
          </div>
        </Card>
        <footer>
          <a href={to(23)} onClick={protectUnsavedDescription}>
            戻る
          </a>
          <div className={styles.officialSavePending}>
            <small>販売先・商品ID・URL・確認日はまだ保存されません</small>
            <button type="button" className={styles.primary} disabled>
              出品情報の保存は準備中
            </button>
          </div>
        </footer>
      </div>
    </Shell>
  );
}
function GalleryVisual({
  kind,
}: {
  kind:
    | "bag"
    | "wallet"
    | "shoe"
    | "backpack"
    | "shirt"
    | "pants"
    | "catalogTote"
    | "catalogWallet"
    | "catalogShoe"
    | "catalogBackpack"
    | "catalogShirt"
    | "catalogPants";
}) {
  const className =
    kind === "bag" || kind === "catalogTote"
      ? styles.galleryBag
      : kind === "wallet" || kind === "catalogWallet"
        ? styles.galleryWallet
        : kind === "shoe" || kind === "catalogShoe"
          ? styles.galleryShoe
          : kind === "backpack" || kind === "catalogBackpack"
            ? styles.galleryBackpack
            : kind === "shirt" || kind === "catalogShirt"
              ? styles.galleryShirt
              : styles.galleryPants;
  const asset = {
    bag: "/approved-assets/pc-fidelity/product/beige-tote-front.png",
    wallet: "/approved-assets/pc-fidelity/purchase/research-watch.png",
    shoe: "/approved-assets/pc-fidelity/team/sneaker-black.png",
    backpack: "/approved-assets/pc-fidelity/inspection/bag-black.png",
    shirt: "/approved-assets/pc-fidelity/inspection/shirt-blue.png",
    pants: "/approved-assets/pc-fidelity/inspection/pants-beige.png",
    catalogTote: "/approved-assets/pc-fidelity/sales/catalog-tote-gray.png",
    catalogWallet: "/approved-assets/pc-fidelity/sales/catalog-passport-wallet-navy.png",
    catalogShoe: "/approved-assets/pc-fidelity/sales/catalog-sneaker-white.png",
    catalogBackpack: "/approved-assets/pc-fidelity/sales/catalog-backpack-black.png",
    catalogShirt: "/approved-assets/pc-fidelity/sales/catalog-shirt-beige.png",
    catalogPants: "/approved-assets/pc-fidelity/sales/catalog-pants-khaki.png",
  }[kind];
  return (
    <div className={`${styles.galleryArt} ${className}`} aria-label={`${kind}の商品写真`}>
      <img src={asset} alt="" />
      <span className={styles.galleryFallback}>
        <i />
        <b />
      </span>
    </div>
  );
}

function PackingBox() {
  return (
    <div className={styles.box} aria-label="梱包箱の写真">
      <img src="/approved-assets/shipping/packing-box.png" alt="梱包箱" />
    </div>
  );
}
function Gallery() {
  const [viewMode, setViewMode] = useState<"gallery" | "list">("gallery");
  const [filter, setFilter] = useState<SavedProductFilter>("all");
  const items = [
    {
      id: "ITM-0001",
      name: "ライトトートバッグ（グレー）",
      channel: "販売先A",
      price: "4,580円",
      checkedAt: "2025/05/20",
      status: "今日確認",
      kind: "catalogTote",
    },
    {
      id: "ITM-0002",
      name: "コンパクト財布（ネイビー）",
      channel: "販売先B",
      price: "3,280円",
      checkedAt: "2025/05/18",
      status: "確認済み",
      kind: "catalogWallet",
    },
    {
      id: "ITM-0003",
      name: "メッシュスニーカー（ホワイト）",
      channel: "販売先A",
      price: "5,980円",
      checkedAt: "2025/05/19",
      status: "今日確認",
      kind: "catalogShoe",
    },
    {
      id: "ITM-0004",
      name: "リュックサック（ブラック）",
      channel: "販売先B",
      price: "6,480円",
      checkedAt: "2025/05/17",
      status: "確認済み",
      kind: "catalogBackpack",
    },
    {
      id: "ITM-0005",
      name: "リネンシャツ（ベージュ）",
      channel: "販売先A",
      price: "2,980円",
      checkedAt: "2025/05/16",
      status: "今日確認",
      kind: "catalogShirt",
    },
    {
      id: "ITM-0006",
      name: "ワイドパンツ（カーキ）",
      channel: "販売先B",
      price: "4,280円",
      checkedAt: "2025/05/15",
      status: "確認済み",
      kind: "catalogPants",
    },
  ] as const;
  const visibleItems = filterSavedProducts(items, filter);
  const pageSummary = getSavedProductPageSummary(visibleItems.length);
  const channelACount = items.filter((item) => item.channel === "販売先A").length;
  const channelBCount = items.filter((item) => item.channel === "販売先B").length;
  return (
    <Shell n={25}>
      <div className={styles.pad}>
        <h2>保存した商品ページ</h2>
        <Notice>リンク先を自動で読み取りません</Notice>
        <nav className={styles.toggle} aria-label="商品ページの表示方法">
          <button
            type="button"
            aria-pressed={viewMode === "list"}
            className={viewMode === "list" ? styles.toggleActive : ""}
            onClick={() => setViewMode("list")}
          >
            — 一覧表示
          </button>
          <button
            type="button"
            aria-pressed={viewMode === "gallery"}
            className={viewMode === "gallery" ? styles.toggleActive : ""}
            onClick={() => setViewMode("gallery")}
          >
            ▦ ギャラリー表示
          </button>
        </nav>
        <nav className={styles.filter} aria-label="販売先で絞り込む">
          {[
            ["all", `すべて ${items.length}`],
            ["channel-a", `販売先A ${channelACount}`],
            ["channel-b", `販売先B ${channelBCount}`],
          ].map(([value, label]) => (
            <button
              type="button"
              aria-pressed={filter === value}
              className={filter === value ? styles.filterActive : ""}
              onClick={() => setFilter(value as SavedProductFilter)}
              key={value}
            >
              {label}
            </button>
          ))}
          <button type="button" disabled title="商品URLの保存機能は準備中です">
            URL確認は準備中
          </button>
        </nav>
        <p className={styles.galleryUrlNotice}>この見本6件に商品URLはまだ登録されていません。</p>
        <div className={`${styles.gallery} ${viewMode === "list" ? styles.galleryList : ""}`}>
          {visibleItems.map((item) => (
            <Card key={item.id}>
              <GalleryVisual kind={item.kind} />
              <b>{item.id}</b>
              <h3>{item.name}</h3>
              <p>{item.channel}</p>
              <p>現在価格　{item.price}</p>
              <small>最終確認日　{item.checkedAt}</small>
              <footer>
                <em>{item.status}</em>
                <span className={styles.galleryUrlAction}>
                  <button type="button" disabled aria-describedby={`url-missing-${item.id}`}>
                    商品ページを開く
                  </button>
                  <small id={`url-missing-${item.id}`}>URL未登録</small>
                </span>
              </footer>
            </Card>
          ))}
        </div>
        <nav className={styles.galleryPagination} aria-label="商品ページ一覧のページ">
          <button type="button" aria-label="前のページ" disabled>
            ‹
          </button>
          <button type="button" className={styles.pageActive} aria-current="page" disabled>
            1
          </button>
          <button type="button" aria-label="次のページ" disabled>
            ›
          </button>
          <span>
            {visibleItems.length}件中 {pageSummary.first}〜{pageSummary.last}件
          </span>
        </nav>
      </div>
    </Shell>
  );
}
function SalesCheck() {
  const [mode, setMode] = useState<"direct" | "screenshot">("direct");
  const items = orderSalesCheckItems(SALES_CHECK_ITEMS);
  const [selectedId, setSelectedId] = useState(items[0]?.id ?? "");
  const [drafts, setDrafts] = useState(() => createSalesCheckDrafts(SALES_CHECK_ITEMS));
  const imageInput = useRef<HTMLInputElement>(null);
  const imagePreviewsRef = useRef<Record<string, SalesCheckImagePreview>>({});
  const [imagePreviews, setImagePreviews] = useState(imagePreviewsRef.current);
  const [imageErrors, setImageErrors] = useState<Record<string, string>>({});
  const selectedItem = items.find((item) => item.id === selectedId) ?? items[0];
  useEffect(
    () => () => {
      releaseSalesCheckImagePreviews(imagePreviewsRef.current, (previewUrl) =>
        URL.revokeObjectURL(previewUrl),
      );
      imagePreviewsRef.current = {};
    },
    [],
  );
  if (!selectedItem) return null;
  const selectedItemId = selectedItem.id;
  const selectedDraft = drafts[selectedItemId] ?? selectedItem.initialDraft;
  const selectedImagePreview = imagePreviews[selectedItemId];
  const selectedImageError = imageErrors[selectedItemId] ?? "";
  const directFields: readonly [string, SalesCheckDraftField, string][] = [
    ["出品日数", "listingDays", "日"],
    ["現在価格", "currentPrice", "円"],
    ["閲覧数", "views", "回"],
    ["検索数", "searches", "回"],
    ["いいね数", "likes", "件"],
    ["値下げ依頼", "priceRequests", "件"],
  ];
  const screenshotFields = directFields.filter(([, field]) => field !== "listingDays");

  function updateDraft(field: SalesCheckDraftField, value: string) {
    setDrafts((current) => updateSalesCheckDraft(current, selectedItemId, field, value));
  }

  function replaceImagePreview(itemId: string, preview: SalesCheckImagePreview | null) {
    const next = replaceSalesCheckImagePreview(
      imagePreviewsRef.current,
      itemId,
      preview,
      (previewUrl) => URL.revokeObjectURL(previewUrl),
    );
    imagePreviewsRef.current = next;
    setImagePreviews(next);
  }

  function handleImageSelection(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    const validationError = validateSalesCheckImageFile(file);
    if (validationError) {
      setImageErrors((current) => ({ ...current, [selectedItemId]: validationError }));
      return;
    }
    let previewUrl: string;
    try {
      previewUrl = URL.createObjectURL(file);
    } catch {
      setImageErrors((current) => ({
        ...current,
        [selectedItemId]: "画像を開けませんでした。別の画像を選んでください。",
      }));
      return;
    }
    replaceImagePreview(selectedItemId, { previewUrl, state: "loading" });
    setImageErrors((current) => ({ ...current, [selectedItemId]: "" }));
  }

  function finishImagePreview(itemId: string, previewUrl: string, image: HTMLImageElement) {
    if (!isCurrentSalesCheckImagePreview(imagePreviewsRef.current, itemId, previewUrl, "loading"))
      return;
    const validationError = validateSalesCheckImageDimensions(
      image.naturalWidth,
      image.naturalHeight,
    );
    if (validationError) {
      replaceImagePreview(itemId, null);
      setImageErrors((errors) => ({ ...errors, [itemId]: validationError }));
      return;
    }
    replaceImagePreview(itemId, { previewUrl, state: "ready" });
    setDrafts((currentDrafts) =>
      updateSalesCheckDraft(currentDrafts, itemId, "source", "本人が画像と比較して確認"),
    );
  }

  function rejectImagePreview(itemId: string, previewUrl: string) {
    if (!isCurrentSalesCheckImagePreview(imagePreviewsRef.current, itemId, previewUrl)) return;
    replaceImagePreview(itemId, null);
    setImageErrors((errors) => ({
      ...errors,
      [itemId]: "画像を表示できませんでした。別の画像を選んでください。",
    }));
  }

  return (
    <Shell n={26}>
      <div className={styles.pad}>
        <h2>販売状況を確認</h2>
        <Notice>公式ページを自動で読み取りません</Notice>
        <div className={styles.sales}>
          <Card>
            <b>今日確認する商品　{items.length}件</b>
            <small className={styles.salesReferenceDate}>
              見本基準日 {SALES_CHECK_REFERENCE_DATE.replaceAll("-", "/")}・古い順
            </small>
            {items.map((item) => (
              <button
                type="button"
                className={item.id === selectedItem.id ? styles.selected : ""}
                aria-pressed={item.id === selectedItem.id}
                onClick={() => setSelectedId(item.id)}
                key={item.id}
              >
                <GalleryVisual kind={item.kind} />
                <strong>{item.id}</strong>
                <span>{item.name}</span>
                <small>
                  {item.channel}　最終確認日 {item.checkedAt.replaceAll("-", "/")}
                </small>
                <em className={styles.salesItemStatus}>{getSalesCheckAge(item.checkedAt)}</em>
              </button>
            ))}
          </Card>
          <section>
            <h3>
              {selectedItem.id}　{selectedItem.name}　<em>候補・人が確認</em>
            </h3>
            <p className={styles.salesChannel}>{selectedItem.channel}</p>
            <nav className={styles.tabs} aria-label="販売状況の入力方法">
              <button
                type="button"
                className={mode === "direct" ? styles.tabActive : ""}
                aria-pressed={mode === "direct"}
                onClick={() => setMode("direct")}
              >
                数字を直接入力
              </button>
              <button
                type="button"
                className={mode === "screenshot" ? styles.tabActive : ""}
                aria-pressed={mode === "screenshot"}
                onClick={() => setMode("screenshot")}
              >
                スクリーンショットから候補
              </button>
            </nav>
            <Card>
              {mode === "screenshot" ? (
                <div className={styles.salesScreenshotPending}>
                  <figure>
                    <img
                      key={selectedImagePreview?.previewUrl ?? "approved-design-example"}
                      src={
                        selectedImagePreview?.previewUrl ??
                        "/approved-assets/pc-fidelity/sales/official-screen-pants.png"
                      }
                      alt={
                        selectedImagePreview
                          ? "本人が選んだ販売状況画像のプレビュー"
                          : "販売画面の承認デザイン見本"
                      }
                      onLoad={
                        selectedImagePreview?.state === "loading"
                          ? (event) =>
                              finishImagePreview(
                                selectedItemId,
                                selectedImagePreview.previewUrl,
                                event.currentTarget,
                              )
                          : undefined
                      }
                      onError={
                        selectedImagePreview
                          ? () =>
                              rejectImagePreview(selectedItemId, selectedImagePreview.previewUrl)
                          : undefined
                      }
                    />
                    <figcaption>
                      {selectedImagePreview
                        ? "PC内だけの一時プレビュー・保存されません"
                        : "承認デザインの見本・実データではありません"}
                    </figcaption>
                  </figure>
                  <div>
                    <p className={styles.candidate}>候補・人が確認</p>
                    <b>
                      {selectedImagePreview?.state === "loading"
                        ? "画像を確認しています…"
                        : selectedImagePreview
                          ? "画像を見ながら本人が入力"
                          : "画像を選んで数字を見比べる"}
                    </b>
                    <p id="sales-screenshot-help">
                      画像から数字を自動入力しません。原画像と下の値を本人が比較してください。
                    </p>
                    {selectedImageError ? (
                      <p
                        id={`sales-screenshot-error-${selectedItemId}`}
                        className={styles.salesScreenshotError}
                        role="alert"
                      >
                        {selectedImageError}
                      </p>
                    ) : null}
                    <input
                      ref={imageInput}
                      type="file"
                      accept={SALES_CHECK_IMAGE_ACCEPT}
                      className={styles.salesScreenshotFileInput}
                      aria-label="販売状況の画像を選ぶ"
                      onChange={handleImageSelection}
                    />
                    <button
                      type="button"
                      aria-describedby={`sales-screenshot-help${
                        selectedImageError ? ` sales-screenshot-error-${selectedItemId}` : ""
                      }`}
                      onClick={() => imageInput.current?.click()}
                    >
                      {selectedImagePreview ? "画像を選び直す" : "画像を選ぶ"}
                    </button>
                  </div>
                </div>
              ) : null}
              <div
                className={`${styles.directEntry} ${
                  mode === "screenshot" ? styles.screenshotCandidateFields : ""
                }`}
              >
                {(mode === "direct" ? directFields : screenshotFields).map(
                  ([label, field, unit]) => (
                    <label key={field}>
                      {label}
                      <span>
                        <input
                          aria-label={label}
                          value={selectedDraft[field]}
                          inputMode="numeric"
                          onChange={(event) => updateDraft(field, event.target.value)}
                        />
                        <i>{unit}</i>
                      </span>
                    </label>
                  ),
                )}
              </div>
              <div className={styles.salesMetaFields}>
                <label>
                  確認日
                  <input
                    aria-label="確認日"
                    type="date"
                    value={selectedDraft.recordedAt}
                    onChange={(event) => updateDraft("recordedAt", event.target.value)}
                  />
                </label>
                <label>
                  入力元
                  <select
                    aria-label="入力元"
                    value={selectedDraft.source}
                    onChange={(event) => updateDraft("source", event.target.value)}
                  >
                    <option>本人が公式ページで確認</option>
                    <option>本人が画像と比較して確認</option>
                  </select>
                </label>
                <label>
                  次回確認日
                  <input
                    aria-label="次回確認日"
                    type="date"
                    value={selectedDraft.nextCheckAt}
                    onChange={(event) => updateDraft("nextCheckAt", event.target.value)}
                  />
                </label>
              </div>
              <p className={styles.salesDraftNotice}>
                入力はこの画面を開いている間だけ保持され、まだ保存されません。
              </p>
              <footer className={styles.salesPendingActions}>
                <span>
                  <button type="button" disabled aria-describedby="sales-url-pending">
                    公式ページを開く
                  </button>
                  <small id="sales-url-pending">商品URLは未登録です</small>
                </span>
                <span>
                  <button type="button" className={styles.primary} disabled>
                    数値の保存は準備中
                  </button>
                  <small>保存成功として次へ進みません</small>
                </span>
              </footer>
            </Card>
          </section>
        </div>
      </div>
    </Shell>
  );
}
function Price() {
  const [customPrice, setCustomPrice] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const customPriceInput = useRef<HTMLInputElement>(null);
  const rows = [
    ["現在価格", "4,280円", "—", "—", "—", "input:円"],
    ["値下げ率", "—", "5%", "10%", "15%", "—"],
    ["新価格", "—", "4,066円", "3,852円", "3,638円", "input:円"],
    ["想定粗利（※）", "1,520円", "1,306円", "1,092円", "878円", "input:円"],
    ["最低ライン（関係値）", "—", "○", "△", "×", "select:選択"],
    [
      "自社の販売履歴（参考）",
      "直近30日\n3件 / 平均4,560円",
      "成約率: 46%\n平均4,280円",
      "成約率: 32%\n平均3,900円",
      "成約率: 18%\n平均3,720円",
      "—",
    ],
    ["季節・イベント参考", "初夏", "やや追い風", "標準", "やや逆風", "select:選択"],
    ["情報の出どころ", "担当者の主観", "—", "—", "—", "input:入力"],
    ["確認日", "2025/05/20", "2025/05/20", "2025/05/20", "2025/05/20", "date:日付を選択"],
  ] as const;

  async function copyCustomPrice() {
    setCopyStatus("");
    const formattedPrice = formatPriceCandidate(customPrice);
    if (!formattedPrice) {
      setCopyStatus("新価格を1円以上の数字で入力してください。");
      customPriceInput.current?.focus();
      return;
    }

    const copied = await copyResearchText(formattedPrice, (text) =>
      navigator.clipboard.writeText(text),
    );
    setCopyStatus(
      copied
        ? `${formattedPrice}をコピーしました。公式ページで本人が確認して反映してください。`
        : "コピーできませんでした。新価格の入力欄を選択して手動でコピーしてください。",
    );
  }

  return (
    <Shell n={27}>
      <div className={styles.pad}>
        <h2>価格候補を比べる</h2>
        <table className={styles.price}>
          <thead>
            <tr>
              {[
                "項目",
                "参考値",
                "候補1（5%）",
                "候補2（10%）",
                "候補3（15%）",
                "新価格を入力",
              ].map((x) => (
                <th key={x}>{x}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, ...cells]) => (
              <tr key={label}>
                <th>{label}</th>
                {cells.map((cell, index) => (
                  <td key={`${label}-${index}`}>
                    {label === "新価格" && index === 4 ? (
                      <input
                        ref={customPriceInput}
                        aria-label="コピーする新価格"
                        inputMode="numeric"
                        value={customPrice}
                        onChange={(event) => {
                          setCustomPrice(event.target.value);
                          setCopyStatus("");
                        }}
                        placeholder="円"
                      />
                    ) : cell.startsWith("input:") || cell.startsWith("date:") ? (
                      <input placeholder={cell.split(":")[1]} />
                    ) : cell.startsWith("select:") ? (
                      <select defaultValue="">
                        <option value="">{cell.split(":")[1]}</option>
                        <option>○</option>
                        <option>△</option>
                        <option>×</option>
                      </select>
                    ) : (
                      cell.split("\n").map((line) => <span key={line}>{line}</span>)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          ※
          想定粗利は手数料・送料・梱包費を差し引いた目安です。実際の粗利を保証するものではありません。
        </p>
        <div className={styles.priceFooter}>
          {copyStatus ? (
            <p
              className={styles.priceCopyNotice}
              role={copyStatus.includes("コピーしました") ? "status" : "alert"}
            >
              {copyStatus}
            </p>
          ) : null}
          <button type="button" className={styles.primary} onClick={() => void copyCustomPrice()}>
            この候補をコピー　›
          </button>
        </div>
      </div>
    </Shell>
  );
}
function Reply() {
  const templates = [
    {
      title: "値下げ不可のご案内",
      body: "お問い合わせありがとうございます。\n恐れ入りますが、現在の価格でご検討いただけますと幸いです。",
    },
    {
      title: "お気持ち程度のご提案",
      body: "お問い合わせありがとうございます。\nお気持ち程度で恐縮ですが、○○円まででしたら対応可能です。\nご検討くださいませ。",
    },
    {
      title: "まとめ買いのご案内",
      body: "お問い合わせありがとうございます。\nまとめてご購入いただける場合は、送料分をお値引きいたします。\nご希望の商品をお知らせください。",
    },
    {
      title: "その他のご案内",
      body: "ご連絡ありがとうございます。\n内容を確認のうえ、改めてご連絡いたします。",
    },
  ] as const;
  const [drafts, setDrafts] = useState<string[]>(() => templates.map((template) => template.body));
  const [selectedTemplate, setSelectedTemplate] = useState(0);
  const [copyStatus, setCopyStatus] = useState("");

  async function copyTemplate(index: number) {
    setSelectedTemplate(index);
    setCopyStatus("");
    const copied = await copyResearchText(drafts[index] ?? "", (text) =>
      navigator.clipboard.writeText(text),
    );
    setCopyStatus(
      copied
        ? "コピーしました。公式ページへ貼り付ける前に内容を確認してください。"
        : "コピーできませんでした。文章欄を選択して手動でコピーしてください。",
    );
  }

  return (
    <Shell n={28}>
      <div className={styles.pad}>
        <h2>返信文と本人操作</h2>
        <Notice>
          変更と送信は本人が公式画面で行います。自動の返信・値引き・販売は行いません。
        </Notice>
        <div className={styles.reply}>
          <Card>
            <h3>返信テンプレート（編集可能）</h3>
            {templates.map((template, index) => (
              <article key={template.title} data-selected={selectedTemplate === index}>
                <b>{template.title}</b>
                <textarea
                  className={styles.replyTemplateText}
                  aria-label={`${template.title}の本文`}
                  value={drafts[index] ?? ""}
                  onFocus={() => setSelectedTemplate(index)}
                  onChange={(event) => {
                    const nextDrafts = [...drafts];
                    nextDrafts[index] = event.target.value;
                    setDrafts(nextDrafts);
                    setSelectedTemplate(index);
                    setCopyStatus("");
                  }}
                />
                <button
                  type="button"
                  className={styles.replyCopyButton}
                  disabled={!(drafts[index] ?? "").trim()}
                  onClick={() => void copyTemplate(index)}
                >
                  コピー
                </button>
              </article>
            ))}
          </Card>
          <Card>
            <h3>操作と記録</h3>
            <a
              className={styles.outline}
              href="https://jp.mercari.com/"
              target="_blank"
              rel="noopener noreferrer"
            >
              公式ページを開く
            </a>
            <h4>適用結果（本人操作後にチェック）</h4>
            {["返信を送信した", "価格を変更した", "商品情報を更新した", "その他の対応を行った"].map(
              (x) => (
                <label key={x}>
                  <input type="checkbox" /> {x}
                </label>
              ),
            )}
            <h4>メモ（任意）</h4>
            <textarea placeholder="対応内容をメモしてください" />
          </Card>
        </div>
        <div className={styles.replyFooter}>
          {copyStatus ? (
            <p
              className={styles.replyCopyNotice}
              role={copyStatus.startsWith("コピーしました") ? "status" : "alert"}
            >
              {copyStatus}
            </p>
          ) : null}
          <button
            type="button"
            className={styles.primary}
            disabled={!(drafts[selectedTemplate] ?? "").trim()}
            onClick={() => void copyTemplate(selectedTemplate)}
          >
            文章をコピー
          </button>
        </div>
      </div>
    </Shell>
  );
}
function Order() {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [channel, setChannel] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [salesAmount, setSalesAmount] = useState("");
  const [deferredMessage, setDeferredMessage] = useState("");
  const missingCount = Number(!transactionId.trim()) + Number(!salesAmount.trim());

  return (
    <Shell n={29}>
      <div className={styles.pad}>
        <h2>注文を記録</h2>
        <p>
          匿名配送で住所の情報が不要な場合は、住所は保存しません。　
          <button
            type="button"
            className={styles.orderDetailsButton}
            aria-expanded={detailsOpen}
            aria-controls="approved-order-address-details"
            onClick={() => setDetailsOpen((current) => !current)}
          >
            {detailsOpen ? "説明を閉じる" : "詳しく見る"} ⓘ
          </button>
        </p>
        {detailsOpen ? (
          <p className={styles.orderDetails} id="approved-order-address-details">
            匿名配送でも販売先の仕様によって住所情報が必要になる場合があります。実際の登録前に、本人が販売先の注文内容を確認します。
          </p>
        ) : null}
        <Card className={styles.order}>
          <h3>⚙ 注文番号の表示見本 #0048（実番号は登録時に付与）</h3>
          <div>
            <label>
              <span className={styles.orderFieldHead}>
                <b>販売先</b>
                <span className={styles.requiredChip}>必須</span>
              </span>
              <select value={channel} onChange={(event) => setChannel(event.target.value)}>
                <option value="" disabled>
                  選択してください
                </option>
                <option value="mercari">メルカリ</option>
              </select>
            </label>
            <label>
              <span className={styles.orderFieldHead}>
                <b>取引ID</b>
                <span className={styles.laterHint}>任意・あとで入力できます</span>
              </span>
              <span className={styles.orderInlineInput}>
                <input
                  placeholder="取引IDを入力"
                  value={transactionId}
                  onChange={(event) => {
                    setTransactionId(event.target.value);
                    setDeferredMessage("");
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    setTransactionId("");
                    setDeferredMessage(
                      "取引IDを未入力として表示しています。この見本画面から注文は保存されません。",
                    );
                  }}
                >
                  あとで入力
                </button>
              </span>
            </label>
            <label>
              <span className={styles.orderFieldHead}>
                <b>購入者の表示名</b>
                <span className={styles.laterHint}>任意</span>
              </span>
              <input
                placeholder="表示名を入力"
                value={buyerName}
                onChange={(event) => setBuyerName(event.target.value)}
              />
            </label>
            <label>
              <span className={styles.orderFieldHead}>
                <b>販売金額</b>
                <span className={styles.requiredChip}>必須</span>
              </span>
              <span className={styles.orderInlineInput}>
                <span className={styles.moneyInput}>
                  <span>¥</span>
                  <input
                    inputMode="numeric"
                    placeholder="0"
                    value={salesAmount}
                    onChange={(event) => {
                      setSalesAmount(event.target.value);
                      setDeferredMessage("");
                    }}
                  />
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSalesAmount("");
                    setDeferredMessage(
                      "販売金額を未入力として表示しています。この見本画面から注文は保存されません。",
                    );
                  }}
                >
                  あとで確認
                </button>
              </span>
            </label>
          </div>
          <p className={missingCount > 0 ? styles.warn : styles.ok}>
            {missingCount > 0
              ? `▲　未入力 ${missingCount}件・作業は続けられます`
              : "●　取引IDと販売金額は入力されています"}
          </p>
          {deferredMessage ? (
            <p className={styles.orderLocalStatus} role="status">
              {deferredMessage}
            </p>
          ) : null}
          <Notice>
            匿名配送で住所の情報が不要な場合は、住所は保存しません。
            <br />
            匿名配送であっても、販売先の仕様により住所の情報が必要な場合があります。
          </Notice>
        </Card>
        <p className={styles.orderPreviewNotice}>
          この画面は承認デザインの見本です。入力はサーバーへ送られず、実注文は登録されません。
        </p>
        <footer className={styles.pendingFooter}>
          <a href={to(28)}>キャンセル</a>
          <a className={styles.outline} href={to(30)}>
            取り出し画面の見本を見る
          </a>
          <span className={styles.pendingPrimaryAction}>
            <button
              type="button"
              className={`${styles.primary} ${styles.primaryDisabled}`}
              disabled
            >
              仮登録は準備中
            </button>
            <small>実際の登録は業務用「注文・発送」で本人が行います</small>
          </span>
        </footer>
      </div>
    </Shell>
  );
}
function Pick() {
  return (
    <Shell n={30}>
      <div className={styles.pad}>
        <h2>
          商品を取り出す　<em>承認デザインの見本</em>
        </h2>
        <p>注文番号の見本 #0048　配送先表示の見本：一般のご購入者様</p>
        <div className={styles.pick}>
          <Card>
            <h3>商品ラベル</h3>
            <ProductLabel />
          </Card>
          <Card>
            <h3>置き場所ラベル</h3>
            <LocationLabel />
          </Card>
          <Card>
            <h3>保管場所の写真</h3>
            <ShelfPhoto />
          </Card>
        </div>
        <div className={styles.pickBottom}>
          <Card>
            <h3>照合結果</h3>
            <b className={styles.pendingResult}>● 一致状態の表示見本</b>
            <p>実際のラベル読み取り・照合結果ではありません。</p>
          </Card>
          <Notice>
            <b>作業のポイント</b>
            <br />
            実作業では商品ラベルと置き場所ラベルを読み取り、本人が正しい商品か確認します。
          </Notice>
        </div>
        <footer className={styles.pendingFooter}>
          <a href={to(29)}>中止する</a>
          <a className={styles.outline} href={to(31)}>
            発送前写真の見本を見る
          </a>
          <span className={styles.pendingPrimaryAction}>
            <button
              type="button"
              className={`${styles.primary} ${styles.primaryDisabled}`}
              disabled
            >
              取り出し完了は準備中
            </button>
            <small>実ラベルの読み取り前は完了にしません</small>
          </span>
        </footer>
      </div>
    </Shell>
  );
}
function Pack() {
  const [policy, setPolicy] = useState(0);
  const checklistItems = [
    "商品が正しい",
    "付属品が揃っている",
    "傷や汚れはない",
    "緩衝材を使用した",
    "箱をしっかり封緘した",
    "その他（任意）",
  ];
  const [checkedItems, setCheckedItems] = useState(() => checklistItems.map(() => false));
  const checkedCount = checkedItems.filter(Boolean).length;
  return (
    <Shell n={31}>
      <div className={styles.pad}>
        <h2>
          発送前の写真　<em>高額商品に該当</em>
        </h2>
        <p>すり替え・内容違いの確認用に、発送前の状態を残します。</p>
        <h3>
          ワークフロー設定 <small>（どの注文で写真を撮るか）</small>
          <span className={styles.threshold}>
            高額の目安　<b>¥30,000</b>（設定で変更できます）
          </span>
        </h3>
        <div className={styles.packOpts}>
          {[
            ["高額商品だけ撮る（おすすめ）", "高額の注文でだけ撮影し、確認に使います。"],
            ["すべて撮る", "すべての注文で撮影し、確認に使います。"],
            ["使わない", "この機能を使わず、写真は撮りません。"],
          ].map((x, i) => (
            <Card
              className={i === policy ? styles.selected : ""}
              onClick={() => setPolicy(i)}
              ariaPressed={i === policy}
              key={x[0]}
            >
              <b>
                {i === policy ? "◉" : "○"}　{x[0]}
              </b>
              <p>{x[1]}</p>
            </Card>
          ))}
        </div>
        <div className={styles.packBottom}>
          <Card>
            <h3>商品写真（例）</h3>
            <Headphones />
            <button className={styles.packPhotoAction} type="button" disabled>
              ▣ 再撮影は準備中
            </button>
          </Card>
          <Card>
            <h3>梱包写真（例）</h3>
            <PackingBox />
            <button className={styles.packPhotoAction} type="button" disabled>
              ▣ 再撮影は準備中
            </button>
          </Card>
          <Card>
            <h3>確認チェックリスト（人の目で確認）</h3>
            {checklistItems.map((x, i) => (
              <label key={x}>
                <input
                  type="checkbox"
                  checked={checkedItems[i]}
                  onChange={(event) =>
                    setCheckedItems((current) =>
                      current.map((checked, index) =>
                        index === i ? event.target.checked : checked,
                      ),
                    )
                  }
                />{" "}
                {x}
              </label>
            ))}
            <small className={styles.packChecklistStatus}>
              {checkedCount}/6項目（画面内の確認見本）
            </small>
          </Card>
        </div>
        <Notice>金額が未入力でも、梱包を止めずに進めます。</Notice>
        <p className={styles.privacyNote}>
          ▣　この見本画面では写真を保存・外部送信しません。実際の写真保存は準備中です。
        </p>
        <footer className={`${styles.pendingFooter} ${styles.packPreviewFooter}`}>
          <button type="button" className={styles.secondaryAction} onClick={() => setPolicy(2)}>
            今回は使わない（見本）
          </button>
          <a className={styles.outline} href={to(32)}>
            配送画面の見本を見る
          </a>
          <span className={styles.pendingPrimaryAction}>
            <button
              type="button"
              className={`${styles.primary} ${styles.primaryDisabled}`}
              disabled
            >
              写真の保存は準備中
            </button>
            <small>実写真の撮影・確認前は保存しません</small>
          </span>
        </footer>
      </div>
    </Shell>
  );
}
function Ship() {
  const shippingMethods = [
    ["配送方法A（追跡あり）", "お届けの目安：2〜3日", "¥600"],
    ["配送方法B（追跡あり）", "お届けの目安：1〜2日", "¥450"],
    ["配送方法C（追跡なし）", "お届けの目安：4〜7日", "¥300"],
  ];
  const [selectedMethod, setSelectedMethod] = useState(1);
  const [plannedDate, setPlannedDate] = useState("2025/05/21");
  const [shippedAt, setShippedAt] = useState("2025/05/20　15:20");
  return (
    <Shell n={32}>
      <div className={styles.pad}>
        <h2>配送方法と発送</h2>
        <p>仮注文 #0048（表示見本）　 販売先：選択例　｜　配送先：架空のご購入者様</p>
        <p className={styles.shipDone}>
          ◌ 発送前写真の表示見本　2枚・未確認（実写真の確認結果ではありません）
        </p>
        <div className={styles.ship}>
          <Card>
            <h3>
              お届け先（表示例） <em className={styles.domesticChip}>国内向け</em>
            </h3>
            <p>
              <b>配送方法の候補（画面内の見本）</b>
            </p>
            {shippingMethods.map(([method, estimate, price], i) => (
              <button
                type="button"
                className={`${styles.shipMethodChoice} ${i === selectedMethod ? styles.selected : ""}`}
                aria-pressed={i === selectedMethod}
                onClick={() => setSelectedMethod(i)}
                key={method}
              >
                <span>
                  {i === selectedMethod ? "◉" : "○"}　{method}
                </span>
                <small>{estimate}</small>
                <b>{price}</b>
              </button>
            ))}
          </Card>
          <Card>
            <h3>
              配送料金（履歴の表示例）
              <button className={styles.catalogEditButton} type="button" disabled>
                カタログ編集は準備中
              </button>
            </h3>
            <table>
              <tbody>
                {[
                  "2025/05/18　配送方法B　¥450",
                  "2025/05/08　配送方法B　¥450",
                  "2025/04/28　配送方法B　¥450",
                ].map((x) => (
                  <tr key={x}>
                    <td>・　{x}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className={`${styles.total} ${styles.shipTotalPreview}`}>
              選択中の料金候補　<b>{shippingMethods[selectedMethod]?.[2]}（見本）</b>
            </p>
          </Card>
          <Card>
            <h3>発送情報（入力見本）</h3>
            <label>
              発送予定日 <small>（人のチェック必須）</small>
              <input value={plannedDate} onChange={(event) => setPlannedDate(event.target.value)} />
            </label>
            <label>
              発送日時
              <input value={shippedAt} onChange={(event) => setShippedAt(event.target.value)} />
            </label>
            <small className={styles.shipLocalStatus}>
              入力内容はこの見本画面だけで、保存されません。
            </small>
          </Card>
        </div>
        <Notice>
          <b>手動入力・編集可能</b>
          <br />
          配送方法や料金カタログは、設定画面から編集できます。自動で外部サービスの情報を取得することはありません。
        </Notice>
        <div className={styles.orderFooterWarning}>
          <span>▲ 発送を確定する前に未入力の注文情報を確認</span>
          <a href={to(29)}>注文情報を確認</a>
        </div>
        <footer className={styles.pendingFooter}>
          <a href={to(31)}>戻る</a>
          <a className={styles.outline} href={to(33)}>
            在庫画面の見本を見る
          </a>
          <span className={styles.pendingPrimaryAction}>
            <button
              type="button"
              className={`${styles.primary} ${styles.primaryDisabled}`}
              disabled
            >
              発送記録は準備中
            </button>
            <small>実注文と人の確認がないため記録しません</small>
          </span>
        </footer>
      </div>
    </Shell>
  );
}

export function ApprovedPcMiddleScreens({ screenNumber }: { screenNumber: number }) {
  switch (screenNumber) {
    case 17:
      return <Photos />;
    case 18:
      return <EditPolicy />;
    case 19:
      return <Processed />;
    case 20:
      return <Measure />;
    case 21:
      return <Tags />;
    case 22:
      return <ProductSummary />;
    case 23:
      return <Description />;
    case 24:
      return <Official />;
    case 25:
      return <Gallery />;
    case 26:
      return <SalesCheck />;
    case 27:
      return <Price />;
    case 28:
      return <Reply />;
    case 29:
      return <Order />;
    case 30:
      return <Pick />;
    case 31:
      return <Pack />;
    default:
      return <Ship />;
  }
}
