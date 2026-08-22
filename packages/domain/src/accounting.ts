import { createHash } from "node:crypto";
import { FINANCIAL_FORMULA_VERSION } from "./finance.js";

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

export const MONEY_FORWARD_JOURNAL_VERSION = "money_forward_journal_v1.0.0" as const;
export const GENERIC_JOURNAL_VERSION = "generic_journal_v1.0.0" as const;
export const MONEY_FORWARD_SCHEMA_SHA256 =
  "da96302338da7b2b923d34d956cb2ca03d6bec0bfcce156bbdddf0a32b8d439e" as const;
export const MONEY_FORWARD_FIXTURE_SHA256 =
  "21c8248d9fc3ca378ed8b08f5c267dc031d65bf49cd3a04e41b8942236d22a56" as const;
export const GENERIC_SCHEMA_SHA256 =
  "4898686e474542030045300da0ac9073b776df1fc13cea380d4b721359bc7308" as const;
export const GENERIC_FIXTURE_SHA256 =
  "bd113544f4a98795707a833e4d5c7bb08fff90c6afb9f0e96ac691cb427d3615" as const;

export const MONEY_FORWARD_HEADERS = [
  "取引No",
  "取引日",
  "借方勘定科目",
  "借方補助科目",
  "借方部門",
  "借方取引先",
  "借方税区分",
  "借方インボイス",
  "借方金額(円)",
  "借方税額",
  "貸方勘定科目",
  "貸方補助科目",
  "貸方部門",
  "貸方取引先",
  "貸方税区分",
  "貸方インボイス",
  "貸方金額(円)",
  "貸方税額",
  "摘要",
  "仕訳メモ",
  "タグ",
  "MF仕訳タイプ",
  "決算整理仕訳",
  "作成日時",
  "作成者",
  "最終更新日時",
  "最終更新者",
] as const;

export const GENERIC_JOURNAL_HEADERS = [
  "export_batch_id",
  "source_event_id",
  "transaction_date",
  "debit_account",
  "debit_subaccount",
  "debit_tax_category",
  "debit_invoice_category",
  "debit_amount_jpy",
  "credit_account",
  "credit_subaccount",
  "credit_tax_category",
  "credit_invoice_category",
  "credit_amount_jpy",
  "description",
  "evidence_reference_id",
  "mapping_rule_version",
  "financial_formula_version",
  "human_confirmed_by",
  "human_confirmed_at",
] as const;

export type AccountingExportFormat = "money_forward_journal_v1" | "generic_journal_v1";

export type AccountingProfileValue =
  | "unconfigured"
  | "individual_business"
  | "company"
  | "blue_return"
  | "white_return"
  | "corporate_return"
  | "tax_exempt"
  | "general_taxation"
  | "simplified_taxation"
  | "not_registered"
  | "registered"
  | "single_entry"
  | "double_entry";

export interface AccountingProfile {
  businessContext: AccountingProfileValue;
  filingContext: AccountingProfileValue;
  consumptionTaxTreatment: AccountingProfileValue;
  invoiceRegistrationStatus: AccountingProfileValue;
  bookkeepingMethod: AccountingProfileValue;
  humanConfirmedBy: string | null;
}

export type AccountingProfileField = Exclude<keyof AccountingProfile, "humanConfirmedBy">;

export function accountingProfileBlockReasons(
  profile: AccountingProfile,
): AccountingProfileField[] {
  const fields: AccountingProfileField[] = [
    "businessContext",
    "filingContext",
    "consumptionTaxTreatment",
    "invoiceRegistrationStatus",
    "bookkeepingMethod",
  ];
  if (!profile.humanConfirmedBy || profile.humanConfirmedBy === "ai") return fields;
  return fields.filter((field) => profile[field] === "unconfigured");
}

export type InvoiceCategory =
  "適格" | "80％控除" | "70％控除" | "50％控除" | "30％控除" | "控除なし";

export interface VersionedJournalCandidate {
  id: string;
  transactionNumber: string;
  occurredOn: string;
  debitAccount: string;
  debitSubaccount: string;
  debitTaxCategory: string;
  debitInvoiceCategory: InvoiceCategory | "not_applicable";
  debitAmount: number;
  creditAccount: string;
  creditSubaccount: string;
  creditTaxCategory: string;
  creditInvoiceCategory: InvoiceCategory | "not_applicable";
  creditAmount: number;
  description: string;
  memo: string;
  tags: string;
  sourceReferenceId: string;
  evidenceReferenceId: string;
  mappingRuleVersion: string;
  financialFormulaVersion: typeof FINANCIAL_FORMULA_VERSION;
  humanApprovedBy: string | null;
  humanApprovedAt: string | null;
  unresolvedReason: string | null;
}

export interface VersionedAccountingExport extends AccountingExport {
  format: AccountingExportFormat;
  formatVersion: typeof MONEY_FORWARD_JOURNAL_VERSION | typeof GENERIC_JOURNAL_VERSION;
  schemaSha256: string;
  fixtureSha256: string;
  columnCount: 27 | 19;
  sourceSetSha256: string;
}

export function createVersionedAccountingCsv(
  format: AccountingExportFormat,
  batchId: string,
  candidates: VersionedJournalCandidate[],
): VersionedAccountingExport {
  if (!batchId || batchId.length > 100) throw new Error("export batch id is invalid");
  const candidateIds = new Set<string>();
  const sourceIds = new Set<string>();
  for (const candidate of candidates) {
    if (candidateIds.has(candidate.id)) throw new Error("duplicate journal candidate");
    if (sourceIds.has(candidate.sourceReferenceId)) throw new Error("duplicate source event");
    candidateIds.add(candidate.id);
    sourceIds.add(candidate.sourceReferenceId);
    validateVersionedCandidate(candidate, format);
  }
  if (candidates.length === 0) throw new Error("at least one journal candidate is required");

  const headers =
    format === "money_forward_journal_v1" ? MONEY_FORWARD_HEADERS : GENERIC_JOURNAL_HEADERS;
  const rows = candidates.map((candidate) =>
    format === "money_forward_journal_v1"
      ? moneyForwardRow(candidate)
      : genericJournalRow(batchId, candidate),
  );
  if (rows.some((row) => row.length !== headers.length)) {
    throw new Error("accounting export column count mismatch");
  }
  const lines = [headers, ...rows].map((row) => row.map(deterministicCsvCell).join(","));
  const csv = `\uFEFF${lines.join("\r\n")}\r\n`;
  const sourceSetSha256 = createHash("sha256")
    .update([...sourceIds].sort().join("\n"), "utf8")
    .digest("hex");
  const moneyForward = format === "money_forward_journal_v1";
  return {
    format,
    formatVersion: moneyForward ? MONEY_FORWARD_JOURNAL_VERSION : GENERIC_JOURNAL_VERSION,
    filename: moneyForward ? "money-forward-journal-v1.csv" : "generic-journal-v1.csv",
    csv,
    sha256: createHash("sha256").update(csv, "utf8").digest("hex"),
    rowCount: rows.length,
    columnCount: moneyForward ? 27 : 19,
    schemaSha256: moneyForward ? MONEY_FORWARD_SCHEMA_SHA256 : GENERIC_SCHEMA_SHA256,
    fixtureSha256: moneyForward ? MONEY_FORWARD_FIXTURE_SHA256 : GENERIC_FIXTURE_SHA256,
    sourceSetSha256,
  };
}

function validateVersionedCandidate(
  candidate: VersionedJournalCandidate,
  format: AccountingExportFormat,
): void {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(candidate.occurredOn)) {
    throw new Error("journal date must be YYYY-MM-DD");
  }
  if (format === "money_forward_journal_v1" && !/^\d{1,9}$/u.test(candidate.transactionNumber)) {
    throw new Error("Money Forward transaction number must be 1 to 9 ASCII digits");
  }
  if (
    !Number.isSafeInteger(candidate.debitAmount) ||
    !Number.isSafeInteger(candidate.creditAmount) ||
    candidate.debitAmount <= 0 ||
    candidate.creditAmount <= 0
  ) {
    throw new Error("journal amount must be a positive safe JPY integer");
  }
  if (candidate.debitAmount !== candidate.creditAmount) {
    throw new Error("journal is not balanced");
  }
  if (
    !candidate.humanApprovedBy ||
    candidate.humanApprovedBy === "ai" ||
    !candidate.humanApprovedAt
  ) {
    throw new Error("human approval is required");
  }
  if (candidate.unresolvedReason) throw new Error("unresolved journal cannot be exported");
  if (!candidate.debitAccount || !candidate.creditAccount)
    throw new Error("journal accounts are required");
  if (candidate.debitAccount.length > 30 && format === "money_forward_journal_v1") {
    throw new Error("Money Forward debit account exceeds 30 characters");
  }
  if (candidate.creditAccount.length > 30 && format === "money_forward_journal_v1") {
    throw new Error("Money Forward credit account exceeds 30 characters");
  }
  if (!candidate.debitTaxCategory || !candidate.creditTaxCategory) {
    throw new Error("approved tax categories are required");
  }
  if (
    !candidate.mappingRuleVersion ||
    candidate.financialFormulaVersion !== FINANCIAL_FORMULA_VERSION
  ) {
    throw new Error("approved mapping and financial formula versions are required");
  }
  if (candidate.description.length > 200 || candidate.memo.length > 200) {
    throw new Error("journal description or memo exceeds 200 characters");
  }
}

function moneyForwardRow(candidate: VersionedJournalCandidate): string[] {
  const invoice = (value: VersionedJournalCandidate["debitInvoiceCategory"]) =>
    value === "not_applicable" ? "控除なし" : value;
  return [
    candidate.transactionNumber,
    candidate.occurredOn.replaceAll("-", "/"),
    candidate.debitAccount,
    candidate.debitSubaccount,
    "",
    "",
    candidate.debitTaxCategory,
    invoice(candidate.debitInvoiceCategory),
    String(candidate.debitAmount),
    "0",
    candidate.creditAccount,
    candidate.creditSubaccount,
    "",
    "",
    candidate.creditTaxCategory,
    invoice(candidate.creditInvoiceCategory),
    String(candidate.creditAmount),
    "0",
    candidate.description,
    candidate.memo,
    candidate.tags,
    "インポート",
    "",
    "",
    "",
    "",
    "",
  ];
}

function genericJournalRow(batchId: string, candidate: VersionedJournalCandidate): string[] {
  return [
    batchId,
    candidate.sourceReferenceId,
    candidate.occurredOn,
    candidate.debitAccount,
    candidate.debitSubaccount,
    candidate.debitTaxCategory,
    candidate.debitInvoiceCategory,
    String(candidate.debitAmount),
    candidate.creditAccount,
    candidate.creditSubaccount,
    candidate.creditTaxCategory,
    candidate.creditInvoiceCategory,
    String(candidate.creditAmount),
    candidate.description,
    candidate.evidenceReferenceId,
    candidate.mappingRuleVersion,
    candidate.financialFormulaVersion,
    candidate.humanApprovedBy ?? "",
    candidate.humanApprovedAt ?? "",
  ];
}

function deterministicCsvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
