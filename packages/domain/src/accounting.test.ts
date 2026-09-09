import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GENERIC_FIXTURE_SHA256,
  GENERIC_JOURNAL_HEADERS,
  GENERIC_SCHEMA_SHA256,
  MONEY_FORWARD_FIXTURE_SHA256,
  MONEY_FORWARD_HEADERS,
  MONEY_FORWARD_SCHEMA_SHA256,
  accountingProfileBlockReasons,
  createAccountingCsv,
  createVersionedAccountingCsv,
  type AccountingProfile,
  type JournalCandidate,
  type VersionedJournalCandidate,
} from "./accounting.js";
import { FINANCIAL_FORMULA_VERSION } from "./finance.js";

const candidate: JournalCandidate = {
  id: "journal-a",
  occurredOn: "2026-08-15",
  debitAccount: "普通預金",
  debitAmount: 9_000,
  creditAccount: "売上高",
  creditAmount: 9_000,
  description: "出力候補",
  sourceReferenceId: "order-a",
  humanApprovedBy: "person-a",
  unresolvedReason: null,
};

describe("accounting CSV candidates", () => {
  it("exports balanced and human-approved candidates with a hash", () => {
    const result = createAccountingCsv([candidate]);
    expect(result.rowCount).toBe(1);
    expect(result.csv.startsWith("\uFEFF")).toBe(true);
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("rejects duplicates, imbalance, AI approval and unresolved rows", () => {
    expect(() => createAccountingCsv([candidate, candidate])).toThrow("duplicate");
    expect(() => createAccountingCsv([{ ...candidate, creditAmount: 8_999 }])).toThrow("balanced");
    expect(() => createAccountingCsv([{ ...candidate, humanApprovedBy: "ai" }])).toThrow(
      "human approval",
    );
    expect(() =>
      createAccountingCsv([{ ...candidate, unresolvedReason: "tax basis unknown" }]),
    ).toThrow("unresolved");
  });
});

const versionedCandidate: VersionedJournalCandidate = {
  id: "journal-versioned-a",
  transactionNumber: "1",
  occurredOn: "2026-08-20",
  debitAccount: "普通預金",
  debitSubaccount: "",
  debitTaxCategory: "対象外",
  debitInvoiceCategory: "not_applicable",
  debitAmount: 9_000,
  creditAccount: "売上高",
  creditSubaccount: "中古衣料",
  creditTaxCategory: "対象外",
  creditInvoiceCategory: "控除なし",
  creditAmount: 9_000,
  description: '販売,受注"A"',
  memo: "人が根拠を確認",
  tags: "販売|P0",
  sourceReferenceId: "financial-event-a",
  evidenceReferenceId: "evidence-a",
  mappingRuleVersion: "mapping-rule-v1",
  financialFormulaVersion: FINANCIAL_FORMULA_VERSION,
  humanApprovedBy: "person-a",
  humanApprovedAt: "2026-08-20T12:00:00+09:00",
  unresolvedReason: null,
};

describe("versioned accounting exports", () => {
  it("creates the exact 27-column Money Forward contract deterministically", () => {
    const result = createVersionedAccountingCsv("money_forward_journal_v1", "batch-a", [
      versionedCandidate,
    ]);
    const lines = result.csv.slice(1).split("\r\n");

    expect(result.csv.startsWith("\uFEFF")).toBe(true);
    expect(result.csv.endsWith("\r\n")).toBe(true);
    expect(lines).toHaveLength(3);
    expect(lines[0]?.split(",")).toHaveLength(27);
    expect(lines[0]).toBe(MONEY_FORWARD_HEADERS.join(","));
    expect(result.columnCount).toBe(27);
    expect(result.schemaSha256).toBe(MONEY_FORWARD_SCHEMA_SHA256);
    expect(result.fixtureSha256).toBe(MONEY_FORWARD_FIXTURE_SHA256);
    expect(lines[1]).toContain("2026/08/20");
    expect(lines[1]).toContain('"販売,受注""A"""');
    expect(result).toEqual(
      createVersionedAccountingCsv("money_forward_journal_v1", "batch-a", [versionedCandidate]),
    );
  });

  it("creates the separate 19-column generic contract", () => {
    const result = createVersionedAccountingCsv("generic_journal_v1", "batch-a", [
      versionedCandidate,
    ]);
    const lines = result.csv.slice(1).split("\r\n");

    expect(lines[0]).toBe(GENERIC_JOURNAL_HEADERS.join(","));
    expect(lines[0]?.split(",")).toHaveLength(19);
    expect(result.columnCount).toBe(19);
    expect(result.schemaSha256).toBe(GENERIC_SCHEMA_SHA256);
    expect(result.fixtureSha256).toBe(GENERIC_FIXTURE_SHA256);
  });

  it("blocks duplicate, unapproved, unresolved and unbalanced candidates", () => {
    expect(() =>
      createVersionedAccountingCsv("generic_journal_v1", "batch-a", [
        versionedCandidate,
        { ...versionedCandidate, id: "journal-versioned-b" },
      ]),
    ).toThrow("duplicate source event");
    expect(() =>
      createVersionedAccountingCsv("generic_journal_v1", "batch-a", [
        { ...versionedCandidate, humanApprovedBy: "ai" },
      ]),
    ).toThrow("human approval");
    expect(() =>
      createVersionedAccountingCsv("generic_journal_v1", "batch-a", [
        { ...versionedCandidate, unresolvedReason: "tax category unknown" },
      ]),
    ).toThrow("unresolved");
    expect(() =>
      createVersionedAccountingCsv("generic_journal_v1", "batch-a", [
        { ...versionedCandidate, creditAmount: 8_999 },
      ]),
    ).toThrow("balanced");
  });

  it("keeps every accounting profile field blocked until a person configures it", () => {
    const unconfigured: AccountingProfile = {
      businessContext: "unconfigured",
      filingContext: "unconfigured",
      consumptionTaxTreatment: "unconfigured",
      invoiceRegistrationStatus: "unconfigured",
      bookkeepingMethod: "unconfigured",
      humanConfirmedBy: null,
    };
    expect(accountingProfileBlockReasons(unconfigured)).toHaveLength(5);
    expect(
      accountingProfileBlockReasons({
        businessContext: "individual_business",
        filingContext: "blue_return",
        consumptionTaxTreatment: "tax_exempt",
        invoiceRegistrationStatus: "not_registered",
        bookkeepingMethod: "double_entry",
        humanConfirmedBy: "person-a",
      }),
    ).toEqual([]);
  });

  it("pins the checked schema and fixture files by SHA-256", () => {
    const hashes = [
      ["money-forward-journal-v1.schema.json", MONEY_FORWARD_SCHEMA_SHA256],
      ["money-forward-journal-v1.fixture.json", MONEY_FORWARD_FIXTURE_SHA256],
      ["generic-journal-v1.schema.json", GENERIC_SCHEMA_SHA256],
      ["generic-journal-v1.fixture.json", GENERIC_FIXTURE_SHA256],
    ] as const;

    for (const [filename, expected] of hashes) {
      const bytes = readFileSync(
        resolve(process.cwd(), "docs", "specs", "accounting-export", filename),
      );
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(expected);
    }
  });
});
