import { P0Workspace } from "../../components/p0-workspace";
import { requirePageSession } from "../../lib/server-session";

export const dynamic = "force-dynamic";

export default async function WorkflowPage() {
  const session = await requirePageSession(["owner", "inventory_manager"]);

  return <P0Workspace workspaceId={session.workspaceId} />;
}
