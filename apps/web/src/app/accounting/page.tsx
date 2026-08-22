import { AppSidebar } from "../../components/app-sidebar";
import { AccountingPageWorkspace } from "../../components/accounting-page-workspace";
import { requirePageSession } from "../../lib/server-session";

export const dynamic = "force-dynamic";

export default async function AccountingPage() {
  const session = await requirePageSession(["owner", "accounting"]);
  return (
    <main className="shell">
      <AppSidebar current="accounting" />
      <section className="content workflowContent">
        <header className="topbar">
          <div>
            <p className="eyebrow">ACCOUNTING HANDOFF</p>
            <h1>会計候補・CSV出力ガード</h1>
            <p>原資料と設定を人が確認し、無料のCSVを公式画面へ手動で受け渡します。</p>
          </div>
          <span className="zeroCostBadge">外部接続 0件</span>
        </header>
        <AccountingPageWorkspace workspaceId={session.workspaceId} />
      </section>
    </main>
  );
}
