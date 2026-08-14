import { createHash } from "node:crypto";
import postgres from "postgres";
import type {
  AdvanceP0WorkflowRequest,
  CreateSkuRequest,
  InventorySummary,
  P0WorkflowResponse,
  SkuResponse,
} from "@resale/contracts";
import { decideP0WorkflowAction, type P0WorkflowState } from "@resale/domain";

export type WorkspaceRole =
  "owner" | "inventory_manager" | "field_worker" | "shipping" | "accounting";

export interface RequestActor {
  identityId: string;
}

export interface WorkflowRepository {
  createSku(
    workspaceId: string,
    actor: RequestActor,
    input: CreateSkuRequest,
  ): Promise<SkuResponse>;
  inventorySummary(workspaceId: string, actor: RequestActor): Promise<InventorySummary>;
  advanceP0Workflow(
    workspaceId: string,
    skuId: string,
    actor: RequestActor,
    input: AdvanceP0WorkflowRequest,
  ): Promise<P0WorkflowResponse>;
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

function normalizeDatabaseError(error: unknown): RepositoryError {
  if (error instanceof RepositoryError) return error;
  if (typeof error === "object" && error && "code" in error && error.code === "23505") {
    return new RepositoryError("conflict", "The requested unique value already exists");
  }
  return new RepositoryError("database_error", "The database operation failed safely");
}
