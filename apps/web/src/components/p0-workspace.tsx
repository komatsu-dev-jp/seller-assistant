"use client";

import type {
  AccountingExportResponse,
  FinancialSummaryResponse,
  OrderOperationResponse,
  P0ItemResponse,
} from "@resale/contracts";
import { useCallback, useEffect, useState } from "react";

type Stage = "purchase" | "capture" | "listing" | "order" | "accounting";
type MeasurementKey = "肩幅" | "身幅" | "袖丈" | "着丈";
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
const measurementDefinitions: Record<MeasurementKey, string> = {
  肩幅: "shoulder_width",
  身幅: "chest_width",
  袖丈: "sleeve_length",
  着丈: "body_length",
};
const emptyMeasurements: Record<MeasurementKey, string> = {
  肩幅: "",
  身幅: "",
  袖丈: "",
  着丈: "",
};

export function P0Workspace({ workspaceId }: { workspaceId: string }) {
  const [stage, setStage] = useState<Stage>("purchase");
  const [items, setItems] = useState<P0ItemResponse[]>([]);
  const [selectedSkuId, setSelectedSkuId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [photos, setPhotos] = useState<Partial<Record<PhotoRole, File>>>({});
  const [measurements, setMeasurements] =
    useState<Record<MeasurementKey, string>>(emptyMeasurements);
  const [financial, setFinancial] = useState<FinancialSummaryResponse | null>(null);
  const [accountingExport, setAccountingExport] = useState<AccountingExportResponse | null>(null);
  const [addressLeaseId, setAddressLeaseId] = useState<string | null>(null);
  const [shippingAddressView, setShippingAddressView] = useState<string | null>(null);
  const [assignmentMessage, setAssignmentMessage] = useState("");

  const item = items.find((candidate) => candidate.skuId === selectedSkuId) ?? items[0] ?? null;
  const refreshItems = useCallback(async () => {
    const result = await requestJson<P0ItemResponse[]>(`/v1/workspaces/${workspaceId}/p0-items`);
    setItems(result);
    setSelectedSkuId((current) =>
      current && result.some((candidate) => candidate.skuId === current)
        ? current
        : (result[0]?.skuId ?? null),
    );
  }, [workspaceId]);

  useEffect(() => {
    refreshItems()
      .catch((reason: unknown) => setError(errorMessage(reason)))
      .finally(() => setLoading(false));
  }, [refreshItems]);

  useEffect(() => {
    if (loading || !item) return;
    setStage((current) => (current === "purchase" ? nextStageForItem(item) : current));
  }, [item, loading]);

  useEffect(() => {
    if (!item) return;
    const restored = { ...emptyMeasurements };
    for (const measurement of item.capture.measurements) {
      const entry = Object.entries(measurementDefinitions).find(
        ([, definitionId]) => definitionId === measurement.definitionId,
      );
      if (entry) restored[entry[0] as MeasurementKey] = String(measurement.value);
    }
    setMeasurements(restored);
    setAccountingExport(item.accountingExport);
  }, [item]);

  const workflowRank = workflowStateRank(item?.workflowState);
  const completed: Record<Stage, boolean> = {
    purchase: Boolean(item),
    capture: workflowRank >= workflowStateRank("capture_confirmed"),
    listing: workflowRank >= workflowStateRank("listing_confirmed"),
    order: item?.orderState === "shipped" || item?.orderState === "returned",
    accounting: workflowRank >= workflowStateRank("journal_approved"),
  };
  const measurementComplete = Object.values(measurements).every(
    (value) => Number(value) > 0 && Number(value) <= 250,
  );
  const description = item?.listingCandidate.text ?? "商品情報を読み込んでいます。";

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function createPurchase(form: FormData) {
    await run(async () => {
      const created = await requestJson<P0ItemResponse>(`/v1/workspaces/${workspaceId}/p0-items`, {
        method: "POST",
        body: JSON.stringify({
          skuCode: textField(form, "skuCode").toUpperCase(),
          title: textField(form, "title"),
          category: textField(form, "category"),
          supplierName: textField(form, "supplierName"),
          receiptReference: textField(form, "receiptReference"),
          purchasedAt: new Date(textField(form, "purchasedAt")).toISOString(),
          receiptAmountMinor: numberField(form, "receiptAmountMinor"),
          allocatedCostMinor: numberField(form, "allocatedCostMinor"),
          idempotencyKey: crypto.randomUUID(),
          humanConfirmed: true,
        }),
      });
      await refreshItems();
      setSelectedSkuId(created.skuId);
      setStage("capture");
    });
  }

  async function confirmCapture() {
    if (!item || !measurementComplete || photoRoles.some(({ id }) => !photos[id])) return;
    await run(async () => {
      const assetIds: string[] = [];
      for (const { id: role } of photoRoles) {
        const file = photos[role];
        if (!file) throw new Error("写真4種を選択してください。");
        const assetId = crypto.randomUUID();
        await requestJson(
          `/v1/workspaces/${workspaceId}/skus/${item.skuId}/media-uploads?assetId=${assetId}&role=${role}`,
          { method: "POST", body: file, headers: { "content-type": file.type } },
        );
        assetIds.push(assetId);
      }
      const measuredAt = new Date().toISOString();
      for (const key of Object.keys(measurements) as MeasurementKey[]) {
        await requestJson(`/v1/workspaces/${workspaceId}/skus/${item.skuId}/measurements`, {
          method: "POST",
          body: JSON.stringify({
            definitionId: measurementDefinitions[key],
            definitionVersion: 1,
            value: Number(measurements[key]),
            unit: "cm",
            basis: "flat_width",
            state: "natural",
            measuredAt,
            evidenceAssetId: assetIds[0],
            attempt: 1,
            humanConfirmed: true,
          }),
        });
      }
      await advanceWorkflow(item.skuId, "confirm_capture", assetIds, false);
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
      await advanceWorkflow(
        item.skuId,
        "confirm_listing",
        item.listingCandidate.referenceIds,
        true,
      );
      await navigator.clipboard?.writeText(description).catch(() => undefined);
      await refreshItems();
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

  async function loadFinancial() {
    if (!item?.orderId) return;
    await run(async () => {
      setFinancial(
        await requestJson<FinancialSummaryResponse>(
          `/v1/workspaces/${workspaceId}/orders/${item.orderId}/financial-summary`,
        ),
      );
    });
  }

  async function createAccountingExport() {
    if (!item?.orderId) return;
    await run(async () => {
      const result = await requestJson<AccountingExportResponse>(
        `/v1/workspaces/${workspaceId}/orders/${item.orderId}/accounting-exports`,
        {
          method: "POST",
          body: JSON.stringify({
            approvedAt: new Date().toISOString(),
            idempotencyKey: crypto.randomUUID(),
            humanApproved: true,
          }),
        },
      );
      setAccountingExport(result);
      await refreshItems();
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
            <strong>{item?.inventoryStatus}</strong>
          </div>
          <div>
            <span>現在地</span>
            <strong>{item?.locationCode ?? "未格納"}</strong>
          </div>
        </section>
      ) : null}

      {stage === "purchase" ? (
        <PurchasePanel busy={busy} onSubmit={createPurchase} item={item} />
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
            {(Object.keys(measurements) as MeasurementKey[]).map((key) => (
              <label key={key}>
                {key}
                <span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0.1"
                    max="250"
                    step="0.1"
                    value={measurements[key]}
                    onChange={(event) =>
                      setMeasurements((current) => ({ ...current, [key]: event.target.value }))
                    }
                  />
                  cm
                </span>
              </label>
            ))}
          </div>
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
          <div className="humanGate">
            <div>
              <strong>コピー用内容を人が確認</strong>
              <p>未確認事実は自動補完しません。</p>
            </div>
            <button
              type="button"
              disabled={
                busy ||
                completed.listing ||
                item.listingCandidate.unconfirmedFields.length > 0 ||
                item.listingCandidate.referenceIds.length === 0
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
        <AccountingPanel
          item={item}
          busy={busy}
          financial={financial}
          accountingExport={accountingExport}
          onLoad={loadFinancial}
          onExport={createAccountingExport}
        />
      ) : null}
    </div>
  );
}

function PurchasePanel({
  busy,
  onSubmit,
  item,
}: {
  busy: boolean;
  onSubmit: (form: FormData) => Promise<void>;
  item: P0ItemResponse | null;
}) {
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
        <div className="measurementGrid">
          <label>
            SKUコード
            <input name="skuCode" required defaultValue="SKU-2608-0001" />
          </label>
          <label>
            商品名
            <input name="title" required defaultValue="ネイビーシャツ" />
          </label>
          <label>
            カテゴリ
            <input name="category" required defaultValue="トップス" />
          </label>
          <label>
            仕入先
            <input name="supplierName" required defaultValue="仕入先A" />
          </label>
          <label>
            証憑参照番号
            <input name="receiptReference" required defaultValue={`REC-${Date.now()}`} />
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
            <input name="receiptAmountMinor" type="number" min="0" required defaultValue="1500" />
          </label>
          <label>
            このSKUの原価（円）
            <input name="allocatedCostMinor" type="number" min="0" required defaultValue="1500" />
          </label>
        </div>
        <div className="humanGate">
          <div>
            <strong>証憑参照と金額を人が照合</strong>
            <p>AIは原価・税区分を確定しません。住所などの個人情報は入力しないでください。</p>
          </div>
          <button type="submit" disabled={busy}>
            仕入を確認して在庫番号を発行
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
              <input name="orderNumber" required defaultValue={`ORD-${Date.now()}`} />
            </label>
            <label>
              販売額
              <input name="saleAmountMinor" type="number" min="1" required defaultValue="5000" />
            </label>
            <label>
              販売手数料
              <input name="sellingFeeMinor" type="number" min="0" required defaultValue="500" />
            </label>
            <label>
              送料
              <input name="shippingCostMinor" type="number" min="0" required defaultValue="750" />
            </label>
            <label>
              梱包費
              <input name="packagingCostMinor" type="number" min="0" required defaultValue="100" />
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

function AccountingPanel({
  item,
  busy,
  financial,
  accountingExport,
  onLoad,
  onExport,
}: {
  item: P0ItemResponse;
  busy: boolean;
  financial: FinancialSummaryResponse | null;
  accountingExport: AccountingExportResponse | null;
  onLoad: () => Promise<void>;
  onExport: () => Promise<void>;
}) {
  return (
    <section className="workflowPanel panel" aria-labelledby="accounting-heading">
      <div className="workflowPanelHead">
        <div>
          <p className="eyebrow">ACCOUNTING CANDIDATE</p>
          <h2 id="accounting-heading">実取引の運用収支と仕訳候補</h2>
        </div>
        <span className={accountingExport ? "safeBadge" : "status"}>
          {accountingExport ? "人が承認済み" : "候補・未確定"}
        </span>
      </div>
      {financial ? (
        <div className="profitWaterfall">
          <div>
            <span>販売額</span>
            <strong>{yen(financial.saleAmountMinor)}</strong>
          </div>
          <div>
            <span>商品原価</span>
            <strong>−{yen(financial.costAmountMinor)}</strong>
          </div>
          <div>
            <span>販売手数料</span>
            <strong>−{yen(financial.sellingFeeMinor)}</strong>
          </div>
          <div>
            <span>送料</span>
            <strong>−{yen(financial.shippingCostMinor)}</strong>
          </div>
          <div>
            <span>梱包費</span>
            <strong>−{yen(financial.packagingCostMinor)}</strong>
          </div>
          <div className="total">
            <span>取引貢献利益</span>
            <strong>
              {financial.contributionProfitMinor === null
                ? "—"
                : yen(financial.contributionProfitMinor)}
            </strong>
          </div>
        </div>
      ) : (
        <button type="button" disabled={busy || !item.orderId} onClick={() => void onLoad()}>
          DBから収支を読み込む
        </button>
      )}
      <p className="accountingDisclaimer">
        運用分析の参考値です。会計上の売上・利益・所得・税額を示すものではありません。
      </p>
      <div className="humanGate">
        <div>
          <strong>帳簿へ直接登録しません</strong>
          <p>人または税理士が根拠を確認した仕訳候補だけをCSVにします。</p>
        </div>
        <button
          type="button"
          disabled={busy || !financial || Boolean(accountingExport)}
          onClick={() => void onExport()}
        >
          {accountingExport ? "CSV履歴を保存済み" : "根拠を確認してCSV作成"}
        </button>
      </div>
      {accountingExport ? (
        <a
          className="exportButton"
          href={accountingExport.contentUrl}
          download={accountingExport.filename}
        >
          検証済みCSV候補をダウンロード
        </a>
      ) : null}
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
    throw new Error(
      (payload as { message?: string } | null)?.message ?? "操作を確認できませんでした。",
    );
  return payload as T;
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
function yen(value: number): string {
  return `${new Intl.NumberFormat("ja-JP").format(value)}円`;
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
