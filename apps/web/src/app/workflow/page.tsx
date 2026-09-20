import { P0Workspace } from "../../components/p0-workspace";
import { requirePageSession } from "../../lib/server-session";

export const dynamic = "force-dynamic";

export default async function WorkflowPage({
  searchParams,
}: {
  searchParams: Promise<{ sku?: string | string[]; new?: string | string[] }>;
}) {
  const session = await requirePageSession(["owner", "inventory_manager"]);
  const { sku, new: newPurchase } = await searchParams;
  const requestedSkuId = sku === undefined ? undefined : typeof sku === "string" ? sku : "";
  const startNewPurchase = sku === undefined && newPurchase === "1";

  return (
    <P0Workspace
      key={requestedSkuId ?? (startNewPurchase ? "new-purchase" : "default")}
      workspaceId={session.workspaceId}
      requestedSkuId={requestedSkuId}
      startNewPurchase={startNewPurchase}
    />
  );
}
