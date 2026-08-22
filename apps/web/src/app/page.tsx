import { AppSidebar } from "../components/app-sidebar";
import { HomeWorkspace } from "../components/home-workspace";
import { requirePageSession } from "../lib/server-session";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await requirePageSession(["owner", "inventory_manager"]);
  return (
    <main className="shell">
      <AppSidebar current="home" />
      <section className="content" id="home">
        <header className="topbar homeTopbar">
          <div>
            <p className="eyebrow">OWNER PULSE</p>
            <h1>ホーム</h1>
            <p>今日の確認事項と、商品ごとの次の作業をまとめます。</p>
          </div>
          <a className="primaryButton" href="/workflow">
            ＋ 商品作業を開く
          </a>
        </header>
        <HomeWorkspace workspaceId={session.workspaceId} role={session.role} />
      </section>
    </main>
  );
}
