const links = [
  ["/", "ホーム"],
  ["/#purchase", "仕入"],
  ["/inventory", "在庫"],
  ["/#listing", "出品準備"],
  ["/#orders", "注文・配送"],
  ["/#finance", "収支・会計"],
  ["/#team", "チーム"],
] as const;

interface AppSidebarProps {
  current: "home" | "inventory";
}

export function AppSidebar({ current }: AppSidebarProps) {
  return (
    <aside className="sidebar" aria-label="メインナビゲーション">
      <a className="brand" href="/" aria-label="Resale Operations ホーム">
        R<span>O</span>
      </a>
      <nav>
        {links.map(([href, label]) => {
          const isCurrent =
            (current === "home" && label === "ホーム") ||
            (current === "inventory" && label === "在庫");
          return (
            <a aria-current={isCurrent ? "page" : undefined} href={href} key={label}>
              {label}
            </a>
          );
        })}
      </nav>
      <div className="safety">重要操作は人が確認して確定します</div>
    </aside>
  );
}
