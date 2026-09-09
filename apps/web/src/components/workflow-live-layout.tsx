"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { measurementDefinitionsFor } from "../lib/measurement-profile";
import { LogoutButton } from "./logout-button";
import styles from "./workflow-live-layout.module.css";

const navigation = [
  ["/", "ホーム", "⌂"],
  ["/mobile", "作業", "☷"],
  ["/workflow", "商品", "▣"],
  ["/inventory", "在庫", "◇"],
  ["/accounting", "会計", "▤"],
] as const;

export function WorkflowLiveLayout({
  children,
  captureOnly = false,
}: {
  children: ReactNode;
  captureOnly?: boolean;
}) {
  return (
    <main className={styles.layout} data-capture-only={captureOnly}>
      <aside className={styles.sidebar} aria-label="メインナビゲーション" hidden={captureOnly}>
        <a className={styles.brand} href="/" aria-label="ホーム">
          ▣ <span>作業スペース</span>
        </a>
        <nav>
          {navigation.slice(0, 2).map(([href, label, icon]) => (
            <a key={label} href={href}>
              {icon} {label}
            </a>
          ))}
          <a href="/workflow">＋ 仕入れ</a>
          <a href="/workflow" aria-current="page">
            ▣ 商品
          </a>
          <a href="/shipping">▱ 注文・発送</a>
          {navigation.slice(3).map(([href, label, icon]) => (
            <a key={label} href={href}>
              {icon} {label}
            </a>
          ))}
          <a href="/team">◎ メンバー</a>
          <span>設定（準備中）</span>
        </nav>
        <LogoutButton />
        <p>重要な操作は、内容を確認してから保存します。</p>
      </aside>
      <div className={styles.workspace}>
        <header className={styles.header}>
          <a href="/mobile">‹ 作業</a>
          <strong>商品を準備する</strong>
          <a
            href={captureOnly ? "/mobile" : "/team"}
            aria-label={captureOnly ? "担当の作業" : "メンバーと担当"}
          >
            ◎
          </a>
        </header>
        <div className={styles.content}>{children}</div>
      </div>
      <nav className={styles.footer} aria-label="共通フッター">
        {navigation.map(([href, label, icon]) =>
          captureOnly && (label === "商品" || label === "在庫" || label === "会計") ? (
            <span key={label} aria-disabled="true" title="担当の撮影・採寸だけを利用できます">
              {label}
              <small>担当範囲外</small>
            </span>
          ) : (
            <a
              key={label}
              href={captureOnly ? "/mobile" : href}
              aria-current={label === (captureOnly ? "作業" : "商品") ? "page" : undefined}
            >
              <span aria-hidden="true">{icon}</span>
              {label}
            </a>
          ),
        )}
      </nav>
    </main>
  );
}

type PhotoRole = "front" | "back" | "brand_tag" | "care_label";
const roles: { id: PhotoRole; label: string }[] = [
  { id: "front", label: "正面" },
  { id: "back", label: "背面" },
  { id: "brand_tag", label: "ブランドタグ" },
  { id: "care_label", label: "品質表示" },
];
type CaptureStep = "photos" | "photo" | "photo-review" | "prepare" | "measure" | "tags" | "summary";
const titles: Record<CaptureStep, string> = {
  photos: "撮る写真一覧",
  photo: "撮影ガイド",
  "photo-review": "写真確認",
  prepare: "採寸の準備",
  measure: "1か所ずつ採寸",
  summary: "採寸まとめ",
  tags: "タグの文字",
};
const screenIds: Record<CaptureStep, string> = {
  photos: "M20 PC17",
  photo: "M21",
  "photo-review": "M22",
  prepare: "M25 PC20",
  measure: "M26 PC20",
  tags: "M29",
  summary: "M30 PC20",
};

export function WorkflowCaptureSteps({
  photos,
  setPhoto,
  definitions,
  measurements,
  setMeasurement,
  measurementEvidence,
  setMeasurementEvidence,
  previousMeasurements = {},
  reason,
  setReason,
  completed,
  disabled,
  canSave,
  onSave,
  onNext,
  savedRoles = [],
  tagContent,
}: {
  photos: Partial<Record<PhotoRole, File>>;
  setPhoto: (role: PhotoRole, file: File | undefined) => void;
  definitions: ReturnType<typeof measurementDefinitionsFor>;
  measurements: Record<string, string>;
  setMeasurement: (id: string, value: string) => void;
  measurementEvidence: Partial<Record<string, File>>;
  setMeasurementEvidence: (definitionId: string, file: File | undefined) => void;
  previousMeasurements?: Record<string, { value: number; attempt: number }>;
  reason: string;
  setReason: (value: string) => void;
  completed: boolean;
  disabled: boolean;
  canSave: boolean;
  onSave: () => void;
  onNext: () => void;
  savedRoles?: readonly string[];
  tagContent?: ReactNode;
}) {
  const [step, setStep] = useState<CaptureStep>(completed ? "summary" : "photos");
  const [photoIndex, setPhotoIndex] = useState(0);
  const [measurementIndex, setMeasurementIndex] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [evidencePreview, setEvidencePreview] = useState<string | null>(null);
  const role = roles[photoIndex]!;
  const file = photos[role.id];
  const definition = definitions[measurementIndex];
  const evidenceFile = definition ? measurementEvidence[definition.definitionId] : undefined;
  const allPhotos = roles.every(({ id }) => photos[id] || savedRoles.includes(id));
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    if (!evidenceFile) {
      setEvidencePreview(null);
      return;
    }
    const url = URL.createObjectURL(evidenceFile);
    setEvidencePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [evidenceFile]);
  function back() {
    if (step === "photo-review") setStep("photo");
    else if (step === "photo" || step === "prepare") setStep("photos");
    else if (step === "measure") {
      if (measurementIndex > 0) setMeasurementIndex(measurementIndex - 1);
      else setStep("prepare");
    } else if (step === "summary") setStep(completed ? "photos" : tagContent ? "tags" : "measure");
    else if (step === "tags") setStep("measure");
  }
  return (
    <section
      className={`workflowPanel panel ${styles.capture}`}
      data-workflow-screen={step}
      data-approved-purpose={screenIds[step]}
      aria-labelledby="capture-heading"
    >
      <div className={styles.stepHeading}>
        <div>
          <p>写真・採寸</p>
          <h2 id="capture-heading">{titles[step]}</h2>
        </div>
        <span>{completed ? "保存済み" : "確認待ち"}</span>
      </div>
      {step === "photos" && (
        <>
          <p className={styles.offlineNotice} role="note">
            写真はこの画面を開いている間だけ端末内に保持します。通信がない時や画面を読み直した後は、写真を選び直してください。
          </p>
          <p data-implementation-state="WAITING_HUMAN">
            現在の保存対象は4種類です。商品ごとの細部撮影・気になる箇所は、項目の確認待ちです。
          </p>
          <div className={styles.cards}>
            {roles.map(({ id, label }, index) => (
              <button
                type="button"
                key={id}
                disabled={disabled || completed}
                onClick={() => {
                  setPhotoIndex(index);
                  setStep("photo");
                }}
              >
                <span>▧ {label}</span>
                <strong>
                  {completed || savedRoles.includes(id)
                    ? "保存済み"
                    : photos[id]
                      ? "選択済み"
                      : "写真を選ぶ　›"}
                </strong>
              </button>
            ))}
          </div>
          <p role="status">
            {completed
              ? "写真4種類を保存済みです。"
              : `残り ${roles.filter(({ id }) => !photos[id] && !savedRoles.includes(id)).length} 枚・選択中の写真はまだ保存されていません。`}
          </p>
          <button
            type="button"
            disabled={disabled || (!allPhotos && !completed)}
            onClick={() => setStep(completed ? "summary" : "prepare")}
          >
            採寸へ進む
          </button>
        </>
      )}
      {(step === "photo" || step === "photo-review") && (
        <>
          <h3>
            {role.label} <small>{photoIndex + 1} / 4</small>
          </h3>
          <p>
            {step === "photo"
              ? "全体が切れないように、明るい場所で撮ってください。"
              : "ぶれ・明るさ・切れを確認してください。"}
          </p>
          <div className={styles.photoPreview}>
            {preview ? (
              <img src={preview} alt={`${role.label}の選択中の写真`} />
            ) : (
              <span>
                ▧<br />
                {role.label}の写真
              </span>
            )}
          </div>
          {step === "photo" ? (
            <>
              <p className={styles.offlineNotice} role="note">
                選んだ写真はこの画面を開いている間だけ使えます。画面を読み直した場合は、もう一度選んでください。
              </p>
              <label className={styles.fileLabel}>
                撮影・ファイルから選ぶ
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  capture="environment"
                  disabled={disabled}
                  onChange={(event) => setPhoto(role.id, event.target.files?.[0])}
                />
              </label>
              <button
                type="button"
                disabled={disabled || !file}
                onClick={() => setStep("photo-review")}
              >
                写真を確認する
              </button>
            </>
          ) : (
            <>
              <p>この段階では端末内で選択中です。最後に写真と採寸をまとめて保存します。</p>
              <button type="button" disabled={disabled || !file} onClick={() => setStep("photos")}>
                この写真を使う
              </button>
              <button type="button" disabled={disabled} onClick={() => setStep("photo")}>
                撮り直す
              </button>
            </>
          )}
        </>
      )}
      {step === "prepare" && (
        <>
          <p>平らな場所に置き、引っ張らずに測ります。単位はすべてcmです。</p>
          <ul>
            {definitions.map((entry) => (
              <li key={entry.definitionId}>{entry.label}</li>
            ))}
          </ul>
          <p>
            各項目で、メジャーと測る位置が見える専用写真を1枚ずつ選びます。掲載用の正面写真は流用しません。
          </p>
          <button
            type="button"
            disabled={disabled || definitions.length === 0}
            onClick={() => {
              setMeasurementIndex(0);
              setStep("measure");
            }}
          >
            採寸を始める
          </button>
        </>
      )}
      {step === "measure" && definition && (
        <>
          <p>
            {measurementIndex + 1} / {definitions.length} 項目
          </p>
          <h3>{definition.label}</h3>
          <p>
            測り方:{" "}
            {
              {
                flat_width: "平置きの幅（一周の長さではありません）",
                circumference: "一周の長さ",
                length: "端から端の長さ",
              }[definition.basis]
            }
            ／
            {
              {
                natural: "自然に置いた状態",
                closed: "ボタンやファスナーを閉じた状態",
                unstretched: "生地を伸ばさない状態",
              }[definition.state]
            }
          </p>
          <p className={styles.measureGuide}>
            {definition.basis === "flat_width"
              ? "平らに置いた幅を、左右まっすぐに測ります。"
              : definition.basis === "circumference"
                ? "一周の長さを、ねじれないように測ります。"
                : "定義された端から端までを、まっすぐに測ります。"}
            {definition.state === "closed"
              ? " ボタンやファスナーは閉じます。"
              : definition.state === "unstretched"
                ? " 生地は伸ばしません。"
                : " 自然に置いた状態で測ります。"}
          </p>
          <label className={styles.measureInput}>
            {definition.label}（cm）
            <input
              type="number"
              inputMode="decimal"
              min="0.1"
              max="250"
              step="0.1"
              disabled={disabled || completed}
              value={measurements[definition.definitionId] ?? ""}
              onChange={(event) => setMeasurement(definition.definitionId, event.target.value)}
            />
          </label>
          {previousMeasurements[definition.definitionId] ? (
            <p className={styles.measureComparison}>
              前回: {previousMeasurements[definition.definitionId]?.value}cm（
              {previousMeasurements[definition.definitionId]?.attempt}回目）／今回:{" "}
              {measurements[definition.definitionId] || "未入力"}cm
            </p>
          ) : (
            <p className={styles.measureComparison}>前回の記録はありません。今回が1回目です。</p>
          )}
          <div className={styles.measureEvidence}>
            <strong>この採寸の写真</strong>
            <p>メジャーの数値と測る位置が見えるように撮ってください。掲載写真には含めません。</p>
            <div className={styles.evidencePreview}>
              {evidencePreview ? (
                <img src={evidencePreview} alt={`${definition.label}の採寸根拠写真`} />
              ) : (
                <span>
                  ▧<br />
                  採寸の根拠写真
                </span>
              )}
            </div>
            <label className={styles.fileLabel}>
              <span className={styles.offlineNotice}>
                選んだ写真はこの画面を開いている間だけ使えます。画面を読み直した場合は、もう一度選んでください。
              </span>
              採寸写真を撮る・選ぶ
              <input
                type="file"
                accept="image/jpeg,image/png"
                capture="environment"
                disabled={disabled || completed}
                onChange={(event) =>
                  setMeasurementEvidence(definition.definitionId, event.target.files?.[0])
                }
              />
            </label>
          </div>
          <label>
            測り直しの理由（前回との差が2cmを超える場合）
            <select
              value={reason}
              disabled={disabled || completed}
              onChange={(event) => setReason(event.target.value)}
            >
              <option value="">初回・理由なし</option>
              <option value="previous_entry_error">前回の入力誤りを修正</option>
              <option value="garment_stretch">伸縮素材を同じ方法で再確認</option>
              <option value="measurement_definition_corrected">測る位置を定義どおりに修正</option>
            </select>
          </label>
          <p>入力中です。最後のまとめ画面で保存します。</p>
          <button
            type="button"
            disabled={
              disabled ||
              !(
                Number(measurements[definition.definitionId]) > 0 &&
                Number(measurements[definition.definitionId]) <= 250 &&
                (completed || Boolean(evidenceFile))
              )
            }
            onClick={() => {
              if (measurementIndex + 1 < definitions.length)
                setMeasurementIndex(measurementIndex + 1);
              else setStep(tagContent ? "tags" : "summary");
            }}
          >
            入力して次へ
          </button>
        </>
      )}
      {step === "tags" && (
        <>
          {tagContent}
          <button type="button" disabled={disabled} onClick={() => setStep("summary")}>
            採寸まとめへ
          </button>
        </>
      )}
      {step === "summary" && (
        <>
          <dl className={styles.summary}>
            {definitions.map((entry) => (
              <div key={entry.definitionId}>
                <dt>{entry.label}</dt>
                <dd>{measurements[entry.definitionId] || "未入力"} cm</dd>
              </div>
            ))}
          </dl>
          <p>写真4種類と実測値を人が確認します。原本写真は上書きせず、非公開で保存します。</p>
          <button
            className="mobileCaptureSave"
            type="button"
            disabled={disabled || completed || !canSave}
            onClick={onSave}
          >
            {completed ? "保存済み" : "写真と採寸を確認して保存"}
          </button>
          {completed && (
            <button type="button" disabled={disabled} onClick={onNext}>
              商品をまとめる
            </button>
          )}
        </>
      )}
      {step !== "photos" && (
        <button className={styles.back} type="button" disabled={disabled} onClick={back}>
          ‹ 戻る
        </button>
      )}
    </section>
  );
}
