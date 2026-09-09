import { describe, expect, it } from "vitest";

import {
  getMobileFooterSection,
  getMobileLiveRoute,
  getMobileScreen,
  isP1MobileReviewScreen,
} from "./mobile-screen-data";

function requiredScreen(id: string) {
  const screen = getMobileScreen(id);
  if (!screen) throw new Error(`missing mobile screen ${id}`);
  return screen;
}

describe("approved mobile screen navigation", () => {
  it.each([
    ["04", "home"],
    ["07", "product"],
    ["12", "inventory"],
    ["18", "work"],
    ["31", "product"],
    ["35", "work"],
    ["39", "inventory"],
    ["43", "accounting"],
    ["photo-01", "product"],
    ["box-01", "product"],
    ["sales-01", "product"],
    ["genre-suit-01", "work"],
  ] as const)("maps %s to the %s footer section", (id, expected) => {
    expect(getMobileFooterSection(requiredScreen(id))).toBe(expected);
  });

  it("marks future photo, wholesale-box, and sales support screens as P1 previews", () => {
    expect(isP1MobileReviewScreen(requiredScreen("photo-01"))).toBe(true);
    expect(isP1MobileReviewScreen(requiredScreen("box-01"))).toBe(true);
    expect(isP1MobileReviewScreen(requiredScreen("sales-01"))).toBe(true);
    expect(isP1MobileReviewScreen(requiredScreen("04"))).toBe(false);
    expect(isP1MobileReviewScreen(requiredScreen("genre-suit-01"))).toBe(false);
  });

  it("maps every P0 review screen to an authenticated live route", () => {
    for (const id of [
      ...Array.from({ length: 49 }, (_, index) => String(index + 1).padStart(2, "0")),
      ...Array.from(
        { length: 6 },
        (_, index) => `genre-suit-${String(index + 1).padStart(2, "0")}`,
      ),
    ]) {
      expect(getMobileLiveRoute(requiredScreen(id)), id).toMatch(
        /^\/(?:login|team|workflow|shipping|inventory\/stocktake|mobile\/scan|accounting)?$/u,
      );
    }
  });

  it.each([
    ["01", "/login"],
    ["02", "/team"],
    ["04", "/"],
    ["07", "/workflow"],
    ["11", "/workflow"],
    ["12", "/mobile/scan"],
    ["15", "/workflow"],
    ["34", "/shipping"],
    ["38", "/shipping"],
    ["39", "/inventory/stocktake"],
    ["42", "/inventory/stocktake"],
    ["43", "/accounting"],
    ["49", "/accounting"],
    ["genre-suit-01", "/workflow"],
  ] as const)("maps the %s workflow meaning to %s", (id, expected) => {
    expect(getMobileLiveRoute(requiredScreen(id))).toBe(expected);
  });

  it.each(["photo-01", "box-01", "sales-01"])(
    "does not present the %s P1 preview as a live feature",
    (id) => {
      expect(getMobileLiveRoute(requiredScreen(id))).toBeNull();
    },
  );

  it("classifies screen 43 as the first accounting screen", () => {
    expect(requiredScreen("42").group).toBe("在庫確認");
    expect(requiredScreen("43").group).toBe("会計");
    expect(requiredScreen("43").source).toBe("mobile-ios-redesign-b-board-09-accounting-v1.png");
  });
});
