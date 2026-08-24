import { createHash, randomUUID } from "node:crypto";

import type postgres from "postgres";

type ActivePilotCorrectionResult =
  "not_active_pilot" | "actor_mismatch" | "idempotency_conflict" | "recorded";

export async function recordActivePilotManualCorrection(
  sql: postgres.TransactionSql,
  input: {
    workspaceId: string;
    skuId: string;
    actorId: string;
    correctionReferenceId: string;
    detailCode:
      "photo_role_replaced" | "measurement_attempt_replaced" | "product_attributes_revised";
  },
): Promise<ActivePilotCorrectionResult> {
  const pilotItems = await sql<
    Array<{ item_id: string; pilot_run_id: string; run_actor_id: string }>
  >`
    select item.id as item_id, item.pilot_run_id, run.actor_id as run_actor_id
    from pilot_item_measurement item
    join pilot_run run
      on run.workspace_id = item.workspace_id and run.id = item.pilot_run_id
    where item.workspace_id = ${input.workspaceId} and item.sku_id = ${input.skuId}
      and item.completed_at is null and run.state = 'active'
      and run.protocol_version = 'listing_prep_pilot_v1.1.0'
    order by item.started_at desc, item.id desc
    limit 1
    for update of run, item
  `;
  const pilotItem = pilotItems[0];
  if (!pilotItem) return "not_active_pilot";
  if (pilotItem.run_actor_id !== input.actorId) return "actor_mismatch";

  const payload = {
    eventType: "manual_correction",
    detailCode: input.detailCode,
  } as const;
  const payloadHash = createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex");
  const eventId = randomUUID();
  const inserted = await sql<Array<{ id: string }>>`
    insert into pilot_exception_event (
      id, workspace_id, pilot_run_id, pilot_item_measurement_id, event_type,
      detail_code, idempotency_key, payload_hash, actor_id
    ) values (
      ${eventId}, ${input.workspaceId}, ${pilotItem.pilot_run_id}, ${pilotItem.item_id},
      'manual_correction', ${input.detailCode}, ${input.correctionReferenceId},
      ${payloadHash}, ${input.actorId}
    )
    on conflict (workspace_id, pilot_run_id, idempotency_key) do nothing
    returning id
  `;
  if (!inserted[0]) {
    const replay = await sql<Array<{ payload_hash: string; detail_code: string }>>`
      select payload_hash, detail_code from pilot_exception_event
      where workspace_id = ${input.workspaceId}
        and pilot_run_id = ${pilotItem.pilot_run_id}
        and idempotency_key = ${input.correctionReferenceId}
    `;
    return replay[0]?.payload_hash === payloadHash && replay[0]?.detail_code === input.detailCode
      ? "recorded"
      : "idempotency_conflict";
  }

  await sql`
    insert into audit_event (
      workspace_id, actor_id, action, target_type, target_id, field_names,
      redacted_changes, reference_ids, reason_code, approved_by
    ) values (
      ${input.workspaceId}, ${input.actorId}, 'pilot_manual_correction.recorded',
      'pilot_exception_event', ${eventId}, ${["event_type", "detail_code"]},
      ${sql.json({
        after: { event_type: "manual_correction", detail_code: input.detailCode },
      })},
      ${[pilotItem.pilot_run_id, pilotItem.item_id, input.skuId, input.correctionReferenceId]},
      'successful_append_only_correction', ${input.actorId}
    )
  `;
  return "recorded";
}
