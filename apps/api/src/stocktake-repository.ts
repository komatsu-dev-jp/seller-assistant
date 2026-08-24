import { createHash, randomUUID } from "node:crypto";
import type {
  ApproveStocktakeRequest,
  ConfirmMissingCandidateRequest,
  CreateDiscrepancyChallengeRequest,
  DiscrepancyChallengeResponse,
  DiscrepancyEvidenceListItem,
  DiscrepancyEvidenceResponse,
  ReissuedInventoryLabelResponse,
  ReissueInventoryLabelRequest,
  ResolveStocktakeDiscrepancyRequest,
  RestoreMissingCandidateRequest,
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
  registerDiscrepancyEvidence(
    workspaceId: string,
    stocktakeId: string,
    discrepancyId: string,
    actor: RequestActor,
    input: RegisteredDiscrepancyEvidence,
  ): Promise<DiscrepancyEvidenceResponse>;
  listDiscrepancyEvidence(
    workspaceId: string,
    stocktakeId: string,
    discrepancyId: string,
    actor: RequestActor,
  ): Promise<DiscrepancyEvidenceListItem[]>;
  readDiscrepancyEvidence(
    workspaceId: string,
    stocktakeId: string,
    discrepancyId: string,
    evidenceId: string,
    actor: RequestActor,
  ): Promise<DiscrepancyEvidenceFile>;
  createDiscrepancyChallenge(
    workspaceId: string,
    stocktakeId: string,
    discrepancyId: string,
    actor: RequestActor,
    input: CreateDiscrepancyChallengeRequest,
  ): Promise<DiscrepancyChallengeResponse>;
  confirmMissingCandidate(
    workspaceId: string,
    stocktakeId: string,
    discrepancyId: string,
    actor: RequestActor,
    input: ConfirmMissingCandidateRequest,
  ): Promise<StocktakeResponse>;
  restoreMissingCandidate(
    workspaceId: string,
    stocktakeId: string,
    discrepancyId: string,
    actor: RequestActor,
    input: RestoreMissingCandidateRequest,
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

export interface RegisteredDiscrepancyEvidence {
  evidenceId: string;
  mimeType: "image/jpeg" | "image/png";
  width: number;
  height: number;
  sizeBytes: number;
  sha256: string;
  storageKey: string;
}

export interface DiscrepancyEvidenceFile {
  mimeType: "image/jpeg" | "image/png";
  width: number;
  height: number;
  sizeBytes: number;
  sha256: string;
  storageKey: string;
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
      const membership = await transaction<
        Array<{
          active_member_count: number;
          membership_revision: number;
          confirmation_mode: "solo_reversible" | "dual_actor";
        }>
      >`
        select active_member_count, membership_revision::integer as membership_revision,
               confirmation_mode
        from lock_membership_gate_and_count(${workspaceId})
      `;
      const selected = membership[0];
      if (!selected || selected.active_member_count < 1) {
        throw new RepositoryError("forbidden", "An active workspace member is required");
      }
      const sequence = await transaction<Array<{ basis: number }>>`
        select coalesce(max(movement_seq), 0)::integer as basis
        from inventory_unit where workspace_id = ${workspaceId} and location_id = ${input.locationId}
      `;
      const stocktakeId = randomUUID();
      await transaction`
        insert into count_session (
          id, workspace_id, location_id, state, basis_movement_seq,
          initial_counter_id, confirmation_mode, active_member_count,
          membership_revision, started_at
        ) values (
          ${stocktakeId}, ${workspaceId}, ${input.locationId}, 'counting',
          ${sequence[0]?.basis ?? 0}, ${actor.identityId}, ${selected.confirmation_mode},
          ${selected.active_member_count}, ${selected.membership_revision}, statement_timestamp()
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
        {
          state: "counting",
          locationId: input.locationId,
          expectedUnitCount: snapshot.length,
          confirmationMode: selected.confirmation_mode,
          activeMembershipCount: selected.active_member_count,
          membershipRevision: selected.membership_revision,
        },
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
        Array<{
          location_id: string;
          initial_counter_id: string;
          state: string;
          confirmation_mode: "solo_reversible" | "dual_actor";
          active_member_count: number;
          membership_revision: number;
        }>
      >`
        select location_id, initial_counter_id, state, confirmation_mode,
               active_member_count, membership_revision::integer as membership_revision
        from count_session
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
        Array<{
          location_id: string;
          initial_counter_id: string;
          state: string;
          confirmation_mode: "solo_reversible" | "dual_actor";
          active_member_count: number;
          membership_revision: number;
        }>
      >`
        select location_id, initial_counter_id, state, confirmation_mode,
               active_member_count, membership_revision::integer as membership_revision
        from count_session
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
          workspace_id, count_session_id, inventory_unit_id, kind, state, requester_id,
          confirmation_mode, active_member_count, membership_revision
        )
        select ${workspaceId}, ${stocktakeId}, unit.id, 'missing_candidate',
               'reconfirmation_required', ${actor.identityId}, ${session.confirmation_mode},
               ${session.active_member_count}, ${session.membership_revision}
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
          workspace_id, count_session_id, inventory_unit_id, kind, state, requester_id,
          confirmation_mode, active_member_count, membership_revision
        )
        select ${workspaceId}, ${stocktakeId}, observation.inventory_unit_id,
               observation.result, 'reconfirmation_required', ${actor.identityId},
               ${session.confirmation_mode}, ${session.active_member_count},
               ${session.membership_revision}
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
          and id = ${discrepancyId} and kind <> 'missing_candidate'
          and state <> 'resolved'
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

  async registerDiscrepancyEvidence(
    workspaceId: string,
    stocktakeId: string,
    discrepancyId: string,
    actor: RequestActor,
    input: RegisteredDiscrepancyEvidence,
  ): Promise<DiscrepancyEvidenceResponse> {
    return this.run(workspaceId, actor, async (transaction) => {
      const discrepancies = await transaction<
        Array<{ inventory_unit_id: string; state: string; kind: string }>
      >`
        select inventory_unit_id, state, kind from inventory_discrepancy
        where workspace_id = ${workspaceId} and count_session_id = ${stocktakeId}
          and id = ${discrepancyId} for update
      `;
      const discrepancy = discrepancies[0];
      if (
        !discrepancy ||
        discrepancy.kind !== "missing_candidate" ||
        discrepancy.state !== "reconfirmation_required" ||
        !discrepancy.inventory_unit_id
      ) {
        throw new RepositoryError("conflict", "The missing candidate cannot accept evidence");
      }
      const rows = await transaction<Array<{ created_at: Date }>>`
        insert into discrepancy_evidence_media (
          id, workspace_id, discrepancy_id, inventory_unit_id, original_sha256,
          original_storage_key, mime_type, size_bytes, width, height, created_by
        ) values (
          ${input.evidenceId}, ${workspaceId}, ${discrepancyId},
          ${discrepancy.inventory_unit_id}, ${input.sha256}, ${input.storageKey},
          ${input.mimeType}, ${input.sizeBytes}, ${input.width}, ${input.height},
          ${actor.identityId}
        ) returning created_at
      `;
      await audit(
        transaction,
        workspaceId,
        actor.identityId,
        "stocktake.discrepancy.evidence_registered",
        discrepancyId,
        { evidenceCountDelta: 0 },
        { evidenceCountDelta: 1, mimeType: input.mimeType, serverInspected: true },
        "private_photo_server_inspected",
      );
      return {
        evidenceId: input.evidenceId,
        discrepancyId,
        mimeType: input.mimeType,
        width: input.width,
        height: input.height,
        sizeBytes: input.sizeBytes,
        sha256: input.sha256,
        serverInspected: true,
        createdAt: rows[0]?.created_at.toISOString() ?? new Date().toISOString(),
      };
    });
  }

  async listDiscrepancyEvidence(
    workspaceId: string,
    stocktakeId: string,
    discrepancyId: string,
    actor: RequestActor,
  ): Promise<DiscrepancyEvidenceListItem[]> {
    return this.run(workspaceId, actor, async (transaction) => {
      const rows = await transaction<
        Array<{
          id: string;
          mime_type: "image/jpeg" | "image/png";
          width: number;
          height: number;
          size_bytes: number;
          created_at: Date;
        }>
      >`
        select evidence.id, evidence.mime_type, evidence.width, evidence.height,
               evidence.size_bytes, evidence.created_at
        from discrepancy_evidence_media evidence
        join inventory_discrepancy discrepancy
          on discrepancy.workspace_id = evidence.workspace_id
         and discrepancy.id = evidence.discrepancy_id
         and discrepancy.inventory_unit_id = evidence.inventory_unit_id
        where evidence.workspace_id = ${workspaceId}
          and discrepancy.count_session_id = ${stocktakeId}
          and discrepancy.id = ${discrepancyId}
        order by evidence.created_at desc, evidence.id desc
        limit 20
      `;
      return rows.map((row) => ({
        evidenceId: row.id,
        discrepancyId,
        mimeType: row.mime_type,
        width: row.width,
        height: row.height,
        sizeBytes: row.size_bytes,
        contentUrl: `/v1/workspaces/${workspaceId}/stocktakes/${stocktakeId}/discrepancies/${discrepancyId}/evidence/${row.id}/content`,
        createdAt: row.created_at.toISOString(),
      }));
    });
  }

  async readDiscrepancyEvidence(
    workspaceId: string,
    stocktakeId: string,
    discrepancyId: string,
    evidenceId: string,
    actor: RequestActor,
  ): Promise<DiscrepancyEvidenceFile> {
    return this.run(workspaceId, actor, async (transaction) => {
      const rows = await transaction<
        Array<{
          mime_type: "image/jpeg" | "image/png";
          width: number;
          height: number;
          size_bytes: number;
          original_sha256: string;
          original_storage_key: string;
        }>
      >`
        select evidence.mime_type, evidence.width, evidence.height, evidence.size_bytes,
               evidence.original_sha256, evidence.original_storage_key
        from discrepancy_evidence_media evidence
        join inventory_discrepancy discrepancy
          on discrepancy.workspace_id = evidence.workspace_id
         and discrepancy.id = evidence.discrepancy_id
         and discrepancy.inventory_unit_id = evidence.inventory_unit_id
        where evidence.workspace_id = ${workspaceId}
          and discrepancy.count_session_id = ${stocktakeId}
          and discrepancy.id = ${discrepancyId}
          and evidence.id = ${evidenceId}
      `;
      const row = rows[0];
      if (!row) throw new RepositoryError("conflict", "The private evidence is unavailable");
      return {
        mimeType: row.mime_type,
        width: row.width,
        height: row.height,
        sizeBytes: row.size_bytes,
        sha256: row.original_sha256,
        storageKey: row.original_storage_key,
      };
    });
  }

  async createDiscrepancyChallenge(
    workspaceId: string,
    stocktakeId: string,
    discrepancyId: string,
    actor: RequestActor,
    input: CreateDiscrepancyChallengeRequest,
  ): Promise<DiscrepancyChallengeResponse> {
    return this.run(workspaceId, actor, async (transaction) => {
      const rows = await transaction<
        Array<{
          inventory_unit_id: string;
          requester_id: string;
          state: "reconfirmation_required" | "candidate_confirmed";
          confirmation_mode: "solo_reversible" | "dual_actor";
          active_member_count: number;
          membership_revision: number;
          inventory_number: string;
          sku_id: string;
          location_id: string;
          location_code: string;
        }>
      >`
        select discrepancy.inventory_unit_id, discrepancy.requester_id, discrepancy.state,
               discrepancy.confirmation_mode, discrepancy.active_member_count,
               discrepancy.membership_revision::integer as membership_revision,
               unit.inventory_number, unit.sku_id, unit.location_id,
               location.code as location_code
        from inventory_discrepancy discrepancy
        join inventory_unit unit
          on unit.workspace_id = discrepancy.workspace_id and unit.id = discrepancy.inventory_unit_id
        join location_node location
          on location.workspace_id = unit.workspace_id and location.id = unit.location_id
        where discrepancy.workspace_id = ${workspaceId}
          and discrepancy.count_session_id = ${stocktakeId}
          and discrepancy.id = ${discrepancyId}
          and discrepancy.kind = 'missing_candidate'
          and unit.status = 'available'
        for update of discrepancy
      `;
      const discrepancy = rows[0];
      const requiredState =
        input.action === "confirm" ? "reconfirmation_required" : "candidate_confirmed";
      if (!discrepancy || discrepancy.state !== requiredState) {
        throw new RepositoryError("conflict", "The discrepancy action is unavailable");
      }
      if (
        input.action === "confirm" &&
        discrepancy.confirmation_mode === "dual_actor" &&
        discrepancy.requester_id === actor.identityId
      ) {
        throw new RepositoryError("forbidden", "Another person must confirm this discrepancy");
      }
      if (discrepancy.inventory_number !== input.inventoryNumber) {
        throw new RepositoryError("conflict", "The current item must be rescanned");
      }
      const destinations = await transaction<
        Array<{
          id: string;
          code: string;
          can_store_inventory: boolean;
          single_item_only: boolean;
          allow_mixed_sku: boolean;
          max_units: number | null;
          occupied_count: number;
          different_sku_count: number;
        }>
      >`
        select location.id, location.code, location.can_store_inventory,
               location.single_item_only, location.allow_mixed_sku, location.max_units,
               (select count(*)::integer from inventory_unit occupied
                 where occupied.workspace_id = location.workspace_id
                   and occupied.location_id = location.id
                   and occupied.id <> ${discrepancy.inventory_unit_id}
                   and occupied.status in (
                     'available', 'reserved', 'picked', 'packed',
                     'quarantined', 'disposal_pending'
                   )) as occupied_count,
               (select count(*)::integer from inventory_unit occupied
                 where occupied.workspace_id = location.workspace_id
                   and occupied.location_id = location.id
                   and occupied.id <> ${discrepancy.inventory_unit_id}
                   and occupied.sku_id <> ${discrepancy.sku_id}
                   and occupied.status in (
                     'available', 'reserved', 'picked', 'packed',
                     'quarantined', 'disposal_pending'
                   )) as different_sku_count
        from location_node location
        where location.workspace_id = ${workspaceId} and location.code = ${input.locationCode}
          and location.state = 'active'
      `;
      const destination = destinations[0];
      if (!destination || !destination.can_store_inventory) {
        throw new RepositoryError("conflict", "The rescanned location cannot store inventory");
      }
      if (input.action === "confirm" && destination.id !== discrepancy.location_id) {
        throw new RepositoryError(
          "conflict",
          "Confirm the missing candidate at its recorded location",
        );
      }
      if (
        input.action === "restore" &&
        ((destination.single_item_only && destination.occupied_count > 0) ||
          (destination.max_units !== null && destination.occupied_count >= destination.max_units) ||
          (!destination.allow_mixed_sku && destination.different_sku_count > 0))
      ) {
        throw new RepositoryError(
          "conflict",
          "The found location is full or does not allow this SKU",
        );
      }
      const labels = await transaction<
        Array<{
          inventory_label_id: string;
          inventory_label_version: number;
          location_label_id: string;
          location_label_version: number;
        }>
      >`
        select item.id as inventory_label_id, item.version as inventory_label_version,
               place.id as location_label_id, place.version as location_label_version
        from inventory_label item
        join inventory_label place on place.workspace_id = item.workspace_id
        where item.workspace_id = ${workspaceId}
          and item.target_type = 'inventory_unit'
          and item.target_id = ${discrepancy.inventory_unit_id}
          and item.active and item.version = ${input.inventoryLabelVersion}
          and place.target_type = 'location'
          and place.target_id = ${destination.id}
          and place.active and place.version = ${input.locationLabelVersion}
      `;
      const label = labels[0];
      if (!label) throw new RepositoryError("conflict", "A label is stale; rescan is required");

      const scanSessionId = randomUUID();
      const operation = input.action === "confirm" ? "discrepancy_confirm" : "discrepancy_restore";
      await transaction`
        insert into scan_session (
          id, workspace_id, operation, inventory_unit_id, expected_location_id,
          destination_location_id, inventory_label_id, inventory_label_version,
          location_label_id, location_label_version, inventory_scanned_at,
          location_scanned_at, confirmed_by, confirmed_at, discrepancy_id
        ) values (
          ${scanSessionId}, ${workspaceId}, ${operation}, ${discrepancy.inventory_unit_id},
          ${discrepancy.location_id}, ${destination.id}, ${label.inventory_label_id},
          ${label.inventory_label_version}, ${label.location_label_id},
          ${label.location_label_version}, ${input.inventoryScannedAt},
          ${input.locationScannedAt}, ${actor.identityId}, statement_timestamp(), ${discrepancyId}
        )
      `;
      const challenges = await transaction<
        Array<{ id: string; not_before: Date; expires_at: Date; used_at: Date | null }>
      >`
        insert into discrepancy_confirmation_challenge (
          workspace_id, discrepancy_id, scan_session_id, action, actor_id,
          confirmation_mode, active_member_count, membership_revision,
          issued_at, not_before, expires_at
        ) values (
          ${workspaceId}, ${discrepancyId}, ${scanSessionId},
          ${input.action === "confirm" ? "confirm_candidate" : "restore"},
          ${actor.identityId}, ${discrepancy.confirmation_mode},
          ${discrepancy.active_member_count}, ${discrepancy.membership_revision},
          statement_timestamp(), statement_timestamp() + interval '3 seconds',
          statement_timestamp() + interval '10 minutes'
        ) returning id, not_before, expires_at, used_at
      `;
      const challenge = challenges[0];
      if (!challenge) throw new RepositoryError("database_error", "The challenge was not stored");
      return {
        challengeId: challenge.id,
        discrepancyId,
        action: input.action,
        notBefore: challenge.not_before.toISOString(),
        expiresAt: challenge.expires_at.toISOString(),
        consumedAt: challenge.used_at?.toISOString() ?? null,
      };
    });
  }

  async confirmMissingCandidate(
    workspaceId: string,
    stocktakeId: string,
    discrepancyId: string,
    actor: RequestActor,
    input: ConfirmMissingCandidateRequest,
  ): Promise<StocktakeResponse> {
    return this.completeMissingCandidateChallenge(
      workspaceId,
      stocktakeId,
      discrepancyId,
      actor,
      "confirm",
      input,
    );
  }

  async restoreMissingCandidate(
    workspaceId: string,
    stocktakeId: string,
    discrepancyId: string,
    actor: RequestActor,
    input: RestoreMissingCandidateRequest,
  ): Promise<StocktakeResponse> {
    return this.completeMissingCandidateChallenge(
      workspaceId,
      stocktakeId,
      discrepancyId,
      actor,
      "restore",
      input,
    );
  }

  async approve(
    workspaceId: string,
    stocktakeId: string,
    actor: RequestActor,
    input: ApproveStocktakeRequest,
  ): Promise<StocktakeResponse> {
    void input;
    return this.run(workspaceId, actor, async (transaction) => {
      const changed = await transaction<
        Array<{ id: string; confirmation_mode: "solo_reversible" | "dual_actor" }>
      >`
        update count_session session
        set state = 'approved', approved_by = ${actor.identityId}, approved_at = statement_timestamp()
        where session.workspace_id = ${workspaceId} and session.id = ${stocktakeId}
          and session.state = 'reconciliation'
          and (
            (session.confirmation_mode = 'solo_reversible'
              and session.initial_counter_id = ${actor.identityId})
            or
            (session.confirmation_mode = 'dual_actor'
              and session.initial_counter_id <> ${actor.identityId})
          )
          and not exists (
            select 1 from inventory_discrepancy discrepancy
            where discrepancy.workspace_id = session.workspace_id
              and discrepancy.count_session_id = session.id
              and discrepancy.state not in ('resolved', 'candidate_confirmed', 'restored')
          )
        returning id, confirmation_mode
      `;
      if (!changed[0]) {
        throw new RepositoryError(
          "conflict",
          "The approval actor does not match the stocktake mode, or discrepancies remain unresolved",
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
        changed[0].confirmation_mode === "solo_reversible"
          ? "solo_reversible_stocktake_approval"
          : "dual_actor_stocktake_approval",
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

  private async completeMissingCandidateChallenge(
    workspaceId: string,
    stocktakeId: string,
    discrepancyId: string,
    actor: RequestActor,
    action: "confirm" | "restore",
    input: ConfirmMissingCandidateRequest | RestoreMissingCandidateRequest,
  ): Promise<StocktakeResponse> {
    return this.run(workspaceId, actor, async (transaction) => {
      const challenges = await transaction<
        Array<{
          scan_session_id: string;
          state: string;
          inventory_unit_id: string;
          confirmation_mode: "solo_reversible" | "dual_actor";
          requester_id: string;
          current_location_id: string;
          destination_location_id: string;
          movement_seq: number;
        }>
      >`
        select challenge.scan_session_id, discrepancy.state,
               discrepancy.inventory_unit_id, discrepancy.confirmation_mode,
               discrepancy.requester_id, unit.location_id as current_location_id,
               session.destination_location_id, unit.movement_seq::integer as movement_seq
        from discrepancy_confirmation_challenge challenge
        join inventory_discrepancy discrepancy
          on discrepancy.workspace_id = challenge.workspace_id
         and discrepancy.id = challenge.discrepancy_id
        join scan_session session
          on session.workspace_id = challenge.workspace_id and session.id = challenge.scan_session_id
        join inventory_unit unit
          on unit.workspace_id = discrepancy.workspace_id and unit.id = discrepancy.inventory_unit_id
        where challenge.workspace_id = ${workspaceId}
          and challenge.id = ${input.challengeId}
          and challenge.discrepancy_id = ${discrepancyId}
          and discrepancy.count_session_id = ${stocktakeId}
          and challenge.actor_id = ${actor.identityId}
          and challenge.action = ${action === "confirm" ? "confirm_candidate" : "restore"}
        for update of challenge, discrepancy
      `;
      const challenge = challenges[0];
      const expectedState =
        action === "confirm" ? "reconfirmation_required" : "candidate_confirmed";
      if (!challenge || challenge.state !== expectedState) {
        throw new RepositoryError("conflict", "The confirmation challenge is unavailable");
      }
      if (
        action === "confirm" &&
        challenge.confirmation_mode === "dual_actor" &&
        challenge.requester_id === actor.identityId
      ) {
        throw new RepositoryError("forbidden", "Another person must confirm this discrepancy");
      }
      if (action === "confirm") {
        if (!("evidenceId" in input)) {
          throw new RepositoryError("conflict", "Private evidence is required");
        }
        const evidence = await transaction<Array<{ id: string }>>`
          select id from discrepancy_evidence_media
          where workspace_id = ${workspaceId} and id = ${input.evidenceId}
            and discrepancy_id = ${discrepancyId}
            and inventory_unit_id = ${challenge.inventory_unit_id}
        `;
        if (!evidence[0]) {
          throw new RepositoryError("conflict", "Server-inspected private evidence is required");
        }
      }
      const consumed = await transaction<Array<{ scan_session_id: string; used_at: Date }>>`
        select scan_session_id, used_at
        from consume_discrepancy_confirmation_challenge(
          ${workspaceId}, ${input.challengeId}, ${discrepancyId}, ${actor.identityId},
          ${action === "confirm" ? "confirm_candidate" : "restore"},
          ${input.confirmedAt}::timestamptz
        )
      `;
      if (!consumed[0]) {
        throw new RepositoryError(
          "conflict",
          "Wait three seconds, stay online, and use the challenge only once",
        );
      }
      if (action === "confirm" && "evidenceId" in input) {
        await transaction`
          update inventory_discrepancy
          set state = 'candidate_confirmed', evidence_media_id = ${input.evidenceId},
              confirmation_scan_session_id = ${challenge.scan_session_id},
              reason_code = ${input.reasonCode}, reason_note = ${input.reasonNote},
              confirmed_at = ${consumed[0].used_at}, reconfirmer_id = ${actor.identityId},
              approver_id = ${actor.identityId}, resolution = 'reversible_missing_candidate'
          where workspace_id = ${workspaceId} and count_session_id = ${stocktakeId}
            and id = ${discrepancyId} and state = 'reconfirmation_required'
        `;
      } else {
        const locationChanged = challenge.current_location_id !== challenge.destination_location_id;
        if (locationChanged) {
          const payloadHash = createHash("sha256")
            .update(
              JSON.stringify({
                challengeId: input.challengeId,
                discrepancyId,
                fromLocationId: challenge.current_location_id,
                toLocationId: challenge.destination_location_id,
                reasonCode: input.reasonCode,
              }),
              "utf8",
            )
            .digest("hex");
          await transaction`
            insert into inventory_movement (
              workspace_id, inventory_unit_id, movement_seq, from_location_id,
              to_location_id, movement_kind, scan_session_id, idempotency_key,
              payload_hash, moved_by
            ) values (
              ${workspaceId}, ${challenge.inventory_unit_id}, ${challenge.movement_seq + 1},
              ${challenge.current_location_id}, ${challenge.destination_location_id},
              'discrepancy_restore', ${challenge.scan_session_id}, ${input.challengeId},
              ${payloadHash}, ${actor.identityId}
            )
          `;
        }
        await transaction`
          update inventory_discrepancy
          set state = 'restored', restoration_scan_session_id = ${challenge.scan_session_id},
              reason_code = ${input.reasonCode}, reason_note = ${input.reasonNote},
              restored_at = ${consumed[0].used_at}, resolution = 'restored_to_current_location'
          where workspace_id = ${workspaceId} and count_session_id = ${stocktakeId}
            and id = ${discrepancyId} and state = 'candidate_confirmed'
        `;
      }
      await audit(
        transaction,
        workspaceId,
        actor.identityId,
        action === "confirm"
          ? "stocktake.missing_candidate.confirmed"
          : "stocktake.missing_candidate.restored",
        discrepancyId,
        { state: expectedState },
        {
          state: action === "confirm" ? "candidate_confirmed" : "restored",
          reasonCode: input.reasonCode,
          scanSessionId: challenge.scan_session_id,
          ...(action === "restore" ? { locationId: challenge.destination_location_id } : {}),
        },
        input.reasonCode,
      );
      return requireStocktake(transaction, workspaceId, stocktakeId);
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
        await transaction`select set_config('app.identity_id', ${actor.identityId}, true)`;
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
      if (code === "42501") {
        throw new RepositoryError("forbidden", "The stocktake actor is no longer authorized");
      }
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
  confirmation_mode: StocktakeResponse["confirmationMode"];
  active_member_count: number;
  membership_revision: number;
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
           session.state, session.initial_counter_id, session.confirmation_mode,
           session.active_member_count, session.membership_revision::integer as membership_revision,
           session.started_at, session.approved_at,
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
             'expectedLocationId', snapshot.expected_location_id,
             'expectedLocationCode', expected_location.code,
             'currentLocationId', unit.location_id,
             'currentLocationCode', current_location.code,
             'state', discrepancy.state, 'resolution', discrepancy.resolution,
             'confirmationMode', discrepancy.confirmation_mode,
             'activeMembershipCountAtSelection', discrepancy.active_member_count,
             'membershipRevisionAtSelection', discrepancy.membership_revision,
             'evidenceCount', (select count(*)::integer from discrepancy_evidence_media evidence
               where evidence.workspace_id = discrepancy.workspace_id
                 and evidence.discrepancy_id = discrepancy.id),
             'reasonCode', discrepancy.reason_code,
             'confirmedReasonCode', (select event.reason_code from audit_event event
               where event.workspace_id = discrepancy.workspace_id
                 and event.target_id = discrepancy.id
                 and event.action = 'stocktake.missing_candidate.confirmed'
               order by event.occurred_at desc limit 1),
             'restoredReasonCode', (select event.reason_code from audit_event event
               where event.workspace_id = discrepancy.workspace_id
                 and event.target_id = discrepancy.id
                 and event.action = 'stocktake.missing_candidate.restored'
               order by event.occurred_at desc limit 1),
             'confirmedAt', case when discrepancy.confirmed_at is null then null else
               to_char(discrepancy.confirmed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end,
             'restoredAt', case when discrepancy.restored_at is null then null else
               to_char(discrepancy.restored_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end
           ) order by discrepancy.created_at)
           from inventory_discrepancy discrepancy
           left join inventory_unit unit
             on unit.workspace_id = discrepancy.workspace_id and unit.id = discrepancy.inventory_unit_id
           left join count_session_inventory_snapshot snapshot
             on snapshot.workspace_id = discrepancy.workspace_id
            and snapshot.count_session_id = discrepancy.count_session_id
            and snapshot.inventory_unit_id = discrepancy.inventory_unit_id
           left join location_node expected_location
             on expected_location.workspace_id = snapshot.workspace_id
            and expected_location.id = snapshot.expected_location_id
           left join location_node current_location
             on current_location.workspace_id = unit.workspace_id
            and current_location.id = unit.location_id
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
    confirmationMode: row.confirmation_mode,
    activeMembershipCountAtSelection: row.active_member_count,
    membershipRevisionAtSelection: row.membership_revision,
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
