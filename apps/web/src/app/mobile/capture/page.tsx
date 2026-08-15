import { MobileCaptureWorkspace } from "../../../components/mobile-capture-workspace";
import { requirePageSession } from "../../../lib/server-session";

export const dynamic = "force-dynamic";

export default async function MobileCapturePage() {
  const session = await requirePageSession(["owner", "inventory_manager", "field_worker"]);
  return (
    <main className="mobileAppShell">
      <header className="mobileAppHeader">
        <a href="/mobile">‹ 今日</a>
        <strong>撮影・採寸</strong>
      </header>
      <section className="mobileAppContent">
        <MobileCaptureWorkspace workspaceId={session.workspaceId} />
        <section className="mobileSafety">
          <strong>安全な範囲</strong>
          <p>原価・利益・購入者情報は表示しません。外部サイトへ自動送信しません。</p>
        </section>
      </section>
      <nav className="mobileBottomNav" aria-label="モバイルナビゲーション">
        <a href="/mobile">今日</a>
        <a aria-current="page" href="/mobile/capture">
          撮影
        </a>
        <a href="/mobile/scan">読取</a>
      </nav>
    </main>
  );
}
