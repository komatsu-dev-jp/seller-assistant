import { MobileCaptureWorkspace } from "../../../components/mobile-capture-workspace";
import { requirePageSession } from "../../../lib/server-session";

export const dynamic = "force-dynamic";

export default async function MobileCapturePage() {
  const session = await requirePageSession(["owner", "inventory_manager", "field_worker"]);
  return <MobileCaptureWorkspace workspaceId={session.workspaceId} />;
}
