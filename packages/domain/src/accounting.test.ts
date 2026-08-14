import { describe, expect, it } from "vitest";
import { createAccountingCsv, type JournalCandidate } from "./accounting.js";

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
