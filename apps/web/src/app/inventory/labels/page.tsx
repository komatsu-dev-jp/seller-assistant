import { AppSidebar } from "../../../components/app-sidebar";
import { InventoryLabelWorkspace } from "../../../components/inventory-label-workspace";
import { requirePageSession } from "../../../lib/server-session";

export const dynamic = "force-dynamic";

export default async function InventoryLabelsPage() {
  const session = await requirePageSession(["owner", "inventory_manager"]);

  return (
    <main className="shell inventoryLabelPage">
      <AppSidebar current="inventory" />
      <section className="content inventoryLabelContent">
        <header className="topbar noPrint">
          <div>
            <p className="eyebrow">INVENTORY LABELS</p>
            <h1>商品バーコードを印刷</h1>
            <p>スマホで商品を探せる、商品ごとのラベルをA4で印刷します。</p>
          </div>
          <a className="secondaryButton" href="/inventory">
            在庫管理へ戻る
          </a>
        </header>
        <InventoryLabelWorkspace workspaceId={session.workspaceId} />
      </section>
    </main>
  );
}
