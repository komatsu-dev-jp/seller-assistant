import { createHash, randomUUID } from "node:crypto";
import type {
  ApproveStocktakeRequest,
  ReissuedInventoryLabelResponse,
  ReissueInventoryLabelRequest,
  ResolveStocktakeDiscrepancyRequest,
  StartStocktakeRequest,
  StocktakeObservationRequest,
  StocktakeResponse,
} from "@resale/contracts";
import postgres from "postgres";

import { RepositoryError, type RequestActor } from "./repository.js";

export interface StocktakeRepository {
  list(workspaceId: string, actor: RequestActor): Promise<StocktakeResponse[]>;
  start(
    workspaceId: string,
    actor: RequestActor,
    input: StartStocktakeRequest,
  ): Promise<StocktakeResponse>;
  observe(
    workspaceId: string,
    stocktakeId: string,
    actor: RequestActor,
    input: StocktakeObservationRequest,
  ): Promise<StocktakeResponse>;
  reconcile(
    workspaceId: string,
    stocktakeId: string,
    actor: RequestActor,
  ): Promise<StocktakeResponse>;
  resolve(
    workspaceId: string,
    stocktakeId: string,
    discrepancyId: string,
    actor: RequestActor,
    input: ResolveStocktakeDiscrepancyRequest,
  ): Promise<StocktakeResponse>;
  approve(
    workspaceId: string,
    stocktakeId: string,
    actor: RequestActor,
    input: ApproveStocktakeRequest,
  ): Promise<StocktakeResponse>;
  reissueLabel(
    workspaceId: string,
    actor: RequestActor,
    input: ReissueInventoryLabelRequest,
  ): Promise<ReissuedInventoryLabelResponse>;
  close(): Promise<void>;
}

export class PostgresStocktakeRepository implements StocktakeRepository {
  private readonly sql: postgres.Sql;

  constructor(databaseUrl: string) {
    this.sql = postgres(databaseUrl, {
      max: 4,
      idle_timeout: 20,
      connect_timeout: 10,
      transform: { undefined: null },
    });
  }

  async list(workspaceId: string, actor: RequestActor): Promise<StocktakeResponse[]> {
    return this.run(workspaceId, actor, async (transaction) =>
      (await selectStocktakes(transaction, workspaceId)).map(toStocktake),
    );
  }

  async start(
    workspaceId: string,
    actor: RequestActor,
    input: StartStocktakeRequest,
  ): Promise<StocktakeResponse> {
    return this.run(workspaceId, actor, async (transaction) => {
      const location = await transaction<Array<{ id: string }>>`
        select id from location_node
        where workspace_id = ${workspaceId} and id = ${input.locationId}
          and state = 'active' and can_store_inventory
      `;
      if (!location[0]) throw new RepositoryError("conflict", "The count location is unavailable");
      const sequence = await transaction<Array<{ basis: number }>>`
        select coalesce(max(movement_seq), 0)::integer as basis
        from inventory_unit where workspace_id = ${workspaceId} and location_id = ${input.locationId}
      `;
      const stocktakeId = randomUUID();
      await transaction`
        insert into count_session (
          id, workspace_id, location_id, state, basis_movement_seq,
          initial_counter_id, started_at
        ) values (
          ${stocktakeId}, ${workspaceId}, ${input.locationId}, 'counting',
          ${sequence[0]?.basis ?? 0}, ${actor.identityId}, statement_timestamp()
        )
      `;
      const snapshot = await transaction<Array<{ inventory_unit_id: string }>>`
        insert into count_session_inventory_snapshot (
          workspace_id, count_session_id, inventory_unit_id, expected_location_id,
          inventory_number, inventory_label_id, inventory_status, movement_seq
        )
        select unit.workspace_id, ${stocktakeId}, unit.id, unit.location_id,
               unit.inventory_number, label.id, unit.status, unit.movement_seq
        from inventory_unit unit
        left join inventory_label label
          on label.workspace_id = unit.workspace_id
         and label.target_type = 'inventory_unit' and label.target_id = unit.id and label.active
        where unit.workspace_id = ${workspaceId} and unit.location_id = ${input.locationId}
          and unit.status in ('available','reserved','picked','packed')
        returning inventory_unit_id
      `;
      await audit(
        transaction,
        workspaceId,
        actor.identityId,
        "stocktake.started",
        stocktakeId,
        { state: "absent" },
        { state: "counting", locationId: input.locationId, expectedUnitCount: snapshot.length },
        "stocktake_human_started",
      );
      return requireStocktake(transaction, workspaceId, stocktakeId);
    });
  }

  async observe(
    workspaceId: string,
    stocktakeId: string,
    actor: RequestActor,
    input: StocktakeObservationRequest,
  ): Promise<StocktakeResponse> {
    return this.run(workspaceId, actor, async (transaction) => {
      const sessions = await transaction<
        Array<{ location_id: string; initial_counter_id: string; state: string }>
      >`
        select location_id, initial_counter_id, state from count_session
        where workspace_id = ${workspaceId} and id = ${stocktakeId} for update
      `;
      const session = sessions[0];
      if (
        !session ||
        session.state !== "counting" ||
        session.initial_counter_id !== actor.identityId
      ) {
        throw new RepositoryError("forbidden", "Only the initial counter can add observations");
      }
      const units =
        input.readResult === "readable"
          ? await transaction<
              Array<{
                id: string;
                location_id: string | null;
                label_id: string | null;
                expected_at_start: boolean;
              }>
            >`
        select unit.id, unit.location_id, label.id as label_id,
               exists (
                 select 1 from count_session_inventory_snapshot snapshot
                 where snapshot.workspace_id = unit.workspace_id
                   and snapshot.count_session_id = ${stocktakeId}
                   and snapshot.inventory_unit_id = unit.id
               ) as expected_at_start
        from inventory_unit unit
        left join inventory_label label
          on label.workspace_id = unit.workspace_id and label.target_type = 'inventory_unit'
         and label.target_id = unit.id and label.active
        where unit.workspace_id = ${workspaceId} and unit.inventory_number = ${input.inventoryNumber}
      `
          : [];
      const unit = units[0];
      const ordinal = await transaction<Array<{ next: number }>>`
        select coalesce(max(ordinal), 0)::integer + 1 as next from count_observation
        where workspace_id = ${workspaceId} and count_session_id = ${stocktakeId}
      `;
      const observedCode = input.readResult === "readable" ? input.inventoryNumber : null;
      const prior = await transaction<Array<{ present: boolean }>>`
        select exists (
          select 1 from count_observation observation
          where observation.workspace_id = ${workspaceId}
            and observation.count_session_id = ${stocktakeId}
            and (
              (${unit?.id ?? null}::uuid is not null
                and observation.inventory_unit_id = ${unit?.id ?? null}::uuid)
              or
              (${observedCode}::text is not null and observation.observed_code = ${observedCode})
            )
        ) as present
      `;
      const result =
        input.readResult === "unreadable"
          ? "unreadable"
          : prior[0]?.present
            ? "duplicate"
            : !unit
              ? "unexpected"
              : unit.expected_at_start
                ? "matched"
                : "misplaced";
      await transaction`
        insert into count_observation (
          workspace_id, count_session_id, ordinal, inventory_unit_id,
          observed_label_id, observed_code, read_failure_reason,
          observed_by, observed_at, result
        ) values (
          ${workspaceId}, ${stocktakeId}, ${ordinal[0]?.next ?? 1}, ${unit?.id ?? null},
          ${unit?.label_id ?? null}, ${observedCode},
          ${input.readResult === "unreadable" ? input.failureReason : null},
          ${actor.identityId}, ${input.observedAt}, ${result}
        )
      `;
      await audit(
        transaction,
        workspaceId,
        actor.identityId,
        "stocktake.observed",
        stocktakeId,
        { observationCount: (ordinal[0]?.next ?? 1) - 1 },
        { observationCount: ordinal[0]?.next ?? 1, result },
        "inventory_label_human_scanned",
      );
      return requireStocktake(transaction, workspaceId, stocktakeId);
    });
  }

  async reconcile(
    workspaceId: string,
    stocktakeId: string,
    actor: RequestActor,
  ): Promise<StocktakeResponse> {
    return this.run(workspaceId, actor, async (transaction) => {
      const sessions = await transaction<
        Array<{ location_id: string; initial_counter_id: string; state: string }>
      >`
        select location_id, initial_counter_id, state from count_session
        where workspace_id = ${workspaceId} and id = ${stocktakeId} for update
      `;
      const session = sessions[0];
      if (
        !session ||
        session.state !== "counting" ||
        session.initial_counter_id !== actor.identityId
      ) {
        throw new RepositoryError(
          "forbidden",
          "Only the initial counter can submit reconciliation",
        );
      }
      const postStartMovements = await transaction<Array<{ inventory_unit_id: string }>>`
        insert into count_session_post_start_movement (
          workspace_id, count_session_id, inventory_unit_id,
          snapshot_movement_seq, current_movement_seq,
          expected_location_id, current_location_id
        )
        select snapshot.workspace_id, snapshot.count_session_id, snapshot.inventory_unit_id,
               snapshot.movement_seq, unit.movement_seq,
               snapshot.expected_location_id, unit.location_id
        from count_session_inventory_snapshot snapshot
        join inventory_unit unit
          on unit.workspace_id = snapshot.workspace_id and unit.id = snapshot.inventory_unit_id
        where snapshot.workspace_id = ${workspaceId}
          and snapshot.count_session_id = ${stocktakeId}
          and unit.movement_seq > snapshot.movement_seq
        on conflict (workspace_id, count_session_id, inventory_unit_id) do nothing
        returning inventory_unit_id
      `;
      await transaction`
        insert into inventory_discrepancy (
          workspace_id, count_session_id, inventory_unit_id, kind, state, requester_id
        )
        select ${workspaceId}, ${stocktakeId}, unit.id, 'missing_candidate',
               'reconfirmation_required', ${actor.identityId}
        from count_session_inventory_snapshot snapshot
        join inventory_unit unit
          on unit.workspace_id = snapshot.workspace_id and unit.id = snapshot.inventory_unit_id
        where snapshot.workspace_id = ${workspaceId}
          and snapshot.count_session_id = ${stocktakeId}
          and not exists (
            select 1 from count_session_post_start_movement movement
            where movement.workspace_id = snapshot.workspace_id
              and movement.count_session_id = snapshot.count_session_id
              and movement.inventory_unit_id = snapshot.inventory_unit_id
          )
          and not exists (
            select 1 from count_observation observation
            where observation.workspace_id = snapshot.workspace_id
              and observation.count_session_id = ${stocktakeId}
              and observation.inventory_unit_id = snapshot.inventory_unit_id
          )
      `;
      await transaction`
        insert into inventory_discrepancy (
          workspace_id, count_session_id, inventory_unit_id, kind, state, requester_id
        )
        select ${workspaceId}, ${stocktakeId}, observation.inventory_unit_id,
               observation.result, 'reconfirmation_required', ${actor.identityId}
        from count_observation observation
        where observation.workspace_id = ${workspaceId}
          and observation.count_session_id = ${stocktakeId}
          and observation.result <> 'matched'
      `;
      await transaction`
        update count_session set state = 'reconciliation'
        where workspace_id = ${workspaceId} and id = ${stocktakeId}
      `;
      await audit(
        transaction,
        workspaceId,
        actor.identityId,
        "stocktake.reconciliation.submitted",
        stocktakeId,
        { state: "counting" },
        { state: "reconciliation", postStartMovementCount: postStartMovements.length },
        "initial_count_human_submitted",
      );
      return requireStocktake(transaction, workspaceId, stocktakeId);
    });
  }

  async resolve(
    workspaceId: string,
    stocktakeId: string,
    discrepancyId: string,
    actor: RequestActor,
    input: ResolveStocktakeDiscrepancyRequest,
  ): Promise<StocktakeResponse> {
    return this.run(workspaceId, actor, async (transaction) => {
      const sessions = await transaction<Array<{ initial_counter_id: string; state: string }>>`
        select initial_counter_id, state from count_session
        where workspace_id = ${workspaceId} and id = ${stocktakeId}
      `;
      const session = sessions[0];
      if (
        !session ||
        session.state !== "reconciliation" ||
        session.initial_counter_id === actor.identityId
      ) {
        throw new RepositoryError("forbidden", "Another person must reconfirm the discrepancy");
      }
      const changed = await transaction<Array<{ id: string }>>`
        update inventory_discrepancy
        set state = 'resolved', reconfirmer_id = ${actor.identityId}, approver_id = ${actor.identityId},
            resolution = ${input.resolution}, resolved_at = statement_timestamp()
        where workspace_id = ${workspaceId} and count_session_id = ${stocktakeId}
          and id = ${discrepancyId} and state <> 'resolved'
        returning id
      `;
      if (!changed[0]) throw new RepositoryError("conflict", "The discrepancy is unavailable");
      await audit(
        transaction,
        workspaceId,
        actor.identityId,
        "stocktake.discrepancy.resolved",
        discrepancyId,
        { state: "reconfirmation_required" },
        { state: "resolved", resolution: input.resolution },
        "second_person_reconfirmation",
      );
      return requireStocktake(transaction, workspaceId, stocktakeId);
    });
  }

  async approve(
    workspaceId: string,
    stocktakeId: string,
    actor: RequestActor,
    input: ApproveStocktakeRequest,
  ): Promise<StocktakeResponse> {
    void input;
    return this.run(workspaceId, actor, async (transaction) => {
      const changed = await transaction<Array<{ id: string }>>`
        update count_session session
        set state = 'approved', approved_by = ${actor.identityId}, approved_at = statement_timestamp()
        where session.workspace_id = ${workspaceId} and session.id = ${stocktakeId}
          and session.state = 'reconciliation' and session.initial_counter_id <> ${actor.identityId}
          and not exists (
            select 1 from inventory_discrepancy discrepancy
            where discrepancy.workspace_id = session.workspace_id
              and discrepancy.count_session_id = session.id and discrepancy.state <> 'resolved'
          )
        returning id
      `;
      if (!changed[0]) {
        throw new RepositoryError(
          "conflict",
          "Another person and resolved discrepancies are required",
        );
      }
      await audit(
        transaction,
        workspaceId,
        actor.identityId,
        "stocktake.approved",
        stocktakeId,
        { state: "reconciliation" },
        { state: "approved" },
        "second_person_stocktake_approval",
      );
      return requireStocktake(transaction, workspaceId, stocktakeId);
    });
  }

  async reissueLabel(
    workspaceId: string,
    actor: RequestActor,
    input: ReissueInventoryLabelRequest,
  ): Promise<ReissuedInventoryLabelResponse> {
    return this.run(workspaceId, actor, async (transaction) => {
      const labels = await transaction<
        Array<{ id: string; label_kind: string; version: number; short_code: string }>
      >`
        select id, label_kind, version, short_code from inventory_label
        where workspace_id = ${workspaceId} and target_type = ${input.targetType}
          and target_id = ${input.targetId} and active
        order by version desc limit 1 for update
      `;
      const previous = labels[0];
      if (!previous) throw new RepositoryError("conflict", "The active label was not found");
      await transaction`
        update inventory_label set active = false, revoked_at = statement_timestamp()
        where workspace_id = ${workspaceId} and id = ${previous.id}
      `;
      const labelId = randomUUID();
      const tokenHash = createHash("sha256").update(randomUUID(), "utf8").digest("hex");
      const created = await transaction<Array<{ issued_at: Date }>>`
        insert into inventory_label (
          id, workspace_id, target_type, target_id, label_kind, version,
          token_hash, short_code, active, issued_by
        ) values (
          ${labelId}, ${workspaceId}, ${input.targetType}, ${input.targetId},
          ${previous.label_kind}, ${previous.version + 1}, ${tokenHash}, ${previous.short_code},
          true, ${actor.identityId}
        ) returning issued_at
      `;
      await audit(
        transaction,
        workspaceId,
        actor.identityId,
        "inventory.label.reissued",
        labelId,
        { activeLabelId: previous.id, version: previous.version },
        { activeLabelId: labelId, version: previous.version + 1 },
        input.reasonCode,
      );
      return {
        labelId,
        targetType: input.targetType,
        targetId: input.targetId,
        shortCode: previous.short_code,
        version: previous.version + 1,
        issuedAt: created[0]?.issued_at.toISOString() ?? new Date().toISOString(),
      };
    });
  }

  async close(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }

  private async run<T>(
    workspaceId: string,
    actor: RequestActor,
    action: (transaction: postgres.TransactionSql) => Promise<T>,
  ): Promise<T> {
    try {
      return (await this.sql.begin(async (transaction) => {
        await transaction`select set_config('app.workspace_id', ${workspaceId}, true)`;
        const roles = await transaction<Array<{ role: string }>>`
          select role from workspace_membership
          where workspace_id = ${workspaceId} and identity_id = ${actor.identityId}
            and active and role in ('owner','inventory_manager')
        `;
        if (!roles[0]) throw new RepositoryError("forbidden", "Inventory manager role is required");
        return action(transaction);
      })) as T;
    } catch (error) {
      if (error instanceof RepositoryError) throw error;
      const code =
        typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
      if (["23505", "23514", "40001"].includes(code)) {
        throw new RepositoryError("conflict", "The stocktake conflicted with current data");
      }
      throw new RepositoryError("database_error", "The stocktake operation failed safely");
    }
  }
}

interface StocktakeRow {
  id: string;
  workspace_id: string;
  location_id: string;
  location_code: string;
  state: StocktakeResponse["state"];
  initial_counter_id: string;
  started_at: Date;
  approved_at: Date | null;
  observation_count: number;
  observations: StocktakeResponse["observations"];
  discrepancies: StocktakeResponse["discrepancies"];
  post_start_movements: StocktakeResponse["postStartMovements"];
}

async function selectStocktakes(
  sql: postgres.TransactionSql,
  workspaceId: string,
  stocktakeId?: string,
): Promise<StocktakeRow[]> {
  return sql<StocktakeRow[]>`
    select session.id, session.workspace_id, session.location_id, location.code as location_code,
           session.state, session.initial_counter_id, session.started_at, session.approved_at,
           (select count(*)::integer from count_observation observation
            where observation.workspace_id = session.workspace_id
              and observation.count_session_id = session.id) as observation_count,
           coalesce((select jsonb_agg(jsonb_build_object(
             'ordinal', observation.ordinal,
             'inventoryUnitId', observation.inventory_unit_id,
             'observedCode', observation.observed_code,
             'result', observation.result,
             'failureReason', observation.read_failure_reason,
              'observedAt', to_char(observation.observed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
           ) order by observation.ordinal)
           from count_observation observation
           where observation.workspace_id = session.workspace_id
             and observation.count_session_id = session.id), '[]'::jsonb) as observations,
           coalesce((select jsonb_agg(jsonb_build_object(
             'discrepancyId', discrepancy.id, 'inventoryUnitId', discrepancy.inventory_unit_id,
             'inventoryNumber', unit.inventory_number, 'kind', discrepancy.kind,
             'state', discrepancy.state, 'resolution', discrepancy.resolution
           ) order by discrepancy.created_at)
           from inventory_discrepancy discrepancy
           left join inventory_unit unit
             on unit.workspace_id = discrepancy.workspace_id and unit.id = discrepancy.inventory_unit_id
           where discrepancy.workspace_id = session.workspace_id
             and discrepancy.count_session_id = session.id), '[]'::jsonb) as discrepancies,
           coalesce((select jsonb_agg(jsonb_build_object(
             'inventoryUnitId', movement.inventory_unit_id,
             'inventoryNumber', unit.inventory_number,
             'expectedLocationId', movement.expected_location_id,
             'expectedLocationCode', expected_location.code,
             'currentLocationId', movement.current_location_id,
             'currentLocationCode', current_location.code,
             'snapshotMovementSequence', movement.snapshot_movement_seq,
             'currentMovementSequence', movement.current_movement_seq,
              'detectedAt', to_char(movement.detected_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
           ) order by movement.detected_at, movement.inventory_unit_id)
           from count_session_post_start_movement movement
           join inventory_unit unit
             on unit.workspace_id = movement.workspace_id and unit.id = movement.inventory_unit_id
           join location_node expected_location
             on expected_location.workspace_id = movement.workspace_id
            and expected_location.id = movement.expected_location_id
           left join location_node current_location
             on current_location.workspace_id = movement.workspace_id
            and current_location.id = movement.current_location_id
           where movement.workspace_id = session.workspace_id
             and movement.count_session_id = session.id), '[]'::jsonb) as post_start_movements
    from count_session session
    join location_node location
      on location.workspace_id = session.workspace_id and location.id = session.location_id
    where session.workspace_id = ${workspaceId}
      and (${stocktakeId ?? null}::uuid is null or session.id = ${stocktakeId ?? null}::uuid)
    order by session.started_at desc
  `;
}

async function requireStocktake(
  sql: postgres.TransactionSql,
  workspaceId: string,
  stocktakeId: string,
): Promise<StocktakeResponse> {
  const rows = await selectStocktakes(sql, workspaceId, stocktakeId);
  if (!rows[0]) throw new RepositoryError("database_error", "The stocktake cannot be read back");
  return toStocktake(rows[0]);
}

function toStocktake(row: StocktakeRow): StocktakeResponse {
  return {
    stocktakeId: row.id,
    workspaceId: row.workspace_id,
    locationId: row.location_id,
    locationCode: row.location_code,
    state: row.state,
    initialCounterId: row.initial_counter_id,
    observationCount: row.observation_count,
    observations: row.observations,
    discrepancies: row.discrepancies,
    postStartMovements: row.post_start_movements,
    startedAt: row.started_at.toISOString(),
    approvedAt: row.approved_at?.toISOString() ?? null,
  };
}

async function audit(
  sql: postgres.TransactionSql,
  workspaceId: string,
  actorId: string,
  action: string,
  targetId: string,
  before: Record<string, postgres.JSONValue>,
  after: Record<string, postgres.JSONValue>,
  reasonCode: string,
): Promise<void> {
  await sql`
    insert into audit_event (
      workspace_id, actor_id, action, target_type, target_id,
      field_names, redacted_changes, reason_code, approved_by
    ) values (
      ${workspaceId}, ${actorId}, ${action}, 'inventory_control', ${targetId},
      ${Object.keys(after)}, ${sql.json({ before, after })}, ${reasonCode}, ${actorId}
    )
  `;
}
