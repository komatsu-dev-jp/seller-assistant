import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const reviewConfig = read("apps/review/next.config.ts");
const environment = read("apps/web/src/components/approved-review-environment.ts");
const pcCanvas = read("apps/web/src/components/approved-pc/pc-canvas.tsx");
const pcActions = read("apps/web/src/components/approved-pc/pc-preview-action-button.tsx");
const earlyScreens = read("apps/web/src/components/approved-pc/approved-pc-early-screens.tsx");
const lateScreens = read("apps/web/src/components/approved-pc/approved-pc-late-screens.tsx");
const mobileScreens = read("apps/web/src/components/approved-mobile/approved-mobile-demo.tsx");

describe("approved static review live-route boundary", () => {
  it("marks only the exported review app as review-only", () => {
    expect(reviewConfig).toContain('NEXT_PUBLIC_REVIEW_ONLY: "true"');
    expect(environment).toContain('process.env.NEXT_PUBLIC_REVIEW_ONLY === "true"');
  });

  it("keeps live routes available in the web app but removes them from the static review", () => {
    expect(pcCanvas).toContain(
      "isStaticApprovedReview ? null : getApprovedPcLiveRoute(screenNumber)",
    );
    expect(pcActions).toContain("isStaticApprovedReview ? undefined : liveHref");
    expect(pcActions).toContain('aria-disabled="true"');
    expect(mobileScreens).toContain("isStaticApprovedReview ? undefined : liveHref");
    expect(mobileScreens).toContain("isStaticApprovedReview ? null : getMobileLiveRoute(screen)");
  });

  it("routes direct live actions through the review-aware link component", () => {
    expect(earlyScreens).toContain(
      '<PcLiveRouteLink href="/mobile/scan">スマホで読み取って商品を開く</PcLiveRouteLink>',
    );
    expect(earlyScreens).not.toMatch(/<a[^>]+href="\/mobile\/scan"/u);
    expect(lateScreens).toContain("<PcLiveRouteLink");
    expect(lateScreens).not.toMatch(/<a[^>]+href=\{accountingRoute/u);
  });
});
