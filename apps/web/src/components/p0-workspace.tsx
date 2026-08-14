"use client";

import { useMemo, useState } from "react";

type Stage = "purchase" | "capture" | "listing" | "order" | "accounting";
type MeasurementKey = "肩幅" | "身幅" | "袖丈" | "着丈";

const stages: ReadonlyArray<{ id: Stage; label: string }> = [
  { id: "purchase", label: "仕入" },
  { id: "capture", label: "撮影・採寸" },
  { id: "listing", label: "出品準備" },
  { id: "order", label: "注文・発送" },
  { id: "accounting", label: "収支・会計" },
];

const photoRoles = ["正面", "背面", "ブランドタグ", "品質表示"] as const;
const emptyMeasurements: Record<MeasurementKey, string> = {
  肩幅: "",
  身幅: "",
  袖丈: "",
  着丈: "",
};

export function P0Workspace() {
  const [stage, setStage] = useState<Stage>("purchase");
  const [receiptConfirmed, setReceiptConfirmed] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [measurements, setMeasurements] =
    useState<Record<MeasurementKey, string>>(emptyMeasurements);
  const [measurementConfirmed, setMeasurementConfirmed] = useState(false);
  const [listingConfirmed, setListingConfirmed] = useState(false);
  const [orderState, setOrderState] = useState<"confirmed" | "picked" | "packed" | "shipped">(
    "confirmed",
  );
  const [journalApproved, setJournalApproved] = useState(false);

  const measurementComplete = Object.values(measurements).every(
    (value) => Number(value) > 0 && Number(value) <= 250,
  );
  const captureComplete = photos.length === photoRoles.length && measurementConfirmed;
  const description = useMemo(
    () =>
      `ネイビーの長袖シャツです。平置き実寸は肩幅${measurements.肩幅 || "—"}cm、身幅${measurements.身幅 || "—"}cm、袖丈${measurements.袖丈 || "—"}cm、着丈${measurements.着丈 || "—"}cmです。写真と実寸をご確認のうえ、購入をご検討ください。`,
    [measurements],
  );

  const completed: Record<Stage, boolean> = {
    purchase: receiptConfirmed,
    capture: captureComplete,
    listing: listingConfirmed,
    order: orderState === "shipped",
    accounting: journalApproved,
  };

  return (
    <div className="workflowBoard">
      <nav className="workflowStages" aria-label="試験商品の工程">
        {stages.map((item, index) => (
          <button
            className={stage === item.id ? "active" : completed[item.id] ? "done" : ""}
            disabled={!stages.slice(0, index).every((previous) => completed[previous.id])}
            key={item.id}
            type="button"
            onClick={() => setStage(item.id)}
          >
            <span>{completed[item.id] ? "✓" : index + 1}</span>
            {item.label}
          </button>
        ))}
      </nav>

      <section className="workflowItemSummary panel">
        <div>
          <span>SKU</span>
          <strong>SKU-2608-0001</strong>
        </div>
        <div>
          <span>在庫番号</span>
          <strong>INV-000001</strong>
        </div>
        <div>
          <span>商品</span>
          <strong>ネイビーシャツ</strong>
        </div>
        <div>
          <span>現在地</span>
          <strong>箱014</strong>
        </div>
      </section>

      {stage === "purchase" ? (
        <section className="workflowPanel panel" aria-labelledby="purchase-heading">
          <div className="workflowPanelHead">
            <div>
              <p className="eyebrow">PURCHASE</p>
              <h2 id="purchase-heading">仕入証憑と原価事実</h2>
            </div>
            <span className={receiptConfirmed ? "safeBadge" : "status"}>
              {receiptConfirmed ? "人が確認済み" : "確認待ち"}
            </span>
          </div>
          <div className="workflowSplit">
            <div className="receiptPreview">
              <span>架空の試験証憑</span>
              <strong>REC-2026-0001</strong>
              <p>個人情報・実取引データは使用していません。</p>
            </div>
            <dl className="factList">
              <div>
                <dt>仕入先</dt>
                <dd>テスト仕入先A</dd>
              </div>
              <div>
                <dt>購入日</dt>
                <dd>2026-08-15</dd>
              </div>
              <div>
                <dt>商品代</dt>
                <dd>1,500円</dd>
              </div>
              <div>
                <dt>配賦状態</dt>
                <dd>SKU 1点へ100%</dd>
              </div>
            </dl>
          </div>
          <div className="humanGate">
            <div>
              <strong>OCRは使わず、架空データを手入力した状態です</strong>
              <p>金額と証憑の一致は人が確認します。AIが原価を確定しません。</p>
            </div>
            <button type="button" onClick={() => setReceiptConfirmed(true)}>
              証憑と金額を確認
            </button>
          </div>
          <WorkflowNext
            enabled={receiptConfirmed}
            label="撮影・採寸へ"
            onClick={() => setStage("capture")}
          />
        </section>
      ) : null}

      {stage === "capture" ? (
        <section className="workflowPanel panel" aria-labelledby="capture-heading">
          <div className="workflowPanelHead">
            <div>
              <p className="eyebrow">CAPTURE</p>
              <h2 id="capture-heading">写真チェックと平置き採寸</h2>
            </div>
            <span className={captureComplete ? "safeBadge" : "status"}>
              {captureComplete ? "完了" : `${photos.length}/4 写真`}
            </span>
          </div>
          <div className="photoChecklist">
            {photoRoles.map((role) => (
              <label className={photos.includes(role) ? "checked" : ""} key={role}>
                <input
                  type="checkbox"
                  checked={photos.includes(role)}
                  onChange={(event) =>
                    setPhotos((current) =>
                      event.target.checked
                        ? [...current, role]
                        : current.filter((item) => item !== role),
                    )
                  }
                />
                <span aria-hidden="true">{photos.includes(role) ? "✓" : "＋"}</span>
                <strong>{role}</strong>
                <small>原本を上書きしない</small>
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
                    onChange={(event) => {
                      setMeasurements((current) => ({ ...current, [key]: event.target.value }));
                      setMeasurementConfirmed(false);
                    }}
                  />
                  cm
                </span>
              </label>
            ))}
          </div>
          <div className="humanGate">
            <div>
              <strong>平置き・自然な状態で、人が実測</strong>
              <p>0以下または250cm超は完了できません。測定値をAIが確定しません。</p>
            </div>
            <button
              type="button"
              disabled={!measurementComplete || photos.length !== photoRoles.length}
              onClick={() => setMeasurementConfirmed(true)}
            >
              写真と採寸を確認
            </button>
          </div>
          <WorkflowNext
            enabled={captureComplete}
            label="出品準備へ"
            onClick={() => setStage("listing")}
          />
        </section>
      ) : null}

      {stage === "listing" ? (
        <section className="workflowPanel panel" aria-labelledby="listing-heading">
          <div className="workflowPanelHead">
            <div>
              <p className="eyebrow">LISTING HANDOFF</p>
              <h2 id="listing-heading">無料テンプレートの文章候補</h2>
            </div>
            <span className={listingConfirmed ? "safeBadge" : "status"}>
              {listingConfirmed ? "人が確認済み" : "候補"}
            </span>
          </div>
          <div className="candidateNotice">
            <strong>AIではなく、確認済み項目を差し込む決定的テンプレートです</strong>
            <p>外部API送信0件・費用0円。ブランド、素材、状態は未確認のため記載しません。</p>
          </div>
          <textarea aria-label="商品説明候補" readOnly rows={7} value={description} />
          <div className="listingChecks">
            <span className={photos.length === 4 ? "pass" : ""}>写真4種</span>
            <span className={measurementConfirmed ? "pass" : ""}>採寸を人が確認</span>
            <span className="pass">自動出品なし</span>
          </div>
          <div className="humanGate">
            <div>
              <strong>公式画面への貼り付けは本人が行います</strong>
              <p>このアプリは公開ボタンを押さず、Cookieやパスワードも保存しません。</p>
            </div>
            <button
              type="button"
              disabled={!captureComplete}
              onClick={() => setListingConfirmed(true)}
            >
              コピー用内容を確認
            </button>
          </div>
          <WorkflowNext
            enabled={listingConfirmed}
            label="注文・発送へ"
            onClick={() => setStage("order")}
          />
        </section>
      ) : null}

      {stage === "order" ? (
        <section className="workflowPanel panel" aria-labelledby="order-heading">
          <div className="workflowPanelHead">
            <div>
              <p className="eyebrow">ORDER & SHIPPING</p>
              <h2 id="order-heading">手入力注文と発送証拠</h2>
            </div>
            <span className={orderState === "shipped" ? "safeBadge" : "status"}>
              {orderState === "confirmed"
                ? "注文確認"
                : orderState === "picked"
                  ? "ピッキング済み"
                  : orderState === "packed"
                    ? "梱包済み"
                    : "発送済み"}
            </span>
          </div>
          <div className="orderTimeline">
            {(
              [
                ["confirmed", "注文 ORD-000001", "手入力・現物を1点だけ引当"],
                ["picked", "商品＋場所を確認", "INV-000001 / BX-014-3"],
                ["packed", "梱包証拠", "架空の試験記録・住所は表示しない"],
                ["shipped", "発送記録", "追跡番号は試験値を保存しない"],
              ] as const
            ).map(([stateValue, label, note]) => {
              const order = ["confirmed", "picked", "packed", "shipped"] as const;
              const done = order.indexOf(orderState) >= order.indexOf(stateValue);
              return (
                <div className={done ? "done" : ""} key={stateValue}>
                  <span>{done ? "✓" : ""}</span>
                  <div>
                    <strong>{label}</strong>
                    <small>{note}</small>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="humanGate">
            <div>
              <strong>次の状態へは順番に進みます</strong>
              <p>二重引当や読取なしの梱包・発送はAPI/DBでも拒否する設計です。</p>
            </div>
            <button
              type="button"
              disabled={orderState === "shipped"}
              onClick={() =>
                setOrderState((current) =>
                  current === "confirmed" ? "picked" : current === "picked" ? "packed" : "shipped",
                )
              }
            >
              {orderState === "confirmed"
                ? "二重確認を記録"
                : orderState === "picked"
                  ? "梱包証拠を確認"
                  : "発送を人が確定"}
            </button>
          </div>
          <WorkflowNext
            enabled={orderState === "shipped"}
            label="収支・会計へ"
            onClick={() => setStage("accounting")}
          />
        </section>
      ) : null}

      {stage === "accounting" ? (
        <section className="workflowPanel panel" aria-labelledby="accounting-heading">
          <div className="workflowPanelHead">
            <div>
              <p className="eyebrow">ACCOUNTING CANDIDATE</p>
              <h2 id="accounting-heading">運用収支と仕訳候補</h2>
            </div>
            <span className={journalApproved ? "safeBadge" : "status"}>
              {journalApproved ? "人が承認済み" : "候補・未確定"}
            </span>
          </div>
          <div className="profitWaterfall">
            <div>
              <span>販売額</span>
              <strong>5,000円</strong>
            </div>
            <div>
              <span>商品原価</span>
              <strong>−1,500円</strong>
            </div>
            <div>
              <span>販売手数料</span>
              <strong>−500円</strong>
            </div>
            <div>
              <span>出品者送料</span>
              <strong>−750円</strong>
            </div>
            <div className="total">
              <span>取引貢献利益</span>
              <strong>2,250円</strong>
            </div>
          </div>
          <p className="accountingDisclaimer">
            運用分析の参考値です。会計上の売上・利益・所得・税額を示すものではありません。
          </p>
          <div className="journalCandidate">
            <span>仕訳候補 JOURNAL-0001</span>
            <strong>売掛金 5,000円 / 売上高 5,000円</strong>
            <small>根拠: 手入力注文 ORD-000001・ルール版 v1</small>
          </div>
          <div className="humanGate">
            <div>
              <strong>帳簿へ直接登録しません</strong>
              <p>人または税理士が根拠を確認してからCSV候補を出力します。</p>
            </div>
            <button type="button" onClick={() => setJournalApproved(true)}>
              根拠を確認して承認
            </button>
          </div>
          <button
            className="exportButton"
            type="button"
            disabled={!journalApproved}
            onClick={downloadTestAccountingCsv}
          >
            会計CSV候補を作成（ローカル）
          </button>
        </section>
      ) : null}
    </div>
  );
}

function downloadTestAccountingCsv() {
  const header = ["日付", "借方勘定科目", "借方金額", "貸方勘定科目", "貸方金額", "摘要", "参照ID"];
  const row = [
    "2026-08-15",
    "売掛金",
    "5000",
    "売上高",
    "5000",
    "試験商品の売上候補",
    "ORD-000001",
  ];
  const csvCell = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const csv = `\uFEFF${header.map(csvCell).join(",")}\r\n${row.map(csvCell).join(",")}\r\n`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "test-journal-candidate.csv";
  link.click();
  URL.revokeObjectURL(url);
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
