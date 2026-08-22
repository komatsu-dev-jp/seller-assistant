import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { appendCodeCheckDigit } from "@resale/contracts";
import { buildApp } from "./app.js";
import { PostgresLoginService } from "./auth.js";
import { bootstrapInitialOwner } from "./bootstrap-owner.js";
import { assertRestrictedDatabaseRole } from "./db-security.js";
import { LocalPrivateMediaStore } from "./local-media-store.js";
import { PostgresWorkflowRepository } from "./repository.js";
import { createCookieAuthenticator, PostgresSessionRegistry } from "./session.js";
import { AesGcmAddressCipher } from "./address-crypto.js";
import { PostgresOrderRepository } from "./order-repository.js";
import { PostgresP0ItemRepository } from "./p0-item-repository.js";
import { PostgresTeamRepository } from "./team-repository.js";
import { PostgresStocktakeRepository } from "./stocktake-repository.js";
import { PostgresAccountingRepository } from "./accounting-repository.js";

const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
const runtimeUrl = process.env.TEST_DATABASE_URL;
const sessionSecret = process.env.TEST_SESSION_SECRET;
if (!adminUrl || !runtimeUrl || !sessionSecret) {
  throw new Error(
    "TEST_DATABASE_ADMIN_URL, TEST_DATABASE_URL and TEST_SESSION_SECRET are required",
  );
}

function hashFixture(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hasDatabaseCode(expectedCode: string): (error: unknown) => boolean {
  return (error) =>
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    String(error.code) === expectedCode;
}

const workspaceProtectedTables = [
  "audit_event",
  "accounting_export",
  "accounting_profile",
  "account_mapping_rule",
  "address_access_lease",
  "count_observation",
  "count_session",
  "count_session_inventory_snapshot",
  "count_session_post_start_movement",
  "discrepancy_confirmation_challenge",
  "discrepancy_evidence_media",
  "cost_allocation",
  "financial_event",
  "idempotency_record",
  "inventory_discrepancy",
  "inventory_label",
  "inventory_movement",
  "inventory_unit",
  "inventory_unit_assignment",
  "journal_candidate",
  "location_node",
  "location_photo",
  "marketplace_reference",
  "measurement_attempt",
  "media_asset",
  "order_allocation",
  "order_operation_record",
  "order_assignment",
  "order_private_address",
  "outbox_event",
  "p0_workflow",
  "p0_workflow_action",
  "product_identity_candidate",
  "product_sku",
  "purchase_batch",
  "packing_evidence",
  "pilot_exception_event",
  "pilot_item_measurement",
  "pilot_run",
  "return_inspection",
  "receipt",
  "sales_order",
  "scan_session",
  "sku_work_assignment",
  "workspace_membership",
  "workspace_membership_gate",
  "export_batch",
  "export_batch_source",
  "work_assignment",
] as const;

await assert.rejects(
  () => assertRestrictedDatabaseRole(adminUrl),
  /restricted LOGIN role/u,
  "The API must reject an admin DATABASE_URL",
);
await assertRestrictedDatabaseRole(runtimeUrl);

const catalog = postgres(adminUrl, { max: 1 });
try {
  const protections = await catalog<
    Array<{
      table_name: string;
      row_security: boolean;
      force_row_security: boolean;
      policy_count: number;
      workspace_policy_count: number;
    }>
  >`
    select table_info.relname as table_name,
           table_info.relrowsecurity as row_security,
           table_info.relforcerowsecurity as force_row_security,
           count(policy.policyname)::integer as policy_count,
           count(policy.policyname) filter (
             where policy.qual like '%workspace_id = app_workspace_id()%'
               and policy.with_check like '%workspace_id = app_workspace_id()%'
           )::integer as workspace_policy_count
    from pg_class table_info
    join pg_namespace namespace on namespace.oid = table_info.relnamespace
    left join pg_policies policy
      on policy.schemaname = namespace.nspname and policy.tablename = table_info.relname
    where namespace.nspname = 'public'
      and table_info.relname in ${catalog(workspaceProtectedTables)}
    group by table_info.relname, table_info.relrowsecurity, table_info.relforcerowsecurity
    order by table_info.relname
  `;
  assert.deepEqual(
    protections.map((row) => row.table_name),
    [...workspaceProtectedTables].sort(),
    "Every workspace business table must be present in the RLS matrix",
  );
  for (const protection of protections) {
    assert.equal(protection.row_security, true, `${protection.table_name} must enable RLS`);
    assert.equal(protection.force_row_security, true, `${protection.table_name} must force RLS`);
    assert.equal(protection.policy_count, 1, `${protection.table_name} must have one policy`);
    assert.equal(
      protection.workspace_policy_count,
      1,
      `${protection.table_name} must isolate USING and WITH CHECK by workspace`,
    );
  }
  const dangerousGrants = await catalog<Array<{ table_name: string; privilege_type: string }>>`
    select table_name, privilege_type
    from information_schema.role_table_grants
    where grantee = 'resale_app_runtime'
      and table_name in ${catalog(workspaceProtectedTables)}
      and privilege_type in ('DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')
  `;
  assert.equal(
    dangerousGrants.length,
    0,
    `The runtime role must not receive destructive business grants: ${JSON.stringify(dangerousGrants)}`,
  );
  const stocktakeApprovalActorConstraints = await catalog<
    Array<{ constraint_name: string; definition: string }>
  >`
    select constraint_row.conname as constraint_name,
           pg_get_constraintdef(constraint_row.oid) as definition
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'count_session'::regclass
      and constraint_row.contype = 'c'
      and pg_get_constraintdef(constraint_row.oid) ilike '%approved_by%'
  `;
  assert.equal(stocktakeApprovalActorConstraints.length, 1);
  assert.equal(
    stocktakeApprovalActorConstraints[0]?.constraint_name,
    "count_session_approval_state_actor_check",
  );
  assert.match(
    stocktakeApprovalActorConstraints[0]?.definition ?? "",
    /state = 'approved'.*approved_by IS NOT NULL.*approved_at IS NOT NULL/iu,
  );
  assert.match(
    stocktakeApprovalActorConstraints[0]?.definition ?? "",
    /confirmation_mode = 'solo_reversible'.*approved_by = initial_counter_id/iu,
  );
  assert.match(
    stocktakeApprovalActorConstraints[0]?.definition ?? "",
    /confirmation_mode = 'dual_actor'.*approved_by <> initial_counter_id/iu,
  );
  assert.match(
    stocktakeApprovalActorConstraints[0]?.definition ?? "",
    /state <> 'approved'.*approved_by IS NULL.*approved_at IS NULL/iu,
  );
  const countSessionCheckNames = await catalog<Array<{ constraint_name: string }>>`
    select constraint_row.conname as constraint_name
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'count_session'::regclass and constraint_row.contype = 'c'
    order by constraint_row.conname
  `;
  for (const preservedConstraint of [
    "count_session_state_check",
    "count_session_confirmation_mode_check",
    "count_session_membership_snapshot_check",
    "count_session_approval_state_actor_check",
  ]) {
    assert.equal(
      countSessionCheckNames.some((row) => row.constraint_name === preservedConstraint),
      true,
      `${preservedConstraint} must remain installed`,
    );
  }
  const [discrepancyTransitionGuard] = await catalog<Array<{ enabled: string }>>`
    select trigger_row.tgenabled as enabled
    from pg_trigger trigger_row
    where trigger_row.tgrelid = 'inventory_discrepancy'::regclass
      and trigger_row.tgname = 'inventory_discrepancy_transition_guard'
      and not trigger_row.tgisinternal
  `;
  assert.equal(discrepancyTransitionGuard?.enabled, "O");
} finally {
  await catalog.end({ timeout: 5 });
}

const owner = await bootstrapInitialOwner(adminUrl, {
  email: "owner@example.test",
  displayName: "試験オーナー",
  workspaceName: "架空テスト事業所",
  password: "zero-cost-test-password",
});

const registry = new PostgresSessionRegistry(runtimeUrl);
const mediaRoot = await mkdtemp(join(tmpdir(), "resale-postgres-media-"));
const addressCipher = new AesGcmAddressCipher("7d".repeat(32));
const app = buildApp({
  repository: new PostgresWorkflowRepository(runtimeUrl),
  loginService: new PostgresLoginService(runtimeUrl, sessionSecret),
  authenticate: createCookieAuthenticator(sessionSecret, undefined, registry),
  revokeSession: async (actor) => {
    assert.ok(actor.sessionId && actor.workspaceId);
    await registry.revoke(actor.sessionId, actor.identityId, actor.workspaceId);
  },
  closeAuthentication: () => registry.close(),
  validateWriteOrigin: () => true,
  mediaStore: new LocalPrivateMediaStore(mediaRoot),
  orderRepository: new PostgresOrderRepository(runtimeUrl),
  addressCipher,
  p0ItemRepository: new PostgresP0ItemRepository(runtimeUrl),
  teamRepository: new PostgresTeamRepository(runtimeUrl),
  stocktakeRepository: new PostgresStocktakeRepository(runtimeUrl),
  accountingRepository: new PostgresAccountingRepository(runtimeUrl),
});

try {
  const login = await app.inject({
    method: "POST",
    url: "/v1/session/login",
    payload: { email: "owner@example.test", password: "zero-cost-test-password" },
  });
  assert.equal(login.statusCode, 204, login.body);
  const setCookie = login.headers["set-cookie"];
  assert.equal(typeof setCookie, "string");
  const cookie = String(setCookie).split(";", 1)[0];

  const pilotStarted = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/pilot-runs`,
    headers: { cookie },
    payload: {
      protocolVersion: "listing_prep_pilot_v1.0.0",
      commitSha: "a".repeat(40),
      migrationVersion: "0028",
      platform: "Windows test fixture",
      browser: "Chromium fixture",
      viewport: "390x844",
      warmupCompleted: true,
      humanConfirmed: true,
    },
  });
  assert.equal(pilotStarted.statusCode, 201, pilotStarted.body);
  const pilotRunId = pilotStarted.json<{ runId: string }>().runId;

  const acquisitionKey = randomUUID();
  const acquisitionPayload = {
    skuCode: "SKU-P0-ACQUIRED",
    title: "架空の仕入証憑付きシャツ",
    category: "トップス",
    supplierName: "架空テスト仕入先",
    receiptReference: "RECEIPT-P0-0001",
    purchasedAt: new Date().toISOString(),
    receiptAmountMinor: 1500,
    allocatedCostMinor: 1500,
    idempotencyKey: acquisitionKey,
    humanConfirmed: true,
    pilot: { runId: pilotRunId, productFixtureId: "TOP-01" },
  } as const;
  const acquired = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/p0-items`,
    headers: { cookie },
    payload: acquisitionPayload,
  });
  assert.equal(acquired.statusCode, 201, acquired.body);
  const acquiredItem = acquired.json<{
    skuId: string;
    inventoryUnitId: string;
    inventoryNumber: string;
    receiptId: string;
    workflowState: string;
  }>();
  assert.equal(acquiredItem.workflowState, "purchase_confirmed");
  assert.equal(acquiredItem.inventoryNumber, appendCodeCheckDigit("INV-000001"));
  const acquiredReplay = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/p0-items`,
    headers: { cookie },
    payload: acquisitionPayload,
  });
  assert.deepEqual(acquiredReplay.json(), acquired.json());
  const acquiredConflict = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/p0-items`,
    headers: { cookie },
    payload: { ...acquisitionPayload, allocatedCostMinor: 1400 },
  });
  assert.equal(acquiredConflict.statusCode, 409, acquiredConflict.body);
  const acquiredList = await app.inject({
    method: "GET",
    url: `/v1/workspaces/${owner.workspaceId}/p0-items`,
    headers: { cookie },
  });
  assert.equal(acquiredList.statusCode, 200, acquiredList.body);
  assert.equal(acquiredList.json<unknown[]>().length, 1);

  const acquisitionRoot = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/locations`,
    headers: { cookie },
    payload: {
      parentId: null,
      code: "SITE-01",
      name: "架空P0保管拠点",
      canStoreInventory: false,
      singleItemOnly: false,
      allowMixedSku: true,
      maxUnits: null,
      humanConfirmed: true,
    },
  });
  assert.equal(acquisitionRoot.statusCode, 201, acquisitionRoot.body);
  const acquisitionBin = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/locations`,
    headers: { cookie },
    payload: {
      parentId: acquisitionRoot.json<{ id: string }>().id,
      code: "HOME-BIN-01",
      name: "P0試験箱01",
      canStoreInventory: true,
      singleItemOnly: true,
      allowMixedSku: false,
      maxUnits: 1,
      humanConfirmed: true,
    },
  });
  assert.equal(acquisitionBin.statusCode, 201, acquisitionBin.body);
  const acquisitionScanTime = Date.now();
  const acquisitionPutaway = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/inventory/putaway`,
    headers: { cookie },
    payload: {
      inventoryNumber: acquiredItem.inventoryNumber,
      locationCode: appendCodeCheckDigit("HOME-BIN-01"),
      inventoryLabelVersion: 1,
      locationLabelVersion: 1,
      inventoryScannedAt: new Date(acquisitionScanTime).toISOString(),
      locationScannedAt: new Date(acquisitionScanTime + 1).toISOString(),
      confirmedAt: new Date(acquisitionScanTime + 2).toISOString(),
      idempotencyKey: randomUUID(),
      humanConfirmed: true,
    },
  });
  assert.equal(acquisitionPutaway.statusCode, 201, acquisitionPutaway.body);
  const acquisitionAssets: string[] = [];
  for (const role of ["front", "back", "brand_tag", "care_label"] as const) {
    const assetId = randomUUID();
    const upload = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/skus/${acquiredItem.skuId}/media-uploads?assetId=${assetId}&role=${role}`,
      headers: { cookie, "content-type": "image/jpeg" },
      payload: jpegWithGpsMetadata(),
    });
    assert.equal(upload.statusCode, 201, upload.body);
    acquisitionAssets.push(assetId);
  }
  const identityCandidate = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/skus/${acquiredItem.skuId}/identity-candidates`,
    headers: { cookie },
    payload: {
      sourceAssetId: acquisitionAssets[2],
      rawOcrText: "架空ブランド\n品番: TEST-100\nサイズ: M\n素材: 綿100%",
      humanConfirmedSource: true,
    },
  });
  assert.equal(identityCandidate.statusCode, 201, identityCandidate.body);
  assert.equal(identityCandidate.body.includes("rawOcrText"), false);
  const candidateId = identityCandidate.json<{ candidateId: string }>().candidateId;
  const decidedCandidate = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/skus/${acquiredItem.skuId}/identity-candidates/${candidateId}/decision`,
    headers: { cookie },
    payload: { status: "human_confirmed", humanConfirmed: true },
  });
  assert.equal(decidedCandidate.statusCode, 200, decidedCandidate.body);
  for (const [definitionId, value] of [
    ["shoulder_width", 44],
    ["chest_width", 52],
    ["sleeve_length", 60],
    ["body_length", 70],
  ] as const) {
    const measurement = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/skus/${acquiredItem.skuId}/measurements`,
      headers: { cookie },
      payload: {
        definitionId,
        definitionVersion: 1,
        value,
        unit: "cm",
        basis: "flat_width",
        state: "natural",
        measuredAt: new Date().toISOString(),
        evidenceAssetId: acquisitionAssets[0],
        attempt: 1,
        humanConfirmed: true,
      },
    });
    assert.equal(measurement.statusCode, 201, measurement.body);
  }
  const captureAdvanced = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/skus/${acquiredItem.skuId}/p0-actions`,
    headers: { cookie },
    payload: {
      action: "confirm_capture",
      evidenceReferenceIds: acquisitionAssets,
      manualChannelHandoff: false,
      idempotencyKey: randomUUID(),
      requiredFactsConfirmed: true,
    },
  });
  assert.equal(captureAdvanced.statusCode, 200, captureAdvanced.body);
  for (const [index, price] of [3200, 3500, 4100].entries()) {
    const reference = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/skus/${acquiredItem.skuId}/market-references`,
      headers: { cookie },
      payload: {
        sourceUrl: `https://example.test/manual-reference-${index + 1}`,
        displayedPriceMinor: price,
        soldState: true,
        itemCondition: "目立った傷なし",
        shippingBasis: "included",
        included: true,
        exclusionReason: null,
        checkedAt: new Date(Date.now() + index).toISOString(),
        humanConfirmed: true,
      },
    });
    assert.equal(reference.statusCode, 201, reference.body);
  }
  const research = await app.inject({
    method: "GET",
    url: `/v1/workspaces/${owner.workspaceId}/skus/${acquiredItem.skuId}/research`,
    headers: { cookie },
  });
  assert.equal(research.statusCode, 200, research.body);
  assert.equal(
    research.json<{ displayedPriceMedianMinor: number }>().displayedPriceMedianMinor,
    3500,
  );
  const capturedReadModel = await app.inject({
    method: "GET",
    url: `/v1/workspaces/${owner.workspaceId}/p0-items`,
    headers: { cookie },
  });
  assert.equal(capturedReadModel.statusCode, 200, capturedReadModel.body);
  const reloadedItem = capturedReadModel
    .json<
      Array<{
        skuId: string;
        capture: {
          measurements: Array<{ definitionId: string; value: number }>;
          confirmedAt: string;
        };
        listingCandidate: {
          text: string;
          referenceIds: string[];
          unconfirmedFields: string[];
          status: string;
        };
      }>
    >()
    .find((item) => item.skuId === acquiredItem.skuId);
  assert.ok(reloadedItem);
  assert.equal(reloadedItem.capture.measurements.length, 4);
  assert.equal(reloadedItem.listingCandidate.text.includes("肩幅44cm"), true);
  assert.deepEqual(reloadedItem.listingCandidate.unconfirmedFields, []);
  assert.equal(reloadedItem.listingCandidate.status, "candidate");
  const pilotReworkEvent = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/pilot-runs/${pilotRunId}/events`,
    headers: { cookie },
    payload: {
      eventType: "measurement_rework",
      detailCode: "difference_over_two_cm",
      idempotencyKey: randomUUID(),
      humanConfirmed: true,
    },
  });
  assert.equal(pilotReworkEvent.statusCode, 201, pilotReworkEvent.body);
  const listingAdvanced = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/skus/${acquiredItem.skuId}/p0-actions`,
    headers: { cookie },
    payload: {
      action: "confirm_listing",
      evidenceReferenceIds: reloadedItem.listingCandidate.referenceIds,
      manualChannelHandoff: true,
      idempotencyKey: randomUUID(),
      requiredFactsConfirmed: true,
    },
  });
  assert.equal(listingAdvanced.statusCode, 200, listingAdvanced.body);
  const pilotAfterFirstItem = await app.inject({
    method: "GET",
    url: `/v1/workspaces/${owner.workspaceId}/pilot-runs/latest`,
    headers: { cookie },
  });
  assert.equal(pilotAfterFirstItem.statusCode, 200, pilotAfterFirstItem.body);
  const pilotResult = pilotAfterFirstItem.json<{
    state: string;
    summary: {
      itemCount: number;
      completedItemCount: number;
      measurementReworkCount: number;
      passed: boolean | null;
    };
    items: Array<{ productFixtureId: string; copyReadyWorkflowVersion: number }>;
  }>();
  assert.equal(pilotResult.state, "active");
  assert.equal(pilotResult.summary.itemCount, 1);
  assert.equal(pilotResult.summary.completedItemCount, 1);
  assert.equal(pilotResult.summary.measurementReworkCount, 1);
  assert.equal(pilotResult.summary.passed, null);
  assert.equal(pilotResult.items[0]?.productFixtureId, "TOP-01");
  assert.equal(pilotResult.items[0]?.copyReadyWorkflowVersion, 4);
  const postConfirmationMedia = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/skus/${acquiredItem.skuId}/media-uploads?assetId=${randomUUID()}&role=flaw`,
    headers: { cookie, "content-type": "image/jpeg" },
    payload: jpegWithGpsMetadata(),
  });
  assert.equal(postConfirmationMedia.statusCode, 409, postConfirmationMedia.body);
  const postConfirmationMeasurement = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/skus/${acquiredItem.skuId}/measurements`,
    headers: { cookie },
    payload: {
      definitionId: "shoulder_width",
      definitionVersion: 1,
      value: 45,
      unit: "cm",
      basis: "flat_width",
      state: "natural",
      measuredAt: new Date().toISOString(),
      evidenceAssetId: acquisitionAssets[0],
      attempt: 2,
      humanConfirmed: true,
    },
  });
  assert.equal(postConfirmationMeasurement.statusCode, 409, postConfirmationMeasurement.body);
  const manualOrderWorkflowBypass = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/skus/${acquiredItem.skuId}/p0-actions`,
    headers: { cookie },
    payload: {
      action: "confirm_order",
      evidenceReferenceIds: [randomUUID()],
      manualChannelHandoff: false,
      idempotencyKey: randomUUID(),
      requiredFactsConfirmed: true,
    },
  });
  assert.equal(manualOrderWorkflowBypass.statusCode, 409, manualOrderWorkflowBypass.body);

  const created = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/skus`,
    headers: { cookie },
    payload: { skuCode: "SKU-DB-0001", title: "DB結合試験シャツ", category: "トップス" },
  });
  assert.equal(created.statusCode, 201, created.body);
  const skuId = created.json<{ id: string }>().id;

  const admin = postgres(adminUrl, { max: 1 });
  let otherWorkspaceId = "";
  try {
    const other = await admin<Array<{ id: string }>>`
      insert into workspace (name) values ('架空の別事業所') returning id
    `;
    otherWorkspaceId = other[0]?.id ?? "";
  } finally {
    await admin.end({ timeout: 5 });
  }
  assert.ok(otherWorkspaceId);
  const forbidden = await app.inject({
    method: "GET",
    url: `/v1/workspaces/${otherWorkspaceId}/inventory/summary`,
    headers: { cookie },
  });
  assert.equal(forbidden.statusCode, 403, forbidden.body);
  const foreignOwnerPulse = await app.inject({
    method: "GET",
    url: `/v1/workspaces/${otherWorkspaceId}/owner-pulse`,
    headers: { cookie },
  });
  assert.equal(foreignOwnerPulse.statusCode, 403, foreignOwnerPulse.body);

  const rootLocationId = randomUUID();
  const binAId = randomUUID();
  const binBId = randomUUID();
  const capacityBinId = randomUUID();
  const returnBinId = randomUUID();
  const unitOneId = randomUUID();
  const unitTwoId = randomUUID();
  const unitThreeId = randomUUID();
  const unitFourId = randomUUID();
  const unitFiveId = randomUUID();
  const itemLabelOneId = randomUUID();
  const itemLabelTwoId = randomUUID();
  const itemLabelThreeId = randomUUID();
  const itemLabelFourId = randomUUID();
  const itemLabelFiveId = randomUUID();
  const binALabelId = randomUUID();
  const binBLabelId = randomUUID();
  const capacityBinLabelId = randomUUID();
  const returnBinLabelId = randomUUID();
  const workerPassword = "fictional-field-worker-password";
  const shippingPassword = "fictional-shipping-password";
  const managerPassword = "fictional-inventory-manager-password";
  const accountingPassword = "fictional-accounting-password";
  const workerMember = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/team/members`,
    headers: { cookie },
    payload: {
      displayName: "架空在庫担当",
      email: "worker@example.test",
      initialPassword: workerPassword,
      role: "field_worker",
      humanConfirmed: true,
    },
  });
  assert.equal(workerMember.statusCode, 201, workerMember.body);
  const workerId = workerMember.json<{ identityId: string }>().identityId;
  assert.equal(workerMember.body.includes(workerPassword), false);
  const shippingMember = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/team/members`,
    headers: { cookie },
    payload: {
      displayName: "架空配送担当",
      email: "shipping@example.test",
      initialPassword: shippingPassword,
      role: "shipping",
      humanConfirmed: true,
    },
  });
  assert.equal(shippingMember.statusCode, 201, shippingMember.body);
  const shippingId = shippingMember.json<{ identityId: string }>().identityId;
  assert.ok(shippingId);
  assert.equal(shippingMember.body.includes(shippingPassword), false);
  const managerMember = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/team/members`,
    headers: { cookie },
    payload: {
      displayName: "架空棚卸責任者",
      email: "manager@example.test",
      initialPassword: managerPassword,
      role: "inventory_manager",
      humanConfirmed: true,
    },
  });
  assert.equal(managerMember.statusCode, 201, managerMember.body);
  assert.ok(managerMember.json<{ identityId: string }>().identityId);
  const accountingMember = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/team/members`,
    headers: { cookie },
    payload: {
      displayName: "架空会計担当",
      email: "accounting@example.test",
      initialPassword: accountingPassword,
      role: "accounting",
      humanConfirmed: true,
    },
  });
  assert.equal(accountingMember.statusCode, 201, accountingMember.body);
  const accountingId = accountingMember.json<{ identityId: string }>().identityId;
  assert.ok(accountingId);

  const workerLogin = await app.inject({
    method: "POST",
    url: "/v1/session/login",
    payload: { email: "worker@example.test", password: workerPassword },
  });
  assert.equal(workerLogin.statusCode, 204, workerLogin.body);
  const workerSetCookie = workerLogin.headers["set-cookie"];
  assert.equal(typeof workerSetCookie, "string");
  const workerCookie = String(workerSetCookie).split(";", 1)[0];
  const workerContext = await app.inject({
    method: "GET",
    url: "/v1/session/context",
    headers: { cookie: workerCookie },
  });
  assert.equal(workerContext.statusCode, 200, workerContext.body);
  assert.equal(workerContext.json<{ role: string }>().role, "field_worker");
  const workerOwnerPulse = await app.inject({
    method: "GET",
    url: `/v1/workspaces/${owner.workspaceId}/owner-pulse`,
    headers: { cookie: workerCookie },
  });
  assert.equal(workerOwnerPulse.statusCode, 403, workerOwnerPulse.body);
  const shippingLogin = await app.inject({
    method: "POST",
    url: "/v1/session/login",
    payload: { email: "shipping@example.test", password: shippingPassword },
  });
  assert.equal(shippingLogin.statusCode, 204, shippingLogin.body);
  const shippingSetCookie = shippingLogin.headers["set-cookie"];
  assert.equal(typeof shippingSetCookie, "string");
  const shippingCookie = String(shippingSetCookie).split(";", 1)[0];
  const managerLogin = await app.inject({
    method: "POST",
    url: "/v1/session/login",
    payload: { email: "manager@example.test", password: managerPassword },
  });
  assert.equal(managerLogin.statusCode, 204, managerLogin.body);
  const managerSetCookie = managerLogin.headers["set-cookie"];
  assert.equal(typeof managerSetCookie, "string");
  const managerCookie = String(managerSetCookie).split(";", 1)[0];
  const accountingLogin = await app.inject({
    method: "POST",
    url: "/v1/session/login",
    payload: { email: "accounting@example.test", password: accountingPassword },
  });
  assert.equal(accountingLogin.statusCode, 204, accountingLogin.body);
  const accountingSetCookie = accountingLogin.headers["set-cookie"];
  assert.equal(typeof accountingSetCookie, "string");
  const accountingCookie = String(accountingSetCookie).split(";", 1)[0];
  const workerCreateSku = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/skus`,
    headers: { cookie: workerCookie },
    payload: { skuCode: "SKU-WORKER-DENIED", title: "拒否確認", category: "試験" },
  });
  assert.equal(workerCreateSku.statusCode, 403, workerCreateSku.body);
  const ownerPurchaseApproval = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/skus/${skuId}/p0-actions`,
    headers: { cookie },
    payload: {
      action: "confirm_purchase",
      idempotencyKey: randomUUID(),
      evidenceReferenceIds: [randomUUID()],
      requiredFactsConfirmed: true,
      manualChannelHandoff: false,
    },
  });
  assert.equal(ownerPurchaseApproval.statusCode, 200, ownerPurchaseApproval.body);

  const captureAssetId = randomUUID();
  const captureAssetUrl = `/v1/workspaces/${owner.workspaceId}/skus/${skuId}/media-uploads?assetId=${captureAssetId}&role=front`;
  const workerMediaWithoutAssignment = await app.inject({
    method: "POST",
    url: captureAssetUrl,
    headers: { cookie: workerCookie, "content-type": "image/jpeg" },
    payload: jpegWithGpsMetadata(),
  });
  assert.equal(workerMediaWithoutAssignment.statusCode, 403, workerMediaWithoutAssignment.body);
  const workerMeasurementWithoutAssignment = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/skus/${skuId}/measurements`,
    headers: { cookie: workerCookie },
    payload: {
      definitionId: "chest_width",
      definitionVersion: 1,
      value: 52,
      unit: "cm",
      basis: "flat_width",
      state: "natural",
      measuredAt: new Date().toISOString(),
      evidenceAssetId: captureAssetId,
      attempt: 1,
      humanConfirmed: true,
    },
  });
  assert.equal(
    workerMeasurementWithoutAssignment.statusCode,
    403,
    workerMeasurementWithoutAssignment.body,
  );
  const workerCaptureWithoutAssignment = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/skus/${skuId}/p0-actions`,
    headers: { cookie: workerCookie },
    payload: {
      action: "confirm_capture",
      idempotencyKey: randomUUID(),
      evidenceReferenceIds: [captureAssetId],
      requiredFactsConfirmed: true,
      manualChannelHandoff: false,
    },
  });
  assert.equal(workerCaptureWithoutAssignment.statusCode, 403, workerCaptureWithoutAssignment.body);

  const captureAssignment = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/team/assignments`,
    headers: { cookie },
    payload: {
      identityId: workerId,
      assignmentType: "capture",
      targetId: skuId,
      startsAt: new Date(Date.now() - 60_000).toISOString(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      humanConfirmed: true,
    },
  });
  assert.equal(captureAssignment.statusCode, 201, captureAssignment.body);
  const assignedCaptureTasks = await app.inject({
    method: "GET",
    url: `/v1/workspaces/${owner.workspaceId}/capture-tasks`,
    headers: { cookie: workerCookie },
  });
  assert.equal(assignedCaptureTasks.statusCode, 200, assignedCaptureTasks.body);
  assert.deepEqual(
    assignedCaptureTasks.json<Array<{ skuId: string }>>().map((task) => task.skuId),
    [skuId],
  );
  assert.equal(assignedCaptureTasks.body.includes("allocatedCostMinor"), false);
  const workerMediaWithAssignment = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/skus/${skuId}/media-uploads?assetId=${captureAssetId}&role=front`,
    headers: { cookie: workerCookie, "content-type": "image/jpeg" },
    payload: jpegWithGpsMetadata(),
  });
  assert.equal(workerMediaWithAssignment.statusCode, 201, workerMediaWithAssignment.body);
  assert.equal(workerMediaWithAssignment.body.includes("originalStorageKey"), false);
  const workerMeasurementWithAssignment = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/skus/${skuId}/measurements`,
    headers: { cookie: workerCookie },
    payload: {
      definitionId: "chest_width",
      definitionVersion: 1,
      value: 52,
      unit: "cm",
      basis: "flat_width",
      state: "natural",
      measuredAt: new Date().toISOString(),
      evidenceAssetId: captureAssetId,
      attempt: 1,
      humanConfirmed: true,
    },
  });
  assert.equal(
    workerMeasurementWithAssignment.statusCode,
    201,
    workerMeasurementWithAssignment.body,
  );
  const workerCaptureWithAssignment = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/skus/${skuId}/p0-actions`,
    headers: { cookie: workerCookie },
    payload: {
      action: "confirm_capture",
      idempotencyKey: randomUUID(),
      evidenceReferenceIds: [captureAssetId],
      requiredFactsConfirmed: true,
      manualChannelHandoff: false,
    },
  });
  assert.equal(workerCaptureWithAssignment.statusCode, 409, workerCaptureWithAssignment.body);

  const remainingWorkerAssets = [
    { assetId: randomUUID(), role: "back" },
    { assetId: randomUUID(), role: "brand_tag" },
    { assetId: randomUUID(), role: "care_label" },
  ] as const;
  for (const asset of remainingWorkerAssets) {
    const uploaded = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/skus/${skuId}/media-uploads?assetId=${asset.assetId}&role=${asset.role}`,
      headers: { cookie: workerCookie, "content-type": "image/jpeg" },
      payload: jpegWithGpsMetadata(),
    });
    assert.equal(uploaded.statusCode, 201, uploaded.body);
  }
  const remainingWorkerMeasurements = [
    ["shoulder_width", 44],
    ["sleeve_length", 61],
    ["body_length", 70],
  ] as const;
  for (const [definitionId, value] of remainingWorkerMeasurements) {
    const measured = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/skus/${skuId}/measurements`,
      headers: { cookie: workerCookie },
      payload: {
        definitionId,
        definitionVersion: 1,
        value,
        unit: "cm",
        basis: "length",
        state: "natural",
        measuredAt: new Date().toISOString(),
        evidenceAssetId: captureAssetId,
        attempt: 1,
        humanConfirmed: true,
      },
    });
    assert.equal(measured.statusCode, 201, measured.body);
  }
  const workerCaptureComplete = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/skus/${skuId}/p0-actions`,
    headers: { cookie: workerCookie },
    payload: {
      action: "confirm_capture",
      idempotencyKey: randomUUID(),
      evidenceReferenceIds: [
        captureAssetId,
        ...remainingWorkerAssets.map((asset) => asset.assetId),
      ],
      requiredFactsConfirmed: true,
      manualChannelHandoff: false,
    },
  });
  assert.equal(workerCaptureComplete.statusCode, 200, workerCaptureComplete.body);

  const workerPurchaseApproval = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/skus/${skuId}/p0-actions`,
    headers: { cookie: workerCookie },
    payload: {
      action: "confirm_purchase",
      idempotencyKey: randomUUID(),
      evidenceReferenceIds: [randomUUID()],
      requiredFactsConfirmed: true,
      manualChannelHandoff: false,
    },
  });
  assert.equal(workerPurchaseApproval.statusCode, 409, workerPurchaseApproval.body);

  const inventory = postgres(runtimeUrl, { max: 8 });
  try {
    await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`
        insert into location_node (
          id, workspace_id, parent_id, code, name, depth, can_store_inventory,
          single_item_only, allow_mixed_sku, max_units
        ) values
          (${rootLocationId}, ${owner.workspaceId}, null, ${appendCodeCheckDigit("ROOM-01")}, '架空保管室', 0, false, false, true, null),
          (${binAId}, ${owner.workspaceId}, ${rootLocationId}, ${appendCodeCheckDigit("BIN-A")}, '棚A-1', 1, true, false, false, 3),
          (${binBId}, ${owner.workspaceId}, ${rootLocationId}, ${appendCodeCheckDigit("BIN-B")}, '棚B-1', 1, true, true, false, 1),
          (${capacityBinId}, ${owner.workspaceId}, ${rootLocationId}, ${appendCodeCheckDigit("BIN-C")}, '同時格納試験棚', 1, true, true, false, 1),
          (${returnBinId}, ${owner.workspaceId}, ${rootLocationId}, ${appendCodeCheckDigit("RETURN-01")}, '返品隔離棚', 1, true, false, true, 20)
      `;
      await transaction`
        insert into inventory_unit (id, workspace_id, sku_id, inventory_number) values
          (${unitOneId}, ${owner.workspaceId}, ${skuId}, ${appendCodeCheckDigit("INV-900001")}),
          (${unitTwoId}, ${owner.workspaceId}, ${skuId}, ${appendCodeCheckDigit("INV-900002")}),
          (${unitThreeId}, ${owner.workspaceId}, ${skuId}, ${appendCodeCheckDigit("INV-900003")}),
          (${unitFourId}, ${owner.workspaceId}, ${skuId}, ${appendCodeCheckDigit("INV-900004")}),
          (${unitFiveId}, ${owner.workspaceId}, ${skuId}, ${appendCodeCheckDigit("INV-900005")})
      `;
      await transaction`
        insert into inventory_label (
          id, workspace_id, target_type, target_id, label_kind, version,
          token_hash, short_code, issued_by
        ) values
          (${itemLabelOneId}, ${owner.workspaceId}, 'inventory_unit', ${unitOneId}, 'qr', 1, ${hashFixture("item-1")}, ${appendCodeCheckDigit("INV-900001")}, ${owner.identityId}),
          (${itemLabelTwoId}, ${owner.workspaceId}, 'inventory_unit', ${unitTwoId}, 'qr', 1, ${hashFixture("item-2")}, ${appendCodeCheckDigit("INV-900002")}, ${owner.identityId}),
          (${itemLabelThreeId}, ${owner.workspaceId}, 'inventory_unit', ${unitThreeId}, 'qr', 1, ${hashFixture("item-3")}, ${appendCodeCheckDigit("INV-900003")}, ${owner.identityId}),
          (${itemLabelFourId}, ${owner.workspaceId}, 'inventory_unit', ${unitFourId}, 'qr', 1, ${hashFixture("item-4")}, ${appendCodeCheckDigit("INV-900004")}, ${owner.identityId}),
          (${itemLabelFiveId}, ${owner.workspaceId}, 'inventory_unit', ${unitFiveId}, 'qr', 1, ${hashFixture("item-5")}, ${appendCodeCheckDigit("INV-900005")}, ${owner.identityId}),
          (${binALabelId}, ${owner.workspaceId}, 'location', ${binAId}, 'qr', 1, ${hashFixture("bin-a")}, ${appendCodeCheckDigit("BIN-A")}, ${owner.identityId}),
          (${binBLabelId}, ${owner.workspaceId}, 'location', ${binBId}, 'qr', 1, ${hashFixture("bin-b")}, ${appendCodeCheckDigit("BIN-B")}, ${owner.identityId}),
          (${capacityBinLabelId}, ${owner.workspaceId}, 'location', ${capacityBinId}, 'qr', 1, ${hashFixture("bin-c")}, ${appendCodeCheckDigit("BIN-C")}, ${owner.identityId}),
          (${returnBinLabelId}, ${owner.workspaceId}, 'location', ${returnBinId}, 'qr', 1, ${hashFixture("return-bin")}, ${appendCodeCheckDigit("RETURN-01")}, ${owner.identityId})
      `;
    });

    await assert.rejects(
      () =>
        inventory.begin(async (transaction) => {
          await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
          await transaction`
            insert into scan_session (
              id, workspace_id, operation, inventory_unit_id, expected_location_id,
              destination_location_id, inventory_label_id, inventory_label_version,
              location_label_id, location_label_version, inventory_scanned_at,
              location_scanned_at, confirmed_by, confirmed_at
            ) values (
              ${randomUUID()}, ${owner.workspaceId}, 'putaway', ${unitTwoId}, null,
              ${binBId}, ${itemLabelOneId}, 1, ${binBLabelId}, 1,
              now(), now(), ${owner.identityId}, now()
            )
          `;
        }),
      /inventory label is invalid/u,
    );

    const apiPutawayStart = Date.now();
    const apiPutawayPayload = {
      inventoryNumber: appendCodeCheckDigit("INV-900002"),
      locationCode: appendCodeCheckDigit("BIN-B"),
      inventoryLabelVersion: 1,
      locationLabelVersion: 1,
      inventoryScannedAt: new Date(apiPutawayStart).toISOString(),
      locationScannedAt: new Date(apiPutawayStart + 1).toISOString(),
      confirmedAt: new Date(apiPutawayStart + 2).toISOString(),
      idempotencyKey: "88888888-8888-4888-8888-888888888888",
      humanConfirmed: true,
    } as const;
    const workerPutawayWithoutAssignment = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/inventory/putaway`,
      headers: { cookie: workerCookie },
      payload: apiPutawayPayload,
    });
    assert.equal(
      workerPutawayWithoutAssignment.statusCode,
      403,
      workerPutawayWithoutAssignment.body,
    );

    for (const assignment of [
      { assignmentType: "location_putaway", targetId: binBId },
      { assignmentType: "location_photo", targetId: binBId },
      { assignmentType: "inventory_putaway", targetId: unitTwoId },
    ] as const) {
      const assigned = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${owner.workspaceId}/team/assignments`,
        headers: { cookie },
        payload: {
          identityId: workerId,
          ...assignment,
          startsAt: new Date(Date.now() - 60_000).toISOString(),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          humanConfirmed: true,
        },
      });
      assert.equal(assigned.statusCode, 201, assigned.body);
    }
    const workerPutawayCatalog = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/inventory/putaway-catalog`,
      headers: { cookie: workerCookie },
    });
    assert.equal(workerPutawayCatalog.statusCode, 200, workerPutawayCatalog.body);
    assert.deepEqual(
      workerPutawayCatalog
        .json<{ locations: Array<{ code: string }> }>()
        .locations.map((row) => row.code),
      [appendCodeCheckDigit("BIN-B")],
    );
    assert.deepEqual(
      workerPutawayCatalog
        .json<{ inventory: Array<{ inventoryNumber: string }> }>()
        .inventory.map((row) => row.inventoryNumber),
      [appendCodeCheckDigit("INV-900002")],
    );
    const workerPutawayOutsideBranch = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/inventory/putaway`,
      headers: { cookie: workerCookie },
      payload: {
        ...apiPutawayPayload,
        inventoryNumber: appendCodeCheckDigit("INV-900001"),
        locationCode: appendCodeCheckDigit("BIN-A"),
        idempotencyKey: "99999999-9999-4999-8999-999999999999",
      },
    });
    assert.equal(workerPutawayOutsideBranch.statusCode, 403, workerPutawayOutsideBranch.body);

    const apiPutaway = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/inventory/putaway`,
      headers: { cookie: workerCookie },
      payload: apiPutawayPayload,
    });
    assert.equal(apiPutaway.statusCode, 201, apiPutaway.body);
    assert.deepEqual(apiPutaway.json(), {
      inventoryUnitId: unitTwoId,
      inventoryNumber: appendCodeCheckDigit("INV-900002"),
      status: "available",
      locationId: binBId,
      locationCode: appendCodeCheckDigit("BIN-B"),
      movementSequence: 1,
      scanSessionId: apiPutaway.json<{ scanSessionId: string }>().scanSessionId,
      idempotencyKey: apiPutawayPayload.idempotencyKey,
      syncedAt: apiPutaway.json<{ syncedAt: string }>().syncedAt,
    });
    const apiPutawayReplay = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/inventory/putaway`,
      headers: { cookie: workerCookie },
      payload: apiPutawayPayload,
    });
    assert.equal(apiPutawayReplay.statusCode, 201, apiPutawayReplay.body);
    assert.deepEqual(apiPutawayReplay.json(), apiPutaway.json());
    const apiPutawayConflict = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/inventory/putaway`,
      headers: { cookie: workerCookie },
      payload: { ...apiPutawayPayload, locationCode: appendCodeCheckDigit("BIN-A") },
    });
    assert.equal(apiPutawayConflict.statusCode, 409, apiPutawayConflict.body);

    const locationPhotoId = randomUUID();
    const locationPhotoBytes = jpegWithGpsMetadata();
    const locationPhotoQuery = (photoId: string, originalAssetId: string) =>
      new URLSearchParams({
        photoId,
        originalAssetId,
        photoKind: "exact_position",
        capturedAt: new Date().toISOString(),
        humanConfirmed: "true",
      }).toString();
    const outsidePhotoId = randomUUID();
    const outsideLocationPhoto = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/locations/${binAId}/photos?${locationPhotoQuery(outsidePhotoId, randomUUID())}`,
      headers: { cookie: workerCookie, "content-type": "image/jpeg" },
      payload: locationPhotoBytes,
    });
    assert.equal(outsideLocationPhoto.statusCode, 403, outsideLocationPhoto.body);
    const photoCollectionUrl = `/v1/workspaces/${owner.workspaceId}/locations/${binBId}/photos`;
    const capturedLocationPhoto = await app.inject({
      method: "POST",
      url: `${photoCollectionUrl}?${locationPhotoQuery(locationPhotoId, randomUUID())}`,
      headers: { cookie: workerCookie, "content-type": "image/jpeg" },
      payload: locationPhotoBytes,
    });
    assert.equal(capturedLocationPhoto.statusCode, 201, capturedLocationPhoto.body);
    assert.equal(capturedLocationPhoto.json<{ reviewState: string }>().reviewState, "pending");
    const reviewQueue = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/locations/${binBId}/photo-review-queue`,
      headers: { cookie },
    });
    assert.equal(reviewQueue.statusCode, 200, reviewQueue.body);
    assert.equal(reviewQueue.json<Array<{ reviewState: string }>>()[0]?.reviewState, "pending");
    assert.equal(reviewQueue.body.includes("StorageKey"), false);
    const pendingLocationPhotos = await app.inject({
      method: "GET",
      url: photoCollectionUrl,
      headers: { cookie: workerCookie },
    });
    assert.deepEqual(pendingLocationPhotos.json(), []);
    const approvedLocationPhoto = await app.inject({
      method: "POST",
      url: `${photoCollectionUrl}/${locationPhotoId}/approval`,
      headers: { cookie },
      payload: {
        reviewedAt: new Date().toISOString(),
        humanApproved: true,
      },
    });
    assert.equal(approvedLocationPhoto.statusCode, 200, approvedLocationPhoto.body);
    assert.deepEqual(approvedLocationPhoto.json<{ reviewState: string; gpsExifCount: number }>(), {
      ...approvedLocationPhoto.json(),
      reviewState: "approved",
      gpsExifCount: 0,
    });
    const visibleLocationPhotos = await app.inject({
      method: "GET",
      url: photoCollectionUrl,
      headers: { cookie: workerCookie },
    });
    assert.equal(visibleLocationPhotos.statusCode, 200, visibleLocationPhotos.body);
    assert.equal(visibleLocationPhotos.json<unknown[]>().length, 1);
    assert.equal(visibleLocationPhotos.body.includes("originalStorageKey"), false);
    assert.equal(visibleLocationPhotos.body.includes("derivativeStorageKey"), false);
    const photoContentUrl =
      visibleLocationPhotos.json<Array<{ contentUrl: string }>>()[0]?.contentUrl;
    assert.ok(photoContentUrl);
    const photoContent = await app.inject({
      method: "GET",
      url: photoContentUrl,
      headers: { cookie: workerCookie },
    });
    assert.equal(photoContent.statusCode, 200, photoContent.body);
    assert.equal(photoContent.headers["cache-control"], "private, no-store");
    assert.equal(photoContent.rawPayload.toString("utf8").includes("GPSLatitude"), false);
    await assert.rejects(
      () =>
        inventory.begin(async (transaction) => {
          await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
          await transaction`
            update location_photo set original_sha256 = ${hashFixture("tampered")}
            where workspace_id = ${owner.workspaceId} and id = ${locationPhotoId}
          `;
        }),
      /location photo original metadata is immutable/u,
    );

    async function putaway(
      unitId: string,
      itemLabelId: string,
      destinationId: string,
      destinationLabelId: string,
      idempotencyKey: string,
    ): Promise<string> {
      return inventory.begin(async (transaction) => {
        await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
        const scanSessionId = randomUUID();
        await transaction`
          insert into scan_session (
            id, workspace_id, operation, inventory_unit_id, expected_location_id,
            destination_location_id, inventory_label_id, inventory_label_version,
            location_label_id, location_label_version, inventory_scanned_at,
            location_scanned_at, confirmed_by, confirmed_at
          ) values (
            ${scanSessionId}, ${owner.workspaceId}, 'putaway', ${unitId}, null,
            ${destinationId}, ${itemLabelId}, 1, ${destinationLabelId}, 1,
            now(), now(), ${owner.identityId}, now()
          )
        `;
        await transaction`
          insert into inventory_movement (
            workspace_id, inventory_unit_id, movement_seq, from_location_id,
            to_location_id, movement_kind, scan_session_id, idempotency_key,
            payload_hash, moved_by
          ) values (
            ${owner.workspaceId}, ${unitId}, 1, null, ${destinationId}, 'putaway',
            ${scanSessionId}, ${idempotencyKey}, ${hashFixture(idempotencyKey)}, ${owner.identityId}
          )
        `;
        return scanSessionId;
      });
    }

    async function moveAvailableUnit(
      unitId: string,
      itemLabelId: string,
      itemLabelVersion: number,
      destinationId: string,
      destinationLabelId: string,
      destinationLabelVersion: number,
      idempotencyKey: string,
    ): Promise<number> {
      return inventory.begin(async (transaction) => {
        await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
        await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
        const [unit] = await transaction<Array<{ location_id: string; movement_seq: number }>>`
          select location_id, movement_seq::integer as movement_seq
          from inventory_unit
          where workspace_id = ${owner.workspaceId} and id = ${unitId}
            and status = 'available'
        `;
        assert.ok(unit, "An available inventory unit is required for a guarded move");
        const scanSessionId = randomUUID();
        await transaction`
          insert into scan_session (
            id, workspace_id, operation, inventory_unit_id, expected_location_id,
            destination_location_id, inventory_label_id, inventory_label_version,
            location_label_id, location_label_version, inventory_scanned_at,
            location_scanned_at, confirmed_by, confirmed_at
          ) values (
            ${scanSessionId}, ${owner.workspaceId}, 'move', ${unitId}, ${unit.location_id},
            ${destinationId}, ${itemLabelId}, ${itemLabelVersion}, ${destinationLabelId},
            ${destinationLabelVersion}, now(), now(), ${owner.identityId}, now()
          )
        `;
        const nextSequence = unit.movement_seq + 1;
        await transaction`
          insert into inventory_movement (
            workspace_id, inventory_unit_id, movement_seq, from_location_id,
            to_location_id, movement_kind, scan_session_id, idempotency_key,
            payload_hash, moved_by
          ) values (
            ${owner.workspaceId}, ${unitId}, ${nextSequence}, ${unit.location_id},
            ${destinationId}, 'move', ${scanSessionId}, ${idempotencyKey},
            ${hashFixture(idempotencyKey)}, ${owner.identityId}
          )
        `;
        return nextSequence;
      });
    }

    const firstScanId = await putaway(
      unitOneId,
      itemLabelOneId,
      binAId,
      binALabelId,
      "putaway-unit-one",
    );
    const firstUnit = await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      return transaction<Array<{ status: string; location_id: string; movement_seq: number }>>`
        select status, location_id, movement_seq::integer as movement_seq from inventory_unit
        where workspace_id = ${owner.workspaceId} and id = ${unitOneId}
      `;
    });
    assert.deepEqual(firstUnit[0], { status: "available", location_id: binAId, movement_seq: 1 });

    await assert.rejects(
      () =>
        inventory.begin(async (transaction) => {
          await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
          await transaction`
            insert into inventory_movement (
              workspace_id, inventory_unit_id, movement_seq, from_location_id,
              to_location_id, movement_kind, scan_session_id, idempotency_key,
              payload_hash, moved_by
            ) values (
              ${owner.workspaceId}, ${unitOneId}, 2, ${binAId}, ${binAId}, 'putaway',
              ${firstScanId}, 'reuse-scan', ${hashFixture("reuse-scan")}, ${owner.identityId}
            )
          `;
        }),
      /scan_session_id|already consumed|duplicate key/u,
    );

    const simultaneousPutaway = await Promise.allSettled([
      putaway(
        unitThreeId,
        itemLabelThreeId,
        capacityBinId,
        capacityBinLabelId,
        "putaway-capacity-one",
      ),
      putaway(
        unitFourId,
        itemLabelFourId,
        capacityBinId,
        capacityBinLabelId,
        "putaway-capacity-two",
      ),
    ]);
    assert.equal(simultaneousPutaway.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(simultaneousPutaway.filter((result) => result.status === "rejected").length, 1);

    await putaway(
      unitFiveId,
      itemLabelFiveId,
      binAId,
      binALabelId,
      "putaway-unit-five-for-stocktake-movement",
    );

    const firstOrderId = randomUUID();
    const secondOrderId = randomUUID();
    await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`
        insert into sales_order (id, workspace_id, order_number, state) values
          (${firstOrderId}, ${owner.workspaceId}, 'ORDER-DB-1', 'confirmed'),
          (${secondOrderId}, ${owner.workspaceId}, 'ORDER-DB-2', 'confirmed')
      `;
    });
    const simultaneousAllocation = await Promise.allSettled([
      inventory.begin(async (transaction) => {
        await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
        await transaction`
          insert into order_allocation (workspace_id, order_id, inventory_unit_id)
          values (${owner.workspaceId}, ${firstOrderId}, ${unitOneId})
        `;
      }),
      inventory.begin(async (transaction) => {
        await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
        await transaction`
          insert into order_allocation (workspace_id, order_id, inventory_unit_id)
          values (${owner.workspaceId}, ${secondOrderId}, ${unitOneId})
        `;
      }),
    ]);
    assert.equal(
      simultaneousAllocation.filter((result) => result.status === "fulfilled").length,
      1,
    );
    assert.equal(simultaneousAllocation.filter((result) => result.status === "rejected").length, 1);

    await assert.rejects(
      () =>
        inventory.begin(async (transaction) => {
          await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
          await transaction`
            update inventory_unit set status = 'available'
            where workspace_id = ${owner.workspaceId} and id = ${unitOneId}
          `;
        }),
      /permission denied/u,
    );

    const stocktakeStarted = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/stocktakes`,
      headers: { cookie },
      payload: { locationId: binAId, humanConfirmed: true },
    });
    assert.equal(stocktakeStarted.statusCode, 201, stocktakeStarted.body);
    assert.equal(
      stocktakeStarted.json<{ confirmationMode: string }>().confirmationMode,
      "dual_actor",
    );
    const countSessionId = stocktakeStarted.json<{ stocktakeId: string }>().stocktakeId;
    const stocktakeSnapshot = await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      return transaction<Array<{ inventory_unit_id: string; expected_location_id: string }>>`
        select inventory_unit_id, expected_location_id
        from count_session_inventory_snapshot
        where workspace_id = ${owner.workspaceId} and count_session_id = ${countSessionId}
        order by inventory_unit_id
      `;
    });
    assert.deepEqual(
      [...stocktakeSnapshot],
      [
        { inventory_unit_id: unitFiveId, expected_location_id: binAId },
        { inventory_unit_id: unitOneId, expected_location_id: binAId },
      ].sort((left, right) => left.inventory_unit_id.localeCompare(right.inventory_unit_id)),
    );
    await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      const moveIncomingScanId = randomUUID();
      await transaction`
        insert into scan_session (
          id, workspace_id, operation, inventory_unit_id, expected_location_id,
          destination_location_id, inventory_label_id, inventory_label_version,
          location_label_id, location_label_version, inventory_scanned_at,
          location_scanned_at, confirmed_by, confirmed_at
        ) values (
          ${moveIncomingScanId}, ${owner.workspaceId}, 'move', ${unitTwoId}, ${binBId},
          ${binAId}, ${itemLabelTwoId}, 1, ${binALabelId}, 1,
          now(), now(), ${owner.identityId}, now()
        )
      `;
      await transaction`
        insert into inventory_movement (
          workspace_id, inventory_unit_id, movement_seq, from_location_id,
          to_location_id, movement_kind, scan_session_id, idempotency_key,
          payload_hash, moved_by
        ) values (
          ${owner.workspaceId}, ${unitTwoId}, 2, ${binBId}, ${binAId}, 'move',
          ${moveIncomingScanId}, 'move-in-after-stocktake-snapshot',
          ${hashFixture("move-in-after-stocktake-snapshot")}, ${owner.identityId}
        )
      `;
      const moveExpectedOutScanId = randomUUID();
      await transaction`
        insert into scan_session (
          id, workspace_id, operation, inventory_unit_id, expected_location_id,
          destination_location_id, inventory_label_id, inventory_label_version,
          location_label_id, location_label_version, inventory_scanned_at,
          location_scanned_at, confirmed_by, confirmed_at
        ) values (
          ${moveExpectedOutScanId}, ${owner.workspaceId}, 'move', ${unitFiveId}, ${binAId},
          ${returnBinId}, ${itemLabelFiveId}, 1, ${returnBinLabelId}, 1,
          now(), now(), ${owner.identityId}, now()
        )
      `;
      await transaction`
        insert into inventory_movement (
          workspace_id, inventory_unit_id, movement_seq, from_location_id,
          to_location_id, movement_kind, scan_session_id, idempotency_key,
          payload_hash, moved_by
        ) values (
          ${owner.workspaceId}, ${unitFiveId}, 2, ${binAId}, ${returnBinId}, 'move',
          ${moveExpectedOutScanId}, 'move-out-after-stocktake-snapshot',
          ${hashFixture("move-out-after-stocktake-snapshot")}, ${owner.identityId}
        )
      `;
    });
    const observationRequests = [
      {
        readResult: "readable",
        inventoryNumber: appendCodeCheckDigit("INV-900001"),
        observedAt: new Date().toISOString(),
        humanConfirmed: true,
      },
      {
        readResult: "readable",
        inventoryNumber: appendCodeCheckDigit("INV-900001"),
        observedAt: new Date().toISOString(),
        humanConfirmed: true,
      },
      {
        readResult: "readable",
        inventoryNumber: appendCodeCheckDigit("INV-999999"),
        observedAt: new Date().toISOString(),
        humanConfirmed: true,
      },
      {
        readResult: "unreadable",
        failureReason: "damaged_label",
        observedAt: new Date().toISOString(),
        humanConfirmed: true,
      },
    ] as const;
    for (const observation of observationRequests) {
      const observed = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${owner.workspaceId}/stocktakes/${countSessionId}/observations`,
        headers: { cookie },
        payload: observation,
      });
      assert.equal(observed.statusCode, 200, observed.body);
    }
    const stocktakeReconciled = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/stocktakes/${countSessionId}/reconcile`,
      headers: { cookie },
      payload: {},
    });
    assert.equal(stocktakeReconciled.statusCode, 200, stocktakeReconciled.body);
    const reconciledStocktake = stocktakeReconciled.json<{
      observations: Array<{ observedCode: string | null; result: string }>;
      postStartMovements: Array<{
        inventoryUnitId: string;
        expectedLocationId: string;
        currentLocationId: string | null;
        snapshotMovementSequence: number;
        currentMovementSequence: number;
      }>;
      discrepancies: Array<{ discrepancyId: string; inventoryUnitId: string | null }>;
    }>();
    assert.deepEqual(
      reconciledStocktake.observations.map((observation) => observation.result),
      ["matched", "duplicate", "unexpected", "unreadable"],
    );
    assert.equal(
      reconciledStocktake.observations[2]?.observedCode,
      appendCodeCheckDigit("INV-999999"),
    );
    assert.equal(reconciledStocktake.postStartMovements.length, 1);
    assert.deepEqual(
      {
        inventoryUnitId: reconciledStocktake.postStartMovements[0]?.inventoryUnitId,
        expectedLocationId: reconciledStocktake.postStartMovements[0]?.expectedLocationId,
        currentLocationId: reconciledStocktake.postStartMovements[0]?.currentLocationId,
        snapshotMovementSequence:
          reconciledStocktake.postStartMovements[0]?.snapshotMovementSequence,
        currentMovementSequence: reconciledStocktake.postStartMovements[0]?.currentMovementSequence,
      },
      {
        inventoryUnitId: unitFiveId,
        expectedLocationId: binAId,
        currentLocationId: returnBinId,
        snapshotMovementSequence: 1,
        currentMovementSequence: 2,
      },
    );
    const discrepancies = reconciledStocktake.discrepancies;
    assert.ok(discrepancies.length > 0);
    assert.equal(
      discrepancies.some((discrepancy) => discrepancy.inventoryUnitId === unitTwoId),
      false,
      "Inventory moved into the location after start must not enter the immutable snapshot",
    );
    assert.equal(
      discrepancies.some((discrepancy) => discrepancy.inventoryUnitId === unitFiveId),
      false,
      "Inventory normally moved out after start must be shown separately, not marked missing",
    );
    const discrepancyId = discrepancies[0]!.discrepancyId;
    const selfReconfirmation = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/stocktakes/${countSessionId}/discrepancies/${discrepancyId}/resolve`,
      headers: { cookie },
      payload: { resolution: "found_in_place", humanConfirmed: true },
    });
    assert.equal(selfReconfirmation.statusCode, 403, selfReconfirmation.body);
    for (const discrepancy of discrepancies) {
      const resolved = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${owner.workspaceId}/stocktakes/${countSessionId}/discrepancies/${discrepancy.discrepancyId}/resolve`,
        headers: { cookie: managerCookie },
        payload: { resolution: "found_in_place", humanConfirmed: true },
      });
      assert.equal(resolved.statusCode, 200, resolved.body);
    }
    const approvedStocktake = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/stocktakes/${countSessionId}/approve`,
      headers: { cookie: managerCookie },
      payload: { humanConfirmed: true },
    });
    assert.equal(approvedStocktake.statusCode, 200, approvedStocktake.body);
    assert.equal(approvedStocktake.json<{ state: string }>().state, "approved");
    const reissuedLabel = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/inventory-labels/reissue`,
      headers: { cookie },
      payload: {
        targetType: "inventory_unit",
        targetId: unitOneId,
        reasonCode: "damaged",
        humanConfirmed: true,
      },
    });
    assert.equal(reissuedLabel.statusCode, 201, reissuedLabel.body);
    assert.equal(reissuedLabel.json<{ version: number }>().version, 2);
    const labelVersions = await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      return transaction<Array<{ version: number; active: boolean }>>`
        select version, active from inventory_label
        where workspace_id = ${owner.workspaceId} and target_type = 'inventory_unit'
          and target_id = ${unitOneId} order by version
      `;
    });
    assert.deepEqual(
      [...labelVersions],
      [
        { version: 1, active: false },
        { version: 2, active: true },
      ],
    );
    const stalePutawayAt = Date.now();
    const staleLabelAttempt = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/inventory/putaway`,
      headers: { cookie },
      payload: {
        inventoryNumber: appendCodeCheckDigit("INV-900001"),
        locationCode: appendCodeCheckDigit("BIN-A"),
        inventoryLabelVersion: 1,
        locationLabelVersion: 1,
        inventoryScannedAt: new Date(stalePutawayAt).toISOString(),
        locationScannedAt: new Date(stalePutawayAt + 1).toISOString(),
        confirmedAt: new Date(stalePutawayAt + 2).toISOString(),
        idempotencyKey: randomUUID(),
        humanConfirmed: true,
      },
    });
    assert.equal(staleLabelAttempt.statusCode, 409, staleLabelAttempt.body);
    const staleLabelAudits = await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      return transaction<Array<{ reason_code: string; redacted_changes: unknown }>>`
        select reason_code, redacted_changes from audit_event
        where workspace_id = ${owner.workspaceId} and action = 'inventory.scan.rejected'
          and target_id = ${unitOneId}
      `;
    });
    assert.equal(staleLabelAudits.length, 1);
    assert.equal(staleLabelAudits[0]?.reason_code, "stale_label_version");

    const fictionalAddress = "〒100-0000 架空県テスト市サンプル1-2-3 架空太郎";
    const orderCreateKey = randomUUID();
    const orderCreatePayload = {
      orderNumber: "ORDER-P0-0001",
      skuId: acquiredItem.skuId,
      inventoryUnitId: acquiredItem.inventoryUnitId,
      saleAmountMinor: 5000,
      costAmountMinor: 1500,
      sellingFeeMinor: 500,
      shippingCostMinor: 750,
      packagingCostMinor: 100,
      taxBasis: "tax_included",
      sourceMeaning: "架空P0結合試験で人が確認した取引事実",
      occurredAt: new Date().toISOString(),
      shippingAddress: fictionalAddress,
      idempotencyKey: orderCreateKey,
      humanConfirmed: true,
    } as const;
    const createdOrder = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders`,
      headers: { cookie },
      payload: orderCreatePayload,
    });
    assert.equal(createdOrder.statusCode, 201, createdOrder.body);
    const orderResult = createdOrder.json<{
      orderId: string;
      state: string;
      inventoryStatus: string;
    }>();
    assert.equal(orderResult.state, "confirmed");
    assert.equal(orderResult.inventoryStatus, "reserved");
    const orderId = orderResult.orderId;
    const createReplay = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders`,
      headers: { cookie },
      payload: orderCreatePayload,
    });
    assert.equal(createReplay.statusCode, 201, createReplay.body);
    assert.equal(createReplay.json<{ orderId: string }>().orderId, orderId);
    const createConflict = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders`,
      headers: { cookie },
      payload: { ...orderCreatePayload, saleAmountMinor: 5001 },
    });
    assert.equal(createConflict.statusCode, 409, createConflict.body);

    const unassignedShippingLease = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/address-leases`,
      headers: { cookie: shippingCookie },
      payload: { purpose: "shipping_label", humanConfirmed: true },
    });
    assert.equal(unassignedShippingLease.statusCode, 403, unassignedShippingLease.body);
    const assignedShipping = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/assignment`,
      headers: { cookie },
      payload: {
        assigneeEmail: "shipping@example.test",
        startsAt: new Date(Date.now() - 60_000).toISOString(),
        expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
        humanConfirmed: true,
      },
    });
    assert.equal(assignedShipping.statusCode, 201, assignedShipping.body);
    const shippingAssignmentId = assignedShipping.json<{ assignmentId: string }>().assignmentId;
    const overlongShipping = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/assignment`,
      headers: { cookie },
      payload: {
        assigneeEmail: "shipping@example.test",
        startsAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000 + 1_000).toISOString(),
        humanConfirmed: true,
      },
    });
    assert.equal(overlongShipping.statusCode, 400, overlongShipping.body);
    const overlappingShipping = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/assignment`,
      headers: { cookie },
      payload: {
        assigneeEmail: "shipping@example.test",
        startsAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        humanConfirmed: true,
      },
    });
    assert.equal(overlappingShipping.statusCode, 409, overlappingShipping.body);
    const revokedShipping = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/team/assignments/${shippingAssignmentId}/revoke`,
      headers: { cookie },
      payload: {
        assignmentType: "shipping",
        reasonCode: "assignment_changed",
        humanConfirmed: true,
      },
    });
    assert.equal(revokedShipping.statusCode, 200, revokedShipping.body);
    const tasksAfterRevoke = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/shipping-tasks`,
      headers: { cookie: shippingCookie },
    });
    assert.deepEqual(tasksAfterRevoke.json<unknown[]>(), []);
    const leaseAfterRevoke = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/address-leases`,
      headers: { cookie: shippingCookie },
      payload: { purpose: "shipping_label", humanConfirmed: true },
    });
    assert.equal(leaseAfterRevoke.statusCode, 403, leaseAfterRevoke.body);
    const reassignedShipping = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/assignment`,
      headers: { cookie },
      payload: {
        assigneeEmail: "shipping@example.test",
        startsAt: new Date(Date.now() - 60_000).toISOString(),
        expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
        humanConfirmed: true,
      },
    });
    assert.equal(reassignedShipping.statusCode, 201, reassignedShipping.body);
    const shippingTasks = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/shipping-tasks`,
      headers: { cookie: shippingCookie },
    });
    assert.equal(shippingTasks.statusCode, 200, shippingTasks.body);
    assert.deepEqual(
      shippingTasks.json<Array<{ orderId: string }>>().map((task) => task.orderId),
      [orderId],
    );

    const firstLease = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/address-leases`,
      headers: { cookie },
      payload: { purpose: "shipping_label", humanConfirmed: true },
    });
    assert.equal(firstLease.statusCode, 201, firstLease.body);
    const firstLeaseId = firstLease.json<{ leaseId: string }>().leaseId;
    const addressView = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/address?leaseId=${firstLeaseId}`,
      headers: { cookie },
    });
    assert.equal(addressView.statusCode, 200, addressView.body);
    assert.equal(addressView.headers["cache-control"], "private, no-store");
    assert.equal(addressView.json<{ shippingAddress: string }>().shippingAddress, fictionalAddress);

    const addressAdmin = postgres(adminUrl, { max: 1 });
    try {
      const stored = await addressAdmin<Array<{ ciphertext_text: string; lease_seconds: number }>>`
        select encode(address.ciphertext, 'escape') as ciphertext_text,
               extract(epoch from (lease.expires_at - lease.issued_at))::integer as lease_seconds
        from order_private_address address
        join address_access_lease lease
          on lease.workspace_id = address.workspace_id and lease.order_id = address.order_id
        where address.workspace_id = ${owner.workspaceId} and address.order_id = ${orderId}
          and lease.id = ${firstLeaseId}
      `;
      assert.equal(stored[0]?.lease_seconds, 300);
      assert.equal(stored[0]?.ciphertext_text.includes("架空県"), false);
      await addressAdmin`
        update address_access_lease set issued_at = now() - interval '2 seconds',
          expires_at = now() - interval '1 second'
        where workspace_id = ${owner.workspaceId} and id = ${firstLeaseId}
      `;
    } finally {
      await addressAdmin.end({ timeout: 5 });
    }
    const expiredAddress = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/address?leaseId=${firstLeaseId}`,
      headers: { cookie },
    });
    assert.equal(expiredAddress.statusCode, 403, expiredAddress.body);

    const activeLease = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/address-leases`,
      headers: { cookie: shippingCookie },
      payload: { purpose: "shipping_label", humanConfirmed: true },
    });
    assert.equal(activeLease.statusCode, 201, activeLease.body);
    const activeLeaseId = activeLease.json<{ leaseId: string }>().leaseId;
    const scanBase = Date.now();
    const pickPayload = {
      inventoryNumber: acquiredItem.inventoryNumber,
      locationCode: appendCodeCheckDigit("HOME-BIN-01"),
      inventoryLabelVersion: 1,
      locationLabelVersion: 1,
      addressLeaseId: activeLeaseId,
      inventoryScannedAt: new Date(scanBase).toISOString(),
      locationScannedAt: new Date(scanBase + 1).toISOString(),
      confirmedAt: new Date(scanBase + 2).toISOString(),
      idempotencyKey: randomUUID(),
      humanConfirmed: true,
    } as const;
    const stalePick = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/pick`,
      headers: { cookie: shippingCookie },
      payload: { ...pickPayload, inventoryLabelVersion: 99, idempotencyKey: randomUUID() },
    });
    assert.equal(stalePick.statusCode, 409, stalePick.body);
    const picked = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/pick`,
      headers: { cookie: shippingCookie },
      payload: pickPayload,
    });
    assert.equal(picked.statusCode, 200, picked.body);
    assert.equal(picked.json<{ inventoryStatus: string }>().inventoryStatus, "picked");
    const pickedReplay = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/pick`,
      headers: { cookie: shippingCookie },
      payload: pickPayload,
    });
    assert.deepEqual(pickedReplay.json(), picked.json());

    const packed = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/pack`,
      headers: { cookie: shippingCookie },
      payload: {
        packingEvidenceReferenceId: randomUUID(),
        addressLeaseId: activeLeaseId,
        confirmedAt: new Date().toISOString(),
        idempotencyKey: randomUUID(),
        humanConfirmed: true,
      },
    });
    assert.equal(packed.statusCode, 200, packed.body);
    assert.equal(packed.json<{ inventoryStatus: string }>().inventoryStatus, "packed");
    const shipped = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/ship`,
      headers: { cookie: shippingCookie },
      payload: {
        addressLeaseId: activeLeaseId,
        shippedAt: new Date().toISOString(),
        idempotencyKey: randomUUID(),
        humanConfirmed: true,
      },
    });
    assert.equal(shipped.statusCode, 200, shipped.body);
    assert.equal(shipped.json<{ inventoryStatus: string }>().inventoryStatus, "shipped");
    const shippedReadModel = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/p0-items`,
      headers: { cookie },
    });
    assert.equal(shippedReadModel.statusCode, 200, shippedReadModel.body);
    const shippedItem = shippedReadModel
      .json<Array<{ skuId: string; workflowState: string; orderState: string }>>()
      .find((entry) => entry.skuId === acquiredItem.skuId);
    assert.equal(shippedItem?.workflowState, "shipped");
    assert.equal(shippedItem?.orderState, "shipped");

    const shippingFinancial = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/financial-summary`,
      headers: { cookie: shippingCookie },
    });
    assert.equal(shippingFinancial.statusCode, 403, shippingFinancial.body);
    assert.equal(/原価|利益|contributionProfit|allocatedCost/u.test(shippingFinancial.body), false);
    const shippingExport = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/accounting-exports`,
      headers: { cookie: shippingCookie },
      payload: {
        approvedAt: new Date().toISOString(),
        idempotencyKey: randomUUID(),
        humanApproved: true,
      },
    });
    assert.equal(shippingExport.statusCode, 403, shippingExport.body);

    const financial = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/financial-summary`,
      headers: { cookie },
    });
    assert.equal(financial.statusCode, 200, financial.body);
    assert.equal(
      financial.json<{ contributionProfitMinor: number }>().contributionProfitMinor,
      2150,
    );
    assert.equal(
      financial.json<{ formulaVersion: string }>().formulaVersion,
      "financial_formula_v1.0.0",
    );
    const accountingOrders = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/accounting/orders`,
      headers: { cookie },
    });
    assert.equal(accountingOrders.statusCode, 200, accountingOrders.body);
    assert.deepEqual(
      accountingOrders.json<Array<{ orderId: string }>>().map((entry) => entry.orderId),
      [orderId],
    );
    const shippingAccountingOrders = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/accounting/orders`,
      headers: { cookie: shippingCookie },
    });
    assert.equal(shippingAccountingOrders.statusCode, 403, shippingAccountingOrders.body);
    const legacyAccountingExport = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/accounting-exports`,
      headers: { cookie },
      payload: {},
    });
    assert.equal(legacyAccountingExport.statusCode, 410, legacyAccountingExport.body);

    const profile = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/accounting/profile`,
      headers: { cookie },
    });
    assert.equal(profile.statusCode, 200, profile.body);
    assert.equal(profile.json<{ businessContext: string }>().businessContext, "unconfigured");
    const configuredProfile = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/accounting/profile`,
      headers: { cookie },
      payload: {
        businessContext: "individual_business",
        filingContext: "blue_return",
        consumptionTaxTreatment: "tax_exempt",
        invoiceRegistrationStatus: "not_registered",
        bookkeepingMethod: "double_entry",
        expectedRevision: profile.json<{ revision: number }>().revision,
        humanConfirmed: true,
      },
    });
    assert.equal(configuredProfile.statusCode, 200, configuredProfile.body);

    const mappingAccounts = {
      sale: ["普通預金", "売上高"],
      refund: ["売上高", "普通預金"],
      fee: ["支払手数料", "普通預金"],
      fee_reversal: ["普通預金", "支払手数料"],
      shipping: ["荷造運賃", "普通預金"],
      packaging: ["消耗品費,備品", "普通預金"],
      cost: ["売上原価", "商品"],
    } as const;
    let originalSaleMapping:
      | {
          ruleId: string;
          version: string;
          debitAccount: string;
          creditAccount: string;
          status: string;
        }
      | undefined;
    for (const [eventType, [debitAccount, creditAccount]] of Object.entries(mappingAccounts)) {
      const mapping = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${owner.workspaceId}/accounting/mapping-rules`,
        headers: { cookie },
        payload: {
          eventType,
          version: `p0-${eventType}-v1`,
          debitAccount,
          debitSubaccount: "",
          debitTaxCategory: "対象外",
          debitInvoiceCategory: "控除なし",
          creditAccount,
          creditSubaccount: "",
          creditTaxCategory: "対象外",
          creditInvoiceCategory: "控除なし",
          effectiveFrom: "2020-01-01T00:00:00.000Z",
          effectiveUntil: null,
          humanApproved: true,
        },
      });
      assert.equal(mapping.statusCode, 201, mapping.body);
      if (eventType === "sale") {
        originalSaleMapping = mapping.json<typeof originalSaleMapping>();
      }
    }
    assert.ok(originalSaleMapping);

    const freshExportPreflight = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/accounting/exports/preflight?orderId=${orderId}`,
      headers: { cookie },
    });
    assert.equal(freshExportPreflight.statusCode, 200, freshExportPreflight.body);
    assert.equal(freshExportPreflight.headers["cache-control"], "private, no-store");
    const freshPreflight = freshExportPreflight.json<{
      currentSourceSetSha256: string;
      exactPriorDuplicate: null;
      canCreateFresh: boolean;
      canSupersede: boolean;
    }>();
    assert.match(freshPreflight.currentSourceSetSha256, /^[a-f0-9]{64}$/u);
    assert.equal(freshPreflight.exactPriorDuplicate, null);
    assert.equal(freshPreflight.canCreateFresh, true);
    assert.equal(freshPreflight.canSupersede, false);
    const accountingRoleExportPreflight = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/accounting/exports/preflight?orderId=${orderId}`,
      headers: { cookie: accountingCookie },
    });
    assert.equal(accountingRoleExportPreflight.statusCode, 200, accountingRoleExportPreflight.body);
    assert.deepEqual(accountingRoleExportPreflight.json(), freshExportPreflight.json());
    const foreignExportPreflight = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${otherWorkspaceId}/accounting/exports/preflight?orderId=${orderId}`,
      headers: { cookie },
    });
    assert.equal(foreignExportPreflight.statusCode, 403, foreignExportPreflight.body);

    const exportKey = randomUUID();
    const accountingExport = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/accounting/exports`,
      headers: { cookie },
      payload: {
        format: "money_forward_journal_v1",
        orderId,
        approvedAt: new Date().toISOString(),
        idempotencyKey: exportKey,
        humanApproved: true,
        duplicateOverrideConfirmed: false,
        supersedesBatchId: null,
      },
    });
    assert.equal(accountingExport.statusCode, 201, accountingExport.body);
    assert.equal(accountingExport.json<{ rowCount: number }>().rowCount, 5);
    const batchId = accountingExport.json<{ batchId: string }>().batchId;
    const duplicateExportPreflight = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/accounting/exports/preflight?orderId=${orderId}`,
      headers: { cookie },
    });
    assert.equal(duplicateExportPreflight.statusCode, 200, duplicateExportPreflight.body);
    assert.deepEqual(
      duplicateExportPreflight.json<{
        exactPriorDuplicate: { batchId: string; state: string };
        canCreateFresh: boolean;
        canSupersede: boolean;
      }>(),
      {
        orderId,
        currentSourceSetSha256: freshPreflight.currentSourceSetSha256,
        exactPriorDuplicate: {
          batchId,
          format: "money_forward_journal_v1",
          filename: "money-forward-journal-v1.csv",
          sourceSetSha256: freshPreflight.currentSourceSetSha256,
          state: "ready",
        },
        canCreateFresh: false,
        canSupersede: true,
      },
    );
    const previewStateBefore = await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      return transaction<Array<{ state: string; downloaded_audit_count: number }>>`
        select batch.state,
               (select count(*)::integer from audit_event audit
                where audit.workspace_id = batch.workspace_id
                  and audit.target_id = batch.id
                  and audit.action = 'accounting.export.downloaded') as downloaded_audit_count
        from export_batch batch
        where batch.workspace_id = ${owner.workspaceId} and batch.id = ${batchId}
      `;
    });
    assert.deepEqual(previewStateBefore[0], { state: "ready", downloaded_audit_count: 0 });
    const accountingPreview = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/accounting/exports/${batchId}/preview`,
      headers: { cookie },
    });
    assert.equal(accountingPreview.statusCode, 200, accountingPreview.body);
    assert.equal(accountingPreview.headers["cache-control"], "private, no-store");
    const preview = accountingPreview.json<{
      columnCount: number;
      totalRowCount: number;
      previewRowCount: number;
      truncated: boolean;
      headers: string[];
      rows: string[][];
    }>();
    assert.equal(preview.columnCount, 27);
    assert.equal(preview.totalRowCount, 5);
    assert.equal(preview.previewRowCount, 5);
    assert.equal(preview.truncated, false);
    assert.equal(preview.headers.length, 27);
    assert.equal(
      preview.rows.every((row) => row.length === 27),
      true,
    );
    assert.equal(preview.rows.flat().includes("消耗品費,備品"), true);
    assert.equal(/storage.?key|csv_content/iu.test(accountingPreview.body), false);
    const accountingRolePreview = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/accounting/exports/${batchId}/preview`,
      headers: { cookie: accountingCookie },
    });
    assert.equal(accountingRolePreview.statusCode, 200, accountingRolePreview.body);
    assert.deepEqual(accountingRolePreview.json(), accountingPreview.json());
    const foreignWorkspacePreview = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${otherWorkspaceId}/accounting/exports/${batchId}/preview`,
      headers: { cookie },
    });
    assert.equal(foreignWorkspacePreview.statusCode, 403, foreignWorkspacePreview.body);
    const previewStateAfter = await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      return transaction<Array<{ state: string; downloaded_audit_count: number }>>`
        select batch.state,
               (select count(*)::integer from audit_event audit
                where audit.workspace_id = batch.workspace_id
                  and audit.target_id = batch.id
                  and audit.action = 'accounting.export.downloaded') as downloaded_audit_count
        from export_batch batch
        where batch.workspace_id = ${owner.workspaceId} and batch.id = ${batchId}
      `;
    });
    assert.deepEqual(previewStateAfter, previewStateBefore);
    const csvContent = await app.inject({
      method: "POST",
      url: accountingExport.json<{ contentUrl: string }>().contentUrl,
      headers: { cookie },
    });
    assert.equal(csvContent.statusCode, 200, csvContent.body);
    assert.equal(csvContent.headers["cache-control"], "private, no-store");
    assert.equal(
      csvContent.headers["x-content-sha256"],
      accountingExport.json<{ sha256: string }>().sha256,
    );
    assert.equal(csvContent.body.startsWith("\uFEFF取引No,取引日,借方勘定科目"), true);
    assert.equal(csvContent.body.split("\r\n")[0]?.split(",").length, 27);
    const downloadedAccountingPreview = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/accounting/exports/${batchId}/preview`,
      headers: { cookie },
    });
    assert.equal(downloadedAccountingPreview.statusCode, 200, downloadedAccountingPreview.body);
    const shippingCsvContent = await app.inject({
      method: "POST",
      url: accountingExport.json<{ contentUrl: string }>().contentUrl,
      headers: { cookie: shippingCookie },
    });
    assert.equal(shippingCsvContent.statusCode, 403, shippingCsvContent.body);
    assert.equal(/販売額|原価|利益/u.test(shippingCsvContent.body), false);
    const importConfirmation = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/accounting/exports/${batchId}/import-confirmation`,
      headers: { cookie },
      payload: {
        idempotencyKey: randomUUID(),
        result: "success",
        importedRowCount: 5,
        note: "人が公式画面の取込結果を確認",
        confirmedAt: new Date().toISOString(),
        humanConfirmed: true,
      },
    });
    assert.equal(importConfirmation.statusCode, 200, importConfirmation.body);
    assert.equal(importConfirmation.json<{ state: string }>().state, "import_confirmed");
    const importedAccountingPreview = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/accounting/exports/${batchId}/preview`,
      headers: { cookie },
    });
    assert.equal(importedAccountingPreview.statusCode, 409, importedAccountingPreview.body);
    const importedExportPreflight = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/accounting/exports/preflight?orderId=${orderId}`,
      headers: { cookie },
    });
    assert.equal(importedExportPreflight.statusCode, 200, importedExportPreflight.body);
    assert.deepEqual(
      [
        importedExportPreflight.json<{ exactPriorDuplicate: { batchId: string; state: string } }>()
          .exactPriorDuplicate.batchId,
        importedExportPreflight.json<{ exactPriorDuplicate: { batchId: string; state: string } }>()
          .exactPriorDuplicate.state,
      ],
      [batchId, "import_confirmed"],
    );
    const listedExports = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/accounting/exports?orderId=${orderId}`,
      headers: { cookie },
    });
    assert.equal(listedExports.statusCode, 200, listedExports.body);
    assert.deepEqual(
      listedExports
        .json<Array<{ batchId: string; state: string }>>()
        .map((entry) => [entry.batchId, entry.state]),
      [[batchId, "import_confirmed"]],
    );
    const duplicateWithoutOverride = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/accounting/exports`,
      headers: { cookie },
      payload: {
        format: "generic_journal_v1",
        orderId,
        approvedAt: new Date().toISOString(),
        idempotencyKey: randomUUID(),
        humanApproved: true,
        duplicateOverrideConfirmed: false,
        supersedesBatchId: null,
      },
    });
    assert.equal(duplicateWithoutOverride.statusCode, 409, duplicateWithoutOverride.body);
    const replacementExport = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/accounting/exports`,
      headers: { cookie },
      payload: {
        format: "generic_journal_v1",
        orderId,
        approvedAt: new Date().toISOString(),
        idempotencyKey: randomUUID(),
        humanApproved: true,
        duplicateOverrideConfirmed: true,
        supersedesBatchId: batchId,
      },
    });
    assert.equal(replacementExport.statusCode, 201, replacementExport.body);
    assert.equal(replacementExport.json<{ columnCount: number }>().columnCount, 19);
    const replacementBatchId = replacementExport.json<{ batchId: string }>().batchId;
    const supersededAccountingPreview = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/accounting/exports/${batchId}/preview`,
      headers: { cookie },
    });
    assert.equal(supersededAccountingPreview.statusCode, 409, supersededAccountingPreview.body);
    const replacementReadyPreview = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/accounting/exports/${replacementBatchId}/preview`,
      headers: { cookie },
    });
    assert.equal(replacementReadyPreview.statusCode, 200, replacementReadyPreview.body);
    const replacementCsv = await app.inject({
      method: "POST",
      url: replacementExport.json<{ contentUrl: string }>().contentUrl,
      headers: { cookie },
    });
    assert.equal(replacementCsv.statusCode, 200, replacementCsv.body);
    assert.equal(replacementCsv.body.split("\r\n")[0]?.split(",").length, 19);
    const replacementDownloadedPreview = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/accounting/exports/${replacementBatchId}/preview`,
      headers: { cookie },
    });
    assert.equal(replacementDownloadedPreview.statusCode, 200, replacementDownloadedPreview.body);
    const journalReadModel = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/p0-items`,
      headers: { cookie },
    });
    const journalItem = journalReadModel
      .json<Array<{ skuId: string; workflowState: string }>>()
      .find((entry) => entry.skuId === acquiredItem.skuId);
    assert.equal(journalItem?.workflowState, "journal_approved");
    await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`
        update export_batch set state = 'voided'
        where workspace_id = ${owner.workspaceId} and id = ${replacementBatchId}
      `;
    });
    const voidedAccountingPreview = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/accounting/exports/${replacementBatchId}/preview`,
      headers: { cookie },
    });
    assert.equal(voidedAccountingPreview.statusCode, 409, voidedAccountingPreview.body);
    const supersededOnlyPreflight = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/accounting/exports/preflight?orderId=${orderId}`,
      headers: { cookie },
    });
    assert.equal(supersededOnlyPreflight.statusCode, 200, supersededOnlyPreflight.body);
    const supersededOnly = supersededOnlyPreflight.json<{
      currentSourceSetSha256: string;
      exactPriorDuplicate: { batchId: string; state: string };
      canCreateFresh: boolean;
      canSupersede: boolean;
    }>();
    assert.equal(supersededOnly.currentSourceSetSha256, freshPreflight.currentSourceSetSha256);
    assert.deepEqual(
      [supersededOnly.exactPriorDuplicate.batchId, supersededOnly.exactPriorDuplicate.state],
      [batchId, "superseded"],
    );
    assert.equal(supersededOnly.canCreateFresh, false);
    assert.equal(supersededOnly.canSupersede, true);

    const returned = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/return`,
      headers: { cookie },
      payload: {
        returnedAt: new Date().toISOString(),
        idempotencyKey: randomUUID(),
        humanConfirmed: true,
      },
    });
    assert.equal(returned.statusCode, 200, returned.body);
    await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`
        insert into financial_event (
          workspace_id, sku_id, order_id, event_type, amount_minor, currency,
          tax_basis, bearer, source, source_meaning, rounding_rule_version,
          source_already_net, occurred_at
        ) values (
          ${owner.workspaceId}, ${acquiredItem.skuId}, ${orderId}, 'refund', 5000, 'JPY',
          'tax_included', 'seller', 'manual', '返品後に人が確認した返金', 'jpy-v1',
          false, statement_timestamp()
        )
      `;
    });
    const changedSourcePreflight = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/accounting/exports/preflight?orderId=${orderId}`,
      headers: { cookie },
    });
    assert.equal(changedSourcePreflight.statusCode, 200, changedSourcePreflight.body);
    const changedSource = changedSourcePreflight.json<{
      currentSourceSetSha256: string;
      exactPriorDuplicate: null;
      canCreateFresh: boolean;
      canSupersede: boolean;
    }>();
    assert.notEqual(changedSource.currentSourceSetSha256, freshPreflight.currentSourceSetSha256);
    assert.equal(changedSource.exactPriorDuplicate, null);
    assert.equal(changedSource.canCreateFresh, true);
    assert.equal(changedSource.canSupersede, false);
    const changedSourceFreshExport = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/accounting/exports`,
      headers: { cookie },
      payload: {
        format: "money_forward_journal_v1",
        orderId,
        approvedAt: new Date().toISOString(),
        idempotencyKey: randomUUID(),
        humanApproved: true,
        duplicateOverrideConfirmed: false,
        supersedesBatchId: null,
      },
    });
    assert.equal(changedSourceFreshExport.statusCode, 201, changedSourceFreshExport.body);

    const historicalAccountingBeforeReplacement = await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      const [rule] = await transaction<
        Array<{
          id: string;
          rule_version: string;
          status: string;
          effective_from: string;
          effective_until: string | null;
          debit_account: string;
        }>
      >`
        select id, rule_version, status, effective_from::text, effective_until::text,
               debit_account
        from account_mapping_rule
        where workspace_id = ${owner.workspaceId} and id = ${originalSaleMapping.ruleId}
      `;
      const candidates = await transaction<
        Array<{ id: string; source_event_id: string; mapping_rule_id: string }>
      >`
        select candidate.id, candidate.source_event_id, candidate.mapping_rule_id
        from export_batch_source source
        join journal_candidate candidate
          on candidate.workspace_id = source.workspace_id
         and candidate.id = source.journal_candidate_id
        where source.workspace_id = ${owner.workspaceId}
          and source.export_batch_id = ${batchId}
          and candidate.mapping_rule_id = ${originalSaleMapping.ruleId}
        order by candidate.id
      `;
      const allRuleCandidates = await transaction<
        Array<{
          id: string;
          source_event_id: string;
          mapping_rule_id: string;
          occurred_at: Date;
        }>
      >`
        select candidate.id, candidate.source_event_id, candidate.mapping_rule_id,
               event.occurred_at
        from journal_candidate candidate
        join financial_event event
          on event.workspace_id = candidate.workspace_id
         and event.id = candidate.source_event_id
        where candidate.workspace_id = ${owner.workspaceId}
          and candidate.mapping_rule_id = ${originalSaleMapping.ruleId}
        order by candidate.id
      `;
      const [batchSnapshot] = await transaction<
        Array<{ id: string; csv_content: string; csv_sha256: string; state: string }>
      >`
        select id, csv_content, csv_sha256, state
        from export_batch
        where workspace_id = ${owner.workspaceId} and id = ${batchId}
      `;
      const approvedAudit = await transaction<
        Array<{
          id: string;
          actor_id: string;
          action: string;
          target_id: string;
          field_names: string[];
          redacted_changes: unknown;
          reference_ids: string[];
          reason_code: string;
        }>
      >`
        select id, actor_id, action, target_id, field_names, redacted_changes,
               reference_ids, reason_code
        from audit_event
        where workspace_id = ${owner.workspaceId}
          and target_id = ${originalSaleMapping.ruleId}
          and action = 'accounting.mapping_rule.approved'
        order by id
      `;
      return { rule, candidates, allRuleCandidates, batchSnapshot, approvedAudit };
    });
    assert.ok(historicalAccountingBeforeReplacement.rule);
    assert.ok(historicalAccountingBeforeReplacement.batchSnapshot);
    assert.ok(historicalAccountingBeforeReplacement.candidates.length > 0);
    assert.ok(historicalAccountingBeforeReplacement.allRuleCandidates.length > 0);
    const latestCandidateOccurredAt = new Date(
      Math.max(
        ...historicalAccountingBeforeReplacement.allRuleCandidates.map((candidate) =>
          candidate.occurred_at.getTime(),
        ),
      ),
    );

    const mappingReplacementPayload = {
      expectedVersion: originalSaleMapping.version,
      expectedStatus: "active",
      debitAccount: "売掛金",
      debitSubaccount: "",
      debitTaxCategory: "対象外",
      debitInvoiceCategory: "控除なし",
      creditAccount: originalSaleMapping.creditAccount,
      creditSubaccount: "",
      creditTaxCategory: "対象外",
      creditInvoiceCategory: "控除なし",
      effectiveFrom: "2029-12-31T15:00:00.000Z",
      changeReasonCode: "account_review",
      humanConfirmed: true,
    } as const;
    const clientActorSpoof = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/accounting/mapping-rules/${originalSaleMapping.ruleId}/replacements`,
      headers: { cookie: accountingCookie },
      payload: { ...mappingReplacementPayload, approvedBy: owner.identityId },
    });
    assert.equal(clientActorSpoof.statusCode, 400, clientActorSpoof.body);
    const shippingMappingReplacement = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/accounting/mapping-rules/${originalSaleMapping.ruleId}/replacements`,
      headers: { cookie: shippingCookie },
      payload: mappingReplacementPayload,
    });
    assert.equal(shippingMappingReplacement.statusCode, 403, shippingMappingReplacement.body);
    const foreignMappingReplacement = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${otherWorkspaceId}/accounting/mapping-rules/${originalSaleMapping.ruleId}/replacements`,
      headers: { cookie: accountingCookie },
      payload: mappingReplacementPayload,
    });
    assert.equal(foreignMappingReplacement.statusCode, 403, foreignMappingReplacement.body);
    const unchangedMappingReplacement = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/accounting/mapping-rules/${originalSaleMapping.ruleId}/replacements`,
      headers: { cookie: accountingCookie },
      payload: {
        ...mappingReplacementPayload,
        debitAccount: originalSaleMapping.debitAccount,
      },
    });
    assert.equal(unchangedMappingReplacement.statusCode, 409, unchangedMappingReplacement.body);

    for (const unsafeBoundary of [
      new Date(latestCandidateOccurredAt.getTime() - 1).toISOString(),
      latestCandidateOccurredAt.toISOString(),
    ]) {
      const retroactiveReplacement: { statusCode: number; body: string } = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${owner.workspaceId}/accounting/mapping-rules/${originalSaleMapping.ruleId}/replacements`,
        headers: { cookie: accountingCookie },
        payload: { ...mappingReplacementPayload, effectiveFrom: unsafeBoundary },
      });
      assert.equal(retroactiveReplacement.statusCode, 409, retroactiveReplacement.body);
      assert.match(retroactiveReplacement.body, /過去の仕訳候補/u);
    }

    const checkDirectRetirementBoundary = async (
      boundary: string,
      expected: "reject" | "allow_then_rollback",
    ) => {
      const boundaryReplacementId = randomUUID();
      const operation = () =>
        inventory.begin(async (transaction) => {
          await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
          await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
          await transaction`
            update account_mapping_rule
            set status = 'retired', effective_until = ${boundary}
            where workspace_id = ${owner.workspaceId}
              and id = ${originalSaleMapping.ruleId}
          `;
          await transaction`
            insert into account_mapping_rule (
              id, workspace_id, event_type, rule_version, debit_account, debit_subaccount,
              debit_tax_category, debit_invoice_category, credit_account, credit_subaccount,
              credit_tax_category, credit_invoice_category, effective_from, effective_until,
              status, approved_by, approved_at, created_by, replaces_rule_id, change_reason_code
            )
            select ${boundaryReplacementId}, workspace_id, event_type,
                   ${`boundary-${boundaryReplacementId}`}, '境界確認科目', debit_subaccount,
                   debit_tax_category, debit_invoice_category, credit_account, credit_subaccount,
                   credit_tax_category, credit_invoice_category, ${boundary}, null, 'active',
                   ${owner.identityId}, statement_timestamp(), ${owner.identityId}, id, 'correction'
            from account_mapping_rule
            where workspace_id = ${owner.workspaceId}
              and id = ${originalSaleMapping.ruleId}
          `;
          await transaction`set constraints all immediate`;
          if (expected === "allow_then_rollback") {
            const [retired] = await transaction<Array<{ status: string }>>`
              select status from account_mapping_rule
              where workspace_id = ${owner.workspaceId}
                and id = ${originalSaleMapping.ruleId}
            `;
            assert.equal(retired?.status, "retired");
            throw new Error("allowed boundary rollback");
          }
        });

      if (expected === "reject") {
        await assert.rejects(
          operation,
          /retirement boundary must be after every existing journal candidate event/u,
        );
      } else {
        await assert.rejects(operation, /allowed boundary rollback/u);
      }
    };
    await checkDirectRetirementBoundary(
      new Date(latestCandidateOccurredAt.getTime() - 1).toISOString(),
      "reject",
    );
    await checkDirectRetirementBoundary(latestCandidateOccurredAt.toISOString(), "reject");
    await checkDirectRetirementBoundary(
      new Date(latestCandidateOccurredAt.getTime() + 1).toISOString(),
      "allow_then_rollback",
    );
    const candidateRowsAfterBoundaryChecks = await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      return transaction<
        Array<{
          id: string;
          source_event_id: string;
          mapping_rule_id: string;
          occurred_at: Date;
        }>
      >`
        select candidate.id, candidate.source_event_id, candidate.mapping_rule_id,
               event.occurred_at
        from journal_candidate candidate
        join financial_event event
          on event.workspace_id = candidate.workspace_id
         and event.id = candidate.source_event_id
        where candidate.workspace_id = ${owner.workspaceId}
          and candidate.mapping_rule_id = ${originalSaleMapping.ruleId}
        order by candidate.id
      `;
    });
    assert.deepEqual(
      candidateRowsAfterBoundaryChecks,
      historicalAccountingBeforeReplacement.allRuleCandidates,
      "Rejected/evaluated retirement boundaries must not rewrite old candidates",
    );

    const mappingReplacement = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/accounting/mapping-rules/${originalSaleMapping.ruleId}/replacements`,
      headers: { cookie: accountingCookie },
      payload: mappingReplacementPayload,
    });
    assert.equal(mappingReplacement.statusCode, 201, mappingReplacement.body);
    const replacedRules = mappingReplacement.json<{
      retiredRule: {
        ruleId: string;
        version: string;
        status: string;
        effectiveUntil: string;
        confirmationStatus: string;
      };
      activeRule: {
        ruleId: string;
        version: string;
        status: string;
        effectiveFrom: string;
        debitAccount: string;
        replacesRuleId: string;
        changeReasonCode: string;
        approvedBy: string;
        confirmationStatus: string;
      };
    }>();
    assert.deepEqual(
      [
        replacedRules.retiredRule.ruleId,
        replacedRules.retiredRule.version,
        replacedRules.retiredRule.status,
        replacedRules.retiredRule.effectiveUntil,
        replacedRules.retiredRule.confirmationStatus,
      ],
      [
        originalSaleMapping.ruleId,
        originalSaleMapping.version,
        "retired",
        mappingReplacementPayload.effectiveFrom,
        "human_confirmed",
      ],
    );
    assert.equal(replacedRules.activeRule.status, "active");
    assert.equal(replacedRules.activeRule.effectiveFrom, mappingReplacementPayload.effectiveFrom);
    assert.equal(replacedRules.activeRule.debitAccount, "売掛金");
    assert.equal(replacedRules.activeRule.replacesRuleId, originalSaleMapping.ruleId);
    assert.equal(replacedRules.activeRule.changeReasonCode, "account_review");
    assert.equal(replacedRules.activeRule.approvedBy, accountingId);
    assert.equal(replacedRules.activeRule.confirmationStatus, "human_confirmed");
    assert.notEqual(replacedRules.activeRule.ruleId, originalSaleMapping.ruleId);
    assert.notEqual(replacedRules.activeRule.version, originalSaleMapping.version);
    assert.match(replacedRules.activeRule.version, /^sale-2030-01-01-/u);

    const staleMappingReplacement = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/accounting/mapping-rules/${originalSaleMapping.ruleId}/replacements`,
      headers: { cookie: accountingCookie },
      payload: mappingReplacementPayload,
    });
    assert.equal(staleMappingReplacement.statusCode, 409, staleMappingReplacement.body);
    assert.match(staleMappingReplacement.body, /再読み込み/u);

    const listedMappingRules = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/accounting/mapping-rules`,
      headers: { cookie },
    });
    assert.equal(listedMappingRules.statusCode, 200, listedMappingRules.body);
    assert.deepEqual(
      listedMappingRules
        .json<Array<{ ruleId: string; status: string }>>()
        .filter((rule) =>
          [originalSaleMapping.ruleId, replacedRules.activeRule.ruleId].includes(rule.ruleId),
        )
        .map((rule) => [rule.ruleId, rule.status])
        .sort(),
      [
        [originalSaleMapping.ruleId, "retired"],
        [replacedRules.activeRule.ruleId, "active"],
      ].sort(),
    );

    const historicalAccountingAfterReplacement = await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      const candidates = await transaction<
        Array<{ id: string; source_event_id: string; mapping_rule_id: string }>
      >`
        select candidate.id, candidate.source_event_id, candidate.mapping_rule_id
        from export_batch_source source
        join journal_candidate candidate
          on candidate.workspace_id = source.workspace_id
         and candidate.id = source.journal_candidate_id
        where source.workspace_id = ${owner.workspaceId}
          and source.export_batch_id = ${batchId}
          and candidate.mapping_rule_id = ${originalSaleMapping.ruleId}
        order by candidate.id
      `;
      const allRuleCandidates = await transaction<
        Array<{
          id: string;
          source_event_id: string;
          mapping_rule_id: string;
          occurred_at: Date;
        }>
      >`
        select candidate.id, candidate.source_event_id, candidate.mapping_rule_id,
               event.occurred_at
        from journal_candidate candidate
        join financial_event event
          on event.workspace_id = candidate.workspace_id
         and event.id = candidate.source_event_id
        where candidate.workspace_id = ${owner.workspaceId}
          and candidate.mapping_rule_id = ${originalSaleMapping.ruleId}
        order by candidate.id
      `;
      const [batchSnapshot] = await transaction<
        Array<{ id: string; csv_content: string; csv_sha256: string; state: string }>
      >`
        select id, csv_content, csv_sha256, state
        from export_batch
        where workspace_id = ${owner.workspaceId} and id = ${batchId}
      `;
      const approvedAudit = await transaction<
        Array<{
          id: string;
          actor_id: string;
          action: string;
          target_id: string;
          field_names: string[];
          redacted_changes: unknown;
          reference_ids: string[];
          reason_code: string;
        }>
      >`
        select id, actor_id, action, target_id, field_names, redacted_changes,
               reference_ids, reason_code
        from audit_event
        where workspace_id = ${owner.workspaceId}
          and target_id = ${originalSaleMapping.ruleId}
          and action = 'accounting.mapping_rule.approved'
        order by id
      `;
      return { candidates, allRuleCandidates, batchSnapshot, approvedAudit };
    });
    assert.deepEqual(
      historicalAccountingAfterReplacement,
      {
        candidates: historicalAccountingBeforeReplacement.candidates,
        allRuleCandidates: historicalAccountingBeforeReplacement.allRuleCandidates,
        batchSnapshot: historicalAccountingBeforeReplacement.batchSnapshot,
        approvedAudit: historicalAccountingBeforeReplacement.approvedAudit,
      },
      "Mapping replacement must not rewrite old candidates, CSV bytes, batch state, or audit rows",
    );

    const replacementAudit = await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      return transaction<
        Array<{
          actor_id: string;
          reason_code: string;
          reference_ids: string[];
          field_names: string[];
          redacted_changes: {
            before: { oldRuleId: string; oldVersion: string; oldStatus: string };
            after: {
              oldRuleId: string;
              oldVersion: string;
              oldStatus: string;
              newRuleId: string;
              newVersion: string;
              newStatus: string;
              effectiveFrom: string;
            };
          };
        }>
      >`
        select actor_id, reason_code, reference_ids, field_names, redacted_changes
        from audit_event
        where workspace_id = ${owner.workspaceId}
          and action = 'accounting.mapping_rule.replaced'
          and target_id = ${originalSaleMapping.ruleId}
      `;
    });
    assert.equal(replacementAudit.length, 1);
    assert.equal(replacementAudit[0]?.actor_id, accountingId);
    assert.equal(replacementAudit[0]?.reason_code, "account_review");
    assert.deepEqual(replacementAudit[0]?.reference_ids, [
      originalSaleMapping.ruleId,
      replacedRules.activeRule.ruleId,
    ]);
    assert.deepEqual(replacementAudit[0]?.field_names, [
      "oldRuleId",
      "oldVersion",
      "oldStatus",
      "newRuleId",
      "newVersion",
      "newStatus",
      "effectiveFrom",
    ]);
    assert.deepEqual(replacementAudit[0]?.redacted_changes, {
      before: {
        oldRuleId: originalSaleMapping.ruleId,
        oldVersion: originalSaleMapping.version,
        oldStatus: "active",
      },
      after: {
        oldRuleId: originalSaleMapping.ruleId,
        oldVersion: originalSaleMapping.version,
        oldStatus: "retired",
        newRuleId: replacedRules.activeRule.ruleId,
        newVersion: replacedRules.activeRule.version,
        newStatus: "active",
        effectiveFrom: mappingReplacementPayload.effectiveFrom,
      },
    });
    assert.equal(
      JSON.stringify(replacementAudit[0]?.redacted_changes).includes("売掛金"),
      false,
      "Audit must contain IDs/versions/statuses, not free-form account text",
    );

    await assert.rejects(
      () =>
        inventory.begin(async (transaction) => {
          await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
          await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
          await transaction`
            update account_mapping_rule set debit_account = '直接上書き禁止'
            where workspace_id = ${owner.workspaceId}
              and id = ${replacedRules.activeRule.ruleId}
          `;
        }),
      /account mapping accounting fields are immutable/u,
    );
    await assert.rejects(
      () =>
        inventory.begin(async (transaction) => {
          await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
          await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
          await transaction`
            update account_mapping_rule
            set status = 'retired', effective_until = '2031-01-01T00:00:00.000Z'
            where workspace_id = ${owner.workspaceId} and event_type = 'fee'
              and status = 'active'
          `;
        }),
      /retiring an account mapping requires an atomic active replacement/u,
    );
    await assert.rejects(
      () =>
        inventory.begin(async (transaction) => {
          await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
          await transaction`select set_config('app.identity_id', ${shippingId}, true)`;
          await transaction`
            insert into account_mapping_rule (
              workspace_id, event_type, rule_version, debit_account, debit_tax_category,
              debit_invoice_category, credit_account, credit_tax_category,
              credit_invoice_category, effective_from, status, approved_by, approved_at, created_by
            ) values (
              ${owner.workspaceId}, 'sale', 'forged-draft', '不正', '対象外', '控除なし',
              '不正', '対象外', '控除なし', '2040-01-01T00:00:00.000Z', 'draft',
              ${shippingId}, statement_timestamp(), ${shippingId}
            )
          `;
        }),
      /mapping approver must be the active accounting actor/u,
    );
    await assert.rejects(
      () =>
        inventory.begin(async (transaction) => {
          await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
          await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
          await transaction`
            insert into account_mapping_rule (
              workspace_id, event_type, rule_version, debit_account, debit_tax_category,
              debit_invoice_category, credit_account, credit_tax_category,
              credit_invoice_category, effective_from, status, approved_by, approved_at, created_by
            ) values (
              ${owner.workspaceId}, 'sale', 'forged-approver-draft', '不正', '対象外', '控除なし',
              '不正', '対象外', '控除なし', '2040-01-01T00:00:00.000Z', 'draft',
              ${accountingId}, statement_timestamp(), ${owner.identityId}
            )
          `;
        }),
      /mapping approver must be the active accounting actor/u,
    );
    const rejectedInitialRules = [
      {
        version: "forged-initial-retired",
        status: "retired",
        effectiveUntil: null,
        approvedAt: new Date().toISOString(),
      },
      {
        version: "forged-initial-ended-active",
        status: "active",
        effectiveUntil: "2041-02-01T00:00:00.000Z",
        approvedAt: new Date().toISOString(),
      },
      {
        version: "forged-initial-unapproved-active",
        status: "active",
        effectiveUntil: null,
        approvedAt: null,
      },
    ] as const;
    for (const rejectedRule of rejectedInitialRules) {
      await assert.rejects(
        () =>
          inventory.begin(async (transaction) => {
            await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
            await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
            await transaction`
              insert into account_mapping_rule (
                workspace_id, event_type, rule_version, debit_account, debit_tax_category,
                debit_invoice_category, credit_account, credit_tax_category,
                credit_invoice_category, effective_from, effective_until, status,
                approved_by, approved_at, created_by
              ) values (
                ${owner.workspaceId}, 'sale', ${rejectedRule.version}, '不正', '対象外',
                '控除なし', '不正', '対象外', '控除なし',
                '2041-01-01T00:00:00.000Z', ${rejectedRule.effectiveUntil},
                ${rejectedRule.status}, ${owner.identityId}, ${rejectedRule.approvedAt},
                ${owner.identityId}
              )
            `;
          }),
        /initial approved mapping must be active, open-ended, and approved by the session actor/u,
      );
    }
    const rejectedInitialRuleCount = await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      return transaction<Array<{ count: number }>>`
        select count(*)::integer as count from account_mapping_rule
        where workspace_id = ${owner.workspaceId}
          and rule_version like 'forged-initial-%'
      `;
    });
    assert.equal(rejectedInitialRuleCount[0]?.count, 0);
    const crossWorkspaceRuleCount = await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${otherWorkspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${accountingId}, true)`;
      return transaction<Array<{ count: number }>>`
        select count(*)::integer as count from account_mapping_rule
        where workspace_id = ${owner.workspaceId}
          and id = ${replacedRules.activeRule.ruleId}
      `;
    });
    assert.equal(crossWorkspaceRuleCount[0]?.count, 0, "RLS must hide another workspace rule");
    await assert.rejects(
      () =>
        inventory.begin(async (transaction) => {
          await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
          await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
          await transaction`
            insert into account_mapping_rule (
              workspace_id, event_type, rule_version, debit_account, debit_tax_category,
              debit_invoice_category, credit_account, credit_tax_category,
              credit_invoice_category, effective_from, status, approved_by, approved_at, created_by
            ) values (
              ${otherWorkspaceId}, 'sale', 'forged-cross-workspace', '不正', '対象外',
              '控除なし', '不正', '対象外', '控除なし',
              '2040-01-01T00:00:00.000Z', 'active', ${owner.identityId},
              statement_timestamp(), ${owner.identityId}
            )
          `;
        }),
      /row-level security|mapping approver must be the active accounting actor/u,
      "A runtime connection cannot forge a mapping into another workspace",
    );

    const laterSaleEventId = randomUUID();
    await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`
        insert into financial_event (
          id, workspace_id, sku_id, order_id, event_type, amount_minor, currency,
          tax_basis, bearer, source, source_meaning, rounding_rule_version,
          source_already_net, occurred_at
        ) values (
          ${laterSaleEventId}, ${owner.workspaceId}, ${acquiredItem.skuId}, ${orderId},
          'sale', 1200, 'JPY', 'tax_included', 'seller', 'manual',
          '新版期間の架空売上', 'jpy-v1', false, '2030-01-02T00:00:00.000Z'
        )
      `;
    });
    const postReplacementExport = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/accounting/exports`,
      headers: { cookie: accountingCookie },
      payload: {
        format: "money_forward_journal_v1",
        orderId,
        approvedAt: new Date().toISOString(),
        idempotencyKey: randomUUID(),
        humanApproved: true,
        duplicateOverrideConfirmed: false,
        supersedesBatchId: null,
      },
    });
    assert.equal(postReplacementExport.statusCode, 201, postReplacementExport.body);
    const postReplacementBatchId = postReplacementExport.json<{ batchId: string }>().batchId;
    const saleCandidateMappings = await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      return transaction<Array<{ event_id: string; mapping_rule_id: string }>>`
        select event.id as event_id, candidate.mapping_rule_id
        from export_batch_source source
        join journal_candidate candidate
          on candidate.workspace_id = source.workspace_id
         and candidate.id = source.journal_candidate_id
        join financial_event event
          on event.workspace_id = candidate.workspace_id
         and event.id = candidate.source_event_id
        where source.workspace_id = ${owner.workspaceId}
          and source.export_batch_id = ${postReplacementBatchId}
          and event.event_type = 'sale'
        order by event.occurred_at, event.id
      `;
    });
    assert.equal(saleCandidateMappings.length, 2);
    assert.equal(saleCandidateMappings[0]?.mapping_rule_id, originalSaleMapping.ruleId);
    assert.deepEqual(saleCandidateMappings[1], {
      event_id: laterSaleEventId,
      mapping_rule_id: replacedRules.activeRule.ruleId,
    });
    const [postReplacementStoredExport] = await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      return transaction<Array<{ csv_content: string }>>`
        select csv_content from export_batch
        where workspace_id = ${owner.workspaceId} and id = ${postReplacementBatchId}
      `;
    });
    assert.equal(postReplacementStoredExport?.csv_content.includes("売掛金"), true);
    const [originalStoredExportAfterNewVersion] = await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      return transaction<Array<{ csv_content: string; csv_sha256: string }>>`
        select csv_content, csv_sha256 from export_batch
        where workspace_id = ${owner.workspaceId} and id = ${batchId}
      `;
    });
    assert.deepEqual(originalStoredExportAfterNewVersion, {
      csv_content: historicalAccountingBeforeReplacement.batchSnapshot.csv_content,
      csv_sha256: historicalAccountingBeforeReplacement.batchSnapshot.csv_sha256,
    });

    const prematureInspection = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/return-inspection`,
      headers: { cookie },
      payload: {
        resolution: "restock",
        inspectedAt: new Date().toISOString(),
        idempotencyKey: randomUUID(),
        humanConfirmed: true,
      },
    });
    assert.equal(prematureInspection.statusCode, 409, prematureInspection.body);
    const returnScanBase = Date.now();
    const quarantinePayload = {
      orderId,
      inventoryNumber: acquiredItem.inventoryNumber,
      locationCode: appendCodeCheckDigit("RETURN-01"),
      inventoryLabelVersion: 1,
      locationLabelVersion: 1,
      inventoryScannedAt: new Date(returnScanBase).toISOString(),
      locationScannedAt: new Date(returnScanBase + 1).toISOString(),
      confirmedAt: new Date(returnScanBase + 2).toISOString(),
      idempotencyKey: randomUUID(),
      humanConfirmed: true,
    } as const;
    const staleQuarantine = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/return-quarantine`,
      headers: { cookie },
      payload: {
        ...quarantinePayload,
        inventoryLabelVersion: 99,
        idempotencyKey: randomUUID(),
      },
    });
    assert.equal(staleQuarantine.statusCode, 409, staleQuarantine.body);
    const quarantined = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/return-quarantine`,
      headers: { cookie },
      payload: quarantinePayload,
    });
    assert.equal(quarantined.statusCode, 200, quarantined.body);
    assert.equal(quarantined.json<{ inventoryStatus: string }>().inventoryStatus, "quarantined");
    const inspected = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/return-inspection`,
      headers: { cookie },
      payload: {
        resolution: "dispose",
        inspectedAt: new Date().toISOString(),
        idempotencyKey: randomUUID(),
        humanConfirmed: true,
      },
    });
    assert.equal(inspected.statusCode, 200, inspected.body);
    assert.equal(inspected.json<{ inventoryStatus: string }>().inventoryStatus, "disposal_pending");

    const ownerPulseLocation = await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      return transaction<Array<{ location_id: string }>>`
        select location_id
        from inventory_unit
        where workspace_id = ${owner.workspaceId} and status = 'available' and location_id is not null
        order by inventory_number
        limit 1
      `;
    });
    const ownerPulseLocationId = ownerPulseLocation[0]?.location_id;
    assert.ok(
      ownerPulseLocationId,
      "An available unit is required for owner-pulse review fixtures",
    );
    const pendingOwnerPhoto = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/locations/${ownerPulseLocationId}/photos?${locationPhotoQuery(randomUUID(), randomUUID())}`,
      headers: { cookie, "content-type": "image/jpeg" },
      payload: locationPhotoBytes,
    });
    assert.equal(pendingOwnerPhoto.statusCode, 201, pendingOwnerPhoto.body);
    assert.equal(pendingOwnerPhoto.json<{ reviewState: string }>().reviewState, "pending");
    const ownerPulseStocktake = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/stocktakes`,
      headers: { cookie },
      payload: { locationId: ownerPulseLocationId, humanConfirmed: true },
    });
    assert.equal(ownerPulseStocktake.statusCode, 201, ownerPulseStocktake.body);
    const ownerPulseStocktakeId = ownerPulseStocktake.json<{ stocktakeId: string }>().stocktakeId;
    const ownerPulseExpectedUnits = await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      return transaction<Array<{ inventory_number: string }>>`
        select inventory_number
        from inventory_unit
        where workspace_id = ${owner.workspaceId}
          and location_id = ${ownerPulseLocationId}
          and status in ('available', 'reserved', 'picked', 'packed')
        order by inventory_number
      `;
    });
    for (const unit of ownerPulseExpectedUnits) {
      const observedUnit = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${owner.workspaceId}/stocktakes/${ownerPulseStocktakeId}/observations`,
        headers: { cookie },
        payload: {
          readResult: "readable",
          inventoryNumber: unit.inventory_number,
          observedAt: new Date().toISOString(),
          humanConfirmed: true,
        },
      });
      assert.equal(observedUnit.statusCode, 200, observedUnit.body);
    }
    const unreadableOwnerPulseObservation = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/stocktakes/${ownerPulseStocktakeId}/observations`,
      headers: { cookie },
      payload: {
        readResult: "unreadable",
        failureReason: "damaged_label",
        observedAt: new Date().toISOString(),
        humanConfirmed: true,
      },
    });
    assert.equal(
      unreadableOwnerPulseObservation.statusCode,
      200,
      unreadableOwnerPulseObservation.body,
    );
    const ownerPulseReconciled = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/stocktakes/${ownerPulseStocktakeId}/reconcile`,
      headers: { cookie },
      payload: {},
    });
    assert.equal(ownerPulseReconciled.statusCode, 200, ownerPulseReconciled.body);
    assert.ok(
      ownerPulseReconciled.json<{ discrepancies: unknown[] }>().discrepancies.length > 0,
      "The owner-pulse stocktake fixture must leave a real review item",
    );
    const ownerPulse = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/owner-pulse`,
      headers: { cookie },
    });
    assert.equal(ownerPulse.statusCode, 200, ownerPulse.body);
    const approvalPulse = ownerPulse.json<{
      approvalPendingCount: number;
      approvalPendingBreakdown: {
        stocktakeDiscrepancyCount: number;
        locationPhotoCount: number;
        disposalCandidateCount: number;
        listingReviewCount: number;
      };
    }>();
    const approvalBreakdown = approvalPulse.approvalPendingBreakdown;
    assert.ok(approvalBreakdown.stocktakeDiscrepancyCount > 0);
    assert.ok(approvalBreakdown.locationPhotoCount > 0);
    assert.ok(approvalBreakdown.disposalCandidateCount > 0);
    assert.ok(approvalBreakdown.listingReviewCount > 0);
    assert.equal(
      approvalPulse.approvalPendingCount,
      approvalBreakdown.stocktakeDiscrepancyCount +
        approvalBreakdown.locationPhotoCount +
        approvalBreakdown.disposalCandidateCount +
        approvalBreakdown.listingReviewCount,
      "Owner-pulse total must equal the four review links",
    );
    const ownerPulseDiscrepancies = ownerPulseReconciled.json<{
      discrepancies: Array<{ discrepancyId: string }>;
    }>().discrepancies;
    for (const discrepancy of ownerPulseDiscrepancies) {
      const resolved = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${owner.workspaceId}/stocktakes/${ownerPulseStocktakeId}/discrepancies/${discrepancy.discrepancyId}/resolve`,
        headers: { cookie: managerCookie },
        payload: { resolution: "found_in_place", humanConfirmed: true },
      });
      assert.equal(resolved.statusCode, 200, resolved.body);
    }
    const managerIdentityId = managerMember.json<{ identityId: string }>().identityId;
    await assert.rejects(
      () =>
        inventory.begin(async (transaction) => {
          await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
          await transaction`
            update count_session set state = 'approved'
            where workspace_id = ${owner.workspaceId} and id = ${ownerPulseStocktakeId}
          `;
        }),
      /count_session_approval_state_actor_check/u,
    );
    await assert.rejects(
      () =>
        inventory.begin(async (transaction) => {
          await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
          await transaction`
            update count_session
            set approved_by = ${managerIdentityId}, approved_at = statement_timestamp()
            where workspace_id = ${owner.workspaceId} and id = ${ownerPulseStocktakeId}
          `;
        }),
      /count_session_approval_state_actor_check/u,
    );
    await assert.rejects(
      () =>
        inventory.begin(async (transaction) => {
          await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
          await transaction`
            update count_session
            set state = 'approved', approved_by = ${owner.identityId},
                approved_at = statement_timestamp()
            where workspace_id = ${owner.workspaceId} and id = ${ownerPulseStocktakeId}
          `;
        }),
      /count_session_approval_state_actor_check/u,
    );
    const directDualActorRoundTrip = await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`
        update count_session
        set state = 'approved', approved_by = ${managerIdentityId},
            approved_at = statement_timestamp()
        where workspace_id = ${owner.workspaceId} and id = ${ownerPulseStocktakeId}
      `;
      await transaction`
        update count_session
        set state = 'reconciliation', approved_by = null, approved_at = null
        where workspace_id = ${owner.workspaceId} and id = ${ownerPulseStocktakeId}
      `;
      const [roundTrip] = await transaction<
        Array<{ state: string; approved_by: string | null; approved_at: Date | null }>
      >`
        select state, approved_by, approved_at
        from count_session
        where workspace_id = ${owner.workspaceId} and id = ${ownerPulseStocktakeId}
      `;
      return roundTrip;
    });
    assert.deepEqual(directDualActorRoundTrip, {
      state: "reconciliation",
      approved_by: null,
      approved_at: null,
    });
    const dualActorSelfApproval = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/stocktakes/${ownerPulseStocktakeId}/approve`,
      headers: { cookie },
      payload: { humanConfirmed: true },
    });
    assert.equal(dualActorSelfApproval.statusCode, 409, dualActorSelfApproval.body);
    const approvedOwnerPulseStocktake = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/stocktakes/${ownerPulseStocktakeId}/approve`,
      headers: { cookie: managerCookie },
      payload: { humanConfirmed: true },
    });
    assert.equal(approvedOwnerPulseStocktake.statusCode, 200, approvedOwnerPulseStocktake.body);
    await assert.rejects(
      () =>
        inventory.begin(async (transaction) => {
          await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
          await transaction`
            update count_session set approved_by = null, approved_at = null
            where workspace_id = ${owner.workspaceId} and id = ${ownerPulseStocktakeId}
          `;
        }),
      /count_session_approval_state_actor_check/u,
    );
    await assert.rejects(
      () =>
        inventory.begin(async (transaction) => {
          await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
          await transaction`
            update count_session set state = 'reconciliation'
            where workspace_id = ${owner.workspaceId} and id = ${ownerPulseStocktakeId}
          `;
        }),
      /count_session_approval_state_actor_check/u,
    );
    const stocktakeBaselinePulse = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/owner-pulse`,
      headers: { cookie },
    });
    assert.equal(stocktakeBaselinePulse.statusCode, 200, stocktakeBaselinePulse.body);
    assert.equal(
      stocktakeBaselinePulse.json<{
        approvalPendingBreakdown: { stocktakeDiscrepancyCount: number };
      }>().approvalPendingBreakdown.stocktakeDiscrepancyCount,
      0,
      "Resolved and approved stocktakes must leave no stocktake review count",
    );

    const staleOrderScanAudits = await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      return transaction<Array<{ operation: string }>>`
        select redacted_changes->'after'->>'operation' as operation
        from audit_event
        where workspace_id = ${owner.workspaceId}
          and action = 'inventory.scan.rejected'
          and target_id = ${acquiredItem.inventoryUnitId}
          and reason_code = 'stale_label_version'
        order by occurred_at
      `;
    });
    assert.deepEqual(
      staleOrderScanAudits.map((event) => event.operation),
      ["pick", "quarantine"],
      "Pick and return-quarantine stale-label rejections must both leave audit evidence",
    );

    const soloAdmin = postgres(adminUrl, { max: 1 });
    try {
      await soloAdmin`
        update workspace_membership set active = false
        where workspace_id = ${owner.workspaceId} and identity_id <> ${owner.identityId}
      `;
      const soloUnits = await soloAdmin<
        Array<{
          id: string;
          inventory_number: string;
          location_id: string;
          location_code: string;
          inventory_label_version: number;
          location_label_version: number;
        }>
      >`
        select unit.id, unit.inventory_number, unit.location_id,
               location.code as location_code,
               item_label.version as inventory_label_version,
               place_label.version as location_label_version
        from inventory_unit unit
        join location_node location
          on location.workspace_id = unit.workspace_id and location.id = unit.location_id
        join inventory_label item_label
          on item_label.workspace_id = unit.workspace_id
         and item_label.target_type = 'inventory_unit' and item_label.target_id = unit.id
         and item_label.active
        join inventory_label place_label
          on place_label.workspace_id = location.workspace_id
         and place_label.target_type = 'location' and place_label.target_id = location.id
         and place_label.active
        where unit.workspace_id = ${owner.workspaceId} and unit.status = 'available'
          and not exists (
            select 1 from order_allocation allocation
            where allocation.workspace_id = unit.workspace_id
              and allocation.inventory_unit_id = unit.id and allocation.active
          )
          and 1 = (
            select count(*)
            from inventory_unit sibling
            where sibling.workspace_id = unit.workspace_id
              and sibling.location_id = unit.location_id
              and sibling.status in ('available', 'reserved', 'picked', 'packed')
          )
        order by unit.inventory_number limit 1
      `;
      const soloUnit = soloUnits[0];
      assert.ok(soloUnit, "A free available unit is required for solo discrepancy verification");
      const soloStarted = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${owner.workspaceId}/stocktakes`,
        headers: { cookie },
        payload: { locationId: soloUnit.location_id, humanConfirmed: true },
      });
      assert.equal(soloStarted.statusCode, 201, soloStarted.body);
      assert.equal(
        soloStarted.json<{ confirmationMode: string }>().confirmationMode,
        "solo_reversible",
      );
      assert.equal(
        soloStarted.json<{ activeMembershipCountAtSelection: number }>()
          .activeMembershipCountAtSelection,
        1,
      );
      const soloStocktakeId = soloStarted.json<{ stocktakeId: string }>().stocktakeId;
      const soloReconciledResponse = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${owner.workspaceId}/stocktakes/${soloStocktakeId}/reconcile`,
        headers: { cookie },
        payload: {},
      });
      assert.equal(soloReconciledResponse.statusCode, 200, soloReconciledResponse.body);
      const soloDiscrepancy = soloReconciledResponse
        .json<{
          discrepancies: Array<{
            discrepancyId: string;
            inventoryUnitId: string | null;
            expectedLocationId: string | null;
            expectedLocationCode: string | null;
            currentLocationId: string | null;
            currentLocationCode: string | null;
            kind: string;
            state: string;
          }>;
        }>()
        .discrepancies.find(
          (entry) => entry.inventoryUnitId === soloUnit.id && entry.kind === "missing_candidate",
        );
      assert.ok(soloDiscrepancy, "The unobserved snapshot unit must become a missing candidate");
      assert.equal(soloDiscrepancy.expectedLocationId, soloUnit.location_id);
      assert.equal(soloDiscrepancy.expectedLocationCode, soloUnit.location_code);
      assert.equal(soloDiscrepancy.currentLocationId, soloUnit.location_id);
      assert.equal(soloDiscrepancy.currentLocationCode, soloUnit.location_code);

      const evidence = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${owner.workspaceId}/stocktakes/${soloStocktakeId}/discrepancies/${soloDiscrepancy.discrepancyId}/evidence?mimeType=image%2Fjpeg`,
        headers: { cookie, "content-type": "image/jpeg" },
        payload: jpegWithGpsMetadata(),
      });
      assert.equal(evidence.statusCode, 201, evidence.body);
      assert.equal(evidence.json<{ serverInspected: boolean }>().serverInspected, true);
      await soloAdmin`
        update workspace_membership set active = true
        where workspace_id = ${owner.workspaceId}
          and identity_id in (
            select identity_id from auth_credential
            where email_normalized in ('manager@example.test', 'worker@example.test')
          )
      `;
      const evidenceList = await app.inject({
        method: "GET",
        url: `/v1/workspaces/${owner.workspaceId}/stocktakes/${soloStocktakeId}/discrepancies/${soloDiscrepancy.discrepancyId}/evidence`,
        headers: { cookie },
      });
      assert.equal(evidenceList.statusCode, 200, evidenceList.body);
      assert.equal(evidenceList.headers["cache-control"], "private, no-store");
      assert.equal(/storage.?key|original_sha|originalStorage/iu.test(evidenceList.body), false);
      const listedEvidence =
        evidenceList.json<Array<{ evidenceId: string; contentUrl: string; mimeType: string }>>();
      assert.equal(listedEvidence.length, 1);
      assert.equal(
        listedEvidence[0]?.evidenceId,
        evidence.json<{ evidenceId: string }>().evidenceId,
      );
      const evidenceContentUrl = listedEvidence[0]?.contentUrl;
      assert.ok(evidenceContentUrl);
      const evidenceContent = await app.inject({
        method: "GET",
        url: evidenceContentUrl,
        headers: { cookie },
      });
      assert.equal(evidenceContent.statusCode, 200, evidenceContent.body);
      assert.equal(evidenceContent.headers["content-type"], "image/jpeg");
      assert.equal(evidenceContent.headers["cache-control"], "private, no-store");
      assert.equal(evidenceContent.headers["x-content-type-options"], "nosniff");
      assert.equal(evidenceContent.rawPayload.includes(Buffer.from("GPSLatitude")), false);
      const managerEvidenceContent = await app.inject({
        method: "GET",
        url: evidenceContentUrl,
        headers: { cookie: managerCookie },
      });
      assert.equal(managerEvidenceContent.statusCode, 200, managerEvidenceContent.body);
      const workerEvidenceContent = await app.inject({
        method: "GET",
        url: evidenceContentUrl,
        headers: { cookie: workerCookie },
      });
      assert.equal(workerEvidenceContent.statusCode, 403, workerEvidenceContent.body);
      const foreignEvidenceContent = await app.inject({
        method: "GET",
        url: evidenceContentUrl.replace(owner.workspaceId, otherWorkspaceId),
        headers: { cookie },
      });
      assert.equal(foreignEvidenceContent.statusCode, 403, foreignEvidenceContent.body);
      const mismatchedEvidenceContent = await app.inject({
        method: "GET",
        url: evidenceContentUrl.replace(
          evidence.json<{ evidenceId: string }>().evidenceId,
          randomUUID(),
        ),
        headers: { cookie },
      });
      assert.equal(mismatchedEvidenceContent.statusCode, 409, mismatchedEvidenceContent.body);

      const scanAt = new Date().toISOString();
      const challenge = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${owner.workspaceId}/stocktakes/${soloStocktakeId}/discrepancies/${soloDiscrepancy.discrepancyId}/challenges`,
        headers: { cookie },
        payload: {
          action: "confirm",
          inventoryNumber: soloUnit.inventory_number,
          locationCode: soloUnit.location_code,
          inventoryLabelVersion: soloUnit.inventory_label_version,
          locationLabelVersion: soloUnit.location_label_version,
          inventoryScannedAt: scanAt,
          locationScannedAt: scanAt,
          humanInitiated: true,
        },
      });
      assert.equal(challenge.statusCode, 201, challenge.body);
      const earlyConfirmationPayload = {
        challengeId: challenge.json<{ challengeId: string }>().challengeId,
        evidenceId: evidence.json<{ evidenceId: string }>().evidenceId,
        reasonCode: "not_seen_during_count",
        reasonNote: "棚の現物を再確認しましたが見つかりませんでした。",
        confirmedAt: new Date().toISOString(),
        humanConfirmed: true,
      } as const;
      const earlyConfirmation = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${owner.workspaceId}/stocktakes/${soloStocktakeId}/discrepancies/${soloDiscrepancy.discrepancyId}/confirm`,
        headers: { cookie },
        payload: earlyConfirmationPayload,
      });
      assert.equal(earlyConfirmation.statusCode, 409, earlyConfirmation.body);
      await new Promise((resolve) => setTimeout(resolve, 3_100));
      const confirmedCandidate = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${owner.workspaceId}/stocktakes/${soloStocktakeId}/discrepancies/${soloDiscrepancy.discrepancyId}/confirm`,
        headers: { cookie },
        payload: { ...earlyConfirmationPayload, confirmedAt: new Date().toISOString() },
      });
      assert.equal(confirmedCandidate.statusCode, 200, confirmedCandidate.body);
      assert.equal(
        confirmedCandidate
          .json<{ discrepancies: Array<{ discrepancyId: string; state: string }> }>()
          .discrepancies.find((entry) => entry.discrepancyId === soloDiscrepancy.discrepancyId)
          ?.state,
        "candidate_confirmed",
      );
      const candidatePulse = await app.inject({
        method: "GET",
        url: `/v1/workspaces/${owner.workspaceId}/owner-pulse`,
        headers: { cookie },
      });
      assert.equal(candidatePulse.statusCode, 200, candidatePulse.body);
      assert.equal(
        candidatePulse.json<{
          approvalPendingBreakdown: { stocktakeDiscrepancyCount: number };
        }>().approvalPendingBreakdown.stocktakeDiscrepancyCount,
        1,
      );
      await assert.rejects(
        () =>
          inventory.begin(async (transaction) => {
            await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
            await transaction`
              update count_session
              set state = 'approved', approved_by = ${managerIdentityId},
                  approved_at = statement_timestamp()
              where workspace_id = ${owner.workspaceId} and id = ${soloStocktakeId}
            `;
          }),
        /count_session_approval_state_actor_check/u,
      );
      await assert.rejects(
        () =>
          inventory.begin(async (transaction) => {
            await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
            await transaction`
              update count_session set state = 'approved'
              where workspace_id = ${owner.workspaceId} and id = ${soloStocktakeId}
            `;
          }),
        /count_session_approval_state_actor_check/u,
      );
      const directSoloRoundTrip = await inventory.begin(async (transaction) => {
        await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
        await transaction`
          update count_session
          set state = 'approved', approved_by = ${owner.identityId},
              approved_at = statement_timestamp()
          where workspace_id = ${owner.workspaceId} and id = ${soloStocktakeId}
        `;
        await transaction`
          update count_session
          set state = 'reconciliation', approved_by = null, approved_at = null
          where workspace_id = ${owner.workspaceId} and id = ${soloStocktakeId}
        `;
        const [roundTrip] = await transaction<
          Array<{ state: string; approved_by: string | null; approved_at: Date | null }>
        >`
          select state, approved_by, approved_at
          from count_session
          where workspace_id = ${owner.workspaceId} and id = ${soloStocktakeId}
        `;
        return roundTrip;
      });
      assert.deepEqual(directSoloRoundTrip, {
        state: "reconciliation",
        approved_by: null,
        approved_at: null,
      });
      const soloDifferentActorApproval = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${owner.workspaceId}/stocktakes/${soloStocktakeId}/approve`,
        headers: { cookie: managerCookie },
        payload: { humanConfirmed: true },
      });
      assert.equal(soloDifferentActorApproval.statusCode, 409, soloDifferentActorApproval.body);
      const approvedCandidateStocktake = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${owner.workspaceId}/stocktakes/${soloStocktakeId}/approve`,
        headers: { cookie },
        payload: { humanConfirmed: true },
      });
      assert.equal(approvedCandidateStocktake.statusCode, 200, approvedCandidateStocktake.body);
      assert.equal(approvedCandidateStocktake.json<{ state: string }>().state, "approved");
      await assert.rejects(
        () =>
          inventory.begin(async (transaction) => {
            await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
            await transaction`
              update count_session set approved_by = null, approved_at = null
              where workspace_id = ${owner.workspaceId} and id = ${soloStocktakeId}
            `;
          }),
        /count_session_approval_state_actor_check/u,
      );
      assert.equal(
        approvedCandidateStocktake
          .json<{ discrepancies: Array<{ discrepancyId: string; state: string }> }>()
          .discrepancies.find((entry) => entry.discrepancyId === soloDiscrepancy.discrepancyId)
          ?.state,
        "candidate_confirmed",
      );
      const approvedCandidateList = await app.inject({
        method: "GET",
        url: `/v1/workspaces/${owner.workspaceId}/stocktakes`,
        headers: { cookie },
      });
      assert.equal(approvedCandidateList.statusCode, 200, approvedCandidateList.body);
      const approvedCandidateReadModel = approvedCandidateList
        .json<
          Array<{
            stocktakeId: string;
            state: string;
            discrepancies: Array<{ discrepancyId: string; state: string }>;
          }>
        >()
        .find((entry) => entry.stocktakeId === soloStocktakeId);
      assert.equal(approvedCandidateReadModel?.state, "approved");
      assert.equal(
        approvedCandidateReadModel?.discrepancies.find(
          (entry) => entry.discrepancyId === soloDiscrepancy.discrepancyId,
        )?.state,
        "candidate_confirmed",
      );
      const approvedCandidatePulse = await app.inject({
        method: "GET",
        url: `/v1/workspaces/${owner.workspaceId}/owner-pulse`,
        headers: { cookie },
      });
      assert.equal(approvedCandidatePulse.statusCode, 200, approvedCandidatePulse.body);
      assert.equal(
        approvedCandidatePulse.json<{
          approvalPendingBreakdown: { stocktakeDiscrepancyCount: number };
        }>().approvalPendingBreakdown.stocktakeDiscrepancyCount,
        1,
      );

      const blockedOrderId = randomUUID();
      await soloAdmin`
        insert into sales_order (id, workspace_id, order_number, state)
        values (${blockedOrderId}, ${owner.workspaceId}, ${`SO-SOLO-${blockedOrderId.slice(0, 8)}`}, 'confirmed')
      `;
      await assert.rejects(
        () =>
          soloAdmin`
            insert into order_allocation (workspace_id, order_id, inventory_unit_id, active)
            values (${owner.workspaceId}, ${blockedOrderId}, ${soloUnit.id}, true)
          `,
        /confirmed missing inventory cannot be allocated/u,
      );

      const foundLocationResponse = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${owner.workspaceId}/locations`,
        headers: { cookie },
        payload: {
          parentId: null,
          code: "SOLO-FOUND-01",
          name: "棚卸後に発見した保管箱",
          canStoreInventory: true,
          singleItemOnly: true,
          allowMixedSku: false,
          maxUnits: 1,
          humanConfirmed: true,
        },
      });
      assert.equal(foundLocationResponse.statusCode, 201, foundLocationResponse.body);
      const foundLocation = foundLocationResponse.json<{
        id: string;
        code: string;
        labelVersion: number;
      }>();

      const restoreScanAt = new Date().toISOString();
      const restoreChallenge = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${owner.workspaceId}/stocktakes/${soloStocktakeId}/discrepancies/${soloDiscrepancy.discrepancyId}/challenges`,
        headers: { cookie },
        payload: {
          action: "restore",
          inventoryNumber: soloUnit.inventory_number,
          locationCode: foundLocation.code,
          inventoryLabelVersion: soloUnit.inventory_label_version,
          locationLabelVersion: foundLocation.labelVersion,
          inventoryScannedAt: restoreScanAt,
          locationScannedAt: restoreScanAt,
          humanInitiated: true,
        },
      });
      assert.equal(restoreChallenge.statusCode, 201, restoreChallenge.body);
      const restoreRequest = {
        challengeId: restoreChallenge.json<{ challengeId: string }>().challengeId,
        reasonCode: "found_after_move",
        reasonNote: "別の保管箱で現物を発見し、商品と現在地を再読取しました。",
        humanConfirmed: true,
      } as const;
      const workerRestore = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${owner.workspaceId}/stocktakes/${soloStocktakeId}/discrepancies/${soloDiscrepancy.discrepancyId}/restore`,
        headers: { cookie: workerCookie },
        payload: { ...restoreRequest, confirmedAt: new Date().toISOString() },
      });
      assert.equal(workerRestore.statusCode, 403, workerRestore.body);
      const foreignWorkspaceRestore = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${otherWorkspaceId}/stocktakes/${soloStocktakeId}/discrepancies/${soloDiscrepancy.discrepancyId}/restore`,
        headers: { cookie },
        payload: { ...restoreRequest, confirmedAt: new Date().toISOString() },
      });
      assert.equal(foreignWorkspaceRestore.statusCode, 403, foreignWorkspaceRestore.body);
      const earlyRestore = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${owner.workspaceId}/stocktakes/${soloStocktakeId}/discrepancies/${soloDiscrepancy.discrepancyId}/restore`,
        headers: { cookie },
        payload: { ...restoreRequest, confirmedAt: new Date().toISOString() },
      });
      assert.equal(earlyRestore.statusCode, 409, earlyRestore.body);
      await new Promise((resolve) => setTimeout(resolve, 3_100));
      const restored = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${owner.workspaceId}/stocktakes/${soloStocktakeId}/discrepancies/${soloDiscrepancy.discrepancyId}/restore`,
        headers: { cookie },
        payload: {
          ...restoreRequest,
          confirmedAt: new Date().toISOString(),
        },
      });
      assert.equal(restored.statusCode, 200, restored.body);
      const restoredDiscrepancy = restored
        .json<{
          discrepancies: Array<{
            discrepancyId: string;
            state: string;
            expectedLocationId: string | null;
            expectedLocationCode: string | null;
            currentLocationId: string | null;
            currentLocationCode: string | null;
          }>;
        }>()
        .discrepancies.find((entry) => entry.discrepancyId === soloDiscrepancy.discrepancyId);
      assert.equal(restoredDiscrepancy?.state, "restored");
      assert.equal(restoredDiscrepancy?.expectedLocationId, soloUnit.location_id);
      assert.equal(restoredDiscrepancy?.expectedLocationCode, soloUnit.location_code);
      assert.equal(restoredDiscrepancy?.currentLocationId, foundLocation.id);
      assert.equal(restoredDiscrepancy?.currentLocationCode, foundLocation.code);
      const restoredLocation = await soloAdmin<
        Array<{ location_id: string; movement_kind: string; reason_code: string }>
      >`
        select unit.location_id, movement.movement_kind,
               audit.reason_code
        from inventory_unit unit
        join inventory_movement movement
          on movement.workspace_id = unit.workspace_id
         and movement.inventory_unit_id = unit.id
         and movement.movement_kind = 'discrepancy_restore'
        join audit_event audit
          on audit.workspace_id = unit.workspace_id
         and audit.target_id = ${soloDiscrepancy.discrepancyId}
         and audit.action = 'stocktake.missing_candidate.restored'
        where unit.workspace_id = ${owner.workspaceId} and unit.id = ${soloUnit.id}
        order by movement.moved_at desc, audit.occurred_at desc
        limit 1
      `;
      assert.equal(restoredLocation[0]?.location_id, foundLocation.id);
      assert.equal(restoredLocation[0]?.movement_kind, "discrepancy_restore");
      assert.equal(restoredLocation[0]?.reason_code, "found_after_move");
      const restoredPulse = await app.inject({
        method: "GET",
        url: `/v1/workspaces/${owner.workspaceId}/owner-pulse`,
        headers: { cookie },
      });
      assert.equal(restoredPulse.statusCode, 200, restoredPulse.body);
      assert.equal(
        restoredPulse.json<{
          approvalPendingBreakdown: { stocktakeDiscrepancyCount: number };
        }>().approvalPendingBreakdown.stocktakeDiscrepancyCount,
        0,
      );
      await soloAdmin`
        insert into order_allocation (workspace_id, order_id, inventory_unit_id, active)
        values (${owner.workspaceId}, ${blockedOrderId}, ${soloUnit.id}, true)
      `;
      const activeAllocation = await soloAdmin<Array<{ active_count: number }>>`
        select count(*)::integer as active_count
        from order_allocation
        where workspace_id = ${owner.workspaceId}
          and order_id = ${blockedOrderId}
          and inventory_unit_id = ${soloUnit.id}
          and active
      `;
      assert.equal(activeAllocation[0]?.active_count, 1);

      const directScanSessionPrivilege = await inventory<
        Array<{ can_update_scan_session: boolean }>
      >`
        select has_table_privilege(current_user, 'public.scan_session', 'UPDATE')
          as can_update_scan_session
      `;
      assert.equal(
        directScanSessionPrivilege[0]?.can_update_scan_session,
        false,
        "The runtime role must not gain direct scan_session UPDATE permission",
      );

      const dualLocationId = randomUUID();
      const dualFoundLocationId = randomUUID();
      const dualTransitLocationId = randomUUID();
      const dualSameUnitId = randomUUID();
      const dualMovedUnitId = randomUUID();
      const dualLocationLabelId = randomUUID();
      const dualFoundLocationLabelId = randomUUID();
      const dualTransitLocationLabelId = randomUUID();
      const dualSameUnitLabelId = randomUUID();
      const dualMovedUnitLabelId = randomUUID();
      const dualLocationCode = appendCodeCheckDigit("DUAL-A");
      const dualFoundLocationCode = appendCodeCheckDigit("DUAL-B");
      const dualTransitLocationCode = appendCodeCheckDigit("DUAL-C");
      const dualSameInventoryNumber = appendCodeCheckDigit("INV-910001");
      const dualMovedInventoryNumber = appendCodeCheckDigit("INV-910002");
      await soloAdmin`
        insert into location_node (
          id, workspace_id, parent_id, code, name, depth, can_store_inventory,
          single_item_only, allow_mixed_sku, max_units
        ) values
          (${dualLocationId}, ${owner.workspaceId}, ${rootLocationId}, ${dualLocationCode},
           '二者復元試験棚', 1, true, false, true, 2),
          (${dualFoundLocationId}, ${owner.workspaceId}, ${rootLocationId},
           ${dualFoundLocationCode}, '二者復元移動先', 1, true, true, false, 1),
          (${dualTransitLocationId}, ${owner.workspaceId}, ${rootLocationId},
           ${dualTransitLocationCode}, '二者復元競合試験用', 1, true, true, false, 1)
      `;
      await soloAdmin`
        insert into inventory_unit (id, workspace_id, sku_id, inventory_number) values
          (${dualSameUnitId}, ${owner.workspaceId}, ${skuId}, ${dualSameInventoryNumber}),
          (${dualMovedUnitId}, ${owner.workspaceId}, ${skuId}, ${dualMovedInventoryNumber})
      `;
      await soloAdmin`
        insert into inventory_label (
          id, workspace_id, target_type, target_id, label_kind, version,
          token_hash, short_code, issued_by
        ) values
          (${dualLocationLabelId}, ${owner.workspaceId}, 'location', ${dualLocationId},
           'qr', 1, ${hashFixture("dual-location-label")}, ${dualLocationCode},
           ${owner.identityId}),
          (${dualFoundLocationLabelId}, ${owner.workspaceId}, 'location',
           ${dualFoundLocationId}, 'qr', 1, ${hashFixture("dual-found-location-label")},
           ${dualFoundLocationCode}, ${owner.identityId}),
          (${dualTransitLocationLabelId}, ${owner.workspaceId}, 'location',
           ${dualTransitLocationId}, 'qr', 1, ${hashFixture("dual-transit-location-label")},
           ${dualTransitLocationCode}, ${owner.identityId}),
          (${dualSameUnitLabelId}, ${owner.workspaceId}, 'inventory_unit', ${dualSameUnitId},
           'qr', 1, ${hashFixture("dual-same-unit-label")}, ${dualSameInventoryNumber},
           ${owner.identityId}),
          (${dualMovedUnitLabelId}, ${owner.workspaceId}, 'inventory_unit', ${dualMovedUnitId},
           'qr', 1, ${hashFixture("dual-moved-unit-label")}, ${dualMovedInventoryNumber},
           ${owner.identityId})
      `;
      await putaway(
        dualSameUnitId,
        dualSameUnitLabelId,
        dualLocationId,
        dualLocationLabelId,
        "putaway-dual-same-location-restore",
      );
      await putaway(
        dualMovedUnitId,
        dualMovedUnitLabelId,
        dualLocationId,
        dualLocationLabelId,
        "putaway-dual-moved-location-restore",
      );

      const dualStarted = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${owner.workspaceId}/stocktakes`,
        headers: { cookie },
        payload: { locationId: dualLocationId, humanConfirmed: true },
      });
      assert.equal(dualStarted.statusCode, 201, dualStarted.body);
      assert.equal(dualStarted.json<{ confirmationMode: string }>().confirmationMode, "dual_actor");
      const dualStocktakeId = dualStarted.json<{ stocktakeId: string }>().stocktakeId;
      const dualReconciled = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${owner.workspaceId}/stocktakes/${dualStocktakeId}/reconcile`,
        headers: { cookie },
        payload: {},
      });
      assert.equal(dualReconciled.statusCode, 200, dualReconciled.body);
      const dualDiscrepancies = dualReconciled.json<{
        discrepancies: Array<{
          discrepancyId: string;
          inventoryUnitId: string | null;
          state: string;
        }>;
      }>().discrepancies;
      const dualSameDiscrepancy = dualDiscrepancies.find(
        (entry) => entry.inventoryUnitId === dualSameUnitId,
      );
      const dualMovedDiscrepancy = dualDiscrepancies.find(
        (entry) => entry.inventoryUnitId === dualMovedUnitId,
      );
      assert.ok(dualSameDiscrepancy);
      assert.ok(dualMovedDiscrepancy);

      const dualEvidenceResponses = await Promise.all(
        [dualSameDiscrepancy, dualMovedDiscrepancy].map((discrepancy) =>
          app.inject({
            method: "POST",
            url: `/v1/workspaces/${owner.workspaceId}/stocktakes/${dualStocktakeId}/discrepancies/${discrepancy.discrepancyId}/evidence?mimeType=image%2Fjpeg`,
            headers: { cookie, "content-type": "image/jpeg" },
            payload: jpegWithGpsMetadata(),
          }),
        ),
      );
      for (const response of dualEvidenceResponses) {
        assert.equal(response.statusCode, 201, response.body);
      }
      const dualEvidenceIds = dualEvidenceResponses.map(
        (response) => response.json<{ evidenceId: string }>().evidenceId,
      );
      const dualConfirmPayload = (
        discrepancyId: string,
        inventoryNumber: string,
        evidenceId: string,
      ) => ({
        discrepancyId,
        inventoryNumber,
        evidenceId,
      });
      const dualConfirmFixtures = [
        dualConfirmPayload(
          dualSameDiscrepancy.discrepancyId,
          dualSameInventoryNumber,
          dualEvidenceIds[0]!,
        ),
        dualConfirmPayload(
          dualMovedDiscrepancy.discrepancyId,
          dualMovedInventoryNumber,
          dualEvidenceIds[1]!,
        ),
      ];
      const ownerCannotCreateDualConfirmation = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${owner.workspaceId}/stocktakes/${dualStocktakeId}/discrepancies/${dualSameDiscrepancy.discrepancyId}/challenges`,
        headers: { cookie },
        payload: {
          action: "confirm",
          inventoryNumber: dualSameInventoryNumber,
          locationCode: dualLocationCode,
          inventoryLabelVersion: 1,
          locationLabelVersion: 1,
          inventoryScannedAt: new Date().toISOString(),
          locationScannedAt: new Date().toISOString(),
          humanInitiated: true,
        },
      });
      assert.equal(ownerCannotCreateDualConfirmation.statusCode, 403);

      const dualConfirmChallenges = await Promise.all(
        dualConfirmFixtures.map((fixture) => {
          const scannedAt = new Date().toISOString();
          return app.inject({
            method: "POST",
            url: `/v1/workspaces/${owner.workspaceId}/stocktakes/${dualStocktakeId}/discrepancies/${fixture.discrepancyId}/challenges`,
            headers: { cookie: managerCookie },
            payload: {
              action: "confirm",
              inventoryNumber: fixture.inventoryNumber,
              locationCode: dualLocationCode,
              inventoryLabelVersion: 1,
              locationLabelVersion: 1,
              inventoryScannedAt: scannedAt,
              locationScannedAt: scannedAt,
              humanInitiated: true,
            },
          });
        }),
      );
      for (const response of dualConfirmChallenges) {
        assert.equal(response.statusCode, 201, response.body);
      }
      await new Promise((resolve) => setTimeout(resolve, 3_100));
      for (const [index, fixture] of dualConfirmFixtures.entries()) {
        const confirmed = await app.inject({
          method: "POST",
          url: `/v1/workspaces/${owner.workspaceId}/stocktakes/${dualStocktakeId}/discrepancies/${fixture.discrepancyId}/confirm`,
          headers: { cookie: managerCookie },
          payload: {
            challengeId: dualConfirmChallenges[index]!.json<{ challengeId: string }>().challengeId,
            evidenceId: fixture.evidenceId,
            reasonCode: "not_seen_during_count",
            reasonNote: "別担当者が現物と場所を再確認しましたが、棚卸中には見つかりませんでした。",
            confirmedAt: new Date().toISOString(),
            humanConfirmed: true,
          },
        });
        assert.equal(confirmed.statusCode, 200, confirmed.body);
      }
      const dualApproved = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${owner.workspaceId}/stocktakes/${dualStocktakeId}/approve`,
        headers: { cookie: managerCookie },
        payload: { humanConfirmed: true },
      });
      assert.equal(dualApproved.statusCode, 200, dualApproved.body);
      assert.equal(dualApproved.json<{ state: string }>().state, "approved");

      const workerCannotRestoreDualCandidate = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${owner.workspaceId}/stocktakes/${dualStocktakeId}/discrepancies/${dualSameDiscrepancy.discrepancyId}/challenges`,
        headers: { cookie: workerCookie },
        payload: {
          action: "restore",
          inventoryNumber: dualSameInventoryNumber,
          locationCode: dualLocationCode,
          inventoryLabelVersion: 1,
          locationLabelVersion: 1,
          inventoryScannedAt: new Date().toISOString(),
          locationScannedAt: new Date().toISOString(),
          humanInitiated: true,
        },
      });
      assert.equal(workerCannotRestoreDualCandidate.statusCode, 403);

      const dualRestoreFixtures = [
        {
          discrepancyId: dualSameDiscrepancy.discrepancyId,
          inventoryNumber: dualSameInventoryNumber,
          locationCode: dualLocationCode,
          inventoryLabelVersion: 1,
          locationLabelVersion: 1,
          reasonCode: "found_in_place",
          reasonNote: "元の棚で現物を発見し、商品と同じ保管場所を再読取しました。",
        },
        {
          discrepancyId: dualMovedDiscrepancy.discrepancyId,
          inventoryNumber: dualMovedInventoryNumber,
          locationCode: dualFoundLocationCode,
          inventoryLabelVersion: 1,
          locationLabelVersion: 1,
          reasonCode: "found_after_move",
          reasonNote: "別の保管場所で現物を発見し、商品と移動先を再読取しました。",
        },
      ] as const;
      const createDualRestoreChallenge = (fixture: {
        discrepancyId: string;
        inventoryNumber: string;
        locationCode: string;
        inventoryLabelVersion: number;
        locationLabelVersion: number;
      }) => {
        const scannedAt = new Date().toISOString();
        return app.inject({
          method: "POST",
          url: `/v1/workspaces/${owner.workspaceId}/stocktakes/${dualStocktakeId}/discrepancies/${fixture.discrepancyId}/challenges`,
          headers: { cookie },
          payload: {
            action: "restore",
            inventoryNumber: fixture.inventoryNumber,
            locationCode: fixture.locationCode,
            inventoryLabelVersion: fixture.inventoryLabelVersion,
            locationLabelVersion: fixture.locationLabelVersion,
            inventoryScannedAt: scannedAt,
            locationScannedAt: scannedAt,
            humanInitiated: true,
          },
        });
      };
      const dualRestoreChallenges = await Promise.all(
        dualRestoreFixtures.map((fixture) => createDualRestoreChallenge(fixture)),
      );
      for (const response of dualRestoreChallenges) {
        assert.equal(response.statusCode, 201, response.body);
      }
      const identityBoundaryChallenge = await createDualRestoreChallenge(dualRestoreFixtures[0]);
      const legacyNullSnapshotChallenge = await createDualRestoreChallenge(dualRestoreFixtures[0]);
      assert.equal(identityBoundaryChallenge.statusCode, 201, identityBoundaryChallenge.body);
      assert.equal(legacyNullSnapshotChallenge.statusCode, 201, legacyNullSnapshotChallenge.body);
      const sameLocationRestoreChallengeId = dualRestoreChallenges[0]!.json<{
        challengeId: string;
      }>().challengeId;
      const movedLocationRestoreChallengeId = dualRestoreChallenges[1]!.json<{
        challengeId: string;
      }>().challengeId;
      const identityBoundaryChallengeId = identityBoundaryChallenge.json<{
        challengeId: string;
      }>().challengeId;
      const legacyNullSnapshotChallengeId = legacyNullSnapshotChallenge.json<{
        challengeId: string;
      }>().challengeId;
      const issuedMovementSnapshots = await soloAdmin<
        Array<{ challenge_id: string; movement_snapshot: number | null }>
      >`
        select challenge.id as challenge_id,
               session.inventory_movement_seq_snapshot::integer as movement_snapshot
        from discrepancy_confirmation_challenge challenge
        join scan_session session
          on session.workspace_id = challenge.workspace_id and session.id = challenge.scan_session_id
        where challenge.workspace_id = ${owner.workspaceId}
          and challenge.id in ${soloAdmin([
            sameLocationRestoreChallengeId,
            movedLocationRestoreChallengeId,
            identityBoundaryChallengeId,
            legacyNullSnapshotChallengeId,
          ])}
        order by challenge.id
      `;
      assert.equal(issuedMovementSnapshots.length, 4);
      assert.equal(
        issuedMovementSnapshots.every((entry) => entry.movement_snapshot === 1),
        true,
        "Every newly issued discrepancy challenge must snapshot movement_seq",
      );
      await soloAdmin`
        update scan_session session
        set inventory_movement_seq_snapshot = null
        from discrepancy_confirmation_challenge challenge
        where challenge.workspace_id = ${owner.workspaceId}
          and challenge.id = ${legacyNullSnapshotChallengeId}
          and session.workspace_id = challenge.workspace_id
          and session.id = challenge.scan_session_id
      `;

      const readRestoreBoundary = async (challengeId: string) => {
        const [boundary] = await soloAdmin<
          Array<{
            used_at: Date | null;
            consumed_at: Date | null;
            state: string;
            restoration_scan_session_id: string | null;
            restore_audit_count: number;
          }>
        >`
          select challenge.used_at, session.consumed_at, discrepancy.state,
                 discrepancy.restoration_scan_session_id,
                 (select count(*)::integer from audit_event audit
                  where audit.workspace_id = discrepancy.workspace_id
                    and audit.target_id = discrepancy.id
                    and audit.action = 'stocktake.missing_candidate.restored')
                   as restore_audit_count
          from discrepancy_confirmation_challenge challenge
          join scan_session session
            on session.workspace_id = challenge.workspace_id and session.id = challenge.scan_session_id
          join inventory_discrepancy discrepancy
            on discrepancy.workspace_id = challenge.workspace_id
           and discrepancy.id = challenge.discrepancy_id
          where challenge.workspace_id = ${owner.workspaceId} and challenge.id = ${challengeId}
        `;
        assert.ok(boundary);
        return boundary;
      };
      const assertUnusedCandidateBoundary = async (challengeId: string) => {
        assert.deepEqual(await readRestoreBoundary(challengeId), {
          used_at: null,
          consumed_at: null,
          state: "candidate_confirmed",
          restoration_scan_session_id: null,
          restore_audit_count: 0,
        });
      };
      const consumeRestoreDirect = async (
        challengeId: string,
        discrepancyId: string,
        identityContext: string | null,
        targetActorId = owner.identityId,
        workspaceContext = owner.workspaceId,
      ) =>
        inventory.begin(async (transaction) => {
          await transaction`select set_config('app.workspace_id', ${workspaceContext}, true)`;
          await transaction`select set_config('app.identity_id', ${identityContext ?? ""}, true)`;
          return transaction<Array<{ scan_session_id: string; used_at: Date }>>`
            select scan_session_id, used_at
            from consume_discrepancy_confirmation_challenge(
              ${owner.workspaceId}, ${challengeId}, ${discrepancyId}, ${targetActorId},
              'restore', statement_timestamp()
            )
          `;
        });
      const sameLocationRestoreRequest = {
        challengeId: sameLocationRestoreChallengeId,
        reasonCode: dualRestoreFixtures[0].reasonCode,
        reasonNote: dualRestoreFixtures[0].reasonNote,
        humanConfirmed: true,
      } as const;
      const wrongRestoreActor = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${owner.workspaceId}/stocktakes/${dualStocktakeId}/discrepancies/${dualSameDiscrepancy.discrepancyId}/restore`,
        headers: { cookie: managerCookie },
        payload: { ...sameLocationRestoreRequest, confirmedAt: new Date().toISOString() },
      });
      assert.equal(wrongRestoreActor.statusCode, 409, wrongRestoreActor.body);
      const foreignDualRestore = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${otherWorkspaceId}/stocktakes/${dualStocktakeId}/discrepancies/${dualSameDiscrepancy.discrepancyId}/restore`,
        headers: { cookie },
        payload: { ...sameLocationRestoreRequest, confirmedAt: new Date().toISOString() },
      });
      assert.equal(foreignDualRestore.statusCode, 403, foreignDualRestore.body);
      const earlySameLocationRestore = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${owner.workspaceId}/stocktakes/${dualStocktakeId}/discrepancies/${dualSameDiscrepancy.discrepancyId}/restore`,
        headers: { cookie },
        payload: { ...sameLocationRestoreRequest, confirmedAt: new Date().toISOString() },
      });
      assert.equal(earlySameLocationRestore.statusCode, 409, earlySameLocationRestore.body);
      const [sameLocationAfterRollback] = await soloAdmin<
        Array<{ used_at: Date | null; consumed_at: Date | null; state: string }>
      >`
        select challenge.used_at, session.consumed_at, discrepancy.state
        from discrepancy_confirmation_challenge challenge
        join scan_session session
          on session.workspace_id = challenge.workspace_id and session.id = challenge.scan_session_id
        join inventory_discrepancy discrepancy
          on discrepancy.workspace_id = challenge.workspace_id
         and discrepancy.id = challenge.discrepancy_id
        where challenge.workspace_id = ${owner.workspaceId}
          and challenge.id = ${sameLocationRestoreChallengeId}
      `;
      assert.deepEqual(sameLocationAfterRollback, {
        used_at: null,
        consumed_at: null,
        state: "candidate_confirmed",
      });

      await new Promise((resolve) => setTimeout(resolve, 3_100));

      await assert.rejects(
        () =>
          consumeRestoreDirect(
            identityBoundaryChallengeId,
            dualSameDiscrepancy.discrepancyId,
            null,
          ),
        hasDatabaseCode("42501"),
      );
      await assert.rejects(
        () =>
          consumeRestoreDirect(
            identityBoundaryChallengeId,
            dualSameDiscrepancy.discrepancyId,
            managerIdentityId,
          ),
        hasDatabaseCode("42501"),
      );
      await assert.rejects(
        () =>
          consumeRestoreDirect(
            identityBoundaryChallengeId,
            dualSameDiscrepancy.discrepancyId,
            owner.identityId,
            owner.identityId,
            otherWorkspaceId,
          ),
        hasDatabaseCode("42501"),
      );
      await assertUnusedCandidateBoundary(identityBoundaryChallengeId);

      await soloAdmin`
        update workspace_membership set role = 'field_worker'
        where workspace_id = ${owner.workspaceId} and identity_id = ${owner.identityId}
      `;
      try {
        await assert.rejects(
          () =>
            consumeRestoreDirect(
              identityBoundaryChallengeId,
              dualSameDiscrepancy.discrepancyId,
              owner.identityId,
            ),
          hasDatabaseCode("42501"),
        );
      } finally {
        await soloAdmin`
          update workspace_membership set role = 'owner'
          where workspace_id = ${owner.workspaceId} and identity_id = ${owner.identityId}
        `;
      }
      await assertUnusedCandidateBoundary(identityBoundaryChallengeId);

      await soloAdmin`
        update workspace_membership set active = false
        where workspace_id = ${owner.workspaceId} and identity_id = ${owner.identityId}
      `;
      try {
        await assert.rejects(
          () =>
            consumeRestoreDirect(
              identityBoundaryChallengeId,
              dualSameDiscrepancy.discrepancyId,
              owner.identityId,
            ),
          hasDatabaseCode("42501"),
        );
      } finally {
        await soloAdmin`
          update workspace_membership set active = true
          where workspace_id = ${owner.workspaceId} and identity_id = ${owner.identityId}
        `;
      }
      await assertUnusedCandidateBoundary(identityBoundaryChallengeId);

      const raceLocker = postgres(adminUrl, { max: 1 });
      const raceCanceller = postgres(adminUrl, { max: 1 });
      let signalChallengeRelease: (() => void) | undefined;
      let signalChallengeLocked: (() => void) | undefined;
      const challengeLocked = new Promise<void>((resolve) => {
        signalChallengeLocked = resolve;
      });
      const challengeRelease = new Promise<void>((resolve) => {
        signalChallengeRelease = resolve;
      });
      const heldChallenge = raceLocker.begin(async (transaction) => {
        await transaction`
          select id from discrepancy_confirmation_challenge
          where workspace_id = ${owner.workspaceId} and id = ${identityBoundaryChallengeId}
          for update
        `;
        signalChallengeLocked?.();
        await challengeRelease;
      });
      try {
        await challengeLocked;
        const restoreDuringCancellation = app.inject({
          method: "POST",
          url: `/v1/workspaces/${owner.workspaceId}/stocktakes/${dualStocktakeId}/discrepancies/${dualSameDiscrepancy.discrepancyId}/restore`,
          headers: { cookie },
          payload: {
            challengeId: identityBoundaryChallengeId,
            reasonCode: "found_in_place",
            reasonNote: "権限取消と同時になった復元は安全に拒否されます。",
            confirmedAt: new Date().toISOString(),
            humanConfirmed: true,
          },
        });
        await new Promise((resolve) => setTimeout(resolve, 150));
        await raceCanceller`
          update workspace_membership set active = false
          where workspace_id = ${owner.workspaceId} and identity_id = ${owner.identityId}
        `;
        signalChallengeRelease?.();
        const cancelledRestore = await restoreDuringCancellation;
        assert.equal(cancelledRestore.statusCode, 403, cancelledRestore.body);
        assert.match(cancelledRestore.body, /no longer authorized/u);
      } finally {
        signalChallengeRelease?.();
        await heldChallenge;
        await raceLocker.end({ timeout: 5 });
        await raceCanceller.end({ timeout: 5 });
        await soloAdmin`
          update workspace_membership set active = true, role = 'owner'
          where workspace_id = ${owner.workspaceId} and identity_id = ${owner.identityId}
        `;
      }
      await assertUnusedCandidateBoundary(identityBoundaryChallengeId);

      const legacyNullRestore = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${owner.workspaceId}/stocktakes/${dualStocktakeId}/discrepancies/${dualSameDiscrepancy.discrepancyId}/restore`,
        headers: { cookie },
        payload: {
          challengeId: legacyNullSnapshotChallengeId,
          reasonCode: "found_in_place",
          reasonNote: "移動履歴のない旧確認は再発行します。",
          confirmedAt: new Date().toISOString(),
          humanConfirmed: true,
        },
      });
      assert.equal(legacyNullRestore.statusCode, 409, legacyNullRestore.body);
      await assertUnusedCandidateBoundary(legacyNullSnapshotChallengeId);

      await moveAvailableUnit(
        dualSameUnitId,
        dualSameUnitLabelId,
        1,
        dualTransitLocationId,
        dualTransitLocationLabelId,
        1,
        "dual-same-away-after-restore-scan",
      );
      await moveAvailableUnit(
        dualSameUnitId,
        dualSameUnitLabelId,
        1,
        dualLocationId,
        dualLocationLabelId,
        1,
        "dual-same-back-after-restore-scan",
      );
      const awayAndBackRestore = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${owner.workspaceId}/stocktakes/${dualStocktakeId}/discrepancies/${dualSameDiscrepancy.discrepancyId}/restore`,
        headers: { cookie },
        payload: { ...sameLocationRestoreRequest, confirmedAt: new Date().toISOString() },
      });
      assert.equal(awayAndBackRestore.statusCode, 409, awayAndBackRestore.body);
      await assertUnusedCandidateBoundary(sameLocationRestoreChallengeId);

      await soloAdmin`
        update location_node set state = 'inactive'
        where workspace_id = ${owner.workspaceId} and id = ${dualFoundLocationId}
      `;
      const invalidDestinationRestore = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${owner.workspaceId}/stocktakes/${dualStocktakeId}/discrepancies/${dualMovedDiscrepancy.discrepancyId}/restore`,
        headers: { cookie },
        payload: {
          challengeId: movedLocationRestoreChallengeId,
          reasonCode: dualRestoreFixtures[1].reasonCode,
          reasonNote: dualRestoreFixtures[1].reasonNote,
          confirmedAt: new Date().toISOString(),
          humanConfirmed: true,
        },
      });
      assert.equal(invalidDestinationRestore.statusCode, 409, invalidDestinationRestore.body);
      await assertUnusedCandidateBoundary(movedLocationRestoreChallengeId);
      await soloAdmin`
        update location_node set state = 'active'
        where workspace_id = ${owner.workspaceId} and id = ${dualFoundLocationId}
      `;

      const reissuedMovedLabel = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${owner.workspaceId}/inventory-labels/reissue`,
        headers: { cookie },
        payload: {
          targetType: "inventory_unit",
          targetId: dualMovedUnitId,
          reasonCode: "damaged",
          humanConfirmed: true,
        },
      });
      assert.equal(reissuedMovedLabel.statusCode, 201, reissuedMovedLabel.body);
      const movedLabelV2 = reissuedMovedLabel.json<{ labelId: string; version: number }>();
      assert.equal(movedLabelV2.version, 2);
      const staleLabelRestore = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${owner.workspaceId}/stocktakes/${dualStocktakeId}/discrepancies/${dualMovedDiscrepancy.discrepancyId}/restore`,
        headers: { cookie },
        payload: {
          challengeId: movedLocationRestoreChallengeId,
          reasonCode: dualRestoreFixtures[1].reasonCode,
          reasonNote: dualRestoreFixtures[1].reasonNote,
          confirmedAt: new Date().toISOString(),
          humanConfirmed: true,
        },
      });
      assert.equal(staleLabelRestore.statusCode, 409, staleLabelRestore.body);
      await assertUnusedCandidateBoundary(movedLocationRestoreChallengeId);

      const sameLocationFreshChallenge = await createDualRestoreChallenge({
        ...dualRestoreFixtures[0],
        inventoryLabelVersion: 1,
      });
      const sameLocationStateRaceChallenge = await createDualRestoreChallenge({
        ...dualRestoreFixtures[0],
        inventoryLabelVersion: 1,
      });
      const movedLocationBeforeMoveChallenge = await createDualRestoreChallenge({
        ...dualRestoreFixtures[1],
        inventoryLabelVersion: 2,
      });
      for (const response of [
        sameLocationFreshChallenge,
        sameLocationStateRaceChallenge,
        movedLocationBeforeMoveChallenge,
      ]) {
        assert.equal(response.statusCode, 201, response.body);
      }
      await new Promise((resolve) => setTimeout(resolve, 3_100));

      await moveAvailableUnit(
        dualMovedUnitId,
        movedLabelV2.labelId,
        2,
        dualFoundLocationId,
        dualFoundLocationLabelId,
        1,
        "dual-moved-to-scanned-destination-before-restore",
      );
      const movedBeforeRestoreChallengeId = movedLocationBeforeMoveChallenge.json<{
        challengeId: string;
      }>().challengeId;
      const movedBeforeRestore = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${owner.workspaceId}/stocktakes/${dualStocktakeId}/discrepancies/${dualMovedDiscrepancy.discrepancyId}/restore`,
        headers: { cookie },
        payload: {
          challengeId: movedBeforeRestoreChallengeId,
          reasonCode: dualRestoreFixtures[1].reasonCode,
          reasonNote: dualRestoreFixtures[1].reasonNote,
          confirmedAt: new Date().toISOString(),
          humanConfirmed: true,
        },
      });
      assert.equal(movedBeforeRestore.statusCode, 409, movedBeforeRestore.body);
      await assertUnusedCandidateBoundary(movedBeforeRestoreChallengeId);
      await moveAvailableUnit(
        dualMovedUnitId,
        movedLabelV2.labelId,
        2,
        dualLocationId,
        dualLocationLabelId,
        1,
        "dual-moved-returned-before-fresh-restore-scan",
      );

      const finalMovedLocationChallenge = await createDualRestoreChallenge({
        ...dualRestoreFixtures[1],
        inventoryLabelVersion: 2,
      });
      assert.equal(finalMovedLocationChallenge.statusCode, 201, finalMovedLocationChallenge.body);

      const sameLocationFreshChallengeId = sameLocationFreshChallenge.json<{
        challengeId: string;
      }>().challengeId;
      const restoredSameLocation = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${owner.workspaceId}/stocktakes/${dualStocktakeId}/discrepancies/${dualSameDiscrepancy.discrepancyId}/restore`,
        headers: { cookie },
        payload: {
          ...sameLocationRestoreRequest,
          challengeId: sameLocationFreshChallengeId,
          confirmedAt: new Date().toISOString(),
        },
      });
      assert.equal(restoredSameLocation.statusCode, 200, restoredSameLocation.body);

      const stateRaceChallengeId = sameLocationStateRaceChallenge.json<{
        challengeId: string;
      }>().challengeId;
      await assert.rejects(
        () =>
          consumeRestoreDirect(
            stateRaceChallengeId,
            dualSameDiscrepancy.discrepancyId,
            owner.identityId,
          ),
        hasDatabaseCode("40001"),
      );
      const stateRaceBoundary = await readRestoreBoundary(stateRaceChallengeId);
      assert.equal(stateRaceBoundary.used_at, null);
      assert.equal(stateRaceBoundary.consumed_at, null);
      assert.equal(stateRaceBoundary.state, "restored");
      assert.ok(stateRaceBoundary.restoration_scan_session_id);
      assert.equal(stateRaceBoundary.restore_audit_count, 1);

      await new Promise((resolve) => setTimeout(resolve, 3_100));
      const finalMovedLocationChallengeId = finalMovedLocationChallenge.json<{
        challengeId: string;
      }>().challengeId;
      const restoredMovedLocation = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${owner.workspaceId}/stocktakes/${dualStocktakeId}/discrepancies/${dualMovedDiscrepancy.discrepancyId}/restore`,
        headers: { cookie },
        payload: {
          challengeId: finalMovedLocationChallengeId,
          reasonCode: dualRestoreFixtures[1].reasonCode,
          reasonNote: dualRestoreFixtures[1].reasonNote,
          confirmedAt: new Date().toISOString(),
          humanConfirmed: true,
        },
      });
      assert.equal(restoredMovedLocation.statusCode, 200, restoredMovedLocation.body);
      const replayedSameLocationRestore = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${owner.workspaceId}/stocktakes/${dualStocktakeId}/discrepancies/${dualSameDiscrepancy.discrepancyId}/restore`,
        headers: { cookie },
        payload: { ...sameLocationRestoreRequest, confirmedAt: new Date().toISOString() },
      });
      assert.equal(replayedSameLocationRestore.statusCode, 409, replayedSameLocationRestore.body);

      const [dualApprovalHistory] = await soloAdmin<
        Array<{
          state: string;
          initial_counter_id: string;
          approved_by: string;
          approved_at: Date;
        }>
      >`
        select state, initial_counter_id, approved_by, approved_at
        from count_session
        where workspace_id = ${owner.workspaceId} and id = ${dualStocktakeId}
      `;
      assert.equal(dualApprovalHistory?.state, "approved");
      assert.equal(dualApprovalHistory?.initial_counter_id, owner.identityId);
      assert.equal(dualApprovalHistory?.approved_by, managerIdentityId);
      assert.ok(dualApprovalHistory?.approved_at);
      const dualRestoreHistory = await soloAdmin<
        Array<{
          inventory_unit_id: string;
          state: string;
          requester_id: string;
          reconfirmer_id: string;
          approver_id: string;
          current_location_id: string;
          restore_movement_count: number;
          restore_audit_count: number;
          restore_audit_actor_id: string | null;
          restore_scan_consumed_at: Date | null;
        }>
      >`
        select discrepancy.inventory_unit_id, discrepancy.state, discrepancy.requester_id,
               discrepancy.reconfirmer_id, discrepancy.approver_id,
               unit.location_id as current_location_id,
               (select count(*)::integer from inventory_movement movement
                 where movement.workspace_id = discrepancy.workspace_id
                   and movement.inventory_unit_id = discrepancy.inventory_unit_id
                   and movement.movement_kind = 'discrepancy_restore') as restore_movement_count,
               (select count(*)::integer from audit_event audit
                 where audit.workspace_id = discrepancy.workspace_id
                   and audit.target_id = discrepancy.id
                   and audit.action = 'stocktake.missing_candidate.restored') as restore_audit_count,
               (select audit.actor_id from audit_event audit
                 where audit.workspace_id = discrepancy.workspace_id
                   and audit.target_id = discrepancy.id
                   and audit.action = 'stocktake.missing_candidate.restored'
                 order by audit.occurred_at desc limit 1) as restore_audit_actor_id,
               restore_scan.consumed_at as restore_scan_consumed_at
        from inventory_discrepancy discrepancy
        join inventory_unit unit
          on unit.workspace_id = discrepancy.workspace_id and unit.id = discrepancy.inventory_unit_id
        join scan_session restore_scan
          on restore_scan.workspace_id = discrepancy.workspace_id
         and restore_scan.id = discrepancy.restoration_scan_session_id
        where discrepancy.workspace_id = ${owner.workspaceId}
          and discrepancy.count_session_id = ${dualStocktakeId}
        order by discrepancy.inventory_unit_id
      `;
      assert.equal(dualRestoreHistory.length, 2);
      const sameLocationHistory = dualRestoreHistory.find(
        (entry) => entry.inventory_unit_id === dualSameUnitId,
      );
      const movedLocationHistory = dualRestoreHistory.find(
        (entry) => entry.inventory_unit_id === dualMovedUnitId,
      );
      assert.deepEqual(
        sameLocationHistory && {
          state: sameLocationHistory.state,
          requester_id: sameLocationHistory.requester_id,
          reconfirmer_id: sameLocationHistory.reconfirmer_id,
          approver_id: sameLocationHistory.approver_id,
          current_location_id: sameLocationHistory.current_location_id,
          restore_movement_count: sameLocationHistory.restore_movement_count,
          restore_audit_count: sameLocationHistory.restore_audit_count,
          restore_audit_actor_id: sameLocationHistory.restore_audit_actor_id,
          scanConsumed: sameLocationHistory.restore_scan_consumed_at !== null,
        },
        {
          state: "restored",
          requester_id: owner.identityId,
          reconfirmer_id: managerIdentityId,
          approver_id: managerIdentityId,
          current_location_id: dualLocationId,
          restore_movement_count: 0,
          restore_audit_count: 1,
          restore_audit_actor_id: owner.identityId,
          scanConsumed: true,
        },
      );
      assert.deepEqual(
        movedLocationHistory && {
          state: movedLocationHistory.state,
          requester_id: movedLocationHistory.requester_id,
          reconfirmer_id: movedLocationHistory.reconfirmer_id,
          approver_id: movedLocationHistory.approver_id,
          current_location_id: movedLocationHistory.current_location_id,
          restore_movement_count: movedLocationHistory.restore_movement_count,
          restore_audit_count: movedLocationHistory.restore_audit_count,
          restore_audit_actor_id: movedLocationHistory.restore_audit_actor_id,
          scanConsumed: movedLocationHistory.restore_scan_consumed_at !== null,
        },
        {
          state: "restored",
          requester_id: owner.identityId,
          reconfirmer_id: managerIdentityId,
          approver_id: managerIdentityId,
          current_location_id: dualFoundLocationId,
          restore_movement_count: 1,
          restore_audit_count: 1,
          restore_audit_actor_id: owner.identityId,
          scanConsumed: true,
        },
      );
    } finally {
      await soloAdmin.end({ timeout: 5 });
    }

    const secrecyAdmin = postgres(adminUrl, { max: 1 });
    try {
      const leaks = await secrecyAdmin<Array<{ leaked: boolean }>>`
        select exists (
          select 1 from audit_event
          where workspace_id = ${owner.workspaceId}
            and (redacted_changes::text ilike ${`%${fictionalAddress}%`}
              or array_to_string(field_names, ',') ilike '%shippingAddress%')
        ) as leaked
      `;
      assert.equal(leaks[0]?.leaked, false);
      const incompleteAudit = await secrecyAdmin<Array<{ missing_count: number }>>`
        select count(*)::integer as missing_count from audit_event
        where workspace_id = ${owner.workspaceId}
          and (
            action like 'order.%' or action like 'address.%' or action like 'accounting.%'
            or action like 'team.%' or action like 'stocktake.%' or action like 'media.%'
            or action like 'inventory.scan.%'
            or action in ('inventory.putaway', 'inventory.label.reissued')
          )
          and (redacted_changes is null or not (redacted_changes ? 'before')
            or not (redacted_changes ? 'after'))
      `;
      assert.equal(incompleteAudit[0]?.missing_count, 0);
    } finally {
      await secrecyAdmin.end({ timeout: 5 });
    }
  } finally {
    await inventory.end({ timeout: 5 });
  }

  const interruptedPilotItem = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/p0-items`,
    headers: { cookie },
    payload: {
      skuCode: "SKU-PILOT-INTERRUPTED",
      title: "架空の中断確認商品",
      category: "トップス",
      supplierName: "架空テスト仕入先",
      receiptReference: "RECEIPT-PILOT-INTERRUPTED",
      purchasedAt: new Date().toISOString(),
      receiptAmountMinor: 1200,
      allocatedCostMinor: 1200,
      idempotencyKey: randomUUID(),
      humanConfirmed: true,
      pilot: { runId: pilotRunId, productFixtureId: "TOP-02" },
    },
  });
  assert.equal(interruptedPilotItem.statusCode, 201, interruptedPilotItem.body);
  const invalidPilotEventKey = randomUUID();
  const invalidPilotEventPayload = {
    eventType: "invalid_attempt",
    detailCode: "browser_reload_or_reopen",
    idempotencyKey: invalidPilotEventKey,
    humanConfirmed: true,
  } as const;
  const invalidPilotEvent = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/pilot-runs/${pilotRunId}/events`,
    headers: { cookie },
    payload: invalidPilotEventPayload,
  });
  assert.equal(invalidPilotEvent.statusCode, 201, invalidPilotEvent.body);
  const invalidPilotReplay = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/pilot-runs/${pilotRunId}/events`,
    headers: { cookie },
    payload: invalidPilotEventPayload,
  });
  assert.equal(invalidPilotReplay.statusCode, 201, invalidPilotReplay.body);
  const failedPilot = invalidPilotReplay.json<{
    state: string;
    summary: { itemCount: number; invalidAttemptCount: number; passed: boolean | null };
  }>();
  assert.equal(failedPilot.state, "failed");
  assert.equal(failedPilot.summary.itemCount, 2);
  assert.equal(failedPilot.summary.invalidAttemptCount, 1);
  assert.equal(failedPilot.summary.passed, false);

  const lateRunId = randomUUID();
  const lateAdmin = postgres(adminUrl, { max: 1 });
  try {
    await lateAdmin.begin(async (transaction) => {
      await transaction`
        insert into pilot_run (
          id, workspace_id, protocol_version, commit_sha, migration_version,
          platform, browser, viewport, actor_id, warmup_completed_at
        ) values (
          ${lateRunId}, ${owner.workspaceId}, 'listing_prep_pilot_v1.0.0', ${"b".repeat(40)},
          '0028', 'Windows late-event fixture', 'Chromium response-loss fixture', '390x844',
          ${owner.identityId}, statement_timestamp()
        )
      `;
      const lateFixtures = [
        ["TOP-01", "tops"],
        ["TOP-02", "tops"],
        ["TOP-03", "tops"],
        ["TOP-04", "tops"],
        ["OUTER-01", "outer"],
        ["OUTER-02", "outer"],
        ["PANTS-01", "pants"],
        ["PANTS-02", "pants"],
        ["KNIT-01", "knit"],
        ["KNIT-02", "knit"],
      ] as const;
      for (const [index, [fixtureId, category]] of lateFixtures.entries()) {
        const skuId = randomUUID();
        await transaction`
          insert into product_sku (id, workspace_id, sku_code, title, category)
          values (
            ${skuId}, ${owner.workspaceId}, ${`SKU-LATE-${String(index + 1).padStart(2, "0")}`},
            ${`Late response fixture ${fixtureId}`}, ${category}
          )
        `;
        await transaction`
          insert into pilot_item_measurement (
            id, workspace_id, pilot_run_id, sku_id, product_fixture_id, category,
            started_at, completed_at, copy_ready_workflow_version
          ) values (
            ${randomUUID()}, ${owner.workspaceId}, ${lateRunId}, ${skuId},
            ${fixtureId}, ${category}, statement_timestamp() - interval '60 seconds',
            statement_timestamp(), 4
          )
        `;
      }
      await transaction`
        update pilot_run set state = 'completed', completed_at = statement_timestamp()
        where workspace_id = ${owner.workspaceId} and id = ${lateRunId}
      `;
    });
  } finally {
    await lateAdmin.end({ timeout: 5 });
  }
  const lateSafetyEvent = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/pilot-runs/${lateRunId}/events`,
    headers: { cookie },
    payload: {
      eventType: "missing_required_image",
      detailCode: "response_lost_before_event_sync",
      idempotencyKey: randomUUID(),
      humanConfirmed: true,
    },
  });
  assert.equal(lateSafetyEvent.statusCode, 201, lateSafetyEvent.body);
  const invalidatedLateRun = lateSafetyEvent.json<{
    state: string;
    externallyInvalidated: boolean;
    externalInvalidationReason: string | null;
    summary: {
      completedItemCount: number;
      missingRequiredImageCount: number;
      passed: boolean | null;
    };
  }>();
  assert.equal(invalidatedLateRun.state, "failed");
  assert.equal(invalidatedLateRun.externallyInvalidated, false);
  assert.equal(invalidatedLateRun.externalInvalidationReason, null);
  assert.equal(invalidatedLateRun.summary.completedItemCount, 10);
  assert.equal(invalidatedLateRun.summary.missingRequiredImageCount, 1);
  assert.equal(invalidatedLateRun.summary.passed, false);

  const activeLateRunId = randomUUID();
  const activeLatePreviousSkuId = randomUUID();
  const activeLateLatestSkuId = randomUUID();
  const activeLatePreviousItemId = randomUUID();
  const activeLateLatestItemId = randomUUID();
  const activeLateAdmin = postgres(adminUrl, { max: 1 });
  try {
    await activeLateAdmin.begin(async (transaction) => {
      await transaction`
        insert into pilot_run (
          id, workspace_id, protocol_version, commit_sha, migration_version,
          platform, browser, viewport, actor_id, warmup_completed_at, started_at
        ) values (
          ${activeLateRunId}, ${owner.workspaceId}, 'listing_prep_pilot_v1.0.0',
          ${"c".repeat(40)}, '0028', 'Windows active late-event fixture',
          'Chromium committed-response-loss fixture', '390x844', ${owner.identityId},
          statement_timestamp() - interval '6 minutes',
          statement_timestamp() - interval '5 minutes'
        )
      `;
      await transaction`
        insert into product_sku (id, workspace_id, sku_code, title, category) values
          (
            ${activeLatePreviousSkuId}, ${owner.workspaceId}, 'SKU-ACTIVE-LATE-01',
            'Active late response previous fixture', 'tops'
          ),
          (
            ${activeLateLatestSkuId}, ${owner.workspaceId}, 'SKU-ACTIVE-LATE-02',
            'Active late response latest fixture', 'tops'
          )
      `;
      await transaction`
        insert into pilot_item_measurement (
          id, workspace_id, pilot_run_id, sku_id, product_fixture_id, category,
          started_at, completed_at, copy_ready_workflow_version
        ) values
          (
            ${activeLatePreviousItemId}, ${owner.workspaceId}, ${activeLateRunId},
            ${activeLatePreviousSkuId}, 'TOP-03', 'tops',
            statement_timestamp() - interval '4 minutes',
            statement_timestamp() - interval '3 minutes', 4
          ),
          (
            ${activeLateLatestItemId}, ${owner.workspaceId}, ${activeLateRunId},
            ${activeLateLatestSkuId}, 'TOP-04', 'tops',
            statement_timestamp() - interval '2 minutes',
            statement_timestamp() - interval '1 minute', 4
          )
      `;
    });

    await assert.rejects(
      () => activeLateAdmin`
        insert into pilot_exception_event (
          id, workspace_id, pilot_run_id, pilot_item_measurement_id, event_type,
          detail_code, idempotency_key, payload_hash, actor_id
        ) values (
          ${randomUUID()}, ${owner.workspaceId}, ${activeLateRunId},
          ${activeLatePreviousItemId}, 'network_retry', 'wrong_completed_item',
          ${randomUUID()}, ${hashFixture("active-late-wrong-item")}, ${owner.identityId}
        )
      `,
      /late pilot exception requires the latest completed item/u,
    );
    await assert.rejects(
      () => activeLateAdmin`
        insert into pilot_exception_event (
          id, workspace_id, pilot_run_id, pilot_item_measurement_id, event_type,
          detail_code, idempotency_key, payload_hash, actor_id
        ) values (
          ${randomUUID()}, ${owner.workspaceId}, ${activeLateRunId},
          ${activeLateLatestItemId}, 'network_retry', 'wrong_active_run_actor',
          ${randomUUID()}, ${hashFixture("active-late-wrong-actor")}, ${workerId}
        )
      `,
      /pilot exception requires the original run actor/u,
    );
    await assert.rejects(
      () => activeLateAdmin`
        insert into pilot_exception_event (
          id, workspace_id, pilot_run_id, pilot_item_measurement_id, event_type,
          detail_code, idempotency_key, payload_hash, actor_id
        ) values (
          ${randomUUID()}, ${owner.workspaceId}, ${pilotRunId},
          ${activeLateLatestItemId}, 'network_retry', 'wrong_pilot_run',
          ${randomUUID()}, ${hashFixture("active-late-wrong-run")}, ${owner.identityId}
        )
      `,
      /pilot exception item must belong to the run/u,
    );

    const activeLateEventPayload = {
      eventType: "invalid_attempt",
      detailCode: "response_lost_after_item_completion",
      idempotencyKey: randomUUID(),
      humanConfirmed: true,
    } as const;
    const activeLateEvent = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/pilot-runs/${activeLateRunId}/events`,
      headers: { cookie },
      payload: activeLateEventPayload,
    });
    assert.equal(activeLateEvent.statusCode, 201, activeLateEvent.body);
    const failedActiveLateRun = activeLateEvent.json<{
      state: string;
      summary: {
        itemCount: number;
        completedItemCount: number;
        invalidAttemptCount: number;
        passed: boolean | null;
      };
    }>();
    assert.equal(failedActiveLateRun.state, "failed");
    assert.equal(failedActiveLateRun.summary.itemCount, 2);
    assert.equal(failedActiveLateRun.summary.completedItemCount, 2);
    assert.equal(failedActiveLateRun.summary.invalidAttemptCount, 1);
    assert.equal(failedActiveLateRun.summary.passed, false);

    const activeLateReplay = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/pilot-runs/${activeLateRunId}/events`,
      headers: { cookie },
      payload: activeLateEventPayload,
    });
    assert.equal(activeLateReplay.statusCode, 201, activeLateReplay.body);
    const replayedActiveLateRun = activeLateReplay.json<{
      state: string;
      summary: { invalidAttemptCount: number; passed: boolean | null };
    }>();
    assert.equal(replayedActiveLateRun.state, "failed");
    assert.equal(replayedActiveLateRun.summary.invalidAttemptCount, 1);
    assert.equal(replayedActiveLateRun.summary.passed, false);
    const activeLateEvents = await activeLateAdmin<Array<{ pilot_item_measurement_id: string }>>`
      select pilot_item_measurement_id from pilot_exception_event
      where workspace_id = ${owner.workspaceId} and pilot_run_id = ${activeLateRunId}
        and idempotency_key = ${activeLateEventPayload.idempotencyKey}
    `;
    assert.equal(activeLateEvents.length, 1);
    assert.equal(activeLateEvents[0]?.pilot_item_measurement_id, activeLateLatestItemId);
  } finally {
    await activeLateAdmin.end({ timeout: 5 });
  }

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const failed = await app.inject({
      method: "POST",
      url: "/v1/session/login",
      payload: { email: "missing@example.test", password: "wrong-password-value" },
    });
    assert.equal(failed.statusCode, attempt === 5 ? 429 : 401);
  }

  const logout = await app.inject({
    method: "POST",
    url: "/v1/session/logout",
    headers: { cookie },
  });
  assert.equal(logout.statusCode, 204);
  const reuse = await app.inject({
    method: "GET",
    url: `/v1/workspaces/${owner.workspaceId}/inventory/summary`,
    headers: { cookie },
  });
  assert.equal(reuse.statusCode, 401);
} finally {
  await app.close();
  await rm(mediaRoot, { recursive: true, force: true });
}

process.stdout.write(
  "postgres-integration: PASS (restricted role, 49-table RLS matrix, assigned external workers, append-only server-timed pilot exceptions, purchase-to-versioned-accounting order flow, encrypted 5-minute address lease, checked inventory/location codes, persisted capture/research/listing evidence, reviewed zero-GPS location photo, double scan, immutable stocktake snapshot, complete read evidence, post-start movement separation, audited stale-label rejection, DB-enforced mode-aware solo/dual stocktake approval, approved dual candidate restored by its original owner at the same or a moved location without direct scan UPDATE, exact 27-column accounting CSV, return quarantine, stocktake and label reissue, logout)\n",
);

function jpegWithGpsMetadata(): Buffer {
  const exif = Buffer.from("Exif\0\0GPSLatitude=35.0;GPSLongitude=139.0", "utf8");
  const app1Length = Buffer.alloc(2);
  app1Length.writeUInt16BE(exif.length + 2);
  const dimensions = Buffer.from([
    0xff, 0xc0, 0x00, 0x11, 0x08, 0x05, 0xdc, 0x07, 0xd0, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00,
    0x03, 0x11, 0x00,
  ]);
  const scan = Buffer.from([0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0xff, 0xd9]);
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1]), app1Length, exif, dimensions, scan]);
}
