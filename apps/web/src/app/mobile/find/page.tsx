import { MobileInventoryFind } from "../../../components/mobile-inventory-find";
import { requirePageSession } from "../../../lib/server-session";

export const dynamic = "force-dynamic";

export default async function MobileFindPage() {
  const session = await requirePageSession(["owner", "inventory_manager"]);
  return <MobileInventoryFind workspaceId={session.workspaceId} />;
}
