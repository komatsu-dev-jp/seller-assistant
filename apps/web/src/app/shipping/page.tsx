import { ShippingWorkspace } from "../../components/shipping-workspace";
import { requirePageSession } from "../../lib/server-session";

export const dynamic = "force-dynamic";

export default async function ShippingPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string | string[]; sku?: string | string[] }>;
}) {
  const session = await requirePageSession(["owner", "inventory_manager", "shipping"]);
  const { order, sku } = await searchParams;
  const requestedOrderId = order === undefined ? undefined : typeof order === "string" ? order : "";
  const requestedSkuId =
    order !== undefined || sku === undefined ? undefined : typeof sku === "string" ? sku : "";
  return (
    <ShippingWorkspace
      key={
        requestedOrderId !== undefined
          ? `order:${requestedOrderId}`
          : requestedSkuId !== undefined
            ? `sku:${requestedSkuId}`
            : "default"
      }
      workspaceId={session.workspaceId}
      role={session.role}
      requestedOrderId={requestedOrderId}
      requestedSkuId={requestedSkuId}
    />
  );
}
