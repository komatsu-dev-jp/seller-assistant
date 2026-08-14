import { MobileScanWorkflow } from "../../../components/mobile-scan-workflow";
import { requirePageSession } from "../../../lib/server-session";

export const dynamic = "force-dynamic";

export default async function MobileScanPage() {
  const session = await requirePageSession(["owner", "inventory_manager", "field_worker"]);
  return <MobileScanWorkflow workspaceId={session.workspaceId} />;
}
