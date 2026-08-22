import { LogoutButton } from "./logout-button";

const links = [
  ["/", "ホーム", "home", "primary", "⌂"],
  ["/workflow", "商品", "workflow", "primary", "▣"],
  ["/workflow", "仕入・出品", "listing", "secondary", "⇢"],
  ["/shipping", "注文・配送", "orders", "secondary", "▱"],
  ["/inventory", "在庫", "inventory", "primary", "◇"],
  ["/inventory/stocktake", "差異・確認", "discrepancy", "secondary", "△"],
  ["/accounting", "収支・帳簿", "accounting", "secondary", "▧"],
  ["/team", "チーム", "team", "secondary", "◎"],
  ["/mobile", "現場作業", "mobile", "primary", "▤"],
] as const;

interface AppSidebarProps {
  current: "home" | "inventory" | "discrepancy" | "workflow" | "team" | "accounting";
}

export function AppSidebar({ current }: AppSidebarProps) {
  return (
    <aside className={`sidebar sidebar-${current}`} aria-label="メインナビゲーション">
      <a className="brand" href="/" aria-label="Resale Operations ホーム">
        <span className="brandMark">OP</span>
        <span className="brandText">オペレーション</span>
      </a>
      <nav>
        {links.map(([href, label, key, mobilePriority, icon]) => {
          const isCurrent = current === key;
          return (
            <a
              aria-current={isCurrent ? "page" : undefined}
              className={`nav-${mobilePriority} nav-${key}`}
              href={href}
              key={label}
            >
              <span className="navIcon" aria-hidden="true">
                {icon}
              </span>
              <span>{label}</span>
            </a>
          );
        })}
      </nav>
      <LogoutButton />
      <div className="safety">重要操作は人が確認して確定します</div>
    </aside>
  );
}
