import { isStaticApprovedReview } from "../approved-review-environment";
import { workflowHref } from "../approved-mobile/review-workflow-routes";

/** Keep the existing authenticated routes; only the public review menu changes. */
export function pcNavigationPath(label: string, fallback: string): string {
  return isStaticApprovedReview && label === "商品" ? workflowHref("pc", "products") : fallback;
}
