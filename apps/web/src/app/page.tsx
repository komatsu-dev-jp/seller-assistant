const checks = [
  { label: "原価未配賦", count: 2, tone: "warning" },
  { label: "送料未確定", count: 1, tone: "warning" },
  { label: "長期在庫", count: 4, tone: "neutral" },
  { label: "承認待ち", count: 3, tone: "info" },
] as const;

const flow = [
  ["仕入", "完了"],
  ["格納", "進行中"],
  ["撮影・採寸", "未着手"],
  ["出品準備", "未着手"],
  ["発送", "未着手"],
  ["会計CSV", "未着手"],
] as const;

export default function Home() {
  return (
    <main className="shell">
      <AppSidebar current="home" />

      <section className="content" id="home">
        <header className="topbar">
          <div>
            <p className="eyebrow">OWNER PULSE</p>
            <h1>今日の確認</h1>
            <p>止まっている作業を、根拠を見ながら順番に解決します。</p>
          </div>
          <a className="primaryButton" href="/workflow">
            ＋ 試験商品を開く
          </a>
        </header>

        <section className="checkGrid" aria-label="未解決の概要">
          {checks.map((check) => (
            <article className={`checkCard ${check.tone}`} key={check.label}>
              <span>{check.label}</span>
              <strong>{check.count}</strong>
              <a href={`#${check.label}`}>
                根拠を確認 <span aria-hidden="true">→</span>
              </a>
            </article>
          ))}
        </section>

        <section className="workbench" aria-labelledby="current-item">
          <div className="workbenchTitle">
            <div>
              <p className="eyebrow">P0・試験商品</p>
              <h2 id="current-item">INV-000001｜ネイビーシャツ</h2>
            </div>
            <span className="status">格納待ち</span>
          </div>

          <div className="flow" aria-label="商品の進行状況">
            {flow.map(([label, state], index) => (
              <div
                className={`flowStep ${state === "完了" ? "done" : state === "進行中" ? "active" : ""}`}
                key={label}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{label}</strong>
                  <small>{state}</small>
                </div>
              </div>
            ))}
          </div>

          <div className="nextAction">
            <div>
              <span className="actionLabel">次にやること</span>
              <h3>商品と保管場所を読み取る</h3>
              <p>商品コードと「撮影室A › 棚03 › 段2」を確認してから格納します。</p>
            </div>
            <a className="primaryButton" href="/workflow">
              一気通貫作業を開く
            </a>
          </div>
        </section>

        <section className="lowerGrid">
          <article className="panel">
            <div className="panelHead">
              <h2>担当状況</h2>
              <a href="#team">すべて見る</a>
            </div>
            <ul className="taskList">
              <li>
                <span className="avatar">撮</span>
                <div>
                  <strong>撮影・採寸</strong>
                  <small>2件・期限内</small>
                </div>
                <span>田中</span>
              </li>
              <li>
                <span className="avatar">在</span>
                <div>
                  <strong>格納・棚卸</strong>
                  <small>1件・要確認</small>
                </div>
                <span>本人</span>
              </li>
              <li>
                <span className="avatar">経</span>
                <div>
                  <strong>会計確認</strong>
                  <small>3件・未着手</small>
                </div>
                <span>オーナー</span>
              </li>
            </ul>
          </article>

          <article className="panel notice">
            <div className="panelHead">
              <h2>安全な運用</h2>
            </div>
            <p>個人向け販売は、画像と文章を準備した後に本人が公式画面で操作します。</p>
            <p>AIは候補を表示します。商品・価格・公開・税務は自動確定しません。</p>
          </article>
        </section>
      </section>
    </main>
  );
}
import { AppSidebar } from "../components/app-sidebar";
