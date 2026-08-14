import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(new URL("../migrations/0001_p0_core.sql", import.meta.url));
const sql = readFileSync(migrationPath, "utf8");
const workflowMigrationPath = fileURLToPath(
  new URL("../migrations/0002_p0_workflow.sql", import.meta.url),
);
const workflowSql = readFileSync(workflowMigrationPath, "utf8");

describe("P0 PostgreSQL migration contract", () => {
  it("enables and forces workspace RLS for business tables", () => {
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("force row level security");
    expect(sql).toContain("workspace_id = app_workspace_id()");
  });

  it("separates SKU, inventory units, locations, scans and movements", () => {
    for (const table of [
      "product_sku",
      "inventory_unit",
      "location_node",
      "inventory_label",
      "scan_session",
      "inventory_movement",
    ]) {
      expect(sql).toContain(`create table ${table}`);
    }
    expect(sql).toContain("one_active_label_per_target");
    expect(sql).toContain("unique (workspace_id, scan_session_id)");
  });

  it("keeps allocation, refund and stocktake decisions unique", () => {
    expect(sql).toContain("one_active_order_per_inventory_unit");
    expect(sql).toContain("one_successful_reversal_per_event");
    expect(sql).toContain("reconfirmer_id <> requester_id");
    expect(sql).toContain("approver_id <> requester_id");
  });

  it("blocks sensitive audit fields at the database boundary", () => {
    for (const forbidden of ["address", "token", "cookie", "receiptBody", "aiPrompt", "secret"]) {
      expect(sql).toContain(`'${forbidden}'`);
    }
    expect(sql).toContain("redacted_changes");
  });

  it("persists ordered P0 workflow actions with evidence and idempotency", () => {
    expect(workflowSql).toContain("create table p0_workflow");
    expect(workflowSql).toContain("create table p0_workflow_action");
    expect(workflowSql).toContain("evidence_reference_ids uuid[] not null");
    expect(workflowSql).toContain("primary key (workspace_id, sku_id, idempotency_key)");
    expect(workflowSql).toContain("force row level security");
    expect(workflowSql).toContain("workspace_id = app_workspace_id()");
  });
});
