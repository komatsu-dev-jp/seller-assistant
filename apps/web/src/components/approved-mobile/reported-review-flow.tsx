"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./approved-mobile-demo.module.css";
import local from "./reported-review-flow.module.css";
import { reviewPath } from "./review-path";
import { validatePhoto } from "./local-review-store";
import {
  candidateLabels,
  canMarkMissing,
  canPreviewFile,
  changeCount,
  controlsKey,
  officialProductUrl,
  parseControls,
  recordReview,
  reviewCsv,
  settingsReady,
  type ControlsState,
} from "./review-controls-state";

const basePath = process.env.NEXT_PUBLIC_REVIEW_BASE_PATH ?? "";
const reportedScreens = [
  "39",
  "40",
  "44",
  "45",
  "46",
  "47",
  "48",
  "49",
  "photo-01",
  "photo-07",
  "box-02",
  "sales-06",
];
export function isReportedReviewScreen(id: string): boolean {
  return reportedScreens.includes(id);
}
function route(id: string): string {
  return reviewPath(`/mobile/screens/${id}/`, basePath);
}
const samplePhotos = [
  ["正面", "/approved-assets/mobile-fidelity/short-sleeve-front.png"],
  ["背面", "/approved-assets/mobile-fidelity/short-sleeve-back.png"],
  ["ブランドタグ", "/approved-assets/product/brand-tag.png"],
  ["品質表示", "/approved-assets/product/quality-label.png"],
  ["気になる箇所", "/approved-assets/product/defect-detail.png"],
] as const;

function Check({
  label,
  checked,
  onChange,
  detail,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  detail?: string;
}) {
  return (
    <label className={detail ? `${styles.accountCandidateRow} ${local.check}` : local.check}>
      {detail ? (
        <span className={styles.accountCandidateIcon} aria-hidden="true">
          ▤
        </span>
      ) : null}
      <input aria-label={label} type="checkbox" checked={checked} onChange={onChange} />
      <div>
        <strong>{label}</strong>
        {detail ? <small>{detail}</small> : null}
      </div>
      <span aria-hidden="true">{checked ? "✓" : "未確認"}</span>
    </label>
  );
}
function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className={styles.formField}>
      <span>{label}</span>
      <input
        aria-label={label}
        type={type}
        value={value}
        maxLength={500}
        onInput={type === "date" ? (event) => onChange(event.currentTarget.value) : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
function Help({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className={local.help}>
      <summary>{label}について</summary>
      <p>{children}</p>
    </details>
  );
}

export function HoldToConfirm({
  disabled,
  onConfirm,
}: {
  disabled: boolean;
  onConfirm: () => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [holding, setHolding] = useState(false);
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };
  useEffect(() => {
    const stop = () => cancel();
    window.addEventListener("blur", stop);
    document.addEventListener("visibilitychange", stop);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      window.removeEventListener("blur", stop);
      document.removeEventListener("visibilitychange", stop);
    };
  }, []);
  useEffect(() => {
    if (disabled) cancel();
  }, [disabled]);
  const start = () => {
    if (disabled || timer.current) return;
    setHolding(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      setHolding(false);
      onConfirm();
    }, 3000);
  };
  return (
    <button
      type="button"
      className={`${styles.primaryButton} ${local.hold}`}
      disabled={disabled}
      onPointerDown={(e) => {
        if (e.button === 0) {
          e.currentTarget.setPointerCapture(e.pointerId);
          start();
        }
      }}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onLostPointerCapture={cancel}
      onBlur={cancel}
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat) {
          e.preventDefault();
          start();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          cancel();
        }
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {holding ? "そのまま3秒間押してください…" : "3秒押して仮状態にする"}
    </button>
  );
}

function PhotoReview({ processed }: { processed: boolean }) {
  const [selected, setSelected] = useState(0);
  const [checked, setChecked] = useState<boolean[]>([false, false, false, false, false]);
  const [images, setImages] = useState<Record<number, string>>({});
  const [checks, setChecks] = useState<Record<number, boolean[]>>({});
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const urls = useRef(new Set<string>());
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
      urls.current.forEach((url) => URL.revokeObjectURL(url));
      urls.current.clear();
    },
    [],
  );
  const pick = async (file: File | undefined) => {
    if (!file) return;
    const request = ++generation.current;
    const slot = selected;
    let url: string | undefined;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      validatePhoto(file);
      url = URL.createObjectURL(file);
      urls.current.add(url);
      const candidate = url;
      await new Promise<void>((resolve, reject) => {
        const image = new Image();
        image.onload = () =>
          image.naturalWidth > 10000 ||
          image.naturalHeight > 10000 ||
          image.naturalWidth * image.naturalHeight > 40000000
            ? reject(new Error("写真が大きすぎます。4,000万画素以下を選んでください。"))
            : resolve();
        image.onerror = () =>
          reject(new Error("画像を表示できません。JPEG・PNG・WebPを選び直してください。"));
        image.src = candidate;
      });
      if (request !== generation.current) {
        URL.revokeObjectURL(candidate);
        urls.current.delete(candidate);
        return;
      }
      const previous = images[slot];
      if (previous) {
        URL.revokeObjectURL(previous);
        urls.current.delete(previous);
      }
      setImages((current) => ({ ...current, [slot]: candidate }));
      setChecks((current) => ({ ...current, [slot]: [false, false, false] }));
      setChecked((current) => current.map((value, i) => (i === slot ? false : value)));
    } catch (cause) {
      if (url) {
        URL.revokeObjectURL(url);
        urls.current.delete(url);
      }
      if (request === generation.current)
        setError(cause instanceof Error ? cause.message : "画像を読み込めませんでした。");
    } finally {
      if (request === generation.current) setBusy(false);
    }
  };
  const currentChecks = checks[selected] ?? [false, false, false];
  const count = checked.filter(Boolean).length;
  return (
    <>
      <p className={local.note}>
        写真は操作確認用の見本です。選んだ画像はこの画面でだけ表示し、保存・送信しません。再読み込みすると選び直しになります。実商品・個人情報は選ばないでください。
      </p>
      <p className={styles.boardInstruction}>
        {processed ? "見本と選んだ画像を比較してください" : "写真を押して大きく表示します"}
      </p>
      <div className={`${styles.photoStrip} ${local.photoGrid}`}>
        {samplePhotos.map(([label, src], i) => (
          <button
            key={label}
            type="button"
            className={local.photoTile}
            aria-pressed={selected === i}
            onClick={() => {
              setSelected(i);
              setNotice("");
            }}
          >
            <img src={reviewPath(src, basePath)} alt={`${label}の見本`} />
            <span>
              {label} {checked[i] ? "✓ 確認済み" : "未確認"}
            </span>
          </button>
        ))}
      </div>
      <div className={styles.beforeAfter}>
        <div>
          <span>{samplePhotos[selected]![0]}（見本）</span>
          <img
            className={local.largePhoto}
            src={reviewPath(samplePhotos[selected]![1], basePath)}
            alt="選択中の見本写真"
          />
        </div>
        {processed ? (
          <div>
            <span>選んだ画像</span>
            {images[selected] ? (
              <img className={local.largePhoto} src={images[selected]} alt="本人が選んだ比較画像" />
            ) : (
              <p>画像を選んでください</p>
            )}
          </div>
        ) : null}
      </div>
      {processed ? (
        <>
          <label className={local.file}>
            比較する画像を選ぶ
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy}
              onChange={(e) => {
                void pick(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          <p className={local.note}>
            JPEG・PNG・WebP（10MB以下）に対応。ZIPと自動加工・自動一致判定は未対応です。
          </p>
          {busy ? <p role="status">画像を確認しています…</p> : null}
          <div className={styles.approveChecklist}>
            {["色を確認", "ロゴを確認", "傷を確認"].map((label, i) => (
              <Check
                key={label}
                label={label}
                checked={currentChecks[i]!}
                onChange={() => {
                  if (!images[selected] || busy) {
                    setError("先に比較する画像を選んでください。");
                    return;
                  }
                  setChecks((current) => ({
                    ...current,
                    [selected]: currentChecks.map((v, j) => (j === i ? !v : v)),
                  }));
                  setChecked((current) => current.map((v, j) => (j === selected ? false : v)));
                  setNotice("");
                }}
              />
            ))}
          </div>
        </>
      ) : null}
      {error ? (
        <p className={local.error} role="alert">
          {error}
        </p>
      ) : null}
      <p role="status">
        {count} / 5枚 確認済み {notice}
      </p>
      <div className={`${styles.actionBar} ${local.actions}`}>
        <button
          type="button"
          className={styles.primaryButton}
          disabled={busy || (processed && (!images[selected] || !currentChecks.every(Boolean)))}
          onClick={() => {
            setChecked((values) => values.map((v, i) => (i === selected ? true : v)));
            setNotice(
              `${samplePhotos[selected]![0]}をこの画面で確認しました。保存・送信はしていません。`,
            );
          }}
        >
          {samplePhotos[selected]![0]}を確認
        </button>
        <a className={styles.secondaryAction} href={route(processed ? "photo-01" : "photo-07")}>
          {processed ? "撮影した写真へ戻る" : "加工後の比較を試す"}　›
        </a>
      </div>
    </>
  );
}

export function ReportedReviewFlow({ screenId }: { screenId: string }) {
  const [state, setState] = useState<ControlsState | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [category, setCategory] = useState(0);
  const [assignee, setAssignee] = useState("all");
  const [official, setOfficial] = useState("");
  const [importResult, setImportResult] = useState("");
  const [importMemo, setImportMemo] = useState("");
  const [salesResult, setSalesResult] = useState("");
  const [saveFailed, setSaveFailed] = useState(false);
  const [actionError, setActionError] = useState("");
  const [categoryOpen, setCategoryOpen] = useState(false);
  const pending = useRef<ControlsState | null>(null);
  const load = () => {
    try {
      setState(parseControls(window.sessionStorage.getItem(controlsKey)));
      setError("");
    } catch {
      setError(
        "確認用データを読み取れません。既存データを上書きせず停止しました。ブラウザーの保存許可を確認して再試行してください。",
      );
    }
  };
  useEffect(() => {
    load();
    const preventLoss = (event: BeforeUnloadEvent) => {
      if (pending.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const preventLinkLoss = (event: MouseEvent) => {
      if (pending.current && event.target instanceof Element && event.target.closest("a[href]")) {
        event.preventDefault();
        event.stopPropagation();
        setError("未保存の入力があります。先に保存を再試行してください。");
      }
    };
    window.addEventListener("beforeunload", preventLoss);
    document.addEventListener("click", preventLinkLoss, true);
    return () => {
      window.removeEventListener("beforeunload", preventLoss);
      document.removeEventListener("click", preventLinkLoss, true);
    };
  }, []);
  const update = (next: ControlsState, message = "") => {
    // Keep the entered values visible on quota/privacy failures, but do not claim a save.
    setNotice("");
    try {
      window.sessionStorage.setItem(controlsKey, JSON.stringify(next));
      setState(next);
      pending.current = null;
      setSaveFailed(false);
      setError("");
      setNotice(message);
      return true;
    } catch {
      pending.current = next;
      setSaveFailed(true);
      setState({
        ...next,
        provisional: false,
        confirmedCount: null,
        history: state?.history ?? [],
      });
      setError(
        "一時保存できませんでした。入力はこの画面に残っています。保存を再試行してください。",
      );
      return false;
    }
  };
  const go = (id: string) => {
    if (state && update(pending.current ?? state)) window.location.assign(route(id));
  };
  const savedMessage = "このタブ内に一時保存しました。実際の業務データは変更していません。";
  let content: ReactNode = null;
  let action: ReactNode = null;
  if (screenId === "photo-01" || screenId === "photo-07")
    return (
      <div className={local.flow}>
        <PhotoReview processed={screenId === "photo-07"} />
      </div>
    );
  if (!state)
    return (
      <div className={local.flow}>
        <p role={error ? "alert" : "status"}>{error || "読み込み中…"}</p>
        {error ? (
          <button type="button" onClick={load}>
            読み込みを再試行
          </button>
        ) : null}
      </div>
    );
  switch (screenId) {
    case "39": {
      const labels = ["見つからない", "別の棚にある", "予定外の商品"];
      content = (
        <>
          <label className={styles.filterBarSingle}>
            今日の担当
            <select
              aria-label="今日の担当"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
            >
              <option value="all">すべて</option>
              <option value="self">本人</option>
            </select>
          </label>
          <p className={styles.boardInstruction}>確認する内容</p>
          <div className={styles.mismatchList}>
            {labels.map((label, i) => (
              <button
                type="button"
                key={label}
                className={`${styles.exceptionCard} ${local.selectCard}`}
                aria-pressed={category === i}
                onClick={() => {
                  setCategory(i);
                  setCategoryOpen(false);
                }}
              >
                <span className={styles.exceptionIcon}>{["⌕", "▥", "□"][i]}</span>
                <strong>{label}</strong>
                <b>{(assignee === "all" ? [3, 2, 1] : [1, 1, 0])[i]}件（例）</b>
              </button>
            ))}
          </div>
          <p>選択中：{labels[category]}</p>
          {categoryOpen ? (
            <div className={local.card}>
              <strong>{labels[category]}の商品（架空例）</strong>
              <p>
                {category === 1
                  ? "確認番号 SAMPLE-02：予定の棚 A-01、見つかった棚 B-02。棚の表示と商品番号を比べてください。"
                  : "確認番号 SAMPLE-03：予定一覧にない商品の例です。商品番号と予定一覧を照合してください。"}
              </p>
              <button
                type="button"
                onClick={() =>
                  update(
                    recordReview(state, "在庫差異の確認練習", `${labels[category]}の見本を確認`),
                    savedMessage,
                  )
                }
              >
                この見本を確認した
              </button>
              <p>実際の棚・在庫は変更しません。</p>
            </div>
          ) : null}
        </>
      );
      action = (
        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => (category === 0 ? go("40") : setCategoryOpen(true))}
        >
          この商品を確認
        </button>
      );
      break;
    }
    case "40":
      content = (
        <>
          <p className={styles.instruction}>仮状態にする前に確認してください</p>
          <div className={styles.exceptionCheckCard}>
            {["商品を再確認", "棚を再確認", "写真を確認"].map((label, i) => (
              <Check
                key={label}
                label={label}
                checked={state.missingChecks[i]!}
                onChange={() =>
                  update({
                    ...state,
                    provisional: false,
                    missingChecks: state.missingChecks.map((v, j) => (i === j ? !v : v)),
                  })
                }
              />
            ))}
            <Field
              label="理由"
              value={state.reason}
              onChange={(reason) => update({ ...state, reason, provisional: false })}
            />
          </div>
          <div className={styles.longPressPanel}>
            <h2>確認後、下のボタンを3秒押してください</h2>
            <p>途中で離すと中止します。キーボードではEnterまたはスペースを3秒押します。</p>
          </div>
          {!canMarkMissing(state) ? <p>3項目の確認と理由の入力が必要です。</p> : null}
          {state.provisional ? (
            <p className={local.success}>確認用の仮状態を記録済みです。</p>
          ) : null}
        </>
      );
      action = (
        <HoldToConfirm
          key={`${state.missingChecks.join()}-${state.reason}`}
          disabled={!canMarkMissing(state) || state.provisional || !!error}
          onConfirm={() =>
            update(
              recordReview(
                { ...state, provisional: true },
                "見つからない商品",
                "確認用の仮状態を記録",
              ),
              savedMessage,
            )
          }
        />
      );
      break;
    case "44":
      content = (
        <>
          <p className={styles.boardInstruction}>会計の設定を入力してください</p>
          <div className={styles.accountList}>
            {["申告の設定", "消費税", "会計年度"].map((label, i) => (
              <details key={label} className={local.settingDetails}>
                <summary className={styles.settingCard}>
                  <span className={styles.settingIcon}>▤</span>
                  <div>
                    <strong>{label}</strong>
                    <small>
                      {
                        [
                          "申告区分や提出方法などの設定を確認してください。",
                          "税区分などの設定を本人が確認してください。",
                          "会計年度の開始日と終了日を設定してください。",
                        ][i]
                      }
                    </small>
                  </div>
                  <span className={styles.settingStatus}>
                    {i === 2
                      ? state.settings[2] && state.settings[3]
                        ? "入力済み"
                        : "未設定"
                      : state.settings[i]
                        ? "入力済み"
                        : "未設定"}
                  </span>
                  <span className={styles.settingChevron}>›</span>
                  <span className={styles.settingHelp} aria-hidden="true">
                    ?
                  </span>
                </summary>
                {i < 2 ? (
                  <Field
                    label={label}
                    value={state.settings[i]!}
                    onChange={(value) =>
                      update({
                        ...state,
                        preflight: [false, false],
                        settings: state.settings.map((v, j) => (i === j ? value : v)),
                      })
                    }
                  />
                ) : (
                  ["開始日", "終了日"].map((name, j) => (
                    <Field
                      key={name}
                      label={name}
                      type="date"
                      value={state.settings[j + 2]!}
                      onChange={(value) =>
                        update({
                          ...state,
                          preflight: [false, false],
                          settings: state.settings.map((v, k) => (k === j + 2 ? value : v)),
                        })
                      }
                    />
                  ))
                )}
              </details>
            ))}
          </div>
          <Help label="設定">
            確認用の仮入力です。申告区分・税区分の正しさを判定したり、申告を実行したりしません。会計年度は開始日から終了日の順に入力してください。
          </Help>
        </>
      );
      action = (
        <button
          type="button"
          className={styles.primaryButton}
          disabled={!settingsReady(state)}
          onClick={() => go("45")}
        >
          内容を確認して保存
        </button>
      );
      break;
    case "45":
      content = (
        <>
          <p className={styles.boardInstruction}>確認する項目を選んでください</p>
          <div className={styles.accountCandidateRows}>
            {candidateLabels.map((label, i) => (
              <Check
                key={label}
                label={label}
                detail={`${label}に関する取引の候補です。`}
                checked={state.candidates[i]!}
                onChange={() =>
                  update({
                    ...state,
                    preflight: [false, false],
                    candidates: state.candidates.map((v, j) => (i === j ? !v : v)),
                  })
                }
              />
            ))}
          </div>
          <p className={styles.infoBanner}>
            候補を選ぶ操作の確認です。実際の取引や仕訳は確定しません。
          </p>
        </>
      );
      action = (
        <button
          type="button"
          className={styles.primaryButton}
          disabled={!state.candidates.some(Boolean)}
          onClick={() => go("46")}
        >
          確認した項目を保存
        </button>
      );
      break;
    case "46":
      content = (
        <>
          <p className={styles.instruction}>作成前に内容を確認してください</p>
          <div className={styles.preflightRowsApproved}>
            <a className={local.check} href={route("44")}>
              設定{" "}
              <strong>{settingsReady(state) ? "入力済み" : "未設定：設定画面で入力"}　›</strong>
            </a>
            <a className={local.check} href={route("45")}>
              項目 <strong>{state.candidates.filter(Boolean).length}件 選択　›</strong>
            </a>
            {["資料（このファイルが架空例であることを確認）", "重複（見本の選択項目を確認）"].map(
              (label, i) => (
                <Check
                  key={label}
                  label={label}
                  checked={state.preflight[i]!}
                  onChange={() =>
                    update({
                      ...state,
                      preflight: state.preflight.map((v, j) => (i === j ? !v : v)),
                    })
                  }
                />
              ),
            )}
          </div>
          <div className={styles.infoBanner}>
            {canPreviewFile(state) ? "見本ファイルを確認できます" : "未確認の項目があります"}
            。実際の資料・重複の自動検査は行っていません。
          </div>
          <Help label="作成前の確認">
            このファイルは操作確認用です。会計ソフトへ取り込まないでください。
          </Help>
        </>
      );
      action = (
        <button
          type="button"
          className={styles.primaryButton}
          disabled={!canPreviewFile(state)}
          onClick={() => go("47")}
        >
          ファイル内容を確認
        </button>
      );
      break;
    case "47":
      content = (
        <>
          <p className={styles.instruction}>操作確認用の見本です。会計ソフトへ取込禁止。</p>
          {canPreviewFile(state) ? (
            <pre className={local.csv}>{reviewCsv(state)}</pre>
          ) : (
            <a href={route("46")}>設定と確認を完了してください</a>
          )}
          <p>選択した項目だけを書き出します。金額は架空の0円です。</p>
          <a href={route("48")}>手動取込の記録を試す　›</a>
        </>
      );
      action = (
        <button
          type="button"
          className={styles.primaryButton}
          disabled={!canPreviewFile(state) || saveFailed}
          onClick={() => {
            if (pending.current) {
              setError("先に保存を再試行してください。ファイルはまだダウンロードしていません。");
              return;
            }
            setActionError("");
            try {
              const blob = new Blob([reviewCsv(state)], { type: "text/csv;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              const anchor = document.createElement("a");
              anchor.href = url;
              anchor.download = "操作確認用-取込禁止.csv";
              document.body.appendChild(anchor);
              anchor.click();
              anchor.remove();
              setTimeout(() => URL.revokeObjectURL(url), 60000);
              update(
                recordReview(
                  state,
                  "見本ファイル",
                  `ダウンロードを開始・${state.candidates.filter(Boolean).length}件（取込禁止）`,
                ),
                "ダウンロードを開始しました。保存先はブラウザーで確認してください。",
              );
            } catch {
              setActionError("ファイルを作成できませんでした。もう一度お試しください。");
            }
          }}
        >
          見本CSVをダウンロード
        </button>
      );
      break;
    case "48":
      content = (
        <>
          <p className={styles.boardInstruction}>取込結果の記録を試します（架空例）</p>
          {["取込できた（操作練習）", "一部できなかった（操作練習）", "取込していない"].map(
            (label) => (
              <button
                key={label}
                type="button"
                className={local.selectCard}
                aria-pressed={importResult === label}
                onClick={() => setImportResult(label)}
              >
                {label}
              </button>
            ),
          )}
          <Field label="メモ（任意）" value={importMemo} onChange={setImportMemo} />
          <p>実際の会計ソフトへの取込は行いません。</p>
        </>
      );
      action = (
        <button
          type="button"
          className={styles.primaryButton}
          disabled={!importResult}
          onClick={() => {
            if (
              update(
                recordReview(
                  state,
                  "取込結果の操作練習",
                  `${importResult} ${importMemo}`.slice(0, 500),
                ),
                savedMessage,
              )
            )
              window.location.assign(route("49"));
          }}
        >
          確認用の結果を記録
        </button>
      );
      break;
    case "49":
      content = (
        <>
          <p className={styles.boardInstruction}>このタブで行った確認用の操作履歴</p>
          {!state.history.length ? (
            <p className={styles.infoBanner}>
              履歴はまだありません。過去の架空の成功履歴は表示しません。
            </p>
          ) : (
            state.history.map((entry, i) => (
              <details key={`${entry.at}-${i}`} className={local.card}>
                <summary>
                  <span>
                    {new Date(entry.at).toLocaleString("ja-JP")}
                    <br />
                    <strong>{entry.kind}</strong>
                  </span>
                  <b>詳細　›</b>
                </summary>
                <p>{entry.detail}</p>
                <p>確認用です。実際の会計・在庫・価格は変更していません。</p>
              </details>
            ))
          )}
        </>
      );
      action = (
        <a className={styles.primaryButton} href={route("44")}>
          会計の設定を確認する
        </a>
      );
      break;
    case "box-02":
      content = (
        <>
          <div className={styles.counterHero}>
            <span>箱の中を数える（確認用）</span>
            <strong aria-live="polite">{state.count}点</strong>
          </div>
          <div className={styles.counterButtons}>
            <button
              type="button"
              disabled={state.count >= 9999}
              onClick={() => update(changeCount(state, 1))}
            >
              ＋1点
            </button>
            <button
              type="button"
              disabled={state.count === 0}
              onClick={() => update(changeCount(state, -1))}
            >
              1点戻す
            </button>
          </div>
          <p className={styles.infoBanner}>
            確認用の数をこのタブに一時保存します。実際の仕入れ・在庫への登録は未対応です。
          </p>
          {state.confirmedCount !== null ? (
            <p className={local.success}>{state.confirmedCount}点で確認済み</p>
          ) : null}
        </>
      );
      action = (
        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => update({ ...state, confirmedCount: state.count }, savedMessage)}
        >
          {state.count}点で確定
        </button>
      );
      break;
    case "sales-06": {
      const url = officialProductUrl(official);
      const copyText =
        "【操作確認用の架空例】価格候補: ¥6,120\n見込み粗利: ¥1,320\n理由: 下限より¥220上\n実商品の価格は変更していません。";
      content = (
        <>
          <div className={styles.salesManualSummary}>
            {[
              ["候補（架空例）", "¥6,120"],
              ["見込み粗利（架空例）", "¥1,320"],
              ["下限より", "¥220上"],
            ].map(([label, value]) => (
              <div className={styles.dataRow} key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <div className={local.card}>
            <Field label="公式の商品URL" value={official} type="url" onChange={setOfficial} />
            {url ? (
              <a
                className={styles.salesManualAction}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span>↗</span>
                <strong>公式の商品画面を開く</strong>
                <small>本人が公式画面で操作します</small>
                <b>›</b>
              </a>
            ) : (
              <p>
                https://jp.mercari.com/item/m…
                の商品URLを入力すると開けます。価格機能へ直接移動することはできません。
              </p>
            )}
          </div>
          <button
            type="button"
            className={styles.salesManualAction}
            onClick={() => {
              setNotice("");
              setActionError("");
              void (async () => {
                try {
                  if (!navigator.clipboard?.writeText) throw new Error("unavailable");
                  await navigator.clipboard.writeText(copyText);
                  setActionError("");
                  setNotice("変更内容をコピーしました。実際の価格は変更していません。");
                } catch {
                  setActionError(
                    "コピーできませんでした。下の文章を長押ししてコピーしてください。",
                  );
                }
              })();
            }}
          >
            <span>▤</span>
            <strong>変更内容をコピー</strong>
            <small>確認用の候補をコピーします</small>
            <b>›</b>
          </button>
          <details className={local.help}>
            <summary>コピーする文章を表示</summary>
            <textarea readOnly aria-label="コピーする文章" value={copyText} />
          </details>
          <label className={local.file}>
            本人が操作した結果
            <select
              aria-label="本人が操作した結果"
              value={salesResult}
              onChange={(e) => setSalesResult(e.target.value)}
            >
              <option value="">選んでください</option>
              <option>まだ変更していない</option>
              <option>公式画面で本人が確認した（確認用記録）</option>
            </select>
          </label>
          <p className={styles.infoBanner}>
            このアプリは自動値下げしません。結果の自動取得や実商品への反映も行いません。
          </p>
        </>
      );
      action = (
        <button
          type="button"
          className={styles.primaryButton}
          disabled={!salesResult}
          onClick={() =>
            update(recordReview(state, "価格確認の操作練習", salesResult), savedMessage)
          }
        >
          確認用の結果を記録
        </button>
      );
      break;
    }
  }
  return (
    <div className={local.flow}>
      <p className={local.note}>
        操作確認版・架空データ。入力はこのタブ内に一時保存します。実商品・個人情報は入力しないでください。外部への自動送信・実業務への反映はありません。
      </p>
      <section className={styles.contentStack}>{content}</section>
      {error ? (
        <div className={local.error} role="alert">
          {error}
          {saveFailed ? (
            <button type="button" onClick={() => update(pending.current ?? state, savedMessage)}>
              保存を再試行
            </button>
          ) : null}
        </div>
      ) : null}
      {actionError ? (
        <p className={local.error} role="alert">
          {actionError}
        </p>
      ) : null}
      {notice ? (
        <p className={local.success} role="status">
          {notice}
        </p>
      ) : null}
      <div className={`${styles.actionBar} ${local.actions}`}>
        {action}
        <a className={styles.secondaryAction} href={route("05")}>
          作業一覧へ戻る　›
        </a>
      </div>
    </div>
  );
}
