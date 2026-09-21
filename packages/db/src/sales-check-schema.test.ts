import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const sql = readFileSync(
  new URL("../migrations/0048_sales_check_observation.sql", import.meta.url),
  "utf8",
);
describe("sales check schema", () => {
  it("binds SKU, published personal Mercari page and member to the workspace", () => {
    expect(sql).toContain("references product_sku(workspace_id, id)");
    expect(sql).toContain(
      "references published_product_page(workspace_id, sku_id, sales_channel_key)",
    );
    expect(sql).toContain("references workspace_membership(workspace_id, identity_id)");
    expect(sql).toContain("sales_channel_key = 'mercari'");
  });
  it("forces RLS, key uniqueness, nullable nonnegative integers and immutability", () => {
    for (const field of [
      "listing_days",
      "current_price_yen",
      "view_count",
      "search_count",
      "like_count",
      "price_reduction_request_count",
    ]) {
      expect(sql).toContain(`${field} integer check (${field} >= 0)`);
    }
    expect(sql).toContain("force row level security");
    expect(sql).toContain("unique (workspace_id, idempotency_key)");
    expect(sql).toContain("before update or delete on sales_check_observation");
    expect(sql).toContain("grant select, insert on sales_check_observation");
    expect(sql).not.toMatch(
      /grant[^;]*(?:update|delete)|update\s+(?:sales_order|inventory_unit)|alter table\s+(?:sales_order|inventory_unit)/iu,
    );
  });
});
