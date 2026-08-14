import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(new URL("../migrations/0001_p0_core.sql", import.meta.url));
const sql = readFileSync(migrationPath, "utf8");
const workflowMigrationPath = fileURLToPath(
  new URL("../migrations/0002_p0_workflow.sql", import.meta.url),
);
const workflowSql = readFileSync(workflowMigrationPath, "utf8");
const captureMigrationPath = fileURLToPath(
  new URL("../migrations/0003_capture_evidence.sql", import.meta.url),
);
const captureSql = readFileSync(captureMigrationPath, "utf8");

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

  it("keeps immutable originals and human-confirmed measurements workspace-scoped", () => {
    expect(captureSql).toContain("create table media_asset");
    expect(captureSql).toContain("create table measurement_attempt");
    expect(captureSql).toContain("original_sha256 ~ '^[a-f0-9]{64}$'");
    expect(captureSql).toContain("originals/%");
    expect(captureSql).toContain("confirmed_by = measured_by");
    expect(captureSql).toContain("foreign key (workspace_id, evidence_asset_id)");
    expect(captureSql.match(/force row level security/g)).toHaveLength(2);
    expect(captureSql).toContain("workspace_id = app_workspace_id()");
  });
});
