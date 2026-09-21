import { describe, expect, it } from "vitest";

import {
  createSalesCheckDrafts,
  getSalesCheckAge,
  orderSalesCheckItems,
  SALES_CHECK_ITEMS,
  updateSalesCheckDraft,
} from "./sales-check-draft";

describe("approved PC sales check draft", () => {
  it("orders the six fixture products by the oldest human check date", () => {
    expect(orderSalesCheckItems(SALES_CHECK_ITEMS).map((item) => item.id)).toEqual([
      "ITM-0006",
      "ITM-0005",
      "ITM-0004",
      "ITM-0002",
      "ITM-0003",
      "ITM-0001",
    ]);
    expect(getSalesCheckAge("2025-05-15")).toBe("5日未確認");
    expect(getSalesCheckAge("2025-05-20")).toBe("今日確認");
    expect(getSalesCheckAge("invalid")).toBe("確認日を確認");
  });

  it("keeps edits separated by item without mutating the previous drafts", () => {
    const original = createSalesCheckDrafts(SALES_CHECK_ITEMS);
    const edited = updateSalesCheckDraft(original, "ITM-0006", "views", "999");

    expect(original["ITM-0006"]?.views).toBe("132");
    expect(edited["ITM-0006"]?.views).toBe("999");
    expect(edited["ITM-0005"]?.views).toBe("");
    expect(updateSalesCheckDraft(edited, "missing", "views", "1")).toBe(edited);
  });
});
