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
const workAssignmentMigrationPath = fileURLToPath(
  new URL("../migrations/0009_work_assignment.sql", import.meta.url),
);
const workAssignmentSql = readFileSync(workAssignmentMigrationPath, "utf8");
const locationPhotoReviewMigrationPath = fileURLToPath(
  new URL("../migrations/0010_location_photo_review.sql", import.meta.url),
);
const locationPhotoReviewSql = readFileSync(locationPhotoReviewMigrationPath, "utf8");
const skuWorkAssignmentMigrationPath = fileURLToPath(
  new URL("../migrations/0011_sku_work_assignment.sql", import.meta.url),
);
const skuWorkAssignmentSql = readFileSync(skuWorkAssignmentMigrationPath, "utf8");
const orderAccountingMigrationPath = fileURLToPath(
  new URL("../migrations/0012_order_accounting_return.sql", import.meta.url),
);
const orderAccountingSql = readFileSync(orderAccountingMigrationPath, "utf8");
const purchaseEvidenceMigrationPath = fileURLToPath(
  new URL("../migrations/0013_purchase_evidence.sql", import.meta.url),
);
const purchaseEvidenceSql = readFileSync(purchaseEvidenceMigrationPath, "utf8");
const auditContextMigrationPath = fileURLToPath(
  new URL("../migrations/0014_audit_context.sql", import.meta.url),
);
const auditContextSql = readFileSync(auditContextMigrationPath, "utf8");
const shippingAssignmentMigrationPath = fileURLToPath(
  new URL("../migrations/0015_shipping_assignment_checked_codes.sql", import.meta.url),
);
const shippingAssignmentSql = readFileSync(shippingAssignmentMigrationPath, "utf8");
const teamAssignmentMigrationPath = fileURLToPath(
  new URL("../migrations/0016_team_assignment_management.sql", import.meta.url),
);
const teamAssignmentSql = readFileSync(teamAssignmentMigrationPath, "utf8");
const researchMigrationPath = fileURLToPath(
  new URL("../migrations/0017_capture_research_candidates.sql", import.meta.url),
);
const researchSql = readFileSync(researchMigrationPath, "utf8");
const stocktakeSnapshotMigrationPath = fileURLToPath(
  new URL("../migrations/0018_stocktake_snapshot.sql", import.meta.url),
);
const stocktakeSnapshotSql = readFileSync(stocktakeSnapshotMigrationPath, "utf8");
const postStartMovementMigrationPath = fileURLToPath(
  new URL("../migrations/0019_stocktake_post_start_movement.sql", import.meta.url),
);
const postStartMovementSql = readFileSync(postStartMovementMigrationPath, "utf8");
const observationCompletenessMigrationPath = fileURLToPath(
  new URL("../migrations/0020_stocktake_observation_completeness.sql", import.meta.url),
);
const observationCompletenessSql = readFileSync(observationCompletenessMigrationPath, "utf8");

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

  it("requires checked manual codes and order-scoped shipping assignments", () => {
    expect(shippingAssignmentSql).toContain("app_has_valid_code_check_digit");
    expect(shippingAssignmentSql).toContain("create table order_assignment");
    expect(shippingAssignmentSql).toContain("enable row level security");
    expect(shippingAssignmentSql).toContain("expires_at <= starts_at + interval '24 hours'");
    expect(shippingAssignmentSql).toContain("order_assignment_no_overlap");
    expect(shippingAssignmentSql).toContain("tstzrange(starts_at, expires_at, '[)') with &&");
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

  it("limits field work by location branch, operation and time", () => {
    expect(workAssignmentSql).toContain("create table work_assignment");
    expect(workAssignmentSql).toContain("location_root_id uuid not null");
    expect(workAssignmentSql).toContain("expires_at > starts_at");
    expect(workAssignmentSql).toContain("create policy workspace_isolation on work_assignment");
    expect(workAssignmentSql).toContain("create or replace function has_active_work_assignment");
    expect(workAssignmentSql).toContain("assignment.starts_at <= requested_at");
    expect(workAssignmentSql).toContain("assignment.expires_at > requested_at");
    expect(workAssignmentSql).toContain("assignment.revoked_at is null");
    expect(workAssignmentSql).toContain("grant select on work_assignment to resale_app_runtime");
  });

  it("keeps location originals immutable and display derivatives separately approved", () => {
    expect(locationPhotoReviewSql).toContain("original_sha256 text not null");
    expect(locationPhotoReviewSql).toContain("location-originals/%");
    expect(locationPhotoReviewSql).toContain("location-display/%");
    expect(locationPhotoReviewSql).toContain("gps_exif_count = 0");
    expect(locationPhotoReviewSql).toContain("reviewed_by <> captured_by");
    expect(locationPhotoReviewSql).toContain("location_photo_original_immutable");
    expect(locationPhotoReviewSql).toContain("location photo original metadata is immutable");
  });

  it("limits field capture by SKU, operation and time", () => {
    expect(skuWorkAssignmentSql).toContain("create table sku_work_assignment");
    expect(skuWorkAssignmentSql).toContain("sku_id uuid not null");
    expect(skuWorkAssignmentSql).toContain("operation in ('capture')");
    expect(skuWorkAssignmentSql).toContain(
      "create policy workspace_isolation on sku_work_assignment",
    );
    expect(skuWorkAssignmentSql).toContain(
      "create or replace function has_active_sku_work_assignment",
    );
    expect(skuWorkAssignmentSql).toContain("assignment.starts_at <= requested_at");
    expect(skuWorkAssignmentSql).toContain("assignment.expires_at > requested_at");
    expect(skuWorkAssignmentSql).toContain("assignment.revoked_at is null");
    expect(skuWorkAssignmentSql).toContain(
      "grant select on sku_work_assignment to resale_app_runtime",
    );
  });

  it("encrypts addresses and limits each viewing lease to five minutes", () => {
    expect(orderAccountingSql).toContain("create table order_private_address");
    expect(orderAccountingSql).toContain("ciphertext bytea not null");
    expect(orderAccountingSql).not.toContain("shipping_address text");
    expect(orderAccountingSql).toContain("create table address_access_lease");
    expect(orderAccountingSql).toContain("expires_at <= issued_at + interval '5 minutes'");
  });

  it("stores idempotent order operations, accounting evidence and return inspection", () => {
    expect(orderAccountingSql).toContain("create table order_operation_record");
    expect(orderAccountingSql).toContain("primary key (workspace_id, operation, idempotency_key)");
    expect(orderAccountingSql).toContain("create table accounting_export");
    expect(orderAccountingSql).toContain("csv_sha256");
    expect(orderAccountingSql).toContain("create table return_inspection");
    expect(orderAccountingSql).toContain("return quarantine requires shipped inventory");
    expect(orderAccountingSql).toContain(
      "return inspection requires quarantined inventory and returned order",
    );
    expect(orderAccountingSql.match(/force row level security/g)).toHaveLength(1);
  });

  it("keeps purchase evidence and SKU cost allocation as separate workspace records", () => {
    expect(purchaseEvidenceSql).toContain("create table purchase_batch");
    expect(purchaseEvidenceSql).toContain("create table receipt");
    expect(purchaseEvidenceSql).toContain("create table cost_allocation");
    expect(purchaseEvidenceSql).toContain(
      "foreign key (workspace_id, receipt_id) references receipt(workspace_id, id)",
    );
    expect(purchaseEvidenceSql).toContain(
      "foreign key (workspace_id, sku_id) references product_sku(workspace_id, id)",
    );
    expect(purchaseEvidenceSql).toContain("force row level security");
  });

  it("records a stable reason and optional human approver without sensitive free text", () => {
    expect(auditContextSql).toContain("reason_code text not null");
    expect(auditContextSql).toContain("approved_by uuid references app_identity(id)");
    expect(auditContextSql).toContain("never store free-form addresses");
  });

  it("drops the legacy inventory-number constraint before upgrading populated rows", () => {
    const dropLegacyConstraintAt = shippingAssignmentSql.indexOf(
      "alter table inventory_unit drop constraint inventory_unit_inventory_number_check",
    );
    const convertExistingRowsAt = shippingAssignmentSql.indexOf("update inventory_unit");
    const addCheckedConstraintAt = shippingAssignmentSql.indexOf(
      "alter table inventory_unit add constraint inventory_unit_inventory_number_check",
    );

    expect(dropLegacyConstraintAt).toBeGreaterThan(-1);
    expect(convertExistingRowsAt).toBeGreaterThan(dropLegacyConstraintAt);
    expect(addCheckedConstraintAt).toBeGreaterThan(convertExistingRowsAt);
    expect(shippingAssignmentSql).toContain(
      "alter table inventory_label disable trigger inventory_label_target_guard",
    );
    expect(shippingAssignmentSql).toContain(
      "alter table inventory_label enable trigger inventory_label_target_guard",
    );
  });

  it("manages local members and exact 24-hour assignments without broad table grants", () => {
    expect(teamAssignmentSql).toContain("create table inventory_unit_assignment");
    expect(teamAssignmentSql).toContain("has_active_inventory_unit_assignment");
    expect(teamAssignmentSql).toContain("app_create_local_member");
    expect(teamAssignmentSql).toContain("app_create_team_assignment");
    expect(teamAssignmentSql).toContain("app_revoke_team_assignment");
    expect(teamAssignmentSql).toContain("interval '24 hours'");
    expect(teamAssignmentSql).not.toMatch(/grant\s+(insert|update).*auth_credential/iu);
  });

  it("stores OCR and market observations only as human-reviewed candidates", () => {
    expect(researchSql).toContain("create table product_identity_candidate");
    expect(researchSql).toContain("source_text_sha256");
    expect(researchSql).not.toContain("raw_ocr_text");
    expect(researchSql).toContain("create table marketplace_reference");
    expect(researchSql).toContain("source_url ~ '^https://'");
    expect(researchSql).toContain("status in ('candidate','human_confirmed','rejected')");
    expect(researchSql.match(/force row level security/g)).toHaveLength(2);
  });

  it("freezes the expected inventory set when a stocktake starts", () => {
    expect(stocktakeSnapshotSql).toContain("create table count_session_inventory_snapshot");
    expect(stocktakeSnapshotSql).toContain("expected_location_id uuid not null");
    expect(stocktakeSnapshotSql).toContain("inventory_number text not null");
    expect(stocktakeSnapshotSql).toContain(
      "create policy workspace_isolation on count_session_inventory_snapshot",
    );
    expect(stocktakeSnapshotSql).toContain(
      "grant select, insert on count_session_inventory_snapshot to resale_app_runtime",
    );
    expect(stocktakeSnapshotSql).toContain("force row level security");
  });

  it("separates normal post-start movement from stocktake missing candidates", () => {
    expect(postStartMovementSql).toContain("create table count_session_post_start_movement");
    expect(postStartMovementSql).toContain("current_movement_seq > snapshot_movement_seq");
    expect(postStartMovementSql).toContain(
      "create policy workspace_isolation on count_session_post_start_movement",
    );
    expect(postStartMovementSql).toContain(
      "grant select, insert on count_session_post_start_movement to resale_app_runtime",
    );
    expect(postStartMovementSql).toContain("force row level security");
  });

  it("retains readable, duplicate, unknown and unreadable stocktake evidence", () => {
    expect(observationCompletenessSql).toContain("add column observed_code text");
    expect(observationCompletenessSql).toContain("add column read_failure_reason text");
    expect(observationCompletenessSql).toContain("result = 'unreadable'");
    for (const reason of ["camera_blur", "damaged_label", "no_label", "manual_unreadable"]) {
      expect(observationCompletenessSql).toContain(`'${reason}'`);
    }
    expect(observationCompletenessSql).not.toContain("free_text");
  });
});
