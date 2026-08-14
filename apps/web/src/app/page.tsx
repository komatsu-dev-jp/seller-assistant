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
        <header className="topbar">
          <div>
            <p className="eyebrow">OWNER PULSE</p>
            <h1>今日の確認</h1>
            <p>DBに保存した実データだけを、根拠と一緒に確認します。</p>
          </div>
          <a className="primaryButton" href="/workflow">
            ＋ 商品作業を開く
          </a>
        </header>
        <HomeWorkspace workspaceId={session.workspaceId} />
      </section>
    </main>
  );
}
