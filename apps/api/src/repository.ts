import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";
import type {
  ApproveLocationPhotoRequest,
  AdvanceP0WorkflowRequest,
  CaptureSummary,
  CreateSkuRequest,
  InventorySummary,
  LocationPhotoResponse,
  MeasurementResponse,
  MediaAssetResponse,
  P0WorkflowResponse,
  PutawayInventoryRequest,
  PutawayInventoryResponse,
  RegisterLocationPhotoRequest,
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

export interface LocationPhotoReviewSource {
  originalStorageKey: string;
  mimeType: "image/jpeg" | "image/png";
}

export interface ApprovedLocationPhotoContent {
  displayStorageKey: string;
  displaySha256: string;
  mimeType: "image/jpeg" | "image/png";
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
  authorizeLocationPhotoCapture(
    workspaceId: string,
    locationId: string,
    actor: RequestActor,
  ): Promise<void>;
  registerLocationPhoto(
    workspaceId: string,
    locationId: string,
    actor: RequestActor,
    input: RegisterLocationPhotoRequest,
  ): Promise<LocationPhotoResponse>;
  approveLocationPhoto(
    workspaceId: string,
    locationId: string,
    photoId: string,
    actor: RequestActor,
    input: ApproveLocationPhotoRequest,
  ): Promise<LocationPhotoResponse>;
  approvedLocationPhotos(
    workspaceId: string,
    locationId: string,
    actor: RequestActor,
  ): Promise<LocationPhotoResponse[]>;
  locationPhotosForManagement(
    workspaceId: string,
    locationId: string,
    actor: RequestActor,
  ): Promise<LocationPhotoResponse[]>;
  locationPhotoForReview(
    workspaceId: string,
    locationId: string,
    photoId: string,
    actor: RequestActor,
  ): Promise<LocationPhotoReviewSource>;
  approvedLocationPhotoContent(
    workspaceId: string,
    locationId: string,
    photoId: string,
    actor: RequestActor,
  ): Promise<ApprovedLocationPhotoContent>;
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
  private readonly locationPhotos = new Map<string, LocationPhotoResponse>();
  private readonly locationPhotoOriginals = new Map<string, LocationPhotoReviewSource>();
  private readonly locationPhotoDisplays = new Map<string, ApprovedLocationPhotoContent>();

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

  authorizeLocationPhotoCapture(
    workspaceId: string,
    locationId: string,
    actor: RequestActor,
  ): Promise<void> {
    void workspaceId;
    void locationId;
    void actor;
    return Promise.resolve();
  }

  registerLocationPhoto(
    workspaceId: string,
    locationId: string,
    actor: RequestActor,
    input: RegisterLocationPhotoRequest,
  ): Promise<LocationPhotoResponse> {
    const key = `${workspaceId}:${input.photoId}`;
    if (this.locationPhotos.has(key)) {
      throw new RepositoryError("conflict", "The location photo ID already exists");
    }
    if (input.mimeType !== "image/jpeg" && input.mimeType !== "image/png") {
      throw new RepositoryError("conflict", "Only JPEG and PNG location photos are supported");
    }
    const response: LocationPhotoResponse = {
      photoId: input.photoId,
      workspaceId,
      locationId,
      photoKind: input.photoKind,
      reviewState: "pending",
      originalAssetId: input.originalAssetId,
      originalSha256: input.originalSha256,
      derivativeAssetId: null,
      derivativeSha256: null,
      contentUrl: null,
      gpsExifCount: 0,
      capturedBy: actor.identityId,
      capturedAt: input.capturedAt,
      reviewedBy: null,
      reviewedAt: null,
    };
    this.locationPhotos.set(key, response);
    this.locationPhotoOriginals.set(key, {
      originalStorageKey: input.originalStorageKey,
      mimeType: input.mimeType,
    });
    return Promise.resolve(response);
  }

  approveLocationPhoto(
    workspaceId: string,
    locationId: string,
    photoId: string,
    actor: RequestActor,
    input: ApproveLocationPhotoRequest,
  ): Promise<LocationPhotoResponse> {
    const key = `${workspaceId}:${photoId}`;
    const current = this.locationPhotos.get(key);
    if (!current || current.locationId !== locationId) {
      throw new RepositoryError("forbidden", "The location photo is not available");
    }
    if (current.capturedBy === actor.identityId) {
      throw new RepositoryError(
        "conflict",
        "撮影した本人は承認できません。別の担当者で確認してください。",
      );
    }
    const approved: LocationPhotoResponse = {
      ...current,
      reviewState: "approved",
      derivativeAssetId: input.derivativeAssetId,
      derivativeSha256: input.derivativeSha256,
      contentUrl: locationPhotoContentUrl(workspaceId, locationId, photoId),
      reviewedBy: actor.identityId,
      reviewedAt: input.reviewedAt,
    };
    this.locationPhotos.set(key, approved);
    const original = this.locationPhotoOriginals.get(key);
    if (!original)
      throw new RepositoryError("database_error", "Original photo metadata is missing");
    this.locationPhotoDisplays.set(key, {
      displayStorageKey: input.derivativeStorageKey,
      displaySha256: input.derivativeSha256,
      mimeType: original.mimeType,
    });
    return Promise.resolve(approved);
  }

  approvedLocationPhotos(
    workspaceId: string,
    locationId: string,
    actor: RequestActor,
  ): Promise<LocationPhotoResponse[]> {
    void actor;
    return Promise.resolve(
      [...this.locationPhotos.values()].filter(
        (photo) =>
          photo.workspaceId === workspaceId &&
          photo.locationId === locationId &&
          photo.reviewState === "approved",
      ),
    );
  }

  locationPhotosForManagement(
    workspaceId: string,
    locationId: string,
    actor: RequestActor,
  ): Promise<LocationPhotoResponse[]> {
    void actor;
    return Promise.resolve(
      [...this.locationPhotos.values()].filter(
        (photo) => photo.workspaceId === workspaceId && photo.locationId === locationId,
      ),
    );
  }

  locationPhotoForReview(
    workspaceId: string,
    locationId: string,
    photoId: string,
    actor: RequestActor,
  ): Promise<LocationPhotoReviewSource> {
    const key = `${workspaceId}:${photoId}`;
    const photo = this.locationPhotos.get(key);
    const original = this.locationPhotoOriginals.get(key);
    if (!photo || !original || photo.locationId !== locationId) {
      throw new RepositoryError("forbidden", "The location photo is not available");
    }
    if (photo.reviewState !== "pending") {
      throw new RepositoryError("conflict", "Only a pending location photo can be approved");
    }
    if (photo.capturedBy === actor.identityId) {
      throw new RepositoryError(
        "conflict",
        "撮影した本人は承認できません。別の担当者で確認してください。",
      );
    }
    return Promise.resolve(original);
  }

  approvedLocationPhotoContent(
    workspaceId: string,
    locationId: string,
    photoId: string,
    actor: RequestActor,
  ): Promise<ApprovedLocationPhotoContent> {
    void actor;
    const key = `${workspaceId}:${photoId}`;
    const photo = this.locationPhotos.get(key);
    const display = this.locationPhotoDisplays.get(key);
    if (!photo || !display || photo.locationId !== locationId || photo.reviewState !== "approved") {
      throw new RepositoryError("forbidden", "The approved display photo is not available");
    }
    return Promise.resolve(display);
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
    if (
      ["confirm_order", "confirm_pick", "confirm_pack", "confirm_ship", "approve_journal"].includes(
        input.action,
      )
    ) {
      throw new RepositoryError(
        "conflict",
        "注文・ピック・梱包・発送・会計の工程は、対応する保存操作と同時に確定します。",
      );
    }
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
    if (input.action === "confirm_capture" || input.action === "confirm_listing") {
      const assets = [...this.mediaAssets.values()].filter(
        (asset) => asset.workspaceId === workspaceId && asset.skuId === skuId,
      );
      const measurements = [...this.measurements.values()].filter(
        (measurement) => measurement.workspaceId === workspaceId && measurement.skuId === skuId,
      );
      assertCaptureEvidenceForWorkflow(workspaceId, skuId, input, assets, measurements);
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
    this.requireCaptureEditable(workspaceId, skuId);
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
    this.requireCaptureEditable(workspaceId, skuId);
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
      reviewReasonCode: input.reviewReasonCode ?? null,
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

  private requireCaptureEditable(workspaceId: string, skuId: string): void {
    const workflow = this.workflow.get(`${workspaceId}:${skuId}`);
    if (!workflow || !["sku_created", "purchase_confirmed"].includes(workflow.state)) {
      throw new RepositoryError(
        "conflict",
        "確認済みの写真・採寸は変更できません。再編集工程を開始してください。",
      );
    }
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
  review_reason_code: MeasurementResponse["reviewReasonCode"];
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

interface LocationPhotoRow {
  id: string;
  workspace_id: string;
  location_id: string;
  photo_kind: "room" | "shelf" | "exact_position";
  review_state: "pending" | "approved" | "rejected";
  original_asset_id: string;
  original_sha256: string;
  derivative_asset_id: string | null;
  derivative_sha256: string | null;
  derivative_storage_key: string | null;
  gps_exif_count: number;
  captured_by: string;
  captured_at: Date;
  reviewed_by: string | null;
  reviewed_at: Date | null;
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
    let staleLabelAudit:
      | {
          inventoryUnitId: string;
          locationId: string;
          activeInventoryVersion: number;
          activeLocationVersion: number;
        }
      | undefined;
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
          const assignments = await transaction<
            Array<{ location_allowed: boolean; inventory_allowed: boolean }>
          >`
            select
              has_active_work_assignment(
                ${workspaceId}, ${actor.identityId}, 'putaway', ${location.id}, now()
              ) as location_allowed,
              has_active_inventory_unit_assignment(
                ${workspaceId}, ${actor.identityId}, 'putaway', ${unit.id}, now()
              ) as inventory_allowed
          `;
          if (!assignments[0]?.location_allowed || !assignments[0]?.inventory_allowed) {
            throw new RepositoryError(
              "forbidden",
              "The field worker is not assigned to this inventory item and location branch",
            );
          }
        }
        if (
          unit.inventory_label_version !== input.inventoryLabelVersion ||
          location.location_label_version !== input.locationLabelVersion
        ) {
          staleLabelAudit = {
            inventoryUnitId: unit.id,
            locationId: location.id,
            activeInventoryVersion: unit.inventory_label_version,
            activeLocationVersion: location.location_label_version,
          };
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
            field_names, redacted_changes, reference_ids, reason_code, approved_by
          ) values (
            ${workspaceId}, ${actor.identityId}, 'inventory.putaway', 'inventory_unit',
            ${unit.id}, ${["status", "location_id", "movement_seq"]},
            ${transaction.json({
              before: {
                status: "putaway_pending",
                locationId: null,
                movementSequence: Number(unit.movement_seq),
              },
              after: {
                status: "available",
                locationId: location.id,
                movementSequence: Number(unit.movement_seq) + 1,
              },
            })},
            ${[scanSessionId, location.id]}, 'product_and_location_double_scan', ${actor.identityId}
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
      if (staleLabelAudit) {
        const rejected = staleLabelAudit;
        try {
          await this.sql.begin(async (transaction) => {
            await setWorkspace(transaction, workspaceId);
            await requireRole(transaction, workspaceId, actor.identityId, [
              "owner",
              "inventory_manager",
              "field_worker",
            ]);
            await transaction`
              insert into audit_event (
                workspace_id, actor_id, action, target_type, target_id,
                field_names, redacted_changes, reference_ids, reason_code
              ) values (
                ${workspaceId}, ${actor.identityId}, 'inventory.scan.rejected',
                'inventory_unit', ${rejected.inventoryUnitId},
                ${["inventory_label_version", "location_label_version"]},
                ${transaction.json({
                  before: {
                    activeInventoryLabelVersion: rejected.activeInventoryVersion,
                    activeLocationLabelVersion: rejected.activeLocationVersion,
                  },
                  after: {
                    submittedInventoryLabelVersion: input.inventoryLabelVersion,
                    submittedLocationLabelVersion: input.locationLabelVersion,
                  },
                })},
                ${[rejected.locationId]}, 'stale_label_version'
              )
            `;
          });
        } catch {
          throw new RepositoryError(
            "database_error",
            "The stale label was rejected but its audit record could not be preserved",
          );
        }
      }
      throw normalizeDatabaseError(error);
    }
  }

  async authorizeLocationPhotoCapture(
    workspaceId: string,
    locationId: string,
    actor: RequestActor,
  ): Promise<void> {
    try {
      await this.sql.begin(async (transaction) => {
        await setWorkspace(transaction, workspaceId);
        const role = await requireRole(transaction, workspaceId, actor.identityId, [
          "owner",
          "inventory_manager",
          "field_worker",
        ]);
        const locations = await transaction<Array<{ id: string }>>`
          select id from location_node
          where workspace_id = ${workspaceId} and id = ${locationId}
        `;
        if (!locations[0]) throw new RepositoryError("forbidden", "The location is not available");
        if (role === "field_worker") {
          const assignments = await transaction<Array<{ allowed: boolean }>>`
            select has_active_work_assignment(
              ${workspaceId}, ${actor.identityId}, 'photo', ${locationId}, now()
            ) as allowed
          `;
          if (!assignments[0]?.allowed) {
            throw new RepositoryError(
              "forbidden",
              "The field worker cannot photograph this branch",
            );
          }
        }
      });
    } catch (error) {
      throw normalizeDatabaseError(error);
    }
  }

  async registerLocationPhoto(
    workspaceId: string,
    locationId: string,
    actor: RequestActor,
    input: RegisterLocationPhotoRequest,
  ): Promise<LocationPhotoResponse> {
    assertLocationPhotoStorageKey(
      input.originalStorageKey,
      `workspaces/${workspaceId}/location-originals/`,
    );
    try {
      return await this.sql.begin(async (transaction) => {
        await setWorkspace(transaction, workspaceId);
        const role = await requireRole(transaction, workspaceId, actor.identityId, [
          "owner",
          "inventory_manager",
          "field_worker",
        ]);
        const locations = await transaction<Array<{ id: string }>>`
          select id from location_node
          where workspace_id = ${workspaceId} and id = ${locationId}
        `;
        if (!locations[0]) {
          throw new RepositoryError("forbidden", "The location is not available");
        }
        if (role === "field_worker") {
          const assignments = await transaction<Array<{ allowed: boolean }>>`
            select has_active_work_assignment(
              ${workspaceId}, ${actor.identityId}, 'photo', ${locationId}, now()
            ) as allowed
          `;
          if (!assignments[0]?.allowed) {
            throw new RepositoryError(
              "forbidden",
              "The field worker cannot photograph this branch",
            );
          }
        }
        const rows = await transaction<LocationPhotoRow[]>`
          insert into location_photo (
            id, workspace_id, location_id, photo_kind, original_asset_id,
            review_state, gps_exif_count, captured_by, captured_at,
            original_sha256, original_storage_key, original_mime_type,
            original_size_bytes, original_width, original_height
          ) values (
            ${input.photoId}, ${workspaceId}, ${locationId}, ${input.photoKind},
            ${input.originalAssetId}, 'pending', 0, ${actor.identityId}, ${input.capturedAt},
            ${input.originalSha256}, ${input.originalStorageKey}, ${input.mimeType},
            ${input.sizeBytes}, ${input.width}, ${input.height}
          )
          returning id, workspace_id, location_id, photo_kind, review_state,
                    original_asset_id, original_sha256, derivative_asset_id,
                    derivative_sha256, derivative_storage_key, gps_exif_count,
                    captured_by, captured_at, reviewed_by, reviewed_at
        `;
        const row = rows[0];
        if (!row) throw new RepositoryError("database_error", "Photo registration returned no row");
        await transaction`
          insert into audit_event (
            workspace_id, actor_id, action, target_type, target_id,
            field_names, redacted_changes, reference_ids, reason_code
          ) values (
            ${workspaceId}, ${actor.identityId}, 'location_photo.captured',
            'location_photo', ${input.photoId},
            ${["review_state", "photo_kind"]},
            ${transaction.json({ review_state: { to: "pending" } })},
            ${[locationId, input.originalAssetId]}, 'location_photo_submitted_for_review'
          )
        `;
        return toLocationPhotoResponse(row);
      });
    } catch (error) {
      throw normalizeDatabaseError(error);
    }
  }

  async approveLocationPhoto(
    workspaceId: string,
    locationId: string,
    photoId: string,
    actor: RequestActor,
    input: ApproveLocationPhotoRequest,
  ): Promise<LocationPhotoResponse> {
    assertLocationPhotoStorageKey(
      input.derivativeStorageKey,
      `workspaces/${workspaceId}/location-display/`,
    );
    try {
      return await this.sql.begin(async (transaction) => {
        await setWorkspace(transaction, workspaceId);
        await requireRole(transaction, workspaceId, actor.identityId, [
          "owner",
          "inventory_manager",
        ]);
        const rows = await transaction<LocationPhotoRow[]>`
          update location_photo
          set review_state = 'approved', derivative_asset_id = ${input.derivativeAssetId},
              derivative_sha256 = ${input.derivativeSha256},
              derivative_storage_key = ${input.derivativeStorageKey},
              gps_exif_count = ${input.gpsExifCount}, reviewed_by = ${actor.identityId},
              reviewed_at = ${input.reviewedAt}, rejection_reason = null
          where workspace_id = ${workspaceId} and location_id = ${locationId}
            and id = ${photoId} and review_state = 'pending'
          returning id, workspace_id, location_id, photo_kind, review_state,
                    original_asset_id, original_sha256, derivative_asset_id,
                    derivative_sha256, derivative_storage_key, gps_exif_count,
                    captured_by, captured_at, reviewed_by, reviewed_at
        `;
        const row = rows[0];
        if (!row) {
          throw new RepositoryError("conflict", "Only a pending location photo can be approved");
        }
        await transaction`
          insert into audit_event (
            workspace_id, actor_id, action, target_type, target_id,
            field_names, redacted_changes, reference_ids, reason_code, approved_by
          ) values (
            ${workspaceId}, ${actor.identityId}, 'location_photo.approved',
            'location_photo', ${photoId},
            ${["review_state", "gps_exif_count"]},
            ${transaction.json({ review_state: { from: "pending", to: "approved" }, gps_exif_count: { to: 0 } })},
            ${[locationId, input.derivativeAssetId]}, 'separate_reviewer_approved', ${actor.identityId}
          )
        `;
        return toLocationPhotoResponse(row);
      });
    } catch (error) {
      throw normalizeDatabaseError(error);
    }
  }

  async approvedLocationPhotos(
    workspaceId: string,
    locationId: string,
    actor: RequestActor,
  ): Promise<LocationPhotoResponse[]> {
    try {
      return await this.sql.begin(async (transaction) => {
        await setWorkspace(transaction, workspaceId);
        const role = await requireRole(transaction, workspaceId, actor.identityId, [
          "owner",
          "inventory_manager",
          "field_worker",
        ]);
        if (role === "field_worker") {
          const assignments = await transaction<Array<{ allowed: boolean }>>`
            select (
              has_active_work_assignment(
                ${workspaceId}, ${actor.identityId}, 'putaway', ${locationId}, now()
              ) or has_active_work_assignment(
                ${workspaceId}, ${actor.identityId}, 'photo', ${locationId}, now()
              )
            ) as allowed
          `;
          if (!assignments[0]?.allowed) {
            throw new RepositoryError("forbidden", "The location photo is outside this assignment");
          }
        }
        const rows = await transaction<LocationPhotoRow[]>`
          select id, workspace_id, location_id, photo_kind, review_state,
                 original_asset_id, original_sha256, derivative_asset_id,
                 derivative_sha256, derivative_storage_key, gps_exif_count,
                 captured_by, captured_at, reviewed_by, reviewed_at
          from location_photo
          where workspace_id = ${workspaceId} and location_id = ${locationId}
            and review_state = 'approved'
          order by photo_kind, reviewed_at desc
        `;
        return rows.map(toLocationPhotoResponse);
      });
    } catch (error) {
      throw normalizeDatabaseError(error);
    }
  }

  async locationPhotosForManagement(
    workspaceId: string,
    locationId: string,
    actor: RequestActor,
  ): Promise<LocationPhotoResponse[]> {
    try {
      return await this.sql.begin(async (transaction) => {
        await setWorkspace(transaction, workspaceId);
        await requireRole(transaction, workspaceId, actor.identityId, [
          "owner",
          "inventory_manager",
        ]);
        const rows = await transaction<LocationPhotoRow[]>`
          select id, workspace_id, location_id, photo_kind, review_state,
                 original_asset_id, original_sha256, derivative_asset_id,
                 derivative_sha256, derivative_storage_key, gps_exif_count,
                 captured_by, captured_at, reviewed_by, reviewed_at
          from location_photo
          where workspace_id = ${workspaceId} and location_id = ${locationId}
          order by (review_state = 'pending') desc, captured_at desc
        `;
        return rows.map(toLocationPhotoResponse);
      });
    } catch (error) {
      throw normalizeDatabaseError(error);
    }
  }

  async locationPhotoForReview(
    workspaceId: string,
    locationId: string,
    photoId: string,
    actor: RequestActor,
  ): Promise<LocationPhotoReviewSource> {
    try {
      return await this.sql.begin(async (transaction) => {
        await setWorkspace(transaction, workspaceId);
        await requireRole(transaction, workspaceId, actor.identityId, [
          "owner",
          "inventory_manager",
        ]);
        const rows = await transaction<
          Array<{
            original_storage_key: string;
            original_mime_type: string;
            captured_by: string;
            review_state: string;
          }>
        >`
          select original_storage_key, original_mime_type, captured_by, review_state
          from location_photo
          where workspace_id = ${workspaceId} and location_id = ${locationId} and id = ${photoId}
        `;
        const row = rows[0];
        if (!row) throw new RepositoryError("forbidden", "The location photo is not available");
        if (row.review_state !== "pending") {
          throw new RepositoryError("conflict", "Only a pending location photo can be approved");
        }
        if (row.captured_by === actor.identityId) {
          throw new RepositoryError(
            "conflict",
            "撮影した本人は承認できません。別の担当者で確認してください。",
          );
        }
        if (row.original_mime_type !== "image/jpeg" && row.original_mime_type !== "image/png") {
          throw new RepositoryError("conflict", "The original image format is not supported");
        }
        return {
          originalStorageKey: row.original_storage_key,
          mimeType: row.original_mime_type,
        };
      });
    } catch (error) {
      throw normalizeDatabaseError(error);
    }
  }

  async approvedLocationPhotoContent(
    workspaceId: string,
    locationId: string,
    photoId: string,
    actor: RequestActor,
  ): Promise<ApprovedLocationPhotoContent> {
    try {
      return await this.sql.begin(async (transaction) => {
        await setWorkspace(transaction, workspaceId);
        const role = await requireRole(transaction, workspaceId, actor.identityId, [
          "owner",
          "inventory_manager",
          "field_worker",
        ]);
        if (role === "field_worker") {
          const assignments = await transaction<Array<{ allowed: boolean }>>`
            select (
              has_active_work_assignment(
                ${workspaceId}, ${actor.identityId}, 'putaway', ${locationId}, now()
              ) or has_active_work_assignment(
                ${workspaceId}, ${actor.identityId}, 'photo', ${locationId}, now()
              )
            ) as allowed
          `;
          if (!assignments[0]?.allowed) {
            throw new RepositoryError("forbidden", "The location photo is outside this assignment");
          }
        }
        const rows = await transaction<
          Array<{
            derivative_storage_key: string;
            derivative_sha256: string;
            original_mime_type: string;
          }>
        >`
          select derivative_storage_key, derivative_sha256, original_mime_type
          from location_photo
          where workspace_id = ${workspaceId} and location_id = ${locationId} and id = ${photoId}
            and review_state = 'approved' and derivative_storage_key is not null
        `;
        const row = rows[0];
        if (!row) {
          throw new RepositoryError("forbidden", "The approved display photo is not available");
        }
        if (row.original_mime_type !== "image/jpeg" && row.original_mime_type !== "image/png") {
          throw new RepositoryError("conflict", "The display image format is not supported");
        }
        return {
          displayStorageKey: row.derivative_storage_key,
          displaySha256: row.derivative_sha256,
          mimeType: row.original_mime_type,
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
        if (
          [
            "confirm_order",
            "confirm_pick",
            "confirm_pack",
            "confirm_ship",
            "approve_journal",
          ].includes(input.action)
        ) {
          throw new RepositoryError(
            "conflict",
            "注文・ピック・梱包・発送・会計の工程は、対応する保存操作と同時に確定します。",
          );
        }
        await requireSkuAssignmentIfFieldWorker(
          transaction,
          workspaceId,
          skuId,
          actor.identityId,
          role,
        );
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
        if (input.action === "confirm_capture" || input.action === "confirm_listing") {
          const assets = await transaction<MediaAssetRow[]>`
            select id, workspace_id, sku_id, role, original_sha256, original_storage_key,
                   mime_type, size_bytes, width, height, created_at
            from media_asset
            where workspace_id = ${workspaceId} and sku_id = ${skuId}
          `;
          const measurements = await transaction<MeasurementRow[]>`
            select id, workspace_id, sku_id, definition_id, definition_version, value, unit,
                   basis, state, measured_by, measured_at, evidence_asset_id, attempt,
                   confirmed_by, requires_review, difference_cm, violations, review_reason_code, created_at
            from measurement_attempt
            where workspace_id = ${workspaceId} and sku_id = ${skuId}
          `;
          assertCaptureEvidenceForWorkflow(
            workspaceId,
            skuId,
            input,
            assets.map(toMediaAssetResponse),
            measurements.map(toMeasurementResponse),
          );
        }
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
          insert into audit_event (
            workspace_id, actor_id, action, target_type, target_id, field_names,
            redacted_changes, reason_code, approved_by
          ) values (
            ${workspaceId}, ${actor.identityId}, ${input.action}, 'p0_workflow', ${skuId},
            array['state','version'], ${transaction.json({
              before: { state: current.state, version: current.version },
              after: { state: decision.nextState, version: nextVersion },
            })},
            'human_workflow_confirmation', ${actor.identityId}
          )
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
        const role = await requireRole(transaction, workspaceId, actor.identityId, [
          "owner",
          "inventory_manager",
          "field_worker",
        ]);
        await requireSkuAssignmentIfFieldWorker(
          transaction,
          workspaceId,
          skuId,
          actor.identityId,
          role,
        );
        await requireCaptureEditable(transaction, workspaceId, skuId);
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
          insert into audit_event (
            workspace_id, actor_id, action, target_type, target_id, field_names,
            redacted_changes, reference_ids, reason_code, approved_by
          )
          values (${workspaceId}, ${actor.identityId}, 'media.original.registered', 'media_asset', ${input.assetId},
                  array['role','mimeType','sizeBytes','width','height'],
                  ${transaction.json({
                    before: { record: "absent" },
                    after: {
                      record: "registered",
                      role: input.role,
                      mimeType: input.mimeType,
                      sizeBytes: input.sizeBytes,
                      width: input.width,
                      height: input.height,
                    },
                  })},
                  array[${skuId}::uuid],
                  'server_verified_original_bytes', ${actor.identityId})
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
        const role = await requireRole(transaction, workspaceId, actor.identityId, [
          "owner",
          "inventory_manager",
          "field_worker",
        ]);
        await requireSkuAssignmentIfFieldWorker(
          transaction,
          workspaceId,
          skuId,
          actor.identityId,
          role,
        );
        await requireCaptureEditable(transaction, workspaceId, skuId);
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
                 confirmed_by, requires_review, difference_cm, violations, review_reason_code, created_at
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
        const reviewReasonCode = review.requiresReview ? (input.reviewReasonCode ?? null) : null;
        const requiresReview = review.requiresReview && reviewReasonCode === null;
        const storedViolations = requiresReview ? review.violations : [];
        const rows = await transaction<MeasurementRow[]>`
          insert into measurement_attempt (
            workspace_id, sku_id, definition_id, definition_version, value, unit,
            basis, state, measured_by, measured_at, evidence_asset_id, attempt,
            confirmed_by, confirmed_at, requires_review, difference_cm, violations,
            review_reason_code
          ) values (
            ${workspaceId}, ${skuId}, ${input.definitionId}, ${input.definitionVersion},
            ${input.value}, ${input.unit}, ${input.basis}, ${input.state}, ${actor.identityId},
            ${input.measuredAt}, ${input.evidenceAssetId}, ${input.attempt}, ${actor.identityId},
            now(), ${requiresReview}, ${review.difference}, ${storedViolations}, ${reviewReasonCode}
          )
          returning id, workspace_id, sku_id, definition_id, definition_version, value, unit,
                    basis, state, measured_by, measured_at, evidence_asset_id, attempt,
                    confirmed_by, requires_review, difference_cm, violations, review_reason_code, created_at
        `;
        const row = rows[0];
        if (!row) throw new RepositoryError("database_error", "Measurement insert returned no row");
        await transaction`
          insert into audit_event (
            workspace_id, actor_id, action, target_type, target_id, field_names,
            redacted_changes, reference_ids, reason_code, approved_by
          ) values (
            ${workspaceId}, ${actor.identityId}, 'measurement.recorded', 'measurement_attempt',
            ${row.id}, ${["value", "attempt", "requires_review"]},
            ${transaction.json({
              before: previousRows[0]
                ? { value: Number(previousRows[0].value), attempt: previousRows[0].attempt }
                : { value: null, attempt: 0 },
              after: { value: Number(row.value), attempt: row.attempt, requiresReview },
            })}, ${[input.evidenceAssetId]},
            ${reviewReasonCode ?? "measurement_human_confirmed"}, ${actor.identityId}
          )
        `;
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
      const role = await requireRole(transaction, workspaceId, actor.identityId, [
        "owner",
        "inventory_manager",
        "field_worker",
      ]);
      await requireSkuAssignmentIfFieldWorker(
        transaction,
        workspaceId,
        skuId,
        actor.identityId,
        role,
      );
      const assets = await transaction<MediaAssetRow[]>`
        select id, workspace_id, sku_id, role, original_sha256, original_storage_key,
               mime_type, size_bytes, width, height, created_at
        from media_asset where workspace_id = ${workspaceId} and sku_id = ${skuId}
      `;
      const measurements = await transaction<MeasurementRow[]>`
        select id, workspace_id, sku_id, definition_id, definition_version, value, unit,
               basis, state, measured_by, measured_at, evidence_asset_id, attempt,
               confirmed_by, requires_review, difference_cm, violations, review_reason_code, created_at
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

async function requireSkuAssignmentIfFieldWorker(
  sql: postgres.TransactionSql,
  workspaceId: string,
  skuId: string,
  identityId: string,
  role: WorkspaceRole,
): Promise<void> {
  if (role !== "field_worker") return;
  const rows = await sql<Array<{ allowed: boolean }>>`
    select has_active_sku_work_assignment(
      ${workspaceId}, ${identityId}, 'capture', ${skuId}, now()
    ) as allowed
  `;
  if (!rows[0]?.allowed) {
    throw new RepositoryError("forbidden", "The SKU capture is outside this assignment");
  }
}

async function requireCaptureEditable(
  sql: postgres.TransactionSql,
  workspaceId: string,
  skuId: string,
): Promise<void> {
  const rows = await sql<Array<{ state: string }>>`
    select state from p0_workflow
    where workspace_id = ${workspaceId} and sku_id = ${skuId}
  `;
  if (!rows[0] || !["sku_created", "purchase_confirmed"].includes(rows[0].state)) {
    throw new RepositoryError(
      "conflict",
      "Capture evidence is immutable after capture confirmation; reopen is not available in P0",
    );
  }
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
    reviewReasonCode: row.review_reason_code,
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

function toLocationPhotoResponse(row: LocationPhotoRow): LocationPhotoResponse {
  return {
    photoId: row.id,
    workspaceId: row.workspace_id,
    locationId: row.location_id,
    photoKind: row.photo_kind,
    reviewState: row.review_state,
    originalAssetId: row.original_asset_id,
    originalSha256: row.original_sha256,
    derivativeAssetId: row.derivative_asset_id,
    derivativeSha256: row.derivative_sha256,
    contentUrl:
      row.review_state === "approved"
        ? locationPhotoContentUrl(row.workspace_id, row.location_id, row.id)
        : null,
    gpsExifCount: 0,
    capturedBy: row.captured_by,
    capturedAt: row.captured_at.toISOString(),
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at?.toISOString() ?? null,
  };
}

function locationPhotoContentUrl(workspaceId: string, locationId: string, photoId: string): string {
  return `/v1/workspaces/${workspaceId}/locations/${locationId}/photos/${photoId}/content`;
}

function assertLocationPhotoStorageKey(value: string, expectedPrefix: string): void {
  if (!value.startsWith(expectedPrefix) || value.includes("..")) {
    throw new RepositoryError(
      "forbidden",
      "The location photo storage key is outside its workspace",
    );
  }
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
  "body_length",
];

function assertCaptureEvidenceForWorkflow(
  workspaceId: string,
  skuId: string,
  input: AdvanceP0WorkflowRequest,
  assets: MediaAssetResponse[],
  measurements: MeasurementResponse[],
): void {
  const summary = buildCaptureSummary(workspaceId, skuId, assets, measurements);
  if (!summary.readyForHumanReview) {
    throw new RepositoryError(
      "conflict",
      "撮影4種類と必須採寸4項目を、警告なしで確認してから完了してください。",
    );
  }

  const submitted = new Set(input.evidenceReferenceIds);
  const assetById = new Map(assets.map((asset) => [asset.assetId, asset]));
  if (input.action === "confirm_capture") {
    if ([...submitted].some((id) => !assetById.has(id))) {
      throw new RepositoryError(
        "conflict",
        "撮影完了の根拠に、このSKU以外の写真が含まれています。",
      );
    }
    const submittedRoles = new Set(
      [...submitted]
        .map((id) => assetById.get(id)?.role)
        .filter((role): role is MediaAssetResponse["role"] => role !== undefined),
    );
    if (!requiredCaptureRoles.every((role) => submittedRoles.has(role))) {
      throw new RepositoryError("conflict", "撮影完了には必須4種類の写真根拠が必要です。");
    }
    return;
  }

  const latestByDefinition = new Map<string, MeasurementResponse>();
  for (const measurement of measurements) {
    const current = latestByDefinition.get(measurement.definitionId);
    if (!current || current.attempt < measurement.attempt) {
      latestByDefinition.set(measurement.definitionId, measurement);
    }
  }
  const expected = new Set([
    ...assets.map((asset) => asset.assetId),
    ...[...latestByDefinition.values()].map((measurement) => measurement.id),
  ]);
  if (
    submitted.size !== expected.size ||
    [...submitted].some((id) => !expected.has(id)) ||
    [...expected].some((id) => !submitted.has(id))
  ) {
    throw new RepositoryError(
      "conflict",
      "文章候補の根拠が現在の写真・採寸と一致しません。再読込して確認してください。",
    );
  }
}

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
