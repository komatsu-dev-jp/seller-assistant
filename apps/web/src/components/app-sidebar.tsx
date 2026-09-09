import { LogoutButton } from "./logout-button";
import styles from "./navigation-home-team.module.css";

const desktopLinks = [
  ["/", "ホーム", "home", "⌂"],
  ["/mobile", "作業", "mobile", "✓"],
  ["/workflow", "仕入れ", "workflow", "＋"],
  ["/workflow", "商品", "product", "▣"],
  ["/shipping", "注文・発送", "orders", "▱"],
  ["/inventory", "在庫", "inventory", "◇"],
  ["/accounting", "会計", "accounting", "▧"],
  ["/team", "メンバー", "team", "◎"],
] as const;

const mobileLinks = [
  ["/", "ホーム", "home", "⌂"],
  ["/mobile", "作業", "mobile", "✓"],
  ["/workflow", "商品", "workflow", "▣"],
  ["/inventory", "在庫", "inventory", "◇"],
  ["/accounting", "会計", "accounting", "▧"],
] as const;

interface AppSidebarProps {
  current: "home" | "inventory" | "discrepancy" | "workflow" | "team" | "accounting";
}

export function AppSidebar({ current }: AppSidebarProps) {
  return (
    <aside
      className={`sidebar sidebar-${current} ${styles.sidebar}`}
      aria-label="メインナビゲーション"
    >
      <a className="brand" href="/" aria-label="Resale Operations ホーム">
        <span className="brandMark">OP</span>
        <span className="brandText">業務を確認する</span>
      </a>
      <nav className={styles.desktopNav} aria-label="PC用メインナビゲーション">
        {desktopLinks.map(([href, label, key, icon]) => {
          const isCurrent = current === key || (current === "workflow" && key === "product");
          return (
            <a
              aria-current={isCurrent ? "page" : undefined}
              className={`${styles.navLink} nav-${key}`}
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
        <span className={styles.comingSoon} aria-disabled="true">
          <span aria-hidden="true">⚙</span>
          設定
          <small>P0対象外</small>
        </span>
      </nav>
      <LogoutButton />
      <div className="safety">重要操作は人が確認して確定します</div>

      <nav className={styles.mobileNav} aria-label="モバイルナビゲーション">
        {mobileLinks.map(([href, label, key, icon]) => {
          const isCurrent =
            current === key ||
            (current === "workflow" && key === "workflow") ||
            (current === "discrepancy" && key === "inventory");
          return (
            <a aria-current={isCurrent ? "page" : undefined} href={href} key={label}>
              <span aria-hidden="true">{icon}</span>
              {label}
            </a>
          );
        })}
      </nav>
    </aside>
  );
}
