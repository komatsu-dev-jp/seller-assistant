import { describe, expect, it } from "vitest";

import { filterSavedProducts, getSavedProductPageSummary } from "./saved-product-gallery";

const items = [
  { id: "1", channel: "販売先A" },
  { id: "2", channel: "販売先B" },
  { id: "3", channel: "販売先A" },
  { id: "4", channel: "販売先B" },
  { id: "5", channel: "販売先A" },
  { id: "6", channel: "販売先B" },
] as const;

describe("saved product gallery controls", () => {
  it("filters the visible fixture rows without changing their order", () => {
    expect(filterSavedProducts(items, "all").map((item) => item.id)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
    ]);
    expect(filterSavedProducts(items, "channel-a").map((item) => item.id)).toEqual(["1", "3", "5"]);
    expect(filterSavedProducts(items, "channel-b").map((item) => item.id)).toEqual(["2", "4", "6"]);
  });

  it("reports one truthful page for the six-item approved fixture", () => {
    expect(getSavedProductPageSummary(6)).toEqual({ pageCount: 1, first: 1, last: 6 });
    expect(getSavedProductPageSummary(3)).toEqual({ pageCount: 1, first: 1, last: 3 });
    expect(getSavedProductPageSummary(0)).toEqual({ pageCount: 1, first: 0, last: 0 });
  });
});
