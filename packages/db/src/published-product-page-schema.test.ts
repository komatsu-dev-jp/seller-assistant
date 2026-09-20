import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL("../migrations/0047_published_product_page.sql", import.meta.url),
  "utf8",
);

describe("published product page migration", () => {
  it("stores one immutable human-confirmed Mercari page per SKU", () => {
    expect(sql).toContain("create table published_product_page");
    expect(sql).toContain("unique (workspace_id, sku_id, sales_channel_key)");
    expect(sql).toContain("unique (workspace_id, sales_channel_key, product_id)");
    expect(sql).toContain("product_url = 'https://jp.mercari.com/item/' || product_id");
    expect(sql).toContain("published_product_page_immutable");
    expect(sql).toContain("grant select, insert on published_product_page");
    expect(sql).not.toMatch(/grant[^;]*(?:update|delete)/iu);
  });

  it("forces tenant isolation and binds the confirming identity to the workspace", () => {
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("force row level security");
    expect(sql).toContain("workspace_id = app_workspace_id()");
    expect(sql).toContain("references workspace_membership(workspace_id, identity_id)");
  });
});
