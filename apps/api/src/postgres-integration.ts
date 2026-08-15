import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { appendCodeCheckDigit } from "@resale/contracts";
import { buildApp } from "./app.js";
import { hashPassword, PostgresLoginService } from "./auth.js";
import { bootstrapInitialOwner } from "./bootstrap-owner.js";
import { assertRestrictedDatabaseRole } from "./db-security.js";
import { LocalPrivateMediaStore } from "./local-media-store.js";
import { PostgresWorkflowRepository } from "./repository.js";
import { createCookieAuthenticator, PostgresSessionRegistry } from "./session.js";
import { AesGcmAddressCipher } from "./address-crypto.js";
import { PostgresOrderRepository } from "./order-repository.js";
import { PostgresP0ItemRepository } from "./p0-item-repository.js";

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

const workspaceProtectedTables = [
  "audit_event",
  "accounting_export",
  "address_access_lease",
  "count_observation",
  "count_session",
  "cost_allocation",
  "financial_event",
  "idempotency_record",
  "inventory_discrepancy",
  "inventory_label",
  "inventory_movement",
  "inventory_unit",
  "location_node",
  "location_photo",
  "measurement_attempt",
  "media_asset",
  "order_allocation",
  "order_operation_record",
  "order_assignment",
  "order_private_address",
  "outbox_event",
  "p0_workflow",
  "p0_workflow_action",
  "product_sku",
  "purchase_batch",
  "packing_evidence",
  "return_inspection",
  "receipt",
  "sales_order",
  "scan_session",
  "sku_work_assignment",
  "workspace_membership",
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

  const workerId = randomUUID();
  const shippingId = randomUUID();
  const rootLocationId = randomUUID();
  const binAId = randomUUID();
  const binBId = randomUUID();
  const capacityBinId = randomUUID();
  const returnBinId = randomUUID();
  const unitOneId = randomUUID();
  const unitTwoId = randomUUID();
  const unitThreeId = randomUUID();
  const unitFourId = randomUUID();
  const itemLabelOneId = randomUUID();
  const itemLabelTwoId = randomUUID();
  const itemLabelThreeId = randomUUID();
  const itemLabelFourId = randomUUID();
  const binALabelId = randomUUID();
  const binBLabelId = randomUUID();
  const capacityBinLabelId = randomUUID();
  const returnBinLabelId = randomUUID();
  const workerPassword = "fictional-field-worker-password";
  const workerPasswordRecord = await hashPassword(workerPassword);
  const shippingPassword = "fictional-shipping-password";
  const shippingPasswordRecord = await hashPassword(shippingPassword);
  const fixtureAdmin = postgres(adminUrl, { max: 1 });
  try {
    await fixtureAdmin`
      insert into app_identity (id, display_name) values
        (${workerId}, '架空在庫担当'),
        (${shippingId}, '架空配送担当')
    `;
    await fixtureAdmin`
      insert into workspace_membership (workspace_id, identity_id, role) values
        (${owner.workspaceId}, ${workerId}, 'field_worker'),
        (${owner.workspaceId}, ${shippingId}, 'shipping')
    `;
    await fixtureAdmin`
      insert into auth_credential (
        identity_id, email_normalized, password_hash, password_salt,
        hash_algorithm, scrypt_n, scrypt_r, scrypt_p
      ) values
      (
        ${workerId}, 'worker@example.test', ${workerPasswordRecord.hash},
        ${workerPasswordRecord.salt}, 'scrypt-v1', ${workerPasswordRecord.n},
        ${workerPasswordRecord.r}, ${workerPasswordRecord.p}
      ),
      (
        ${shippingId}, 'shipping@example.test', ${shippingPasswordRecord.hash},
        ${shippingPasswordRecord.salt}, 'scrypt-v1', ${shippingPasswordRecord.n},
        ${shippingPasswordRecord.r}, ${shippingPasswordRecord.p}
      )
    `;
  } finally {
    await fixtureAdmin.end({ timeout: 5 });
  }

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
  const shippingLogin = await app.inject({
    method: "POST",
    url: "/v1/session/login",
    payload: { email: "shipping@example.test", password: shippingPassword },
  });
  assert.equal(shippingLogin.statusCode, 204, shippingLogin.body);
  const shippingSetCookie = shippingLogin.headers["set-cookie"];
  assert.equal(typeof shippingSetCookie, "string");
  const shippingCookie = String(shippingSetCookie).split(";", 1)[0];
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

  const skuAssignmentAdmin = postgres(adminUrl, { max: 1 });
  try {
    await skuAssignmentAdmin`
      insert into sku_work_assignment (
        workspace_id, identity_id, sku_id, operation, starts_at, expires_at, created_by
      ) values (
        ${owner.workspaceId}, ${workerId}, ${skuId}, 'capture',
        now() - interval '1 minute', now() + interval '1 hour', ${owner.identityId}
      )
    `;
  } finally {
    await skuAssignmentAdmin.end({ timeout: 5 });
  }
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
          (${binAId}, ${owner.workspaceId}, ${rootLocationId}, ${appendCodeCheckDigit("BIN-A")}, '棚A-1', 1, true, true, false, 1),
          (${binBId}, ${owner.workspaceId}, ${rootLocationId}, ${appendCodeCheckDigit("BIN-B")}, '棚B-1', 1, true, true, false, 1),
          (${capacityBinId}, ${owner.workspaceId}, ${rootLocationId}, ${appendCodeCheckDigit("BIN-C")}, '同時格納試験棚', 1, true, true, false, 1),
          (${returnBinId}, ${owner.workspaceId}, ${rootLocationId}, ${appendCodeCheckDigit("RETURN-01")}, '返品隔離棚', 1, true, false, true, 20)
      `;
      await transaction`
        insert into inventory_unit (id, workspace_id, sku_id, inventory_number) values
          (${unitOneId}, ${owner.workspaceId}, ${skuId}, ${appendCodeCheckDigit("INV-900001")}),
          (${unitTwoId}, ${owner.workspaceId}, ${skuId}, ${appendCodeCheckDigit("INV-900002")}),
          (${unitThreeId}, ${owner.workspaceId}, ${skuId}, ${appendCodeCheckDigit("INV-900003")}),
          (${unitFourId}, ${owner.workspaceId}, ${skuId}, ${appendCodeCheckDigit("INV-900004")})
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

    const assignmentAdmin = postgres(adminUrl, { max: 1 });
    try {
      await assignmentAdmin`
        insert into work_assignment (
          workspace_id, identity_id, location_root_id, operation,
          starts_at, expires_at, created_by
        ) values
          (
            ${owner.workspaceId}, ${workerId}, ${binBId}, 'putaway',
            now() - interval '1 minute', now() + interval '1 hour', ${owner.identityId}
          ),
          (
            ${owner.workspaceId}, ${workerId}, ${binBId}, 'photo',
            now() - interval '1 minute', now() + interval '1 hour', ${owner.identityId}
          )
      `;
    } finally {
      await assignmentAdmin.end({ timeout: 5 });
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

    const countSessionId = randomUUID();
    const discrepancyId = randomUUID();
    await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`
        insert into count_session (
          id, workspace_id, location_id, state, basis_movement_seq,
          initial_counter_id, started_at
        ) values (
          ${countSessionId}, ${owner.workspaceId}, ${binAId}, 'reconciliation', 1,
          ${owner.identityId}, now()
        )
      `;
      await transaction`
        insert into inventory_discrepancy (
          id, workspace_id, count_session_id, inventory_unit_id, kind, state, requester_id
        ) values (
          ${discrepancyId}, ${owner.workspaceId}, ${countSessionId}, ${unitOneId},
          'missing_candidate', 'reconfirmation_required', ${shippingId}
        )
      `;
    });
    await assert.rejects(
      () =>
        inventory.begin(async (transaction) => {
          await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
          await transaction`
            update inventory_discrepancy
            set state = 'resolved', reconfirmer_id = ${owner.identityId},
                approver_id = ${owner.identityId}, resolution = '架空試験で再発見', resolved_at = now()
            where workspace_id = ${owner.workspaceId} and id = ${discrepancyId}
          `;
        }),
      /initial counter and reconfirmer/u,
    );
    await inventory.begin(async (transaction) => {
      await transaction`select set_config('app.workspace_id', ${owner.workspaceId}, true)`;
      await transaction`
        update inventory_discrepancy
        set state = 'resolved', reconfirmer_id = ${workerId},
            approver_id = ${owner.identityId}, resolution = '架空試験で再発見', resolved_at = now()
        where workspace_id = ${owner.workspaceId} and id = ${discrepancyId}
      `;
    });

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
    const exportKey = randomUUID();
    const accountingExport = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/accounting-exports`,
      headers: { cookie },
      payload: {
        approvedAt: new Date().toISOString(),
        idempotencyKey: exportKey,
        humanApproved: true,
      },
    });
    assert.equal(accountingExport.statusCode, 201, accountingExport.body);
    assert.equal(accountingExport.json<{ rowCount: number }>().rowCount, 5);
    const csvContent = await app.inject({
      method: "GET",
      url: accountingExport.json<{ contentUrl: string }>().contentUrl,
      headers: { cookie },
    });
    assert.equal(csvContent.statusCode, 200, csvContent.body);
    assert.equal(csvContent.headers["cache-control"], "private, no-store");
    assert.equal(
      csvContent.headers["x-content-sha256"],
      accountingExport.json<{ sha256: string }>().sha256,
    );
    assert.equal(csvContent.body.includes("販売額の仕訳候補"), true);
    const journalReadModel = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${owner.workspaceId}/p0-items`,
      headers: { cookie },
    });
    const journalItem = journalReadModel
      .json<Array<{ skuId: string; workflowState: string }>>()
      .find((entry) => entry.skuId === acquiredItem.skuId);
    assert.equal(journalItem?.workflowState, "journal_approved");

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
    const quarantined = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/orders/${orderId}/return-quarantine`,
      headers: { cookie },
      payload: {
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
      },
    });
    assert.equal(quarantined.statusCode, 200, quarantined.body);
    assert.equal(quarantined.json<{ inventoryStatus: string }>().inventoryStatus, "quarantined");
    const inspected = await app.inject({
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
    assert.equal(inspected.statusCode, 200, inspected.body);
    assert.equal(inspected.json<{ inventoryStatus: string }>().inventoryStatus, "available");

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
    } finally {
      await secrecyAdmin.end({ timeout: 5 });
    }
  } finally {
    await inventory.end({ timeout: 5 });
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
  "postgres-integration: PASS (restricted role, 33-table RLS matrix, purchase-to-accounting order flow, assigned shipping with encrypted 5-minute address lease, checked inventory/location codes, persisted capture/listing evidence, reviewed zero-GPS location photo, double scan, return quarantine, stocktake, logout)\n",
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
