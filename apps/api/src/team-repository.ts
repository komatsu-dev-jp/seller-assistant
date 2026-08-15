import { randomUUID } from "node:crypto";
import type {
  CreateLocalMemberRequest,
  CreateTeamAssignmentRequest,
  RevokeTeamAssignmentRequest,
  TeamAssignmentResponse,
  TeamMemberResponse,
  TeamStateResponse,
} from "@resale/contracts";
import postgres from "postgres";

import { hashPassword } from "./auth.js";
import { RepositoryError, type RequestActor } from "./repository.js";

export interface TeamRepository {
  state(workspaceId: string, actor: RequestActor): Promise<TeamStateResponse>;
  createMember(
    workspaceId: string,
    actor: RequestActor,
    input: CreateLocalMemberRequest,
  ): Promise<TeamMemberResponse>;
  createAssignment(
    workspaceId: string,
    actor: RequestActor,
    input: CreateTeamAssignmentRequest,
  ): Promise<TeamAssignmentResponse>;
  revokeAssignment(
    workspaceId: string,
    assignmentId: string,
    actor: RequestActor,
    input: RevokeTeamAssignmentRequest,
  ): Promise<TeamAssignmentResponse>;
  close(): Promise<void>;
}

interface AssignmentRow {
  assignment_id: string;
  assignment_type: TeamAssignmentResponse["assignmentType"];
  identity_id: string;
  assignee_email: string;
  target_id: string;
  target_label: string;
  starts_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
}

export class PostgresTeamRepository implements TeamRepository {
  private readonly sql: postgres.Sql;

  constructor(databaseUrl: string) {
    this.sql = postgres(databaseUrl, {
      max: 4,
      idle_timeout: 20,
      connect_timeout: 10,
      transform: { undefined: null },
    });
  }

  async state(workspaceId: string, actor: RequestActor): Promise<TeamStateResponse> {
    try {
      return await this.sql.begin(async (transaction) => {
        await setWorkspace(transaction, workspaceId);
        await requireManager(transaction, workspaceId, actor.identityId);
        const members = await transaction<
          Array<{
            identity_id: string;
            email_normalized: string;
            role: TeamMemberResponse["role"];
            active: boolean;
          }>
        >`
          select membership.identity_id, credential.email_normalized, membership.role, membership.active
          from workspace_membership membership
          join auth_credential credential on credential.identity_id = membership.identity_id
          where membership.workspace_id = ${workspaceId}
          order by membership.active desc, membership.role, credential.email_normalized
        `;
        return {
          workspaceId,
          members: members.map((row) => ({
            identityId: row.identity_id,
            email: row.email_normalized,
            role: row.role,
            active: row.active,
          })),
          assignments: (await selectAssignments(transaction, workspaceId)).map(toAssignment),
        };
      });
    } catch (error) {
      throw normalizeTeamError(error);
    }
  }

  async createMember(
    workspaceId: string,
    actor: RequestActor,
    input: CreateLocalMemberRequest,
  ): Promise<TeamMemberResponse> {
    const identityId = randomUUID();
    const password = await hashPassword(input.initialPassword);
    try {
      return await this.sql.begin(async (transaction) => {
        await setWorkspace(transaction, workspaceId);
        const rows = await transaction<Array<{ identity_id: string }>>`
          select app_create_local_member(
            ${workspaceId}, ${actor.identityId}, ${identityId}, ${input.displayName}, ${input.email},
            ${input.role}, ${password.hash}, ${password.salt}, ${password.n}, ${password.r}, ${password.p}
          ) as identity_id
        `;
        if (rows[0]?.identity_id !== identityId) {
          throw new RepositoryError("database_error", "The local member was not created");
        }
        await insertAudit(
          transaction,
          workspaceId,
          actor.identityId,
          "team.member.created",
          identityId,
          ["email", "role"],
          "local_member_human_confirmed",
        );
        return { identityId, email: input.email, role: input.role, active: true };
      });
    } catch (error) {
      throw normalizeTeamError(error);
    }
  }

  async createAssignment(
    workspaceId: string,
    actor: RequestActor,
    input: CreateTeamAssignmentRequest,
  ): Promise<TeamAssignmentResponse> {
    try {
      return await this.sql.begin(async (transaction) => {
        await setWorkspace(transaction, workspaceId);
        const rows = await transaction<Array<{ assignment_id: string }>>`
          select app_create_team_assignment(
            ${workspaceId}, ${actor.identityId}, ${input.identityId}, ${input.assignmentType},
            ${input.targetId}, ${input.startsAt}, ${input.expiresAt}
          ) as assignment_id
        `;
        const assignmentId = rows[0]?.assignment_id;
        if (!assignmentId) {
          throw new RepositoryError("database_error", "The team assignment was not created");
        }
        await insertAudit(
          transaction,
          workspaceId,
          actor.identityId,
          "team.assignment.created",
          assignmentId,
          ["identity_id", "assignment_type", "target_id", "starts_at", "expires_at"],
          "team_assignment_human_confirmed",
        );
        const assignments = await selectAssignments(transaction, workspaceId, assignmentId);
        if (!assignments[0]) {
          throw new RepositoryError("database_error", "The team assignment cannot be read back");
        }
        return toAssignment(assignments[0]);
      });
    } catch (error) {
      throw normalizeTeamError(error);
    }
  }

  async revokeAssignment(
    workspaceId: string,
    assignmentId: string,
    actor: RequestActor,
    input: RevokeTeamAssignmentRequest,
  ): Promise<TeamAssignmentResponse> {
    try {
      return await this.sql.begin(async (transaction) => {
        await setWorkspace(transaction, workspaceId);
        await transaction`
          select app_revoke_team_assignment(
            ${workspaceId}, ${actor.identityId}, ${input.assignmentType}, ${assignmentId}
          )
        `;
        await insertAudit(
          transaction,
          workspaceId,
          actor.identityId,
          "team.assignment.revoked",
          assignmentId,
          ["revoked_at"],
          input.reasonCode,
        );
        const assignments = await selectAssignments(transaction, workspaceId, assignmentId);
        if (!assignments[0]) {
          throw new RepositoryError("database_error", "The revoked assignment cannot be read back");
        }
        return toAssignment(assignments[0]);
      });
    } catch (error) {
      throw normalizeTeamError(error);
    }
  }

  async close(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }
}

async function selectAssignments(
  sql: postgres.TransactionSql,
  workspaceId: string,
  assignmentId?: string,
): Promise<AssignmentRow[]> {
  return sql<AssignmentRow[]>`
    with assignments as (
      select assignment.id as assignment_id, 'capture'::text as assignment_type,
             assignment.identity_id, credential.email_normalized as assignee_email,
             assignment.sku_id as target_id, sku.sku_code as target_label,
             assignment.starts_at, assignment.expires_at, assignment.revoked_at
      from sku_work_assignment assignment
      join auth_credential credential on credential.identity_id = assignment.identity_id
      join product_sku sku
        on sku.workspace_id = assignment.workspace_id and sku.id = assignment.sku_id
      where assignment.workspace_id = ${workspaceId}
      union all
      select assignment.id, 'location_putaway', assignment.identity_id,
             credential.email_normalized, assignment.location_root_id, location.code,
             assignment.starts_at, assignment.expires_at, assignment.revoked_at
      from work_assignment assignment
      join auth_credential credential on credential.identity_id = assignment.identity_id
      join location_node location
        on location.workspace_id = assignment.workspace_id and location.id = assignment.location_root_id
      where assignment.workspace_id = ${workspaceId} and assignment.operation = 'putaway'
      union all
      select assignment.id, 'location_photo', assignment.identity_id,
             credential.email_normalized, assignment.location_root_id, location.code,
             assignment.starts_at, assignment.expires_at, assignment.revoked_at
      from work_assignment assignment
      join auth_credential credential on credential.identity_id = assignment.identity_id
      join location_node location
        on location.workspace_id = assignment.workspace_id and location.id = assignment.location_root_id
      where assignment.workspace_id = ${workspaceId} and assignment.operation = 'photo'
      union all
      select assignment.id, 'inventory_putaway', assignment.identity_id,
             credential.email_normalized, assignment.inventory_unit_id, unit.inventory_number,
             assignment.starts_at, assignment.expires_at, assignment.revoked_at
      from inventory_unit_assignment assignment
      join auth_credential credential on credential.identity_id = assignment.identity_id
      join inventory_unit unit
        on unit.workspace_id = assignment.workspace_id and unit.id = assignment.inventory_unit_id
      where assignment.workspace_id = ${workspaceId}
      union all
      select assignment.id, 'shipping', assignment.identity_id,
             credential.email_normalized, assignment.order_id, orders.order_number,
             assignment.starts_at, assignment.expires_at, assignment.revoked_at
      from order_assignment assignment
      join auth_credential credential on credential.identity_id = assignment.identity_id
      join sales_order orders
        on orders.workspace_id = assignment.workspace_id and orders.id = assignment.order_id
      where assignment.workspace_id = ${workspaceId}
    )
    select assignment_id, assignment_type, identity_id, assignee_email,
           target_id, target_label, starts_at, expires_at, revoked_at
    from assignments
    where (${assignmentId ?? null}::uuid is null or assignment_id = ${assignmentId ?? null}::uuid)
    order by revoked_at nulls first, expires_at desc
    limit 200
  `;
}

function toAssignment(row: AssignmentRow): TeamAssignmentResponse {
  return {
    assignmentId: row.assignment_id,
    assignmentType: row.assignment_type,
    identityId: row.identity_id,
    assigneeEmail: row.assignee_email,
    targetId: row.target_id,
    targetLabel: row.target_label,
    startsAt: row.starts_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
    revokedAt: row.revoked_at?.toISOString() ?? null,
  };
}

async function setWorkspace(sql: postgres.TransactionSql, workspaceId: string): Promise<void> {
  await sql`select set_config('app.workspace_id', ${workspaceId}, true)`;
}

async function requireManager(
  sql: postgres.TransactionSql,
  workspaceId: string,
  identityId: string,
): Promise<void> {
  const rows = await sql<Array<{ allowed: boolean }>>`
    select app_is_assignment_manager(${workspaceId}, ${identityId}, false) as allowed
  `;
  if (!rows[0]?.allowed) throw new RepositoryError("forbidden", "Team manager role is required");
}

async function insertAudit(
  sql: postgres.TransactionSql,
  workspaceId: string,
  actorId: string,
  action: string,
  targetId: string,
  fieldNames: string[],
  reasonCode: string,
): Promise<void> {
  await sql`
    insert into audit_event (
      workspace_id, actor_id, action, target_type, target_id,
      field_names, redacted_changes, reason_code, approved_by
    ) values (
      ${workspaceId}, ${actorId}, ${action}, 'team_assignment', ${targetId},
      ${fieldNames}, ${sql.json({
        before: action.endsWith("revoked") ? { access: "active" } : { record: "absent" },
        after: action.endsWith("revoked") ? { access: "revoked" } : { record: "created" },
      })}, ${reasonCode}, ${actorId}
    )
  `;
}

function normalizeTeamError(error: unknown): RepositoryError {
  if (error instanceof RepositoryError) return error;
  const message = error instanceof Error ? error.message : String(error);
  if (/role is required|active field worker/u.test(message)) {
    return new RepositoryError("forbidden", "The team role or assignee is not allowed");
  }
  if (/duplicate key|invalid assignment|unsupported|not found|overlap/u.test(message)) {
    return new RepositoryError("conflict", "The member or assignment conflicts with current data");
  }
  return new RepositoryError("database_error", "The team operation failed safely");
}
