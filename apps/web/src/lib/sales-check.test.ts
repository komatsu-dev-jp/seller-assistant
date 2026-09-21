import { describe, expect, it } from "vitest";
import {
  completeSalesCheck,
  parseSalesCheckDraft,
  pendingSalesCheck,
  rememberSalesCheck,
  salesCheckDraft,
} from "./sales-check";
describe("sales check draft and retries", () => {
  it("converts only an empty field to null and preserves zero", () => {
    const draft = {
      ...salesCheckDraft(),
      currentPriceYen: "0",
      checkedOn: "2026-09-21",
      nextCheckOn: "2026-09-22",
    };
    const input = parseSalesCheckDraft(draft, "10000000-0000-4000-8000-000000000001");
    expect(input.listingDays).toBeNull();
    expect(input.currentPriceYen).toBe("0");
    expect(() =>
      parseSalesCheckDraft({ ...draft, viewCount: "1e3" }, input.idempotencyKey),
    ).toThrow();
    expect(() =>
      parseSalesCheckDraft({ ...draft, viewCount: " " }, input.idempotencyKey),
    ).toThrow();
  });
  it("retains exact payload and key independently across SKU switches and failed retries", () => {
    const input = parseSalesCheckDraft(
      { ...salesCheckDraft(), checkedOn: "2026-09-21", nextCheckOn: "2026-09-22" },
      "10000000-0000-4000-8000-000000000001",
    );
    rememberSalesCheck("/sku-a", input);
    expect(pendingSalesCheck("/sku-b")).toBeUndefined();
    expect(pendingSalesCheck("/sku-a")).toBe(input);
    completeSalesCheck("/sku-a", "another-key");
    expect(pendingSalesCheck("/sku-a")).toBe(input);
    completeSalesCheck("/sku-a", input.idempotencyKey);
    expect(pendingSalesCheck("/sku-a")).toBeUndefined();
  });
});
