import { AppSidebar } from "../../../components/app-sidebar";
import { InventoryLabelWorkspace } from "../../../components/inventory-label-workspace";
import { requirePageSession } from "../../../lib/server-session";
import styles from "../../../components/inventory-live.module.css";

export const dynamic = "force-dynamic";

export default async function InventoryLabelsPage() {
  const session = await requirePageSession(["owner", "inventory_manager"]);

  return (
    <main className={`shell inventoryLabelPage ${styles.page}`}>
      <AppSidebar current="inventory" />
      <section className="content inventoryLabelContent">
        <header className="topbar noPrint">
          <div>
            <p className="eyebrow">INVENTORY LABELS</p>
            <h1>商品番号・ラベル</h1>
            <p>手書きの番号で始められます。バーコード印刷は任意です。</p>
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
