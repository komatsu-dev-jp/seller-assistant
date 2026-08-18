import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  offlineFailureDisposition,
  clearOfflineBusinessData,
  pendingPutawayCount,
  queuePutaway,
  syncPendingPutaways,
  toPutawayRequest,
  validatePendingPutaway,
} from "./offline-outbox";

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
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    await deleteDatabase("resale-ops-offline-v1");
  });
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

  it("keeps pending work for login expiry but discards revoked assignments", () => {
    expect(offlineFailureDisposition(401)).toBe("authentication_required");
    expect(offlineFailureDisposition(403)).toBe("forbidden");
    expect(offlineFailureDisposition(503)).toBe("unavailable");
    expect(offlineFailureDisposition(409)).toBeNull();
  });

  it("actually retains a 401 record and deletes it only after a 403", async () => {
    await queuePutaway(valid);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ message: "expired" }), { status: 401 })),
    );
    expect(await syncPendingPutaways()).toEqual({
      synced: 0,
      discarded: 0,
      remaining: 1,
      loginRequired: true,
    });
    expect(await pendingPutawayCount()).toBe(1);

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ workspaceId: "11111111-1111-4111-8111-111111111111" }), {
            status: 200,
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ message: "revoked" }), { status: 403 }),
        ),
    );
    expect(await syncPendingPutaways()).toEqual({
      synced: 0,
      discarded: 1,
      remaining: 0,
      loginRequired: false,
    });
    expect(await pendingPutawayCount()).toBe(0);
  });

  it("actually deletes IndexedDB and matching Cache Storage without a worker controller", async () => {
    await queuePutaway(valid);
    const deleteCache = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("window", { caches: {} });
    vi.stubGlobal("caches", {
      keys: vi.fn().mockResolvedValue(["resale-ops-v2", "unrelated-cache"]),
      delete: deleteCache,
    });

    await clearOfflineBusinessData();

    expect(deleteCache).toHaveBeenCalledTimes(1);
    expect(deleteCache).toHaveBeenCalledWith("resale-ops-v2");
    expect(await pendingPutawayCount()).toBe(0);
  });
});

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("test database cleanup failed"));
  });
}
