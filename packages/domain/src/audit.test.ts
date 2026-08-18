import { describe, expect, it } from "vitest";

import { assertSafeAuditEvent, type AuditEvent } from "./audit.js";

const safeEvent: AuditEvent = {
  workspaceId: "ws-a",
  actorId: "person-a",
  action: "inventory.moved",
  targetType: "inventory_unit",
  targetId: "unit-a",
  occurredAt: "2026-08-15T00:00:00Z",
  fieldNames: ["locationId"],
  redactedChanges: { locationId: "changed" },
  referenceIds: ["movement-a"],
};

describe("audit safety", () => {
  it("allows field names, redacted changes and reference IDs", () => {
    expect(() => assertSafeAuditEvent(safeEvent)).not.toThrow();
  });

  it("rejects forbidden field names and secret-shaped values", () => {
    expect(() => assertSafeAuditEvent({ ...safeEvent, fieldNames: ["token"] })).toThrow(
      "forbidden field",
    );
    expect(() => assertSafeAuditEvent({ ...safeEvent, referenceIds: ["Bearer example"] })).toThrow(
      "secret-shaped",
    );
  });
});
