import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import postgres from "postgres";
import {
  appendCodeCheckDigit,
  listingPrepPilotFixtureManifestSha256,
  listingPrepPilotProtocolVersion,
} from "@resale/contracts";

const adminUrl = process.env.TEST_UPGRADE_DATABASE_ADMIN_URL;
if (!adminUrl) {
  throw new Error("TEST_UPGRADE_DATABASE_ADMIN_URL is required");
}

const migrationsUrl = new URL("../../../packages/db/migrations/", import.meta.url);
const migrationNames = (await readdir(migrationsUrl))
  .filter((name) => /^\d{4}_.+\.sql$/u.test(name))
  .sort();
const legacyMigrations = migrationNames.filter((name) => Number(name.slice(0, 4)) <= 14);
const upgradeMigrations = migrationNames.filter((name) => Number(name.slice(0, 4)) > 14);
assert.ok(legacyMigrations.length > 0, "Legacy migrations must be present");
assert.deepEqual(
  upgradeMigrations.slice(-13).map((name) => name.slice(0, 4)),
  [
    "0021",
    "0022",
    "0023",
    "0024",
    "0025",
    "0026",
    "0027",
    "0028",
    "0029",
    "0030",
    "0031",
    "0032",
    "0033",
  ],
  "The upgrade fixture must include the revised-A migrations",
);
const modeAwareApprovalMigration = upgradeMigrations.find((name) => name.startsWith("0027_"));
const completeApprovalMigration = upgradeMigrations.find((name) => name.startsWith("0028_"));
const safeMappingReplacementMigration = upgradeMigrations.find((name) => name.startsWith("0029_"));
const sameLocationRestoreMigration = upgradeMigrations.find((name) => name.startsWith("0030_"));
const restoreActorMovementSnapshotMigration = upgradeMigrations.find((name) =>
  name.startsWith("0031_"),
);
const pilotMigrationVersionAlignmentMigration = upgradeMigrations.find((name) =>
  name.startsWith("0032_"),
);
const listingPrepPilotV11Migration = upgradeMigrations.find((name) => name.startsWith("0033_"));
assert.ok(modeAwareApprovalMigration, "Migration 0027 must be present");
assert.ok(completeApprovalMigration, "Migration 0028 must be present");
assert.ok(safeMappingReplacementMigration, "Migration 0029 must be present");
assert.ok(sameLocationRestoreMigration, "Migration 0030 must be present");
assert.ok(restoreActorMovementSnapshotMigration, "Migration 0031 must be present");
assert.ok(pilotMigrationVersionAlignmentMigration, "Migration 0032 must be present");
assert.ok(listingPrepPilotV11Migration, "Migration 0033 must be present");
const upgradesBeforeApprovalRepair = upgradeMigrations.filter(
  (name) => Number(name.slice(0, 4)) < 27,
);

let sql = postgres(adminUrl, { max: 1, prepare: false });

async function applyMigration(name: string) {
  const source = await readFile(new URL(name, migrationsUrl), "utf8");
  await sql.unsafe(source);
}

try {
  const [{ count: existingTableCount }] = await sql<[{ count: number }]>`
    select count(*)::integer as count
    from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
  `;
  assert.equal(existingTableCount, 0, "Upgrade fixture database must start empty");

  for (const migration of legacyMigrations) await applyMigration(migration);

  const ids = {
    workspace: "00000000-0000-4000-8000-000000000101",
    owner: "00000000-0000-4000-8000-000000000102",
    reviewer: "00000000-0000-4000-8000-000000000103",
    sku: "00000000-0000-4000-8000-000000000104",
    location: "00000000-0000-4000-8000-000000000105",
    inventory: "00000000-0000-4000-8000-000000000106",
    countSession: "00000000-0000-4000-8000-000000000107",
    discrepancy: "00000000-0000-4000-8000-000000000108",
    order: "00000000-0000-4000-8000-000000000109",
    inspection: "00000000-0000-4000-8000-000000000110",
    pendingCountSession: "00000000-0000-4000-8000-000000000111",
    countSessionAudit: "00000000-0000-4000-8000-000000000112",
    discrepancyAudit: "00000000-0000-4000-8000-000000000113",
    mappingRule: "00000000-0000-4000-8000-000000000114",
    financialEvent: "00000000-0000-4000-8000-000000000115",
    journalCandidate: "00000000-0000-4000-8000-000000000116",
    exportBatch: "00000000-0000-4000-8000-000000000117",
    accountingAudit: "00000000-0000-4000-8000-000000000118",
    exportIdempotency: "00000000-0000-4000-8000-000000000119",
    historicalPilotRun: "00000000-0000-4000-8000-000000000120",
    currentPilotRun: "00000000-0000-4000-8000-000000000121",
    currentPilotV11Run: "00000000-0000-4000-8000-000000000123",
  } as const;

  await sql.begin(async (transaction) => {
    await transaction`
      insert into workspace (id, name) values (${ids.workspace}, 'Legacy upgrade fixture')
    `;
    await transaction`
      insert into app_identity (id, display_name) values
        (${ids.owner}, 'Legacy owner'), (${ids.reviewer}, 'Legacy reviewer')
    `;
    await transaction`
      insert into workspace_membership (workspace_id, identity_id, role, active) values
        (${ids.workspace}, ${ids.owner}, 'owner', true),
        (${ids.workspace}, ${ids.reviewer}, 'inventory_manager', false)
    `;
    await transaction`
      insert into product_sku (id, workspace_id, sku_code, title, category)
      values (${ids.sku}, ${ids.workspace}, 'SKU-LEGACY-0001', 'Legacy jacket', 'outer')
    `;
    await transaction`
      insert into location_node (
        id, workspace_id, code, name, depth, can_store_inventory, single_item_only, max_units
      ) values (${ids.location}, ${ids.workspace}, 'PLACE-LEGACY', 'Legacy shelf', 0, true, true, 1)
    `;
    await transaction`
      insert into inventory_unit (
        id, workspace_id, sku_id, inventory_number, status, location_id
      ) values (${ids.inventory}, ${ids.workspace}, ${ids.sku}, 'INV-000001', 'putaway_pending', null)
    `;
    await transaction`
      insert into count_session (
        id, workspace_id, location_id, state, basis_movement_seq, initial_counter_id,
        started_at, approved_by, approved_at
      ) values (
        ${ids.countSession}, ${ids.workspace}, ${ids.location}, 'approved', 0,
        ${ids.owner}, statement_timestamp(), ${ids.reviewer}, statement_timestamp()
      )
    `;
    await transaction`
      insert into count_session (
        id, workspace_id, location_id, state, basis_movement_seq, initial_counter_id,
        started_at, approved_by, approved_at
      ) values (
        ${ids.pendingCountSession}, ${ids.workspace}, ${ids.location}, 'reconciliation', 0,
        ${ids.owner}, statement_timestamp(), null, null
      )
    `;
    await transaction`
      insert into inventory_discrepancy (
        id, workspace_id, count_session_id, inventory_unit_id, kind, state,
        requester_id, reconfirmer_id, approver_id, resolution, resolved_at
      ) values (
        ${ids.discrepancy}, ${ids.workspace}, ${ids.countSession}, ${ids.inventory},
        'missing_candidate', 'resolved', ${ids.owner}, ${ids.reviewer}, ${ids.reviewer},
        'legacy resolution retained without fabricated evidence', statement_timestamp()
      )
    `;
    await transaction`
      insert into audit_event (
        id, workspace_id, actor_id, action, target_type, target_id, occurred_at,
        field_names, redacted_changes, reference_ids
      ) values
        (
          ${ids.countSessionAudit}, ${ids.workspace}, ${ids.reviewer},
          'legacy.stocktake.approved', 'count_session', ${ids.countSession},
          '2026-01-02T03:04:05.000Z'::timestamptz, array['state', 'approvedBy'],
          '{"after":{"state":"approved","approval":"two_actor"}}'::jsonb,
          array[${ids.owner}::uuid, ${ids.reviewer}::uuid]
        ),
        (
          ${ids.discrepancyAudit}, ${ids.workspace}, ${ids.reviewer},
          'legacy.discrepancy.resolved', 'inventory_discrepancy', ${ids.discrepancy},
          '2026-01-02T03:04:06.000Z'::timestamptz, array['state', 'resolution'],
          '{"after":{"state":"resolved","evidence":"legacy reason retained"}}'::jsonb,
          array[${ids.countSession}::uuid, ${ids.inventory}::uuid]
        )
    `;
    await transaction`
      insert into sales_order (id, workspace_id, order_number, state)
      values (${ids.order}, ${ids.workspace}, 'ORDER-LEGACY-0001', 'returned')
    `;
    await transaction`set local session_replication_role = replica`;
    await transaction`
      update inventory_unit set status = 'disposed', location_id = null
      where workspace_id = ${ids.workspace} and id = ${ids.inventory}
    `;
    await transaction`
      insert into return_inspection (
        id, workspace_id, order_id, inventory_unit_id, resolution, confirmed_by, confirmed_at
      ) values (
        ${ids.inspection}, ${ids.workspace}, ${ids.order}, ${ids.inventory},
        'dispose', ${ids.owner}, statement_timestamp()
      )
    `;
  });

  const readHistoricalApproval = async () => {
    const [session] = await sql<
      [
        {
          state: string;
          initial_counter_id: string;
          approved_by: string | null;
          approved_at: string | null;
        },
      ]
    >`
      select state, initial_counter_id, approved_by, approved_at::text
      from count_session
      where workspace_id = ${ids.workspace} and id = ${ids.countSession}
    `;
    const [discrepancy] = await sql<
      [
        {
          state: string;
          resolution: string | null;
          requester_id: string;
          reconfirmer_id: string | null;
          approver_id: string | null;
          resolved_at: string | null;
        },
      ]
    >`
      select state, resolution, requester_id, reconfirmer_id, approver_id, resolved_at::text
      from inventory_discrepancy
      where workspace_id = ${ids.workspace} and id = ${ids.discrepancy}
    `;
    const audit = await sql<
      Array<{
        id: string;
        actor_id: string;
        action: string;
        target_type: string;
        target_id: string;
        occurred_at: string;
        field_names: string[];
        redacted_changes: unknown;
        reference_ids: string[];
      }>
    >`
      select id, actor_id, action, target_type, target_id, occurred_at::text,
             field_names, redacted_changes, reference_ids
      from audit_event
      where workspace_id = ${ids.workspace}
      order by id
    `;
    return { session, discrepancy, audit };
  };

  const legacyHistoryBeforeUpgrade = await readHistoricalApproval();
  for (const migration of upgradesBeforeApprovalRepair) await applyMigration(migration);
  const historyBeforeApprovalRepair = await readHistoricalApproval();
  assert.deepEqual(
    historyBeforeApprovalRepair,
    legacyHistoryBeforeUpgrade,
    "Upgrades before the approval repair must preserve state, actors, timestamps, evidence, and audit",
  );

  const readRevisedApproval = async () => {
    const [session] = await sql<
      [
        {
          state: string;
          confirmation_mode: string;
          active_member_count: number;
          initial_counter_id: string;
          approved_by: string | null;
          approved_at: string | null;
        },
      ]
    >`
      select state, confirmation_mode, active_member_count, initial_counter_id,
             approved_by, approved_at::text
      from count_session
      where workspace_id = ${ids.workspace} and id = ${ids.countSession}
    `;
    const [discrepancy] = await sql<
      [
        {
          state: string;
          confirmation_mode: string;
          active_member_count: number;
          resolution: string | null;
          requester_id: string;
          reconfirmer_id: string | null;
          approver_id: string | null;
          evidence_media_id: string | null;
          confirmation_scan_session_id: string | null;
          restoration_scan_session_id: string | null;
          reason_code: string | null;
          reason_note: string | null;
          confirmed_at: string | null;
          restored_at: string | null;
          resolved_at: string | null;
        },
      ]
    >`
      select state, confirmation_mode, active_member_count, resolution,
             requester_id, reconfirmer_id, approver_id, evidence_media_id,
             confirmation_scan_session_id, restoration_scan_session_id,
             reason_code, reason_note, confirmed_at::text, restored_at::text, resolved_at::text
      from inventory_discrepancy
      where workspace_id = ${ids.workspace} and id = ${ids.discrepancy}
    `;
    return { session, discrepancy };
  };

  const revisedHistoryBeforeApprovalRepair = await readRevisedApproval();
  assert.equal(revisedHistoryBeforeApprovalRepair.session.confirmation_mode, "solo_reversible");
  assert.equal(revisedHistoryBeforeApprovalRepair.session.active_member_count, 1);
  assert.equal(revisedHistoryBeforeApprovalRepair.discrepancy.confirmation_mode, "solo_reversible");
  assert.equal(revisedHistoryBeforeApprovalRepair.discrepancy.active_member_count, 1);

  await applyMigration(modeAwareApprovalMigration);
  const historyAfterApprovalRepair = await readHistoricalApproval();
  assert.deepEqual(
    historyAfterApprovalRepair,
    legacyHistoryBeforeUpgrade,
    "0027 must preserve state, evidence, actors, timestamps, and audit history",
  );
  const revisedHistoryAfterApprovalRepair = await readRevisedApproval();
  assert.deepEqual(
    revisedHistoryAfterApprovalRepair,
    {
      session: {
        ...revisedHistoryBeforeApprovalRepair.session,
        confirmation_mode: "dual_actor",
        active_member_count: 2,
      },
      discrepancy: {
        ...revisedHistoryBeforeApprovalRepair.discrepancy,
        confirmation_mode: "dual_actor",
        active_member_count: 2,
      },
    },
    "0027 may normalize only the synchronized session/discrepancy mode and actor count",
  );

  const approvalConstraintBeforeHotfix = await sql<
    Array<{ constraint_name: string; definition: string }>
  >`
    select constraint_row.conname as constraint_name,
           pg_get_constraintdef(constraint_row.oid) as definition
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'count_session'::regclass
      and constraint_row.contype = 'c'
      and constraint_row.conname = 'count_session_approval_actor_mode_check'
  `;
  assert.equal(approvalConstraintBeforeHotfix.length, 1);
  const migrationVersionConstraintBeforeHotfix = await sql<
    Array<{ constraint_name: string; definition: string }>
  >`
    select constraint_row.conname as constraint_name,
           pg_get_constraintdef(constraint_row.oid) as definition
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'pilot_run'::regclass
      and constraint_row.contype = 'c'
      and constraint_row.conname = 'pilot_run_migration_version_check'
  `;
  assert.equal(migrationVersionConstraintBeforeHotfix.length, 1);

  const completeApprovalSource = await readFile(
    new URL(completeApprovalMigration, migrationsUrl),
    "utf8",
  );
  const injectedFailureSource = completeApprovalSource.replace(
    /commit;\s*$/u,
    `alter table inventory_discrepancy
       disable trigger inventory_discrepancy_transition_guard;
     update inventory_discrepancy
       set active_member_count = 3
       where workspace_id = '${ids.workspace}'::uuid and id = '${ids.discrepancy}'::uuid;
     update count_session
       set active_member_count = 3
       where workspace_id = '${ids.workspace}'::uuid and id = '${ids.countSession}'::uuid;
     do $injected$ begin
       raise exception 'injected 0028 rollback test';
     end $injected$;
     commit;`,
  );
  assert.notEqual(injectedFailureSource, completeApprovalSource);
  await assert.rejects(() => sql.unsafe(injectedFailureSource), /injected 0028 rollback test/u);

  await sql.end({ timeout: 5 });
  sql = postgres(adminUrl, { max: 1, prepare: false });

  const revisedHistoryAfterRollback = await readRevisedApproval();
  assert.deepEqual(
    revisedHistoryAfterRollback,
    revisedHistoryAfterApprovalRepair,
    "A failed 0028 transaction must roll back all mode/count writes",
  );
  const approvalConstraintAfterRollback = await sql<
    Array<{ constraint_name: string; definition: string }>
  >`
    select constraint_row.conname as constraint_name,
           pg_get_constraintdef(constraint_row.oid) as definition
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'count_session'::regclass
      and constraint_row.contype = 'c'
      and pg_get_constraintdef(constraint_row.oid) ilike '%approved_by%'
  `;
  assert.deepEqual(
    approvalConstraintAfterRollback,
    approvalConstraintBeforeHotfix,
    "A failed 0028 transaction must restore the 0027 approval constraint",
  );
  const migrationVersionConstraintAfterRollback = await sql<
    Array<{ constraint_name: string; definition: string }>
  >`
    select constraint_row.conname as constraint_name,
           pg_get_constraintdef(constraint_row.oid) as definition
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'pilot_run'::regclass
      and constraint_row.contype = 'c'
      and constraint_row.conname = 'pilot_run_migration_version_check'
  `;
  assert.deepEqual(
    migrationVersionConstraintAfterRollback,
    migrationVersionConstraintBeforeHotfix,
    "A failed 0028 transaction must restore the 0027 pilot migration-version constraint",
  );
  const [transitionGuardAfterRollback] = await sql<[{ enabled: string }]>`
    select trigger_row.tgenabled as enabled
    from pg_trigger trigger_row
    where trigger_row.tgrelid = 'inventory_discrepancy'::regclass
      and trigger_row.tgname = 'inventory_discrepancy_transition_guard'
      and not trigger_row.tgisinternal
  `;
  assert.equal(transitionGuardAfterRollback.enabled, "O");

  await applyMigration(completeApprovalMigration);
  assert.deepEqual(
    await readHistoricalApproval(),
    legacyHistoryBeforeUpgrade,
    "0028 must preserve state, evidence, actors, timestamps, and audit history",
  );
  assert.deepEqual(
    await readRevisedApproval(),
    revisedHistoryAfterApprovalRepair,
    "0028 must not change the normalized mode/count or any discrepancy evidence",
  );

  await sql.begin(async (transaction) => {
    await transaction`
      insert into accounting_profile (
        workspace_id, business_context, filing_context, consumption_tax_treatment,
        invoice_registration_status, bookkeeping_method, human_confirmed_by,
        human_confirmed_at
      ) values (
        ${ids.workspace}, 'individual_business', 'blue_return', 'general_taxation',
        'registered', 'double_entry', ${ids.owner}, '2026-01-01T00:00:00.000Z'::timestamptz
      )
    `;
    await transaction`
      insert into account_mapping_rule (
        id, workspace_id, event_type, rule_version, debit_account, debit_subaccount,
        debit_tax_category, debit_invoice_category, credit_account, credit_subaccount,
        credit_tax_category, credit_invoice_category, effective_from, status,
        approved_by, approved_at, created_by, created_at
      ) values (
        ${ids.mappingRule}, ${ids.workspace}, 'sale', 'legacy-sale-v1', '普通預金', '',
        '対象外', '控除なし', '売上高', '', '課税売上10%', '適格',
        '2025-01-01T00:00:00.000Z'::timestamptz, 'active', ${ids.owner},
        '2026-01-01T00:00:00.000Z'::timestamptz, ${ids.owner},
        '2026-01-01T00:00:00.000Z'::timestamptz
      )
    `;
    await transaction`
      insert into financial_event (
        id, workspace_id, sku_id, order_id, event_type, amount_minor, currency,
        tax_basis, bearer, source, source_meaning, rounding_rule_version, occurred_at
      ) values (
        ${ids.financialEvent}, ${ids.workspace}, ${ids.sku}, ${ids.order}, 'sale', 1234,
        'JPY', 'tax_included', 'buyer', 'legacy_upgrade_fixture',
        'historical sale retained across migration', 'legacy-v1',
        '2026-01-02T03:00:00.000Z'::timestamptz
      )
    `;
    await transaction`
      insert into journal_candidate (
        id, workspace_id, source_event_id, mapping_rule_id, transaction_number,
        transaction_date, amount_jpy, description, evidence_reference_id,
        financial_formula_version, status, human_approved_by, human_approved_at,
        created_at
      ) values (
        ${ids.journalCandidate}, ${ids.workspace}, ${ids.financialEvent},
        ${ids.mappingRule}, '1', '2026-01-02'::date, 1234, 'Legacy exported sale',
        ${ids.financialEvent}, 'financial_formula_v1.0.0', 'approved', ${ids.owner},
        '2026-01-02T03:01:00.000Z'::timestamptz,
        '2026-01-02T03:01:00.000Z'::timestamptz
      )
    `;
    await transaction`
      insert into export_batch (
        id, workspace_id, order_id, format, format_version, filename, schema_sha256,
        fixture_sha256, csv_sha256, source_set_sha256, row_count, column_count,
        debit_total_jpy, credit_total_jpy, csv_content, state, idempotency_key,
        payload_hash, created_by, approved_by, created_at
      ) values (
        ${ids.exportBatch}, ${ids.workspace}, ${ids.order}, 'generic_journal_v1',
        'generic_journal_v1.0.0', 'generic-journal-v1.csv', repeat('a', 64),
        repeat('b', 64), repeat('c', 64), repeat('d', 64), 1, 19, 1234, 1234,
        ${"取引No,取引日\r\n1,2026-01-02\r\n"}, 'preparing', ${ids.exportIdempotency},
        repeat('e', 64), ${ids.owner}, ${ids.owner},
        '2026-01-02T03:02:00.000Z'::timestamptz
      )
    `;
    await transaction`
      insert into export_batch_source (
        workspace_id, export_batch_id, journal_candidate_id, source_event_id, ordinal
      ) values (
        ${ids.workspace}, ${ids.exportBatch}, ${ids.journalCandidate},
        ${ids.financialEvent}, 1
      )
    `;
    await transaction`
      update export_batch set state = 'ready'
      where workspace_id = ${ids.workspace} and id = ${ids.exportBatch}
    `;
    await transaction`
      insert into audit_event (
        id, workspace_id, actor_id, action, target_type, target_id, occurred_at,
        field_names, redacted_changes, reference_ids
      ) values (
        ${ids.accountingAudit}, ${ids.workspace}, ${ids.owner},
        'legacy.accounting.exported', 'export_batch', ${ids.exportBatch},
        '2026-01-02T03:03:00.000Z'::timestamptz, array['state', 'mappingRuleId'],
        jsonb_build_object('after', jsonb_build_object(
          'state', 'ready', 'mappingRuleId', ${ids.mappingRule}::text,
          'csvSha256', repeat('c', 64)
        )),
        array[${ids.mappingRule}::uuid, ${ids.journalCandidate}::uuid]
      )
    `;
  });

  const readAccountingHistory = async () => {
    const [mappingRule] = await sql<
      [
        {
          id: string;
          rule_version: string;
          debit_account: string;
          credit_account: string;
          effective_from: string;
          effective_until: string | null;
          status: string;
          approved_by: string;
          approved_at: string;
          created_by: string;
          created_at: string;
        },
      ]
    >`
      select id, rule_version, debit_account, credit_account, effective_from::text,
             effective_until::text, status, approved_by, approved_at::text,
             created_by, created_at::text
      from account_mapping_rule
      where workspace_id = ${ids.workspace} and id = ${ids.mappingRule}
    `;
    const [candidate] = await sql<
      [
        {
          id: string;
          source_event_id: string;
          mapping_rule_id: string;
          amount_jpy: string;
          status: string;
          human_approved_by: string;
          human_approved_at: string;
        },
      ]
    >`
      select id, source_event_id, mapping_rule_id, amount_jpy::text, status,
             human_approved_by, human_approved_at::text
      from journal_candidate
      where workspace_id = ${ids.workspace} and id = ${ids.journalCandidate}
    `;
    const [batch] = await sql<
      [
        {
          id: string;
          state: string;
          csv_sha256: string;
          payload_hash: string;
          csv_bytes_hex: string;
          ready_at: string;
        },
      ]
    >`
      select id, state, csv_sha256, payload_hash,
             encode(convert_to(csv_content, 'UTF8'), 'hex') as csv_bytes_hex,
             ready_at::text
      from export_batch
      where workspace_id = ${ids.workspace} and id = ${ids.exportBatch}
    `;
    const [audit] = await sql<
      [
        {
          id: string;
          actor_id: string;
          action: string;
          target_id: string;
          occurred_at: string;
          field_names: string[];
          redacted_changes: unknown;
          reference_ids: string[];
        },
      ]
    >`
      select id, actor_id, action, target_id, occurred_at::text, field_names,
             redacted_changes, reference_ids
      from audit_event
      where workspace_id = ${ids.workspace} and id = ${ids.accountingAudit}
    `;
    return { mappingRule, candidate, batch, audit };
  };

  const accountingHistoryBeforeSafeMappingUpgrade = await readAccountingHistory();
  const safeMappingSource = await readFile(
    new URL(safeMappingReplacementMigration, migrationsUrl),
    "utf8",
  );
  const injectedSafeMappingFailureSource = safeMappingSource.replace(
    /commit;\s*$/u,
    `do $injected$ begin
       raise exception 'injected 0029 rollback test';
     end $injected$;
     commit;`,
  );
  assert.notEqual(injectedSafeMappingFailureSource, safeMappingSource);
  await assert.rejects(
    () => sql.unsafe(injectedSafeMappingFailureSource),
    /injected 0029 rollback test/u,
  );

  await sql.end({ timeout: 5 });
  sql = postgres(adminUrl, { max: 1, prepare: false });

  const [{ count: replacementColumnsAfterRollback }] = await sql<[{ count: number }]>`
    select count(*)::integer as count
    from information_schema.columns
    where table_schema = 'public' and table_name = 'account_mapping_rule'
      and column_name in ('replaces_rule_id', 'change_reason_code')
  `;
  assert.equal(
    replacementColumnsAfterRollback,
    0,
    "A failed 0029 transaction must roll back all replacement schema changes",
  );
  assert.deepEqual(
    await readAccountingHistory(),
    accountingHistoryBeforeSafeMappingUpgrade,
    "A failed 0029 transaction must preserve mapping, candidate, export bytes, and audit history",
  );

  await applyMigration(safeMappingReplacementMigration);
  const [{ count: replacementColumnsAfterUpgrade }] = await sql<[{ count: number }]>`
    select count(*)::integer as count
    from information_schema.columns
    where table_schema = 'public' and table_name = 'account_mapping_rule'
      and column_name in ('replaces_rule_id', 'change_reason_code')
  `;
  assert.equal(replacementColumnsAfterUpgrade, 2);
  assert.deepEqual(
    await readAccountingHistory(),
    accountingHistoryBeforeSafeMappingUpgrade,
    "0029 must preserve mapping, candidate IDs, export hashes/bytes, and audit history",
  );
  const [upgradedMappingMetadata] = await sql<
    [{ replaces_rule_id: string | null; change_reason_code: string | null }]
  >`
    select replaces_rule_id, change_reason_code
    from account_mapping_rule
    where workspace_id = ${ids.workspace} and id = ${ids.mappingRule}
  `;
  assert.deepEqual(upgradedMappingMetadata, {
    replaces_rule_id: null,
    change_reason_code: null,
  });

  const readChallengeFunctionDefinition = async () => {
    const [row] = await sql<[{ definition: string }]>`
      select pg_get_functiondef(
        'consume_discrepancy_confirmation_challenge(uuid,uuid,uuid,uuid,text,timestamptz)'::regprocedure
      ) as definition
    `;
    return row.definition;
  };
  const challengeFunctionBeforeSameLocationFix = await readChallengeFunctionDefinition();
  const approvalHistoryBeforeSameLocationFix = await readHistoricalApproval();
  const accountingHistoryBeforeSameLocationFix = await readAccountingHistory();
  const sameLocationRestoreSource = await readFile(
    new URL(sameLocationRestoreMigration, migrationsUrl),
    "utf8",
  );
  const injectedSameLocationFailureSource = sameLocationRestoreSource.replace(
    /commit;\s*$/u,
    `do $injected$ begin
       raise exception 'injected 0030 rollback test';
     end $injected$;
     commit;`,
  );
  assert.notEqual(injectedSameLocationFailureSource, sameLocationRestoreSource);
  await assert.rejects(
    () => sql.unsafe(injectedSameLocationFailureSource),
    /injected 0030 rollback test/u,
  );

  await sql.end({ timeout: 5 });
  sql = postgres(adminUrl, { max: 1, prepare: false });

  assert.equal(
    await readChallengeFunctionDefinition(),
    challengeFunctionBeforeSameLocationFix,
    "A failed 0030 transaction must restore the prior challenge function",
  );
  assert.deepEqual(
    await readHistoricalApproval(),
    approvalHistoryBeforeSameLocationFix,
    "A failed 0030 transaction must preserve stocktake approval and discrepancy history",
  );
  assert.deepEqual(
    await readAccountingHistory(),
    accountingHistoryBeforeSameLocationFix,
    "A failed 0030 transaction must preserve mapping, candidate, export bytes, and audit history",
  );

  await applyMigration(sameLocationRestoreMigration);
  const challengeFunctionAfterSameLocationFix = await readChallengeFunctionDefinition();
  assert.match(challengeFunctionAfterSameLocationFix, /same-location restore scan became stale/u);
  assert.match(
    challengeFunctionAfterSameLocationFix,
    /destination_location_id IS NOT DISTINCT FROM session_row\.expected_location_id/iu,
  );
  assert.deepEqual(
    await readHistoricalApproval(),
    approvalHistoryBeforeSameLocationFix,
    "0030 must not rewrite stocktake approval or discrepancy history",
  );
  assert.deepEqual(
    await readAccountingHistory(),
    accountingHistoryBeforeSameLocationFix,
    "0030 must not rewrite mapping, candidate, export bytes, or audit history",
  );
  const [sameLocationPrivileges] = await sql<
    [{ runtime_execute: boolean; public_execute: boolean; runtime_scan_update: boolean }]
  >`
    select
      has_function_privilege(
        'resale_app_runtime',
        'consume_discrepancy_confirmation_challenge(uuid,uuid,uuid,uuid,text,timestamptz)',
        'EXECUTE'
      ) as runtime_execute,
      has_function_privilege(
        'public',
        'consume_discrepancy_confirmation_challenge(uuid,uuid,uuid,uuid,text,timestamptz)',
        'EXECUTE'
      ) as public_execute,
      has_table_privilege('resale_app_runtime', 'scan_session', 'UPDATE')
        as runtime_scan_update
  `;
  assert.deepEqual(sameLocationPrivileges, {
    runtime_execute: true,
    public_execute: false,
    runtime_scan_update: false,
  });

  const readDiscrepancyScanGuardDefinition = async () => {
    const [row] = await sql<[{ definition: string }]>`
      select pg_get_functiondef('validate_discrepancy_scan_session()'::regprocedure)
        as definition
    `;
    return row.definition;
  };
  const challengeFunctionBeforeActorSnapshotFix = await readChallengeFunctionDefinition();
  const scanGuardBeforeActorSnapshotFix = await readDiscrepancyScanGuardDefinition();
  const approvalHistoryBeforeActorSnapshotFix = await readHistoricalApproval();
  const accountingHistoryBeforeActorSnapshotFix = await readAccountingHistory();
  const restoreActorSnapshotSource = await readFile(
    new URL(restoreActorMovementSnapshotMigration, migrationsUrl),
    "utf8",
  );
  const injectedRestoreActorSnapshotFailureSource = restoreActorSnapshotSource.replace(
    /commit;\s*$/u,
    `do $injected$ begin
       raise exception 'injected 0031 rollback test';
     end $injected$;
     commit;`,
  );
  assert.notEqual(injectedRestoreActorSnapshotFailureSource, restoreActorSnapshotSource);
  await assert.rejects(
    () => sql.unsafe(injectedRestoreActorSnapshotFailureSource),
    /injected 0031 rollback test/u,
  );

  await sql.end({ timeout: 5 });
  sql = postgres(adminUrl, { max: 1, prepare: false });

  const [{ count: movementSnapshotColumnsAfterRollback }] = await sql<[{ count: number }]>`
    select count(*)::integer as count
    from information_schema.columns
    where table_schema = 'public' and table_name = 'scan_session'
      and column_name = 'inventory_movement_seq_snapshot'
  `;
  assert.equal(
    movementSnapshotColumnsAfterRollback,
    0,
    "A failed 0031 transaction must remove the movement snapshot column",
  );
  assert.equal(
    await readChallengeFunctionDefinition(),
    challengeFunctionBeforeActorSnapshotFix,
    "A failed 0031 transaction must restore the 0030 challenge function",
  );
  assert.equal(
    await readDiscrepancyScanGuardDefinition(),
    scanGuardBeforeActorSnapshotFix,
    "A failed 0031 transaction must restore the prior scan guard",
  );
  assert.deepEqual(
    await readHistoricalApproval(),
    approvalHistoryBeforeActorSnapshotFix,
    "A failed 0031 transaction must preserve stocktake approval and discrepancy history",
  );
  assert.deepEqual(
    await readAccountingHistory(),
    accountingHistoryBeforeActorSnapshotFix,
    "A failed 0031 transaction must preserve mapping, candidate, export bytes, and audit history",
  );

  await applyMigration(restoreActorMovementSnapshotMigration);
  const [movementSnapshotColumn] = await sql<[{ is_nullable: "YES" | "NO"; data_type: string }]>`
    select is_nullable, data_type
    from information_schema.columns
    where table_schema = 'public' and table_name = 'scan_session'
      and column_name = 'inventory_movement_seq_snapshot'
  `;
  assert.deepEqual(movementSnapshotColumn, {
    is_nullable: "YES",
    data_type: "bigint",
  });
  const challengeFunctionAfterActorSnapshotFix = await readChallengeFunctionDefinition();
  assert.match(challengeFunctionAfterActorSnapshotFix, /public\.app_identity_id\(\)/u);
  assert.match(challengeFunctionAfterActorSnapshotFix, /membership_row\.active/u);
  assert.match(
    challengeFunctionAfterActorSnapshotFix,
    /unit_row\.movement_seq IS DISTINCT FROM session_row\.inventory_movement_seq_snapshot/iu,
  );
  const scanGuardAfterActorSnapshotFix = await readDiscrepancyScanGuardDefinition();
  assert.match(
    scanGuardAfterActorSnapshotFix,
    /new\.inventory_movement_seq_snapshot := unit_row\.movement_seq/iu,
  );
  assert.deepEqual(
    await readHistoricalApproval(),
    approvalHistoryBeforeActorSnapshotFix,
    "0031 must not rewrite stocktake approval or discrepancy history",
  );
  assert.deepEqual(
    await readAccountingHistory(),
    accountingHistoryBeforeActorSnapshotFix,
    "0031 must not rewrite mapping, candidate, export bytes, or audit history",
  );
  const [actorSnapshotPrivileges] = await sql<
    [{ runtime_execute: boolean; public_execute: boolean; runtime_scan_update: boolean }]
  >`
    select
      has_function_privilege(
        'resale_app_runtime',
        'consume_discrepancy_confirmation_challenge(uuid,uuid,uuid,uuid,text,timestamptz)',
        'EXECUTE'
      ) as runtime_execute,
      has_function_privilege(
        'public',
        'consume_discrepancy_confirmation_challenge(uuid,uuid,uuid,uuid,text,timestamptz)',
        'EXECUTE'
      ) as public_execute,
      has_table_privilege('resale_app_runtime', 'scan_session', 'UPDATE')
        as runtime_scan_update
  `;
  assert.deepEqual(actorSnapshotPrivileges, {
    runtime_execute: true,
    public_execute: false,
    runtime_scan_update: false,
  });

  await sql`
    insert into pilot_run (
      id, workspace_id, protocol_version, commit_sha, migration_version,
      platform, browser, viewport, actor_id, warmup_completed_at,
      state, completed_at
    ) values (
      ${ids.historicalPilotRun}, ${ids.workspace}, 'listing_prep_pilot_v1.0.0',
      ${"d".repeat(40)}, '0028', 'Historical Windows fixture', 'Historical Chromium fixture',
      '390x844', ${ids.owner}, statement_timestamp(), 'completed', statement_timestamp()
    )
  `;
  const readPilotEnvironment = async (runId: string) => {
    const [row] = await sql<
      [
        {
          id: string;
          protocol_version: string;
          commit_sha: string;
          migration_version: string;
          platform: string;
          browser: string;
          viewport: string;
          actor_id: string;
          state: string;
          warmup_completed_at: string;
          started_at: string;
          completed_at: string;
        },
      ]
    >`
      select id, protocol_version, commit_sha, migration_version, platform, browser, viewport,
             actor_id, state, warmup_completed_at::text, started_at::text, completed_at::text
      from pilot_run where workspace_id = ${ids.workspace} and id = ${runId}
    `;
    return row;
  };
  const historicalPilotBeforeAlignment = await readPilotEnvironment(ids.historicalPilotRun);

  await applyMigration(pilotMigrationVersionAlignmentMigration);
  assert.deepEqual(
    await readPilotEnvironment(ids.historicalPilotRun),
    historicalPilotBeforeAlignment,
    "0032 must preserve every historical pilot environment field",
  );
  await sql`
    insert into pilot_run (
      id, workspace_id, protocol_version, commit_sha, migration_version,
      platform, browser, viewport, actor_id, warmup_completed_at,
      state, completed_at
    ) values (
      ${ids.currentPilotRun}, ${ids.workspace}, 'listing_prep_pilot_v1.0.0',
      ${"e".repeat(40)}, '0032', 'Current Windows fixture', 'Current Chromium fixture',
      '390x844', ${ids.owner}, statement_timestamp(), 'completed', statement_timestamp()
    )
  `;
  assert.equal(
    (await readPilotEnvironment(ids.currentPilotRun)).migration_version,
    "0032",
    "A new pilot run must record the installed migration version",
  );
  const [pilotMigrationConstraint] = await sql<[{ definition: string }]>`
    select pg_get_constraintdef(constraint_row.oid) as definition
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'pilot_run'::regclass
      and constraint_row.contype = 'c'
      and constraint_row.conname = 'pilot_run_migration_version_check'
  `;
  assert.match(pilotMigrationConstraint.definition, /'0028'/u);
  assert.match(pilotMigrationConstraint.definition, /'0032'/u);
  await assert.rejects(
    () => sql`
      insert into pilot_run (
        id, workspace_id, protocol_version, commit_sha, migration_version,
        platform, browser, viewport, actor_id, warmup_completed_at,
        state, completed_at
      ) values (
        ${"00000000-0000-4000-8000-000000000122"}, ${ids.workspace},
        'listing_prep_pilot_v1.0.0', ${"f".repeat(40)}, '0033',
        'Future Windows fixture', 'Future Chromium fixture', '390x844', ${ids.owner},
        statement_timestamp(), 'completed', statement_timestamp()
      )
    `,
    /pilot_run_migration_version_check/u,
  );

  await applyMigration(listingPrepPilotV11Migration);
  const historicalPilotAfterV11 = await sql<
    Array<{
      id: string;
      fixture_manifest_sha256: string | null;
      profile_count: number;
      attribute_count: number;
    }>
  >`
    select run.id, run.fixture_manifest_sha256,
           (select count(*)::integer from product_measurement_profile profile
             where profile.workspace_id = run.workspace_id) as profile_count,
           (select count(*)::integer from product_attribute_confirmation confirmation
             where confirmation.workspace_id = run.workspace_id) as attribute_count
    from pilot_run run
    where run.workspace_id = ${ids.workspace} and run.id = ${ids.historicalPilotRun}
  `;
  assert.deepEqual(
    Array.from(historicalPilotAfterV11, (row) => ({ ...row })),
    [
      {
        id: ids.historicalPilotRun,
        fixture_manifest_sha256: null,
        profile_count: 0,
        attribute_count: 0,
      },
    ],
  );
  await sql`
    insert into pilot_run (
      id, workspace_id, protocol_version, fixture_manifest_sha256, commit_sha,
      migration_version, platform, browser, viewport, actor_id, warmup_completed_at,
      state, completed_at
    ) values (
      ${ids.currentPilotV11Run}, ${ids.workspace}, ${listingPrepPilotProtocolVersion},
      ${listingPrepPilotFixtureManifestSha256}, ${"1".repeat(40)}, '0033',
      'Current v1.1 Windows fixture', 'Current v1.1 Chromium fixture', '390x844',
      ${ids.owner}, statement_timestamp(), 'completed', statement_timestamp()
    )
  `;
  const [currentPilotV11] = await sql<
    Array<{ protocol_version: string; fixture_manifest_sha256: string; migration_version: string }>
  >`
    select protocol_version, fixture_manifest_sha256, migration_version
    from pilot_run
    where workspace_id = ${ids.workspace} and id = ${ids.currentPilotV11Run}
  `;
  assert.deepEqual(currentPilotV11, {
    protocol_version: listingPrepPilotProtocolVersion,
    fixture_manifest_sha256: listingPrepPilotFixtureManifestSha256,
    migration_version: "0033",
  });
  await assert.rejects(
    () => sql`
      insert into pilot_run (
        id, workspace_id, protocol_version, fixture_manifest_sha256, commit_sha,
        migration_version, platform, browser, viewport, actor_id, warmup_completed_at
      ) values (
        ${"00000000-0000-4000-8000-000000000124"}, ${ids.workspace},
        ${listingPrepPilotProtocolVersion}, ${listingPrepPilotFixtureManifestSha256},
        ${"2".repeat(40)}, '0034', 'Unsupported Windows fixture',
        'Unsupported Chromium fixture', '390x844', ${ids.owner}, statement_timestamp()
      )
    `,
    /pilot_run_migration_version_check/u,
  );
  await assert.rejects(
    () => sql`
      insert into pilot_run (
        id, workspace_id, protocol_version, fixture_manifest_sha256, commit_sha,
        migration_version, platform, browser, viewport, actor_id, warmup_completed_at
      ) values (
        ${"00000000-0000-4000-8000-000000000125"}, ${ids.workspace},
        ${listingPrepPilotProtocolVersion}, ${"f".repeat(64)}, ${"3".repeat(40)}, '0033',
        'Wrong manifest Windows fixture', 'Wrong manifest Chromium fixture', '390x844',
        ${ids.owner}, statement_timestamp()
      )
    `,
    /pilot_run_protocol_fixture_check/u,
  );
  const v11TableProtection = await sql<
    Array<{ table_name: string; row_security: boolean; force_row_security: boolean }>
  >`
    select relname as table_name, relrowsecurity as row_security,
           relforcerowsecurity as force_row_security
    from pg_class
    where relname in ('product_measurement_profile', 'product_attribute_confirmation')
    order by relname
  `;
  assert.deepEqual(
    Array.from(v11TableProtection, (row) => ({ ...row })),
    [
      {
        table_name: "product_attribute_confirmation",
        row_security: true,
        force_row_security: true,
      },
      {
        table_name: "product_measurement_profile",
        row_security: true,
        force_row_security: true,
      },
    ],
  );

  const [inventory] = await sql<
    [{ inventory_number: string; status: string; location_id: string | null }]
  >`
    select inventory_number, status::text, location_id
    from inventory_unit where workspace_id = ${ids.workspace} and id = ${ids.inventory}
  `;
  assert.equal(inventory.inventory_number, appendCodeCheckDigit("INV-000001"));
  assert.equal(inventory.status, "disposed", "Legacy irreversible history must be preserved");
  assert.equal(inventory.location_id, null);

  const [discrepancy] = await sql<
    [
      {
        state: string;
        confirmation_mode: string;
        active_member_count: number;
        evidence_media_id: string | null;
        confirmation_scan_session_id: string | null;
      },
    ]
  >`
    select state, confirmation_mode, active_member_count,
           evidence_media_id, confirmation_scan_session_id
    from inventory_discrepancy
    where workspace_id = ${ids.workspace} and id = ${ids.discrepancy}
  `;
  assert.equal(discrepancy.state, "resolved");
  assert.equal(discrepancy.confirmation_mode, "dual_actor");
  assert.equal(discrepancy.active_member_count, 2);
  assert.equal(discrepancy.evidence_media_id, null, "Migration must not fabricate photo evidence");
  assert.equal(
    discrepancy.confirmation_scan_session_id,
    null,
    "Migration must not fabricate scan evidence",
  );
  await assert.rejects(
    () => sql`
      update inventory_discrepancy set reason_note = 'mutation must fail'
      where workspace_id = ${ids.workspace} and id = ${ids.discrepancy}
    `,
    /legacy resolved missing candidate is immutable/u,
  );

  const [inspection] = await sql<[{ resolution: string }]>`
    select resolution from return_inspection
    where workspace_id = ${ids.workspace} and id = ${ids.inspection}
  `;
  assert.equal(inspection.resolution, "disposal_pending");

  const [legacyApproval] = await sql<
    [
      {
        state: string;
        confirmation_mode: string;
        active_member_count: number;
        initial_counter_id: string;
        approved_by: string;
        approved_at: string;
      },
    ]
  >`
    select state, confirmation_mode, active_member_count, initial_counter_id,
           approved_by, approved_at::text
    from count_session
    where workspace_id = ${ids.workspace} and id = ${ids.countSession}
  `;
  assert.deepEqual(legacyApproval, {
    state: "approved",
    confirmation_mode: "dual_actor",
    active_member_count: 2,
    initial_counter_id: ids.owner,
    approved_by: ids.reviewer,
    approved_at: legacyHistoryBeforeUpgrade.session.approved_at,
  });
  const [pendingApproval] = await sql<
    [{ state: string; approved_by: string | null; approved_at: string | null }]
  >`
    select state, approved_by, approved_at::text
    from count_session
    where workspace_id = ${ids.workspace} and id = ${ids.pendingCountSession}
  `;
  assert.deepEqual(pendingApproval, {
    state: "reconciliation",
    approved_by: null,
    approved_at: null,
  });
  assert.equal(discrepancy.confirmation_mode, legacyApproval.confirmation_mode);
  assert.equal(discrepancy.active_member_count, legacyApproval.active_member_count);

  const [discrepancyTransitionGuard] = await sql<[{ enabled: string }]>`
    select trigger_row.tgenabled as enabled
    from pg_trigger trigger_row
    where trigger_row.tgrelid = 'inventory_discrepancy'::regclass
      and trigger_row.tgname = 'inventory_discrepancy_transition_guard'
      and not trigger_row.tgisinternal
  `;
  assert.equal(discrepancyTransitionGuard.enabled, "O");

  const approvalActorConstraints = await sql<
    Array<{ constraint_name: string; definition: string }>
  >`
    select constraint_row.conname as constraint_name,
           pg_get_constraintdef(constraint_row.oid) as definition
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'count_session'::regclass
      and constraint_row.contype = 'c'
      and pg_get_constraintdef(constraint_row.oid) ilike '%approved_by%'
  `;
  assert.equal(approvalActorConstraints.length, 1);
  assert.equal(
    approvalActorConstraints[0]?.constraint_name,
    "count_session_approval_state_actor_check",
  );
  assert.match(
    approvalActorConstraints[0]?.definition ?? "",
    /state = 'approved'.*approved_by IS NOT NULL.*approved_at IS NOT NULL/iu,
  );
  assert.match(approvalActorConstraints[0]?.definition ?? "", /solo_reversible/iu);
  assert.match(approvalActorConstraints[0]?.definition ?? "", /dual_actor/iu);
  assert.match(
    approvalActorConstraints[0]?.definition ?? "",
    /state <> 'approved'.*approved_by IS NULL.*approved_at IS NULL/iu,
  );

  const [gate] = await sql<[{ active_member_count: number; revision: number }]>`
    select gate.revision,
      (select count(*)::integer from workspace_membership membership
       where membership.workspace_id = gate.workspace_id and membership.active) as active_member_count
    from workspace_membership_gate gate where gate.workspace_id = ${ids.workspace}
  `;
  assert.equal(gate.active_member_count, 1);
  assert.ok(gate.revision > 0);

  const [accountingCounts] = await sql<[{ profiles: number; mappings: number; exports: number }]>`
    select
      (select count(*)::integer from accounting_profile) as profiles,
      (select count(*)::integer from account_mapping_rule) as mappings,
      (select count(*)::integer from export_batch) as exports
  `;
  assert.deepEqual(
    accountingCounts,
    { profiles: 1, mappings: 1, exports: 1 },
    "The historical accounting fixture must remain present after 0032",
  );

  process.stdout.write(
    `postgres-upgrade-integration: PASS (${legacyMigrations[0]} through ${upgradeMigrations.at(-1)}, historical two-actor approval preserved and mode-normalized, state/evidence/actors/timestamps/audit preserved, injected 0028, 0029, 0030 and 0031 failures fully rolled back after reconnect, actor-bound movement-snapshot restore function upgraded without direct scan UPDATE, historical mapping/candidate IDs and export hashes/bytes preserved, historical v1.0 pilot environment preserved with nullable v1.1 fields and current v1.1/0033 accepted, non-approved approval metadata remains null, return dispose mapped to disposal_pending)\n`,
  );
} finally {
  await sql.end({ timeout: 5 });
}
