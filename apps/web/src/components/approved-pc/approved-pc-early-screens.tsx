"use client";

import styles from "./approved-pc-early-screens.module.css";
import { PcCanvas } from "./pc-canvas";
import { PcUiGlyph, pcNavGlyphs } from "./pc-ui-glyph";
import { isP1ApprovedPcScreen } from "./approved-screen-scope";

const nav = ["ホーム", "作業", "仕入れ", "商品", "注文・発送", "在庫", "会計", "メンバー", "設定"];
const storageNav = [
  "ホーム",
  "作業",
  "仕入れ",
  "商品",
  "注文・発送",
  "在庫",
  "倉庫",
  "会計",
  "メンバー",
  "設定",
];
const names = [
  "ログイン",
  "ホーム",
  "今日の作業",
  "通知・見られる範囲",
  "仕入れ資料",
  "卸箱を数える",
  "1点ずつ簡単登録",
  "詳しく調べる商品",
  "商品番号と在庫番号",
  "在庫ラベル",
  "保管場所を選ぶ",
  "格納を確認",
  "商品の種類",
  "検品項目",
  "気になる箇所",
  "検品まとめ",
];

function go(number: number) {
  return `/pc/${Math.min(52, Math.max(1, number))}`;
}
function Primary({ screen, children }: { screen: number; children: string }) {
  return (
    <a className={styles.primary} href={go(screen + 1)}>
      {children}
      <b>›</b>
    </a>
  );
}
function Top({ screen, compact = false }: { screen: number; compact?: boolean }) {
  return (
    <header className={styles.top}>
      <div className={styles.title}>
        <b className={screen >= 9 && screen <= 12 ? styles.plainNumber : ""}>
          {String(screen).padStart(2, "0")}
        </b>
        <h1>{names[screen - 1]}</h1>
      </div>
      {isP1ApprovedPcScreen(screen) ? (
        <span className={styles.scopeBadge}>準備中・P0対象外</span>
      ) : null}
      {!compact && (
        <>
          {screen <= 8 && (
            <label className={styles.search}>
              ⌕ <span>{screen <= 4 ? "商品名・作業・注文を検索" : "商品名・品番・メモで検索"}</span>
            </label>
          )}
          {screen <= 4 && (
            <span className={styles.help} aria-label="ヘルプ">
              <PcUiGlyph name="help" />
            </span>
          )}
          <span className={styles.bell} aria-label="通知">
            <PcUiGlyph name="bell" />
          </span>
          {screen >= 9 ? (
            <span className={styles.teamUser}>
              <PcUiGlyph name="user" />
              デモチーム⌄
            </span>
          ) : (
            <span className={styles.user}>
              <PcUiGlyph name="user" />
              デモ 太郎⌄
            </span>
          )}
        </>
      )}
    </header>
  );
}

function UtilityHeader({ screen }: { screen: number }) {
  return (
    <header className={styles.utilityHeader}>
      <button type="button" aria-label="サイドバーを開く">
        ☰
      </button>
      <span className={styles.utilityWorkspace}>デモワークスペース　⌄</span>
      <div className={styles.utilityTools}>
        <span className={styles.utilityBell} aria-label="通知">
          <PcUiGlyph name="bell" />
        </span>
        <span aria-label="ヘルプ">
          <PcUiGlyph name="help" />
        </span>
      </div>
    </header>
  );
}
function Side({ screen }: { screen: number }) {
  const items = screen === 11 || screen === 12 ? storageNav : nav;
  const active =
    screen === 1
      ? ""
      : screen === 2
        ? "ホーム"
        : screen === 4
          ? "メンバー"
          : screen <= 4
            ? "作業"
            : screen <= 8
              ? "仕入れ"
              : screen <= 10
                ? "商品"
                : screen <= 12
                  ? "在庫"
                  : "作業";
  const routes: Record<string, number> = {
    ホーム: 2,
    作業: 3,
    仕入れ: 5,
    商品: 9,
    "注文・発送": 29,
    在庫: 11,
    倉庫: 11,
    会計: 45,
    メンバー: 37,
    設定: 49,
  };
  const icons: Record<string, Parameters<typeof PcUiGlyph>[0]["name"]> = {
    ホーム: "home",
    作業: "work",
    仕入れ: "purchase",
    商品: "product",
    "注文・発送": "orders",
    在庫: "inventory",
    倉庫: "inventory",
    会計: "accounting",
    メンバー: "members",
    設定: "settings",
  };
  return (
    <aside className={styles.side}>
      {screen >= 5 && screen <= 8 && (
        <div className={styles.brandMark} aria-label="業務アプリ">
          <span />
        </div>
      )}
      {items.map((item, index) => (
        <a
          key={item}
          className={item === active ? styles.active : ""}
          href={go(routes[item] ?? [2, 3, 5, 9, 29, 33, 45, 37, 49][index] ?? 2)}
        >
          <i>
            <PcUiGlyph name={icons[item] ?? pcNavGlyphs[index] ?? "home"} />
          </i>
          {item}
        </a>
      ))}
    </aside>
  );
}
function Shell({ screen, children }: { screen: number; children: React.ReactNode }) {
  const utility = screen >= 13 && screen <= 16;
  const legacyHeader = screen <= 4;
  const inventoryShell = screen >= 9 && screen <= 12;
  return (
    <PcCanvas
      screenNumber={screen}
      className={`${styles.app} ${legacyHeader ? styles.legacyApp : ""} ${inventoryShell ? styles.inventoryApp : ""} ${utility ? styles.utilityApp : ""}`}
    >
      {utility && <UtilityHeader screen={screen} />}
      {legacyHeader && <Top screen={screen} />}
      <Side screen={screen} />
      <section className={styles.frame}>
        {!legacyHeader && <Top screen={screen} compact={utility} />}
        {children}
      </section>
    </PcCanvas>
  );
}
function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string | undefined;
}) {
  return <section className={`${styles.card} ${className}`}>{children}</section>;
}
function Shirt({ dark = false }: { dark?: boolean }) {
  return (
    <div className={`${styles.shirt} ${dark ? styles.dark : ""}`}>
      <i />
      <b />
      <em />
      <span />
    </div>
  );
}
function TypeVisual({ kind }: { kind: "shirt" | "knit" | "outer" | "pants" | "dress" | "bag" }) {
  const variantClass = styles[`type${kind.charAt(0).toUpperCase()}${kind.slice(1)}`] ?? "";
  const asset = {
    shirt: "/approved-assets/pc-fidelity/inspection/shirt-blue.png",
    knit: "/approved-assets/pc-fidelity/inspection/knit-beige.png",
    outer: "/approved-assets/pc-fidelity/inspection/outer-black.png",
    pants: "/approved-assets/pc-fidelity/inspection/pants-beige.png",
    dress: "/approved-assets/pc-fidelity/inspection/dress-green.png",
    bag: "/approved-assets/pc-fidelity/inspection/bag-black.png",
  }[kind];
  return (
    <div className={`${styles.typeVisual} ${variantClass}`} aria-hidden="true">
      <img src={asset} alt="" />
    </div>
  );
}
function Barcode() {
  return (
    <div className={styles.barcode}>
      {Array.from({ length: 35 }, (_, i) => (
        <i key={i} />
      ))}
    </div>
  );
}
function Shelf({
  label = "A-1-2",
  kind = "rack",
}: {
  label?: string;
  kind?: "room" | "rack" | "spot" | "match";
}) {
  const asset = {
    room: "/approved-assets/storage/room-wide.png",
    rack: "/approved-assets/storage/shelf-front.png",
    spot: "/approved-assets/storage/position-label.png",
    match: "/approved-assets/storage/product-on-shelf.png",
  }[kind];
  return (
    <div
      className={`${styles.shelf} ${kind === "room" ? styles.roomPhoto : kind === "spot" ? styles.spotPhoto : kind === "match" ? styles.matchPhoto : styles.rackPhoto}`}
    >
      <img src={asset} alt={`${label || "保管場所"}の写真`} />
      <b>{label}</b>
    </div>
  );
}
function Bag() {
  return (
    <div className={styles.bag}>
      <i />
    </div>
  );
}
function Photo({
  marker = false,
  kind = "shirt",
}: {
  marker?: boolean;
  kind?:
    | "shirt"
    | "inspection"
    | "bag"
    | "researchBag"
    | "watch"
    | "leather"
    | "detail"
    | "cuff"
    | "button"
    | "back"
    | "tag"
    | "approvedHero"
    | "approvedFront"
    | "approvedBack"
    | "approvedCollar"
    | "approvedCuff"
    | "approvedButton"
    | "approvedLabel"
    | "approvedStack";
}) {
  const asset = {
    shirt: "/approved-assets/product/listing-shirt.png",
    inspection: "/approved-assets/pc-fidelity/inspection/shirt-blue.png",
    bag: "/approved-assets/pc-fidelity/purchase/register-black-handbag.png",
    researchBag: "/approved-assets/pc-fidelity/purchase/research-beige-bag.png",
    watch: "/approved-assets/pc-fidelity/purchase/research-watch.png",
    leather: "/approved-assets/pc-fidelity/purchase/research-leather-detail.png",
    detail: "/approved-assets/product/defect-detail.png",
    cuff: "/approved-assets/product/cuff-large.png",
    button: "/approved-assets/product/button-detail.png",
    back: "/approved-assets/product/shirt-back.png",
    tag: "/approved-assets/product/brand-tag-pc.png",
    approvedHero: "/approved-assets/pc-fidelity/product/light-blue-shirt-hero.png",
    approvedFront: "/approved-assets/pc-fidelity/product/light-blue-shirt-front.png",
    approvedBack: "/approved-assets/pc-fidelity/product/light-blue-shirt-back.png",
    approvedCollar: "/approved-assets/pc-fidelity/product/light-blue-shirt-collar.png",
    approvedCuff: "/approved-assets/pc-fidelity/product/light-blue-shirt-cuff.png",
    approvedButton: "/approved-assets/pc-fidelity/product/light-blue-shirt-button.png",
    approvedLabel: "/approved-assets/pc-fidelity/product/light-blue-shirt-label.png",
    approvedStack: "/approved-assets/pc-fidelity/product/light-blue-shirt-stack.png",
  }[kind];
  return (
    <div className={styles.photo}>
      <img src={asset} alt={kind === "shirt" ? "商品の写真" : "承認済みの商品写真"} />
      {marker && (
        <>
          <b>1</b>
          <b>2</b>
          <b>3</b>
        </>
      )}
    </div>
  );
}
function Notice({ children }: { children: React.ReactNode }) {
  return <div className={styles.notice}>ⓘ {children}</div>;
}

function Login() {
  return (
    <Shell screen={1}>
      <div className={styles.loginWrap}>
        <Card className={styles.login}>
          <div className={styles.loginLogo}>
            <img
              className={styles.loginLogoAsset}
              src="/approved-assets/pc-fidelity/login/logo-blue-garment.png"
              alt="衣類の青いロゴ"
            />
          </div>
          <label>
            メールアドレス
            <input placeholder="メールアドレスを入力" />
          </label>
          <label>
            パスワード
            <input placeholder="パスワードを入力" type="password" />
          </label>
          <a className={styles.primary} href={go(2)}>
            ログイン
          </a>
          <small>PC内の業務データへ安全に入ります</small>
        </Card>
      </div>
    </Shell>
  );
}
function Home() {
  const metrics = [
    ["today", "今日の確認", "12件", "未解決"],
    ["work", "続きの作業", "8件", "進行中"],
    ["inventory", "在庫中", "1,284点", "金額 3,842,100円"],
    ["sales", "売上の事実", "587,400円", "今月の確定売上"],
  ] as const;
  const alerts = [
    ["cost", "原価未確認", "23件", "金額 612,300円"],
    ["shipping", "送料未確認", "17件", "金額 48,900円"],
    ["aging", "90日超在庫", "36点", "金額 285,600円"],
    ["approval", "承認待ち", "9件", "金額 210,000円"],
  ] as const;
  return (
    <Shell screen={2}>
      <div className={styles.pad}>
        <div className={styles.metrics}>
          {metrics.map(([icon, title, value, sub]) => (
            <Card key={title}>
              <i
                className={`${styles.metricIcon} ${styles[`metric${icon.charAt(0).toUpperCase()}${icon.slice(1)}`]}`}
                aria-hidden="true"
              />
              <b>{title}</b>
              <strong>{value}</strong>
              <span>{sub}</span>
            </Card>
          ))}
        </div>
        <div className={styles.homeLower}>
          <Card className={styles.alerts}>
            <h2>アラート（要対応）</h2>
            <div>
              {alerts.map(([kind, title, value, amount]) => (
                <article key={title}>
                  <i
                    className={`${styles.alertIcon} ${styles[`alert${kind.charAt(0).toUpperCase()}${kind.slice(1)}`]}`}
                    aria-hidden="true"
                  />
                  <b>{title}</b>
                  <strong>{value}</strong>
                  <span>{amount}</span>
                </article>
              ))}
            </div>
            <Primary screen={2}>未解決を確認</Primary>
          </Card>
          <Card className={styles.news}>
            <h2>お知らせ</h2>
            {["週次の棚卸は土曜です", "在庫評価の見直し予定", "送料の見直しについて"].map(
              (n, i) => (
                <p key={n}>
                  ● <b>{n}</b>
                  <small>5/{18 - i}(土) 09:00</small>
                </p>
              ),
            )}
            <a href={go(4)}>すべてのお知らせを見る</a>
          </Card>
        </div>
      </div>
    </Shell>
  );
}
function Work() {
  const rows = [
    ["検品", "レザージャケット", "山田 花子", "今日 18:00", "5点", "進行中"],
    ["原価確認", "スニーカーA", "鈴木 一郎", "今日 18:00", "12点", "進行中"],
    ["撮影", "腕時計セット", "田中 健太", "5/19(日)", "8点", "進行中"],
    ["クリーニング依頼", "バッグ各種", "佐藤 美咲", "5/20(月)", "6点", "未着手"],
    ["探す", "デニムパンツ", "山田 花子", "5/20(月)", "10点", "進行中"],
    ["価格見直し", "スーツセット", "鈴木 一郎", "5/21(火)", "15点", "未着手"],
    ["出品準備", "シャツ各種", "田中 健太", "5/21(火)", "20点", "レビュー中"],
    ["入荷登録", "アクセサリー", "佐藤 美咲", "5/22(木)", "18点", "進行中"],
  ] as const;
  return (
    <Shell screen={3}>
      <div className={styles.work}>
        <Card className={styles.taskTable}>
          <nav>
            <b>
              すべて <i>12</i>
            </b>
            <b>
              遅延 <i>3</i>
            </b>
            <b>
              今日が期限 <i>4</i>
            </b>
            <span>並び替え　期限が近い順⌄</span>
          </nav>
          <table>
            <thead>
              <tr>
                {["作業", "商品", "担当", "期限", "残数", "ステータス"].map((x) => (
                  <th key={x}>{x}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r[0] + r[1]}>
                  {r.map((c, i) => (
                    <td key={c} className={i === 0 || i === 5 ? styles.blue : ""}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <small>全12件を表示中</small>
        </Card>
        <Card className={styles.taskDetail}>
          <div>
            <h2>検品</h2>
            <b className={styles.pill}>進行中</b>
          </div>
          <label>
            商品<strong>レザージャケット</strong>
          </label>
          <label>
            担当<strong>山田 花子</strong>
          </label>
          <label>
            期限
            <strong>
              今日 18:00 <em>（残り6時間）</em>
            </strong>
          </label>
          <label>
            残数<strong>5点 / 20点</strong>
          </label>
          <label>
            開始日<strong>5/18(土) 09:30</strong>
          </label>
          <label>
            優先度<strong>高</strong>
          </label>
          <textarea defaultValue="付属品の有無とキズを重点確認。" />
          <Primary screen={3}>この作業を開く</Primary>
        </Card>
      </div>
    </Shell>
  );
}
function Notifications() {
  const notificationTones = [
    styles.dotRed,
    styles.dotOrange,
    styles.dotBlue,
    styles.dotBlue,
    styles.dotBlue,
  ];
  const roleGlyphs = ["work", "inventory", "product", "accounting", "settings"] as const;
  const scopeTones = [styles.scopeVisible, styles.scopeLimited, styles.scopeHidden];
  return (
    <Shell screen={4}>
      <div className={styles.notify}>
        <Card>
          <h2>
            通知 <em>未読 6件</em>
          </h2>
          {[
            "原価未確認のアラートが発生しました",
            "送料未確認が10件を超えました",
            "作業「撮影」があなたに割り当てられました",
            "作業「検品」が完了しました",
            "在庫評価の見直し予定をお知らせします",
          ].map((x, i) => (
            <p key={x}>
              <i
                className={[styles.notificationDot, notificationTones[i]].join(" ")}
                aria-hidden="true"
              />
              {x}
              <small>{i * 25 + 5}分前</small>
            </p>
          ))}
          <a href={go(4)}>すべての通知を見る</a>
        </Card>
        <Card>
          <h2>
            あなたの役割 <b className={styles.pill}>リーダー</b>
          </h2>
          {[
            "作業の割り当て・進捗確認",
            "在庫・商品の閲覧",
            "原価・利益の閲覧",
            "会計の閲覧",
            "設定の変更",
          ].map((x, i) => (
            <p className={styles.check} key={x}>
              <span className={styles.roleGlyph} aria-hidden="true">
                <PcUiGlyph name={roleGlyphs[i] ?? "work"} />
              </span>
              {x}
              <i>{i === 4 ? "×" : "✓"}</i>
            </p>
          ))}
          <div className={styles.online}>
            <b>現在の状態</b>
            <p>
              オフライン状態 <em>オンライン</em>
            </p>
            <p>
              送信待ちデータ <em>7件</em>
            </p>
            <p>最終同期　5分前</p>
          </div>
        </Card>
        <Card>
          <h2>見られる範囲について</h2>
          <p>役割や設定により、一部の情報は非表示になります。</p>
          {[
            ["見られる情報", "担当作業、在庫数、販売価格など"],
            ["一部制限のある情報", "原価、利益、会計情報は役割により制限"],
            ["見られない情報", "他メンバーの私的メモや認証情報"],
          ].map((x, i) => (
            <article className={styles.scope} key={x[1]}>
              <i className={[styles.scopeIcon, scopeTones[i]].join(" ")} aria-hidden="true" />
              <b>{x[0]}</b>
              <span>{x[1]}</span>
            </article>
          ))}
          <p className={styles.scopeFoot}>※ 不明点は管理者へお問い合わせください。</p>
        </Card>
      </div>
      <Primary screen={4}>送信待ちを確認</Primary>
    </Shell>
  );
}
function Documents() {
  return (
    <Shell screen={5}>
      <div className={styles.documents}>
        <nav className={styles.tabs}>
          <b>請求書ファイル</b>
          <span>店舗レシート</span>
          <i>メール添付は一度ファイルに保存</i>
        </nav>
        <div className={styles.docGrid}>
          <Card>
            <h3>1. ファイルを選択</h3>
            <div className={styles.drop}>
              <svg className={styles.uploadIcon} viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M7 18.5h10a3.5 3.5 0 0 0 .7-6.93A5.7 5.7 0 0 0 6.6 9.9 3.45 3.45 0 0 0 7 18.5Z"
                />
                <path
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 16V7m0 0-3 3m3-3 3 3"
                />
              </svg>
              <br />
              <span>
                ここにファイルをドラッグ
                <br />
                または
              </span>
              <a href={go(5)}>写真ファイルを選ぶ</a>
              <small>iCloud Driveなど、PCに表示されるフォルダーから選べます</small>
            </div>
            <p>対応形式：PDF / JPG / PNG（最大20MB）</p>
          </Card>
          <Card>
            <h3>2. 原本プレビュー</h3>
            <div className={styles.receiptStage}>
              <div className={styles.receipt}>
                <img
                  src="/approved-assets/documents/invoice-preview-pc.png"
                  alt="請求書の原本プレビュー"
                />
              </div>
              <div className={styles.receiptControls} aria-label="プレビューの拡大縮小">
                <button type="button" aria-label="縮小">
                  −
                </button>
                <span>80%</span>
                <button type="button" aria-label="拡大">
                  ＋
                </button>
                <button type="button" aria-label="全画面表示">
                  ⛶
                </button>
              </div>
            </div>
          </Card>
          <Card>
            <h3>3. 写真から読み取った内容（候補）</h3>
            {[
              "取引日　2025/05/10",
              "店舗名（候補）　デモリユース店",
              "合計金額（税込）　¥26,620",
              "小計　¥24,200",
              "消費税　¥2,420",
              "品数（概略）　3点",
            ].map((x) => (
              <p className={styles.read} key={x}>
                {x}
              </p>
            ))}
            <h3>4. 内容の確認・修正</h3>
            <p className={styles.docConfirmCopy}>候補を確認し、必要に応じて修正してください。</p>
            <p className={styles.docConfirmed}>✓ 確認済み</p>
            <Primary screen={5}>内容を確認して保存</Primary>
          </Card>
        </div>
      </div>
    </Shell>
  );
}
function Count() {
  return (
    <Shell screen={6}>
      <div className={styles.count}>
        <Card>
          <h3>現在の点数</h3>
          <strong>まだ不明</strong>
          <span>（数え始めてください）</span>
          <a className={styles.plus} href={go(6)}>
            +1
          </a>
          <a className={styles.outline} href={go(6)}>
            +10
          </a>
          <a className={styles.outline} href={go(6)}>
            ↶ 1つ戻す
          </a>
        </Card>
        <Card>
          <h3>カウント履歴</h3>
          <table>
            <thead>
              <tr>
                <th>時刻</th>
                <th>操作</th>
                <th>点数</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["13:58:22", "+1", "17"],
                ["13:58:18", "+10", "16"],
                ["13:58:12", "+1", "6"],
                ["13:58:08", "+1", "5"],
                ["13:58:03", "+10", "4"],
                ["13:57:59", "+1", "1"],
              ].map((r) => (
                <tr key={r[0]}>
                  {r.map((x) => (
                    <td key={x}>{x}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
      <div className={styles.bottomRow}>
        <Notice>数え間違えに気づいたら「1つ戻す」を使って修正できます。</Notice>
        <Primary screen={6}>数え終わった</Primary>
      </div>
    </Shell>
  );
}
function Register() {
  return (
    <Shell screen={7}>
      <div className={styles.register}>
        <div className={styles.progress}>
          <b>進捗</b>
          <strong>
            18 <small>/ 48 点</small>
          </strong>
          <i>
            <em />
          </i>
          <span>38%</span>
          <a href={go(8)}>一覧に戻る</a>
        </div>
        <div className={styles.regTop}>
          <Card>
            <h3>1. 商品番号（手書きメモから）</h3>
            <div className={styles.hand}>0128　⌕</div>
          </Card>
          <Card>
            <h3>2. スマホから届いた写真</h3>
            <p>最新 10:42　　3件受信</p>
            <Photo kind="bag" />
            <a href={go(7)}>写真を選ぶ</a>
          </Card>
          <Card className={styles.registerDetails}>
            <h3>3. ブランド</h3>
            <input defaultValue="デモブランド" />
            <h3>4. 特徴・カテゴリ</h3>
            <input defaultValue="レザー / ハンドバッグ" />
            <h3>5. 販売可否</h3>
            <select defaultValue="要確認">
              <option>要確認</option>
              <option>販売できる</option>
              <option>保留</option>
            </select>
            <h3>6. メモ（任意）</h3>
            <input placeholder="付属品・気になる点" />
          </Card>
        </div>
        <Card className={styles.priceSearch}>
          <h3>
            5. 販売価格を調べる{" "}
            <small>検索に使う言葉をまとめて、外部で調べたり、質問文を作ったりできます。</small>
          </h3>
          <div>
            <section>
              <b>検索キーワード</b>
              <p className={styles.chips}>
                デモブランド ×　レザー ×<br />
                ハンドバッグ ×　ブラック ×
              </p>
              <small>ブランド・袖・生地・形などをまとめます</small>
            </section>
            <section>
              <b>調べる・共有する</b>
              <a href={go(7)}>⌕ メルカリで検索を開く</a>
              <a href={go(7)}>▱ 検索語をコピー</a>
              <a href={go(7)}>◌ Codex用の質問文をコピー</a>
            </section>
            <section>
              <b>予想価格（人が確認）</b>
              <strong>¥8,000　⌕</strong>
              <small>参考 ¥5,000〜¥15,000</small>
            </section>
          </div>
          <Notice>押した時だけ外部画面を開きます。自動取得・自動送信はしません。</Notice>
          <Primary screen={7}>保存して次の商品</Primary>
        </Card>
      </div>
    </Shell>
  );
}
function Research() {
  const rows = [
    ["高価格帯の可能性", "ブランド価値が高い可能性があるため", "0217", "★★★ 高"],
    ["希少性の可能性", "市場で見かけないモデルのため", "0045", "★★★ 高"],
    ["状態の確認が必要", "汚れ・劣化の可能性", "0133", "★★☆ 中"],
  ];
  const metrics = [
    ["要詳しく調べる（高価格帯）", "2点", "◇"],
    ["要確認（確認が必要）", "6点", "⌕"],
    ["通常登録完了", "40点", "✓"],
    ["合計", "48点", ""],
  ] as const;
  const metricTones = [
    styles.researchHighMetric,
    styles.researchCheckMetric,
    styles.researchDoneMetric,
    styles.researchTotalMetric,
  ];
  return (
    <Shell screen={8}>
      <div className={styles.research}>
        <div className={styles.researchMetrics}>
          {metrics.map((x, i) => (
            <Card className={metricTones[i]} key={x[0]}>
              <b>{x[0]}</b>
              <strong>{x[1]}</strong>
              {x[2] && (
                <i className={styles.researchMetricIcon} aria-hidden="true">
                  {x[2]}
                </i>
              )}
            </Card>
          ))}
        </div>
        <h2>要詳しく調べる商品（高価格帯）</h2>
        {rows.map((r, i) => (
          <Card
            className={[styles.researchRow, i === 2 ? styles.researchCheckRow : ""].join(" ")}
            key={r[2]}
          >
            <div>
              <b>{r[0]}</b>
              <span>{r[1]}</span>
            </div>
            <Photo kind={(["researchBag", "watch", "leather"] as const)[i] ?? "researchBag"} />
            <strong>{r[2]}</strong>
            <em>{r[3]}</em>
            <a href={go(8)}>›</a>
          </Card>
        ))}
        <Notice>上記以外の商品は「1点ずつ簡単登録」が完了しています。</Notice>
        <Primary screen={8}>詳しく調べる</Primary>
      </div>
    </Shell>
  );
}
function Numbering() {
  return (
    <Shell screen={9}>
      <div className={styles.numbering}>
        <h2>中古は商品番号＝在庫番号</h2>
        <p>登録した1点を、同じ短い番号で管理します</p>
        <Card className={styles.numberCard}>
          <strong>0123</strong>
          <Barcode />
          <span>スマホで読み取ると、商品と保管場所を開けます</span>
        </Card>
        <div className={styles.choices}>
          <Card className={styles.selected}>
            <b>
              <span className={styles.choiceRadio}>◉</span>
              <span className={styles.choiceGlyph}>
                <PcUiGlyph name="printer" />
              </span>
              中古（1点もの・標準）
            </b>
            <span>中古は1点ごとに1つの番号を使います。</span>
          </Card>
          <Card>
            <b>
              <span className={[styles.choiceRadio, styles.choiceRadioIdle].join(" ")}>○</span>
              <span className={styles.choiceGlyph}>
                <PcUiGlyph name="purchase" />
              </span>
              新品（同じ商品を複数）
            </b>
            <span>新品は、同じ商品を複数の番号で管理できます。</span>
          </Card>
        </div>
        <Notice>新品を選んだ時だけ、現物ごとの番号を分けられます</Notice>
        <p className={styles.safe}>読取は商品検索だけ。移動は確認後に保存します</p>
      </div>
    </Shell>
  );
}
function Labels() {
  const labels = Array.from({ length: 28 }, (_, i) => String(123 + i).padStart(4, "0"));
  const selectedLabels = new Set([
    "0126",
    "0132",
    "0134",
    "0136",
    "0140",
    "0144",
    "0147",
    "0148",
    "0149",
    "0150",
  ]);
  return (
    <Shell screen={10}>
      <div className={styles.labels}>
        <p>在庫ラベルの方法を選び、ラベルを確認します。</p>
        <div className={styles.labelGrid}>
          <section>
            <Card>
              <h3>ラベルの方法を選ぶ</h3>
              <a className={styles.selected} href={go(10)}>
                ◉　✎　手書き（無料・標準）　<em>推奨</em>
                <small>はがせるサイズのラベルに手書きします。</small>
              </a>
              <a href={go(10)}>
                ○　▤　A4一括印刷（任意）　<em>任意</em>
                <small>1商品につき1枚のラベル</small>
              </a>
            </Card>
            <Card>
              <h3>在庫番号（チェック済み）</h3>
              <strong className={styles.green}>0123</strong>
              <b className={styles.pill}>発行済み</b>
            </Card>
            <Card>
              <h3>再発行の理由（履歴）</h3>
              <table>
                <thead>
                  <tr>
                    <th>日時</th>
                    <th>理由</th>
                    <th>担当者</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>2025/05/15 10:30</td>
                    <td>印刷用紙</td>
                    <td>デモ太郎</td>
                  </tr>
                  <tr>
                    <td>2025/05/18 14:25</td>
                    <td>印字のにじみ</td>
                    <td>デモ花子</td>
                  </tr>
                </tbody>
              </table>
            </Card>
          </section>
          <section className={styles.printPreview}>
            <Card>
              <h3>A4一括印刷プレビュー（24面）</h3>
              <div>
                {labels.map((l) => (
                  <article className={selectedLabels.has(l) ? styles.printedLabel : ""} key={l}>
                    <b>{l}</b>
                    <Barcode />
                  </article>
                ))}
              </div>
            </Card>
            <Card className={styles.labelSummary}>
              <h3>登録のサマリー</h3>
              <p>
                登録商品　<b>24点</b>
              </p>
              <p>
                ラベル　<b>24枚</b>
              </p>
              <p>同じ番号なし</p>
            </Card>
            <Card className={styles.labelActions}>
              <a href={go(10)}>↻ プレビューを更新</a>
              <a href={go(10)}>▤ 印刷…</a>
            </Card>
            <Card>
              <h3>選択中の商品（3点）</h3>
              <table>
                <thead>
                  <tr>
                    <th>商品番号</th>
                    <th>商品名</th>
                    <th>保管場所</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["0123", "デモブランドTシャツ ネイビーM", "倉庫A / ルーム1 / 棚A-1"],
                    ["0124", "デモブランドTシャツ グレーL", "倉庫A / ルーム1 / 棚A-1"],
                    ["0125", "デモブランドトートバッグ ブラック", "倉庫A / ルーム1 / 棚A-2"],
                  ].map((x) => (
                    <tr key={x[0]}>
                      {x.map((cell) => (
                        <td key={cell}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <Primary screen={10}>登録した24商品を1枚ずつ印刷</Primary>
            </Card>
          </section>
        </div>
      </div>
    </Shell>
  );
}
function Location() {
  return (
    <Shell screen={11}>
      <div className={styles.location}>
        <p>保管場所を選択し、写真と保管状況を確認します。</p>
        <div className={styles.locationTop}>
          <Card>
            <h3>保管場所の構成</h3>
            {["⌄ 倉庫A", "　⌄ ルーム1", "　　 棚A-1", "　　 棚A-2", "　› ルーム2", "› 倉庫B"].map(
              (x) => (
                <p className={x.includes("棚A-1") ? styles.highlight : ""} key={x}>
                  {x}
                </p>
              ),
            )}
          </Card>
          {[
            ["ルームの写真", "ルーム1"],
            ["棚の写真", "棚A-1（3段）"],
            ["正確な位置の写真", "棚A-1 / 2段目 / 左から2番目"],
          ].map((x, i) => (
            <Card key={x[0]}>
              <h3>{x[0]}</h3>
              <Shelf
                kind={i === 0 ? "room" : i === 1 ? "rack" : "spot"}
                label={i === 2 ? "A-1-2" : ""}
              />
              <p>{x[1]}</p>
            </Card>
          ))}
        </div>
        <div className={styles.locationBottom}>
          <Card>
            <h3>保管場所の詳細</h3>
            {[
              "保管場所　倉庫A / ルーム1 / 棚A-1 / 2段目 / 左から2番目",
              "保管場所コード　A-R1-S1-L2-P2",
              "区分　アパレル",
              "温度・湿度　常温 / 湿度40〜60%",
              "備考　—",
            ].map((x) => (
              <p key={x}>{x}</p>
            ))}
          </Card>
          <Card>
            <h3>収容状況</h3>
            <p>棚の最大収容数　30点</p>
            <p>現在の数量　12点</p>
            <p className={styles.green}>空き容量　18点（60%）</p>
          </Card>
        </div>
        <Primary screen={11}>この場所にする</Primary>
      </div>
    </Shell>
  );
}
function Putaway() {
  return (
    <Shell screen={12}>
      <div className={styles.putaway}>
        <p>商品と保管場所を確認し、チェック後に格納します。</p>
        <div className={styles.putTop}>
          <Card>
            <h3>商品・在庫番号</h3>
            <strong className={styles.green}>0123</strong>
            <Barcode />
            <p>デモブランドTシャツ ネイビーM</p>
            <p>状態：美品</p>
            <a href={go(12)}>スマホで読み取って商品を開く</a>
          </Card>
          <Card>
            <h3>
              保管場所ラベルの結果 <em>一致</em>
            </h3>
            <p>保管場所コード</p>
            <strong className={styles.green}>A-R1-S1-L2-P2</strong>
            <p>
              倉庫A / ルーム1 / 棚A-1
              <br />
              2段目 / 左から2番目
            </p>
          </Card>
          <Card>
            <h3>担当者チェックリスト</h3>
            {[
              "商品ラベルの在庫番号を確認した",
              "保管場所コードを確認した",
              "商品と保管場所が一致している",
              "商品に破損や欠品がない",
              "ラベルが読みやすい状態である",
              "その他（備考があれば記入）",
            ].map((x, i) => (
              <label key={x}>
                <input type="checkbox" defaultChecked={i < 5} />
                {x}
              </label>
            ))}
            <textarea placeholder="備考を入力してください" />
          </Card>
        </div>
        <Card className={styles.match}>
          <h3>突き合わせ写真（商品と保管場所）</h3>
          <div className={styles.matchComposite}>
            <Shelf kind="match" label="" />
          </div>
        </Card>
        <Card className={styles.overwrite}>
          <h3>ⓘ 上書きについて</h3>
          <p>この操作は在庫の情報を上書きしません。</p>
          <p>必要な変更は個別に行ってください。</p>
        </Card>
        <Primary screen={12}>この場所に格納</Primary>
      </div>
    </Shell>
  );
}
function Types() {
  const data = [
    ["シャツ", "15項目", "8カット", "6項目", "shirt"],
    ["ニット", "14項目", "7カット", "5項目", "knit"],
    ["アウター", "18項目", "10カット", "7項目", "outer"],
    ["パンツ / スカート", "16項目", "8カット", "6項目", "pants"],
    ["ワンピース", "17項目", "9カット", "6項目", "dress"],
    ["バッグ", "16項目", "9カット", "7項目", "bag"],
  ] as const;
  return (
    <Shell screen={13}>
      <div className={styles.types}>
        <p>
          商品の種類を選択してください。選択した種類に合わせて検品・撮影・採寸項目が切り替わります。
        </p>
        <div>
          {data.map((x, i) => (
            <Card className={i === 0 ? styles.selected : ""} key={x[0]}>
              <TypeVisual kind={x[4]} />
              <div className={styles.typeCopy}>
                <h2>{x[0]}</h2>
                <p>検品項目：{x[1]}</p>
                <p>撮影項目：{x[2]}</p>
                <p>採寸項目：{x[3]}</p>
              </div>
              {i === 0 && <b>●</b>}
            </Card>
          ))}
        </div>
        <footer>
          選択中の種類　<strong>シャツ</strong>
          <Primary screen={13}>この種類で進む</Primary>
        </footer>
      </div>
    </Shell>
  );
}
function Inspect() {
  const rows = ["状態", "使用感", "汚れ", "傷", "ほつれ"];
  return (
    <Shell screen={14}>
      <div className={styles.inspect}>
        <p>
          種類：<b>シャツ</b>
        </p>
        <Card>
          <table>
            <thead>
              <tr>
                <th>項目</th>
                <th>状態を選択してください</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x}>
                  <th>{x}</th>
                  <td>
                    <a href={go(14)}>
                      <span className={styles.inspectNeutralIcon} aria-hidden="true" />
                      未確認
                    </a>
                    <a className={styles.ok} href={go(14)}>
                      <span className={styles.inspectOkIcon} aria-hidden="true" />
                      問題なしを確認
                    </a>
                    <a className={styles.warn} href={go(14)}>
                      <span className={styles.inspectWarnIcon} aria-hidden="true" />
                      気になる点あり
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Notice>
          「問題なしを確認」を選択すると、後から「気になる点あり」に変更することはできません。
        </Notice>
        <footer>
          <a className={styles.outline} href={go(13)}>
            戻る
          </a>
          <Primary screen={14}>次の項目へ</Primary>
        </footer>
      </div>
    </Shell>
  );
}
function Concern() {
  return (
    <Shell screen={15}>
      <div className={styles.concern}>
        <p>
          種類：<b>シャツ</b>
        </p>
        <div>
          <Card className={styles.markerPhoto}>
            <Photo marker />
            <div className={styles.photoZoom} aria-label="写真の拡大縮小">
              <button type="button" aria-label="拡大">
                ＋
              </button>
              <button type="button" aria-label="縮小">
                −
              </button>
            </div>
            <footer>
              マーカー一覧　<b>1</b>　○ 2　○ 3
            </footer>
          </Card>
          <Card className={styles.concernForm}>
            <h3>
              マーカー1　 <em>1</em>　<b>気になる点あり</b>
            </h3>
            {["箇所　右肩付近（前面）", "種類　汚れ", "程度　小（目立たない）"].map((x) => (
              <select key={x} defaultValue={x}>
                <option>{x}</option>
              </select>
            ))}
            <label>
              証拠写真
              <Photo kind="detail" />
            </label>
            <textarea defaultValue="薄い汚れがあります。" />
            <p>人の目での確認　✓ 確認済み</p>
          </Card>
        </div>
        <footer>
          <a className={styles.outline} href={go(14)}>
            戻る
          </a>
          <Primary screen={15}>この内容を保存</Primary>
        </footer>
      </div>
    </Shell>
  );
}
function Summary() {
  const confirmedRows = [
    {
      status: "問題なしを確認",
      evidence: ["approvedHero", "approvedFront", "approvedBack"],
      count: "8枚",
      memo: "全体的に良好です。",
    },
    {
      status: "問題なしを確認",
      evidence: ["approvedCuff", "approvedButton", "approvedCollar"],
      count: "7枚",
      memo: "軽度の使用感があります。",
    },
    {
      status: "問題なしを確認",
      evidence: ["approvedLabel", "approvedBack"],
      count: "3枚",
      memo: "右肩付近に薄い汚れあり。",
    },
  ] as const;
  const groupItems = ["状態", "使用感", "汚れ"];
  return (
    <Shell screen={16}>
      <div className={styles.summary}>
        <p>
          種類：<b>シャツ</b>
        </p>
        <Card>
          <table>
            <thead>
              <tr>
                <th>検品項目</th>
                <th>状態</th>
                <th>証拠写真</th>
                <th>メモ</th>
              </tr>
            </thead>
            <tbody>
              {confirmedRows.map((row, index) => (
                <tr className={styles.summaryConfirmed} key={groupItems[index]}>
                  {index === 0 && (
                    <th className={styles.summaryGroup} rowSpan={confirmedRows.length}>
                      <b>✓ 確認完了（3項目）</b>
                      {groupItems.map((item) => (
                        <span key={item}>✓ {item}</span>
                      ))}
                    </th>
                  )}
                  <td>{row.status}</td>
                  <td>
                    <span className={styles.thumbs}>
                      {row.evidence.map((kind, evidenceIndex) => (
                        <Photo key={kind + "-" + evidenceIndex} kind={kind} />
                      ))}
                    </span>
                    {row.count}
                  </td>
                  <td>{row.memo}</td>
                </tr>
              ))}
              <tr className={styles.issue}>
                <th className={[styles.summaryGroup, styles.summaryAttention].join(" ")}>
                  <b>! 要確認（1項目）</b>
                  <span>傷</span>
                </th>
                <td>気になる点あり　ⓘ</td>
                <td>
                  <span className={styles.thumbs}>
                    <Photo kind="approvedCuff" />
                    <Photo kind="approvedButton" />
                  </span>
                  2枚
                </td>
                <td>前面に小さな傷あり。</td>
              </tr>
              <tr className={styles.summaryUnconfirmed}>
                <th className={[styles.summaryGroup, styles.summaryPending].join(" ")}>
                  <b>⊕ 未確認（1項目）</b>
                  <span>ほつれ</span>
                </th>
                <td>未確認</td>
                <td>—　0枚</td>
                <td>—</td>
              </tr>
            </tbody>
          </table>
        </Card>
        <Notice>「要確認」「未確認」がある場合は、検品を完了できません。</Notice>
        <footer>
          <a className={styles.outline} href={go(15)}>
            戻る
          </a>
          <a className={styles.disabled} href={go(16)}>
            検品を完了
          </a>
        </footer>
      </div>
    </Shell>
  );
}

export function ApprovedPcEarlyScreens({ screenNumber }: { screenNumber: number }) {
  const screen = Math.min(16, Math.max(1, screenNumber));
  switch (screen) {
    case 1:
      return <Login />;
    case 2:
      return <Home />;
    case 3:
      return <Work />;
    case 4:
      return <Notifications />;
    case 5:
      return <Documents />;
    case 6:
      return <Count />;
    case 7:
      return <Register />;
    case 8:
      return <Research />;
    case 9:
      return <Numbering />;
    case 10:
      return <Labels />;
    case 11:
      return <Location />;
    case 12:
      return <Putaway />;
    case 13:
      return <Types />;
    case 14:
      return <Inspect />;
    case 15:
      return <Concern />;
    default:
      return <Summary />;
  }
}
