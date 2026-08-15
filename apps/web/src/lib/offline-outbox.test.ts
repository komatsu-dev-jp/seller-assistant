import { describe, expect, it } from "vitest";

import { toPutawayRequest, validatePendingPutaway } from "./offline-outbox";

const valid = {
  schemaVersion: 2,
  idempotencyKey: "b3da7490-e72b-4af1-986e-2ffdfd178577",
  inventoryNumber: "INV-000123-8",
  locationCode: "BX-014-3-2",
  inventoryLabelVersion: 1,
  locationLabelVersion: 1,
  inventoryScannedAt: "2026-08-15T00:00:00.000Z",
  locationScannedAt: "2026-08-15T00:00:01.000Z",
  confirmedAt: "2026-08-15T00:00:02.000Z",
  humanConfirmed: true,
} as const;

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

  it("requires confirmation after both scans and excludes the local schema marker from API", () => {
    expect(validatePendingPutaway({ ...valid, confirmedAt: "2026-08-14T23:59:59.000Z" })).toBe(
      false,
    );
    const request = toPutawayRequest(valid);
    expect(request).not.toHaveProperty("schemaVersion");
    expect(request).toMatchObject({ humanConfirmed: true, inventoryLabelVersion: 1 });
  });
});
