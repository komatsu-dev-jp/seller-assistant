import type { VersionedAccountingExportResponse } from "@resale/contracts";

export type ActiveAccountingExport = VersionedAccountingExportResponse & {
  state: "ready" | "downloaded";
};

export function isActiveAccountingExport(
  candidate: VersionedAccountingExportResponse,
): candidate is ActiveAccountingExport {
  return candidate.state === "ready" || candidate.state === "downloaded";
}

export function selectActiveAccountingExport(
  exports: VersionedAccountingExportResponse[],
  preferredFormat: VersionedAccountingExportResponse["format"],
): ActiveAccountingExport | null {
  return (
    exports.find(
      (candidate): candidate is ActiveAccountingExport =>
        candidate.format === preferredFormat && isActiveAccountingExport(candidate),
    ) ?? null
  );
}

export function applyAccountingImportConfirmation(
  exports: readonly VersionedAccountingExportResponse[],
  confirmed: VersionedAccountingExportResponse,
  preferredFormat: VersionedAccountingExportResponse["format"],
): {
  history: VersionedAccountingExportResponse[];
  active: ActiveAccountingExport | null;
} {
  const history = exports.map((entry) => (entry.batchId === confirmed.batchId ? confirmed : entry));
  return {
    history,
    active: selectActiveAccountingExport(history, preferredFormat),
  };
}

export function isAccountingImportActionDisabled(
  candidate: VersionedAccountingExportResponse | null,
  busy: boolean,
): boolean {
  return busy || candidate?.state !== "downloaded";
}

export function mergeCreatedAccountingExport(
  exports: readonly VersionedAccountingExportResponse[],
  created: VersionedAccountingExportResponse,
  supersededBatchId: string | null,
): VersionedAccountingExportResponse[] {
  return [
    created,
    ...exports
      .filter((entry) => entry.batchId !== created.batchId)
      .map((entry) =>
        entry.batchId === supersededBatchId ? { ...entry, state: "superseded" as const } : entry,
      ),
  ];
}
