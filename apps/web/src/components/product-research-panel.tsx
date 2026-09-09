"use client";

import type { ProductResearchResponse } from "@resale/contracts";
import { useCallback, useEffect, useState } from "react";
import {
  buildResearchSearchTerms,
  buildMercariSearchUrl,
  buildCodexResearchQuestion,
  copyResearchText,
} from "../lib/product-research-handoff";

export function ProductResearchPanel({
  workspaceId,
  skuId,
  attributeEvidence,
  pilotActive,
  pilotBlocked,
  onChanged,
}: {
  workspaceId: string;
  skuId: string;
  attributeEvidence: readonly { assetId: string; role: "brand_tag" | "care_label" }[];
  pilotActive: boolean;
  pilotBlocked: boolean;
  onChanged: () => Promise<void>;
}) {
  const [research, setResearch] = useState<ProductResearchResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [brand, setBrand] = useState("");
  const [sizeLabel, setSizeLabel] = useState("");
  const [color, setColor] = useState("");
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
  useEffect(() => {
    setBrand(research?.confirmedAttributes?.brand ?? "");
    setSizeLabel(research?.confirmedAttributes?.sizeLabel ?? "");
    setColor(research?.confirmedAttributes?.color ?? "");
  }, [research?.confirmedAttributes]);

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
      await onChanged();
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

  async function saveAttributes(form: FormData) {
    await act(async () => {
      const evidenceAssetId = text(form, "evidenceAssetId");
      if (!evidenceAssetId)
        throw new Error("ブランドタグまたは品質表示の根拠写真を選択してください。");
      const sourceCandidateId = text(form, "sourceCandidateId");
      const sourceCandidate = research?.candidates.find(
        (candidate) => candidate.candidateId === sourceCandidateId,
      );
      if (sourceCandidateId && sourceCandidate?.sourceAssetId !== evidenceAssetId) {
        throw new Error(
          "OCR候補を根拠として使う場合は、その候補を作った同じタグ写真を根拠写真に選択してください。",
        );
      }
      await send(`/v1/workspaces/${workspaceId}/skus/${skuId}/product-attributes`, {
        brand: brand.trim(),
        sizeLabel: sizeLabel.trim(),
        color: color.trim(),
        evidenceAssetId,
        ...(sourceCandidateId ? { sourceCandidateId } : {}),
        ...(research?.confirmedAttributes
          ? { supersedesConfirmationId: research.confirmedAttributes.confirmationId }
          : {}),
        humanConfirmed: true,
      });
      await refresh();
      await onChanged();
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
          <h3 id="research-heading">
            {pilotActive ? "固定商品の属性確認" : "商品候補と価格の根拠"}
          </h3>
        </div>
        <span className="status">
          {pilotActive ? "ローカル限定" : `${research?.includedSoldCount ?? 0}件採用`}
        </span>
      </div>
      {pilotActive ? (
        <div className="candidateNotice" role="note">
          <strong>P06計測中は外部ページを開きません</strong>
          <p>
            固定fixtureのローカル4写真・採寸・ブランド・サイズ・色だけを使います。URLと表示価格の入力欄は計測終了まで停止しています。
          </p>
        </div>
      ) : (
        <p className="accountingDisclaimer">
          公式画面を人が確認してURLと表示価格を記録します。アプリが外部ページを巡回・取得することはありません。
        </p>
      )}
      {research?.candidates.map((candidate) => (
        <article className="candidateNotice" key={candidate.candidateId}>
          <strong>
            {candidate.brandCandidate ?? "ブランド不明"}／{candidate.modelCandidate ?? "型番不明"}
          </strong>
          <p>
            素材 {candidate.materialCandidate ?? "—"}・サイズ {candidate.sizeCandidate ?? "—"}・色{" "}
            {candidate.colorCandidate ?? "—"}・状態 {candidate.status}
          </p>
          {candidate.status === "candidate" ? (
            <div className="inlineActions">
              <button
                type="button"
                disabled={busy || pilotBlocked}
                onClick={() => void decide(candidate.candidateId, "human_confirmed")}
              >
                実物を見て採用
              </button>
              <button
                className="secondaryButton"
                type="button"
                disabled={busy || pilotBlocked}
                onClick={() => void decide(candidate.candidateId, "rejected")}
              >
                不採用
              </button>
            </div>
          ) : null}
        </article>
      ))}
      <form className="compactForm" action={(form) => void saveAttributes(form)}>
        <h4>ブランド・サイズ・色を人が確認して保存</h4>
        <p className="accountingDisclaimer">
          OCR候補の採否とは別の確認です。候補を選んでも、入力値を自動で確定しません。
        </p>
        <label>
          ブランド
          <input required value={brand} onChange={(event) => setBrand(event.target.value)} />
        </label>
        <label>
          サイズ表記
          <input
            required
            value={sizeLabel}
            onChange={(event) => setSizeLabel(event.target.value)}
          />
        </label>
        <label>
          色
          <input required value={color} onChange={(event) => setColor(event.target.value)} />
        </label>
        <label>
          根拠写真（同じSKUのブランドタグ／品質表示のみ）
          <select name="evidenceAssetId" required defaultValue="">
            <option value="" disabled>
              根拠写真を選択
            </option>
            {attributeEvidence.map((asset) => (
              <option key={asset.assetId} value={asset.assetId}>
                {asset.role === "brand_tag" ? "ブランドタグ" : "品質表示"}
              </option>
            ))}
          </select>
        </label>
        <label>
          使用したOCR候補（任意・明示選択時だけ記録）
          <select name="sourceCandidateId" defaultValue="">
            <option value="">候補を根拠として使わない</option>
            {research?.candidates
              .filter((candidate) => candidate.status !== "rejected")
              .map((candidate) => (
                <option key={candidate.candidateId} value={candidate.candidateId}>
                  {candidate.brandCandidate ?? "ブランド不明"}／
                  {candidate.sizeCandidate ?? "サイズ不明"}／{candidate.colorCandidate ?? "色不明"}
                </option>
              ))}
          </select>
        </label>
        <button disabled={busy || pilotBlocked || attributeEvidence.length === 0}>
          {research?.confirmedAttributes ? "人が確認して属性訂正を保存" : "人が確認して属性を保存"}
        </button>
      </form>
      {research?.confirmedAttributes ? (
        <p className="successMessage" role="status">
          確認済み: {research.confirmedAttributes.brand}／{research.confirmedAttributes.sizeLabel}／
          {research.confirmedAttributes.color}（revision {research.confirmedAttributes.revision}
          、根拠 {research.confirmedAttributes.evidenceAssetId}、訂正元{" "}
          {research.confirmedAttributes.supersedesConfirmationId ?? "なし"}）
        </p>
      ) : null}
      {!pilotActive ? (
        <>
          {research && research.workspaceId === workspaceId && research.skuId === skuId ? (
            <ResearchHandoff key={`${workspaceId}:${skuId}`} research={research} />
          ) : null}
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
        </>
      ) : null}
      {error ? (
        <p className="formError" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function ResearchHandoff({ research }: { research: ProductResearchResponse }) {
  const [terms, setTerms] = useState(() => buildResearchSearchTerms(research));
  const [questionDraft, setQuestionDraft] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const question = questionDraft ?? buildCodexResearchQuestion(terms);

  async function handleCopyClick(value: string) {
    setCopyStatus("");
    const copied = await copyResearchText(value, (text) => navigator.clipboard.writeText(text));
    setCopyStatus(
      copied
        ? "コピーしました。貼り付け先と内容を確認してください。"
        : "コピーできませんでした。入力欄の文章を選択して手動でコピーしてください。",
    );
  }

  function handleSearchClick() {
    const url = buildMercariSearchUrl(terms);
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="compactForm">
      <h4>販売価格を自分で調べる</h4>
      <p className="accountingDisclaimer">
        検索語と質問文はこの画面内だけで作る候補です。自由に編集・並べ替えできます。検索結果の自動取得やCodexへの自動送信はしません。予想価格は人が確認します。
      </p>
      <label>
        検索語（候補）
        <input
          value={terms}
          onChange={(event) => {
            setTerms(event.target.value);
            setCopyStatus("");
          }}
        />
      </label>
      <div className="inlineActions">
        <button type="button" disabled={!terms.trim()} onClick={() => void handleCopyClick(terms)}>
          検索語をコピー
        </button>
        <button type="button" disabled={!buildMercariSearchUrl(terms)} onClick={handleSearchClick}>
          メルカリで検索を開く
        </button>
      </div>
      <label>
        Codex用の質問文（候補）
        <textarea
          rows={7}
          value={question}
          onChange={(event) => {
            setQuestionDraft(event.target.value);
            setCopyStatus("");
          }}
        />
      </label>
      <button
        type="button"
        disabled={!question.trim()}
        onClick={() => void handleCopyClick(question)}
      >
        Codex用の質問文をコピー
      </button>
      <p className="accountingDisclaimer">
        外部検索は上のボタンを押した時だけ、新しいタブで開きます。質問文は内容を確認し、自分でCodexへ貼り付けてください。編集内容は保存されず、この画面を離れると失われます。
      </p>
      {copyStatus ? <p role="status">{copyStatus}</p> : null}
    </div>
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
