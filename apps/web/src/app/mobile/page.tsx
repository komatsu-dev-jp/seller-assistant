import { InstallAppCard } from "../../components/install-app-card";
import { OfflineSyncStatus } from "../../components/offline-sync-status";

const mobileTasks = [
  ["格納待ち", "12", "orange"],
  ["ピッキング", "18", "green"],
  ["棚卸・再確認", "2", "red"],
] as const;

export default function MobileHomePage() {
  return (
    <main className="mobileAppShell">
      <header className="mobileAppHeader">
        <a className="brand" href="/" aria-label="PCホームへ">
          R<span>O</span>
        </a>
        <div>
          <span>担当</span>
          <strong>在庫・撮影</strong>
        </div>
      </header>

      <section className="mobileAppContent">
        <div className="mobileGreeting">
          <p className="eyebrow">TODAY</p>
          <h1>今日の現場作業</h1>
          <p>自宅保管 › 洋室A › 北側</p>
        </div>

        <InstallAppCard />

        <OfflineSyncStatus />

        <section className="mobileTaskGrid" aria-label="担当作業">
          {mobileTasks.map(([label, count, tone]) => (
            <article className={`mobileTaskCard ${tone}`} key={label}>
              <span>{label}</span>
              <strong>{count}件</strong>
            </article>
          ))}
        </section>

        <a className="mobilePrimaryAction" href="/mobile/scan">
          <span aria-hidden="true">▣</span>
          <div>
            <strong>商品と場所を読み取る</strong>
            <small>格納・移動・ピッキング・棚卸</small>
          </div>
          <span aria-hidden="true">›</span>
        </a>

        <a className="mobileWorkflowAction" href="/workflow">
          <span aria-hidden="true">▤</span>
          <div>
            <strong>仕入から会計候補まで進める</strong>
            <small>無料テンプレート・人が確認・自動公開なし</small>
          </div>
          <span aria-hidden="true">›</span>
        </a>

        <section className="mobileNext panel">
          <div className="panelHead">
            <h2>次の作業</h2>
            <span className="status">格納待ち</span>
          </div>
          <strong>INV-000001｜ネイビーシャツ</strong>
          <p>商品コードと保管場所の両方を確認してください。</p>
          <div className="miniLocation">洋室A › 北側 › 棚03 › 2段目 › 箱014</div>
        </section>

        <section className="mobileSafety">
          <strong>表示しない情報</strong>
          <p>原価・利益・購入者情報・税務資料は現場担当へ表示しません。</p>
        </section>
      </section>

      <nav className="mobileBottomNav" aria-label="モバイルナビゲーション">
        <a aria-current="page" href="/mobile">
          今日
        </a>
        <a href="/mobile/scan">読取</a>
        <a href="/inventory">在庫</a>
        <a href="/workflow">商品</a>
      </nav>
    </main>
  );
}
