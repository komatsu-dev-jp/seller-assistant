"use client";

import {
  publishedProductPageSummarySchema,
  type PublishedProductPageResponse,
} from "@resale/contracts";
import { useEffect, useRef, useState } from "react";

import {
  publishedProductPageDraftFingerprint,
  validatePublishedProductPageDraft,
} from "../lib/published-product-page";

type RetryKey = { fingerprint: string; idempotencyKey: string };

export function PublishedProductPagePanel({
  workspaceId,
  skuId,
  listingConfirmed,
  pilotActive,
}: {
  workspaceId: string;
  skuId: string;
  listingConfirmed: boolean;
  pilotActive: boolean;
}) {
  const [page, setPage] = useState<PublishedProductPageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [errorMode, setErrorMode] = useState<"load" | "save" | null>(null);
  const [reloadRevision, setReloadRevision] = useState(0);
  const [productId, setProductId] = useState("");
  const [productUrl, setProductUrl] = useState("");
  const [humanConfirmed, setHumanConfirmed] = useState(false);
  const retryKey = useRef<RetryKey | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setErrorMode(null);
    setPage(null);
    setProductId("");
    setProductUrl("");
    setHumanConfirmed(false);
    retryKey.current = null;
    void loadPublishedProductPage(workspaceId, skuId, controller.signal)
      .then((result) => setPage(result))
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(productPageErrorMessage(reason));
          setErrorMode("load");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [workspaceId, skuId, reloadRevision]);

  function changeProductId(value: string) {
    setProductId(value);
    setHumanConfirmed(false);
    setError("");
    setErrorMode(null);
  }

  function changeProductUrl(value: string) {
    setProductUrl(value);
    setHumanConfirmed(false);
    setError("");
    setErrorMode(null);
  }

  async function save() {
    if (saving || page || !listingConfirmed || pilotActive || !humanConfirmed) return;
    const validation = validatePublishedProductPageDraft(productId, productUrl);
    if (!validation.ok) {
      setError(validation.message);
      setErrorMode(null);
      return;
    }
    const normalizedProductId = productId.trim();
    const fingerprint = publishedProductPageDraftFingerprint(
      normalizedProductId,
      validation.canonicalUrl,
    );
    if (!retryKey.current || retryKey.current.fingerprint !== fingerprint) {
      retryKey.current = { fingerprint, idempotencyKey: crypto.randomUUID() };
    }
    setSaving(true);
    setError("");
    setErrorMode(null);
    try {
      await requestProductPage(
        `/v1/workspaces/${workspaceId}/skus/${skuId}/published-product-page`,
        {
          method: "POST",
          body: JSON.stringify({
            salesChannelKey: "mercari",
            salesChannelName: "メルカリ",
            productId: normalizedProductId,
            productUrl: validation.canonicalUrl,
            idempotencyKey: retryKey.current.idempotencyKey,
            humanConfirmed: true,
          }),
        },
      );
      const saved = await loadPublishedProductPage(workspaceId, skuId);
      if (!saved) throw new Error("saved product page could not be read back");
      setPage(saved);
      setHumanConfirmed(false);
    } catch (reason) {
      setError(productPageErrorMessage(reason));
      setErrorMode("save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="publishedProductPagePanel" aria-labelledby="published-product-page-heading">
      <div className="workflowPanelHead">
        <div>
          <h3 id="published-product-page-heading">公開後の商品ページ</h3>
          <p>個人メルカリで公開した後、本人が確認したリンクを1回だけ保存します。</p>
        </div>
        <span className={page ? "safeBadge" : "status"}>{page ? "保存済み" : "未登録"}</span>
      </div>

      {loading ? <p role="status">保存済みのリンクを確認しています…</p> : null}
      {error ? (
        <div className="inlineError" role="alert">
          <p>{error}</p>
          {!page && errorMode === "load" ? (
            <button
              type="button"
              className="secondaryButton"
              disabled={saving}
              onClick={() => setReloadRevision((current) => current + 1)}
            >
              もう一度読み込む
            </button>
          ) : null}
          {!page && errorMode === "save" ? (
            <button
              type="button"
              className="secondaryButton"
              disabled={saving}
              onClick={() => void save()}
            >
              同じ内容でもう一度保存する
            </button>
          ) : null}
        </div>
      ) : null}

      {!loading && page ? (
        <dl className="publishedProductPageSummary">
          <div>
            <dt>販売先</dt>
            <dd>{page.salesChannelName}</dd>
          </div>
          <div>
            <dt>商品ID</dt>
            <dd>{page.productId}</dd>
          </div>
          <div>
            <dt>本人確認日時</dt>
            <dd>{new Date(page.confirmedAt).toLocaleString("ja-JP")}</dd>
          </div>
          <div>
            <dt>商品URL</dt>
            <dd>
              <a href={page.productUrl} target="_blank" rel="noopener noreferrer">
                本人確認済みの商品ページを開く
              </a>
            </dd>
          </div>
        </dl>
      ) : null}

      {!loading && !page && errorMode !== "load" ? (
        <div className="publishedProductPageForm">
          {!listingConfirmed ? (
            <p className="candidateNotice">
              先にコピー用内容を確認し、公式画面で公開してください。
            </p>
          ) : null}
          {pilotActive ? (
            <p className="candidateNotice">試験計測中は外部の商品ページを登録できません。</p>
          ) : null}
          <label>
            販売先
            <input value="メルカリ" readOnly aria-readonly="true" />
          </label>
          <label>
            販売先の商品ID
            <input
              value={productId}
              placeholder="例）m123456789"
              autoComplete="off"
              disabled={saving}
              onChange={(event) => changeProductId(event.target.value)}
            />
          </label>
          <label>
            商品URL
            <input
              type="url"
              inputMode="url"
              value={productUrl}
              placeholder="https://jp.mercari.com/item/..."
              autoComplete="off"
              disabled={saving}
              onChange={(event) => changeProductUrl(event.target.value)}
            />
          </label>
          <label className="publishedProductPageConfirmation">
            <input
              type="checkbox"
              checked={humanConfirmed}
              disabled={saving || !listingConfirmed || pilotActive}
              onChange={(event) => setHumanConfirmed(event.target.checked)}
            />
            <span>公式画面で公開済みの商品ページを本人が確認しました</span>
          </label>
          <p>リンク先の内容は自動で読み取りません。保存後の訂正は現在準備中です。</p>
          <button
            type="button"
            disabled={saving || !listingConfirmed || pilotActive || !humanConfirmed}
            onClick={() => void save()}
          >
            {saving ? "保存して確認中…" : "このリンクを保存"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

async function loadPublishedProductPage(
  workspaceId: string,
  skuId: string,
  signal?: AbortSignal,
): Promise<PublishedProductPageResponse | null> {
  const payload = await requestProductPage(
    `/v1/workspaces/${workspaceId}/skus/${skuId}/published-product-page`,
    signal ? { signal } : undefined,
  );
  return publishedProductPageSummarySchema.parse(payload).page;
}

async function requestProductPage(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, {
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    ...init,
  });
  const payload = (await response.json().catch(() => null)) as { message?: string } | null;
  if (!response.ok) {
    throw new ProductPageRequestError(
      response.status,
      payload?.message ?? "商品ページを確認できませんでした。",
    );
  }
  return payload;
}

class ProductPageRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function productPageErrorMessage(reason: unknown): string {
  if (reason instanceof ProductPageRequestError) {
    if (reason.status === 409) {
      return "別のリンクがすでに保存されているか、現在の商品状態が変わりました。画面を再読み込みして確認してください。";
    }
    if (reason.status === 403) {
      return "この商品ページを確認する権限がありません。担当とログイン状態を確認してください。";
    }
  }
  return "商品ページを保存または再確認できませんでした。通信を確認して、同じ内容でもう一度お試しください。";
}
