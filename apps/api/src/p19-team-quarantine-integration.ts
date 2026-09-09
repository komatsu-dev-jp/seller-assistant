import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import postgres from "postgres";
import { appendCodeCheckDigit } from "@resale/contracts";
import { PostgresTeamRepository } from "./team-repository.js";
import { PostgresWorkflowRepository } from "./repository.js";
import { PostgresP0ItemRepository } from "./p0-item-repository.js";
import { PostgresOrderRepository } from "./order-repository.js";
import { buildApp } from "./app.js";

const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
const runtimeUrl = process.env.TEST_DATABASE_URL;
if (
  !adminUrl ||
  !runtimeUrl ||
  new URL(adminUrl).hostname !== "127.0.0.1" ||
  new URL(runtimeUrl).hostname !== "127.0.0.1"
)
  throw new Error("Dedicated loopback test databases required");
const admin = postgres(adminUrl, { max: 2 });
const runtime = postgres(runtimeUrl, { max: 2 });
const team = new PostgresTeamRepository(runtimeUrl);
const workflow = new PostgresWorkflowRepository(runtimeUrl);
const p0 = new PostgresP0ItemRepository(runtimeUrl);
const orders = new PostgresOrderRepository(runtimeUrl);
const workspaceId = randomUUID();
const foreignWorkspace = randomUUID();
const owner = randomUUID();
const manager = randomUUID();
const manager2 = randomUUID();
const worker = randomUUID();
const shipper = randomUUID();
const accounting = randomUUID();
const app = buildApp({
  repository: workflow,
  teamRepository: team,
  p0ItemRepository: p0,
  orderRepository: orders,
  authenticate: (headers) =>
    typeof headers["x-test-actor"] === "string"
      ? { identityId: headers["x-test-actor"], workspaceId }
      : null,
  validateWriteOrigin: () => true,
});
const actor = (identityId: string) => ({ identityId, workspaceId });
const expectCode = (code: string) => (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error && String(error.code) === code;
try {
  await admin`insert into workspace(id,name) values(${workspaceId},'架空P19検証'),(${foreignWorkspace},'架空別組織')`;
  for (const [id, role] of [
    [owner, "owner"],
    [manager, "inventory_manager"],
    [manager2, "inventory_manager"],
    [worker, "field_worker"],
    [shipper, "shipping"],
    [accounting, "accounting"],
  ] as const) {
    await admin`insert into app_identity(id,display_name) values(${id},${`架空担当-${role}`})`;
    await admin`insert into workspace_membership(workspace_id,identity_id,role,active) values(${workspaceId},${id},${role},true)`;
    await admin`insert into auth_credential(identity_id,email_normalized,password_hash,password_salt,hash_algorithm,scrypt_n,scrypt_r,scrypt_p) values(${id},${`${id}@example.test`},decode(repeat('00',32),'hex'),decode(repeat('00',16),'hex'),'scrypt-v1',131072,8,1)`;
  }
  async function assignment() {
    const sku = await workflow.createSku(workspaceId, actor(owner), {
      skuCode: `P19-${randomUUID().slice(0, 8).toUpperCase()}`,
      title: "架空の変更対象",
      category: "トップス",
    });
    return team.createAssignment(workspaceId, actor(owner), {
      identityId: worker,
      assignmentType: "capture",
      targetId: sku.id,
      startsAt: new Date(Date.now() - 60000).toISOString(),
      expiresAt: new Date(Date.now() + 600000).toISOString(),
      humanConfirmed: true,
    });
  }
  const target = await assignment();
  const requestInput = {
    assignmentId: target.assignmentId,
    assignmentType: target.assignmentType,
    expectedAssignmentVersion: target.assignmentVersion,
    reasonCode: "assignment_changed" as const,
    idempotencyKey: randomUUID(),
    humanConfirmed: true as const,
  };
  for (const denied of [worker, shipper, accounting]) {
    await assert.rejects(
      team.requestChange(workspaceId, actor(denied), requestInput),
      expectCode("forbidden"),
    );
    await assert.rejects(team.changes(workspaceId, actor(denied)), expectCode("forbidden"));
  }
  const request = await team.requestChange(workspaceId, actor(owner), requestInput);
  assert.equal(request.targetVersion, target.assignmentVersion);
  assert.equal(request.state, "pending");
  assert.deepEqual(request.after, { ...request.before, access: "revoked" });
  assert.equal(request.evidence, null);
  assert.deepEqual(await team.requestChange(workspaceId, actor(owner), requestInput), request);
  await assert.rejects(
    team.requestChange(workspaceId, actor(owner), {
      ...requestInput,
      reasonCode: "assignment_error",
    }),
    expectCode("conflict"),
  );
  await assert.rejects(
    team.requestChange(workspaceId, actor(manager), {
      ...requestInput,
      idempotencyKey: randomUUID(),
    }),
    expectCode("conflict"),
  );
  const decision = {
    action: "approve" as const,
    expectedRevision: 1,
    commentCode: "target_checked" as const,
    idempotencyKey: randomUUID(),
    humanConfirmed: true as const,
  };
  for (let index = 0; index < 7; index += 1) {
    const values: Array<string | null> = [
      workspaceId,
      owner,
      target.assignmentId,
      "capture",
      target.assignmentVersion,
      "assignment_changed",
      randomUUID(),
    ];
    values[index] = null;
    await assert.rejects(
      runtime.begin(async (tx) => {
        await tx`select set_config('app.workspace_id',${workspaceId},true)`;
        await tx`select app_request_team_assignment_change(${values[0] ?? null},${values[1] ?? null},${values[2] ?? null},${values[3] ?? null},${values[4] ?? null},${values[5] ?? null},${values[6] ?? null})`;
      }),
      expectCode("23514"),
    );
    const eventValues: Array<string | number | null> = [
      workspaceId,
      manager,
      request.requestId,
      1,
      "approve",
      "target_checked",
      randomUUID(),
    ];
    eventValues[index] = null;
    await assert.rejects(
      runtime.begin(async (tx) => {
        await tx`select set_config('app.workspace_id',${workspaceId},true)`;
        await tx`select app_record_team_assignment_change_event(${eventValues[0] ?? null},${eventValues[1] ?? null},${eventValues[2] ?? null},${eventValues[3] ?? null},${eventValues[4] ?? null},${eventValues[5] ?? null},${eventValues[6] ?? null})`;
      }),
      expectCode("23514"),
    );
  }
  await assert.rejects(
    runtime.begin(async (tx) => {
      await tx`select set_config('app.workspace_id',${workspaceId},true)`;
      await tx`select app_request_team_assignment_change(${workspaceId},${owner},${target.assignmentId},'capture',null::timestamptz,null::timestamptz,'assignment_changed',${randomUUID()})`;
    }),
    expectCode("42501"),
  );
  for (const action of ["reject", "request_changes"] as const)
    await assert.rejects(
      team.recordChangeEvent(workspaceId, request.requestId, actor(owner), {
        ...decision,
        action,
        idempotencyKey: randomUUID(),
      }),
      expectCode("forbidden"),
    );
  await assert.rejects(
    team.recordChangeEvent(workspaceId, request.requestId, actor(owner), decision),
    expectCode("forbidden"),
  );
  const commentInput = {
    ...decision,
    action: "comment" as const,
    idempotencyKey: randomUUID(),
  };
  const comment = await team.recordChangeEvent(
    workspaceId,
    request.requestId,
    actor(owner),
    commentInput,
  );
  assert.deepEqual(
    await team.recordChangeEvent(workspaceId, request.requestId, actor(owner), commentInput),
    comment,
  );
  await assert.rejects(
    team.recordChangeEvent(workspaceId, request.requestId, actor(owner), {
      ...commentInput,
      commentCode: "dates_checked",
    }),
    expectCode("conflict"),
  );
  assert.equal(comment.revision, 2);
  await assert.rejects(
    team.recordChangeEvent(workspaceId, request.requestId, actor(manager), decision),
    expectCode("conflict"),
  );
  const races = await Promise.allSettled(
    [manager, manager2].map((id) =>
      team.recordChangeEvent(workspaceId, request.requestId, actor(id), {
        ...decision,
        expectedRevision: 2,
        idempotencyKey: randomUUID(),
      }),
    ),
  );
  assert.equal(races.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(races.filter((result) => result.status === "rejected").length, 1);
  const history = await team.changes(workspaceId, actor(owner));
  assert.equal(history.changes[0]?.state, "approved");
  assert.equal(history.changes[0]?.events.length, 3);
  assert.ok(
    (await team.state(workspaceId, actor(owner))).assignments.find(
      (item) => item.assignmentId === target.assignmentId,
    )?.revokedAt,
  );
  for (const action of ["reject", "request_changes"] as const) {
    const next = await assignment();
    const pending = await team.requestChange(workspaceId, actor(manager), {
      ...requestInput,
      assignmentId: next.assignmentId,
      expectedAssignmentVersion: next.assignmentVersion,
      idempotencyKey: randomUUID(),
    });
    const decided = await team.recordChangeEvent(workspaceId, pending.requestId, actor(owner), {
      ...decision,
      action,
      idempotencyKey: randomUUID(),
    });
    assert.equal(decided.state, action === "reject" ? "rejected" : "changes_requested");
    assert.equal(
      (await team.state(workspaceId, actor(owner))).assignments.find(
        (item) => item.assignmentId === next.assignmentId,
      )?.revokedAt,
      null,
    );
  }
  // Display milliseconds must not hide a raw database microsecond change.
  const precise = await assignment();
  await admin`update sku_work_assignment set starts_at=starts_at+interval '1 microsecond' where workspace_id=${workspaceId} and id=${precise.assignmentId}`;
  const preciseCurrent = (await team.state(workspaceId, actor(owner))).assignments.find(
    (item) => item.assignmentId === precise.assignmentId,
  );
  assert.ok(preciseCurrent);
  assert.equal(preciseCurrent.startsAt, precise.startsAt);
  assert.notEqual(preciseCurrent.assignmentVersion, precise.assignmentVersion);
  await assert.rejects(
    team.requestChange(workspaceId, actor(owner), {
      ...requestInput,
      assignmentId: precise.assignmentId,
      expectedAssignmentVersion: precise.assignmentVersion,
      idempotencyKey: randomUUID(),
    }),
    expectCode("conflict"),
  );
  const preciseRequest = await team.requestChange(workspaceId, actor(owner), {
    ...requestInput,
    assignmentId: precise.assignmentId,
    expectedAssignmentVersion: preciseCurrent.assignmentVersion,
    idempotencyKey: randomUUID(),
  });
  await admin`update sku_work_assignment set expires_at=expires_at+interval '1 microsecond' where workspace_id=${workspaceId} and id=${precise.assignmentId}`;
  await assert.rejects(
    team.recordChangeEvent(workspaceId, preciseRequest.requestId, actor(manager), {
      ...decision,
      idempotencyKey: randomUUID(),
    }),
    expectCode("conflict"),
  );

  // A real row-lock barrier proves expiry is checked after waiting, not at statement start.
  const expiring = await assignment();
  await admin`update sku_work_assignment set expires_at=clock_timestamp()+interval '2 seconds' where workspace_id=${workspaceId} and id=${expiring.assignmentId}`;
  const expiringCurrent = (await team.state(workspaceId, actor(owner))).assignments.find(
    (item) => item.assignmentId === expiring.assignmentId,
  );
  assert.ok(expiringCurrent);
  let blockedRequest: Promise<unknown> | undefined;
  await admin.begin(async (tx) => {
    await tx`select id from sku_work_assignment where workspace_id=${workspaceId} and id=${expiring.assignmentId} for update`;
    blockedRequest = assert.rejects(
      team.requestChange(workspaceId, actor(owner), {
        ...requestInput,
        assignmentId: expiring.assignmentId,
        expectedAssignmentVersion: expiringCurrent.assignmentVersion,
        idempotencyKey: randomUUID(),
      }),
      expectCode("conflict"),
    );
    let blocked = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const waiting =
        await admin`select query_start < assignment.expires_at as started_before_expiry
        from pg_stat_activity activity cross join sku_work_assignment assignment
        where activity.datname=current_database() and activity.wait_event_type='Lock'
          and activity.query like '%app_request_team_assignment_change%'
          and assignment.workspace_id=${workspaceId} and assignment.id=${expiring.assignmentId}`;
      if (waiting.length > 0) {
        assert.ok(waiting[0]?.started_before_expiry);
        blocked = true;
        break;
      }
      await delay(10);
    }
    assert.ok(blocked, "request must actually wait on the assignment row lock");
    await tx`select pg_sleep(greatest(0,extract(epoch from (expires_at-clock_timestamp())))+0.05)
      from sku_work_assignment where workspace_id=${workspaceId} and id=${expiring.assignmentId}`;
  });
  assert.ok(blockedRequest);
  await blockedRequest;
  assert.equal(
    (
      await admin`select id from team_assignment_change_request where workspace_id=${workspaceId} and assignment_id=${expiring.assignmentId}`
    ).length,
    0,
  );

  // Direct emergency manager revocation remains available, but cannot masquerade as PC39 approval.
  const emergency = await assignment();
  const emergencyRequest = await team.requestChange(workspaceId, actor(owner), {
    ...requestInput,
    assignmentId: emergency.assignmentId,
    expectedAssignmentVersion: emergency.assignmentVersion,
    idempotencyKey: randomUUID(),
  });
  await team.revokeAssignment(workspaceId, emergency.assignmentId, actor(manager), {
    assignmentType: "capture",
    reasonCode: "device_lost",
    humanConfirmed: true,
  });
  await assert.rejects(
    team.recordChangeEvent(workspaceId, emergencyRequest.requestId, actor(manager), {
      ...decision,
      idempotencyKey: randomUUID(),
    }),
    expectCode("conflict"),
  );
  for (const table of ["team_assignment_change_request", "team_assignment_change_event"] as const) {
    await assert.rejects(
      runtime.begin(async (tx) => {
        await tx`select set_config('app.workspace_id',${workspaceId},true)`;
        await tx`insert into ${tx(table)} select * from ${tx(table)} where false`;
      }),
      expectCode("42501"),
    );
    await assert.rejects(
      runtime.begin(async (tx) => {
        await tx`select set_config('app.workspace_id',${workspaceId},true)`;
        await tx`delete from ${tx(table)} where workspace_id=${workspaceId}`;
      }),
      expectCode("42501"),
    );
    await assert.rejects(
      runtime.begin(async (tx) => {
        await tx`select set_config('app.workspace_id',${workspaceId},true)`;
        await tx`update ${tx(table)} set revision=99 where workspace_id=${workspaceId}`;
      }),
      expectCode("42501"),
    );
    await runtime.begin(async (tx) => {
      await tx`select set_config('app.workspace_id',${foreignWorkspace},true)`;
      assert.equal((await tx`select * from ${tx(table)}`).length, 0);
    });
  }
  const route = `/v1/workspaces/${workspaceId}/team/change-requests`;
  assert.equal((await app.inject({ url: route })).statusCode, 401);
  const listed = await app.inject({ url: route, headers: { "x-test-actor": manager } });
  assert.equal(listed.statusCode, 200, listed.body);
  assert.equal(listed.headers["cache-control"], "private, no-store");
  for (const forbidden of ["password", "storageKey", "AmountMinor", "address", "token"])
    assert.equal(listed.body.includes(forbidden), false);
  assert.equal(
    (
      await app.inject({
        method: "DELETE",
        url: `${route}/${request.requestId}`,
        headers: { "x-test-actor": owner },
      })
    ).statusCode,
    404,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: route,
        headers: { "x-test-actor": owner },
        payload: { ...requestInput, comment: "secret=bad" },
      })
    ).statusCode,
    400,
  );

  const general = await p0.createLocation(workspaceId, actor(owner), {
    parentId: null,
    code: "P19-GENERAL",
    name: "架空通常棚",
    canStoreInventory: true,
    singleItemOnly: false,
    allowMixedSku: true,
    maxUnits: 20,
    humanConfirmed: true,
  });
  const quarantine = await p0.createLocation(workspaceId, actor(manager), {
    parentId: null,
    code: "P19-RETURN",
    name: "架空返品隔離棚",
    purpose: "return_quarantine",
    canStoreInventory: true,
    singleItemOnly: false,
    allowMixedSku: true,
    maxUnits: 20,
    humanConfirmed: true,
  });
  assert.equal(general.purpose, "general");
  assert.equal(quarantine.purpose, "return_quarantine");
  for (const managerId of [owner, manager]) {
    const catalog = await p0.putawayCatalog(workspaceId, actor(managerId));
    assert.deepEqual(
      catalog.locations.map((location) => location.locationId),
      [general.id],
    );
    assert.ok(catalog.locations.every((location) => location.purpose === "general"));
  }
  for (const denied of [shipper, accounting])
    await assert.rejects(p0.putawayCatalog(workspaceId, actor(denied)), expectCode("forbidden"));
  assert.equal((await p0.putawayCatalog(workspaceId, actor(worker))).locations.length, 0);
  const locationAssignments = [];
  for (const location of [general, quarantine])
    locationAssignments.push(
      await team.createAssignment(workspaceId, actor(owner), {
        identityId: worker,
        assignmentType: "location_putaway",
        targetId: location.id,
        startsAt: new Date(Date.now() - 60000).toISOString(),
        expiresAt: new Date(Date.now() + 600000).toISOString(),
        humanConfirmed: true,
      }),
    );
  assert.deepEqual(
    (await p0.putawayCatalog(workspaceId, actor(worker))).locations.map(
      (location) => location.locationId,
    ),
    [general.id],
  );
  for (const assignment of locationAssignments)
    await team.revokeAssignment(workspaceId, assignment.assignmentId, actor(owner), {
      assignmentType: "location_putaway",
      reasonCode: "assignment_changed",
      humanConfirmed: true,
    });
  assert.equal((await p0.putawayCatalog(workspaceId, actor(worker))).locations.length, 0);
  await admin`update location_node set state='inactive' where workspace_id=${workspaceId} and id=${quarantine.id}`;
  await admin`update location_node set state='retired' where workspace_id=${workspaceId} and id=${quarantine.id}`;
  await admin`update location_node set state='active' where workspace_id=${workspaceId} and id=${quarantine.id}`;
  for (const denied of [worker, shipper, accounting])
    await assert.rejects(
      p0.createLocation(workspaceId, actor(denied), {
        parentId: null,
        code: `P19-DENY-${denied.slice(0, 8).toUpperCase()}`,
        name: "架空不許可",
        purpose: "return_quarantine",
        canStoreInventory: true,
        singleItemOnly: false,
        allowMixedSku: true,
        maxUnits: 20,
        humanConfirmed: true,
      }),
      expectCode("forbidden"),
    );
  await assert.rejects(
    admin`update location_node set purpose='return_quarantine' where workspace_id=${workspaceId} and id=${general.id}`,
    expectCode("23514"),
  );
  const sku = await workflow.createSku(workspaceId, actor(owner), {
    skuCode: "P19-RETURN-SKU",
    title: "架空返品対象",
    category: "トップス",
  });
  const unit = randomUUID();
  const orderId = randomUUID();
  const inventoryNumber = appendCodeCheckDigit("INV-980001");
  await admin.begin(async (tx) => {
    await tx`set local session_replication_role=replica`;
    await tx`insert into inventory_unit(id,workspace_id,sku_id,inventory_number,status) values(${unit},${workspaceId},${sku.id},${inventoryNumber},'shipped')`;
    await tx`insert into sales_order(id,workspace_id,order_number,state,address_mode) values(${orderId},${workspaceId},'P19-RETURN-ORDER','returned','anonymous')`;
    await tx`insert into order_allocation(workspace_id,order_id,inventory_unit_id) values(${workspaceId},${orderId},${unit})`;
    await tx`insert into inventory_label(workspace_id,target_type,target_id,label_kind,version,token_hash,short_code,issued_by) values(${workspaceId},'inventory_unit',${unit},'manual_code',1,${randomUUID().replaceAll("-", "").repeat(2)},${inventoryNumber},${owner})`;
    await tx`set local session_replication_role=origin`;
  });
  for (const [assignmentType, targetId] of [
    ["location_putaway", general.id],
    ["location_photo", general.id],
    ["inventory_putaway", unit],
    ["shipping", orderId],
  ] as const) {
    let assignmentId: string;
    if (assignmentType === "shipping") {
      assignmentId = randomUUID();
      await admin`insert into order_assignment(id,workspace_id,order_id,identity_id,starts_at,expires_at,assigned_by)
        values(${assignmentId},${workspaceId},${targetId},${shipper},clock_timestamp()-interval '1 minute',clock_timestamp()+interval '10 minutes',${owner})`;
    } else {
      assignmentId = (
        await team.createAssignment(workspaceId, actor(owner), {
          identityId: worker,
          assignmentType,
          targetId,
          startsAt: new Date(Date.now() - 60000).toISOString(),
          expiresAt: new Date(Date.now() + 600000).toISOString(),
          humanConfirmed: true,
        })
      ).assignmentId;
    }
    const current = (await team.state(workspaceId, actor(owner))).assignments.find(
      (item) => item.assignmentId === assignmentId,
    );
    assert.ok(current);
    assert.match(current.assignmentVersion, /^[a-f0-9]{64}$/u);
    const change = await team.requestChange(workspaceId, actor(owner), {
      ...requestInput,
      assignmentId,
      assignmentType,
      expectedAssignmentVersion: current.assignmentVersion,
      idempotencyKey: randomUUID(),
    });
    assert.equal(change.before.assignmentType, assignmentType);
    assert.equal(change.before.targetId, targetId);
    assert.equal(change.targetVersion, current.assignmentVersion);
    await team.recordChangeEvent(workspaceId, change.requestId, actor(manager), {
      ...decision,
      action: "reject",
      idempotencyKey: randomUUID(),
    });
  }
  const now = Date.now();
  const quarantineInput = {
    orderId,
    inventoryNumber,
    locationCode: general.code,
    inventoryLabelVersion: 1,
    locationLabelVersion: 1,
    inventoryScannedAt: new Date(now - 20).toISOString(),
    locationScannedAt: new Date(now - 10).toISOString(),
    confirmedAt: new Date(now).toISOString(),
    idempotencyKey: randomUUID(),
    humanConfirmed: true as const,
  };
  await assert.rejects(
    orders.quarantineReturn(workspaceId, orderId, actor(owner), quarantineInput),
    expectCode("conflict"),
  );
  await orders.quarantineReturn(workspaceId, orderId, actor(owner), {
    ...quarantineInput,
    locationCode: quarantine.code,
    idempotencyKey: randomUUID(),
  });
  await assert.rejects(
    admin`update location_node set state='inactive' where workspace_id=${workspaceId} and id=${quarantine.id}`,
    expectCode("23514"),
  );
  await assert.rejects(
    admin`update location_node set state='retired' where workspace_id=${workspaceId} and id=${quarantine.id}`,
    expectCode("23514"),
  );
  const restocked = await orders.inspectReturn(workspaceId, orderId, actor(owner), {
    resolution: "restock",
    inspectedAt: new Date().toISOString(),
    idempotencyKey: randomUUID(),
    humanConfirmed: true,
  });
  assert.equal(restocked.inventoryStatus, "putaway_pending");
  await admin`update location_node set state='inactive' where workspace_id=${workspaceId} and id=${quarantine.id}`;
  await assert.rejects(
    admin`insert into scan_session (
    workspace_id,operation,inventory_unit_id,destination_location_id,inventory_label_id,inventory_label_version,
    location_label_id,location_label_version,inventory_scanned_at,location_scanned_at,confirmed_by,confirmed_at
  ) select workspace_id,operation,inventory_unit_id,destination_location_id,inventory_label_id,inventory_label_version,
    location_label_id,location_label_version,now(),now(),confirmed_by,now()
    from scan_session where workspace_id=${workspaceId} and inventory_unit_id=${unit} limit 1`,
    expectCode("23514"),
  );
  await admin`update location_node set state='retired' where workspace_id=${workspaceId} and id=${quarantine.id}`;
  const [stored] = await admin<
    [{ status: string; location_id: string | null }]
  >`select status,location_id from inventory_unit where workspace_id=${workspaceId} and id=${unit}`;
  assert.deepEqual(stored, { status: "putaway_pending", location_id: null });
  await assert.rejects(
    workflow.putawayInventory(workspaceId, actor(owner), {
      ...quarantineInput,
      locationCode: quarantine.code,
      idempotencyKey: randomUUID(),
    }),
    expectCode("conflict"),
  );
  const placed = await workflow.putawayInventory(workspaceId, actor(owner), {
    ...quarantineInput,
    locationCode: general.code,
    idempotencyKey: randomUUID(),
  });
  assert.equal(placed.status, "available");
  const audit =
    await admin`select redacted_changes from audit_event where workspace_id=${workspaceId} and action like 'team.change.%'`;
  assert.ok(audit.length >= 8);
  console.log(
    "P19 team/quarantine integration PASS: role/tenant/strict-body, safe snapshots, version/idempotency, self-approval, concurrent one-winner, append-only, emergency stale, quarantine-only, restock pending/general putaway",
  );
} finally {
  await app.close();
  await admin.end({ timeout: 5 });
  await runtime.end({ timeout: 5 });
}
