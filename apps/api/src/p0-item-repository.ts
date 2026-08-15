import { createHash, randomUUID } from "node:crypto";
import {
  appendCodeCheckDigit,
  type CaptureTaskResponse,
  type ConfirmIdentityCandidateRequest,
  type CreateLocationRequest,
  type CreateIdentityCandidateRequest,
  type CreateMarketplaceReferenceRequest,
  type CreateP0ItemRequest,
  type IdentityCandidateResponse,
  type LocationNodeResponse,
  type MarketplaceReferenceResponse,
  type P0ItemResponse,
  type ProductResearchResponse,
  type PutawayCatalogResponse,
} from "@resale/contracts";
import postgres from "postgres";

import { RepositoryError, type RequestActor } from "./repository.js";

export interface P0ItemRepository {
  createItem(
    workspaceId: string,
    actor: RequestActor,
    input: CreateP0ItemRequest,
  ): Promise<P0ItemResponse>;
  listItems(workspaceId: string, actor: RequestActor): Promise<P0ItemResponse[]>;
  createLocation(
    workspaceId: string,
    actor: RequestActor,
    input: CreateLocationRequest,
  ): Promise<LocationNodeResponse>;
  listLocations(workspaceId: string, actor: RequestActor): Promise<LocationNodeResponse[]>;
  putawayCatalog(workspaceId: string, actor: RequestActor): Promise<PutawayCatalogResponse>;
  captureTasks(workspaceId: string, actor: RequestActor): Promise<CaptureTaskResponse[]>;
  createIdentityCandidate(
    workspaceId: string,
    skuId: string,
    actor: RequestActor,
    input: CreateIdentityCandidateRequest,
  ): Promise<IdentityCandidateResponse>;
  confirmIdentityCandidate(
    workspaceId: string,
    skuId: string,
    candidateId: string,
    actor: RequestActor,
    input: ConfirmIdentityCandidateRequest,
  ): Promise<IdentityCandidateResponse>;
  addMarketplaceReference(
    workspaceId: string,
    skuId: string,
    actor: RequestActor,
    input: CreateMarketplaceReferenceRequest,
  ): Promise<MarketplaceReferenceResponse>;
  productResearch(
    workspaceId: string,
    skuId: string,
    actor: RequestActor,
  ): Promise<ProductResearchResponse>;
  close(): Promise<void>;
}

interface P0ItemRow {
  workspace_id: string;
  sku_id: string;
  sku_code: string;
  title: string;
  category: string | null;
  inventory_unit_id: string;
  inventory_number: string;
  inventory_status: P0ItemResponse["inventoryStatus"];
  location_code: string | null;
  inventory_label_version: number;
  location_label_version: number | null;
  receipt_id: string;
  receipt_reference: string;
  purchased_at: Date;
  allocated_cost_minor: number;
  photo_asset_ids: string[];
  photo_roles: P0ItemResponse["capture"]["photoRoles"];
  measurements: P0ItemResponse["capture"]["measurements"];
  capture_confirmed_by: string | null;
  capture_confirmed_at: Date | null;
  listing_confirmed_by: string | null;
  listing_confirmed_at: Date | null;
  workflow_state: P0ItemResponse["workflowState"];
  order_id: string | null;
  order_number: string | null;
  order_state: P0ItemResponse["orderState"];
  accounting_export_id: string | null;
  accounting_export_filename: "journal-candidates.csv" | null;
  accounting_export_sha256: string | null;
  accounting_export_row_count: number | null;
  accounting_export_created_at: Date | null;
  updated_at: Date;
}

interface LocationRow {
  id: string;
  workspace_id: string;
  parent_id: string | null;
  code: string;
  name: string;
  depth: number;
  can_store_inventory: boolean;
  single_item_only: boolean;
  allow_mixed_sku: boolean;
  max_units: number | null;
  active_inventory_count: number;
  approved_photo_count: number;
  label_version: number;
  created_at: Date;
}

interface CandidateRow {
  id: string;
  sku_id: string;
  source_asset_id: string;
  brand_candidate: string | null;
  model_candidate: string | null;
  material_candidate: string | null;
  size_candidate: string | null;
  status: IdentityCandidateResponse["status"];
  created_at: Date;
}

interface ReferenceRow {
  id: string;
  sku_id: string;
  source_url: string;
  displayed_price_minor: number;
  sold_state: boolean;
  item_condition: string;
  shipping_basis: MarketplaceReferenceResponse["shippingBasis"];
  included: boolean;
  exclusion_reason: string | null;
  checked_at: Date;
  created_at: Date;
}

export class PostgresP0ItemRepository implements P0ItemRepository {
  private readonly sql: postgres.Sql;

  constructor(databaseUrl: string) {
    this.sql = postgres(databaseUrl, {
      max: 6,
      idle_timeout: 20,
      connect_timeout: 10,
      transform: { undefined: null },
    });
  }

  async createItem(
    workspaceId: string,
    actor: RequestActor,
    input: CreateP0ItemRequest,
  ): Promise<P0ItemResponse> {
    const payloadHash = createHash("sha256").update(JSON.stringify(input), "utf8").digest("hex");
    try {
      return await this.sql.begin(async (transaction) => {
        await setWorkspace(transaction, workspaceId);
        await requireManagementRole(transaction, workspaceId, actor.identityId);
        const replay = await transaction<
          Array<{ result_reference_id: string; payload_hash: string }>
        >`
          select result_reference_id, payload_hash from idempotency_record
          where workspace_id = ${workspaceId} and operation = 'create_p0_item'
            and idempotency_key = ${input.idempotencyKey}
        `;
        if (replay[0]) {
          if (replay[0].payload_hash !== payloadHash) {
            throw new RepositoryError("conflict", "The item idempotency key has another payload");
          }
          return requireP0Item(transaction, workspaceId, replay[0].result_reference_id);
        }

        await transaction`select pg_advisory_xact_lock(hashtext(${workspaceId}))`;
        const skuId = randomUUID();
        const inventoryUnitId = randomUUID();
        const purchaseBatchId = randomUUID();
        const receiptId = randomUUID();
        const nextNumbers = await transaction<Array<{ next_number: number }>>`
          select coalesce(max(substring(inventory_number from 5 for 6)::integer), 0) + 1 as next_number
          from inventory_unit where workspace_id = ${workspaceId}
        `;
        const nextNumber = nextNumbers[0]?.next_number;
        if (!nextNumber || nextNumber > 999999) {
          throw new RepositoryError(
            "conflict",
            "The workspace inventory number range is exhausted",
          );
        }
        const inventoryNumber = appendCodeCheckDigit(`INV-${String(nextNumber).padStart(6, "0")}`);
        const labelTokenHash = createHash("sha256").update(randomUUID(), "utf8").digest("hex");

        await transaction`
          insert into product_sku (id, workspace_id, sku_code, title, category, human_confirmed_at)
          values (${skuId}, ${workspaceId}, ${input.skuCode}, ${input.title}, ${input.category}, ${input.purchasedAt})
        `;
        await transaction`
          insert into inventory_unit (id, workspace_id, sku_id, inventory_number)
          values (${inventoryUnitId}, ${workspaceId}, ${skuId}, ${inventoryNumber})
        `;
        await transaction`
          insert into inventory_label (
            workspace_id, target_type, target_id, label_kind, version,
            token_hash, short_code, issued_by
          ) values (
            ${workspaceId}, 'inventory_unit', ${inventoryUnitId}, 'manual_code', 1,
            ${labelTokenHash}, ${inventoryNumber}, ${actor.identityId}
          )
        `;
        await transaction`
          insert into purchase_batch (
            id, workspace_id, supplier_name, purchased_at, confirmed_by
          ) values (
            ${purchaseBatchId}, ${workspaceId}, ${input.supplierName},
            ${input.purchasedAt}, ${actor.identityId}
          )
        `;
        await transaction`
          insert into receipt (
            id, workspace_id, purchase_batch_id, receipt_reference, amount_minor,
            confirmed_by, confirmed_at
          ) values (
            ${receiptId}, ${workspaceId}, ${purchaseBatchId}, ${input.receiptReference},
            ${input.receiptAmountMinor}, ${actor.identityId}, ${input.purchasedAt}
          )
        `;
        await transaction`
          insert into cost_allocation (
            workspace_id, receipt_id, sku_id, allocated_amount_minor,
            confirmed_by, confirmed_at
          ) values (
            ${workspaceId}, ${receiptId}, ${skuId}, ${input.allocatedCostMinor},
            ${actor.identityId}, ${input.purchasedAt}
          )
        `;
        await transaction`
          insert into p0_workflow (workspace_id, sku_id, state, last_action, version)
          values (${workspaceId}, ${skuId}, 'purchase_confirmed', 'confirm_purchase', 2)
        `;
        await transaction`
          insert into p0_workflow_action (
            workspace_id, sku_id, action, actor_id, evidence_reference_ids,
            idempotency_key, payload_hash, response_state, response_version
          ) values (
            ${workspaceId}, ${skuId}, 'confirm_purchase', ${actor.identityId}, ${[receiptId]},
            ${input.idempotencyKey}, ${payloadHash}, 'purchase_confirmed', 2
          )
        `;
        await transaction`
          insert into idempotency_record (
            workspace_id, operation, idempotency_key, payload_hash, result_reference_id
          ) values (
            ${workspaceId}, 'create_p0_item', ${input.idempotencyKey}, ${payloadHash}, ${skuId}
          )
        `;
        await transaction`
          insert into audit_event (
            workspace_id, actor_id, action, target_type, target_id,
            field_names, redacted_changes, reference_ids, reason_code, approved_by
          ) values (
            ${workspaceId}, ${actor.identityId}, 'purchase.confirmed', 'product_sku', ${skuId},
            ${["sku_code", "inventory_number", "allocated_cost_minor"]},
            ${transaction.json({ confirmation: { by: "human" }, source: "receipt_reference" })},
            ${[receiptId, inventoryUnitId]}, 'receipt_and_cost_human_confirmed', ${actor.identityId}
          )
        `;
        await transaction`
          insert into outbox_event (workspace_id, event_type, aggregate_type, aggregate_id, payload)
          values (
            ${workspaceId}, 'p0.purchase.confirmed', 'product_sku', ${skuId},
            ${transaction.json({ state: "purchase_confirmed", version: 2 })}
          )
        `;
        return requireP0Item(transaction, workspaceId, skuId);
      });
    } catch (error) {
      throw normalizeP0ItemError(error);
    }
  }

  async listItems(workspaceId: string, actor: RequestActor): Promise<P0ItemResponse[]> {
    try {
      return await this.sql.begin(async (transaction) => {
        await setWorkspace(transaction, workspaceId);
        await requireManagementRole(transaction, workspaceId, actor.identityId);
        const rows = await selectP0Items(transaction, workspaceId);
        return rows.map(toP0ItemResponse);
      });
    } catch (error) {
      throw normalizeP0ItemError(error);
    }
  }

  async createLocation(
    workspaceId: string,
    actor: RequestActor,
    input: CreateLocationRequest,
  ): Promise<LocationNodeResponse> {
    try {
      return await this.sql.begin(async (transaction) => {
        await setWorkspace(transaction, workspaceId);
        await requireManagementRole(transaction, workspaceId, actor.identityId);
        let depth = 0;
        if (input.parentId) {
          const parents = await transaction<Array<{ depth: number }>>`
            select depth from location_node
            where workspace_id = ${workspaceId} and id = ${input.parentId} and state = 'active'
          `;
          if (!parents[0])
            throw new RepositoryError("forbidden", "The parent location is unavailable");
          depth = parents[0].depth + 1;
        }
        if (depth > 7) throw new RepositoryError("conflict", "The location hierarchy is too deep");
        const locationId = randomUUID();
        const checkedCode = appendCodeCheckDigit(input.code);
        const labelHash = createHash("sha256").update(randomUUID(), "utf8").digest("hex");
        await transaction`
          insert into location_node (
            id, workspace_id, parent_id, code, name, depth, can_store_inventory,
            single_item_only, allow_mixed_sku, max_units
          ) values (
            ${locationId}, ${workspaceId}, ${input.parentId}, ${checkedCode}, ${input.name},
            ${depth}, ${input.canStoreInventory}, ${input.singleItemOnly},
            ${input.allowMixedSku}, ${input.maxUnits}
          )
        `;
        await transaction`
          insert into inventory_label (
            workspace_id, target_type, target_id, label_kind, version,
            token_hash, short_code, issued_by
          ) values (
            ${workspaceId}, 'location', ${locationId}, 'manual_code', 1,
            ${labelHash}, ${checkedCode}, ${actor.identityId}
          )
        `;
        await transaction`
          insert into audit_event (
            workspace_id, actor_id, action, target_type, target_id,
            field_names, redacted_changes, reason_code, approved_by
          ) values (
            ${workspaceId}, ${actor.identityId}, 'location.created', 'location_node',
            ${locationId}, ${["parent_id", "code", "capacity"]},
            ${transaction.json({ confirmation: { by: "human" } })},
            'location_structure_human_confirmed', ${actor.identityId}
          )
        `;
        const rows = await selectLocations(transaction, workspaceId, locationId);
        if (!rows[0])
          throw new RepositoryError("database_error", "The location read model is incomplete");
        return toLocationResponse(rows[0]);
      });
    } catch (error) {
      throw normalizeP0ItemError(error);
    }
  }

  async listLocations(workspaceId: string, actor: RequestActor): Promise<LocationNodeResponse[]> {
    try {
      return await this.sql.begin(async (transaction) => {
        await setWorkspace(transaction, workspaceId);
        await requireManagementRole(transaction, workspaceId, actor.identityId);
        return (await selectLocations(transaction, workspaceId)).map(toLocationResponse);
      });
    } catch (error) {
      throw normalizeP0ItemError(error);
    }
  }

  async putawayCatalog(workspaceId: string, actor: RequestActor): Promise<PutawayCatalogResponse> {
    try {
      return await this.sql.begin(async (transaction) => {
        await setWorkspace(transaction, workspaceId);
        const roles = await transaction<Array<{ role: string }>>`
          select role from workspace_membership
          where workspace_id = ${workspaceId} and identity_id = ${actor.identityId}
            and active and role in ('owner', 'inventory_manager', 'field_worker')
        `;
        const role = roles[0]?.role;
        if (!role) throw new RepositoryError("forbidden", "Putaway role is required");
        const inventory = await transaction<
          Array<{ inventory_number: string; label_version: number }>
        >`
          select unit.inventory_number, label.version as label_version
          from inventory_unit unit
          join inventory_label label
            on label.workspace_id = unit.workspace_id and label.target_type = 'inventory_unit'
           and label.target_id = unit.id and label.active
          where unit.workspace_id = ${workspaceId} and unit.status = 'putaway_pending'
            and (
              ${role} in ('owner', 'inventory_manager')
              or has_active_inventory_unit_assignment(
                ${workspaceId}, ${actor.identityId}, 'putaway', unit.id, now()
              )
            )
          order by unit.created_at, unit.inventory_number
        `;
        const locations = await transaction<
          Array<{ code: string; name: string; label_version: number }>
        >`
          select location.code, location.name, label.version as label_version
          from location_node location
          join inventory_label label
            on label.workspace_id = location.workspace_id and label.target_type = 'location'
           and label.target_id = location.id and label.active
          where location.workspace_id = ${workspaceId} and location.state = 'active'
            and location.can_store_inventory
            and (
              ${role} in ('owner', 'inventory_manager')
              or has_active_work_assignment(
                ${workspaceId}, ${actor.identityId}, 'putaway', location.id, now()
              )
            )
          order by location.code
        `;
        return {
          workspaceId,
          inventory: inventory.map((row) => ({
            inventoryNumber: row.inventory_number,
            labelVersion: row.label_version,
            status: "putaway_pending" as const,
          })),
          locations: locations.map((row) => ({
            code: row.code,
            name: row.name,
            labelVersion: row.label_version,
          })),
          loadedAt: new Date().toISOString(),
        };
      });
    } catch (error) {
      throw normalizeP0ItemError(error);
    }
  }

  async captureTasks(workspaceId: string, actor: RequestActor): Promise<CaptureTaskResponse[]> {
    try {
      return await this.sql.begin(async (transaction) => {
        await setWorkspace(transaction, workspaceId);
        const roles = await transaction<Array<{ role: string }>>`
          select role from workspace_membership
          where workspace_id = ${workspaceId} and identity_id = ${actor.identityId}
            and active and role in ('owner','inventory_manager','field_worker')
        `;
        const role = roles[0]?.role;
        if (!role) throw new RepositoryError("forbidden", "Capture role is required");
        const rows = await transaction<
          Array<{
            sku_id: string;
            sku_code: string;
            title: string;
            category: string | null;
            photo_asset_ids: string[];
            photo_roles: CaptureTaskResponse["photoRoles"];
            measurements: CaptureTaskResponse["measurements"];
            expires_at: Date;
          }>
        >`
          select sku.id as sku_id, sku.sku_code, sku.title, sku.category,
                 coalesce(photos.ids, array[]::uuid[]) as photo_asset_ids,
                 coalesce(photos.roles, array[]::text[]) as photo_roles,
                 coalesce(measurements.items, '[]'::jsonb) as measurements,
                 coalesce(assignment.expires_at, statement_timestamp() + interval '24 hours') as expires_at
          from product_sku sku
          join p0_workflow workflow
            on workflow.workspace_id = sku.workspace_id and workflow.sku_id = sku.id
          left join lateral (
            select array_agg(asset.id order by asset.created_at) as ids,
                   array_agg(asset.role order by asset.created_at) as roles
            from media_asset asset
            where asset.workspace_id = sku.workspace_id and asset.sku_id = sku.id
          ) photos on true
          left join lateral (
            select jsonb_agg(jsonb_build_object(
              'id', measured.id, 'definitionId', measured.definition_id,
              'definitionVersion', measured.definition_version,
              'value', measured.value::double precision, 'unit', measured.unit,
              'basis', measured.basis, 'state', measured.state,
              'evidenceAssetId', measured.evidence_asset_id, 'attempt', measured.attempt,
              'measuredAt', to_char(measured.measured_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
              'confirmedBy', measured.confirmed_by, 'requiresReview', measured.requires_review,
              'differenceCm', measured.difference_cm::double precision,
              'violations', measured.violations, 'reviewReasonCode', measured.review_reason_code
            ) order by measured.definition_id) as items
            from (
              select distinct on (attempt.definition_id) attempt.*
              from measurement_attempt attempt
              where attempt.workspace_id = sku.workspace_id and attempt.sku_id = sku.id
              order by attempt.definition_id, attempt.attempt desc, attempt.created_at desc
            ) measured
          ) measurements on true
          left join lateral (
            select assigned.expires_at from sku_work_assignment assigned
            where assigned.workspace_id = sku.workspace_id and assigned.sku_id = sku.id
              and assigned.identity_id = ${actor.identityId} and assigned.operation = 'capture'
              and assigned.starts_at <= statement_timestamp()
              and assigned.expires_at > statement_timestamp() and assigned.revoked_at is null
            order by assigned.expires_at limit 1
          ) assignment on true
          where sku.workspace_id = ${workspaceId}
            and workflow.state in ('sku_created','purchase_confirmed')
            and (${role} in ('owner','inventory_manager') or assignment.expires_at is not null)
          order by workflow.updated_at, sku.sku_code
        `;
        return rows.map((row) => ({
          workspaceId,
          skuId: row.sku_id,
          skuCode: row.sku_code,
          title: row.title,
          category: row.category,
          photoAssetIds: row.photo_asset_ids,
          photoRoles: row.photo_roles,
          measurements: row.measurements,
          assignmentExpiresAt: row.expires_at.toISOString(),
        }));
      });
    } catch (error) {
      throw normalizeP0ItemError(error);
    }
  }

  async createIdentityCandidate(
    workspaceId: string,
    skuId: string,
    actor: RequestActor,
    input: CreateIdentityCandidateRequest,
  ): Promise<IdentityCandidateResponse> {
    try {
      return await this.sql.begin(async (transaction) => {
        await setWorkspace(transaction, workspaceId);
        const role = await requireCaptureOrManagement(
          transaction,
          workspaceId,
          skuId,
          actor.identityId,
        );
        await requireResearchEditable(transaction, workspaceId, skuId, false);
        const assets = await transaction<Array<{ id: string }>>`
          select id from media_asset where workspace_id = ${workspaceId} and sku_id = ${skuId}
            and id = ${input.sourceAssetId} and role in ('brand_tag','care_label')
        `;
        if (!assets[0]) throw new RepositoryError("forbidden", "A tag photo is required");
        const parsed = parseOcrCandidate(input.rawOcrText);
        const id = randomUUID();
        const hash = createHash("sha256").update(input.rawOcrText, "utf8").digest("hex");
        const rows = await transaction<CandidateRow[]>`
          insert into product_identity_candidate (
            id, workspace_id, sku_id, source_asset_id, source_text_sha256,
            brand_candidate, model_candidate, material_candidate, size_candidate,
            source_kind, created_by
          ) values (
            ${id}, ${workspaceId}, ${skuId}, ${input.sourceAssetId}, ${hash},
            ${parsed.brand}, ${parsed.model}, ${parsed.material}, ${parsed.size},
            'manual_ocr_text', ${actor.identityId}
          ) returning id, sku_id, source_asset_id, brand_candidate, model_candidate,
              material_candidate, size_candidate, status, created_at
        `;
        const row = rows[0];
        if (!row) throw new RepositoryError("database_error", "The OCR candidate was not stored");
        await auditResearch(
          transaction,
          workspaceId,
          actor.identityId,
          "research.ocr_candidate.created",
          id,
          { status: "absent" },
          {
            status: "candidate",
            fields: Object.keys(parsed).filter((key) => parsed[key as keyof typeof parsed]),
          },
          role === "field_worker" ? "assigned_worker_tag_text" : "manager_tag_text",
        );
        return toCandidate(row);
      });
    } catch (error) {
      throw normalizeP0ItemError(error);
    }
  }

  async confirmIdentityCandidate(
    workspaceId: string,
    skuId: string,
    candidateId: string,
    actor: RequestActor,
    input: ConfirmIdentityCandidateRequest,
  ): Promise<IdentityCandidateResponse> {
    try {
      return await this.sql.begin(async (transaction) => {
        await setWorkspace(transaction, workspaceId);
        await requireManagementRole(transaction, workspaceId, actor.identityId);
        await requireResearchEditable(transaction, workspaceId, skuId, true);
        const rows = await transaction<CandidateRow[]>`
          update product_identity_candidate
          set status = ${input.status}, confirmed_by = ${actor.identityId}, confirmed_at = statement_timestamp()
          where workspace_id = ${workspaceId} and sku_id = ${skuId} and id = ${candidateId}
            and status = 'candidate'
          returning id, sku_id, source_asset_id, brand_candidate, model_candidate,
                    material_candidate, size_candidate, status, created_at
        `;
        if (!rows[0]) throw new RepositoryError("conflict", "The candidate is unavailable");
        await auditResearch(
          transaction,
          workspaceId,
          actor.identityId,
          "research.identity_candidate.decided",
          candidateId,
          { status: "candidate" },
          { status: input.status },
          "identity_candidate_human_decision",
        );
        return toCandidate(rows[0]);
      });
    } catch (error) {
      throw normalizeP0ItemError(error);
    }
  }

  async addMarketplaceReference(
    workspaceId: string,
    skuId: string,
    actor: RequestActor,
    input: CreateMarketplaceReferenceRequest,
  ): Promise<MarketplaceReferenceResponse> {
    try {
      return await this.sql.begin(async (transaction) => {
        await setWorkspace(transaction, workspaceId);
        await requireManagementRole(transaction, workspaceId, actor.identityId);
        await requireResearchEditable(transaction, workspaceId, skuId, true);
        const id = randomUUID();
        const rows = await transaction<ReferenceRow[]>`
          insert into marketplace_reference (
            id, workspace_id, sku_id, source_url, displayed_price_minor, sold_state,
            item_condition, shipping_basis, included, exclusion_reason, checked_at, created_by
          ) values (
            ${id}, ${workspaceId}, ${skuId}, ${input.sourceUrl}, ${input.displayedPriceMinor},
            ${input.soldState}, ${input.itemCondition}, ${input.shippingBasis}, ${input.included},
            ${input.exclusionReason}, ${input.checkedAt}, ${actor.identityId}
          ) returning id, sku_id, source_url, displayed_price_minor, sold_state,
              item_condition, shipping_basis, included, exclusion_reason, checked_at, created_at
        `;
        if (!rows[0])
          throw new RepositoryError("database_error", "The market evidence was not stored");
        await auditResearch(
          transaction,
          workspaceId,
          actor.identityId,
          "research.market_reference.added",
          id,
          { status: "absent" },
          { included: input.included, soldState: input.soldState },
          "official_page_human_checked",
        );
        return toReference(rows[0]);
      });
    } catch (error) {
      throw normalizeP0ItemError(error);
    }
  }

  async productResearch(
    workspaceId: string,
    skuId: string,
    actor: RequestActor,
  ): Promise<ProductResearchResponse> {
    try {
      return await this.sql.begin(async (transaction) => {
        await setWorkspace(transaction, workspaceId);
        await requireManagementRole(transaction, workspaceId, actor.identityId);
        const candidateRows = await transaction<CandidateRow[]>`
          select id, sku_id, source_asset_id, brand_candidate, model_candidate,
                 material_candidate, size_candidate, status, created_at
          from product_identity_candidate
          where workspace_id = ${workspaceId} and sku_id = ${skuId}
          order by created_at desc
        `;
        const referenceRows = await transaction<ReferenceRow[]>`
          select id, sku_id, source_url, displayed_price_minor, sold_state,
                 item_condition, shipping_basis, included, exclusion_reason, checked_at, created_at
          from marketplace_reference where workspace_id = ${workspaceId} and sku_id = ${skuId}
          order by checked_at desc
        `;
        const included = referenceRows
          .filter((row) => row.included && row.sold_state)
          .map((row) => row.displayed_price_minor)
          .sort((left, right) => left - right);
        const middle = Math.floor(included.length / 2);
        const median =
          included.length === 0
            ? null
            : included.length % 2 === 1
              ? included[middle]!
              : Math.round((included[middle - 1]! + included[middle]!) / 2);
        return {
          workspaceId,
          skuId,
          candidates: candidateRows.map(toCandidate),
          references: referenceRows.map(toReference),
          includedSoldCount: included.length,
          displayedPriceMedianMinor: median,
          status:
            referenceRows.length === 0
              ? "no_evidence"
              : included.length < 3
                ? "insufficient_evidence"
                : "human_review_required",
        };
      });
    } catch (error) {
      throw normalizeP0ItemError(error);
    }
  }

  async close(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }
}

async function selectLocations(
  sql: postgres.TransactionSql,
  workspaceId: string,
  locationId?: string,
): Promise<LocationRow[]> {
  return sql<LocationRow[]>`
    select location.id, location.workspace_id, location.parent_id, location.code,
           location.name, location.depth, location.can_store_inventory,
           location.single_item_only, location.allow_mixed_sku, location.max_units,
           count(distinct unit.id) filter (
             where unit.status in ('putaway_pending', 'available', 'reserved', 'picked', 'packed', 'quarantined')
           )::integer as active_inventory_count,
           count(distinct photo.id) filter (where photo.review_state = 'approved')::integer
             as approved_photo_count,
           label.version as label_version, location.created_at
    from location_node location
    join inventory_label label
      on label.workspace_id = location.workspace_id and label.target_type = 'location'
     and label.target_id = location.id and label.active
    left join inventory_unit unit
      on unit.workspace_id = location.workspace_id and unit.location_id = location.id
    left join location_photo photo
      on photo.workspace_id = location.workspace_id and photo.location_id = location.id
    where location.workspace_id = ${workspaceId} and location.state = 'active'
      and (${locationId ?? null}::uuid is null or location.id = ${locationId ?? null}::uuid)
    group by location.workspace_id, location.id, label.version
    order by location.depth, location.code
  `;
}

function toLocationResponse(row: LocationRow): LocationNodeResponse {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    parentId: row.parent_id,
    code: row.code,
    name: row.name,
    depth: row.depth,
    state: "active",
    canStoreInventory: row.can_store_inventory,
    singleItemOnly: row.single_item_only,
    allowMixedSku: row.allow_mixed_sku,
    maxUnits: row.max_units,
    activeInventoryCount: row.active_inventory_count,
    approvedPhotoCount: row.approved_photo_count,
    labelVersion: row.label_version,
    createdAt: row.created_at.toISOString(),
  };
}

async function selectP0Items(
  sql: postgres.TransactionSql,
  workspaceId: string,
  skuId?: string,
): Promise<P0ItemRow[]> {
  return sql<P0ItemRow[]>`
    select sku.workspace_id, sku.id as sku_id, sku.sku_code, sku.title, sku.category,
           unit.id as inventory_unit_id, unit.inventory_number, unit.status as inventory_status,
           location.code as location_code, item_label.version as inventory_label_version,
           location_label.version as location_label_version, receipt.id as receipt_id,
           receipt.receipt_reference, batch.purchased_at,
           allocation.allocated_amount_minor::integer as allocated_cost_minor,
           coalesce(capture_photos.asset_ids, array[]::uuid[]) as photo_asset_ids,
           coalesce(capture_photos.roles, array[]::text[]) as photo_roles,
           coalesce(capture_measurements.items, '[]'::jsonb) as measurements,
           capture_action.actor_id as capture_confirmed_by,
           capture_action.created_at as capture_confirmed_at,
           listing_action.actor_id as listing_confirmed_by,
           listing_action.created_at as listing_confirmed_at,
           workflow.state as workflow_state, current_order.id as order_id,
           current_order.order_number, current_order.state as order_state,
           latest_export.id as accounting_export_id,
           latest_export.filename as accounting_export_filename,
           latest_export.csv_sha256 as accounting_export_sha256,
           latest_export.row_count::integer as accounting_export_row_count,
           latest_export.created_at as accounting_export_created_at,
           greatest(sku.created_at, workflow.updated_at) as updated_at
    from product_sku sku
    join inventory_unit unit
      on unit.workspace_id = sku.workspace_id and unit.sku_id = sku.id
    join inventory_label item_label
      on item_label.workspace_id = unit.workspace_id
     and item_label.target_type = 'inventory_unit' and item_label.target_id = unit.id
     and item_label.active
    join cost_allocation allocation
      on allocation.workspace_id = sku.workspace_id and allocation.sku_id = sku.id
    join receipt on receipt.workspace_id = allocation.workspace_id and receipt.id = allocation.receipt_id
    join purchase_batch batch
      on batch.workspace_id = receipt.workspace_id and batch.id = receipt.purchase_batch_id
    join p0_workflow workflow
      on workflow.workspace_id = sku.workspace_id and workflow.sku_id = sku.id
    left join location_node location
      on location.workspace_id = unit.workspace_id and location.id = unit.location_id
    left join inventory_label location_label
      on location_label.workspace_id = location.workspace_id
     and location_label.target_type = 'location' and location_label.target_id = location.id
     and location_label.active
    left join lateral (
      select array_agg(asset.id order by asset.created_at, asset.id) as asset_ids,
             array_agg(asset.role order by asset.created_at, asset.id) as roles
      from media_asset asset
      where asset.workspace_id = sku.workspace_id and asset.sku_id = sku.id
    ) capture_photos on true
    left join lateral (
      select jsonb_agg(
        jsonb_build_object(
          'id', measured.id,
          'definitionId', measured.definition_id,
          'definitionVersion', measured.definition_version,
          'value', measured.value::double precision,
          'unit', measured.unit,
          'basis', measured.basis,
          'state', measured.state,
          'evidenceAssetId', measured.evidence_asset_id,
          'attempt', measured.attempt,
          'measuredAt', to_char(measured.measured_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'confirmedBy', measured.confirmed_by,
          'requiresReview', measured.requires_review,
          'differenceCm', measured.difference_cm::double precision,
          'violations', measured.violations,
          'reviewReasonCode', measured.review_reason_code
        ) order by measured.definition_id
      ) as items
      from (
        select distinct on (attempt.definition_id) attempt.*
        from measurement_attempt attempt
        where attempt.workspace_id = sku.workspace_id and attempt.sku_id = sku.id
        order by attempt.definition_id, attempt.attempt desc, attempt.created_at desc
      ) measured
    ) capture_measurements on true
    left join lateral (
      select action.actor_id, action.created_at
      from p0_workflow_action action
      where action.workspace_id = sku.workspace_id and action.sku_id = sku.id
        and action.action = 'confirm_capture'
      order by action.created_at desc limit 1
    ) capture_action on true
    left join lateral (
      select action.actor_id, action.created_at
      from p0_workflow_action action
      where action.workspace_id = sku.workspace_id and action.sku_id = sku.id
        and action.action = 'confirm_listing'
      order by action.created_at desc limit 1
    ) listing_action on true
    left join lateral (
      select sales_order.id, sales_order.order_number, sales_order.state
      from order_allocation order_link
      join sales_order
        on sales_order.workspace_id = order_link.workspace_id
       and sales_order.id = order_link.order_id
      where order_link.workspace_id = unit.workspace_id
        and order_link.inventory_unit_id = unit.id
      order by sales_order.created_at desc
      limit 1
    ) current_order on true
    left join lateral (
      select export.id, export.filename, export.csv_sha256, export.row_count, export.created_at
      from accounting_export export
      where export.workspace_id = sku.workspace_id and export.order_id = current_order.id
      order by export.created_at desc, export.id desc
      limit 1
    ) latest_export on true
    where sku.workspace_id = ${workspaceId}
      and (${skuId ?? null}::uuid is null or sku.id = ${skuId ?? null}::uuid)
    order by workflow.updated_at desc, sku.created_at desc
  `;
}

async function requireP0Item(
  sql: postgres.TransactionSql,
  workspaceId: string,
  skuId: string,
): Promise<P0ItemResponse> {
  const rows = await selectP0Items(sql, workspaceId, skuId);
  if (!rows[0]) throw new RepositoryError("database_error", "The P0 item read model is incomplete");
  return toP0ItemResponse(rows[0]);
}

function toP0ItemResponse(row: P0ItemRow): P0ItemResponse {
  const referenceIds = [
    ...row.photo_asset_ids,
    ...row.measurements.map((measurement) => measurement.id),
  ];
  const listingCandidate = buildListingCandidate(
    row.title,
    row.measurements,
    referenceIds,
    row.listing_confirmed_by,
    row.listing_confirmed_at,
  );
  return {
    workspaceId: row.workspace_id,
    skuId: row.sku_id,
    skuCode: row.sku_code,
    title: row.title,
    category: row.category,
    inventoryUnitId: row.inventory_unit_id,
    inventoryNumber: row.inventory_number,
    inventoryStatus: row.inventory_status,
    locationCode: row.location_code,
    inventoryLabelVersion: row.inventory_label_version,
    locationLabelVersion: row.location_label_version,
    receiptId: row.receipt_id,
    receiptReference: row.receipt_reference,
    purchasedAt: row.purchased_at.toISOString(),
    allocatedCostMinor: row.allocated_cost_minor,
    capture: {
      photoAssetIds: row.photo_asset_ids,
      photoRoles: row.photo_roles,
      measurements: row.measurements,
      confirmedBy: row.capture_confirmed_by,
      confirmedAt: row.capture_confirmed_at?.toISOString() ?? null,
    },
    listingCandidate,
    workflowState: row.workflow_state,
    orderId: row.order_id,
    orderNumber: row.order_number,
    orderState: row.order_state,
    accountingExport:
      row.order_id &&
      row.accounting_export_id &&
      row.accounting_export_filename &&
      row.accounting_export_sha256 &&
      row.accounting_export_row_count &&
      row.accounting_export_created_at
        ? {
            exportId: row.accounting_export_id,
            workspaceId: row.workspace_id,
            orderId: row.order_id,
            filename: row.accounting_export_filename,
            sha256: row.accounting_export_sha256,
            rowCount: row.accounting_export_row_count,
            contentUrl: accountingExportContentUrl(
              row.workspace_id,
              row.order_id,
              row.accounting_export_id,
            ),
            createdAt: row.accounting_export_created_at.toISOString(),
          }
        : null,
    updatedAt: row.updated_at.toISOString(),
  };
}

function accountingExportContentUrl(
  workspaceId: string,
  orderId: string,
  exportId: string,
): string {
  return `/v1/workspaces/${workspaceId}/orders/${orderId}/accounting-exports/${exportId}/content`;
}

function buildListingCandidate(
  title: string,
  measurements: P0ItemResponse["capture"]["measurements"],
  referenceIds: string[],
  confirmedBy: string | null,
  confirmedAt: Date | null,
): P0ItemResponse["listingCandidate"] {
  const labels = [
    ["shoulder_width", "肩幅"],
    ["chest_width", "身幅"],
    ["sleeve_length", "袖丈"],
    ["body_length", "着丈"],
  ] as const;
  const byDefinition = new Map(
    measurements.map((measurement) => [measurement.definitionId, measurement]),
  );
  const unconfirmedFields = labels
    .filter(([definitionId]) => !byDefinition.has(definitionId))
    .map(([, label]) => label);
  const facts = labels
    .map(([definitionId, label]) => {
      const measurement = byDefinition.get(definitionId);
      return `${label}${measurement ? measurement.value : "未確認"}${measurement ? "cm" : ""}`;
    })
    .join("、");
  return {
    text: `${title}です。平置き実寸は${facts}です。写真と実寸をご確認のうえ、購入をご検討ください。`,
    referenceIds,
    unconfirmedFields,
    status: confirmedAt ? "human_confirmed" : "candidate",
    confirmedBy,
    confirmedAt: confirmedAt?.toISOString() ?? null,
  };
}

async function setWorkspace(sql: postgres.TransactionSql, workspaceId: string): Promise<void> {
  await sql`select set_config('app.workspace_id', ${workspaceId}, true)`;
}

async function requireManagementRole(
  sql: postgres.TransactionSql,
  workspaceId: string,
  identityId: string,
): Promise<void> {
  const rows = await sql<Array<{ role: string }>>`
    select role from workspace_membership
    where workspace_id = ${workspaceId} and identity_id = ${identityId}
      and active and role in ('owner', 'inventory_manager')
  `;
  if (!rows[0]) throw new RepositoryError("forbidden", "Inventory management role is required");
}

async function requireCaptureOrManagement(
  sql: postgres.TransactionSql,
  workspaceId: string,
  skuId: string,
  identityId: string,
): Promise<string> {
  const roles = await sql<Array<{ role: string }>>`
    select role from workspace_membership where workspace_id = ${workspaceId}
      and identity_id = ${identityId} and active
      and role in ('owner','inventory_manager','field_worker')
  `;
  const role = roles[0]?.role;
  if (!role) throw new RepositoryError("forbidden", "Capture role is required");
  if (role === "field_worker") {
    const assigned = await sql<Array<{ allowed: boolean }>>`
      select has_active_sku_work_assignment(
        ${workspaceId}, ${identityId}, 'capture', ${skuId}, statement_timestamp()
      ) as allowed
    `;
    if (!assigned[0]?.allowed) throw new RepositoryError("forbidden", "The SKU is not assigned");
  }
  return role;
}

async function requireResearchEditable(
  sql: postgres.TransactionSql,
  workspaceId: string,
  skuId: string,
  allowCaptureConfirmed: boolean,
): Promise<void> {
  const rows = await sql<Array<{ state: string }>>`
    select state from p0_workflow where workspace_id = ${workspaceId} and sku_id = ${skuId}
  `;
  const allowed = allowCaptureConfirmed
    ? ["sku_created", "purchase_confirmed", "capture_confirmed"]
    : ["sku_created", "purchase_confirmed"];
  if (!rows[0] || !allowed.includes(rows[0].state)) {
    throw new RepositoryError(
      "conflict",
      "Research evidence is immutable after listing confirmation",
    );
  }
}

function parseOcrCandidate(rawText: string): {
  brand: string | null;
  model: string | null;
  material: string | null;
  size: string | null;
} {
  const lines = rawText
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 80);
  const findValue = (pattern: RegExp) =>
    lines.map((line) => line.match(pattern)?.[1]?.trim() ?? null).find(Boolean) ?? null;
  const model = findValue(/(?:品番|型番|model|style)\s*[:：#]?\s*([A-Z0-9][A-Z0-9._/-]{2,40})/iu);
  const size = findValue(/(?:サイズ|size)\s*[:：]?\s*([A-Z0-9][A-Z0-9._/-]{0,15})/iu);
  const material =
    findValue(/(?:素材|material|組成)\s*[:：]?\s*(.{1,80})/iu) ??
    lines.find((line) => /(綿|コットン|ポリエステル|ウール|毛|ナイロン|レーヨン|麻)/u.test(line)) ??
    null;
  const brand =
    lines.find(
      (line) =>
        line.length <= 80 && !/(品番|型番|model|style|サイズ|size|素材|material|組成)/iu.test(line),
    ) ?? null;
  return { brand, model, material, size };
}

function toCandidate(row: CandidateRow): IdentityCandidateResponse {
  return {
    candidateId: row.id,
    skuId: row.sku_id,
    sourceAssetId: row.source_asset_id,
    brandCandidate: row.brand_candidate,
    modelCandidate: row.model_candidate,
    materialCandidate: row.material_candidate,
    sizeCandidate: row.size_candidate,
    status: row.status,
    createdAt: row.created_at.toISOString(),
  };
}

function toReference(row: ReferenceRow): MarketplaceReferenceResponse {
  return {
    referenceId: row.id,
    skuId: row.sku_id,
    sourceUrl: row.source_url,
    displayedPriceMinor: row.displayed_price_minor,
    soldState: row.sold_state,
    itemCondition: row.item_condition,
    shippingBasis: row.shipping_basis,
    included: row.included,
    exclusionReason: row.exclusion_reason,
    checkedAt: row.checked_at.toISOString(),
    createdAt: row.created_at.toISOString(),
  };
}

async function auditResearch(
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
      ${workspaceId}, ${actorId}, ${action}, 'product_research', ${targetId},
      ${Object.keys(after)}, ${sql.json({ before, after })}, ${reasonCode}, ${actorId}
    )
  `;
}

function normalizeP0ItemError(error: unknown): RepositoryError {
  if (error instanceof RepositoryError) return error;
  const code =
    typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  if (["23505", "23514", "40001"].includes(code)) {
    return new RepositoryError(
      "conflict",
      "The purchase or inventory item conflicts with current data",
    );
  }
  return new RepositoryError("database_error", "The P0 item operation failed safely");
}
