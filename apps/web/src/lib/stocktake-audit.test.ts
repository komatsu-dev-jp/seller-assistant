import type { StocktakeResponse } from "@resale/contracts";
import { describe, expect, it } from "vitest";

import { stocktakeAuditEntries } from "./stocktake-audit";

describe("stocktake audit timeline", () => {
  it("keeps confirmation and restoration reasons tied to their immutable audit events", () => {
    const entries = stocktakeAuditEntries(makeRestoredStocktake());

    expect(entries.find((entry) => entry.label === "不足候補を確認")?.detail).toBe(
      "INV-000001-7 / not_seen_during_count",
    );
    expect(entries.find((entry) => entry.label === "販売可能へ復元")?.detail).toBe(
      "INV-000001-7 / 現在地 UI-SOLO-A1-1 / found_in_place",
    );
  });
});

function makeRestoredStocktake(): StocktakeResponse {
  return {
    stocktakeId: "10000000-0000-4000-8000-000000000001",
    workspaceId: "10000000-0000-4000-8000-000000000002",
    locationId: "10000000-0000-4000-8000-000000000003",
    locationCode: "UI-SOLO-A1-1",
    state: "reconciliation",
    initialCounterId: "10000000-0000-4000-8000-000000000004",
    confirmationMode: "solo_reversible",
    activeMembershipCountAtSelection: 1,
    membershipRevisionAtSelection: 1,
    observationCount: 0,
    observations: [],
    discrepancies: [
      {
        discrepancyId: "10000000-0000-4000-8000-000000000005",
        inventoryUnitId: "10000000-0000-4000-8000-000000000006",
        inventoryNumber: "INV-000001-7",
        expectedLocationId: "10000000-0000-4000-8000-000000000003",
        expectedLocationCode: "UI-SOLO-A1-1",
        currentLocationId: "10000000-0000-4000-8000-000000000003",
        currentLocationCode: "UI-SOLO-A1-1",
        kind: "missing_candidate",
        state: "restored",
        resolution: "restored_to_current_location",
        confirmationMode: "solo_reversible",
        activeMembershipCountAtSelection: 1,
        membershipRevisionAtSelection: 1,
        evidenceCount: 1,
        reasonCode: "found_in_place",
        confirmedReasonCode: "not_seen_during_count",
        restoredReasonCode: "found_in_place",
        confirmedAt: "2026-08-24T10:00:00.000Z",
        restoredAt: "2026-08-24T10:01:00.000Z",
      },
    ],
    postStartMovements: [],
    startedAt: "2026-08-24T09:59:00.000Z",
    approvedAt: null,
  };
}
