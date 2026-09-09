import { AppSidebar } from "../components/app-sidebar";
import { HomeWorkspace } from "../components/home-workspace";
import styles from "../components/navigation-home-team.module.css";
import { requirePageSession } from "../lib/server-session";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await requirePageSession(["owner", "inventory_manager"]);
  return (
    <main className={`shell ${styles.homeRoute}`}>
      <AppSidebar current="home" />
      <section className="content" id="home">
        <header className={`topbar homeTopbar ${styles.routeHeader}`}>
          <div className={styles.headerCopy}>
            <p className={styles.headerEyebrow}>ホーム / 今日の確認</p>
            <h1>ホーム</h1>
            <p>今日の確認事項と、商品ごとの次の作業をまとめます。</p>
          </div>
          <div className={styles.headerActions}>
            <span className={styles.headerStatus}>● 実データを確認中</span>
            <a className="primaryButton" href="/workflow">
              商品作業を開く
            </a>
          </div>
        </header>
        <HomeWorkspace workspaceId={session.workspaceId} role={session.role} />
      </section>
    </main>
  );
}
