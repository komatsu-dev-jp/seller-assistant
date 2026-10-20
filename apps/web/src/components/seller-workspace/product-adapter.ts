import { itemProfit, money, type IntakeState } from "../approved-mobile/box-intake-store";
import { workflowHref, type ReviewPlatform } from "../approved-mobile/review-workflow-routes";

export type WorkspaceProduct = {
  id: string;
  name: string;
  subtitle: string;
  registered: boolean;
  sellable: boolean;
  estimate: number | null;
  cost: number | null;
  href: string;
  image: string | null;
};

/** Read-only projection. Intake schema, costs and comparison evidence remain untouched. */
export function workspaceProducts(
  state: IntakeState,
  platform: ReviewPlatform,
): WorkspaceProduct[] {
  return state.boxes.flatMap((box) =>
    box.items.map((item, index) => {
      const purchase = money(box.purchaseYen);
      const inbound = money(box.inboundShippingYen);
      const total = purchase !== null && inbound !== null ? purchase + inbound : null;
      const cost =
        total !== null && box.confirmed && box.count > 0
          ? Math.floor(total / box.count) + (index < total % box.count ? 1 : 0)
          : null;
      return {
        id: item.id,
        name: item.name || `未登録の商品 ${index + 1}`,
        subtitle: [
          box.name || "名前のない箱",
          item.size,
          item.inspection === "hold"
            ? "要確認"
            : item.inspection === "unsellable"
              ? "販売不可"
              : "",
        ]
          .filter(Boolean)
          .join(" · "),
        registered: item.registered,
        sellable: item.registered && item.inspection === "sellable",
        estimate: itemProfit(box, index)?.gross ?? null,
        cost,
        href: `${workflowHref(platform, "intake")}?box=${encodeURIComponent(box.id)}&step=${item.registered ? "profit" : "item"}&item=${index}`,
        image: null,
      };
    }),
  );
}
