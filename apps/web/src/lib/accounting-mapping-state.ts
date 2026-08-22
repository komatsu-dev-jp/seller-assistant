import type { AccountMappingChangeReason, AccountMappingRuleResponse } from "@resale/contracts";

const accountingTimeZone = "Asia/Tokyo";

export type MappingReplacementDraft = {
  debitAccount: string;
  debitSubaccount: string;
  debitTaxCategory: string;
  debitInvoiceCategory: AccountMappingRuleResponse["debitInvoiceCategory"] | "";
  creditAccount: string;
  creditSubaccount: string;
  creditTaxCategory: string;
  creditInvoiceCategory: AccountMappingRuleResponse["creditInvoiceCategory"] | "";
  effectiveFrom: string;
  changeReasonCode: AccountMappingChangeReason | "";
  humanConfirmed: boolean;
};

export function createMappingReplacementDraft(
  rule: AccountMappingRuleResponse,
): MappingReplacementDraft {
  return {
    debitAccount: rule.debitAccount,
    debitSubaccount: rule.debitSubaccount,
    debitTaxCategory: rule.debitTaxCategory,
    debitInvoiceCategory: rule.debitInvoiceCategory,
    creditAccount: rule.creditAccount,
    creditSubaccount: rule.creditSubaccount,
    creditTaxCategory: rule.creditTaxCategory,
    creditInvoiceCategory: rule.creditInvoiceCategory,
    effectiveFrom: "",
    changeReasonCode: "",
    humanConfirmed: false,
  };
}

export function mappingReplacementChangesAccounting(
  rule: AccountMappingRuleResponse,
  draft: MappingReplacementDraft,
): boolean {
  return (
    rule.debitAccount !== draft.debitAccount.trim() ||
    rule.debitSubaccount !== draft.debitSubaccount.trim() ||
    rule.debitTaxCategory !== draft.debitTaxCategory.trim() ||
    rule.debitInvoiceCategory !== draft.debitInvoiceCategory ||
    rule.creditAccount !== draft.creditAccount.trim() ||
    rule.creditSubaccount !== draft.creditSubaccount.trim() ||
    rule.creditTaxCategory !== draft.creditTaxCategory.trim() ||
    rule.creditInvoiceCategory !== draft.creditInvoiceCategory
  );
}

export function mappingReplacementReady(
  rule: AccountMappingRuleResponse,
  draft: MappingReplacementDraft,
): boolean {
  return Boolean(
    mappingReplacementChangesAccounting(rule, draft) &&
    draft.debitAccount.trim() &&
    draft.debitTaxCategory.trim() &&
    draft.debitInvoiceCategory &&
    draft.creditAccount.trim() &&
    draft.creditTaxCategory.trim() &&
    draft.creditInvoiceCategory &&
    draft.effectiveFrom &&
    draft.changeReasonCode &&
    draft.humanConfirmed,
  );
}

export function accountingDateToIso(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new Error("会計の適用日は年-月-日の形式で入力してください。");
  }
  const instant = new Date(`${value}T00:00:00.000+09:00`);
  if (Number.isNaN(instant.getTime()) || accountingDateInTokyo(instant.toISOString()) !== value) {
    throw new Error("会計の適用日を確認してください。");
  }
  return instant.toISOString();
}

export function accountingDateInTokyo(value: string): string {
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) {
    throw new Error("会計の日付を確認できませんでした。");
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: accountingTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const dateParts = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
}

export function nextAccountingDate(value: string): string {
  const localDate = accountingDateInTokyo(value);
  const year = Number(localDate.slice(0, 4));
  const month = Number(localDate.slice(5, 7));
  const day = Number(localDate.slice(8, 10));
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return next.toISOString().slice(0, 10);
}

export function formatAccountingDate(value: string | null): string {
  return value ? accountingDateInTokyo(value) : "終了日なし";
}
