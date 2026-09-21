"use client";

import "./sales-check-panel.css";

import {
  salesCheckFields,
  salesCheckResponseSchema,
  salesCheckSummarySchema,
  type SalesCheckSummary,
} from "@resale/contracts";
import { useEffect, useRef, useState } from "react";
import {
  completeSalesCheck,
  parseSalesCheckDraft,
  pendingSalesCheck,
  rememberSalesCheck,
  salesCheckDraft,
  salesCheckLabels,
} from "../lib/sales-check";

type Props = { workspaceId: string; skuId: string; pilotActive: boolean };
export function SalesCheckPanel(props: Props) {
  return <SalesCheckPanelSession key={props.workspaceId + props.skuId} {...props} />;
}

function SalesCheckPanelSession({ workspaceId, skuId, pilotActive }: Props) {
  const path = `/v1/workspaces/${workspaceId}/skus/${skuId}/sales-checks`;
  const [summary, setSummary] = useState<SalesCheckSummary | null>(null);
  const [draft, setDraft] = useState(salesCheckDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [unresolved, setUnresolved] = useState(Boolean(pendingSalesCheck(path)));
  const [dirty, setDirty] = useState(false);
  const alive = useRef(false);
  const busy = useRef(false);
  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void readSummary(path, workspaceId, skuId, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setSummary(result);
        const pending = pendingSalesCheck(path);
        setDraft(
          pending
            ? {
                ...salesCheckDraft(),
                ...Object.fromEntries(
                  salesCheckFields.map((field) => [field, pending[field] ?? ""]),
                ),
                checkedOn: pending.checkedOn,
                nextCheckOn: pending.nextCheckOn,
              }
            : salesCheckDraft(result.latest),
        );
        setUnresolved(Boolean(pending));
        setDirty(false);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("販売状況を読み込めませんでした。もう一度読み込んでください。");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      alive.current = false;
      controller.abort();
    };
  }, [path, workspaceId, skuId, revision]);

  async function save() {
    if (busy.current || loading || !summary?.eligible || pilotActive) return;
    let input = pendingSalesCheck(path);
    if (!input) {
      try {
        input = parseSalesCheckDraft(draft, crypto.randomUUID());
      } catch {
        setError(
          "数値は空欄または0〜2,147,483,647の半角整数、確認日と次回確認日は実在する日付で入力してください。",
        );
        return;
      }
      rememberSalesCheck(path, input);
    }
    const submitted = input;
    busy.current = true;
    setUnresolved(true);
    setSaving(true);
    setError("");
    try {
      const saved = salesCheckResponseSchema.parse(
        await request(path, { method: "POST", body: JSON.stringify(submitted) }),
      );
      if (saved.workspaceId !== workspaceId || saved.skuId !== skuId)
        throw new Error("Mismatched observation");
      const result = await readSummary(path, workspaceId, skuId);
      if (!result.latest || result.recordCount < 1) throw new Error("Missing observation");
      if (!alive.current) return;
      completeSalesCheck(path, submitted.idempotencyKey);
      setSummary(result);
      setDraft(salesCheckDraft(result.latest));
      setUnresolved(false);
      setDirty(false);
    } catch {
      if (alive.current)
        setError(
          "保存結果を確認できませんでした。入力内容を保持しています。「同じ内容で保存結果を確認」で再確認してください。",
        );
    } finally {
      busy.current = false;
      if (alive.current) setSaving(false);
    }
  }

  return (
    <section className="salesCheckPanel" aria-labelledby="sales-check-heading">
      <h3 id="sales-check-heading">販売状況の確認記録</h3>
      <p>
        本人が公式ページで確認した値を入力します。空欄は未確認として残します。売上や在庫には反映しません。
      </p>
      {loading ? <p role="status">販売状況を読み込んでいます…</p> : null}
      {error ? (
        <p role="alert" className="inlineError">
          {error}
        </p>
      ) : null}
      {!loading && !summary ? (
        <button type="button" onClick={() => setRevision((value) => value + 1)}>
          もう一度読み込む
        </button>
      ) : null}
      {!loading && summary && !summary.eligible ? (
        <div>
          <p>先に公開後の商品URLを登録してください。</p>
          <button type="button" onClick={() => setRevision((value) => value + 1)}>
            商品URLの登録状態を再確認
          </button>
        </div>
      ) : null}
      {!loading && summary?.eligible ? (
        <>
          <p role="status">
            {saving
              ? "保存して再確認中…"
              : unresolved
                ? "保存結果の再確認が必要です"
                : summary.latest
                  ? "保存済み"
                  : "初回入力"}{" "}
            ・ 履歴 {summary.recordCount}件
          </p>
          {summary.latest ? (
            <dl className="salesCheckSummary">
              {salesCheckFields.map((field) => (
                <div key={field}>
                  <dt>{salesCheckLabels[field]}</dt>
                  <dd>{summary.latest?.[field] ?? "未確認"}</dd>
                </div>
              ))}
              <div>
                <dt>確認日</dt>
                <dd>{summary.latest.checkedOn}</dd>
              </div>
              <div>
                <dt>次回確認日</dt>
                <dd>{summary.latest.nextCheckOn}</dd>
              </div>
              <div>
                <dt>入力元</dt>
                <dd>本人が公式ページで確認</dd>
              </div>
              <div>
                <dt>確認者</dt>
                <dd>ログイン中の管理担当</dd>
              </div>
              <div>
                <dt>保存日時</dt>
                <dd>{new Date(summary.latest.savedAt).toLocaleString("ja-JP")}</dd>
              </div>
            </dl>
          ) : null}
          {pilotActive ? <p>試験計測中は販売状況を保存できません。</p> : null}
          <fieldset className="salesCheckForm" disabled={saving || unresolved || pilotActive}>
            <legend>今回確認した内容（過去の記録は変更しません）</legend>
            {salesCheckFields.map((field) => (
              <label key={field}>
                {salesCheckLabels[field]}
                <input
                  inputMode="numeric"
                  autoComplete="off"
                  value={draft[field]}
                  onChange={(event) => {
                    setDraft((current) => ({ ...current, [field]: event.target.value }));
                    setDirty(true);
                  }}
                />
              </label>
            ))}
            <label>
              確認日（必須）
              <input
                type="date"
                required
                value={draft.checkedOn}
                onChange={(event) => {
                  setDraft((current) => ({ ...current, checkedOn: event.target.value }));
                  setDirty(true);
                }}
              />
            </label>
            <label>
              次回確認日（必須）
              <input
                type="date"
                required
                value={draft.nextCheckOn}
                onChange={(event) => {
                  setDraft((current) => ({ ...current, nextCheckOn: event.target.value }));
                  setDirty(true);
                }}
              />
            </label>
            <p>入力元：本人が公式ページで確認（固定）。画像や外部ページは自動取得しません。</p>
          </fieldset>
          <button
            type="button"
            disabled={saving || pilotActive || (!unresolved && !dirty)}
            onClick={() => void save()}
          >
            {saving
              ? "保存して確認中…"
              : unresolved
                ? "同じ内容で保存結果を確認"
                : "入力内容を保存"}
          </button>
        </>
      ) : null}
    </section>
  );
}

async function readSummary(path: string, workspaceId: string, skuId: string, signal?: AbortSignal) {
  const result = salesCheckSummarySchema.parse(
    await request(path, signal ? { signal } : undefined),
  );
  if (result.workspaceId !== workspaceId || result.skuId !== skuId)
    throw new Error("Mismatched SKU");
  return result;
}
async function request(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, {
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    ...init,
  });
  if (!response.ok) throw new Error("Sales check request failed");
  return response.json();
}
