"use client";

import type { ProductResearchResponse } from "@resale/contracts";
import { useCallback, useEffect, useState } from "react";

export function ProductResearchPanel({
  workspaceId,
  skuId,
}: {
  workspaceId: string;
  skuId: string;
}) {
  const [research, setResearch] = useState<ProductResearchResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    const response = await fetch(`/v1/workspaces/${workspaceId}/skus/${skuId}/research`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error("商品候補と根拠を読み込めませんでした。");
    setResearch((await response.json()) as ProductResearchResponse);
  }, [skuId, workspaceId]);
  useEffect(() => {
    refresh().catch((reason: unknown) => setError(message(reason)));
  }, [refresh]);

  async function decide(candidateId: string, status: "human_confirmed" | "rejected") {
    await act(async () => {
      await send(
        `/v1/workspaces/${workspaceId}/skus/${skuId}/identity-candidates/${candidateId}/decision`,
        {
          status,
          humanConfirmed: true,
        },
      );
      await refresh();
    });
  }

  async function addReference(form: FormData) {
    await act(async () => {
      const included = form.get("included") === "on";
      await send(`/v1/workspaces/${workspaceId}/skus/${skuId}/market-references`, {
        sourceUrl: text(form, "sourceUrl"),
        displayedPriceMinor: Number(text(form, "displayedPriceMinor")),
        soldState: form.get("soldState") === "on",
        itemCondition: text(form, "itemCondition"),
        shippingBasis: text(form, "shippingBasis"),
        included,
        exclusionReason: included ? null : text(form, "exclusionReason"),
        checkedAt: new Date().toISOString(),
        humanConfirmed: true,
      });
      await refresh();
    });
  }

  async function act(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="researchPanel" aria-labelledby="research-heading">
      <div className="panelHead">
        <div>
          <p className="eyebrow">HUMAN RESEARCH</p>
          <h3 id="research-heading">商品候補と価格の根拠</h3>
        </div>
        <span className="status">{research?.includedSoldCount ?? 0}件採用</span>
      </div>
      <p className="accountingDisclaimer">
        公式画面を人が確認してURLと表示価格を記録します。アプリが外部ページを巡回・取得することはありません。
      </p>
      {research?.candidates.map((candidate) => (
        <article className="candidateNotice" key={candidate.candidateId}>
          <strong>
            {candidate.brandCandidate ?? "ブランド不明"}／{candidate.modelCandidate ?? "型番不明"}
          </strong>
          <p>
            素材 {candidate.materialCandidate ?? "—"}・サイズ {candidate.sizeCandidate ?? "—"}・状態{" "}
            {candidate.status}
          </p>
          {candidate.status === "candidate" ? (
            <div className="inlineActions">
              <button
                type="button"
                disabled={busy}
                onClick={() => void decide(candidate.candidateId, "human_confirmed")}
              >
                実物を見て採用
              </button>
              <button
                className="secondaryButton"
                type="button"
                disabled={busy}
                onClick={() => void decide(candidate.candidateId, "rejected")}
              >
                不採用
              </button>
            </div>
          ) : null}
        </article>
      ))}
      <form className="compactForm" action={(form) => void addReference(form)}>
        <label>
          確認した公式画面のURL
          <input
            name="sourceUrl"
            type="url"
            required
            pattern="https://.*"
            placeholder="https://..."
          />
        </label>
        <label>
          表示価格（円）
          <input name="displayedPriceMinor" type="number" min="0" required />
        </label>
        <label>
          状態
          <input name="itemCondition" required placeholder="目立った傷なし" />
        </label>
        <label>
          送料
          <select name="shippingBasis">
            <option value="included">送料込み</option>
            <option value="separate">送料別</option>
            <option value="unknown">不明</option>
          </select>
        </label>
        <label className="checkLine">
          <input name="soldState" type="checkbox" />
          販売済みを人が確認
        </label>
        <label className="checkLine">
          <input name="included" type="checkbox" />
          比較根拠に採用
        </label>
        <label>
          不採用理由
          <input name="exclusionReason" placeholder="別型番など（不採用時は必須）" />
        </label>
        <button disabled={busy}>根拠を記録</button>
      </form>
      {research ? (
        <p>
          採用済み販売価格の中央値:{" "}
          {research.displayedPriceMedianMinor === null
            ? "根拠不足"
            : `${research.displayedPriceMedianMinor.toLocaleString("ja-JP")}円`}
          （3件未満は判断材料不足）
        </p>
      ) : null}
      {error ? (
        <p className="formError" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

async function send(url: string, body: unknown): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      message?: string;
      error?: { message?: string };
    } | null;
    throw new Error(payload?.message ?? payload?.error?.message ?? "保存できませんでした。");
  }
}
function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}
function message(reason: unknown): string {
  return reason instanceof Error ? reason.message : "処理に失敗しました。";
}
