"use client";
import { useState } from "react";
import styles from "./approved-pc-late-screens.module.css";
import { PcCanvas } from "./pc-canvas";
import { PcLiveRouteLink } from "./pc-preview-action-button";
import { isP1ApprovedPcScreen } from "./approved-screen-scope";
const titles = [
  "在庫と保管場所",
  "棚卸し",
  "数が合わない商品",
  "仮状態・復元・返品",
  "メンバー",
  "担当を割り当てる",
  "変更を確認",
  "変更履歴",
  "箱の見込み",
  "販売後の実績",
  "月別KPI",
  "仕入先・在庫の比較",
  "売上の事実",
  "会計の基本設定",
  "会計項目の候補",
  "ファイル作成・履歴",
  "アプリの基本設定",
  "写真の保存先",
  "書き出し・バックアップ",
  "外部連携の状態",
];
const nav = ["ホーム", "作業", "仕入れ", "商品", "注文・発送", "在庫", "会計", "メンバー", "設定"];
const navGlyphs = [
  "home",
  "work",
  "purchase",
  "product",
  "orders",
  "inventory",
  "accounting",
  "members",
  "settings",
] as const;
const go = (n: number) => `/pc/${n}`;
const accountingRoute = (
  stage: "format" | "profile" | "mappings" | "export" | "preview" | "import" | "history",
  format?: "money_forward_journal_v1" | "generic_journal_v1",
) => `/accounting?stage=${stage}${format ? `&format=${format}` : ""}`;

function PcGlyph({
  name,
  className = "",
}: {
  name: (typeof navGlyphs)[number] | "bell" | "help" | "user" | "check" | "lock";
  className?: string;
}) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      {name === "home" && (
        <>
          <path {...common} d="m3 11 9-8 9 8" />
          <path {...common} d="M5.5 9.5V21h13V9.5M9.5 21v-6h5v6" />
        </>
      )}
      {name === "work" && (
        <>
          <path {...common} d="M8 4h8M9 2h6v4H9zM6 4H4.5v17h15V4H18" />
          <path {...common} d="m8 13 2.2 2.2L16.5 9" />
        </>
      )}
      {name === "purchase" && (
        <>
          <path {...common} d="m4 7 8-4 8 4v10l-8 4-8-4zM4 7l8 4 8-4M12 11v10" />
          <path {...common} d="M9 5.2 17 9" />
        </>
      )}
      {name === "product" && (
        <>
          <path {...common} d="M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2" />
        </>
      )}
      {name === "orders" && (
        <>
          <path {...common} d="M3 5h2l2 11h10l2-8H6" />
          <circle {...common} cx="9" cy="20" r="1" />
          <circle {...common} cx="17" cy="20" r="1" />
        </>
      )}
      {name === "inventory" && (
        <>
          <path {...common} d="M3 8h18v13H3zM5 3h14l2 5H3zM9 12h6v4H9z" />
        </>
      )}
      {name === "accounting" && (
        <>
          <rect {...common} x="4" y="2.5" width="16" height="19" rx="2" />
          <path
            {...common}
            d="M7 6h10v4H7zM8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"
          />
        </>
      )}
      {name === "members" && (
        <>
          <circle {...common} cx="9" cy="8" r="3" />
          <circle {...common} cx="17" cy="9" r="2.5" />
          <path {...common} d="M3.5 20c.4-4 2.2-6 5.5-6s5.1 2 5.5 6M14 15c3.7-.4 5.8 1.2 6.5 4" />
        </>
      )}
      {name === "settings" && (
        <>
          <circle {...common} cx="12" cy="12" r="3" />
          <path
            {...common}
            d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"
          />
        </>
      )}
      {name === "bell" && (
        <>
          <path {...common} d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
        </>
      )}
      {name === "help" && (
        <>
          <circle {...common} cx="12" cy="12" r="9" />
          <path {...common} d="M9.8 9a2.4 2.4 0 1 1 3.5 2.1c-.9.5-1.3 1-1.3 2M12 17h.01" />
        </>
      )}
      {name === "user" && (
        <>
          <circle fill="currentColor" cx="12" cy="12" r="10" />
          <circle fill="#fff" cx="12" cy="9" r="3" />
          <path fill="#fff" d="M6.8 18.1c.7-3 2.4-4.5 5.2-4.5s4.5 1.5 5.2 4.5a8 8 0 0 1-10.4 0Z" />
        </>
      )}
      {name === "check" && <path {...common} d="m5 12 4 4L19 6" />}
      {name === "lock" && (
        <>
          <rect {...common} x="5" y="10" width="14" height="11" rx="2" />
          <path {...common} d="M8 10V7a4 4 0 0 1 8 0v3" />
        </>
      )}
    </svg>
  );
}

function OutlineShield({ className = "" }: { className?: string | undefined }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <svg className={`${styles.outlineShield} ${className}`} viewBox="0 0 36 42" aria-hidden="true">
      <path {...common} d="M18 2.5 31 7v11.5c0 8.7-5.2 15.4-13 20.5C10.2 33.9 5 27.2 5 18.5V7Z" />
      <path {...common} d="m11.5 20.5 4.2 4.2 8.8-9.2" />
    </svg>
  );
}

type MetricGlyphName =
  "shirt" | "checklist" | "chart" | "bag" | "truck" | "coins" | "cart" | "yen" | "tag" | "box";

function MetricGlyph({ name }: { name: MetricGlyphName }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {name === "shirt" && (
        <path {...common} d="M8 4 3 7l2 5 3-1v9h8v-9l3 1 2-5-5-3c-.8 1.4-2.2 2-4 2S8.8 5.4 8 4Z" />
      )}
      {name === "checklist" && (
        <>
          <rect {...common} x="5" y="3" width="14" height="18" rx="2" />
          <path {...common} d="m8 9 1.5 1.5L12 8M8 14h8M8 18h8" />
        </>
      )}
      {name === "chart" && (
        <>
          <path {...common} d="M4 20V5M4 20h16" />
          <path {...common} d="m7 16 4-5 3 2 5-7" />
        </>
      )}
      {name === "bag" && (
        <>
          <path {...common} d="M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2" />
        </>
      )}
      {name === "truck" && (
        <>
          <path {...common} d="M3 6h11v10H3zM14 10h4l3 3v3h-7z" />
          <circle {...common} cx="7" cy="18" r="2" />
          <circle {...common} cx="18" cy="18" r="2" />
        </>
      )}
      {name === "coins" && (
        <>
          <ellipse {...common} cx="12" cy="6" rx="6" ry="3" />
          <path
            {...common}
            d="M6 6v4c0 1.7 2.7 3 6 3s6-1.3 6-3V6M6 10v4c0 1.7 2.7 3 6 3s6-1.3 6-3v-4M6 14v3c0 1.7 2.7 3 6 3s6-1.3 6-3v-3"
          />
        </>
      )}
      {name === "cart" && (
        <>
          <path {...common} d="M3 4h2l2.1 10h10.7L20 7H6" />
          <circle {...common} cx="9" cy="19" r="1.5" />
          <circle {...common} cx="17" cy="19" r="1.5" />
        </>
      )}
      {name === "yen" && (
        <>
          <path {...common} d="m7 4 5 7 5-7M12 11v9M8 12h8M8 16h8" />
        </>
      )}
      {name === "tag" && (
        <>
          <path {...common} d="M3 12 12 3h7l2 2v7l-9 9z" />
          <circle {...common} cx="16.5" cy="7.5" r="1.5" />
        </>
      )}
      {name === "box" && (
        <>
          <path {...common} d="m4 7 8-4 8 4v10l-8 4-8-4zM4 7l8 4 8-4M12 11v10" />
        </>
      )}
    </svg>
  );
}
function Btn({
  n,
  children,
  className = "",
}: {
  n: number;
  children: string;
  className?: string | undefined;
}) {
  return (
    <a className={`${styles.btn} ${className}`} href={go(Math.min(52, n + 1))}>
      {children}　›
    </a>
  );
}
function UtilityHeader({ n }: { n: number }) {
  return (
    <header className={styles.utilityHeader}>
      <b className={styles.utilityScreenNo}>{String(n).padStart(2, "0")}</b>
      <button
        type="button"
        aria-label="サイドバーを開く"
        aria-controls="approved-pc-header-panel"
        data-pc-header-action="sidebar"
      >
        ☰
      </button>
      <div className={styles.utilityTools}>
        <button
          type="button"
          className={`${styles.notificationIcon} ${styles.headerAction}`}
          aria-label="通知を開く"
          aria-controls="approved-pc-header-panel"
          data-pc-header-action="notifications"
        >
          <PcGlyph name="bell" />
        </button>
        <button
          type="button"
          className={styles.headerAction}
          aria-label="ヘルプを開く"
          aria-controls="approved-pc-header-panel"
          data-pc-header-action="help"
        >
          <PcGlyph name="help" />
        </button>
        <button
          type="button"
          className={`${styles.utilityUser} ${styles.headerAction}`}
          aria-label="担当者メニューを開く"
          aria-controls="approved-pc-header-panel"
          data-pc-header-action="account"
        >
          <PcGlyph name="user" />
          {n >= 37 && n <= 40 ? "担当A" : "担当A"}
          <small>⌄</small>
        </button>
      </div>
    </header>
  );
}
function Shell({ n, children }: { n: number; children: React.ReactNode }) {
  const active =
    n <= 36 ? "在庫" : n <= 40 ? "メンバー" : n <= 44 ? "ホーム" : n <= 48 ? "会計" : "設定";
  const utility = n >= 33 && n <= 48;
  return (
    <PcCanvas
      screenNumber={n}
      className={`${styles.app} ${styles[`screen${n}`] ?? ""} ${n >= 49 ? styles.settingsApp : ""} ${utility ? styles.utilityApp : ""}`}
    >
      {utility && <UtilityHeader n={n} />}
      <aside>
        {nav.map((x, i) => (
          <a
            className={x === active ? styles.active : ""}
            key={x}
            href={go([2, 3, 5, 9, 29, 33, 45, 37, 49][i] ?? 2)}
            aria-current={x === active ? "page" : undefined}
          >
            <i>
              <PcGlyph name={navGlyphs[i] ?? "home"} />
            </i>
            {x}
          </a>
        ))}
      </aside>
      <section className={styles.frame}>
        <header>
          <b>{String(n).padStart(2, "0")}</b>
          <h1>{titles[n - 33] ?? ""}</h1>
          {isP1ApprovedPcScreen(n) ? (
            <span className={styles.scopeBadge}>準備中・P0対象外</span>
          ) : null}
          <span className={styles.frameTools}>
            <button
              type="button"
              className={styles.headerAction}
              aria-label="通知を開く"
              aria-controls="approved-pc-header-panel"
              data-pc-header-action="notifications"
            >
              <PcGlyph name="bell" />
            </button>
            <button
              type="button"
              className={styles.headerAction}
              aria-label="ヘルプを開く"
              aria-controls="approved-pc-header-panel"
              data-pc-header-action="help"
            >
              <PcGlyph name="help" />
            </button>
            <button
              type="button"
              className={`${styles.frameUserAction} ${styles.headerAction}`}
              aria-label="担当者メニューを開く"
              aria-controls="approved-pc-header-panel"
              data-pc-header-action="account"
            >
              <PcGlyph name="user" />
              担当A⌄
            </button>
          </span>
        </header>
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
function Notice({ children }: { children: React.ReactNode }) {
  return <p className={styles.notice}>ⓘ　{children}</p>;
}
function Shelf({
  children = "棚A",
  asset = "/approved-assets/storage/inventory-shelf-01.png",
}: {
  children?: string;
  asset?: string;
}) {
  return (
    <div className={styles.shelf}>
      <img src={asset} alt={`${children}の写真`} />
      <span>{children}</span>
    </div>
  );
}
const productRows = [
  "INV-000125　シンプルTシャツ（付属なし）　　在庫　6　担当A　05/25 10:12",
  "INV-000126　リュック（ブラック）　　　　在庫　3　担当A　05/25 09:47",
  "INV-000127　スニーカー（26.0cm）　　　在庫　2　担当A　05/25 09:30",
] as const;
const inventoryRows = [
  ["INV-000125", "シンプルTシャツ（付属なし）", "在庫", "6", "担当A", "05/25 10:12"],
  ["INV-000126", "リュック（ブラック）", "在庫", "3", "担当A", "05/25 09:47"],
  ["INV-000127", "スニーカー（26.0cm）", "在庫", "2", "担当A", "05/25 09:30"],
] as const;
const scanRows = [
  ["10:12", "INV-000125", "シンプルTシャツ（付属なし）", "6", "棚A・中段", "担当A"],
  ["10:11", "INV-000126", "リュック（ブラック）", "3", "棚A・中段", "担当A"],
  ["10:10", "INV-000127", "スニーカー（26.0cm）", "2", "棚A・中段", "担当A"],
] as const;
function Inventory() {
  return (
    <Shell n={33}>
      <div className={`${styles.pad} ${styles.inventoryPad}`}>
        <h2>在庫と保管場所</h2>
        <div className={styles.screenActions}>
          <p>承認デザインの見本です。架空データのため実在庫・履歴は更新しません。</p>
          <span className={styles.previewHeaderActions}>
            <a className={styles.previewLink} href={go(34)}>
              棚卸し画面の見本を見る
            </a>
            <button type="button" className={`${styles.btn} ${styles.previewDisabled}`} disabled>
              保管場所を開く（準備中）
            </button>
          </span>
        </div>
        <div className={styles.inventoryTop}>
          <Card>
            <h3>保管場所の構造（表示例）</h3>
            {[
              "⌄ 倉庫A",
              "　⌄ 1F",
              "　　⌄ 部屋1",
              "　　　⌄ 棚A",
              "　　　　上段",
              "　　　　中段",
              "　　　　下段",
              "　　　⌄ 棚B",
              "　　⌄ 部屋2",
              "　⌄ 2F",
              "　　⌄ 部屋3",
            ].map((x) => (
              <p className={x.includes("中段") ? styles.selected : ""} key={x}>
                {x}
              </p>
            ))}
          </Card>
          <Card>
            <h3>選択中の位置（表示例）</h3>
            <p>倉庫A　&gt; 1F　&gt; 部屋1　&gt; 棚A　&gt; 中段</p>
            <div className={styles.photos}>
              <Shelf asset="/approved-assets/storage/room-wide.png">部屋の様子</Shelf>
              <Shelf asset="/approved-assets/storage/shelf-front.png">棚の様子</Shelf>
              <Shelf asset="/approved-assets/storage/position-label.png">位置の様子</Shelf>
            </div>
          </Card>
          <Card>
            <h3>収容状況（表示例）</h3>
            <div className={styles.donut}>64%</div>
            <p>使用中　32 / 50</p>
            <p>空き　18</p>
            <p>総枠　50</p>
          </Card>
        </div>
        <div className={styles.inventoryBottom}>
          <Card>
            <h3>直近の移動履歴（表示例）</h3>
            <p>
              05/25 10:12　<span className={styles.ok}>入庫</span>　INV-000125　+6
            </p>
            <p>
              05/24 16:05　<span className={styles.ok}>移動</span>　棚B → 棚A 中段
            </p>
            <p>
              05/24 11:20　<span className={styles.bad}>出庫</span>　INV-000128　-1
            </p>
            <button
              type="button"
              className={`${styles.historyLink} ${styles.previewTextButton}`}
              disabled
            >
              履歴表示は準備中
            </button>
          </Card>
          <Card className={styles.tableCard}>
            <h3>
              在庫一覧 <small>（この位置の表示例）</small>
            </h3>
            <table className={styles.inventoryTable}>
              <thead>
                <tr>
                  {["在庫番号", "商品名", "状態", "数量", "担当者", "更新日"].map((x) => (
                    <th key={x}>{x}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {inventoryRows.map((row) => (
                  <tr key={row[0]}>
                    {row.map((cell) => (
                      <td key={cell}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      </div>
    </Shell>
  );
}
function Stocktake() {
  return (
    <Shell n={34}>
      <div className={styles.pad}>
        <h2>
          棚卸し
          <span className={styles.previewHeaderActions}>
            <a className={styles.previewLink} href={go(35)}>
              数が合わない商品の見本を見る
            </a>
            <button
              type="button"
              className={`${styles.btn} ${styles.playAction} ${styles.previewDisabled}`}
              disabled
            >
              棚卸し開始は準備中
            </button>
          </span>
        </h2>
        <p className={styles.warn}>
          ▲　オフライン時の表示例です。この見本画面では読み取りを保存・同期しません。
        </p>
        <div className={styles.stockTop}>
          <Card>
            <h3>固定開始時点（表示例）</h3>
            <b>2025/05/25 10:00</b>
            <p>担当者：担当A</p>
          </Card>
          <Card>
            <h3>選択中のエリア（表示例）</h3>
            <p>● 倉庫A / 1F / 部屋1 / 棚A / 中段</p>
            <p>◇ 収容枠数：50</p>
          </Card>
        </div>
        <div className={styles.stockStats}>
          {[
            ["スキャン済み数", "32 個"],
            ["残り数（目安）", "18 個"],
            ["進捗", "64%"],
          ].map(([label, value]) => (
            <Card key={label}>
              <b>{label}</b>
              {label === "進捗" ? (
                <div className={styles.progressDonut} aria-label={`進捗 ${value}`}>
                  {value}
                </div>
              ) : (
                <strong>{value}</strong>
              )}
            </Card>
          ))}
        </div>
        <div className={styles.stockBottom}>
          <Card>
            <h3>直近のスキャン履歴（表示例）</h3>
            <table className={styles.scanHistoryTable}>
              <thead>
                <tr>
                  {["時刻", "在庫番号", "商品名", "数量", "場所", "担当者"].map((x) => (
                    <th key={x}>{x}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {scanRows.map((row) => (
                  <tr key={row[1]}>
                    {row.map((cell) => (
                      <td key={cell}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Card>
            <h3>作業のポイント</h3>
            <p>・バーコードを確実に読み取る</p>
            <p>・複数個ある場合は数量を入力</p>
            <p>・見つからない商品は「数が合わない商品」へ</p>
          </Card>
        </div>
      </div>
    </Shell>
  );
}
function Mismatch() {
  return (
    <Shell n={35}>
      <div className={styles.pad}>
        <h2>数が合わない商品</h2>
        <p>承認デザインの見本です。架空データのため実在庫・履歴は更新しません。</p>
        <p className={styles.danger}>▲　自動で在庫数を変えません。確認後に担当者が判断します。</p>
        <nav className={styles.tabs} aria-label="差異タブの表示見本">
          見つからない　<b>5</b>　　 別の棚　<b>3</b>　　 予定外に発見　<b>2</b>
          <small className={styles.previewInlineNote}>切替は準備中</small>
        </nav>
        <div className={styles.mismatch}>
          <Card>
            <h3>対象商品（読み直し）</h3>
            {[
              "在庫番号　INV-000126",
              "商品名　リュック（ブラック）",
              "登録場所　倉庫A / 1F / 部屋1 / 棚A / 中段",
              "登録数量　3",
              "スキャン時刻　2025/05/25 10:11",
              "担当者　担当A",
            ].map((x) => (
              <p key={x}>{x}</p>
            ))}
          </Card>
          <Card>
            <h3>現在の確認内容</h3>
            <label>
              見つからない理由
              <select disabled>
                <option>見つからない</option>
              </select>
            </label>
            <label>
              確認した場所の再読み
              <span className={styles.selectActionRow}>
                <select disabled>
                  <option>場所を再選択</option>
                </select>
                <button type="button" className={styles.secondaryAction} disabled>
                  再読取は準備中
                </button>
              </span>
            </label>
            <label className={styles.notesLabel}>備考</label>
            <textarea defaultValue="棚Aの上下段、棚Bも確認しました。" />
            <small className={styles.previewFieldNote}>
              備考はこの見本画面だけで、保存されません。
            </small>
          </Card>
          <Card>
            <h3>証拠写真の表示見本</h3>
            <div className={styles.gridPhotos}>
              {["inventory-shelf-01.png", "inventory-shelf-02.png"].map((asset) => (
                <Shelf asset={`/approved-assets/storage/${asset}`} key={asset}>
                  棚の写真
                </Shelf>
              ))}
            </div>
            <button type="button" className={styles.photoAdd} disabled>
              <b>＋</b>
              写真追加は準備中
            </button>
          </Card>
        </div>
        <div className={styles.mismatchFooter}>
          <a className={styles.secondaryAction} href={go(33)}>
            一覧に戻る
          </a>
          <span className={styles.previewFooterActions}>
            <a className={styles.previewLink} href={go(36)}>
              状態変更の見本を見る
            </a>
            <button type="button" className={`${styles.btn} ${styles.previewDisabled}`} disabled>
              確認保存は準備中
            </button>
          </span>
        </div>
      </div>
    </Shell>
  );
}
function Status() {
  return (
    <Shell n={36}>
      <div className={styles.pad}>
        <h2>仮状態・復元・返品</h2>
        <p>承認デザインの見本です。実在庫・履歴は更新せず、安全な運用ルールを示します。</p>
        <div className={styles.statuses}>
          {[
            {
              title: "仮状態にする（1人で完了・後で戻せる）",
              description:
                "棚卸しや確認の途中で、在庫を一時的に仮状態にします。元の状態に簡単に戻せます。",
              features: ["1人の操作で完了します", "いつでも元に戻せます", "履歴が残ります"],
              operation: true,
              button: "仮状態への変更は準備中",
            },
            {
              title: "復元（在庫に戻す）",
              description: "誤って仮状態にした商品や、確認後に在庫へ戻します。",
              features: [
                "仮状態から在庫に戻します",
                "必ず元の数量に復元されます",
                "履歴が残ります",
              ],
              button: "在庫への復元は準備中",
            },
            {
              title: "返品（確認保留として保管）",
              description: "状態に問題がある商品は、そのまま販売せず返品保留にします。",
              features: [
                "返品保留エリアへ移動します",
                "販売不可として分離します",
                "原因と対応を記録します",
              ],
              button: "返品保留への変更は準備中",
            },
          ].map((card, i) => (
            <Card key={card.title}>
              <h3>{card.title}</h3>
              <p>{card.description}</p>
              <div className={i === 2 ? styles.redbox : styles.greenbox}>
                <b>特徴</b>
                {card.features.map((feature) => (
                  <p key={feature}>・{feature}</p>
                ))}
              </div>
              {card.operation && (
                <div className={styles.operationBox}>
                  <b>操作方法</b>
                  <p>実業務画面では、実物を再確認後に3秒間長押しします。</p>
                  <p>この見本画面では操作しません。</p>
                </div>
              )}
              <button
                type="button"
                className={
                  i === 0 ? styles.provisionalBtn : i === 2 ? styles.redBtn : styles.greenBtn
                }
                disabled
              >
                {card.button}
              </button>
              {card.operation && <small className={styles.holdTimer}>未実行（見本画面）</small>}
            </Card>
          ))}
        </div>
        <div className={styles.statusBottom}>
          <Card className={styles.flow}>
            <h3>複数人での確認は別操作（必ず分けて行います）</h3>
            <p>責任を分けて、棚卸しでの確認結果を残します。</p>
            <div className={styles.confirmFlow}>
              <div>
                <strong>1</strong>
                <b>仮状態にする人</b>
                <span>対象商品を仮状態へ</span>
              </div>
              <i>→</i>
              <div>
                <strong>2</strong>
                <b>確認する人</b>
                <span>内容を確認して記録する</span>
              </div>
              <i>→</i>
              <div>
                <strong>3</strong>
                <b>最終判断する人</b>
                <span>結果を確認して保存する</span>
              </div>
            </div>
          </Card>
          <Card className={styles.deleteGuard}>
            <h3>削除はしません</h3>
            <p>在庫データは削除せず、状態を変えて管理します。すべての履歴が残ります。</p>
            <button type="button" className={`${styles.btn} ${styles.previewDisabled}`} disabled>
              確認結果の保存は準備中
            </button>
          </Card>
        </div>
      </div>
    </Shell>
  );
}
function Members() {
  return (
    <Shell n={37}>
      <div className={styles.pad}>
        <h2>
          メンバー
          <span className={styles.teamPreviewHeaderActions}>
            <button
              type="button"
              className={`${styles.btn} ${styles.memberAction} ${styles.previewDisabled}`}
              disabled
            >
              メンバー招待は準備中
            </button>
            <a className={styles.previewLink} href={go(38)}>
              担当割当画面の見本を見る
            </a>
          </span>
        </h2>
        <p>承認デザインの表示見本です。架空メンバーの招待・停止・権限は変更しません。</p>
        <nav className={styles.tabs}>
          すべて　<b>5</b>　　有効 4　　招待中 1　　停止中 0
          <span className={styles.previewInlineNote}>絞り込みは準備中</span>
        </nav>
        <Card className={styles.memberTable}>
          <table>
            <thead>
              <tr>
                {["メンバー", "役割", "ステータス", "最終ログイン", "操作"].map((x) => (
                  <th key={x}>{x}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ["担当A", "管理者", "有効", "2025/05/20 10:35"],
                ["担当B", "担当者", "有効", "2025/05/19 16:42"],
                ["担当C", "担当者", "有効", "2025/05/18 09:15"],
                ["担当D", "閲覧者", "招待中", "—"],
                ["担当E", "担当者", "有効", "2025/05/17 14:05"],
              ].map(([name, role, status, login], index) => (
                <tr key={name}>
                  <td>
                    <span className={`${styles.avatar} ${styles[`avatar${index + 1}`]}`}>担</span>
                    <b>{name}</b>
                  </td>
                  <td>{role}</td>
                  <td>
                    <span className={status === "有効" ? styles.statusActive : styles.statusInvite}>
                      {status}
                    </span>
                  </td>
                  <td>{login}</td>
                  <td>
                    <button type="button" className={styles.memberPreviewAction} disabled>
                      {status === "招待中" ? "再送信（準備中）" : "詳細（準備中）"}
                    </button>
                    <button
                      type="button"
                      className={`${styles.memberPreviewAction} ${styles.memberStop}`}
                      disabled
                    >
                      停止（準備中）
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <div className={styles.pagination} aria-label="メンバー一覧のページ">
          <span>5人中 1〜5人</span>
          <button type="button" className={styles.pageCurrent} aria-current="page" disabled>
            1
          </button>
          <button type="button" disabled aria-label="次のページはありません">
            ›
          </button>
        </div>
      </div>
    </Shell>
  );
}
function Assignment() {
  return (
    <Shell n={38}>
      <div className={styles.pad}>
        <h2>担当を割り当てる</h2>
        <p>承認デザインの表示見本です。架空データのため担当・期間・閲覧権限は保存しません。</p>
        <div className={styles.assignment}>
          <section className={styles.assignmentForm}>
            <h3>1. 対象を選択</h3>
            <Card className={styles.assignmentItem}>
              <nav className={styles.tabs}>
                商品　　保管場所　　写真　　注文
                <span className={styles.previewInlineNote}>切替は準備中</span>
              </nav>
              <div className={styles.pickItem}>
                <Shelf asset="/approved-assets/pc-fidelity/team/sneaker-black.png">
                  スニーカー
                </Shelf>
                <p>商品コード　P-2505-00123</p>
                <p>商品名　スニーカー ブラック27cm</p>
                <p>カテゴリ　メンズシューズ</p>
                <p>状態　中古・良い</p>
                <p>在庫数　3点</p>
              </div>
            </Card>
            <h3>2. 担当者を選択</h3>
            <select disabled aria-label="担当者の表示見本">
              <option>担当B</option>
            </select>
            <h3>3. 期間を設定</h3>
            <label className={styles.dateField}>
              開始日時
              <input defaultValue="2025/05/21 09:00" disabled />
            </label>
            <label className={styles.dateField}>
              終了日時
              <input defaultValue="2025/05/27 18:00" disabled />
            </label>
            <h3>4. 閲覧できる情報の範囲</h3>
            <label>
              <input type="radio" name="assignment-scope-preview" checked readOnly disabled />
              基本情報のみ（コスト・住所などは非表示）
            </label>
            <label>
              <input type="radio" name="assignment-scope-preview" disabled />
              すべての情報（コスト・住所などを含む・切替は準備中）
            </label>
          </section>
          <section className={styles.assignmentSide}>
            <Card className={styles.preview}>
              <h3>担当者の閲覧情報（基本情報のみの表示例）</h3>
              <b>表示される情報</b>
              {[
                "商品情報（商品コード、商品名、カテゴリ、状態、在庫数）",
                "写真",
                "メモ・備考",
                "関連する注文情報（商品名、数量、状況）",
              ].map((x) => (
                <p key={x}>
                  <PcGlyph name="check" className={styles.previewCheckIcon ?? ""} />
                  {x}
                </p>
              ))}
              <div>
                <b>非表示の情報</b>
                <p>
                  <PcGlyph name="lock" className={styles.previewLockIcon ?? ""} />
                  コスト情報（仕入れ価格、費用など）
                </p>
                <p>
                  <PcGlyph name="lock" className={styles.previewLockIcon ?? ""} />
                  住所・発送先情報
                </p>
              </div>
            </Card>
            <div className={styles.teamPreviewActions}>
              <button type="button" className={`${styles.btn} ${styles.previewDisabled}`} disabled>
                担当割当の保存は準備中
              </button>
              <a className={styles.previewLink} href={go(39)}>
                変更確認画面の見本を見る
              </a>
            </div>
          </section>
        </div>
      </div>
    </Shell>
  );
}
function Approval() {
  return (
    <Shell n={39}>
      <div className={styles.pad}>
        <h2>変更を確認</h2>
        <p>承認デザインの表示見本です。架空の申請で、承認・差し戻し・送信は行いません。</p>
        <p className={styles.pending}>
          変更IDの表示例：CHG-2505-00078　　確認待ち　　申請日時：2025/05/20 11:20
        </p>
        <div className={styles.approval}>
          <section>
            <Card>
              <h3>1. 変更内容（比較）</h3>
              <table>
                <tbody>
                  {[
                    ["商品名", "スニーカー ブラック 27cm", "スニーカー ブラック 27.5cm"],
                    ["状態", "中古・良い", "中古・非常に良い"],
                    ["在庫数", "3点", "4点"],
                    ["備考", "—", "アッパーに軽いスレあり"],
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
            <Card>
              <h3>2. 証拠写真</h3>
              <p className={styles.evidencePreviewNote}>
                同じ素材画像を配置したレイアウト見本です。実際の4方向の証拠写真ではありません。
              </p>
              <div className={styles.sneakerEvidence}>
                {["正面", "背面", "靴底", "側面"].map((label, index) => (
                  <figure className={styles[`sneakerView${index + 1}`]} key={label}>
                    <img
                      src="/approved-assets/pc-fidelity/team/sneaker-black.png"
                      alt={`同じ黒いスニーカー素材を使った${label}配置の見本`}
                    />
                    <figcaption>{label}の配置見本</figcaption>
                  </figure>
                ))}
              </div>
            </Card>
          </section>
          <section>
            <Card>
              <h3>3. 変更理由</h3>
              <p>サイズ表記の修正と、状態評価および在庫数の見直しを行いました。</p>
            </Card>
            <Card>
              <h3>4. 申請者</h3>
              <p>● 担当B　申請日時：2025/05/20 11:20</p>
            </Card>
            <Card>
              <h3>5. 承認者（未承認）</h3>
              <p>● 担当A</p>
            </Card>
          </section>
        </div>
        <footer className={styles.approvalPreviewFooter}>
          <button type="button" className={styles.approvalPreviewAction} disabled>
            コメントは準備中
          </button>
          <button type="button" className={styles.approvalPreviewAction} disabled>
            差し戻しは準備中
          </button>
          <button type="button" className={`${styles.btn} ${styles.previewDisabled}`} disabled>
            承認は準備中
          </button>
          <a className={styles.previewLink} href={go(40)}>
            変更履歴の見本を見る
          </a>
        </footer>
      </div>
    </Shell>
  );
}
function History() {
  const rows = [
    [
      "2025/05/20\n11:20",
      "CHG-2505-00078",
      "スニーカー\nブラック 27cm",
      "商品",
      "担当B",
      "更新",
      "中古・良い\n在庫数：3点",
      "中古・非常に良い\n在庫数：4点",
      "確認待ち",
    ],
    [
      "2025/05/19\n15:42",
      "CHG-2505-00077",
      "注文ID：ORD-2505-0012",
      "注文",
      "担当A",
      "ステータス変更",
      "新規受付",
      "発送準備中",
      "承認済み",
    ],
    [
      "2025/05/19\n10:05",
      "CHG-2505-00076",
      "保管場所：棚A-02",
      "保管場所",
      "担当C",
      "位置変更",
      "棚A-01",
      "棚A-02",
      "承認済み",
    ],
    [
      "2025/05/18\n17:30",
      "CHG-2505-00075",
      "スニーカー ホワイト26cm",
      "商品",
      "担当B",
      "価格更新",
      "4,500円",
      "4,800円",
      "承認済み",
    ],
    [
      "2025/05/18\n09:15",
      "CHG-2505-00074",
      "写真：IMG-2505-0345",
      "写真",
      "担当D",
      "写真追加",
      "—",
      "4枚追加",
      "承認済み",
    ],
    [
      "2025/05/17\n16:20",
      "CHG-2505-00073",
      "注文ID：ORD-2505-0011",
      "注文",
      "担当A",
      "ステータス変更",
      "新規受付",
      "入金確認",
      "承認済み",
    ],
    [
      "2025/05/17\n11:02",
      "CHG-2505-00072",
      "スニーカー グレー28cm",
      "商品",
      "担当C",
      "状態更新",
      "中古・可",
      "中古・良い",
      "承認済み",
    ],
  ] as const;
  return (
    <Shell n={40}>
      <div className={styles.pad}>
        <h2>
          変更履歴
          <span className={styles.teamPreviewHeaderActions}>
            <button type="button" className={`${styles.btn} ${styles.previewDisabled}`} disabled>
              履歴の書き出しは準備中
            </button>
            <a className={styles.previewLink} href={go(41)}>
              箱の見込み画面の見本を見る
            </a>
          </span>
        </h2>
        <p>
          架空履歴の表示見本です。この画面では履歴の検索・出力・変更を行いません。履歴は削除しません。
        </p>
        <div className={styles.filters}>
          対象　
          <select disabled aria-label="対象の表示例">
            <option>すべて</option>
          </select>
          　期間　
          <select disabled aria-label="期間の表示例">
            <option>過去30日間</option>
          </select>
          　変更区分　
          <select disabled aria-label="変更区分の表示例">
            <option>すべて</option>
          </select>
          <input
            className={styles.filterSearch}
            placeholder="検索は準備中"
            aria-label="履歴検索は準備中"
            disabled
          />
        </div>
        <Card className={styles.history}>
          <table>
            <thead>
              <tr>
                {[
                  "日時",
                  "変更ID",
                  "対象",
                  "対象タイプ",
                  "変更者",
                  "アクション",
                  "変更前",
                  "変更後",
                  "承認状況",
                ].map((x) => (
                  <th key={x}>{x}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row[1]}>
                  {row.map((cell, columnIndex) => (
                    <td key={`${row[1]}-${columnIndex}`}>
                      {columnIndex === 1 && row[1] === "CHG-2505-00078" ? (
                        <a href={go(39)}>{cell}（対応見本）</a>
                      ) : columnIndex === 8 ? (
                        <span
                          className={
                            cell === "確認待ち" ? styles.historyPending : styles.historyApproved
                          }
                        >
                          {cell}
                        </span>
                      ) : (
                        cell
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className={styles.pagination}>
            <span>
              {rows.length}件中 1〜{rows.length}件を表示
            </span>
            <button type="button" disabled aria-label="前のページはありません">
              ‹
            </button>
            <button type="button" className={styles.pageCurrent} aria-current="page" disabled>
              1
            </button>
            <button type="button" disabled aria-label="次のページはありません">
              ›
            </button>
          </div>
        </Card>
      </div>
    </Shell>
  );
}
function Metric({ label, value, icon }: { label: string; value: string; icon: MetricGlyphName }) {
  return (
    <Card
      className={`${styles.metric} ${styles[`metric${icon.charAt(0).toUpperCase()}${icon.slice(1)}`] ?? ""}`}
    >
      <i>
        <MetricGlyph name={icon} />
      </i>
      <b>{label}</b>
      <strong>{value}</strong>
    </Card>
  );
}
function Forecast() {
  const metrics = [
    ["実数", "48着", "shirt"],
    ["販売候補", "39着", "checklist"],
    ["見込売上", "¥138,000〜169,000", "chart"],
    ["仕入額", "¥75,000", "bag"],
    ["見込手数料・送料", "¥32,000〜41,000", "truck"],
    ["見込粗利", "¥31,000〜53,000", "coins"],
  ] as const;
  return (
    <Shell n={41}>
      <div className={`${styles.pad} ${styles.forecastPad}`}>
        <h2>箱の見込み</h2>
        <div className={styles.forecastActions}>
          <p className={styles.yellow}>♙　準備中・架空データの見込み例・人が確認</p>
          <a className={styles.btn} href={go(42)}>
            販売後の実績の見本を見る　›
          </a>
        </div>
        <div className={styles.metrics}>
          {metrics.map((x) => (
            <Metric key={x[0]} label={x[0]} value={x[1]} icon={x[2]} />
          ))}
        </div>
        <Card className={styles.breakEven}>
          ⚖　損益分岐　<b>24着</b>
        </Card>
      </div>
    </Shell>
  );
}
function Actual() {
  const metrics = [
    ["販売済み", "31 / 48着", "cart"],
    ["実売上", "¥124,000", "yen"],
    ["実手数料・送料", "¥29,600", "tag"],
    ["仕入額", "¥75,000", "bag"],
    ["実粗利", "¥19,400", "coins"],
    ["未販売", "17着", "box"],
  ] as const;
  return (
    <Shell n={42}>
      <div className={styles.pad}>
        <h2>
          販売後の実績
          <a className={styles.btn} href={go(43)}>
            月別KPIの見本を見る　›
          </a>
        </h2>
        <p className={styles.greenNotice}>● 準備中・架空データの実績例・人が確認</p>
        <div className={styles.metrics}>
          {metrics.map((x) => (
            <Metric key={x[0]} label={x[0]} value={x[1]} icon={x[2]} />
          ))}
        </div>
        <Notice>
          見込みと実績を分ける承認デザインの見本です。この数値は実際の締め集計ではありません。
        </Notice>
      </div>
    </Shell>
  );
}
function Kpi() {
  return (
    <Shell n={43}>
      <div className={styles.pad}>
        <h2>
          月別KPI
          <span
            className={`${styles.teamPreviewHeaderActions} ${styles.analyticsPreviewHeaderActions}`}
          >
            <button type="button" className={`${styles.btn} ${styles.previewDisabled}`} disabled>
              対象月の切替は準備中
            </button>
            <a className={styles.previewLink} href={go(44)}>
              仕入先比較の見本を見る
            </a>
          </span>
        </h2>
        <p className={styles.blueNote}>ⓘ　準備中・架空データの表示見本（実集計ではありません）</p>
        <div className={styles.period}>
          <b>対象月の表示例　2025年5月</b>
          <span>集計期間の表示例　2025/05/01 〜 2025/05/31（31日間）</span>
        </div>
        <div className={styles.kpis}>
          {[
            ["30日間の販売率", "64%", "販売 31着 / 入庫48着"],
            ["月間の売上見込み", "¥162,000", "前月比 +12%"],
            ["月間の粗利見込み", "¥41,000", "前月比 +9%"],
            ["現在庫（期末時点）", "17着", "前月比 −6着"],
          ].map((x) => (
            <Card key={x[0]}>
              <b>{x[0]}</b>
              <strong>{x[1]}</strong>
              <small>{x[2]}</small>
            </Card>
          ))}
        </div>
        <Card className={styles.line}>
          <h3>推移（30日間）</h3>
          <div className={styles.chartLegend} aria-label="グラフの凡例">
            <p>
              <i className={styles.legendBlue} />
              販売率（%）
            </p>
            <p>
              <i className={styles.legendGreen} />
              売上見込み（千円）
            </p>
            <p>
              <i className={styles.legendOrange} />
              粗利見込み（千円）
            </p>
          </div>
          <div className={styles.chartAxisTitles} aria-hidden="true">
            <span>販売率（%）</span>
            <span>金額（千円）</span>
          </div>
          <div className={styles.chartGrid}>
            <div
              className={styles.chartPlot}
              role="img"
              aria-label="架空データによる販売率、売上見込み、粗利見込みの推移例"
            >
              <div className={styles.chartFrame}>
                <div className={`${styles.chartScale} ${styles.chartScaleLeft}`} aria-hidden="true">
                  {["100%", "75%", "50%", "25%", "0%"].map((label) => (
                    <span key={label}>{label}</span>
                  ))}
                </div>
                <div className={styles.chartSvgWrap}>
                  <svg viewBox="0 0 680 220" preserveAspectRatio="none" aria-hidden="true">
                    <path
                      className={styles.chartGridline}
                      d="M35 25H660 M35 78H660 M35 131H660 M35 184H660"
                    />
                    <path className={styles.chartAxisLine} d="M35 25V184H660 M660 25V184" />
                    <path
                      className={styles.chartAxisTick}
                      d="M35 25h-5 M35 78h-5 M35 131h-5 M35 184h-5 M660 25h5 M660 78h5 M660 131h5 M660 184h5 M35 184v5 M88 184v5 M140 184v5 M192 184v5 M244 184v5 M296 184v5 M348 184v5 M400 184v5 M452 184v5 M504 184v5 M556 184v5 M608 184v5 M660 184v5"
                    />
                    <path
                      className={styles.chartBlue}
                      d="M35 155 L88 148 L140 151 L192 132 L244 138 L296 118 L348 124 L400 106 L452 111 L504 91 L556 96 L608 77 L660 69"
                    />
                    <path
                      className={styles.chartGreen}
                      d="M35 122 L88 126 L140 108 L192 112 L244 94 L296 98 L348 80 L400 87 L452 70 L504 76 L556 55 L608 58 L660 42"
                    />
                    <path
                      className={styles.chartOrange}
                      d="M35 185 L88 177 L140 180 L192 164 L244 168 L296 151 L348 157 L400 143 L452 147 L504 132 L556 139 L608 121 L660 115"
                    />
                    {[35, 88, 140, 192, 244, 296, 348, 400, 452, 504, 556, 608, 660].map((x) => (
                      <g key={x}>
                        <circle
                          cx={x}
                          cy={
                            x === 35
                              ? 155
                              : x === 88
                                ? 148
                                : x === 140
                                  ? 151
                                  : x === 192
                                    ? 132
                                    : x === 244
                                      ? 138
                                      : x === 296
                                        ? 118
                                        : x === 348
                                          ? 124
                                          : x === 400
                                            ? 106
                                            : x === 452
                                              ? 111
                                              : x === 504
                                                ? 91
                                                : x === 556
                                                  ? 96
                                                  : x === 608
                                                    ? 77
                                                    : 69
                          }
                          r="3"
                          className={styles.chartPointBlue}
                        />
                      </g>
                    ))}
                  </svg>
                </div>
                <div
                  className={`${styles.chartScale} ${styles.chartScaleRight}`}
                  aria-hidden="true"
                >
                  {["200", "150", "100", "50", "0"].map((label) => (
                    <span key={label}>{label}</span>
                  ))}
                </div>
              </div>
              <div className={styles.chartAxis}>
                <span>5/1</span>
                <span>5/6</span>
                <span>5/11</span>
                <span>5/16</span>
                <span>5/21</span>
                <span>5/26</span>
                <span>5/31</span>
              </div>
            </div>
            <Card className={styles.previous}>
              <h3>前月比較（参考）</h3>
              <p>
                販売率 <b>+5pt</b>
              </p>
              <p>
                売上見込み <b>+¥17,000</b>
              </p>
              <p>
                粗利見込み <b>+¥3,000</b>
              </p>
              <p>
                残在庫 <em>−6着</em>
              </p>
            </Card>
          </div>
        </Card>
        <p>※ 架空データによる表示見本です。会計上の利益・税金の計算には使用しません。</p>
      </div>
    </Shell>
  );
}
function Suppliers() {
  const suppliers = [
    {
      name: "サプライヤーA",
      month: "2025年5月",
      sample: "48",
      period: "31日",
      cost: "4%",
      shipping: "2%",
      days: "29日",
      returns: "3.1%",
      state: "good",
    },
    {
      name: "サプライヤーB",
      month: "2025年4月",
      sample: "62",
      period: "61日",
      cost: "6%",
      shipping: "3%",
      days: "58日",
      returns: "4.0%",
      state: "good",
    },
    {
      name: "サプライヤーC",
      month: "2025年3月",
      sample: "55",
      period: "91日",
      cost: "12%",
      shipping: "5%",
      days: "84日",
      returns: "5.5%",
      state: "watch",
    },
    {
      name: "サプライヤーD",
      month: "2025年2月",
      sample: "40",
      period: "121日",
      cost: "18%",
      shipping: "8%",
      days: "118日",
      returns: "6.8%",
      state: "action",
    },
    {
      name: "サプライヤーE",
      month: "2025年1月",
      sample: "38",
      period: "151日",
      cost: "24%",
      shipping: "12%",
      days: "146日",
      returns: "9.2%",
      state: "hold",
    },
  ] as const;
  return (
    <Shell n={44}>
      <div className={styles.pad}>
        <h2>
          仕入先・在庫の比較
          <span
            className={`${styles.teamPreviewHeaderActions} ${styles.analyticsPreviewHeaderActions}`}
          >
            <button type="button" className={`${styles.btn} ${styles.previewDisabled}`} disabled>
              不足データ確認は準備中
            </button>
            <a className={styles.previewLink} href={go(45)}>
              売上の事実画面の見本を見る
            </a>
          </span>
        </h2>
        <p className={styles.yellow}>♙　準備中・架空データの比較例／継続・停止は人が判断</p>
        <Card className={styles.supplier}>
          <table>
            <thead>
              <tr>
                {[
                  "仕入先",
                  "主な仕入月",
                  "サンプル数\n（着）",
                  "観察期間\n（入庫からの日数）",
                  "仕入額\n未記入の割合",
                  "送料\n未記入の割合",
                  "在庫の経過日数\n中央値",
                  "返品率\n（枚数ベース）",
                ].map((x) => (
                  <th key={x}>{x}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {suppliers.map((supplier) => (
                <tr className={styles[supplier.state]} key={supplier.name}>
                  <td>
                    <span className={styles.stateDot} />
                    {supplier.name}
                  </td>
                  <td>{supplier.month}</td>
                  <td>{supplier.sample}</td>
                  <td>{supplier.period}</td>
                  <td>{supplier.cost}</td>
                  <td>{supplier.shipping}</td>
                  <td>{supplier.days}</td>
                  <td>{supplier.returns}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <div className={styles.supplierLegend} aria-label="仕入先の判断状態">
          <span className={styles.good}>
            <i />
            良好（継続検討）
          </span>
          <span className={styles.watch}>
            <i />
            注意（要確認）
          </span>
          <span className={styles.action}>
            <i />
            要改善（確認必須）
          </span>
          <span className={styles.hold}>
            <i />
            要見直し（停止検討）
          </span>
        </div>
        <Notice>
          ・仕入先名と数値は架空データの表示例です。実運用データの集計ではありません。
          <br />
          ・サンプル数が少ない場合や観察期間が短い場合は、判断を保留してください。
        </Notice>
      </div>
    </Shell>
  );
}
function Facts() {
  return (
    <Shell n={45}>
      <div className={`${styles.pad} ${styles.factsPad}`}>
        <h2>売上の事実</h2>
        <div className={styles.screenActions}>
          <p>承認デザインの架空データ例です。この画面では実会計データを更新しません。</p>
          <PcLiveRouteLink className={styles.previewLink} href={accountingRoute("format")}>
            実データを確認・更新する
          </PcLiveRouteLink>
        </div>
        <Card className={styles.factStats}>
          <b>対象期間　2025/04/01 〜 2025/04/30</b>
          <b>取引件数（売上）　32件</b>
          <b>売上金額 合計　¥1,250,800</b>
          <b>返金金額 合計　¥28,600</b>
        </Card>
        <Card className={styles.facts}>
          <div className={styles.factsHeader}>
            <b>項目</b>
            <b>金額</b>
            <b>主な証拠・出所</b>
            <b>確認状態（見本）</b>
            <b>最終更新</b>
          </div>
          {[
            [
              "売上",
              "¥1,250,800",
              "注文データ（注文・発送）",
              "確認済み",
              "05/25 10:15",
              "商品を販売して得た金額",
            ],
            [
              "返金",
              "¥28,600",
              "返金データ（注文・発送）",
              "確認済み",
              "05/25 10:16",
              "顧客へ返金した金額",
            ],
            [
              "販売手数料",
              "¥96,480",
              "手数料明細（注文・発送）",
              "確認中",
              "05/25 10:18",
              "販売プラットフォームへ支払った手数料",
            ],
            [
              "送料",
              "¥38,120",
              "送料明細（注文・発送）",
              "確認済み",
              "05/25 10:17",
              "顧客へ配送した送料または委託料",
            ],
            [
              "仕入原価",
              "¥742,100",
              "仕入データ（仕入れ）",
              "確認中",
              "05/25 10:12",
              "仕入れにかかった金額",
            ],
          ].map((r) => (
            <p className={r[3] === "確認中" ? styles.factReview : styles.factConfirmed} key={r[0]}>
              <b>
                {r[0]}
                <small className={styles.factDescription}>{r[5]}</small>
              </b>
              <strong>{r[1]}</strong>
              <span>{r[2]}</span>
              <em>{r[3]}</em>
              <small>{r[4]}</small>
            </p>
          ))}
        </Card>
        <Notice>
          上記は架空データの表示見本です。会計の結論ではなく、税区分や利益はここでは計算しません。
        </Notice>
        <a className={styles.btn} href={go(46)}>
          会計の基本設定の見本へ　›
        </a>
      </div>
    </Shell>
  );
}
function BasicAccounting() {
  const [showHelp, setShowHelp] = useState(true);
  return (
    <Shell n={46}>
      <div className={styles.pad}>
        <div className={styles.accountingHeading}>
          <div>
            <h2>会計の基本設定</h2>
            <p>架空設定の表示見本です。この画面では設定を保存しません。</p>
          </div>
          <div className={styles.accountingActions}>
            <PcLiveRouteLink href={accountingRoute("profile")}>実データを開く</PcLiveRouteLink>
            <button type="button" onClick={() => setShowHelp((visible) => !visible)}>
              {showHelp ? "ヘルプを閉じる" : "ヘルプを表示"}
            </button>
            <button type="button" aria-label="ヘルプを閉じる" onClick={() => setShowHelp(false)}>
              ×
            </button>
          </div>
        </div>
        <div className={styles.accounting}>
          <section>
            {[
              [
                "申告方法",
                "消費税の申告は行わない（免税事業者）",
                "消費税の申告と納税を行いません。",
                "基準期間の課税売上高が1,000万円以下の場合など。",
              ],
              [
                "消費税の取扱い",
                "税抜経理",
                "取引を税抜金額で記録します。",
                "請求書や明細の税抜金額で帳簿をつけます。",
              ],
              [
                "帳簿の付け方",
                "複式簿記",
                "すべての取引を借方と貸方の両面で記録します。",
                "資産・負債・収益・費用を対応させて記録します。",
              ],
              [
                "インボイスの登録状況",
                "未登録",
                "適格請求書発行事業者に登録していません。",
                "取引先にインボイスを発行できません。",
              ],
            ].map((x) => (
              <Card key={x[0]}>
                <h3>
                  {x[0]}　
                  <button
                    type="button"
                    className={styles.infoMark}
                    aria-label={`${x[0]}の説明を表示`}
                    onClick={() => setShowHelp(true)}
                  >
                    ?
                  </button>
                  <PcLiveRouteLink href={accountingRoute("profile")}>変更</PcLiveRouteLink>
                </h3>
                <b>{x[1]}</b>
                <p>
                  <strong>意味</strong>
                  <br />
                  {x[2]}
                </p>
                <p>
                  <strong>例</strong>
                  <br />
                  {x[3]}
                </p>
              </Card>
            ))}
          </section>
          {showHelp && (
            <Card className={styles.helpBox}>
              <h3>
                この設定の意味と例
                <button type="button" aria-label="説明を閉じる" onClick={() => setShowHelp(false)}>
                  ×
                </button>
              </h3>
              <h4>申告方法とは？</h4>
              <p>
                消費税の申告・納税を行うかどうかの選択です。事業の規模や取引先に合わせて設定します。
              </p>
              <h4>例</h4>
              <p>・免税事業者：売上が小規模で申告しない場合</p>
              <p>・課税事業者：売上が大きく申告・納税する場合</p>
            </Card>
          )}
        </div>
        <Notice>設定は人の確認が必要です。この見本では保存せず、自動計算も行いません。</Notice>
        <div className={styles.accountingPreviewFooter}>
          <PcLiveRouteLink className={styles.btn} href={accountingRoute("profile")}>
            実データを確認して保存する　›
          </PcLiveRouteLink>
          <a className={styles.previewLink} href={go(47)}>
            会計項目の候補の見本を見る
          </a>
        </div>
      </div>
    </Shell>
  );
}
function Mapping() {
  const mappingRows = [
    {
      item: "売上",
      detail: "商品を販売して得た金額",
      debit: ["現金預金", "普通預金"],
      credit: ["売上高", "売上"],
      evidence: ["注文データ、入金明細", "売上ルール #S-001"],
      confidence: "高",
      confidenceClass: "high",
      status: "採用可能",
      statusClass: "ready",
    },
    {
      item: "仕入原価",
      detail: "仕入れにかかった金額",
      debit: ["仕入高", "商品仕入"],
      credit: ["現金預金", "普通預金"],
      evidence: ["仕入データ、支払明細", "仕入ルール #P-001"],
      confidence: "高",
      confidenceClass: "high",
      status: "採用可能",
      statusClass: "ready",
    },
    {
      item: "販売手数料",
      detail: "販売プラットフォームへ支払った手数料",
      debit: ["販売費及び一般管理費", "支払手数料"],
      credit: ["現金預金", "普通預金"],
      evidence: ["手数料明細", "手数料ルール #F-001"],
      confidence: "中",
      confidenceClass: "medium",
      status: "要確認",
      statusClass: "review",
    },
    {
      item: "送料",
      detail: "顧客へ配送した送料または委託料",
      debit: ["現金預金", "普通預金"],
      credit: ["売上高", "売上"],
      evidence: ["送料明細", "送料ルール #S-002"],
      confidence: "高",
      confidenceClass: "high",
      status: "採用可能",
      statusClass: "ready",
    },
    {
      item: "梱包材費",
      detail: "梱包資材の購入費用",
      debit: ["消耗品費", "梱包資材費"],
      credit: ["現金預金", "普通預金"],
      evidence: ["購入明細、レシート", "梱包ルール #E-001"],
      confidence: "低",
      confidenceClass: "low",
      status: "ブロック",
      statusClass: "blocked",
    },
  ] as const;
  return (
    <Shell n={47}>
      <div className={styles.pad}>
        <h2>会計項目の候補</h2>
        <p>承認デザインの架空候補です。この画面では採用・変更・保存を行いません。</p>
        <p className={styles.mappingRuleSet}>
          表示例のルールセット：標準ルール v1.2　
          <span aria-label="候補ルールの表示例">?</span>
        </p>
        <nav className={styles.tabs} aria-label="架空候補の分類表示例">
          すべて 5　　採用可能 3　　要確認 1　　ブロック 1
        </nav>
        <Card className={styles.mapTable}>
          <table>
            <thead>
              <tr>
                {[
                  "項目",
                  "借方（候補）",
                  "貸方（候補）",
                  "根拠・証拠",
                  "確信度",
                  "状態",
                  "操作",
                ].map((x) => (
                  <th key={x}>{x}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mappingRows.map((row) => (
                <tr key={row.item}>
                  <td>
                    <b>{row.item}</b>
                    <small>{row.detail}</small>
                  </td>
                  <td>
                    <b>{row.debit[0]}</b>
                    <small>{row.debit[1]}</small>
                  </td>
                  <td>
                    <b>{row.credit[0]}</b>
                    <small>{row.credit[1]}</small>
                  </td>
                  <td>
                    <span>{row.evidence[0]}</span>
                    <small>{row.evidence[1]}</small>
                  </td>
                  <td>
                    <span
                      className={`${styles.confidence} ${styles[`confidence${row.confidenceClass.charAt(0).toUpperCase()}${row.confidenceClass.slice(1)}`] ?? ""}`}
                    >
                      <b>{row.confidence}</b>
                      <i aria-hidden="true">
                        <i />
                        <i />
                        <i />
                        <i />
                      </i>
                    </span>
                  </td>
                  <td>
                    <span
                      className={`${styles.mappingStatus} ${styles[`mappingStatus${row.statusClass.charAt(0).toUpperCase()}${row.statusClass.slice(1)}`] ?? ""}`}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td>
                    {row.status === "ブロック" ? (
                      <span className={styles.mappingBlockedAction}>—</span>
                    ) : (
                      <PcLiveRouteLink
                        href={accountingRoute("mappings")}
                        ariaLabel={`${row.item}を実データ画面で採用`}
                      >
                        採用
                      </PcLiveRouteLink>
                    )}
                    <PcLiveRouteLink
                      href={accountingRoute("mappings")}
                      ariaLabel={`${row.item}を実データ画面で変更`}
                    >
                      変更
                    </PcLiveRouteLink>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <div className={styles.mappingFooter}>
          <div className={styles.mappingLegend}>
            <span>
              <i className={styles.legendHigh} />
              高：そのまま採用候補
            </span>
            <span>
              <i className={styles.legendMedium} />
              中：人が確認
            </span>
            <span>
              <i className={styles.legendLow} />
              低：保存前に修正
            </span>
          </div>
          <div className={styles.mappingPreviewActions}>
            <PcLiveRouteLink className={styles.btn} href={accountingRoute("mappings")}>
              実データを確認して保存　›
            </PcLiveRouteLink>
            <a className={styles.previewLink} href={go(48)}>
              ファイル作成画面の見本を見る
            </a>
          </div>
        </div>
      </div>
    </Shell>
  );
}
function FileHistory() {
  const [format, setFormat] = useState<"moneyForward" | "csv">("moneyForward");
  const [showFileHelp, setShowFileHelp] = useState(false);
  const liveFormat = format === "moneyForward" ? "money_forward_journal_v1" : "generic_journal_v1";
  return (
    <Shell n={48}>
      <div className={styles.pad}>
        <div className={styles.fileHeading}>
          <div>
            <h2>ファイル作成・履歴</h2>
            <p>架空データの表示見本です。この画面では実ファイルを作成しません。</p>
          </div>
          <div className={styles.fileActions}>
            <PcLiveRouteLink href={accountingRoute("history", liveFormat)}>
              実データの履歴　↻
            </PcLiveRouteLink>
            <button type="button" onClick={() => setShowFileHelp((visible) => !visible)}>
              {showFileHelp ? "ヘルプを閉じる" : "ヘルプ　?"}
            </button>
          </div>
        </div>
        {showFileHelp ? (
          <p className={styles.fileHelp} role="status">
            形式を選んだあと、本物の会計画面で元資料と内容を確認してから作成・ダウンロードします。外部サービスへ自動送信しません。
          </p>
        ) : null}
        <div className={styles.fileTop}>
          <Card>
            <h3>作成チェックリスト（表示例）</h3>
            {[
              "基本設定の保存",
              "合計項目の確認（ブロックなし）",
              "対象期間の事実の確認",
              "ファイルの作成と確認",
            ].map((x, i) => (
              <p key={x}>
                {i < 3 ? "✓" : "○"}　{x}
              </p>
            ))}
          </Card>
          <Card>
            <h3 className={styles.bad}>▲ ブロッカー一覧（表示例）</h3>
            <p>この架空例ではブロックなしです。</p>
            <p>
              すべてのブロックが解除されると
              <br />
              ファイルを作成できます。
            </p>
          </Card>
          <Card>
            <h3>作成形式を選択</h3>
            <div
              className={`${styles.formatChoice} ${format === "moneyForward" ? styles.formatSelected : ""}`}
            >
              <button
                type="button"
                className={styles.formatSelect}
                aria-pressed={format === "moneyForward"}
                onClick={() => setFormat("moneyForward")}
              >
                <b>{format === "moneyForward" ? "◉" : "○"}　Money Forward向け</b>
                <small>勘定科目コードを含む（推奨）</small>
              </button>
              <PcLiveRouteLink
                href={accountingRoute("export", "money_forward_journal_v1")}
                ariaLabel="Money Forward形式を実データで作成する画面へ"
              >
                実画面へ
              </PcLiveRouteLink>
            </div>
            <div
              className={`${styles.formatChoice} ${format === "csv" ? styles.formatSelected : ""}`}
            >
              <button
                type="button"
                className={styles.formatSelect}
                aria-pressed={format === "csv"}
                onClick={() => setFormat("csv")}
              >
                <b>{format === "csv" ? "◉" : "○"}　汎用（CSV）</b>
                <small>汎用形式（コードなし）</small>
              </button>
              <PcLiveRouteLink
                href={accountingRoute("export", "generic_journal_v1")}
                ariaLabel="汎用CSVを実データで作成する画面へ"
              >
                実画面へ
              </PcLiveRouteLink>
            </div>
          </Card>
        </div>
        <div className={styles.fileBottom}>
          <Card>
            <h3>作成ファイルの発行（架空プレビュー）</h3>
            <table className={styles.exportPreview}>
              <thead>
                <tr>
                  <th>日付</th>
                  <th>借方</th>
                  <th>借方金額</th>
                  <th>貸方</th>
                  <th>貸方金額</th>
                  <th>摘要</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["2025/04/01", "現金預金", "25,800", "売上高", "25,800", "商品販売"],
                  ["2025/04/02", "販売手数料", "1,280", "現金預金", "1,280", "販売手数料"],
                  ["2025/04/03", "仕入高", "18,400", "現金預金", "18,400", "商品仕入"],
                  ["2025/04/04", "現金預金", "880", "売上高", "880", "送料（注文ID:1002）"],
                  ["2025/04/04", "消耗品費", "620", "現金預金", "620", "梱包資材"],
                ].map((row) => (
                  <tr key={row.join("-")}>
                    {row.map((cell, cellIndex) => (
                      <td key={`${row[0]}-${cellIndex}`}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <div className={styles.downloadColumn}>
            <Card className={styles.downloadCard}>
              <h3>手動ダウンロード</h3>
              <p>作成したファイルをダウンロードします。</p>
              <PcLiveRouteLink className={styles.btn} href={accountingRoute("preview", liveFormat)}>
                実データを確認してダウンロード　↓
              </PcLiveRouteLink>
            </Card>
            <Card className={styles.importCard}>
              <h3>手動インポート結果（表示例）</h3>
              <p>実行日時　2025/05/06 15:20</p>
              <p>形式　　　Money Forward向け</p>
              <p>
                ステータス　<span className={styles.importSuccess}>成功例</span>
              </p>
              <p>件数　　　1,520 件</p>
              <PcLiveRouteLink href={accountingRoute("import", liveFormat)}>
                実データの詳細を確認
              </PcLiveRouteLink>
            </Card>
          </div>
        </div>
        <Card>
          <h3>差し替え・キャンセル履歴（表示例）</h3>
          <table className={styles.exportHistory}>
            <thead>
              <tr>
                <th>実行日時</th>
                <th>操作</th>
                <th>形式</th>
                <th>対象期間</th>
                <th>件数</th>
                <th>実行者</th>
                <th>理由・メモ</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>2025/05/06 15:20</td>
                <td>作成（確定例）</td>
                <td>Money Forward向け</td>
                <td>2025/04/01〜04/30</td>
                <td>1,520</td>
                <td>担当者A</td>
                <td>月次データ作成</td>
              </tr>
              <tr>
                <td>2025/05/04 11:05</td>
                <td>作成（キャンセル例）</td>
                <td>汎用（CSV）</td>
                <td>2025/04/01〜04/30</td>
                <td>—</td>
                <td>担当者B</td>
                <td>項目確認のため</td>
              </tr>
            </tbody>
          </table>
        </Card>
        <Notice>
          架空の表示例です。実ファイルは本物の会計画面で人が確認して作成・ダウンロードし、自動送信しません。
        </Notice>
      </div>
    </Shell>
  );
}
function Settings() {
  const shippingColumns = [
    "配送方法",
    "基本料金（円）",
    "追加料金（円）",
    "サイズ上限（cm）",
    "重量上限（kg）",
  ] as const;
  return (
    <Shell n={49}>
      <div className={`${styles.pad} ${styles.settingsBoard}`}>
        <h2>アプリの基本設定</h2>
        <Card className={styles.settings}>
          <p className={styles.settingsPreviewCaption}>
            架空設定の表示見本です。この画面では実際の料金を変更・保存しません。
          </p>
          <h3>配送方法</h3>
          <table>
            <thead>
              <tr>
                {shippingColumns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
                <th aria-label="編集" />
              </tr>
            </thead>
            <tbody>
              {[
                "配送方法A　750　200　120　10",
                "配送方法B　1,050　300　160　20",
                "配送方法C　1,350　500　200　30",
              ].map((x) => (
                <tr key={x}>
                  {x.split("　").map((y, index) => (
                    <td key={y}>
                      <input
                        aria-label={`${x.split("　")[0]} ${shippingColumns[index] ?? "値"}`}
                        defaultValue={y}
                        readOnly
                      />
                    </td>
                  ))}
                  <td>
                    <button
                      type="button"
                      className={`${styles.editIcon} ${styles.previewDisabled}`}
                      aria-label={`${x.split("　")[0]}を編集`}
                      title="設定の保存機能は準備中です"
                      disabled
                    >
                      ✎
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3>手数料</h3>
          <table>
            <thead>
              <tr>
                <th>項目</th>
                <th>手数料率（%）</th>
                <th>最低手数料（円）</th>
                <th aria-label="編集" />
              </tr>
            </thead>
            <tbody>
              {["販売手数料　10.00　100", "決済手数料　3.00　50"].map((x) => (
                <tr key={x}>
                  {x.split("　").map((y, cellIndex) => (
                    <td key={y}>
                      <input
                        aria-label={`${x.split("　")[0]} ${
                          ["項目名", "手数料率（%）", "最低手数料（円）"][cellIndex]
                        }`}
                        defaultValue={y}
                        readOnly
                      />
                    </td>
                  ))}
                  <td>
                    <button
                      type="button"
                      className={`${styles.editIcon} ${styles.previewDisabled}`}
                      aria-label={`${x.split("　")[0]}を編集`}
                      title="設定の保存機能は準備中です"
                      disabled
                    >
                      ✎
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className={styles.settingsFooter}>
            <Notice>実料金は人が確認します。この見本の値は保存されません。</Notice>
            <div className={styles.settingsPreviewActions}>
              <button type="button" className={`${styles.btn} ${styles.previewDisabled}`} disabled>
                変更保存は準備中
              </button>
              <a className={styles.previewLink} href={go(50)}>
                写真保存先の見本へ
              </a>
            </div>
          </div>
        </Card>
      </div>
    </Shell>
  );
}
function Storage() {
  const [destination, setDestination] = useState<"pc" | "other">("pc");
  return (
    <Shell n={50}>
      <div className={`${styles.pad} ${styles.storageBoard}`}>
        <h2>写真の保存先</h2>
        <Card className={styles.storage}>
          <section>
            <h3>保存先の場所</h3>
            <p id="storage-preview-note" className={styles.settingsPreviewCaption}>
              架空の保存先見本です。選択はこの画面内だけで、実際の保存先を変更しません。
            </p>
            <label className={styles.radioOption}>
              <input
                type="radio"
                name="storage-destination"
                checked={destination === "pc"}
                onChange={() => setDestination("pc")}
                aria-describedby="storage-preview-note"
              />
              このPC内に保存
            </label>
            <label className={styles.radioOption}>
              <input
                type="radio"
                name="storage-destination"
                checked={destination === "other"}
                onChange={() => setDestination("other")}
                aria-describedby="storage-preview-note"
              />
              他の場所に保存
            </label>
            <h3>保存先フォルダー</h3>
            <div className={styles.storagePathRow}>
              <input
                aria-label="保存先フォルダーの表示例"
                defaultValue="商品写真フォルダー"
                readOnly
              />
              <span>
                <button type="button" disabled title="フォルダー選択は準備中です">
                  保存先を選ぶ
                </button>
                <button type="button" disabled title="フォルダー確認は準備中です">
                  保存先を確認
                </button>
                <small>保存先機能は準備中</small>
              </span>
            </div>
          </section>
          <div className={styles.noSend}>
            <OutlineShield />
            <span>
              外部サービスへ
              <br />
              自動送信しません
            </span>
          </div>
        </Card>
        <div className={styles.storagePreviewFooter}>
          <Notice>画像編集・保存先変更は準備中です。今は手動で編集して戻します。</Notice>
          <a className={styles.previewLink} href={go(51)}>
            書き出し画面の見本へ
          </a>
        </div>
      </div>
    </Shell>
  );
}
function Backup() {
  const [exportFormat, setExportFormat] = useState<"csv" | "json">("csv");
  const [backupFormat, setBackupFormat] = useState<"csv" | "json">("json");
  return (
    <Shell n={51}>
      <div className={`${styles.pad} ${styles.backupBoard}`}>
        <h2>書き出し・バックアップ</h2>
        <div className={styles.backup}>
          <Card>
            <h3>データを書き出す</h3>
            <p>架空データの表示見本です。実ファイルは作成しません。</p>
            <p>ファイル形式</p>
            <div className={styles.formatButtons} role="group" aria-label="書き出し形式">
              <button
                type="button"
                className={exportFormat === "csv" ? styles.formatButtonActive : ""}
                onClick={() => setExportFormat("csv")}
                aria-pressed={exportFormat === "csv"}
              >
                CSV
              </button>
              <button
                type="button"
                className={exportFormat === "json" ? styles.formatButtonActive : ""}
                onClick={() => setExportFormat("json")}
                aria-pressed={exportFormat === "json"}
              >
                JSON
              </button>
            </div>
            <button type="button" className={`${styles.btn} ${styles.previewDisabled}`} disabled>
              {exportFormat.toUpperCase()}で保存は準備中
            </button>
          </Card>
          <Card>
            <h3>バックアップを作る</h3>
            <p>架空データの表示見本です。実バックアップは作成しません。</p>
            <p>ファイル形式</p>
            <div className={styles.formatButtons} role="group" aria-label="バックアップ形式">
              <button
                type="button"
                className={backupFormat === "csv" ? styles.formatButtonActive : ""}
                onClick={() => setBackupFormat("csv")}
                aria-pressed={backupFormat === "csv"}
              >
                CSV
              </button>
              <button
                type="button"
                className={backupFormat === "json" ? styles.formatButtonActive : ""}
                onClick={() => setBackupFormat("json")}
                aria-pressed={backupFormat === "json"}
              >
                JSON
              </button>
            </div>
            <button type="button" className={`${styles.btn} ${styles.previewDisabled}`} disabled>
              {backupFormat.toUpperCase()}バックアップは準備中
            </button>
          </Card>
        </div>
        <Card className={styles.backHistory}>
          <h3>履歴（表示例）</h3>
          <table>
            <thead>
              <tr>
                <th>種類</th>
                <th>ファイル名</th>
                <th>作成日時</th>
                <th>状態</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>書き出し（CSV）</td>
                <td>export_20250520_1030.csv</td>
                <td>2025/05/20 10:30</td>
                <td>完了例</td>
              </tr>
              <tr>
                <td>バックアップ（JSON）</td>
                <td>backup_20250518_1500.json</td>
                <td>2025/05/18 15:00</td>
                <td>未実行</td>
              </tr>
            </tbody>
          </table>
          <div className={styles.backupPreviewFooter}>
            <Notice>架空の履歴例です。実ファイルは作成していません。</Notice>
            <a className={styles.previewLink} href={go(52)}>
              外部連携状態の見本へ
            </a>
          </div>
        </Card>
      </div>
    </Shell>
  );
}
function Connections() {
  return (
    <Shell n={52}>
      <div className={`${styles.pad} ${styles.connectionsBoard}`}>
        <h2>外部連携の状態</h2>
        <Card className={styles.banner}>
          <OutlineShield />
          <span>
            接続状態の表示例：外部連携なし・無料
            <small>実際の接続・料金を確認した結果ではありません</small>
          </span>
        </Card>
        <div className={styles.connections}>
          {["GitHub", "Slack", "Notion"].map((x) => (
            <Card key={x}>
              <h3>{x}</h3>
              <span>未接続（表示例）</span>
            </Card>
          ))}
        </div>
        <Card className={styles.protect}>
          <OutlineShield />　<b>許可なく外部へ接続しません</b>
          <p>必要になったときだけ、内容を確認して接続します</p>
        </Card>
      </div>
    </Shell>
  );
}
export function ApprovedPcLateScreens({ screenNumber }: { screenNumber: number }) {
  switch (screenNumber) {
    case 33:
      return <Inventory />;
    case 34:
      return <Stocktake />;
    case 35:
      return <Mismatch />;
    case 36:
      return <Status />;
    case 37:
      return <Members />;
    case 38:
      return <Assignment />;
    case 39:
      return <Approval />;
    case 40:
      return <History />;
    case 41:
      return <Forecast />;
    case 42:
      return <Actual />;
    case 43:
      return <Kpi />;
    case 44:
      return <Suppliers />;
    case 45:
      return <Facts />;
    case 46:
      return <BasicAccounting />;
    case 47:
      return <Mapping />;
    case 48:
      return <FileHistory />;
    case 49:
      return <Settings />;
    case 50:
      return <Storage />;
    case 51:
      return <Backup />;
    default:
      return <Connections />;
  }
}
