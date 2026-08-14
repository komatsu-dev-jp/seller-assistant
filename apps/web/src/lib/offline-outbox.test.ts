import { describe, expect, it } from "vitest";

import { validatePendingPutaway } from "./offline-outbox";

const valid = {
  schemaVersion: 1,
  idempotencyKey: "b3da7490-e72b-4af1-986e-2ffdfd178577",
  inventoryNumber: "INV-000123",
  locationCode: "BX-014-3",
  occurredAt: "2026-08-15T00:00:00.000Z",
};

describe("PWA offline outbox", () => {
  it("accepts the minimal putaway record", () => {
    expect(validatePendingPutaway(valid)).toBe(true);
  });

  it.each(["address", "token", "receiptText", "workspaceSecret", "price"])(
    "rejects extra business or sensitive field: %s",
    (field) => {
      expect(validatePendingPutaway({ ...valid, [field]: "must-not-be-stored" })).toBe(false);
    },
  );

  it("rejects malformed inventory and location labels", () => {
    expect(validatePendingPutaway({ ...valid, inventoryNumber: "123" })).toBe(false);
    expect(validatePendingPutaway({ ...valid, locationCode: "ROOM-A" })).toBe(false);
  });
});
