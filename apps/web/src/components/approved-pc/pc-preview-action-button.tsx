import type { ReactNode } from "react";

import { isStaticApprovedReview } from "../approved-review-environment";
import styles from "./pc-canvas.module.css";

export function PcPreviewActionButton({
  children,
  className,
  ariaLabel,
  title,
  message,
  liveHref,
  liveLabel,
  previewHref,
  previewLabel,
}: {
  children: ReactNode;
  className?: string | undefined;
  ariaLabel?: string | undefined;
  title: string;
  message: string;
  liveHref?: string | undefined;
  liveLabel?: string | undefined;
  previewHref?: string | undefined;
  previewLabel?: string | undefined;
}) {
  const availableLiveHref = isStaticApprovedReview ? undefined : liveHref;
  return (
    <button
      type="button"
      className={[styles.previewTrigger, className].filter(Boolean).join(" ")}
      aria-label={ariaLabel}
      aria-haspopup="dialog"
      aria-controls="approved-pc-preview-action-panel"
      data-pc-preview-action={title}
      data-pc-preview-message={message}
      data-pc-preview-live-route={availableLiveHref}
      data-pc-preview-live-label={liveLabel}
      data-pc-preview-next={previewHref}
      data-pc-preview-next-label={previewLabel}
    >
      {children}
    </button>
  );
}

export function PcLiveRouteLink({
  href,
  className,
  ariaLabel,
  children,
}: {
  href: string;
  className?: string | undefined;
  ariaLabel?: string | undefined;
  children: ReactNode;
}) {
  if (isStaticApprovedReview) {
    return (
      <span
        className={[styles.reviewOnlyDisabledLink, className].filter(Boolean).join(" ")}
        aria-disabled="true"
        aria-label={ariaLabel}
        title="公開確認版では実データの業務画面を開きません"
      >
        {children}
      </span>
    );
  }
  return (
    <a className={className} href={href} aria-label={ariaLabel}>
      {children}
    </a>
  );
}
