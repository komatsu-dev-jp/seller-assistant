"use client";

import type {
  MeasurementResponse,
  OrderOperationResponse,
  P0ItemResponse,
  PilotRunResponse,
} from "@resale/contracts";
import {
  listingPrepPilotFixtureManifestSha256,
  listingPrepPilotFixtureProfiles,
  listingPrepPilotFixtures,
  listingPrepPilotMigrationVersion,
  listingPrepPilotProtocolVersion,
} from "@resale/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearCaptureUploads,
  loadCaptureUploads,
  markCaptureUploaded,
  prepareCaptureUpload,
} from "../lib/capture-outbox";
import {
  categoryTemplates,
  completeMeasurements,
  measurementDefinitionsFor,
  templateForCategory,
} from "../lib/measurement-profile";
import { recoverablePilotCorrection } from "../lib/pilot-correction";
import { AccountingWorkspace } from "./accounting-workspace";
import { ProductResearchPanel } from "./product-research-panel";

type Stage = "purchase" | "capture" | "listing" | "order" | "accounting";
type PhotoRole = "front" | "back" | "brand_tag" | "care_label";

const stages: ReadonlyArray<{ id: Stage; label: string }> = [
  { id: "purchase", label: "仕入" },
  { id: "capture", label: "撮影・採寸" },
  { id: "listing", label: "出品準備" },
  { id: "order", label: "注文・発送" },
  { id: "accounting", label: "収支・会計" },
];
const photoRoles: ReadonlyArray<{ id: PhotoRole; label: string }> = [
  { id: "front", label: "正面" },
  { id: "back", label: "背面" },
  { id: "brand_tag", label: "ブランドタグ" },
  { id: "care_label", label: "品質表示" },
];

type PilotEventType =
  | "invalid_attempt"
  | "missing_required_image"
  | "measurement_rework"
  | "label_location_mismatch"
  | "misputaway"
  | "network_retry"
  | "manual_correction";

type PendingPilotEvent = {
  workspaceId: string;
  runId: string;
  eventType: PilotEventType;
  detailCode: string;
  idempotencyKey: string;
};

class ExpectedPilotReworkError extends Error {}
class PilotEventSyncPendingError extends Error {}
class HttpResponseError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function P0Workspace({ workspaceId }: { workspaceId: string }) {
  const [stage, setStage] = useState<Stage>("purchase");
  const [items, setItems] = useState<P0ItemResponse[]>([]);
  const [selectedSkuId, setSelectedSkuId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [photos, setPhotos] = useState<Partial<Record<PhotoRole, File>>>({});
  const [measurements, setMeasurements] = useState<Record<string, string>>({});
  const [measurementReviewReason, setMeasurementReviewReason] = useState("");
  const [addressLeaseId, setAddressLeaseId] = useState<string | null>(null);
  const [shippingAddressView, setShippingAddressView] = useState<string | null>(null);
  const [assignmentMessage, setAssignmentMessage] = useState("");
  const [pilotRun, setPilotRun] = useState<PilotRunResponse | null>(null);
  const [pendingPilotEventCount, setPendingPilotEventCount] = useState(0);
  const pageInstanceId = useRef(crypto.randomUUID()).current;
  const initialPilotResumeChecked = useRef(false);

  const item = items.find((candidate) => candidate.skuId === selectedSkuId) ?? items[0] ?? null;
  const activeMeasurementDefinitions = measurementDefinitionsFor(item?.measurementProfile ?? null);
  const refreshItems = useCallback(async () => {
    const result = await requestJson<P0ItemResponse[]>(`/v1/workspaces/${workspaceId}/p0-items`);
    setItems(result);
    setSelectedSkuId((current) =>
      current && result.some((candidate) => candidate.skuId === current)
        ? current
        : (result[0]?.skuId ?? null),
    );
  }, [workspaceId]);
  const refreshPilotRun = useCallback(async () => {
    const result = await requestJson<PilotRunResponse | null>(
      `/v1/workspaces/${workspaceId}/pilot-runs/latest`,
    );
    setPilotRun(result);
  }, [workspaceId]);
  const syncPendingPilotEvents = useCallback(
    async (runId?: string): Promise<PilotRunResponse | null> => {
      try {
        const result = await flushPendingPilotEvents(workspaceId, runId);
        setPendingPilotEventCount(result.remainingCount);
        if (result.latestRun && runId) setPilotRun(result.latestRun);
        if (!runId) await refreshPilotRun();
        return result.latestRun;
      } catch (reason) {
        setPendingPilotEventCount(countPendingPilotEvents(workspaceId, runId));
        throw reason;
      }
    },
    [refreshPilotRun, workspaceId],
  );

  useEffect(() => {
    refreshItems()
      .catch((reason: unknown) => setError(errorMessage(reason)))
      .finally(() => setLoading(false));
  }, [refreshItems]);

  useEffect(() => {
    refreshPilotRun().catch((reason: unknown) => setError(errorMessage(reason)));
  }, [refreshPilotRun]);

  useEffect(() => {
    setPendingPilotEventCount(countPendingPilotEvents(workspaceId));
    const retry = () => {
      void syncPendingPilotEvents().catch(() => undefined);
    };
    retry();
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [syncPendingPilotEvents, workspaceId]);

  useEffect(() => {
    if (!pilotRun || initialPilotResumeChecked.current) return;
    initialPilotResumeChecked.current = true;
    const incomplete = pilotRun.items.find((candidate) => candidate.completedAt === null);
    if (pilotRun.state !== "active" || !incomplete) return;
    const marker = readPilotActiveMarker(workspaceId);
    if (
      marker?.pilotRunId === pilotRun.runId &&
      marker.skuId === incomplete.skuId &&
      marker.pageInstanceId === pageInstanceId
    ) {
      return;
    }
    const event: PendingPilotEvent = {
      workspaceId,
      runId: pilotRun.runId,
      eventType: "invalid_attempt",
      detailCode: "browser_reload_or_reopen",
      idempotencyKey: crypto.randomUUID(),
    };
    void postPilotEventRequest(event)
      .then((updated) => {
        setPilotRun(updated);
        sessionStorage.removeItem(pilotActiveMarkerKey(workspaceId));
        setError("途中の再読み込みを検知したため、このパイロット試行は失敗として保存しました。");
      })
      .catch(() => {
        enqueuePilotEvent(event);
        setPendingPilotEventCount(countPendingPilotEvents(workspaceId, pilotRun.runId));
      });
  }, [pageInstanceId, pilotRun, workspaceId]);

  useEffect(() => {
    if (loading || !item) return;
    setStage((current) => (current === "purchase" ? nextStageForItem(item) : current));
  }, [item, loading]);

  useEffect(() => {
    if (!item) return;
    const restored = Object.fromEntries(
      activeMeasurementDefinitions.map((definition) => [definition.definitionId, ""]),
    ) as Record<string, string>;
    for (const measurement of item.capture.measurements) {
      if (measurement.definitionId in restored) {
        restored[measurement.definitionId] = String(measurement.value);
      }
    }
    setMeasurements(restored);
  }, [activeMeasurementDefinitions, item]);

  useEffect(() => {
    let cancelled = false;
    setPhotos({});
    if (!item || workflowStateRank(item.workflowState) >= workflowStateRank("capture_confirmed")) {
      return () => {
        cancelled = true;
      };
    }
    const skuId = item.skuId;
    void loadCaptureUploads(workspaceId, skuId)
      .then((records) => {
        if (cancelled) return;
        const restored: Partial<Record<PhotoRole, File>> = {};
        for (const record of records) restored[record.role] = record.file;
        setPhotos(restored);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [item?.skuId, item?.workflowState, workspaceId]);

  const workflowRank = workflowStateRank(item?.workflowState);
  const completed: Record<Stage, boolean> = {
    purchase: Boolean(item),
    capture: workflowRank >= workflowStateRank("capture_confirmed"),
    listing: workflowRank >= workflowStateRank("listing_confirmed"),
    order: item?.orderState === "shipped" || item?.orderState === "returned",
    accounting: workflowRank >= workflowStateRank("journal_approved"),
  };
  const measurementComplete = completeMeasurements(activeMeasurementDefinitions, measurements);
  const description = item?.listingCandidate.text ?? "商品情報を読み込んでいます。";
  const activePilotItem =
    pilotRun?.state === "active" && item
      ? (pilotRun.items.find((candidate) => candidate.skuId === item.skuId) ?? null)
      : null;
  const lastPilotItem = pilotRun?.items.at(-1) ?? null;
  const canStartNextPilotItem =
    pilotRun?.state === "active" && (!lastPilotItem || lastPilotItem.completedAt !== null);
  const nextPilotFixture = canStartNextPilotItem
    ? (listingPrepPilotFixtures[pilotRun.items.length] ?? null)
    : null;
  const nextPilotProfile = nextPilotFixture
    ? (listingPrepPilotFixtureProfiles.find((profile) => profile.fixtureId === nextPilotFixture) ??
      null)
    : null;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (reason) {
      const correction =
        reason instanceof HttpResponseError
          ? recoverablePilotCorrection(
              reason.status,
              reason.message,
              pilotRun?.protocolVersion ?? null,
              activePilotItem?.completedAt === null,
            )
          : null;
      const visibleReason = correction ? new ExpectedPilotReworkError(correction.message) : reason;
      if (correction) await recordPilotEvent("manual_correction", correction.detailCode);
      if (activePilotItem && activePilotItem.completedAt === null) {
        if (
          !(visibleReason instanceof ExpectedPilotReworkError) &&
          !(visibleReason instanceof PilotEventSyncPendingError)
        ) {
          if (visibleReason instanceof TypeError) {
            await recordPilotEvent("network_retry", "request_transport_error");
          }
          await recordPilotEvent("invalid_attempt", "workflow_action_error");
        }
      }
      setError(errorMessage(visibleReason));
    } finally {
      setBusy(false);
    }
  }

  async function ensurePilotEventsSynced(): Promise<void> {
    if (!pilotRun || pilotRun.state !== "active") return;
    try {
      const updated = await syncPendingPilotEvents(pilotRun.runId);
      if (countPendingPilotEvents(workspaceId, pilotRun.runId) > 0) {
        throw new Error("pending pilot events remain");
      }
      if (updated && updated.state !== "active") {
        throw new PilotEventSyncPendingError(
          "同期待ちの例外記録により、このパイロットは不合格になりました。画面を更新して通常作業として続けてください。",
        );
      }
    } catch (reason) {
      if (reason instanceof PilotEventSyncPendingError) throw reason;
      throw new PilotEventSyncPendingError(
        "パイロットの例外記録が同期待ちです。再送が完了するまで、次の計測操作には進めません。",
      );
    }
  }

  async function createPurchase(form: FormData) {
    await run(async () => {
      if (textField(form, "pilotRunId")) await ensurePilotEventsSynced();
      const created = await requestJson<P0ItemResponse>(`/v1/workspaces/${workspaceId}/p0-items`, {
        method: "POST",
        body: JSON.stringify({
          skuCode: textField(form, "skuCode").toUpperCase(),
          title: textField(form, "title"),
          category: textField(form, "category"),
          measurementTemplateId: textField(form, "measurementTemplateId"),
          supplierName: textField(form, "supplierName"),
          receiptReference: textField(form, "receiptReference"),
          purchasedAt: new Date(textField(form, "purchasedAt")).toISOString(),
          receiptAmountMinor: numberField(form, "receiptAmountMinor"),
          allocatedCostMinor: numberField(form, "allocatedCostMinor"),
          idempotencyKey: crypto.randomUUID(),
          humanConfirmed: true,
          ...(textField(form, "pilotRunId") && textField(form, "productFixtureId")
            ? {
                pilot: {
                  runId: textField(form, "pilotRunId"),
                  productFixtureId: textField(form, "productFixtureId"),
                },
              }
            : {}),
        }),
      });
      const pilotRunId = textField(form, "pilotRunId");
      if (pilotRunId) {
        sessionStorage.setItem(
          pilotActiveMarkerKey(workspaceId),
          JSON.stringify({ pilotRunId, skuId: created.skuId, pageInstanceId }),
        );
      }
      await refreshItems();
      await refreshPilotRun();
      setSelectedSkuId(created.skuId);
      setStage("capture");
    });
  }

  async function confirmCapture() {
    if (!item) return;
    if (photoRoles.some(({ id }) => !photos[id])) {
      await recordPilotEvent("missing_required_image", "capture_confirm_without_four_photos");
      setError(requiredPhotoMessage());
      return;
    }
    if (!measurementComplete) {
      setError(requiredMeasurementMessage(activeMeasurementDefinitions));
      return;
    }
    await run(async () => {
      if (activePilotItem) await ensurePilotEventsSynced();
      const assetIds: string[] = [];
      for (const { id: role } of photoRoles) {
        const file = photos[role];
        if (!file) throw new Error(requiredPhotoMessage());
        const pending = await prepareCaptureUpload(workspaceId, item.skuId, role, file);
        if (!pending.uploaded) {
          await requestJson(
            `/v1/workspaces/${workspaceId}/skus/${item.skuId}/media-uploads?assetId=${pending.assetId}&role=${role}`,
            { method: "POST", body: pending.file, headers: { "content-type": pending.file.type } },
          );
          await markCaptureUploaded(pending.key);
        }
        assetIds.push(pending.assetId);
      }
      const measuredAt = new Date().toISOString();
      const savedMeasurements: Array<{ requiresReview: boolean }> = [];
      for (const definition of activeMeasurementDefinitions) {
        const definitionId = definition.definitionId;
        const previous = item.capture.measurements
          .filter((measurement) => measurement.definitionId === definitionId)
          .sort((left, right) => right.attempt - left.attempt)[0];
        if (
          previous &&
          previous.value === Number(measurements[definitionId]) &&
          !previous.requiresReview
        ) {
          savedMeasurements.push(previous);
          continue;
        }
        const saved = await requestJson<MeasurementResponse>(
          `/v1/workspaces/${workspaceId}/skus/${item.skuId}/measurements`,
          {
            method: "POST",
            body: JSON.stringify({
              definitionId,
              definitionVersion: definition.definitionVersion,
              value: Number(measurements[definitionId]),
              unit: "cm",
              basis: definition.basis,
              state: definition.state,
              measuredAt,
              evidenceAssetId: assetIds[0],
              attempt: (previous?.attempt ?? 0) + 1,
              reviewReasonCode: measurementReviewReason || undefined,
              humanConfirmed: true,
            }),
          },
        );
        savedMeasurements.push(saved);
      }
      const needsReview = savedMeasurements.filter((measurement) => measurement.requiresReview);
      await refreshItems();
      if (needsReview.length > 0) {
        let remainingReworkEvents = needsReview.length;
        while (remainingReworkEvents > 0) {
          await recordPilotEvent("measurement_rework", "difference_over_two_cm");
          remainingReworkEvents -= 1;
        }
        throw new ExpectedPilotReworkError(
          "前回との差が2cmを超えています。再測定し、正しい場合は確認理由を選んで再保存してください。",
        );
      }
      await advanceWorkflow(item.skuId, "confirm_capture", assetIds, false);
      await clearCaptureUploads(workspaceId, item.skuId);
      await refreshItems();
      setStage("listing");
    });
  }

  async function confirmListing() {
    if (
      !item ||
      item.listingCandidate.unconfirmedFields.length > 0 ||
      item.listingCandidate.referenceIds.length === 0
    )
      return;
    await run(async () => {
      if (activePilotItem) await ensurePilotEventsSynced();
      await advanceWorkflow(
        item.skuId,
        "confirm_listing",
        item.listingCandidate.referenceIds,
        true,
      );
      if (activePilotItem) sessionStorage.removeItem(pilotActiveMarkerKey(workspaceId));
      await navigator.clipboard?.writeText(description).catch(() => undefined);
      await refreshItems();
      await refreshPilotRun();
      setStage("order");
    });
  }

  async function advanceWorkflow(
    skuId: string,
    action: string,
    evidenceReferenceIds: string[],
    manualChannelHandoff: boolean,
  ) {
    return requestJson(`/v1/workspaces/${workspaceId}/skus/${skuId}/p0-actions`, {
      method: "POST",
      body: JSON.stringify({
        action,
        idempotencyKey: crypto.randomUUID(),
        evidenceReferenceIds,
        requiredFactsConfirmed: true,
        manualChannelHandoff,
      }),
    });
  }

  async function startPilot(form: FormData) {
    await run(async () => {
      try {
        await syncPendingPilotEvents();
      } catch {
        throw new PilotEventSyncPendingError(
          "以前のパイロット記録が同期待ちです。再送を完了してから新しい計測を開始してください。",
        );
      }
      if (countPendingPilotEvents(workspaceId) > 0) {
        throw new PilotEventSyncPendingError(
          "以前のパイロット記録が同期待ちです。再送を完了してから新しい計測を開始してください。",
        );
      }
      const warmupCompleted = form.get("warmupCompleted") === "on";
      if (!warmupCompleted) throw new Error("計測外の練習1点を確認してください。");
      const viewport = `${window.innerWidth}x${window.innerHeight}`;
      const created = await requestJson<PilotRunResponse>(
        `/v1/workspaces/${workspaceId}/pilot-runs`,
        {
          method: "POST",
          body: JSON.stringify({
            protocolVersion: listingPrepPilotProtocolVersion,
            fixtureManifestSha256: listingPrepPilotFixtureManifestSha256,
            commitSha: textField(form, "commitSha").toLowerCase(),
            migrationVersion: listingPrepPilotMigrationVersion,
            platform: navigator.platform || "Windows",
            browser: navigator.userAgent.slice(0, 200),
            viewport,
            warmupCompleted,
            humanConfirmed: warmupCompleted,
          }),
        },
      );
      setPilotRun(created);
      setStage("purchase");
    });
  }

  async function recordPilotEvent(eventType: PilotEventType, detailCode: string): Promise<void> {
    if (!pilotRun || pilotRun.state !== "active") return;
    const pending: PendingPilotEvent = {
      workspaceId,
      runId: pilotRun.runId,
      eventType,
      detailCode,
      idempotencyKey: crypto.randomUUID(),
    };
    try {
      const updated = await postPilotEventRequest(pending);
      setPilotRun(updated);
      if (updated.state !== "active") {
        sessionStorage.removeItem(pilotActiveMarkerKey(workspaceId));
      }
    } catch {
      enqueuePilotEvent(pending);
      setPendingPilotEventCount(countPendingPilotEvents(workspaceId, pilotRun.runId));
    }
  }

  async function createOrder(form: FormData) {
    if (!item || item.inventoryStatus !== "available") return;
    await run(async () => {
      await requestJson<OrderOperationResponse>(`/v1/workspaces/${workspaceId}/orders`, {
        method: "POST",
        body: JSON.stringify({
          orderNumber: textField(form, "orderNumber").toUpperCase(),
          skuId: item.skuId,
          inventoryUnitId: item.inventoryUnitId,
          saleAmountMinor: numberField(form, "saleAmountMinor"),
          costAmountMinor: item.allocatedCostMinor,
          sellingFeeMinor: numberField(form, "sellingFeeMinor"),
          shippingCostMinor: numberField(form, "shippingCostMinor"),
          packagingCostMinor: numberField(form, "packagingCostMinor"),
          taxBasis: "tax_included",
          sourceMeaning: "本人が公式販売画面と照合した手入力取引",
          occurredAt: new Date().toISOString(),
          shippingAddress: textField(form, "shippingAddress"),
          idempotencyKey: crypto.randomUUID(),
          humanConfirmed: true,
        }),
      });
      await refreshItems();
    });
  }

  async function issueAddressLease(orderId: string): Promise<string> {
    const result = await requestJson<{ leaseId: string }>(
      `/v1/workspaces/${workspaceId}/orders/${orderId}/address-leases`,
      {
        method: "POST",
        body: JSON.stringify({ purpose: "shipping_label", humanConfirmed: true }),
      },
    );
    setAddressLeaseId(result.leaseId);
    return result.leaseId;
  }

  async function assignShipping(form: FormData) {
    if (!item?.orderId) return;
    await run(async () => {
      const startsAt = new Date();
      const expiresAt = new Date(startsAt.getTime() + 8 * 60 * 60 * 1000);
      await requestJson(`/v1/workspaces/${workspaceId}/orders/${item.orderId}/assignment`, {
        method: "POST",
        body: JSON.stringify({
          assigneeEmail: textField(form, "assigneeEmail").toLowerCase(),
          startsAt: startsAt.toISOString(),
          expiresAt: expiresAt.toISOString(),
          humanConfirmed: true,
        }),
      });
      setAssignmentMessage(`発送担当を${expiresAt.toLocaleString("ja-JP")}まで割り当てました。`);
    });
  }

  async function progressOrder() {
    if (!item?.orderId) return;
    await run(async () => {
      const orderId = item.orderId as string;
      const leaseId = addressLeaseId ?? (await issueAddressLease(orderId));
      if (item.orderState === "confirmed") {
        if (!item.locationCode || !item.locationLabelVersion) {
          throw new Error("現在の保管場所と有効な場所ラベルが必要です。");
        }
        const now = Date.now();
        await requestJson(`/v1/workspaces/${workspaceId}/orders/${orderId}/pick`, {
          method: "POST",
          body: JSON.stringify({
            inventoryNumber: item.inventoryNumber,
            locationCode: item.locationCode,
            inventoryLabelVersion: item.inventoryLabelVersion,
            locationLabelVersion: item.locationLabelVersion,
            addressLeaseId: leaseId,
            inventoryScannedAt: new Date(now).toISOString(),
            locationScannedAt: new Date(now + 1).toISOString(),
            confirmedAt: new Date(now + 2).toISOString(),
            idempotencyKey: crypto.randomUUID(),
            humanConfirmed: true,
          }),
        });
      } else if (item.orderState === "picking") {
        await requestJson(`/v1/workspaces/${workspaceId}/orders/${orderId}/pack`, {
          method: "POST",
          body: JSON.stringify({
            packingEvidenceReferenceId: crypto.randomUUID(),
            addressLeaseId: leaseId,
            confirmedAt: new Date().toISOString(),
            idempotencyKey: crypto.randomUUID(),
            humanConfirmed: true,
          }),
        });
      } else if (item.orderState === "packed") {
        await requestJson(`/v1/workspaces/${workspaceId}/orders/${orderId}/ship`, {
          method: "POST",
          body: JSON.stringify({
            addressLeaseId: leaseId,
            shippedAt: new Date().toISOString(),
            idempotencyKey: crypto.randomUUID(),
            humanConfirmed: true,
          }),
        });
      }
      await refreshItems();
    });
  }

  async function revealShippingAddress() {
    if (!item?.orderId) return;
    await run(async () => {
      const leaseId = addressLeaseId ?? (await issueAddressLease(item.orderId as string));
      const result = await requestJson<{ shippingAddress: string; expiresAt: string }>(
        `/v1/workspaces/${workspaceId}/orders/${item.orderId}/address?leaseId=${leaseId}`,
      );
      setShippingAddressView(result.shippingAddress);
      const remaining = Math.max(0, Date.parse(result.expiresAt) - Date.now());
      window.setTimeout(() => setShippingAddressView(null), Math.min(remaining, 300_000));
    });
  }

  if (loading) return <p role="status">実データを読み込んでいます…</p>;

  return (
    <div className="workflowBoard">
      {error ? (
        <p className="accountingDisclaimer" role="alert">
          {error}
        </p>
      ) : null}
      <PilotPanel
        busy={busy}
        pilotRun={pilotRun}
        pendingEventCount={pendingPilotEventCount}
        nextFixture={nextPilotFixture}
        nextProfile={nextPilotProfile}
        onStart={startPilot}
        onRetryPending={() => {
          void run(async () => {
            try {
              await syncPendingPilotEvents(pilotRun?.runId);
            } catch {
              throw new PilotEventSyncPendingError(
                "例外記録をまだ送信できません。通信を確認して、もう一度再送してください。",
              );
            }
          });
        }}
      />
      <nav className="workflowStages" aria-label="試験商品の工程">
        {stages.map((entry, index) => (
          <button
            className={stage === entry.id ? "active" : completed[entry.id] ? "done" : ""}
            disabled={
              busy ||
              (entry.id !== "purchase" && !item) ||
              (!stages.slice(0, index).every((previous) => completed[previous.id]) &&
                entry.id !== "capture")
            }
            key={entry.id}
            type="button"
            onClick={() => setStage(entry.id)}
          >
            <span>{completed[entry.id] ? "✓" : index + 1}</span>
            {entry.label}
          </button>
        ))}
      </nav>

      {items.length > 0 ? (
        <section className="workflowItemSummary panel">
          <label>
            対象商品
            <select
              value={item?.skuId ?? ""}
              onChange={(event) => setSelectedSkuId(event.target.value)}
            >
              {items.map((entry) => (
                <option key={entry.skuId} value={entry.skuId}>
                  {entry.skuCode} / {entry.title}
                </option>
              ))}
            </select>
          </label>
          <div>
            <span>在庫番号</span>
            <strong>{item?.inventoryNumber}</strong>
          </div>
          <div>
            <span>状態</span>
            <strong>{item ? inventoryStatusLabel(item.inventoryStatus) : "—"}</strong>
          </div>
          <div>
            <span>現在地</span>
            <strong>{item?.locationCode ?? "未格納"}</strong>
          </div>
        </section>
      ) : null}

      {stage === "purchase" ? (
        <PurchasePanel
          key={nextPilotFixture ?? "standard-purchase"}
          busy={busy}
          onSubmit={createPurchase}
          item={item}
          pilotRunId={pilotRun?.state === "active" ? pilotRun.runId : null}
          pilotFixture={nextPilotFixture}
          pilotProfile={nextPilotProfile}
          pilotBlocked={pilotRun?.state === "active" && nextPilotFixture === null}
        />
      ) : null}

      {stage === "capture" && item ? (
        <section className="workflowPanel panel" aria-labelledby="capture-heading">
          <div className="workflowPanelHead">
            <div>
              <p className="eyebrow">CAPTURE</p>
              <h2 id="capture-heading">原本写真と平置き採寸</h2>
            </div>
            <span className={completed.capture ? "safeBadge" : "status"}>
              {completed.capture ? "DB保存済み" : "確認待ち"}
            </span>
          </div>
          <div className="photoChecklist">
            {photoRoles.map(({ id, label }) => (
              <label className={photos[id] ? "checked" : ""} key={id}>
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  onChange={(event) =>
                    setPhotos((current) => ({ ...current, [id]: event.target.files?.[0] }))
                  }
                />
                <span aria-hidden="true">{photos[id] ? "✓" : "＋"}</span>
                <strong>{label}</strong>
                <small>実ファイルを非公開保存</small>
              </label>
            ))}
          </div>
          <div className="measurementGrid">
            {activeMeasurementDefinitions.map((definition) => (
              <label key={definition.definitionId}>
                {definition.label}（{definition.basis}・{definition.state}）
                <span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0.1"
                    max="250"
                    step="0.1"
                    value={measurements[definition.definitionId] ?? ""}
                    onChange={(event) =>
                      setMeasurements((current) => ({
                        ...current,
                        [definition.definitionId]: event.target.value,
                      }))
                    }
                  />
                  cm
                </span>
              </label>
            ))}
          </div>
          <label className="fieldLabel">
            再測定の確認理由（差が2cmを超えた場合のみ）
            <select
              value={measurementReviewReason}
              onChange={(event) => setMeasurementReviewReason(event.target.value)}
            >
              <option value="">理由を選ばず初回保存</option>
              <option value="previous_entry_error">前回の入力誤りを修正</option>
              <option value="garment_stretch">伸縮素材を同じ方法で再確認</option>
              <option value="measurement_definition_corrected">測る位置を定義どおりに修正</option>
            </select>
          </label>
          <div className="humanGate">
            <div>
              <strong>写真4種と実測値を人が確認</strong>
              <p>サーバーがハッシュと寸法を計算し、原本を上書きしません。</p>
            </div>
            <button
              type="button"
              disabled={
                busy ||
                completed.capture ||
                !measurementComplete ||
                photoRoles.some(({ id }) => !photos[id])
              }
              onClick={() => void confirmCapture()}
            >
              {completed.capture ? "保存済み" : "写真と採寸を保存"}
            </button>
          </div>
          <WorkflowNext
            enabled={completed.capture}
            label="出品準備へ"
            onClick={() => setStage("listing")}
          />
        </section>
      ) : null}

      {stage === "listing" && item ? (
        <section className="workflowPanel panel" aria-labelledby="listing-heading">
          <div className="workflowPanelHead">
            <div>
              <p className="eyebrow">LISTING HANDOFF</p>
              <h2 id="listing-heading">確認済み事実から作る文章候補</h2>
            </div>
            <span className={completed.listing ? "safeBadge" : "status"}>
              {completed.listing ? "本人確認済み" : "候補"}
            </span>
          </div>
          <div className="candidateNotice">
            <strong>自動出品はしません</strong>
            <p>公式画面への貼り付けと公開は本人が行います。外部費用は0円です。</p>
          </div>
          <textarea aria-label="商品説明候補" readOnly rows={7} value={description} />
          <p className="candidateReferences">
            参照: 写真 {item.capture.photoAssetIds.length}件・採寸
            {item.capture.measurements.length}件
            {item.listingCandidate.unconfirmedFields.length > 0
              ? `／未確認: ${item.listingCandidate.unconfirmedFields.join("・")}`
              : "／未確認なし"}
          </p>
          <ProductResearchPanel
            workspaceId={workspaceId}
            skuId={item.skuId}
            attributeEvidence={item.capture.photoRoles.flatMap((role, index) => {
              const assetId = item.capture.photoAssetIds[index];
              return assetId && (role === "brand_tag" || role === "care_label")
                ? [{ assetId, role }]
                : [];
            })}
            onChanged={refreshItems}
          />
          <div className="humanGate">
            <div>
              <strong>コピー用内容を人が確認</strong>
              <p>
                {item.measurementProfile !== null && item.confirmedAttributes === null
                  ? "新しい採寸プロフィールの商品は、ブランド・サイズ・色を人が確認して保存するまで確定できません。"
                  : "未確認事実は自動補完しません。"}
              </p>
            </div>
            <button
              type="button"
              disabled={
                busy ||
                completed.listing ||
                item.listingCandidate.unconfirmedFields.length > 0 ||
                item.listingCandidate.referenceIds.length === 0 ||
                (item.measurementProfile !== null && item.confirmedAttributes === null)
              }
              onClick={() => void confirmListing()}
            >
              {completed.listing ? "確認済み" : "確認してコピー"}
            </button>
          </div>
          <WorkflowNext
            enabled={completed.listing}
            label="注文・発送へ"
            onClick={() => setStage("order")}
          />
        </section>
      ) : null}

      {stage === "order" && item ? (
        <OrderPanel
          item={item}
          busy={busy}
          addressLeaseId={addressLeaseId}
          shippingAddressView={shippingAddressView}
          onCreate={createOrder}
          onAssign={assignShipping}
          assignmentMessage={assignmentMessage}
          onProgress={progressOrder}
          onIssueLease={() => {
            const orderId = item.orderId;
            if (orderId)
              void run(async () => {
                await issueAddressLease(orderId);
              });
          }}
          onReveal={revealShippingAddress}
          onNext={() => setStage("accounting")}
        />
      ) : null}

      {stage === "accounting" && item ? (
        <AccountingWorkspace
          workspaceId={workspaceId}
          orderId={item.orderId}
          preferredFormat="generic_journal_v1"
        />
      ) : null}
    </div>
  );
}

function PilotPanel({
  busy,
  pilotRun,
  pendingEventCount,
  nextFixture,
  nextProfile,
  onStart,
  onRetryPending,
}: {
  busy: boolean;
  pilotRun: PilotRunResponse | null;
  pendingEventCount: number;
  nextFixture: (typeof listingPrepPilotFixtures)[number] | null;
  nextProfile: (typeof listingPrepPilotFixtureProfiles)[number] | null;
  onStart: (form: FormData) => Promise<void>;
  onRetryPending: () => void;
}) {
  const summary = pilotRun?.summary;
  const finished = pilotRun && pilotRun.state !== "active";
  return (
    <section className="pilotPanel panel" aria-labelledby="pilot-heading">
      <div className="workflowPanelHead">
        <div>
          <p className="eyebrow">10-PRODUCT LOCAL PILOT</p>
          <h2 id="pilot-heading">10商品・出品準備時間の実測</h2>
        </div>
        <span className={summary?.passed ? "safeBadge" : "status"}>
          {pilotRun ? `${summary?.completedItemCount ?? 0}/10・${pilotRun.state}` : "未開始"}
        </span>
      </div>
      <p className="accountingDisclaimer">
        Windowsの390×844表示・ローカルDB・架空商品だけで測ります。外部AI、販売サイト、Notion、Slack、会計サービスへ接続しません。
      </p>
      {pendingEventCount > 0 ? (
        <div className="candidateNotice" role="alert">
          <strong>例外記録 {pendingEventCount}件が同期待ちです</strong>
          <p>サーバー保存が完了するまで、商品完了やパイロット合格として扱いません。</p>
          <button type="button" disabled={busy} onClick={onRetryPending}>
            例外記録を再送
          </button>
        </div>
      ) : null}
      {pilotRun ? (
        <div className="pilotMetrics" aria-label="パイロット集計">
          <span>
            中央値{" "}
            <strong>{summary?.p50Seconds === null ? "—" : `${summary?.p50Seconds}秒`}</strong>
          </span>
          <span>
            P75 <strong>{summary?.p75Seconds === null ? "—" : `${summary?.p75Seconds}秒`}</strong>
          </span>
          <span>
            無効試行 <strong>{summary?.invalidAttemptCount ?? 0}</strong>
          </span>
          <span>
            再測定 <strong>{summary?.measurementReworkCount ?? 0}</strong>
          </span>
          <span>
            誤格納 <strong>{summary?.misputawayCount ?? 0}</strong>
          </span>
        </div>
      ) : null}
      {pilotRun?.state === "active" ? (
        <div className="candidateNotice">
          <strong>次の固定商品: {nextFixture ?? "前の商品を完了してください"}</strong>
          {nextProfile ? (
            <>
              <p>
                照合: manifest SHA-256 {listingPrepPilotFixtureManifestSha256.slice(0, 12)}…
                と、下記の相対パス・属性・採寸値を人が原本と照合します。 自動入力はしません。
              </p>
              <p>
                {nextProfile.title}／{nextProfile.categoryLabel}／{nextProfile.templateId} v
                {nextProfile.templateVersion}
              </p>
              <ul>
                {nextProfile.images.map((image) => (
                  <li key={image.role}>
                    {image.role}: {image.relativePath}
                  </li>
                ))}
              </ul>
              <p>
                期待属性: ブランド {nextProfile.attributes.brand}／サイズ{" "}
                {nextProfile.attributes.sizeLabel}
                ／色 {nextProfile.attributes.color}
              </p>
              <ul>
                {nextProfile.measurements.map((measurement) => (
                  <li key={measurement.definitionId}>
                    {measurement.label}: {measurement.value}
                    {measurement.unit}／定義v
                    {measurement.definitionVersion}／{measurement.basis}／{measurement.state}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
      {!pilotRun || finished ? (
        <form className="compactForm" action={onStart}>
          <label>
            計測対象commit SHA（40文字）
            <input
              name="commitSha"
              required
              minLength={40}
              maxLength={40}
              pattern="[a-fA-F0-9]{40}"
              placeholder="Gitの40文字の版番号"
              autoComplete="off"
            />
          </label>
          <label className="checkLine">
            <input name="warmupCompleted" type="checkbox" required />
            計測外の練習1点と、架空データだけを使うことを確認しました
          </label>
          <button disabled={busy || pendingEventCount > 0}>390×844で新しい10商品計測を開始</button>
        </form>
      ) : null}
    </section>
  );
}

function PurchasePanel({
  busy,
  onSubmit,
  item,
  pilotRunId,
  pilotFixture,
  pilotProfile,
  pilotBlocked,
}: {
  busy: boolean;
  onSubmit: (form: FormData) => Promise<void>;
  item: P0ItemResponse | null;
  pilotRunId: string | null;
  pilotFixture: (typeof listingPrepPilotFixtures)[number] | null;
  pilotProfile: (typeof listingPrepPilotFixtureProfiles)[number] | null;
  pilotBlocked: boolean;
}) {
  const [category, setCategory] = useState<string>(pilotProfile?.category ?? "tops");
  const measurementTemplateId = pilotProfile?.templateId ?? templateForCategory(category);
  return (
    <section className="workflowPanel panel" aria-labelledby="purchase-heading">
      <div className="workflowPanelHead">
        <div>
          <p className="eyebrow">PURCHASE</p>
          <h2 id="purchase-heading">仕入証憑と現物1点を登録</h2>
        </div>
        <span className={item ? "safeBadge" : "status"}>{item ? "DB保存済み" : "未登録"}</span>
      </div>
      <form action={onSubmit}>
        {pilotRunId && pilotFixture ? (
          <>
            <input name="pilotRunId" type="hidden" value={pilotRunId} />
            <input name="productFixtureId" type="hidden" value={pilotFixture} />
          </>
        ) : null}
        <div className="measurementGrid">
          <label>
            SKUコード
            <input
              name="skuCode"
              required
              defaultValue={pilotFixture ? `PILOT-${pilotFixture}` : ""}
              placeholder="例: SKU-2026-0001"
            />
          </label>
          <label>
            商品名
            <input
              name="title"
              required
              defaultValue={pilotProfile?.title ?? ""}
              readOnly={Boolean(pilotProfile)}
              placeholder="現物を確認して入力"
            />
          </label>
          <label>
            カテゴリ
            <select
              name="category"
              required
              disabled={Boolean(pilotProfile)}
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              {categoryTemplates.map((template) => (
                <option key={template.category} value={template.category}>
                  {template.label}
                </option>
              ))}
            </select>
            {pilotProfile ? (
              <input name="category" type="hidden" value={pilotProfile.category} />
            ) : null}
            <input name="measurementTemplateId" type="hidden" value={measurementTemplateId ?? ""} />
          </label>
          <label>
            仕入先
            <input
              name="supplierName"
              required
              defaultValue={pilotFixture ? "架空試験仕入先" : ""}
              placeholder="仕入先名"
            />
          </label>
          <label>
            証憑参照番号
            <input
              name="receiptReference"
              required
              defaultValue={pilotFixture ? `PILOT-REC-${pilotFixture}` : ""}
              placeholder="レシート・領収書の参照番号"
            />
          </label>
          <label>
            購入日時
            <input
              name="purchasedAt"
              type="datetime-local"
              required
              defaultValue={localDateTimeValue()}
            />
          </label>
          <label>
            証憑合計（円）
            <input
              name="receiptAmountMinor"
              type="number"
              min="0"
              required
              defaultValue={pilotFixture ? "1500" : ""}
            />
          </label>
          <label>
            このSKUの原価（円）
            <input
              name="allocatedCostMinor"
              type="number"
              min="0"
              required
              defaultValue={pilotFixture ? "1500" : ""}
            />
          </label>
        </div>
        <div className="humanGate">
          <div>
            <strong>証憑参照と金額を人が照合</strong>
            <p>AIは原価・税区分を確定しません。住所などの個人情報は入力しないでください。</p>
          </div>
          <button type="submit" disabled={busy || pilotBlocked}>
            {pilotBlocked
              ? "前の試験商品を完了してください"
              : pilotFixture
                ? `${pilotFixture}の計測を開始`
                : "仕入を確認して在庫番号を発行"}
          </button>
        </div>
      </form>
    </section>
  );
}

function OrderPanel({
  item,
  busy,
  addressLeaseId,
  shippingAddressView,
  onCreate,
  onAssign,
  assignmentMessage,
  onProgress,
  onIssueLease,
  onReveal,
  onNext,
}: {
  item: P0ItemResponse;
  busy: boolean;
  addressLeaseId: string | null;
  shippingAddressView: string | null;
  onCreate: (form: FormData) => Promise<void>;
  onAssign: (form: FormData) => Promise<void>;
  assignmentMessage: string;
  onProgress: () => Promise<void>;
  onIssueLease: () => void;
  onReveal: () => Promise<void>;
  onNext: () => void;
}) {
  const canCreate = item.inventoryStatus === "available" && !item.orderId;
  const stateLabel = item.orderState ?? "未受注";
  return (
    <section className="workflowPanel panel" aria-labelledby="order-heading">
      <div className="workflowPanelHead">
        <div>
          <p className="eyebrow">ORDER & SHIPPING</p>
          <h2 id="order-heading">手入力注文・二重読取・発送</h2>
        </div>
        <span className={item.orderState === "shipped" ? "safeBadge" : "status"}>{stateLabel}</span>
      </div>
      {item.inventoryStatus === "putaway_pending" ? (
        <div className="candidateNotice">
          <strong>先に在庫を格納してください</strong>
          <p>在庫番号 {item.inventoryNumber} を現場画面で商品→場所の順に確認します。</p>
          <a href="/mobile/scan">格納画面を開く</a>
        </div>
      ) : null}
      {canCreate ? (
        <form action={onCreate}>
          <div className="measurementGrid">
            <label>
              注文番号
              <input
                name="orderNumber"
                required
                defaultValue=""
                placeholder="公式画面の注文番号"
                autoComplete="off"
              />
            </label>
            <label>
              販売額
              <input name="saleAmountMinor" type="number" min="1" required defaultValue="" />
            </label>
            <label>
              販売手数料
              <input name="sellingFeeMinor" type="number" min="0" required defaultValue="" />
            </label>
            <label>
              送料
              <input name="shippingCostMinor" type="number" min="0" required defaultValue="" />
            </label>
            <label>
              梱包費
              <input name="packagingCostMinor" type="number" min="0" required defaultValue="" />
            </label>
            <label>
              発送先（暗号化保存）
              <textarea name="shippingAddress" required rows={3} />
            </label>
          </div>
          <button type="submit" disabled={busy}>
            公式画面と照合して注文を保存
          </button>
        </form>
      ) : null}
      {item.orderId ? (
        <form action={onAssign} className="candidateNotice">
          <strong>発送担当をこの注文だけに割り当てる</strong>
          <p>有効期間は割当時から8時間です。未割当の担当者は住所も発送操作も利用できません。</p>
          <label>
            発送担当のログインメール
            <input name="assigneeEmail" type="email" required autoComplete="off" />
          </label>
          <button type="submit" disabled={busy}>
            内容を確認して割り当て
          </button>
          {assignmentMessage ? <span className="safeBadge">{assignmentMessage}</span> : null}
        </form>
      ) : null}
      {item.orderId ? (
        <div className="humanGate">
          <div>
            <strong>現在: {stateLabel}</strong>
            <p>住所閲覧許可は最大5分です。商品と場所を確認せず次へ進めません。</p>
          </div>
          <div>
            <button type="button" disabled={busy || Boolean(addressLeaseId)} onClick={onIssueLease}>
              {addressLeaseId ? "5分許可を発行済み" : "住所の5分許可"}
            </button>
            <button type="button" disabled={busy} onClick={() => void onReveal()}>
              発送先を5分だけ表示
            </button>
            <button
              type="button"
              disabled={busy || item.orderState === "shipped" || item.orderState === "returned"}
              onClick={() => void onProgress()}
            >
              {item.orderState === "confirmed"
                ? "商品＋場所を確認"
                : item.orderState === "picking"
                  ? "梱包証拠を確認"
                  : "発送を人が確定"}
            </button>
          </div>
        </div>
      ) : null}
      {shippingAddressView ? (
        <div className="candidateNotice" aria-live="polite">
          <strong>発送先（最大5分で非表示）</strong>
          <p>{shippingAddressView}</p>
        </div>
      ) : null}
      <WorkflowNext
        enabled={item.orderState === "shipped" || item.orderState === "returned"}
        label="収支・会計へ"
        onClick={onNext}
      />
    </section>
  );
}

function WorkflowNext({
  enabled,
  label,
  onClick,
}: {
  enabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <div className="workflowNext">
      <span>{enabled ? "必須確認が完了しました" : "必須確認を完了すると次へ進めます"}</span>
      <button type="button" disabled={!enabled} onClick={onClick}>
        {label} →
      </button>
    </div>
  );
}

async function requestJson<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const payload = (await response.json().catch(() => null)) as { message?: string } | T | null;
  if (!response.ok)
    throw new HttpResponseError(
      (payload as { message?: string } | null)?.message ?? "操作を確認できませんでした。",
      response.status,
    );
  return payload as T;
}

function requiredPhotoMessage(): string {
  return `写真${photoRoles.length}種（${photoRoles.map((role) => role.label).join("・")}）を選択してください。`;
}

function requiredMeasurementMessage(definitions: readonly { label: string }[]): string {
  return `採寸${definitions.length}項目（${definitions.map((definition) => definition.label).join("・")}）を確認してください。`;
}

async function postPilotEventRequest(event: PendingPilotEvent): Promise<PilotRunResponse> {
  return requestJson<PilotRunResponse>(
    `/v1/workspaces/${event.workspaceId}/pilot-runs/${event.runId}/events`,
    {
      method: "POST",
      body: JSON.stringify({
        eventType: event.eventType,
        detailCode: event.detailCode,
        idempotencyKey: event.idempotencyKey,
        humanConfirmed: true,
      }),
    },
  );
}

const pilotPendingStorageKey = "resale-ops:pilot-pending-events:v1";

function readPendingPilotEvents(): PendingPilotEvent[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(pilotPendingStorageKey) ?? "[]") as unknown;
    return Array.isArray(parsed) ? (parsed as PendingPilotEvent[]) : [];
  } catch {
    return [];
  }
}

function pendingPilotEventsFor(workspaceId: string, runId?: string): PendingPilotEvent[] {
  return readPendingPilotEvents().filter(
    (event) => event.workspaceId === workspaceId && (!runId || event.runId === runId),
  );
}

function countPendingPilotEvents(workspaceId: string, runId?: string): number {
  return pendingPilotEventsFor(workspaceId, runId).length;
}

async function flushPendingPilotEvents(
  workspaceId: string,
  runId?: string,
): Promise<{ latestRun: PilotRunResponse | null; remainingCount: number }> {
  let latestRun: PilotRunResponse | null = null;
  for (const event of pendingPilotEventsFor(workspaceId, runId)) {
    latestRun = await postPilotEventRequest(event);
    removePendingPilotEvent(event.idempotencyKey);
  }
  return {
    latestRun,
    remainingCount: countPendingPilotEvents(workspaceId, runId),
  };
}

function enqueuePilotEvent(event: PendingPilotEvent): void {
  const pending = readPendingPilotEvents();
  if (pending.some((candidate) => candidate.idempotencyKey === event.idempotencyKey)) return;
  try {
    localStorage.setItem(pilotPendingStorageKey, JSON.stringify([...pending, event]));
  } catch {
    // The visible workflow error remains. A pilot run is never reported as passed without server data.
  }
}

function removePendingPilotEvent(idempotencyKey: string): void {
  try {
    localStorage.setItem(
      pilotPendingStorageKey,
      JSON.stringify(
        readPendingPilotEvents().filter((event) => event.idempotencyKey !== idempotencyKey),
      ),
    );
  } catch {
    // A repeated event reuses the same idempotency key and is safe to retry.
  }
}

function pilotActiveMarkerKey(workspaceId: string): string {
  return `resale-ops:pilot-active:${workspaceId}`;
}

function readPilotActiveMarker(workspaceId: string): {
  pilotRunId: string;
  skuId: string;
  pageInstanceId: string;
} | null {
  try {
    const parsed = JSON.parse(
      sessionStorage.getItem(pilotActiveMarkerKey(workspaceId)) ?? "null",
    ) as { pilotRunId?: unknown; skuId?: unknown; pageInstanceId?: unknown } | null;
    return parsed &&
      typeof parsed.pilotRunId === "string" &&
      typeof parsed.skuId === "string" &&
      typeof parsed.pageInstanceId === "string"
      ? {
          pilotRunId: parsed.pilotRunId,
          skuId: parsed.skuId,
          pageInstanceId: parsed.pageInstanceId,
        }
      : null;
  } catch {
    return null;
  }
}

function textField(form: FormData, name: string): string {
  const value = form.get(name);
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name}を入力してください。`);
  return value.trim();
}
function numberField(form: FormData, name: string): number {
  const value = Number(textField(form, name));
  if (!Number.isInteger(value) || value < 0)
    throw new Error(`${name}は0以上の整数で入力してください。`);
  return value;
}
function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : "操作を確認できませんでした。";
}
function localDateTimeValue(): string {
  const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000);
  return now.toISOString().slice(0, 16);
}

function workflowStateRank(state: P0ItemResponse["workflowState"] | undefined): number {
  return [
    "sku_created",
    "purchase_confirmed",
    "capture_confirmed",
    "listing_confirmed",
    "order_confirmed",
    "picked",
    "packed",
    "shipped",
    "journal_approved",
  ].indexOf(state ?? "sku_created");
}

function inventoryStatusLabel(status: P0ItemResponse["inventoryStatus"]): string {
  return {
    putaway_pending: "格納待ち",
    available: "在庫中",
    reserved: "引当済み",
    picked: "ピッキング済み",
    packed: "梱包済み",
    shipped: "発送済み",
    quarantined: "返品隔離・要確認",
    disposal_pending: "廃棄候補・要確認",
    lost: "紛失確認",
    disposed: "廃棄確認",
  }[status];
}

function nextStageForItem(item: P0ItemResponse): Stage {
  if (item.workflowState === "journal_approved" || item.orderState === "shipped")
    return "accounting";
  if (
    ["listing_confirmed", "order_confirmed", "picked", "packed", "shipped"].includes(
      item.workflowState,
    )
  )
    return "order";
  if (item.workflowState === "capture_confirmed") return "listing";
  return "capture";
}
