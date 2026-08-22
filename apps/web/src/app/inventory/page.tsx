import { AppSidebar } from "../../components/app-sidebar";
import { InventoryWorkspace, type InventoryFocus } from "../../components/inventory-workspace";
import { requirePageSession } from "../../lib/server-session";

export const dynamic = "force-dynamic";

type InventorySearchParams = { focus?: string | string[] };

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<InventorySearchParams>;
}) {
  const session = await requirePageSession(["owner", "inventory_manager"]);
  const { focus } = await searchParams;
  const initialFocus = inventoryFocus(focus);
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
            <a className="secondaryButton" href="/inventory/stocktake">
              棚卸・差異を確認
            </a>
            <a className="secondaryButton" href="/mobile/scan">
              商品＋場所を読取
            </a>
            <a href="/workflow">＋ 仕入商品を登録</a>
          </div>
        </header>
        <InventoryWorkspace workspaceId={session.workspaceId} initialFocus={initialFocus} />
      </section>
    </main>
  );
}

function inventoryFocus(value: string | string[] | undefined): InventoryFocus {
  if (value === "pending-location-photo" || value === "disposal-candidate") {
    return value;
  }
  return "all";
}
