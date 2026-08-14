import { AppSidebar } from "../../components/app-sidebar";
import { P0Workspace } from "../../components/p0-workspace";

export default function WorkflowPage() {
  return (
    <main className="shell">
      <AppSidebar current="workflow" />
      <section className="content workflowContent">
        <header className="topbar">
          <div>
            <p className="eyebrow">P0 ITEM WORKSPACE</p>
            <h1>試験商品の一気通貫作業</h1>
            <p>仕入から会計候補まで、無料テンプレートと人の確認だけで進めます。</p>
          </div>
          <span className="zeroCostBadge">外部費用 0円</span>
        </header>
        <P0Workspace />
      </section>
    </main>
  );
}
