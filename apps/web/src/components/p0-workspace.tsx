"use client";

import type {
  MeasurementResponse,
  OrderOperationResponse,
  P0ItemResponse,
  PackOrderRequest,
  PilotRunResponse,
  ShipOrderRequest,
} from "@resale/contracts";
import {
  listingPrepPilotFixtureManifestSha256,
  listingPrepPilotFixtureProfiles,
  listingPrepPilotFixtures,
  listingPrepPilotItemIdentifiers,
  listingPrepPilotMigrationVersion,
  listingPrepPilotProtocolVersion,
  listingPrepPilotWarmupFixture,
} from "@resale/contracts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clearCaptureUploads,
  clearCaptureUpload,
  loadCaptureUploads,
  loadReceiptEvidenceUpload,
  markCaptureUploaded,
  prepareCaptureUpload,
  prepareMeasurementEvidenceUpload,
  prepareReceiptEvidenceUpload,
} from "../lib/capture-outbox";
import {
  categoryTemplates,
  completeMeasurements,
  measurementDefinitionsFor,
  templateForCategory,
} from "../lib/measurement-profile";
import { optionalFormText } from "../lib/form-data-fields";
import { recoverablePilotCorrection } from "../lib/pilot-correction";
import { p0UserFacingErrorMessage } from "../lib/p0-user-facing-error";
import { pilotDisplayCategory } from "../lib/pilot-category";
import {
  canStartNextPilotFixture,
  stageAfterItemRefresh,
  type WorkflowStage,
} from "../lib/pilot-stage";
import { AccountingWorkspace } from "./accounting-workspace";
import { ProductResearchPanel } from "./product-research-panel";
import { WorkflowLiveLayout, WorkflowCaptureSteps } from "./workflow-live-layout";
import { copyBeforeWorkflowHandoff } from "./workflow-copy-handoff";

type Stage = WorkflowStage;
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
  | "network_retry";

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
  const [listingStep, setListingStep] = useState<"research" | "description">("research");
  const [descriptionDraft, setDescriptionDraft] = useState<string | null>(null);
  const [putawayStep, setPutawayStep] = useState<"number" | "location">("number");
  const [items, setItems] = useState<P0ItemResponse[]>([]);
  const [selectedSkuId, setSelectedSkuId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [photos, setPhotos] = useState<Partial<Record<PhotoRole, File>>>({});
  const [measurementEvidence, setMeasurementEvidence] = useState<Partial<Record<string, File>>>({});
  const [measurements, setMeasurements] = useState<Record<string, string>>({});
  const [measurementReviewReason, setMeasurementReviewReason] = useState("");
  const [addressLeaseId, setAddressLeaseId] = useState<string | null>(null);
  const [shippingAddressView, setShippingAddressView] = useState<string | null>(null);
  const [assignmentMessage, setAssignmentMessage] = useState("");
  const [pilotRun, setPilotRun] = useState<PilotRunResponse | null>(null);
  const [pendingPilotEventCount, setPendingPilotEventCount] = useState(0);
  const [pilotResumeDecisionRequired, setPilotResumeDecisionRequired] = useState(false);
  const pageInstanceId = useRef(crypto.randomUUID()).current;
  const initialPilotResumeChecked = useRef(false);

  const item = items.find((candidate) => candidate.skuId === selectedSkuId) ?? items[0] ?? null;
  const listingPhotos = useMemo(
    () =>
      item
        ? photoRoles.flatMap(({ id, label }) => {
            const assetId = item.capture.photoAssetIds[item.capture.photoRoles.indexOf(id)];
            return assetId ? [{ id, label, assetId }] : [];
          })
        : [],
    [item],
  );
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
    if (pilotRun.state !== "active") return;
    if (pilotRun.items.length === 0) return;
    const marker = readPilotActiveMarker(workspaceId);
    if (
      incomplete &&
      marker?.pilotRunId === pilotRun.runId &&
      marker.skuId === incomplete.skuId &&
      marker.pageInstanceId === pageInstanceId
    ) {
      return;
    }
    setPilotResumeDecisionRequired(true);
    setError(
      "途中の再読み込みまたは再起動を検知しました。通常の中断か、停電などの外部事故かを選ぶまで計測操作を停止します。",
    );
  }, [pageInstanceId, pilotRun, workspaceId]);

  useEffect(() => {
    if (loading || !item) return;
    setStage((current) => stageAfterItemRefresh(current, item, pilotRun));
  }, [item, loading, pilotRun]);

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
    setMeasurementEvidence({});
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
        const restoredEvidence: Partial<Record<string, File>> = {};
        for (const record of records) {
          if (record.file && isPhotoRole(record.role)) restored[record.role] = record.file;
          if (
            record.file &&
            record.role === "measurement_evidence" &&
            record.measurementDefinitionId
          )
            restoredEvidence[record.measurementDefinitionId] = record.file;
        }
        setPhotos(restored);
        setMeasurementEvidence(restoredEvidence);
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
  const description = descriptionDraft ?? item?.listingCandidate.text ?? "";
  useEffect(() => {
    setDescriptionDraft(null);
    setPutawayStep("number");
  }, [item?.skuId]);
  const activePilotItem =
    pilotRun?.state === "active" && item
      ? (pilotRun.items.find((candidate) => candidate.skuId === item.skuId) ?? null)
      : null;
  const awaitingNextPilotItem = canStartNextPilotFixture(pilotRun);
  const nextPilotFixture =
    awaitingNextPilotItem && pilotRun
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
    if (pilotResumeDecisionRequired) {
      throw new PilotEventSyncPendingError(
        "再読み込みの理由を選択してから、パイロット操作を再開してください。",
      );
    }
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

  async function createPurchase(form: FormData, receiptFile: File | null) {
    await run(async () => {
      const pilotRunId = optionalFormText(form, "pilotRunId");
      const productFixtureId = optionalFormText(form, "productFixtureId");
      if ((pilotRunId === null) !== (productFixtureId === null)) {
        throw new Error("計測用の商品情報を確認できません。画面を読み直してください。");
      }
      if (!receiptFile) {
        throw new Error("請求書・レシートの写真を選んで、人が内容を確認してください。");
      }
      const receipt = await prepareReceiptEvidenceUpload(workspaceId, receiptFile);
      const itemCreateIdempotencyKey = receipt.purchaseIdempotencyKey;
      if (!itemCreateIdempotencyKey) throw new Error("再送用の確認番号を準備できませんでした。");
      if (!navigator.onLine)
        throw new Error("通信がないため保存できません。写真は画面を開いている間だけ保持します。");
      if (pilotRunId) await ensurePilotEventsSynced();
      if (!receipt.uploaded) {
        await requestJson(
          `/v1/workspaces/${workspaceId}/receipt-evidence?assetId=${receipt.assetId}&humanConfirmed=true`,
          {
            method: "POST",
            body: receipt.file,
            headers: { "content-type": receipt.file.type },
          },
        );
        await markCaptureUploaded(receipt.key);
      }
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
          receiptEvidenceAssetId: receipt.assetId,
          allocatedCostMinor: numberField(form, "allocatedCostMinor"),
          idempotencyKey: itemCreateIdempotencyKey,
          humanConfirmed: true,
          ...(pilotRunId && productFixtureId
            ? {
                pilot: {
                  runId: pilotRunId,
                  productFixtureId,
                },
              }
            : {}),
        }),
      });
      // 商品作成後の端末内削除に失敗しても、同じ作成操作を二重送信しない。
      await clearCaptureUpload(receipt.key).catch(() => undefined);
      if (pilotRunId) {
        sessionStorage.setItem(
          pilotActiveMarkerKey(workspaceId),
          JSON.stringify({ pilotRunId, skuId: created.skuId, pageInstanceId }),
        );
      }
      setItems((current) =>
        current.some((candidate) => candidate.skuId === created.skuId)
          ? current
          : [created, ...current],
      );
      setSelectedSkuId(created.skuId);
      setStage("capture");
      try {
        await refreshItems();
        await refreshPilotRun();
      } catch {
        setError(
          "商品番号を作成しました。最新一覧を読み込めないため、更新ボタンで再確認してください。",
        );
      }
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
    if (
      activeMeasurementDefinitions.some(
        (definition) => !measurementEvidence[definition.definitionId],
      )
    ) {
      setError("各採寸項目の根拠写真を選んでください。掲載用の正面写真は使えません。");
      return;
    }
    await run(async () => {
      // すべての画像を先に画面内メモリへ検証・準備してから、最初の通信を始める。
      const stagedPhotos = await Promise.all(
        photoRoles.map(async ({ id: role }) => {
          const file = photos[role];
          if (!file) throw new Error(requiredPhotoMessage());
          return { role, pending: await prepareCaptureUpload(workspaceId, item.skuId, role, file) };
        }),
      );
      const stagedEvidence = await Promise.all(
        activeMeasurementDefinitions.map(async (definition) => {
          const file = measurementEvidence[definition.definitionId];
          if (!file) throw new Error("各採寸項目の根拠写真を選んでください。");
          return {
            definitionId: definition.definitionId,
            pending: await prepareMeasurementEvidenceUpload(
              workspaceId,
              item.skuId,
              definition.definitionId,
              file,
            ),
          };
        }),
      );
      if (!navigator.onLine)
        throw new Error("通信がないため保存できません。写真は画面を開いている間だけ保持します。");
      if (activePilotItem) await ensurePilotEventsSynced();
      const assetIds: string[] = [];
      for (const { role, pending } of stagedPhotos) {
        if (!pending.uploaded) {
          await requestJson(
            `/v1/workspaces/${workspaceId}/skus/${item.skuId}/media-uploads?assetId=${pending.assetId}&role=${role}`,
            { method: "POST", body: pending.file, headers: { "content-type": pending.file.type } },
          );
          await markCaptureUploaded(pending.key);
        }
        assetIds.push(pending.assetId);
      }
      const measurementEvidenceAssetIds = new Map<string, string>();
      for (const { definitionId, pending } of stagedEvidence) {
        if (!pending.uploaded) {
          await requestJson(
            `/v1/workspaces/${workspaceId}/skus/${item.skuId}/media-uploads?assetId=${pending.assetId}&role=measurement_evidence&measurementDefinitionId=${encodeURIComponent(definitionId)}`,
            { method: "POST", body: pending.file, headers: { "content-type": pending.file.type } },
          );
          await markCaptureUploaded(pending.key);
        }
        measurementEvidenceAssetIds.set(definitionId, pending.assetId);
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
              evidenceAssetId: measurementEvidenceAssetIds.get(definitionId),
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
      setMeasurementEvidence({});
      await refreshItems();
      setStage("listing");
    });
  }

  async function confirmListing() {
    if (
      !item ||
      item.listingCandidate.unconfirmedFields.length > 0 ||
      item.listingCandidate.referenceIds.length === 0 ||
      !hasListingExportPhotos(item)
    )
      return;
    const completingPilotItem = Boolean(activePilotItem?.completedAt === null);
    await run(async () => {
      if (activePilotItem) await ensurePilotEventsSynced();
      await copyBeforeWorkflowHandoff(description, navigator.clipboard, async () => {
        await advanceWorkflow(
          item.skuId,
          "confirm_listing",
          item.listingCandidate.referenceIds,
          true,
        );
      });
      if (activePilotItem) sessionStorage.removeItem(pilotActiveMarkerKey(workspaceId));
      await refreshItems();
      await refreshPilotRun();
      setStage(completingPilotItem ? "purchase" : "order");
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
      if (form.get("networkCaptureReady") !== "on") {
        throw new Error(
          "専用ブラウザのrequest capture（通信記録）を開始してから計測してください。",
        );
      }
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
      initialPilotResumeChecked.current = true;
      setPilotRun(created);
      setPilotResumeDecisionRequired(false);
      setStage("purchase");
    });
  }

  async function recordPilotEvent(
    eventType: PilotEventType,
    detailCode: string,
  ): Promise<"saved" | "queued" | "ignored"> {
    if (!pilotRun || pilotRun.state !== "active") return "ignored";
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
      return "saved";
    } catch {
      enqueuePilotEvent(pending);
      setPendingPilotEventCount(countPendingPilotEvents(workspaceId, pilotRun.runId));
      return "queued";
    }
  }

  async function markReloadAsInvalidAttempt(): Promise<void> {
    setBusy(true);
    setError("");
    try {
      const result = await recordPilotEvent("invalid_attempt", "browser_reload_or_reopen");
      setPilotResumeDecisionRequired(false);
      setError(
        result === "queued"
          ? "通常の中断を同期待ちへ保存しました。再送が終わるまで合格扱いにしません。"
          : "通常の中断として記録し、このrunを不合格にしました。",
      );
    } finally {
      setBusy(false);
    }
  }

  async function invalidatePilotRun(form: FormData): Promise<void> {
    if (!pilotRun || pilotRun.state !== "active") return;
    setBusy(true);
    setError("");
    try {
      const synced = await syncPendingPilotEvents(pilotRun.runId);
      if (countPendingPilotEvents(workspaceId, pilotRun.runId) > 0) {
        throw new PilotEventSyncPendingError(
          "同期待ちの例外記録を保存してから、外部事故を記録してください。",
        );
      }
      if (synced && synced.state !== "active") {
        throw new PilotEventSyncPendingError(
          "先に保存された例外でrunが終了したため、外部事故へ変更できません。",
        );
      }
      const updated = await requestJson<PilotRunResponse>(
        `/v1/workspaces/${workspaceId}/pilot-runs/${pilotRun.runId}/external-invalidation`,
        {
          method: "POST",
          body: JSON.stringify({
            reasonCode: textField(form, "reasonCode"),
            idempotencyKey: crypto.randomUUID(),
            humanConfirmed: form.get("externalIncidentConfirmed") === "on",
          }),
        },
      );
      setPilotRun(updated);
      setPilotResumeDecisionRequired(false);
      sessionStorage.removeItem(pilotActiveMarkerKey(workspaceId));
      setStage("purchase");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function failPilotForUncorrectableContent(): Promise<void> {
    if (!window.confirm("このrunを不合格として記録し、最初からやり直しますか？")) return;
    setBusy(true);
    setError("");
    try {
      const result = await recordPilotEvent("invalid_attempt", "uncorrectable_pilot_content");
      setError(
        result === "queued"
          ? "訂正不能を同期待ちへ保存しました。再送が終わるまで合格扱いにしません。"
          : "訂正不能として記録し、このrunを不合格にしました。",
      );
    } finally {
      setBusy(false);
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
            addressLeaseId: leaseId,
            idempotencyKey: crypto.randomUUID(),
            humanConfirmed: true,
          } satisfies PackOrderRequest),
        });
      } else if (item.orderState === "packed") {
        await requestJson(`/v1/workspaces/${workspaceId}/orders/${orderId}/ship`, {
          method: "POST",
          body: JSON.stringify({
            addressLeaseId: leaseId,
            idempotencyKey: crypto.randomUUID(),
            humanConfirmed: true,
          } satisfies ShipOrderRequest),
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

  if (loading)
    return (
      <WorkflowLiveLayout>
        <p role="status">商品を読み込んでいます…</p>
      </WorkflowLiveLayout>
    );

  return (
    <WorkflowLiveLayout>
      <div className="workflowBoard" data-workflow-stage={stage}>
        {error ? (
          <div className="accountingDisclaimer" role="alert">
            <p>{error}</p>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await refreshItems();
                  await refreshPilotRun();
                })
              }
            >
              もう一度読み込む
            </button>
          </div>
        ) : null}
        <details open={pilotRun?.state === "active" || pilotResumeDecisionRequired}>
          <summary>試験計測（通常作業では不要）</summary>
          <PilotPanel
            busy={busy}
            pilotRun={pilotRun}
            pendingEventCount={pendingPilotEventCount}
            resumeDecisionRequired={pilotResumeDecisionRequired}
            nextFixture={nextPilotFixture}
            nextProfile={nextPilotProfile}
            onStart={startPilot}
            onInvalidate={invalidatePilotRun}
            onMarkReloadInvalid={() => void markReloadAsInvalidAttempt()}
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
        </details>
        {!items.length && !error ? (
          <p role="status">
            まだ商品がありません。仕入れ内容を確認して最初の1点を登録してください。
          </p>
        ) : null}
        <nav className="workflowStages" aria-label="商品の工程">
          {stages.map((entry, index) => (
            <button
              className={stage === entry.id ? "active" : completed[entry.id] ? "done" : ""}
              disabled={
                busy ||
                pilotResumeDecisionRequired ||
                (awaitingNextPilotItem && entry.id !== "purchase") ||
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

        {items.length > 0 && !awaitingNextPilotItem ? (
          <section className="workflowItemSummary panel">
            <label>
              対象商品
              <select
                value={item?.skuId ?? ""}
                disabled={busy || pilotRun?.state === "active"}
                onChange={(event) => {
                  setSelectedSkuId(event.target.value);
                  setListingStep("research");
                }}
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
            workspaceId={workspaceId}
            item={awaitingNextPilotItem ? null : item}
            pilotRunId={pilotRun?.state === "active" ? pilotRun.runId : null}
            pilotFixture={nextPilotFixture}
            pilotProfile={nextPilotProfile}
            pilotBlocked={
              pilotResumeDecisionRequired ||
              (pilotRun?.state === "active" && nextPilotFixture === null)
            }
          />
        ) : null}

        {stage === "capture" && item && !item.locationCode ? (
          <section className="workflowPanel panel" data-workflow-screen={`putaway-${putawayStep}`}>
            <h2>{putawayStep === "number" ? "在庫番号を確認" : "保管場所を決める"}</h2>
            <p>商品: {item.title}</p>
            <p>
              在庫番号: <strong>{item.inventoryNumber}</strong>
            </p>
            {putawayStep === "number" ? (
              <>
                <p>現物の紙タグへ番号を書き、商品と照合してください。</p>
                <button type="button" disabled={busy} onClick={() => setPutawayStep("location")}>
                  番号を確認して保管場所へ
                </button>
              </>
            ) : (
              <>
                <p>まだ格納されていません。商品と保管場所を人が確認してから撮影へ進みます。</p>
                <p>
                  <a href="/inventory">保管場所を決める</a>
                </p>
                <p>
                  <a href="/mobile/scan">商品と場所を確認して格納する</a>
                </p>
                <button type="button" disabled={busy} onClick={() => void run(refreshItems)}>
                  格納後に更新する
                </button>
                <button type="button" disabled={busy} onClick={() => setPutawayStep("number")}>
                  ‹ 在庫番号に戻る
                </button>
              </>
            )}
          </section>
        ) : null}
        {stage === "capture" && item && item.locationCode ? (
          <WorkflowCaptureSteps
            key={item.skuId}
            photos={photos}
            setPhoto={(id, file) => setPhotos((current) => ({ ...current, [id]: file }))}
            definitions={activeMeasurementDefinitions}
            measurements={measurements}
            setMeasurement={(id, value) =>
              setMeasurements((current) => ({ ...current, [id]: value }))
            }
            measurementEvidence={measurementEvidence}
            setMeasurementEvidence={(id, file) =>
              setMeasurementEvidence((current) => ({ ...current, [id]: file }))
            }
            previousMeasurements={latestMeasurements(item.capture.measurements)}
            reason={measurementReviewReason}
            setReason={setMeasurementReviewReason}
            completed={completed.capture}
            disabled={busy || pilotResumeDecisionRequired}
            canSave={
              measurementComplete &&
              photoRoles.every(({ id }) => photos[id]) &&
              activeMeasurementDefinitions.every(
                (definition) => measurementEvidence[definition.definitionId],
              )
            }
            onSave={() => void confirmCapture()}
            onNext={() => setStage("listing")}
          />
        ) : null}

        {stage === "listing" && item ? (
          <section className="workflowPanel panel" aria-labelledby="listing-heading">
            <div className="workflowPanelHead">
              <div>
                <h2 id="listing-heading">
                  {listingStep === "research" ? "タグの文字・商品調査" : "商品説明の候補"}
                </h2>
              </div>
              <span className={completed.listing ? "safeBadge" : "status"}>
                {completed.listing ? "本人確認済み" : "候補"}
              </span>
            </div>
            <div hidden={listingStep !== "description"} data-workflow-screen="description">
              <div className="candidateNotice">
                <strong>自動出品はしません</strong>
                <p>公式画面への貼り付けと公開は本人が行います。外部費用は0円です。</p>
              </div>
              <textarea
                aria-label="商品説明候補"
                rows={7}
                value={description}
                disabled={busy || completed.listing}
                onChange={(event) => setDescriptionDraft(event.target.value)}
              />
              <p>編集した文章はこの画面内のコピー用です。データベースの商品説明は変更しません。</p>
              <div className="listingPhotoDownloads" aria-label="掲載写真を端末に保存">
                <strong>掲載用4写真（非公開保存済み）を端末に保存</strong>
                <p>
                  出品前に、4種類の掲載写真を1枚ずつ保存してください。採寸の根拠写真は含めません。
                </p>
                <PrivateListingPhotoGallery
                  workspaceId={workspaceId}
                  skuId={item.skuId}
                  photos={listingPhotos}
                />
                {photoRoles.map(({ id, label }) => {
                  const assetId = item.capture.photoAssetIds[item.capture.photoRoles.indexOf(id)];
                  return assetId ? (
                    <a
                      key={id}
                      href={`/v1/workspaces/${workspaceId}/skus/${item.skuId}/product-photos/${assetId}/content`}
                      download={`${item.skuCode}-${id}.jpg`}
                    >
                      {label}写真を保存
                    </a>
                  ) : (
                    <span key={id}>{label}写真は未準備です</span>
                  );
                })}
              </div>
              {pilotRun?.state === "active" ? (
                <p className="candidateNotice" data-implementation-state="WAITING_HUMAN">
                  計測中は出品画面を開けません。計測を終え、結果を確認してから本人が開きます。
                </p>
              ) : (
                <a href="https://jp.mercari.com/sell" target="_blank" rel="noopener noreferrer">
                  メルカリ公式の出品画面を開く
                </a>
              )}
              {activePilotItem ? (
                <div className="candidateNotice" role="note">
                  <strong>訂正できる範囲を確認してください</strong>
                  <p>
                    属性の再保存は訂正履歴として数えます。写真・採寸は撮影工程の確定後、文章は直接編集できません。事実を直しても文章が正しくならない場合は、このrunを不合格にして最初からやり直します。
                  </p>
                  <button
                    className="secondaryButton"
                    type="button"
                    disabled={busy || pilotResumeDecisionRequired}
                    onClick={() => void failPilotForUncorrectableContent()}
                  >
                    訂正不能を記録してrunをやり直す
                  </button>
                </div>
              ) : null}
              <p className="candidateReferences">
                参照: 写真 {item.capture.photoAssetIds.length}件・採寸
                {item.capture.measurements.length}件
                {item.listingCandidate.unconfirmedFields.length > 0
                  ? `／未確認: ${item.listingCandidate.unconfirmedFields.join("・")}`
                  : "／未確認なし"}
              </p>
            </div>
            <div hidden={listingStep !== "research"} data-workflow-screen="research">
              <ProductResearchPanel
                key={item.skuId}
                workspaceId={workspaceId}
                skuId={item.skuId}
                attributeEvidence={item.capture.photoRoles.flatMap((role, index) => {
                  const assetId = item.capture.photoAssetIds[index];
                  return assetId && (role === "brand_tag" || role === "care_label")
                    ? [{ assetId, role }]
                    : [];
                })}
                pilotActive={pilotRun?.state === "active"}
                pilotBlocked={pilotResumeDecisionRequired}
                onChanged={async () => {
                  await refreshItems();
                  await refreshPilotRun();
                }}
              />
              <button
                type="button"
                disabled={busy || pilotResumeDecisionRequired}
                onClick={() => setListingStep("description")}
              >
                商品をまとめる
              </button>
            </div>
            <div hidden={listingStep !== "description"}>
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
                    pilotResumeDecisionRequired ||
                    completed.listing ||
                    item.listingCandidate.unconfirmedFields.length > 0 ||
                    item.listingCandidate.referenceIds.length === 0 ||
                    !hasListingExportPhotos(item) ||
                    (item.measurementProfile !== null && item.confirmedAttributes === null)
                  }
                  onClick={() => void confirmListing()}
                >
                  {completed.listing
                    ? "確認済み"
                    : hasListingExportPhotos(item)
                      ? "確認してコピー"
                      : "掲載写真を準備してください"}
                </button>
              </div>
              <WorkflowNext
                enabled={completed.listing}
                label={activePilotItem ? "次の固定商品へ" : "注文・発送へ"}
                onClick={() => setStage(activePilotItem ? "purchase" : "order")}
              />
              <button type="button" disabled={busy} onClick={() => setListingStep("research")}>
                ‹ タグ・調査に戻る
              </button>
            </div>
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
    </WorkflowLiveLayout>
  );
}

type ListingPhotoPreview = {
  id: PhotoRole;
  label: string;
  assetId: string;
};

function PrivateListingPhotoGallery({
  workspaceId,
  skuId,
  photos,
}: {
  workspaceId: string;
  skuId: string;
  photos: readonly ListingPhotoPreview[];
}) {
  const [previews, setPreviews] = useState<Array<ListingPhotoPreview & { url: string }>>([]);
  const [previewError, setPreviewError] = useState("");
  const [visibilityRevision, setVisibilityRevision] = useState(0);
  const previewUrls = useRef<string[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    const revokePreviews = () => {
      for (const url of previewUrls.current) URL.revokeObjectURL(url);
      previewUrls.current = [];
    };
    const clearForHiddenPage = () => {
      controller.abort();
      revokePreviews();
      if (!disposed) setPreviews([]);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") clearForHiddenPage();
      if (document.visibilityState === "visible") setVisibilityRevision((current) => current + 1);
    };
    const loadPreviews = async () => {
      revokePreviews();
      setPreviews([]);
      setPreviewError("");
      const next: Array<ListingPhotoPreview & { url: string }> = [];
      try {
        for (const photo of photos) {
          const response = await fetch(
            `/v1/workspaces/${workspaceId}/skus/${skuId}/product-photos/${photo.assetId}/content`,
            {
              credentials: "same-origin",
              cache: "no-store",
              redirect: "error",
              signal: controller.signal,
            },
          );
          const contentType = response.headers.get("content-type") ?? "";
          if (!response.ok || !/^image\/(?:jpeg|png)$/iu.test(contentType)) {
            throw new Error("private photo preview unavailable");
          }
          next.push({ ...photo, url: URL.createObjectURL(await response.blob()) });
        }
        if (disposed) {
          for (const preview of next) URL.revokeObjectURL(preview.url);
          return;
        }
        previewUrls.current = next.map((preview) => preview.url);
        setPreviews(next);
      } catch (reason) {
        for (const preview of next) URL.revokeObjectURL(preview.url);
        if (!disposed && !(reason instanceof DOMException && reason.name === "AbortError")) {
          setPreviewError(
            "写真のプレビューを表示できません。保存ボタンから1枚ずつ確認してください。",
          );
        }
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    void loadPreviews();
    return () => {
      disposed = true;
      controller.abort();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      revokePreviews();
    };
  }, [photos, skuId, visibilityRevision, workspaceId]);

  return (
    <div className="listingPhotoGallery" aria-label="非公開の掲載写真プレビュー">
      <p>保存前の確認用プレビュー（画面を隠すと消去します）</p>
      {previewError ? <p role="status">{previewError}</p> : null}
      {previews.map((preview) => (
        <figure key={preview.id}>
          <img src={preview.url} alt={`${preview.label}写真の非公開プレビュー`} />
          <figcaption>{preview.label}</figcaption>
        </figure>
      ))}
    </div>
  );
}

function PilotPanel({
  busy,
  pilotRun,
  pendingEventCount,
  resumeDecisionRequired,
  nextFixture,
  nextProfile,
  onStart,
  onInvalidate,
  onMarkReloadInvalid,
  onRetryPending,
}: {
  busy: boolean;
  pilotRun: PilotRunResponse | null;
  pendingEventCount: number;
  resumeDecisionRequired: boolean;
  nextFixture: (typeof listingPrepPilotFixtures)[number] | null;
  nextProfile: (typeof listingPrepPilotFixtureProfiles)[number] | null;
  onStart: (form: FormData) => Promise<void>;
  onInvalidate: (form: FormData) => Promise<void>;
  onMarkReloadInvalid: () => void;
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
      <div className="candidateNotice" role="note">
        <strong>外部通信0件はアプリが自動判定しません</strong>
        <p>
          専用ブラウザのrequest capture（通信記録）をrun開始前から終了後まで保存し、run ID
          {pilotRun ? ` ${pilotRun.runId}` : ""}
          と結び付けて実施者が127.0.0.1以外0件を確認します。サーバーのcompletedだけでは最終合格にしません。
        </p>
      </div>
      {resumeDecisionRequired ? (
        <div className="candidateNotice" role="alert">
          <strong>再読み込みの理由を選ぶまで計測停止</strong>
          <p>
            通常の再読み込み・利用者中断は不合格です。停電・OS強制更新・端末故障だけは、下の理由付き操作で外部事故として無効化できます。
          </p>
          <button type="button" disabled={busy} onClick={onMarkReloadInvalid}>
            通常の中断としてrunを不合格にする
          </button>
        </div>
      ) : null}
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
            必須画像不足 <strong>{summary?.missingRequiredImageCount ?? 0}</strong>
          </span>
          <span>
            再測定 <strong>{summary?.measurementReworkCount ?? 0}</strong>
          </span>
          <span>
            ラベル・場所不一致 <strong>{summary?.labelLocationMismatchCount ?? 0}</strong>
          </span>
          <span>
            誤格納 <strong>{summary?.misputawayCount ?? 0}</strong>
          </span>
          <span>
            手動訂正 <strong>{summary?.manualCorrectionCount ?? 0}</strong>
          </span>
          <span>
            通信再送 <strong>{summary?.networkRetryCount ?? 0}</strong>
          </span>
        </div>
      ) : null}
      {pilotRun?.state === "failed" ? (
        <div className="candidateNotice" role="status">
          <strong>このrunは不合格です。履歴は削除せず保持します</strong>
          <p>
            主な理由件数: 無効試行 {summary?.invalidAttemptCount ?? 0}件／必須画像不足{" "}
            {summary?.missingRequiredImageCount ?? 0}件／ラベル・場所不一致{" "}
            {summary?.labelLocationMismatchCount ?? 0}件／誤格納 {summary?.misputawayCount ?? 0}件
          </p>
          <p>下のWARMUP-01を計測外で再確認してから、新しいrun IDでTOP-01からやり直してください。</p>
        </div>
      ) : null}
      {pilotRun?.state === "externally_invalidated" ? (
        <p className="accountingDisclaimer" role="status">
          外部事故で無効化: {externalInvalidationReasonLabel(pilotRun.externalInvalidationReason)}
        </p>
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
          <div className="candidateNotice">
            <strong>最初にWARMUP-01を計測外で練習</strong>
            <p>
              {listingPrepPilotWarmupFixture.title}／{listingPrepPilotWarmupFixture.categoryLabel}／
              {listingPrepPilotWarmupFixture.templateId} v
              {listingPrepPilotWarmupFixture.templateVersion}
            </p>
            <ul>
              {listingPrepPilotWarmupFixture.images.map((image) => (
                <li key={image.role}>
                  {image.role}: {image.relativePath}
                </li>
              ))}
            </ul>
            <p>
              属性: {listingPrepPilotWarmupFixture.attributes.brand}／
              {listingPrepPilotWarmupFixture.attributes.sizeLabel}／
              {listingPrepPilotWarmupFixture.attributes.color}
            </p>
            <ul>
              {listingPrepPilotWarmupFixture.measurements.map((measurement) => (
                <li key={measurement.definitionId}>
                  {measurement.label}: {measurement.value}
                  {measurement.unit}
                </li>
              ))}
            </ul>
          </div>
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
          <label className="checkLine">
            <input name="networkCaptureReady" type="checkbox" required />
            専用ブラウザのrequest captureを開始し、終了後に外部通信0件を人が確認します
          </label>
          <button disabled={busy || pendingEventCount > 0}>390×844で新しい10商品計測を開始</button>
        </form>
      ) : null}
      {pilotRun?.state === "active" ? (
        <form className="compactForm" action={onInvalidate}>
          <h3>外部事故だけでrunを無効化</h3>
          <label>
            外部事故の理由
            <select name="reasonCode" required defaultValue="">
              <option value="" disabled>
                理由を選択
              </option>
              <option value="power_outage">停電</option>
              <option value="os_forced_update">OSの強制更新</option>
              <option value="device_hardware_failure">端末の故障</option>
            </select>
          </label>
          <label className="checkLine">
            <input name="externalIncidentConfirmed" type="checkbox" required />
            利用者都合の中断ではなく、選択した外部事故であることを確認しました
          </label>
          <button className="secondaryButton" disabled={busy || pendingEventCount > 0}>
            理由を記録してrunを無効化
          </button>
        </form>
      ) : null}
    </section>
  );
}

function PurchasePanel({
  busy,
  onSubmit,
  workspaceId,
  pilotRunId,
  pilotFixture,
  pilotProfile,
  pilotBlocked,
}: {
  busy: boolean;
  onSubmit: (form: FormData, receiptFile: File | null) => Promise<void>;
  workspaceId: string;
  item: P0ItemResponse | null;
  pilotRunId: string | null;
  pilotFixture: (typeof listingPrepPilotFixtures)[number] | null;
  pilotProfile: (typeof listingPrepPilotFixtureProfiles)[number] | null;
  pilotBlocked: boolean;
}) {
  const [category, setCategory] = useState<string>(pilotProfile?.category ?? "tops");
  const [purchaseStep, setPurchaseStep] = useState<"receipt" | "item">("receipt");
  const receiptFields = useRef<HTMLFieldSetElement>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const measurementTemplateId = pilotProfile?.templateId ?? templateForCategory(category);
  const pilotIdentifiers =
    pilotRunId && pilotFixture ? listingPrepPilotItemIdentifiers(pilotRunId, pilotFixture) : null;
  useEffect(() => {
    let cancelled = false;
    void loadReceiptEvidenceUpload(workspaceId).then((pending) => {
      if (!cancelled && pending) setReceiptFile(pending.file);
    });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);
  useEffect(() => {
    if (!receiptFile) {
      setReceiptPreview(null);
      return;
    }
    const url = URL.createObjectURL(receiptFile);
    setReceiptPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [receiptFile]);
  return (
    <section
      className="workflowPanel panel"
      aria-labelledby="purchase-heading"
      data-workflow-screen={`purchase-${purchaseStep}`}
    >
      <div className="workflowPanelHead">
        <div>
          <h2 id="purchase-heading">
            {purchaseStep === "receipt" ? "仕入れ資料を確認" : "仕入れ内容"}
          </h2>
        </div>
        <span className="status">入力中・未登録</span>
      </div>
      <form action={(form) => onSubmit(form, receiptFile)}>
        {pilotRunId && pilotFixture ? (
          <>
            <input name="pilotRunId" type="hidden" value={pilotRunId} />
            <input name="productFixtureId" type="hidden" value={pilotFixture} />
          </>
        ) : null}
        {purchaseStep === "receipt" ? (
          <>
            <p>請求書・レシートを手元で確認し、写真と内容を照らし合わせて入力してください。</p>
            <label>
              請求書・レシートの写真（必須）
              <input
                type="file"
                accept="image/jpeg,image/png"
                capture="environment"
                required={!receiptFile}
                disabled={busy || pilotBlocked}
                onChange={(event) => setReceiptFile(event.target.files?.[0] ?? null)}
              />
            </label>
            <p>
              JPEGまたはPNG、25MB以下。選択中の写真は、この端末内で確認してから非公開で保存します。
            </p>
            {receiptPreview ? (
              <img
                className="receiptEvidencePreview"
                src={receiptPreview}
                alt="選択中の請求書・レシート"
              />
            ) : null}
          </>
        ) : null}
        <fieldset className="measurementGrid" hidden={purchaseStep !== "item"}>
          <label>
            商品管理コード
            <input
              name="skuCode"
              required
              defaultValue={pilotIdentifiers?.skuCode ?? ""}
              readOnly={pilotIdentifiers !== null}
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
            商品の種類
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
              <input
                name="category"
                type="hidden"
                value={pilotDisplayCategory(pilotProfile.category)}
              />
            ) : null}
            <input name="measurementTemplateId" type="hidden" value={measurementTemplateId ?? ""} />
          </label>
          <label>
            この商品の仕入れ代（円）
            <input
              name="allocatedCostMinor"
              type="number"
              min="0"
              required
              defaultValue={pilotFixture ? "1500" : ""}
            />
          </label>
        </fieldset>
        <fieldset
          ref={receiptFields}
          className="measurementGrid"
          hidden={purchaseStep !== "receipt"}
        >
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
            請求書・レシートの参照番号
            <input
              name="receiptReference"
              required
              defaultValue={pilotIdentifiers?.receiptReference ?? ""}
              readOnly={pilotIdentifiers !== null}
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
            請求書・レシートの合計（円）
            <input
              name="receiptAmountMinor"
              type="number"
              min="0"
              required
              defaultValue={pilotFixture ? "1500" : ""}
            />
          </label>
        </fieldset>
        {purchaseStep === "receipt" ? (
          <button
            type="button"
            disabled={busy || pilotBlocked}
            onClick={() => {
              const fields = receiptFields.current?.querySelectorAll<HTMLInputElement>("input");
              if (
                receiptFile &&
                fields &&
                Array.from(fields).every((field) => field.reportValidity())
              )
                setPurchaseStep("item");
            }}
          >
            写真と内容を確認した
          </button>
        ) : null}
        <div className="humanGate" hidden={purchaseStep !== "item"}>
          <div>
            <strong>資料の参照番号と金額を確認</strong>
            <p>AIは原価・税区分を確定しません。住所などの個人情報は入力しないでください。</p>
          </div>
          <button type="submit" disabled={busy || pilotBlocked}>
            {pilotBlocked
              ? "前の試験商品を完了してください"
              : pilotFixture
                ? `${pilotFixture}の計測を開始`
                : "仕入れを確認して商品番号を作る"}
          </button>
        </div>
        {purchaseStep === "item" ? (
          <button type="button" disabled={busy} onClick={() => setPurchaseStep("receipt")}>
            ‹ 資料の確認に戻る
          </button>
        ) : null}
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
  return p0UserFacingErrorMessage(reason);
}
function externalInvalidationReasonLabel(reason: string | null): string {
  if (reason === "power_outage") return "停電";
  if (reason === "os_forced_update") return "OSの強制更新";
  if (reason === "device_hardware_failure") return "端末の故障";
  return "理由未確認";
}
function localDateTimeValue(): string {
  const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000);
  return now.toISOString().slice(0, 16);
}

function isPhotoRole(value: string): value is PhotoRole {
  return value === "front" || value === "back" || value === "brand_tag" || value === "care_label";
}

function hasListingExportPhotos(item: P0ItemResponse): boolean {
  return (
    item.capture.photoAssetIds.length === photoRoles.length &&
    photoRoles.every((role) => {
      const index = item.capture.photoRoles.indexOf(role.id);
      return index >= 0 && Boolean(item.capture.photoAssetIds[index]);
    })
  );
}

function latestMeasurements(
  measurements: readonly { definitionId: string; value: number; attempt: number }[],
): Record<string, { value: number; attempt: number }> {
  return measurements.reduce<Record<string, { value: number; attempt: number }>>(
    (result, measurement) => {
      const previous = result[measurement.definitionId];
      if (!previous || previous.attempt < measurement.attempt)
        result[measurement.definitionId] = {
          value: measurement.value,
          attempt: measurement.attempt,
        };
      return result;
    },
    {},
  );
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
