import { describe, expect, it } from "vitest";

import { getApprovedPcLiveRoute, isP1ApprovedPcScreen } from "./approved-screen-scope";

describe("approved PC preview scope", () => {
  it.each([6, 7, 8, 18, 19, 25, 26, 27, 28, 41, 42, 43, 44, 49, 50, 51, 52])(
    "marks PC%02i as a P1 preview",
    (screen) => {
      expect(isP1ApprovedPcScreen(screen)).toBe(true);
    },
  );

  it.each([1, 5, 9, 17, 20, 24, 29, 33, 40, 45, 48])(
    "keeps PC%02i in the P0 review set",
    (screen) => {
      expect(isP1ApprovedPcScreen(screen)).toBe(false);
    },
  );

  it("maps every P0 review screen to a live route and keeps P1 previews disconnected", () => {
    for (let screen = 1; screen <= 52; screen += 1) {
      if (isP1ApprovedPcScreen(screen)) {
        expect(getApprovedPcLiveRoute(screen), `PC${screen}`).toBeNull();
      } else {
        expect(getApprovedPcLiveRoute(screen), `PC${screen}`).toMatch(/^\//u);
      }
    }
  });
});
