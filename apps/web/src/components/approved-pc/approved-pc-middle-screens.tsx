"use client";
import { useState } from "react";
import styles from "./approved-pc-middle-screens.module.css";
import { PcCanvas } from "./pc-canvas";
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
  return (
    <header className={styles.topbar}>
      <div className={styles.topbarTitle}>
        <b>{String(n).padStart(2, "0")}</b>
        <h1>{names[n - 17]}</h1>
        {n === 23 && <em className={styles.headerStatus}>候補・人が確認</em>}
      </div>
      {isP1ApprovedPcScreen(n) ? <span className={styles.scopeBadge}>準備中・P0対象外</span> : null}
      <label className={styles.topbarSearch}>
        ⌕　<span>商品名・キーワード・メモを検索</span>
      </label>
      <span className={styles.topbarBell} aria-label="通知">
        <PcUiGlyph name="bell" />
      </span>
      {workDetail && (
        <span className={styles.topbarHelp} aria-label="ヘルプ">
          <PcUiGlyph name="help" />
        </span>
      )}
      <span className={styles.topbarUser}>
        <PcUiGlyph name="user" />
        {!workDetail && "スタッフA⌄"}
      </span>
    </header>
  );
}
function UtilityHeader() {
  return (
    <header className={styles.utilityHeader}>
      <button type="button" aria-label="サイドバーを開く" className={styles.utilitySideToggle}>
        ☰
      </button>
      <div className={styles.utilityMainTools}>
        <button
          type="button"
          aria-label="作業者メニューを開く"
          className={styles.utilityFrameToggle}
        >
          ☰
        </button>
        <button type="button" className={styles.workerMenu}>
          作業者メニュー　⌄
        </button>
        <div className={styles.utilityTools}>
          <span aria-label="通知">
            <PcUiGlyph name="bell" />
          </span>
          <span aria-label="ヘルプ">
            <PcUiGlyph name="help" />
          </span>
          <span className={styles.utilityUser}>
            <PcUiGlyph name="user" />
            担当A⌄
          </span>
        </div>
      </div>
    </header>
  );
}
function Shell({ n, children }: { n: number; children: React.ReactNode }) {
  const active = n <= 20 ? "商品" : "作業";
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
}: {
  children: React.ReactNode;
  className?: string | undefined;
  onClick?: () => void;
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
          <a href={to(17)} className={styles.confirmedAction}>
            ✓ 確認済み
          </a>
          <a href={to(17)}>写真を並べ替え</a>
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
            <a href={to(17)}>写真を追加</a>
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
          <Button n={20}>確認した値を保存</Button>
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
              タグ・ケアラベルの写真 <a href={to(21)}>写真を追加</a>
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
          <Button n={21}>確認した内容を保存</Button>
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
            <a href={to(22)}>すべての写真を確認</a>
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
        <Button n={22}>商品説明の候補を作る</Button>
      </div>
    </Shell>
  );
}
function Description() {
  return (
    <Shell n={23}>
      <div className={styles.pad}>
        <div className={styles.desc}>
          <Card>
            <h3>
              商品説明（編集できます） <small>文字数：約312文字</small>
            </h3>
            <textarea
              defaultValue={
                "サンプルブランドのオックスフォードシャツです。\n爽やかなライトブルーのカラーで、幅広いコーディネートに合わせやすいベーシックなデザインです。\n\n程よい厚みの綿100%生地で、通年でご着用いただけます。\nカジュアルからきれいめまで活躍する一枚です。\n\n【ブランド】サンプルブランド\n【サイズ】M\n【カラー】ライトブルー\n【素材】綿100%\n\n【実寸（cm）】\n着丈 72.5 / 肩幅 45.0 / 身幅54.0 / 袖丈61.0 / 裄丈83.5\n\n【状態】\n目立つ汚れやダメージはなく、全体的にきれいな状態です。"
              }
            />
            <p>
              <a href={to(23)}>プレビュー</a>　<a href={to(23)}>リセット</a>
              <small>改行はそのまま反映されます</small>
            </p>
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
              <textarea placeholder="メモを入力してください" />
            </Card>
          </section>
        </div>
        <footer>
          <a href={to(22)}>戻る</a>
          <Button n={23}>コピーする内容を確認</Button>
        </footer>
      </div>
    </Shell>
  );
}
function Official() {
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
            <a href={to(24)}>↓ 写真（12枚）を一括ダウンロード</a>
          </Card>
          <Card>
            <h3>2. テキストをコピー</h3>
            <p>商品説明をコピーして貼り付けてください。</p>
            <textarea
              defaultValue={
                "サンプルブランドのオックスフォードシャツです。\n爽やかなライトブルーのカラーで、幅広いコーディネートに合わせやすいベーシックなデザインです。\n\n程よい厚みの綿100%生地で、通年でご着用いただけます。"
              }
            />
            <a href={to(24)}>商品説明をコピー　▣</a>
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
            <a className={styles.primary} href={to(24)}>
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
          <a href={to(23)}>戻る</a>
          <Button n={24}>出品情報を保存</Button>
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
  return (
    <Shell n={25}>
      <div className={styles.pad}>
        <h2>保存した商品ページ</h2>
        <Notice>リンク先を自動で読み取りません</Notice>
        <nav className={styles.toggle}>
          — 一覧表示　　<b>▦ ギャラリー表示</b>
        </nav>
        <p className={styles.filter}>すべて　48　　販売先A　24　　販売先B　24　　未確認URL　9</p>
        <div className={styles.gallery}>
          {items.map((item) => (
            <Card key={item.id}>
              <GalleryVisual kind={item.kind} />
              <b>{item.id}</b>
              <h3>{item.name}</h3>
              <p>{item.channel}</p>
              <p>現在価格　{item.price}</p>
              <small>最終確認日　{item.checkedAt}</small>
              <footer>
                <em>{item.status}</em>
                <a href={to(26)}>商品ページを開く</a>
              </footer>
            </Card>
          ))}
        </div>
        <nav className={styles.galleryPagination} aria-label="商品ページ一覧のページ">
          <a href={to(25)} aria-label="前のページ">
            ‹
          </a>
          {[1, 2, 3].map((page) => (
            <a className={page === 1 ? styles.pageActive : ""} href={to(25)} key={page}>
              {page}
            </a>
          ))}
          <a href={to(25)} aria-label="次のページ">
            ›
          </a>
          <span>48件中 1〜6件</span>
        </nav>
      </div>
    </Shell>
  );
}
function SalesCheck() {
  const [mode, setMode] = useState<"direct" | "screenshot">("direct");
  const [selected, setSelected] = useState(1);
  const items = [
    {
      id: "ITM-0004",
      name: "リュックサック（ブラック）",
      channel: "販売先B",
      date: "2025/05/17",
      status: "7日未確認",
      kind: "catalogBackpack",
    },
    {
      id: "ITM-0006",
      name: "ワイドパンツ（カーキ）",
      channel: "販売先B",
      date: "2025/05/15",
      status: "7日未確認",
      kind: "catalogPants",
    },
    {
      id: "ITM-0002",
      name: "コンパクト財布（ネイビー）",
      channel: "販売先B",
      date: "2025/05/18",
      status: "確認済み",
      kind: "catalogWallet",
    },
    {
      id: "ITM-0003",
      name: "メッシュスニーカー（ホワイト）",
      channel: "販売先A",
      date: "2025/05/19",
      status: "今日確認",
      kind: "catalogShoe",
    },
    {
      id: "ITM-0001",
      name: "ライトトートバッグ（グレー）",
      channel: "販売先A",
      date: "2025/05/20",
      status: "今日確認",
      kind: "catalogTote",
    },
    {
      id: "ITM-0005",
      name: "リネンシャツ（ベージュ）",
      channel: "販売先A",
      date: "2025/05/16",
      status: "7日未確認",
      kind: "catalogShirt",
    },
  ] as const;
  return (
    <Shell n={26}>
      <div className={styles.pad}>
        <h2>販売状況を確認</h2>
        <Notice>公式ページを自動で読み取りません</Notice>
        <div className={styles.sales}>
          <Card>
            <b>今日確認する商品　8件</b>
            {items.map((item, i) => (
              <button
                type="button"
                className={i === selected ? styles.selected : ""}
                onClick={() => setSelected(i)}
                key={item.id}
              >
                <GalleryVisual kind={item.kind} />
                <strong>{item.id}</strong>
                <span>{item.name}</span>
                <small>
                  {item.channel}　最終確認日 {item.date}
                </small>
                <em className={styles.salesItemStatus}>{item.status}</em>
              </button>
            ))}
          </Card>
          <section>
            <h3>
              ITM-0006　ワイドパンツ（カーキ）　<em>候補・人が確認</em>
            </h3>
            <p className={styles.salesChannel}>販売先B</p>
            <nav className={styles.tabs} aria-label="販売状況の入力方法">
              <button
                type="button"
                className={mode === "direct" ? styles.tabActive : ""}
                onClick={() => setMode("direct")}
              >
                数字を直接入力
              </button>
              <button
                type="button"
                className={mode === "screenshot" ? styles.tabActive : ""}
                onClick={() => setMode("screenshot")}
              >
                スクリーンショットから候補
              </button>
            </nav>
            <Card>
              {mode === "direct" ? (
                <div className={styles.directEntry}>
                  {[
                    ["現在価格", "4,280", "円"],
                    ["閲覧数", "132", "回"],
                    ["いいね数", "7", "件"],
                    ["値下げ依頼", "3", "件"],
                  ].map(([label, value, unit]) => (
                    <label key={label}>
                      {label}
                      <span>
                        <input aria-label={label} defaultValue={value} inputMode="numeric" />
                        <i>{unit}</i>
                      </span>
                    </label>
                  ))}
                </div>
              ) : (
                <div className={styles.screenshotMode}>
                  <div className={styles.screenshotArt}>
                    <img
                      src="/approved-assets/pc-fidelity/sales/official-screen-pants.png"
                      alt="公式販売画面の承認見本"
                    />
                    <b>販売ページの見本</b>
                    <strong>¥4,280</strong>
                    <span>閲覧 132　♡ 7</span>
                    <i />
                  </div>
                  <div>
                    <p className={styles.candidate}>候補・人が確認</p>
                    <label>
                      現在価格
                      <input defaultValue="4,280" />
                    </label>
                    <label>
                      閲覧数
                      <input defaultValue="132" />
                    </label>
                    <label>
                      いいね数
                      <input defaultValue="7" />
                    </label>
                  </div>
                </div>
              )}
              {mode === "direct" && (
                <div
                  className={`${styles.screenshotArt} ${styles.directScreenshot}`}
                  aria-label="公式販売画面の承認見本"
                >
                  <b>アップロードしたスクリーンショット</b>
                  <img
                    src="/approved-assets/pc-fidelity/sales/official-screen-pants.png"
                    alt="公式販売画面の承認見本"
                  />
                  <small>最終アップロード　2025/05/20 10:15</small>
                  <a href={to(26)}>画像を変更</a>
                </div>
              )}
              <label>
                次回確認日　
                <input defaultValue="2025/05/25" />
              </label>
              <footer>
                <a href={to(26)}>公式ページを開く</a>
                <Button n={26}>確認した数値を保存</Button>
              </footer>
            </Card>
          </section>
        </div>
      </div>
    </Shell>
  );
}
function Price() {
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
                    {cell.startsWith("input:") || cell.startsWith("date:") ? (
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
        <Button n={27}>この候補をコピー</Button>
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
            {templates.map((template) => (
              <article key={template.title}>
                <b>{template.title}</b>
                <p>{template.body}</p>
                <a href={to(28)}>コピー</a>
              </article>
            ))}
          </Card>
          <Card>
            <h3>操作と記録</h3>
            <a className={styles.outline} href={to(28)}>
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
        <Button n={28}>文章をコピー</Button>
      </div>
    </Shell>
  );
}
function Order() {
  return (
    <Shell n={29}>
      <div className={styles.pad}>
        <h2>注文を記録</h2>
        <p>
          匿名配送で住所の情報が不要な場合は、住所は保存しません。　
          <a href={to(29)}>詳しく見る ⓘ</a>
        </p>
        <Card className={styles.order}>
          <h3>⚙ 仮注文番号 #0048（自動で付与されます）</h3>
          <div>
            <label>
              <span className={styles.orderFieldHead}>
                <b>販売先</b>
                <span className={styles.requiredChip}>必須</span>
              </span>
              <select defaultValue="">
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
                <input placeholder="取引IDを入力" />
                <button type="button">あとで入力</button>
              </span>
            </label>
            <label>
              <span className={styles.orderFieldHead}>
                <b>購入者の表示名</b>
                <span className={styles.laterHint}>任意</span>
              </span>
              <input placeholder="表示名を入力" />
            </label>
            <label>
              <span className={styles.orderFieldHead}>
                <b>販売金額</b>
                <span className={styles.requiredChip}>必須</span>
              </span>
              <span className={styles.orderInlineInput}>
                <span className={styles.moneyInput}>
                  <span>¥</span>
                  <input inputMode="numeric" placeholder="0" />
                </span>
                <button type="button">あとで確認</button>
              </span>
            </label>
          </div>
          <p className={styles.warn}>▲　未入力 2件・作業は続けられます</p>
          <Notice>
            匿名配送で住所の情報が不要な場合は、住所は保存しません。
            <br />
            匿名配送であっても、販売先の仕様により住所の情報が必要な場合があります。
          </Notice>
        </Card>
        <footer>
          <a href={to(28)}>キャンセル</a>
          <Button n={29}>仮登録して取り出しへ</Button>
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
          商品を取り出す　<em>担当注文</em>
        </h2>
        <p>仮注文 #0048　配送先：一般のご購入者様</p>
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
            <b className={styles.ok}>● 一致しました</b>
            <p>商品ラベルと置き場所ラベルが一致しています。</p>
          </Card>
          <Notice>
            <b>作業のポイント</b>
            <br />
            商品ラベルと置き場所ラベルを確認し、正しい商品を取り出してください。
          </Notice>
        </div>
        <footer>
          <a href={to(29)}>中止する</a>
          <Button n={30}>取り出しを完了</Button>
        </footer>
      </div>
    </Shell>
  );
}
function Pack() {
  const [policy, setPolicy] = useState(0);
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
              key={x[0]}
            >
              <b>
                {i === 0 ? "◉" : "○"}　{x[0]}
              </b>
              <p>{x[1]}</p>
            </Card>
          ))}
        </div>
        <div className={styles.packBottom}>
          <Card>
            <h3>商品写真（例）</h3>
            <Headphones />
            <a href={to(31)}>▣ 再撮影</a>
          </Card>
          <Card>
            <h3>梱包写真（例）</h3>
            <PackingBox />
            <a href={to(31)}>▣ 再撮影</a>
          </Card>
          <Card>
            <h3>確認チェックリスト（人の目で確認）</h3>
            {[
              "商品が正しい",
              "付属品が揃っている",
              "傷や汚れはない",
              "緩衝材を使用した",
              "箱をしっかり封緘した",
              "その他（任意）",
            ].map((x, i) => (
              <label key={x}>
                <input type="checkbox" defaultChecked={i < 5} /> {x}
              </label>
            ))}
          </Card>
        </div>
        <Notice>金額が未入力でも、梱包を止めずに進めます。</Notice>
        <p className={styles.privacyNote}>▣　写真はPC内で非公開に保存。外部へ自動送信しません。</p>
        <footer>
          <a href={to(31)}>今回は使わない</a>
          <Button n={31}>この写真を使う</Button>
        </footer>
      </div>
    </Shell>
  );
}
function Ship() {
  return (
    <Shell n={32}>
      <div className={styles.pad}>
        <h2>配送方法と発送</h2>
        <p>仮注文 #0048　 販売先：選択済み　｜　配送先：一般のご購入者様</p>
        <p className={styles.shipDone}>● 発送前の写真　2枚・確認済み</p>
        <div className={styles.ship}>
          <Card>
            <h3>
              お届け先（販売先の設定に基づく） <em className={styles.domesticChip}>国内向け</em>
            </h3>
            <p>
              <b>有力な配送方法</b>
            </p>
            {[
              ["配送方法A（追跡あり）", "お届けの目安：2〜3日", "¥600"],
              ["配送方法B（追跡あり）", "お届けの目安：1〜2日", "¥450"],
              ["配送方法C（追跡なし）", "お届けの目安：4〜7日", "¥300"],
            ].map(([method, estimate, price], i) => (
              <a className={i === 1 ? styles.selected : ""} href={to(32)} key={method}>
                <span>◉　{method}</span>
                <small>{estimate}</small>
                <b>{price}</b>
              </a>
            ))}
          </Card>
          <Card>
            <h3>
              配送料金（過去の納品履歴から選択）
              <a className={styles.catalogEdit} href={to(32)}>
                料金カタログを編集
              </a>
            </h3>
            <table>
              <tbody>
                {[
                  "2025/05/18　配送方法B　¥450",
                  "2025/05/08　配送方法B　¥450",
                  "2025/04/28　配送方法B　¥450",
                ].map((x) => (
                  <tr key={x}>
                    <td>◉　{x}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className={styles.total}>
              この注文の配送料　<b>¥450（確定）</b>
            </p>
          </Card>
          <Card>
            <h3>発送情報</h3>
            <label>
              発送予定日 <small>（人のチェック必須）</small>
              <input defaultValue="2025/05/21" />
            </label>
            <label>
              発送日時
              <input defaultValue="2025/05/20　15:20" />
            </label>
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
        <footer>
          <a href={to(31)}>戻る</a>
          <Button n={32}>発送を記録</Button>
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
