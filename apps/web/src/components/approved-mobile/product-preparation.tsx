"use client";

import { useEffect, useRef, useState } from "react";
import {
  measurementLabels,
  photoSlots,
  readReviewPhotos,
  readReviewState,
  ReviewConflictError,
  saveReviewPhoto,
  validatePhoto,
  validMeasurement,
  writeReviewState,
  type ReviewPhotos,
  type ReviewState,
} from "./local-review-store";
import { buildReviewDescription, descriptionProblems } from "./product-description";
import {
  conditionOptions,
  sampleProductDetails,
  type ProductDetails,
} from "./review-product-details";
import { reviewPath } from "./review-path";
import ui from "./product-preparation.module.css";
import { prepareProductRecovery, type RecoveryChange } from "./product-preparation-recovery";

const basePath = process.env.NEXT_PUBLIC_REVIEW_BASE_PATH ?? "";
const path = (id: string) => reviewPath(`/mobile/screens/${id}/`, basePath);
const sampleFront = "/approved-assets/product/shirt-front.png";
const sampleSources: Record<string, string> = {
  front: sampleFront,
  back: "/approved-assets/product/shirt-back.png",
  brand: "/approved-assets/product/brand-tag.png",
  quality: "/approved-assets/product/quality-label.png",
};
type Panel = "info" | "photos" | "description";

function Photo({
  blob,
  sample,
  alt,
}: {
  blob?: Blob | undefined;
  sample?: string | undefined;
  alt: string;
}) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) return;
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  const src = blob ? url : sample ? reviewPath(sample, basePath) : undefined;
  return src ? <img src={src} alt={alt} /> : <span className={ui.emptyPhoto}>＋</span>;
}

function errorText(cause: unknown): string {
  return cause instanceof Error && !/JSON|Unexpected|denied|Security|quota/iu.test(cause.message)
    ? cause.message
    : "保存内容を読み書きできません。端末の空き容量・保存設定を確認してください。";
}

export function ProductPreparation({ screenId }: { screenId: string }) {
  const photoEntry = ["29", "30", "photo-01", "photo-02", "photo-06", "photo-07"].includes(
    screenId,
  );
  const [panel, setPanel] = useState<Panel>(photoEntry ? "photos" : "info");
  const [state, setState] = useState<ReviewState | null>(null);
  const [photos, setPhotos] = useState<ReviewPhotos>({});
  const [error, setError] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [notice, setNotice] = useState("");
  const [dirty, setDirty] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [recovery, setRecovery] = useState<{
    state: ReviewState;
    expected: string | null;
    changes: RecoveryChange[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [photosReady, setPhotosReady] = useState(false);
  const [copying, setCopying] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const savedRaw = useRef<string | null>(null);
  const savedState = useRef<ReviewState | null>(null);
  const pending = useRef(false);
  const mounted = useRef(true);
  const photoBusy = useRef(false);
  const copyVersion = useRef(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const slotToPick = useRef("front");

  const loadPhotos = async () => {
    setPhotosReady(false);
    try {
      const result = await readReviewPhotos(window.indexedDB);
      if (!mounted.current) return;
      setPhotos(result);
      setPhotoError("");
      setPhotosReady(true);
    } catch (cause) {
      if (mounted.current) setPhotoError(errorText(cause));
    }
  };
  const load = () => {
    try {
      const result = readReviewState(window.localStorage);
      savedRaw.current = result.raw;
      savedState.current = result.state;
      setState(result.state);
      setError("");
      pending.current = false;
      setDirty(false);
    } catch (cause) {
      setError(errorText(cause));
    }
  };
  useEffect(() => {
    mounted.current = true;
    load();
    void loadPhotos();
    const preventLoss = (event: BeforeUnloadEvent) => {
      if (pending.current || photoBusy.current) event.preventDefault();
    };
    const preventLinkLoss = (event: MouseEvent) => {
      if (
        (pending.current || photoBusy.current) &&
        event.target instanceof Element &&
        event.target.closest("a[href]")
      ) {
        event.preventDefault();
        event.stopPropagation();
        setError(
          photoBusy.current
            ? "写真の保存が終わるまでお待ちください。"
            : "未保存の入力があります。先に保存を再試行してください。",
        );
      }
    };
    window.addEventListener("beforeunload", preventLoss);
    document.addEventListener("click", preventLinkLoss, true);
    return () => {
      mounted.current = false;
      copyVersion.current++;
      window.removeEventListener("beforeunload", preventLoss);
      document.removeEventListener("click", preventLinkLoss, true);
    };
  }, []);
  useEffect(() => {
    if (selectedPhoto && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [selectedPhoto]);

  const persist = (next: ReviewState) => {
    copyVersion.current++;
    setNotice("");
    setState(next);
    setRecovery(null);
    try {
      savedRaw.current = writeReviewState(window.localStorage, next, savedRaw.current);
      savedState.current = next;
      pending.current = false;
      setDirty(false);
      setError("");
      setConflict(false);
      return true;
    } catch (cause) {
      pending.current = true;
      setDirty(true);
      setConflict(cause instanceof ReviewConflictError);
      setError(errorText(cause));
      return false;
    }
  };
  const showRecovery = () => {
    if (!state || !savedState.current) return;
    try {
      const latest = readReviewState(window.localStorage);
      setRecovery({
        ...prepareProductRecovery(savedState.current, state, latest.state),
        expected: latest.raw,
      });
    } catch (cause) {
      setError(errorText(cause));
    }
  };
  const applyRecovery = () => {
    if (!recovery) return;
    try {
      savedRaw.current = writeReviewState(window.localStorage, recovery.state, recovery.expected);
      savedState.current = recovery.state;
      setState(recovery.state);
      pending.current = false;
      setDirty(false);
      setConflict(false);
      setRecovery(null);
      setError("");
      setNotice("変更した項目を保存しました。ほかの画面で保存した項目も保持しています。");
      copyVersion.current++;
    } catch (cause) {
      setRecovery(null);
      setError(errorText(cause));
    }
  };
  const changePanel = (next: Panel) => {
    setPanel(next);
    setNotice("");
    requestAnimationFrame(() => {
      content.current?.focus({ preventScroll: true });
      content.current?.scrollIntoView({ block: "start", behavior: "instant" });
    });
  };
  const pickPhoto = async (file: File | undefined) => {
    if (!file || photoBusy.current || !photosReady) return;
    const slot = slotToPick.current;
    photoBusy.current = true;
    setBusy(true);
    setPhotoError("");
    setNotice("");
    let url: string | undefined;
    try {
      validatePhoto(file);
      url = URL.createObjectURL(file);
      const candidate = url;
      await new Promise<void>((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
          if (
            image.naturalWidth > 10000 ||
            image.naturalHeight > 10000 ||
            image.naturalWidth * image.naturalHeight > 40000000
          )
            reject(new Error("写真が大きすぎます。4,000万画素以下を選んでください。"));
          else resolve();
        };
        image.onerror = () =>
          reject(new Error("写真を表示できません。JPEG・PNG・WebPを選び直してください。"));
        image.src = candidate;
      });
      if (!mounted.current) return;
      // Keep the previous confirmed original. This is a saved draft, not a business approval.
      await saveReviewPhoto(window.indexedDB, slot, file, photos[`draft:${slot}`]?.token ?? null);
      const result = await readReviewPhotos(window.indexedDB);
      if (!mounted.current) return;
      setPhotos(result);
      setNotice("選んだ写真をこのブラウザーに保存しました。");
    } catch (cause) {
      if (mounted.current) setPhotoError(errorText(cause));
    } finally {
      if (url) URL.revokeObjectURL(url);
      photoBusy.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const choosePhoto = (slot: string) => {
    slotToPick.current = slot;
    picker.current?.click();
  };
  const copy = async () => {
    if (!state || copying || dirty || descriptionProblems(state).length) return;
    if (!persist(state)) return;
    const version = ++copyVersion.current;
    setCopying(true);
    try {
      await navigator.clipboard.writeText(buildReviewDescription(state));
      if (mounted.current && version === copyVersion.current)
        setNotice("見本文をコピーしました。外部サービスへの送信・出品はしていません。");
    } catch {
      if (mounted.current && version === copyVersion.current)
        setNotice("自動コピーできませんでした。本文を長押しして選択・コピーしてください。");
    } finally {
      if (mounted.current) setCopying(false);
    }
  };

  if (!state)
    return (
      <section className={ui.preparation}>
        <p role={error ? "alert" : "status"}>{error || "保存した商品を読み込み中…"}</p>
        {error ? (
          <button type="button" className={ui.secondary} onClick={load}>
            読み込みを再試行
          </button>
        ) : null}
      </section>
    );
  const details = state.details ?? sampleProductDetails();
  const problems = descriptionProblems(state);
  const photoCount = photoSlots.filter(([key]) => photos[`draft:${key}`] || photos[key]).length;
  const field = (key: keyof ProductDetails, label: string) => (
    <label className={ui.field} key={key}>
      <span>{label}</span>
      <input
        value={details[key]}
        maxLength={120}
        onChange={(e) => persist({ ...state, details: { ...details, [key]: e.target.value } })}
      />
    </label>
  );
  const activePhotoLabel = photoSlots.find(([key]) => key === selectedPhoto)?.[1] ?? "";

  return (
    <section className={ui.preparation}>
      <div className={ui.productHeader}>
        <div className={ui.productImage}>
          <Photo
            blob={(photos["draft:front"] ?? photos.front)?.blob}
            sample={sampleFront}
            alt="確認用商品の正面"
          />
        </div>
        <div>
          <small>REVIEW-0001 · 見本</small>
          <h2>{details.name || "商品名を入力"}</h2>
          <p>写真と商品情報から、出品文を作ります。</p>
        </div>
      </div>
      <details className={ui.boundary}>
        <summary>確認用1点 · このブラウザーに保存</summary>
        <p>
          実商品・個人情報は入力しないでください。入力と選んだ写真はこの端末の同じブラウザーだけに保存します。PC・別端末との共有、自動加工、自動出品はしません。ブラウザーのデータ消去で失われます。
        </p>
      </details>
      <nav className={ui.sections} aria-label="出品準備の項目">
        {(
          [
            ["info", "商品情報"],
            ["photos", "写真"],
            ["description", "出品文"],
          ] as const
        ).map(([value, label]) => (
          <button
            type="button"
            key={value}
            aria-current={panel === value ? "page" : undefined}
            onClick={() => changePanel(value)}
          >
            {label}
          </button>
        ))}
      </nav>
      {error ? (
        <div className={ui.error} role="alert">
          <p>{error}</p>
          {dirty ? (
            conflict ? (
              <>
                <p>
                  入力はこの画面に残っています。最新の保存内容と見比べて、変更した項目だけを反映できます。
                </p>
                <button type="button" onClick={showRecovery}>
                  保存済みの内容と見比べる
                </button>
                {recovery ? (
                  <>
                    <dl className={ui.facts}>
                      {recovery.changes.map((change) => (
                        <div key={change.label}>
                          <dt>{change.label}</dt>
                          <dd>
                            保存済み：{change.saved || "空欄"}
                            <br />
                            この画面：{change.input || "空欄"}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    <p>
                      表示した項目は「この画面」の値になります。それ以外の新しい保存内容は残します。
                    </p>
                    <button type="button" onClick={applyRecovery}>
                      確認して変更した項目だけ反映
                    </button>
                  </>
                ) : null}
              </>
            ) : (
              <button type="button" onClick={() => persist(state)}>
                入力の保存を再試行
              </button>
            )
          ) : null}
        </div>
      ) : null}
      <div ref={content} tabIndex={-1} className={ui.panel}>
        {panel === "info" ? (
          <>
            <div className={ui.sectionHeading}>
              <h3>商品情報</h3>
              <span>{dirty ? "未保存" : "入力は自動保存"}</span>
            </div>
            <div className={ui.card}>
              {field("name", "商品名")}
              <div className={ui.fields}>
                {field("brand", "ブランド")}
                {field("size", "サイズ")}
                {field("color", "色")}
                {field("material", "素材")}
              </div>
              <label className={ui.field}>
                <span>商品の状態</span>
                <select
                  value={details.condition}
                  onChange={(e) =>
                    persist({ ...state, details: { ...details, condition: e.target.value } })
                  }
                >
                  <option value="">選んでください</option>
                  {conditionOptions.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <details className={ui.extra}>
                <summary>柄・季節・補足を入力する（任意）</summary>
                <div className={ui.fields}>
                  {field("design", "柄・デザイン")}
                  {field("season", "季節感")}
                </div>
                <label className={ui.field}>
                  <span>説明文に加える補足</span>
                  <textarea
                    value={details.note}
                    maxLength={1000}
                    rows={3}
                    onChange={(e) =>
                      persist({ ...state, details: { ...details, note: e.target.value } })
                    }
                  />
                </label>
              </details>
            </div>
            <details className={ui.card}>
              <summary className={ui.cardSummary}>
                採寸{" "}
                <span>{state.measurements.filter(validMeasurement).length} / 4か所 入力済み</span>
              </summary>
              <p className={ui.hint}>
                以前入力した値をそのまま使います。分からない項目は空欄で構いません。
              </p>
              <div className={ui.fields}>
                {measurementLabels.map((label, i) => (
                  <label className={ui.field} key={label}>
                    <span>{label}（cm）</span>
                    <input
                      inputMode="decimal"
                      maxLength={12}
                      value={state.measurements[i]}
                      onChange={(e) =>
                        persist({
                          ...state,
                          measurementsComplete: false,
                          measurements: state.measurements.map((v, j) =>
                            i === j ? e.target.value : v,
                          ),
                        })
                      }
                    />
                  </label>
                ))}
              </div>
            </details>
            <details className={ui.card}>
              <summary className={ui.cardSummary}>保管場所・検品メモ</summary>
              <dl className={ui.facts}>
                <div>
                  <dt>保管場所</dt>
                  <dd>
                    {state.location || "未登録"}
                    {state.location && !state.stored ? "（確認前）" : ""}
                  </dd>
                </div>
                <div>
                  <dt>気になる箇所</dt>
                  <dd>
                    {state.inspection.includes("issue")
                      ? [state.issue.location, state.issue.kind, state.issue.note]
                          .filter(Boolean)
                          .join(" / ")
                      : state.inspectionComplete
                        ? "検品で指摘なし"
                        : "まだ検品していません"}
                  </dd>
                </div>
              </dl>
              <p className={ui.hint}>
                保管場所は出品文に載せません。場所の確定・検品は作業画面で行います。
              </p>
              <a className={ui.textLink} href={path("14")}>
                保管場所を確認・変更する　›
              </a>
            </details>
            <button type="button" className={ui.primary} onClick={() => changePanel("description")}>
              出品文を見る　›
            </button>
          </>
        ) : panel === "photos" ? (
          <>
            <div className={ui.sectionHeading}>
              <h3>商品写真</h3>
              <span>{photosReady ? `選んだ写真 ${photoCount}枚` : "読み込み中…"}</span>
            </div>
            <p className={ui.hint}>
              写真を押すと大きく表示します。見るだけの確認ボタンは不要です。写真加工をしなくても出品文へ進めます。
            </p>
            <div className={ui.photoGrid}>
              {photoSlots.map(([key, label]) => {
                const photo = photos[`draft:${key}`] ?? photos[key];
                return (
                  <div key={key} className={ui.photoCard}>
                    <button
                      type="button"
                      className={ui.photoPreview}
                      aria-label={`${label}を大きく表示`}
                      onClick={() => setSelectedPhoto(key)}
                    >
                      <Photo
                        blob={photo?.blob}
                        sample={sampleSources[key]}
                        alt={photo ? label : `${label}の見本`}
                      />
                      <span>
                        {label}
                        <small>
                          {photo ? "選んだ写真" : sampleSources[key] ? "見本" : "未選択"}
                        </small>
                      </span>
                    </button>
                    <button
                      type="button"
                      className={ui.pickButton}
                      disabled={busy || !photosReady}
                      onClick={() => choosePhoto(key)}
                    >
                      {photo ? "選び直す" : "撮る・選ぶ"}
                    </button>
                  </div>
                );
              })}
            </div>
            {photoError ? (
              <div className={ui.error} role="alert">
                <p>{photoError}</p>
                <button type="button" onClick={() => void loadPhotos()}>
                  写真を読み直す
                </button>
              </div>
            ) : null}
            <p className={ui.hint}>
              JPEG・PNG・WebP、1枚10MBまで。選んだ写真は下書き保存され、作業画面で確認済みの原本は残ります。
            </p>
            <details className={ui.card} open={screenId === "photo-06" || screenId === "photo-07"}>
              <summary className={ui.cardSummary}>写真を加工したいときだけ</summary>
              <p className={ui.hint}>
                端末の写真アプリなどで本人が編集し、「選び直す」から追加します。保存済みの原本がある写真は、拡大すると見比べられます。加工は必須ではありません。
              </p>
              <p className={ui.hint}>
                この確認版に自動加工・一括書き出しはありません。難しいファイル操作をしなくても、商品情報と出品文を使えます。
              </p>
              <a className={ui.textLink} href={path("photo-04")}>
                編集の好みを選ぶ（任意）　›
              </a>
            </details>
            <button
              type="button"
              className={ui.primary}
              disabled={busy}
              onClick={() => changePanel("description")}
            >
              出品文を見る　›
            </button>
          </>
        ) : (
          <>
            <div className={ui.sectionHeading}>
              <h3>出品文</h3>
              <span>入力した内容をまとめました</span>
            </div>
            <p className={ui.hint}>
              内容を見直してコピーします。未入力の項目は省略しています。写真は別途ご用意ください。
            </p>
            {problems.length ? (
              <div className={ui.error}>
                <ul>
                  {problems.map((problem) => (
                    <li key={problem}>{problem}</li>
                  ))}
                </ul>
                <button type="button" onClick={() => changePanel("info")}>
                  商品情報を直す
                </button>
              </div>
            ) : null}
            <label className={ui.field}>
              <span>コピーする本文（見本）</span>
              <textarea
                className={ui.description}
                value={buildReviewDescription(state)}
                readOnly
                rows={16}
                onFocus={(e) => e.target.select()}
              />
            </label>
            <button
              type="button"
              className={ui.primary}
              disabled={copying || dirty || problems.length > 0}
              onClick={() => void copy()}
            >
              {copying ? "コピー中…" : "内容を確認してコピー"}
            </button>
            <button type="button" className={ui.secondary} onClick={() => changePanel("info")}>
              商品情報を直す
            </button>
          </>
        )}
      </div>
      <p className={ui.status} role="status">
        {busy ? "写真を保存しています…" : notice}
      </p>
      <a className={ui.textLink} href={reviewPath("/mobile/products/", basePath)}>
        商品一覧へ戻る　›
      </a>
      <input
        ref={picker}
        className={ui.hiddenInput}
        aria-label="商品写真を選ぶ"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={busy || !photosReady}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          void pickPhoto(file);
        }}
      />
      <dialog className={ui.dialog} ref={dialog} onClose={() => setSelectedPhoto(null)}>
        <div className={ui.dialogHeader}>
          <h3>{activePhotoLabel}</h3>
          <button type="button" autoFocus onClick={() => dialog.current?.close()}>
            閉じる
          </button>
        </div>
        {selectedPhoto ? (
          <>
            <div className={ui.largePhoto}>
              <Photo
                blob={(photos[`draft:${selectedPhoto}`] ?? photos[selectedPhoto])?.blob}
                sample={sampleSources[selectedPhoto]}
                alt={activePhotoLabel}
              />
            </div>
            {photos[`draft:${selectedPhoto}`] && photos[selectedPhoto] ? (
              <details className={ui.extra}>
                <summary>保存済みの原本と見比べる</summary>
                <div className={ui.largePhoto}>
                  <Photo blob={photos[selectedPhoto]?.blob} alt="保存済みの原本" />
                </div>
              </details>
            ) : null}
            <p className={ui.hint}>
              {photos[`draft:${selectedPhoto}`] || photos[selectedPhoto]
                ? "選んだ写真です。自動加工・外部送信はしていません。"
                : "これは見本です。実際に選んだ写真ではありません。"}
            </p>
          </>
        ) : null}
      </dialog>
    </section>
  );
}

export function PreparationProductCard() {
  const [state, setState] = useState<ReviewState | null>(null);
  const [photos, setPhotos] = useState<ReviewPhotos>({});
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    try {
      setState(readReviewState(window.localStorage).state);
    } catch {
      setError("保存した商品情報を読み取れません。商品を開いて再試行してください。");
    }
    void readReviewPhotos(window.indexedDB)
      .then((value) => {
        if (alive) setPhotos(value);
      })
      .catch(() => {
        if (alive) setError("写真を読み取れません。商品を開いて再試行してください。");
      });
    return () => {
      alive = false;
    };
  }, []);
  const d = state?.details ?? sampleProductDetails();
  return (
    <>
      <a className={ui.listCard} href={path("photo-03")}>
        <div className={ui.productImage}>
          <Photo
            blob={(photos["draft:front"] ?? photos.front)?.blob}
            sample={sampleFront}
            alt="確認用商品の正面"
          />
        </div>
        <div>
          <small>REVIEW-0001 · 見本</small>
          <h3>{d.name || "商品名未入力"}</h3>
          <p>{[d.brand, d.size, d.color].filter(Boolean).join(" / ")}</p>
          <p>保管：{state?.location || "未登録"}</p>
          <strong>出品の準備をする　›</strong>
        </div>
      </a>
      {error ? (
        <p role="alert" className={ui.error}>
          {error}
        </p>
      ) : null}
    </>
  );
}
