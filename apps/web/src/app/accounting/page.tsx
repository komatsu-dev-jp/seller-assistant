import { AppSidebar } from "../../components/app-sidebar";
import {
  AccountingPageWorkspace,
  type AccountingPageFormat,
} from "../../components/accounting-page-workspace";
import type { AccountingMobileStage } from "../../components/accounting-workspace";
import { requirePageSession } from "../../lib/server-session";
import styles from "../../components/accounting-live-layout.module.css";

export const dynamic = "force-dynamic";

const accountingStages = new Set<AccountingMobileStage>([
  "format",
  "profile",
  "mappings",
  "export",
  "preview",
  "import",
  "history",
]);

function firstQueryValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function initialAccountingStage(value: string | string[] | undefined): AccountingMobileStage {
  const stage = firstQueryValue(value);
  return stage && accountingStages.has(stage as AccountingMobileStage)
    ? (stage as AccountingMobileStage)
    : "format";
}

function initialAccountingFormat(value: string | string[] | undefined): AccountingPageFormat {
  return firstQueryValue(value) === "generic_journal_v1"
    ? "generic_journal_v1"
    : "money_forward_journal_v1";
}

export default async function AccountingPage({
  searchParams,
}: {
  searchParams: Promise<{
    stage?: string | string[];
    format?: string | string[];
  }>;
}) {
  const query = await searchParams;
  const initialStage = initialAccountingStage(query.stage);
  const initialFormat = initialAccountingFormat(query.format);
  const returnTo = `/accounting?stage=${initialStage}&format=${initialFormat}`;
  const session = await requirePageSession(["owner", "accounting"], returnTo);
  return (
    <main className={`shell ${styles.page}`}>
      <AppSidebar current="accounting" />
      <section className="content workflowContent">
        <header className="topbar">
          <div>
            <h1>会計</h1>
            <p>売上の記録を確認し、会計ソフトへ渡すファイルを準備します。</p>
          </div>
          <span className="zeroCostBadge">外部接続 0件</span>
        </header>
        <AccountingPageWorkspace
          workspaceId={session.workspaceId}
          initialStage={initialStage}
          initialFormat={initialFormat}
        />
      </section>
    </main>
  );
}
