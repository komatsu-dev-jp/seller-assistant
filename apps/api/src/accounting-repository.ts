import { createHash, randomUUID } from "node:crypto";
import type {
  AccountMappingRuleResponse,
  AccountingExportPreflightResponse,
  AccountingExportPreviewResponse,
  AccountingOrderOptionResponse,
  AccountingProfileResponse,
  ConfirmAccountingImportRequest,
  CreateAccountMappingRuleRequest,
  CreateVersionedAccountingExportRequest,
  ReplaceAccountMappingRuleRequest,
  ReplaceAccountMappingRuleResponse,
  UpdateAccountingProfileRequest,
  VersionedAccountingExportResponse,
} from "@resale/contracts";
import {
  FINANCIAL_FORMULA_VERSION,
  createVersionedAccountingCsv,
  type AccountingExportFormat,
  type VersionedJournalCandidate,
} from "@resale/domain";
import postgres from "postgres";

import { RepositoryError, type RequestActor } from "./repository.js";

export interface AccountingExportContent {
  filename: string;
  csv: string;
  sha256: string;
}

export interface AccountingRepository {
  listReadyOrders(
    workspaceId: string,
    actor: RequestActor,
  ): Promise<AccountingOrderOptionResponse[]>;
  listExports(
    workspaceId: string,
    orderId: string,
    actor: RequestActor,
  ): Promise<VersionedAccountingExportResponse[]>;
  exportPreflight(
    workspaceId: string,
    orderId: string,
    actor: RequestActor,
  ): Promise<AccountingExportPreflightResponse>;
  getProfile(workspaceId: string, actor: RequestActor): Promise<AccountingProfileResponse>;
  updateProfile(
    workspaceId: string,
    actor: RequestActor,
    input: UpdateAccountingProfileRequest,
  ): Promise<AccountingProfileResponse>;
  listMappingRules(workspaceId: string, actor: RequestActor): Promise<AccountMappingRuleResponse[]>;
  createMappingRule(
    workspaceId: string,
    actor: RequestActor,
    input: CreateAccountMappingRuleRequest,
  ): Promise<AccountMappingRuleResponse>;
  replaceMappingRule(
    workspaceId: string,
    ruleId: string,
    actor: RequestActor,
    input: ReplaceAccountMappingRuleRequest,
  ): Promise<ReplaceAccountMappingRuleResponse>;
  createExport(
    workspaceId: string,
    actor: RequestActor,
    input: CreateVersionedAccountingExportRequest,
  ): Promise<VersionedAccountingExportResponse>;
  exportContent(
    workspaceId: string,
    batchId: string,
    actor: RequestActor,
  ): Promise<AccountingExportContent>;
  previewExport(
    workspaceId: string,
    batchId: string,
    actor: RequestActor,
  ): Promise<AccountingExportPreviewResponse>;
  confirmImport(
    workspaceId: string,
    batchId: string,
    actor: RequestActor,
    input: ConfirmAccountingImportRequest,
  ): Promise<VersionedAccountingExportResponse>;
  close(): Promise<void>;
}

export class PostgresAccountingRepository implements AccountingRepository {
  private readonly sql: postgres.Sql;

  constructor(databaseUrl: string) {
    this.sql = postgres(databaseUrl, {
      max: 4,
      idle_timeout: 20,
      connect_timeout: 10,
      transform: { undefined: null },
    });
  }

  async listReadyOrders(
    workspaceId: string,
    actor: RequestActor,
  ): Promise<AccountingOrderOptionResponse[]> {
    return this.run(workspaceId, actor, async (transaction) => {
      const rows = await transaction<
        Array<{
          order_id: string;
          order_number: string;
          order_state: AccountingOrderOptionResponse["orderState"];
          sku_code: string;
          title: string;
          financial_event_count: number;
        }>
      >`
        select sales.id as order_id, sales.order_number, sales.state as order_state,
               sku.sku_code, sku.title, count(event.id)::integer as financial_event_count
        from sales_order sales
        join order_allocation allocation
          on allocation.workspace_id = sales.workspace_id
         and allocation.order_id = sales.id and allocation.active
        join inventory_unit unit
          on unit.workspace_id = allocation.workspace_id
         and unit.id = allocation.inventory_unit_id
        join product_sku sku
          on sku.workspace_id = unit.workspace_id and sku.id = unit.sku_id
        left join financial_event event
          on event.workspace_id = sales.workspace_id and event.order_id = sales.id
        where sales.workspace_id = ${workspaceId}
          and sales.state in ('shipped', 'returned')
        group by sales.id, sales.order_number, sales.state, sales.created_at,
                 sku.sku_code, sku.title
        order by sales.created_at desc, sales.id
      `;
      return rows.map((row) => ({
        orderId: row.order_id,
        orderNumber: row.order_number,
        orderState: row.order_state,
        skuCode: row.sku_code,
        title: row.title,
        financialEventCount: row.financial_event_count,
      }));
    });
  }

  async listExports(
    workspaceId: string,
    orderId: string,
    actor: RequestActor,
  ): Promise<VersionedAccountingExportResponse[]> {
    return this.run(workspaceId, actor, async (transaction) => {
      const rows = await transaction<ExportBatchRow[]>`
        select * from export_batch
        where workspace_id = ${workspaceId} and order_id = ${orderId}
          and state not in ('preparing', 'failed')
        order by created_at desc, id desc
      `;
      return rows.map((row) => toExportResponse(workspaceId, row));
    });
  }

  async exportPreflight(
    workspaceId: string,
    orderId: string,
    actor: RequestActor,
  ): Promise<AccountingExportPreflightResponse> {
    return this.run(workspaceId, actor, async (transaction) => {
      const sources = await transaction<Array<{ id: string }>>`
        select id from financial_event
        where workspace_id = ${workspaceId} and order_id = ${orderId}
        order by id
      `;
      if (sources.length === 0) {
        return {
          orderId,
          currentSourceSetSha256: null,
          exactPriorDuplicate: null,
          canCreateFresh: false,
          canSupersede: false,
        };
      }
      const currentSourceSetSha256 = sha256(sources.map((source) => source.id).join("\n"));
      const duplicates = await transaction<ExportBatchRow[]>`
        select * from export_batch
        where workspace_id = ${workspaceId} and order_id = ${orderId}
          and source_set_sha256 = ${currentSourceSetSha256}
          and state in ('ready', 'downloaded', 'import_confirmed', 'superseded')
        order by created_at desc, id desc
        limit 1
      `;
      const duplicate = duplicates[0];
      return {
        orderId,
        currentSourceSetSha256,
        exactPriorDuplicate: duplicate
          ? {
              batchId: duplicate.id,
              format: duplicate.format,
              filename: duplicate.filename,
              sourceSetSha256: duplicate.source_set_sha256,
              state: duplicate.state as NonNullable<
                AccountingExportPreflightResponse["exactPriorDuplicate"]
              >["state"],
            }
          : null,
        canCreateFresh: duplicate === undefined,
        canSupersede: duplicate !== undefined,
      };
    });
  }

  async getProfile(workspaceId: string, actor: RequestActor): Promise<AccountingProfileResponse> {
    return this.run(workspaceId, actor, async (transaction) => {
      await transaction`
        insert into accounting_profile (workspace_id) values (${workspaceId})
        on conflict (workspace_id) do nothing
      `;
      return requireProfile(transaction, workspaceId);
    });
  }

  async updateProfile(
    workspaceId: string,
    actor: RequestActor,
    input: UpdateAccountingProfileRequest,
  ): Promise<AccountingProfileResponse> {
    return this.run(workspaceId, actor, async (transaction) => {
      await transaction`
        insert into accounting_profile (workspace_id) values (${workspaceId})
        on conflict (workspace_id) do nothing
      `;
      const before = await requireProfile(transaction, workspaceId);
      const changed = await transaction<Array<{ workspace_id: string }>>`
        update accounting_profile
        set business_context = ${input.businessContext},
            filing_context = ${input.filingContext},
            consumption_tax_treatment = ${input.consumptionTaxTreatment},
            invoice_registration_status = ${input.invoiceRegistrationStatus},
            bookkeeping_method = ${input.bookkeepingMethod},
            revision = revision + 1,
            human_confirmed_by = ${actor.identityId},
            human_confirmed_at = statement_timestamp(),
            updated_at = statement_timestamp()
        where workspace_id = ${workspaceId} and revision = ${input.expectedRevision}
        returning workspace_id
      `;
      if (!changed[0]) throw new RepositoryError("conflict", "The accounting profile changed");
      const after = await requireProfile(transaction, workspaceId);
      await audit(
        transaction,
        workspaceId,
        actor.identityId,
        "accounting.profile.confirmed",
        workspaceId,
        { revision: before.revision, configured: profileConfigured(before) },
        { revision: after.revision, configured: profileConfigured(after) },
        "accounting_profile_human_confirmed",
      );
      return after;
    });
  }

  async listMappingRules(
    workspaceId: string,
    actor: RequestActor,
  ): Promise<AccountMappingRuleResponse[]> {
    return this.run(workspaceId, actor, async (transaction) =>
      (await selectMappingRules(transaction, workspaceId)).map(toMappingRule),
    );
  }

  async createMappingRule(
    workspaceId: string,
    actor: RequestActor,
    input: CreateAccountMappingRuleRequest,
  ): Promise<AccountMappingRuleResponse> {
    return this.run(workspaceId, actor, async (transaction) => {
      const ruleId = randomUUID();
      const rows = await transaction<MappingRuleRow[]>`
        insert into account_mapping_rule (
          id, workspace_id, event_type, rule_version, debit_account, debit_subaccount,
          debit_tax_category, debit_invoice_category, credit_account, credit_subaccount,
          credit_tax_category, credit_invoice_category, effective_from, effective_until,
          status, approved_by, approved_at, created_by
        ) values (
          ${ruleId}, ${workspaceId}, ${input.eventType}, ${input.version},
          ${input.debitAccount}, ${input.debitSubaccount}, ${input.debitTaxCategory},
          ${input.debitInvoiceCategory}, ${input.creditAccount}, ${input.creditSubaccount},
          ${input.creditTaxCategory}, ${input.creditInvoiceCategory}, ${input.effectiveFrom},
          ${input.effectiveUntil}, 'active', ${actor.identityId}, statement_timestamp(),
          ${actor.identityId}
        ) returning *
      `;
      const row = rows[0];
      if (!row) throw new RepositoryError("database_error", "The mapping rule was not stored");
      await audit(
        transaction,
        workspaceId,
        actor.identityId,
        "accounting.mapping_rule.approved",
        ruleId,
        { status: "absent" },
        { status: "active", eventType: input.eventType, version: input.version },
        "account_mapping_human_approved",
      );
      return toMappingRule(row);
    });
  }

  async replaceMappingRule(
    workspaceId: string,
    ruleId: string,
    actor: RequestActor,
    input: ReplaceAccountMappingRuleRequest,
  ): Promise<ReplaceAccountMappingRuleResponse> {
    return this.run(workspaceId, actor, async (transaction) => {
      const currentRows = await transaction<MappingRuleRow[]>`
        select * from account_mapping_rule
        where workspace_id = ${workspaceId} and id = ${ruleId}
        for update
      `;
      const current = currentRows[0];
      if (
        !current ||
        current.status !== input.expectedStatus ||
        current.rule_version !== input.expectedVersion ||
        current.effective_until !== null
      ) {
        throw new RepositoryError(
          "conflict",
          "対応ルールが更新済みです。画面を再読み込みして、現在の有効版からやり直してください。",
        );
      }
      const effectiveFrom = new Date(input.effectiveFrom);
      if (effectiveFrom.getTime() <= current.effective_from.getTime()) {
        throw new RepositoryError(
          "conflict",
          "適用開始日は、現在のルールの開始日より後の日付を指定してください。",
        );
      }
      if (!mappingAccountingFieldsChanged(current, input)) {
        throw new RepositoryError(
          "conflict",
          "勘定科目または税区分を少なくとも1項目変更してください。",
        );
      }
      const [latestCandidate] = await transaction<Array<{ latest_occurred_at: Date | null }>>`
        select max(event.occurred_at) as latest_occurred_at
        from journal_candidate candidate
        join financial_event event
          on event.workspace_id = candidate.workspace_id
         and event.id = candidate.source_event_id
        where candidate.workspace_id = ${workspaceId}
          and candidate.mapping_rule_id = ${current.id}
      `;
      if (
        latestCandidate?.latest_occurred_at &&
        effectiveFrom.getTime() <= latestCandidate.latest_occurred_at.getTime()
      ) {
        throw new RepositoryError(
          "conflict",
          "適用開始日は、この旧版を使った最新の仕訳候補の取引日時より後にしてください。過去の仕訳候補を期間外にしないため、日付を見直してください。",
        );
      }

      const replacementId = randomUUID();
      const replacementVersion = `${current.event_type}-${accountingDateInTokyo(effectiveFrom)}-${replacementId.replaceAll("-", "").slice(0, 12)}`;
      const retiredRows = await transaction<MappingRuleRow[]>`
        update account_mapping_rule
        set status = 'retired', effective_until = ${input.effectiveFrom}
        where workspace_id = ${workspaceId} and id = ${ruleId}
          and rule_version = ${input.expectedVersion}
          and status = ${input.expectedStatus}
          and effective_until is null
        returning *
      `;
      const retired = retiredRows[0];
      if (!retired) {
        throw new RepositoryError(
          "conflict",
          "対応ルールが同時に変更されました。画面を再読み込みしてください。",
        );
      }
      const activeRows = await transaction<MappingRuleRow[]>`
        insert into account_mapping_rule (
          id, workspace_id, event_type, rule_version, debit_account, debit_subaccount,
          debit_tax_category, debit_invoice_category, credit_account, credit_subaccount,
          credit_tax_category, credit_invoice_category, effective_from, effective_until,
          status, approved_by, approved_at, created_by, replaces_rule_id, change_reason_code
        ) values (
          ${replacementId}, ${workspaceId}, ${current.event_type}, ${replacementVersion},
          ${input.debitAccount}, ${input.debitSubaccount}, ${input.debitTaxCategory},
          ${input.debitInvoiceCategory}, ${input.creditAccount}, ${input.creditSubaccount},
          ${input.creditTaxCategory}, ${input.creditInvoiceCategory}, ${input.effectiveFrom}, null,
          'active', ${actor.identityId}, statement_timestamp(), ${actor.identityId},
          ${current.id}, ${input.changeReasonCode}
        )
        returning *
      `;
      const active = activeRows[0];
      if (!active) {
        throw new RepositoryError("database_error", "The replacement mapping was not stored");
      }
      await audit(
        transaction,
        workspaceId,
        actor.identityId,
        "accounting.mapping_rule.replaced",
        current.id,
        {
          oldRuleId: current.id,
          oldVersion: current.rule_version,
          oldStatus: current.status,
        },
        {
          oldRuleId: retired.id,
          oldVersion: retired.rule_version,
          oldStatus: retired.status,
          newRuleId: active.id,
          newVersion: active.rule_version,
          newStatus: active.status,
          effectiveFrom: input.effectiveFrom,
        },
        input.changeReasonCode,
        [retired.id, active.id],
      );
      return {
        retiredRule: toMappingRule(retired),
        activeRule: toMappingRule(active),
        changeReasonCode: input.changeReasonCode,
        humanConfirmed: true,
      };
    });
  }

  async createExport(
    workspaceId: string,
    actor: RequestActor,
    input: CreateVersionedAccountingExportRequest,
  ): Promise<VersionedAccountingExportResponse> {
    return this.run(workspaceId, actor, async (transaction) => {
      const profile = await requireProfile(transaction, workspaceId);
      if (!profileConfigured(profile)) {
        throw new RepositoryError(
          "conflict",
          "Configure and confirm every accounting profile field",
        );
      }
      const eventRows = await selectMappedEvents(transaction, workspaceId, input.orderId);
      if (eventRows.length === 0) {
        throw new RepositoryError("conflict", "No approved mapped financial events are available");
      }
      if (eventRows.some((event) => event.tax_basis === "unknown")) {
        throw new RepositoryError("conflict", "An unknown tax basis blocks accounting export");
      }
      const allEvents = await transaction<Array<{ count: number }>>`
        select count(*)::integer as count from financial_event
        where workspace_id = ${workspaceId} and order_id = ${input.orderId}
      `;
      if ((allEvents[0]?.count ?? 0) !== eventRows.length) {
        throw new RepositoryError(
          "conflict",
          "Every financial event needs one approved active mapping",
        );
      }

      const batchId = randomUUID();
      const candidates = eventRows.map((row, index) =>
        toVersionedCandidate(row, index + 1, actor.identityId, input.approvedAt),
      );
      const generated = createVersionedAccountingCsv(input.format, batchId, candidates);
      const payloadHash = sha256(
        JSON.stringify({
          format: input.format,
          orderId: input.orderId,
          idempotencyKey: input.idempotencyKey,
          approvedAt: input.approvedAt,
          duplicateOverrideConfirmed: input.duplicateOverrideConfirmed,
          supersedesBatchId: input.supersedesBatchId,
          sourceIds: eventRows.map((event) => event.id),
          csvSha256: generated.sha256,
        }),
      );
      const existing = await transaction<ExportBatchRow[]>`
        select * from export_batch
        where workspace_id = ${workspaceId} and idempotency_key = ${input.idempotencyKey}
      `;
      if (existing[0]) {
        if (existing[0].payload_hash !== payloadHash) {
          throw new RepositoryError("conflict", "The export key already has another payload");
        }
        return toExportResponse(workspaceId, existing[0]);
      }

      const total = candidates.reduce((sum, candidate) => sum + candidate.debitAmount, 0);
      await transaction`
        insert into export_batch (
          id, workspace_id, order_id, format, format_version, filename,
          schema_sha256, fixture_sha256, csv_sha256, source_set_sha256,
          row_count, column_count, debit_total_jpy, credit_total_jpy, csv_content,
          state, idempotency_key, payload_hash, duplicate_override_confirmed,
          supersedes_batch_id, created_by, approved_by
        ) values (
          ${batchId}, ${workspaceId}, ${input.orderId}, ${input.format},
          ${generated.formatVersion}, ${generated.filename}, ${generated.schemaSha256},
          ${generated.fixtureSha256}, ${generated.sha256}, ${generated.sourceSetSha256},
          ${generated.rowCount}, ${generated.columnCount}, ${total}, ${total}, ${generated.csv},
          'preparing', ${input.idempotencyKey}, ${payloadHash},
          ${input.duplicateOverrideConfirmed}, ${input.supersedesBatchId},
          ${actor.identityId}, ${actor.identityId}
        )
      `;
      for (const [index, event] of eventRows.entries()) {
        const candidate = candidates[index];
        if (!candidate) throw new RepositoryError("database_error", "Candidate order is invalid");
        const candidateId = randomUUID();
        await transaction`
          insert into journal_candidate (
            id, workspace_id, source_event_id, mapping_rule_id, transaction_number,
            transaction_date, amount_jpy, description, evidence_reference_id,
            financial_formula_version, status, human_approved_by, human_approved_at
          ) values (
            ${candidateId}, ${workspaceId}, ${event.id}, ${event.mapping_rule_id},
            ${candidate.transactionNumber}, ${candidate.occurredOn}, ${candidate.debitAmount},
            ${candidate.description}, ${event.id}, ${FINANCIAL_FORMULA_VERSION}, 'approved',
            ${actor.identityId}, ${input.approvedAt}
          )
        `;
        await transaction`
          insert into export_batch_source (
            workspace_id, export_batch_id, journal_candidate_id, source_event_id, ordinal
          ) values (${workspaceId}, ${batchId}, ${candidateId}, ${event.id}, ${index + 1})
        `;
      }
      const ready = await transaction<ExportBatchRow[]>`
        update export_batch set state = 'ready'
        where workspace_id = ${workspaceId} and id = ${batchId} and state = 'preparing'
        returning *
      `;
      const row = ready[0];
      if (!row) throw new RepositoryError("database_error", "The export was not made ready");
      if (input.supersedesBatchId) {
        await transaction`
          update export_batch set state = 'superseded'
          where workspace_id = ${workspaceId} and id = ${input.supersedesBatchId}
            and state in ('ready', 'downloaded', 'import_confirmed')
        `;
      }
      await advanceAccountingWorkflow(
        transaction,
        workspaceId,
        input.orderId,
        actor.identityId,
        input.idempotencyKey,
        batchId,
      );
      await audit(
        transaction,
        workspaceId,
        actor.identityId,
        "accounting.export.ready",
        batchId,
        { state: "absent" },
        {
          state: "ready",
          format: input.format,
          rowCount: generated.rowCount,
          csvSha256: generated.sha256,
        },
        "accounting_candidates_human_approved",
      );
      return toExportResponse(workspaceId, row);
    });
  }

  async exportContent(
    workspaceId: string,
    batchId: string,
    actor: RequestActor,
  ): Promise<AccountingExportContent> {
    return this.run(workspaceId, actor, async (transaction) => {
      const rows = await transaction<ExportBatchRow[]>`
        select * from export_batch
        where workspace_id = ${workspaceId} and id = ${batchId} for update
      `;
      const row = rows[0];
      if (!row || !["ready", "downloaded"].includes(row.state)) {
        throw new RepositoryError("conflict", "The export file is unavailable");
      }
      if (row.state === "ready") {
        await transaction`
          update export_batch set state = 'downloaded'
          where workspace_id = ${workspaceId} and id = ${batchId} and state = 'ready'
        `;
        await audit(
          transaction,
          workspaceId,
          actor.identityId,
          "accounting.export.downloaded",
          batchId,
          { state: "ready" },
          { state: "downloaded" },
          "manual_csv_download",
        );
      }
      return { filename: row.filename, csv: row.csv_content, sha256: row.csv_sha256 };
    });
  }

  async previewExport(
    workspaceId: string,
    batchId: string,
    actor: RequestActor,
  ): Promise<AccountingExportPreviewResponse> {
    return this.run(workspaceId, actor, async (transaction) => {
      const rows = await transaction<ExportBatchRow[]>`
        select * from export_batch
        where workspace_id = ${workspaceId} and id = ${batchId}
          and state in ('ready', 'downloaded')
      `;
      const row = rows[0];
      if (!row) throw new RepositoryError("conflict", "The export preview is unavailable");
      if (sha256(row.csv_content) !== row.csv_sha256) {
        throw new RepositoryError("database_error", "The saved CSV integrity check failed");
      }
      const previewLimit = Math.min(row.row_count, 10);
      const records = parseCsvRecords(row.csv_content, previewLimit + 1);
      const headers = records[0];
      const previewRows = records.slice(1);
      if (
        !headers ||
        headers.length !== row.column_count ||
        previewRows.length !== previewLimit ||
        previewRows.some((record) => record.length !== row.column_count)
      ) {
        throw new RepositoryError("database_error", "The saved CSV shape check failed");
      }
      return {
        batchId: row.id,
        formatVersion: row.format_version,
        filename: row.filename,
        sha256: row.csv_sha256,
        columnCount: row.column_count,
        totalRowCount: row.row_count,
        previewRowCount: previewRows.length,
        truncated: row.row_count > previewRows.length,
        headers,
        rows: previewRows,
      };
    });
  }

  async confirmImport(
    workspaceId: string,
    batchId: string,
    actor: RequestActor,
    input: ConfirmAccountingImportRequest,
  ): Promise<VersionedAccountingExportResponse> {
    return this.run(workspaceId, actor, async (transaction) => {
      const payloadHash = sha256(JSON.stringify(input));
      const before = await transaction<ExportBatchRow[]>`
        select * from export_batch
        where workspace_id = ${workspaceId} and id = ${batchId} for update
      `;
      const row = before[0];
      if (!row) throw new RepositoryError("conflict", "The export batch is unavailable");
      if (row.import_idempotency_key) {
        if (
          row.import_idempotency_key !== input.idempotencyKey ||
          row.import_payload_hash !== payloadHash
        ) {
          throw new RepositoryError(
            "conflict",
            "The import confirmation already has another payload",
          );
        }
        return toExportResponse(workspaceId, row);
      }
      const changed = await transaction<ExportBatchRow[]>`
        update export_batch
        set state = 'import_confirmed', import_result = ${input.result},
            imported_row_count = ${input.importedRowCount}, import_note = ${input.note},
            import_idempotency_key = ${input.idempotencyKey}, import_payload_hash = ${payloadHash}
        where workspace_id = ${workspaceId} and id = ${batchId} and state = 'downloaded'
        returning *
      `;
      const after = changed[0];
      if (!after) {
        throw new RepositoryError("conflict", "Download the file before confirming manual import");
      }
      await audit(
        transaction,
        workspaceId,
        actor.identityId,
        "accounting.export.import_confirmed",
        batchId,
        { state: "downloaded" },
        { state: "import_confirmed", result: input.result, rowCount: input.importedRowCount },
        "manual_import_result_human_confirmed",
      );
      return toExportResponse(workspaceId, after);
    });
  }

  async close(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }

  private async run<T>(
    workspaceId: string,
    actor: RequestActor,
    action: (transaction: postgres.TransactionSql) => Promise<T>,
  ): Promise<T> {
    try {
      return (await this.sql.begin(async (transaction) => {
        await transaction`select set_config('app.workspace_id', ${workspaceId}, true)`;
        await transaction`select set_config('app.identity_id', ${actor.identityId}, true)`;
        const roles = await transaction<Array<{ role: string }>>`
          select role from workspace_membership
          where workspace_id = ${workspaceId} and identity_id = ${actor.identityId}
            and active and role in ('owner', 'accounting')
        `;
        if (!roles[0]) throw new RepositoryError("forbidden", "Accounting role is required");
        return action(transaction);
      })) as T;
    } catch (error) {
      if (error instanceof RepositoryError) throw error;
      const code =
        typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
      if (["23505", "23514", "40001", "P0001"].includes(code)) {
        throw new RepositoryError("conflict", "The accounting operation was blocked safely");
      }
      throw new RepositoryError("database_error", "The accounting operation failed safely");
    }
  }
}

interface AccountingProfileRow {
  workspace_id: string;
  business_context: AccountingProfileResponse["businessContext"];
  filing_context: AccountingProfileResponse["filingContext"];
  consumption_tax_treatment: AccountingProfileResponse["consumptionTaxTreatment"];
  invoice_registration_status: AccountingProfileResponse["invoiceRegistrationStatus"];
  bookkeeping_method: AccountingProfileResponse["bookkeepingMethod"];
  revision: number;
  human_confirmed_by: string | null;
  human_confirmed_at: Date | null;
  updated_at: Date;
}

interface MappingRuleRow {
  id: string;
  event_type: AccountMappingRuleResponse["eventType"];
  rule_version: string;
  debit_account: string;
  debit_subaccount: string;
  debit_tax_category: string;
  debit_invoice_category: AccountMappingRuleResponse["debitInvoiceCategory"];
  credit_account: string;
  credit_subaccount: string;
  credit_tax_category: string;
  credit_invoice_category: AccountMappingRuleResponse["creditInvoiceCategory"];
  effective_from: Date;
  effective_until: Date | null;
  status: AccountMappingRuleResponse["status"];
  approved_by: string | null;
  approved_at: Date | null;
  replaces_rule_id: string | null;
  change_reason_code: AccountMappingRuleResponse["changeReasonCode"];
}

interface MappedEventRow extends MappingRuleRow {
  id: string;
  mapping_rule_id: string;
  amount_minor: string;
  tax_basis: "tax_included" | "tax_excluded" | "unknown";
  occurred_on: string;
  source_meaning: string;
}

interface ExportBatchRow {
  id: string;
  order_id: string;
  format: AccountingExportFormat;
  format_version: VersionedAccountingExportResponse["formatVersion"];
  filename: VersionedAccountingExportResponse["filename"];
  csv_sha256: string;
  source_set_sha256: string;
  schema_sha256: string;
  fixture_sha256: string;
  row_count: number;
  column_count: 19 | 27;
  csv_content: string;
  state: VersionedAccountingExportResponse["state"] | "preparing" | "failed";
  supersedes_batch_id: string | null;
  payload_hash: string;
  created_at: Date;
  import_idempotency_key: string | null;
  import_payload_hash: string | null;
}

async function requireProfile(
  sql: postgres.TransactionSql,
  workspaceId: string,
): Promise<AccountingProfileResponse> {
  const rows = await sql<AccountingProfileRow[]>`
    select workspace_id, business_context, filing_context, consumption_tax_treatment,
           invoice_registration_status, bookkeeping_method, revision,
           human_confirmed_by, human_confirmed_at, updated_at
    from accounting_profile where workspace_id = ${workspaceId}
  `;
  const row = rows[0];
  if (!row) throw new RepositoryError("database_error", "The accounting profile is unavailable");
  return {
    workspaceId: row.workspace_id,
    businessContext: row.business_context,
    filingContext: row.filing_context,
    consumptionTaxTreatment: row.consumption_tax_treatment,
    invoiceRegistrationStatus: row.invoice_registration_status,
    bookkeepingMethod: row.bookkeeping_method,
    revision: row.revision,
    humanConfirmedBy: row.human_confirmed_by,
    humanConfirmedAt: row.human_confirmed_at?.toISOString() ?? null,
    updatedAt: row.updated_at.toISOString(),
  };
}

function profileConfigured(profile: AccountingProfileResponse): boolean {
  return (
    profile.businessContext !== "unconfigured" &&
    profile.filingContext !== "unconfigured" &&
    profile.consumptionTaxTreatment !== "unconfigured" &&
    profile.invoiceRegistrationStatus !== "unconfigured" &&
    profile.bookkeepingMethod !== "unconfigured" &&
    Boolean(profile.humanConfirmedBy && profile.humanConfirmedAt)
  );
}

async function selectMappingRules(
  sql: postgres.TransactionSql,
  workspaceId: string,
): Promise<MappingRuleRow[]> {
  return sql<MappingRuleRow[]>`
    select id, event_type, rule_version, debit_account, debit_subaccount,
           debit_tax_category, debit_invoice_category, credit_account, credit_subaccount,
           credit_tax_category, credit_invoice_category, effective_from, effective_until,
           status, approved_by, approved_at, replaces_rule_id, change_reason_code
    from account_mapping_rule where workspace_id = ${workspaceId}
    order by event_type, effective_from desc
  `;
}

function toMappingRule(row: MappingRuleRow): AccountMappingRuleResponse {
  return {
    ruleId: row.id,
    eventType: row.event_type,
    version: row.rule_version,
    debitAccount: row.debit_account,
    debitSubaccount: row.debit_subaccount,
    debitTaxCategory: row.debit_tax_category,
    debitInvoiceCategory: row.debit_invoice_category,
    creditAccount: row.credit_account,
    creditSubaccount: row.credit_subaccount,
    creditTaxCategory: row.credit_tax_category,
    creditInvoiceCategory: row.credit_invoice_category,
    effectiveFrom: row.effective_from.toISOString(),
    effectiveUntil: row.effective_until?.toISOString() ?? null,
    status: row.status,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at?.toISOString() ?? null,
    replacesRuleId: row.replaces_rule_id,
    changeReasonCode: row.change_reason_code,
    confirmationStatus: row.approved_by && row.approved_at ? "human_confirmed" : "candidate",
  };
}

async function selectMappedEvents(
  sql: postgres.TransactionSql,
  workspaceId: string,
  orderId: string,
): Promise<MappedEventRow[]> {
  return sql<MappedEventRow[]>`
    select event.id, event.amount_minor::text as amount_minor, event.tax_basis,
           to_char(event.occurred_at at time zone 'Asia/Tokyo', 'YYYY-MM-DD') as occurred_on,
           event.source_meaning, mapping.id as mapping_rule_id, mapping.event_type,
           mapping.rule_version, mapping.debit_account, mapping.debit_subaccount,
           mapping.debit_tax_category, mapping.debit_invoice_category,
           mapping.credit_account, mapping.credit_subaccount, mapping.credit_tax_category,
           mapping.credit_invoice_category, mapping.effective_from, mapping.effective_until,
           mapping.status, mapping.approved_by, mapping.approved_at
    from financial_event event
    join account_mapping_rule mapping
      on mapping.workspace_id = event.workspace_id
     and mapping.event_type = event.event_type
     and mapping.status in ('active', 'retired')
     and mapping.approved_by is not null
     and mapping.approved_at is not null
     and event.occurred_at >= mapping.effective_from
     and (mapping.effective_until is null or event.occurred_at < mapping.effective_until)
    where event.workspace_id = ${workspaceId} and event.order_id = ${orderId}
    order by event.occurred_at, event.id
  `;
}

function toVersionedCandidate(
  row: MappedEventRow,
  ordinal: number,
  actorId: string,
  approvedAt: string,
): VersionedJournalCandidate {
  const amount = Number(row.amount_minor);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new RepositoryError("conflict", "Financial event amount must be a positive JPY integer");
  }
  return {
    id: row.id,
    transactionNumber: String(ordinal),
    occurredOn: row.occurred_on,
    debitAccount: row.debit_account,
    debitSubaccount: row.debit_subaccount,
    debitTaxCategory: row.debit_tax_category,
    debitInvoiceCategory: row.debit_invoice_category,
    debitAmount: amount,
    creditAccount: row.credit_account,
    creditSubaccount: row.credit_subaccount,
    creditTaxCategory: row.credit_tax_category,
    creditInvoiceCategory: row.credit_invoice_category,
    creditAmount: amount,
    description: `取引イベント: ${row.event_type}`,
    memo: "人が原資料と勘定科目候補を確認済み",
    tags: "P0|手動確認",
    sourceReferenceId: row.id,
    evidenceReferenceId: row.id,
    mappingRuleVersion: row.rule_version,
    financialFormulaVersion: FINANCIAL_FORMULA_VERSION,
    humanApprovedBy: actorId,
    humanApprovedAt: approvedAt,
    unresolvedReason: null,
  };
}

function toExportResponse(
  workspaceId: string,
  row: ExportBatchRow,
): VersionedAccountingExportResponse {
  if (row.state === "preparing" || row.state === "failed") {
    throw new RepositoryError("conflict", "The export is not ready");
  }
  return {
    batchId: row.id,
    orderId: row.order_id,
    format: row.format,
    formatVersion: row.format_version,
    filename: row.filename,
    sha256: row.csv_sha256,
    sourceSetSha256: row.source_set_sha256,
    schemaSha256: row.schema_sha256,
    fixtureSha256: row.fixture_sha256,
    rowCount: row.row_count,
    columnCount: row.column_count,
    state: row.state,
    supersedesBatchId: row.supersedes_batch_id,
    contentUrl: `/v1/workspaces/${workspaceId}/accounting/exports/${row.id}/download`,
    createdAt: row.created_at.toISOString(),
  };
}

async function advanceAccountingWorkflow(
  sql: postgres.TransactionSql,
  workspaceId: string,
  orderId: string,
  actorId: string,
  idempotencyKey: string,
  batchId: string,
): Promise<void> {
  const rows = await sql<Array<{ sku_id: string; state: string; version: number }>>`
    select unit.sku_id, workflow.state, workflow.version
    from order_allocation allocation
    join inventory_unit unit
      on unit.workspace_id = allocation.workspace_id and unit.id = allocation.inventory_unit_id
    join p0_workflow workflow
      on workflow.workspace_id = unit.workspace_id and workflow.sku_id = unit.sku_id
    where allocation.workspace_id = ${workspaceId} and allocation.order_id = ${orderId}
      and allocation.active
    for update of workflow
  `;
  const workflow = rows[0];
  if (!workflow) throw new RepositoryError("conflict", "The order has no active SKU workflow");
  if (workflow.state === "journal_approved") return;
  if (workflow.state !== "shipped") {
    throw new RepositoryError("conflict", "The SKU must be shipped before journal approval");
  }
  const nextVersion = workflow.version + 1;
  const payloadHash = sha256(JSON.stringify({ action: "approve_journal", orderId, batchId }));
  await sql`
    update p0_workflow
    set state = 'journal_approved', last_action = 'approve_journal',
        version = ${nextVersion}, updated_at = statement_timestamp()
    where workspace_id = ${workspaceId} and sku_id = ${workflow.sku_id}
  `;
  await sql`
    insert into p0_workflow_action (
      workspace_id, sku_id, action, actor_id, evidence_reference_ids,
      idempotency_key, payload_hash, response_state, response_version
    ) values (
      ${workspaceId}, ${workflow.sku_id}, 'approve_journal', ${actorId}, ${[batchId]},
      ${idempotencyKey}, ${payloadHash}, 'journal_approved', ${nextVersion}
    )
  `;
  await audit(
    sql,
    workspaceId,
    actorId,
    "approve_journal",
    workflow.sku_id,
    { state: workflow.state, version: workflow.version },
    { state: "journal_approved", version: nextVersion, exportBatchId: batchId },
    "accounting_export_human_approved",
  );
  await sql`
    insert into outbox_event (workspace_id, event_type, aggregate_type, aggregate_id, payload)
    values (
      ${workspaceId}, 'p0.workflow.advanced', 'product_sku', ${workflow.sku_id},
      ${sql.json({ action: "approve_journal", state: "journal_approved", version: nextVersion })}
    )
  `;
}

async function audit(
  sql: postgres.TransactionSql,
  workspaceId: string,
  actorId: string,
  action: string,
  targetId: string,
  before: Record<string, postgres.JSONValue>,
  after: Record<string, postgres.JSONValue>,
  reasonCode: string,
  referenceIds: string[] = [],
): Promise<void> {
  await sql`
    insert into audit_event (
      workspace_id, actor_id, action, target_type, target_id,
      field_names, redacted_changes, reference_ids, reason_code, approved_by
    ) values (
      ${workspaceId}, ${actorId}, ${action}, 'accounting_control', ${targetId},
      ${Object.keys(after)}, ${sql.json({ before, after })}, ${referenceIds},
      ${reasonCode}, ${actorId}
    )
  `;
}

function mappingAccountingFieldsChanged(
  current: MappingRuleRow,
  input: ReplaceAccountMappingRuleRequest,
): boolean {
  return (
    current.debit_account !== input.debitAccount ||
    current.debit_subaccount !== input.debitSubaccount ||
    current.debit_tax_category !== input.debitTaxCategory ||
    current.debit_invoice_category !== input.debitInvoiceCategory ||
    current.credit_account !== input.creditAccount ||
    current.credit_subaccount !== input.creditSubaccount ||
    current.credit_tax_category !== input.creditTaxCategory ||
    current.credit_invoice_category !== input.creditInvoiceCategory
  );
}

function accountingDateInTokyo(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const dateParts = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseCsvRecords(csv: string, maxRecords: number): string[][] {
  if (!Number.isInteger(maxRecords) || maxRecords < 1 || maxRecords > 11) {
    throw new Error("CSV preview record limit is invalid");
  }
  const source = csv.startsWith("\uFEFF") ? csv.slice(1) : csv;
  const records: string[][] = [];
  let record: string[] = [];
  let cell = "";
  let inQuotes = false;
  let quotedCell = false;
  let closedQuote = false;

  const pushCell = () => {
    record.push(cell);
    cell = "";
    quotedCell = false;
    closedQuote = false;
  };
  const pushRecord = () => {
    pushCell();
    records.push(record);
    record = [];
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index] ?? "";
    if (inQuotes) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
          closedQuote = true;
        }
      } else {
        cell += character;
      }
    } else if (closedQuote && character !== "," && character !== "\r" && character !== "\n") {
      throw new Error("CSV has characters after a closing quote");
    } else if (character === '"') {
      if (cell.length > 0 || quotedCell) throw new Error("CSV quote is in an invalid position");
      inQuotes = true;
      quotedCell = true;
    } else if (character === ",") {
      pushCell();
    } else if (character === "\r" || character === "\n") {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      pushRecord();
      if (records.length === maxRecords) return records;
    } else {
      cell += character;
    }
    if (cell.length > 500) throw new Error("CSV preview cell exceeds the safe display limit");
  }
  if (inQuotes) throw new Error("CSV quoted field is incomplete");
  if (cell.length > 0 || record.length > 0 || quotedCell || closedQuote) pushRecord();
  return records;
}
