import { AppSidebar } from "../../../components/app-sidebar";
import { StocktakeWorkspace, type StocktakeFocus } from "../../../components/stocktake-workspace";
import { requirePageSession } from "../../../lib/server-session";

export const dynamic = "force-dynamic";

type StocktakeSearchParams = { focus?: string | string[] };

export default async function StocktakePage({
  searchParams,
}: {
  searchParams: Promise<StocktakeSearchParams>;
}) {
  const session = await requirePageSession(["owner", "inventory_manager"]);
  const { focus } = await searchParams;
  const initialFocus = stocktakeFocus(focus);
  return (
    <main className="shell inventoryShell">
      <AppSidebar current="discrepancy" />
      <section className="content inventoryContent stocktakePage">
        <header className="topbar inventoryTopbar">
          <div>
            <p className="eyebrow">REVERSIBLE STOCKTAKE</p>
            <h1>在庫差異・即時確認</h1>
            <p>現物と場所を再確認し、履歴を残したまま安全に復元します。</p>
          </div>
          <a className="secondaryButton" href="/inventory">
            在庫ロケーションへ戻る
          </a>
        </header>
        <StocktakeWorkspace
          currentIdentityId={session.identityId}
          initialFocus={initialFocus}
          workspaceId={session.workspaceId}
        />
      </section>
    </main>
  );
}

function stocktakeFocus(value: string | string[] | undefined): StocktakeFocus {
  if (value === "approval-pending") return value;
  return "all";
}
