import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { buildApp } from "./app.js";
import { hashPassword, PostgresLoginService } from "./auth.js";
import { bootstrapInitialOwner } from "./bootstrap-owner.js";
import { assertRestrictedDatabaseRole } from "./db-security.js";
import { LocalPrivateMediaStore } from "./local-media-store.js";
import { PostgresWorkflowRepository } from "./repository.js";
import { createCookieAuthenticator, PostgresSessionRegistry } from "./session.js";

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
  "count_observation",
  "count_session",
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
  "outbox_event",
  "p0_workflow",
  "p0_workflow_action",
  "product_sku",
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
  const workerPassword = "fictional-field-worker-password";
  const workerPasswordRecord = await hashPassword(workerPassword);
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
      ) values (
        ${workerId}, 'worker@example.test', ${workerPasswordRecord.hash},
        ${workerPasswordRecord.salt}, 'scrypt-v1', ${workerPasswordRecord.n},
        ${workerPasswordRecord.r}, ${workerPasswordRecord.p}
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
  const captureAssetPayload = {
    assetId: captureAssetId,
    role: "front",
    originalSha256: hashFixture("field-worker-capture"),
    originalStorageKey: `workspaces/${owner.workspaceId}/originals/${captureAssetId}.jpg`,
    mimeType: "image/jpeg",
    sizeBytes: 4096,
    width: 2000,
    height: 2000,
  } as const;
  const captureAssetUrl = `/v1/workspaces/${owner.workspaceId}/skus/${skuId}/media-assets`;
  const workerMediaWithoutAssignment = await app.inject({
    method: "POST",
    url: captureAssetUrl,
    headers: { cookie: workerCookie },
    payload: captureAssetPayload,
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
    url: captureAssetUrl,
    headers: { cookie: workerCookie },
    payload: captureAssetPayload,
  });
  assert.equal(workerMediaWithAssignment.statusCode, 201, workerMediaWithAssignment.body);
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
  assert.equal(workerCaptureWithAssignment.statusCode, 200, workerCaptureWithAssignment.body);

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
          (${rootLocationId}, ${owner.workspaceId}, null, 'ROOM-01', '架空保管室', 0, false, false, true, null),
          (${binAId}, ${owner.workspaceId}, ${rootLocationId}, 'BIN-A', '棚A-1', 1, true, true, false, 1),
          (${binBId}, ${owner.workspaceId}, ${rootLocationId}, 'BIN-B', '棚B-1', 1, true, true, false, 1),
          (${capacityBinId}, ${owner.workspaceId}, ${rootLocationId}, 'BIN-C', '同時格納試験棚', 1, true, true, false, 1)
      `;
      await transaction`
        insert into inventory_unit (id, workspace_id, sku_id, inventory_number) values
          (${unitOneId}, ${owner.workspaceId}, ${skuId}, 'INV-900001'),
          (${unitTwoId}, ${owner.workspaceId}, ${skuId}, 'INV-900002'),
          (${unitThreeId}, ${owner.workspaceId}, ${skuId}, 'INV-900003'),
          (${unitFourId}, ${owner.workspaceId}, ${skuId}, 'INV-900004')
      `;
      await transaction`
        insert into inventory_label (
          id, workspace_id, target_type, target_id, label_kind, version,
          token_hash, short_code, issued_by
        ) values
          (${itemLabelOneId}, ${owner.workspaceId}, 'inventory_unit', ${unitOneId}, 'qr', 1, ${hashFixture("item-1")}, 'ITEM-900001', ${owner.identityId}),
          (${itemLabelTwoId}, ${owner.workspaceId}, 'inventory_unit', ${unitTwoId}, 'qr', 1, ${hashFixture("item-2")}, 'ITEM-900002', ${owner.identityId}),
          (${itemLabelThreeId}, ${owner.workspaceId}, 'inventory_unit', ${unitThreeId}, 'qr', 1, ${hashFixture("item-3")}, 'ITEM-900003', ${owner.identityId}),
          (${itemLabelFourId}, ${owner.workspaceId}, 'inventory_unit', ${unitFourId}, 'qr', 1, ${hashFixture("item-4")}, 'ITEM-900004', ${owner.identityId}),
          (${binALabelId}, ${owner.workspaceId}, 'location', ${binAId}, 'qr', 1, ${hashFixture("bin-a")}, 'PLACE-BIN-A', ${owner.identityId}),
          (${binBLabelId}, ${owner.workspaceId}, 'location', ${binBId}, 'qr', 1, ${hashFixture("bin-b")}, 'PLACE-BIN-B', ${owner.identityId}),
          (${capacityBinLabelId}, ${owner.workspaceId}, 'location', ${capacityBinId}, 'qr', 1, ${hashFixture("bin-c")}, 'PLACE-BIN-C', ${owner.identityId})
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
      inventoryNumber: "INV-900002",
      locationCode: "BIN-B",
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
    const workerPutawayOutsideBranch = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${owner.workspaceId}/inventory/putaway`,
      headers: { cookie: workerCookie },
      payload: {
        ...apiPutawayPayload,
        inventoryNumber: "INV-900001",
        locationCode: "BIN-A",
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
      inventoryNumber: "INV-900002",
      status: "available",
      locationId: binBId,
      locationCode: "BIN-B",
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
      payload: { ...apiPutawayPayload, locationCode: "BIN-A" },
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
  "postgres-integration: PASS (restricted role, 23-table RLS matrix, location/SKU assignment-scoped field worker, reviewed zero-GPS location photo, login, double scan, capacity, allocation, stocktake, logout)\n",
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
