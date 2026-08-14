const links = [
  ["/", "ホーム"],
  ["/workflow", "P0商品作業"],
  ["/inventory", "在庫"],
  ["/workflow", "仕入・出品"],
  ["/workflow", "注文・配送"],
  ["/workflow", "収支・会計"],
] as const;

interface AppSidebarProps {
  current: "home" | "inventory" | "workflow";
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
            (current === "inventory" && label === "在庫") ||
            (current === "workflow" && label === "P0商品作業");
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
