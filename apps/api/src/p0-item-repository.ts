import { createHash, randomUUID } from "node:crypto";
import type {
  CreateLocationRequest,
  CreateP0ItemRequest,
  LocationNodeResponse,
  P0ItemResponse,
  PutawayCatalogResponse,
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
  workflow_state: P0ItemResponse["workflowState"];
  order_id: string | null;
  order_number: string | null;
  order_state: P0ItemResponse["orderState"];
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
          select coalesce(max(substring(inventory_number from 5)::integer), 0) + 1 as next_number
          from inventory_unit where workspace_id = ${workspaceId}
        `;
        const nextNumber = nextNumbers[0]?.next_number;
        if (!nextNumber || nextNumber > 999999) {
          throw new RepositoryError(
            "conflict",
            "The workspace inventory number range is exhausted",
          );
        }
        const inventoryNumber = `INV-${String(nextNumber).padStart(6, "0")}`;
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
            ${labelTokenHash}, ${`ITEM-${String(nextNumber).padStart(6, "0")}`}, ${actor.identityId}
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
        const labelHash = createHash("sha256").update(randomUUID(), "utf8").digest("hex");
        await transaction`
          insert into location_node (
            id, workspace_id, parent_id, code, name, depth, can_store_inventory,
            single_item_only, allow_mixed_sku, max_units
          ) values (
            ${locationId}, ${workspaceId}, ${input.parentId}, ${input.code}, ${input.name},
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
            ${labelHash}, ${`PLACE-${input.code}`}, ${actor.identityId}
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
           workflow.state as workflow_state, current_order.id as order_id,
           current_order.order_number, current_order.state as order_state,
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
    workflowState: row.workflow_state,
    orderId: row.order_id,
    orderNumber: row.order_number,
    orderState: row.order_state,
    updatedAt: row.updated_at.toISOString(),
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
