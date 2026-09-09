"use client";

import type {
  AccountMappingChangeReason,
  AccountMappingRuleResponse,
  AccountingExportPreflightResponse,
  AccountingExportPreviewResponse,
  AccountingProfileResponse,
  FinancialSummaryResponse,
  ReplaceAccountMappingRuleResponse,
  VersionedAccountingExportResponse,
} from "@resale/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  applyAccountingImportConfirmation,
  isAccountingImportActionDisabled,
  mergeCreatedAccountingExport,
  selectActiveAccountingExport,
} from "../lib/accounting-export-state";
import {
  accountingDateToIso,
  createMappingReplacementDraft,
  formatAccountingDate,
  mappingReplacementReady,
  nextAccountingDate,
  type MappingReplacementDraft,
} from "../lib/accounting-mapping-state";

const eventLabels = {
  sale: "売上",
  refund: "返金",
  fee: "販売手数料",
  fee_reversal: "手数料返還",
  shipping: "送料",
  packaging: "梱包費",
  cost: "商品原価",
} as const;

type EventType = keyof typeof eventLabels;
type InvoiceCategory = AccountMappingRuleResponse["debitInvoiceCategory"];
type DraftInvoiceCategory = InvoiceCategory | "";
type ExactPriorDuplicate = NonNullable<AccountingExportPreflightResponse["exactPriorDuplicate"]>;
type OperationAccountingExport = VersionedAccountingExportResponse & {
  state: "ready" | "downloaded";
};

function isOperationAccountingExport(
  candidate: VersionedAccountingExportResponse,
): candidate is OperationAccountingExport {
  return candidate.state === "ready" || candidate.state === "downloaded";
}

type MappingDraft = {
  debitAccount: string;
  debitTaxCategory: string;
  debitInvoiceCategory: DraftInvoiceCategory;
  creditAccount: string;
  creditTaxCategory: string;
  creditInvoiceCategory: DraftInvoiceCategory;
  effectiveFrom: string;
};

const invoiceCategories: InvoiceCategory[] = [
  "適格",
  "80％控除",
  "70％控除",
  "50％控除",
  "30％控除",
  "控除なし",
];

const mappingChangeReasons: ReadonlyArray<readonly [AccountMappingChangeReason, string]> = [
  ["account_review", "勘定科目の見直し"],
  ["tax_review", "税区分・インボイス区分の見直し"],
  ["bookkeeping_policy_update", "記帳方針の変更"],
  ["correction", "確認済み入力の訂正"],
  ["other_reviewed_change", "その他（会計方針を確認済み）"],
];

const financialMissingLabels: Record<FinancialSummaryResponse["missingInputs"][number], string> = {
  orderPrice: "注文金額",
  sellerDiscount: "出品者負担の値引き",
  channelCoupon: "販売チャネルのクーポン",
  successfulRefund: "返金額",
  sellingFeeCharged: "販売手数料",
  sellingFeeRefund: "手数料返還",
  promotionCost: "販促費",
  sellerShipping: "出品者負担送料",
  packagingCost: "梱包費",
  returnDirectCost: "返品直接費",
  costOfGoods: "商品原価",
  costReturnedToInventory: "在庫へ戻した原価",
  taxBasis: "税込・税抜・税区分",
};

const initialMappingDrafts: Record<EventType, MappingDraft> = Object.fromEntries(
  (Object.keys(eventLabels) as EventType[]).map((eventType) => [
    eventType,
    {
      debitAccount: "",
      debitTaxCategory: "",
      debitInvoiceCategory: "",
      creditAccount: "",
      creditTaxCategory: "",
      creditInvoiceCategory: "",
      effectiveFrom: "",
    },
  ]),
) as Record<EventType, MappingDraft>;

export type AccountingMobileStage =
  "format" | "profile" | "mappings" | "export" | "preview" | "import" | "history";

export const accountingStageTitles: Record<AccountingMobileStage, string> = {
  format: "売上の事実",
  profile: "会計の基本設定",
  mappings: "会計項目の候補",
  export: "作成前の確認",
  preview: "ファイル内容の確認",
  import: "手動取込の結果",
  history: "作成・取込履歴",
};

export function AccountingWorkspace({
  workspaceId,
  orderId,
  preferredFormat,
  mobileStage,
  onMobileStageChange,
}: {
  workspaceId: string;
  orderId: string | null;
  preferredFormat: "money_forward_journal_v1" | "generic_journal_v1";
  mobileStage?: AccountingMobileStage;
  onMobileStageChange?: (stage: AccountingMobileStage) => void;
}) {
  const [profile, setProfile] = useState<AccountingProfileResponse | null>(null);
  const [rules, setRules] = useState<AccountMappingRuleResponse[]>([]);
  const [financial, setFinancial] = useState<FinancialSummaryResponse | null>(null);
  const [batch, setBatch] = useState<VersionedAccountingExportResponse | null>(null);
  const [exportPreflight, setExportPreflight] = useState<AccountingExportPreflightResponse | null>(
    null,
  );
  const [preview, setPreview] = useState<AccountingExportPreviewResponse | null>(null);
  const [batches, setBatches] = useState<VersionedAccountingExportResponse[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [mappingConfirmed, setMappingConfirmed] = useState(false);
  const [supersedeConfirmed, setSupersedeConfirmed] = useState(false);
  const [mappingDrafts, setMappingDrafts] = useState(initialMappingDrafts);
  const [replacementDrafts, setReplacementDrafts] = useState<
    Record<string, MappingReplacementDraft>
  >({});
  const [profileHelpOpen, setProfileHelpOpen] = useState(false);
  const [previewConfirmed, setPreviewConfirmed] = useState(false);

  const reloadControls = useCallback(async () => {
    const [nextProfile, nextRules, exports, nextExportPreflight] = await Promise.all([
      requestJson<AccountingProfileResponse>(`/v1/workspaces/${workspaceId}/accounting/profile`),
      requestJson<AccountMappingRuleResponse[]>(
        `/v1/workspaces/${workspaceId}/accounting/mapping-rules`,
      ),
      orderId
        ? requestJson<VersionedAccountingExportResponse[]>(
            `/v1/workspaces/${workspaceId}/accounting/exports?orderId=${encodeURIComponent(orderId)}`,
          )
        : Promise.resolve([]),
      orderId
        ? requestJson<AccountingExportPreflightResponse>(
            `/v1/workspaces/${workspaceId}/accounting/exports/preflight?orderId=${encodeURIComponent(orderId)}`,
          )
        : Promise.resolve(null),
    ]);
    setProfile(nextProfile);
    setRules(nextRules);
    setBatches(exports);
    setExportPreflight(nextExportPreflight);
    setBatch(selectActiveAccountingExport(exports, preferredFormat));
    setPreview(null);
    setPreviewConfirmed(false);
    setSupersedeConfirmed(false);
  }, [orderId, preferredFormat, workspaceId]);

  useEffect(() => {
    void reloadControls().catch((error: unknown) =>
      setMessage(error instanceof Error ? error.message : "会計設定を取得できませんでした。"),
    );
  }, [reloadControls]);

  const activeEventTypes = useMemo(
    () => new Set(rules.filter((rule) => rule.status === "active").map((rule) => rule.eventType)),
    [rules],
  );
  const missingEventTypes = (Object.keys(eventLabels) as EventType[]).filter(
    (eventType) => !activeEventTypes.has(eventType),
  );
  const missingDraftsComplete = missingEventTypes.every((eventType) =>
    mappingDraftComplete(mappingDrafts[eventType]),
  );
  const replacementBatch = exportPreflight?.exactPriorDuplicate ?? null;
  const profileReady =
    profile !== null &&
    profile.businessContext !== "unconfigured" &&
    profile.filingContext !== "unconfigured" &&
    profile.consumptionTaxTreatment !== "unconfigured" &&
    profile.invoiceRegistrationStatus !== "unconfigured" &&
    profile.bookkeepingMethod !== "unconfigured" &&
    profile.humanConfirmedAt !== null;
  const financialReady = financial !== null && financial.missingInputs.length === 0;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作を完了できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  function saveProfile(form: FormData) {
    if (!profile) return Promise.resolve();
    return run(async () => {
      const saved = await requestJson<AccountingProfileResponse>(
        `/v1/workspaces/${workspaceId}/accounting/profile`,
        {
          method: "POST",
          body: JSON.stringify({
            businessContext: formText(form, "businessContext"),
            filingContext: formText(form, "filingContext"),
            consumptionTaxTreatment: formText(form, "consumptionTaxTreatment"),
            invoiceRegistrationStatus: formText(form, "invoiceRegistrationStatus"),
            bookkeepingMethod: formText(form, "bookkeepingMethod"),
            expectedRevision: profile.revision,
            humanConfirmed: true,
          }),
        },
      );
      setProfile(saved);
      setMessage("会計プロフィールを本人確認付きで保存しました。");
      onMobileStageChange?.("mappings");
    });
  }

  function saveCandidateMappings() {
    return run(async () => {
      if (!mappingConfirmed) throw new Error("候補であることを確認してください。");
      const missing = missingEventTypes;
      if (!missing.every((eventType) => mappingDraftComplete(mappingDrafts[eventType]))) {
        throw new Error("未登録ルールの科目・税区分・適用開始日をすべて入力してください。");
      }
      for (const eventType of missing) {
        const draft = mappingDrafts[eventType];
        await requestJson(`/v1/workspaces/${workspaceId}/accounting/mapping-rules`, {
          method: "POST",
          body: JSON.stringify({
            eventType,
            version: `p0-human-reviewed-${eventType}-v1`,
            debitAccount: draft.debitAccount.trim(),
            debitSubaccount: "",
            debitTaxCategory: draft.debitTaxCategory.trim(),
            debitInvoiceCategory: draft.debitInvoiceCategory as InvoiceCategory,
            creditAccount: draft.creditAccount.trim(),
            creditSubaccount: "",
            creditTaxCategory: draft.creditTaxCategory.trim(),
            creditInvoiceCategory: draft.creditInvoiceCategory as InvoiceCategory,
            effectiveFrom: accountingDateToIso(draft.effectiveFrom),
            effectiveUntil: null,
            humanApproved: true,
          }),
        });
      }
      await reloadControls();
      setMessage(
        missing.length === 0
          ? "有効な対応ルールはすでに登録済みです。"
          : `候補${missing.length}件を人の確認履歴付きで登録しました。`,
      );
      onMobileStageChange?.("export");
    });
  }

  function updateMappingDraft<K extends keyof MappingDraft>(
    eventType: EventType,
    field: K,
    value: MappingDraft[K],
  ) {
    setMappingDrafts((current) => ({
      ...current,
      [eventType]: { ...current[eventType], [field]: value },
    }));
    setMappingConfirmed(false);
  }

  function replacementDraft(rule: AccountMappingRuleResponse): MappingReplacementDraft {
    return replacementDrafts[rule.ruleId] ?? createMappingReplacementDraft(rule);
  }

  function updateReplacementDraft<K extends keyof MappingReplacementDraft>(
    rule: AccountMappingRuleResponse,
    field: K,
    value: MappingReplacementDraft[K],
  ) {
    setReplacementDrafts((current) => ({
      ...current,
      [rule.ruleId]: {
        ...(current[rule.ruleId] ?? createMappingReplacementDraft(rule)),
        [field]: value,
        ...(field === "humanConfirmed" ? {} : { humanConfirmed: false }),
      },
    }));
  }

  function replaceMappingRule(rule: AccountMappingRuleResponse) {
    return run(async () => {
      const draft = replacementDraft(rule);
      if (!mappingReplacementReady(rule, draft)) {
        throw new Error(
          "勘定科目または税区分の変更、理由、適用開始日、本人確認をすべて入力してください。",
        );
      }
      const changed = await requestJson<ReplaceAccountMappingRuleResponse>(
        `/v1/workspaces/${workspaceId}/accounting/mapping-rules/${rule.ruleId}/replacements`,
        {
          method: "POST",
          body: JSON.stringify({
            expectedVersion: rule.version,
            expectedStatus: "active",
            debitAccount: draft.debitAccount.trim(),
            debitSubaccount: draft.debitSubaccount.trim(),
            debitTaxCategory: draft.debitTaxCategory.trim(),
            debitInvoiceCategory: draft.debitInvoiceCategory,
            creditAccount: draft.creditAccount.trim(),
            creditSubaccount: draft.creditSubaccount.trim(),
            creditTaxCategory: draft.creditTaxCategory.trim(),
            creditInvoiceCategory: draft.creditInvoiceCategory,
            effectiveFrom: accountingDateToIso(draft.effectiveFrom),
            changeReasonCode: draft.changeReasonCode,
            humanConfirmed: true,
          }),
        },
      );
      await reloadControls();
      setReplacementDrafts((current) => {
        const next = { ...current };
        delete next[rule.ruleId];
        return next;
      });
      setMessage(
        `旧版 ${changed.retiredRule.version} を廃止し、新版 ${changed.activeRule.version} を人の確認付きで保存しました。過去の仕訳候補とCSVは変更していません。`,
      );
      onMobileStageChange?.("mappings");
    });
  }

  function loadFinancials() {
    if (!orderId) return Promise.resolve();
    return run(async () => {
      setFinancial(
        await requestJson<FinancialSummaryResponse>(
          `/v1/workspaces/${workspaceId}/orders/${orderId}/financial-summary`,
        ),
      );
    });
  }

  function createExport(
    format: "money_forward_journal_v1" | "generic_journal_v1",
    supersedes: ExactPriorDuplicate | null,
  ) {
    if (!orderId) return Promise.resolve();
    return run(async () => {
      if (!financialReady) {
        throw new Error("原資料の未確認項目を解消してからCSVを作成してください。");
      }
      if (supersedes && !supersedeConfirmed) {
        throw new Error("置換対象と履歴を確認してください。");
      }
      const latestPreflight = await requestJson<AccountingExportPreflightResponse>(
        `/v1/workspaces/${workspaceId}/accounting/exports/preflight?orderId=${encodeURIComponent(orderId)}`,
      );
      setExportPreflight(latestPreflight);
      if (
        supersedes &&
        (!latestPreflight.canSupersede ||
          latestPreflight.exactPriorDuplicate?.batchId !== supersedes.batchId)
      ) {
        setSupersedeConfirmed(false);
        throw new Error("根拠または置換対象が更新されました。表示内容を再確認してください。");
      }
      if (!supersedes && !latestPreflight.canCreateFresh) {
        throw new Error("同じ根拠のCSV履歴があります。置換対象を確認してから作成してください。");
      }
      const created = await requestJson<VersionedAccountingExportResponse>(
        `/v1/workspaces/${workspaceId}/accounting/exports`,
        {
          method: "POST",
          body: JSON.stringify({
            format,
            orderId,
            idempotencyKey: crypto.randomUUID(),
            approvedAt: new Date().toISOString(),
            humanApproved: true,
            duplicateOverrideConfirmed: Boolean(supersedes),
            supersedesBatchId: supersedes?.batchId ?? null,
          }),
        },
      );
      if (created.state !== "ready") {
        throw new Error("作成直後のCSV状態を確認できませんでした。履歴を再読み込みしてください。");
      }
      setBatch(created);
      setPreview(null);
      setPreviewConfirmed(false);
      setExportPreflight({
        orderId,
        currentSourceSetSha256: created.sourceSetSha256,
        exactPriorDuplicate: {
          batchId: created.batchId,
          format: created.format,
          filename: created.filename,
          sourceSetSha256: created.sourceSetSha256,
          state: created.state,
        },
        canCreateFresh: false,
        canSupersede: true,
      });
      setBatches((current) =>
        mergeCreatedAccountingExport(current, created, supersedes?.batchId ?? null),
      );
      setSupersedeConfirmed(false);
      setMessage("版・列数・根拠ハッシュを固定したCSV候補を作成しました。");
      onMobileStageChange?.("preview");
    });
  }

  function downloadExport() {
    return run(async () => {
      if (!batch || !isOperationAccountingExport(batch)) {
        throw new Error("このCSVはプレビュー・ダウンロードの対象ではありません。");
      }
      if (!preview || preview.batchId !== batch.batchId || !previewConfirmed) {
        throw new Error("保存済みCSVの先頭行と全列を画面で確認してください。");
      }
      const response = await fetch(batch.contentUrl, {
        method: "POST",
        headers: { accept: "text/csv" },
        cache: "no-store",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? "CSVを取得できませんでした。");
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = batch.filename;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
      const downloaded = { ...batch, state: "downloaded" as const };
      setBatch(downloaded);
      setExportPreflight((current) =>
        current?.exactPriorDuplicate?.batchId === downloaded.batchId
          ? {
              ...current,
              exactPriorDuplicate: { ...current.exactPriorDuplicate, state: "downloaded" },
            }
          : current,
      );
      setBatches((current) =>
        current.map((entry) => (entry.batchId === downloaded.batchId ? downloaded : entry)),
      );
      setMessage("CSVを端末へ保存しました。会計ソフトへの取込は人が行ってください。");
      onMobileStageChange?.("import");
    });
  }

  function loadPreview() {
    return run(async () => {
      if (!batch || !isOperationAccountingExport(batch)) {
        throw new Error("このCSVはプレビュー・ダウンロードの対象ではありません。");
      }
      const loaded = await requestJson<AccountingExportPreviewResponse>(
        `/v1/workspaces/${workspaceId}/accounting/exports/${batch.batchId}/preview`,
      );
      setPreview(loaded);
      setPreviewConfirmed(false);
      setMessage(
        `保存済みCSVの${loaded.columnCount}列・先頭${loaded.previewRowCount}行を読み取り専用で表示しました。`,
      );
    });
  }

  function confirmImport(result: "success" | "failed") {
    return run(async () => {
      if (!batch || batch.state !== "downloaded") {
        throw new Error("ダウンロード済みCSVだけ取込結果を記録できます。");
      }
      const updated = await requestJson<VersionedAccountingExportResponse>(
        `/v1/workspaces/${workspaceId}/accounting/exports/${batch.batchId}/import-confirmation`,
        {
          method: "POST",
          body: JSON.stringify({
            idempotencyKey: crypto.randomUUID(),
            result,
            importedRowCount: result === "success" ? batch.rowCount : 0,
            note: result === "success" ? "人が会計ソフトの結果を確認" : "人が取込失敗を確認",
            confirmedAt: new Date().toISOString(),
            humanConfirmed: true,
          }),
        },
      );
      const nextState = applyAccountingImportConfirmation(batches, updated, preferredFormat);
      setBatches(nextState.history);
      setBatch(nextState.active);
      setExportPreflight((current) =>
        current?.exactPriorDuplicate?.batchId === updated.batchId
          ? {
              ...current,
              exactPriorDuplicate: { ...current.exactPriorDuplicate, state: "import_confirmed" },
            }
          : current,
      );
      setPreview(null);
      setPreviewConfirmed(false);
      setMessage("手動取込の結果を監査履歴へ保存しました。");
      onMobileStageChange?.("history");
    });
  }

  return (
    <section
      className="accountingWorkspace"
      aria-labelledby="accounting-heading"
      data-mobile-stage={mobileStage}
    >
      <div className="workflowPanelHead">
        <div>
          <h2 id="accounting-heading">{accountingStageTitles[mobileStage ?? "export"]}</h2>
        </div>
        <span className={batch?.state === "import_confirmed" ? "safeBadge" : "status"}>
          {batch?.state === "import_confirmed" ? "手動取込確認済み" : "候補・未確定"}
        </span>
      </div>

      <p className="accountingDisclaimer" role="note">
        記録整理とCSV受け渡しを支援する画面です。税額・申告方法・勘定科目を自動確定せず、
        必要に応じて税理士などの専門家へ確認してください。
      </p>

      <section
        className={`accountingControlCard accountingMobilePanel ${mobileStage === undefined || mobileStage === "format" ? "isActive" : ""}`}
        aria-label="売上と費用の記録"
      >
        <h3>売上と費用を別々に確認</h3>
        {financial ? (
          <>
            <div className="profitWaterfall">
              <Money
                label="販売額"
                value={
                  financial.missingInputs.includes("orderPrice") ? null : financial.saleAmountMinor
                }
              />
              <Money label="返金（個別金額はこの画面では未取得）" value={null} />
              <Money
                label="商品原価"
                value={
                  financial.missingInputs.includes("costOfGoods")
                    ? null
                    : -financial.costAmountMinor
                }
              />
              <Money
                label="販売手数料"
                value={
                  financial.missingInputs.includes("sellingFeeCharged")
                    ? null
                    : -financial.sellingFeeMinor
                }
              />
              <Money
                label="送料"
                value={
                  financial.missingInputs.includes("sellerShipping")
                    ? null
                    : -financial.shippingCostMinor
                }
              />
              <Money
                label="梱包費"
                value={
                  financial.missingInputs.includes("packagingCost")
                    ? null
                    : -financial.packagingCostMinor
                }
              />
              <Money
                label="費用を差し引いた参考額"
                value={financial.contributionProfitMinor}
                total
              />
            </div>
            <p className="candidateReferences">
              {financial.missingInputs.length > 0
                ? `未確認: ${financial.missingInputs.map((input) => financialMissingLabels[input]).join("・")}`
                : "必要な金額が登録されています。"}
            </p>
            <p>運用分析の参考値です。会計上の利益・所得・税額を示すものではありません。</p>
          </>
        ) : (
          <p>対象取引を選び、保存済みの金額を読み込んでください。</p>
        )}
        <button type="button" disabled={busy || !orderId} onClick={() => void loadFinancials()}>
          売上と費用を読み込む
        </button>
        {onMobileStageChange ? (
          <button type="button" onClick={() => onMobileStageChange("profile")}>
            会計の基本設定へ
          </button>
        ) : null}
      </section>

      <div className="accountingSetupStack">
        {profile ? (
          <form
            className={`accountingControlCard accountingProfileCard accountingMobilePanel ${
              mobileStage === undefined || mobileStage === "profile" ? "isActive" : ""
            }`}
            action={saveProfile}
          >
            <div className="sectionTitle">
              <div>
                <span>1</span>
                <h3>本人が事業・申告状況を選択</h3>
              </div>
              <small>設定の版 {profile.revision}</small>
            </div>
            <div className="termHelp">
              <button
                type="button"
                className="termHelpButton"
                aria-controls="accounting-profile-terms"
                aria-expanded={profileHelpOpen}
                onClick={() => setProfileHelpOpen((open) => !open)}
              >
                ? 用語説明{profileHelpOpen ? "を閉じる" : "を開く"}
              </button>
              {profileHelpOpen ? (
                <dl id="accounting-profile-terms">
                  <div>
                    <dt>申告区分</dt>
                    <dd>現在の届出・申告方法を記録する欄です。アプリは選択を推測しません。</dd>
                  </div>
                  <div>
                    <dt>消費税の扱い</dt>
                    <dd>免税・本則・簡易の現在の扱いです。不明なら保存せず専門家へ確認します。</dd>
                  </div>
                  <div>
                    <dt>インボイス登録</dt>
                    <dd>適格請求書発行事業者の登録状況です。</dd>
                  </div>
                  <div>
                    <dt>記帳方法</dt>
                    <dd>単式簿記または複式簿記の運用方針です。</dd>
                  </div>
                </dl>
              ) : null}
            </div>
            <div className="accountingFieldGrid">
              <SelectField
                name="businessContext"
                label="事業主体"
                current={profile.businessContext}
                options={[
                  ["unconfigured", "未設定"],
                  ["individual_business", "個人事業"],
                  ["company", "法人"],
                ]}
              />
              <SelectField
                name="filingContext"
                label="申告区分"
                current={profile.filingContext}
                options={[
                  ["unconfigured", "未設定"],
                  ["blue_return", "青色申告"],
                  ["white_return", "白色申告"],
                  ["corporate_return", "法人申告"],
                ]}
              />
              <SelectField
                name="consumptionTaxTreatment"
                label="消費税の扱い"
                current={profile.consumptionTaxTreatment}
                options={[
                  ["unconfigured", "未設定"],
                  ["tax_exempt", "免税事業者"],
                  ["general_taxation", "本則課税"],
                  ["simplified_taxation", "簡易課税"],
                ]}
              />
              <SelectField
                name="invoiceRegistrationStatus"
                label="インボイス登録"
                current={profile.invoiceRegistrationStatus}
                options={[
                  ["unconfigured", "未設定"],
                  ["not_registered", "未登録"],
                  ["registered", "登録済み"],
                ]}
              />
              <SelectField
                name="bookkeepingMethod"
                label="記帳方法"
                current={profile.bookkeepingMethod}
                options={[
                  ["unconfigured", "未設定"],
                  ["single_entry", "単式簿記"],
                  ["double_entry", "複式簿記"],
                ]}
              />
            </div>
            <button disabled={busy} type="submit">
              選択内容を本人確認して保存
            </button>
          </form>
        ) : mobileStage === undefined || mobileStage === "profile" ? (
          <p role="status">会計設定を読み込んでいます…</p>
        ) : null}

        <section
          className={`accountingControlCard accountingMappingCard accountingMobilePanel ${
            mobileStage === undefined || mobileStage === "mappings" ? "isActive" : ""
          }`}
          aria-labelledby="mapping-heading"
        >
          <div className="sectionTitle">
            <div>
              <span>2</span>
              <h3 id="mapping-heading">勘定科目の対応候補を確認</h3>
            </div>
            <small>{activeEventTypes.size}/7 有効</small>
          </div>
          <p className="candidateReferences">
            承認済みルールだけを表示します。未登録欄は空欄から本人または税理士が入力し、
            アプリは勘定科目・税区分を推測しません。
          </p>
          <div className="mappingTable" aria-label="会計イベントと勘定科目候補">
            {(Object.keys(eventLabels) as EventType[]).map((eventType) => {
              const activeRule = rules.find(
                (rule) => rule.status === "active" && rule.eventType === eventType,
              );
              const draft = mappingDrafts[eventType];
              if (activeRule) {
                const changeDraft = replacementDraft(activeRule);
                const retiredRules = rules.filter(
                  (rule) => rule.status === "retired" && rule.eventType === eventType,
                );
                return (
                  <div key={eventType}>
                    <details className="mappingDraft">
                      <summary>
                        <strong>{eventLabels[eventType]}</strong>
                        <span>
                          {activeRule.debitAccount} → {activeRule.creditAccount}
                        </span>
                        <span>人が確認済み / 変更</span>
                      </summary>
                      <div className="mappingDraftFields">
                        <p>
                          現在の版: <strong>{activeRule.version}</strong>。変更するとこの版を
                          廃止し、新しい有効版を追加します。過去の仕訳候補とCSVは書き換えません。
                        </p>
                        <MappingTextField
                          label="借方科目"
                          value={changeDraft.debitAccount}
                          onChange={(value) =>
                            updateReplacementDraft(activeRule, "debitAccount", value)
                          }
                        />
                        <MappingTextField
                          label="借方補助科目"
                          value={changeDraft.debitSubaccount}
                          required={false}
                          onChange={(value) =>
                            updateReplacementDraft(activeRule, "debitSubaccount", value)
                          }
                        />
                        <MappingTextField
                          label="借方税区分"
                          value={changeDraft.debitTaxCategory}
                          onChange={(value) =>
                            updateReplacementDraft(activeRule, "debitTaxCategory", value)
                          }
                        />
                        <MappingInvoiceField
                          label="借方インボイス区分"
                          value={changeDraft.debitInvoiceCategory}
                          onChange={(value) =>
                            updateReplacementDraft(activeRule, "debitInvoiceCategory", value)
                          }
                        />
                        <MappingTextField
                          label="貸方科目"
                          value={changeDraft.creditAccount}
                          onChange={(value) =>
                            updateReplacementDraft(activeRule, "creditAccount", value)
                          }
                        />
                        <MappingTextField
                          label="貸方補助科目"
                          value={changeDraft.creditSubaccount}
                          required={false}
                          onChange={(value) =>
                            updateReplacementDraft(activeRule, "creditSubaccount", value)
                          }
                        />
                        <MappingTextField
                          label="貸方税区分"
                          value={changeDraft.creditTaxCategory}
                          onChange={(value) =>
                            updateReplacementDraft(activeRule, "creditTaxCategory", value)
                          }
                        />
                        <MappingInvoiceField
                          label="貸方インボイス区分"
                          value={changeDraft.creditInvoiceCategory}
                          onChange={(value) =>
                            updateReplacementDraft(activeRule, "creditInvoiceCategory", value)
                          }
                        />
                        <label>
                          変更理由
                          <select
                            value={changeDraft.changeReasonCode}
                            onChange={(event) =>
                              updateReplacementDraft(
                                activeRule,
                                "changeReasonCode",
                                event.target.value as AccountMappingChangeReason | "",
                              )
                            }
                            required
                          >
                            <option value="">選択してください</option>
                            {mappingChangeReasons.map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          新版の適用開始日
                          <input
                            type="date"
                            min={nextAccountingDate(activeRule.effectiveFrom)}
                            value={changeDraft.effectiveFrom}
                            onChange={(event) =>
                              updateReplacementDraft(
                                activeRule,
                                "effectiveFrom",
                                event.target.value,
                              )
                            }
                            required
                          />
                        </label>
                        <label className="confirmationCheck">
                          <input
                            type="checkbox"
                            checked={changeDraft.humanConfirmed}
                            onChange={(event) =>
                              updateReplacementDraft(
                                activeRule,
                                "humanConfirmed",
                                event.target.checked,
                              )
                            }
                          />
                          <span>
                            税務判断をアプリに任せず、変更内容・理由・開始日を本人または税理士が
                            確認しました。
                          </span>
                        </label>
                        <button
                          type="button"
                          disabled={busy || !mappingReplacementReady(activeRule, changeDraft)}
                          onClick={() => void replaceMappingRule(activeRule)}
                        >
                          人が確認して旧版を廃止・新版を保存
                        </button>
                      </div>
                    </details>
                    {retiredRules.map((retiredRule) => (
                      <div className="mappingRow" key={retiredRule.ruleId}>
                        <strong>{eventLabels[eventType]}（過去版）</strong>
                        <span>
                          {retiredRule.debitAccount} → {retiredRule.creditAccount}
                        </span>
                        <span>
                          廃止済み / {retiredRule.version} / ～
                          {formatAccountingDate(retiredRule.effectiveUntil)}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              }
              return (
                <details className="mappingDraft" key={eventType}>
                  <summary>
                    <strong>{eventLabels[eventType]}</strong>
                    <span>
                      {draft.debitAccount || "借方未設定"} → {draft.creditAccount || "貸方未設定"}
                    </span>
                    <span>入力候補（未確認）・要入力</span>
                  </summary>
                  <div className="mappingDraftFields">
                    <MappingTextField
                      label="借方科目"
                      value={draft.debitAccount}
                      onChange={(value) => updateMappingDraft(eventType, "debitAccount", value)}
                    />
                    <MappingTextField
                      label="借方税区分"
                      value={draft.debitTaxCategory}
                      onChange={(value) => updateMappingDraft(eventType, "debitTaxCategory", value)}
                    />
                    <MappingInvoiceField
                      label="借方インボイス区分"
                      value={draft.debitInvoiceCategory}
                      onChange={(value) =>
                        updateMappingDraft(eventType, "debitInvoiceCategory", value)
                      }
                    />
                    <MappingTextField
                      label="貸方科目"
                      value={draft.creditAccount}
                      onChange={(value) => updateMappingDraft(eventType, "creditAccount", value)}
                    />
                    <MappingTextField
                      label="貸方税区分"
                      value={draft.creditTaxCategory}
                      onChange={(value) =>
                        updateMappingDraft(eventType, "creditTaxCategory", value)
                      }
                    />
                    <MappingInvoiceField
                      label="貸方インボイス区分"
                      value={draft.creditInvoiceCategory}
                      onChange={(value) =>
                        updateMappingDraft(eventType, "creditInvoiceCategory", value)
                      }
                    />
                    <label>
                      適用開始日
                      <input
                        type="date"
                        value={draft.effectiveFrom}
                        onChange={(event) =>
                          updateMappingDraft(eventType, "effectiveFrom", event.target.value)
                        }
                        required
                      />
                    </label>
                  </div>
                </details>
              );
            })}
          </div>
          <label className="confirmationCheck">
            <input
              type="checkbox"
              checked={mappingConfirmed}
              onChange={(event) => setMappingConfirmed(event.target.checked)}
            />
            <span>
              入力内容は税務助言ではありません。原資料・会計方針と照合し、本人または税理士が
              確認しました。
            </span>
          </label>
          <button
            type="button"
            disabled={
              busy ||
              !profileReady ||
              !mappingConfirmed ||
              !missingDraftsComplete ||
              activeEventTypes.size === 7
            }
            onClick={() => void saveCandidateMappings()}
          >
            未登録の候補を人の承認付きで保存
          </button>
        </section>
      </div>

      <section
        className={`accountingControlCard accountingExportCard accountingMobilePanel ${
          mobileStage === undefined ||
          ["export", "preview", "import", "history"].includes(mobileStage)
            ? "isActive"
            : ""
        }`}
        aria-labelledby="export-heading"
      >
        <div className="sectionTitle">
          <div>
            <span>3</span>
            <h3 id="export-heading">{accountingStageTitles[mobileStage ?? "export"]}</h3>
          </div>
          <small>外部送信 0件</small>
        </div>
        <div className="accountingExportPrimary">
          <div
            className="accountingPreflight"
            data-accounting-step="export"
            aria-label="CSV出力前チェック"
          >
            <strong>出力前チェック</strong>
            <span className={profileReady ? "pass" : "blocked"}>
              {profileReady ? "✓" : "!"} 会計の基本設定
            </span>
            <span className={activeEventTypes.size === 7 ? "pass" : "blocked"}>
              {activeEventTypes.size === 7 ? "✓" : "!"} 確認済みの会計項目 {activeEventTypes.size}/7
            </span>
            <span className={financial?.missingInputs.length === 0 ? "pass" : "blocked"}>
              {financial?.missingInputs.length === 0 ? "✓" : "!"} 原資料・必須列
            </span>
            <span
              aria-label="新規作成と履歴の置換を別操作に分離"
              className={
                exportPreflight?.canCreateFresh ||
                (exportPreflight?.canSupersede && supersedeConfirmed)
                  ? "pass"
                  : "blocked"
              }
            >
              {exportPreflight?.canCreateFresh
                ? "✓ 新しい根拠セット・新規作成可"
                : exportPreflight?.canSupersede
                  ? `${supersedeConfirmed ? "✓" : "!"} 同じ根拠の履歴・置換確認が必要`
                  : "! 出力できる根拠を確認中"}
            </span>
          </div>
          {!financial ? (
            <button type="button" disabled={busy || !orderId} onClick={() => void loadFinancials()}>
              売上と費用を読み込む
            </button>
          ) : null}
          <div className="accountingActionRow" data-accounting-step="export">
            <button
              type="button"
              disabled={
                busy ||
                !orderId ||
                !financialReady ||
                !profileReady ||
                activeEventTypes.size < 7 ||
                !exportPreflight?.canCreateFresh
              }
              onClick={() => void createExport(preferredFormat, null)}
            >
              {preferredFormat === "money_forward_journal_v1"
                ? "Money Forward形式を新規作成（27列）"
                : "汎用形式を新規作成（19列）"}
            </button>
          </div>
          {replacementBatch ? (
            <div className="exportEvidenceDetails" data-accounting-step="export">
              <label className="confirmationCheck">
                <input
                  type="checkbox"
                  checked={supersedeConfirmed}
                  onChange={(event) => setSupersedeConfirmed(event.target.checked)}
                />
                <span>
                  履歴の {replacementBatch.filename}（{replacementBatch.state}
                  ）を置換対象として確認しました。 過去batchは削除せず履歴へ残します。
                </span>
              </label>
              <button
                type="button"
                disabled={
                  busy ||
                  !orderId ||
                  !financialReady ||
                  !profileReady ||
                  activeEventTypes.size < 7 ||
                  !exportPreflight?.canSupersede ||
                  !supersedeConfirmed
                }
                onClick={() => void createExport(preferredFormat, replacementBatch)}
              >
                確認した履歴を置換して新しいCSVを作成
              </button>
            </div>
          ) : null}
          {batch ? (
            <details className="exportEvidence" data-accounting-step="file" open>
              <summary>
                <strong>作成済みCSV</strong>
                <span>
                  {batch.filename} / {batch.columnCount}列 / {batch.rowCount}行
                </span>
              </summary>
              <div className="exportEvidenceDetails">
                <div data-accounting-step="preview">
                  <button type="button" disabled={busy} onClick={() => void loadPreview()}>
                    保存済みCSVを出力前に確認
                  </button>
                  {preview?.batchId === batch.batchId ? (
                    <section className="accountingCsvPreview" aria-labelledby="csv-preview-heading">
                      <div className="panelHead">
                        <div>
                          <strong id="csv-preview-heading">CSVプレビュー</strong>
                          <p>
                            全{preview.columnCount}列 / 先頭{preview.previewRowCount}行
                            {preview.truncated ? `（全${preview.totalRowCount}行）` : ""}
                          </p>
                        </div>
                        <span>読み取り専用・外部送信0件</span>
                      </div>
                      <div className="accountingCsvPreviewScroll" tabIndex={0}>
                        <table>
                          <thead>
                            <tr>
                              {preview.headers.map((header, index) => (
                                <th key={`${index}-${header}`} scope="col">
                                  {header}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {preview.rows.map((row, rowIndex) => (
                              <tr key={rowIndex}>
                                {row.map((cell, cellIndex) => (
                                  <td key={cellIndex}>{cell || "—"}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <label className="confirmationCheck">
                        <input
                          type="checkbox"
                          checked={previewConfirmed}
                          onChange={(event) => setPreviewConfirmed(event.target.checked)}
                        />
                        <span>
                          保存済み正本CSVの列名と先頭行を確認しました。画面表示だけではダウンロード済みに変わりません。
                        </span>
                      </label>
                    </section>
                  ) : null}
                  <details className="accountingExportMetadata">
                    <summary>版・SHA・置換の詳細</summary>
                    <div className="exportEvidenceDetails">
                      <span>版: {batch.formatVersion}</span>
                      <span>SHA-256: {batch.sha256}</span>
                    </div>
                  </details>
                  <button
                    type="button"
                    disabled={busy || !previewConfirmed || preview?.batchId !== batch.batchId}
                    onClick={() => void downloadExport()}
                  >
                    人がCSVをダウンロード
                  </button>
                </div>
                <div data-accounting-step="import">
                  <p>
                    会計ソフトの公式画面で、このファイルを本人が取り込んでください。取込後に結果を記録します。
                  </p>
                  {batch.state === "downloaded" ? (
                    <div className="accountingActionRow">
                      <button
                        type="button"
                        disabled={isAccountingImportActionDisabled(batch, busy)}
                        onClick={() => void confirmImport("success")}
                      >
                        手動取込の成功を記録
                      </button>
                      <button
                        type="button"
                        disabled={isAccountingImportActionDisabled(batch, busy)}
                        onClick={() => void confirmImport("failed")}
                      >
                        手動取込の失敗を記録
                      </button>
                    </div>
                  ) : null}
                  {batch.state !== "downloaded" ? (
                    <p>先にファイル内容を確認し、ダウンロードしてください。</p>
                  ) : null}
                </div>
              </div>
            </details>
          ) : (
            <p className="candidateReferences" role="status">
              この形式でプレビュー・ダウンロードできるCSVはありません。過去のCSVは履歴だけに表示します。
            </p>
          )}
        </div>
        <div className="accountingExportSupport" data-accounting-step="history">
          <aside className="accountingHelpSummary">
            <strong>この画面で行わないこと</strong>
            <p>税務判断、申告・提出、外部サービスへの自動送信は行いません。</p>
            <p>本人または税理士が原資料と設定を確認し、CSVを手動で受け渡します。</p>
          </aside>
          <section className="accountingHistoryCard" aria-labelledby="accounting-history-heading">
            <div className="sectionTitle">
              <div>
                <span>履</span>
                <h3 id="accounting-history-heading">出力履歴・取込確認</h3>
              </div>
              <small>{batches.length}件</small>
            </div>
            {batches.length > 0 ? (
              <div className="accountingHistoryTable" role="table" aria-label="CSV出力履歴">
                <div role="row" className="accountingHistoryHeader">
                  <span role="columnheader">ファイル</span>
                  <span role="columnheader">形式・版</span>
                  <span role="columnheader">行数</span>
                  <span role="columnheader">状態</span>
                </div>
                {batches.slice(0, 5).map((entry) => (
                  <div role="row" key={entry.batchId}>
                    <strong role="cell">{entry.filename}</strong>
                    <span role="cell">{entry.formatVersion}</span>
                    <span role="cell">{entry.rowCount}行</span>
                    <span role="cell">
                      {
                        {
                          ready: "作成済み",
                          downloaded: "ダウンロード済み",
                          import_confirmed: "取込確認済み",
                          voided: "無効",
                          superseded: "置換済み",
                        }[entry.state]
                      }
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p>出力履歴はまだありません。出力前チェックをすべて解消してから作成します。</p>
            )}
          </section>
        </div>
      </section>
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}

function SelectField({
  name,
  label,
  current,
  options,
}: {
  name: string;
  label: string;
  current: string;
  options: ReadonlyArray<readonly [string, string]>;
}) {
  return (
    <label>
      {label}
      <select key={`${name}-${current}`} name={name} defaultValue={current} required>
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

function MappingTextField({
  label,
  value,
  onChange,
  required = true,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label>
      {label}
      <input
        type="text"
        value={value}
        maxLength={50}
        onChange={(event) => onChange(event.target.value)}
        required={required}
      />
    </label>
  );
}

function MappingInvoiceField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: DraftInvoiceCategory;
  onChange: (value: DraftInvoiceCategory) => void;
}) {
  return (
    <label>
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as DraftInvoiceCategory)}
        required
      >
        <option value="">未設定</option>
        {invoiceCategories.map((category) => (
          <option key={category} value={category}>
            {category}
          </option>
        ))}
      </select>
    </label>
  );
}

function mappingDraftComplete(draft: MappingDraft): boolean {
  return Boolean(
    draft.debitAccount.trim() &&
    draft.debitTaxCategory.trim() &&
    draft.debitInvoiceCategory &&
    draft.creditAccount.trim() &&
    draft.creditTaxCategory.trim() &&
    draft.creditInvoiceCategory &&
    draft.effectiveFrom,
  );
}

function Money({
  label,
  value,
  total = false,
}: {
  label: string;
  value: number | null;
  total?: boolean;
}) {
  return (
    <div className={total ? "total" : undefined}>
      <span>{label}</span>
      <strong>
        {value === null
          ? "—"
          : `${value < 0 ? "−" : ""}¥${Math.abs(value).toLocaleString("ja-JP")}`}
      </strong>
    </div>
  );
}

async function requestJson<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { accept: "application/json", "content-type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as { message?: string } | T | null;
  if (!response.ok) {
    throw new Error(
      (payload as { message?: string } | null)?.message ?? "操作を確認できませんでした。",
    );
  }
  return payload as T;
}

function formText(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}
