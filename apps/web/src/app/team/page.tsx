import { AppSidebar } from "../../components/app-sidebar";
import { TeamWorkspace } from "../../components/team-workspace";
import { requirePageSession } from "../../lib/server-session";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const session = await requirePageSession(["owner", "inventory_manager"]);
  return (
    <main className="shell inventoryShell">
      <AppSidebar current="team" />
      <section className="content inventoryContent">
        <header className="topbar inventoryTopbar">
          <div>
            <p className="eyebrow">TEAM & ASSIGNMENTS</p>
            <h1>外注担当と期限付き割当</h1>
            <p>PC内アカウントを作り、担当商品・場所・期限を最小限だけ許可します。</p>
          </div>
        </header>
        <TeamWorkspace workspaceId={session.workspaceId} role={session.role} />
      </section>
    </main>
  );
}
