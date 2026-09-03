import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import {
  appendCodeCheckDigit,
  listingPrepPilotFixtureManifestSha256,
  listingPrepPilotFixtureProfiles,
  listingPrepPilotItemIdentifiers,
  listingPrepPilotMigrationVersion,
  listingPrepPilotProtocolVersion,
  type StocktakeResponse,
} from "@resale/contracts";
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

const top01PilotFixture = listingPrepPilotFixtureProfiles.find(
  (profile) => profile.fixtureId === "TOP-01",
);
const top02PilotFixture = listingPrepPilotFixtureProfiles.find(
  (profile) => profile.fixtureId === "TOP-02",
);
if (!top01PilotFixture || !top02PilotFixture) {
  throw new Error("Generated TOP-01 and TOP-02 pilot fixtures are required");
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
  "inspection_check_result",
  "inspection_concern_revision",
  "journal_candidate",
  "location_node",
  "location_photo",
  "marketplace_reference",
  "measurement_attempt",
  "media_asset",
  "order_allocation",
  "order_operation_record",
  "order_assignment",
  "order_number_counter",
  "order_channel_transaction_claim",
  "order_registration_revision",
  "order_shipping_method_selection",
  "order_shipping_photo_decision",
  "order_shipping_readiness_confirmation",
  "order_private_address",
  "outbox_event",
  "p0_workflow",
  "p0_workflow_action",
  "product_identity_candidate",
  "product_attribute_confirmation",
  "product_measurement_profile",
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
  "shipment_human_confirmation",
  "shipping_photo_asset",
  "shipping_photo_confirmation",
  "shipping_photo_policy_revision",
  "shipping_method_catalog_revision",
  "shipping_sale_basis_snapshot",
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
  const workspaceSelectGrants = await catalog<
    Array<{ table_name: string; privilege_type: string }>
  >`
    select table_name, privilege_type
    from information_schema.role_table_grants
    where grantee = 'resale_app_runtime'
      and table_schema = 'public'
      and table_name = 'workspace'
      and privilege_type = 'SELECT'
  `;
  assert.equal(
    workspaceSelectGrants.length,
    0,
    "The runtime role must not gain direct workspace SELECT permission for serialization",
  );
  const shippingSaleBasisGrants = await catalog<Array<{ privilege_type: string }>>`
    select privilege_type
    from information_schema.role_table_grants
    where grantee = 'resale_app_runtime'
      and table_schema = 'public'
      and table_name = 'shipping_sale_basis_snapshot'
    order by privilege_type
  `;
  assert.deepEqual(
    Array.from(shippingSaleBasisGrants, (row) => ({ ...row })),
    [{ privilege_type: "SELECT" }],
    "Runtime may only SELECT the private sale basis through owner/accounting RLS",
  );
  const [shippingWorkspaceLockFunction] = await catalog<
    Array<{
      security_definer: boolean;
      volatile: boolean;
      secure_search_path: boolean;
      identity_arguments: string;
      runtime_execute: boolean;
      public_execute_revoked: boolean;
    }>
  >`
    select function_row.prosecdef as security_definer,
           function_row.provolatile = 'v' as volatile,
           coalesce(function_row.proconfig, array[]::text[])
             @> array['search_path=pg_catalog, public'] as secure_search_path,
           pg_get_function_identity_arguments(function_row.oid) as identity_arguments,
           has_function_privilege(
             'resale_app_runtime', function_row.oid, 'EXECUTE'
           ) as runtime_execute,
           not exists (
             select 1
             from aclexplode(
               coalesce(function_row.proacl, acldefault('f', function_row.proowner))
             ) function_acl
             where function_acl.grantee = 0
               and function_acl.privilege_type = 'EXECUTE'
           ) as public_execute_revoked
    from pg_proc function_row
    join pg_namespace namespace_row on namespace_row.oid = function_row.pronamespace
    where namespace_row.nspname = 'public'
      and function_row.proname = 'lock_current_shipping_workspace'
      and pg_get_function_identity_arguments(function_row.oid) = ''
  `;
  assert.deepEqual(
    { ...shippingWorkspaceLockFunction },
    {
      security_definer: true,
      volatile: true,
      secure_search_path: true,
      identity_arguments: "",
      runtime_execute: true,
      public_execute_revoked: true,
    },
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
const orderRepository = new PostgresOrderRepository(runtimeUrl);
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
  orderRepository,
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
      protocolVersion: listingPrepPilotProtocolVersion,
      fixtureManifestSha256: listingPrepPilotFixtureManifestSha256,
      commitSha: "a".repeat(40),
      migrationVersion: listingPrepPilotMigrationVersion,
      platform: "Windows test fixture",
      browser: "Chromium fixture",
      viewport: "390x844",
      warmupCompleted: true,
      humanConfirmed: true,
    },
  });
  assert.equal(pilotStarted.statusCode, 201, pilotStarted.body);
  const pilotStartedBody = pilotStarted.json<{ runId: string; migrationVersion: string }>();
  assert.equal(pilotStartedBody.migrationVersion, listingPrepPilotMigrationVersion);
  const pilotRunId = pilotStartedBody.runId;
  const top01PilotIdentifiers = listingPrepPilotItemIdentifiers(pilotRunId, "TOP-01");

  const acquisitionKey = randomUUID();
  const acquisitionPayload = {
    skuCode: top01PilotIdentifiers.skuCode,
    title: top01PilotFixture.title,
    category: "トップス",
    measurementTemplateId: top01PilotFixture.templateId,
    supplierName: "架空テスト仕入先",
    receiptReference: top01PilotIdentifiers.receiptReference,
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
  const acquisitionBinId = acquisitionBin.json<{ id: string }>().id;
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
  const acquisitionAssetByRole = new Map<string, string>();
  const wrongFrontImage = top02PilotFixture.images[0];
  assert.equal(wrongFrontImage.role, "front");
  for (const image of top01PilotFixture.images) {
    const uploadedImage = image.role === "front" ? wrongFrontImage : image;
    const assetId = image.role === "front" ? "10000000-0000-4000-8000-000000000101" : randomUUID();
    const imageBytes = await readFile(
      new URL(`../../../${uploadedImage.relativePath}`, import.meta.url),
    );
    const upload = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/skus/${acquiredItem.skuId}/media-uploads?assetId=${assetId}&role=${image.role}`,
      headers: { cookie, "content-type": uploadedImage.mimeType },
      payload: imageBytes,
    });
    assert.equal(upload.statusCode, 201, upload.body);
    assert.equal(upload.json<{ originalSha256: string }>().originalSha256, uploadedImage.sha256);
    acquisitionAssets.push(assetId);
    acquisitionAssetByRole.set(image.role, assetId);
  }
  const identityCandidate = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/skus/${acquiredItem.skuId}/identity-candidates`,
    headers: { cookie },
    payload: {
      sourceAssetId: acquisitionAssetByRole.get("brand_tag"),
      rawOcrText: top01PilotFixture.tagText,
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
  const firstPilotMeasurement = top01PilotFixture.measurements[0];
  const pilotMeasurementInput = (
    measurement: (typeof top01PilotFixture.measurements)[number],
    input: {
      evidenceAssetId: string;
      attempt: number;
      value?: number;
      reviewReasonCode?: "previous_entry_error";
    },
  ) => ({
    definitionId: measurement.definitionId,
    definitionVersion: measurement.definitionVersion,
    value: input.value ?? measurement.value,
    unit: measurement.unit,
    basis: measurement.basis,
    state: measurement.state,
    measuredAt: new Date().toISOString(),
    evidenceAssetId: input.evidenceAssetId,
    attempt: input.attempt,
    ...(input.reviewReasonCode ? { reviewReasonCode: input.reviewReasonCode } : {}),
    humanConfirmed: true as const,
  });
  for (const invalidMeasurement of [
    {
      ...pilotMeasurementInput(firstPilotMeasurement, {
        evidenceAssetId: acquisitionAssetByRole.get("front") ?? "",
        attempt: 1,
      }),
      definitionId: "unknown_measurement",
    },
    {
      ...pilotMeasurementInput(firstPilotMeasurement, {
        evidenceAssetId: acquisitionAssetByRole.get("front") ?? "",
        attempt: 1,
      }),
      basis: "flat_width",
    },
    {
      ...pilotMeasurementInput(firstPilotMeasurement, {
        evidenceAssetId: acquisitionAssetByRole.get("front") ?? "",
        attempt: 1,
      }),
      state: "closed",
    },
  ] as const) {
    const rejectedMeasurement = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/skus/${acquiredItem.skuId}/measurements`,
      headers: { cookie },
      payload: {
        ...invalidMeasurement,
      },
    });
    assert.equal(rejectedMeasurement.statusCode, 409, rejectedMeasurement.body);
  }
  for (const [index, expectedMeasurement] of top01PilotFixture.measurements.entries()) {
    const measurement = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/skus/${acquiredItem.skuId}/measurements`,
      headers: { cookie },
      payload: pilotMeasurementInput(expectedMeasurement, {
        value: index === 0 ? expectedMeasurement.value + 3 : expectedMeasurement.value,
        evidenceAssetId: acquisitionAssetByRole.get("front") ?? "",
        attempt: 1,
      }),
    });
    assert.equal(measurement.statusCode, 201, measurement.body);
  }
  const rejectedWrongImageCapture = await app.inject({
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
  assert.equal(rejectedWrongImageCapture.statusCode, 409, rejectedWrongImageCapture.body);
  assert.match(rejectedWrongImageCapture.body, /current pilot image/iu);

  const expectedFrontImage = top01PilotFixture.images.find((image) => image.role === "front");
  assert.ok(expectedFrontImage);
  const correctedFrontAssetId = "f0000000-0000-4000-8000-000000000101";
  const correctedFrontUpload = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/skus/${acquiredItem.skuId}/media-uploads?assetId=${correctedFrontAssetId}&role=front`,
    headers: { cookie, "content-type": expectedFrontImage.mimeType },
    payload: await readFile(
      new URL(`../../../${expectedFrontImage.relativePath}`, import.meta.url),
    ),
  });
  assert.equal(correctedFrontUpload.statusCode, 201, correctedFrontUpload.body);
  assert.equal(
    correctedFrontUpload.json<{ originalSha256: string }>().originalSha256,
    expectedFrontImage.sha256,
  );
  acquisitionAssets.push(correctedFrontAssetId);
  acquisitionAssetByRole.set("front", correctedFrontAssetId);

  const rejectedWrongValueCapture = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/skus/${acquiredItem.skuId}/p0-actions`,
    headers: { cookie },
    payload: {
      action: "confirm_capture",
      evidenceReferenceIds: [...acquisitionAssetByRole.values()],
      manualChannelHandoff: false,
      idempotencyKey: randomUUID(),
      requiredFactsConfirmed: true,
    },
  });
  assert.equal(rejectedWrongValueCapture.statusCode, 409, rejectedWrongValueCapture.body);
  assert.match(rejectedWrongValueCapture.body, /current pilot measurement/iu);

  const correctedMeasurement = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/skus/${acquiredItem.skuId}/measurements`,
    headers: { cookie },
    payload: pilotMeasurementInput(firstPilotMeasurement, {
      evidenceAssetId: correctedFrontAssetId,
      attempt: 2,
    }),
  });
  assert.equal(correctedMeasurement.statusCode, 201, correctedMeasurement.body);
  assert.equal(correctedMeasurement.json<{ requiresReview: boolean }>().requiresReview, true);
  const missingMeasurementReviewReason = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/skus/${acquiredItem.skuId}/measurements`,
    headers: { cookie },
    payload: pilotMeasurementInput(firstPilotMeasurement, {
      evidenceAssetId: correctedFrontAssetId,
      attempt: 3,
    }),
  });
  assert.equal(missingMeasurementReviewReason.statusCode, 409, missingMeasurementReviewReason.body);
  assert.match(missingMeasurementReviewReason.body, /review reason is required/iu);
  const acceptedCorrectedMeasurement = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/skus/${acquiredItem.skuId}/measurements`,
    headers: { cookie },
    payload: pilotMeasurementInput(firstPilotMeasurement, {
      evidenceAssetId: correctedFrontAssetId,
      attempt: 3,
      reviewReasonCode: "previous_entry_error",
    }),
  });
  assert.equal(acceptedCorrectedMeasurement.statusCode, 201, acceptedCorrectedMeasurement.body);
  assert.equal(
    acceptedCorrectedMeasurement.json<{ requiresReview: boolean }>().requiresReview,
    false,
  );

  const captureAdvanced = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/skus/${acquiredItem.skuId}/p0-actions`,
    headers: { cookie },
    payload: {
      action: "confirm_capture",
      evidenceReferenceIds: [...acquisitionAssetByRole.values()],
      manualChannelHandoff: false,
      idempotencyKey: randomUUID(),
      requiredFactsConfirmed: true,
    },
  });
  assert.equal(captureAdvanced.statusCode, 200, captureAdvanced.body);
  const pilotAfterCapture = await app.inject({
    method: "GET",
    url: `/v1/workspaces/${owner.workspaceId}/pilot-runs/latest`,
    headers: { cookie },
  });
  assert.equal(pilotAfterCapture.statusCode, 200, pilotAfterCapture.body);
  const pilotAfterCaptureBody = pilotAfterCapture.json<{
    summary: { completedItemCount: number };
    items: Array<{ completedAt: string | null; copyReadyWorkflowVersion: number | null }>;
  }>();
  assert.equal(pilotAfterCaptureBody.summary.completedItemCount, 0);
  assert.equal(pilotAfterCaptureBody.items[0]?.completedAt, null);
  assert.equal(pilotAfterCaptureBody.items[0]?.copyReadyWorkflowVersion, null);
  const postCaptureMedia = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/skus/${acquiredItem.skuId}/media-uploads?assetId=${randomUUID()}&role=flaw`,
    headers: { cookie, "content-type": "image/jpeg" },
    payload: jpegWithGpsMetadata(),
  });
  assert.equal(postCaptureMedia.statusCode, 409, postCaptureMedia.body);
  const postCaptureMeasurement = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/skus/${acquiredItem.skuId}/measurements`,
    headers: { cookie },
    payload: pilotMeasurementInput(firstPilotMeasurement, {
      evidenceAssetId: correctedFrontAssetId,
      attempt: 4,
    }),
  });
  assert.equal(postCaptureMeasurement.statusCode, 409, postCaptureMeasurement.body);
  const blockedPilotReference = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/skus/${acquiredItem.skuId}/market-references`,
    headers: { cookie },
    payload: {
      sourceUrl: "https://example.test/blocked-during-pilot",
      displayedPriceMinor: 3500,
      soldState: true,
      itemCondition: "目立った傷なし",
      shippingBasis: "included",
      included: true,
      exclusionReason: null,
      checkedAt: new Date().toISOString(),
      humanConfirmed: true,
    },
  });
  assert.equal(blockedPilotReference.statusCode, 409, blockedPilotReference.body);
  assert.match(
    blockedPilotReference.json<{ message: string }>().message,
    /disabled during the local-only pilot/,
  );
  const research = await app.inject({
    method: "GET",
    url: `/v1/workspaces/${owner.workspaceId}/skus/${acquiredItem.skuId}/research`,
    headers: { cookie },
  });
  assert.equal(research.statusCode, 200, research.body);
  assert.equal(
    research.json<{ displayedPriceMedianMinor: number | null }>().displayedPriceMedianMinor,
    null,
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
  assert.equal(reloadedItem.listingCandidate.text.includes("肩幅42cm"), true);
  assert.deepEqual(reloadedItem.listingCandidate.unconfirmedFields, ["ブランド", "サイズ", "色"]);
  assert.equal(reloadedItem.listingCandidate.status, "candidate");
  const wrongAttributeConfirmation = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/skus/${acquiredItem.skuId}/product-attributes`,
    headers: { cookie },
    payload: {
      brand: "WRONG-PILOT-BRAND",
      sizeLabel: top01PilotFixture.attributes.sizeLabel,
      color: top01PilotFixture.attributes.color,
      evidenceAssetId: acquisitionAssetByRole.get("brand_tag"),
      sourceCandidateId: candidateId,
      humanConfirmed: true,
    },
  });
  assert.equal(wrongAttributeConfirmation.statusCode, 201, wrongAttributeConfirmation.body);
  const wrongConfirmationId = wrongAttributeConfirmation.json<{ confirmationId: string }>()
    .confirmationId;
  const wrongAttributeReadModel = await app.inject({
    method: "GET",
    url: `/v1/workspaces/${owner.workspaceId}/p0-items`,
    headers: { cookie },
  });
  const wrongAttributeItem = wrongAttributeReadModel
    .json<Array<{ skuId: string; listingCandidate: { referenceIds: string[] } }>>()
    .find((item) => item.skuId === acquiredItem.skuId);
  assert.ok(wrongAttributeItem);
  const rejectedWrongAttributes = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/skus/${acquiredItem.skuId}/p0-actions`,
    headers: { cookie },
    payload: {
      action: "confirm_listing",
      evidenceReferenceIds: wrongAttributeItem.listingCandidate.referenceIds,
      manualChannelHandoff: true,
      idempotencyKey: randomUUID(),
      requiredFactsConfirmed: true,
    },
  });
  assert.equal(rejectedWrongAttributes.statusCode, 409, rejectedWrongAttributes.body);
  assert.match(rejectedWrongAttributes.body, /confirmed pilot attributes/iu);
  const correctedAttributePayload = {
    ...top01PilotFixture.attributes,
    evidenceAssetId: acquisitionAssetByRole.get("brand_tag"),
    sourceCandidateId: candidateId,
    supersedesConfirmationId: wrongConfirmationId,
    humanConfirmed: true,
  };
  const correctedAttributeAttempts = await Promise.all([
    app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/skus/${acquiredItem.skuId}/product-attributes`,
      headers: { cookie },
      payload: correctedAttributePayload,
    }),
    app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/skus/${acquiredItem.skuId}/product-attributes`,
      headers: { cookie },
      payload: correctedAttributePayload,
    }),
  ]);
  const correctedAttributeConfirmation = correctedAttributeAttempts.find(
    (response) => response.statusCode === 201,
  );
  const staleAttributeConfirmation = correctedAttributeAttempts.find(
    (response) => response.statusCode === 409,
  );
  assert.ok(correctedAttributeConfirmation, JSON.stringify(correctedAttributeAttempts));
  assert.ok(staleAttributeConfirmation, JSON.stringify(correctedAttributeAttempts));
  assert.match(staleAttributeConfirmation.body, /Product attributes changed/iu);
  const correctedConfirmationId = correctedAttributeConfirmation.json<{ confirmationId: string }>()
    .confirmationId;
  const unchangedAttributeConfirmation = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/skus/${acquiredItem.skuId}/product-attributes`,
    headers: { cookie },
    payload: {
      ...correctedAttributePayload,
      supersedesConfirmationId: correctedConfirmationId,
    },
  });
  assert.equal(unchangedAttributeConfirmation.statusCode, 409, unchangedAttributeConfirmation.body);
  assert.match(unchangedAttributeConfirmation.body, /attributes are unchanged/iu);
  const correctedReadModel = await app.inject({
    method: "GET",
    url: `/v1/workspaces/${owner.workspaceId}/p0-items`,
    headers: { cookie },
  });
  const correctedItem = correctedReadModel
    .json<
      Array<{
        skuId: string;
        listingCandidate: { text: string; referenceIds: string[]; unconfirmedFields: string[] };
      }>
    >()
    .find((item) => item.skuId === acquiredItem.skuId);
  assert.ok(correctedItem);
  assert.equal(
    correctedItem.listingCandidate.text.includes(top01PilotFixture.attributes.brand),
    true,
  );
  assert.equal(
    correctedItem.listingCandidate.text.includes(top01PilotFixture.attributes.color),
    true,
  );
  assert.deepEqual(correctedItem.listingCandidate.unconfirmedFields, []);
  assert.equal(correctedItem.listingCandidate.referenceIds.includes(correctedConfirmationId), true);
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
      evidenceReferenceIds: correctedItem.listingCandidate.referenceIds,
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
      manualCorrectionCount: number;
      passed: boolean | null;
    };
    items: Array<{ productFixtureId: string; copyReadyWorkflowVersion: number }>;
  }>();
  assert.equal(pilotResult.state, "active");
  assert.equal(pilotResult.summary.itemCount, 1);
  assert.equal(pilotResult.summary.completedItemCount, 1);
  assert.equal(pilotResult.summary.measurementReworkCount, 1);
  assert.equal(pilotResult.summary.manualCorrectionCount, 3);
  assert.equal(pilotResult.summary.passed, null);
  assert.equal(pilotResult.items[0]?.productFixtureId, "TOP-01");
  assert.equal(pilotResult.items[0]?.copyReadyWorkflowVersion, 4);
  const correctionAudit = postgres(adminUrl, { max: 1 });
  try {
    const correctionEvents = await correctionAudit<
      Array<{ detail_code: string; event_count: number }>
    >`
      select detail_code, count(*)::integer as event_count
      from pilot_exception_event
      where workspace_id = ${owner.workspaceId} and pilot_run_id = ${pilotRunId}
        and event_type = 'manual_correction'
      group by detail_code
      order by detail_code
    `;
    assert.deepEqual(
      [...correctionEvents],
      [
        { detail_code: "measurement_attempt_replaced", event_count: 1 },
        { detail_code: "photo_role_replaced", event_count: 1 },
        { detail_code: "product_attributes_revised", event_count: 1 },
      ],
    );
    const manualCorrectionAudits = await correctionAudit<Array<{ event_count: number }>>`
      select count(*)::integer as event_count from audit_event
      where workspace_id = ${owner.workspaceId}
        and action = 'pilot_manual_correction.recorded'
        and target_type = 'pilot_exception_event'
    `;
    assert.equal(manualCorrectionAudits[0]?.event_count, 3);
  } finally {
    await correctionAudit.end({ timeout: 5 });
  }
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
  const otherShippingPassword = "fictional-other-shipping-password";
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
  const otherShippingMember = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/team/members`,
    headers: { cookie },
    payload: {
      displayName: "架空別配送担当",
      email: "other-shipping@example.test",
      initialPassword: otherShippingPassword,
      role: "shipping",
      humanConfirmed: true,
    },
  });
  assert.equal(otherShippingMember.statusCode, 201, otherShippingMember.body);
  assert.equal(otherShippingMember.body.includes(otherShippingPassword), false);
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
  const managerId = managerMember.json<{ identityId: string }>().identityId;
  assert.ok(managerId);
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
  const otherShippingLogin = await app.inject({
    method: "POST",
    url: "/v1/session/login",
    payload: { email: "other-shipping@example.test", password: otherShippingPassword },
  });
  assert.equal(otherShippingLogin.statusCode, 204, otherShippingLogin.body);
  const otherShippingSetCookie = otherShippingLogin.headers["set-cookie"];
  assert.equal(typeof otherShippingSetCookie, "string");
  const otherShippingCookie = String(otherShippingSetCookie).split(";", 1)[0];
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

  const foreignInspectionAssetId = acquisitionAssetByRole.get("front");
  assert.ok(foreignInspectionAssetId);
  const inspectionCheckRevisionOneId = randomUUID();
  const inspectionCheckRevisionTwoId = randomUUID();
  const inspectionCheckRevisionThreeId = randomUUID();
  const inspectionCheckRevisionFourId = randomUUID();
  const inspectionConcernId = randomUUID();
  const inspectionConcernRevisionOneId = randomUUID();
  const inspectionConcernRevisionTwoId = randomUUID();
  const inspectionConcernRevisionThreeId = randomUUID();
  const inspectionConcernRevisionFourId = randomUUID();
  const inspectionConcernRevisionFiveId = randomUUID();
  const inspectionConcernRevisionSixId = randomUUID();
  const inspectionConcernRevisionSevenId = randomUUID();
  const inspectionConcernRevisionEightId = randomUUID();
  const inspectionConcernRevisionNineId = randomUUID();
  const secondInspectionConcernId = randomUUID();
  const secondInspectionConcernRevisionOneId = randomUUID();
  const secondInspectionConcernRevisionTwoId = randomUUID();
  const secondInspectionConcernRevisionThreeId = randomUUID();
  const secondInspectionConcernRevisionFourId = randomUUID();
  const wrongContextCheckRevisionOneId = randomUUID();
  const wrongContextConcernId = randomUUID();
  const wrongContextConcernRevisionOneId = randomUUID();
  const wrongContextConcernRevisionTwoId = randomUUID();
  const parallelCheckPredecessorId = randomUUID();
  const parallelCheckSuccessorAId = randomUUID();
  const parallelCheckSuccessorBId = randomUUID();
  const ownerOnlyInspectionRevisionId = randomUUID();
  const crossWorkspaceOwnerId = randomUUID();
  const crossWorkspaceSkuId = randomUUID();
  const crossWorkspaceInspectionRevisionId = randomUUID();
  const crossWorkspaceConcernRevisionId = randomUUID();
  const expiredAssignmentSkuId = randomUUID();
  const revokedAssignmentSkuId = randomUUID();
  const expiredAssignmentInspectionRevisionId = randomUUID();
  const revokedAssignmentInspectionRevisionId = randomUUID();
  const expiredAssignmentConcernRevisionId = randomUUID();
  const revokedAssignmentConcernRevisionId = randomUUID();
  const inspectionDatabase = postgres(runtimeUrl, { max: 1 });
  try {
    const inspectionSeedAdmin = postgres(adminUrl, { max: 1 });
    try {
      await inspectionSeedAdmin.begin(async (transaction) => {
        await transaction`
          insert into app_identity (id, display_name)
          values (${crossWorkspaceOwnerId}, '架空別事業所の検品責任者')
        `;
        await transaction`
          insert into workspace_membership (workspace_id, identity_id, role, active)
          values (${otherWorkspaceId}, ${crossWorkspaceOwnerId}, 'owner', true)
        `;
        await transaction`
          insert into product_sku (id, workspace_id, sku_code, title, category) values
            (${crossWorkspaceSkuId}, ${otherWorkspaceId}, 'SKU-CROSS-INSPECTION', '別事業所の架空商品', 'トップス'),
            (${expiredAssignmentSkuId}, ${owner.workspaceId}, 'SKU-EXPIRED-INSPECTION', '期限切れ担当の架空商品', 'トップス'),
            (${revokedAssignmentSkuId}, ${owner.workspaceId}, 'SKU-REVOKED-INSPECTION', '取消済み担当の架空商品', 'トップス')
        `;
        await transaction`
          insert into sku_work_assignment (
            workspace_id, identity_id, sku_id, operation, starts_at, expires_at,
            revoked_at, created_by, created_at
          ) values
            (
              ${owner.workspaceId}, ${workerId}, ${expiredAssignmentSkuId}, 'capture',
              statement_timestamp() - interval '2 hours',
              statement_timestamp() - interval '1 hour', null,
              ${owner.identityId}, statement_timestamp() - interval '3 hours'
            ),
            (
              ${owner.workspaceId}, ${workerId}, ${revokedAssignmentSkuId}, 'capture',
              statement_timestamp() - interval '10 minutes',
              statement_timestamp() + interval '1 hour',
              statement_timestamp() - interval '1 minute',
              ${owner.identityId}, statement_timestamp() - interval '20 minutes'
            )
        `;
      });
    } finally {
      await inspectionSeedAdmin.end({ timeout: 5 });
    }

    await inspectionDatabase.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${workerId}, true)`;
      await transaction`
        insert into inspection_check_result (
          id, workspace_id, sku_id, inspection_item_key, product_category,
          definition_version, status, revision, supersedes_id, created_by, recorded_by
        ) values (
          ${inspectionCheckRevisionOneId}, ${owner.workspaceId}, ${skuId}, 'front_body', 'tops',
          1, 'unconfirmed', 1, null, ${workerId}, ${workerId}
        )
      `;
      await transaction`
        insert into inspection_check_result (
          id, workspace_id, sku_id, inspection_item_key, product_category,
          definition_version, status, revision, supersedes_id, created_by, recorded_by
        ) values (
          ${wrongContextCheckRevisionOneId}, ${owner.workspaceId}, ${skuId},
          'left_sleeve', 'tops', 1, 'unconfirmed', 1, null, ${workerId}, ${workerId}
        )
      `;
      await transaction`
        insert into inspection_concern_revision (
          id, concern_id, workspace_id, sku_id, inspection_item_key, product_category,
          definition_version, revision, supersedes_id, item_location, concern_type,
          severity, marker_source_asset_id, marker_x, marker_y,
          context_evidence_asset_id, detail_evidence_asset_id, memo, review_state,
          created_by, recorded_by
        ) values (
          ${inspectionConcernRevisionOneId}, ${inspectionConcernId}, ${owner.workspaceId},
          ${skuId}, 'front_body', 'tops', 1, 1, null, '前身頃の右下', 'stain',
          'noticeable', ${captureAssetId}, 0.25, 0.75, ${captureAssetId}, null,
          '架空の薄いしみ', 'pending_review', ${workerId}, ${workerId}
        )
      `;
      await transaction`
        insert into inspection_concern_revision (
          id, concern_id, workspace_id, sku_id, inspection_item_key, product_category,
          definition_version, revision, supersedes_id, item_location, concern_type,
          severity, marker_source_asset_id, marker_x, marker_y,
          context_evidence_asset_id, detail_evidence_asset_id, memo, review_state,
          created_by, recorded_by
        ) values (
          ${secondInspectionConcernRevisionOneId}, ${secondInspectionConcernId},
          ${owner.workspaceId}, ${skuId}, 'front_body', 'tops', 1, 1, null,
          '前身頃の左上', 'scratch', 'small', ${captureAssetId}, 0.65, 0.2,
          ${captureAssetId}, null, '架空の小さな擦れ', 'pending_review',
          ${workerId}, ${workerId}
        )
      `;
      await transaction`
        insert into inspection_concern_revision (
          id, concern_id, workspace_id, sku_id, inspection_item_key, product_category,
          definition_version, revision, supersedes_id, item_location, concern_type,
          severity, marker_source_asset_id, marker_x, marker_y,
          context_evidence_asset_id, detail_evidence_asset_id, memo, review_state,
          created_by, recorded_by
        ) values (
          ${wrongContextConcernRevisionOneId}, ${wrongContextConcernId}, ${owner.workspaceId},
          ${skuId}, 'left_sleeve', 'tops', 1, 1, null, '左袖', 'scratch',
          'small', ${captureAssetId}, 0.4, 0.6, ${captureAssetId}, null,
          '架空の小さな傷', 'pending_review', ${workerId}, ${workerId}
        )
      `;
    });

    await inspectionDatabase.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
      await transaction`
        insert into inspection_check_result (
          id, workspace_id, sku_id, inspection_item_key, product_category,
          definition_version, status, concern_revision_ids, revision, supersedes_id,
          created_by, recorded_by
        ) values
          (
            ${expiredAssignmentInspectionRevisionId}, ${owner.workspaceId},
            ${expiredAssignmentSkuId}, 'front_body', 'tops', 1, 'unconfirmed',
            '{}'::uuid[], 1, null, ${owner.identityId}, ${owner.identityId}
          ),
          (
            ${revokedAssignmentInspectionRevisionId}, ${owner.workspaceId},
            ${revokedAssignmentSkuId}, 'front_body', 'tops', 1, 'unconfirmed',
            '{}'::uuid[], 1, null, ${owner.identityId}, ${owner.identityId}
          )
      `;
      await transaction`
        insert into inspection_concern_revision (
          id, concern_id, workspace_id, sku_id, inspection_item_key, product_category,
          definition_version, revision, supersedes_id, item_location, concern_type,
          severity, memo, review_state, created_by, recorded_by
        ) values
          (
            ${expiredAssignmentConcernRevisionId}, ${randomUUID()}, ${owner.workspaceId},
            ${expiredAssignmentSkuId}, 'front_body', 'tops', 1, 1, null, '商品全体',
            'odor', 'small', '期限切れ担当の読取拒否確認用', 'pending_review',
            ${owner.identityId}, ${owner.identityId}
          ),
          (
            ${revokedAssignmentConcernRevisionId}, ${randomUUID()}, ${owner.workspaceId},
            ${revokedAssignmentSkuId}, 'front_body', 'tops', 1, 1, null, '商品全体',
            'odor', 'small', '取消済み担当の読取拒否確認用', 'pending_review',
            ${owner.identityId}, ${owner.identityId}
          )
      `;
    });

    await inspectionDatabase.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${otherWorkspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${crossWorkspaceOwnerId}, true)`;
      await transaction`
        insert into inspection_check_result (
          id, workspace_id, sku_id, inspection_item_key, product_category,
          definition_version, status, concern_revision_ids, revision, supersedes_id,
          created_by, recorded_by
        ) values (
          ${crossWorkspaceInspectionRevisionId}, ${otherWorkspaceId}, ${crossWorkspaceSkuId},
          'front_body', 'tops', 1, 'unconfirmed', '{}'::uuid[], 1, null,
          ${crossWorkspaceOwnerId}, ${crossWorkspaceOwnerId}
        )
      `;
      await transaction`
        insert into inspection_concern_revision (
          id, concern_id, workspace_id, sku_id, inspection_item_key, product_category,
          definition_version, revision, supersedes_id, item_location, concern_type,
          severity, memo, review_state, created_by, recorded_by
        ) values (
          ${crossWorkspaceConcernRevisionId}, ${randomUUID()}, ${otherWorkspaceId},
          ${crossWorkspaceSkuId}, 'front_body', 'tops', 1, 1, null, '商品全体', 'odor',
          'small', '別事業所の読取拒否確認用', 'pending_review',
          ${crossWorkspaceOwnerId}, ${crossWorkspaceOwnerId}
        )
      `;
    });

    const [inspectionAccessProbe] = await inspectionDatabase.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
      return transaction<[{ own_sku: boolean; cross_workspace_sku: boolean }]>`
        select
          can_actor_access_inspection_sku(${skuId}::uuid) as own_sku,
          can_actor_access_inspection_sku(${crossWorkspaceSkuId}::uuid) as cross_workspace_sku
      `;
    });
    assert.deepEqual(inspectionAccessProbe, {
      own_sku: true,
      cross_workspace_sku: false,
    });
    await assert.rejects(
      () =>
        inspectionDatabase.begin(async (transaction) => {
          await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
          await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
          await transaction`
            select can_actor_access_inspection_sku(
              ${otherWorkspaceId}::uuid,
              ${crossWorkspaceSkuId}::uuid,
              ${crossWorkspaceOwnerId}::uuid,
              statement_timestamp() + interval '100 years'
            )
          `;
        }),
      hasDatabaseCode("42883"),
      "The removed four-argument helper must not permit arbitrary workspace, identity, or time probes",
    );

    await inspectionDatabase.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
      await transaction`
        insert into inspection_check_result (
          id, workspace_id, sku_id, inspection_item_key, product_category,
          definition_version, status, concern_revision_ids, revision, supersedes_id,
          created_by, recorded_by
        ) values (
          ${parallelCheckPredecessorId}, ${owner.workspaceId}, ${skuId},
          'parallel_branch_probe', 'tops', 1, 'unconfirmed', '{}'::uuid[], 1, null,
          ${owner.identityId}, ${owner.identityId}
        )
      `;
    });

    const parallelWriterA = postgres(runtimeUrl, { max: 1 });
    const parallelWriterB = postgres(runtimeUrl, { max: 1 });
    const parallelObserver = postgres(adminUrl, { max: 1 });
    let releaseWriterAResolve: (() => void) | undefined;
    let writerAReleased = false;
    const writerAHold = new Promise<void>((resolve) => {
      releaseWriterAResolve = resolve;
    });
    const releaseWriterA = (): void => {
      if (!writerAReleased) {
        writerAReleased = true;
        releaseWriterAResolve?.();
      }
    };
    const withParallelAttackTimeout = async <T>(
      promise: Promise<T>,
      label: string,
      timeoutMilliseconds = 10_000,
    ): Promise<T> => {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          promise,
          new Promise<never>((_resolve, reject) => {
            timeout = setTimeout(
              () => reject(new Error(`${label} timed out after ${timeoutMilliseconds}ms`)),
              timeoutMilliseconds,
            );
          }),
        ]);
      } finally {
        if (timeout) {
          clearTimeout(timeout);
        }
      }
    };
    let writerAReadyResolve: ((backendPid: number) => void) | undefined;
    let writerAReadyReject: ((reason: unknown) => void) | undefined;
    let writerAReadySettled = false;
    const writerAReady = new Promise<number>((resolve, reject) => {
      writerAReadyResolve = resolve;
      writerAReadyReject = reject;
    });
    let writerBStartedResolve: ((backendPid: number) => void) | undefined;
    let writerBStartedReject: ((reason: unknown) => void) | undefined;
    let writerBStartedSettled = false;
    const writerBStarted = new Promise<number>((resolve, reject) => {
      writerBStartedResolve = resolve;
      writerBStartedReject = reject;
    });
    type ParallelAttackResult =
      { status: "fulfilled"; successorId: string } | { status: "rejected"; reason: unknown };
    let writerATracked: Promise<ParallelAttackResult> | undefined;
    let writerBTracked: Promise<ParallelAttackResult> | undefined;
    try {
      const writerAOperation = parallelWriterA.begin(async (transaction) => {
        try {
          await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
          await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
          await transaction`select set_config('statement_timeout', '20s', true)`;
          const [connection] = await transaction<[{ backend_pid: number }]>`
            select pg_backend_pid()::integer as backend_pid
          `;
          assert.ok(connection);
          await transaction`
            insert into inspection_check_result (
              id, workspace_id, sku_id, inspection_item_key, product_category,
              definition_version, status, concern_revision_ids, revision, supersedes_id,
              created_by, recorded_by
            ) values (
              ${parallelCheckSuccessorAId}, ${owner.workspaceId}, ${skuId},
              'parallel_branch_probe', 'tops', 1, 'unconfirmed', '{}'::uuid[], 2,
              ${parallelCheckPredecessorId}, ${owner.identityId}, ${owner.identityId}
            )
          `;
          writerAReadySettled = true;
          writerAReadyResolve?.(connection.backend_pid);
          await writerAHold;
          return parallelCheckSuccessorAId;
        } catch (error) {
          if (!writerAReadySettled) {
            writerAReadySettled = true;
            writerAReadyReject?.(error);
          }
          throw error;
        }
      });
      writerATracked = writerAOperation.then<ParallelAttackResult, ParallelAttackResult>(
        (successorId) => ({ status: "fulfilled", successorId }),
        (reason: unknown) => ({ status: "rejected", reason }),
      );
      const writerABackendPid = await withParallelAttackTimeout(
        writerAReady,
        "parallel writer A readiness",
      );

      const writerBOperation = parallelWriterB.begin(async (transaction) => {
        try {
          await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
          await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
          await transaction`select set_config('statement_timeout', '20s', true)`;
          const [connection] = await transaction<[{ backend_pid: number }]>`
            select pg_backend_pid()::integer as backend_pid
          `;
          assert.ok(connection);
          writerBStartedSettled = true;
          writerBStartedResolve?.(connection.backend_pid);
          await transaction`
            insert into inspection_check_result (
              id, workspace_id, sku_id, inspection_item_key, product_category,
              definition_version, status, concern_revision_ids, revision, supersedes_id,
              created_by, recorded_by
            ) values (
              ${parallelCheckSuccessorBId}, ${owner.workspaceId}, ${skuId},
              'parallel_branch_probe', 'tops', 1, 'unconfirmed', '{}'::uuid[], 2,
              ${parallelCheckPredecessorId}, ${owner.identityId}, ${owner.identityId}
            )
          `;
          return parallelCheckSuccessorBId;
        } catch (error) {
          if (!writerBStartedSettled) {
            writerBStartedSettled = true;
            writerBStartedReject?.(error);
          }
          throw error;
        }
      });
      writerBTracked = writerBOperation.then<ParallelAttackResult, ParallelAttackResult>(
        (successorId) => ({ status: "fulfilled", successorId }),
        (reason: unknown) => ({ status: "rejected", reason }),
      );
      const writerBBackendPid = await withParallelAttackTimeout(
        writerBStarted,
        "parallel writer B start",
      );
      assert.notEqual(
        writerABackendPid,
        writerBBackendPid,
        "The parallel attack must use two distinct runtime database connections",
      );

      const lockObservationDeadline = Date.now() + 10_000;
      let lockObservation:
        | {
            blocked_by_writer_a: boolean;
            wait_event_type: string | null;
            wait_event: string | null;
          }
        | undefined;
      while (Date.now() < lockObservationDeadline) {
        const [observed] = await parallelObserver<
          Array<{
            blocked_by_writer_a: boolean;
            wait_event_type: string | null;
            wait_event: string | null;
          }>
        >`
          select
            ${writerABackendPid}::integer = any(pg_blocking_pids(${writerBBackendPid}::integer))
              as blocked_by_writer_a,
            wait_event_type,
            wait_event
          from pg_stat_activity
          where pid = ${writerBBackendPid}::integer
        `;
        if (observed?.blocked_by_writer_a && observed.wait_event_type === "Lock") {
          lockObservation = observed;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.ok(
        lockObservation,
        "Writer B must wait on writer A's SKU row lock before the successor index is checked",
      );

      releaseWriterA();
      const attackResults = await withParallelAttackTimeout(
        Promise.all([writerATracked, writerBTracked]),
        "parallel successor attack completion",
        20_000,
      );
      assert.equal(
        attackResults.filter((result) => result.status === "fulfilled").length,
        1,
        "Exactly one parallel successor must commit",
      );
      assert.equal(
        attackResults.filter((result) => result.status === "rejected").length,
        1,
        "Exactly one parallel successor must be rejected",
      );
      assert.deepEqual(attackResults[0], {
        status: "fulfilled",
        successorId: parallelCheckSuccessorAId,
      });
      assert.equal(attackResults[1]?.status, "rejected");
      if (attackResults[1]?.status !== "rejected") {
        throw new Error("Parallel writer B unexpectedly committed");
      }
      const rejectedBranch = attackResults[1].reason;
      assert.equal(
        typeof rejectedBranch === "object" && rejectedBranch !== null && "code" in rejectedBranch
          ? String(rejectedBranch.code)
          : undefined,
        "23505",
        "The losing branch must be rejected as a duplicate inspection-context revision",
      );
      assert.equal(
        typeof rejectedBranch === "object" &&
          rejectedBranch !== null &&
          "constraint_name" in rejectedBranch
          ? String(rejectedBranch.constraint_name)
          : undefined,
        "inspection_check_result_workspace_id_sku_id_inspection_item_key",
        "The context-plus-revision uniqueness constraint must reject the losing branch",
      );

      const parallelBranchRows = await inspectionDatabase.begin(async (transaction) => {
        await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
        await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
        return transaction<
          Array<{
            id: string;
            status: string;
            revision: number;
            supersedes_id: string | null;
            has_successor: boolean;
          }>
        >`
          select
            check_result.id,
            check_result.status,
            check_result.revision,
            check_result.supersedes_id,
            exists (
              select 1
              from inspection_check_result successor
              where successor.workspace_id = check_result.workspace_id
                and successor.supersedes_id = check_result.id
            ) as has_successor
          from inspection_check_result check_result
          where check_result.workspace_id = ${owner.workspaceId}
            and check_result.sku_id = ${skuId}
            and check_result.inspection_item_key = 'parallel_branch_probe'
            and check_result.product_category = 'tops'
            and check_result.definition_version = 1
          order by check_result.revision
        `;
      });
      assert.deepEqual(Array.from(parallelBranchRows), [
        {
          id: parallelCheckPredecessorId,
          status: "unconfirmed",
          revision: 1,
          supersedes_id: null,
          has_successor: true,
        },
        {
          id: parallelCheckSuccessorAId,
          status: "unconfirmed",
          revision: 2,
          supersedes_id: parallelCheckPredecessorId,
          has_successor: false,
        },
      ]);
    } finally {
      releaseWriterA();
      const trackedOperations = [writerATracked, writerBTracked].filter(
        (operation): operation is Promise<ParallelAttackResult> => operation !== undefined,
      );
      if (trackedOperations.length > 0) {
        await withParallelAttackTimeout(
          Promise.all(trackedOperations),
          "parallel successor attack cleanup",
          5_000,
        ).catch(() => undefined);
      }
      await Promise.allSettled([
        parallelWriterA.end({ timeout: 5 }),
        parallelWriterB.end({ timeout: 5 }),
        parallelObserver.end({ timeout: 5 }),
      ]);
    }

    await assert.rejects(
      () =>
        inspectionDatabase.begin(async (transaction) => {
          await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
          await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
          await transaction`
            insert into inspection_concern_revision (
              id, concern_id, workspace_id, sku_id, inspection_item_key, product_category,
              definition_version, revision, supersedes_id, item_location, concern_type,
              severity, memo, review_state, created_by, recorded_by
            ) values (
              ${randomUUID()}, ${randomUUID()}, ${owner.workspaceId}, ${acquiredItem.skuId},
              'orphan_probe', 'tops', 1, 1, null, '商品全体', 'odor', 'small',
              '最新checkがないactive concernの拒否確認', 'pending_review',
              ${owner.identityId}, ${owner.identityId}
            )
          `;
        }),
      hasDatabaseCode("23514"),
      "An active concern must not commit without a latest inspection check revision",
    );

    await assert.rejects(
      () =>
        inspectionDatabase.begin(async (transaction) => {
          await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
          await transaction`select set_config('app.identity_id', ${workerId}, true)`;
          await transaction`
            insert into inspection_check_result (
              id, workspace_id, sku_id, inspection_item_key, product_category,
              definition_version, status, revision, supersedes_id, created_by,
              recorded_by, confirmed_by
            ) values (
              ${randomUUID()}, ${owner.workspaceId}, ${skuId}, 'front_body', 'tops',
              1, 'concern_present', 2, ${inspectionCheckRevisionOneId}, ${workerId},
              ${workerId}, ${workerId}
            )
          `;
        }),
      hasDatabaseCode("42501"),
      "The immediately prior check recorder must not confirm that submission",
    );

    await assert.rejects(
      () =>
        inspectionDatabase.begin(async (transaction) => {
          await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
          await transaction`select set_config('app.identity_id', ${workerId}, true)`;
          await transaction`
            insert into inspection_concern_revision (
              id, concern_id, workspace_id, sku_id, inspection_item_key, product_category,
              definition_version, revision, supersedes_id, item_location, concern_type,
              severity, marker_source_asset_id, marker_x, marker_y,
              context_evidence_asset_id, memo, review_state, created_by, recorded_by, reviewed_by
            ) values (
              ${randomUUID()}, ${inspectionConcernId}, ${owner.workspaceId}, ${skuId},
              'front_body', 'tops', 1, 2, ${inspectionConcernRevisionOneId},
              '前身頃の右下', 'stain', 'noticeable', ${captureAssetId}, 0.25, 0.75,
              ${captureAssetId}, '架空の薄いしみ', 'human_confirmed',
              ${workerId}, ${workerId}, ${workerId}
            )
          `;
        }),
      hasDatabaseCode("42501"),
      "The immediately prior concern recorder must not review that submission",
    );

    await assert.rejects(
      () =>
        inspectionDatabase.begin(async (transaction) => {
          await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
          await transaction`select set_config('app.identity_id', ${managerId}, true)`;
          await transaction`
            insert into inspection_concern_revision (
              id, concern_id, workspace_id, sku_id, inspection_item_key, product_category,
              definition_version, revision, supersedes_id, item_location, concern_type,
              severity, marker_source_asset_id, marker_x, marker_y,
              context_evidence_asset_id, detail_evidence_asset_id, memo, review_state,
              created_by, recorded_by, reviewed_by
            ) values (
              ${randomUUID()}, ${inspectionConcernId}, ${owner.workspaceId}, ${skuId},
              'front_body', 'tops', 1, 2, ${inspectionConcernRevisionOneId},
              '前身頃の右下', 'stain', 'noticeable', ${captureAssetId}, 0.25, 0.75,
              ${captureAssetId}, null, '確認と同時に内容を書き換える試み', 'human_confirmed',
              ${workerId}, ${managerId}, ${managerId}
            )
          `;
        }),
      hasDatabaseCode("23514"),
      "A reviewer must not change concern content while confirming it",
    );

    await assert.rejects(
      () =>
        inspectionDatabase.begin(async (transaction) => {
          await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
          await transaction`select set_config('app.identity_id', ${workerId}, true)`;
          await transaction`
            insert into inspection_concern_revision (
              id, concern_id, workspace_id, sku_id, inspection_item_key, product_category,
              definition_version, revision, supersedes_id, item_location, concern_type,
              severity, marker_source_asset_id, marker_x, marker_y,
              context_evidence_asset_id, detail_evidence_asset_id, memo, review_state,
              created_by, recorded_by
            ) values (
              ${randomUUID()}, ${randomUUID()}, ${owner.workspaceId}, ${skuId},
              'odor', 'tops', 1, 1, null, '商品全体', 'odor', 'small',
              ${captureAssetId}, 0.5, 0.5, ${captureAssetId}, null, null,
              'pending_review', ${workerId}, ${workerId}
            )
          `;
        }),
      hasDatabaseCode("23514"),
      "An odor concern requires a trimmed memo even when photos are present",
    );

    await assert.rejects(
      () =>
        inspectionDatabase.begin(async (transaction) => {
          await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
          await transaction`select set_config('app.identity_id', ${workerId}, true)`;
          await transaction`
            insert into inspection_concern_revision (
              id, concern_id, workspace_id, sku_id, inspection_item_key, product_category,
              definition_version, revision, supersedes_id, item_location, concern_type,
              severity, marker_source_asset_id, marker_x, marker_y,
              context_evidence_asset_id, memo, review_state, created_by, recorded_by
            ) values (
              ${randomUUID()}, ${randomUUID()}, ${owner.workspaceId}, ${skuId},
              'front_body', 'tops', 1, 1, null, '前身頃', 'stain', 'small',
              ${captureAssetId}, 1.001, 0.5, ${captureAssetId}, '範囲外座標',
              'pending_review', ${workerId}, ${workerId}
            )
          `;
        }),
      hasDatabaseCode("23514"),
      "Concern marker coordinates must stay in the normalized range",
    );

    await assert.rejects(
      () =>
        inspectionDatabase.begin(async (transaction) => {
          await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
          await transaction`select set_config('app.identity_id', ${workerId}, true)`;
          await transaction`
            insert into inspection_concern_revision (
              id, concern_id, workspace_id, sku_id, inspection_item_key, product_category,
              definition_version, revision, supersedes_id, item_location, concern_type,
              severity, marker_source_asset_id, marker_x, marker_y,
              context_evidence_asset_id, memo, review_state, created_by, recorded_by
            ) values (
              ${randomUUID()}, ${randomUUID()}, ${owner.workspaceId}, ${skuId},
              'front_body', 'tops', 1, 1, null, '前身頃', 'scratch', 'small',
              ${foreignInspectionAssetId}, 0.5, 0.5, ${foreignInspectionAssetId},
              '別SKU写真は拒否', 'pending_review', ${workerId}, ${workerId}
            )
          `;
        }),
      hasDatabaseCode("23503"),
      "Concern evidence must belong to the same workspace and SKU",
    );

    await inspectionDatabase.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
      await transaction`
        insert into inspection_check_result (
          id, workspace_id, sku_id, inspection_item_key, product_category,
          definition_version, status, revision, supersedes_id, created_by, recorded_by
        ) values (
          ${ownerOnlyInspectionRevisionId}, ${owner.workspaceId}, ${acquiredItem.skuId},
          'front_body', 'tops', 1, 'unconfirmed', 1, null,
          ${owner.identityId}, ${owner.identityId}
        )
      `;
    });

    const assertInspectionAccessDenied = async (input: {
      actorId: string;
      sessionWorkspaceId: string;
      targetWorkspaceId: string;
      targetSkuId: string;
      label: string;
    }) => {
      const hiddenRows = await inspectionDatabase.begin(async (transaction) => {
        await transaction`select set_config('app.workspace_id', ${input.sessionWorkspaceId}, true)`;
        await transaction`select set_config('app.identity_id', ${input.actorId}, true)`;
        const checks = await transaction<Array<{ id: string }>>`
          select id from inspection_check_result
          where workspace_id = ${input.targetWorkspaceId} and sku_id = ${input.targetSkuId}
        `;
        const concerns = await transaction<Array<{ id: string }>>`
          select id from inspection_concern_revision
          where workspace_id = ${input.targetWorkspaceId} and sku_id = ${input.targetSkuId}
        `;
        return { checks, concerns };
      });
      assert.equal(hiddenRows.checks.length, 0, `${input.label} must not read inspection checks`);
      assert.equal(hiddenRows.concerns.length, 0, `${input.label} must not read concerns`);
      await assert.rejects(
        () =>
          inspectionDatabase.begin(async (transaction) => {
            await transaction`select set_config('app.workspace_id', ${input.sessionWorkspaceId}, true)`;
            await transaction`select set_config('app.identity_id', ${input.actorId}, true)`;
            await transaction`
              insert into inspection_check_result (
                id, workspace_id, sku_id, inspection_item_key, product_category,
                definition_version, status, concern_revision_ids, revision, supersedes_id,
                created_by, recorded_by
              ) values (
                ${randomUUID()}, ${input.targetWorkspaceId}, ${input.targetSkuId},
                'denied_probe', 'tops', 1, 'unconfirmed', '{}'::uuid[], 1, null,
                ${input.actorId}, ${input.actorId}
              )
            `;
          }),
        hasDatabaseCode("42501"),
        `${input.label} must not insert inspection rows`,
      );
      await assert.rejects(
        () =>
          inspectionDatabase.begin(async (transaction) => {
            await transaction`select set_config('app.workspace_id', ${input.sessionWorkspaceId}, true)`;
            await transaction`select set_config('app.identity_id', ${input.actorId}, true)`;
            await transaction`
              insert into inspection_concern_revision (
                id, concern_id, workspace_id, sku_id, inspection_item_key, product_category,
                definition_version, revision, supersedes_id, item_location, concern_type,
                severity, memo, review_state, created_by, recorded_by
              ) values (
                ${randomUUID()}, ${randomUUID()}, ${input.targetWorkspaceId},
                ${input.targetSkuId}, 'denied_probe', 'tops', 1, 1, null,
                '商品全体', 'odor', 'small', '権限拒否の確認用', 'pending_review',
                ${input.actorId}, ${input.actorId}
              )
            `;
          }),
        hasDatabaseCode("42501"),
        `${input.label} must not insert concern rows`,
      );
    };

    await assertInspectionAccessDenied({
      actorId: owner.identityId,
      sessionWorkspaceId: owner.workspaceId,
      targetWorkspaceId: otherWorkspaceId,
      targetSkuId: crossWorkspaceSkuId,
      label: "A cross-workspace owner session",
    });
    await assertInspectionAccessDenied({
      actorId: shippingId,
      sessionWorkspaceId: owner.workspaceId,
      targetWorkspaceId: owner.workspaceId,
      targetSkuId: skuId,
      label: "The shipping role",
    });
    await assertInspectionAccessDenied({
      actorId: accountingId,
      sessionWorkspaceId: owner.workspaceId,
      targetWorkspaceId: owner.workspaceId,
      targetSkuId: skuId,
      label: "The accounting role",
    });
    await assertInspectionAccessDenied({
      actorId: workerId,
      sessionWorkspaceId: owner.workspaceId,
      targetWorkspaceId: owner.workspaceId,
      targetSkuId: expiredAssignmentSkuId,
      label: "A field worker with only an expired assignment",
    });
    await assertInspectionAccessDenied({
      actorId: workerId,
      sessionWorkspaceId: owner.workspaceId,
      targetWorkspaceId: owner.workspaceId,
      targetSkuId: revokedAssignmentSkuId,
      label: "A field worker with only a revoked assignment",
    });

    const unassignedRows = await inspectionDatabase.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${workerId}, true)`;
      return transaction<Array<{ id: string }>>`
        select id from inspection_check_result
        where workspace_id = ${owner.workspaceId} and sku_id = ${acquiredItem.skuId}
      `;
    });
    assert.equal(
      unassignedRows.length,
      0,
      "An unassigned field worker must not read inspection rows",
    );
    await assert.rejects(
      () =>
        inspectionDatabase.begin(async (transaction) => {
          await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
          await transaction`select set_config('app.identity_id', ${workerId}, true)`;
          await transaction`
            insert into inspection_check_result (
              id, workspace_id, sku_id, inspection_item_key, product_category,
              definition_version, status, revision, supersedes_id, created_by, recorded_by
            ) values (
              ${randomUUID()}, ${owner.workspaceId}, ${acquiredItem.skuId}, 'odor', 'tops',
              1, 'unconfirmed', 1, null, ${workerId}, ${workerId}
            )
          `;
        }),
      hasDatabaseCode("42501"),
      "An unassigned field worker must not create inspection rows",
    );

    await inspectionDatabase.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${managerId}, true)`;
      await transaction`
        insert into inspection_concern_revision (
          id, concern_id, workspace_id, sku_id, inspection_item_key, product_category,
          definition_version, revision, supersedes_id, item_location, concern_type,
          severity, marker_source_asset_id, marker_x, marker_y,
          context_evidence_asset_id, detail_evidence_asset_id, memo, review_state,
          created_by, recorded_by, reviewed_by
        ) values (
          ${inspectionConcernRevisionTwoId}, ${inspectionConcernId}, ${owner.workspaceId},
          ${skuId}, 'front_body', 'tops', 1, 2, ${inspectionConcernRevisionOneId},
          '前身頃の右下', 'stain', 'noticeable', ${captureAssetId}, 0.25, 0.75,
          ${captureAssetId}, null, '架空の薄いしみ', 'human_confirmed',
          ${workerId}, ${managerId}, ${managerId}
        )
      `;
      await transaction`
        insert into inspection_concern_revision (
          id, concern_id, workspace_id, sku_id, inspection_item_key, product_category,
          definition_version, revision, supersedes_id, item_location, concern_type,
          severity, marker_source_asset_id, marker_x, marker_y,
          context_evidence_asset_id, detail_evidence_asset_id, memo, review_state,
          created_by, recorded_by, reviewed_by
        ) values (
          ${wrongContextConcernRevisionTwoId}, ${wrongContextConcernId}, ${owner.workspaceId},
          ${skuId}, 'left_sleeve', 'tops', 1, 2, ${wrongContextConcernRevisionOneId},
          '左袖', 'scratch', 'small', ${captureAssetId}, 0.4, 0.6,
          ${captureAssetId}, null, '架空の小さな傷', 'human_confirmed',
          ${workerId}, ${managerId}, ${managerId}
        )
      `;
      await transaction`
        insert into inspection_concern_revision (
          id, concern_id, workspace_id, sku_id, inspection_item_key, product_category,
          definition_version, revision, supersedes_id, item_location, concern_type,
          severity, marker_source_asset_id, marker_x, marker_y,
          context_evidence_asset_id, detail_evidence_asset_id, memo, review_state,
          created_by, recorded_by, reviewed_by
        ) values (
          ${secondInspectionConcernRevisionTwoId}, ${secondInspectionConcernId},
          ${owner.workspaceId}, ${skuId}, 'front_body', 'tops', 1, 2,
          ${secondInspectionConcernRevisionOneId}, '前身頃の左上', 'scratch', 'small',
          ${captureAssetId}, 0.65, 0.2, ${captureAssetId}, null, '架空の小さな擦れ',
          'human_confirmed', ${workerId}, ${managerId}, ${managerId}
        )
      `;
    });

    await inspectionDatabase.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${workerId}, true)`;
      await transaction`
        insert into inspection_concern_revision (
          id, concern_id, workspace_id, sku_id, inspection_item_key, product_category,
          definition_version, revision, supersedes_id, item_location, concern_type,
          severity, marker_source_asset_id, marker_x, marker_y,
          context_evidence_asset_id, detail_evidence_asset_id, memo, review_state,
          created_by, recorded_by
        ) values (
          ${inspectionConcernRevisionThreeId}, ${inspectionConcernId}, ${owner.workspaceId},
          ${skuId}, 'front_body', 'tops', 1, 3, ${inspectionConcernRevisionTwoId},
          '前身頃の右下', 'stain', 'noticeable', ${captureAssetId}, 0.25, 0.75,
          ${captureAssetId}, null, '架空の薄いしみ', 'pending_review',
          ${workerId}, ${workerId}
        )
      `;
    });
    await inspectionDatabase.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${managerId}, true)`;
      await transaction`
        insert into inspection_concern_revision (
          id, concern_id, workspace_id, sku_id, inspection_item_key, product_category,
          definition_version, revision, supersedes_id, item_location, concern_type,
          severity, marker_source_asset_id, marker_x, marker_y,
          context_evidence_asset_id, detail_evidence_asset_id, memo, review_state,
          created_by, recorded_by, reviewed_by
        ) values (
          ${inspectionConcernRevisionFourId}, ${inspectionConcernId}, ${owner.workspaceId},
          ${skuId}, 'front_body', 'tops', 1, 4, ${inspectionConcernRevisionThreeId},
          '前身頃の右下', 'stain', 'noticeable', ${captureAssetId}, 0.25, 0.75,
          ${captureAssetId}, null, '架空の薄いしみ', 'human_confirmed',
          ${workerId}, ${managerId}, ${managerId}
        )
      `;
    });

    const assertRejectedCheckConfirmation = async (
      concernRevisionIdsSql: readonly string[],
      expectedCode: string,
      label: string,
      status: "concern_present" | "no_issue_confirmed" = "concern_present",
    ) => {
      await assert.rejects(
        () =>
          inspectionDatabase.begin(async (transaction) => {
            await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
            await transaction`select set_config('app.identity_id', ${managerId}, true)`;
            await transaction`
              insert into inspection_check_result (
                id, workspace_id, sku_id, inspection_item_key, product_category,
                definition_version, status, concern_revision_ids, revision, supersedes_id,
                created_by, recorded_by, confirmed_by
              ) values (
                ${randomUUID()}, ${owner.workspaceId}, ${skuId}, 'front_body', 'tops',
                1, ${status}, ${concernRevisionIdsSql}, 2, ${inspectionCheckRevisionOneId},
                ${workerId}, ${managerId}, ${managerId}
              )
            `;
          }),
        hasDatabaseCode(expectedCode),
        label,
      );
    };

    await assertRejectedCheckConfirmation(
      [],
      "23514",
      "A concern-present result requires at least one exact concern revision",
    );
    await assertRejectedCheckConfirmation(
      [inspectionConcernRevisionOneId],
      "23503",
      "A concern-present result must not reference a pending concern revision",
    );
    await assertRejectedCheckConfirmation(
      [wrongContextConcernRevisionTwoId],
      "23503",
      "A concern-present result must not reference a different inspection context",
    );
    await assertRejectedCheckConfirmation(
      [inspectionConcernRevisionFourId, inspectionConcernRevisionFourId],
      "23505",
      "A concern-present result must reject duplicate exact concern revision IDs",
    );
    await assertRejectedCheckConfirmation(
      [inspectionConcernRevisionFourId],
      "23514",
      "A concern-present result must reject a missing latest concern revision",
    );
    await assertRejectedCheckConfirmation(
      [inspectionConcernRevisionTwoId, secondInspectionConcernRevisionTwoId],
      "23514",
      "A concern-present result must reject a stale previously-confirmed revision ID",
    );
    await assertRejectedCheckConfirmation(
      [
        inspectionConcernRevisionFourId,
        secondInspectionConcernRevisionTwoId,
        inspectionConcernRevisionTwoId,
      ],
      "23514",
      "A concern-present result must reject an extra non-latest confirmed revision ID",
    );
    await assertRejectedCheckConfirmation(
      [],
      "23514",
      "No-issue confirmation must reject any active latest concern",
      "no_issue_confirmed",
    );

    await inspectionDatabase.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${managerId}, true)`;
      await transaction`
        insert into inspection_check_result (
          id, workspace_id, sku_id, inspection_item_key, product_category,
          definition_version, status, concern_revision_ids, revision, supersedes_id,
          created_by, recorded_by, confirmed_by
        ) values (
          ${inspectionCheckRevisionTwoId}, ${owner.workspaceId}, ${skuId}, 'front_body', 'tops',
          1, 'concern_present',
          array[${inspectionConcernRevisionFourId}, ${secondInspectionConcernRevisionTwoId}]::uuid[],
          2, ${inspectionCheckRevisionOneId}, ${workerId}, ${managerId}, ${managerId}
        )
      `;
    });

    const [confirmedInspection] = await inspectionDatabase.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${managerId}, true)`;
      return transaction<
        Array<{
          created_by: string;
          recorded_by: string;
          confirmed_by: string;
          concern_revision_ids: string[];
          revision: number;
          status: string;
        }>
      >`
        select created_by, recorded_by, confirmed_by, concern_revision_ids, revision, status
        from inspection_check_result
        where workspace_id = ${owner.workspaceId} and id = ${inspectionCheckRevisionTwoId}
      `;
    });
    assert.deepEqual(confirmedInspection, {
      created_by: workerId,
      recorded_by: managerId,
      confirmed_by: managerId,
      concern_revision_ids: [inspectionConcernRevisionFourId, secondInspectionConcernRevisionTwoId],
      revision: 2,
      status: "concern_present",
    });

    const [confirmedConcern] = await inspectionDatabase.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${managerId}, true)`;
      return transaction<
        Array<{
          created_by: string;
          recorded_by: string;
          reviewed_by: string;
          revision: number;
          review_state: string;
        }>
      >`
        select created_by, recorded_by, reviewed_by, revision, review_state
        from inspection_concern_revision
        where workspace_id = ${owner.workspaceId} and id = ${inspectionConcernRevisionFourId}
      `;
    });
    assert.deepEqual(confirmedConcern, {
      created_by: workerId,
      recorded_by: managerId,
      reviewed_by: managerId,
      revision: 4,
      review_state: "human_confirmed",
    });

    await assert.rejects(
      () =>
        inspectionDatabase.begin(async (transaction) => {
          await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
          await transaction`select set_config('app.identity_id', ${workerId}, true)`;
          await transaction`
            insert into inspection_concern_revision (
              id, concern_id, workspace_id, sku_id, inspection_item_key, product_category,
              definition_version, revision, supersedes_id, item_location, concern_type,
              severity, marker_source_asset_id, marker_x, marker_y,
              context_evidence_asset_id, detail_evidence_asset_id, memo, review_state,
              created_by, recorded_by
            ) values (
              ${inspectionConcernRevisionFiveId}, ${inspectionConcernId}, ${owner.workspaceId},
              ${skuId}, 'front_body', 'tops', 1, 5, ${inspectionConcernRevisionFourId},
              '前身頃の右下', 'stain', 'noticeable', ${captureAssetId}, 0.25, 0.75,
              ${captureAssetId}, null, '架空の薄いしみ', 'draft', ${workerId}, ${workerId}
            )
          `;
        }),
      hasDatabaseCode("23514"),
      "A concern successor must not leave an older final check as the latest decision",
    );

    await inspectionDatabase.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${workerId}, true)`;
      await transaction`
        insert into inspection_concern_revision (
          id, concern_id, workspace_id, sku_id, inspection_item_key, product_category,
          definition_version, revision, supersedes_id, item_location, concern_type,
          severity, marker_source_asset_id, marker_x, marker_y,
          context_evidence_asset_id, detail_evidence_asset_id, memo, review_state,
          created_by, recorded_by
        ) values (
          ${inspectionConcernRevisionFiveId}, ${inspectionConcernId}, ${owner.workspaceId},
          ${skuId}, 'front_body', 'tops', 1, 5, ${inspectionConcernRevisionFourId},
          '前身頃の右下', 'stain', 'noticeable', ${captureAssetId}, 0.25, 0.75,
          ${captureAssetId}, null, '架空の薄いしみ', 'draft', ${workerId}, ${workerId}
        )
      `;
      await transaction`
        insert into inspection_check_result (
          id, workspace_id, sku_id, inspection_item_key, product_category,
          definition_version, status, concern_revision_ids, revision, supersedes_id,
          created_by, recorded_by
        ) values (
          ${inspectionCheckRevisionThreeId}, ${owner.workspaceId}, ${skuId},
          'front_body', 'tops', 1, 'unconfirmed', '{}'::uuid[], 3,
          ${inspectionCheckRevisionTwoId}, ${workerId}, ${workerId}
        )
      `;
    });

    const assertCurrentFinalRejected = async (
      status: "concern_present" | "no_issue_confirmed",
      concernRevisionIds: readonly string[],
      label: string,
    ) => {
      await assert.rejects(
        () =>
          inspectionDatabase.begin(async (transaction) => {
            await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
            await transaction`select set_config('app.identity_id', ${managerId}, true)`;
            await transaction`
              insert into inspection_check_result (
                id, workspace_id, sku_id, inspection_item_key, product_category,
                definition_version, status, concern_revision_ids, revision, supersedes_id,
                created_by, recorded_by, confirmed_by
              ) values (
                ${randomUUID()}, ${owner.workspaceId}, ${skuId}, 'front_body', 'tops', 1,
                ${status}, ${concernRevisionIds}, 4, ${inspectionCheckRevisionThreeId},
                ${workerId}, ${managerId}, ${managerId}
              )
            `;
          }),
        hasDatabaseCode("23514"),
        label,
      );
    };

    await assertCurrentFinalRejected(
      "concern_present",
      [inspectionConcernRevisionFourId, secondInspectionConcernRevisionTwoId],
      "A final concern-present check must reject a latest draft concern",
    );

    await inspectionDatabase.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${workerId}, true)`;
      await transaction`
        insert into inspection_concern_revision (
          id, concern_id, workspace_id, sku_id, inspection_item_key, product_category,
          definition_version, revision, supersedes_id, item_location, concern_type,
          severity, marker_source_asset_id, marker_x, marker_y,
          context_evidence_asset_id, detail_evidence_asset_id, memo, review_state,
          created_by, recorded_by
        ) values (
          ${inspectionConcernRevisionSixId}, ${inspectionConcernId}, ${owner.workspaceId},
          ${skuId}, 'front_body', 'tops', 1, 6, ${inspectionConcernRevisionFiveId},
          '前身頃の右下', 'stain', 'noticeable', ${captureAssetId}, 0.25, 0.75,
          ${captureAssetId}, null, '架空の薄いしみ', 'pending_review',
          ${workerId}, ${workerId}
        )
      `;
    });
    await assertCurrentFinalRejected(
      "concern_present",
      [inspectionConcernRevisionFourId, secondInspectionConcernRevisionTwoId],
      "A final concern-present check must reject a latest pending concern",
    );

    await inspectionDatabase.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${managerId}, true)`;
      await transaction`
        insert into inspection_concern_revision (
          id, concern_id, workspace_id, sku_id, inspection_item_key, product_category,
          definition_version, revision, supersedes_id, item_location, concern_type,
          severity, marker_source_asset_id, marker_x, marker_y,
          context_evidence_asset_id, detail_evidence_asset_id, memo, review_state,
          created_by, recorded_by, reviewed_by
        ) values (
          ${inspectionConcernRevisionSevenId}, ${inspectionConcernId}, ${owner.workspaceId},
          ${skuId}, 'front_body', 'tops', 1, 7, ${inspectionConcernRevisionSixId},
          '前身頃の右下', 'stain', 'noticeable', ${captureAssetId}, 0.25, 0.75,
          ${captureAssetId}, null, '架空の薄いしみ', 'changes_requested',
          ${workerId}, ${managerId}, ${managerId}
        )
      `;
    });
    await assertCurrentFinalRejected(
      "concern_present",
      [inspectionConcernRevisionFourId, secondInspectionConcernRevisionTwoId],
      "A final concern-present check must reject a latest changes-requested concern",
    );

    await inspectionDatabase.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${workerId}, true)`;
      await transaction`
        insert into inspection_concern_revision (
          id, concern_id, workspace_id, sku_id, inspection_item_key, product_category,
          definition_version, revision, supersedes_id, item_location, concern_type,
          severity, marker_source_asset_id, marker_x, marker_y,
          context_evidence_asset_id, detail_evidence_asset_id, memo, review_state,
          created_by, recorded_by
        ) values (
          ${inspectionConcernRevisionEightId}, ${inspectionConcernId}, ${owner.workspaceId},
          ${skuId}, 'front_body', 'tops', 1, 8, ${inspectionConcernRevisionSevenId},
          '前身頃の右下', 'stain', 'noticeable', ${captureAssetId}, 0.25, 0.75,
          ${captureAssetId}, null, '架空の薄いしみ', 'pending_review',
          ${workerId}, ${workerId}
        )
      `;
    });
    await inspectionDatabase.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${managerId}, true)`;
      await transaction`
        insert into inspection_concern_revision (
          id, concern_id, workspace_id, sku_id, inspection_item_key, product_category,
          definition_version, revision, supersedes_id, item_location, concern_type,
          severity, marker_source_asset_id, marker_x, marker_y,
          context_evidence_asset_id, detail_evidence_asset_id, memo, review_state,
          created_by, recorded_by, reviewed_by
        ) values (
          ${inspectionConcernRevisionNineId}, ${inspectionConcernId}, ${owner.workspaceId},
          ${skuId}, 'front_body', 'tops', 1, 9, ${inspectionConcernRevisionEightId},
          '前身頃の右下', 'stain', 'noticeable', ${captureAssetId}, 0.25, 0.75,
          ${captureAssetId}, null, '架空の薄いしみ', 'human_dismissed',
          ${workerId}, ${managerId}, ${managerId}
        )
      `;
    });
    await assertCurrentFinalRejected(
      "no_issue_confirmed",
      [],
      "No-issue confirmation must reject a remaining latest human-confirmed concern",
    );

    await inspectionDatabase.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${workerId}, true)`;
      await transaction`
        insert into inspection_concern_revision (
          id, concern_id, workspace_id, sku_id, inspection_item_key, product_category,
          definition_version, revision, supersedes_id, item_location, concern_type,
          severity, marker_source_asset_id, marker_x, marker_y,
          context_evidence_asset_id, detail_evidence_asset_id, memo, review_state,
          created_by, recorded_by
        ) values (
          ${secondInspectionConcernRevisionThreeId}, ${secondInspectionConcernId},
          ${owner.workspaceId}, ${skuId}, 'front_body', 'tops', 1, 3,
          ${secondInspectionConcernRevisionTwoId}, '前身頃の左上', 'scratch', 'small',
          ${captureAssetId}, 0.65, 0.2, ${captureAssetId}, null, '架空の小さな擦れ',
          'pending_review', ${workerId}, ${workerId}
        )
      `;
    });
    await inspectionDatabase.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${managerId}, true)`;
      await transaction`
        insert into inspection_concern_revision (
          id, concern_id, workspace_id, sku_id, inspection_item_key, product_category,
          definition_version, revision, supersedes_id, item_location, concern_type,
          severity, marker_source_asset_id, marker_x, marker_y,
          context_evidence_asset_id, detail_evidence_asset_id, memo, review_state,
          created_by, recorded_by, reviewed_by
        ) values (
          ${secondInspectionConcernRevisionFourId}, ${secondInspectionConcernId},
          ${owner.workspaceId}, ${skuId}, 'front_body', 'tops', 1, 4,
          ${secondInspectionConcernRevisionThreeId}, '前身頃の左上', 'scratch', 'small',
          ${captureAssetId}, 0.65, 0.2, ${captureAssetId}, null, '架空の小さな擦れ',
          'human_dismissed', ${workerId}, ${managerId}, ${managerId}
        )
      `;
    });

    await inspectionDatabase.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${managerId}, true)`;
      await transaction`
        insert into inspection_check_result (
          id, workspace_id, sku_id, inspection_item_key, product_category,
          definition_version, status, concern_revision_ids, revision, supersedes_id,
          created_by, recorded_by, confirmed_by
        ) values (
          ${inspectionCheckRevisionFourId}, ${owner.workspaceId}, ${skuId},
          'front_body', 'tops', 1, 'no_issue_confirmed', '{}'::uuid[], 4,
          ${inspectionCheckRevisionThreeId}, ${workerId}, ${managerId}, ${managerId}
        )
      `;
    });

    const [resolvedInspectionState] = await inspectionDatabase.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${managerId}, true)`;
      return transaction<
        Array<{
          check_status: string;
          concern_revision_ids: string[];
          latest_concern_states: string[];
        }>
      >`
        select
          check_result.status as check_status,
          check_result.concern_revision_ids,
          array(
            select concern.review_state
            from inspection_concern_revision concern
            where concern.workspace_id = check_result.workspace_id
              and concern.sku_id = check_result.sku_id
              and concern.inspection_item_key = check_result.inspection_item_key
              and concern.product_category = check_result.product_category
              and concern.definition_version = check_result.definition_version
              and not exists (
                select 1 from inspection_concern_revision successor
                where successor.workspace_id = concern.workspace_id
                  and successor.supersedes_id = concern.id
              )
            order by concern.concern_id
          ) as latest_concern_states
        from inspection_check_result check_result
        where check_result.workspace_id = ${owner.workspaceId}
          and check_result.id = ${inspectionCheckRevisionFourId}
      `;
    });
    assert.deepEqual(resolvedInspectionState, {
      check_status: "no_issue_confirmed",
      concern_revision_ids: [],
      latest_concern_states: ["human_dismissed", "human_dismissed"],
    });
    await assert.rejects(
      () =>
        inspectionDatabase.begin(async (transaction) => {
          await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
          await transaction`select set_config('app.identity_id', ${workerId}, true)`;
          await transaction`
            insert into inspection_concern_revision (
              id, concern_id, workspace_id, sku_id, inspection_item_key, product_category,
              definition_version, revision, supersedes_id, item_location, concern_type,
              severity, marker_source_asset_id, marker_x, marker_y,
              context_evidence_asset_id, detail_evidence_asset_id, memo, review_state,
              created_by, recorded_by
            ) values (
              ${randomUUID()}, ${inspectionConcernId}, ${owner.workspaceId}, ${skuId},
              'front_body', 'tops', 1, 10, ${inspectionConcernRevisionNineId},
              '前身頃の右下', 'stain', 'noticeable', ${captureAssetId}, 0.25, 0.75,
              ${captureAssetId}, null, '架空の薄いしみ', 'draft', ${workerId}, ${workerId}
            )
          `;
        }),
      hasDatabaseCode("23514"),
      "A terminal human-dismissed concern chain must not be reopened",
    );

    const inspectionAdmin = postgres(adminUrl, { max: 1 });
    try {
      await assert.rejects(
        () =>
          inspectionAdmin.begin(async (transaction) => {
            await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
            await transaction`select set_config('app.identity_id', ${managerId}, true)`;
            await transaction`
              update inspection_check_result set status = 'unconfirmed'
              where workspace_id = ${owner.workspaceId} and id = ${inspectionCheckRevisionTwoId}
            `;
          }),
        /inspection history is append-only/u,
      );
      await assert.rejects(
        () =>
          inspectionAdmin.begin(async (transaction) => {
            await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
            await transaction`select set_config('app.identity_id', ${managerId}, true)`;
            await transaction`
              delete from inspection_concern_revision
              where workspace_id = ${owner.workspaceId} and id = ${inspectionConcernRevisionOneId}
            `;
          }),
        /inspection history is append-only/u,
      );
    } finally {
      await inspectionAdmin.end({ timeout: 5 });
    }
  } finally {
    await inspectionDatabase.end({ timeout: 5 });
  }

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
    const ownWorkspaceLock = await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
      return transaction<Array<{ locked: boolean }>>`
        select lock_current_shipping_workspace() as locked
      `;
    });
    assert.equal(ownWorkspaceLock[0]?.locked, true);
    await assert.rejects(
      () =>
        inventory.begin(async (transaction) => {
          await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
          await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
          await transaction`select id from workspace where id = ${owner.workspaceId} for update`;
        }),
      /permission denied/u,
      "The runtime must serialize through the dedicated function, not a workspace table grant",
    );
    await assert.rejects(
      () =>
        inventory.begin(async (transaction) => {
          await transaction`select set_config('app.workspace_id', ${otherWorkspaceId}, true)`;
          await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
          await transaction`select lock_current_shipping_workspace()`;
        }),
      hasDatabaseCode("42501"),
      "The lock function must reject a session identity without active membership",
    );
    await assert.rejects(
      () =>
        inventory.begin(async (transaction) => {
          await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
          await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
          await transaction`select lock_current_shipping_workspace(${otherWorkspaceId})`;
        }),
      hasDatabaseCode("42883"),
      "No caller-supplied workspace overload may exist",
    );

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
        insert into sales_order (id, workspace_id, order_number, state, address_mode) values
          (${firstOrderId}, ${owner.workspaceId}, 'ORDER-DB-1', 'confirmed', 'anonymous'),
          (${secondOrderId}, ${owner.workspaceId}, 'ORDER-DB-2', 'confirmed', 'anonymous')
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
      salesChannelKey: "mercari",
      salesChannelName: "メルカリ",
      channelTransactionId: null,
      buyerDisplayName: null,
      skuId: acquiredItem.skuId,
      inventoryUnitId: acquiredItem.inventoryUnitId,
      saleAmountMinor: 5000,
      costAmountMinor: 1500,
      sellingFeeMinor: null,
      shippingCostMinor: null,
      packagingCostMinor: null,
      taxBasis: "tax_included",
      sourceMeaning: "架空P0結合試験で人が確認した取引事実",
      occurredAt: new Date().toISOString(),
      addressMode: "stored",
      shippingAddress: fictionalAddress,
      idempotencyKey: orderCreateKey,
      humanConfirmed: true,
    } as const;
    const hiddenZeroCreate = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders`,
      headers: { cookie },
      payload: {
        ...orderCreatePayload,
        sellingFeeMinor: 0,
        packagingCostMinor: 0,
        idempotencyKey: randomUUID(),
      },
    });
    assert.equal(hiddenZeroCreate.statusCode, 400, hiddenZeroCreate.body);
    const directHiddenFactsPayload = {
      ...orderCreatePayload,
      sellingFeeMinor: 0,
      packagingCostMinor: 0,
      addressMode: "anonymous",
      shippingAddress: null,
      idempotencyKey: randomUUID(),
    } as const;
    await assert.rejects(
      () =>
        orderRepository.createOrder(
          owner.workspaceId,
          { identityId: owner.identityId, workspaceId: owner.workspaceId },
          {
            orderId: randomUUID(),
            input: directHiddenFactsPayload,
            encryptedAddress: null,
            addressFingerprint: null,
          },
        ),
      /must leave unconfirmed selling and packaging costs missing/u,
      "Repository callers must not bypass registered-order missing-value semantics",
    );
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
    const [serverNumberedOrderBeforeShipping] = await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
      return transaction<
        Array<{
          order_number: string;
          address_mode: string;
          private_address_count: number;
          sale_fact_count: number;
          cost_fact_count: number;
          fee_fact_count: number;
          packaging_fact_count: number;
          shipping_fact_count: number;
        }>
      >`
        select orders.order_number,
               coalesce(orders.address_mode, 'stored') as address_mode,
               (select count(*)::integer from order_private_address address_row
                where address_row.workspace_id = orders.workspace_id
                  and address_row.order_id = orders.id) as private_address_count,
               (select count(*)::integer from financial_event event
                where event.workspace_id = orders.workspace_id
                  and event.order_id = orders.id and event.event_type = 'sale')
                 as sale_fact_count,
               (select count(*)::integer from financial_event event
                where event.workspace_id = orders.workspace_id
                  and event.order_id = orders.id and event.event_type = 'cost')
                 as cost_fact_count,
               (select count(*)::integer from financial_event event
                where event.workspace_id = orders.workspace_id
                  and event.order_id = orders.id and event.event_type = 'fee')
                 as fee_fact_count,
               (select count(*)::integer from financial_event event
                where event.workspace_id = orders.workspace_id
                  and event.order_id = orders.id and event.event_type = 'packaging')
                 as packaging_fact_count,
               (select count(*)::integer from financial_event event
                where event.workspace_id = orders.workspace_id
                  and event.order_id = orders.id and event.event_type = 'shipping')
                 as shipping_fact_count
        from sales_order orders
        where orders.workspace_id = ${owner.workspaceId} and orders.id = ${orderId}
      `;
    });
    assert.match(serverNumberedOrderBeforeShipping?.order_number ?? "", /^ORD-\d{8}-\d{6,}$/u);
    assert.equal(serverNumberedOrderBeforeShipping?.address_mode, "stored");
    assert.equal(
      serverNumberedOrderBeforeShipping?.private_address_count,
      0,
      "Even the creating manager must not read the private address row without its own lease",
    );
    const storedAddressAdmin = postgres(adminUrl, { max: 1 });
    try {
      const [storedAddressCount] = await storedAddressAdmin<[{ address_count: number }]>`
        select count(*)::integer as address_count
        from order_private_address
        where workspace_id = ${owner.workspaceId} and order_id = ${orderId}
      `;
      assert.equal(
        storedAddressCount?.address_count,
        1,
        "Stored-address POST must atomically create exactly one encrypted address row",
      );
    } finally {
      await storedAddressAdmin.end({ timeout: 5 });
    }
    assert.equal(
      serverNumberedOrderBeforeShipping?.shipping_fact_count,
      0,
      "A registered order must wait for the human-selected shipping fee",
    );
    assert.deepEqual(
      {
        sale: serverNumberedOrderBeforeShipping?.sale_fact_count,
        cost: serverNumberedOrderBeforeShipping?.cost_fact_count,
        fee: serverNumberedOrderBeforeShipping?.fee_fact_count,
        packaging: serverNumberedOrderBeforeShipping?.packaging_fact_count,
      },
      { sale: 1, cost: 1, fee: 0, packaging: 0 },
      "Registered creation must not turn unconfirmed selling or packaging costs into zero-yen facts",
    );
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

    const issuedOrderNumbers = await Promise.all(
      [0, 1].map(() =>
        inventory.begin(async (transaction) => {
          await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
          await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
          const rows = await transaction<Array<{ order_number: string }>>`
            select issue_app_order_number() as order_number
          `;
          return rows[0]?.order_number;
        }),
      ),
    );
    assert.equal(
      new Set(issuedOrderNumbers).size,
      2,
      "Concurrent server order numbers must differ",
    );
    for (const issuedOrderNumber of issuedOrderNumbers) {
      assert.match(issuedOrderNumber ?? "", /^ORD-\d{8}-\d{6,}$/u);
    }
    await assert.rejects(
      () =>
        inventory.begin(async (transaction) => {
          await transaction`select set_config('app.workspace_id', ${otherWorkspaceId}, true)`;
          await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
          await transaction`select issue_app_order_number()`;
        }),
      hasDatabaseCode("42501"),
      "Order number issuance must reject an actor outside the selected workspace",
    );

    const initialRegistration = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/registration`,
      headers: { cookie },
    });
    assert.equal(initialRegistration.statusCode, 200, initialRegistration.body);
    assert.equal(initialRegistration.headers["cache-control"], "private, no-store");
    assert.equal(initialRegistration.headers.pragma, "no-cache");
    const initialRegistrationBody = initialRegistration.json<{
      registrationRevisionId: string;
      salesChannelKey: string;
      salesChannelName: string;
      channelTransactionId: string | null;
      buyerDisplayName: string | null;
      revision: number;
    }>();
    assert.deepEqual(
      {
        salesChannelKey: initialRegistrationBody.salesChannelKey,
        salesChannelName: initialRegistrationBody.salesChannelName,
        channelTransactionId: initialRegistrationBody.channelTransactionId,
        buyerDisplayName: initialRegistrationBody.buyerDisplayName,
        revision: initialRegistrationBody.revision,
      },
      {
        salesChannelKey: "mercari",
        salesChannelName: "メルカリ",
        channelTransactionId: null,
        buyerDisplayName: null,
        revision: 1,
      },
    );
    const registrationRevisionId = initialRegistrationBody.registrationRevisionId;

    const claimedTransactionId = "P14-CLAIMED-TRANSACTION-001";
    const claimSourceOrderId = randomUUID();
    const claimApiConflictOrderId = randomUUID();
    const claimSqlConflictOrderId = randomUUID();
    const claimSourceRegistrationId = randomUUID();
    const claimApiConflictRegistrationId = randomUUID();
    const claimSqlConflictRegistrationId = randomUUID();
    await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
      await transaction`
        insert into sales_order (id, workspace_id, order_number, state, address_mode) values
          (${claimSourceOrderId}, ${owner.workspaceId}, 'ORDER-P14-CLAIM-SOURCE', 'confirmed', 'anonymous'),
          (${claimApiConflictOrderId}, ${owner.workspaceId}, 'ORDER-P14-CLAIM-API', 'confirmed', 'anonymous'),
          (${claimSqlConflictOrderId}, ${owner.workspaceId}, 'ORDER-P14-CLAIM-SQL', 'confirmed', 'anonymous')
      `;
      await transaction`
        insert into order_registration_revision (
          id, workspace_id, order_id, sales_channel_key, sales_channel_name,
          channel_transaction_id, buyer_display_name, revision, supersedes_id,
          idempotency_key, payload_hash
        ) values
          (
            ${claimSourceRegistrationId}, ${owner.workspaceId}, ${claimSourceOrderId},
            'mercari', 'メルカリ', ${claimedTransactionId}, null, 1, null,
            ${randomUUID()}, ${hashFixture("claim-source")}
          ),
          (
            ${claimApiConflictRegistrationId}, ${owner.workspaceId},
            ${claimApiConflictOrderId}, 'mercari', 'メルカリ', null, null, 1, null,
            ${randomUUID()}, ${hashFixture("claim-api-null")}
          ),
          (
            ${claimSqlConflictRegistrationId}, ${owner.workspaceId},
            ${claimSqlConflictOrderId}, 'mercari', 'メルカリ', null, null, 1, null,
            ${randomUUID()}, ${hashFixture("claim-sql-null")}
          )
      `;
    });
    const sameOrderClaimRevision = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${claimSourceOrderId}/registration`,
      headers: { cookie },
      payload: {
        salesChannelKey: "mercari",
        salesChannelName: "メルカリ",
        channelTransactionId: claimedTransactionId,
        buyerDisplayName: null,
        expectedRevision: 1,
        idempotencyKey: randomUUID(),
        humanConfirmed: true,
      },
    });
    assert.equal(sameOrderClaimRevision.statusCode, 200, sameOrderClaimRevision.body);
    assert.equal(sameOrderClaimRevision.headers["cache-control"], "private, no-store");
    const duplicateClaimThroughApi = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${claimApiConflictOrderId}/registration`,
      headers: { cookie },
      payload: {
        salesChannelKey: "mercari",
        salesChannelName: "メルカリ",
        channelTransactionId: claimedTransactionId,
        buyerDisplayName: null,
        expectedRevision: 1,
        idempotencyKey: randomUUID(),
        humanConfirmed: true,
      },
    });
    assert.equal(duplicateClaimThroughApi.statusCode, 409, duplicateClaimThroughApi.body);
    await assert.rejects(
      () =>
        inventory.begin(async (transaction) => {
          await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
          await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
          await transaction`
            insert into order_registration_revision (
              workspace_id, order_id, sales_channel_key, sales_channel_name,
              channel_transaction_id, buyer_display_name, revision, supersedes_id,
              idempotency_key, payload_hash
            ) values (
              ${owner.workspaceId}, ${claimSqlConflictOrderId}, 'mercari', 'メルカリ',
              ${claimedTransactionId}, null, 2, ${claimSqlConflictRegistrationId},
              ${randomUUID()}, ${hashFixture("claim-sql-conflict")}
            )
          `;
        }),
      hasDatabaseCode("23505"),
      "Direct SQL must reject one marketplace transaction claimed by another order",
    );
    await assert.rejects(
      () =>
        inventory.begin(async (transaction) => {
          await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
          await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
          await transaction`
            insert into order_channel_transaction_claim (
              workspace_id, sales_channel_key, channel_transaction_id, order_id
            ) values (
              ${owner.workspaceId}, 'mercari', 'FORGED-CLAIM', ${claimApiConflictOrderId}
            )
          `;
        }),
      /permission denied|row-level security/u,
      "Runtime SQL must not bypass the registration trigger to forge a transaction claim",
    );

    const registrationShippingRaceOrderId = randomUUID();
    await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
      await transaction`
        insert into sales_order (id, workspace_id, order_number, state, address_mode)
        values (
          ${registrationShippingRaceOrderId}, ${owner.workspaceId},
          'ORDER-P14-REGISTRATION-SHIPPING-RACE', 'confirmed', 'anonymous'
        )
      `;
    });
    const shippingRaceWriter = postgres(runtimeUrl, { max: 1 });
    const registrationRaceWriter = postgres(runtimeUrl, { max: 1 });
    const registrationShippingRaceObserver = postgres(adminUrl, { max: 1 });
    let releaseShippingWriter: (() => void) | undefined;
    const holdShippingWriter = new Promise<void>((resolve) => {
      releaseShippingWriter = resolve;
    });
    let shippingWriterReadyResolve: ((backendPid: number) => void) | undefined;
    let shippingWriterReadyReject: ((reason: unknown) => void) | undefined;
    const shippingWriterReady = new Promise<number>((resolve, reject) => {
      shippingWriterReadyResolve = resolve;
      shippingWriterReadyReject = reject;
    });
    let registrationWriterStartedResolve: ((backendPid: number) => void) | undefined;
    let registrationWriterStartedReject: ((reason: unknown) => void) | undefined;
    const registrationWriterStarted = new Promise<number>((resolve, reject) => {
      registrationWriterStartedResolve = resolve;
      registrationWriterStartedReject = reject;
    });
    const withP14RaceTimeout = async <T>(promise: Promise<T>, label: string): Promise<T> => {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          promise,
          new Promise<never>((_resolve, reject) => {
            timeout = setTimeout(() => reject(new Error(`${label} timed out`)), 10_000);
          }),
        ]);
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    };
    let shippingRaceAttempt: Promise<void> | undefined;
    let registrationRaceAttempt: Promise<void> | undefined;
    let registrationShippingRaceResults: PromiseSettledResult<void>[] | undefined;
    try {
      shippingRaceAttempt = shippingRaceWriter.begin(async (transaction) => {
        try {
          await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
          await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
          await transaction`select set_config('statement_timeout', '20s', true)`;
          const [connection] = await transaction<[{ backend_pid: number }]>`
            select pg_backend_pid()::integer as backend_pid
          `;
          assert.ok(connection);
          await transaction`
            insert into financial_event (
              workspace_id, sku_id, order_id, event_type, amount_minor, currency,
              tax_basis, bearer, source, source_meaning, rounding_rule_version,
              source_already_net, occurred_at
            ) values (
              ${owner.workspaceId}, ${acquiredItem.skuId}, ${registrationShippingRaceOrderId},
              'shipping', 400, 'JPY', 'tax_included', 'seller', 'manual',
              'P14登録前に記録済みの架空送料', 'jpy-v1', false, statement_timestamp()
            )
          `;
          shippingWriterReadyResolve?.(connection.backend_pid);
          await holdShippingWriter;
        } catch (error) {
          shippingWriterReadyReject?.(error);
          throw error;
        }
      });
      void shippingRaceAttempt.catch(() => undefined);
      const shippingWriterBackendPid = await withP14RaceTimeout(
        shippingWriterReady,
        "P14 shipping writer",
      );

      registrationRaceAttempt = registrationRaceWriter.begin(async (transaction) => {
        try {
          await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
          await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
          await transaction`select set_config('statement_timeout', '20s', true)`;
          const [connection] = await transaction<[{ backend_pid: number }]>`
            select pg_backend_pid()::integer as backend_pid
          `;
          assert.ok(connection);
          registrationWriterStartedResolve?.(connection.backend_pid);
          await transaction`
            insert into order_registration_revision (
              workspace_id, order_id, sales_channel_key, sales_channel_name,
              channel_transaction_id, buyer_display_name, revision, supersedes_id,
              idempotency_key, payload_hash
            ) values (
              ${owner.workspaceId}, ${registrationShippingRaceOrderId}, 'mercari', 'メルカリ',
              null, null, 1, null, ${randomUUID()}, ${hashFixture("registration-shipping-race")}
            )
          `;
        } catch (error) {
          registrationWriterStartedReject?.(error);
          throw error;
        }
      });
      void registrationRaceAttempt.catch(() => undefined);
      const registrationWriterBackendPid = await withP14RaceTimeout(
        registrationWriterStarted,
        "P14 registration writer",
      );
      assert.notEqual(shippingWriterBackendPid, registrationWriterBackendPid);

      await withP14RaceTimeout(
        (async () => {
          while (true) {
            const [blocking] = await registrationShippingRaceObserver<
              [{ blocked_by_shipping_writer: boolean }]
            >`
              select ${shippingWriterBackendPid}::integer = any(
                pg_blocking_pids(${registrationWriterBackendPid}::integer)
              ) as blocked_by_shipping_writer
            `;
            if (blocking?.blocked_by_shipping_writer) return;
            await registrationShippingRaceObserver`select pg_sleep(0.02)`;
          }
        })(),
        "P14 registration-versus-shipping row lock",
      );
      releaseShippingWriter?.();
      registrationShippingRaceResults = await withP14RaceTimeout(
        Promise.allSettled([shippingRaceAttempt, registrationRaceAttempt]),
        "P14 registration-versus-shipping completion",
      );
    } finally {
      releaseShippingWriter?.();
      await Promise.allSettled(
        [shippingRaceAttempt, registrationRaceAttempt].filter(
          (operation): operation is Promise<void> => operation !== undefined,
        ),
      );
      await Promise.allSettled([
        shippingRaceWriter.end({ timeout: 5 }),
        registrationRaceWriter.end({ timeout: 5 }),
        registrationShippingRaceObserver.end({ timeout: 5 }),
      ]);
    }
    assert.equal(registrationShippingRaceResults?.[0]?.status, "fulfilled");
    assert.equal(registrationShippingRaceResults?.[1]?.status, "rejected");
    const rejectedRegistrationRace = registrationShippingRaceResults?.[1];
    assert.equal(
      rejectedRegistrationRace?.status === "rejected" &&
        hasDatabaseCode("23514")(rejectedRegistrationRace.reason),
      true,
      "The registration losing the order lock must reject the now-visible legacy shipping fact",
    );
    const [registrationShippingRaceState] = await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
      return transaction<[{ registration_count: number; shipping_count: number }]>`
        select
          (select count(*)::integer from order_registration_revision
           where workspace_id = ${owner.workspaceId}
             and order_id = ${registrationShippingRaceOrderId}) as registration_count,
          (select count(*)::integer from financial_event
           where workspace_id = ${owner.workspaceId}
             and order_id = ${registrationShippingRaceOrderId}
             and event_type = 'shipping') as shipping_count
      `;
    });
    assert.deepEqual(
      { ...registrationShippingRaceState },
      { registration_count: 0, shipping_count: 1 },
      "Registration and a pre-existing shipping fact must never both commit",
    );

    const unassignedShippingOptions = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/shipping-method-options`,
      headers: { cookie: shippingCookie },
    });
    assert.equal(unassignedShippingOptions.statusCode, 403, unassignedShippingOptions.body);

    const createShippingMethodKey = randomUUID();
    const createdShippingMethod = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/shipping-methods`,
      headers: { cookie },
      payload: {
        methodId: null,
        expectedRevision: null,
        salesChannelKey: "mercari",
        salesChannelName: "メルカリ",
        methodName: "架空の追跡付き配送",
        trackingAvailable: true,
        feeMinor: 750,
        deliveryEstimate: "1〜2日",
        officialCheckedOn: "2026-01-01",
        officialReferenceUrl: null,
        officialReferenceNote: "結合試験用の架空公式確認メモ",
        active: true,
        idempotencyKey: createShippingMethodKey,
        humanConfirmed: true,
      },
    });
    assert.equal(createdShippingMethod.statusCode, 201, createdShippingMethod.body);
    const shippingMethod = createdShippingMethod.json<{
      methodId: string;
      catalogRevisionId: string;
      revision: number;
    }>();
    assert.equal(shippingMethod.revision, 1);
    const shippingMethodReplay = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/shipping-methods`,
      headers: { cookie },
      payload: {
        methodId: null,
        expectedRevision: null,
        salesChannelKey: "mercari",
        salesChannelName: "メルカリ",
        methodName: "架空の追跡付き配送",
        trackingAvailable: true,
        feeMinor: 750,
        deliveryEstimate: "1〜2日",
        officialCheckedOn: "2026-01-01",
        officialReferenceUrl: null,
        officialReferenceNote: "結合試験用の架空公式確認メモ",
        active: true,
        idempotencyKey: createShippingMethodKey,
        humanConfirmed: true,
      },
    });
    assert.equal(shippingMethodReplay.statusCode, 201, shippingMethodReplay.body);
    assert.equal(
      shippingMethodReplay.json<{ catalogRevisionId: string }>().catalogRevisionId,
      shippingMethod.catalogRevisionId,
    );

    const absentShippingPhotoPolicy = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/shipping-photo-policy`,
      headers: { cookie },
    });
    assert.equal(absentShippingPhotoPolicy.statusCode, 204, absentShippingPhotoPolicy.body);
    const undecidedPreflight = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/shipping-photo-preflight`,
      headers: { cookie },
    });
    assert.equal(undecidedPreflight.statusCode, 200, undecidedPreflight.body);
    assert.deepEqual(
      undecidedPreflight.json<{
        decisionRevision: number | null;
        state: string;
        saleAmountStatus: string;
      }>(),
      {
        orderId,
        decisionRevisionId: null,
        decisionRevision: null,
        state: "choice_required",
        photoRequired: null,
        decisionReason: null,
        saleAmountStatus: "present",
        assets: [],
        confirmedAssetIds: [],
        photoConfirmationId: null,
        packingHumanConfirmed: false,
        shipmentHumanConfirmed: false,
        updatedAt: undecidedPreflight.json<{ updatedAt: string }>().updatedAt,
      },
    );
    const firstDecisionKey = randomUUID();
    const concurrentDecisionReplays = await Promise.all([
      app.inject({
        method: "POST",
        url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/shipping-photo-preflight`,
        headers: { cookie },
        payload: {
          expectedDecisionRevision: null,
          idempotencyKey: firstDecisionKey,
          humanConfirmed: true,
        },
      }),
      app.inject({
        method: "POST",
        url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/shipping-photo-preflight`,
        headers: { cookie },
        payload: {
          expectedDecisionRevision: null,
          idempotencyKey: firstDecisionKey,
          humanConfirmed: true,
        },
      }),
    ]);
    assert.deepEqual(
      concurrentDecisionReplays.map((response) => response.statusCode),
      [200, 200],
      "Concurrent identical decision retries must replay one revision",
    );
    assert.equal(
      concurrentDecisionReplays[0]?.json<{ decisionRevisionId: string }>().decisionRevisionId,
      concurrentDecisionReplays[1]?.json<{ decisionRevisionId: string }>().decisionRevisionId,
    );
    const policyMissingDecision = concurrentDecisionReplays[0];
    assert.equal(policyMissingDecision.statusCode, 200, policyMissingDecision.body);
    assert.deepEqual(
      policyMissingDecision.json<{
        decisionRevision: number;
        state: string;
        decisionReason: string;
        photoRequired: boolean | null;
      }>(),
      {
        ...policyMissingDecision.json<Record<string, unknown>>(),
        decisionRevision: 1,
        state: "choice_required",
        decisionReason: "policy_missing",
        photoRequired: null,
      },
    );

    const missingPolicyOverrideOrderId = randomUUID();
    await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
      await transaction`
        insert into sales_order (id, workspace_id, order_number, state, address_mode)
        values (
          ${missingPolicyOverrideOrderId}, ${owner.workspaceId},
          'ORDER-P13-MISSING-POLICY-OVERRIDE', 'confirmed', 'anonymous'
        )
      `;
    });
    const missingPolicyOverrideDecision = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${missingPolicyOverrideOrderId}/shipping-photo-preflight`,
      headers: { cookie },
      payload: {
        expectedDecisionRevision: null,
        idempotencyKey: randomUUID(),
        humanConfirmed: true,
      },
    });
    assert.equal(missingPolicyOverrideDecision.statusCode, 200, missingPolicyOverrideDecision.body);
    const missingPolicySkip = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${missingPolicyOverrideOrderId}/shipping-photo-override`,
      headers: { cookie },
      payload: {
        choice: "skip_photos",
        expectedDecisionRevision: 1,
        idempotencyKey: randomUUID(),
        humanConfirmed: true,
      },
    });
    assert.equal(missingPolicySkip.statusCode, 200, missingPolicySkip.body);
    assert.equal(
      missingPolicySkip.json<{ decisionReason: string }>().decisionReason,
      "manual_skip",
    );
    await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
      await transaction`
        update sales_order set state = 'cancelled'
        where workspace_id = ${owner.workspaceId} and id = ${missingPolicyOverrideOrderId}
      `;
    });

    const firstPolicyKey = randomUUID();
    const concurrentPolicyReplays = await Promise.all([
      app.inject({
        method: "PUT",
        url: `/v1/workspaces/${owner.workspaceId}/shipping-photo-policy`,
        headers: { cookie },
        payload: {
          mode: "high_value_only",
          highValueThresholdMinor: 5000,
          expectedRevision: null,
          idempotencyKey: firstPolicyKey,
          humanConfirmed: true,
        },
      }),
      app.inject({
        method: "PUT",
        url: `/v1/workspaces/${owner.workspaceId}/shipping-photo-policy`,
        headers: { cookie },
        payload: {
          mode: "high_value_only",
          highValueThresholdMinor: 5000,
          expectedRevision: null,
          idempotencyKey: firstPolicyKey,
          humanConfirmed: true,
        },
      }),
    ]);
    assert.deepEqual(
      concurrentPolicyReplays.map((response) => response.statusCode),
      [200, 200],
      "Concurrent identical policy retries must replay one revision",
    );
    assert.equal(
      concurrentPolicyReplays[0]?.json<{ policyRevisionId: string }>().policyRevisionId,
      concurrentPolicyReplays[1]?.json<{ policyRevisionId: string }>().policyRevisionId,
    );
    const thresholdDecision = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/shipping-photo-preflight`,
      headers: { cookie },
      payload: {
        expectedDecisionRevision: 1,
        idempotencyKey: randomUUID(),
        humanConfirmed: true,
      },
    });
    assert.equal(thresholdDecision.statusCode, 200, thresholdDecision.body);
    assert.deepEqual(
      thresholdDecision.json<{
        decisionRevision: number;
        state: string;
        decisionReason: string;
        photoRequired: boolean;
      }>(),
      {
        ...thresholdDecision.json<Record<string, unknown>>(),
        decisionRevision: 2,
        state: "capture_required",
        decisionReason: "threshold_met",
        photoRequired: true,
      },
    );

    const concurrentPolicyBranches = await Promise.all([
      app.inject({
        method: "PUT",
        url: `/v1/workspaces/${owner.workspaceId}/shipping-photo-policy`,
        headers: { cookie },
        payload: {
          mode: "all",
          highValueThresholdMinor: null,
          expectedRevision: 1,
          idempotencyKey: randomUUID(),
          humanConfirmed: true,
        },
      }),
      app.inject({
        method: "PUT",
        url: `/v1/workspaces/${owner.workspaceId}/shipping-photo-policy`,
        headers: { cookie },
        payload: {
          mode: "all",
          highValueThresholdMinor: null,
          expectedRevision: 1,
          idempotencyKey: randomUUID(),
          humanConfirmed: true,
        },
      }),
    ]);
    assert.deepEqual(
      concurrentPolicyBranches.map((response) => response.statusCode).sort(),
      [200, 409],
      "Concurrent distinct policy successors must produce exactly one branch",
    );
    const allPolicyDecision = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/shipping-photo-preflight`,
      headers: { cookie },
      payload: {
        expectedDecisionRevision: 2,
        idempotencyKey: randomUUID(),
        humanConfirmed: true,
      },
    });
    assert.equal(allPolicyDecision.statusCode, 200, allPolicyDecision.body);
    assert.equal(allPolicyDecision.json<{ decisionReason: string }>().decisionReason, "policy_all");

    const policyModes = [
      {
        mode: "disabled",
        threshold: null,
        revision: 3,
        reason: "policy_disabled",
        photoRequired: false,
      },
      {
        mode: "high_value_only",
        threshold: 5000,
        revision: 4,
        reason: "threshold_met",
        photoRequired: true,
      },
    ] as const;
    let expectedPolicyRevision = 2;
    let expectedDecisionRevision = 3;
    for (const expected of policyModes) {
      const updatedPolicy = await app.inject({
        method: "PUT",
        url: `/v1/workspaces/${owner.workspaceId}/shipping-photo-policy`,
        headers: { cookie },
        payload: {
          mode: expected.mode,
          highValueThresholdMinor: expected.threshold,
          expectedRevision: expectedPolicyRevision,
          idempotencyKey: randomUUID(),
          humanConfirmed: true,
        },
      });
      assert.equal(updatedPolicy.statusCode, 200, updatedPolicy.body);
      assert.equal(updatedPolicy.json<{ revision: number }>().revision, expected.revision);
      const evaluatedPolicy = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/shipping-photo-preflight`,
        headers: { cookie },
        payload: {
          expectedDecisionRevision,
          idempotencyKey: randomUUID(),
          humanConfirmed: true,
        },
      });
      assert.equal(evaluatedPolicy.statusCode, 200, evaluatedPolicy.body);
      assert.equal(
        evaluatedPolicy.json<{ decisionReason: string }>().decisionReason,
        expected.reason,
      );
      assert.equal(
        evaluatedPolicy.json<{ photoRequired: boolean }>().photoRequired,
        expected.photoRequired,
      );
      expectedPolicyRevision += 1;
      expectedDecisionRevision += 1;
    }

    const missingSaleOverrideOrderId = randomUUID();
    await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
      await transaction`
        insert into sales_order (id, workspace_id, order_number, state, address_mode)
        values (
          ${missingSaleOverrideOrderId}, ${owner.workspaceId},
          'ORDER-P13-MISSING-SALE-OVERRIDE', 'confirmed', 'anonymous'
        )
      `;
    });
    const missingSaleOverrideDecision = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${missingSaleOverrideOrderId}/shipping-photo-preflight`,
      headers: { cookie },
      payload: {
        expectedDecisionRevision: null,
        idempotencyKey: randomUUID(),
        humanConfirmed: true,
      },
    });
    assert.equal(missingSaleOverrideDecision.statusCode, 200, missingSaleOverrideDecision.body);
    assert.equal(
      missingSaleOverrideDecision.json<{ decisionReason: string }>().decisionReason,
      "sale_amount_missing",
    );
    const missingSaleUsePhotos = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${missingSaleOverrideOrderId}/shipping-photo-override`,
      headers: { cookie },
      payload: {
        choice: "use_photos",
        expectedDecisionRevision: 1,
        idempotencyKey: randomUUID(),
        humanConfirmed: true,
      },
    });
    assert.equal(missingSaleUsePhotos.statusCode, 200, missingSaleUsePhotos.body);
    assert.equal(
      missingSaleUsePhotos.json<{ decisionReason: string }>().decisionReason,
      "manual_use",
    );
    await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
      await transaction`
        update sales_order set state = 'cancelled'
        where workspace_id = ${owner.workspaceId} and id = ${missingSaleOverrideOrderId}
      `;
    });

    const deterministicOverride = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/shipping-photo-override`,
      headers: { cookie },
      payload: {
        choice: "skip_photos",
        expectedDecisionRevision,
        idempotencyKey: randomUUID(),
        humanConfirmed: true,
      },
    });
    assert.equal(deterministicOverride.statusCode, 409, deterministicOverride.body);

    const ownerSaleBasisRows = await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
      return transaction<
        Array<{
          id: string;
          active_sale_event_ids: string[];
          active_sale_total_minor: number | null;
          source_set_sha256: string;
        }>
      >`
        select id, active_sale_event_ids,
               active_sale_total_minor::integer as active_sale_total_minor,
               source_set_sha256
        from shipping_sale_basis_snapshot
        where workspace_id = ${owner.workspaceId}
        order by captured_at, id
      `;
    });
    assert.ok(ownerSaleBasisRows.length > 0);
    for (const basis of ownerSaleBasisRows) {
      assert.deepEqual(
        basis.active_sale_event_ids,
        [...basis.active_sale_event_ids].sort(),
        "Sale basis event IDs must be normalized in UUID order",
      );
      assert.match(basis.source_set_sha256, /^[a-f0-9]{64}$/u);
    }
    const accountingSaleBasisCount = await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${accountingId}, true)`;
      return transaction<Array<{ count: number }>>`
        select count(*)::integer as count
        from shipping_sale_basis_snapshot
        where workspace_id = ${owner.workspaceId}
      `;
    });
    assert.equal(accountingSaleBasisCount[0]?.count, ownerSaleBasisRows.length);
    for (const hiddenIdentityId of [shippingId, managerId]) {
      const hiddenSaleBasisRows = await inventory.begin(async (transaction) => {
        await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
        await transaction`select set_config('app.identity_id', ${hiddenIdentityId}, true)`;
        return transaction<Array<{ id: string }>>`
          select id from shipping_sale_basis_snapshot
          where workspace_id = ${owner.workspaceId}
        `;
      });
      assert.equal(hiddenSaleBasisRows.length, 0);
    }
    const firstOwnerSaleBasisId = ownerSaleBasisRows[0]?.id;
    assert.ok(firstOwnerSaleBasisId);
    const basisAdmin = postgres(adminUrl, { max: 1 });
    try {
      await assert.rejects(
        () => basisAdmin`
          update shipping_sale_basis_snapshot
          set source_set_sha256 = ${"f".repeat(64)}
          where workspace_id = ${owner.workspaceId} and id = ${firstOwnerSaleBasisId}
        `,
        /shipping preflight history is append-only/u,
      );
    } finally {
      await basisAdmin.end({ timeout: 5 });
    }

    const existingSaleMutation = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/sale-amount`,
      headers: { cookie },
      payload: {
        saleAmountMinor: 5000,
        taxBasis: "tax_included",
        sourceMeaning: "既存売上がある注文への不正な後入力試験",
        occurredAt: new Date().toISOString(),
        idempotencyKey: randomUUID(),
        humanConfirmed: true,
      },
    });
    assert.equal(existingSaleMutation.statusCode, 409, existingSaleMutation.body);
    const saleCountAfterExistingSaleRejection = await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
      return transaction<Array<{ event_count: number }>>`
        select count(*)::integer as event_count
        from financial_event
        where workspace_id = ${owner.workspaceId} and order_id = ${orderId}
          and event_type = 'sale' and reverses_event_id is null
      `;
    });
    assert.equal(
      saleCountAfterExistingSaleRejection[0]?.event_count,
      1,
      "P13 late-sale entry must not add a second accounting sale event",
    );

    const assignedLocationPhotoId = randomUUID();
    const assignedLocationPhotoCollectionUrl = `/v1/workspaces/${owner.workspaceId}/locations/${acquisitionBinId}/photos`;
    const capturedAssignedLocationPhoto = await app.inject({
      method: "POST",
      url: `${assignedLocationPhotoCollectionUrl}?${locationPhotoQuery(assignedLocationPhotoId, randomUUID())}`,
      headers: { cookie, "content-type": "image/jpeg" },
      payload: locationPhotoBytes,
    });
    assert.equal(capturedAssignedLocationPhoto.statusCode, 201, capturedAssignedLocationPhoto.body);
    const approvedAssignedLocationPhoto = await app.inject({
      method: "POST",
      url: `${assignedLocationPhotoCollectionUrl}/${assignedLocationPhotoId}/approval`,
      headers: { cookie: managerCookie },
      payload: { reviewedAt: new Date().toISOString(), humanApproved: true },
    });
    assert.equal(approvedAssignedLocationPhoto.statusCode, 200, approvedAssignedLocationPhoto.body);
    const genericAssignedLocationPhotoContentUrl = approvedAssignedLocationPhoto.json<{
      contentUrl: string;
    }>().contentUrl;
    assert.ok(genericAssignedLocationPhotoContentUrl);

    const ownerTasksBeforeShippingAssignment = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/shipping-tasks`,
      headers: { cookie },
    });
    assert.equal(
      ownerTasksBeforeShippingAssignment.statusCode,
      200,
      ownerTasksBeforeShippingAssignment.body,
    );
    const ownerLocationTaskBeforeShippingAssignment = ownerTasksBeforeShippingAssignment
      .json<
        Array<{
          orderId: string;
          locationPhotoUrl: string | null;
          assignmentExpiresAt: string | null;
        }>
      >()
      .find((task) => task.orderId === orderId);
    assert.ok(ownerLocationTaskBeforeShippingAssignment?.locationPhotoUrl);
    assert.equal(ownerLocationTaskBeforeShippingAssignment.assignmentExpiresAt, null);
    const managementLocationPhotoUrl = new URL(
      ownerLocationTaskBeforeShippingAssignment.locationPhotoUrl,
      "http://local.test",
    );
    for (const [role, managementCookie] of [
      ["owner", cookie],
      ["inventory manager", managerCookie],
    ] as const) {
      const managementLocationPhoto = await app.inject({
        method: "GET",
        url: `${managementLocationPhotoUrl.pathname}${managementLocationPhotoUrl.search}`,
        headers: { cookie: managementCookie },
      });
      assert.equal(
        managementLocationPhoto.statusCode,
        200,
        `${role} must read the current order location derivative without a shipping assignment: ${managementLocationPhoto.body}`,
      );
      assert.equal(managementLocationPhoto.headers["cache-control"], "private, no-store");
      assert.equal(managementLocationPhoto.headers["x-content-type-options"], "nosniff");
      assert.equal(
        managementLocationPhoto.rawPayload.toString("utf8").includes("GPSLatitude"),
        false,
      );
    }
    const unassignedShippingLocationPhoto = await app.inject({
      method: "GET",
      url: `${managementLocationPhotoUrl.pathname}${managementLocationPhotoUrl.search}`,
      headers: { cookie: shippingCookie },
    });
    assert.equal(
      unassignedShippingLocationPhoto.statusCode,
      403,
      unassignedShippingLocationPhoto.body,
    );
    await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
      await transaction`
        insert into order_assignment (
          workspace_id, order_id, identity_id, starts_at, expires_at, assigned_by
        ) values (
          ${owner.workspaceId}, ${orderId}, ${shippingId},
          statement_timestamp() - interval '2 hours',
          statement_timestamp() - interval '1 hour', ${owner.identityId}
        )
      `;
    });
    const expiredShippingLocationPhoto = await app.inject({
      method: "GET",
      url: `${managementLocationPhotoUrl.pathname}${managementLocationPhotoUrl.search}`,
      headers: { cookie: shippingCookie },
    });
    assert.equal(expiredShippingLocationPhoto.statusCode, 403, expiredShippingLocationPhoto.body);
    const unsupportedRoleLocationPhoto = await app.inject({
      method: "GET",
      url: `${managementLocationPhotoUrl.pathname}${managementLocationPhotoUrl.search}`,
      headers: { cookie: workerCookie },
    });
    assert.equal(unsupportedRoleLocationPhoto.statusCode, 403, unsupportedRoleLocationPhoto.body);
    const foreignWorkspaceLocationPhoto = await app.inject({
      method: "GET",
      url: `${managementLocationPhotoUrl.pathname.replace(owner.workspaceId, otherWorkspaceId)}${managementLocationPhotoUrl.search}`,
      headers: { cookie },
    });
    assert.equal(foreignWorkspaceLocationPhoto.statusCode, 403, foreignWorkspaceLocationPhoto.body);

    const unassignedShippingPreflight = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/shipping-photo-preflight`,
      headers: { cookie: shippingCookie },
    });
    assert.equal(unassignedShippingPreflight.statusCode, 403, unassignedShippingPreflight.body);
    const shippingPolicyRead = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/shipping-photo-policy`,
      headers: { cookie: shippingCookie },
    });
    assert.equal(shippingPolicyRead.statusCode, 403, shippingPolicyRead.body);

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
    const tasksWithAssignedLocationPhoto = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/shipping-tasks`,
      headers: { cookie: shippingCookie },
    });
    assert.equal(
      tasksWithAssignedLocationPhoto.statusCode,
      200,
      tasksWithAssignedLocationPhoto.body,
    );
    const assignedLocationTask = tasksWithAssignedLocationPhoto
      .json<
        Array<{
          orderId: string;
          inventoryUnitId: string;
          locationPhotoUrl: string | null;
        }>
      >()
      .find((task) => task.orderId === orderId);
    assert.ok(assignedLocationTask?.locationPhotoUrl);
    const assignedLocationPhotoUrl = new URL(
      assignedLocationTask.locationPhotoUrl,
      "http://local.test",
    );
    assert.equal(
      assignedLocationPhotoUrl.pathname,
      `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/pick-location-photo/content`,
    );
    assert.equal(
      assignedLocationPhotoUrl.searchParams.get("inventoryUnitId"),
      acquiredItem.inventoryUnitId,
    );
    assert.match(
      assignedLocationPhotoUrl.searchParams.get("movementSequence") ?? "",
      /^(?:0|[1-9][0-9]*)$/u,
    );
    assert.equal(tasksWithAssignedLocationPhoto.body.includes(acquisitionBinId), false);
    assert.equal(tasksWithAssignedLocationPhoto.body.includes(assignedLocationPhotoId), false);
    assert.equal(tasksWithAssignedLocationPhoto.body.includes("location-display"), false);

    const assignedLocationPhotoContent = await app.inject({
      method: "GET",
      url: `${assignedLocationPhotoUrl.pathname}${assignedLocationPhotoUrl.search}`,
      headers: { cookie: shippingCookie },
    });
    assert.equal(assignedLocationPhotoContent.statusCode, 200, assignedLocationPhotoContent.body);
    assert.equal(assignedLocationPhotoContent.headers["cache-control"], "private, no-store");
    assert.equal(assignedLocationPhotoContent.headers.pragma, "no-cache");
    assert.equal(assignedLocationPhotoContent.headers["x-content-type-options"], "nosniff");
    assert.equal(
      assignedLocationPhotoContent.rawPayload.toString("utf8").includes("GPSLatitude"),
      false,
    );
    const otherShippingLocationPhoto = await app.inject({
      method: "GET",
      url: `${assignedLocationPhotoUrl.pathname}${assignedLocationPhotoUrl.search}`,
      headers: { cookie: otherShippingCookie },
    });
    assert.equal(otherShippingLocationPhoto.statusCode, 403, otherShippingLocationPhoto.body);

    const genericLocationPhotoAsShipping = await app.inject({
      method: "GET",
      url: genericAssignedLocationPhotoContentUrl,
      headers: { cookie: shippingCookie },
    });
    assert.equal(
      genericLocationPhotoAsShipping.statusCode,
      403,
      genericLocationPhotoAsShipping.body,
    );

    const wrongUnitUrl = new URL(assignedLocationPhotoUrl);
    wrongUnitUrl.searchParams.set("inventoryUnitId", unitOneId);
    const wrongUnitPhoto = await app.inject({
      method: "GET",
      url: `${wrongUnitUrl.pathname}${wrongUnitUrl.search}`,
      headers: { cookie: shippingCookie },
    });
    assert.equal(wrongUnitPhoto.statusCode, 403, wrongUnitPhoto.body);
    const wrongMovementUrl = new URL(assignedLocationPhotoUrl);
    wrongMovementUrl.searchParams.set(
      "movementSequence",
      String(Number(wrongMovementUrl.searchParams.get("movementSequence")) + 1),
    );
    const wrongMovementPhoto = await app.inject({
      method: "GET",
      url: `${wrongMovementUrl.pathname}${wrongMovementUrl.search}`,
      headers: { cookie: shippingCookie },
    });
    assert.equal(wrongMovementPhoto.statusCode, 403, wrongMovementPhoto.body);
    const wrongOrderUrl = new URL(assignedLocationPhotoUrl);
    wrongOrderUrl.pathname = wrongOrderUrl.pathname.replace(orderId, randomUUID());
    const wrongOrderPhoto = await app.inject({
      method: "GET",
      url: `${wrongOrderUrl.pathname}${wrongOrderUrl.search}`,
      headers: { cookie: shippingCookie },
    });
    assert.equal(wrongOrderPhoto.statusCode, 403, wrongOrderPhoto.body);
    const forbiddenLocationPhotoShape = wrongUnitPhoto.json<{ code: string; message: string }>();
    for (const response of [wrongMovementPhoto, wrongOrderPhoto]) {
      const body = response.json<{ code: string; message: string }>();
      assert.deepEqual(
        { code: body.code, message: body.message },
        {
          code: forbiddenLocationPhotoShape.code,
          message: forbiddenLocationPhotoShape.message,
        },
      );
    }
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
    const ownerPhotoAfterShippingRevoke = await app.inject({
      method: "GET",
      url: `${assignedLocationPhotoUrl.pathname}${assignedLocationPhotoUrl.search}`,
      headers: { cookie },
    });
    assert.equal(ownerPhotoAfterShippingRevoke.statusCode, 200, ownerPhotoAfterShippingRevoke.body);
    const assignedPhotoAfterRevoke = await app.inject({
      method: "GET",
      url: `${assignedLocationPhotoUrl.pathname}${assignedLocationPhotoUrl.search}`,
      headers: { cookie: shippingCookie },
    });
    assert.equal(assignedPhotoAfterRevoke.statusCode, 403, assignedPhotoAfterRevoke.body);
    assert.deepEqual(
      {
        code: assignedPhotoAfterRevoke.json<{ code: string }>().code,
        message: assignedPhotoAfterRevoke.json<{ message: string }>().message,
      },
      {
        code: forbiddenLocationPhotoShape.code,
        message: forbiddenLocationPhotoShape.message,
      },
    );
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
    await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
      await transaction`
        update order_allocation
        set active = false, released_at = statement_timestamp()
        where workspace_id = ${owner.workspaceId}
          and inventory_unit_id = ${unitOneId}
          and active
      `;
      const [releasedAllocation] = await transaction<Array<{ id: string }>>`
        insert into order_allocation (
          workspace_id, order_id, inventory_unit_id
        ) values (
          ${owner.workspaceId}, ${orderId}, ${unitOneId}
        )
        returning id
      `;
      assert.ok(releasedAllocation);
      await transaction`
        update order_allocation
        set active = false, released_at = statement_timestamp()
        where workspace_id = ${owner.workspaceId}
          and id = ${releasedAllocation.id}
      `;
    });
    const shippingTasks = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/shipping-tasks`,
      headers: { cookie: shippingCookie },
    });
    assert.equal(shippingTasks.statusCode, 200, shippingTasks.body);
    assert.deepEqual(
      shippingTasks
        .json<Array<{ orderId: string; inventoryUnitId: string; productTitle: string }>>()
        .map((task) => ({
          orderId: task.orderId,
          inventoryUnitId: task.inventoryUnitId,
          productTitle: task.productTitle,
        })),
      [
        {
          orderId,
          inventoryUnitId: acquiredItem.inventoryUnitId,
          productTitle: top01PilotFixture.title,
        },
      ],
      "Shipping tasks must exclude released allocations even when the same order has an active allocation",
    );

    const assignedShippingOptions = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/shipping-method-options`,
      headers: { cookie: shippingCookie },
    });
    assert.equal(assignedShippingOptions.statusCode, 200, assignedShippingOptions.body);
    const assignedShippingOption =
      assignedShippingOptions.json<
        Array<Record<string, unknown> & { methodId: string; feeMinor: number }>
      >()[0];
    assert.ok(assignedShippingOption);
    assert.equal(assignedShippingOption.methodId, shippingMethod.methodId);
    assert.equal(assignedShippingOption.feeMinor, 750);
    assert.deepEqual(
      Object.keys(assignedShippingOption).sort(),
      [
        "catalogRevisionId",
        "deliveryEstimate",
        "feeMinor",
        "methodId",
        "methodName",
        "officialCheckedOn",
        "salesChannelKey",
        "salesChannelName",
        "trackingAvailable",
      ],
      "Assigned shipping must receive only the operational method fields",
    );
    const shippingRegistrationRead = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/registration`,
      headers: { cookie: shippingCookie },
    });
    assert.equal(shippingRegistrationRead.statusCode, 403, shippingRegistrationRead.body);
    assert.equal(/buyer|購入者|5000|1500|profit|tax/iu.test(shippingRegistrationRead.body), false);
    const shippingCatalogRead = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/shipping-methods`,
      headers: { cookie: shippingCookie },
    });
    assert.equal(shippingCatalogRead.statusCode, 403, shippingCatalogRead.body);

    const shippingSelectionKey = randomUUID();
    const selectShippingMethod = () =>
      app.inject({
        method: "POST",
        url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/shipping-method-selections`,
        headers: { cookie: shippingCookie },
        payload: {
          methodId: shippingMethod.methodId,
          expectedSelectionRevision: null,
          idempotencyKey: shippingSelectionKey,
          humanConfirmed: true,
        },
      });
    const [selectedShippingMethod, concurrentShippingMethodReplay] = await Promise.all([
      selectShippingMethod(),
      selectShippingMethod(),
    ]);
    assert.equal(selectedShippingMethod.statusCode, 201, selectedShippingMethod.body);
    assert.equal(
      concurrentShippingMethodReplay.statusCode,
      201,
      concurrentShippingMethodReplay.body,
    );
    const shippingSelection = selectedShippingMethod.json<{
      selectionId: string;
      revision: number;
      method: { feeMinor: number; officialCheckedOn: string };
    }>();
    assert.equal(shippingSelection.revision, 1);
    assert.equal(shippingSelection.method.feeMinor, 750);
    assert.equal(
      concurrentShippingMethodReplay.json<{ selectionId: string }>().selectionId,
      shippingSelection.selectionId,
      "Concurrent exact retries must return one database selection",
    );
    const selectionAdmin = postgres(adminUrl, { max: 1 });
    try {
      const persistedSelections = await selectionAdmin<
        Array<{
          registration_revision_id: string;
          catalog_revision_id: string;
          selected_fee_minor: number;
          selected_by: string;
        }>
      >`
        select registration_revision_id, catalog_revision_id,
               selected_fee_minor::integer as selected_fee_minor, selected_by
        from order_shipping_method_selection
        where workspace_id = ${owner.workspaceId} and id = ${shippingSelection.selectionId}
      `;
      assert.deepEqual(
        Array.from(persistedSelections, (row) => ({ ...row })),
        [
          {
            registration_revision_id: registrationRevisionId,
            catalog_revision_id: shippingMethod.catalogRevisionId,
            selected_fee_minor: 750,
            selected_by: shippingId,
          },
        ],
        "The database must select and freeze the current registration, catalog revision and fee",
      );
    } finally {
      await selectionAdmin.end({ timeout: 5 });
    }
    await assert.rejects(
      () =>
        inventory.begin(async (transaction) => {
          await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
          await transaction`select set_config('app.identity_id', ${shippingId}, true)`;
          await transaction`
            select selected_by from order_shipping_method_selection
            where workspace_id = ${owner.workspaceId} and id = ${shippingSelection.selectionId}
          `;
        }),
      /permission denied/u,
      "Assigned shipping must not receive direct access to selection actor metadata",
    );
    const selectedShippingMethodReplay = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/shipping-method-selections`,
      headers: { cookie: shippingCookie },
      payload: {
        methodId: shippingMethod.methodId,
        expectedSelectionRevision: null,
        idempotencyKey: shippingSelectionKey,
        humanConfirmed: true,
      },
    });
    assert.equal(selectedShippingMethodReplay.statusCode, 201, selectedShippingMethodReplay.body);
    assert.equal(
      selectedShippingMethodReplay.json<{ selectionId: string }>().selectionId,
      shippingSelection.selectionId,
    );
    const selectionKeyConflict = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/shipping-method-selections`,
      headers: { cookie: shippingCookie },
      payload: {
        methodId: shippingMethod.methodId,
        expectedSelectionRevision: shippingSelection.revision,
        idempotencyKey: shippingSelectionKey,
        humanConfirmed: true,
      },
    });
    assert.equal(selectionKeyConflict.statusCode, 409, selectionKeyConflict.body);
    const updatedOrderRegistration = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/registration`,
      headers: { cookie },
      payload: {
        salesChannelKey: "mercari",
        salesChannelName: "メルカリ",
        channelTransactionId: null,
        buyerDisplayName: null,
        expectedRevision: initialRegistrationBody.revision,
        idempotencyKey: randomUUID(),
        humanConfirmed: true,
      },
    });
    assert.equal(updatedOrderRegistration.statusCode, 200, updatedOrderRegistration.body);
    assert.equal(updatedOrderRegistration.headers["cache-control"], "private, no-store");
    assert.equal(updatedOrderRegistration.headers.pragma, "no-cache");
    const updatedOrderRegistrationBody = updatedOrderRegistration.json<{
      revision: number;
      registrationRevisionId: string;
    }>();
    assert.equal(updatedOrderRegistrationBody.revision, 2);

    const staleSelectionReadiness = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/shipping-readiness`,
      headers: { cookie: shippingCookie },
    });
    assert.equal(staleSelectionReadiness.statusCode, 200, staleSelectionReadiness.body);
    const staleSelectionReadinessBody = staleSelectionReadiness.json<{
      registrationRevision: number | null;
      selectedMethod: { revision: number } | null;
      missingInformation: Array<"channel_transaction_id" | "sale_amount">;
      blockingIssues: string[];
    }>();
    assert.equal(staleSelectionReadinessBody.registrationRevision, 2);
    assert.equal(staleSelectionReadinessBody.selectedMethod?.revision, 1);
    assert.deepEqual(staleSelectionReadinessBody.blockingIssues, ["shipping_method"]);
    assert.ok(staleSelectionReadinessBody.registrationRevision);
    assert.ok(staleSelectionReadinessBody.selectedMethod);
    const staleSelectionConfirmation = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/shipping-readiness-confirmations`,
      headers: { cookie: shippingCookie },
      payload: {
        expectedRegistrationRevision: staleSelectionReadinessBody.registrationRevision,
        expectedSelectionRevision: staleSelectionReadinessBody.selectedMethod.revision,
        acknowledgedMissingInformation: staleSelectionReadinessBody.missingInformation,
        idempotencyKey: randomUUID(),
        humanConfirmed: true,
      },
    });
    assert.equal(staleSelectionConfirmation.statusCode, 409, staleSelectionConfirmation.body);

    const reselectedShippingMethod = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/shipping-method-selections`,
      headers: { cookie: shippingCookie },
      payload: {
        methodId: shippingMethod.methodId,
        expectedSelectionRevision: shippingSelection.revision,
        idempotencyKey: randomUUID(),
        humanConfirmed: true,
      },
    });
    assert.equal(reselectedShippingMethod.statusCode, 201, reselectedShippingMethod.body);
    const currentShippingSelection = reselectedShippingMethod.json<{
      selectionId: string;
      revision: number;
      method: { feeMinor: number };
    }>();
    assert.equal(currentShippingSelection.revision, 2);
    assert.equal(currentShippingSelection.method.feeMinor, 750);

    const prePackReadiness = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/shipping-readiness`,
      headers: { cookie: shippingCookie },
    });
    assert.equal(prePackReadiness.statusCode, 200, prePackReadiness.body);
    const prePackReadinessBody = prePackReadiness.json<{
      registrationRevision: number | null;
      channelTransactionIdStatus: string;
      saleAmountStatus: string;
      selectedMethod: { revision: number } | null;
      missingInformation: Array<"channel_transaction_id" | "sale_amount">;
      blockingIssues: string[];
      humanConfirmation: { state: string };
    }>();
    assert.deepEqual(
      {
        registrationRevision: prePackReadinessBody.registrationRevision,
        channelTransactionIdStatus: prePackReadinessBody.channelTransactionIdStatus,
        saleAmountStatus: prePackReadinessBody.saleAmountStatus,
        missingInformation: prePackReadinessBody.missingInformation,
        blockingIssues: prePackReadinessBody.blockingIssues,
        confirmationState: prePackReadinessBody.humanConfirmation.state,
      },
      {
        registrationRevision: updatedOrderRegistrationBody.revision,
        channelTransactionIdStatus: "missing",
        saleAmountStatus: "present",
        missingInformation: ["channel_transaction_id"],
        blockingIssues: [],
        confirmationState: "required",
      },
    );
    assert.ok(prePackReadinessBody.registrationRevision);
    assert.ok(prePackReadinessBody.selectedMethod);
    assert.equal(prePackReadinessBody.selectedMethod.revision, currentShippingSelection.revision);
    for (const forbidden of [
      "buyerDisplayName",
      "saleAmountMinor",
      "costAmountMinor",
      "contributionProfitMinor",
      "taxBasis",
      "changedBy",
      "selectedBy",
    ]) {
      assert.equal(forbidden in prePackReadiness.json<Record<string, unknown>>(), false);
    }
    const staleRegistrationRevisionConfirmation = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/shipping-readiness-confirmations`,
      headers: { cookie: shippingCookie },
      payload: {
        expectedRegistrationRevision: prePackReadinessBody.registrationRevision + 1,
        expectedSelectionRevision: prePackReadinessBody.selectedMethod.revision,
        acknowledgedMissingInformation: prePackReadinessBody.missingInformation,
        idempotencyKey: randomUUID(),
        humanConfirmed: true,
      },
    });
    assert.equal(
      staleRegistrationRevisionConfirmation.statusCode,
      409,
      "A shipping client must receive 409 when its readiness registration revision is stale",
    );
    const prematureReadinessConfirmation = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/shipping-readiness-confirmations`,
      headers: { cookie: shippingCookie },
      payload: {
        expectedRegistrationRevision: prePackReadinessBody.registrationRevision,
        expectedSelectionRevision: prePackReadinessBody.selectedMethod.revision,
        acknowledgedMissingInformation: prePackReadinessBody.missingInformation,
        idempotencyKey: randomUUID(),
        humanConfirmed: true,
      },
    });
    assert.equal(
      prematureReadinessConfirmation.statusCode,
      409,
      prematureReadinessConfirmation.body,
    );

    const assignedShippingPreflight = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/shipping-photo-preflight`,
      headers: { cookie: shippingCookie },
    });
    assert.equal(assignedShippingPreflight.statusCode, 200, assignedShippingPreflight.body);
    const assignedShippingBody = assignedShippingPreflight.json<Record<string, unknown>>();
    assert.equal(assignedShippingBody.state, "capture_required");
    assert.equal(assignedShippingBody.decisionReason, "threshold_met");
    assert.equal("saleAmountMinor" in assignedShippingBody, false);
    assert.equal("highValueThresholdMinor" in assignedShippingBody, false);
    assert.equal("storageKey" in assignedShippingBody, false);

    const uploadShippingPhoto = async (
      role: "product" | "packed_package",
      idempotencyKey: string,
    ) => {
      const query = new URLSearchParams({ role, idempotencyKey, humanConfirmed: "true" });
      return app.inject({
        method: "POST",
        url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/shipping-photos?${query.toString()}`,
        headers: { cookie: shippingCookie, "content-type": "image/jpeg" },
        payload: jpegWithGpsMetadata(),
      });
    };
    const productPhotoKey = randomUUID();
    const productPhoto = await uploadShippingPhoto("product", productPhotoKey);
    assert.equal(productPhoto.statusCode, 201, productPhoto.body);
    const productPhotoBody = productPhoto.json<{ assetId: string; role: string }>();
    assert.equal(productPhotoBody.role, "product");
    assert.equal("storageKey" in productPhoto.json<Record<string, unknown>>(), false);
    assert.equal("sha256" in productPhoto.json<Record<string, unknown>>(), false);
    const productPhotoReplay = await uploadShippingPhoto("product", productPhotoKey);
    assert.equal(productPhotoReplay.statusCode, 201, productPhotoReplay.body);
    assert.equal(
      productPhotoReplay.json<{ assetId: string }>().assetId,
      productPhotoBody.assetId,
      "The same photo payload and idempotency key must replay one immutable asset",
    );
    const packedPhoto = await uploadShippingPhoto("packed_package", randomUUID());
    assert.equal(packedPhoto.statusCode, 201, packedPhoto.body);
    const packedPhotoId = packedPhoto.json<{ assetId: string }>().assetId;
    const productContent = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/shipping-photos/${productPhotoBody.assetId}/content`,
      headers: { cookie: shippingCookie },
    });
    assert.equal(productContent.statusCode, 200, productContent.body);
    assert.equal(productContent.headers["cache-control"], "private, no-store");
    assert.equal(productContent.headers.pragma, "no-cache");
    assert.equal(productContent.headers["x-content-type-options"], "nosniff");
    assert.equal(productContent.rawPayload.toString("utf8").includes("GPSLatitude"), false);
    const crossWorkspacePhotoRead = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${otherWorkspaceId}/orders/${orderId}/shipping-photos/${productPhotoBody.assetId}/content`,
      headers: { cookie },
    });
    assert.equal(crossWorkspacePhotoRead.statusCode, 403, crossWorkspacePhotoRead.body);

    const incompleteConfirmation = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/shipping-photo-confirmations`,
      headers: { cookie: shippingCookie },
      payload: {
        assetIds: [productPhotoBody.assetId],
        idempotencyKey: randomUUID(),
        humanConfirmed: true,
      },
    });
    assert.equal(incompleteConfirmation.statusCode, 400, incompleteConfirmation.body);
    const firstPhotoConfirmation = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/shipping-photo-confirmations`,
      headers: { cookie: shippingCookie },
      payload: {
        assetIds: [productPhotoBody.assetId, packedPhotoId],
        idempotencyKey: randomUUID(),
        humanConfirmed: true,
      },
    });
    assert.equal(firstPhotoConfirmation.statusCode, 201, firstPhotoConfirmation.body);
    const extraProductPhoto = await uploadShippingPhoto("product", randomUUID());
    assert.equal(extraProductPhoto.statusCode, 201, extraProductPhoto.body);
    const extraProductPhotoId = extraProductPhoto.json<{ assetId: string }>().assetId;
    const staleConfirmationState = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/shipping-photo-preflight`,
      headers: { cookie: shippingCookie },
    });
    assert.equal(staleConfirmationState.statusCode, 200, staleConfirmationState.body);
    assert.equal(
      staleConfirmationState.json<{ state: string }>().state,
      "awaiting_confirmation",
      "Adding a photo must make an older exact-set confirmation stale",
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
      await addressAdmin.begin(async (transaction) => {
        await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
        await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
        await transaction`
          update address_access_lease set issued_at = now() - interval '2 seconds',
            expires_at = now() - interval '1 second'
          where workspace_id = ${owner.workspaceId} and id = ${firstLeaseId}
        `;
      });
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
    const pickConfirmationTime = Date.now();
    const inventoryMatchedAt = new Date(pickConfirmationTime - 60_000).toISOString();
    const locationMatchedAt = new Date(pickConfirmationTime - 20_000).toISOString();
    const pickConfirmedAt = new Date(pickConfirmationTime).toISOString();
    const pickPayload = {
      inventoryNumber: acquiredItem.inventoryNumber,
      locationCode: appendCodeCheckDigit("HOME-BIN-01"),
      inventoryLabelVersion: 1,
      locationLabelVersion: 1,
      addressLeaseId: activeLeaseId,
      inventoryScannedAt: inventoryMatchedAt,
      locationScannedAt: locationMatchedAt,
      confirmedAt: pickConfirmedAt,
      idempotencyKey: randomUUID(),
      humanConfirmed: true,
    } as const;
    for (const [actorLabel, actorCookie, actorId] of [
      ["owner", cookie, owner.identityId],
      ["inventory manager", managerCookie, managerId],
    ] as const) {
      const crossActorLeasePick = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/pick`,
        headers: { cookie: actorCookie },
        payload: { ...pickPayload, idempotencyKey: randomUUID() },
      });
      assert.equal(
        crossActorLeasePick.statusCode,
        409,
        `${actorLabel} must not reuse the shipping actor's address lease`,
      );
      await assert.rejects(
        () =>
          inventory.begin(async (transaction) => {
            await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
            await transaction`select set_config('app.identity_id', ${actorId}, true)`;
            await transaction`
              update sales_order set state = 'picking'
              where workspace_id = ${owner.workspaceId} and id = ${orderId}
            `;
          }),
        hasDatabaseCode("23514"),
        `${actorLabel} must have its own current lease even for a direct state transition`,
      );
    }
    const managerLease = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/address-leases`,
      headers: { cookie: managerCookie },
      payload: { purpose: "shipping_label", humanConfirmed: true },
    });
    assert.equal(managerLease.statusCode, 201, managerLease.body);
    const managerLeaseId = managerLease.json<{ leaseId: string }>().leaseId;
    const managerAddressView = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/address?leaseId=${managerLeaseId}`,
      headers: { cookie: managerCookie },
    });
    assert.equal(managerAddressView.statusCode, 200, managerAddressView.body);
    assert.equal(
      managerAddressView.json<{ shippingAddress: string }>().shippingAddress,
      fictionalAddress,
    );
    const ownerUsingManagerLease = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/address?leaseId=${managerLeaseId}`,
      headers: { cookie },
    });
    assert.equal(ownerUsingManagerLease.statusCode, 403, ownerUsingManagerLease.body);
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
    const [persistedPickTimes] = await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
      return transaction<
        Array<{
          inventory_scanned_at: string;
          location_scanned_at: string;
          confirmed_at: string;
        }>
      >`
        select inventory_scanned_at::text, location_scanned_at::text, confirmed_at::text
        from scan_session
        where workspace_id = ${owner.workspaceId}
          and inventory_unit_id = ${acquiredItem.inventoryUnitId}
          and operation = 'pick'
      `;
    });
    assert.deepEqual(
      {
        inventoryScannedAt: new Date(persistedPickTimes?.inventory_scanned_at ?? "").toISOString(),
        locationScannedAt: new Date(persistedPickTimes?.location_scanned_at ?? "").toISOString(),
        confirmedAt: new Date(persistedPickTimes?.confirmed_at ?? "").toISOString(),
      },
      {
        inventoryScannedAt: inventoryMatchedAt,
        locationScannedAt: locationMatchedAt,
        confirmedAt: pickConfirmedAt,
      },
      "Pick must preserve the independently captured match times instead of synthesizing submit-time scans",
    );
    const pickedReplay = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/pick`,
      headers: { cookie: shippingCookie },
      payload: pickPayload,
    });
    assert.deepEqual(pickedReplay.json(), picked.json());

    const confirmVersusAdd = await Promise.all([
      app.inject({
        method: "POST",
        url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/shipping-photo-confirmations`,
        headers: { cookie: shippingCookie },
        payload: {
          assetIds: [productPhotoBody.assetId, packedPhotoId, extraProductPhotoId],
          idempotencyKey: randomUUID(),
          humanConfirmed: true,
        },
      }),
      uploadShippingPhoto("packed_package", randomUUID()),
    ]);
    assert.equal(confirmVersusAdd[1]?.statusCode, 201, confirmVersusAdd[1]?.body);
    assert.equal(
      [201, 409].includes(confirmVersusAdd[0]?.statusCode ?? 0),
      true,
      confirmVersusAdd[0]?.body,
    );
    const awaitingExactConfirmation = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/shipping-photo-preflight`,
      headers: { cookie: shippingCookie },
    });
    assert.equal(
      awaitingExactConfirmation.json<{ state: string }>().state,
      "awaiting_confirmation",
      "A concurrent photo addition must leave no stale confirmation valid",
    );
    const packBeforePhotoConfirmation = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/pack`,
      headers: { cookie: shippingCookie },
      payload: {
        addressLeaseId: activeLeaseId,
        idempotencyKey: randomUUID(),
        humanConfirmed: true,
      },
    });
    assert.equal(packBeforePhotoConfirmation.statusCode, 409, packBeforePhotoConfirmation.body);
    await assert.rejects(
      () =>
        inventory.begin(async (transaction) => {
          await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
          await transaction`select set_config('app.identity_id', ${shippingId}, true)`;
          await transaction`
            insert into packing_evidence (workspace_id, order_id)
            values (${owner.workspaceId}, ${orderId})
          `;
        }),
      hasDatabaseCode("23514"),
      "Direct SQL must not create packing confirmation before the exact photo set is confirmed",
    );
    const currentPhotoState = awaitingExactConfirmation.json<{
      assets: Array<{ assetId: string }>;
    }>();
    const finalPhotoConfirmation = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/shipping-photo-confirmations`,
      headers: { cookie: shippingCookie },
      payload: {
        assetIds: currentPhotoState.assets.map((asset) => asset.assetId),
        idempotencyKey: randomUUID(),
        humanConfirmed: true,
      },
    });
    assert.equal(finalPhotoConfirmation.statusCode, 201, finalPhotoConfirmation.body);
    const confirmedPhotoState = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/shipping-photo-preflight`,
      headers: { cookie: shippingCookie },
    });
    assert.equal(confirmedPhotoState.json<{ state: string }>().state, "confirmed");

    const packKey = randomUUID();
    const packed = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/pack`,
      headers: { cookie: shippingCookie },
      payload: {
        addressLeaseId: activeLeaseId,
        idempotencyKey: packKey,
        humanConfirmed: true,
      },
    });
    assert.equal(packed.statusCode, 200, packed.body);
    assert.equal(packed.json<{ inventoryStatus: string }>().inventoryStatus, "packed");
    const packingEvidence = await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${shippingId}, true)`;
      return transaction<
        Array<{
          id: string;
          evidence_reference_id: string;
          confirmed_by: string;
          server_confirmed: boolean;
        }>
      >`
        select id, evidence_reference_id, confirmed_by, server_confirmed
        from packing_evidence
        where workspace_id = ${owner.workspaceId} and order_id = ${orderId}
      `;
    });
    assert.deepEqual(
      Array.from(packingEvidence, (row) => ({ ...row })),
      [
        {
          id: packingEvidence[0]?.id,
          evidence_reference_id: packingEvidence[0]?.id,
          confirmed_by: shippingId,
          server_confirmed: true,
        },
      ],
      "Packing evidence ID, actor and time authority must be server-side",
    );
    const readyToConfirmReadiness = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/shipping-readiness`,
      headers: { cookie: shippingCookie },
    });
    assert.equal(readyToConfirmReadiness.statusCode, 200, readyToConfirmReadiness.body);
    const readyToConfirmReadinessBody = readyToConfirmReadiness.json<{
      registrationRevision: number | null;
      selectedMethod: { revision: number } | null;
      missingInformation: Array<"channel_transaction_id" | "sale_amount">;
    }>();
    assert.ok(readyToConfirmReadinessBody.registrationRevision);
    assert.ok(readyToConfirmReadinessBody.selectedMethod);
    const readinessConfirmationKey = randomUUID();
    const readinessConfirmationPayload = {
      expectedRegistrationRevision: readyToConfirmReadinessBody.registrationRevision,
      expectedSelectionRevision: readyToConfirmReadinessBody.selectedMethod.revision,
      acknowledgedMissingInformation: readyToConfirmReadinessBody.missingInformation,
      idempotencyKey: readinessConfirmationKey,
      humanConfirmed: true,
    };
    const confirmedShippingReadiness = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/shipping-readiness-confirmations`,
      headers: { cookie: shippingCookie },
      payload: readinessConfirmationPayload,
    });
    assert.equal(confirmedShippingReadiness.statusCode, 201, confirmedShippingReadiness.body);
    const readinessConfirmation = confirmedShippingReadiness.json<{
      humanConfirmation: { state: string; confirmationId: string; confirmedAt: string };
    }>().humanConfirmation;
    assert.equal(readinessConfirmation.state, "confirmed");
    assert.ok(readinessConfirmation.confirmationId);
    assert.ok(readinessConfirmation.confirmedAt);
    const confirmedShippingReadinessReplay = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/shipping-readiness-confirmations`,
      headers: { cookie: shippingCookie },
      payload: readinessConfirmationPayload,
    });
    assert.equal(
      confirmedShippingReadinessReplay.statusCode,
      201,
      confirmedShippingReadinessReplay.body,
    );
    assert.deepEqual(
      confirmedShippingReadinessReplay.json<{
        humanConfirmation: { state: string; confirmationId: string; confirmedAt: string };
      }>().humanConfirmation,
      {
        state: "confirmed",
        confirmationId: readinessConfirmation.confirmationId,
        confirmedAt: readinessConfirmation.confirmedAt,
      },
    );
    const secondReadinessConfirmation = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/shipping-readiness-confirmations`,
      headers: { cookie: shippingCookie },
      payload: { ...readinessConfirmationPayload, idempotencyKey: randomUUID() },
    });
    assert.equal(secondReadinessConfirmation.statusCode, 201, secondReadinessConfirmation.body);
    const secondReadinessConfirmationBody = secondReadinessConfirmation.json<{
      humanConfirmation: { confirmationId: string; confirmedAt: string };
    }>().humanConfirmation;
    assert.notEqual(
      secondReadinessConfirmationBody.confirmationId,
      readinessConfirmation.confirmationId,
    );
    const oldReadinessReplayAfterNewerConfirmation = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/shipping-readiness-confirmations`,
      headers: { cookie: shippingCookie },
      payload: readinessConfirmationPayload,
    });
    assert.equal(
      oldReadinessReplayAfterNewerConfirmation.statusCode,
      201,
      oldReadinessReplayAfterNewerConfirmation.body,
    );
    assert.deepEqual(
      oldReadinessReplayAfterNewerConfirmation.json<{
        humanConfirmation: { state: string; confirmationId: string; confirmedAt: string };
      }>().humanConfirmation,
      {
        state: "confirmed",
        confirmationId: readinessConfirmation.confirmationId,
        confirmedAt: readinessConfirmation.confirmedAt,
      },
      "An old idempotency key must replay its original confirmation after a newer confirmation",
    );
    await assert.rejects(
      () =>
        inventory.begin(async (transaction) => {
          await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
          await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
          await transaction`
            update order_registration_revision set sales_channel_name = '改変不可'
            where workspace_id = ${owner.workspaceId} and id = ${registrationRevisionId}
          `;
        }),
      /append-only|permission denied/u,
      "Order registration history must be append-only at the database boundary",
    );
    await assert.rejects(
      () =>
        inventory.begin(async (transaction) => {
          await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
          await transaction`select set_config('app.identity_id', ${shippingId}, true)`;
          await transaction`
            update sales_order set state = 'shipped'
            where workspace_id = ${owner.workspaceId} and id = ${orderId}
          `;
        }),
      hasDatabaseCode("23514"),
      "Direct SQL must not ship without a separate shipment human confirmation",
    );
    await assert.rejects(
      () =>
        inventory.begin(async (transaction) => {
          await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
          await transaction`select set_config('app.identity_id', ${shippingId}, true)`;
          await transaction`
            insert into financial_event (
              workspace_id, sku_id, order_id, event_type, amount_minor, currency,
              tax_basis, bearer, source, source_meaning, rounding_rule_version,
              source_already_net, occurred_at
            ) values (
              ${owner.workspaceId}, ${acquiredItem.skuId}, ${orderId}, 'shipping', 750, 'JPY',
              'tax_included', 'seller', 'manual', '人が選択した配送方法の送料', 'jpy-v1', false,
              statement_timestamp()
            )
          `;
        }),
      hasDatabaseCode("23514"),
      "Direct SQL must not pre-create even a canonical-looking registered shipping fact",
    );
    const shippingFactsAfterMismatchRollback = await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
      return transaction<Array<{ event_count: number }>>`
        select count(*)::integer as event_count from financial_event
        where workspace_id = ${owner.workspaceId} and order_id = ${orderId}
          and event_type = 'shipping'
      `;
    });
    assert.equal(shippingFactsAfterMismatchRollback[0]?.event_count, 0);
    const missingP14ShipmentEvidence = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/ship`,
      headers: { cookie: shippingCookie },
      payload: {
        addressLeaseId: activeLeaseId,
        idempotencyKey: randomUUID(),
        humanConfirmed: true,
      },
    });
    assert.equal(missingP14ShipmentEvidence.statusCode, 409, missingP14ShipmentEvidence.body);
    const shipKey = randomUUID();
    const shippedAt = new Date().toISOString();
    const shipped = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/ship`,
      headers: { cookie: shippingCookie },
      payload: {
        addressLeaseId: activeLeaseId,
        shippingMethodSelectionId: currentShippingSelection.selectionId,
        readinessConfirmationId: readinessConfirmation.confirmationId,
        shippedAt,
        idempotencyKey: shipKey,
        humanConfirmed: true,
      },
    });
    assert.equal(shipped.statusCode, 200, shipped.body);
    assert.equal(shipped.json<{ inventoryStatus: string }>().inventoryStatus, "shipped");
    const readinessReplayAfterShipment = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/shipping-readiness-confirmations`,
      headers: { cookie: shippingCookie },
      payload: readinessConfirmationPayload,
    });
    assert.equal(readinessReplayAfterShipment.statusCode, 201, readinessReplayAfterShipment.body);
    assert.deepEqual(
      readinessReplayAfterShipment.json<{
        humanConfirmation: { state: string; confirmationId: string; confirmedAt: string };
      }>().humanConfirmation,
      {
        state: "confirmed",
        confirmationId: readinessConfirmation.confirmationId,
        confirmedAt: readinessConfirmation.confirmedAt,
      },
      "An exact committed readiness retry must replay after the order state advances",
    );
    const shippedSaleMutation = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/sale-amount`,
      headers: { cookie },
      payload: {
        saleAmountMinor: 6000,
        taxBasis: "tax_included",
        sourceMeaning: "発送後の不正な販売額差し替え試験",
        occurredAt: new Date().toISOString(),
        idempotencyKey: randomUUID(),
        humanConfirmed: true,
      },
    });
    assert.equal(shippedSaleMutation.statusCode, 409, shippedSaleMutation.body);
    const saleEventsAfterRejectedMutation = await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
      return transaction<Array<{ event_count: number }>>`
        select count(*)::integer as event_count from financial_event
        where workspace_id = ${owner.workspaceId} and order_id = ${orderId}
          and event_type = 'sale' and reverses_event_id is null
      `;
    });
    assert.equal(saleEventsAfterRejectedMutation[0]?.event_count, 1);
    const humanShippingRecords = await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${shippingId}, true)`;
      return transaction<
        Array<{
          confirmed_by: string;
          idempotency_key: string;
          shipping_method_selection_id: string;
          readiness_confirmation_id: string;
          shipping_fee_minor: number;
          shipped_at: string;
          shipping_financial_event_id: string;
        }>
      >`
        select confirmed_by, idempotency_key::text as idempotency_key,
               shipping_method_selection_id, readiness_confirmation_id,
               shipping_fee_minor::integer as shipping_fee_minor, shipped_at::text,
               shipping_financial_event_id
        from shipment_human_confirmation
        where workspace_id = ${owner.workspaceId} and order_id = ${orderId}
      `;
    });
    assert.equal(humanShippingRecords.length, 1);
    assert.deepEqual(
      {
        confirmedBy: humanShippingRecords[0]?.confirmed_by,
        idempotencyKey: humanShippingRecords[0]?.idempotency_key,
        selectionId: humanShippingRecords[0]?.shipping_method_selection_id,
        readinessConfirmationId: humanShippingRecords[0]?.readiness_confirmation_id,
        shippingFeeMinor: humanShippingRecords[0]?.shipping_fee_minor,
        shippedAt: new Date(humanShippingRecords[0]?.shipped_at ?? "").toISOString(),
        shippingFinancialEventId: humanShippingRecords[0]?.shipping_financial_event_id,
      },
      {
        confirmedBy: shippingId,
        idempotencyKey: shipKey,
        selectionId: currentShippingSelection.selectionId,
        readinessConfirmationId: readinessConfirmation.confirmationId,
        shippingFeeMinor: 750,
        shippedAt,
        shippingFinancialEventId: humanShippingRecords[0]?.shipping_financial_event_id,
      },
    );
    assert.ok(humanShippingRecords[0]?.shipping_financial_event_id);
    const shippingFinancialFacts = await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
      return transaction<
        Array<{
          id: string;
          amount_minor: number;
          sku_id: string;
          tax_basis: string;
          bearer: string;
          source: string;
          source_meaning: string;
          rounding_rule_version: string;
          source_already_net: boolean;
          reverses_event_id: string | null;
          occurred_at: string;
        }>
      >`
        select id, amount_minor::integer as amount_minor, sku_id, tax_basis,
               bearer, source, source_meaning, rounding_rule_version,
               source_already_net, reverses_event_id, occurred_at::text
        from financial_event
        where workspace_id = ${owner.workspaceId} and order_id = ${orderId}
          and event_type = 'shipping'
      `;
    });
    assert.deepEqual(
      Array.from(shippingFinancialFacts, (fact) => ({
        ...fact,
        occurred_at: new Date(fact.occurred_at).toISOString(),
      })),
      [
        {
          id: humanShippingRecords[0]?.shipping_financial_event_id,
          amount_minor: 750,
          sku_id: acquiredItem.skuId,
          tax_basis: "tax_included",
          bearer: "seller",
          source: "manual",
          source_meaning: "人が選択した配送方法の送料",
          rounding_rule_version: "jpy-v1",
          source_already_net: false,
          reverses_event_id: null,
          occurred_at: shippedAt,
        },
      ],
      "Shipment confirmation must atomically persist exactly one selected-fee financial fact",
    );
    const [registeredFinancialCountsAfterShipping] = await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
      return transaction<
        Array<{
          sale_count: number;
          cost_count: number;
          fee_count: number;
          shipping_count: number;
          packaging_count: number;
        }>
      >`
          select
            count(*) filter (where event_type = 'sale')::integer as sale_count,
            count(*) filter (where event_type = 'cost')::integer as cost_count,
            count(*) filter (where event_type = 'fee')::integer as fee_count,
            count(*) filter (where event_type = 'shipping')::integer as shipping_count,
            count(*) filter (where event_type = 'packaging')::integer as packaging_count
          from financial_event
          where workspace_id = ${owner.workspaceId} and order_id = ${orderId}
            and reverses_event_id is null
        `;
    });
    assert.deepEqual(
      { ...registeredFinancialCountsAfterShipping },
      { sale_count: 1, cost_count: 1, fee_count: 0, shipping_count: 1, packaging_count: 0 },
      "Shipment must preserve missing registered-order fee and packaging facts as zero rows",
    );

    const anonymousSkuId = randomUUID();
    const anonymousUnitId = randomUUID();
    const anonymousLocationId = randomUUID();
    const anonymousUnitLabelId = randomUUID();
    const anonymousLocationLabelId = randomUUID();
    const anonymousInventoryNumber = appendCodeCheckDigit("INV-990001");
    const anonymousLocationCode = appendCodeCheckDigit("ANON-BIN-01");
    const legacyNumericSkuId = randomUUID();
    const legacyNumericUnitId = randomUUID();
    const legacyNumericLocationId = randomUUID();
    const legacyNumericInventoryNumber = appendCodeCheckDigit("INV-990002");
    const legacyNumericLocationCode = appendCodeCheckDigit("LEGACY-BIN-01");
    const anonymousFixtureAdmin = postgres(adminUrl, { max: 1 });
    try {
      await anonymousFixtureAdmin.begin(async (transaction) => {
        await transaction`set local session_replication_role = replica`;
        await transaction`
          insert into product_sku (id, workspace_id, sku_code, title, category)
          values (
            ${anonymousSkuId}, ${owner.workspaceId}, 'SKU-P14-ANONYMOUS',
            '住所を保存しない架空商品', 'トップス'
          )
        `;
        await transaction`
          insert into p0_workflow (workspace_id, sku_id, state, last_action, version)
          values (
            ${owner.workspaceId}, ${anonymousSkuId}, 'listing_confirmed',
            'confirm_listing', 4
          )
        `;
        await transaction`
          insert into location_node (
            id, workspace_id, parent_id, code, name, depth, can_store_inventory,
            single_item_only, allow_mixed_sku, max_units
          ) values (
            ${anonymousLocationId}, ${owner.workspaceId}, null, ${anonymousLocationCode},
            '匿名注文用の架空棚', 0, true, true, false, 1
          )
        `;
        await transaction`
          insert into inventory_unit (
            id, workspace_id, sku_id, inventory_number, status, location_id
          ) values (
            ${anonymousUnitId}, ${owner.workspaceId}, ${anonymousSkuId},
            ${anonymousInventoryNumber}, 'available', ${anonymousLocationId}
          )
        `;
        await transaction`
          insert into inventory_label (
            id, workspace_id, target_type, target_id, label_kind, version,
            token_hash, short_code, issued_by
          ) values
            (
              ${anonymousUnitLabelId}, ${owner.workspaceId}, 'inventory_unit',
              ${anonymousUnitId}, 'qr', 1, ${hashFixture("p14-anonymous-unit")},
              ${anonymousInventoryNumber}, ${owner.identityId}
            ),
            (
              ${anonymousLocationLabelId}, ${owner.workspaceId}, 'location',
              ${anonymousLocationId}, 'qr', 1, ${hashFixture("p14-anonymous-location")},
              ${anonymousLocationCode}, ${owner.identityId}
            )
        `;
        await transaction`
          insert into product_sku (id, workspace_id, sku_code, title, category)
          values (
            ${legacyNumericSkuId}, ${owner.workspaceId}, 'SKU-P14-LEGACY-NUMERIC',
            '従来数値注文用の架空商品', 'トップス'
          )
        `;
        await transaction`
          insert into p0_workflow (workspace_id, sku_id, state, last_action, version)
          values (
            ${owner.workspaceId}, ${legacyNumericSkuId}, 'listing_confirmed',
            'confirm_listing', 4
          )
        `;
        await transaction`
          insert into location_node (
            id, workspace_id, parent_id, code, name, depth, can_store_inventory,
            single_item_only, allow_mixed_sku, max_units
          ) values (
            ${legacyNumericLocationId}, ${owner.workspaceId}, null,
            ${legacyNumericLocationCode}, '従来注文用の架空棚', 0, true, true, false, 1
          )
        `;
        await transaction`
          insert into inventory_unit (
            id, workspace_id, sku_id, inventory_number, status, location_id
          ) values (
            ${legacyNumericUnitId}, ${owner.workspaceId}, ${legacyNumericSkuId},
            ${legacyNumericInventoryNumber}, 'available', ${legacyNumericLocationId}
          )
        `;
      });
    } finally {
      await anonymousFixtureAdmin.end({ timeout: 5 });
    }

    const legacyNumericCreatePayload = {
      orderNumber: "ORDER-P14-LEGACY-1",
      skuId: legacyNumericSkuId,
      inventoryUnitId: legacyNumericUnitId,
      saleAmountMinor: 4_000,
      costAmountMinor: 1_300,
      sellingFeeMinor: 400,
      shippingCostMinor: 700,
      packagingCostMinor: 80,
      taxBasis: "tax_included",
      sourceMeaning: "従来画面で本人が明示入力した架空取引事実",
      occurredAt: new Date().toISOString(),
      shippingAddress: "〒100-0000 架空県従来市1-1",
      idempotencyKey: randomUUID(),
      humanConfirmed: true,
    } as const;
    const legacyMissingFee = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders`,
      headers: { cookie },
      payload: {
        ...legacyNumericCreatePayload,
        sellingFeeMinor: null,
        idempotencyKey: randomUUID(),
      },
    });
    assert.equal(legacyMissingFee.statusCode, 400, legacyMissingFee.body);
    const legacyNumericCreated = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders`,
      headers: { cookie },
      payload: legacyNumericCreatePayload,
    });
    assert.equal(legacyNumericCreated.statusCode, 201, legacyNumericCreated.body);
    const legacyNumericOrderId = legacyNumericCreated.json<{ orderId: string }>().orderId;
    const legacyNumericFacts = await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
      return transaction<Array<{ event_type: string; amount_minor: number }>>`
        select event_type, amount_minor::integer as amount_minor
        from financial_event
        where workspace_id = ${owner.workspaceId} and order_id = ${legacyNumericOrderId}
        order by event_type
      `;
    });
    assert.deepEqual(
      Array.from(legacyNumericFacts, (row) => ({ ...row })),
      [
        { event_type: "cost", amount_minor: 1_300 },
        { event_type: "fee", amount_minor: 400 },
        { event_type: "packaging", amount_minor: 80 },
        { event_type: "sale", amount_minor: 4_000 },
        { event_type: "shipping", amount_minor: 700 },
      ],
      "Legacy client-numbered creation must preserve every explicitly entered numeric fact",
    );

    const anonymousCreateKey = randomUUID();
    const anonymousCreatePayload = {
      salesChannelKey: "mercari",
      salesChannelName: "メルカリ",
      channelTransactionId: null,
      buyerDisplayName: null,
      skuId: anonymousSkuId,
      inventoryUnitId: anonymousUnitId,
      saleAmountMinor: null,
      costAmountMinor: 1200,
      sellingFeeMinor: null,
      shippingCostMinor: null,
      packagingCostMinor: null,
      taxBasis: "unknown",
      sourceMeaning: "住所・取引ID・販売額なしを人が確認した架空注文",
      occurredAt: new Date().toISOString(),
      addressMode: "anonymous",
      shippingAddress: null,
      idempotencyKey: anonymousCreateKey,
      humanConfirmed: true,
    } as const;
    const shippingCannotCreateOrder = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders`,
      headers: { cookie: shippingCookie },
      payload: anonymousCreatePayload,
    });
    assert.equal(shippingCannotCreateOrder.statusCode, 403, shippingCannotCreateOrder.body);
    const anonymousCreated = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders`,
      headers: { cookie },
      payload: anonymousCreatePayload,
    });
    assert.equal(anonymousCreated.statusCode, 201, anonymousCreated.body);
    const anonymousOrderId = anonymousCreated.json<{ orderId: string }>().orderId;
    const anonymousCreateReplay = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders`,
      headers: { cookie },
      payload: anonymousCreatePayload,
    });
    assert.equal(anonymousCreateReplay.statusCode, 201, anonymousCreateReplay.body);
    assert.equal(anonymousCreateReplay.json<{ orderId: string }>().orderId, anonymousOrderId);
    const anonymousStorageAdmin = postgres(adminUrl, { max: 1 });
    try {
      const [anonymousStorage] = await anonymousStorageAdmin<
        [{ address_mode: string; private_address_count: number; lease_count: number }]
      >`
        select coalesce(orders.address_mode, 'stored') as address_mode,
               (select count(*)::integer from order_private_address address_row
                where address_row.workspace_id = orders.workspace_id
                  and address_row.order_id = orders.id) as private_address_count,
               (select count(*)::integer from address_access_lease lease
                where lease.workspace_id = orders.workspace_id
                  and lease.order_id = orders.id) as lease_count
        from sales_order orders
        where orders.workspace_id = ${owner.workspaceId} and orders.id = ${anonymousOrderId}
      `;
      assert.deepEqual(
        { ...anonymousStorage },
        { address_mode: "anonymous", private_address_count: 0, lease_count: 0 },
        "Anonymous POST must commit no encrypted-address or lease row",
      );
    } finally {
      await anonymousStorageAdmin.end({ timeout: 5 });
    }
    const anonymousOwnerLease = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${anonymousOrderId}/address-leases`,
      headers: { cookie },
      payload: { purpose: "shipping_label", humanConfirmed: true },
    });
    assert.equal(anonymousOwnerLease.statusCode, 409, anonymousOwnerLease.body);
    const anonymousAddressReveal = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${anonymousOrderId}/address?leaseId=${randomUUID()}`,
      headers: { cookie },
    });
    assert.equal(anonymousAddressReveal.statusCode, 403, anonymousAddressReveal.body);
    await assert.rejects(
      () =>
        inventory.begin(async (transaction) => {
          await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
          await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
          await transaction`
            insert into order_private_address (
              workspace_id, order_id, ciphertext, nonce, auth_tag, key_version, created_by
            ) values (
              ${owner.workspaceId}, ${anonymousOrderId}, decode('01', 'hex'),
              decode(repeat('00', 12), 'hex'), decode(repeat('00', 16), 'hex'),
              'forbidden-test-v1', ${owner.identityId}
            )
          `;
        }),
      /private addresses are allowed only for stored-address orders|row-level security/u,
      "Direct SQL must not add a private address to an anonymous order",
    );

    const anonymousAssignment = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${anonymousOrderId}/assignment`,
      headers: { cookie },
      payload: {
        assigneeEmail: "shipping@example.test",
        startsAt: new Date(Date.now() - 60_000).toISOString(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        humanConfirmed: true,
      },
    });
    assert.equal(
      anonymousAssignment.statusCode,
      201,
      "Anonymous orders must remain assignable to shipping",
    );
    const anonymousShippingLease = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${anonymousOrderId}/address-leases`,
      headers: { cookie: shippingCookie },
      payload: { purpose: "shipping_label", humanConfirmed: true },
    });
    assert.equal(anonymousShippingLease.statusCode, 409, anonymousShippingLease.body);

    const anonymousPhotoDecision = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${anonymousOrderId}/shipping-photo-preflight`,
      headers: { cookie: shippingCookie },
      payload: {
        expectedDecisionRevision: null,
        idempotencyKey: randomUUID(),
        humanConfirmed: true,
      },
    });
    assert.equal(anonymousPhotoDecision.statusCode, 200, anonymousPhotoDecision.body);
    const anonymousPhotoDecisionBody = anonymousPhotoDecision.json<{
      decisionRevision: number;
      state: string;
      decisionReason: string;
      saleAmountStatus: string;
    }>();
    assert.deepEqual(
      {
        state: anonymousPhotoDecisionBody.state,
        reason: anonymousPhotoDecisionBody.decisionReason,
        sale: anonymousPhotoDecisionBody.saleAmountStatus,
      },
      { state: "choice_required", reason: "sale_amount_missing", sale: "missing" },
    );
    const anonymousPhotoOverride = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${anonymousOrderId}/shipping-photo-override`,
      headers: { cookie: shippingCookie },
      payload: {
        choice: "skip_photos",
        expectedDecisionRevision: anonymousPhotoDecisionBody.decisionRevision,
        idempotencyKey: randomUUID(),
        humanConfirmed: true,
      },
    });
    assert.equal(anonymousPhotoOverride.statusCode, 200, anonymousPhotoOverride.body);

    const anonymousScanBase = Date.now() - 5_000;
    const anonymousPicked = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${anonymousOrderId}/pick`,
      headers: { cookie: shippingCookie },
      payload: {
        inventoryNumber: anonymousInventoryNumber,
        locationCode: anonymousLocationCode,
        inventoryLabelVersion: 1,
        locationLabelVersion: 1,
        addressLeaseId: null,
        inventoryScannedAt: new Date(anonymousScanBase).toISOString(),
        locationScannedAt: new Date(anonymousScanBase + 1).toISOString(),
        confirmedAt: new Date(anonymousScanBase + 2).toISOString(),
        idempotencyKey: randomUUID(),
        humanConfirmed: true,
      },
    });
    assert.equal(anonymousPicked.statusCode, 200, anonymousPicked.body);
    assert.equal(anonymousPicked.json<{ inventoryStatus: string }>().inventoryStatus, "picked");
    const anonymousPacked = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${anonymousOrderId}/pack`,
      headers: { cookie: shippingCookie },
      payload: {
        addressLeaseId: null,
        idempotencyKey: randomUUID(),
        humanConfirmed: true,
      },
    });
    assert.equal(anonymousPacked.statusCode, 200, anonymousPacked.body);
    assert.equal(anonymousPacked.json<{ inventoryStatus: string }>().inventoryStatus, "packed");

    const anonymousShippingSelection = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${anonymousOrderId}/shipping-method-selections`,
      headers: { cookie: shippingCookie },
      payload: {
        methodId: shippingMethod.methodId,
        expectedSelectionRevision: null,
        idempotencyKey: randomUUID(),
        humanConfirmed: true,
      },
    });
    assert.equal(anonymousShippingSelection.statusCode, 201, anonymousShippingSelection.body);
    const anonymousSelection = anonymousShippingSelection.json<{
      selectionId: string;
      revision: number;
    }>();
    const anonymousReadiness = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${anonymousOrderId}/shipping-readiness`,
      headers: { cookie: shippingCookie },
    });
    assert.equal(anonymousReadiness.statusCode, 200, anonymousReadiness.body);
    const anonymousReadinessBody = anonymousReadiness.json<{
      registrationRevision: number | null;
      selectedMethod: { revision: number } | null;
      missingInformation: Array<"channel_transaction_id" | "sale_amount">;
      blockingIssues: string[];
    }>();
    assert.deepEqual(anonymousReadinessBody.missingInformation, [
      "channel_transaction_id",
      "sale_amount",
    ]);
    assert.deepEqual(anonymousReadinessBody.blockingIssues, []);
    assert.ok(anonymousReadinessBody.registrationRevision);
    assert.equal(anonymousReadinessBody.selectedMethod?.revision, anonymousSelection.revision);
    const anonymousReadinessConfirmation = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${anonymousOrderId}/shipping-readiness-confirmations`,
      headers: { cookie: shippingCookie },
      payload: {
        expectedRegistrationRevision: anonymousReadinessBody.registrationRevision,
        expectedSelectionRevision: anonymousSelection.revision,
        acknowledgedMissingInformation: anonymousReadinessBody.missingInformation,
        idempotencyKey: randomUUID(),
        humanConfirmed: true,
      },
    });
    assert.equal(
      anonymousReadinessConfirmation.statusCode,
      201,
      anonymousReadinessConfirmation.body,
    );
    const anonymousReadinessConfirmationId = anonymousReadinessConfirmation.json<{
      humanConfirmation: { confirmationId: string };
    }>().humanConfirmation.confirmationId;
    const anonymousShipped = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${anonymousOrderId}/ship`,
      headers: { cookie: shippingCookie },
      payload: {
        addressLeaseId: null,
        shippingMethodSelectionId: anonymousSelection.selectionId,
        readinessConfirmationId: anonymousReadinessConfirmationId,
        shippedAt: new Date().toISOString(),
        idempotencyKey: randomUUID(),
        humanConfirmed: true,
      },
    });
    assert.equal(anonymousShipped.statusCode, 200, anonymousShipped.body);
    assert.equal(anonymousShipped.json<{ inventoryStatus: string }>().inventoryStatus, "shipped");
    const anonymousFinalAdmin = postgres(adminUrl, { max: 1 });
    try {
      const [anonymousFinal] = await anonymousFinalAdmin<
        [{ private_address_count: number; lease_count: number; order_state: string }]
      >`
        select
          (select count(*)::integer from order_private_address address_row
           where address_row.workspace_id = orders.workspace_id
             and address_row.order_id = orders.id) as private_address_count,
          (select count(*)::integer from address_access_lease lease
           where lease.workspace_id = orders.workspace_id
             and lease.order_id = orders.id) as lease_count,
          orders.state as order_state
        from sales_order orders
        where orders.workspace_id = ${owner.workspaceId} and orders.id = ${anonymousOrderId}
      `;
      assert.deepEqual(
        { ...anonymousFinal },
        { private_address_count: 0, lease_count: 0, order_state: "shipped" },
        "Anonymous fulfillment must complete without ever creating address data or a lease",
      );
    } finally {
      await anonymousFinalAdmin.end({ timeout: 5 });
    }

    const nullSaleOrderId = randomUUID();
    const nullSaleUnitId = await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
      const units = await transaction<Array<{ id: string }>>`
        select unit.id from inventory_unit unit
        where unit.workspace_id = ${owner.workspaceId} and unit.sku_id = ${skuId}
          and unit.status = 'available'
          and not exists (
            select 1 from order_allocation allocation
            where allocation.workspace_id = unit.workspace_id
              and allocation.inventory_unit_id = unit.id and allocation.active
          )
        order by unit.id
        limit 1
      `;
      const unitId = units[0]?.id;
      assert.ok(unitId, "A free inventory unit is required for the null-sale fixture");
      await transaction`
        insert into sales_order (id, workspace_id, order_number, state, address_mode)
        values (
          ${nullSaleOrderId}, ${owner.workspaceId}, 'ORDER-P13-NULL-SALE',
          'confirmed', 'anonymous'
        )
      `;
      await transaction`
        insert into order_allocation (workspace_id, order_id, inventory_unit_id)
        values (${owner.workspaceId}, ${nullSaleOrderId}, ${unitId})
      `;
      return unitId;
    });
    assert.ok(nullSaleUnitId);
    const missingSaleDecision = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${nullSaleOrderId}/shipping-photo-preflight`,
      headers: { cookie },
      payload: {
        expectedDecisionRevision: null,
        idempotencyKey: randomUUID(),
        humanConfirmed: true,
      },
    });
    assert.equal(missingSaleDecision.statusCode, 200, missingSaleDecision.body);
    assert.deepEqual(
      {
        state: missingSaleDecision.json<{ state: string }>().state,
        reason: missingSaleDecision.json<{ decisionReason: string }>().decisionReason,
        sale: missingSaleDecision.json<{ saleAmountStatus: string }>().saleAmountStatus,
      },
      { state: "choice_required", reason: "sale_amount_missing", sale: "missing" },
      "A missing sale must remain absent and require an explicit human choice",
    );
    const missingSaleFinancials = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${nullSaleOrderId}/financial-summary`,
      headers: { cookie },
    });
    assert.equal(missingSaleFinancials.statusCode, 409, missingSaleFinancials.body);
    const saleKey = randomUUID();
    const salePayload = {
      saleAmountMinor: 5000,
      taxBasis: "tax_included",
      sourceMeaning: "未入力販売額の本人後入力",
      occurredAt: new Date().toISOString(),
      idempotencyKey: saleKey,
      humanConfirmed: true,
    } as const;
    const concurrentSaleReplays = await Promise.all([
      app.inject({
        method: "POST",
        url: `/v1/workspaces/${owner.workspaceId}/orders/${nullSaleOrderId}/sale-amount`,
        headers: { cookie },
        payload: salePayload,
      }),
      app.inject({
        method: "POST",
        url: `/v1/workspaces/${owner.workspaceId}/orders/${nullSaleOrderId}/sale-amount`,
        headers: { cookie },
        payload: salePayload,
      }),
    ]);
    assert.deepEqual(
      concurrentSaleReplays.map((response) => response.statusCode),
      [201, 201],
      "Concurrent identical late-sale retries must replay one financial event",
    );
    assert.equal(
      concurrentSaleReplays[0]?.json<{ financialEventId: string }>().financialEventId,
      concurrentSaleReplays[1]?.json<{ financialEventId: string }>().financialEventId,
    );
    const recordedLateSaleEventId = concurrentSaleReplays[0]?.json<{
      financialEventId: string;
    }>().financialEventId;
    assert.ok(recordedLateSaleEventId);
    const conflictingSaleReplay = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${nullSaleOrderId}/sale-amount`,
      headers: { cookie },
      payload: { ...salePayload, saleAmountMinor: 5001 },
    });
    assert.equal(conflictingSaleReplay.statusCode, 409, conflictingSaleReplay.body);
    const secondLateSale = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${nullSaleOrderId}/sale-amount`,
      headers: { cookie },
      payload: { ...salePayload, idempotencyKey: randomUUID() },
    });
    assert.equal(secondLateSale.statusCode, 409, secondLateSale.body);
    const lateSaleCount = await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
      return transaction<Array<{ event_count: number }>>`
        select count(*)::integer as event_count
        from financial_event
        where workspace_id = ${owner.workspaceId} and order_id = ${nullSaleOrderId}
          and event_type = 'sale' and reverses_event_id is null
      `;
    });
    assert.equal(lateSaleCount[0]?.event_count, 1);
    const thresholdAfterSale = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${nullSaleOrderId}/shipping-photo-preflight`,
      headers: { cookie },
      payload: {
        expectedDecisionRevision: 1,
        idempotencyKey: randomUUID(),
        humanConfirmed: true,
      },
    });
    assert.equal(thresholdAfterSale.statusCode, 200, thresholdAfterSale.body);
    assert.equal(
      thresholdAfterSale.json<{ decisionReason: string }>().decisionReason,
      "threshold_met",
    );
    await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
      await transaction`
        insert into financial_event (
          id, workspace_id, sku_id, order_id, event_type, amount_minor, currency,
          tax_basis, bearer, source, source_meaning, rounding_rule_version,
          reverses_event_id, source_already_net, occurred_at
        ) values (
          ${randomUUID()}, ${owner.workspaceId}, ${skuId}, ${nullSaleOrderId},
          'refund', -5000, 'JPY', 'tax_included', 'seller', 'manual',
          '本人後入力した架空売上の全額取消', 'jpy-v1', ${recordedLateSaleEventId}, false,
          statement_timestamp()
        )
      `;
    });
    const sameKeyAfterReversal = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${nullSaleOrderId}/sale-amount`,
      headers: { cookie },
      payload: salePayload,
    });
    assert.equal(sameKeyAfterReversal.statusCode, 201, sameKeyAfterReversal.body);
    assert.equal(
      sameKeyAfterReversal.json<{ financialEventId: string }>().financialEventId,
      recordedLateSaleEventId,
      "The original idempotency key must replay before the historical-sale rejection",
    );
    const newKeyAfterReversal = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${nullSaleOrderId}/sale-amount`,
      headers: { cookie },
      payload: { ...salePayload, idempotencyKey: randomUUID() },
    });
    assert.equal(newKeyAfterReversal.statusCode, 409, newKeyAfterReversal.body);
    const reversedSaleHistory = await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
      return transaction<Array<{ sale_count: number; reversal_count: number }>>`
        select
          count(*) filter (where event_type = 'sale')::integer as sale_count,
          count(*) filter (where reverses_event_id = ${recordedLateSaleEventId})::integer
            as reversal_count
        from financial_event
        where workspace_id = ${owner.workspaceId} and order_id = ${nullSaleOrderId}
      `;
    });
    assert.deepEqual(
      { ...reversedSaleHistory[0] },
      { sale_count: 1, reversal_count: 1 },
      "A reversed sale remains historical and cannot be replaced by the initial-entry API",
    );
    await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
      await transaction`
        update sales_order set state = 'cancelled'
        where workspace_id = ${owner.workspaceId} and id = ${nullSaleOrderId}
      `;
    });
    const cancelledPreflight = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${nullSaleOrderId}/shipping-photo-preflight`,
      headers: { cookie },
    });
    assert.equal(cancelledPreflight.statusCode, 403, cancelledPreflight.body);
    const cancelledSaleMutation = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${nullSaleOrderId}/sale-amount`,
      headers: { cookie },
      payload: { ...salePayload, idempotencyKey: randomUUID() },
    });
    assert.equal(cancelledSaleMutation.statusCode, 409, cancelledSaleMutation.body);

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

    const incompleteRegisteredFinancial = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/financial-summary`,
      headers: { cookie },
    });
    assert.equal(incompleteRegisteredFinancial.statusCode, 409, incompleteRegisteredFinancial.body);
    const incompleteRegisteredExportPreflight = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/accounting/exports/preflight?orderId=${orderId}`,
      headers: { cookie },
    });
    assert.equal(
      incompleteRegisteredExportPreflight.statusCode,
      200,
      incompleteRegisteredExportPreflight.body,
    );
    assert.deepEqual(
      {
        canCreateFresh: incompleteRegisteredExportPreflight.json<{
          canCreateFresh: boolean;
        }>().canCreateFresh,
        canSupersede: incompleteRegisteredExportPreflight.json<{
          canSupersede: boolean;
        }>().canSupersede,
      },
      { canCreateFresh: false, canSupersede: false },
      "Accounting preflight must stop instead of treating missing fee facts as zero yen",
    );
    const accountingOrders = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/accounting/orders`,
      headers: { cookie },
    });
    assert.equal(accountingOrders.statusCode, 200, accountingOrders.body);
    assert.deepEqual(
      accountingOrders.json<Array<{ orderId: string }>>().map((entry) => entry.orderId),
      [anonymousOrderId, orderId],
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

    const incompleteRegisteredExport = await app.inject({
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
    assert.equal(incompleteRegisteredExport.statusCode, 409, incompleteRegisteredExport.body);
    assert.match(
      incompleteRegisteredExport.body,
      /Every required financial fact must be explicitly recorded/u,
      "Accounting export must identify absent facts instead of exporting implicit zero yen",
    );

    // The remaining accounting integration checks exercise an explicitly completed
    // financial fact set. These facts are intentionally added only after proving
    // that P14 creation and shipment left them absent and blocked both consumers.
    await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
      await transaction`
        insert into financial_event (
          workspace_id, sku_id, order_id, event_type, amount_minor, currency,
          tax_basis, bearer, source, source_meaning, rounding_rule_version,
          source_already_net, occurred_at
        ) values
          (
            ${owner.workspaceId}, ${acquiredItem.skuId}, ${orderId}, 'fee', 500, 'JPY',
            'tax_included', 'seller', 'manual',
            '後続会計試験用に人が明示確認した販売手数料', 'jpy-v1', false,
            statement_timestamp()
          ),
          (
            ${owner.workspaceId}, ${acquiredItem.skuId}, ${orderId}, 'packaging', 100, 'JPY',
            'tax_included', 'seller', 'manual',
            '後続会計試験用に人が明示確認した梱包費', 'jpy-v1', false,
            statement_timestamp()
          )
      `;
    });
    const completedFinancial = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/financial-summary`,
      headers: { cookie },
    });
    assert.equal(completedFinancial.statusCode, 200, completedFinancial.body);
    assert.equal(
      completedFinancial.json<{ contributionProfitMinor: number }>().contributionProfitMinor,
      2150,
    );
    assert.equal(
      completedFinancial.json<{ formulaVersion: string }>().formulaVersion,
      "financial_formula_v1.0.0",
    );

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
    const withP13RaceTimeout = async <T>(
      promise: Promise<T>,
      label: string,
      timeoutMilliseconds = 20_000,
    ): Promise<T> => {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          promise,
          new Promise<never>((_resolve, reject) => {
            timeout = setTimeout(
              () => reject(new Error(`${label} timed out after ${timeoutMilliseconds}ms`)),
              timeoutMilliseconds,
            );
          }),
        ]);
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    };
    const waitForP13BlockedConnection = async (
      observer: postgres.Sql,
      blockerPid: number,
      blockedPid: number,
      label: string,
    ): Promise<void> => {
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        const [observed] = await observer<
          Array<{ blocked: boolean; wait_event_type: string | null }>
        >`
          select
            ${blockerPid}::integer = any(pg_blocking_pids(${blockedPid}::integer)) as blocked,
            wait_event_type
          from pg_stat_activity
          where pid = ${blockedPid}::integer
        `;
        if (observed?.blocked && observed.wait_event_type === "Lock") return;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw new Error(`${label} did not reach the expected database lock wait`);
    };
    const waitForP13BlockedQuery = async (
      observer: postgres.Sql,
      primaryBlockerPid: number,
      secondaryBlockerPid: number,
      excludedPid: number,
      queryFragment: string,
      label: string,
    ): Promise<number> => {
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        const [observed] = await observer<Array<{ pid: number }>>`
          select pid::integer as pid
          from pg_stat_activity
          where datname = current_database()
            and pid <> ${primaryBlockerPid}::integer
            and pid <> ${excludedPid}::integer
            and wait_event_type = 'Lock'
            and position(lower(${queryFragment}) in lower(query)) > 0
            and (
              ${primaryBlockerPid}::integer = any(pg_blocking_pids(pid))
              or ${secondaryBlockerPid}::integer = any(pg_blocking_pids(pid))
            )
          order by pid
          limit 1
        `;
        if (observed) return observed.pid;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw new Error(`${label} did not reach the expected database lock wait`);
    };
    const runP13GatedApiRace = async <TFirst, TSecond>(
      label: string,
      orderIdForRace: string,
      firstQueryFragment: string,
      startFirst: () => Promise<TFirst>,
      secondQueryFragment: string,
      startSecond: () => Promise<TSecond>,
    ): Promise<[TFirst, TSecond]> => {
      const gate = postgres(adminUrl, { max: 1 });
      const observer = postgres(adminUrl, { max: 1 });
      let releaseGateResolve: (() => void) | undefined;
      const gateHold = new Promise<void>((resolve) => {
        releaseGateResolve = resolve;
      });
      let gateReadyResolve: ((backendPid: number) => void) | undefined;
      let gateReadyReject: ((reason: unknown) => void) | undefined;
      const gateReady = new Promise<number>((resolve, reject) => {
        gateReadyResolve = resolve;
        gateReadyReject = reject;
      });
      let gateTracked: Promise<unknown> | undefined;
      let firstTracked: Promise<unknown> | undefined;
      let secondTracked: Promise<unknown> | undefined;
      try {
        const gateOperation = gate.begin(async (transaction) => {
          try {
            await transaction`select set_config('statement_timeout', '20s', true)`;
            const [connection] = await transaction<[{ backend_pid: number }]>`
              select pg_backend_pid()::integer as backend_pid
            `;
            assert.ok(connection);
            await transaction`
              select 1 from sales_order
              where workspace_id = ${owner.workspaceId} and id = ${orderIdForRace}
              for update
            `;
            gateReadyResolve?.(connection.backend_pid);
            await gateHold;
          } catch (error) {
            gateReadyReject?.(error);
            throw error;
          }
        });
        gateTracked = gateOperation;
        void gateOperation.catch(() => undefined);
        const gateBackendPid = await withP13RaceTimeout(gateReady, `${label} gate`);

        const first = startFirst();
        firstTracked = first;
        void first.catch(() => undefined);
        const firstBackendPid = await waitForP13BlockedQuery(
          observer,
          gateBackendPid,
          gateBackendPid,
          gateBackendPid,
          firstQueryFragment,
          `${label} first request`,
        );

        const second = startSecond();
        secondTracked = second;
        void second.catch(() => undefined);
        const secondBackendPid = await waitForP13BlockedQuery(
          observer,
          gateBackendPid,
          firstBackendPid,
          firstBackendPid,
          secondQueryFragment,
          `${label} second request`,
        );
        assert.notEqual(firstBackendPid, secondBackendPid);
        releaseGateResolve?.();
        return await withP13RaceTimeout(Promise.all([first, second]), `${label} completion`);
      } finally {
        releaseGateResolve?.();
        await Promise.allSettled(
          [gateTracked, firstTracked, secondTracked].filter(
            (operation): operation is Promise<unknown> => operation !== undefined,
          ),
        );
        await Promise.allSettled([gate.end({ timeout: 5 }), observer.end({ timeout: 5 })]);
      }
    };
    const runP13OrderedDatabaseRace = async (
      label: string,
      firstOperation: (transaction: postgres.TransactionSql) => Promise<void>,
      secondOperation: (transaction: postgres.TransactionSql) => Promise<void>,
    ): Promise<void> => {
      const firstWriter = postgres(runtimeUrl, { max: 1 });
      const secondWriter = postgres(runtimeUrl, { max: 1 });
      const observer = postgres(adminUrl, { max: 1 });
      let releaseFirstResolve: (() => void) | undefined;
      const releaseFirstHold = new Promise<void>((resolve) => {
        releaseFirstResolve = resolve;
      });
      let firstReadyResolve: ((backendPid: number) => void) | undefined;
      let firstReadyReject: ((reason: unknown) => void) | undefined;
      const firstReady = new Promise<number>((resolve, reject) => {
        firstReadyResolve = resolve;
        firstReadyReject = reject;
      });
      let secondStartedResolve: ((backendPid: number) => void) | undefined;
      let secondStartedReject: ((reason: unknown) => void) | undefined;
      const secondStarted = new Promise<number>((resolve, reject) => {
        secondStartedResolve = resolve;
        secondStartedReject = reject;
      });
      let firstTracked: Promise<unknown> | undefined;
      let secondTracked: Promise<unknown> | undefined;
      try {
        const first = firstWriter.begin(async (transaction) => {
          try {
            await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
            await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
            await transaction`select set_config('statement_timeout', '20s', true)`;
            const [connection] = await transaction<[{ backend_pid: number }]>`
              select pg_backend_pid()::integer as backend_pid
            `;
            assert.ok(connection);
            await firstOperation(transaction);
            firstReadyResolve?.(connection.backend_pid);
            await releaseFirstHold;
          } catch (error) {
            firstReadyReject?.(error);
            throw error;
          }
        });
        firstTracked = first;
        void first.catch(() => undefined);
        const firstBackendPid = await withP13RaceTimeout(firstReady, `${label} first writer`);

        const second = secondWriter.begin(async (transaction) => {
          try {
            await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
            await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
            await transaction`select set_config('statement_timeout', '20s', true)`;
            const [connection] = await transaction<[{ backend_pid: number }]>`
              select pg_backend_pid()::integer as backend_pid
            `;
            assert.ok(connection);
            secondStartedResolve?.(connection.backend_pid);
            await secondOperation(transaction);
          } catch (error) {
            secondStartedReject?.(error);
            throw error;
          }
        });
        secondTracked = second;
        void second.catch(() => undefined);
        const secondBackendPid = await withP13RaceTimeout(secondStarted, `${label} second writer`);
        assert.notEqual(firstBackendPid, secondBackendPid);
        await waitForP13BlockedConnection(observer, firstBackendPid, secondBackendPid, label);
        releaseFirstResolve?.();
        await withP13RaceTimeout(Promise.all([first, second]), `${label} completion`);
      } finally {
        releaseFirstResolve?.();
        await Promise.allSettled(
          [firstTracked, secondTracked].filter(
            (operation): operation is Promise<unknown> => operation !== undefined,
          ),
        );
        await Promise.allSettled([
          firstWriter.end({ timeout: 5 }),
          secondWriter.end({ timeout: 5 }),
          observer.end({ timeout: 5 }),
        ]);
      }
    };

    const exactRetryOrderId = randomUUID();
    const exactRetrySkuId = randomUUID();
    const exactRetryUnitId = randomUUID();
    const exactRetryLocationId = randomUUID();
    const exactRetryAdmin = postgres(adminUrl, { max: 1 });
    try {
      await exactRetryAdmin.begin(async (transaction) => {
        await transaction`
          insert into product_sku (id, workspace_id, sku_code, title, category)
          values (
            ${exactRetrySkuId}, ${owner.workspaceId}, 'SKU-P13-EXACT-RETRY',
            'P13同時再送試験専用の架空商品', 'トップス'
          )
        `;
        await transaction`
          insert into p0_workflow (workspace_id, sku_id, state, last_action, version)
          values (${owner.workspaceId}, ${exactRetrySkuId}, 'picked', 'confirm_pick', 6)
        `;
        await transaction`
          insert into location_node (
            id, workspace_id, parent_id, code, name, depth, state,
            can_store_inventory, single_item_only, allow_mixed_sku, max_units
          ) values (
            ${exactRetryLocationId}, ${owner.workspaceId}, ${rootLocationId},
            ${appendCodeCheckDigit("P13-EXACT-RETRY")}, 'P13同時再送試験専用棚', 1,
            'active', true, true, false, 1
          )
        `;
        await transaction`set local session_replication_role = replica`;
        await transaction`
          insert into inventory_unit (
            id, workspace_id, sku_id, inventory_number, status, location_id, movement_seq
          ) values (
            ${exactRetryUnitId}, ${owner.workspaceId}, ${exactRetrySkuId},
            ${appendCodeCheckDigit("INV-900008")}, 'picked', ${exactRetryLocationId}, 0
          )
        `;
        await transaction`
          insert into sales_order (id, workspace_id, order_number, state, address_mode)
          values (
            ${exactRetryOrderId}, ${owner.workspaceId}, 'ORDER-P13-EXACT-RETRY',
            'picking', 'stored'
          )
        `;
        await transaction`
          insert into order_private_address (
            workspace_id, order_id, ciphertext, nonce, auth_tag, key_version, created_by
          ) values (
            ${owner.workspaceId}, ${exactRetryOrderId}, decode('01', 'hex'),
            decode(repeat('00', 12), 'hex'), decode(repeat('00', 16), 'hex'),
            'integration-test-v1', ${owner.identityId}
          )
        `;
        await transaction`
          insert into order_allocation (workspace_id, order_id, inventory_unit_id)
          values (${owner.workspaceId}, ${exactRetryOrderId}, ${exactRetryUnitId})
        `;
      });
    } finally {
      await exactRetryAdmin.end({ timeout: 5 });
    }
    const exactRetryDecision = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${exactRetryOrderId}/shipping-photo-preflight`,
      headers: { cookie },
      payload: {
        expectedDecisionRevision: null,
        idempotencyKey: randomUUID(),
        humanConfirmed: true,
      },
    });
    assert.equal(exactRetryDecision.statusCode, 200, exactRetryDecision.body);
    const exactRetryPhotoChoice = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${exactRetryOrderId}/shipping-photo-override`,
      headers: { cookie },
      payload: {
        choice: "use_photos",
        expectedDecisionRevision: 1,
        idempotencyKey: randomUUID(),
        humanConfirmed: true,
      },
    });
    assert.equal(exactRetryPhotoChoice.statusCode, 200, exactRetryPhotoChoice.body);
    const uploadExactRetryPhoto = (role: "product" | "packed_package", idempotencyKey: string) => {
      const query = new URLSearchParams({ role, idempotencyKey, humanConfirmed: "true" });
      return app.inject({
        method: "POST",
        url: `/v1/workspaces/${owner.workspaceId}/orders/${exactRetryOrderId}/shipping-photos?${query.toString()}`,
        headers: { cookie, "content-type": "image/jpeg" },
        payload: jpegWithGpsMetadata(),
      });
    };
    const exactProductPhotoKey = randomUUID();
    const [exactProductPhotoA, exactProductPhotoB] = await runP13GatedApiRace(
      "P13 exact shipping photo retry",
      exactRetryOrderId,
      "insert into shipping_photo_asset",
      () => uploadExactRetryPhoto("product", exactProductPhotoKey),
      "insert into shipping_photo_asset",
      () => uploadExactRetryPhoto("product", exactProductPhotoKey),
    );
    assert.deepEqual([exactProductPhotoA.statusCode, exactProductPhotoB.statusCode], [201, 201]);
    const exactProductPhotoId = exactProductPhotoA.json<{ assetId: string }>().assetId;
    assert.equal(
      exactProductPhotoB.json<{ assetId: string }>().assetId,
      exactProductPhotoId,
      "Concurrent exact photo retries must return the same immutable asset",
    );
    const mismatchedProductPhoto = await uploadExactRetryPhoto(
      "packed_package",
      exactProductPhotoKey,
    );
    assert.equal(mismatchedProductPhoto.statusCode, 409, mismatchedProductPhoto.body);
    const exactPackedPhoto = await uploadExactRetryPhoto("packed_package", randomUUID());
    assert.equal(exactPackedPhoto.statusCode, 201, exactPackedPhoto.body);
    const exactPackedPhotoId = exactPackedPhoto.json<{ assetId: string }>().assetId;

    const exactConfirmationKey = randomUUID();
    const exactConfirmationPayload = {
      assetIds: [exactProductPhotoId, exactPackedPhotoId],
      idempotencyKey: exactConfirmationKey,
      humanConfirmed: true,
    } as const;
    const [exactConfirmationA, exactConfirmationB] = await runP13GatedApiRace(
      "P13 exact shipping photo confirmation retry",
      exactRetryOrderId,
      "insert into shipping_photo_confirmation",
      () =>
        app.inject({
          method: "POST",
          url: `/v1/workspaces/${owner.workspaceId}/orders/${exactRetryOrderId}/shipping-photo-confirmations`,
          headers: { cookie },
          payload: exactConfirmationPayload,
        }),
      "insert into shipping_photo_confirmation",
      () =>
        app.inject({
          method: "POST",
          url: `/v1/workspaces/${owner.workspaceId}/orders/${exactRetryOrderId}/shipping-photo-confirmations`,
          headers: { cookie },
          payload: exactConfirmationPayload,
        }),
    );
    assert.deepEqual([exactConfirmationA.statusCode, exactConfirmationB.statusCode], [201, 201]);
    const exactConfirmationId = exactConfirmationA.json<{ confirmationId: string }>()
      .confirmationId;
    assert.equal(
      exactConfirmationB.json<{ confirmationId: string }>().confirmationId,
      exactConfirmationId,
      "Concurrent exact confirmation retries must return one confirmation",
    );
    const mismatchedConfirmation = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${exactRetryOrderId}/shipping-photo-confirmations`,
      headers: { cookie },
      payload: {
        assetIds: [exactProductPhotoId, randomUUID()],
        idempotencyKey: exactConfirmationKey,
        humanConfirmed: true,
      },
    });
    assert.equal(mismatchedConfirmation.statusCode, 409, mismatchedConfirmation.body);

    const [exactPhotoArtifacts] = await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
      return transaction<
        Array<{
          asset_count: number;
          product_asset_count: number;
          product_audit_count: number;
          confirmation_count: number;
          confirmation_audit_count: number;
        }>
      >`
        select
          (select count(*)::integer from shipping_photo_asset
           where workspace_id = ${owner.workspaceId}
             and order_id = ${exactRetryOrderId}) as asset_count,
          (select count(*)::integer from shipping_photo_asset
           where workspace_id = ${owner.workspaceId}
             and order_id = ${exactRetryOrderId}
             and upload_idempotency_key = ${exactProductPhotoKey}) as product_asset_count,
          (select count(*)::integer from audit_event
           where workspace_id = ${owner.workspaceId}
             and action = 'shipping.photo.captured'
             and target_id = ${exactProductPhotoId}) as product_audit_count,
          (select count(*)::integer from shipping_photo_confirmation
           where workspace_id = ${owner.workspaceId}
             and order_id = ${exactRetryOrderId}
             and idempotency_key = ${exactConfirmationKey}) as confirmation_count,
          (select count(*)::integer from audit_event
           where workspace_id = ${owner.workspaceId}
             and action = 'shipping.photos.confirmed'
             and target_id = ${exactConfirmationId}) as confirmation_audit_count
      `;
    });
    assert.deepEqual(
      { ...exactPhotoArtifacts },
      {
        asset_count: 2,
        product_asset_count: 1,
        product_audit_count: 1,
        confirmation_count: 1,
        confirmation_audit_count: 1,
      },
      "Concurrent exact photo operations must create one business row and one audit row",
    );

    const exactRetryLeaseA = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${exactRetryOrderId}/address-leases`,
      headers: { cookie },
      payload: { purpose: "shipping_label", humanConfirmed: true },
    });
    const exactRetryLeaseB = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${exactRetryOrderId}/address-leases`,
      headers: { cookie },
      payload: { purpose: "shipping_label", humanConfirmed: true },
    });
    assert.equal(exactRetryLeaseA.statusCode, 201, exactRetryLeaseA.body);
    assert.equal(exactRetryLeaseB.statusCode, 201, exactRetryLeaseB.body);
    const exactRetryLeaseAId = exactRetryLeaseA.json<{ leaseId: string }>().leaseId;
    const exactRetryLeaseBId = exactRetryLeaseB.json<{ leaseId: string }>().leaseId;
    const exactPackKey = randomUUID();
    const exactPackPayload = {
      addressLeaseId: exactRetryLeaseAId,
      idempotencyKey: exactPackKey,
      humanConfirmed: true,
    } as const;
    const [exactPackA, exactPackB] = await runP13GatedApiRace(
      "P13 exact pack retry",
      exactRetryOrderId,
      "select id from sales_order",
      () =>
        app.inject({
          method: "POST",
          url: `/v1/workspaces/${owner.workspaceId}/orders/${exactRetryOrderId}/pack`,
          headers: { cookie },
          payload: exactPackPayload,
        }),
      "select id from sales_order",
      () =>
        app.inject({
          method: "POST",
          url: `/v1/workspaces/${owner.workspaceId}/orders/${exactRetryOrderId}/pack`,
          headers: { cookie },
          payload: exactPackPayload,
        }),
    );
    assert.deepEqual([exactPackA.statusCode, exactPackB.statusCode], [200, 200]);
    assert.deepEqual(exactPackB.json(), exactPackA.json());
    const mismatchedPack = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${exactRetryOrderId}/pack`,
      headers: { cookie },
      payload: { ...exactPackPayload, addressLeaseId: exactRetryLeaseBId },
    });
    assert.equal(mismatchedPack.statusCode, 409, mismatchedPack.body);

    const exactShipKey = randomUUID();
    const exactShipPayload = {
      addressLeaseId: exactRetryLeaseAId,
      idempotencyKey: exactShipKey,
      humanConfirmed: true,
    } as const;
    const [exactShipA, exactShipB] = await runP13GatedApiRace(
      "P13 exact ship retry",
      exactRetryOrderId,
      "select id from sales_order",
      () =>
        app.inject({
          method: "POST",
          url: `/v1/workspaces/${owner.workspaceId}/orders/${exactRetryOrderId}/ship`,
          headers: { cookie },
          payload: exactShipPayload,
        }),
      "select id from sales_order",
      () =>
        app.inject({
          method: "POST",
          url: `/v1/workspaces/${owner.workspaceId}/orders/${exactRetryOrderId}/ship`,
          headers: { cookie },
          payload: exactShipPayload,
        }),
    );
    assert.deepEqual([exactShipA.statusCode, exactShipB.statusCode], [200, 200]);
    assert.deepEqual(exactShipB.json(), exactShipA.json());
    const mismatchedShip = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${exactRetryOrderId}/ship`,
      headers: { cookie },
      payload: { ...exactShipPayload, addressLeaseId: exactRetryLeaseBId },
    });
    assert.equal(mismatchedShip.statusCode, 409, mismatchedShip.body);

    const [exactOperationArtifacts] = await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
      return transaction<
        Array<{
          packing_count: number;
          shipment_count: number;
          pack_operation_count: number;
          ship_operation_count: number;
          pack_audit_count: number;
          ship_audit_count: number;
          pack_workflow_count: number;
          ship_workflow_count: number;
          order_state: string;
          inventory_status: string;
          workflow_state: string;
        }>
      >`
        select
          (select count(*)::integer from packing_evidence
           where workspace_id = ${owner.workspaceId}
             and order_id = ${exactRetryOrderId}) as packing_count,
          (select count(*)::integer from shipment_human_confirmation
           where workspace_id = ${owner.workspaceId}
             and order_id = ${exactRetryOrderId}) as shipment_count,
          (select count(*)::integer from order_operation_record
           where workspace_id = ${owner.workspaceId}
             and order_id = ${exactRetryOrderId}
             and operation = 'pack'
             and idempotency_key = ${exactPackKey}) as pack_operation_count,
          (select count(*)::integer from order_operation_record
           where workspace_id = ${owner.workspaceId}
             and order_id = ${exactRetryOrderId}
             and operation = 'ship'
             and idempotency_key = ${exactShipKey}) as ship_operation_count,
          (select count(*)::integer from audit_event
           where workspace_id = ${owner.workspaceId}
             and action = 'order.pack'
             and target_id = ${exactRetryOrderId}) as pack_audit_count,
          (select count(*)::integer from audit_event
           where workspace_id = ${owner.workspaceId}
             and action = 'order.ship'
             and target_id = ${exactRetryOrderId}) as ship_audit_count,
          (select count(*)::integer from p0_workflow_action
           where workspace_id = ${owner.workspaceId}
             and sku_id = ${exactRetrySkuId}
             and action = 'confirm_pack'
             and idempotency_key = ${exactPackKey}) as pack_workflow_count,
          (select count(*)::integer from p0_workflow_action
           where workspace_id = ${owner.workspaceId}
             and sku_id = ${exactRetrySkuId}
             and action = 'confirm_ship'
             and idempotency_key = ${exactShipKey}) as ship_workflow_count,
          orders.state as order_state,
          unit.status as inventory_status,
          workflow.state as workflow_state
        from sales_order orders
        join order_allocation allocation
          on allocation.workspace_id = orders.workspace_id
         and allocation.order_id = orders.id and allocation.active
        join inventory_unit unit
          on unit.workspace_id = allocation.workspace_id
         and unit.id = allocation.inventory_unit_id
        join p0_workflow workflow
          on workflow.workspace_id = unit.workspace_id
         and workflow.sku_id = unit.sku_id
        where orders.workspace_id = ${owner.workspaceId}
          and orders.id = ${exactRetryOrderId}
      `;
    });
    assert.deepEqual(
      { ...exactOperationArtifacts },
      {
        packing_count: 1,
        shipment_count: 1,
        pack_operation_count: 1,
        ship_operation_count: 1,
        pack_audit_count: 1,
        ship_audit_count: 1,
        pack_workflow_count: 1,
        ship_workflow_count: 1,
        order_state: "shipped",
        inventory_status: "shipped",
        workflow_state: "shipped",
      },
      "Concurrent exact pack and ship retries must create one evidence, operation and audit row",
    );

    const legacyPackedOrderId = randomUUID();
    const legacyPackedSkuId = randomUUID();
    const legacyPackedUnitId = randomUUID();
    const legacyPackedLocationId = randomUUID();
    const legacyPackingEvidenceId = randomUUID();
    const legacyPackingReferenceId = randomUUID();
    const legacyPackedAdmin = postgres(adminUrl, { max: 1 });
    try {
      await legacyPackedAdmin.begin(async (transaction) => {
        await transaction`
          insert into product_sku (id, workspace_id, sku_code, title, category)
          values (
            ${legacyPackedSkuId}, ${owner.workspaceId}, 'SKU-P13-LEGACY-PACKED',
            '旧梱包記録回復試験専用の架空商品', 'トップス'
          )
        `;
        await transaction`
          insert into p0_workflow (workspace_id, sku_id, state, last_action, version)
          values (${owner.workspaceId}, ${legacyPackedSkuId}, 'packed', 'confirm_pack', 7)
        `;
        await transaction`
          insert into location_node (
            id, workspace_id, parent_id, code, name, depth, state,
            can_store_inventory, single_item_only, allow_mixed_sku, max_units
          ) values (
            ${legacyPackedLocationId}, ${owner.workspaceId}, ${rootLocationId},
            ${appendCodeCheckDigit("P13-LEGACY-PACK")}, '旧梱包記録回復試験専用棚', 1,
            'active', true, true, false, 1
          )
        `;
        await transaction`set local session_replication_role = replica`;
        await transaction`
          insert into inventory_unit (
            id, workspace_id, sku_id, inventory_number, status, location_id, movement_seq
          ) values (
            ${legacyPackedUnitId}, ${owner.workspaceId}, ${legacyPackedSkuId},
            ${appendCodeCheckDigit("INV-900009")}, 'packed', ${legacyPackedLocationId}, 0
          )
        `;
        await transaction`
          insert into sales_order (id, workspace_id, order_number, state, address_mode)
          values (
            ${legacyPackedOrderId}, ${owner.workspaceId}, 'ORDER-P13-LEGACY-PACKED',
            'packed', 'stored'
          )
        `;
        await transaction`
          insert into order_private_address (
            workspace_id, order_id, ciphertext, nonce, auth_tag, key_version, created_by
          ) values (
            ${owner.workspaceId}, ${legacyPackedOrderId}, decode('01', 'hex'),
            decode(repeat('00', 12), 'hex'), decode(repeat('00', 16), 'hex'),
            'integration-test-v1', ${owner.identityId}
          )
        `;
        await transaction`
          insert into order_allocation (workspace_id, order_id, inventory_unit_id)
          values (${owner.workspaceId}, ${legacyPackedOrderId}, ${legacyPackedUnitId})
        `;
        await transaction`
          insert into packing_evidence (
            id, workspace_id, order_id, evidence_reference_id, confirmed_by,
            confirmed_at, created_at, server_confirmed
          ) values (
            ${legacyPackingEvidenceId}, ${owner.workspaceId}, ${legacyPackedOrderId},
            ${legacyPackingReferenceId}, ${owner.identityId},
            '2026-01-02T03:04:07.000Z', '2026-01-02T03:04:08.000Z', false
          )
        `;
      });
    } finally {
      await legacyPackedAdmin.end({ timeout: 5 });
    }
    const legacyPackedDecision = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${legacyPackedOrderId}/shipping-photo-preflight`,
      headers: { cookie },
      payload: {
        expectedDecisionRevision: null,
        idempotencyKey: randomUUID(),
        humanConfirmed: true,
      },
    });
    assert.equal(legacyPackedDecision.statusCode, 200, legacyPackedDecision.body);
    const legacyPackedSkip = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${legacyPackedOrderId}/shipping-photo-override`,
      headers: { cookie },
      payload: {
        choice: "skip_photos",
        expectedDecisionRevision: 1,
        idempotencyKey: randomUUID(),
        humanConfirmed: true,
      },
    });
    assert.equal(legacyPackedSkip.statusCode, 200, legacyPackedSkip.body);
    const legacyPackedLeaseA = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${legacyPackedOrderId}/address-leases`,
      headers: { cookie },
      payload: { purpose: "shipping_label", humanConfirmed: true },
    });
    const legacyPackedLeaseB = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${legacyPackedOrderId}/address-leases`,
      headers: { cookie },
      payload: { purpose: "shipping_label", humanConfirmed: true },
    });
    assert.equal(legacyPackedLeaseA.statusCode, 201, legacyPackedLeaseA.body);
    assert.equal(legacyPackedLeaseB.statusCode, 201, legacyPackedLeaseB.body);
    const legacyPackedLeaseAId = legacyPackedLeaseA.json<{ leaseId: string }>().leaseId;
    const legacyPackedLeaseBId = legacyPackedLeaseB.json<{ leaseId: string }>().leaseId;
    const legacyRecoveryPackKey = randomUUID();
    const legacyRecoveryPackPayload = {
      addressLeaseId: legacyPackedLeaseAId,
      idempotencyKey: legacyRecoveryPackKey,
      humanConfirmed: true,
    } as const;
    const [legacyRecoveryPackA, legacyRecoveryPackB] = await runP13GatedApiRace(
      "P13 legacy packed recovery retry",
      legacyPackedOrderId,
      "select id from sales_order",
      () =>
        app.inject({
          method: "POST",
          url: `/v1/workspaces/${owner.workspaceId}/orders/${legacyPackedOrderId}/pack`,
          headers: { cookie },
          payload: legacyRecoveryPackPayload,
        }),
      "select id from sales_order",
      () =>
        app.inject({
          method: "POST",
          url: `/v1/workspaces/${owner.workspaceId}/orders/${legacyPackedOrderId}/pack`,
          headers: { cookie },
          payload: legacyRecoveryPackPayload,
        }),
    );
    assert.deepEqual([legacyRecoveryPackA.statusCode, legacyRecoveryPackB.statusCode], [200, 200]);
    assert.deepEqual(legacyRecoveryPackB.json(), legacyRecoveryPackA.json());
    const mismatchedLegacyRecoveryPack = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${legacyPackedOrderId}/pack`,
      headers: { cookie },
      payload: { ...legacyRecoveryPackPayload, addressLeaseId: legacyPackedLeaseBId },
    });
    assert.equal(mismatchedLegacyRecoveryPack.statusCode, 409, mismatchedLegacyRecoveryPack.body);
    const duplicateLegacyRecoveryPack = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${legacyPackedOrderId}/pack`,
      headers: { cookie },
      payload: {
        ...legacyRecoveryPackPayload,
        idempotencyKey: randomUUID(),
      },
    });
    assert.equal(duplicateLegacyRecoveryPack.statusCode, 409, duplicateLegacyRecoveryPack.body);
    const legacyRecoveryShip = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${legacyPackedOrderId}/ship`,
      headers: { cookie },
      payload: {
        addressLeaseId: legacyPackedLeaseAId,
        idempotencyKey: randomUUID(),
        humanConfirmed: true,
      },
    });
    assert.equal(legacyRecoveryShip.statusCode, 200, legacyRecoveryShip.body);
    const [legacyRecoveryArtifacts] = await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
      return transaction<
        Array<{
          legacy_unchanged: boolean;
          legacy_count: number;
          server_count: number;
          pack_operation_count: number;
          pack_audit_count: number;
          pack_workflow_count: number;
          shipment_count: number;
          order_state: string;
          inventory_status: string;
          workflow_state: string;
        }>
      >`
        select
          exists (
            select 1 from packing_evidence evidence
            where evidence.workspace_id = ${owner.workspaceId}
              and evidence.id = ${legacyPackingEvidenceId}
              and evidence.order_id = ${legacyPackedOrderId}
              and evidence.evidence_reference_id = ${legacyPackingReferenceId}
              and evidence.confirmed_by = ${owner.identityId}
              and evidence.confirmed_at = '2026-01-02T03:04:07.000Z'::timestamptz
              and evidence.created_at = '2026-01-02T03:04:08.000Z'::timestamptz
              and not evidence.server_confirmed
          ) as legacy_unchanged,
          (select count(*)::integer from packing_evidence
           where workspace_id = ${owner.workspaceId}
             and order_id = ${legacyPackedOrderId}
             and not server_confirmed) as legacy_count,
          (select count(*)::integer from packing_evidence
           where workspace_id = ${owner.workspaceId}
             and order_id = ${legacyPackedOrderId}
             and server_confirmed) as server_count,
          (select count(*)::integer from order_operation_record
           where workspace_id = ${owner.workspaceId}
             and order_id = ${legacyPackedOrderId}
             and operation = 'pack'
             and idempotency_key = ${legacyRecoveryPackKey}) as pack_operation_count,
          (select count(*)::integer from audit_event
           where workspace_id = ${owner.workspaceId}
             and action = 'order.pack'
             and target_id = ${legacyPackedOrderId}) as pack_audit_count,
          (select count(*)::integer from p0_workflow_action
           where workspace_id = ${owner.workspaceId}
             and sku_id = ${legacyPackedSkuId}
             and action = 'confirm_pack') as pack_workflow_count,
          (select count(*)::integer from shipment_human_confirmation
           where workspace_id = ${owner.workspaceId}
             and order_id = ${legacyPackedOrderId}) as shipment_count,
          orders.state as order_state,
          unit.status as inventory_status,
          workflow.state as workflow_state
        from sales_order orders
        join order_allocation allocation
          on allocation.workspace_id = orders.workspace_id
         and allocation.order_id = orders.id and allocation.active
        join inventory_unit unit
          on unit.workspace_id = allocation.workspace_id
         and unit.id = allocation.inventory_unit_id
        join p0_workflow workflow
          on workflow.workspace_id = unit.workspace_id
         and workflow.sku_id = unit.sku_id
        where orders.workspace_id = ${owner.workspaceId}
          and orders.id = ${legacyPackedOrderId}
      `;
    });
    assert.deepEqual(
      { ...legacyRecoveryArtifacts },
      {
        legacy_unchanged: true,
        legacy_count: 1,
        server_count: 1,
        pack_operation_count: 1,
        pack_audit_count: 1,
        pack_workflow_count: 0,
        shipment_count: 1,
        order_state: "shipped",
        inventory_status: "shipped",
        workflow_state: "shipped",
      },
      "Legacy packed recovery must append one server confirmation without rewriting history",
    );

    const idempotentDecisionOrderId = randomUUID();
    const saleFirstDecisionOrderId = randomUUID();
    const decisionFirstSaleOrderId = randomUUID();
    await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
      await transaction`
        insert into sales_order (id, workspace_id, order_number, state, address_mode) values
          (${idempotentDecisionOrderId}, ${owner.workspaceId},
           'ORDER-P13-IDEMPOTENT-DECISION-RACE', 'confirmed', 'anonymous'),
          (${saleFirstDecisionOrderId}, ${owner.workspaceId},
           'ORDER-P13-SALE-FIRST-DECISION-RACE', 'confirmed', 'anonymous'),
          (${decisionFirstSaleOrderId}, ${owner.workspaceId},
           'ORDER-P13-DECISION-FIRST-SALE-RACE', 'confirmed', 'anonymous')
      `;
    });
    const idempotentDecisionKey = randomUUID();
    const idempotentDecisionHash = hashFixture("p13-direct-idempotent-decision");
    const insertIdempotentDecision = async (
      transaction: postgres.TransactionSql,
      payloadHash: string,
    ): Promise<number> => {
      const rows = await transaction<Array<{ id: string }>>`
        insert into order_shipping_photo_decision (
          workspace_id, order_id, sale_amount_state, decision_reason,
          decision_state, photo_required, revision, supersedes_id,
          idempotency_key, payload_hash
        ) values (
          ${owner.workspaceId}, ${idempotentDecisionOrderId}, 'missing', 'policy_missing',
          'choice_required', null, 1, null, ${idempotentDecisionKey}, ${payloadHash}
        )
        on conflict (workspace_id, order_id, idempotency_key) do nothing
        returning id
      `;
      return rows.length;
    };
    let firstIdempotentDecisionRows = -1;
    let secondIdempotentDecisionRows = -1;
    await runP13OrderedDatabaseRace(
      "P13 concurrent exact decision retry",
      async (transaction) => {
        firstIdempotentDecisionRows = await insertIdempotentDecision(
          transaction,
          idempotentDecisionHash,
        );
      },
      async (transaction) => {
        secondIdempotentDecisionRows = await insertIdempotentDecision(
          transaction,
          idempotentDecisionHash,
        );
      },
    );
    assert.deepEqual(
      [firstIdempotentDecisionRows, secondIdempotentDecisionRows],
      [1, 0],
      "A concurrent exact retry must wait for the order lock and skip its duplicate row",
    );
    await assert.rejects(
      () =>
        inventory.begin(async (transaction) => {
          await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
          await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
          await insertIdempotentDecision(
            transaction,
            hashFixture("p13-direct-idempotent-decision-different-payload"),
          );
        }),
      hasDatabaseCode("23505"),
      "A reused decision idempotency key with another payload must be rejected",
    );
    const [idempotentDecisionArtifacts] = await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
      return transaction<
        Array<{ decision_count: number; basis_count: number; audit_count: number }>
      >`
        select
          (select count(*)::integer from order_shipping_photo_decision
           where workspace_id = ${owner.workspaceId}
             and order_id = ${idempotentDecisionOrderId}) as decision_count,
          (select count(*)::integer from shipping_sale_basis_snapshot
           where workspace_id = ${owner.workspaceId}
             and order_id = ${idempotentDecisionOrderId}) as basis_count,
          (select count(*)::integer from audit_event audit
           where audit.workspace_id = ${owner.workspaceId}
             and audit.action = 'shipping.photo_preflight.decided'
             and audit.target_id in (
               select decision.id from order_shipping_photo_decision decision
               where decision.workspace_id = ${owner.workspaceId}
                 and decision.order_id = ${idempotentDecisionOrderId}
             )) as audit_count
      `;
    });
    assert.deepEqual(
      { ...idempotentDecisionArtifacts },
      { decision_count: 1, basis_count: 1, audit_count: 0 },
      "Exact and mismatched direct retries must add no decision, basis or audit artifact",
    );
    const insertRaceSale = async (
      transaction: postgres.TransactionSql,
      orderIdForRace: string,
      sourceMeaning: string,
      skuIdForRace: string = acquiredItem.skuId,
    ): Promise<void> => {
      await transaction`
        insert into financial_event (
          id, workspace_id, sku_id, order_id, event_type, amount_minor, currency,
          tax_basis, bearer, source, source_meaning, rounding_rule_version,
          source_already_net, occurred_at
        ) values (
          ${randomUUID()}, ${owner.workspaceId}, ${skuIdForRace}, ${orderIdForRace},
          'sale', 6000, 'JPY', 'tax_included', 'seller', 'manual', ${sourceMeaning},
          'jpy-v1', false, statement_timestamp()
        )
      `;
    };
    const insertRaceDecision = async (
      transaction: postgres.TransactionSql,
      orderIdForRace: string,
    ): Promise<void> => {
      await transaction`
        insert into order_shipping_photo_decision (
          workspace_id, order_id, sale_amount_state, decision_reason,
          decision_state, photo_required, revision, supersedes_id,
          idempotency_key, payload_hash
        ) values (
          ${owner.workspaceId}, ${orderIdForRace}, 'missing', 'policy_missing',
          'choice_required', null, 1, null, ${randomUUID()},
          ${hashFixture(`p13-race-decision-${orderIdForRace}`)}
        )
      `;
    };
    await runP13OrderedDatabaseRace(
      "P13 sale-first decision race",
      (transaction) =>
        insertRaceSale(transaction, saleFirstDecisionOrderId, "販売額先行の競合試験"),
      (transaction) => insertRaceDecision(transaction, saleFirstDecisionOrderId),
    );
    const saleFirstDecision = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${saleFirstDecisionOrderId}/shipping-photo-preflight`,
      headers: { cookie },
    });
    assert.equal(saleFirstDecision.statusCode, 200, saleFirstDecision.body);
    assert.deepEqual(
      {
        reason: saleFirstDecision.json<{ decisionReason: string }>().decisionReason,
        state: saleFirstDecision.json<{ state: string }>().state,
      },
      { reason: "threshold_met", state: "capture_required" },
      "A decision waiting behind a sale must snapshot that sale as current",
    );

    await runP13OrderedDatabaseRace(
      "P13 decision-first sale race",
      (transaction) => insertRaceDecision(transaction, decisionFirstSaleOrderId),
      (transaction) =>
        insertRaceSale(transaction, decisionFirstSaleOrderId, "判定後追い販売額の競合試験"),
    );
    const decisionFirstSale = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${decisionFirstSaleOrderId}/shipping-photo-preflight`,
      headers: { cookie },
    });
    assert.equal(decisionFirstSale.statusCode, 409, decisionFirstSale.body);
    assert.equal(
      /6000|threshold|basis|saleAmountMinor|highValueThresholdMinor/iu.test(decisionFirstSale.body),
      false,
      "A sale committed after a decision must expose only the generic stale response",
    );
    const multiSaleOrderId = randomUUID();
    const multiSaleEventIds = [randomUUID(), randomUUID()] as const;
    await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
      await transaction`
        insert into sales_order (id, workspace_id, order_number, state, address_mode)
        values (
          ${multiSaleOrderId}, ${owner.workspaceId}, 'ORDER-P13-MULTI-SALE',
          'confirmed', 'anonymous'
        )
      `;
      await transaction`
        insert into financial_event (
          id, workspace_id, sku_id, order_id, event_type, amount_minor, currency,
          tax_basis, bearer, source, source_meaning, rounding_rule_version,
          source_already_net, occurred_at
        ) values
          (
            ${multiSaleEventIds[0]}, ${owner.workspaceId}, ${acquiredItem.skuId},
            ${multiSaleOrderId}, 'sale', 2400, 'JPY', 'tax_included', 'seller', 'manual',
            '複数売上の合計判定1', 'jpy-v1', false, '2031-01-01T00:00:00.000Z'
          ),
          (
            ${multiSaleEventIds[1]}, ${owner.workspaceId}, ${acquiredItem.skuId},
            ${multiSaleOrderId}, 'sale', 2600, 'JPY', 'tax_included', 'seller', 'manual',
            '複数売上の合計判定2', 'jpy-v1', false, '2031-01-02T00:00:00.000Z'
          )
      `;
    });
    const multiSaleDecision = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${multiSaleOrderId}/shipping-photo-preflight`,
      headers: { cookie },
      payload: {
        expectedDecisionRevision: null,
        idempotencyKey: randomUUID(),
        humanConfirmed: true,
      },
    });
    assert.equal(multiSaleDecision.statusCode, 200, multiSaleDecision.body);
    assert.deepEqual(
      {
        state: multiSaleDecision.json<{ state: string }>().state,
        reason: multiSaleDecision.json<{ decisionReason: string }>().decisionReason,
        sale: multiSaleDecision.json<{ saleAmountStatus: string }>().saleAmountStatus,
        leaksAmount: Object.hasOwn(
          multiSaleDecision.json<Record<string, unknown>>(),
          "saleAmountMinor",
        ),
      },
      {
        state: "capture_required",
        reason: "threshold_met",
        sale: "present",
        leaksAmount: false,
      },
      "Two sale events totaling the threshold must require photos without leaking the amount",
    );
    const multiSaleDecisionRows = await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
      return transaction<Array<{ sale_event_id: string | null }>>`
        select sale_event_id
        from order_shipping_photo_decision
        where workspace_id = ${owner.workspaceId} and order_id = ${multiSaleOrderId}
      `;
    });
    assert.deepEqual(
      Array.from(multiSaleDecisionRows, (row) => ({ ...row })),
      [{ sale_event_id: null }],
      "A multi-sale threshold snapshot must not pretend one event represents the total",
    );
    const invalidSaleOrders = {
      zero: randomUUID(),
      negative: randomUUID(),
      nonJpy: randomUUID(),
      overflow: randomUUID(),
    } as const;
    await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
      await transaction`
        insert into sales_order (id, workspace_id, order_number, state, address_mode) values
          (${invalidSaleOrders.zero}, ${owner.workspaceId}, 'ORDER-P13-ZERO-SALE', 'confirmed', 'anonymous'),
          (${invalidSaleOrders.negative}, ${owner.workspaceId}, 'ORDER-P13-NEGATIVE-SALE', 'confirmed', 'anonymous'),
          (${invalidSaleOrders.nonJpy}, ${owner.workspaceId}, 'ORDER-P13-NON-JPY-SALE', 'confirmed', 'anonymous'),
          (${invalidSaleOrders.overflow}, ${owner.workspaceId}, 'ORDER-P13-OVERFLOW-SALE', 'confirmed', 'anonymous')
      `;
      await transaction`
        insert into financial_event (
          id, workspace_id, sku_id, order_id, event_type, amount_minor, currency,
          tax_basis, bearer, source, source_meaning, rounding_rule_version,
          source_already_net, occurred_at
        ) values
          (${randomUUID()}, ${owner.workspaceId}, ${acquiredItem.skuId}, ${invalidSaleOrders.zero},
           'sale', 0, 'JPY', 'tax_included', 'seller', 'manual', '0円拒否',
           'jpy-v1', false, '2032-01-01T00:00:00.000Z'),
          (${randomUUID()}, ${owner.workspaceId}, ${acquiredItem.skuId}, ${invalidSaleOrders.negative},
           'sale', -1, 'JPY', 'tax_included', 'seller', 'manual', '負数拒否',
           'jpy-v1', false, '2032-01-01T00:00:00.000Z'),
          (${randomUUID()}, ${owner.workspaceId}, ${acquiredItem.skuId}, ${invalidSaleOrders.nonJpy},
           'sale', 1000, 'USD', 'tax_included', 'seller', 'manual', '非JPY拒否',
           'jpy-v1', false, '2032-01-01T00:00:00.000Z'),
          (${randomUUID()}, ${owner.workspaceId}, ${acquiredItem.skuId}, ${invalidSaleOrders.overflow},
           'sale', 9223372036854775807, 'JPY', 'tax_included', 'seller', 'manual', '合計超過1',
           'jpy-v1', false, '2032-01-01T00:00:00.000Z'),
          (${randomUUID()}, ${owner.workspaceId}, ${acquiredItem.skuId}, ${invalidSaleOrders.overflow},
           'sale', 1, 'JPY', 'tax_included', 'seller', 'manual', '合計超過2',
           'jpy-v1', false, '2032-01-02T00:00:00.000Z')
      `;
    });
    for (const invalidOrderId of Object.values(invalidSaleOrders)) {
      const rejectedDecision = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${owner.workspaceId}/orders/${invalidOrderId}/shipping-photo-preflight`,
        headers: { cookie },
        payload: {
          expectedDecisionRevision: null,
          idempotencyKey: randomUUID(),
          humanConfirmed: true,
        },
      });
      assert.equal(rejectedDecision.statusCode, 409, rejectedDecision.body);
    }
    const invalidDecisionArtifacts = await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
      return transaction<Array<{ decision_count: number; basis_count: number }>>`
        select
          (
            select count(*)::integer from order_shipping_photo_decision
            where workspace_id = ${owner.workspaceId}
              and order_id in ${transaction(Object.values(invalidSaleOrders))}
          ) as decision_count,
          (
            select count(*)::integer from shipping_sale_basis_snapshot
            where workspace_id = ${owner.workspaceId}
              and order_id in ${transaction(Object.values(invalidSaleOrders))}
          ) as basis_count
      `;
    });
    assert.deepEqual({ ...invalidDecisionArtifacts[0] }, { decision_count: 0, basis_count: 0 });

    const reversedSaleOrderId = randomUUID();
    const reversedSaleEventId = randomUUID();
    await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
      await transaction`
        insert into sales_order (id, workspace_id, order_number, state, address_mode)
        values (
          ${reversedSaleOrderId}, ${owner.workspaceId},
          'ORDER-P13-REVERSED-SALE', 'confirmed', 'anonymous'
        )
      `;
      await transaction`
        insert into financial_event (
          id, workspace_id, sku_id, order_id, event_type, amount_minor, currency,
          tax_basis, bearer, source, source_meaning, rounding_rule_version,
          source_already_net, occurred_at
        ) values (
          ${reversedSaleEventId}, ${owner.workspaceId}, ${acquiredItem.skuId},
          ${reversedSaleOrderId}, 'sale', 1000, 'JPY', 'tax_included', 'seller',
          'manual', '取消前の架空売上', 'jpy-v1', false, '2032-06-01T00:00:00.000Z'
        )
      `;
    });
    const beforeReversalDecision = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${reversedSaleOrderId}/shipping-photo-preflight`,
      headers: { cookie },
      payload: {
        expectedDecisionRevision: null,
        idempotencyKey: randomUUID(),
        humanConfirmed: true,
      },
    });
    assert.equal(beforeReversalDecision.statusCode, 200, beforeReversalDecision.body);
    assert.equal(
      beforeReversalDecision.json<{ decisionReason: string }>().decisionReason,
      "threshold_below",
    );
    await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
      await transaction`
        insert into financial_event (
          id, workspace_id, sku_id, order_id, event_type, amount_minor, currency,
          tax_basis, bearer, source, source_meaning, rounding_rule_version,
          reverses_event_id, source_already_net, occurred_at
        ) values (
          ${randomUUID()}, ${owner.workspaceId}, ${acquiredItem.skuId},
          ${reversedSaleOrderId}, 'refund', -1000, 'JPY', 'tax_included', 'seller',
          'manual', '架空売上の全額取消', 'jpy-v1', ${reversedSaleEventId}, false,
          '2032-06-02T00:00:00.000Z'
        )
      `;
    });
    const staleAfterReversal = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${reversedSaleOrderId}/shipping-photo-preflight`,
      headers: { cookie },
    });
    assert.equal(staleAfterReversal.statusCode, 409, staleAfterReversal.body);
    const afterReversalDecision = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${reversedSaleOrderId}/shipping-photo-preflight`,
      headers: { cookie },
      payload: {
        expectedDecisionRevision: 1,
        idempotencyKey: randomUUID(),
        humanConfirmed: true,
      },
    });
    assert.equal(afterReversalDecision.statusCode, 200, afterReversalDecision.body);
    assert.deepEqual(
      {
        reason: afterReversalDecision.json<{ decisionReason: string }>().decisionReason,
        state: afterReversalDecision.json<{ state: string }>().state,
        sale: afterReversalDecision.json<{ saleAmountStatus: string }>().saleAmountStatus,
      },
      {
        reason: "sale_amount_missing",
        state: "choice_required",
        sale: "missing",
      },
      "A reversal must stale the old basis and require a successor decision from no active sale",
    );

    const packedRecoveryOrderId = randomUUID();
    const packedRecoveryUnitId = randomUUID();
    const packedRecoveryLocationId = randomUUID();
    const recoveryAdmin = postgres(adminUrl, { max: 1 });
    try {
      await recoveryAdmin.begin(async (transaction) => {
        await transaction`
          insert into location_node (
            id, workspace_id, parent_id, code, name, depth, state,
            can_store_inventory, single_item_only, allow_mixed_sku, max_units
          ) values (
            ${packedRecoveryLocationId}, ${owner.workspaceId}, ${rootLocationId},
            ${appendCodeCheckDigit("P13-RECOVERY")}, '発送前写真回復試験専用棚', 1,
            'active', true, true, false, 1
          )
        `;
        await transaction`set local session_replication_role = replica`;
        await transaction`
          insert into inventory_unit (
            id, workspace_id, sku_id, inventory_number, status, location_id, movement_seq
          ) values (
            ${packedRecoveryUnitId}, ${owner.workspaceId}, ${acquiredItem.skuId},
            ${appendCodeCheckDigit("INV-900006")}, 'picked', ${packedRecoveryLocationId}, 0
          )
        `;
        await transaction`
          insert into sales_order (id, workspace_id, order_number, state, address_mode)
          values (
            ${packedRecoveryOrderId}, ${owner.workspaceId},
            'ORDER-P13-PACKED-RECOVERY', 'picking', 'stored'
          )
        `;
        await transaction`
          insert into order_private_address (
            workspace_id, order_id, ciphertext, nonce, auth_tag, key_version, created_by
          ) values (
            ${owner.workspaceId}, ${packedRecoveryOrderId}, decode('01', 'hex'),
            decode(repeat('00', 12), 'hex'), decode(repeat('00', 16), 'hex'),
            'integration-test-v1', ${owner.identityId}
          )
        `;
        await transaction`
          insert into order_allocation (workspace_id, order_id, inventory_unit_id)
          values (${owner.workspaceId}, ${packedRecoveryOrderId}, ${packedRecoveryUnitId})
        `;
      });
    } finally {
      await recoveryAdmin.end({ timeout: 5 });
    }
    const recoveryMissingSaleDecision = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${packedRecoveryOrderId}/shipping-photo-preflight`,
      headers: { cookie },
      payload: {
        expectedDecisionRevision: null,
        idempotencyKey: randomUUID(),
        humanConfirmed: true,
      },
    });
    assert.equal(recoveryMissingSaleDecision.statusCode, 200, recoveryMissingSaleDecision.body);
    assert.equal(
      recoveryMissingSaleDecision.json<{ decisionReason: string }>().decisionReason,
      "sale_amount_missing",
    );
    const recoverySkip = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${packedRecoveryOrderId}/shipping-photo-override`,
      headers: { cookie },
      payload: {
        choice: "skip_photos",
        expectedDecisionRevision: 1,
        idempotencyKey: randomUUID(),
        humanConfirmed: true,
      },
    });
    assert.equal(recoverySkip.statusCode, 200, recoverySkip.body);
    const recoveryLease = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${packedRecoveryOrderId}/address-leases`,
      headers: { cookie },
      payload: { purpose: "shipping_label", humanConfirmed: true },
    });
    assert.equal(recoveryLease.statusCode, 201, recoveryLease.body);
    const recoveryLeaseId = recoveryLease.json<{ leaseId: string }>().leaseId;
    await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
      await transaction`
        insert into packing_evidence (workspace_id, order_id)
        values (${owner.workspaceId}, ${packedRecoveryOrderId})
      `;
      await transaction`
        update sales_order set state = 'packed'
        where workspace_id = ${owner.workspaceId} and id = ${packedRecoveryOrderId}
      `;
    });
    const losingRecoveryShipKey = randomUUID();
    const [, losingRecoveryShip] = await (async () => {
      const saleWriter = postgres(runtimeUrl, { max: 1 });
      try {
        return await runP13GatedApiRace(
          "P13 sale-first ship race",
          packedRecoveryOrderId,
          "insert into financial_event",
          () =>
            saleWriter.begin(async (transaction) => {
              await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
              await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
              await transaction`select set_config('statement_timeout', '20s', true)`;
              await insertRaceSale(
                transaction,
                packedRecoveryOrderId,
                "梱包後に会計経路から追加された架空販売額",
              );
            }),
          "select id from sales_order",
          () =>
            app.inject({
              method: "POST",
              url: `/v1/workspaces/${owner.workspaceId}/orders/${packedRecoveryOrderId}/ship`,
              headers: { cookie },
              payload: {
                addressLeaseId: recoveryLeaseId,
                idempotencyKey: losingRecoveryShipKey,
                humanConfirmed: true,
              },
            }),
        );
      } finally {
        await saleWriter.end({ timeout: 5 });
      }
    })();
    assert.equal(losingRecoveryShip.statusCode, 409, losingRecoveryShip.body);
    const [saleFirstShipArtifacts] = await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
      return transaction<
        Array<{
          shipment_count: number;
          operation_count: number;
          idempotency_count: number;
          audit_count: number;
          sale_count: number;
          order_state: string;
          inventory_status: string;
        }>
      >`
        select
          (select count(*)::integer from shipment_human_confirmation
           where workspace_id = ${owner.workspaceId}
             and order_id = ${packedRecoveryOrderId}) as shipment_count,
          (select count(*)::integer from order_operation_record
           where workspace_id = ${owner.workspaceId}
             and operation = 'ship'
             and idempotency_key = ${losingRecoveryShipKey}) as operation_count,
          (select count(*)::integer from idempotency_record
           where workspace_id = ${owner.workspaceId}
             and operation = 'ship'
             and idempotency_key = ${losingRecoveryShipKey}) as idempotency_count,
          (select count(*)::integer from audit_event
           where workspace_id = ${owner.workspaceId}
             and action = 'order.ship'
             and target_id = ${packedRecoveryOrderId}) as audit_count,
          (select count(*)::integer from financial_event
           where workspace_id = ${owner.workspaceId}
             and order_id = ${packedRecoveryOrderId}
             and event_type = 'sale') as sale_count,
          orders.state as order_state,
          unit.status as inventory_status
        from sales_order orders
        join order_allocation allocation
          on allocation.workspace_id = orders.workspace_id
         and allocation.order_id = orders.id and allocation.active
        join inventory_unit unit
          on unit.workspace_id = allocation.workspace_id
         and unit.id = allocation.inventory_unit_id
        where orders.workspace_id = ${owner.workspaceId}
          and orders.id = ${packedRecoveryOrderId}
      `;
    });
    assert.deepEqual(
      { ...saleFirstShipArtifacts },
      {
        shipment_count: 0,
        operation_count: 0,
        idempotency_count: 0,
        audit_count: 0,
        sale_count: 1,
        order_state: "packed",
        inventory_status: "packed",
      },
      "A ship losing to a sale must roll back every shipment, idempotency, operation and audit row",
    );
    const stalePackedPreflight = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${packedRecoveryOrderId}/shipping-photo-preflight`,
      headers: { cookie },
    });
    assert.equal(stalePackedPreflight.statusCode, 409, stalePackedPreflight.body);
    assert.equal(
      /6000|threshold|basis|saleAmountMinor|highValueThresholdMinor/iu.test(
        stalePackedPreflight.body,
      ),
      false,
      "A stale preflight response must reveal no amount, threshold, or basis identifier",
    );
    const recoveryAudit = postgres(adminUrl, { max: 1 });
    try {
      const staleSatisfied = await recoveryAudit<Array<{ satisfied: boolean }>>`
        select shipping_photo_preflight_satisfied(
          ${owner.workspaceId}, ${packedRecoveryOrderId}
        ) as satisfied
      `;
      assert.equal(staleSatisfied[0]?.satisfied, false);
    } finally {
      await recoveryAudit.end({ timeout: 5 });
    }
    await assert.rejects(
      () =>
        inventory.begin(async (transaction) => {
          await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
          await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
          await transaction`
            insert into shipment_human_confirmation (
              workspace_id, order_id, idempotency_key, payload_hash
            ) values (
              ${owner.workspaceId}, ${packedRecoveryOrderId}, ${randomUUID()},
              ${hashFixture("stale-packed-shipment")}
            )
          `;
        }),
      hasDatabaseCode("23514"),
      "A stale sale basis must prevent shipment confirmation",
    );
    const refreshedPackedDecision = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${packedRecoveryOrderId}/shipping-photo-preflight`,
      headers: { cookie },
      payload: {
        expectedDecisionRevision: 2,
        idempotencyKey: randomUUID(),
        humanConfirmed: true,
      },
    });
    assert.equal(refreshedPackedDecision.statusCode, 200, refreshedPackedDecision.body);
    assert.deepEqual(
      {
        reason: refreshedPackedDecision.json<{ decisionReason: string }>().decisionReason,
        state: refreshedPackedDecision.json<{ state: string }>().state,
      },
      { reason: "threshold_met", state: "capture_required" },
    );
    const uploadPackedRecoveryPhoto = async (role: "product" | "packed_package") => {
      const query = new URLSearchParams({
        role,
        idempotencyKey: randomUUID(),
        humanConfirmed: "true",
      });
      return app.inject({
        method: "POST",
        url: `/v1/workspaces/${owner.workspaceId}/orders/${packedRecoveryOrderId}/shipping-photos?${query.toString()}`,
        headers: { cookie, "content-type": "image/jpeg" },
        payload: jpegWithGpsMetadata(),
      });
    };
    const recoveryProductPhoto = await uploadPackedRecoveryPhoto("product");
    const recoveryPackedPhoto = await uploadPackedRecoveryPhoto("packed_package");
    assert.equal(recoveryProductPhoto.statusCode, 201, recoveryProductPhoto.body);
    assert.equal(recoveryPackedPhoto.statusCode, 201, recoveryPackedPhoto.body);
    const recoveryConfirmation = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${packedRecoveryOrderId}/shipping-photo-confirmations`,
      headers: { cookie },
      payload: {
        assetIds: [
          recoveryProductPhoto.json<{ assetId: string }>().assetId,
          recoveryPackedPhoto.json<{ assetId: string }>().assetId,
        ],
        idempotencyKey: randomUUID(),
        humanConfirmed: true,
      },
    });
    assert.equal(recoveryConfirmation.statusCode, 201, recoveryConfirmation.body);
    await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
      await transaction`
        insert into shipment_human_confirmation (
          workspace_id, order_id, idempotency_key, payload_hash
        ) values (
          ${owner.workspaceId}, ${packedRecoveryOrderId}, ${randomUUID()},
          ${hashFixture("refreshed-packed-shipment")}
        )
      `;
      await transaction`
        update sales_order set state = 'shipped'
        where workspace_id = ${owner.workspaceId} and id = ${packedRecoveryOrderId}
      `;
    });
    const [recoveredPackedOrder] = await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
      return transaction<Array<{ order_state: string; inventory_status: string }>>`
        select orders.state as order_state, unit.status as inventory_status
        from sales_order orders
        join order_allocation allocation
          on allocation.workspace_id = orders.workspace_id
         and allocation.order_id = orders.id and allocation.active
        join inventory_unit unit
          on unit.workspace_id = allocation.workspace_id
         and unit.id = allocation.inventory_unit_id
        where orders.workspace_id = ${owner.workspaceId} and orders.id = ${packedRecoveryOrderId}
      `;
    });
    assert.deepEqual(
      { ...recoveredPackedOrder },
      { order_state: "shipped", inventory_status: "shipped" },
      "A packed order must recover from a stale sale basis and still ship after re-review",
    );

    const shipFirstOrderId = randomUUID();
    const shipFirstUnitId = randomUUID();
    const shipFirstLocationId = randomUUID();
    const shipFirstSkuId = randomUUID();
    const shipFirstAdmin = postgres(adminUrl, { max: 1 });
    try {
      await shipFirstAdmin.begin(async (transaction) => {
        await transaction`
          insert into product_sku (id, workspace_id, sku_code, title, category)
          values (
            ${shipFirstSkuId}, ${owner.workspaceId}, 'SKU-P13-SHIP-FIRST',
            '発送先行競合試験専用の架空商品', 'トップス'
          )
        `;
        await transaction`
          insert into p0_workflow (workspace_id, sku_id, state, last_action, version)
          values (
            ${owner.workspaceId}, ${shipFirstSkuId}, 'packed', 'confirm_pack', 7
          )
        `;
        await transaction`
          insert into location_node (
            id, workspace_id, parent_id, code, name, depth, state,
            can_store_inventory, single_item_only, allow_mixed_sku, max_units
          ) values (
            ${shipFirstLocationId}, ${owner.workspaceId}, ${rootLocationId},
            ${appendCodeCheckDigit("P13-SHIP-FIRST")}, '発送先行競合試験専用棚', 1,
            'active', true, true, false, 1
          )
        `;
        await transaction`set local session_replication_role = replica`;
        await transaction`
          insert into inventory_unit (
            id, workspace_id, sku_id, inventory_number, status, location_id, movement_seq
          ) values (
            ${shipFirstUnitId}, ${owner.workspaceId}, ${shipFirstSkuId},
            ${appendCodeCheckDigit("INV-900007")}, 'picked', ${shipFirstLocationId}, 0
          )
        `;
        await transaction`
          insert into sales_order (id, workspace_id, order_number, state, address_mode)
          values (
            ${shipFirstOrderId}, ${owner.workspaceId},
            'ORDER-P13-SHIP-FIRST-RACE', 'picking', 'stored'
          )
        `;
        await transaction`
          insert into order_private_address (
            workspace_id, order_id, ciphertext, nonce, auth_tag, key_version, created_by
          ) values (
            ${owner.workspaceId}, ${shipFirstOrderId}, decode('01', 'hex'),
            decode(repeat('00', 12), 'hex'), decode(repeat('00', 16), 'hex'),
            'integration-test-v1', ${owner.identityId}
          )
        `;
        await transaction`
          insert into order_allocation (workspace_id, order_id, inventory_unit_id)
          values (${owner.workspaceId}, ${shipFirstOrderId}, ${shipFirstUnitId})
        `;
      });
    } finally {
      await shipFirstAdmin.end({ timeout: 5 });
    }
    const shipFirstMissingSaleDecision = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${shipFirstOrderId}/shipping-photo-preflight`,
      headers: { cookie },
      payload: {
        expectedDecisionRevision: null,
        idempotencyKey: randomUUID(),
        humanConfirmed: true,
      },
    });
    assert.equal(shipFirstMissingSaleDecision.statusCode, 200, shipFirstMissingSaleDecision.body);
    assert.equal(
      shipFirstMissingSaleDecision.json<{ decisionReason: string }>().decisionReason,
      "sale_amount_missing",
    );
    const shipFirstSkip = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${shipFirstOrderId}/shipping-photo-override`,
      headers: { cookie },
      payload: {
        choice: "skip_photos",
        expectedDecisionRevision: 1,
        idempotencyKey: randomUUID(),
        humanConfirmed: true,
      },
    });
    assert.equal(shipFirstSkip.statusCode, 200, shipFirstSkip.body);
    const shipFirstLease = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${shipFirstOrderId}/address-leases`,
      headers: { cookie },
      payload: { purpose: "shipping_label", humanConfirmed: true },
    });
    assert.equal(shipFirstLease.statusCode, 201, shipFirstLease.body);
    const shipFirstLeaseId = shipFirstLease.json<{ leaseId: string }>().leaseId;
    await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
      await transaction`
        insert into packing_evidence (workspace_id, order_id)
        values (${owner.workspaceId}, ${shipFirstOrderId})
      `;
      await transaction`
        update sales_order set state = 'packed'
        where workspace_id = ${owner.workspaceId} and id = ${shipFirstOrderId}
      `;
    });
    const [saleAuditBeforeShipFirst] = await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
      return transaction<Array<{ audit_count: number }>>`
        select count(*)::integer as audit_count
        from audit_event
        where workspace_id = ${owner.workspaceId}
          and action = 'order.sale_amount.recorded'
      `;
    });
    assert.ok(saleAuditBeforeShipFirst);
    const shipFirstShipKey = randomUUID();
    const [winningShip] = await (async () => {
      const saleWriter = postgres(runtimeUrl, { max: 1 });
      try {
        return await runP13GatedApiRace(
          "P13 ship-first sale race",
          shipFirstOrderId,
          "select id from sales_order",
          () =>
            app.inject({
              method: "POST",
              url: `/v1/workspaces/${owner.workspaceId}/orders/${shipFirstOrderId}/ship`,
              headers: { cookie },
              payload: {
                addressLeaseId: shipFirstLeaseId,
                idempotencyKey: shipFirstShipKey,
                humanConfirmed: true,
              },
            }),
          "insert into financial_event",
          () =>
            saleWriter.begin(async (transaction) => {
              await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
              await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
              await transaction`select set_config('statement_timeout', '20s', true)`;
              await insertRaceSale(
                transaction,
                shipFirstOrderId,
                "発送確定後に会計経路から保存された架空販売額",
                shipFirstSkuId,
              );
            }),
        );
      } finally {
        await saleWriter.end({ timeout: 5 });
      }
    })();
    assert.equal(winningShip.statusCode, 200, winningShip.body);
    const staleAfterShipFirst = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${shipFirstOrderId}/shipping-photo-preflight`,
      headers: { cookie },
    });
    assert.equal(staleAfterShipFirst.statusCode, 409, staleAfterShipFirst.body);
    assert.equal(
      /6000|threshold|basis|saleAmountMinor|highValueThresholdMinor/iu.test(
        staleAfterShipFirst.body,
      ),
      false,
      "A sale committed after shipment must expose only the generic stale response",
    );
    const shipFirstAudit = postgres(adminUrl, { max: 1 });
    try {
      const staleSatisfied = await shipFirstAudit<Array<{ satisfied: boolean }>>`
        select shipping_photo_preflight_satisfied(
          ${owner.workspaceId}, ${shipFirstOrderId}
        ) as satisfied
      `;
      assert.equal(staleSatisfied[0]?.satisfied, false);
    } finally {
      await shipFirstAudit.end({ timeout: 5 });
    }
    const rejectedPostShipSaleKey = randomUUID();
    const rejectedPostShipSale = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${shipFirstOrderId}/sale-amount`,
      headers: { cookie },
      payload: {
        saleAmountMinor: 7000,
        taxBasis: "tax_included",
        sourceMeaning: "発送後なので本人後入力を拒否する架空販売額",
        occurredAt: "2033-02-02T00:00:00.000Z",
        idempotencyKey: rejectedPostShipSaleKey,
        humanConfirmed: true,
      },
    });
    assert.equal(rejectedPostShipSale.statusCode, 409, rejectedPostShipSale.body);
    const [shipFirstArtifacts] = await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`select set_config('app.identity_id', ${owner.identityId}, true)`;
      return transaction<
        Array<{
          shipment_count: number;
          operation_count: number;
          sale_count: number;
          sale_idempotency_count: number;
          sale_audit_count: number;
          ship_audit_count: number;
          workflow_action_count: number;
          order_state: string;
          inventory_status: string;
          workflow_state: string;
        }>
      >`
        select
          (select count(*)::integer from shipment_human_confirmation
           where workspace_id = ${owner.workspaceId}
             and order_id = ${shipFirstOrderId}) as shipment_count,
          (select count(*)::integer from order_operation_record
           where workspace_id = ${owner.workspaceId}
             and operation = 'ship'
             and idempotency_key = ${shipFirstShipKey}) as operation_count,
          (select count(*)::integer from financial_event
           where workspace_id = ${owner.workspaceId}
             and order_id = ${shipFirstOrderId}
             and event_type = 'sale') as sale_count,
          (select count(*)::integer from idempotency_record
           where workspace_id = ${owner.workspaceId}
             and operation = 'order_sale_amount'
             and idempotency_key = ${rejectedPostShipSaleKey}) as sale_idempotency_count,
          (select count(*)::integer from audit_event
           where workspace_id = ${owner.workspaceId}
             and action = 'order.sale_amount.recorded') as sale_audit_count,
          (select count(*)::integer from audit_event
           where workspace_id = ${owner.workspaceId}
             and action = 'order.ship'
             and target_id = ${shipFirstOrderId}) as ship_audit_count,
          (select count(*)::integer from p0_workflow_action
           where workspace_id = ${owner.workspaceId}
             and sku_id = ${shipFirstSkuId}
             and action = 'confirm_ship'
             and idempotency_key = ${shipFirstShipKey}) as workflow_action_count,
          orders.state as order_state,
          unit.status as inventory_status,
          workflow.state as workflow_state
        from sales_order orders
        join order_allocation allocation
          on allocation.workspace_id = orders.workspace_id
         and allocation.order_id = orders.id and allocation.active
        join inventory_unit unit
          on unit.workspace_id = allocation.workspace_id
         and unit.id = allocation.inventory_unit_id
        join p0_workflow workflow
          on workflow.workspace_id = unit.workspace_id
         and workflow.sku_id = unit.sku_id
        where orders.workspace_id = ${owner.workspaceId}
          and orders.id = ${shipFirstOrderId}
      `;
    });
    assert.deepEqual(
      { ...shipFirstArtifacts },
      {
        shipment_count: 1,
        operation_count: 1,
        sale_count: 1,
        sale_idempotency_count: 0,
        sale_audit_count: saleAuditBeforeShipFirst.audit_count,
        ship_audit_count: 1,
        workflow_action_count: 1,
        order_state: "shipped",
        inventory_status: "shipped",
        workflow_state: "shipped",
      },
      "Shipment must commit before the waiting accounting sale makes the basis stale; the API replay must add nothing",
    );

    const postReplacementPreflight = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/accounting/exports/preflight?orderId=${orderId}`,
      headers: { cookie: accountingCookie },
    });
    assert.equal(postReplacementPreflight.statusCode, 200, postReplacementPreflight.body);
    assert.deepEqual(
      {
        canCreateFresh: postReplacementPreflight.json<{ canCreateFresh: boolean }>().canCreateFresh,
        canSupersede: postReplacementPreflight.json<{ canSupersede: boolean }>().canSupersede,
      },
      { canCreateFresh: true, canSupersede: false },
      "A complete financial history with multiple sale events must remain exportable",
    );
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
        insert into sales_order (id, workspace_id, order_number, state, address_mode)
        values (
          ${blockedOrderId}, ${owner.workspaceId},
          ${`SO-SOLO-${blockedOrderId.slice(0, 8)}`}, 'confirmed', 'anonymous'
        )
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
      const restoredSameLocationDiscrepancy = restoredSameLocation
        .json<StocktakeResponse>()
        .discrepancies.find(
          (discrepancy) => discrepancy.discrepancyId === dualSameDiscrepancy.discrepancyId,
        );
      assert.equal(
        restoredSameLocationDiscrepancy?.confirmedReasonCode,
        "not_seen_during_count",
        "The confirmation timeline must keep its original immutable audit reason",
      );
      assert.equal(
        restoredSameLocationDiscrepancy?.restoredReasonCode,
        "found_in_place",
        "The restoration timeline must read the later immutable audit reason separately",
      );

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

  const top02PilotIdentifiers = listingPrepPilotItemIdentifiers(pilotRunId, "TOP-02");
  const interruptedPilotItem = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/p0-items`,
    headers: { cookie },
    payload: {
      skuCode: top02PilotIdentifiers.skuCode,
      title: top02PilotFixture.title,
      category: "トップス",
      measurementTemplateId: top02PilotFixture.templateId,
      supplierName: "架空テスト仕入先",
      receiptReference: top02PilotIdentifiers.receiptReference,
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

  const externalPilotStarted = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/pilot-runs`,
    headers: { cookie },
    payload: {
      protocolVersion: listingPrepPilotProtocolVersion,
      fixtureManifestSha256: listingPrepPilotFixtureManifestSha256,
      commitSha: "d".repeat(40),
      migrationVersion: listingPrepPilotMigrationVersion,
      platform: "Windows external-incident fixture",
      browser: "Chromium external-incident fixture",
      viewport: "390x844",
      warmupCompleted: true,
      humanConfirmed: true,
    },
  });
  assert.equal(externalPilotStarted.statusCode, 201, externalPilotStarted.body);
  const externalPilotRunId = externalPilotStarted.json<{ runId: string }>().runId;
  const externalRestartIdentifiers = listingPrepPilotItemIdentifiers(externalPilotRunId, "TOP-01");
  const externalRestartPayload = {
    skuCode: externalRestartIdentifiers.skuCode,
    title: top01PilotFixture.title,
    category: "トップス",
    measurementTemplateId: top01PilotFixture.templateId,
    supplierName: "架空テスト仕入先",
    receiptReference: externalRestartIdentifiers.receiptReference,
    purchasedAt: new Date().toISOString(),
    receiptAmountMinor: 1300,
    allocatedCostMinor: 1300,
    idempotencyKey: randomUUID(),
    humanConfirmed: true,
    pilot: { runId: externalPilotRunId, productFixtureId: "TOP-01" },
  } as const;
  const mismatchedExternalRestart = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/p0-items`,
    headers: { cookie },
    payload: {
      ...externalRestartPayload,
      skuCode: "PILOT-TOP-01",
      receiptReference: "PILOT-REC-TOP-01",
      idempotencyKey: randomUUID(),
    },
  });
  assert.equal(mismatchedExternalRestart.statusCode, 409, mismatchedExternalRestart.body);
  assert.match(mismatchedExternalRestart.body, /must exactly match the run and fixture/iu);
  const externalRestartItem = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/p0-items`,
    headers: { cookie },
    payload: externalRestartPayload,
  });
  assert.equal(externalRestartItem.statusCode, 201, externalRestartItem.body);
  const externalRestartItemBody = externalRestartItem.json<{
    skuCode: string;
    receiptReference: string;
  }>();
  assert.equal(externalRestartItemBody.skuCode, externalRestartIdentifiers.skuCode);
  assert.equal(
    externalRestartItemBody.receiptReference,
    externalRestartIdentifiers.receiptReference,
  );
  const externalInvalidationKey = randomUUID();
  const externalInvalidationPayload = {
    reasonCode: "power_outage",
    idempotencyKey: externalInvalidationKey,
    humanConfirmed: true,
  } as const;
  const workerExternalInvalidation = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/pilot-runs/${externalPilotRunId}/external-invalidation`,
    headers: { cookie: workerCookie },
    payload: externalInvalidationPayload,
  });
  assert.equal(workerExternalInvalidation.statusCode, 403, workerExternalInvalidation.body);
  const externalInvalidation = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/pilot-runs/${externalPilotRunId}/external-invalidation`,
    headers: { cookie },
    payload: externalInvalidationPayload,
  });
  assert.equal(externalInvalidation.statusCode, 200, externalInvalidation.body);
  const externalInvalidationBody = externalInvalidation.json<{
    state: string;
    externallyInvalidated: boolean;
    externalInvalidationReason: string | null;
  }>();
  assert.equal(externalInvalidationBody.state, "externally_invalidated");
  assert.equal(externalInvalidationBody.externallyInvalidated, true);
  assert.equal(externalInvalidationBody.externalInvalidationReason, "power_outage");
  const externalInvalidationReplay = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/pilot-runs/${externalPilotRunId}/external-invalidation`,
    headers: { cookie },
    payload: externalInvalidationPayload,
  });
  assert.equal(externalInvalidationReplay.statusCode, 200, externalInvalidationReplay.body);
  assert.deepEqual(externalInvalidationReplay.json(), externalInvalidation.json());
  const externalInvalidationPayloadConflict = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/pilot-runs/${externalPilotRunId}/external-invalidation`,
    headers: { cookie },
    payload: { ...externalInvalidationPayload, reasonCode: "os_forced_update" },
  });
  assert.equal(
    externalInvalidationPayloadConflict.statusCode,
    409,
    externalInvalidationPayloadConflict.body,
  );
  const externalInvalidationTerminalConflict = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/pilot-runs/${externalPilotRunId}/external-invalidation`,
    headers: { cookie },
    payload: { ...externalInvalidationPayload, idempotencyKey: randomUUID() },
  });
  assert.equal(
    externalInvalidationTerminalConflict.statusCode,
    409,
    externalInvalidationTerminalConflict.body,
  );
  const externalInvalidationAudit = postgres(adminUrl, { max: 1 });
  try {
    const records = await externalInvalidationAudit<
      Array<{ action: string; reason_code: string; event_count: number }>
    >`
      select action, reason_code, count(*)::integer as event_count
      from audit_event
      where workspace_id = ${owner.workspaceId} and target_id = ${externalPilotRunId}
        and action = 'pilot_run.externally_invalidated'
      group by action, reason_code
    `;
    assert.deepEqual(
      [...records],
      [
        {
          action: "pilot_run.externally_invalidated",
          reason_code: "power_outage",
          event_count: 1,
        },
      ],
    );
  } finally {
    await externalInvalidationAudit.end({ timeout: 5 });
  }

  const postExternalPilotStarted = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/pilot-runs`,
    headers: { cookie },
    payload: {
      protocolVersion: listingPrepPilotProtocolVersion,
      fixtureManifestSha256: listingPrepPilotFixtureManifestSha256,
      commitSha: "e".repeat(40),
      migrationVersion: listingPrepPilotMigrationVersion,
      platform: "Windows post-external restart fixture",
      browser: "Chromium post-external restart fixture",
      viewport: "390x844",
      warmupCompleted: true,
      humanConfirmed: true,
    },
  });
  assert.equal(postExternalPilotStarted.statusCode, 201, postExternalPilotStarted.body);
  const postExternalPilotRunId = postExternalPilotStarted.json<{ runId: string }>().runId;
  const postExternalIdentifiers = listingPrepPilotItemIdentifiers(postExternalPilotRunId, "TOP-01");
  assert.notEqual(postExternalIdentifiers.skuCode, top01PilotIdentifiers.skuCode);
  assert.notEqual(postExternalIdentifiers.skuCode, externalRestartIdentifiers.skuCode);
  assert.notEqual(
    postExternalIdentifiers.receiptReference,
    externalRestartIdentifiers.receiptReference,
  );
  const postExternalRestartItem = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/p0-items`,
    headers: { cookie },
    payload: {
      skuCode: postExternalIdentifiers.skuCode,
      title: top01PilotFixture.title,
      category: "トップス",
      measurementTemplateId: top01PilotFixture.templateId,
      supplierName: "架空テスト仕入先",
      receiptReference: postExternalIdentifiers.receiptReference,
      purchasedAt: new Date().toISOString(),
      receiptAmountMinor: 1400,
      allocatedCostMinor: 1400,
      idempotencyKey: randomUUID(),
      humanConfirmed: true,
      pilot: { runId: postExternalPilotRunId, productFixtureId: "TOP-01" },
    },
  });
  assert.equal(postExternalRestartItem.statusCode, 201, postExternalRestartItem.body);
  const postExternalRestartItemBody = postExternalRestartItem.json<{
    skuCode: string;
    receiptReference: string;
  }>();
  assert.equal(postExternalRestartItemBody.skuCode, postExternalIdentifiers.skuCode);
  assert.equal(
    postExternalRestartItemBody.receiptReference,
    postExternalIdentifiers.receiptReference,
  );
  const postExternalRestartCleanup = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.workspaceId}/pilot-runs/${postExternalPilotRunId}/events`,
    headers: { cookie },
    payload: {
      eventType: "invalid_attempt",
      detailCode: "integration_restart_proof_complete",
      idempotencyKey: randomUUID(),
      humanConfirmed: true,
    },
  });
  assert.equal(postExternalRestartCleanup.statusCode, 201, postExternalRestartCleanup.body);
  assert.equal(postExternalRestartCleanup.json<{ state: string }>().state, "failed");

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
  "postgres-integration: PASS (restricted role, 65-table RLS matrix, P14 collision-free server order numbering, managed shipping-method revisions, assigned minimal shipping context, order-scoped assigned zero-GPS location derivative, explicit missing-information acknowledgement and frozen shipment fee, assigned inspection concerns with deferred latest-state exact-set consistency, terminal human dismissal, separate prior-recorder review, P13 three-mode shipping-photo policy, immutable private sale-basis snapshots, exact-set private photo confirmation, server packing and separate shipment confirmation, non-probeable session-bound access and denied cross-workspace/role/expired assignment access, append-only server-timed pilot exceptions, purchase-to-versioned-accounting order flow, encrypted 5-minute address lease, checked inventory/location codes, persisted capture/research/listing evidence, reviewed zero-GPS location photo, double scan, immutable stocktake snapshot, complete read evidence, post-start movement separation, audited stale-label rejection, DB-enforced mode-aware solo/dual stocktake approval, approved dual candidate restored by its original owner at the same or a moved location without direct scan UPDATE, exact 27-column accounting CSV, return quarantine, stocktake and label reissue, logout)\n",
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
