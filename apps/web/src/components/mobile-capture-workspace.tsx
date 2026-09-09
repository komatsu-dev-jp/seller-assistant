"use client";

import type { CaptureTaskResponse, MeasurementResponse } from "@resale/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  clearCaptureBusinessData,
  clearCaptureUploads,
  clearUnassignedCaptureUploads,
  loadCaptureDraft,
  loadCaptureUploads,
  markCaptureUploaded,
  prepareCaptureUpload,
  prepareMeasurementEvidenceUpload,
  saveCaptureDraft,
  type CaptureRole,
} from "../lib/capture-outbox";
import { completeMeasurements, measurementDefinitionsFor } from "../lib/measurement-profile";
import { WorkflowCaptureSteps, WorkflowLiveLayout } from "./workflow-live-layout";
import { assignedCaptureTasks } from "./workflow-capture-data";

const roles: ReadonlyArray<{ id: CaptureRole; label: string }> = [
  { id: "front", label: "正面" },
  { id: "back", label: "背面" },
  { id: "brand_tag", label: "ブランドタグ" },
  { id: "care_label", label: "品質表示" },
];
export function MobileCaptureWorkspace({ workspaceId }: { workspaceId: string }) {
  const [loading, setLoading] = useState(true);
  const [completedSkuId, setCompletedSkuId] = useState("");
  const [tasks, setTasks] = useState<CaptureTaskResponse[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [files, setFiles] = useState<Partial<Record<CaptureRole, File>>>({});
  const [measurementEvidence, setMeasurementEvidence] = useState<Partial<Record<string, File>>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [reviewReasonCode, setReviewReasonCode] = useState("");
  const [tagText, setTagText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [draftReadyFor, setDraftReadyFor] = useState("");
  const task = tasks.find((entry) => entry.skuId === selectedId) ?? tasks[0] ?? null;
  const definitions = measurementDefinitionsFor(task?.measurementProfile ?? null);
  const draftTemplate = useMemo(
    () =>
      task?.measurementProfile
        ? {
            id: task.measurementProfile.measurementTemplateId,
            version: task.measurementProfile.measurementTemplateVersion,
          }
        : null,
    [task?.measurementProfile],
  );

  const refresh = useCallback(async () => {
    const loaded = assignedCaptureTasks(
      await requestJson<unknown>(`/v1/workspaces/${workspaceId}/capture-tasks`),
      workspaceId,
    );
    await clearUnassignedCaptureUploads(
      workspaceId,
      loaded.map((entry) => entry.skuId),
    );
    setTasks(loaded);
    setSelectedId((current) => {
      return current && loaded.some((entry) => entry.skuId === current)
        ? current
        : (loaded[0]?.skuId ?? "");
    });
  }, [workspaceId]);

  useEffect(() => {
    refresh()
      .catch(async (reason: unknown) => {
        if (isAssignmentRevokedError(reason)) {
          try {
            await clearCaptureBusinessData();
          } catch (cleanupError) {
            setError(`担当は解除済みですが、${errorMessage(cleanupError)}`);
            return;
          }
          setFiles({});
          setTasks([]);
          setValues({});
          setTagText("");
        }
        setError(errorMessage(reason));
      })
      .finally(() => setLoading(false));
  }, [refresh]);

  useEffect(() => {
    if (!task) return;
    let cancelled = false;
    setDraftReadyFor("");
    const restored = Object.fromEntries(
      definitions.map((definition) => [definition.definitionId, ""]),
    ) as Record<string, string>;
    for (const measurement of task.measurements) {
      if (measurement.definitionId in restored) {
        restored[measurement.definitionId] = String(measurement.value);
      }
    }
    Promise.all([
      loadCaptureUploads(workspaceId, task.skuId),
      loadCaptureDraft(workspaceId, task.skuId, draftTemplate),
    ])
      .then(([records, draft]) => {
        if (cancelled) return;
        const saved: Partial<Record<CaptureRole, File>> = {};
        const savedEvidence: Partial<Record<string, File>> = {};
        for (const record of records) {
          if (record.file && isCaptureRole(record.role)) saved[record.role] = record.file;
          if (
            record.file &&
            record.role === "measurement_evidence" &&
            record.measurementDefinitionId
          )
            savedEvidence[record.measurementDefinitionId] = record.file;
        }
        setFiles(saved);
        setMeasurementEvidence(savedEvidence);
        setValues(draft?.measurements ?? restored);
        setReviewReasonCode(draft?.reviewReasonCode ?? "");
        setTagText(draft?.tagText ?? "");
        setDraftReadyFor(task.skuId);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(errorMessage(reason));
      });
    return () => {
      cancelled = true;
    };
  }, [definitions, draftTemplate, task?.skuId, workspaceId]);

  useEffect(() => {
    if (!task || draftReadyFor !== task.skuId) return;
    void saveCaptureDraft(workspaceId, task.skuId, {
      measurements: values,
      measurementTemplateId: draftTemplate?.id ?? null,
      measurementTemplateVersion: draftTemplate?.version ?? null,
      reviewReasonCode,
      tagText,
    }).catch((reason: unknown) => setError(errorMessage(reason)));
  }, [draftReadyFor, draftTemplate, reviewReasonCode, tagText, task?.skuId, values, workspaceId]);

  async function save() {
    if (!task) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const roleToAsset = new Map<CaptureRole, string>();
      task.photoRoles.forEach((role, index) => {
        const assetId = task.photoAssetIds[index];
        if (assetId && isCaptureRole(role)) roleToAsset.set(role, assetId);
      });
      const stagedUploads = new Map<
        CaptureRole,
        Awaited<ReturnType<typeof prepareCaptureUpload>>
      >();
      for (const { id: role } of roles) {
        const file = files[role];
        if (!file && roleToAsset.has(role)) continue;
        if (!file) throw new Error("未保存の写真4種を選択してください。");
        const pending = await prepareCaptureUpload(workspaceId, task.skuId, role, file);
        stagedUploads.set(role, pending);
        roleToAsset.set(role, pending.assetId);
      }
      const stagedMeasurementUploads = new Map<
        string,
        Awaited<ReturnType<typeof prepareMeasurementEvidenceUpload>>
      >();
      for (const definition of definitions) {
        const file = measurementEvidence[definition.definitionId];
        if (!file)
          throw new Error("各採寸項目の根拠写真を選んでください。掲載用の正面写真は使えません。");
        stagedMeasurementUploads.set(
          definition.definitionId,
          await prepareMeasurementEvidenceUpload(
            workspaceId,
            task.skuId,
            definition.definitionId,
            file,
          ),
        );
      }
      if (!navigator.onLine)
        throw new Error("通信がないため保存できません。写真は画面を開いている間だけ保持します。");
      for (const { id: role } of roles) {
        const pending = stagedUploads.get(role);
        if (!pending) continue;
        if (!pending.uploaded) {
          await requestJson(
            `/v1/workspaces/${workspaceId}/skus/${task.skuId}/media-uploads?assetId=${pending.assetId}&role=${role}`,
            { method: "POST", body: pending.file, headers: { "content-type": pending.file.type } },
          );
          await markCaptureUploaded(pending.key);
        }
      }
      const measurementAssetIds = new Map<string, string>();
      for (const definition of definitions) {
        const pending = stagedMeasurementUploads.get(definition.definitionId);
        if (!pending) throw new Error("採寸写真を準備できませんでした。");
        if (!pending.uploaded) {
          await requestJson(
            `/v1/workspaces/${workspaceId}/skus/${task.skuId}/media-uploads?assetId=${pending.assetId}&role=measurement_evidence&measurementDefinitionId=${encodeURIComponent(definition.definitionId)}`,
            { method: "POST", body: pending.file, headers: { "content-type": pending.file.type } },
          );
          await markCaptureUploaded(pending.key);
        }
        measurementAssetIds.set(definition.definitionId, pending.assetId);
      }
      const saved: Array<{ requiresReview: boolean }> = [];
      for (const definition of definitions) {
        const definitionId = definition.definitionId;
        const value = Number(values[definitionId]);
        if (!(value > 0 && value <= 250)) throw new Error("採寸値を0.1〜250cmで入力してください。");
        const previous = task.measurements
          .filter((entry) => entry.definitionId === definitionId)
          .sort((left, right) => right.attempt - left.attempt)[0];
        if (previous && previous.value === value && !previous.requiresReview) {
          saved.push(previous);
          continue;
        }
        saved.push(
          await requestJson<MeasurementResponse>(
            `/v1/workspaces/${workspaceId}/skus/${task.skuId}/measurements`,
            {
              method: "POST",
              body: JSON.stringify({
                definitionId,
                definitionVersion: definition.definitionVersion,
                value,
                unit: "cm",
                basis: definition.basis,
                state: definition.state,
                measuredAt: new Date().toISOString(),
                evidenceAssetId: measurementAssetIds.get(definitionId),
                attempt: (previous?.attempt ?? 0) + 1,
                reviewReasonCode: reviewReasonCode || undefined,
                humanConfirmed: true,
              }),
            },
          ),
        );
      }
      await refresh();
      if (saved.some((entry) => entry.requiresReview)) {
        throw new Error("2cmを超える差があります。再測定し、正しい場合は理由を選んでください。");
      }
      const evidenceReferenceIds = [...roleToAsset.values()];
      if (tagText.trim()) {
        const sourceAssetId = roleToAsset.get("brand_tag");
        if (!sourceAssetId) throw new Error("タグ文字にはブランドタグ写真が必要です。");
        await requestJson(`/v1/workspaces/${workspaceId}/skus/${task.skuId}/identity-candidates`, {
          method: "POST",
          body: JSON.stringify({
            sourceAssetId,
            rawOcrText: tagText,
            humanConfirmedSource: true,
          }),
        });
      }
      await requestJson(`/v1/workspaces/${workspaceId}/skus/${task.skuId}/p0-actions`, {
        method: "POST",
        body: JSON.stringify({
          action: "confirm_capture",
          idempotencyKey: crypto.randomUUID(),
          evidenceReferenceIds,
          requiredFactsConfirmed: true,
          manualChannelHandoff: false,
        }),
      });
      await clearCaptureUploads(workspaceId, task.skuId);
      setFiles({});
      setMeasurementEvidence({});
      setTagText("");
      setMessage("写真・採寸を保存しました。商品候補は管理者の確認待ちです。");
      setCompletedSkuId(task.skuId);
      await refresh();
    } catch (reason) {
      if (isAssignmentRevokedError(reason)) {
        try {
          await clearCaptureUploads(workspaceId, task.skuId);
        } catch (cleanupError) {
          setError(`担当は解除済みですが、${errorMessage(cleanupError)}`);
          return;
        }
        setFiles({});
        setTasks([]);
        setValues({});
        setTagText("");
      }
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function retry() {
    setLoading(true);
    setError("");
    try {
      await refresh();
    } catch (reason) {
      if (isAssignmentRevokedError(reason)) {
        setTasks([]);
        setFiles({});
        setValues({});
        setTagText("");
        await clearCaptureBusinessData().catch(() => undefined);
      }
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  }

  return (
    <WorkflowLiveLayout captureOnly>
      {loading ? <p role="status">担当の商品を読み込んでいます…</p> : null}
      {error ? (
        <div role="alert">
          <p>{error}</p>
          <button type="button" disabled={busy || loading} onClick={() => void retry()}>
            もう一度読み込む
          </button>
        </div>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
      {!loading && !task ? <p>現在の撮影割当はありません。担当を確認してください。</p> : null}
      {task && !loading ? (
        <>
          <section className="panel">
            <h1>撮影・採寸</h1>
            <p>
              {task.skuCode} / {task.title}
            </p>
            <p>
              割り当てられた商品だけを表示しています。
              {new Date(task.assignmentExpiresAt).toLocaleString("ja-JP")}まで
            </p>
            {tasks.length > 1 ? (
              <label>
                商品
                <select
                  value={task.skuId}
                  disabled={busy || draftReadyFor !== task.skuId}
                  onChange={(event) => {
                    setDraftReadyFor("");
                    setSelectedId(event.target.value);
                  }}
                >
                  {tasks.map((entry) => (
                    <option key={entry.skuId} value={entry.skuId}>
                      {entry.skuCode}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </section>
          {completedSkuId === task.skuId ? (
            <section className="panel" data-workflow-screen="capture-saved">
              <h2>撮影・採寸を保存しました</h2>
              <p>商品候補は管理者が確認します。</p>
              <a href="/mobile">担当の作業へ戻る</a>
            </section>
          ) : (
            <WorkflowCaptureSteps
              key={task.skuId}
              photos={files}
              savedRoles={task.photoRoles}
              setPhoto={(role, file) => setFiles((current) => ({ ...current, [role]: file }))}
              definitions={definitions}
              measurements={values}
              setMeasurement={(id, value) => setValues((current) => ({ ...current, [id]: value }))}
              measurementEvidence={measurementEvidence}
              setMeasurementEvidence={(id, file) =>
                setMeasurementEvidence((current) => ({ ...current, [id]: file }))
              }
              previousMeasurements={latestMeasurements(task.measurements)}
              reason={reviewReasonCode}
              setReason={setReviewReasonCode}
              completed={false}
              disabled={busy || draftReadyFor !== task.skuId}
              canSave={
                completeMeasurements(definitions, values) &&
                roles.every(({ id }) => files[id] || task.photoRoles.includes(id)) &&
                definitions.every((definition) => measurementEvidence[definition.definitionId])
              }
              onSave={() => void save()}
              onNext={() => undefined}
              tagContent={
                <label>
                  タグから読み取った文字（任意）
                  <textarea
                    rows={4}
                    maxLength={4000}
                    value={tagText}
                    disabled={busy}
                    onChange={(event) => setTagText(event.target.value)}
                  />
                  <small>
                    文字認識結果を貼り付けます。候補として保存し、管理者が確認します。ここではブランドを確定しません。
                  </small>
                </label>
              }
            />
          )}
        </>
      ) : null}
    </WorkflowLiveLayout>
  );
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: {
      ...(init?.headers ?? {}),
      ...(typeof init?.body === "string" ? { "content-type": "application/json" } : {}),
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
      error?: { message?: string };
    } | null;
    throw new HttpResponseError(
      body?.message ?? body?.error?.message ?? `保存に失敗しました（${response.status}）`,
      response.status,
    );
  }
  return (await response.json()) as T;
}

class HttpResponseError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function isAssignmentRevokedError(reason: unknown): boolean {
  return reason instanceof HttpResponseError && reason.status === 403;
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : "処理に失敗しました。";
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

function isCaptureRole(value: string): value is CaptureRole {
  return value === "front" || value === "back" || value === "brand_tag" || value === "care_label";
}
