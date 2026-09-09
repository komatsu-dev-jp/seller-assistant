import { AppSidebar } from "../../components/app-sidebar";
import { AccountingPageWorkspace } from "../../components/accounting-page-workspace";
import { requirePageSession } from "../../lib/server-session";
import styles from "../../components/accounting-live-layout.module.css";

export const dynamic = "force-dynamic";

export default async function AccountingPage() {
  const session = await requirePageSession(["owner", "accounting"]);
  return (
    <main className={`shell ${styles.page}`}>
      <AppSidebar current="accounting" />
      <section className="content workflowContent">
        <header className="topbar">
          <div>
            <h1>会計</h1>
            <p>売上の記録を確認し、会計ソフトへ渡すファイルを準備します。</p>
          </div>
          <span className="zeroCostBadge">外部接続 0件</span>
        </header>
        <AccountingPageWorkspace workspaceId={session.workspaceId} />
      </section>
    </main>
  );
}
