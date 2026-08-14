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
const sessionMigrationPath = fileURLToPath(
  new URL("../migrations/0004_auth_session.sql", import.meta.url),
);
const sessionSql = readFileSync(sessionMigrationPath, "utf8");
const credentialMigrationPath = fileURLToPath(
  new URL("../migrations/0005_auth_credential.sql", import.meta.url),
);
const credentialSql = readFileSync(credentialMigrationPath, "utf8");
const runtimeRoleMigrationPath = fileURLToPath(
  new URL("../migrations/0006_runtime_role.sql", import.meta.url),
);
const runtimeRoleSql = readFileSync(runtimeRoleMigrationPath, "utf8");
const inventoryGuardsMigrationPath = fileURLToPath(
  new URL("../migrations/0007_inventory_transaction_guards.sql", import.meta.url),
);
const inventoryGuardsSql = readFileSync(inventoryGuardsMigrationPath, "utf8");
const sessionWorkspaceMigrationPath = fileURLToPath(
  new URL("../migrations/0008_session_workspace.sql", import.meta.url),
);
const sessionWorkspaceSql = readFileSync(sessionWorkspaceMigrationPath, "utf8");

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

  it("keeps a server-side session registry for expiry and logout revocation", () => {
    expect(sessionSql).toContain("create table auth_session");
    expect(sessionSql).toContain("expires_at > issued_at");
    expect(sessionSql).toContain("revoked_at is null");
    expect(sessionSql).toContain("Server-only session registry");
  });

  it("stores only strong scrypt credentials and HMAC login buckets", () => {
    expect(credentialSql).toContain("create table auth_credential");
    expect(credentialSql).toContain("hash_algorithm = 'scrypt-v1'");
    expect(credentialSql).toContain("scrypt_n = 131072");
    expect(credentialSql).toContain("octet_length(password_salt) >= 16");
    expect(credentialSql).toContain("create table auth_login_bucket");
    expect(credentialSql).not.toMatch(/plaintext_password|raw_ip/u);
  });

  it("creates a non-login capability role without superuser or RLS bypass", () => {
    expect(runtimeRoleSql).toContain("create role resale_app_runtime nologin");
    expect(runtimeRoleSql).toContain("nosuperuser");
    expect(runtimeRoleSql).toContain("nobypassrls");
    expect(runtimeRoleSql).toContain("grant select, insert on audit_event");
    expect(runtimeRoleSql).not.toContain("grant all");
  });

  it("requires scan-backed movements and two-person discrepancy resolution", () => {
    expect(inventoryGuardsSql).toContain("inventory_unit_entry_guard");
    expect(inventoryGuardsSql).toContain("inventory_label_target_guard");
    expect(inventoryGuardsSql).toContain("scan_session_guard");
    expect(inventoryGuardsSql).toContain("inventory_movement_finalize");
    expect(inventoryGuardsSql).toContain("order_allocation_state_guard");
    expect(inventoryGuardsSql).toContain(
      "initial counter and reconfirmer must be different people",
    );
    expect(inventoryGuardsSql).toContain("requester and approver must be different people");
    expect(inventoryGuardsSql).toContain("revoke update on inventory_unit, scan_session");
  });

  it("binds each signed server session to one active workspace", () => {
    expect(sessionWorkspaceSql).toContain("login_default_workspace");
    expect(sessionWorkspaceSql).toContain("security definer");
    expect(sessionWorkspaceSql).toContain("revoke all on function");
    expect(sessionWorkspaceSql).toContain("auth_session_workspace_fk");
    expect(sessionWorkspaceSql).toContain("alter column workspace_id set not null");
  });
});
