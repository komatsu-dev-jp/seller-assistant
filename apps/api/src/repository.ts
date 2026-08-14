import postgres from "postgres";
import type { CreateSkuRequest, InventorySummary, SkuResponse } from "@resale/contracts";

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
): Promise<void> {
  const rows = await sql<Array<{ role: WorkspaceRole }>>`
    select role
    from workspace_membership
    where workspace_id = ${workspaceId} and identity_id = ${identityId} and active
  `;
  const membership = rows[0];
  if (!membership || !allowed.includes(membership.role)) {
    throw new RepositoryError("forbidden", "The actor does not have access to this operation");
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

function normalizeDatabaseError(error: unknown): RepositoryError {
  if (error instanceof RepositoryError) return error;
  if (typeof error === "object" && error && "code" in error && error.code === "23505") {
    return new RepositoryError("conflict", "The requested unique value already exists");
  }
  return new RepositoryError("database_error", "The database operation failed safely");
}
