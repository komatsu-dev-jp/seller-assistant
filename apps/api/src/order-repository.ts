import { createHash, randomUUID } from "node:crypto";
import type {
  AccountingExportResponse,
  AddressLeaseResponse,
  AssignOrderRequest,
  CreateAccountingExportRequest,
  CreateAddressLeaseRequest,
  CreateOrderRequest,
  FinancialSummaryResponse,
  InspectReturnRequest,
  OrderOperationResponse,
  OrderAssignmentResponse,
  PackOrderRequest,
  PickOrderRequest,
  QuarantineReturnRequest,
  ReturnOrderRequest,
  ShipOrderRequest,
  ShippingTaskResponse,
} from "@resale/contracts";
import {
  calculateContribution,
  createAccountingCsv,
  validateOrderTransition,
  type JournalCandidate,
  type MoneyFact,
} from "@resale/domain";
import postgres from "postgres";

import type { EncryptedAddress } from "./address-crypto.js";
import { RepositoryError, type RequestActor, type WorkspaceRole } from "./repository.js";

export interface CreateOrderRecord {
  orderId: string;
  encryptedAddress: EncryptedAddress;
  addressFingerprint: string;
  input: CreateOrderRequest;
}

export interface AddressLeaseRecord extends AddressLeaseResponse {
  identityId: string;
}

export interface EncryptedAddressAccess {
  value: EncryptedAddress;
  expiresAt: string;
}

export interface AccountingExportContent {
  filename: "journal-candidates.csv";
  csv: string;
  sha256: string;
}

export interface OrderRepository {
  createOrder(
    workspaceId: string,
    actor: RequestActor,
    record: CreateOrderRecord,
  ): Promise<OrderOperationResponse>;
  assignShipping(
    workspaceId: string,
    orderId: string,
    actor: RequestActor,
    input: AssignOrderRequest,
  ): Promise<OrderAssignmentResponse>;
  shippingTasks(workspaceId: string, actor: RequestActor): Promise<ShippingTaskResponse[]>;
  createAddressLease(
    workspaceId: string,
    orderId: string,
    actor: RequestActor,
    input: CreateAddressLeaseRequest,
  ): Promise<AddressLeaseRecord>;
  accessEncryptedAddress(
    workspaceId: string,
    orderId: string,
    leaseId: string,
    actor: RequestActor,
  ): Promise<EncryptedAddressAccess>;
  pickOrder(
    workspaceId: string,
    orderId: string,
    actor: RequestActor,
    input: PickOrderRequest,
  ): Promise<OrderOperationResponse>;
  packOrder(
    workspaceId: string,
    orderId: string,
    actor: RequestActor,
    input: PackOrderRequest,
  ): Promise<OrderOperationResponse>;
  shipOrder(
    workspaceId: string,
    orderId: string,
    actor: RequestActor,
    input: ShipOrderRequest,
  ): Promise<OrderOperationResponse>;
  returnOrder(
    workspaceId: string,
    orderId: string,
    actor: RequestActor,
    input: ReturnOrderRequest,
  ): Promise<OrderOperationResponse>;
  quarantineReturn(
    workspaceId: string,
    orderId: string,
    actor: RequestActor,
    input: QuarantineReturnRequest,
  ): Promise<OrderOperationResponse>;
  inspectReturn(
    workspaceId: string,
    orderId: string,
    actor: RequestActor,
    input: InspectReturnRequest,
  ): Promise<OrderOperationResponse>;
  financialSummary(
    workspaceId: string,
    orderId: string,
    actor: RequestActor,
  ): Promise<FinancialSummaryResponse>;
  createAccountingExport(
    workspaceId: string,
    orderId: string,
    actor: RequestActor,
    input: CreateAccountingExportRequest,
  ): Promise<AccountingExportResponse>;
  accountingExportContent(
    workspaceId: string,
    orderId: string,
    exportId: string,
    actor: RequestActor,
  ): Promise<AccountingExportContent>;
  close(): Promise<void>;
}

type OrderState = OrderOperationResponse["state"];
type InventoryStatus = OrderOperationResponse["inventoryStatus"];

interface OperationRow {
  order_id: string;
  order_number: string;
  sku_id: string;
  inventory_unit_id: string;
  response_state: OrderState;
  response_inventory_status: InventoryStatus;
  payload_hash: string;
  created_at: Date;
}

interface OrderUnitRow {
  order_id: string;
  order_number: string;
  order_state: OrderState;
  allocation_id: string;
  inventory_unit_id: string;
  inventory_number: string;
  inventory_status: InventoryStatus;
  location_id: string | null;
  location_code: string | null;
  movement_seq: number;
  sku_id: string;
}

interface FinancialEventRow {
  id: string;
  sku_id: string;
  event_type: "sale" | "cost" | "fee" | "shipping" | "packaging";
  amount_minor: number;
  tax_basis: "tax_included" | "tax_excluded" | "unknown";
  source: string;
  source_meaning: string;
  rounding_rule_version: string;
  occurred_at: Date;
}

class StaleOrderScanLabelError extends RepositoryError {
  constructor(
    readonly evidence: {
      inventoryUnitId: string;
      locationId: string;
      activeInventoryVersion: number;
      activeLocationVersion: number;
      submittedInventoryVersion: number;
      submittedLocationVersion: number;
    },
  ) {
    super("conflict", "An inventory or location label is stale");
  }
}

export class PostgresOrderRepository implements OrderRepository {
  private readonly sql: postgres.Sql;

  constructor(databaseUrl: string) {
    this.sql = postgres(databaseUrl, {
      max: 8,
      idle_timeout: 20,
      connect_timeout: 10,
      transform: { undefined: null },
    });
  }

  async createOrder(
    workspaceId: string,
    actor: RequestActor,
    record: CreateOrderRecord,
  ): Promise<OrderOperationResponse> {
    const payloadHash = hashPayload({
      ...record.input,
      shippingAddress: undefined,
      addressFingerprint: record.addressFingerprint,
    });
    try {
      return await this.sql.begin(async (transaction) => {
        await setWorkspace(transaction, workspaceId);
        const role = await requireRole(transaction, workspaceId, actor.identityId, [
          "owner",
          "inventory_manager",
        ]);
        const replay = await operationReplay(
          transaction,
          workspaceId,
          "create",
          record.input.idempotencyKey,
          payloadHash,
        );
        if (replay) return replay;

        const units = await transaction<Array<{ id: string }>>`
          select id from inventory_unit
          where workspace_id = ${workspaceId} and id = ${record.input.inventoryUnitId}
            and sku_id = ${record.input.skuId} and status = 'available'
        `;
        if (!units[0]) {
          throw new RepositoryError(
            "conflict",
            "Order allocation requires available matching inventory",
          );
        }
        await transaction`
          insert into sales_order (id, workspace_id, order_number, state)
          values (${record.orderId}, ${workspaceId}, ${record.input.orderNumber}, 'confirmed')
        `;
        await transaction`
          insert into order_private_address (
            workspace_id, order_id, ciphertext, nonce, auth_tag, key_version, created_by
          ) values (
            ${workspaceId}, ${record.orderId}, ${record.encryptedAddress.ciphertext},
            ${record.encryptedAddress.nonce}, ${record.encryptedAddress.authTag},
            ${record.encryptedAddress.keyVersion}, ${actor.identityId}
          )
        `;
        await transaction`
          insert into order_allocation (workspace_id, order_id, inventory_unit_id)
          values (${workspaceId}, ${record.orderId}, ${record.input.inventoryUnitId})
        `;
        const facts = [
          ["sale", record.input.saleAmountMinor, "channel", "販売額"],
          ["cost", record.input.costAmountMinor, "seller", "商品原価"],
          ["fee", record.input.sellingFeeMinor, "seller", "販売手数料"],
          ["shipping", record.input.shippingCostMinor, "seller", "出品者送料"],
          ["packaging", record.input.packagingCostMinor, "seller", "梱包費"],
        ] as const;
        for (const [eventType, amount, bearer, label] of facts) {
          await transaction`
            insert into financial_event (
              workspace_id, sku_id, order_id, event_type, amount_minor, currency,
              tax_basis, bearer, source, source_meaning, rounding_rule_version,
              source_already_net, occurred_at
            ) values (
              ${workspaceId}, ${record.input.skuId}, ${record.orderId}, ${eventType}, ${amount},
              'JPY', ${record.input.taxBasis}, ${bearer}, 'manual',
              ${`${record.input.sourceMeaning} / ${label}`}, 'jpy-v1', false,
              ${record.input.occurredAt}
            )
          `;
        }
        await insertOperationRecord(transaction, {
          workspaceId,
          orderId: record.orderId,
          operation: "create",
          idempotencyKey: record.input.idempotencyKey,
          payloadHash,
          state: "confirmed",
          inventoryStatus: "reserved",
        });
        await advanceP0ForOrderOperation(
          transaction,
          workspaceId,
          record.orderId,
          actor.identityId,
          role,
          "create",
          record.input.idempotencyKey,
        );
        await insertAudit(
          transaction,
          workspaceId,
          actor.identityId,
          "order.confirmed",
          record.orderId,
          ["state", "inventory_unit_id"],
          { state: "absent", inventoryStatus: "available" },
          { state: "confirmed", inventoryStatus: "reserved" },
          "human_confirmed_order_creation",
        );
        return requireOperationResponse(
          transaction,
          workspaceId,
          "create",
          record.input.idempotencyKey,
        );
      });
    } catch (error) {
      throw normalizeOrderError(error);
    }
  }

  async assignShipping(
    workspaceId: string,
    orderId: string,
    actor: RequestActor,
    input: AssignOrderRequest,
  ): Promise<OrderAssignmentResponse> {
    try {
      return await this.sql.begin(async (transaction) => {
        await setWorkspace(transaction, workspaceId);
        await requireRole(transaction, workspaceId, actor.identityId, [
          "owner",
          "inventory_manager",
        ]);
        const assignees = await transaction<Array<{ identity_id: string }>>`
          select credential.identity_id
          from auth_credential credential
          join workspace_membership membership
            on membership.identity_id = credential.identity_id
           and membership.workspace_id = ${workspaceId}
          where credential.email_normalized = ${input.assigneeEmail}
            and membership.active and membership.role = 'shipping'
        `;
        const assignee = assignees[0];
        if (!assignee) {
          throw new RepositoryError("forbidden", "The shipping assignee is not an active member");
        }
        const conflicts = await transaction<Array<{ present: boolean }>>`
          select exists (
            select 1 from order_assignment
            where workspace_id = ${workspaceId} and order_id = ${orderId}
              and revoked_at is null
              and tstzrange(starts_at, expires_at, '[)') &&
                  tstzrange(${input.startsAt}::timestamptz, ${input.expiresAt}::timestamptz, '[)')
          ) as present
        `;
        if (conflicts[0]?.present) {
          throw new RepositoryError("conflict", "The order already has an overlapping assignment");
        }
        const rows = await transaction<
          Array<{ id: string; starts_at: Date; expires_at: Date; revoked_at: Date | null }>
        >`
          insert into order_assignment (
            workspace_id, order_id, identity_id, starts_at, expires_at, assigned_by
          )
          select ${workspaceId}, ${orderId}, ${assignee.identity_id}, ${input.startsAt},
                 ${input.expiresAt}, ${actor.identityId}
          where exists (
            select 1 from sales_order where workspace_id = ${workspaceId} and id = ${orderId}
              and state in ('confirmed', 'picking', 'packed')
          )
          returning id, starts_at, expires_at, revoked_at
        `;
        const row = rows[0];
        if (!row) throw new RepositoryError("conflict", "The order cannot be assigned");
        await insertAudit(
          transaction,
          workspaceId,
          actor.identityId,
          "order.shipping.assigned",
          row.id,
          ["identity_id", "starts_at", "expires_at"],
          { assignment: "none" },
          {
            identityId: assignee.identity_id,
            startsAt: row.starts_at.toISOString(),
            expiresAt: row.expires_at.toISOString(),
          },
          "shipping_assignment_human_confirmed",
        );
        return {
          assignmentId: row.id,
          workspaceId,
          orderId,
          identityId: assignee.identity_id,
          startsAt: row.starts_at.toISOString(),
          expiresAt: row.expires_at.toISOString(),
          revokedAt: row.revoked_at?.toISOString() ?? null,
        };
      });
    } catch (error) {
      throw normalizeOrderError(error);
    }
  }

  async shippingTasks(workspaceId: string, actor: RequestActor): Promise<ShippingTaskResponse[]> {
    try {
      return await this.sql.begin(async (transaction) => {
        await setWorkspace(transaction, workspaceId);
        const role = await requireRole(transaction, workspaceId, actor.identityId, [
          "owner",
          "inventory_manager",
          "shipping",
        ]);
        const rows = await transaction<
          Array<{
            order_id: string;
            order_number: string;
            state: ShippingTaskResponse["state"];
            inventory_number: string;
            inventory_unit_id: string;
            sku_id: string;
            location_code: string;
            inventory_label_version: number;
            location_label_version: number;
            expires_at: Date;
          }>
        >`
          select orders.id as order_id, orders.order_number, orders.state,
                 unit.inventory_number, unit.id as inventory_unit_id, unit.sku_id,
                 location.code as location_code, item_label.version as inventory_label_version,
                 location_label.version as location_label_version, assignment.expires_at
          from order_assignment assignment
          join sales_order orders
            on orders.workspace_id = assignment.workspace_id and orders.id = assignment.order_id
          join order_allocation allocation
            on allocation.workspace_id = orders.workspace_id and allocation.order_id = orders.id
          join inventory_unit unit
            on unit.workspace_id = allocation.workspace_id and unit.id = allocation.inventory_unit_id
          join location_node location
            on location.workspace_id = unit.workspace_id and location.id = unit.location_id
          join inventory_label item_label
            on item_label.workspace_id = unit.workspace_id
           and item_label.target_type = 'inventory_unit' and item_label.target_id = unit.id
           and item_label.active
          join inventory_label location_label
            on location_label.workspace_id = location.workspace_id
           and location_label.target_type = 'location' and location_label.target_id = location.id
           and location_label.active
          where assignment.workspace_id = ${workspaceId}
            and assignment.revoked_at is null
            and assignment.starts_at <= statement_timestamp()
            and assignment.expires_at > statement_timestamp()
            and orders.state in ('confirmed', 'picking', 'packed')
            and (${role === "shipping"}::boolean = false or assignment.identity_id = ${actor.identityId})
          order by assignment.expires_at, orders.order_number
        `;
        return rows.map((row) => ({
          orderId: row.order_id,
          orderNumber: row.order_number,
          state: row.state,
          inventoryNumber: row.inventory_number,
          inventoryUnitId: row.inventory_unit_id,
          skuId: row.sku_id,
          locationCode: row.location_code,
          inventoryLabelVersion: row.inventory_label_version,
          locationLabelVersion: row.location_label_version,
          assignmentExpiresAt: row.expires_at.toISOString(),
        }));
      });
    } catch (error) {
      throw normalizeOrderError(error);
    }
  }

  async createAddressLease(
    workspaceId: string,
    orderId: string,
    actor: RequestActor,
    input: CreateAddressLeaseRequest,
  ): Promise<AddressLeaseRecord> {
    void input;
    try {
      return await this.sql.begin(async (transaction) => {
        await setWorkspace(transaction, workspaceId);
        const role = await requireRole(transaction, workspaceId, actor.identityId, [
          "owner",
          "inventory_manager",
          "shipping",
        ]);
        const assignmentExpiry = await requireOrderAssignmentIfShipping(
          transaction,
          workspaceId,
          orderId,
          actor.identityId,
          role,
        );
        const rows = await transaction<Array<{ id: string; expires_at: Date }>>`
          insert into address_access_lease (
            workspace_id, order_id, identity_id, purpose, issued_by, issued_at, expires_at
          )
          select ${workspaceId}, ${orderId}, ${actor.identityId}, 'shipping_label',
                 ${actor.identityId}, statement_timestamp(),
                 least(
                   statement_timestamp() + interval '5 minutes',
                   coalesce(${assignmentExpiry}, statement_timestamp() + interval '5 minutes')
                 )
          where exists (
            select 1 from sales_order where workspace_id = ${workspaceId} and id = ${orderId}
              and state in ('confirmed', 'picking', 'packed')
          )
          returning id, expires_at
        `;
        const row = rows[0];
        if (!row) throw new RepositoryError("conflict", "The order cannot issue an address lease");
        await insertAudit(
          transaction,
          workspaceId,
          actor.identityId,
          "address.lease.issued",
          row.id,
          ["purpose", "expires_at"],
          { addressAccess: "hidden" },
          { addressAccess: "leased", expiresAt: row.expires_at.toISOString() },
          "shipping_address_lease_human_confirmed",
        );
        return {
          leaseId: row.id,
          workspaceId,
          orderId,
          identityId: actor.identityId,
          expiresAt: row.expires_at.toISOString(),
        };
      });
    } catch (error) {
      throw normalizeOrderError(error);
    }
  }

  async accessEncryptedAddress(
    workspaceId: string,
    orderId: string,
    leaseId: string,
    actor: RequestActor,
  ): Promise<EncryptedAddressAccess> {
    try {
      return await this.sql.begin(async (transaction) => {
        await setWorkspace(transaction, workspaceId);
        const role = await requireRole(transaction, workspaceId, actor.identityId, [
          "owner",
          "inventory_manager",
          "shipping",
        ]);
        await requireOrderAssignmentIfShipping(
          transaction,
          workspaceId,
          orderId,
          actor.identityId,
          role,
        );
        const rows = await transaction<
          Array<{
            ciphertext: Buffer;
            nonce: Buffer;
            auth_tag: Buffer;
            key_version: string;
            expires_at: Date;
          }>
        >`
          select address.ciphertext, address.nonce, address.auth_tag, address.key_version,
                 lease.expires_at
          from address_access_lease lease
          join order_private_address address
            on address.workspace_id = lease.workspace_id and address.order_id = lease.order_id
          where lease.workspace_id = ${workspaceId} and lease.order_id = ${orderId}
            and lease.id = ${leaseId} and lease.identity_id = ${actor.identityId}
            and lease.purpose = 'shipping_label' and lease.expires_at > clock_timestamp()
        `;
        const row = rows[0];
        if (!row) throw new RepositoryError("forbidden", "The address lease is invalid or expired");
        await insertAudit(
          transaction,
          workspaceId,
          actor.identityId,
          "address.viewed",
          orderId,
          [],
          { addressAccess: "hidden" },
          { addressAccess: "revealed_under_active_lease" },
          "shipping_address_view_under_lease",
        );
        return {
          value: {
            ciphertext: row.ciphertext,
            nonce: row.nonce,
            authTag: row.auth_tag,
            keyVersion: row.key_version,
          },
          expiresAt: row.expires_at.toISOString(),
        };
      });
    } catch (error) {
      throw normalizeOrderError(error);
    }
  }

  async pickOrder(
    workspaceId: string,
    orderId: string,
    actor: RequestActor,
    input: PickOrderRequest,
  ): Promise<OrderOperationResponse> {
    return this.mutateOrder(
      workspaceId,
      orderId,
      actor,
      "pick",
      input,
      async (transaction, role) => {
        const order = await requireOrderUnit(transaction, workspaceId, orderId);
        const leaseActive = await hasActiveAddressLease(
          transaction,
          workspaceId,
          orderId,
          actor.identityId,
          input.addressLeaseId,
        );
        const violations = validateOrderTransition({
          from: order.order_state,
          to: "picking",
          actorRole: role,
          hasActiveAllocation: true,
          hasConfirmedPickScan: false,
          hasPackingEvidence: false,
          addressLeaseActive: leaseActive,
        });
        if (violations.length > 0) {
          throw new RepositoryError("conflict", `Pick rejected: ${violations.join(",")}`);
        }
        if (
          order.inventory_number !== input.inventoryNumber ||
          order.location_code !== input.locationCode ||
          !order.location_id
        ) {
          throw new RepositoryError("conflict", "The allocated item or current location changed");
        }
        const labels = await requireScanLabels(transaction, workspaceId, order, input);
        const scanSessionId = randomUUID();
        await transaction`
        insert into scan_session (
          id, workspace_id, operation, inventory_unit_id, expected_location_id,
          destination_location_id, inventory_label_id, inventory_label_version,
          location_label_id, location_label_version, inventory_scanned_at,
          location_scanned_at, confirmed_by, confirmed_at
        ) values (
          ${scanSessionId}, ${workspaceId}, 'pick', ${order.inventory_unit_id},
          ${order.location_id}, ${order.location_id}, ${labels.inventoryLabelId},
          ${input.inventoryLabelVersion}, ${labels.locationLabelId},
          ${input.locationLabelVersion}, ${input.inventoryScannedAt},
          ${input.locationScannedAt}, ${actor.identityId}, ${input.confirmedAt}
        )
      `;
        await transaction`
        insert into inventory_movement (
          workspace_id, inventory_unit_id, movement_seq, from_location_id,
          to_location_id, movement_kind, scan_session_id, idempotency_key,
          payload_hash, moved_by
        ) values (
          ${workspaceId}, ${order.inventory_unit_id}, ${order.movement_seq + 1},
          ${order.location_id}, ${order.location_id}, 'pick', ${scanSessionId},
          ${input.idempotencyKey}, ${hashPayload(input)}, ${actor.identityId}
        )
      `;
        await transaction`
        update sales_order set state = 'picking'
        where workspace_id = ${workspaceId} and id = ${orderId}
      `;
        return { state: "picking" as const, inventoryStatus: "picked" as const };
      },
    );
  }

  async packOrder(
    workspaceId: string,
    orderId: string,
    actor: RequestActor,
    input: PackOrderRequest,
  ): Promise<OrderOperationResponse> {
    return this.mutateOrder(
      workspaceId,
      orderId,
      actor,
      "pack",
      input,
      async (transaction, role) => {
        const order = await requireOrderUnit(transaction, workspaceId, orderId);
        const leaseActive = await hasActiveAddressLease(
          transaction,
          workspaceId,
          orderId,
          actor.identityId,
          input.addressLeaseId,
        );
        const violations = validateOrderTransition({
          from: order.order_state,
          to: "packed",
          actorRole: role,
          hasActiveAllocation: true,
          hasConfirmedPickScan: order.inventory_status === "picked",
          hasPackingEvidence: true,
          addressLeaseActive: leaseActive,
        });
        if (violations.length > 0) {
          throw new RepositoryError("conflict", `Pack rejected: ${violations.join(",")}`);
        }
        await transaction`
        insert into packing_evidence (
          workspace_id, order_id, evidence_reference_id, confirmed_by, confirmed_at
        ) values (
          ${workspaceId}, ${orderId}, ${input.packingEvidenceReferenceId},
          ${actor.identityId}, ${input.confirmedAt}
        )
      `;
        await transaction`
        update sales_order set state = 'packed'
        where workspace_id = ${workspaceId} and id = ${orderId}
      `;
        return { state: "packed" as const, inventoryStatus: "packed" as const };
      },
    );
  }

  async shipOrder(
    workspaceId: string,
    orderId: string,
    actor: RequestActor,
    input: ShipOrderRequest,
  ): Promise<OrderOperationResponse> {
    return this.mutateOrder(
      workspaceId,
      orderId,
      actor,
      "ship",
      input,
      async (transaction, role) => {
        const order = await requireOrderUnit(transaction, workspaceId, orderId);
        const leaseActive = await hasActiveAddressLease(
          transaction,
          workspaceId,
          orderId,
          actor.identityId,
          input.addressLeaseId,
        );
        const packing = await transaction<Array<{ present: boolean }>>`
        select exists (
          select 1 from packing_evidence
          where workspace_id = ${workspaceId} and order_id = ${orderId}
        ) as present
      `;
        const violations = validateOrderTransition({
          from: order.order_state,
          to: "shipped",
          actorRole: role,
          hasActiveAllocation: true,
          hasConfirmedPickScan: true,
          hasPackingEvidence: packing[0]?.present ?? false,
          addressLeaseActive: leaseActive,
        });
        if (violations.length > 0) {
          throw new RepositoryError("conflict", `Ship rejected: ${violations.join(",")}`);
        }
        await transaction`
        update sales_order set state = 'shipped'
        where workspace_id = ${workspaceId} and id = ${orderId}
      `;
        return { state: "shipped" as const, inventoryStatus: "shipped" as const };
      },
    );
  }

  async returnOrder(
    workspaceId: string,
    orderId: string,
    actor: RequestActor,
    input: ReturnOrderRequest,
  ): Promise<OrderOperationResponse> {
    return this.mutateOrder(
      workspaceId,
      orderId,
      actor,
      "return",
      input,
      async (transaction, role) => {
        const order = await requireOrderUnit(transaction, workspaceId, orderId);
        const violations = validateOrderTransition({
          from: order.order_state,
          to: "returned",
          actorRole: role,
          hasActiveAllocation: true,
          hasConfirmedPickScan: true,
          hasPackingEvidence: true,
          addressLeaseActive: true,
        });
        if (violations.length > 0) {
          throw new RepositoryError("conflict", `Return rejected: ${violations.join(",")}`);
        }
        await transaction`
        update sales_order set state = 'returned'
        where workspace_id = ${workspaceId} and id = ${orderId}
      `;
        return { state: "returned" as const, inventoryStatus: "shipped" as const };
      },
    );
  }

  async quarantineReturn(
    workspaceId: string,
    orderId: string,
    actor: RequestActor,
    input: QuarantineReturnRequest,
  ): Promise<OrderOperationResponse> {
    return this.mutateOrder(
      workspaceId,
      orderId,
      actor,
      "quarantine",
      input,
      async (transaction) => {
        if (input.orderId !== orderId) {
          throw new RepositoryError("forbidden", "The return order ID does not match the URL");
        }
        const order = await requireOrderUnit(transaction, workspaceId, orderId);
        if (
          order.order_state !== "returned" ||
          order.inventory_status !== "shipped" ||
          order.inventory_number !== input.inventoryNumber
        ) {
          throw new RepositoryError(
            "conflict",
            "Return quarantine requires the shipped allocated item",
          );
        }
        const destination = await transaction<Array<{ id: string }>>`
          select id from location_node
          where workspace_id = ${workspaceId} and code = ${input.locationCode}
            and state = 'active' and can_store_inventory
        `;
        const destinationId = destination[0]?.id;
        if (!destinationId)
          throw new RepositoryError("conflict", "Quarantine location is unavailable");
        const labels = await requireReturnLabels(
          transaction,
          workspaceId,
          order.inventory_unit_id,
          destinationId,
          input,
        );
        const scanSessionId = randomUUID();
        await transaction`
          insert into scan_session (
            id, workspace_id, operation, inventory_unit_id, expected_location_id,
            destination_location_id, inventory_label_id, inventory_label_version,
            location_label_id, location_label_version, inventory_scanned_at,
            location_scanned_at, confirmed_by, confirmed_at
          ) values (
            ${scanSessionId}, ${workspaceId}, 'return_quarantine', ${order.inventory_unit_id},
            null, ${destinationId}, ${labels.inventoryLabelId}, ${input.inventoryLabelVersion},
            ${labels.locationLabelId}, ${input.locationLabelVersion}, ${input.inventoryScannedAt},
            ${input.locationScannedAt}, ${actor.identityId}, ${input.confirmedAt}
          )
        `;
        await transaction`
          insert into inventory_movement (
            workspace_id, inventory_unit_id, movement_seq, from_location_id,
            to_location_id, movement_kind, scan_session_id, idempotency_key,
            payload_hash, moved_by
          ) values (
            ${workspaceId}, ${order.inventory_unit_id}, ${order.movement_seq + 1}, null,
            ${destinationId}, 'return_quarantine', ${scanSessionId}, ${input.idempotencyKey},
            ${hashPayload(input)}, ${actor.identityId}
          )
        `;
        return { state: "returned" as const, inventoryStatus: "quarantined" as const };
      },
    );
  }

  async inspectReturn(
    workspaceId: string,
    orderId: string,
    actor: RequestActor,
    input: InspectReturnRequest,
  ): Promise<OrderOperationResponse> {
    return this.mutateOrder(
      workspaceId,
      orderId,
      actor,
      "inspect",
      input,
      async (transaction, role) => {
        if (role !== "owner" && role !== "inventory_manager") {
          throw new RepositoryError("forbidden", "Only inventory management can inspect returns");
        }
        const order = await requireOrderUnit(transaction, workspaceId, orderId);
        if (order.order_state !== "returned" || order.inventory_status !== "quarantined") {
          throw new RepositoryError("conflict", "Return inspection requires quarantined inventory");
        }
        await transaction`
          insert into return_inspection (
            workspace_id, order_id, inventory_unit_id, resolution, confirmed_by, confirmed_at
          ) values (
            ${workspaceId}, ${orderId}, ${order.inventory_unit_id}, ${input.resolution},
            ${actor.identityId}, ${input.inspectedAt}
          )
        `;
        return {
          state: "returned" as const,
          inventoryStatus:
            input.resolution === "restock" ? ("available" as const) : ("disposed" as const),
        };
      },
    );
  }

  async financialSummary(
    workspaceId: string,
    orderId: string,
    actor: RequestActor,
  ): Promise<FinancialSummaryResponse> {
    try {
      return await this.sql.begin(async (transaction) => {
        await setWorkspace(transaction, workspaceId);
        await requireRole(transaction, workspaceId, actor.identityId, [
          "owner",
          "inventory_manager",
          "accounting",
        ]);
        const events = await requireFinancialEvents(transaction, workspaceId, orderId);
        return toFinancialSummary(workspaceId, orderId, events);
      });
    } catch (error) {
      throw normalizeOrderError(error);
    }
  }

  async createAccountingExport(
    workspaceId: string,
    orderId: string,
    actor: RequestActor,
    input: CreateAccountingExportRequest,
  ): Promise<AccountingExportResponse> {
    try {
      return await this.sql.begin(async (transaction) => {
        await setWorkspace(transaction, workspaceId);
        const role = await requireRole(transaction, workspaceId, actor.identityId, [
          "owner",
          "accounting",
        ]);
        const events = await requireFinancialEvents(transaction, workspaceId, orderId);
        const candidates = events.map((event) => journalCandidate(event, actor.identityId));
        const generated = createAccountingCsv(candidates);
        const payloadHash = hashPayload({
          input,
          eventIds: events.map((event) => event.id),
          generatedSha256: generated.sha256,
        });
        const existing = await transaction<
          Array<{
            id: string;
            filename: "journal-candidates.csv";
            csv_sha256: string;
            row_count: number;
            payload_hash: string;
            created_at: Date;
          }>
        >`
          select id, filename, csv_sha256, row_count, payload_hash, created_at
          from accounting_export
          where workspace_id = ${workspaceId} and idempotency_key = ${input.idempotencyKey}
        `;
        if (existing[0]) {
          if (existing[0].payload_hash !== payloadHash) {
            throw new RepositoryError("conflict", "The export idempotency key has another payload");
          }
          return toAccountingExportResponse(workspaceId, orderId, existing[0]);
        }
        const skuId = events[0]?.sku_id;
        if (!skuId) throw new RepositoryError("conflict", "The order has no financial SKU");
        const rows = await transaction<
          Array<{
            id: string;
            filename: "journal-candidates.csv";
            csv_sha256: string;
            row_count: number;
            payload_hash: string;
            created_at: Date;
          }>
        >`
          insert into accounting_export (
            workspace_id, order_id, sku_id, filename, csv_sha256, row_count,
            csv_content, idempotency_key, payload_hash, created_by
          ) values (
            ${workspaceId}, ${orderId}, ${skuId}, ${generated.filename}, ${generated.sha256},
            ${generated.rowCount}, ${generated.csv}, ${input.idempotencyKey}, ${payloadHash},
            ${actor.identityId}
          )
          returning id, filename, csv_sha256, row_count, payload_hash, created_at
        `;
        const row = rows[0];
        if (!row) throw new RepositoryError("database_error", "Accounting export was not stored");
        await advanceP0ForOrderOperation(
          transaction,
          workspaceId,
          orderId,
          actor.identityId,
          role,
          "accounting",
          input.idempotencyKey,
          row.id,
        );
        await insertAudit(
          transaction,
          workspaceId,
          actor.identityId,
          "accounting.export.approved",
          row.id,
          ["csv_sha256", "row_count"],
          { export: "absent" },
          { sha256: row.csv_sha256, rowCount: row.row_count },
          "accounting_candidate_human_approved",
        );
        return toAccountingExportResponse(workspaceId, orderId, row);
      });
    } catch (error) {
      throw normalizeOrderError(error);
    }
  }

  async accountingExportContent(
    workspaceId: string,
    orderId: string,
    exportId: string,
    actor: RequestActor,
  ): Promise<AccountingExportContent> {
    try {
      return await this.sql.begin(async (transaction) => {
        await setWorkspace(transaction, workspaceId);
        await requireRole(transaction, workspaceId, actor.identityId, ["owner", "accounting"]);
        const rows = await transaction<
          Array<{ filename: "journal-candidates.csv"; csv_content: string; csv_sha256: string }>
        >`
          select filename, csv_content, csv_sha256 from accounting_export
          where workspace_id = ${workspaceId} and order_id = ${orderId} and id = ${exportId}
        `;
        const row = rows[0];
        if (!row) throw new RepositoryError("forbidden", "The accounting export is unavailable");
        return { filename: row.filename, csv: row.csv_content, sha256: row.csv_sha256 };
      });
    } catch (error) {
      throw normalizeOrderError(error);
    }
  }

  async close(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }

  private async mutateOrder<T extends { idempotencyKey: string }>(
    workspaceId: string,
    orderId: string,
    actor: RequestActor,
    operation: "pick" | "pack" | "ship" | "return" | "quarantine" | "inspect",
    input: T,
    mutation: (
      transaction: postgres.TransactionSql,
      role: WorkspaceRole,
    ) => Promise<{ state: OrderState; inventoryStatus: InventoryStatus }>,
  ): Promise<OrderOperationResponse> {
    const payloadHash = hashPayload(input);
    try {
      return await this.sql.begin(async (transaction) => {
        await setWorkspace(transaction, workspaceId);
        const role = await requireRole(transaction, workspaceId, actor.identityId, [
          "owner",
          "inventory_manager",
          "shipping",
        ]);
        if (role === "shipping" && !["pick", "pack", "ship"].includes(operation)) {
          throw new RepositoryError("forbidden", "Shipping staff cannot perform return decisions");
        }
        await requireOrderAssignmentIfShipping(
          transaction,
          workspaceId,
          orderId,
          actor.identityId,
          role,
        );
        const replay = await operationReplay(
          transaction,
          workspaceId,
          operation,
          input.idempotencyKey,
          payloadHash,
        );
        if (replay) return replay;
        const before = await requireOrderUnit(transaction, workspaceId, orderId);
        const result = await mutation(transaction, role);
        await insertOperationRecord(transaction, {
          workspaceId,
          orderId,
          operation,
          idempotencyKey: input.idempotencyKey,
          payloadHash,
          state: result.state,
          inventoryStatus: result.inventoryStatus,
        });
        if (operation === "pick" || operation === "pack" || operation === "ship") {
          await advanceP0ForOrderOperation(
            transaction,
            workspaceId,
            orderId,
            actor.identityId,
            role,
            operation,
            input.idempotencyKey,
          );
        }
        await insertAudit(
          transaction,
          workspaceId,
          actor.identityId,
          `order.${operation}`,
          orderId,
          ["state", "inventory_status"],
          { state: before.order_state, inventoryStatus: before.inventory_status },
          { state: result.state, inventoryStatus: result.inventoryStatus },
          `human_confirmed_${operation}`,
        );
        return requireOperationResponse(transaction, workspaceId, operation, input.idempotencyKey);
      });
    } catch (error) {
      if (error instanceof StaleOrderScanLabelError) {
        try {
          await this.sql.begin(async (transaction) => {
            await setWorkspace(transaction, workspaceId);
            await requireRole(transaction, workspaceId, actor.identityId, [
              "owner",
              "inventory_manager",
              "shipping",
            ]);
            await transaction`
              insert into audit_event (
                workspace_id, actor_id, action, target_type, target_id,
                field_names, redacted_changes, reference_ids, reason_code, approved_by
              ) values (
                ${workspaceId}, ${actor.identityId}, 'inventory.scan.rejected',
                'inventory_unit', ${error.evidence.inventoryUnitId},
                ${["operation", "inventory_label_version", "location_label_version"]},
                ${transaction.json({
                  before: {
                    operation,
                    activeInventoryLabelVersion: error.evidence.activeInventoryVersion,
                    activeLocationLabelVersion: error.evidence.activeLocationVersion,
                  },
                  after: {
                    operation,
                    submittedInventoryLabelVersion: error.evidence.submittedInventoryVersion,
                    submittedLocationLabelVersion: error.evidence.submittedLocationVersion,
                  },
                })},
                ${[orderId, error.evidence.locationId]}, 'stale_label_version',
                ${actor.identityId}
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
      throw normalizeOrderError(error);
    }
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
    select role from workspace_membership
    where workspace_id = ${workspaceId} and identity_id = ${identityId} and active
  `;
  const role = rows[0]?.role;
  if (!role || !allowed.includes(role)) {
    throw new RepositoryError("forbidden", "The actor cannot perform this order operation");
  }
  return role;
}

async function requireOrderAssignmentIfShipping(
  sql: postgres.TransactionSql,
  workspaceId: string,
  orderId: string,
  identityId: string,
  role: WorkspaceRole,
): Promise<Date | null> {
  if (role !== "shipping") return null;
  const rows = await sql<Array<{ expires_at: Date }>>`
    select expires_at from order_assignment
    where workspace_id = ${workspaceId} and order_id = ${orderId}
      and identity_id = ${identityId} and revoked_at is null
      and starts_at <= statement_timestamp() and expires_at > statement_timestamp()
    order by expires_at asc limit 1
  `;
  const row = rows[0];
  if (!row) {
    throw new RepositoryError("forbidden", "The order is outside this shipping assignment");
  }
  return row.expires_at;
}

async function operationReplay(
  sql: postgres.TransactionSql,
  workspaceId: string,
  operation: string,
  idempotencyKey: string,
  payloadHash: string,
): Promise<OrderOperationResponse | null> {
  const rows = await operationRows(sql, workspaceId, operation, idempotencyKey);
  const row = rows[0];
  if (!row) return null;
  if (row.payload_hash !== payloadHash) {
    throw new RepositoryError("conflict", "The operation idempotency key has another payload");
  }
  return toOrderOperationResponse(workspaceId, row);
}

function operationRows(
  sql: postgres.TransactionSql,
  workspaceId: string,
  operation: string,
  idempotencyKey: string,
): Promise<OperationRow[]> {
  return sql<OperationRow[]>`
    select operation.order_id, sales_order.order_number, unit.sku_id,
           allocation.inventory_unit_id, operation.response_state,
           operation.response_inventory_status, operation.payload_hash, operation.created_at
    from order_operation_record operation
    join sales_order
      on sales_order.workspace_id = operation.workspace_id and sales_order.id = operation.order_id
    join order_allocation allocation
      on allocation.workspace_id = operation.workspace_id and allocation.order_id = operation.order_id
    join inventory_unit unit
      on unit.workspace_id = allocation.workspace_id and unit.id = allocation.inventory_unit_id
    where operation.workspace_id = ${workspaceId} and operation.operation = ${operation}
      and operation.idempotency_key = ${idempotencyKey}
  `;
}

async function requireOperationResponse(
  sql: postgres.TransactionSql,
  workspaceId: string,
  operation: string,
  idempotencyKey: string,
): Promise<OrderOperationResponse> {
  const rows = await operationRows(sql, workspaceId, operation, idempotencyKey);
  const row = rows[0];
  if (!row) throw new RepositoryError("database_error", "Order operation result is missing");
  return toOrderOperationResponse(workspaceId, row);
}

function toOrderOperationResponse(workspaceId: string, row: OperationRow): OrderOperationResponse {
  return {
    workspaceId,
    orderId: row.order_id,
    orderNumber: row.order_number,
    skuId: row.sku_id,
    inventoryUnitId: row.inventory_unit_id,
    state: row.response_state,
    inventoryStatus: row.response_inventory_status,
    updatedAt: row.created_at.toISOString(),
  };
}

type AtomicP0Operation = "create" | "pick" | "pack" | "ship" | "accounting";

const p0TransitionByOrderOperation = {
  create: {
    action: "confirm_order",
    from: "listing_confirmed",
    to: "order_confirmed",
    roles: ["owner", "inventory_manager"],
  },
  pick: {
    action: "confirm_pick",
    from: "order_confirmed",
    to: "picked",
    roles: ["owner", "inventory_manager", "shipping"],
  },
  pack: {
    action: "confirm_pack",
    from: "picked",
    to: "packed",
    roles: ["owner", "inventory_manager", "shipping"],
  },
  ship: {
    action: "confirm_ship",
    from: "packed",
    to: "shipped",
    roles: ["owner", "inventory_manager", "shipping"],
  },
  accounting: {
    action: "approve_journal",
    from: "shipped",
    to: "journal_approved",
    roles: ["owner", "accounting"],
  },
} as const satisfies Record<
  AtomicP0Operation,
  { action: string; from: string; to: string; roles: readonly WorkspaceRole[] }
>;

async function advanceP0ForOrderOperation(
  sql: postgres.TransactionSql,
  workspaceId: string,
  orderId: string,
  actorId: string,
  role: WorkspaceRole,
  operation: AtomicP0Operation,
  idempotencyKey: string,
  evidenceReferenceId: string = orderId,
): Promise<void> {
  const transition = p0TransitionByOrderOperation[operation];
  if (!(transition.roles as readonly WorkspaceRole[]).includes(role)) {
    throw new RepositoryError("forbidden", "The actor cannot confirm this order workflow step");
  }
  const rows = await sql<Array<{ sku_id: string; state: string; version: number }>>`
    select unit.sku_id, workflow.state, workflow.version
    from order_allocation allocation
    join inventory_unit unit
      on unit.workspace_id = allocation.workspace_id
     and unit.id = allocation.inventory_unit_id
    join p0_workflow workflow
      on workflow.workspace_id = unit.workspace_id and workflow.sku_id = unit.sku_id
    where allocation.workspace_id = ${workspaceId} and allocation.order_id = ${orderId}
      and allocation.active
    for update of workflow
  `;
  const workflow = rows[0];
  if (!workflow) {
    throw new RepositoryError("conflict", "The order has no active SKU workflow");
  }
  if (workflow.state !== transition.from) {
    throw new RepositoryError(
      "conflict",
      `The SKU workflow must be ${transition.from} before ${operation}`,
    );
  }
  const nextVersion = workflow.version + 1;
  const payloadHash = hashPayload({ operation, orderId, action: transition.action });
  await sql`
    update p0_workflow
    set state = ${transition.to}, last_action = ${transition.action},
        version = ${nextVersion}, updated_at = statement_timestamp()
    where workspace_id = ${workspaceId} and sku_id = ${workflow.sku_id}
  `;
  await sql`
    insert into p0_workflow_action (
      workspace_id, sku_id, action, actor_id, evidence_reference_ids,
      idempotency_key, payload_hash, response_state, response_version
    ) values (
      ${workspaceId}, ${workflow.sku_id}, ${transition.action}, ${actorId},
      ${[evidenceReferenceId]}, ${idempotencyKey}, ${payloadHash}, ${transition.to}, ${nextVersion}
    )
  `;
  await sql`
    insert into audit_event (
      workspace_id, actor_id, action, target_type, target_id, field_names,
      redacted_changes, reference_ids, reason_code, approved_by
    ) values (
      ${workspaceId}, ${actorId}, ${transition.action}, 'p0_workflow', ${workflow.sku_id},
      array['state','version'], ${sql.json({
        before: { state: workflow.state, version: workflow.version },
        after: { state: transition.to, version: nextVersion },
      })},
      ${[evidenceReferenceId]}, 'human_order_operation_confirmation', ${actorId}
    )
  `;
  await sql`
    insert into outbox_event (workspace_id, event_type, aggregate_type, aggregate_id, payload)
    values (
      ${workspaceId}, 'p0.workflow.advanced', 'product_sku', ${workflow.sku_id},
      ${sql.json({ action: transition.action, state: transition.to, version: nextVersion })}
    )
  `;
}

async function insertOperationRecord(
  sql: postgres.TransactionSql,
  value: {
    workspaceId: string;
    orderId: string;
    operation: string;
    idempotencyKey: string;
    payloadHash: string;
    state: OrderState;
    inventoryStatus: InventoryStatus;
  },
): Promise<void> {
  await sql`
    insert into order_operation_record (
      workspace_id, order_id, operation, idempotency_key, payload_hash,
      response_state, response_inventory_status
    ) values (
      ${value.workspaceId}, ${value.orderId}, ${value.operation}, ${value.idempotencyKey},
      ${value.payloadHash}, ${value.state}, ${value.inventoryStatus}
    )
  `;
}

async function requireOrderUnit(
  sql: postgres.TransactionSql,
  workspaceId: string,
  orderId: string,
): Promise<OrderUnitRow> {
  const rows = await sql<OrderUnitRow[]>`
    select sales_order.id as order_id, sales_order.order_number,
           sales_order.state as order_state, allocation.id as allocation_id,
           unit.id as inventory_unit_id, unit.inventory_number,
           unit.status as inventory_status, unit.location_id, location.code as location_code,
           unit.movement_seq::integer as movement_seq, unit.sku_id
    from sales_order
    join order_allocation allocation
      on allocation.workspace_id = sales_order.workspace_id
      and allocation.order_id = sales_order.id and allocation.active
    join inventory_unit unit
      on unit.workspace_id = allocation.workspace_id and unit.id = allocation.inventory_unit_id
    left join location_node location
      on location.workspace_id = unit.workspace_id and location.id = unit.location_id
    where sales_order.workspace_id = ${workspaceId} and sales_order.id = ${orderId}
  `;
  const row = rows[0];
  if (!row) throw new RepositoryError("forbidden", "The allocated order is not available");
  return row;
}

async function hasActiveAddressLease(
  sql: postgres.TransactionSql,
  workspaceId: string,
  orderId: string,
  identityId: string,
  leaseId: string | null,
): Promise<boolean> {
  if (!leaseId) return false;
  const rows = await sql<Array<{ active: boolean }>>`
    select exists (
      select 1 from address_access_lease
      where workspace_id = ${workspaceId} and order_id = ${orderId}
        and id = ${leaseId} and identity_id = ${identityId}
        and purpose = 'shipping_label' and expires_at > clock_timestamp()
    ) as active
  `;
  return rows[0]?.active ?? false;
}

async function requireScanLabels(
  sql: postgres.TransactionSql,
  workspaceId: string,
  order: OrderUnitRow,
  input: PickOrderRequest,
): Promise<{ inventoryLabelId: string; locationLabelId: string }> {
  if (!order.location_id) throw new RepositoryError("conflict", "The item has no current location");
  return requireReturnLabels(sql, workspaceId, order.inventory_unit_id, order.location_id, input);
}

async function requireReturnLabels(
  sql: postgres.TransactionSql,
  workspaceId: string,
  inventoryUnitId: string,
  locationId: string,
  input: {
    inventoryLabelVersion: number;
    locationLabelVersion: number;
  },
): Promise<{ inventoryLabelId: string; locationLabelId: string }> {
  const labels = await sql<Array<{ id: string; target_type: string; version: number }>>`
    select id, target_type, version from inventory_label
    where workspace_id = ${workspaceId} and active
      and (
        (target_type = 'inventory_unit' and target_id = ${inventoryUnitId})
        or (target_type = 'location' and target_id = ${locationId})
      )
  `;
  const inventoryLabel = labels.find((label) => label.target_type === "inventory_unit");
  const locationLabel = labels.find((label) => label.target_type === "location");
  if (
    !inventoryLabel ||
    !locationLabel ||
    inventoryLabel.version !== input.inventoryLabelVersion ||
    locationLabel.version !== input.locationLabelVersion
  ) {
    throw new StaleOrderScanLabelError({
      inventoryUnitId,
      locationId,
      activeInventoryVersion: inventoryLabel?.version ?? 0,
      activeLocationVersion: locationLabel?.version ?? 0,
      submittedInventoryVersion: input.inventoryLabelVersion,
      submittedLocationVersion: input.locationLabelVersion,
    });
  }
  return { inventoryLabelId: inventoryLabel.id, locationLabelId: locationLabel.id };
}

async function requireFinancialEvents(
  sql: postgres.TransactionSql,
  workspaceId: string,
  orderId: string,
): Promise<FinancialEventRow[]> {
  const rows = await sql<FinancialEventRow[]>`
    select id, sku_id, event_type, amount_minor::integer as amount_minor, tax_basis,
           source, source_meaning, rounding_rule_version, occurred_at
    from financial_event
    where workspace_id = ${workspaceId} and order_id = ${orderId}
      and event_type in ('sale', 'cost', 'fee', 'shipping', 'packaging')
    order by event_type, id
  `;
  if (rows.length !== 5)
    throw new RepositoryError("conflict", "The order financial facts are incomplete");
  return rows;
}

function toFinancialSummary(
  workspaceId: string,
  orderId: string,
  events: FinancialEventRow[],
): FinancialSummaryResponse {
  const amount = (type: FinancialEventRow["event_type"]) =>
    events.find((event) => event.event_type === type)?.amount_minor ?? 0;
  const fact = (type: FinancialEventRow["event_type"], bearer: MoneyFact["bearer"]): MoneyFact => {
    const event = events.find((candidate) => candidate.event_type === type);
    if (!event) throw new RepositoryError("conflict", `Missing financial event: ${type}`);
    return {
      amountMinor: event.amount_minor,
      currency: "JPY",
      taxBasis: event.tax_basis,
      bearer,
      source: "manual",
      sourceMeaning: event.source_meaning,
      roundingRuleVersion: event.rounding_rule_version,
    };
  };
  const sale = fact("sale", "channel");
  const contribution = calculateContribution({
    orderPrice: sale,
    sellerDiscount: { ...sale, amountMinor: 0 },
    channelCoupon: { ...sale, amountMinor: 0 },
    sellerRevenueBeforeRefund: sale,
    successfulRefund: null,
    sourceRevenueAlreadyNetOfRefund: false,
    costOfGoods: fact("cost", "seller"),
    sellingFee: fact("fee", "seller"),
    sellerShipping: fact("shipping", "seller"),
    packagingCost: fact("packaging", "seller"),
  });
  const skuId = events[0]?.sku_id;
  if (!skuId) throw new RepositoryError("conflict", "The order financial SKU is missing");
  return {
    workspaceId,
    orderId,
    skuId,
    saleAmountMinor: amount("sale"),
    costAmountMinor: amount("cost"),
    sellingFeeMinor: amount("fee"),
    shippingCostMinor: amount("shipping"),
    packagingCostMinor: amount("packaging"),
    netRevenueMinor: contribution.netRevenue,
    contributionProfitMinor: contribution.contributionProfit,
    currency: "JPY",
    disclaimer: "運用分析の参考値です。会計上の売上・利益・所得・税額を示すものではありません。",
  };
}

function journalCandidate(event: FinancialEventRow, approvedBy: string): JournalCandidate {
  const accounts: Record<
    FinancialEventRow["event_type"],
    { debit: string; credit: string; description: string }
  > = {
    sale: { debit: "売掛金", credit: "売上高", description: "販売額の仕訳候補" },
    cost: { debit: "仕入高", credit: "商品", description: "商品原価の振替候補" },
    fee: { debit: "支払手数料", credit: "売掛金", description: "販売手数料の仕訳候補" },
    shipping: { debit: "荷造運賃", credit: "現金", description: "出品者送料の仕訳候補" },
    packaging: { debit: "消耗品費", credit: "現金", description: "梱包費の仕訳候補" },
  };
  const account = accounts[event.event_type];
  return {
    id: event.id,
    occurredOn: event.occurred_at.toISOString().slice(0, 10),
    debitAccount: account.debit,
    debitAmount: event.amount_minor,
    creditAccount: account.credit,
    creditAmount: event.amount_minor,
    description: account.description,
    sourceReferenceId: event.id,
    humanApprovedBy: approvedBy,
    unresolvedReason: null,
  };
}

function toAccountingExportResponse(
  workspaceId: string,
  orderId: string,
  row: {
    id: string;
    filename: "journal-candidates.csv";
    csv_sha256: string;
    row_count: number;
    created_at: Date;
  },
): AccountingExportResponse {
  return {
    exportId: row.id,
    orderId,
    filename: row.filename,
    sha256: row.csv_sha256,
    rowCount: row.row_count,
    contentUrl: `/v1/workspaces/${workspaceId}/orders/${orderId}/accounting-exports/${row.id}/content`,
    createdAt: row.created_at.toISOString(),
  };
}

async function insertAudit(
  sql: postgres.TransactionSql,
  workspaceId: string,
  actorId: string,
  action: string,
  targetId: string,
  fieldNames: string[],
  before: Record<string, postgres.JSONValue>,
  after: Record<string, postgres.JSONValue>,
  reasonCode: string,
): Promise<void> {
  await sql`
    insert into audit_event (
      workspace_id, actor_id, action, target_type, target_id, field_names,
      redacted_changes, reason_code, approved_by
    ) values (
      ${workspaceId}, ${actorId}, ${action}, 'sales_order', ${targetId},
      ${fieldNames}, ${sql.json({ before, after })},
      ${reasonCode}, ${actorId}
    )
  `;
}

function hashPayload(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function normalizeOrderError(error: unknown): RepositoryError {
  if (error instanceof RepositoryError) return error;
  const code =
    typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  if (["23505", "23514", "23P01", "40001"].includes(code)) {
    return new RepositoryError("conflict", "The order operation conflicted with current data");
  }
  return new RepositoryError("database_error", "The order operation failed safely");
}
