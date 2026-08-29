export type PcUiGlyphName =
  | "home"
  | "work"
  | "purchase"
  | "product"
  | "orders"
  | "inventory"
  | "accounting"
  | "members"
  | "settings"
  | "bell"
  | "help"
  | "user"
  | "printer";

export const pcNavGlyphs = [
  "home",
  "work",
  "purchase",
  "product",
  "orders",
  "inventory",
  "accounting",
  "members",
  "settings",
] as const satisfies readonly PcUiGlyphName[];

export function PcUiGlyph({ name, className = "" }: { name: PcUiGlyphName; className?: string }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      {name === "home" && (
        <>
          <path {...common} d="m3 11 9-8 9 8" />
          <path {...common} d="M5.5 9.5V21h13V9.5M9.5 21v-6h5v6" />
        </>
      )}
      {name === "work" && (
        <>
          <path {...common} d="M8 4h8M9 2h6v4H9zM6 4H4.5v17h15V4H18" />
          <path {...common} d="m8 13 2.2 2.2L16.5 9" />
        </>
      )}
      {name === "purchase" && (
        <>
          <path {...common} d="m4 7 8-4 8 4v10l-8 4-8-4zM4 7l8 4 8-4M12 11v10" />
          <path {...common} d="M9 5.2 17 9" />
        </>
      )}
      {name === "product" && (
        <>
          <path {...common} d="M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2" />
        </>
      )}
      {name === "orders" && (
        <>
          <path {...common} d="M3 5h2l2 11h10l2-8H6" />
          <circle {...common} cx="9" cy="20" r="1" />
          <circle {...common} cx="17" cy="20" r="1" />
        </>
      )}
      {name === "inventory" && (
        <>
          <path {...common} d="M3 8h18v13H3zM5 3h14l2 5H3zM9 12h6v4H9z" />
        </>
      )}
      {name === "accounting" && (
        <>
          <rect {...common} x="4" y="2.5" width="16" height="19" rx="2" />
          <path
            {...common}
            d="M7 6h10v4H7zM8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"
          />
        </>
      )}
      {name === "members" && (
        <>
          <circle {...common} cx="9" cy="8" r="3" />
          <circle {...common} cx="17" cy="9" r="2.5" />
          <path {...common} d="M3.5 20c.4-4 2.2-6 5.5-6s5.1 2 5.5 6M14 15c3.7-.4 5.8 1.2 6.5 4" />
        </>
      )}
      {name === "settings" && (
        <>
          <circle {...common} cx="12" cy="12" r="3" />
          <path
            {...common}
            d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"
          />
        </>
      )}
      {name === "bell" && (
        <>
          <path {...common} d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
        </>
      )}
      {name === "help" && (
        <>
          <circle {...common} cx="12" cy="12" r="9" />
          <path {...common} d="M9.8 9a2.4 2.4 0 1 1 3.5 2.1c-.9.5-1.3 1-1.3 2M12 17h.01" />
        </>
      )}
      {name === "user" && (
        <>
          <circle fill="currentColor" cx="12" cy="12" r="10" />
          <circle fill="#fff" cx="12" cy="9" r="3" />
          <path fill="#fff" d="M6.8 18.1c.7-3 2.4-4.5 5.2-4.5s4.5 1.5 5.2 4.5a8 8 0 0 1-10.4 0Z" />
        </>
      )}
      {name === "printer" && (
        <>
          <path
            {...common}
            d="M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"
          />
          <path {...common} d="M7 14h10v7H7zM17 11h.01" />
        </>
      )}
    </svg>
  );
}
