import { createHash } from "node:crypto";

export interface JournalCandidate {
  id: string;
  occurredOn: string;
  debitAccount: string;
  debitAmount: number;
  creditAccount: string;
  creditAmount: number;
  description: string;
  sourceReferenceId: string;
  humanApprovedBy: string | null;
  unresolvedReason: string | null;
}

export interface AccountingExport {
  filename: string;
  csv: string;
  sha256: string;
  rowCount: number;
}

function csvCell(value: string | number): string {
  const text = String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function createAccountingCsv(candidates: JournalCandidate[]): AccountingExport {
  const ids = new Set<string>();
  for (const candidate of candidates) {
    if (ids.has(candidate.id)) throw new Error("duplicate journal candidate");
    ids.add(candidate.id);
    if (
      !Number.isSafeInteger(candidate.debitAmount) ||
      !Number.isSafeInteger(candidate.creditAmount)
    ) {
      throw new Error("journal amount must be a safe integer");
    }
    if (candidate.debitAmount !== candidate.creditAmount)
      throw new Error("journal is not balanced");
    if (!candidate.humanApprovedBy || candidate.humanApprovedBy === "ai") {
      throw new Error("human approval is required");
    }
    if (candidate.unresolvedReason) throw new Error("unresolved journal cannot be exported");
  }

  const header = ["日付", "借方勘定科目", "借方金額", "貸方勘定科目", "貸方金額", "摘要", "参照ID"];
  const rows = candidates.map((candidate) =>
    [
      candidate.occurredOn,
      candidate.debitAccount,
      candidate.debitAmount,
      candidate.creditAccount,
      candidate.creditAmount,
      candidate.description,
      candidate.sourceReferenceId,
    ]
      .map(csvCell)
      .join(","),
  );
  const csv = `\uFEFF${header.map(csvCell).join(",")}\r\n${rows.join("\r\n")}\r\n`;
  return {
    filename: "journal-candidates.csv",
    csv,
    sha256: createHash("sha256").update(csv, "utf8").digest("hex"),
    rowCount: rows.length,
  };
}
