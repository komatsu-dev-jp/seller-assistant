"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  confirmReviewPhoto,
  inspectionLabels,
  measurementLabels,
  photoSlots,
  readReviewPhotos,
  readReviewState,
  resetReviewDataAndReload,
  resumeReviewScreen,
  saveReviewPhoto,
  validatePhoto,
  validMeasurement,
  writeReviewState,
  type ReviewPhotos,
  type ReviewState,
} from "./local-review-store";
import styles from "./approved-mobile-demo.module.css";
import local from "./local-review-flow.module.css";
import { reviewPath } from "./review-path";

const basePath = process.env.NEXT_PUBLIC_REVIEW_BASE_PATH ?? "";
export function isLocalReviewScreen(id: string): boolean {
  return (
    id === "04" || id === "05" || (/^\d{2}$/u.test(id) && Number(id) >= 14 && Number(id) <= 28)
  );
}
function route(id: string): string {
  return reviewPath(`/mobile/screens/${id}/`, basePath);
}
function Photo({
  blob,
  alt,
  className,
  sample,
}: {
  blob?: Blob | undefined;
  alt: string;
  className?: string | undefined;
  sample?: string;
}) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) {
      setUrl(undefined);
      return;
    }
    const value = URL.createObjectURL(blob);
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [blob]);
  const src = url ?? (sample ? reviewPath(sample, basePath) : undefined);
  return src ? (
    <img src={src} alt={alt} className={className} />
  ) : (
    <p className={local.empty}>写真を選んでください</p>
  );
}
function Field({
  label,
  value,
  onChange,
  number = false,
  maxLength = 120,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  number?: boolean;
  maxLength?: number;
}) {
  return (
    <label className={styles.formField}>
      <span>{label}</span>
      <input
        value={value}
        maxLength={maxLength}
        inputMode={number ? "decimal" : "text"}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
async function checkImage(blob: Blob): Promise<void> {
  validatePhoto(blob);
  const url = URL.createObjectURL(blob);
  try {
    await new Promise<void>((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        if (
          image.naturalWidth > 10000 ||
          image.naturalHeight > 10000 ||
          image.naturalWidth * image.naturalHeight > 40000000
        ) {
          reject(new Error("写真が大きすぎます。4,000万画素以下の写真を選んでください。"));
        } else {
          resolve();
        }
      };
      image.onerror = () =>
        reject(new Error("写真を表示できません。JPEG・PNG・WebPの写真を選び直してください。"));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function LocalReviewFlow({ screenId }: { screenId: string }) {
  const [state, setState] = useState<ReviewState | null>(null);
  const [photos, setPhotos] = useState<ReviewPhotos>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [inspectionIndex, setInspectionIndex] = useState(0);
  const [measureIndex, setMeasureIndex] = useState(0);
  const savedRaw = useRef<string | null>(null);
  const mounted = useRef(true);
  const busyRef = useRef(false);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    async function load() {
      try {
        const data = readReviewState(window.localStorage);
        const storedPhotos = await readReviewPhotos(window.indexedDB);
        if (cancelled) return;
        savedRaw.current = data.raw;
        setState(data.state);
        setPhotos(storedPhotos);
        setInspectionIndex(Math.max(0, data.state.inspection.indexOf("unchecked")));
        setMeasureIndex(
          Math.max(
            0,
            data.state.measurements.findIndex((value) => !validMeasurement(value)),
          ),
        );
      } catch (cause) {
        if (!cancelled) setError(message(cause));
      }
    }
    void load();
    return () => {
      cancelled = true;
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const preventLoss = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", preventLoss);
    return () => window.removeEventListener("beforeunload", preventLoss);
  }, [dirty]);

  function message(cause: unknown): string {
    if (cause instanceof DOMException && cause.name === "QuotaExceededError") {
      return "端末の空き容量が足りず保存できません。空き容量を増やして再試行してください。";
    }
    return cause instanceof Error && !/JSON|Unexpected|denied|Security/iu.test(cause.message)
      ? cause.message
      : "保存内容を読み書きできません。端末の保存設定を確認して再読み込みしてください。既存データは上書きしていません。";
  }
  function persist(next: ReviewState): boolean {
    setState(next);
    try {
      savedRaw.current = writeReviewState(window.localStorage, next, savedRaw.current);
      setDirty(false);
      setError("");
      setNotice("この端末に保存しました");
      return true;
    } catch (cause) {
      setDirty(true);
      setNotice("");
      setError(message(cause));
      return false;
    }
  }
  function change(next: ReviewState) {
    persist(next);
  }
  function go(id: string, next = state) {
    if (next && persist(next)) window.location.assign(route(id));
  }
  async function photoAction(action: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (cause) {
      if (mounted.current) setError(message(cause));
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function pickPhoto(file: File | undefined, slot: string) {
    if (!file || !state) return;
    void photoAction(async () => {
      if (!persist(state)) return;
      await checkImage(file);
      await saveReviewPhoto(window.indexedDB, slot, file);
      const updated = await readReviewPhotos(window.indexedDB);
      if (!mounted.current) return;
      setPhotos(updated);
      if (slot === "measurement")
        setNotice("採寸写真を端末に仮保存しました。内容を確認してください。");
      else window.location.assign(route("22"));
    });
  }
  function picker(slot: string) {
    return (
      <label className={local.fileButton}>
        写真を撮る・選ぶ
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            pickPhoto(file, slot);
          }}
        />
      </label>
    );
  }
  const resetControl = (
    <div className={local.reset}>
      {resetOpen ? (
        <>
          <p>
            この確認版の入力と写真だけを消します。他のアプリのデータは消しません。元に戻せません。
          </p>
          <button
            type="button"
            className={styles.outlineButton}
            disabled={busy}
            onClick={() => {
              void photoAction(async () => {
                const result = await resetReviewDataAndReload(
                  window.localStorage,
                  window.indexedDB,
                );
                savedRaw.current = result.raw;
                setState(result.state);
                setPhotos(result.photos);
                setDirty(false);
                if (result.error) throw new Error(result.error);
                window.location.assign(route("04"));
              });
            }}
          >
            確認用データを消去する
          </button>
          <button type="button" disabled={busy} onClick={() => setResetOpen(false)}>
            キャンセル
          </button>
        </>
      ) : (
        <button type="button" disabled={busy} onClick={() => setResetOpen(true)}>
          確認用データをリセット
        </button>
      )}
    </div>
  );
  const feedback = (
    <>
      {error ? (
        <div role="alert" className={local.error}>
          {error}
          {state && dirty ? (
            <button type="button" onClick={() => persist(state)}>
              保存を再試行
            </button>
          ) : (
            <button type="button" disabled={busy} onClick={() => window.location.reload()}>
              再読み込み
            </button>
          )}
        </div>
      ) : null}
      {notice && !error ? (
        <p role="status" className={local.status}>
          {notice}
        </p>
      ) : null}
    </>
  );
  const boundary = (
    <p className={local.boundary}>
      端末内の操作確認版 · 架空商品1件
      <br />
      入力・写真はこのブラウザーだけに保存します。実商品・個人情報は入力しないでください。外部送信・端末間共有はありません。
    </p>
  );
  if (!state)
    return (
      <section className={styles.contentStack}>
        {boundary}
        {feedback}
        {!error ? <p role="status">端末の保存内容を確認中…</p> : resetControl}
      </section>
    );

  const nextStage = resumeReviewScreen(state, photos);
  const photoCount = photoSlots.filter(([key]) => photos[key]).length;
  const allPhotos = photoCount === photoSlots.length;
  const selected = photoSlots[state.selectedPhoto] ?? photoSlots[0];
  const inspectionCount = state.inspection.filter((value) => value !== "unchecked").length;
  const issueCount = state.inspection.filter((value) => value === "issue").length;
  const measurementCount = state.measurements.filter(validMeasurement).length;
  const n = Number(screenId);
  const stageBlocked =
    (n >= 16 && !state.stored) || (n >= 20 && !state.inspectionComplete) || (n >= 25 && !allPhotos);
  let content: ReactNode;
  let action = () => go(nextStage);
  let label = "続きから確認する";
  let disabled = false;
  if (stageBlocked) {
    content = (
      <div className={styles.itemHint}>
        前の工程がまだ完了していません。保存済みの続きから確認してください。
      </div>
    );
  } else
    switch (screenId) {
      case "04": {
        const complete = state.measurementsComplete && allPhotos;
        content = (
          <div className={styles.homeTaskCard}>
            <div className={styles.homeTaskHead}>
              <strong>今日やること</strong>
              <span>確認用 1件</span>
            </div>
            <p className={local.product}>REVIEW-0001 · 確認用シャツ</p>
            {(
              [
                [
                  "保管",
                  state.stored ? "完了" : "残り 1件",
                  "14",
                  state.stored ? 100 : 0,
                  state.stored,
                ],
                [
                  "検品",
                  `${inspectionCount} / 6項目${state.inspectionComplete ? " · 完了" : ""}`,
                  "17",
                  (inspectionCount / 6) * 100,
                  state.inspectionComplete,
                ],
                ["撮影", `${photoCount} / 8枚`, "20", (photoCount / 8) * 100, allPhotos],
                [
                  "採寸",
                  `${measurementCount} / 4か所${state.measurementsComplete && allPhotos ? " · 完了" : ""}`,
                  "25",
                  (measurementCount / 4) * 100,
                  state.measurementsComplete && allPhotos,
                ],
              ] as const
            ).map(([title, detail, target, progress, done]) => (
              <button
                type="button"
                key={title}
                className={`${styles.homeTaskRow} ${local.task} ${local.homeTaskButton}`}
                onClick={() => go(target)}
              >
                <div>
                  <strong>{title}</strong>
                  <small>{detail}</small>
                  <i>
                    <b style={{ width: `${progress}%` }} />
                  </i>
                </div>
                <span
                  className={`${styles.checkMark} ${done ? styles.checkgreen : styles.checkblue}`}
                  aria-label={done ? "完了" : "未完了"}
                >
                  {done ? "✓" : "○"}
                </span>
              </button>
            ))}
            {complete ? (
              <p className={local.status}>保管・検品・撮影・採寸の操作確認が完了しました。</p>
            ) : null}
          </div>
        );
        label = complete ? "保存内容を見直す" : "作業を続ける";
        action = () => go(complete ? "14" : nextStage);
        break;
      }
      case "05": {
        const complete = state.measurementsComplete && allPhotos;
        content = (
          <>
            <p className={styles.boardInstruction}>作業の種類を選びます</p>
            <div className={styles.taskList}>
              {(
                [
                  ["⇩", "保管", state.stored ? "完了" : "残り 1件", "14"],
                  [
                    "☑",
                    "検品",
                    state.inspectionComplete ? "完了" : `${inspectionCount} / 6項目`,
                    "17",
                  ],
                  ["▣", "撮影", `${photoCount} / 8枚`, "20"],
                  ["／", "採寸", `${measurementCount} / 4か所${complete ? " · 完了" : ""}`, "25"],
                ] as const
              ).map(([icon, title, detail, target]) => (
                <button
                  type="button"
                  key={title}
                  className={`${styles.listRow} ${local.task}`}
                  onClick={() => go(target)}
                >
                  <span className={styles.rowIcon}>{icon}</span>
                  <div>
                    <strong>{title}</strong>
                    <small>{detail}</small>
                  </div>
                  <span className={styles.chevron}>›</span>
                </button>
              ))}
            </div>
          </>
        );
        label = complete ? "保存内容を見直す" : "この作業を開く";
        action = () => go(complete ? "14" : nextStage);
        break;
      }
      case "14":
        content = (
          <>
            <p className={styles.boardInstruction}>保管場所を入力して確認してください</p>
            <div className={styles.scanPhoto}>
              <Photo
                sample="/approved-assets/storage/shelf-location-mobile.png"
                alt="保管場所の見本"
                className={styles.locationPhotoAsset}
              />
            </div>
            <div className={styles.locationCard}>
              <Field
                label="保管場所（確認用）"
                value={state.location}
                onChange={(location) =>
                  change({
                    ...state,
                    location,
                    stored: false,
                    inspectionComplete: false,
                    measurementsComplete: false,
                  })
                }
              />
            </div>
            <p className={styles.locationHumanCheck}>例：作業部屋・棚A・2段目・箱3</p>
          </>
        );
        label = "この棚にする";
        disabled = !state.location.trim();
        action = () => go("15");
        break;
      case "15":
        content = (
          <>
            <p className={styles.boardInstruction}>商品と保管場所を確認してください</p>
            <div className={styles.matchStack}>
              <div className={styles.matchCard}>
                <span>確認用商品</span>
                <Photo
                  sample="/approved-assets/product/shirt-front.png"
                  alt="確認用シャツ"
                  className={styles.matchPhotoAsset}
                />
                <strong>REVIEW-0001</strong>
              </div>
              <div className={styles.matchCard}>
                <span>保管場所</span>
                <Photo
                  sample="/approved-assets/storage/shelf-location-mobile.png"
                  alt="保管場所の見本"
                  className={styles.matchPhotoAsset}
                />
                <strong>{state.location || "未入力"}</strong>
              </div>
            </div>
            <p className={styles.boardInstruction}>確認してから下のボタンを押します</p>
          </>
        );
        label = "確認してこの棚に格納";
        disabled = !state.location.trim();
        action = () => go("16", { ...state, stored: true });
        break;
      case "16":
        content = (
          <>
            <p className={styles.boardInstruction}>次の工程に進みます</p>
            <div className={styles.readyHero}>
              <h2>保管場所を保存しました</h2>
            </div>
            <div className={styles.nextStageCard}>{state.location}</div>
            <div className={styles.workflowDots}>
              <strong>格納 ✓</strong>
              <em />
              <strong>検品 →</strong>
              <em />
              <span>撮影</span>
            </div>
          </>
        );
        label = "検品を始める";
        action = () => go("17");
        break;
      case "17":
        content = (
          <>
            <p className={styles.boardInstruction}>
              {inspectionLabels[inspectionIndex]}の状態を確認してください
            </p>
            <div className={styles.inspectProgress}>
              <span>{inspectionCount} / 6</span>
            </div>
            <div className={local.tabs}>
              {inspectionLabels.map((item, index) => (
                <button
                  type="button"
                  key={item}
                  aria-pressed={index === inspectionIndex}
                  onClick={() => setInspectionIndex(index)}
                >
                  {item}
                  {state.inspection[index] !== "unchecked" ? " ✓" : ""}
                </button>
              ))}
            </div>
            <div className={styles.stateGrid}>
              {(
                [
                  ["unchecked", "未確認", "まだ確認していません", "gray", "?"],
                  ["ok", "問題なしを確認", "問題がないことを確認しました", "green", "✓"],
                  ["issue", "気になる点あり", "汚れや傷などがあります", "amber", "!"],
                ] as const
              ).map(([value, title, detail, tone, stateIcon]) => (
                <button
                  type="button"
                  key={value}
                  className={[
                    styles.inspectionState,
                    styles[`state${tone}`],
                    state.inspection[inspectionIndex] === value ? styles.inspectionStateActive : "",
                  ].join(" ")}
                  aria-pressed={state.inspection[inspectionIndex] === value}
                  onClick={() => {
                    const inspection = [...state.inspection];
                    inspection[inspectionIndex] = value;
                    change({
                      ...state,
                      inspection,
                      inspectionComplete: false,
                      measurementsComplete: false,
                    });
                  }}
                >
                  <span>{stateIcon}</span>
                  <b>{title}</b>
                  <small>{detail}</small>
                </button>
              ))}
            </div>
            <div className={styles.itemHint}>
              {inspectionCount === inspectionLabels.length
                ? "6項目すべて確認しました"
                : `残り${inspectionLabels.length - inspectionCount}項目を確認してください`}
            </div>
          </>
        );
        label =
          inspectionCount === inspectionLabels.length || inspectionIndex === 5
            ? "気になる箇所・まとめへ"
            : "次の項目へ";
        disabled = state.inspection[inspectionIndex] === "unchecked";
        action = () => {
          if (persist(state)) {
            if (inspectionCount === inspectionLabels.length || inspectionIndex === 5) go("18");
            else setInspectionIndex(inspectionIndex + 1);
          }
        };
        break;
      case "18":
        content = (
          <>
            <p className={styles.boardInstruction}>
              {issueCount
                ? `気になる点 ${issueCount}項目の内容を記録してください`
                : "気になる点がなければ、そのまま進めます"}
            </p>
            <div className={styles.markedPhoto}>
              <Photo
                sample="/approved-assets/mobile-fidelity/inspection-shirt-full.png"
                alt="確認用シャツの見本"
                className={styles.inspectionPhotoAsset}
              />
            </div>
            <div className={styles.issueForm}>
              {(
                [
                  ["location", "場所"],
                  ["kind", "種類"],
                  ["note", "メモ"],
                ] as const
              ).map(([key, title]) => (
                <Field
                  key={key}
                  label={title}
                  value={state.issue[key]}
                  maxLength={key === "note" ? 500 : 120}
                  onChange={(value) =>
                    change({
                      ...state,
                      issue: { ...state.issue, [key]: value },
                      inspectionComplete: false,
                      measurementsComplete: false,
                    })
                  }
                />
              ))}
            </div>
          </>
        );
        label = "この内容を保存";
        disabled = issueCount > 0 && (!state.issue.location.trim() || !state.issue.kind.trim());
        action = () => go("19");
        break;
      case "19":
        content = (
          <>
            <p className={styles.boardInstruction}>この商品の検品結果をまとめました</p>
            <div className={styles.inspectionSummaryCard}>
              <div className={styles.summaryRows}>
                <p>問題なし：{state.inspection.filter((value) => value === "ok").length}</p>
                <p>気になる点：{issueCount}</p>
                <p>未確認：{6 - inspectionCount}</p>
              </div>
              {issueCount > 0 ? (
                <div className={styles.issueSummaryPhotos}>
                  <strong>
                    {state.issue.location} · {state.issue.kind}
                  </strong>
                  <p>{state.issue.note}</p>
                </div>
              ) : null}
            </div>
            {inspectionCount < 6 ? (
              <button type="button" className={styles.outlineButton} onClick={() => go("17")}>
                未確認の項目に戻る
              </button>
            ) : null}
          </>
        );
        label = "検品を完了";
        disabled =
          inspectionCount < 6 ||
          (issueCount > 0 && (!state.issue.location.trim() || !state.issue.kind.trim()));
        action = () => go("20", { ...state, inspectionComplete: true });
        break;
      case "20":
        content = (
          <div className={styles.photoChecklist}>
            <div className={styles.photoChecklistHead}>
              <span>すべての写真を撮影してください</span>
              <strong>残り {8 - photoCount} / 8</strong>
            </div>
            <div className={styles.photoTodo}>
              {photoSlots.map(([key, title], index) => (
                <button
                  type="button"
                  className={local.photoRow}
                  key={key}
                  onClick={() => go("21", { ...state, selectedPhoto: index })}
                >
                  <span>📷 {title}</span>
                  <span>{photos[key] ? "保存済み" : "未撮影"} ›</span>
                </button>
              ))}
            </div>
            <div className={styles.photoGuideNotice}>
              写真はこの端末だけに保存します。加工・自動判定はしません。
            </div>
          </div>
        );
        label = allPhotos ? "写真まとめへ" : "未撮影の写真を撮る";
        action = () =>
          allPhotos
            ? go("24")
            : go("21", { ...state, selectedPhoto: photoSlots.findIndex(([key]) => !photos[key]) });
        break;
      case "21":
      case "23":
        content = (
          <>
            <p className={styles.boardInstruction}>
              {selected[1]}を{screenId === "23" ? "撮り直してください" : "撮影してください"}
            </p>
            <div className={styles.cameraGuide}>
              <Photo
                blob={photos[selected[0]]?.blob}
                sample="/approved-assets/mobile-fidelity/capture-shirt-full.png"
                alt={`${selected[1]}（未撮影の場合は見本）`}
                className={local.largePhoto}
              />
            </div>
            <p className={styles.boardInstruction}>
              明るい場所で全体が入るように。未撮影時の画像は見本です。
            </p>
            {picker(selected[0])}
          </>
        );
        label = "写真一覧へ戻る";
        action = () => go("20");
        break;
      case "22": {
        const draft = photos[`draft:${selected[0]}`];
        content = (
          <>
            <p className={styles.boardInstruction}>{selected[1]}の写真を確認してください</p>
            <div className={styles.reviewPhoto}>
              <Photo
                blob={draft?.blob}
                alt={`${selected[1]}の確認写真`}
                className={styles.reviewPhotoAsset}
              />
            </div>
            <div className={styles.photoQualityChecks}>
              <p>ぶれ・明るさ・切れている部分がないか、人が確認します。</p>
            </div>
            <button type="button" className={styles.outlineButton} onClick={() => go("23")}>
              撮り直す
            </button>
          </>
        );
        label = "確認してこの写真を使う";
        disabled = !draft;
        action = () => {
          void photoAction(async () => {
            if (!persist(state)) return;
            if (!draft) return;
            await confirmReviewPhoto(window.indexedDB, selected[0], draft.token);
            window.location.assign(route("24"));
          });
        };
        break;
      }
      case "24":
        content = (
          <div className={styles.photoSummaryCard}>
            <div className={styles.photoProgressBanner}>
              <strong>{photoCount} / 8枚 保存済み</strong>
            </div>
            <div className={styles.photoSummaryGrid}>
              {photoSlots.map(([key, title], index) => (
                <button
                  type="button"
                  key={key}
                  className={local.tile}
                  onClick={() => go("21", { ...state, selectedPhoto: index })}
                >
                  <Photo blob={photos[key]?.blob} alt={title} className={local.thumbnail} />
                  <span>
                    {title} · {photos[key] ? "保存済み" : "未撮影"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        );
        label = allPhotos ? "採寸へ進む" : "残りの写真を撮る";
        action = () => go(allPhotos ? "25" : "20");
        break;
      case "25":
        content = (
          <>
            <div className={styles.measurePrep}>
              <div className={styles.flatlay}>
                <Photo
                  sample="/approved-assets/product/shirt-flat-lay.png"
                  alt="平置きしたシャツの見本"
                  className={styles.flatlayAsset}
                />
              </div>
              <div>
                <h2>採寸する箇所</h2>
                <p>肩幅・身幅・着丈・袖丈を順番に確認します。</p>
              </div>
            </div>
            <div className={styles.measureSteps}>
              {measurementLabels.map((title, index) => (
                <p key={title}>
                  {title}：
                  {validMeasurement(state.measurements[index] ?? "")
                    ? `${state.measurements[index]} cm`
                    : "未入力"}
                </p>
              ))}
            </div>
            <p className={styles.boardInstruction}>伸ばさず、平らな場所で採寸します</p>
          </>
        );
        label = "採寸を始める";
        action = () => go("26");
        break;
      case "26":
        content = (
          <>
            <div className={styles.measureHeader}>
              <span>
                {measureIndex + 1} / 4　{measurementLabels[measureIndex]}
              </span>
            </div>
            <div className={styles.measureStage}>
              <Photo
                sample="/approved-assets/mobile-fidelity/capture-shirt-full.png"
                alt="採寸するシャツの見本"
                className={styles.measureAsset}
              />
            </div>
            <div className={local.tabs}>
              {measurementLabels.map((title, index) => (
                <button
                  type="button"
                  aria-pressed={index === measureIndex}
                  key={title}
                  onClick={() => setMeasureIndex(index)}
                >
                  {title}
                </button>
              ))}
            </div>
            <div className={styles.measureReading}>
              <Field
                number
                label={`${measurementLabels[measureIndex]}（cm）`}
                value={state.measurements[measureIndex] ?? ""}
                maxLength={12}
                onChange={(value) => {
                  const measurements = [...state.measurements];
                  measurements[measureIndex] = value;
                  change({ ...state, measurements, measurementsComplete: false });
                }}
              />
            </div>
            <p className={styles.boardInstruction}>0より大きく300cm以下の数値を入力してください</p>
          </>
        );
        label = measureIndex < 3 ? "保存して次へ" : "採寸写真へ";
        disabled = !validMeasurement(state.measurements[measureIndex] ?? "");
        action = () => {
          if (persist(state)) {
            if (measureIndex < 3) setMeasureIndex(measureIndex + 1);
            else go("27");
          }
        };
        break;
      case "27":
        content = (
          <>
            <div className={styles.measureCamera}>
              <Photo
                blob={(photos["draft:measurement"] ?? photos.measurement)?.blob}
                sample="/approved-assets/measurement/shoulder-ruler.png"
                alt="採寸写真（未撮影の場合は見本）"
                className={styles.measureCameraAsset}
              />
            </div>
            <div className={styles.measurePhotoCopy}>
              <span>採寸写真（任意）</span>
              <div className={styles.measurePhotoGuide}>
                <strong>メジャーの目盛りが読めるように</strong>
                <small>端から端まで水平に配置します。未撮影時の画像は見本です。</small>
              </div>
            </div>
            {picker("measurement")}
          </>
        );
        label = photos["draft:measurement"] ? "確認して写真を使う" : "採寸結果を確認";
        action = () => {
          void photoAction(async () => {
            if (!persist(state)) return;
            if (photos["draft:measurement"])
              await confirmReviewPhoto(
                window.indexedDB,
                "measurement",
                photos["draft:measurement"].token,
              );
            window.location.assign(route("28"));
          });
        };
        break;
      case "28":
        content = (
          <>
            <p className={styles.boardInstruction}>採寸した数値を確認してください</p>
            <div className={styles.reasonList}>
              {measurementLabels.map((title, index) => (
                <p key={title}>
                  {title}：
                  <strong>
                    {state.measurements[index] || "未入力"} {state.measurements[index] ? "cm" : ""}
                  </strong>
                </p>
              ))}
            </div>
            <button type="button" className={styles.outlineButton} onClick={() => go("26")}>
              もう一度測る
            </button>
            <p className={styles.boardInstruction}>自動の数値読取・差の判定は行いません</p>
          </>
        );
        label = "確認して採寸を完了";
        disabled = !state.measurements.every(validMeasurement);
        action = () => go("04", { ...state, measurementsComplete: true });
        break;
    }
  return (
    <div className={local.flow} data-local-review="browser-only">
      {boundary}
      <section className={styles.contentStack}>{content}</section>
      {feedback}
      <div className={styles.actionBar}>
        <button
          type="button"
          className={styles.primaryButton}
          disabled={disabled || busy}
          onClick={action}
        >
          {busy ? "端末に保存中…" : label}
        </button>
        {screenId !== "04" && screenId !== "05" ? (
          <button
            type="button"
            className={styles.secondaryAction}
            disabled={busy}
            onClick={() => go("05")}
          >
            作業一覧へ戻る ›
          </button>
        ) : null}
      </div>
      {screenId === "04" || screenId === "05" ? resetControl : null}
    </div>
  );
}
