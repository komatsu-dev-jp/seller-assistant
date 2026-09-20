"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from "react";

import { isStaticApprovedReview } from "../approved-review-environment";
import { getApprovedPcLiveRoute, isP1ApprovedPcScreen } from "./approved-screen-scope";
import styles from "./pc-canvas.module.css";

type HeaderPanel = "sidebar" | "work" | "notifications" | "help" | "account";

type PreviewAction = {
  title: string;
  message: string;
  liveRoute: string | null;
  liveLabel: string;
  nextHref: string | null;
  nextLabel: string;
};

const headerPanelTitles: Record<HeaderPanel, string> = {
  sidebar: "メニュー",
  work: "作業者メニュー",
  notifications: "通知",
  help: "この画面について",
  account: "担当者メニュー",
};

const menuLinks = [
  ["ホーム", 2],
  ["今日の作業", 3],
  ["仕入れ", 5],
  ["商品", 9],
  ["注文・発送", 29],
  ["在庫", 33],
  ["会計", 45],
  ["メンバー", 37],
  ["設定", 49],
] as const;

function isHeaderPanel(value: string | undefined): value is HeaderPanel {
  return (
    value === "sidebar" ||
    value === "work" ||
    value === "notifications" ||
    value === "help" ||
    value === "account"
  );
}

function HeaderPanelContent({
  panel,
  liveRoute,
  onClose,
}: {
  panel: HeaderPanel;
  liveRoute: string | null;
  onClose: () => void;
}) {
  return (
    <section
      id="approved-pc-header-panel"
      className={styles.headerPanel}
      role="dialog"
      aria-modal="false"
      aria-label={headerPanelTitles[panel]}
      data-pc-header-panel
    >
      <header>
        <h2>{headerPanelTitles[panel]}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={`${headerPanelTitles[panel]}を閉じる`}
          autoFocus
        >
          ×
        </button>
      </header>

      {panel === "sidebar" ? (
        <nav aria-label="画面メニュー">
          {menuLinks.map(([label, number]) => (
            <a href={`/pc/${number}`} key={label}>
              {label}
            </a>
          ))}
        </nav>
      ) : null}

      {panel === "work" ? (
        <nav aria-label="作業者メニュー">
          <a href="/pc/3">今日の作業を確認</a>
          <a href="/pc/29">注文・発送を確認</a>
          <a href="/pc/33">在庫を確認</a>
        </nav>
      ) : null}

      {panel === "notifications" ? (
        <div className={styles.panelBody}>
          <strong>この確認版では新しい通知を取得しません</strong>
          <p>表示されている件数や担当名は、承認デザインを確認するための架空例です。</p>
          <a href="/pc/4">通知・見られる範囲の見本を開く</a>
        </div>
      ) : null}

      {panel === "help" ? (
        <div className={styles.panelBody}>
          <strong>承認デザインの確認画面です</strong>
          <p>この画面だけでは保存・公開・外部送信を行いません。</p>
          {liveRoute ? (
            <a href={liveRoute}>実際に保存する業務画面を開く</a>
          ) : (
            <span>実機能は準備中です。</span>
          )}
        </div>
      ) : null}

      {panel === "account" ? (
        <div className={styles.panelBody}>
          <strong>担当A（表示例）</strong>
          <p>この確認版では、アカウントや権限を変更しません。</p>
          <a href="/pc/49">設定の見本を開く</a>
        </div>
      ) : null}
    </section>
  );
}

function PreviewActionPanel({
  action,
  onClose,
  panelRef,
}: {
  action: PreviewAction;
  onClose: () => void;
  panelRef: RefObject<HTMLElement | null>;
}) {
  return (
    <>
      <button
        type="button"
        className={styles.previewBackdrop}
        aria-label={`${action.title}の案内を閉じる`}
        tabIndex={-1}
        onClick={onClose}
      />
      <section
        ref={panelRef}
        id="approved-pc-preview-action-panel"
        className={styles.previewPanel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="approved-pc-preview-action-title"
        data-pc-preview-panel
      >
        <header>
          <h2 id="approved-pc-preview-action-title">{action.title}</h2>
          <button type="button" onClick={onClose} aria-label={`${action.title}を閉じる`} autoFocus>
            ×
          </button>
        </header>
        <p>{action.message}</p>
        <div className={styles.previewPanelActions}>
          {action.liveRoute ? <a href={action.liveRoute}>{action.liveLabel}</a> : null}
          {action.nextHref ? <a href={action.nextHref}>{action.nextLabel}</a> : null}
          {!action.liveRoute && !action.nextHref ? (
            <strong>この確認版では保存・外部送信を行いません。</strong>
          ) : null}
        </div>
      </section>
    </>
  );
}

/**
 * The approved route is one 768x512 desktop screen (each approved board is a
 * 2x2 composite containing four of these screens). Route styles use the same
 * 768x512 coordinate system, then this canvas enlarges the whole screen to the
 * review viewport. At 1440px this is exactly 1.875x and 1440x960.
 */
export function PcCanvas({
  className,
  children,
  screenNumber,
}: {
  className: string | undefined;
  children: ReactNode;
  screenNumber: number;
}) {
  const [scale, setScale] = useState(1);
  const [headerPanel, setHeaderPanel] = useState<HeaderPanel | null>(null);
  const [previewAction, setPreviewAction] = useState<PreviewAction | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const headerTriggerRef = useRef<HTMLElement | null>(null);
  const previewTriggerRef = useRef<HTMLElement | null>(null);
  const previewPanelRef = useRef<HTMLElement>(null);

  function closeHeaderPanel(restoreFocus: boolean) {
    const opener = headerTriggerRef.current;
    headerTriggerRef.current = null;
    setHeaderPanel(null);
    if (!restoreFocus || !opener?.isConnected) return;
    window.requestAnimationFrame(() => opener.focus());
  }

  function closePreviewAction(restoreFocus: boolean) {
    const opener = previewTriggerRef.current;
    previewTriggerRef.current = null;
    setPreviewAction(null);
    if (!restoreFocus || !opener?.isConnected) return;
    window.requestAnimationFrame(() => opener.focus());
  }

  useEffect(() => {
    const update = () => {
      // The gate is width-first: at 1440px the 768px virtual board becomes
      // 1440px wide and its 512px height becomes 960px. A short viewport may
      // scroll vertically; it must not shrink the approved desktop geometry.
      setScale(Math.max(0.01, window.innerWidth / 768));
    };

    update();
    window.scrollTo(0, 0);
    if (viewportRef.current) viewportRef.current.scrollTop = 0;
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo(0, 0);
      if (viewportRef.current) viewportRef.current.scrollTop = 0;
    });
    window.addEventListener("resize", update);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
    };
  }, [className]);

  useEffect(() => {
    setHeaderPanel(null);
    headerTriggerRef.current = null;
    setPreviewAction(null);
    previewTriggerRef.current = null;
  }, [screenNumber]);

  useEffect(() => {
    if (!headerPanel) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeHeaderPanel(true);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [headerPanel]);

  useEffect(() => {
    if (!previewAction) return;
    const keepFocusInPanel = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closePreviewAction(true);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = previewPanelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener("keydown", keepFocusInPanel);
    return () => window.removeEventListener("keydown", keepFocusInPanel);
  }, [previewAction]);

  const viewportStyle: CSSProperties = {
    width: "100vw",
    minHeight: "100vh",
    height: "100vh",
    // The approved desktop board remains width-first. Short windows must be
    // able to reach the footer, while the className-dependent effect above
    // resets retained focus scrolling whenever the live screen changes.
    overflowX: "hidden",
    overflowY: "auto",
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-start",
    background: "#eef2f7",
  };
  const canvasViewportStyle: CSSProperties = {
    width: `${768 * scale}px`,
    height: `${512 * scale}px`,
    flex: "0 0 auto",
  };
  const canvasStyle: CSSProperties = {
    transform: `scale(${scale})`,
    transformOrigin: "top left",
  };
  const liveRoute = isStaticApprovedReview ? null : getApprovedPcLiveRoute(screenNumber);

  function handleCanvasClick(event: MouseEvent<HTMLElement>) {
    const previewTarget =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-pc-preview-action]")
        : null;
    if (previewTarget) {
      event.preventDefault();
      closeHeaderPanel(false);
      previewTriggerRef.current = previewTarget;
      setPreviewAction({
        title: previewTarget.dataset.pcPreviewAction ?? "操作の確認",
        message: previewTarget.dataset.pcPreviewMessage ?? "この画面は承認デザインの確認見本です。",
        liveRoute: previewTarget.dataset.pcPreviewLiveRoute || liveRoute,
        liveLabel: previewTarget.dataset.pcPreviewLiveLabel ?? "実際の業務画面を開く",
        nextHref: previewTarget.dataset.pcPreviewNext || null,
        nextLabel: previewTarget.dataset.pcPreviewNextLabel ?? "次の見本を開く",
      });
      return;
    }
    const target =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-pc-header-action]")
        : null;
    const action = target?.dataset.pcHeaderAction;
    if (isHeaderPanel(action)) {
      if (headerPanel === action) {
        closeHeaderPanel(true);
      } else {
        headerTriggerRef.current = target;
        setHeaderPanel(action);
      }
      return;
    }
    if (
      headerPanel &&
      event.target instanceof Element &&
      !event.target.closest("[data-pc-header-panel]")
    ) {
      closeHeaderPanel(false);
    }
  }

  return (
    <div ref={viewportRef} style={viewportStyle} data-pc-canvas="768x512">
      <div style={canvasViewportStyle}>
        <main
          className={className}
          style={canvasStyle}
          data-implementation-scope={
            isP1ApprovedPcScreen(screenNumber) ? "p1-preview" : "p0-live-mapped"
          }
          data-live-route={liveRoute ?? undefined}
          onClick={handleCanvasClick}
        >
          {children}
          {headerPanel ? (
            <HeaderPanelContent
              key={headerPanel}
              panel={headerPanel}
              liveRoute={liveRoute}
              onClose={() => closeHeaderPanel(true)}
            />
          ) : null}
          {previewAction ? (
            <PreviewActionPanel
              key={`${screenNumber}-${previewAction.title}`}
              action={previewAction}
              panelRef={previewPanelRef}
              onClose={() => closePreviewAction(true)}
            />
          ) : null}
        </main>
      </div>
    </div>
  );
}
