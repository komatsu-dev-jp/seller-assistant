import { ShippingWorkspace } from "../../components/shipping-workspace";
import { requirePageSession } from "../../lib/server-session";

export const dynamic = "force-dynamic";

export default async function ShippingPage() {
  const session = await requirePageSession(["owner", "inventory_manager", "shipping"]);
  return <ShippingWorkspace workspaceId={session.workspaceId} />;
}
