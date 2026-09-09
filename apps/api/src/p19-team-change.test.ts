import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createTeamChangeRequestSchema,
  recordTeamChangeEventSchema,
  createLocationRequestSchema,
  locationNodeResponseSchema,
} from "@resale/contracts";

const id = "91111111-1111-4111-8111-111111111111";
const request = {
  assignmentId: id,
  assignmentType: "capture",
  expectedAssignmentVersion: "a".repeat(64),
  reasonCode: "assignment_changed",
  idempotencyKey: id,
  humanConfirmed: true,
};
const decision = {
  action: "approve",
  expectedRevision: 1,
  commentCode: "target_checked",
  idempotencyKey: id,
  humanConfirmed: true,
};

describe("P19 strict team-change and quarantine contracts", () => {
  it("requires a precise human-confirmed assignment snapshot and safe reason", () => {
    expect(createTeamChangeRequestSchema.safeParse(request).success).toBe(true);
    for (const patch of [
      { humanConfirmed: false },
      { expectedAssignmentVersion: undefined },
      { expectedAssignmentVersion: "bad" },
      { expectedStartsAt: "2026-09-09T00:00:00.000Z" },
      { reasonCode: "password=unsafe" },
      { before: { access: "active" } },
      { evidenceUrl: "https://example.test/private" },
    ])
      expect(createTeamChangeRequestSchema.safeParse({ ...request, ...patch }).success).toBe(false);
  });
  it("requires a revision and allowlisted comment for every append-only action", () => {
    for (const action of ["approve", "reject", "request_changes", "comment"])
      expect(recordTeamChangeEventSchema.safeParse({ ...decision, action }).success).toBe(true);
    for (const patch of [
      { expectedRevision: 0 },
      { commentCode: undefined },
      { comment: "secret" },
      { action: "delete" },
    ])
      expect(recordTeamChangeEventSchema.safeParse({ ...decision, ...patch }).success).toBe(false);
  });
  it("defaults legacy location creation only, never unknown response purpose", () => {
    const location = {
      parentId: null,
      code: "P19-TEST",
      name: "架空棚",
      canStoreInventory: true,
      singleItemOnly: false,
      allowMixedSku: true,
      maxUnits: 10,
      humanConfirmed: true,
    };
    expect(createLocationRequestSchema.safeParse(location).success).toBe(true);
    expect(
      createLocationRequestSchema.safeParse({ ...location, purpose: "return_quarantine" }).success,
    ).toBe(true);
    expect(
      createLocationRequestSchema.safeParse({
        ...location,
        purpose: "return_quarantine",
        canStoreInventory: false,
      }).success,
    ).toBe(false);
    expect(locationNodeResponseSchema.shape.purpose.safeParse(undefined).success).toBe(false);
    expect(locationNodeResponseSchema.shape.purpose.safeParse("general").success).toBe(true);
  });
});

describe("P19 database authority boundaries", () => {
  const teamSql = readFileSync(
    new URL(
      "../../../packages/db/migrations/0043_team_assignment_change_approval.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const quarantineSql = readFileSync(
    new URL(
      "../../../packages/db/migrations/0044_return_quarantine_location_purpose.sql",
      import.meta.url,
    ),
    "utf8",
  );
  it("locks target/version and decisions and grants no history mutation", () => {
    expect(teamSql).toContain("source.requester_id = requested_actor");
    expect(teamSql).toContain("source.revision <> expected_revision");
    expect(teamSql).toContain("source.target_version");
    expect(teamSql).toContain("for update");
    expect(teamSql).toContain("pg_advisory_xact_lock");
    expect(teamSql).toContain("payload_hash <> fingerprint");
    expect(teamSql).toContain("force row level security");
    expect(teamSql).not.toMatch(/grant[^;]*(?:update|delete|insert)[^;]*team_assignment_change/iu);
    expect(teamSql).not.toMatch(/grant[^;]*on app_identity/iu);
  });
  it("keeps ordinary stock away from quarantine and restock awaiting a general scan", () => {
    expect(quarantineSql).toContain("default 'general'");
    expect(quarantineSql).toContain("new.operation='return_quarantine'");
    expect(quarantineSql).toContain(
      "new.status in ('available','reserved','picked','packed','putaway_pending')",
    );
    expect(quarantineSql).toContain("'putaway_pending'::public.inventory_status");
    expect(quarantineSql).toContain("'disposal_pending'::public.inventory_status");
    expect(quarantineSql).toContain("when new.resolution='restock' then null");
    expect(quarantineSql).toContain("location purpose is immutable");
  });
});
