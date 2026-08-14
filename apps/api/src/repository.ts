import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";
import type {
  AdvanceP0WorkflowRequest,
  CaptureSummary,
  CreateSkuRequest,
  InventorySummary,
  MeasurementResponse,
  MediaAssetResponse,
  P0WorkflowResponse,
  PutawayInventoryRequest,
  PutawayInventoryResponse,
  RecordMeasurementRequest,
  RegisterMediaAssetRequest,
  SessionContextResponse,
  SkuResponse,
} from "@resale/contracts";
import {
  decideP0WorkflowAction,
  registerMediaAsset,
  reviewMeasurement,
  type Measurement,
  type P0WorkflowState,
} from "@resale/domain";

export type WorkspaceRole =
  "owner" | "inventory_manager" | "field_worker" | "shipping" | "accounting";

export interface RequestActor {
  identityId: string;
  sessionId?: string;
  workspaceId?: string;
}

export interface WorkflowRepository {
  sessionContext(actor: RequestActor): Promise<SessionContextResponse>;
  createSku(
    workspaceId: string,
    actor: RequestActor,
    input: CreateSkuRequest,
  ): Promise<SkuResponse>;
  inventorySummary(workspaceId: string, actor: RequestActor): Promise<InventorySummary>;
  putawayInventory(
    workspaceId: string,
    actor: RequestActor,
    input: PutawayInventoryRequest,
  ): Promise<PutawayInventoryResponse>;
  advanceP0Workflow(
    workspaceId: string,
    skuId: string,
    actor: RequestActor,
    input: AdvanceP0WorkflowRequest,
  ): Promise<P0WorkflowResponse>;
  registerMediaAsset(
    workspaceId: string,
    skuId: string,
    actor: RequestActor,
    input: RegisterMediaAssetRequest,
  ): Promise<MediaAssetResponse>;
  recordMeasurement(
    workspaceId: string,
    skuId: string,
    actor: RequestActor,
    input: RecordMeasurementRequest,
  ): Promise<MeasurementResponse>;
  captureSummary(workspaceId: string, skuId: string, actor: RequestActor): Promise<CaptureSummary>;
  close(): Promise<void>;
}

export class RepositoryError extends Error {
  constructor(
    readonly code: "forbidden" | "conflict" | "database_error",
    message: string,
  ) {
    super(message);
  }
}

export class InMemoryWorkflowRepository implements WorkflowRepository {
  private readonly skus = new Map<string, SkuResponse>();
  private readonly workflow = new Map<string, P0WorkflowResponse>();
  private readonly replays = new Map<string, { payloadHash: string; result: P0WorkflowResponse }>();
  private readonly mediaAssets = new Map<string, MediaAssetResponse>();
  private readonly measurements = new Map<string, MeasurementResponse>();
  private readonly putaways = new Map<
    string,
    { payloadHash: string; result: PutawayInventoryResponse }
  >();

  sessionContext(actor: RequestActor): Promise<SessionContextResponse> {
    if (!actor.workspaceId) {
      throw new RepositoryError("forbidden", "The signed session has no active workspace");
    }
    return Promise.resolve({
      identityId: actor.identityId,
      workspaceId: actor.workspaceId,
      role: "owner",
    });
  }

  createSku(
    workspaceId: string,
    _actor: RequestActor,
    input: CreateSkuRequest,
  ): Promise<SkuResponse> {
    const key = `${workspaceId}:${input.skuCode}`;
    if (this.skus.has(key)) throw new RepositoryError("conflict", "SKU code already exists");
    const row: SkuResponse = {
      id: crypto.randomUUID(),
      workspaceId,
      skuCode: input.skuCode,
      title: input.title,
      category: input.category,
      createdAt: new Date().toISOString(),
    };
    this.skus.set(key, row);
    this.workflow.set(`${workspaceId}:${row.id}`, {
      workspaceId,
      skuId: row.id,
      state: "sku_created",
      lastAction: null,
      version: 1,
      updatedAt: row.createdAt,
    });
    return Promise.resolve(row);
  }

  inventorySummary(workspaceId: string, actor: RequestActor): Promise<InventorySummary> {
    void workspaceId;
    void actor;
    return Promise.resolve({
      available: 0,
      putawayPending: this.skus.size,
      reserved: 0,
      discrepancies: 0,
      olderThan90Days: 0,
      lastSyncedAt: new Date().toISOString(),
    });
  }

  putawayInventory(
    workspaceId: string,
    _actor: RequestActor,
    input: PutawayInventoryRequest,
  ): Promise<PutawayInventoryResponse> {
    const replayKey = `${workspaceId}:${input.idempotencyKey}`;
    const payloadHash = hashPutawayInput(input);
    const existing = this.putaways.get(replayKey);
    if (existing) {
      if (existing.payloadHash !== payloadHash) {
        throw new RepositoryError("conflict", "The idempotency key has another payload");
      }
      return Promise.resolve(existing.result);
    }
    const result: PutawayInventoryResponse = {
      inventoryUnitId: randomUUID(),
      inventoryNumber: input.inventoryNumber,
      status: "available",
      locationId: randomUUID(),
      locationCode: input.locationCode,
      movementSequence: 1,
      scanSessionId: randomUUID(),
      idempotencyKey: input.idempotencyKey,
      syncedAt: new Date().toISOString(),
    };
    this.putaways.set(replayKey, { payloadHash, result });
    return Promise.resolve(result);
  }

  advanceP0Workflow(
    workspaceId: string,
    skuId: string,
    _actor: RequestActor,
    input: AdvanceP0WorkflowRequest,
  ): Promise<P0WorkflowResponse> {
    const key = `${workspaceId}:${skuId}`;
    const current = this.workflow.get(key);
    if (!current)
      throw new RepositoryError("forbidden", "The SKU is not available in this workspace");
    const payloadHash = hashWorkflowInput(input);
    const replayKey = `${key}:${input.idempotencyKey}`;
    const replay = this.replays.get(replayKey);
    if (replay) {
      if (replay.payloadHash !== payloadHash) {
        throw new RepositoryError(
          "conflict",
          "The idempotency key was reused with another payload",
        );
      }
      return Promise.resolve(replay.result);
    }
    const decision = decideP0WorkflowAction({
      currentState: current.state,
      action: input.action,
      actorRole: "owner",
      actorKind: "human",
      evidenceCount: input.evidenceReferenceIds.length,
      requiredFactsConfirmed: input.requiredFactsConfirmed,
      manualChannelHandoff: input.manualChannelHandoff,
    });
    if (!decision.allowed) {
      throw new RepositoryError("conflict", `P0 action rejected: ${decision.violations.join(",")}`);
    }
    const result: P0WorkflowResponse = {
      workspaceId,
      skuId,
      state: decision.nextState,
      lastAction: input.action,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    };
    this.workflow.set(key, result);
    this.replays.set(replayKey, { payloadHash, result });
    return Promise.resolve(result);
  }

  registerMediaAsset(
    workspaceId: string,
    skuId: string,
    _actor: RequestActor,
    input: RegisterMediaAssetRequest,
  ): Promise<MediaAssetResponse> {
    this.requireSku(workspaceId, skuId);
    const key = `${workspaceId}:${input.assetId}`;
    const existing = this.mediaAssets.get(key);
    const candidate = {
      id: input.assetId,
      workspaceId,
      skuId,
      role: input.role,
      originalSha256: input.originalSha256,
      originalStorageKey: input.originalStorageKey,
      createdAt: new Date().toISOString(),
    };
    let registration;
    try {
      registration = registerMediaAsset(
        existing
          ? {
              id: existing.assetId,
              workspaceId: existing.workspaceId,
              skuId: existing.skuId,
              role: existing.role,
              originalSha256: existing.originalSha256,
              originalStorageKey: existing.originalStorageKey,
              createdAt: existing.createdAt,
            }
          : undefined,
        candidate,
      );
    } catch {
      throw new RepositoryError("conflict", "The media metadata failed safety validation");
    }
    if (registration.kind === "conflict") {
      throw new RepositoryError("conflict", "The asset ID has different immutable metadata");
    }
    if (registration.kind === "replay" && existing) return Promise.resolve(existing);
    const response: MediaAssetResponse = {
      ...input,
      workspaceId,
      skuId,
      createdAt: candidate.createdAt,
    };
    this.mediaAssets.set(key, response);
    return Promise.resolve(response);
  }

  recordMeasurement(
    workspaceId: string,
    skuId: string,
    actor: RequestActor,
    input: RecordMeasurementRequest,
  ): Promise<MeasurementResponse> {
    this.requireSku(workspaceId, skuId);
    const evidence = this.mediaAssets.get(`${workspaceId}:${input.evidenceAssetId}`);
    if (!evidence || evidence.skuId !== skuId) {
      throw new RepositoryError("forbidden", "Measurement evidence is not available for this SKU");
    }
    const key = `${workspaceId}:${skuId}:${input.definitionId}:${input.attempt}`;
    if (this.measurements.has(key)) {
      throw new RepositoryError("conflict", "The measurement attempt already exists");
    }
    const previous = this.latestMeasurement(workspaceId, skuId, input.definitionId);
    const measurement: Measurement = {
      definitionId: input.definitionId,
      definitionVersion: input.definitionVersion,
      value: input.value,
      unit: input.unit,
      basis: input.basis,
      state: input.state,
      measuredBy: actor.identityId,
      measuredAt: input.measuredAt,
      evidenceAssetId: input.evidenceAssetId,
      attempt: input.attempt,
      confirmedBy: actor.identityId,
      confirmationReason: null,
    };
    const actualReview = reviewMeasurement(
      measurement,
      previous ? toDomainMeasurement(previous) : undefined,
      2,
    );
    const { humanConfirmed, ...responseInput } = input;
    void humanConfirmed;
    const response: MeasurementResponse = {
      ...responseInput,
      id: crypto.randomUUID(),
      workspaceId,
      skuId,
      measuredBy: actor.identityId,
      confirmedBy: actor.identityId,
      requiresReview: actualReview.requiresReview,
      differenceCm: actualReview.difference,
      violations: actualReview.violations,
      createdAt: new Date().toISOString(),
    };
    this.measurements.set(key, response);
    return Promise.resolve(response);
  }

  captureSummary(workspaceId: string, skuId: string, actor: RequestActor): Promise<CaptureSummary> {
    void actor;
    this.requireSku(workspaceId, skuId);
    const assets = [...this.mediaAssets.values()].filter(
      (asset) => asset.workspaceId === workspaceId && asset.skuId === skuId,
    );
    const measurements = [...this.measurements.values()].filter(
      (measurement) => measurement.workspaceId === workspaceId && measurement.skuId === skuId,
    );
    return Promise.resolve(buildCaptureSummary(workspaceId, skuId, assets, measurements));
  }

  private requireSku(workspaceId: string, skuId: string): SkuResponse {
    const sku = [...this.skus.values()].find(
      (candidate) => candidate.workspaceId === workspaceId && candidate.id === skuId,
    );
    if (!sku) throw new RepositoryError("forbidden", "The SKU is not available in this workspace");
    return sku;
  }

  private latestMeasurement(
    workspaceId: string,
    skuId: string,
    definitionId: string,
  ): MeasurementResponse | undefined {
    return [...this.measurements.values()]
      .filter(
        (item) =>
          item.workspaceId === workspaceId &&
          item.skuId === skuId &&
          item.definitionId === definitionId,
      )
      .sort((left, right) => right.attempt - left.attempt)[0];
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}

interface ProductSkuRow {
  id: string;
  workspace_id: string;
  sku_code: string;
  title: string;
  category: string | null;
  created_at: Date;
}

interface P0WorkflowRow {
  sku_id: string;
  state: P0WorkflowState;
  last_action: AdvanceP0WorkflowRequest["action"] | null;
  version: number;
  updated_at: Date;
}

interface MediaAssetRow {
  id: string;
  workspace_id: string;
  sku_id: string;
  role: MediaAssetResponse["role"];
  original_sha256: string;
  original_storage_key: string;
  mime_type: MediaAssetResponse["mimeType"];
  size_bytes: number;
  width: number;
  height: number;
  created_at: Date;
}

interface MeasurementRow {
  id: string;
  workspace_id: string;
  sku_id: string;
  definition_id: string;
  definition_version: number;
  value: string;
  unit: "cm";
  basis: MeasurementResponse["basis"];
  state: MeasurementResponse["state"];
  measured_by: string;
  measured_at: Date;
  evidence_asset_id: string;
  attempt: number;
  confirmed_by: string;
  requires_review: boolean;
  difference_cm: string | null;
  violations: string[];
  created_at: Date;
}

interface PutawayUnitRow {
  id: string;
  inventory_number: string;
  movement_seq: string;
  inventory_label_id: string;
  inventory_label_version: number;
}

interface PutawayLocationRow {
  id: string;
  code: string;
  location_label_id: string;
  location_label_version: number;
}

interface PutawayReplayRow {
  inventory_unit_id: string;
  inventory_number: string;
  location_id: string;
  location_code: string;
  movement_seq: number;
  scan_session_id: string;
  idempotency_key: string;
  payload_hash: string;
  moved_at: Date;
}

export class PostgresWorkflowRepository implements WorkflowRepository {
  private readonly sql: postgres.Sql;

  constructor(databaseUrl: string) {
    this.sql = postgres(databaseUrl, {
      max: 8,
      idle_timeout: 20,
      connect_timeout: 10,
      transform: { undefined: null },
    });
  }

  async sessionContext(actor: RequestActor): Promise<SessionContextResponse> {
    const workspaceId = actor.workspaceId;
    if (!workspaceId) {
      throw new RepositoryError("forbidden", "The signed session has no active workspace");
    }
    return this.sql.begin(async (transaction) => {
      await setWorkspace(transaction, workspaceId);
      const role = await requireRole(transaction, workspaceId, actor.identityId, [
        "owner",
        "inventory_manager",
        "field_worker",
        "shipping",
        "accounting",
      ]);
      return { identityId: actor.identityId, workspaceId, role };
    });
  }

  async createSku(
    workspaceId: string,
    actor: RequestActor,
    input: CreateSkuRequest,
  ): Promise<SkuResponse> {
    try {
      return await this.sql.begin(async (transaction) => {
        await setWorkspace(transaction, workspaceId);
        await requireRole(transaction, workspaceId, actor.identityId, [
          "owner",
          "inventory_manager",
        ]);
        const rows = await transaction<ProductSkuRow[]>`
          insert into product_sku (workspace_id, sku_code, title, category)
          values (${workspaceId}, ${input.skuCode}, ${input.title}, ${input.category})
          returning id, workspace_id, sku_code, title, category, created_at
        `;
        const row = rows[0];
        if (!row) throw new RepositoryError("database_error", "SKU insert returned no row");
        return toSkuResponse(row);
      });
    } catch (error) {
      throw normalizeDatabaseError(error);
    }
  }

  async inventorySummary(workspaceId: string, actor: RequestActor): Promise<InventorySummary> {
    return this.sql.begin(async (transaction) => {
      await setWorkspace(transaction, workspaceId);
      await requireRole(transaction, workspaceId, actor.identityId, ["owner", "inventory_manager"]);
      const [row] = await transaction<
        Array<{
          available: number;
          putaway_pending: number;
          reserved: number;
          discrepancies: number;
          older_than_90_days: number;
        }>
      >`
        select
          count(*) filter (where status = 'available')::int as available,
          count(*) filter (where status = 'putaway_pending')::int as putaway_pending,
          count(*) filter (where status = 'reserved')::int as reserved,
          (select count(*)::int from inventory_discrepancy where workspace_id = ${workspaceId} and state <> 'resolved') as discrepancies,
          count(*) filter (where status = 'available' and created_at < now() - interval '90 days')::int as older_than_90_days
        from inventory_unit
        where workspace_id = ${workspaceId}
      `;
      if (!row) throw new RepositoryError("database_error", "Inventory summary returned no row");
      return {
        available: row.available,
        putawayPending: row.putaway_pending,
        reserved: row.reserved,
        discrepancies: row.discrepancies,
        olderThan90Days: row.older_than_90_days,
        lastSyncedAt: new Date().toISOString(),
      };
    });
  }

  async putawayInventory(
    workspaceId: string,
    actor: RequestActor,
    input: PutawayInventoryRequest,
  ): Promise<PutawayInventoryResponse> {
    try {
      return await this.sql.begin(async (transaction) => {
        await setWorkspace(transaction, workspaceId);
        const role = await requireRole(transaction, workspaceId, actor.identityId, [
          "owner",
          "inventory_manager",
          "field_worker",
        ]);
        const payloadHash = hashPutawayInput(input);
        const replay = await transaction<PutawayReplayRow[]>`
          select movement.inventory_unit_id, unit.inventory_number,
                 movement.to_location_id as location_id, location.code as location_code,
                 movement.movement_seq::integer as movement_seq,
                 movement.scan_session_id, movement.idempotency_key,
                 movement.payload_hash, movement.moved_at
          from inventory_movement movement
          join inventory_unit unit
            on unit.workspace_id = movement.workspace_id
           and unit.id = movement.inventory_unit_id
          join location_node location
            on location.workspace_id = movement.workspace_id
           and location.id = movement.to_location_id
          where movement.workspace_id = ${workspaceId}
            and movement.idempotency_key = ${input.idempotencyKey}
        `;
        if (replay[0]) {
          if (replay[0].payload_hash !== payloadHash) {
            throw new RepositoryError(
              "conflict",
              "The idempotency key was reused with another putaway payload",
            );
          }
          return toPutawayResponse(replay[0]);
        }

        const units = await transaction<PutawayUnitRow[]>`
          select unit.id, unit.inventory_number, unit.movement_seq,
                 label.id as inventory_label_id, label.version as inventory_label_version
          from inventory_unit unit
          join lateral (
            select active_label.id, active_label.version
            from inventory_label active_label
            where active_label.workspace_id = unit.workspace_id
              and active_label.target_type = 'inventory_unit'
              and active_label.target_id = unit.id
              and active_label.active
            order by case active_label.label_kind when 'qr' then 0 else 1 end
            limit 1
          ) label on true
          where unit.workspace_id = ${workspaceId}
            and unit.inventory_number = ${input.inventoryNumber}
        `;
        const locations = await transaction<PutawayLocationRow[]>`
          select location.id, location.code,
                 label.id as location_label_id, label.version as location_label_version
          from location_node location
          join lateral (
            select active_label.id, active_label.version
            from inventory_label active_label
            where active_label.workspace_id = location.workspace_id
              and active_label.target_type = 'location'
              and active_label.target_id = location.id
              and active_label.active
            order by case active_label.label_kind when 'qr' then 0 else 1 end
            limit 1
          ) label on true
          where location.workspace_id = ${workspaceId} and location.code = ${input.locationCode}
        `;
        const unit = units[0];
        const location = locations[0];
        if (!unit || !location) {
          throw new RepositoryError(
            "conflict",
            "The inventory item or active storage location could not be confirmed",
          );
        }
        if (role === "field_worker") {
          const assignments = await transaction<Array<{ allowed: boolean }>>`
            select has_active_work_assignment(
              ${workspaceId}, ${actor.identityId}, 'putaway', ${location.id}, now()
            ) as allowed
          `;
          if (!assignments[0]?.allowed) {
            throw new RepositoryError(
              "forbidden",
              "The field worker is not assigned to this location branch and operation",
            );
          }
        }
        if (
          unit.inventory_label_version !== input.inventoryLabelVersion ||
          location.location_label_version !== input.locationLabelVersion
        ) {
          throw new RepositoryError(
            "conflict",
            "A label version changed; both labels must be read again",
          );
        }

        const scanSessionId = randomUUID();
        await transaction`
          insert into scan_session (
            id, workspace_id, operation, inventory_unit_id, expected_location_id,
            destination_location_id, inventory_label_id, inventory_label_version,
            location_label_id, location_label_version, inventory_scanned_at,
            location_scanned_at, confirmed_by, confirmed_at
          ) values (
            ${scanSessionId}, ${workspaceId}, 'putaway', ${unit.id}, null,
            ${location.id}, ${unit.inventory_label_id}, ${input.inventoryLabelVersion},
            ${location.location_label_id}, ${input.locationLabelVersion},
            ${input.inventoryScannedAt}, ${input.locationScannedAt},
            ${actor.identityId}, ${input.confirmedAt}
          )
        `;
        const movements = await transaction<Array<{ moved_at: Date }>>`
          insert into inventory_movement (
            workspace_id, inventory_unit_id, movement_seq, from_location_id,
            to_location_id, movement_kind, scan_session_id, idempotency_key,
            payload_hash, moved_by
          ) values (
            ${workspaceId}, ${unit.id}, ${Number(unit.movement_seq) + 1}, null,
            ${location.id}, 'putaway', ${scanSessionId}, ${input.idempotencyKey},
            ${payloadHash}, ${actor.identityId}
          )
          returning moved_at
        `;
        const movedAt = movements[0]?.moved_at;
        if (!movedAt) throw new RepositoryError("database_error", "Movement returned no timestamp");
        await transaction`
          insert into audit_event (
            workspace_id, actor_id, action, target_type, target_id,
            field_names, redacted_changes, reference_ids
          ) values (
            ${workspaceId}, ${actor.identityId}, 'inventory.putaway', 'inventory_unit',
            ${unit.id}, ${["status", "location_id", "movement_seq"]},
            ${transaction.json({ status: { to: "available" } })},
            ${[scanSessionId, location.id]}
          )
        `;
        return {
          inventoryUnitId: unit.id,
          inventoryNumber: unit.inventory_number,
          status: "available",
          locationId: location.id,
          locationCode: location.code,
          movementSequence: Number(unit.movement_seq) + 1,
          scanSessionId,
          idempotencyKey: input.idempotencyKey,
          syncedAt: movedAt.toISOString(),
        };
      });
    } catch (error) {
      throw normalizeDatabaseError(error);
    }
  }

  async advanceP0Workflow(
    workspaceId: string,
    skuId: string,
    actor: RequestActor,
    input: AdvanceP0WorkflowRequest,
  ): Promise<P0WorkflowResponse> {
    try {
      return await this.sql.begin(async (transaction) => {
        await setWorkspace(transaction, workspaceId);
        const role = await requireRole(transaction, workspaceId, actor.identityId, [
          "owner",
          "inventory_manager",
          "field_worker",
          "shipping",
          "accounting",
        ]);
        const payloadHash = hashWorkflowInput(input);
        const prior = await transaction<P0WorkflowRow[]>`
          select workflow.sku_id, action.response_state as state, action.action as last_action,
                 action.response_version as version, action.created_at as updated_at
          from p0_workflow_action action
          join p0_workflow workflow
            on workflow.workspace_id = action.workspace_id and workflow.sku_id = action.sku_id
          where action.workspace_id = ${workspaceId}
            and action.sku_id = ${skuId}
            and action.idempotency_key = ${input.idempotencyKey}
        `;
        if (prior[0]) {
          const hashes = await transaction<Array<{ payload_hash: string }>>`
            select payload_hash from p0_workflow_action
            where workspace_id = ${workspaceId} and sku_id = ${skuId}
              and idempotency_key = ${input.idempotencyKey}
          `;
          if (hashes[0]?.payload_hash !== payloadHash) {
            throw new RepositoryError(
              "conflict",
              "The idempotency key was reused with another payload",
            );
          }
          return toP0WorkflowResponse(workspaceId, prior[0]);
        }

        await transaction`
          insert into p0_workflow (workspace_id, sku_id)
          select ${workspaceId}, ${skuId}
          where exists (
            select 1 from product_sku where workspace_id = ${workspaceId} and id = ${skuId}
          )
          on conflict (workspace_id, sku_id) do nothing
        `;
        const rows = await transaction<P0WorkflowRow[]>`
          select sku_id, state, last_action, version, updated_at
          from p0_workflow
          where workspace_id = ${workspaceId} and sku_id = ${skuId}
          for update
        `;
        const current = rows[0];
        if (!current)
          throw new RepositoryError("forbidden", "The SKU is not available in this workspace");
        const decision = decideP0WorkflowAction({
          currentState: current.state,
          action: input.action,
          actorRole: role,
          actorKind: "human",
          evidenceCount: input.evidenceReferenceIds.length,
          requiredFactsConfirmed: input.requiredFactsConfirmed,
          manualChannelHandoff: input.manualChannelHandoff,
        });
        if (!decision.allowed) {
          throw new RepositoryError(
            "conflict",
            `P0 action rejected: ${decision.violations.join(",")}`,
          );
        }
        const nextVersion = current.version + 1;
        const updated = await transaction<P0WorkflowRow[]>`
          update p0_workflow
          set state = ${decision.nextState}, last_action = ${input.action},
              version = ${nextVersion}, updated_at = now()
          where workspace_id = ${workspaceId} and sku_id = ${skuId}
          returning sku_id, state, last_action, version, updated_at
        `;
        const result = updated[0];
        if (!result)
          throw new RepositoryError("database_error", "P0 workflow update returned no row");
        await transaction`
          insert into p0_workflow_action (
            workspace_id, sku_id, action, actor_id, evidence_reference_ids,
            idempotency_key, payload_hash, response_state, response_version
          ) values (
            ${workspaceId}, ${skuId}, ${input.action}, ${actor.identityId},
            ${input.evidenceReferenceIds}, ${input.idempotencyKey}, ${payloadHash},
            ${decision.nextState}, ${nextVersion}
          )
        `;
        await transaction`
          insert into audit_event (workspace_id, actor_id, action, target_type, target_id, field_names, redacted_changes)
          values (${workspaceId}, ${actor.identityId}, ${input.action}, 'p0_workflow', ${skuId}, array['state'], ${transaction.json({ state: decision.nextState, version: nextVersion })})
        `;
        await transaction`
          insert into outbox_event (workspace_id, event_type, aggregate_type, aggregate_id, payload)
          values (${workspaceId}, 'p0.workflow.advanced', 'product_sku', ${skuId}, ${transaction.json({ action: input.action, state: decision.nextState, version: nextVersion })})
        `;
        return toP0WorkflowResponse(workspaceId, result);
      });
    } catch (error) {
      throw normalizeDatabaseError(error);
    }
  }

  async registerMediaAsset(
    workspaceId: string,
    skuId: string,
    actor: RequestActor,
    input: RegisterMediaAssetRequest,
  ): Promise<MediaAssetResponse> {
    try {
      return await this.sql.begin(async (transaction) => {
        await setWorkspace(transaction, workspaceId);
        await requireRole(transaction, workspaceId, actor.identityId, [
          "owner",
          "inventory_manager",
          "field_worker",
        ]);
        const existingRows = await transaction<MediaAssetRow[]>`
          select id, workspace_id, sku_id, role, original_sha256, original_storage_key,
                 mime_type, size_bytes, width, height, created_at
          from media_asset
          where workspace_id = ${workspaceId} and id = ${input.assetId}
        `;
        const existing = existingRows[0];
        const candidate = {
          id: input.assetId,
          workspaceId,
          skuId,
          role: input.role,
          originalSha256: input.originalSha256,
          originalStorageKey: input.originalStorageKey,
          createdAt: new Date().toISOString(),
        };
        let registration;
        try {
          registration = registerMediaAsset(
            existing
              ? {
                  id: existing.id,
                  workspaceId: existing.workspace_id,
                  skuId: existing.sku_id,
                  role: existing.role,
                  originalSha256: existing.original_sha256,
                  originalStorageKey: existing.original_storage_key,
                  createdAt: existing.created_at.toISOString(),
                }
              : undefined,
            candidate,
          );
        } catch {
          throw new RepositoryError("conflict", "The media metadata failed safety validation");
        }
        if (registration.kind === "conflict") {
          throw new RepositoryError("conflict", "The asset ID has different immutable metadata");
        }
        if (registration.kind === "replay" && existing) return toMediaAssetResponse(existing);
        const rows = await transaction<MediaAssetRow[]>`
          insert into media_asset (
            id, workspace_id, sku_id, role, original_sha256, original_storage_key,
            mime_type, size_bytes, width, height, created_by
          ) values (
            ${input.assetId}, ${workspaceId}, ${skuId}, ${input.role}, ${input.originalSha256},
            ${input.originalStorageKey}, ${input.mimeType}, ${input.sizeBytes}, ${input.width},
            ${input.height}, ${actor.identityId}
          )
          returning id, workspace_id, sku_id, role, original_sha256, original_storage_key,
                    mime_type, size_bytes, width, height, created_at
        `;
        const row = rows[0];
        if (!row) throw new RepositoryError("database_error", "Media insert returned no row");
        await transaction`
          insert into audit_event (workspace_id, actor_id, action, target_type, target_id, field_names, reference_ids)
          values (${workspaceId}, ${actor.identityId}, 'media.original.registered', 'media_asset', ${input.assetId},
                  array['role','originalSha256','mimeType','sizeBytes','width','height'], array[${skuId}::uuid])
        `;
        return toMediaAssetResponse(row);
      });
    } catch (error) {
      throw normalizeDatabaseError(error);
    }
  }

  async recordMeasurement(
    workspaceId: string,
    skuId: string,
    actor: RequestActor,
    input: RecordMeasurementRequest,
  ): Promise<MeasurementResponse> {
    try {
      return await this.sql.begin(async (transaction) => {
        await setWorkspace(transaction, workspaceId);
        await requireRole(transaction, workspaceId, actor.identityId, [
          "owner",
          "inventory_manager",
          "field_worker",
        ]);
        const evidence = await transaction<Array<{ id: string }>>`
          select id from media_asset
          where workspace_id = ${workspaceId} and sku_id = ${skuId}
            and id = ${input.evidenceAssetId}
        `;
        if (!evidence[0]) {
          throw new RepositoryError(
            "forbidden",
            "Measurement evidence is not available for this SKU",
          );
        }
        const previousRows = await transaction<MeasurementRow[]>`
          select id, workspace_id, sku_id, definition_id, definition_version, value, unit,
                 basis, state, measured_by, measured_at, evidence_asset_id, attempt,
                 confirmed_by, requires_review, difference_cm, violations, created_at
          from measurement_attempt
          where workspace_id = ${workspaceId} and sku_id = ${skuId}
            and definition_id = ${input.definitionId}
          order by attempt desc
          limit 1
        `;
        const measurement: Measurement = {
          definitionId: input.definitionId,
          definitionVersion: input.definitionVersion,
          value: input.value,
          unit: input.unit,
          basis: input.basis,
          state: input.state,
          measuredBy: actor.identityId,
          measuredAt: input.measuredAt,
          evidenceAssetId: input.evidenceAssetId,
          attempt: input.attempt,
          confirmedBy: actor.identityId,
          confirmationReason: null,
        };
        const review = reviewMeasurement(
          measurement,
          previousRows[0] ? toDomainMeasurement(toMeasurementResponse(previousRows[0])) : undefined,
          2,
        );
        const rows = await transaction<MeasurementRow[]>`
          insert into measurement_attempt (
            workspace_id, sku_id, definition_id, definition_version, value, unit,
            basis, state, measured_by, measured_at, evidence_asset_id, attempt,
            confirmed_by, confirmed_at, requires_review, difference_cm, violations
          ) values (
            ${workspaceId}, ${skuId}, ${input.definitionId}, ${input.definitionVersion},
            ${input.value}, ${input.unit}, ${input.basis}, ${input.state}, ${actor.identityId},
            ${input.measuredAt}, ${input.evidenceAssetId}, ${input.attempt}, ${actor.identityId},
            now(), ${review.requiresReview}, ${review.difference}, ${review.violations}
          )
          returning id, workspace_id, sku_id, definition_id, definition_version, value, unit,
                    basis, state, measured_by, measured_at, evidence_asset_id, attempt,
                    confirmed_by, requires_review, difference_cm, violations, created_at
        `;
        const row = rows[0];
        if (!row) throw new RepositoryError("database_error", "Measurement insert returned no row");
        return toMeasurementResponse(row);
      });
    } catch (error) {
      throw normalizeDatabaseError(error);
    }
  }

  async captureSummary(
    workspaceId: string,
    skuId: string,
    actor: RequestActor,
  ): Promise<CaptureSummary> {
    return this.sql.begin(async (transaction) => {
      await setWorkspace(transaction, workspaceId);
      await requireRole(transaction, workspaceId, actor.identityId, [
        "owner",
        "inventory_manager",
        "field_worker",
      ]);
      const assets = await transaction<MediaAssetRow[]>`
        select id, workspace_id, sku_id, role, original_sha256, original_storage_key,
               mime_type, size_bytes, width, height, created_at
        from media_asset where workspace_id = ${workspaceId} and sku_id = ${skuId}
      `;
      const measurements = await transaction<MeasurementRow[]>`
        select id, workspace_id, sku_id, definition_id, definition_version, value, unit,
               basis, state, measured_by, measured_at, evidence_asset_id, attempt,
               confirmed_by, requires_review, difference_cm, violations, created_at
        from measurement_attempt where workspace_id = ${workspaceId} and sku_id = ${skuId}
      `;
      return buildCaptureSummary(
        workspaceId,
        skuId,
        assets.map(toMediaAssetResponse),
        measurements.map(toMeasurementResponse),
      );
    });
  }

  async close(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }
}

async function setWorkspace(sql: postgres.TransactionSql, workspaceId: string): Promise<void> {
  await sql`select set_config('app.workspace_id', ${workspaceId}, true)`;
}

async function requireRole(
  sql: postgres.TransactionSql,
  workspaceId: string,
  identityId: string,
  allowed: WorkspaceRole[],
): Promise<WorkspaceRole> {
  const rows = await sql<Array<{ role: WorkspaceRole }>>`
    select role
    from workspace_membership
    where workspace_id = ${workspaceId} and identity_id = ${identityId} and active
  `;
  const membership = rows[0];
  if (!membership || !allowed.includes(membership.role)) {
    throw new RepositoryError("forbidden", "The actor does not have access to this operation");
  }
  return membership.role;
}

function toSkuResponse(row: ProductSkuRow): SkuResponse {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    skuCode: row.sku_code,
    title: row.title,
    category: row.category,
    createdAt: row.created_at.toISOString(),
  };
}

function toP0WorkflowResponse(workspaceId: string, row: P0WorkflowRow): P0WorkflowResponse {
  return {
    workspaceId,
    skuId: row.sku_id,
    state: row.state,
    lastAction: row.last_action,
    version: row.version,
    updatedAt: row.updated_at.toISOString(),
  };
}

function toMediaAssetResponse(row: MediaAssetRow): MediaAssetResponse {
  return {
    assetId: row.id,
    workspaceId: row.workspace_id,
    skuId: row.sku_id,
    role: row.role,
    originalSha256: row.original_sha256,
    originalStorageKey: row.original_storage_key,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    width: row.width,
    height: row.height,
    createdAt: row.created_at.toISOString(),
  };
}

function toMeasurementResponse(row: MeasurementRow): MeasurementResponse {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    skuId: row.sku_id,
    definitionId: row.definition_id,
    definitionVersion: row.definition_version,
    value: Number(row.value),
    unit: row.unit,
    basis: row.basis,
    state: row.state,
    measuredAt: row.measured_at.toISOString(),
    evidenceAssetId: row.evidence_asset_id,
    attempt: row.attempt,
    measuredBy: row.measured_by,
    confirmedBy: row.confirmed_by,
    requiresReview: row.requires_review,
    differenceCm: row.difference_cm === null ? null : Number(row.difference_cm),
    violations: row.violations,
    createdAt: row.created_at.toISOString(),
  };
}

function toDomainMeasurement(response: MeasurementResponse): Measurement {
  return {
    definitionId: response.definitionId,
    definitionVersion: response.definitionVersion,
    value: response.value,
    unit: response.unit,
    basis: response.basis,
    state: response.state,
    measuredBy: response.measuredBy,
    measuredAt: response.measuredAt,
    evidenceAssetId: response.evidenceAssetId,
    attempt: response.attempt,
    confirmedBy: response.confirmedBy,
    confirmationReason: null,
  };
}

function toPutawayResponse(row: PutawayReplayRow): PutawayInventoryResponse {
  return {
    inventoryUnitId: row.inventory_unit_id,
    inventoryNumber: row.inventory_number,
    status: "available",
    locationId: row.location_id,
    locationCode: row.location_code,
    movementSequence: row.movement_seq,
    scanSessionId: row.scan_session_id,
    idempotencyKey: row.idempotency_key,
    syncedAt: row.moved_at.toISOString(),
  };
}

const requiredCaptureRoles: MediaAssetResponse["role"][] = [
  "front",
  "back",
  "brand_tag",
  "care_label",
];
const requiredCaptureMeasurements = [
  "shoulder_width",
  "chest_width",
  "sleeve_length",
  "garment_length",
];

function buildCaptureSummary(
  workspaceId: string,
  skuId: string,
  assets: MediaAssetResponse[],
  measurements: MeasurementResponse[],
): CaptureSummary {
  const photoRoles = [...new Set(assets.map((asset) => asset.role))].sort();
  const latestByDefinition = new Map<string, MeasurementResponse>();
  for (const measurement of measurements) {
    const current = latestByDefinition.get(measurement.definitionId);
    if (!current || current.attempt < measurement.attempt) {
      latestByDefinition.set(measurement.definitionId, measurement);
    }
  }
  const latest = [...latestByDefinition.values()];
  const measurementDefinitionIds = latest.map((item) => item.definitionId).sort();
  const requiredPhotoRolesComplete = requiredCaptureRoles.every((role) =>
    photoRoles.includes(role),
  );
  const requiredMeasurementsComplete = requiredCaptureMeasurements.every((definitionId) => {
    const measurement = latestByDefinition.get(definitionId);
    return Boolean(measurement && !measurement.requiresReview);
  });
  const hasReviewWarnings = latest.some((measurement) => measurement.requiresReview);
  const timestamps = [
    ...assets.map((asset) => asset.createdAt),
    ...measurements.map((measurement) => measurement.createdAt),
  ];
  return {
    workspaceId,
    skuId,
    photoRoles,
    measurementDefinitionIds,
    requiredPhotoRolesComplete,
    requiredMeasurementsComplete,
    hasReviewWarnings,
    readyForHumanReview:
      requiredPhotoRolesComplete && requiredMeasurementsComplete && !hasReviewWarnings,
    updatedAt:
      timestamps.length === 0
        ? new Date().toISOString()
        : new Date(Math.max(...timestamps.map((value) => Date.parse(value)))).toISOString(),
  };
}

function hashWorkflowInput(input: AdvanceP0WorkflowRequest): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        action: input.action,
        evidenceReferenceIds: [...input.evidenceReferenceIds].sort(),
        requiredFactsConfirmed: input.requiredFactsConfirmed,
        manualChannelHandoff: input.manualChannelHandoff,
      }),
      "utf8",
    )
    .digest("hex");
}

function hashPutawayInput(input: PutawayInventoryRequest): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        inventoryNumber: input.inventoryNumber,
        locationCode: input.locationCode,
        inventoryLabelVersion: input.inventoryLabelVersion,
        locationLabelVersion: input.locationLabelVersion,
        inventoryScannedAt: input.inventoryScannedAt,
        locationScannedAt: input.locationScannedAt,
        confirmedAt: input.confirmedAt,
        humanConfirmed: input.humanConfirmed,
      }),
      "utf8",
    )
    .digest("hex");
}

function normalizeDatabaseError(error: unknown): RepositoryError {
  if (error instanceof RepositoryError) return error;
  if (typeof error === "object" && error && "code" in error) {
    if (["23505", "23514", "P0001", "40001", "40P01"].includes(String(error.code))) {
      return new RepositoryError("conflict", "The operation conflicts with current server state");
    }
  }
  return new RepositoryError("database_error", "The database operation failed safely");
}
