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
const pilotMigrationPath = fileURLToPath(
  new URL("../migrations/0023_listing_prep_pilot.sql", import.meta.url),
);
const pilotSql = readFileSync(pilotMigrationPath, "utf8");
const restorePilotEventsMigrationPath = fileURLToPath(
  new URL("../migrations/0024_restore_location_owner_pulse.sql", import.meta.url),
);
const restorePilotEventsSql = readFileSync(restorePilotEventsMigrationPath, "utf8");
const latePilotReconciliationMigrationPath = fileURLToPath(
  new URL("../migrations/0025_pilot_late_exception_reconciliation.sql", import.meta.url),
);
const latePilotReconciliationSql = readFileSync(latePilotReconciliationMigrationPath, "utf8");
const activeLatePilotReconciliationMigrationPath = fileURLToPath(
  new URL("../migrations/0026_pilot_active_late_exception_reconciliation.sql", import.meta.url),
);
const activeLatePilotReconciliationSql = readFileSync(
  activeLatePilotReconciliationMigrationPath,
  "utf8",
);
const modeAwareStocktakeApprovalMigrationPath = fileURLToPath(
  new URL("../migrations/0027_mode_aware_stocktake_approval.sql", import.meta.url),
);
const modeAwareStocktakeApprovalSql = readFileSync(modeAwareStocktakeApprovalMigrationPath, "utf8");
const completeStocktakeApprovalMigrationPath = fileURLToPath(
  new URL("../migrations/0028_complete_stocktake_approval.sql", import.meta.url),
);
const completeStocktakeApprovalSql = readFileSync(completeStocktakeApprovalMigrationPath, "utf8");
const safeAccountMappingReplacementMigrationPath = fileURLToPath(
  new URL("../migrations/0029_safe_account_mapping_replacement.sql", import.meta.url),
);
const safeAccountMappingReplacementSql = readFileSync(
  safeAccountMappingReplacementMigrationPath,
  "utf8",
);
const sameLocationRestoreMigrationPath = fileURLToPath(
  new URL("../migrations/0030_same_location_discrepancy_restore.sql", import.meta.url),
);
const sameLocationRestoreSql = readFileSync(sameLocationRestoreMigrationPath, "utf8");
const restoreActorMovementSnapshotMigrationPath = fileURLToPath(
  new URL("../migrations/0031_restore_actor_and_movement_snapshot.sql", import.meta.url),
);
const restoreActorMovementSnapshotSql = readFileSync(
  restoreActorMovementSnapshotMigrationPath,
  "utf8",
);
const pilotMigrationVersionAlignmentPath = fileURLToPath(
  new URL("../migrations/0032_pilot_migration_version_alignment.sql", import.meta.url),
);
const pilotMigrationVersionAlignmentSql = readFileSync(pilotMigrationVersionAlignmentPath, "utf8");
const listingPrepPilotV11MigrationPath = fileURLToPath(
  new URL("../migrations/0033_listing_prep_pilot_v1_1.sql", import.meta.url),
);
const listingPrepPilotV11Sql = readFileSync(listingPrepPilotV11MigrationPath, "utf8");
const inspectionConcernMigrationPath = fileURLToPath(
  new URL("../migrations/0034_inspection_concern_contract.sql", import.meta.url),
);
const inspectionConcernSql = readFileSync(inspectionConcernMigrationPath, "utf8");

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

  it("stores an immutable, RLS-protected ten-product pilot with server timestamps", () => {
    expect(pilotSql).toContain("create table pilot_run");
    expect(pilotSql).toContain("create table pilot_item_measurement");
    expect(pilotSql).toContain("listing_prep_pilot_v1.0.0");
    expect(pilotSql).toContain("viewport = '390x844'");
    expect(pilotSql).toContain("statement_timestamp()");
    expect(pilotSql).toContain("pilot run already contains ten products");
    expect(pilotSql).toContain("completed pilot item measurements are immutable");
    expect(pilotSql).toContain("force row level security");
    expect(pilotSql).not.toMatch(/grant\s+(?:all|delete|truncate)/iu);
  });

  it("appends server-timestamped pilot events and restores inventory to the scanned location", () => {
    expect(restorePilotEventsSql).toContain("create table pilot_exception_event");
    expect(restorePilotEventsSql).toContain("pilot exception events are append-only");
    expect(restorePilotEventsSql).toContain("idempotency_key uuid not null");
    expect(restorePilotEventsSql).toContain(
      "recorded_at timestamptz not null default statement_timestamp()",
    );
    expect(restorePilotEventsSql).toContain("force row level security");
    expect(restorePilotEventsSql).toContain("'discrepancy_restore'");
    expect(restorePilotEventsSql).toContain("set location_id = new.to_location_id");
    expect(restorePilotEventsSql).not.toMatch(
      /grant\s+(?:all|update|delete|truncate).*pilot_exception/iu,
    );
  });

  it("consumes same-location restore scans without granting direct table updates", () => {
    expect(sameLocationRestoreSql).toContain(
      "create or replace function consume_discrepancy_confirmation_challenge",
    );
    expect(sameLocationRestoreSql).toContain("language plpgsql security definer");
    expect(sameLocationRestoreSql).toContain(
      "session_row.destination_location_id is not distinct from session_row.expected_location_id",
    );
    expect(sameLocationRestoreSql).toContain(
      "unit_row.location_id is distinct from session_row.destination_location_id",
    );
    expect(sameLocationRestoreSql).toContain("the same-location restore scan became stale");
    expect(sameLocationRestoreSql).toContain(
      "revoke all on function consume_discrepancy_confirmation_challenge",
    );
    expect(sameLocationRestoreSql).toContain(
      "grant execute on function consume_discrepancy_confirmation_challenge",
    );
    expect(sameLocationRestoreSql).not.toMatch(/grant\s+update\s+on\s+scan_session/iu);
  });

  it("rechecks the authenticated restore actor and an immutable movement snapshot", () => {
    expect(restoreActorMovementSnapshotSql).toContain(
      "add column inventory_movement_seq_snapshot bigint",
    );
    expect(restoreActorMovementSnapshotSql).toContain(
      "new.inventory_movement_seq_snapshot := unit_row.movement_seq",
    );
    expect(restoreActorMovementSnapshotSql).toContain(
      "target_actor_id is distinct from public.app_identity_id()",
    );
    expect(restoreActorMovementSnapshotSql).toContain(
      "membership_row.role not in ('owner', 'inventory_manager')",
    );
    expect(restoreActorMovementSnapshotSql).toContain("for update");
    expect(restoreActorMovementSnapshotSql).toContain("discrepancy_row.state <> expected_state");
    expect(restoreActorMovementSnapshotSql).toContain(
      "unit_row.movement_seq is distinct from session_row.inventory_movement_seq_snapshot",
    );
    expect(restoreActorMovementSnapshotSql).toContain("destination_row.state <> 'active'");
    expect(restoreActorMovementSnapshotSql).toContain("not destination_row.can_store_inventory");
    expect(restoreActorMovementSnapshotSql).toContain(
      "the legacy discrepancy scan must be reissued",
    );
    expect(restoreActorMovementSnapshotSql).toContain("trusted-server boundary");
    expect(restoreActorMovementSnapshotSql).not.toMatch(/grant\s+update\s+on\s+scan_session/iu);
  });

  it("records the current pilot schema without rewriting historical run evidence", () => {
    expect(pilotMigrationVersionAlignmentSql).toContain(
      "alter table pilot_run drop constraint pilot_run_migration_version_check",
    );
    expect(pilotMigrationVersionAlignmentSql).toContain(
      "'0023', '0024', '0025', '0026', '0027', '0028', '0029', '0030', '0031', '0032'",
    );
    expect(pilotMigrationVersionAlignmentSql).not.toMatch(/update\s+pilot_run/iu);
    expect(pilotMigrationVersionAlignmentSql).not.toMatch(/delete\s+from\s+pilot_run/iu);
    expect(pilotMigrationVersionAlignmentSql).not.toContain("not valid");
  });

  it("adds v1.1 manifest and category-template evidence without rewriting v1.0 history", () => {
    expect(listingPrepPilotV11Sql).toContain("listing_prep_pilot_v1.0.0");
    expect(listingPrepPilotV11Sql).toContain("listing_prep_pilot_v1.1.0");
    expect(listingPrepPilotV11Sql).toContain("fixture_manifest_sha256 char(64)");
    expect(listingPrepPilotV11Sql).toContain("migration_version = '0033'");
    expect(listingPrepPilotV11Sql).toContain("migration_version <> '0033'");
    expect(listingPrepPilotV11Sql).toContain("measurement_template_id text");
    expect(listingPrepPilotV11Sql).toContain("create table product_measurement_profile");
    expect(listingPrepPilotV11Sql).toContain("product measurement profiles are immutable");
    expect(listingPrepPilotV11Sql).toContain("create table product_attribute_confirmation");
    expect(listingPrepPilotV11Sql).toContain("product attribute confirmations are append-only");
    expect(listingPrepPilotV11Sql).toContain("add column color_candidate text");
    expect(listingPrepPilotV11Sql).toContain("same-SKU brand-tag or care-label evidence");
    expect(listingPrepPilotV11Sql).toContain("candidate_source_asset_id uuid");
    expect(listingPrepPilotV11Sql).not.toMatch(/^\s+source_asset_id uuid;$/mu);
    expect(listingPrepPilotV11Sql.match(/force row level security/g)).toHaveLength(2);
    expect(listingPrepPilotV11Sql).toContain(
      "grant select, insert on product_measurement_profile, product_attribute_confirmation",
    );
    expect(listingPrepPilotV11Sql).not.toMatch(/update\s+pilot_run/iu);
    expect(listingPrepPilotV11Sql).not.toMatch(/update\s+pilot_item_measurement/iu);
    expect(listingPrepPilotV11Sql).not.toMatch(/delete\s+from/iu);
  });

  it("retains the late-event exception while making v1.1 evidence immutable", () => {
    expect(listingPrepPilotV11Sql).toContain(
      "old.fixture_manifest_sha256 is distinct from new.fixture_manifest_sha256",
    );
    expect(listingPrepPilotV11Sql).toContain(
      "old.measurement_template_id is distinct from new.measurement_template_id",
    );
    expect(listingPrepPilotV11Sql).toContain("old.state = 'completed'");
    expect(listingPrepPilotV11Sql).toContain("and new.state = 'failed'");
    expect(listingPrepPilotV11Sql).toContain(
      "finished pilot runs are immutable except for late exception invalidation",
    );
  });

  it("reconciles queued safety exceptions without leaving a false pilot pass", () => {
    expect(latePilotReconciliationSql).toContain("late pilot exception requires");
    expect(latePilotReconciliationSql).toContain("latest_incomplete_item_id");
    expect(latePilotReconciliationSql).toContain("latest_completed_item_id");
    expect(latePilotReconciliationSql).toContain("new.state = 'failed'");
    expect(latePilotReconciliationSql).toContain(
      "finished pilot runs are immutable except for late exception invalidation",
    );
  });

  it("accepts a lost-response event for only the latest eligible pilot item", () => {
    expect(activeLatePilotReconciliationSql).toContain(
      "migration_version in ('0023', '0024', '0025', '0026')",
    );
    expect(activeLatePilotReconciliationSql).toContain("latest_incomplete_item_id");
    expect(activeLatePilotReconciliationSql).toContain("latest_completed_item_id");
    expect(activeLatePilotReconciliationSql).toContain(
      "pilot exception requires the latest incomplete item",
    );
    expect(activeLatePilotReconciliationSql).toContain(
      "late pilot exception requires the latest completed item",
    );
    expect(activeLatePilotReconciliationSql).toContain(
      "pilot exception requires the original run actor",
    );
    expect(activeLatePilotReconciliationSql).toContain(
      "pilot exception item must belong to the run",
    );
    expect(activeLatePilotReconciliationSql).toContain("active run after a lost response");
    expect(activeLatePilotReconciliationSql).not.toContain("if run_row.state = 'active'");
  });

  it("enforces the stocktake approval actor from the server-selected mode", () => {
    const legacyRepairAt = modeAwareStocktakeApprovalSql.indexOf("update count_session");
    const namedConstraintAt = modeAwareStocktakeApprovalSql.indexOf(
      "add constraint count_session_approval_actor_mode_check",
    );
    const disableLegacyGuardAt = modeAwareStocktakeApprovalSql.indexOf(
      "disable trigger inventory_discrepancy_transition_guard",
    );
    const synchronizeDiscrepancyAt = modeAwareStocktakeApprovalSql.indexOf(
      "update inventory_discrepancy discrepancy",
    );
    const enableLegacyGuardAt = modeAwareStocktakeApprovalSql.indexOf(
      "enable trigger inventory_discrepancy_transition_guard",
    );

    expect(disableLegacyGuardAt).toBeGreaterThan(-1);
    expect(synchronizeDiscrepancyAt).toBeGreaterThan(disableLegacyGuardAt);
    expect(enableLegacyGuardAt).toBeGreaterThan(synchronizeDiscrepancyAt);
    expect(legacyRepairAt).toBeGreaterThan(enableLegacyGuardAt);
    expect(legacyRepairAt).toBeGreaterThan(-1);
    expect(namedConstraintAt).toBeGreaterThan(legacyRepairAt);
    expect(modeAwareStocktakeApprovalSql).toMatch(
      /The two distinct\s+-- stored actor IDs prove a minimum historical actor count of two/u,
    );
    expect(modeAwareStocktakeApprovalSql).toContain(
      "active_member_count = greatest(active_member_count, 2)",
    );
    expect(modeAwareStocktakeApprovalSql).not.toMatch(/set\s+approved_by/iu);
    expect(modeAwareStocktakeApprovalSql).not.toMatch(/set\s+approved_at/iu);
    expect(modeAwareStocktakeApprovalSql).not.toMatch(/update\s+audit_event/iu);
    expect(modeAwareStocktakeApprovalSql).not.toContain("session_replication_role");
    expect(modeAwareStocktakeApprovalSql).not.toMatch(
      /set\s+(?:state|evidence_media_id|confirmation_scan_session_id|reconfirmer_id|approver_id|confirmed_at|restored_at)/iu,
    );
    expect(modeAwareStocktakeApprovalSql).toContain(
      "pg_get_expr(constraint_row.conbin, constraint_row.conrelid)",
    );
    expect(modeAwareStocktakeApprovalSql).toContain(
      "approved_byisnullorapproved_by<>initial_counter_id",
    );
    expect(modeAwareStocktakeApprovalSql).toContain("matched_constraint_count <> 1");
    expect(modeAwareStocktakeApprovalSql).toContain(
      "expected exactly one legacy count_session approval actor constraint",
    );
    expect(modeAwareStocktakeApprovalSql).not.toContain(
      "drop constraint count_session_state_check",
    );
    expect(modeAwareStocktakeApprovalSql).not.toContain(
      "drop constraint count_session_membership_snapshot_check",
    );
    expect(modeAwareStocktakeApprovalSql).toContain(
      "confirmation_mode = 'solo_reversible' and approved_by = initial_counter_id",
    );
    expect(modeAwareStocktakeApprovalSql).toContain(
      "confirmation_mode = 'dual_actor' and approved_by <> initial_counter_id",
    );
    expect(modeAwareStocktakeApprovalSql).not.toContain("not valid");
    expect(modeAwareStocktakeApprovalSql).toContain(
      "migration_version in ('0023', '0024', '0025', '0026', '0027')",
    );
  });

  it("requires complete approval metadata only in the approved state", () => {
    const compatibilityCheckAt = completeStocktakeApprovalSql.indexOf(
      "count_session approval state contains incomplete historical metadata",
    );
    const definitionMatchAt = completeStocktakeApprovalSql.indexOf(
      "expected the 0027 count_session approval actor constraint",
    );
    const dropLegacyActorConstraintAt = completeStocktakeApprovalSql.indexOf(
      "drop constraint count_session_approval_actor_mode_check",
    );
    const completeConstraintAt = completeStocktakeApprovalSql.indexOf(
      "add constraint count_session_approval_state_actor_check",
    );

    expect(compatibilityCheckAt).toBeGreaterThan(-1);
    expect(definitionMatchAt).toBeGreaterThan(compatibilityCheckAt);
    expect(dropLegacyActorConstraintAt).toBeGreaterThan(definitionMatchAt);
    expect(completeConstraintAt).toBeGreaterThan(dropLegacyActorConstraintAt);
    expect(completeStocktakeApprovalSql).toContain(
      "constraint_row.conname = 'count_session_approval_actor_mode_check'",
    );
    expect(completeStocktakeApprovalSql).toContain("approved_byisnull");
    expect(completeStocktakeApprovalSql).toContain("approved_by=initial_counter_id");
    expect(completeStocktakeApprovalSql).toContain("approved_by<>initial_counter_id");
    expect(completeStocktakeApprovalSql).toContain("state = 'approved'");
    expect(completeStocktakeApprovalSql).toContain("approved_by is not null");
    expect(completeStocktakeApprovalSql).toContain("approved_at is not null");
    expect(completeStocktakeApprovalSql).toContain(
      "state <> 'approved' and approved_by is null and approved_at is null",
    );
    expect(completeStocktakeApprovalSql).not.toContain("drop constraint count_session_state_check");
    expect(completeStocktakeApprovalSql).not.toContain(
      "drop constraint count_session_confirmation_mode_check",
    );
    expect(completeStocktakeApprovalSql).not.toContain(
      "drop constraint count_session_membership_snapshot_check",
    );
    expect(completeStocktakeApprovalSql).not.toContain("not valid");
    expect(completeStocktakeApprovalSql).not.toMatch(/update\s+count_session/iu);
    expect(completeStocktakeApprovalSql).toContain(
      "migration_version in ('0023', '0024', '0025', '0026', '0027', '0028')",
    );
  });

  it("replaces account mappings append-only without rewriting journal or export history", () => {
    expect(safeAccountMappingReplacementSql).toContain("replaces_rule_id uuid");
    expect(safeAccountMappingReplacementSql).toContain("change_reason_code text");
    expect(safeAccountMappingReplacementSql).toContain(
      "account mapping accounting fields are immutable; create a replacement version",
    );
    expect(safeAccountMappingReplacementSql).toContain(
      "retiring an account mapping requires an atomic active replacement",
    );
    expect(safeAccountMappingReplacementSql).toContain("deferrable initially deferred");
    expect(safeAccountMappingReplacementSql).toContain(
      "mapping.status not in ('active', 'retired')",
    );
    expect(safeAccountMappingReplacementSql).toContain(
      "tstzrange(existing.effective_from, existing.effective_until, '[)')",
    );
    expect(safeAccountMappingReplacementSql).toContain("new.created_by <> app_identity_id()");
    expect(safeAccountMappingReplacementSql).toContain(
      "new.approved_by is distinct from app_identity_id()",
    );
    expect(safeAccountMappingReplacementSql).toContain(
      "membership.role in ('owner', 'accounting')",
    );
    expect(safeAccountMappingReplacementSql).toContain(
      "an initial approved mapping must be active, open-ended, and approved by the session actor",
    );
    expect(safeAccountMappingReplacementSql).toContain("event.occurred_at >= new.effective_until");
    expect(safeAccountMappingReplacementSql).toContain("or mapping.approved_at is null");
    expect(safeAccountMappingReplacementSql).not.toMatch(/update\s+journal_candidate/iu);
    expect(safeAccountMappingReplacementSql).not.toMatch(/update\s+export_batch/iu);
    expect(safeAccountMappingReplacementSql).not.toMatch(/delete\s+from/iu);
    expect(safeAccountMappingReplacementSql).not.toMatch(/update\s+audit_event/iu);
  });

  it("adds append-only inspection check and concern revisions without rewriting history", () => {
    expect(inspectionConcernSql).toContain("create table inspection_check_result");
    expect(inspectionConcernSql).toContain("create table inspection_concern_revision");
    expect(inspectionConcernSql).toContain("revision integer not null");
    expect(inspectionConcernSql).toContain("supersedes_id uuid");
    expect(inspectionConcernSql).toContain(
      "concern_revision_ids uuid[] not null default '{}'::uuid[]",
    );
    expect(inspectionConcernSql).toContain("inspection_check_result_one_successor");
    expect(inspectionConcernSql).toContain("inspection_concern_one_successor");
    expect(inspectionConcernSql).toContain(
      "inspection history is append-only; create a successor revision",
    );
    expect(inspectionConcernSql).toContain("before update or delete on inspection_check_result");
    expect(inspectionConcernSql).toContain(
      "before update or delete on inspection_concern_revision",
    );
    expect(inspectionConcernSql).toContain(
      "revoke update, delete on inspection_check_result, inspection_concern_revision",
    );
    expect(inspectionConcernSql).not.toMatch(
      /update\s+(?:media_asset|pilot_run|pilot_item_measurement)/iu,
    );
    expect(inspectionConcernSql).not.toMatch(/delete\s+from/iu);
  });

  it("stores normalized concern markers and requires same-SKU visual evidence", () => {
    expect(inspectionConcernSql).toContain(
      "marker_x numeric(7,6) check (marker_x between 0 and 1)",
    );
    expect(inspectionConcernSql).toContain(
      "marker_y numeric(7,6) check (marker_y between 0 and 1)",
    );
    expect(inspectionConcernSql).toContain("references media_asset(workspace_id, sku_id, id)");
    expect(inspectionConcernSql).toContain("concern_type = 'odor'");
    expect(inspectionConcernSql).toContain(
      "marker_source_asset_id is not null and context_evidence_asset_id is not null",
    );
    expect(inspectionConcernSql).toContain("concern_type = 'odor' and memo is not null");
    expect(inspectionConcernSql).toContain("memo = btrim(memo)");
    expect(inspectionConcernSql).toContain("check (concern_type <> 'odor' or memo is not null)");
  });

  it("requires a separate prior-revision reviewer and an actor-bound inspection assignment", () => {
    expect(inspectionConcernSql).toContain(
      "create or replace function can_actor_access_inspection_sku(\n  requested_sku_id uuid\n)",
    );
    expect(inspectionConcernSql).toContain("public.app_workspace_id() as workspace_id");
    expect(inspectionConcernSql).toContain("public.app_identity_id() as identity_id");
    expect(inspectionConcernSql).toContain("statement_timestamp() as checked_at");
    expect(inspectionConcernSql).toContain("from public.product_sku sku");
    expect(inspectionConcernSql).toContain("sku.workspace_id = context.workspace_id");
    expect(inspectionConcernSql).toContain("membership.role in ('owner', 'inventory_manager')");
    expect(inspectionConcernSql).toContain("membership.role = 'field_worker'");
    expect(inspectionConcernSql).toContain("public.has_active_sku_work_assignment");
    expect(inspectionConcernSql).toContain("new.confirmed_by is distinct from actor_id");
    expect(inspectionConcernSql).toContain("actor_id = prior.recorded_by");
    expect(inspectionConcernSql).toContain("new.reviewed_by is distinct from actor_id");
    expect(inspectionConcernSql).toContain(
      "a concern reviewer must differ from the prior revision recorder",
    );
    expect(inspectionConcernSql).toContain(
      "a confirmed inspection check must directly supersede an unconfirmed revision",
    );
    expect(inspectionConcernSql).toContain(
      "a concern review must directly supersede a pending-review revision",
    );
    expect(inspectionConcernSql).toContain(
      "a concern review cannot change the submitted concern content",
    );
    expect(inspectionConcernSql).toContain(
      "a human-dismissed concern chain is terminal and cannot be reopened",
    );
    for (const immutableField of [
      "new.item_location is distinct from prior.item_location",
      "new.concern_type is distinct from prior.concern_type",
      "new.severity is distinct from prior.severity",
      "new.marker_source_asset_id is distinct from prior.marker_source_asset_id",
      "new.marker_x is distinct from prior.marker_x",
      "new.marker_y is distinct from prior.marker_y",
      "new.context_evidence_asset_id is distinct from prior.context_evidence_asset_id",
      "new.detail_evidence_asset_id is distinct from prior.detail_evidence_asset_id",
      "new.memo is distinct from prior.memo",
    ]) {
      expect(inspectionConcernSql).toContain(immutableField);
    }
    for (const chainField of [
      "prior.concern_id is distinct from new.concern_id",
      "prior.sku_id is distinct from new.sku_id",
      "prior.inspection_item_key is distinct from new.inspection_item_key",
      "prior.product_category is distinct from new.product_category",
      "prior.definition_version is distinct from new.definition_version",
    ]) {
      expect(inspectionConcernSql).toContain(chainField);
    }
  });

  it("binds concern-present checks to exact same-context confirmed concern revisions", () => {
    expect(inspectionConcernSql).toContain("cardinality(concern_revision_ids) between 1 and 20");
    expect(inspectionConcernSql).toContain("count(distinct concern_revision_id)");
    expect(inspectionConcernSql).toContain("concern.review_state = 'human_confirmed'");
    expect(inspectionConcernSql).toContain("concern.id = any(latest_check.concern_revision_ids)");
    expect(inspectionConcernSql).toContain(
      "concern.inspection_item_key = latest_check.inspection_item_key",
    );
    expect(inspectionConcernSql).toContain(
      "concern-present checks must reference the exact complete set of latest human-confirmed concern revisions",
    );
    expect(inspectionConcernSql).toContain(
      "no-issue confirmation requires every latest concern revision to be human-dismissed",
    );
    expect(inspectionConcernSql).toContain("where concern.review_state <> 'human_dismissed'");
    expect(inspectionConcernSql).toContain("where concern.review_state = 'human_dismissed'");
    expect(inspectionConcernSql).toContain(
      "'draft', 'pending_review', 'human_confirmed', 'changes_requested', 'human_dismissed'",
    );
    expect(inspectionConcernSql).toContain(
      "an active inspection concern requires a latest inspection check revision",
    );
    expect(inspectionConcernSql).toContain("if latest_check.status = 'unconfirmed' then");
    expect(inspectionConcernSql.match(/create constraint trigger inspection_/g)).toHaveLength(2);
    expect(
      inspectionConcernSql.match(/deferrable initially deferred/g)?.length,
    ).toBeGreaterThanOrEqual(4);
    expect(inspectionConcernSql).toContain(
      "for each row execute function validate_inspection_context_current_state()",
    );
    expect(inspectionConcernSql).toContain("for update");
  });

  it("forces RLS and grants no destructive inspection privileges", () => {
    expect(inspectionConcernSql.match(/force row level security/g)).toHaveLength(2);
    expect(inspectionConcernSql).toContain(
      "create policy inspection_check_result_actor_access on inspection_check_result",
    );
    expect(inspectionConcernSql).toContain(
      "create policy inspection_concern_actor_access on inspection_concern_revision",
    );
    expect(inspectionConcernSql).toContain("workspace_id = app_workspace_id()");
    expect(inspectionConcernSql).toContain("can_actor_access_inspection_sku(sku_id)");
    expect(inspectionConcernSql).toContain(
      "grant execute on function can_actor_access_inspection_sku(uuid)",
    );
    expect(inspectionConcernSql).not.toMatch(
      /can_actor_access_inspection_sku\(uuid,\s*uuid,\s*uuid,\s*timestamptz\)/iu,
    );
    expect(inspectionConcernSql).not.toContain(
      "can_actor_access_inspection_sku(workspace_id, sku_id, app_identity_id())",
    );
    expect(inspectionConcernSql).toContain(
      "grant select, insert on inspection_check_result, inspection_concern_revision",
    );
    expect(inspectionConcernSql).not.toMatch(
      /grant\s+(?:all|update|delete|truncate).*inspection_/iu,
    );
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
