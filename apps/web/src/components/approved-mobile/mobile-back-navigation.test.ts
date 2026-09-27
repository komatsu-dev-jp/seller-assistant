import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { canReturnToMobileReviewPage } from "./mobile-back-navigation";
import { mobileScreenIds } from "./mobile-screen-data";

const current = "https://komatsu-dev-jp.github.io/seller-assistant/mobile/screens/44/";
const ids = ["04", "05", "43", "44"];

describe("mobile review back arrow", () => {
  it("uses browser history with the home screen as the direct-link fallback", () => {
    const source = readFileSync(
      resolve(process.cwd(), "apps/web/src/components/approved-mobile/approved-mobile-demo.tsx"),
      "utf8",
    );
    expect(source).toContain('href="/mobile/screens/04"');
    expect(source).toContain("window.history.back()");
    for (const destination of ["04", "05", "31", "39", "44"]) {
      expect(source).toContain(`preventCurrentScreenReload(event, screen.id, "${destination}")`);
    }
    expect(source).not.toContain("getMobilePrevious(screen.id)");
  });

  it("returns to the page actually used to open a screen, not the preceding screen number", () => {
    expect(
      canReturnToMobileReviewPage(
        "https://komatsu-dev-jp.github.io/seller-assistant/mobile/screens/05/",
        current,
        ids,
      ),
    ).toBe(true);
    expect(
      canReturnToMobileReviewPage(
        "https://komatsu-dev-jp.github.io/seller-assistant/mobile/screens/",
        current,
        ids,
      ),
    ).toBe(true);
    expect(
      canReturnToMobileReviewPage(
        "https://komatsu-dev-jp.github.io/seller-assistant/mobile/app/",
        current,
        ids,
      ),
    ).toBe(true);
    expect(
      canReturnToMobileReviewPage(
        "https://komatsu-dev-jp.github.io/seller-assistant/mobile/",
        current,
        ids,
      ),
    ).toBe(true);
  });

  it("keeps direct links and outside navigation inside the review instead of leaving the app", () => {
    expect(canReturnToMobileReviewPage("", current, ids)).toBe(false);
    expect(canReturnToMobileReviewPage("https://chatgpt.com/", current, ids)).toBe(false);
    expect(
      canReturnToMobileReviewPage(
        "https://komatsu-dev-jp.github.io/other-app/mobile/screens/05/",
        current,
        ids,
      ),
    ).toBe(false);
    expect(canReturnToMobileReviewPage(current, current, ids)).toBe(false);
    expect(
      canReturnToMobileReviewPage(
        "https://komatsu-dev-jp.github.io/seller-assistant/",
        current,
        ids,
      ),
    ).toBe(false);
    expect(
      canReturnToMobileReviewPage(
        "https://komatsu-dev-jp.github.io/seller-assistant/mobile/screens/not-a-screen/",
        current,
        ids,
      ),
    ).toBe(false);
  });

  it("works for a local review without a published base path", () => {
    expect(
      canReturnToMobileReviewPage(
        "http://localhost:3000/mobile/screens/04/",
        "http://localhost:3000/mobile/screens/44/",
        ids,
      ),
    ).toBe(true);
  });

  it.each(mobileScreenIds)("accepts %s as the actual prior page in the 75-screen review", (id) => {
    const destination = id === "44" ? "05" : "44";
    expect(
      canReturnToMobileReviewPage(
        `https://komatsu-dev-jp.github.io/seller-assistant/mobile/screens/${id}/`,
        `https://komatsu-dev-jp.github.io/seller-assistant/mobile/screens/${destination}/`,
        mobileScreenIds,
      ),
    ).toBe(true);
  });
});
