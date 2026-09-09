import { AppSidebar } from "../../components/app-sidebar";
import { TeamWorkspace } from "../../components/team-workspace";
import styles from "../../components/navigation-home-team.module.css";
import { requirePageSession } from "../../lib/server-session";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const session = await requirePageSession(["owner", "inventory_manager"]);
  return (
    <main className={`shell inventoryShell ${styles.teamRoute}`}>
      <AppSidebar current="team" />
      <section className="content inventoryContent">
        <header className={`topbar inventoryTopbar ${styles.routeHeader}`}>
          <div className={styles.headerCopy}>
            <p className={styles.headerEyebrow}>メンバー / 担当 / 変更の確認</p>
            <h1>メンバーと担当</h1>
            <p>担当商品・場所・期限を、必要な範囲だけ許可します。</p>
          </div>
          <span className={styles.headerStatus}>● 人が確認して保存</span>
        </header>
        <TeamWorkspace
          workspaceId={session.workspaceId}
          role={session.role}
          currentIdentityId={session.identityId}
        />
      </section>
    </main>
  );
}
