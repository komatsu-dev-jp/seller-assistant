"use client";

import type { CaptureTaskResponse, MeasurementResponse } from "@resale/contracts";
import { useCallback, useEffect, useState } from "react";
import {
  clearCaptureBusinessData,
  clearCaptureUploads,
  clearUnassignedCaptureUploads,
  loadCaptureUploads,
  markCaptureUploaded,
  prepareCaptureUpload,
  type CaptureRole,
} from "../lib/capture-outbox";

const roles: ReadonlyArray<{ id: CaptureRole; label: string }> = [
  { id: "front", label: "正面" },
  { id: "back", label: "背面" },
  { id: "brand_tag", label: "ブランドタグ" },
  { id: "care_label", label: "品質表示" },
];
const definitions = {
  shoulder_width: "肩幅",
  chest_width: "身幅",
  sleeve_length: "袖丈",
  body_length: "着丈",
} as const;
type DefinitionId = keyof typeof definitions;

export function MobileCaptureWorkspace({ workspaceId }: { workspaceId: string }) {
  const [tasks, setTasks] = useState<CaptureTaskResponse[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [files, setFiles] = useState<Partial<Record<CaptureRole, File>>>({});
  const [values, setValues] = useState<Record<DefinitionId, string>>({
    shoulder_width: "",
    chest_width: "",
    sleeve_length: "",
    body_length: "",
  });
  const [reviewReasonCode, setReviewReasonCode] = useState("");
  const [tagText, setTagText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const task = tasks.find((entry) => entry.skuId === selectedId) ?? tasks[0] ?? null;

  const refresh = useCallback(async () => {
    const loaded = await requestJson<CaptureTaskResponse[]>(
      `/v1/workspaces/${workspaceId}/capture-tasks`,
    );
    await clearUnassignedCaptureUploads(
      workspaceId,
      loaded.map((entry) => entry.skuId),
    );
    setTasks(loaded);
    setSelectedId((current) => {
      if (current && !loaded.some((entry) => entry.skuId === current)) {
        void clearCaptureUploads(workspaceId, current).catch(() => undefined);
      }
      return current && loaded.some((entry) => entry.skuId === current)
        ? current
        : (loaded[0]?.skuId ?? "");
    });
  }, [workspaceId]);

  useEffect(() => {
    refresh().catch(async (reason: unknown) => {
      if (isAssignmentRevokedError(reason)) {
        await clearCaptureBusinessData().catch(() => undefined);
        setFiles({});
      }
      setError(errorMessage(reason));
    });
  }, [refresh]);

  useEffect(() => {
    if (!task) return;
    const restored = { shoulder_width: "", chest_width: "", sleeve_length: "", body_length: "" };
    for (const measurement of task.measurements) {
      if (measurement.definitionId in restored) {
        restored[measurement.definitionId as DefinitionId] = String(measurement.value);
      }
    }
    setValues(restored);
    loadCaptureUploads(workspaceId, task.skuId)
      .then((records) => {
        const saved: Partial<Record<CaptureRole, File>> = {};
        for (const record of records) saved[record.role] = record.file;
        setFiles(saved);
      })
      .catch(() => undefined);
  }, [task?.skuId, workspaceId]);

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
        if (roleToAsset.has(role)) continue;
        const file = files[role];
        if (!file) throw new Error("未保存の写真4種を選択してください。");
        const pending = await prepareCaptureUpload(workspaceId, task.skuId, role, file);
        stagedUploads.set(role, pending);
        roleToAsset.set(role, pending.assetId);
      }
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
      const evidenceAssetId = roleToAsset.get("front");
      if (!evidenceAssetId) throw new Error("正面写真を確認できません。");
      const saved: Array<{ requiresReview: boolean }> = [];
      for (const definitionId of Object.keys(definitions) as DefinitionId[]) {
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
                definitionVersion: 1,
                value,
                unit: "cm",
                basis: "flat_width",
                state: "natural",
                measuredAt: new Date().toISOString(),
                evidenceAssetId,
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
      setTagText("");
      setMessage("写真・採寸を保存しました。商品候補は管理者の確認待ちです。");
      await refresh();
    } catch (reason) {
      if (isAssignmentRevokedError(reason)) {
        await clearCaptureUploads(workspaceId, task.skuId).catch(() => undefined);
        setFiles({});
      }
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  if (!task) return <p className="accountingDisclaimer">現在の撮影割当はありません。</p>;
  return (
    <section className="workflowPanel panel">
      <div className="workflowPanelHead">
        <div>
          <p className="eyebrow">ASSIGNED CAPTURE</p>
          <h1>{task.skuCode}</h1>
        </div>
        <span className="status">
          {new Date(task.assignmentExpiresAt).toLocaleString("ja-JP")}まで
        </span>
      </div>
      <p>{task.title}／割り当てられた商品だけを表示しています。</p>
      {tasks.length > 1 ? (
        <label className="fieldLabel">
          商品
          <select value={task.skuId} onChange={(event) => setSelectedId(event.target.value)}>
            {tasks.map((entry) => (
              <option key={entry.skuId} value={entry.skuId}>
                {entry.skuCode}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="photoChecklist">
        {roles.map(({ id, label }) => {
          const saved = task.photoRoles.includes(id);
          return (
            <label className={saved || files[id] ? "checked" : ""} key={id}>
              <input
                type="file"
                accept="image/jpeg,image/png"
                capture="environment"
                disabled={saved}
                onChange={(event) =>
                  setFiles((current) => ({ ...current, [id]: event.target.files?.[0] }))
                }
              />
              <span aria-hidden="true">{saved || files[id] ? "✓" : "＋"}</span>
              <strong>{label}</strong>
              <small>{saved ? "保存済み" : "JPEG/PNG"}</small>
            </label>
          );
        })}
      </div>
      <div className="measurementGrid">
        {(Object.keys(definitions) as DefinitionId[]).map((id) => (
          <label key={id}>
            {definitions[id]}
            <span>
              <input
                type="number"
                min="0.1"
                max="250"
                step="0.1"
                inputMode="decimal"
                value={values[id]}
                onChange={(event) =>
                  setValues((current) => ({ ...current, [id]: event.target.value }))
                }
              />
              cm
            </span>
          </label>
        ))}
      </div>
      <label className="fieldLabel">
        再測定理由
        <select
          value={reviewReasonCode}
          onChange={(event) => setReviewReasonCode(event.target.value)}
        >
          <option value="">初回または差なし</option>
          <option value="previous_entry_error">前回入力を修正</option>
          <option value="garment_stretch">伸縮素材を再確認</option>
          <option value="measurement_definition_corrected">測定位置を修正</option>
        </select>
      </label>
      <label className="fieldLabel">
        タグから読み取った文字（任意）
        <textarea
          rows={4}
          maxLength={4000}
          value={tagText}
          onChange={(event) => setTagText(event.target.value)}
        />
        <small>iPhoneの文字認識結果を貼り付けます。候補になるだけで自動確定しません。</small>
      </label>
      {error ? (
        <p className="formError" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="successMessage" role="status">
          {message}
        </p>
      ) : null}
      <button type="button" disabled={busy} onClick={() => void save()}>
        {busy ? "保存中…" : "人が確認して保存"}
      </button>
    </section>
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

function isCaptureRole(value: string): value is CaptureRole {
  return value === "front" || value === "back" || value === "brand_tag" || value === "care_label";
}
