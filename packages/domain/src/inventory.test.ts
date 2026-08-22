import { describe, expect, it } from "vitest";

import {
  canSetInventoryStatusInP0,
  canTransitionMissingCandidate,
  canResolveMissingInventory,
  decideIdempotency,
  discrepancyModeForActiveMembers,
  validatePlacement,
  validateMissingCandidateConfirmation,
  validateScanSession,
  validateUnitLocation,
  type InventoryLabel,
  type InventoryUnit,
  type LocationNode,
  type ScanSession,
} from "./inventory.js";

const location: LocationNode = {
  id: "loc-a",
  workspaceId: "ws-a",
  parentId: null,
  code: "ROOM-A-SHELF-01",
  state: "active",
  canStoreInventory: true,
  singleItemOnly: false,
  allowMixedSku: false,
  maxUnits: 2,
};

const unit: InventoryUnit = {
  id: "unit-a",
  workspaceId: "ws-a",
  skuId: "sku-a",
  inventoryNumber: "INV-000001",
  status: "available",
  locationId: "loc-a",
};

describe("inventory location rules", () => {
  it("requires exactly one active storable location for available inventory", () => {
    expect(validateUnitLocation(unit, location)).toEqual([]);
    expect(validateUnitLocation({ ...unit, locationId: null })).toContain("location_not_storable");
    expect(validateUnitLocation(unit, { ...location, state: "inactive" })).toContain(
      "location_not_active",
    );
  });

  it("rejects workspace, capacity, single-item and mixed-SKU violations", () => {
    const other = { ...unit, id: "unit-b", skuId: "sku-b" };
    expect(
      validatePlacement({
        unit,
        destination: { ...location, workspaceId: "ws-b", singleItemOnly: true, maxUnits: 1 },
        occupants: [other],
      }),
    ).toEqual(
      expect.arrayContaining([
        "workspace_mismatch",
        "single_item_location_occupied",
        "location_capacity_reached",
        "mixed_sku_not_allowed",
      ]),
    );
  });
});

describe("scan and concurrency rules", () => {
  const inventoryLabel: InventoryLabel = {
    id: "label-unit",
    workspaceId: "ws-a",
    targetType: "inventory_unit",
    targetId: "unit-a",
    version: 2,
    tokenHash: "hash-a",
    shortCode: "U-000001-7",
    active: true,
  };
  const locationLabel: InventoryLabel = {
    ...inventoryLabel,
    id: "label-location",
    targetType: "location",
    targetId: "loc-a",
    tokenHash: "hash-b",
    shortCode: "L-000001-3",
  };
  const session: ScanSession = {
    id: "scan-a",
    operation: "putaway",
    inventoryUnitId: "unit-a",
    expectedCurrentLocationId: null,
    destinationLocationId: "loc-a",
    inventoryEvidence: {
      labelId: "label-unit",
      labelVersion: 2,
      scannedAt: "2026-08-15T00:00:00Z",
    },
    locationEvidence: {
      labelId: "label-location",
      labelVersion: 2,
      scannedAt: "2026-08-15T00:00:01Z",
    },
    confirmedBy: "person-a",
    consumedAt: null,
  };

  it("requires current labels, two scans and human confirmation", () => {
    expect(validateScanSession(session, inventoryLabel, locationLabel)).toEqual([]);
    expect(
      validateScanSession(
        { ...session, confirmedBy: null },
        { ...inventoryLabel, active: false },
        { ...locationLabel, version: 3 },
      ),
    ).toEqual(
      expect.arrayContaining([
        "human_confirmation_required",
        "label_inactive",
        "label_version_mismatch",
      ]),
    );
  });

  it("replays identical idempotent requests and rejects conflicting payloads", () => {
    const record = { key: "move-1", payloadHash: "same", result: { movementId: "m-1" } };
    expect(decideIdempotency(record, "move-1", "same")).toEqual({
      kind: "replay",
      result: { movementId: "m-1" },
    });
    expect(decideIdempotency(record, "move-1", "different")).toEqual({ kind: "conflict" });
  });
});

describe("stocktake separation of duties", () => {
  it("requires a different reconfirmer and approver", () => {
    expect(
      canResolveMissingInventory({
        initialCounterId: "person-a",
        reconfirmerId: "person-b",
        requesterId: "person-a",
        approverId: "person-b",
      }),
    ).toBe(true);
    expect(
      canResolveMissingInventory({
        initialCounterId: "person-a",
        reconfirmerId: "person-a",
        requesterId: "person-a",
        approverId: "person-a",
      }),
    ).toBe(false);
  });

  it("selects solo or dual mode from server-counted active membership only", () => {
    expect(discrepancyModeForActiveMembers(1)).toBe("solo_reversible");
    expect(discrepancyModeForActiveMembers(2)).toBe("dual_actor");
    expect(() => discrepancyModeForActiveMembers(0)).toThrow("at least one");
  });

  it("requires all reversible solo evidence and a server-enforced three-second challenge", () => {
    const valid = {
      mode: "solo_reversible" as const,
      activeMembershipCountAtSelection: 1,
      initialCounterId: "person-a",
      confirmerId: "person-a",
      inventoryLabelCurrent: true,
      locationLabelCurrent: true,
      sameOnlineScanSession: true,
      privateEvidenceCount: 1,
      evidenceServerInspected: true,
      reasonCode: "not_seen_during_count",
      humanConfirmed: true,
      challengeNotBeforeEpochMs: 3_000,
      confirmedAtEpochMs: 3_000,
      challengeAlreadyConsumed: false,
    };
    expect(validateMissingCandidateConfirmation(valid)).toEqual([]);
    expect(
      validateMissingCandidateConfirmation({
        ...valid,
        privateEvidenceCount: 0,
        confirmedAtEpochMs: 2_999,
        challengeAlreadyConsumed: true,
      }),
    ).toEqual(
      expect.arrayContaining([
        "private_evidence_required",
        "confirmation_too_early",
        "challenge_already_consumed",
      ]),
    );
  });

  it("requires another person in dual mode and permits only confirm then restore", () => {
    expect(
      validateMissingCandidateConfirmation({
        mode: "dual_actor",
        activeMembershipCountAtSelection: 2,
        initialCounterId: "person-a",
        confirmerId: "person-a",
        inventoryLabelCurrent: true,
        locationLabelCurrent: true,
        sameOnlineScanSession: true,
        privateEvidenceCount: 1,
        evidenceServerInspected: true,
        reasonCode: "not_seen_during_count",
        humanConfirmed: true,
        challengeNotBeforeEpochMs: 3_000,
        confirmedAtEpochMs: 3_000,
        challengeAlreadyConsumed: false,
      }),
    ).toContain("second_actor_required");
    expect(canTransitionMissingCandidate("reconfirmation_required", "candidate_confirmed")).toBe(
      true,
    );
    expect(canTransitionMissingCandidate("candidate_confirmed", "restored")).toBe(true);
    expect(canTransitionMissingCandidate("reconfirmation_required", "restored")).toBe(false);
  });

  it("blocks irreversible lost and disposed states in P0", () => {
    expect(canSetInventoryStatusInP0("available")).toBe(true);
    expect(canSetInventoryStatusInP0("disposal_pending")).toBe(true);
    expect(canSetInventoryStatusInP0("lost")).toBe(false);
    expect(canSetInventoryStatusInP0("disposed")).toBe(false);
  });
});
