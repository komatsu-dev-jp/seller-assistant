import { reviewPath } from "../approved-mobile/review-path";
import type { ReviewPlatform } from "../approved-mobile/review-workflow-routes";
import ui from "./workspace.module.css";

export const tabs = [
  ["home", "ホーム"],
  ["products", "商品"],
  ["shipping", "発送"],
  ["reports", "レポート"],
  ["settings", "設定"],
] as const;
export type SellerTab = (typeof tabs)[number][0];
export function sellerHref(platform: ReviewPlatform, tab: SellerTab): string {
  const path =
    tab === "home"
      ? platform === "pc"
        ? "/pc/2/"
        : "/mobile/screens/04/"
      : `/${platform}/products/${tab === "products" ? "" : `?tab=${tab}`}`;
  return reviewPath(path, process.env.NEXT_PUBLIC_REVIEW_BASE_PATH ?? "");
}
export function Glyph({ name }: { name: SellerTab | "box" | "plus" | "arrow" | "search" }) {
  const paths = {
    home: "M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9",
    products: "m3 7 9-4 9 4-9 4-9-4Zm0 0v10l9 4 9-4V7M12 11v10M7 5l10 4",
    box: "m3 7 9-4 9 4-9 4-9-4Zm0 0v10l9 4 9-4V7M12 11v10M7 5l10 4",
    shipping: "m3 10 18-7-7 18-3-8-8-3Zm8 3L21 3",
    reports: "M4 20V11h3v9M10 20V4h3v16M16 20V8h3v12",
    settings:
      "M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1 1-3ZM9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0",
    plus: "M12 4v16M4 12h16",
    arrow: "m9 5 7 7-7 7",
    search: "M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 6 6",
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
export function SellerNavigation({
  platform = "mobile",
  active,
  onNavigate,
}: {
  platform?: ReviewPlatform;
  active: SellerTab;
  onNavigate?: (tab: SellerTab) => void;
}) {
  return (
    <nav className={ui.navigation} aria-label="メインメニュー">
      {tabs.map(([id, label]) => (
        <a
          key={id}
          href={sellerHref(platform, id)}
          aria-current={id === active ? "page" : undefined}
          onClick={(event) => {
            if (
              onNavigate &&
              event.button === 0 &&
              !event.ctrlKey &&
              !event.metaKey &&
              !event.shiftKey &&
              !event.altKey
            ) {
              event.preventDefault();
              onNavigate(id);
              window.scrollTo(0, 0);
            }
          }}
        >
          <Glyph name={id} />
          <span>{label}</span>
        </a>
      ))}
    </nav>
  );
}
