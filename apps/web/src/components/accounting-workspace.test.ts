import type {
  AccountMappingRuleResponse,
  VersionedAccountingExportResponse,
} from "@resale/contracts";
import { describe, expect, it } from "vitest";

import {
  applyAccountingImportConfirmation,
  isActiveAccountingExport,
  isAccountingImportActionDisabled,
  mergeCreatedAccountingExport,
  selectActiveAccountingExport,
} from "../lib/accounting-export-state";
import {
  accountingDateInTokyo,
  accountingDateToIso,
  createMappingReplacementDraft,
  formatAccountingDate,
  mappingReplacementChangesAccounting,
  mappingReplacementReady,
  nextAccountingDate,
} from "../lib/accounting-mapping-state";

describe("accounting dates use the Japan business-day boundary", () => {
  it("converts a date input to JST midnight and keeps display/next-day in Asia/Tokyo", () => {
    expect(accountingDateToIso("2030-01-01")).toBe("2029-12-31T15:00:00.000Z");
    expect(accountingDateInTokyo("2029-12-31T15:00:00.000Z")).toBe("2030-01-01");
    expect(accountingDateInTokyo("2029-12-31T14:59:59.999Z")).toBe("2029-12-31");
    expect(nextAccountingDate("2029-12-31T15:00:00.000Z")).toBe("2030-01-02");
    expect(formatAccountingDate("2029-12-31T15:00:00.000Z")).toBe("2030-01-01");
    expect(formatAccountingDate(null)).toBe("終了日なし");
  });

  it("rejects an invalid calendar date instead of silently normalizing it", () => {
    expect(() => accountingDateToIso("2030-02-30")).toThrow(/適用日/u);
  });
});

describe("human-only account mapping replacement state", () => {
  it("requires an accounting-field change, fixed reason, effective date, and confirmation", () => {
    const rule = makeMappingRule();
    const unchanged = createMappingReplacementDraft(rule);
    expect(mappingReplacementChangesAccounting(rule, unchanged)).toBe(false);
    expect(mappingReplacementReady(rule, unchanged)).toBe(false);

    const changed = {
      ...unchanged,
      debitAccount: "売掛金",
      effectiveFrom: "2030-01-01",
      changeReasonCode: "account_review" as const,
      humanConfirmed: true,
    };
    expect(mappingReplacementChangesAccounting(rule, changed)).toBe(true);
    expect(mappingReplacementReady(rule, changed)).toBe(true);
    expect(mappingReplacementReady(rule, { ...changed, humanConfirmed: false })).toBe(false);
    expect(mappingReplacementReady(rule, { ...changed, changeReasonCode: "" })).toBe(false);
  });
});

const states: VersionedAccountingExportResponse["state"][] = [
  "ready",
  "downloaded",
  "import_confirmed",
  "voided",
  "superseded",
];

describe("accounting export operation state", () => {
  it.each(states)("classifies %s without exposing terminal history as active", (state) => {
    expect(isActiveAccountingExport(makeBatch(state))).toBe(
      state === "ready" || state === "downloaded",
    );
  });

  it("selects the newest matching ready/downloaded batch and ignores terminal history", () => {
    const superseded = makeBatch("superseded");
    const imported = makeBatch("import_confirmed");
    const downloadedOtherFormat = makeBatch("downloaded", "generic_journal_v1");
    const ready = makeBatch("ready");

    expect(
      selectActiveAccountingExport(
        [superseded, imported, downloadedOtherFormat, ready],
        "money_forward_journal_v1",
      ),
    ).toBe(ready);
  });

  it("returns no active batch when only terminal history exists", () => {
    expect(
      selectActiveAccountingExport(
        states
          .filter((state) => !["ready", "downloaded"].includes(state))
          .map((state) => makeBatch(state)),
        "money_forward_journal_v1",
      ),
    ).toBeNull();
  });

  it("keeps all history rows and immediately marks the exact replacement target superseded", () => {
    const prior = makeBatch("downloaded", "money_forward_journal_v1", "prior-batch");
    const unrelated = makeBatch("import_confirmed", "generic_journal_v1", "other-batch");
    const created = makeBatch("ready", "money_forward_journal_v1", "created-batch");

    expect(mergeCreatedAccountingExport([prior, unrelated], created, prior.batchId)).toEqual([
      created,
      { ...prior, state: "superseded" },
      unrelated,
    ]);
  });

  it("enables import confirmation for the next downloaded batch after confirming the newer one", () => {
    const newer = makeBatch("downloaded", "money_forward_journal_v1", "newer-batch");
    const older = makeBatch("downloaded", "money_forward_journal_v1", "older-batch");
    const confirmed = { ...newer, state: "import_confirmed" as const };

    const nextState = applyAccountingImportConfirmation(
      [newer, older],
      confirmed,
      "money_forward_journal_v1",
    );

    expect(nextState.history).toEqual([confirmed, older]);
    expect(nextState.history).toHaveLength(2);
    expect(nextState.active).toBe(older);
    expect(isAccountingImportActionDisabled(nextState.active, false)).toBe(false);
    expect(isAccountingImportActionDisabled(nextState.active, true)).toBe(true);
  });
});

function makeBatch(
  state: VersionedAccountingExportResponse["state"],
  format: VersionedAccountingExportResponse["format"] = "money_forward_journal_v1",
  batchId = "11111111-1111-4111-8111-111111111111",
): VersionedAccountingExportResponse {
  const isMoneyForward = format === "money_forward_journal_v1";
  return {
    batchId,
    orderId: "22222222-2222-4222-8222-222222222222",
    format,
    formatVersion: isMoneyForward ? "money_forward_journal_v1.0.0" : "generic_journal_v1.0.0",
    filename: isMoneyForward ? "money-forward-journal-v1.csv" : "generic-journal-v1.csv",
    sha256: "a".repeat(64),
    sourceSetSha256: "b".repeat(64),
    schemaSha256: "c".repeat(64),
    fixtureSha256: "d".repeat(64),
    rowCount: 1,
    columnCount: isMoneyForward ? 27 : 19,
    state,
    supersedesBatchId: null,
    contentUrl:
      "/v1/workspaces/33333333-3333-4333-8333-333333333333/accounting/exports/11111111-1111-4111-8111-111111111111/download",
    createdAt: "2026-08-21T00:00:00.000Z",
  };
}

function makeMappingRule(): AccountMappingRuleResponse {
  return {
    ruleId: "44444444-4444-4444-8444-444444444444",
    eventType: "sale",
    version: "sale-v1",
    debitAccount: "普通預金",
    debitSubaccount: "",
    debitTaxCategory: "対象外",
    debitInvoiceCategory: "控除なし",
    creditAccount: "売上高",
    creditSubaccount: "",
    creditTaxCategory: "対象外",
    creditInvoiceCategory: "控除なし",
    effectiveFrom: "2020-01-01T00:00:00.000Z",
    effectiveUntil: null,
    status: "active",
    approvedBy: "55555555-5555-4555-8555-555555555555",
    approvedAt: "2026-08-23T00:00:00.000Z",
    replacesRuleId: null,
    changeReasonCode: null,
    confirmationStatus: "human_confirmed",
  };
}
