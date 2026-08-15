import { InstallAppCard } from "../../components/install-app-card";
import { MobileAssignmentSummary } from "../../components/mobile-assignment-summary";
import { OfflineSyncStatus } from "../../components/offline-sync-status";
import { requirePageSession } from "../../lib/server-session";

export const dynamic = "force-dynamic";

export default async function MobileHomePage() {
  const session = await requirePageSession([
    "owner",
    "inventory_manager",
    "field_worker",
    "shipping",
  ]);
  const canViewManagement = session.role === "owner" || session.role === "inventory_manager";

  return (
    <main className="mobileAppShell">
      <header className="mobileAppHeader">
        <a className="brand" href="/" aria-label="PCホームへ">
          R<span>O</span>
        </a>
        <div>
          <span>担当</span>
          <strong>{session.role === "shipping" ? "発送" : "在庫・撮影"}</strong>
        </div>
      </header>

      <section className="mobileAppContent">
        <div className="mobileGreeting">
          <p className="eyebrow">TODAY</p>
          <h1>今日の現場作業</h1>
          <p>現在の担当範囲だけを表示します</p>
        </div>

        <InstallAppCard />

        <OfflineSyncStatus />

        <MobileAssignmentSummary workspaceId={session.workspaceId} role={session.role} />

        {session.role !== "shipping" ? (
          <a className="mobileWorkflowAction" href="/mobile/capture">
            <span aria-hidden="true">▣</span>
            <div>
              <strong>割当商品の撮影・採寸</strong>
              <small>途中保存・再測定・タグ文字候補</small>
            </div>
            <span aria-hidden="true">›</span>
          </a>
        ) : null}

        {canViewManagement ? (
          <a className="mobileWorkflowAction" href="/workflow">
            <span aria-hidden="true">▤</span>
            <div>
              <strong>仕入から会計候補まで進める</strong>
              <small>無料テンプレート・人が確認・自動公開なし</small>
            </div>
            <span aria-hidden="true">›</span>
          </a>
        ) : null}

        <section className="mobileSafety">
          <strong>表示しない情報</strong>
          <p>原価・利益・購入者情報・税務資料は現場担当へ表示しません。</p>
        </section>
      </section>

      <nav className="mobileBottomNav" aria-label="モバイルナビゲーション">
        <a aria-current="page" href="/mobile">
          今日
        </a>
        {session.role === "shipping" ? (
          <a href="/shipping">発送</a>
        ) : (
          <>
            <a href="/mobile/capture">撮影</a>
            <a href="/mobile/scan">読取</a>
          </>
        )}
        {canViewManagement ? <a href="/inventory">在庫</a> : null}
        {canViewManagement ? <a href="/workflow">商品</a> : null}
      </nav>
    </main>
  );
}
