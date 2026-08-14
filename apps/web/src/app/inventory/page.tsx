import { AppSidebar } from "../../components/app-sidebar";
import { InventoryWorkspace } from "../../components/inventory-workspace";
import { requirePageSession } from "../../lib/server-session";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const session = await requirePageSession(["owner", "inventory_manager"]);
  return (
    <main className="shell inventoryShell">
      <AppSidebar current="inventory" />
      <section className="content inventoryContent">
        <header className="topbar inventoryTopbar">
          <div>
            <p className="eyebrow">INVENTORY CONTROL</p>
            <h1>在庫ロケーション管理</h1>
            <p>部屋・棚・箱・位置写真と在庫管理番号を、実データで結びます。</p>
          </div>
          <div className="actionGroup">
            <a className="secondaryButton" href="/mobile/scan">
              商品＋場所を読取
            </a>
            <a href="/workflow">＋ 仕入商品を登録</a>
          </div>
        </header>
        <InventoryWorkspace workspaceId={session.workspaceId} />
      </section>
    </main>
  );
}
