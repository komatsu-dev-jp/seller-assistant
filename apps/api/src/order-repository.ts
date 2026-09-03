import { createHash, randomUUID } from "node:crypto";
import type {
  AccountingExportResponse,
  AddressLeaseResponse,
  AssignOrderRequest,
  CreateAccountingExportRequest,
  CreateAddressLeaseRequest,
  CreateOrderRequest,
  ConfirmOrderShippingReadinessRequest,
  ConfirmShippingPhotosRequest,
  EvaluateShippingPhotoPreflightRequest,
  FinancialSummaryResponse,
  InspectReturnRequest,
  OrderOperationResponse,
  OrderAssignmentResponse,
  OrderRegistrationResponse,
  OrderShippingMethodSelectionResponse,
  OrderShippingReadinessResponse,
  OverrideShippingPhotoDecisionRequest,
  PackOrderRequest,
  PickOrderRequest,
  QuarantineReturnRequest,
  ReturnOrderRequest,
  SaveShippingMethodRequest,
  SelectOrderShippingMethodRequest,
  ShipOrderRequest,
  ShippingMethodCatalogResponse,
  ShippingMethodOptionResponse,
  ShippingPhotoAssetResponse,
  ShippingPhotoConfirmationResponse,
  ShippingPhotoPolicyResponse,
  ShippingPhotoPreflightResponse,
  ShippingPhotoRole,
  ShippingTaskResponse,
  RecordOrderSaleAmountRequest,
  RecordOrderSaleAmountResponse,
  UpdateOrderRegistrationRequest,
  UpdateShippingPhotoPolicyRequest,
} from "@resale/contracts";
import {
  calculateFinancialsV1,
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
  encryptedAddress: EncryptedAddress | null;
  addressFingerprint: string | null;
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

export interface RegisterShippingPhotoRecord {
  assetId: string;
  role: ShippingPhotoRole;
  mimeType: "image/jpeg" | "image/png";
  sizeBytes: number;
  width: number;
  height: number;
  sha256: string;
  storageKey: string;
  idempotencyKey: string;
}

export interface PrivateShippingPhotoContent {
  assetId: string;
  orderId: string;
  skuId: string;
  photoRole: ShippingPhotoRole;
  storageKey: string;
  sha256: string;
  mimeType: "image/jpeg" | "image/png";
  sizeBytes: number;
  width: number;
  height: number;
  authorizedIdentityId: string;
  authorizedRole: "owner" | "inventory_manager" | "shipping";
  assignmentId: string | null;
  assignmentExpiresAt: string | null;
}

export interface AssignedLocationPhotoContent {
  displayStorageKey: string;
  displaySha256: string;
  mimeType: "image/jpeg" | "image/png";
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
  readAssignedLocationPhoto(
    workspaceId: string,
    orderId: string,
    inventoryUnitId: string,
    movementSequence: number,
    actor: RequestActor,
  ): Promise<AssignedLocationPhotoContent>;
  orderRegistration(
    workspaceId: string,
    orderId: string,
    actor: RequestActor,
  ): Promise<OrderRegistrationResponse>;
  updateOrderRegistration(
    workspaceId: string,
    orderId: string,
    actor: RequestActor,
    input: UpdateOrderRegistrationRequest,
  ): Promise<OrderRegistrationResponse>;
  shippingMethods(
    workspaceId: string,
    actor: RequestActor,
    salesChannelKey?: string,
  ): Promise<ShippingMethodCatalogResponse[]>;
  saveShippingMethod(
    workspaceId: string,
    actor: RequestActor,
    input: SaveShippingMethodRequest,
    generatedMethodId: string,
  ): Promise<ShippingMethodCatalogResponse>;
  shippingMethodOptions(
    workspaceId: string,
    orderId: string,
    actor: RequestActor,
  ): Promise<ShippingMethodOptionResponse[]>;
  selectShippingMethod(
    workspaceId: string,
    orderId: string,
    actor: RequestActor,
    input: SelectOrderShippingMethodRequest,
  ): Promise<OrderShippingMethodSelectionResponse>;
  shippingReadiness(
    workspaceId: string,
    orderId: string,
    actor: RequestActor,
  ): Promise<OrderShippingReadinessResponse>;
  confirmShippingReadiness(
    workspaceId: string,
    orderId: string,
    actor: RequestActor,
    input: ConfirmOrderShippingReadinessRequest,
  ): Promise<OrderShippingReadinessResponse>;
  shippingPhotoPolicy(
    workspaceId: string,
    actor: RequestActor,
  ): Promise<ShippingPhotoPolicyResponse | null>;
  updateShippingPhotoPolicy(
    workspaceId: string,
    actor: RequestActor,
    input: UpdateShippingPhotoPolicyRequest,
  ): Promise<ShippingPhotoPolicyResponse>;
  shippingPhotoPreflight(
    workspaceId: string,
    orderId: string,
    actor: RequestActor,
  ): Promise<ShippingPhotoPreflightResponse>;
  evaluateShippingPhotoPreflight(
    workspaceId: string,
    orderId: string,
    actor: RequestActor,
    input: EvaluateShippingPhotoPreflightRequest,
  ): Promise<ShippingPhotoPreflightResponse>;
  overrideShippingPhotoDecision(
    workspaceId: string,
    orderId: string,
    actor: RequestActor,
    input: OverrideShippingPhotoDecisionRequest,
  ): Promise<ShippingPhotoPreflightResponse>;
  registerShippingPhoto(
    workspaceId: string,
    orderId: string,
    actor: RequestActor,
    record: RegisterShippingPhotoRecord,
  ): Promise<ShippingPhotoAssetResponse>;
  readShippingPhoto(
    workspaceId: string,
    orderId: string,
    assetId: string,
    actor: RequestActor,
  ): Promise<PrivateShippingPhotoContent>;
  confirmShippingPhotos(
    workspaceId: string,
    orderId: string,
    actor: RequestActor,
    input: ConfirmShippingPhotosRequest,
  ): Promise<ShippingPhotoConfirmationResponse>;
  recordSaleAmount(
    workspaceId: string,
    orderId: string,
    actor: RequestActor,
    input: RecordOrderSaleAmountRequest,
  ): Promise<RecordOrderSaleAmountResponse>;
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
  address_mode: "anonymous" | "stored";
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

interface ShippingPhotoPolicyRow {
  id: string;
  mode: ShippingPhotoPolicyResponse["mode"];
  high_value_threshold_minor: number | null;
  revision: number;
  supersedes_id: string | null;
  idempotency_key: string;
  payload_hash: string;
  changed_by: string;
  changed_at: Date;
}

interface ShippingPhotoDecisionRow {
  id: string;
  sale_basis_id: string;
  sale_amount_state: ShippingPhotoPreflightResponse["saleAmountStatus"];
  decision_reason: NonNullable<ShippingPhotoPreflightResponse["decisionReason"]>;
  decision_state: "choice_required" | "capture_required" | "satisfied_without_photo";
  photo_required: boolean | null;
  revision: number;
  supersedes_id: string | null;
  idempotency_key: string;
  payload_hash: string;
  decided_at: Date;
}

interface ShippingPhotoAssetRow {
  id: string;
  order_id: string;
  sku_id: string;
  role: ShippingPhotoRole;
  original_sha256: string;
  original_storage_key: string;
  mime_type: "image/jpeg" | "image/png";
  size_bytes: number;
  width: number;
  height: number;
  payload_hash: string;
  captured_by: string;
  captured_at: Date;
}

interface ShippingPhotoConfirmationRow {
  id: string;
  decision_id: string;
  asset_ids: string[];
  payload_hash: string;
  confirmed_by: string;
  confirmed_at: Date;
}

interface OrderRegistrationRow {
  order_id: string;
  order_number: string;
  id: string;
  sales_channel_key: string;
  sales_channel_name: string;
  channel_transaction_id: string | null;
  buyer_display_name: string | null;
  revision: number;
  supersedes_id: string | null;
  payload_hash: string;
  changed_at: Date;
}

interface ShippingMethodCatalogRow {
  id: string;
  method_id: string;
  sales_channel_key: string;
  sales_channel_name: string;
  method_name: string;
  tracking_available: boolean;
  fee_minor: number;
  delivery_estimate: string | null;
  official_checked_on: string;
  official_reference_url: string | null;
  official_reference_note: string | null;
  active: boolean;
  revision: number;
  supersedes_id: string | null;
  payload_hash: string;
  changed_at: Date;
}

interface ShippingMethodOptionRow {
  method_id: string;
  catalog_revision_id: string;
  sales_channel_key: string;
  sales_channel_name: string;
  method_name: string;
  tracking_available: boolean;
  fee_minor: number;
  delivery_estimate: string | null;
  official_checked_on: string;
}

interface ShippingMethodSelectionRow extends ShippingMethodOptionRow {
  selection_id: string;
  order_id: string;
  selection_revision: number;
  selection_supersedes_id: string | null;
  payload_hash: string;
  selected_at: Date;
}

interface ShippingContextRow {
  order_id: string;
  order_number: string;
  registration_revision_id: string | null;
  registration_revision: number | null;
  sales_channel_key: string | null;
  sales_channel_name: string | null;
  channel_transaction_id_status: "present" | "missing" | "unregistered";
  sale_amount_status: "present" | "missing";
  selection_id: string | null;
  selection_revision: number | null;
  selection_supersedes_id: string | null;
  method_id: string | null;
  catalog_revision_id: string | null;
  method_name: string | null;
  tracking_available: boolean | null;
  selected_fee_minor: number | null;
  delivery_estimate: string | null;
  official_checked_on: string | null;
  selected_at: Date | null;
  missing_information: Array<"channel_transaction_id" | "sale_amount">;
  blocking_issues: Array<"order_registration" | "shipping_method">;
  confirmation_state: "required" | "confirmed" | "stale";
  confirmation_id: string | null;
  confirmation_at: Date | null;
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
        await setWorkspace(transaction, workspaceId, actor.identityId);
        const role = await requireRole(transaction, workspaceId, actor.identityId, [
          "owner",
          "inventory_manager",
        ]);
        await transaction`select lock_current_shipping_workspace()`;
        const replay = await operationReplay(
          transaction,
          workspaceId,
          "create",
          record.input.idempotencyKey,
          payloadHash,
        );
        if (replay) return replay;

        const hasOrderRegistration = Boolean(
          record.input.salesChannelKey && record.input.salesChannelName,
        );
        if (
          record.input.orderNumber === undefined &&
          (!hasOrderRegistration || record.input.shippingCostMinor !== null)
        ) {
          throw new RepositoryError(
            "conflict",
            "Server-numbered orders require a sales channel and later human shipping selection",
          );
        }
        if (hasOrderRegistration && record.input.shippingCostMinor !== null) {
          throw new RepositoryError(
            "conflict",
            "Registered orders record shipping cost from the human-selected method",
          );
        }
        if (!hasOrderRegistration && record.input.shippingCostMinor === null) {
          throw new RepositoryError(
            "conflict",
            "Legacy orders require a human-entered shipping cost",
          );
        }
        if (
          hasOrderRegistration &&
          (record.input.sellingFeeMinor !== null || record.input.packagingCostMinor !== null)
        ) {
          throw new RepositoryError(
            "conflict",
            "Registered orders must leave unconfirmed selling and packaging costs missing",
          );
        }
        if (
          !hasOrderRegistration &&
          (record.input.sellingFeeMinor === null || record.input.packagingCostMinor === null)
        ) {
          throw new RepositoryError(
            "conflict",
            "Legacy orders require human-entered selling and packaging costs",
          );
        }
        const storesAddress = record.input.addressMode === "stored";
        if (
          (storesAddress &&
            (record.input.shippingAddress === null ||
              record.encryptedAddress === null ||
              record.addressFingerprint === null)) ||
          (!storesAddress &&
            (record.input.shippingAddress !== null ||
              record.encryptedAddress !== null ||
              record.addressFingerprint !== null))
        ) {
          throw new RepositoryError("conflict", "The order address mode and storage disagree");
        }

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
        let orderNumber = record.input.orderNumber;
        if (!orderNumber) {
          const issued = await transaction<Array<{ order_number: string }>>`
            select issue_app_order_number() as order_number
          `;
          orderNumber = issued[0]?.order_number;
        }
        if (!orderNumber) {
          throw new RepositoryError(
            "database_error",
            "The application order number was not issued",
          );
        }
        await transaction`
          insert into sales_order (id, workspace_id, order_number, state, address_mode)
          values (
            ${record.orderId}, ${workspaceId}, ${orderNumber}, 'confirmed',
            ${record.input.addressMode}
          )
        `;
        if (record.input.salesChannelKey && record.input.salesChannelName) {
          const registrationPayload = {
            salesChannelKey: record.input.salesChannelKey,
            salesChannelName: record.input.salesChannelName,
            channelTransactionId: record.input.channelTransactionId ?? null,
            buyerDisplayName: record.input.buyerDisplayName ?? null,
          };
          await transaction`
            insert into order_registration_revision (
              workspace_id, order_id, sales_channel_key, sales_channel_name,
              channel_transaction_id, buyer_display_name, revision, supersedes_id,
              idempotency_key, payload_hash
            ) values (
              ${workspaceId}, ${record.orderId}, ${registrationPayload.salesChannelKey},
              ${registrationPayload.salesChannelName},
              ${registrationPayload.channelTransactionId},
              ${registrationPayload.buyerDisplayName}, 1, null,
              ${record.input.idempotencyKey}, ${hashPayload(registrationPayload)}
            )
          `;
        }
        if (record.encryptedAddress) {
          await transaction`
            insert into order_private_address (
              workspace_id, order_id, ciphertext, nonce, auth_tag, key_version, created_by
            ) values (
              ${workspaceId}, ${record.orderId}, ${record.encryptedAddress.ciphertext},
              ${record.encryptedAddress.nonce}, ${record.encryptedAddress.authTag},
              ${record.encryptedAddress.keyVersion}, ${actor.identityId}
            )
          `;
        }
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
          if (amount === null) continue;
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
          ["state", "inventory_unit_id", "address_mode"],
          { state: "absent", inventoryStatus: "available", addressMode: "absent" },
          {
            state: "confirmed",
            inventoryStatus: "reserved",
            addressMode: record.input.addressMode,
          },
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
        await setWorkspace(transaction, workspaceId, actor.identityId);
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
        await setWorkspace(transaction, workspaceId, actor.identityId);
        const role = await requireRole(transaction, workspaceId, actor.identityId, [
          "owner",
          "inventory_manager",
          "shipping",
        ]);
        const rows = await transaction<
          Array<{
            order_id: string;
            order_number: string;
            product_title: string;
            state: ShippingTaskResponse["state"];
            inventory_number: string;
            inventory_unit_id: string;
            sku_id: string;
            location_code: string;
            movement_sequence: number;
            location_photo_available: boolean;
            address_mode: ShippingTaskResponse["addressMode"];
            inventory_label_version: number;
            location_label_version: number;
            expires_at: Date | null;
          }>
        >`
          select orders.id as order_id, orders.order_number, sku.title as product_title, orders.state,
                 unit.inventory_number, unit.id as inventory_unit_id, unit.sku_id,
                 location.code as location_code, unit.movement_seq::integer as movement_sequence,
                 exists (
                   select 1
                   from location_photo photo
                   where photo.workspace_id = unit.workspace_id
                     and photo.location_id = unit.location_id
                     and photo.review_state = 'approved'
                     and photo.gps_exif_count = 0
                     and photo.derivative_asset_id is not null
                     and photo.derivative_storage_key is not null
                     and photo.derivative_sha256 is not null
                     and photo.original_mime_type in ('image/jpeg', 'image/png')
                 ) as location_photo_available,
                 coalesce(orders.address_mode, 'stored') as address_mode,
                 item_label.version as inventory_label_version,
                 location_label.version as location_label_version, assignment.expires_at
          from sales_order orders
          left join lateral (
            select current_assignment.id, current_assignment.expires_at
            from order_assignment current_assignment
            where current_assignment.workspace_id = orders.workspace_id
              and current_assignment.order_id = orders.id
              and current_assignment.identity_id = ${actor.identityId}
              and current_assignment.revoked_at is null
              and current_assignment.starts_at <= statement_timestamp()
              and current_assignment.expires_at > statement_timestamp()
            order by current_assignment.expires_at asc, current_assignment.id
            limit 1
          ) assignment on true
          join order_allocation allocation
            on allocation.workspace_id = orders.workspace_id
           and allocation.order_id = orders.id
           and allocation.active
          join inventory_unit unit
            on unit.workspace_id = allocation.workspace_id and unit.id = allocation.inventory_unit_id
          join product_sku sku
            on sku.workspace_id = unit.workspace_id and sku.id = unit.sku_id
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
          where orders.workspace_id = ${workspaceId}
            and orders.state in ('confirmed', 'picking', 'packed')
            and (${role === "shipping"}::boolean = false or assignment.id is not null)
          order by assignment.expires_at nulls last, orders.order_number
        `;
        return rows.map((row) => ({
          orderId: row.order_id,
          orderNumber: row.order_number,
          productTitle: row.product_title,
          state: row.state,
          inventoryNumber: row.inventory_number,
          inventoryUnitId: row.inventory_unit_id,
          skuId: row.sku_id,
          locationCode: row.location_code,
          locationPhotoUrl: row.location_photo_available
            ? assignedLocationPhotoContentUrl(
                workspaceId,
                row.order_id,
                row.inventory_unit_id,
                row.movement_sequence,
              )
            : null,
          addressMode: row.address_mode,
          inventoryLabelVersion: row.inventory_label_version,
          locationLabelVersion: row.location_label_version,
          assignmentExpiresAt: row.expires_at?.toISOString() ?? null,
        }));
      });
    } catch (error) {
      throw normalizeOrderError(error);
    }
  }

  async readAssignedLocationPhoto(
    workspaceId: string,
    orderId: string,
    inventoryUnitId: string,
    movementSequence: number,
    actor: RequestActor,
  ): Promise<AssignedLocationPhotoContent> {
    try {
      return await this.sql.begin(async (transaction) => {
        await setWorkspace(transaction, workspaceId, actor.identityId);
        const rows = await transaction<
          Array<{
            derivative_storage_key: string;
            derivative_sha256: string;
            original_mime_type: "image/jpeg" | "image/png";
          }>
        >`
          select photo.derivative_storage_key, photo.derivative_sha256,
                 photo.original_mime_type
          from sales_order orders
          join workspace_membership membership
            on membership.workspace_id = orders.workspace_id
           and membership.identity_id = ${actor.identityId}
           and membership.active
           and membership.role in ('owner', 'inventory_manager', 'shipping')
          join order_allocation allocation
            on allocation.workspace_id = orders.workspace_id
           and allocation.order_id = orders.id
           and allocation.active
          join inventory_unit unit
            on unit.workspace_id = allocation.workspace_id
           and unit.id = allocation.inventory_unit_id
          join lateral (
            select location_photo.derivative_storage_key,
                   location_photo.derivative_sha256,
                   location_photo.original_mime_type
            from location_photo
            where location_photo.workspace_id = unit.workspace_id
              and location_photo.location_id = unit.location_id
              and location_photo.review_state = 'approved'
              and location_photo.gps_exif_count = 0
              and location_photo.derivative_asset_id is not null
              and location_photo.derivative_storage_key is not null
              and location_photo.derivative_sha256 is not null
              and location_photo.original_mime_type in ('image/jpeg', 'image/png')
            order by location_photo.reviewed_at desc, location_photo.id desc
            limit 1
          ) photo on true
          where orders.workspace_id = ${workspaceId}
            and orders.id = ${orderId}
            and orders.state in ('confirmed', 'picking', 'packed')
            and unit.id = ${inventoryUnitId}
            and unit.location_id is not null
            and unit.movement_seq = ${movementSequence}
            and (
              membership.role in ('owner', 'inventory_manager')
              or (
                membership.role = 'shipping'
                and exists (
                  select 1
                  from order_assignment assignment
                  where assignment.workspace_id = orders.workspace_id
                    and assignment.order_id = orders.id
                    and assignment.identity_id = membership.identity_id
                    and assignment.revoked_at is null
                    and assignment.starts_at <= statement_timestamp()
                    and assignment.expires_at > statement_timestamp()
                )
              )
            )
          limit 1
        `;
        const row = rows[0];
        if (!row) {
          throw new RepositoryError("forbidden", "The assigned location photo is unavailable");
        }
        return {
          displayStorageKey: row.derivative_storage_key,
          displaySha256: row.derivative_sha256,
          mimeType: row.original_mime_type,
        };
      });
    } catch (error) {
      throw normalizeOrderError(error);
    }
  }

  async orderRegistration(
    workspaceId: string,
    orderId: string,
    actor: RequestActor,
  ): Promise<OrderRegistrationResponse> {
    try {
      return await this.sql.begin(async (transaction) => {
        await setWorkspace(transaction, workspaceId, actor.identityId);
        await requireRole(transaction, workspaceId, actor.identityId, [
          "owner",
          "inventory_manager",
        ]);
        const rows = await currentOrderRegistration(transaction, workspaceId, orderId);
        const row = rows[0];
        if (!row) throw new RepositoryError("forbidden", "Order registration is unavailable");
        return toOrderRegistrationResponse(row);
      });
    } catch (error) {
      throw normalizeOrderError(error);
    }
  }

  async updateOrderRegistration(
    workspaceId: string,
    orderId: string,
    actor: RequestActor,
    input: UpdateOrderRegistrationRequest,
  ): Promise<OrderRegistrationResponse> {
    const payloadHash = hashPayload({ orderId, ...input });
    try {
      return await this.sql.begin(async (transaction) => {
        await setWorkspace(transaction, workspaceId, actor.identityId);
        await requireRole(transaction, workspaceId, actor.identityId, [
          "owner",
          "inventory_manager",
        ]);
        await transaction`select lock_current_shipping_workspace()`;
        const replay = await orderRegistrationByIdempotency(
          transaction,
          workspaceId,
          orderId,
          input.idempotencyKey,
        );
        if (replay[0]) {
          if (replay[0].payload_hash !== payloadHash) {
            throw new RepositoryError(
              "conflict",
              "The order registration idempotency key has another payload",
            );
          }
          return toOrderRegistrationResponse(replay[0]);
        }
        const current = (await currentOrderRegistration(transaction, workspaceId, orderId))[0];
        if (!current || current.revision !== input.expectedRevision) {
          throw new RepositoryError("conflict", "The order registration revision is stale");
        }
        const rows = await transaction<OrderRegistrationRow[]>`
          insert into order_registration_revision (
            workspace_id, order_id, sales_channel_key, sales_channel_name,
            channel_transaction_id, buyer_display_name, revision, supersedes_id,
            idempotency_key, payload_hash
          ) values (
            ${workspaceId}, ${orderId}, ${input.salesChannelKey}, ${input.salesChannelName},
            ${input.channelTransactionId}, ${input.buyerDisplayName}, ${current.revision + 1},
            ${current.id}, ${input.idempotencyKey}, ${payloadHash}
          )
          returning ${orderId}::uuid as order_id, ${current.order_number}::text as order_number,
                    id, sales_channel_key, sales_channel_name, channel_transaction_id,
                    buyer_display_name, revision, supersedes_id, payload_hash, changed_at
        `;
        const row =
          rows[0] ??
          (
            await orderRegistrationByIdempotency(
              transaction,
              workspaceId,
              orderId,
              input.idempotencyKey,
            )
          )[0];
        if (!row) throw new RepositoryError("database_error", "Order registration was not saved");
        return toOrderRegistrationResponse(row);
      });
    } catch (error) {
      throw normalizeOrderError(error);
    }
  }

  async shippingMethods(
    workspaceId: string,
    actor: RequestActor,
    salesChannelKey?: string,
  ): Promise<ShippingMethodCatalogResponse[]> {
    try {
      return await this.sql.begin(async (transaction) => {
        await setWorkspace(transaction, workspaceId, actor.identityId);
        await requireRole(transaction, workspaceId, actor.identityId, [
          "owner",
          "inventory_manager",
        ]);
        const rows = await transaction<ShippingMethodCatalogRow[]>`
          select method.id, method.method_id, method.sales_channel_key,
                 method.sales_channel_name, method.method_name, method.tracking_available,
                 method.fee_minor::integer as fee_minor, method.delivery_estimate,
                 method.official_checked_on::text as official_checked_on,
                 method.official_reference_url, method.official_reference_note,
                 method.active, method.revision, method.supersedes_id,
                 method.payload_hash, method.changed_at
          from shipping_method_catalog_revision method
          where method.workspace_id = ${workspaceId}
            and (${salesChannelKey ?? null}::text is null
              or method.sales_channel_key = ${salesChannelKey ?? null})
            and not exists (
              select 1 from shipping_method_catalog_revision successor
              where successor.workspace_id = method.workspace_id
                and successor.method_id = method.method_id
                and successor.supersedes_id = method.id
            )
          order by method.sales_channel_name, method.fee_minor, method.method_name
        `;
        return rows.map(toShippingMethodCatalogResponse);
      });
    } catch (error) {
      throw normalizeOrderError(error);
    }
  }

  async saveShippingMethod(
    workspaceId: string,
    actor: RequestActor,
    input: SaveShippingMethodRequest,
    generatedMethodId: string,
  ): Promise<ShippingMethodCatalogResponse> {
    const payloadHash = hashPayload(input);
    try {
      return await this.sql.begin(async (transaction) => {
        await setWorkspace(transaction, workspaceId, actor.identityId);
        await requireRole(transaction, workspaceId, actor.identityId, [
          "owner",
          "inventory_manager",
        ]);
        await transaction`select lock_current_shipping_workspace()`;
        let rows = await shippingMethodByIdempotency(
          transaction,
          workspaceId,
          input.idempotencyKey,
        );
        if (rows[0]) {
          if (rows[0].payload_hash !== payloadHash) {
            throw new RepositoryError(
              "conflict",
              "The shipping method idempotency key has another payload",
            );
          }
          return toShippingMethodCatalogResponse(rows[0]);
        }
        const methodId = input.methodId ?? generatedMethodId;
        const current = input.methodId
          ? (await currentShippingMethod(transaction, workspaceId, input.methodId))[0]
          : null;
        if ((current?.revision ?? null) !== input.expectedRevision) {
          throw new RepositoryError("conflict", "The shipping method revision is stale");
        }
        rows = await transaction<ShippingMethodCatalogRow[]>`
          insert into shipping_method_catalog_revision (
            workspace_id, method_id, sales_channel_key, sales_channel_name, method_name,
            tracking_available, fee_minor, delivery_estimate, official_checked_on,
            official_reference_url, official_reference_note, active, revision,
            supersedes_id, idempotency_key, payload_hash
          ) values (
            ${workspaceId}, ${methodId}, ${input.salesChannelKey}, ${input.salesChannelName},
            ${input.methodName}, ${input.trackingAvailable}, ${input.feeMinor},
            ${input.deliveryEstimate}, ${input.officialCheckedOn},
            ${input.officialReferenceUrl}, ${input.officialReferenceNote}, ${input.active},
            ${(current?.revision ?? 0) + 1}, ${current?.id ?? null},
            ${input.idempotencyKey}, ${payloadHash}
          )
          returning id, method_id, sales_channel_key, sales_channel_name, method_name,
                    tracking_available, fee_minor::integer as fee_minor, delivery_estimate,
                    official_checked_on::text as official_checked_on, official_reference_url,
                    official_reference_note, active, revision, supersedes_id, payload_hash,
                    changed_at
        `;
        if (!rows[0]) {
          rows = await shippingMethodByIdempotency(transaction, workspaceId, input.idempotencyKey);
        }
        const row = rows[0];
        if (!row) throw new RepositoryError("database_error", "Shipping method was not saved");
        return toShippingMethodCatalogResponse(row);
      });
    } catch (error) {
      throw normalizeOrderError(error);
    }
  }

  async shippingMethodOptions(
    workspaceId: string,
    orderId: string,
    actor: RequestActor,
  ): Promise<ShippingMethodOptionResponse[]> {
    try {
      return await this.sql.begin(async (transaction) => {
        await setWorkspace(transaction, workspaceId, actor.identityId);
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
        const rows = await transaction<ShippingMethodOptionRow[]>`
          select method_id, catalog_revision_id, sales_channel_key, sales_channel_name,
                 method_name, tracking_available, fee_minor::integer as fee_minor,
                 delivery_estimate, official_checked_on::text as official_checked_on
          from current_actor_shipping_method_options(${orderId})
        `;
        return rows.map(toShippingMethodOptionResponse);
      });
    } catch (error) {
      throw normalizeOrderError(error);
    }
  }

  async selectShippingMethod(
    workspaceId: string,
    orderId: string,
    actor: RequestActor,
    input: SelectOrderShippingMethodRequest,
  ): Promise<OrderShippingMethodSelectionResponse> {
    const payloadHash = hashPayload({ orderId, ...input });
    try {
      return await this.sql.begin(async (transaction) => {
        await setWorkspace(transaction, workspaceId, actor.identityId);
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
        let rows = await shippingMethodSelectionByIdempotency(
          transaction,
          orderId,
          input.idempotencyKey,
        );
        if (rows[0]) {
          if (rows[0].payload_hash !== payloadHash) {
            throw new RepositoryError(
              "conflict",
              "The shipping method selection idempotency key has another payload",
            );
          }
          return toOrderShippingMethodSelectionResponse(rows[0]);
        }
        await transaction`
          select record_order_shipping_method_selection(
            ${orderId}, ${input.methodId}, ${input.expectedSelectionRevision},
            ${input.idempotencyKey}, ${payloadHash}
          )
        `;
        rows = await shippingMethodSelectionByIdempotency(
          transaction,
          orderId,
          input.idempotencyKey,
        );
        const row = rows[0];
        if (!row) {
          throw new RepositoryError("database_error", "Shipping method selection was not saved");
        }
        return toOrderShippingMethodSelectionResponse(row);
      });
    } catch (error) {
      throw normalizeOrderError(error);
    }
  }

  async shippingReadiness(
    workspaceId: string,
    orderId: string,
    actor: RequestActor,
  ): Promise<OrderShippingReadinessResponse> {
    try {
      return await this.sql.begin(async (transaction) => {
        await setWorkspace(transaction, workspaceId, actor.identityId);
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
        return requireShippingReadiness(transaction, orderId);
      });
    } catch (error) {
      throw normalizeOrderError(error);
    }
  }

  async confirmShippingReadiness(
    workspaceId: string,
    orderId: string,
    actor: RequestActor,
    input: ConfirmOrderShippingReadinessRequest,
  ): Promise<OrderShippingReadinessResponse> {
    const payloadHash = hashPayload({ orderId, ...input });
    try {
      return await this.sql.begin(async (transaction) => {
        await setWorkspace(transaction, workspaceId, actor.identityId);
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
        const confirmations = await transaction<
          Array<{
            confirmation_id: string;
            confirmation_at: Date;
            confirmation_current: boolean;
          }>
        >`
          select confirmation_id, confirmation_at, confirmation_current
          from record_order_shipping_readiness_confirmation(
            ${orderId}, ${input.expectedRegistrationRevision},
            ${input.expectedSelectionRevision}, ${input.acknowledgedMissingInformation},
            ${input.idempotencyKey}, ${payloadHash}
          )
        `;
        const confirmation = confirmations[0];
        if (!confirmation) {
          throw new RepositoryError(
            "database_error",
            "Shipping readiness confirmation was not saved",
          );
        }
        const readiness = await requireShippingReadiness(transaction, orderId);
        return {
          ...readiness,
          humanConfirmation: {
            state: confirmation.confirmation_current ? "confirmed" : "stale",
            confirmationId: confirmation.confirmation_id,
            confirmedAt: confirmation.confirmation_at.toISOString(),
          },
        };
      });
    } catch (error) {
      throw normalizeOrderError(error);
    }
  }

  async shippingPhotoPolicy(
    workspaceId: string,
    actor: RequestActor,
  ): Promise<ShippingPhotoPolicyResponse | null> {
    try {
      return await this.sql.begin(async (transaction) => {
        await setWorkspace(transaction, workspaceId, actor.identityId);
        await requireRole(transaction, workspaceId, actor.identityId, ["owner"]);
        const rows = await currentShippingPhotoPolicy(transaction, workspaceId);
        return rows[0] ? toShippingPhotoPolicyResponse(rows[0]) : null;
      });
    } catch (error) {
      throw normalizeOrderError(error);
    }
  }

  async updateShippingPhotoPolicy(
    workspaceId: string,
    actor: RequestActor,
    input: UpdateShippingPhotoPolicyRequest,
  ): Promise<ShippingPhotoPolicyResponse> {
    const payloadHash = hashPayload(input);
    try {
      return await this.sql.begin(async (transaction) => {
        await setWorkspace(transaction, workspaceId, actor.identityId);
        await requireRole(transaction, workspaceId, actor.identityId, ["owner"]);
        await transaction`select lock_current_shipping_workspace()`;
        const replay = await transaction<ShippingPhotoPolicyRow[]>`
          select id, mode, high_value_threshold_minor::integer as high_value_threshold_minor,
                 revision, supersedes_id, idempotency_key, payload_hash, changed_by, changed_at
          from shipping_photo_policy_revision
          where workspace_id = ${workspaceId} and idempotency_key = ${input.idempotencyKey}
        `;
        if (replay[0]) {
          if (replay[0].payload_hash !== payloadHash) {
            throw new RepositoryError("conflict", "The policy idempotency key has another payload");
          }
          return toShippingPhotoPolicyResponse(replay[0]);
        }
        const [current] = await currentShippingPhotoPolicy(transaction, workspaceId);
        if ((current?.revision ?? null) !== input.expectedRevision) {
          throw new RepositoryError("conflict", "The shipping photo policy revision is stale");
        }
        const rows = await transaction<ShippingPhotoPolicyRow[]>`
          insert into shipping_photo_policy_revision (
            workspace_id, mode, high_value_threshold_minor, revision, supersedes_id,
            idempotency_key, payload_hash
          ) values (
            ${workspaceId}, ${input.mode}, ${input.highValueThresholdMinor},
            ${(current?.revision ?? 0) + 1}, ${current?.id ?? null},
            ${input.idempotencyKey}, ${payloadHash}
          )
          returning id, mode, high_value_threshold_minor::integer as high_value_threshold_minor,
                    revision, supersedes_id, idempotency_key, payload_hash, changed_by, changed_at
        `;
        const row = rows[0];
        if (!row)
          throw new RepositoryError("database_error", "Shipping photo policy was not saved");
        await insertAudit(
          transaction,
          workspaceId,
          actor.identityId,
          "shipping.photo_policy.changed",
          row.id,
          ["mode", "high_value_threshold_minor", "revision"],
          { revision: current?.revision ?? null },
          { mode: row.mode, revision: row.revision },
          "shipping_photo_policy_human_confirmed",
        );
        return toShippingPhotoPolicyResponse(row);
      });
    } catch (error) {
      throw normalizeOrderError(error);
    }
  }

  async shippingPhotoPreflight(
    workspaceId: string,
    orderId: string,
    actor: RequestActor,
  ): Promise<ShippingPhotoPreflightResponse> {
    try {
      return await this.sql.begin(async (transaction) => {
        await setWorkspace(transaction, workspaceId, actor.identityId);
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
        return buildShippingPhotoPreflight(transaction, workspaceId, orderId);
      });
    } catch (error) {
      throw normalizeOrderError(error);
    }
  }

  async evaluateShippingPhotoPreflight(
    workspaceId: string,
    orderId: string,
    actor: RequestActor,
    input: EvaluateShippingPhotoPreflightRequest,
  ): Promise<ShippingPhotoPreflightResponse> {
    return this.recordShippingPhotoDecision(
      workspaceId,
      orderId,
      actor,
      input.expectedDecisionRevision,
      input.idempotencyKey,
      null,
    );
  }

  async overrideShippingPhotoDecision(
    workspaceId: string,
    orderId: string,
    actor: RequestActor,
    input: OverrideShippingPhotoDecisionRequest,
  ): Promise<ShippingPhotoPreflightResponse> {
    return this.recordShippingPhotoDecision(
      workspaceId,
      orderId,
      actor,
      input.expectedDecisionRevision,
      input.idempotencyKey,
      input.choice,
    );
  }

  async registerShippingPhoto(
    workspaceId: string,
    orderId: string,
    actor: RequestActor,
    record: RegisterShippingPhotoRecord,
  ): Promise<ShippingPhotoAssetResponse> {
    const payloadHash = hashPayload({
      orderId,
      role: record.role,
      mimeType: record.mimeType,
      sizeBytes: record.sizeBytes,
      width: record.width,
      height: record.height,
      sha256: record.sha256,
    });
    try {
      return await this.sql.begin(async (transaction) => {
        await setWorkspace(transaction, workspaceId, actor.identityId);
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
        const existing = await shippingPhotoAssetByIdempotency(
          transaction,
          workspaceId,
          orderId,
          record.idempotencyKey,
        );
        if (existing[0]) {
          if (existing[0].payload_hash !== payloadHash) {
            throw new RepositoryError("conflict", "The photo idempotency key has another payload");
          }
          return toShippingPhotoAssetResponse(existing[0]);
        }
        let rows: ShippingPhotoAssetRow[] = await transaction<ShippingPhotoAssetRow[]>`
          insert into shipping_photo_asset (
            id, workspace_id, order_id, role, original_sha256, original_storage_key,
            mime_type, size_bytes, width, height, upload_idempotency_key, payload_hash
          ) values (
            ${record.assetId}, ${workspaceId}, ${orderId}, ${record.role}, ${record.sha256},
            ${record.storageKey}, ${record.mimeType}, ${record.sizeBytes}, ${record.width},
            ${record.height}, ${record.idempotencyKey}, ${payloadHash}
          )
          on conflict (workspace_id, order_id, upload_idempotency_key) do nothing
          returning id, order_id, sku_id, role, original_sha256, original_storage_key, mime_type,
                    size_bytes::integer as size_bytes, width, height, payload_hash,
                    captured_by, captured_at
        `;
        const inserted = rows[0] !== undefined;
        if (!rows[0]) {
          rows = await shippingPhotoAssetByIdempotency(
            transaction,
            workspaceId,
            orderId,
            record.idempotencyKey,
          );
        }
        const row = rows[0];
        if (!row || row.payload_hash !== payloadHash) {
          throw new RepositoryError("conflict", "The photo idempotency key has another payload");
        }
        if (inserted) {
          await insertAudit(
            transaction,
            workspaceId,
            actor.identityId,
            "shipping.photo.captured",
            row.id,
            ["order_id", "role", "mime_type", "size_bytes"],
            { photo: "absent" },
            { orderId, role: row.role, sizeBytes: row.size_bytes },
            "private_shipping_photo_human_captured",
          );
        }
        return toShippingPhotoAssetResponse(row);
      });
    } catch (error) {
      throw normalizeOrderError(error);
    }
  }

  async readShippingPhoto(
    workspaceId: string,
    orderId: string,
    assetId: string,
    actor: RequestActor,
  ): Promise<PrivateShippingPhotoContent> {
    try {
      return await this.sql.begin(async (transaction) => {
        await setWorkspace(transaction, workspaceId, actor.identityId);
        const role = await requireRole(transaction, workspaceId, actor.identityId, [
          "owner",
          "inventory_manager",
          "shipping",
        ]);
        const assignment = await requireOrderAssignmentIfShipping(
          transaction,
          workspaceId,
          orderId,
          actor.identityId,
          role,
        );
        const rows = await transaction<ShippingPhotoAssetRow[]>`
          select id, order_id, sku_id, role, original_sha256, original_storage_key, mime_type,
                 size_bytes::integer as size_bytes, width, height, payload_hash,
                 captured_by, captured_at
          from shipping_photo_asset
          where workspace_id = ${workspaceId} and order_id = ${orderId} and id = ${assetId}
        `;
        const row = rows[0];
        if (!row) throw new RepositoryError("forbidden", "The shipping photo is unavailable");
        return {
          assetId: row.id,
          orderId: row.order_id,
          skuId: row.sku_id,
          photoRole: row.role,
          storageKey: row.original_storage_key,
          sha256: row.original_sha256,
          mimeType: row.mime_type,
          sizeBytes: row.size_bytes,
          width: row.width,
          height: row.height,
          authorizedIdentityId: actor.identityId,
          authorizedRole: role as PrivateShippingPhotoContent["authorizedRole"],
          assignmentId: assignment?.assignmentId ?? null,
          assignmentExpiresAt: assignment?.expiresAt.toISOString() ?? null,
        };
      });
    } catch (error) {
      throw normalizeOrderError(error);
    }
  }

  async confirmShippingPhotos(
    workspaceId: string,
    orderId: string,
    actor: RequestActor,
    input: ConfirmShippingPhotosRequest,
  ): Promise<ShippingPhotoConfirmationResponse> {
    const canonicalAssetIds = [...input.assetIds].sort();
    const payloadHash = hashPayload({ ...input, assetIds: canonicalAssetIds });
    try {
      return await this.sql.begin(async (transaction) => {
        await setWorkspace(transaction, workspaceId, actor.identityId);
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
        let rows = await shippingPhotoConfirmationByIdempotency(
          transaction,
          workspaceId,
          orderId,
          input.idempotencyKey,
        );
        if (rows[0]) {
          if (rows[0].payload_hash !== payloadHash) {
            throw new RepositoryError(
              "conflict",
              "The photo confirmation idempotency key has another payload",
            );
          }
          return toShippingPhotoConfirmationResponse(orderId, rows[0]);
        }
        const [decision] = await currentShippingPhotoDecision(transaction, workspaceId, orderId);
        if (!decision) {
          throw new RepositoryError("conflict", "A shipping photo decision is required first");
        }
        rows = await transaction<ShippingPhotoConfirmationRow[]>`
          insert into shipping_photo_confirmation (
            workspace_id, order_id, decision_id, asset_ids, idempotency_key, payload_hash
          ) values (
            ${workspaceId}, ${orderId}, ${decision.id}, ${canonicalAssetIds},
            ${input.idempotencyKey}, ${payloadHash}
          )
          on conflict (workspace_id, order_id, idempotency_key) do nothing
          returning id, decision_id, asset_ids, payload_hash, confirmed_by, confirmed_at
        `;
        const inserted = rows[0] !== undefined;
        if (!rows[0]) {
          rows = await shippingPhotoConfirmationByIdempotency(
            transaction,
            workspaceId,
            orderId,
            input.idempotencyKey,
          );
        }
        const row = rows[0];
        if (!row || row.payload_hash !== payloadHash) {
          throw new RepositoryError(
            "conflict",
            "The photo confirmation idempotency key has another payload",
          );
        }
        if (inserted) {
          await insertAudit(
            transaction,
            workspaceId,
            actor.identityId,
            "shipping.photos.confirmed",
            row.id,
            ["order_id", "decision_id", "asset_ids"],
            { confirmation: "absent" },
            { orderId, assetCount: row.asset_ids.length },
            "shipping_photo_set_human_confirmed",
          );
        }
        return toShippingPhotoConfirmationResponse(orderId, row);
      });
    } catch (error) {
      throw normalizeOrderError(error);
    }
  }

  async recordSaleAmount(
    workspaceId: string,
    orderId: string,
    actor: RequestActor,
    input: RecordOrderSaleAmountRequest,
  ): Promise<RecordOrderSaleAmountResponse> {
    const payloadHash = hashPayload({ orderId, ...input, actorId: actor.identityId });
    const operation = "order_sale_amount";
    try {
      return await this.sql.begin(async (transaction) => {
        await setWorkspace(transaction, workspaceId, actor.identityId);
        await requireRole(transaction, workspaceId, actor.identityId, [
          "owner",
          "inventory_manager",
        ]);
        await transaction`select lock_current_shipping_workspace()`;
        const replay = await transaction<
          Array<{
            payload_hash: string;
            event_id: string;
            amount_minor: number;
            created_at: Date;
          }>
        >`
          select record.payload_hash, event.id as event_id,
                 event.amount_minor::integer as amount_minor, record.created_at
          from idempotency_record record
          join financial_event event
            on event.workspace_id = record.workspace_id
           and event.id = record.result_reference_id
          where record.workspace_id = ${workspaceId}
            and record.operation = ${operation}
            and record.idempotency_key = ${input.idempotencyKey}
        `;
        if (replay[0]) {
          if (replay[0].payload_hash !== payloadHash) {
            throw new RepositoryError(
              "conflict",
              "The sale amount idempotency key has another payload",
            );
          }
          return {
            orderId,
            financialEventId: replay[0].event_id,
            saleAmountMinor: replay[0].amount_minor,
            recordedBy: actor.identityId,
            recordedAt: replay[0].created_at.toISOString(),
          };
        }
        const mutableOrders = await transaction<Array<{ id: string }>>`
          select id from sales_order
          where workspace_id = ${workspaceId} and id = ${orderId}
            and state in ('confirmed', 'picking', 'packed')
          for update
        `;
        if (!mutableOrders[0]) {
          throw new RepositoryError(
            "conflict",
            "Sale amount can only be recorded before the order is shipped or cancelled",
          );
        }
        const existingSales = await transaction<Array<{ event_count: number }>>`
          select count(*)::integer as event_count
          from financial_event event
          where event.workspace_id = ${workspaceId} and event.order_id = ${orderId}
            and event.event_type = 'sale'
        `;
        if ((existingSales[0]?.event_count ?? 0) > 0) {
          throw new RepositoryError(
            "conflict",
            "A sale amount already exists; use the accounting adjustment workflow",
          );
        }
        const order = await requireOrderUnit(transaction, workspaceId, orderId);
        const saleEventId = randomUUID();
        await transaction`
          insert into financial_event (
            id, workspace_id, sku_id, order_id, event_type, amount_minor, currency,
            tax_basis, bearer, source, source_meaning, rounding_rule_version,
            source_already_net, occurred_at
          ) values (
            ${saleEventId}, ${workspaceId}, ${order.sku_id}, ${orderId}, 'sale',
            ${input.saleAmountMinor}, 'JPY', ${input.taxBasis}, 'channel', 'manual',
            ${input.sourceMeaning}, 'jpy-v1', false, ${input.occurredAt}
          )
        `;
        const recorded = await transaction<Array<{ created_at: Date }>>`
          insert into idempotency_record (
            workspace_id, operation, idempotency_key, payload_hash, result_reference_id
          ) values (
            ${workspaceId}, ${operation}, ${input.idempotencyKey}, ${payloadHash}, ${saleEventId}
          )
          returning created_at
        `;
        const recordedAt = recorded[0]?.created_at;
        if (!recordedAt)
          throw new RepositoryError("database_error", "Sale amount was not recorded");
        await insertAudit(
          transaction,
          workspaceId,
          actor.identityId,
          "order.sale_amount.recorded",
          saleEventId,
          ["order_id", "event_type", "amount_minor"],
          { saleAmount: "missing" },
          { saleAmount: "human_recorded" },
          "sale_amount_human_confirmed",
        );
        return {
          orderId,
          financialEventId: saleEventId,
          saleAmountMinor: input.saleAmountMinor,
          recordedBy: actor.identityId,
          recordedAt: recordedAt.toISOString(),
        };
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
        await setWorkspace(transaction, workspaceId, actor.identityId);
        const role = await requireRole(transaction, workspaceId, actor.identityId, [
          "owner",
          "inventory_manager",
          "shipping",
        ]);
        const assignment = await requireOrderAssignmentIfShipping(
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
                   coalesce(${assignment?.expiresAt ?? null}, statement_timestamp() + interval '5 minutes')
                 )
          where exists (
            select 1 from sales_order orders
            where orders.workspace_id = ${workspaceId} and orders.id = ${orderId}
              and orders.state in ('confirmed', 'picking', 'packed')
              and coalesce(orders.address_mode, 'stored') = 'stored'
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
        await setWorkspace(transaction, workspaceId, actor.identityId);
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
          join sales_order orders
            on orders.workspace_id = lease.workspace_id and orders.id = lease.order_id
          where lease.workspace_id = ${workspaceId} and lease.order_id = ${orderId}
            and lease.id = ${leaseId} and lease.identity_id = ${actor.identityId}
            and lease.issued_by = ${actor.identityId}
            and lease.purpose = 'shipping_label' and lease.expires_at > clock_timestamp()
            and coalesce(orders.address_mode, 'stored') = 'stored'
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
          addressRequired: order.address_mode === "stored",
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
        const legacyPackedRecovery =
          order.order_state === "packed" && order.inventory_status === "packed";
        if (legacyPackedRecovery) {
          if (order.address_mode === "stored" && !leaseActive) {
            throw new RepositoryError(
              "conflict",
              "Pack recovery requires an active shipping address lease",
            );
          }
          await transaction`
            insert into packing_evidence (workspace_id, order_id)
            values (${workspaceId}, ${orderId})
          `;
          return { state: "packed" as const, inventoryStatus: "packed" as const };
        }
        const violations = validateOrderTransition({
          from: order.order_state,
          to: "packed",
          actorRole: role,
          hasActiveAllocation: true,
          hasConfirmedPickScan: order.inventory_status === "picked",
          hasPackingEvidence: true,
          addressRequired: order.address_mode === "stored",
          addressLeaseActive: leaseActive,
        });
        if (violations.length > 0) {
          throw new RepositoryError("conflict", `Pack rejected: ${violations.join(",")}`);
        }
        await transaction`
          insert into packing_evidence (workspace_id, order_id)
          values (${workspaceId}, ${orderId})
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
          addressRequired: order.address_mode === "stored",
          addressLeaseActive: leaseActive,
        });
        if (violations.length > 0) {
          throw new RepositoryError("conflict", `Ship rejected: ${violations.join(",")}`);
        }
        await transaction`
          insert into shipment_human_confirmation (
            workspace_id, order_id, idempotency_key, payload_hash,
            shipping_method_selection_id, readiness_confirmation_id, shipped_at
          ) values (
            ${workspaceId}, ${orderId}, ${input.idempotencyKey},
            ${hashPayload({ orderId, ...input, actorId: actor.identityId })},
            ${input.shippingMethodSelectionId ?? null},
            ${input.readinessConfirmationId ?? null},
            ${input.shippedAt ?? null}
          )
        `;
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
          addressRequired: order.address_mode === "stored",
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
            ${workspaceId}, ${orderId}, ${order.inventory_unit_id},
            ${input.resolution === "restock" ? "restock" : "disposal_pending"},
            ${actor.identityId}, ${input.inspectedAt}
          )
        `;
        return {
          state: "returned" as const,
          inventoryStatus:
            input.resolution === "restock" ? ("available" as const) : ("disposal_pending" as const),
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
        await setWorkspace(transaction, workspaceId, actor.identityId);
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
        await setWorkspace(transaction, workspaceId, actor.identityId);
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
        await setWorkspace(transaction, workspaceId, actor.identityId);
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

  private async recordShippingPhotoDecision(
    workspaceId: string,
    orderId: string,
    actor: RequestActor,
    expectedDecisionRevision: number | null,
    idempotencyKey: string,
    overrideChoice: "use_photos" | "skip_photos" | null,
  ): Promise<ShippingPhotoPreflightResponse> {
    const payloadHash = hashPayload({
      orderId,
      expectedDecisionRevision,
      idempotencyKey,
      overrideChoice,
      humanConfirmed: true,
      actorId: actor.identityId,
    });
    try {
      return await this.sql.begin(async (transaction) => {
        await setWorkspace(transaction, workspaceId, actor.identityId);
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
        await transaction`select lock_current_shipping_workspace()`;
        const lockedOrders = await transaction<Array<{ id: string }>>`
          select id from sales_order
          where workspace_id = ${workspaceId} and id = ${orderId}
          for update
        `;
        if (!lockedOrders[0]) {
          throw new RepositoryError("forbidden", "The shipping order is unavailable");
        }
        const replay = await transaction<ShippingPhotoDecisionRow[]>`
          select id, sale_basis_id, sale_amount_state, decision_reason, decision_state, photo_required,
                 revision, supersedes_id, idempotency_key, payload_hash, decided_at
          from order_shipping_photo_decision
          where workspace_id = ${workspaceId} and order_id = ${orderId}
            and idempotency_key = ${idempotencyKey}
        `;
        if (replay[0]) {
          if (replay[0].payload_hash !== payloadHash) {
            throw new RepositoryError(
              "conflict",
              "The shipping photo decision idempotency key has another payload",
            );
          }
          return buildShippingPhotoPreflight(transaction, workspaceId, orderId);
        }

        const [current] = await currentShippingPhotoDecision(transaction, workspaceId, orderId);
        if ((current?.revision ?? null) !== expectedDecisionRevision) {
          throw new RepositoryError("conflict", "The shipping photo decision revision is stale");
        }
        let rows = await transaction<ShippingPhotoDecisionRow[]>`
          insert into order_shipping_photo_decision (
            workspace_id, order_id, sale_amount_state, decision_reason, override_choice,
            decision_state, photo_required, revision, supersedes_id,
            idempotency_key, payload_hash
          ) values (
            ${workspaceId}, ${orderId}, 'missing', 'policy_missing', ${overrideChoice},
            'choice_required', null, ${(current?.revision ?? 0) + 1},
            ${current?.id ?? null}, ${idempotencyKey}, ${payloadHash}
          )
          on conflict (workspace_id, order_id, idempotency_key) do nothing
          returning id, sale_basis_id, sale_amount_state, decision_reason, decision_state, photo_required,
                    revision, supersedes_id, idempotency_key, payload_hash, decided_at
        `;
        if (!rows[0]) {
          rows = await transaction<ShippingPhotoDecisionRow[]>`
            select id, sale_basis_id, sale_amount_state, decision_reason, decision_state, photo_required,
                   revision, supersedes_id, idempotency_key, payload_hash, decided_at
            from order_shipping_photo_decision
            where workspace_id = ${workspaceId} and order_id = ${orderId}
              and idempotency_key = ${idempotencyKey}
          `;
        }
        const row = rows[0];
        if (!row || row.payload_hash !== payloadHash) {
          throw new RepositoryError(
            "conflict",
            "The shipping photo decision idempotency key has another payload",
          );
        }
        await insertAudit(
          transaction,
          workspaceId,
          actor.identityId,
          "shipping.photo_preflight.decided",
          row.id,
          ["order_id", "decision_state", "photo_required", "revision"],
          { revision: current?.revision ?? null },
          {
            orderId,
            decisionState: row.decision_state,
            photoRequired: row.photo_required,
            revision: row.revision,
          },
          overrideChoice === null
            ? "shipping_photo_policy_human_evaluated"
            : "shipping_photo_override_human_confirmed",
        );
        return buildShippingPhotoPreflight(transaction, workspaceId, orderId);
      });
    } catch (error) {
      throw normalizeOrderError(error);
    }
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
        await setWorkspace(transaction, workspaceId, actor.identityId);
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
        if (operation === "pack" || operation === "ship") {
          const lockedOrders = await transaction<Array<{ id: string }>>`
            select id from sales_order
            where workspace_id = ${workspaceId} and id = ${orderId}
            for update
          `;
          if (!lockedOrders[0]) {
            throw new RepositoryError("forbidden", "The allocated order is not available");
          }
          const lockedReplay = await operationReplay(
            transaction,
            workspaceId,
            operation,
            input.idempotencyKey,
            payloadHash,
          );
          if (lockedReplay) return lockedReplay;
        }
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
        const packedRecovery =
          operation === "pack" &&
          before.order_state === "packed" &&
          before.inventory_status === "packed";
        if (
          (operation === "pick" || operation === "pack" || operation === "ship") &&
          !packedRecovery
        ) {
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
            await setWorkspace(transaction, workspaceId, actor.identityId);
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

async function setWorkspace(
  sql: postgres.TransactionSql,
  workspaceId: string,
  identityId: string,
): Promise<void> {
  await sql`select set_config('app.workspace_id', ${workspaceId}, true)`;
  await sql`select set_config('app.identity_id', ${identityId}, true)`;
}

function currentShippingPhotoPolicy(
  sql: postgres.TransactionSql,
  workspaceId: string,
): Promise<ShippingPhotoPolicyRow[]> {
  return sql<ShippingPhotoPolicyRow[]>`
    select policy.id, policy.mode,
           policy.high_value_threshold_minor::integer as high_value_threshold_minor,
           policy.revision, policy.supersedes_id, policy.idempotency_key,
           policy.payload_hash, policy.changed_by, policy.changed_at
    from shipping_photo_policy_revision policy
    where policy.workspace_id = ${workspaceId}
      and not exists (
        select 1 from shipping_photo_policy_revision successor
        where successor.workspace_id = policy.workspace_id
          and successor.supersedes_id = policy.id
      )
    order by policy.revision desc
    limit 1
  `;
}

function currentShippingPhotoDecision(
  sql: postgres.TransactionSql,
  workspaceId: string,
  orderId: string,
): Promise<ShippingPhotoDecisionRow[]> {
  return sql<ShippingPhotoDecisionRow[]>`
    select decision.id, decision.sale_basis_id, decision.sale_amount_state, decision.decision_reason,
           decision.decision_state, decision.photo_required, decision.revision,
           decision.supersedes_id, decision.idempotency_key, decision.payload_hash,
           decision.decided_at
    from order_shipping_photo_decision decision
    where decision.workspace_id = ${workspaceId} and decision.order_id = ${orderId}
      and not exists (
        select 1 from order_shipping_photo_decision successor
        where successor.workspace_id = decision.workspace_id
          and successor.supersedes_id = decision.id
      )
    order by decision.revision desc
    limit 1
  `;
}

function shippingPhotoAssetByIdempotency(
  sql: postgres.TransactionSql,
  workspaceId: string,
  orderId: string,
  idempotencyKey: string,
): Promise<ShippingPhotoAssetRow[]> {
  return sql<ShippingPhotoAssetRow[]>`
    select id, order_id, sku_id, role, original_sha256, original_storage_key, mime_type,
           size_bytes::integer as size_bytes, width, height, payload_hash,
           captured_by, captured_at
    from shipping_photo_asset
    where workspace_id = ${workspaceId} and order_id = ${orderId}
      and upload_idempotency_key = ${idempotencyKey}
  `;
}

function shippingPhotoConfirmationByIdempotency(
  sql: postgres.TransactionSql,
  workspaceId: string,
  orderId: string,
  idempotencyKey: string,
): Promise<ShippingPhotoConfirmationRow[]> {
  return sql<ShippingPhotoConfirmationRow[]>`
    select id, decision_id, asset_ids, payload_hash, confirmed_by, confirmed_at
    from shipping_photo_confirmation
    where workspace_id = ${workspaceId} and order_id = ${orderId}
      and idempotency_key = ${idempotencyKey}
  `;
}

function toShippingPhotoPolicyResponse(row: ShippingPhotoPolicyRow): ShippingPhotoPolicyResponse {
  return {
    policyRevisionId: row.id,
    mode: row.mode,
    highValueThresholdMinor: row.high_value_threshold_minor,
    revision: row.revision,
    supersedesRevisionId: row.supersedes_id,
    changedBy: row.changed_by,
    changedAt: row.changed_at.toISOString(),
  };
}

function toShippingPhotoAssetResponse(row: ShippingPhotoAssetRow): ShippingPhotoAssetResponse {
  return {
    assetId: row.id,
    orderId: row.order_id,
    role: row.role,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    width: row.width,
    height: row.height,
    capturedBy: row.captured_by,
    capturedAt: row.captured_at.toISOString(),
  };
}

function toShippingPhotoConfirmationResponse(
  orderId: string,
  row: ShippingPhotoConfirmationRow,
): ShippingPhotoConfirmationResponse {
  return {
    confirmationId: row.id,
    orderId,
    decisionRevisionId: row.decision_id,
    assetIds: [...row.asset_ids],
    confirmedBy: row.confirmed_by,
    confirmedAt: row.confirmed_at.toISOString(),
  };
}

async function buildShippingPhotoPreflight(
  sql: postgres.TransactionSql,
  workspaceId: string,
  orderId: string,
): Promise<ShippingPhotoPreflightResponse> {
  const access = await sql<Array<{ allowed: boolean }>>`
    select can_actor_access_shipping_order(${orderId}) as allowed
  `;
  if (!access[0]?.allowed) {
    throw new RepositoryError("forbidden", "The shipping order is unavailable");
  }
  const orders = await sql<Array<{ created_at: Date }>>`
    select created_at from sales_order
    where workspace_id = ${workspaceId} and id = ${orderId}
  `;
  const order = orders[0];
  if (!order) throw new RepositoryError("forbidden", "The shipping order is unavailable");

  const [decision] = await currentShippingPhotoDecision(sql, workspaceId, orderId);
  if (decision) {
    const basisState = await sql<Array<{ current: boolean }>>`
      select current_actor_shipping_sale_basis_is_current(
        ${orderId}, ${decision.sale_basis_id}
      ) as current
    `;
    if (!basisState[0]?.current) {
      throw new RepositoryError(
        "conflict",
        "The shipping photo decision is out of date; review this order again",
      );
    }
  }
  const assets = await sql<ShippingPhotoAssetRow[]>`
    select id, order_id, sku_id, role, original_sha256, original_storage_key, mime_type,
           size_bytes::integer as size_bytes, width, height, payload_hash,
           captured_by, captured_at
    from shipping_photo_asset
    where workspace_id = ${workspaceId} and order_id = ${orderId}
    order by captured_at, id
  `;
  const confirmations = decision
    ? await sql<ShippingPhotoConfirmationRow[]>`
        select id, decision_id, asset_ids, payload_hash, confirmed_by, confirmed_at
        from shipping_photo_confirmation
        where workspace_id = ${workspaceId} and order_id = ${orderId}
          and decision_id = ${decision.id}
        order by confirmed_at desc, id desc
      `
    : [];
  const currentAssetIds = assets.map((asset) => asset.id).sort();
  const exactConfirmation = confirmations.find((confirmation) =>
    sameUuidList([...confirmation.asset_ids].sort(), currentAssetIds),
  );
  const packing = await sql<Array<{ confirmed_at: Date }>>`
    select confirmed_at from packing_evidence
    where workspace_id = ${workspaceId} and order_id = ${orderId} and server_confirmed
  `;
  const shipment = await sql<Array<{ confirmed_at: Date }>>`
    select confirmed_at from shipment_human_confirmation
    where workspace_id = ${workspaceId} and order_id = ${orderId}
  `;
  const sale = await sql<Array<{ present: boolean }>>`
    select exists (
      select 1 from financial_event event
      where event.workspace_id = ${workspaceId} and event.order_id = ${orderId}
        and event.event_type = 'sale' and event.reverses_event_id is null
        and not exists (
          select 1 from financial_event reversal
          where reversal.workspace_id = event.workspace_id
            and reversal.reverses_event_id = event.id
        )
    ) as present
  `;

  const hasBothRoles =
    assets.some((asset) => asset.role === "product") &&
    assets.some((asset) => asset.role === "packed_package");
  const state: ShippingPhotoPreflightResponse["state"] =
    !decision || decision.photo_required === null
      ? "choice_required"
      : decision.photo_required === false
        ? "satisfied_without_photo"
        : !hasBothRoles
          ? "capture_required"
          : exactConfirmation
            ? "confirmed"
            : "awaiting_confirmation";
  const updateTimes = [
    order.created_at,
    decision?.decided_at,
    ...assets.map((asset) => asset.captured_at),
    exactConfirmation?.confirmed_at,
    packing[0]?.confirmed_at,
    shipment[0]?.confirmed_at,
  ].filter((value): value is Date => value instanceof Date);
  const updatedAt = new Date(Math.max(...updateTimes.map((value) => value.getTime())));

  return {
    orderId,
    decisionRevisionId: decision?.id ?? null,
    decisionRevision: decision?.revision ?? null,
    state,
    photoRequired: decision?.photo_required ?? null,
    decisionReason: decision?.decision_reason ?? null,
    saleAmountStatus: decision?.sale_amount_state ?? (sale[0]?.present ? "present" : "missing"),
    assets: assets.map(toShippingPhotoAssetResponse),
    confirmedAssetIds: exactConfirmation ? [...exactConfirmation.asset_ids] : [],
    photoConfirmationId: exactConfirmation?.id ?? null,
    packingHumanConfirmed: Boolean(packing[0]),
    shipmentHumanConfirmed: Boolean(shipment[0]),
    updatedAt: updatedAt.toISOString(),
  };
}

function currentOrderRegistration(
  sql: postgres.TransactionSql,
  workspaceId: string,
  orderId: string,
): Promise<OrderRegistrationRow[]> {
  return sql<OrderRegistrationRow[]>`
    select registration.order_id, orders.order_number, registration.id,
           registration.sales_channel_key, registration.sales_channel_name,
           registration.channel_transaction_id, registration.buyer_display_name,
           registration.revision, registration.supersedes_id, registration.payload_hash,
           registration.changed_at
    from order_registration_revision registration
    join sales_order orders
      on orders.workspace_id = registration.workspace_id and orders.id = registration.order_id
    where registration.workspace_id = ${workspaceId} and registration.order_id = ${orderId}
      and not exists (
        select 1 from order_registration_revision successor
        where successor.workspace_id = registration.workspace_id
          and successor.order_id = registration.order_id
          and successor.supersedes_id = registration.id
      )
    order by registration.revision desc limit 1
  `;
}

function orderRegistrationByIdempotency(
  sql: postgres.TransactionSql,
  workspaceId: string,
  orderId: string,
  idempotencyKey: string,
): Promise<OrderRegistrationRow[]> {
  return sql<OrderRegistrationRow[]>`
    select registration.order_id, orders.order_number, registration.id,
           registration.sales_channel_key, registration.sales_channel_name,
           registration.channel_transaction_id, registration.buyer_display_name,
           registration.revision, registration.supersedes_id, registration.payload_hash,
           registration.changed_at
    from order_registration_revision registration
    join sales_order orders
      on orders.workspace_id = registration.workspace_id and orders.id = registration.order_id
    where registration.workspace_id = ${workspaceId} and registration.order_id = ${orderId}
      and registration.idempotency_key = ${idempotencyKey}
  `;
}

function toOrderRegistrationResponse(row: OrderRegistrationRow): OrderRegistrationResponse {
  return {
    orderId: row.order_id,
    orderNumber: row.order_number,
    registrationRevisionId: row.id,
    salesChannelKey: row.sales_channel_key,
    salesChannelName: row.sales_channel_name,
    channelTransactionId: row.channel_transaction_id,
    buyerDisplayName: row.buyer_display_name,
    revision: row.revision,
    supersedesRevisionId: row.supersedes_id,
    changedAt: row.changed_at.toISOString(),
  };
}

function currentShippingMethod(
  sql: postgres.TransactionSql,
  workspaceId: string,
  methodId: string,
): Promise<ShippingMethodCatalogRow[]> {
  return sql<ShippingMethodCatalogRow[]>`
    select method.id, method.method_id, method.sales_channel_key,
           method.sales_channel_name, method.method_name, method.tracking_available,
           method.fee_minor::integer as fee_minor, method.delivery_estimate,
           method.official_checked_on::text as official_checked_on,
           method.official_reference_url, method.official_reference_note,
           method.active, method.revision, method.supersedes_id,
           method.payload_hash, method.changed_at
    from shipping_method_catalog_revision method
    where method.workspace_id = ${workspaceId} and method.method_id = ${methodId}
      and not exists (
        select 1 from shipping_method_catalog_revision successor
        where successor.workspace_id = method.workspace_id
          and successor.method_id = method.method_id
          and successor.supersedes_id = method.id
      )
    order by method.revision desc limit 1
  `;
}

function shippingMethodByIdempotency(
  sql: postgres.TransactionSql,
  workspaceId: string,
  idempotencyKey: string,
): Promise<ShippingMethodCatalogRow[]> {
  return sql<ShippingMethodCatalogRow[]>`
    select method.id, method.method_id, method.sales_channel_key,
           method.sales_channel_name, method.method_name, method.tracking_available,
           method.fee_minor::integer as fee_minor, method.delivery_estimate,
           method.official_checked_on::text as official_checked_on,
           method.official_reference_url, method.official_reference_note,
           method.active, method.revision, method.supersedes_id,
           method.payload_hash, method.changed_at
    from shipping_method_catalog_revision method
    where method.workspace_id = ${workspaceId} and method.idempotency_key = ${idempotencyKey}
  `;
}

function toShippingMethodCatalogResponse(
  row: ShippingMethodCatalogRow,
): ShippingMethodCatalogResponse {
  return {
    methodId: row.method_id,
    catalogRevisionId: row.id,
    salesChannelKey: row.sales_channel_key,
    salesChannelName: row.sales_channel_name,
    methodName: row.method_name,
    trackingAvailable: row.tracking_available,
    feeMinor: row.fee_minor,
    deliveryEstimate: row.delivery_estimate,
    officialCheckedOn: row.official_checked_on,
    officialReferenceUrl: row.official_reference_url,
    officialReferenceNote: row.official_reference_note,
    active: row.active,
    revision: row.revision,
    supersedesRevisionId: row.supersedes_id,
    changedAt: row.changed_at.toISOString(),
  };
}

function toShippingMethodOptionResponse(
  row: ShippingMethodOptionRow,
): ShippingMethodOptionResponse {
  return {
    methodId: row.method_id,
    catalogRevisionId: row.catalog_revision_id,
    salesChannelKey: row.sales_channel_key,
    salesChannelName: row.sales_channel_name,
    methodName: row.method_name,
    trackingAvailable: row.tracking_available,
    feeMinor: row.fee_minor,
    deliveryEstimate: row.delivery_estimate,
    officialCheckedOn: row.official_checked_on,
  };
}

function shippingMethodSelectionByIdempotency(
  sql: postgres.TransactionSql,
  orderId: string,
  idempotencyKey: string,
): Promise<ShippingMethodSelectionRow[]> {
  return sql<ShippingMethodSelectionRow[]>`
    select selection_id, order_id, selection_revision, selection_supersedes_id,
           payload_hash, selected_at, method_id, catalog_revision_id,
           sales_channel_key, sales_channel_name, method_name, tracking_available,
           fee_minor::integer as fee_minor,
           delivery_estimate, official_checked_on::text as official_checked_on
    from current_actor_shipping_method_selection_by_idempotency(${orderId}, ${idempotencyKey})
  `;
}

function toOrderShippingMethodSelectionResponse(
  row: ShippingMethodSelectionRow,
): OrderShippingMethodSelectionResponse {
  return {
    selectionId: row.selection_id,
    orderId: row.order_id,
    revision: row.selection_revision,
    supersedesSelectionId: row.selection_supersedes_id,
    method: toShippingMethodOptionResponse(row),
    selectedAt: row.selected_at.toISOString(),
  };
}

function shippingContextRows(
  sql: postgres.TransactionSql,
  orderId: string,
): Promise<ShippingContextRow[]> {
  return sql<ShippingContextRow[]>`
    select order_id, order_number, registration_revision_id, registration_revision,
           sales_channel_key, sales_channel_name, channel_transaction_id_status,
           sale_amount_status, selection_id, selection_revision, selection_supersedes_id,
           method_id, catalog_revision_id, method_name, tracking_available,
           selected_fee_minor::integer as selected_fee_minor, delivery_estimate,
           official_checked_on::text as official_checked_on, selected_at,
           missing_information, blocking_issues, confirmation_state,
           confirmation_id, confirmation_at
    from current_actor_order_shipping_context(${orderId})
  `;
}

async function requireShippingReadiness(
  sql: postgres.TransactionSql,
  orderId: string,
): Promise<OrderShippingReadinessResponse> {
  const row = (await shippingContextRows(sql, orderId))[0];
  if (!row) throw new RepositoryError("forbidden", "Shipping readiness is unavailable");
  const selectedMethod =
    row.selection_id &&
    row.selection_revision &&
    row.method_id &&
    row.catalog_revision_id &&
    row.method_name &&
    row.tracking_available !== null &&
    row.selected_fee_minor !== null &&
    row.official_checked_on &&
    row.selected_at &&
    row.sales_channel_key &&
    row.sales_channel_name
      ? {
          selectionId: row.selection_id,
          orderId: row.order_id,
          revision: row.selection_revision,
          supersedesSelectionId: row.selection_supersedes_id,
          method: {
            methodId: row.method_id,
            catalogRevisionId: row.catalog_revision_id,
            salesChannelKey: row.sales_channel_key,
            salesChannelName: row.sales_channel_name,
            methodName: row.method_name,
            trackingAvailable: row.tracking_available,
            feeMinor: row.selected_fee_minor,
            deliveryEstimate: row.delivery_estimate,
            officialCheckedOn: row.official_checked_on,
          },
          selectedAt: row.selected_at.toISOString(),
        }
      : null;
  return {
    orderId: row.order_id,
    orderNumber: row.order_number,
    registrationRevision: row.registration_revision,
    salesChannel:
      row.sales_channel_key && row.sales_channel_name
        ? { key: row.sales_channel_key, name: row.sales_channel_name }
        : null,
    channelTransactionIdStatus: row.channel_transaction_id_status,
    saleAmountStatus: row.sale_amount_status,
    selectedMethod,
    missingInformation: row.missing_information,
    blockingIssues: row.blocking_issues,
    humanConfirmation: {
      state: row.confirmation_state,
      confirmationId: row.confirmation_id,
      confirmedAt: row.confirmation_at?.toISOString() ?? null,
    },
  };
}

function sameUuidList(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function assignedLocationPhotoContentUrl(
  workspaceId: string,
  orderId: string,
  inventoryUnitId: string,
  movementSequence: number,
): string {
  return `/v1/workspaces/${workspaceId}/orders/${orderId}/pick-location-photo/content?inventoryUnitId=${inventoryUnitId}&movementSequence=${movementSequence}`;
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
): Promise<{ assignmentId: string; expiresAt: Date } | null> {
  if (role !== "shipping") return null;
  const rows = await sql<Array<{ id: string; expires_at: Date }>>`
    select id, expires_at from order_assignment
    where workspace_id = ${workspaceId} and order_id = ${orderId}
      and identity_id = ${identityId} and revoked_at is null
      and starts_at <= statement_timestamp() and expires_at > statement_timestamp()
    order by expires_at asc limit 1
  `;
  const row = rows[0];
  if (!row) {
    throw new RepositoryError("forbidden", "The order is outside this shipping assignment");
  }
  return { assignmentId: row.id, expiresAt: row.expires_at };
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
           unit.movement_seq::integer as movement_seq, unit.sku_id,
           coalesce(sales_order.address_mode, 'stored') as address_mode
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
        and issued_by = ${identityId}
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
  const requiredTypes = ["sale", "cost", "fee", "shipping", "packaging"] as const;
  if (
    rows.length !== requiredTypes.length ||
    requiredTypes.some(
      (eventType) => rows.filter((event) => event.event_type === eventType).length !== 1,
    )
  )
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
  const zeroFact: MoneyFact = {
    ...sale,
    amountMinor: 0,
    sourceMeaning: "人が入力した取引に該当額なし",
  };
  const result = calculateFinancialsV1({
    orderPrice: sale,
    sellerDiscount: zeroFact,
    channelCoupon: zeroFact,
    sellerRevenueBeforeRefund: sale,
    successfulRefund: zeroFact,
    sourceRevenueAlreadyNetOfRefund: false,
    sellingFeeCharged: fact("fee", "seller"),
    sellingFeeRefund: zeroFact,
    promotionCost: zeroFact,
    sellerShipping: fact("shipping", "seller"),
    packagingCost: fact("packaging", "seller"),
    returnDirectCost: zeroFact,
    costOfGoods: fact("cost", "seller"),
    costReturnedToInventory: zeroFact,
  });
  const skuId = events[0]?.sku_id;
  if (!skuId) throw new RepositoryError("conflict", "The order financial SKU is missing");
  const missingInputs = accountingSummaryMissingInputs(
    result.missing,
    events.some((event) => event.tax_basis === "unknown"),
  );
  return {
    workspaceId,
    orderId,
    skuId,
    saleAmountMinor: amount("sale"),
    costAmountMinor: amount("cost"),
    sellingFeeMinor: amount("fee"),
    shippingCostMinor: amount("shipping"),
    packagingCostMinor: amount("packaging"),
    netRevenueMinor: result.netProductSales ?? 0,
    contributionProfitMinor: result.transactionContribution,
    formulaVersion: result.formulaVersion,
    missingInputs,
    currency: "JPY",
    disclaimer: "運用分析の参考値です。会計上の売上・利益・所得・税額を示すものではありません。",
  };
}

type FinancialMissingInput = FinancialSummaryResponse["missingInputs"][number];

export function accountingSummaryMissingInputs(
  missingInputs: readonly FinancialMissingInput[],
  hasUnknownTaxBasis: boolean,
): FinancialMissingInput[] {
  const result = [...missingInputs];
  if (hasUnknownTaxBasis && !result.includes("taxBasis")) result.push("taxBasis");
  return result;
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
  if (code === "42501") {
    return new RepositoryError("forbidden", "The actor cannot access this shipping order");
  }
  return new RepositoryError("database_error", "The order operation failed safely");
}
