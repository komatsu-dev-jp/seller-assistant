"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  comparisonsSummary,
  confirmBox,
  createBox,
  itemProfit,
  itemRegistrationProblems,
  money,
  readIntake,
  safeReferenceUrl,
  writeIntake,
  type IntakeBox,
  type IntakeItem,
  type IntakeState,
  type SoldComparison,
} from "./box-intake-store";
import { controlsKey, parseControls } from "./review-controls-state";
import { reviewPath } from "./review-path";
import { acquireIntakeEditor, type IntakeEditorLease } from "./box-intake-write-lease";
import ui from "./box-intake-flow.module.css";

type Step = "count" | "item" | "profit" | "list";
const basePath = process.env.NEXT_PUBLIC_REVIEW_BASE_PATH ?? "";
const entry = reviewPath("/mobile/screens/box-02/", basePath);
export const isBoxIntakeScreen = (id: string) =>
  ["box-01", "box-02", "box-03", "box-04", "box-05"].includes(id);
const yen = (value: number) => `${value.toLocaleString("ja-JP")}円`;
const inspectionLabels = {
  unchecked: "未確認",
  sellable: "販売できる",
  hold: "あとで確認",
  unsellable: "販売できない",
};
function errorMessage(cause: unknown) {
  return cause instanceof Error && !/JSON|Unexpected|denied|Security|quota/iu.test(cause.message)
    ? cause.message
    : "保存できません。端末の空き容量と保存設定を確認してください。入力はこの画面に残っています。";
}
function Field({
  label,
  value,
  onChange,
  numeric = false,
  placeholder,
  maxLength = 100,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  numeric?: boolean;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <label className={ui.field}>
      <span>{label}</span>
      <input
        value={value}
        aria-label={label}
        inputMode={numeric ? "decimal" : "text"}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
function Action({
  children,
  onClick,
  secondary = false,
  disabled = false,
}: {
  children: ReactNode;
  onClick: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={secondary ? ui.secondary : ui.primary}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
function downloadState(state: IntakeState) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `seller-assistant-boxes-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function BoxIntakeFlow({ screenId }: { screenId: string }) {
  const [state, setState] = useState<IntakeState | null>(null);
  const current = useRef<IntakeState | null>(null);
  const expected = useRef<string | null>(null);
  const pending = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [step, setStep] = useState<Step>("count");
  const [index, setIndex] = useState(0);
  const [visibleItems, setVisibleItems] = useState(30);
  const [legacyNotice, setLegacyNotice] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const editorLease = useRef<IntakeEditorLease | null>(null);

  function load() {
    if (editorLease.current?.canWrite()) {
      restore();
      return;
    }
    editorLease.current?.close();
    editorLease.current = acquireIntakeEditor(navigator.locks, restore, setError);
  }
  function restore() {
    try {
      const loaded = readIntake(window.localStorage);
      let next = loaded.state;
      if (!next.boxes.length) {
        const box = createBox(crypto.randomUUID(), "届いた箱");
        try {
          const legacy = parseControls(window.sessionStorage.getItem(controlsKey));
          if (legacy.count > 0) {
            box.count = legacy.count;
            setLegacyNotice(
              `以前に数えた${legacy.count}点を引き継ぎました。点数を確認してから次へ進んでください。`,
            );
          }
        } catch {
          setLegacyNotice("以前の点数を読み込めませんでした。箱の点数を確認して入力してください。");
        }
        next = { ...next, boxes: [box], activeBoxId: box.id };
      }
      current.current = next;
      expected.current = loaded.raw;
      pending.current = false;
      setDirty(false);
      setError("");
      setState(next);
      const active = next.boxes.find((box) => box.id === next.activeBoxId)!;
      const params = new URLSearchParams(window.location.search);
      const queryBox = next.boxes.find((box) => box.id === params.get("box"));
      const selected = queryBox ?? active;
      if (queryBox) {
        next = { ...next, activeBoxId: queryBox.id };
        current.current = next;
        setState(next);
      }
      const requested = params.get("step");
      const requestedIndex = Number(params.get("item") ?? "0");
      setIndex(
        Number.isInteger(requestedIndex) &&
          requestedIndex >= 0 &&
          requestedIndex < selected.items.length
          ? requestedIndex
          : 0,
      );
      setStep(
        !selected.confirmed
          ? "count"
          : requested === "item" ||
              requested === "profit" ||
              requested === "list" ||
              requested === "count"
            ? requested
            : screenId === "box-03"
              ? "item"
              : "list",
      );
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }
  useEffect(() => {
    load();
    const preventLoss = (event: BeforeUnloadEvent) => {
      if (pending.current) event.preventDefault();
    };
    const preventLinkLoss = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (pending.current && anchor && !anchor.hasAttribute("download")) {
        event.preventDefault();
        event.stopPropagation();
        setError("未保存の入力があります。先に保存を再試行するか、入力の控えを保存してください。");
      }
    };
    window.addEventListener("beforeunload", preventLoss);
    document.addEventListener("click", preventLinkLoss, true);
    return () => {
      editorLease.current?.close();
      editorLease.current = null;
      window.removeEventListener("beforeunload", preventLoss);
      document.removeEventListener("click", preventLinkLoss, true);
    };
    // A screen starts from the persisted box once. Subsequent input must never reload over a draft.
  }, []);

  function persist(next: IntakeState, keepDraftOnFailure = true): boolean {
    if (!editorLease.current?.canWrite()) {
      setError("このタブでは編集できません。画面を再読み込みしてから続けてください。");
      return false;
    }
    if (keepDraftOnFailure) {
      current.current = next;
      setState(next);
    }
    try {
      expected.current = writeIntake(window.localStorage, next, expected.current);
      current.current = next;
      setState(next);
      pending.current = false;
      setDirty(false);
      setError("");
      setNotice("このブラウザーに保存しました");
      return true;
    } catch (cause) {
      pending.current = true;
      setDirty(true);
      setNotice("");
      setError(errorMessage(cause));
      return false;
    }
  }
  function updateBox(patch: Partial<IntakeBox>): boolean {
    const latest = current.current;
    if (!latest) return false;
    return persist({
      ...latest,
      boxes: latest.boxes.map((box) =>
        box.id === latest.activeBoxId ? { ...box, ...patch } : box,
      ),
    });
  }
  function updateItem(patch: Partial<IntakeItem>): boolean {
    const box = current.current?.boxes.find(
      (candidate) => candidate.id === current.current?.activeBoxId,
    );
    if (!box || !box.items[index]) return false;
    return updateBox({
      items: box.items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    });
  }
  function navigate(nextStep: Step, nextIndex = index, replacement?: IntakeState): boolean {
    const latest = replacement ?? current.current;
    if (!latest || !persist(latest, !replacement)) return false;
    setStep(nextStep);
    setIndex(nextIndex);
    setVisibleItems(30);
    const params = new URLSearchParams({
      box: latest.activeBoxId!,
      step: nextStep,
      item: String(nextIndex),
    });
    window.history.replaceState(null, "", `${entry}?${params}`);
    requestAnimationFrame(() => {
      heading.current?.focus();
      heading.current?.scrollIntoView({ block: "start", behavior: "auto" });
    });
    return true;
  }
  function finishCount() {
    const box = current.current?.boxes.find(
      (candidate) => candidate.id === current.current?.activeBoxId,
    );
    if (!box) return;
    try {
      const next = confirmBox(box);
      if (updateBox(next))
        navigate(
          "item",
          Math.max(
            0,
            next.items.findIndex((item) => !item.registered),
          ),
        );
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }
  function changeCount(count: number) {
    const box = current.current?.boxes.find(
      (candidate) => candidate.id === current.current?.activeBoxId,
    );
    if (!box || !Number.isInteger(count) || count < 0 || count > 9999) return;
    try {
      // Confirmed boxes always keep a matching item list. Never save a half-resized box.
      const next = box.confirmed ? confirmBox({ ...box, count }) : { ...box, count };
      if (updateBox(next)) setIndex((previous) => Math.min(previous, Math.max(0, count - 1)));
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }
  function register(nextStep: "item" | "profit" | "list") {
    const box = current.current?.boxes.find(
      (candidate) => candidate.id === current.current?.activeBoxId,
    );
    const item = box?.items[index];
    if (!box || !item) return;
    const problems = itemRegistrationProblems(item);
    if (problems.length) {
      setError(problems.join(" "));
      return;
    }
    if (!updateItem({ registered: true })) return;
    if (nextStep === "item")
      navigate(
        index + 1 < box.items.length ? "item" : "list",
        Math.min(index + 1, box.items.length - 1),
      );
    else navigate(nextStep);
  }
  function newBox() {
    const latest = current.current;
    if (!latest || latest.boxes.length >= 100 || !persist(latest)) return;
    const box = createBox(crypto.randomUUID(), `届いた箱 ${latest.boxes.length + 1}`);
    if (navigate("count", 0, { ...latest, boxes: [...latest.boxes, box], activeBoxId: box.id })) {
      setLegacyNotice("");
    }
  }
  const feedback = (
    <>
      {error ? (
        <div className={ui.error} role="alert">
          <p>{error}</p>
          {state ? (
            <div className={ui.actions}>
              {dirty ? (
                <Action onClick={() => current.current && persist(current.current)}>
                  保存を再試行
                </Action>
              ) : null}
              <Action secondary onClick={() => current.current && downloadState(current.current)}>
                入力の控えを保存
              </Action>
              {dirty ? (
                <Action
                  secondary
                  onClick={() => {
                    if (
                      window.confirm(
                        "今の未保存入力を破棄して、最後に保存された内容を読み直しますか？必要なら先に控えを保存してください。",
                      )
                    )
                      load();
                  }}
                >
                  保存済みを読み直す
                </Action>
              ) : null}
            </div>
          ) : (
            <Action onClick={load}>読み込みを再試行</Action>
          )}
        </div>
      ) : null}
      <p role="status" className={ui.saveStatus}>
        {dirty ? "未保存の入力があります" : notice}
      </p>
    </>
  );
  if (!state)
    return (
      <section className={ui.flow}>
        {feedback}
        {!error ? <p>箱を読み込んでいます…</p> : null}
      </section>
    );
  const box = state.boxes.find((candidate) => candidate.id === state.activeBoxId)!;
  const item = box.items[index];
  const registered = box.items.filter((product) => product.registered).length;
  const profits = box.items.map((_, i) => itemProfit(box, i));
  const calculated = profits.filter((result) => result !== null).length;
  const headingText =
    step === "count"
      ? "箱の中を数える"
      : step === "item"
        ? `${index + 1}点目を検品・登録`
        : step === "profit"
          ? "売れた価格から利益を確認"
          : "箱の商品を確認";
  const boxCosts = (
    <div className={ui.fields}>
      <Field
        label="箱の仕入れ代（円）"
        value={box.purchaseYen}
        numeric
        maxLength={12}
        placeholder="例：10000"
        onChange={(value) => updateBox({ purchaseYen: value })}
      />
      <Field
        label="箱を受け取る送料（円）"
        value={box.inboundShippingYen}
        numeric
        maxLength={12}
        onChange={(value) => updateBox({ inboundShippingYen: value })}
      />
    </div>
  );
  const result = item ? itemProfit(box, index) : null;
  const summary = item ? comparisonsSummary(item) : null;
  function updateComparison(id: string, patch: Partial<SoldComparison>) {
    if (!item) return;
    updateItem({
      comparisons: item.comparisons.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    });
  }

  return (
    <section className={ui.flow}>
      <div className={ui.topline}>
        <span>箱の検品と見込み利益</span>
        <span>
          {registered} / {box.count}点 登録
        </span>
      </div>
      <h2 ref={heading} tabIndex={-1} className={ui.heading}>
        {headingText}
      </h2>
      <p className={ui.subheading}>{box.name || "名前をつけていない箱"}</p>
      <nav className={ui.steps} aria-label="箱の作業">
        {(
          [
            ["count", "1 点数"],
            ["item", "2 検品・登録"],
            ["list", "3 商品一覧"],
          ] as const
        ).map(([name, label]) => (
          <button
            key={name}
            type="button"
            aria-current={step === name ? "step" : undefined}
            disabled={!box.confirmed && name !== "count"}
            onClick={() => navigate(name, index)}
          >
            {label}
          </button>
        ))}
      </nav>
      {feedback}

      {step === "count" ? (
        <>
          <div className={ui.card}>
            <Field
              label="箱の名前・番号"
              value={box.name}
              maxLength={100}
              placeholder="例：10月3日 卸A 1箱目"
              onChange={(value) => updateBox({ name: value })}
            />
            {boxCosts}
            <p className={ui.hint}>
              箱の仕入れ代と送料を、中の全点に均等に割り振ります。金額は後から入力・修正できます。
            </p>
          </div>
          {legacyNotice ? <p className={ui.hint}>{legacyNotice}</p> : null}
          <div className={ui.countCard}>
            <label className={ui.counterLabel}>
              入っている点数
              <input
                aria-label="入っている点数"
                inputMode="numeric"
                type="number"
                min={box.confirmed ? 1 : 0}
                max="9999"
                value={box.count}
                onChange={(event) => {
                  const count = event.target.value === "" ? 0 : Number(event.target.value);
                  changeCount(count);
                }}
              />
            </label>
            <div className={ui.counterButtons}>
              <Action
                secondary
                disabled={box.count <= (box.confirmed ? 1 : 0)}
                onClick={() => changeCount(box.count - 1)}
              >
                −1点
              </Action>
              <Action disabled={box.count >= 9999} onClick={() => changeCount(box.count + 1)}>
                ＋1点
              </Action>
            </div>
          </div>
          <Action disabled={box.count <= 0} onClick={finishCount}>
            {box.count > 0 ? `${box.count}点で確定して検品へ` : "1点以上を数えてください"}
          </Action>
          {box.items.length ? (
            <p className={ui.hint}>入力済みの商品を消すような点数の変更はできません。</p>
          ) : null}
        </>
      ) : null}

      {step === "item" && item ? (
        <>
          <p className={ui.hint}>
            まず名前と状態だけ。ブランド・サイズが分からなければ、空欄のまま次へ進めます。
          </p>
          <div className={ui.card}>
            <Field
              label="商品名・種類（必須）"
              value={item.name}
              placeholder="例：紺のシャツ"
              onChange={(value) => updateItem({ name: value, registered: false })}
            />
            <div className={ui.fields}>
              <Field
                label="ブランド（任意）"
                value={item.brand}
                maxLength={100}
                onChange={(value) => updateItem({ brand: value })}
              />
              <Field
                label="サイズ（任意）"
                value={item.size}
                maxLength={50}
                placeholder="例：M"
                onChange={(value) => updateItem({ size: value })}
              />
            </div>
            <label className={ui.field}>
              <span>商品の状態</span>
              <select
                aria-label="商品の状態"
                value={item.condition}
                onChange={(event) =>
                  updateItem({ condition: event.target.value, registered: false })
                }
              >
                <option value="">選んでください</option>
                {["新品・未使用", "使用感が少ない", "一般的な中古品", "傷・汚れがある"].map(
                  (label) => (
                    <option key={label}>{label}</option>
                  ),
                )}
              </select>
            </label>
            <fieldset className={ui.options}>
              <legend>検品結果（必須）</legend>
              {(["sellable", "hold", "unsellable"] as const).map((value) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="inspection"
                    value={value}
                    checked={item.inspection === value}
                    onChange={() => updateItem({ inspection: value, registered: false })}
                  />
                  {inspectionLabels[value]}
                </label>
              ))}
            </fieldset>
            <label className={ui.field}>
              <span>傷・汚れ・気になる点（任意）</span>
              <textarea
                aria-label="気になる点"
                maxLength={500}
                rows={2}
                value={item.memo}
                onChange={(event) => updateItem({ memo: event.target.value })}
              />
            </label>
          </div>
          <div className={ui.actions}>
            <Action onClick={() => register("item")}>
              {index + 1 < box.count ? `保存して${index + 2}点目へ` : "保存して箱の一覧へ"}
            </Action>
            <Action secondary onClick={() => register("profit")}>
              この商品の見込み利益を確認
            </Action>
            <Action secondary onClick={() => navigate("list")}>
              途中のまま一覧へ戻る
            </Action>
          </div>
        </>
      ) : null}

      {step === "profit" && item && summary ? (
        <>
          <div className={ui.itemHeading}>
            <strong>{item.name || `${index + 1}点目`}</strong>
            <button type="button" onClick={() => navigate("item")}>
              商品情報を直す
            </button>
          </div>
          {!item.registered ? (
            <p className={ui.warning}>検品・商品登録を完了すると、見込み粗利を計算できます。</p>
          ) : null}
          {item.inspection === "hold" || item.inspection === "unchecked" ? (
            <p className={ui.warning}>
              検品結果が「あとで確認」または未確認です。販売できるか確認してから価格を決めてください。
            </p>
          ) : null}
          {item.inspection === "unsellable" ? (
            <p className={ui.warning}>
              販売できない商品は、売上を0円として、この商品に割り振った仕入れ代を差し引きます。
            </p>
          ) : (
            <>
              <div className={ui.card}>
                <h3>似た商品の「売れた価格」を記録</h3>
                <a
                  className={ui.external}
                  href={`https://jp.mercari.com/search?keyword=${encodeURIComponent([item.brand, item.name, item.size].filter(Boolean).join(" "))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  メルカリで類似商品を探す ↗
                </a>
                <p className={ui.hint}>
                  検索先で「売り切れ」に絞り、ブランド・種類・状態が近いものを確認してください。他の販売サイトの事例も登録できます。
                </p>
                {item.comparisons.map((row, rowIndex) => (
                  <fieldset className={ui.comparison} key={row.id}>
                    <legend>販売事例 {rowIndex + 1}</legend>
                    <Field
                      label={`事例${rowIndex + 1}のURL`}
                      value={row.url}
                      maxLength={1500}
                      placeholder="https://…"
                      onChange={(value) =>
                        updateComparison(row.id, { url: value, confirmedSold: false })
                      }
                    />
                    <Field
                      label={`事例${rowIndex + 1}の売れた価格（円）`}
                      value={row.priceYen}
                      numeric
                      maxLength={12}
                      onChange={(value) =>
                        updateComparison(row.id, { priceYen: value, confirmedSold: false })
                      }
                    />
                    <Field
                      label={`事例${rowIndex + 1}の比較メモ（任意）`}
                      value={row.note}
                      maxLength={500}
                      placeholder="例：同じブランド・同じサイズ・同程度の状態"
                      onChange={(value) => updateComparison(row.id, { note: value })}
                    />
                    <label className={ui.check}>
                      <input
                        type="checkbox"
                        checked={row.confirmedSold}
                        onChange={(event) =>
                          updateComparison(row.id, { confirmedSold: event.target.checked })
                        }
                      />
                      販売済みで、種類・状態が近いことを確認した
                    </label>
                    {row.url && !safeReferenceUrl(row.url) ? (
                      <p className={ui.warning}>httpsで始まる販売ページのURLを入力してください。</p>
                    ) : null}
                    <button
                      type="button"
                      className={ui.textButton}
                      onClick={() =>
                        updateItem({
                          comparisons: item.comparisons.filter(
                            (candidate) => candidate.id !== row.id,
                          ),
                        })
                      }
                    >
                      この事例を外す
                    </button>
                  </fieldset>
                ))}
                <Action
                  secondary
                  disabled={item.comparisons.length >= 10}
                  onClick={() =>
                    updateItem({
                      comparisons: [
                        ...item.comparisons,
                        {
                          id: crypto.randomUUID(),
                          url: "",
                          priceYen: "",
                          confirmedSold: false,
                          note: "",
                        },
                      ],
                    })
                  }
                >
                  ＋ 販売事例を追加
                </Action>
                {summary.count > 0 ? (
                  <div className={ui.candidate}>
                    <p>
                      確認済み{summary.count}件：{yen(summary.low!)}〜{yen(summary.high!)}
                    </p>
                    <Action
                      secondary
                      onClick={() => updateItem({ priceYen: String(summary.suggested) })}
                    >
                      安めの{yen(summary.suggested!)}を見込み販売価格に使う
                    </Action>
                  </div>
                ) : (
                  <p className={ui.hint}>
                    事例を1件以上確認すると、参考価格を表示します。未確認の価格や同じURLの重複は件数に含めません。
                  </p>
                )}
              </div>
              <div className={ui.card}>
                <h3>売るときの金額</h3>
                <Field
                  label="見込み販売価格（円）"
                  value={item.priceYen}
                  numeric
                  maxLength={12}
                  onChange={(value) => updateItem({ priceYen: value })}
                />
                <div className={ui.fields}>
                  <Field
                    label="販売手数料（%）"
                    value={item.feePercent}
                    numeric
                    maxLength={6}
                    onChange={(value) => updateItem({ feePercent: value })}
                  />
                  <Field
                    label="発送する送料（円）"
                    value={item.shippingYen}
                    numeric
                    maxLength={12}
                    placeholder="例：750"
                    onChange={(value) => updateItem({ shippingYen: value })}
                  />
                  <Field
                    label="梱包代（円）"
                    value={item.packingYen}
                    numeric
                    maxLength={12}
                    onChange={(value) => updateItem({ packingYen: value })}
                  />
                </div>
                <p className={ui.hint}>
                  手数料の初期値はメルカリ通常販売の10%。販売先・配送・追加費用に合わせて確認・修正してください。
                  <a
                    href="https://help.jp.mercari.com/guide/articles/65/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    手数料の案内 ↗
                  </a>
                </p>
              </div>
            </>
          )}
          <details
            className={ui.card}
            open={money(box.purchaseYen) === null || money(box.inboundShippingYen) === null}
          >
            <summary>箱の仕入れ代を確認・修正</summary>
            {boxCosts}
          </details>
          <div className={result && result.gross < 0 ? ui.loss : ui.result} aria-live="polite">
            <span>この商品の見込み粗利</span>
            <strong>{result ? yen(result.gross) : "まだ計算できません"}</strong>
            {result ? (
              <>
                <dl>
                  <dt>見込み販売価格</dt>
                  <dd>{yen(result.price)}</dd>
                  <dt>この商品の仕入れ代</dt>
                  <dd>−{yen(result.cost)}</dd>
                  <dt>販売手数料</dt>
                  <dd>−{yen(result.fee)}</dd>
                  <dt>発送送料・梱包代</dt>
                  <dd>−{yen(result.shipping + result.packing)}</dd>
                </dl>
                {result.margin !== null ? <p>見込み粗利率 {result.margin.toFixed(1)}%</p> : null}
                <p className={ui.hint}>
                  人件費・税金などは含みません。手数料は円未満を切り上げた概算です。売れることや利益を保証するものではありません。
                </p>
              </>
            ) : (
              <p>
                検品・登録、確認済みの販売事例、販売価格、箱の仕入れ代・送料、販売手数料、発送送料・梱包代を確認してください。費用がない項目には0を入力します。
              </p>
            )}
          </div>
          <div className={ui.actions}>
            <Action onClick={() => navigate("list")}>保存して箱の一覧へ</Action>
            {index + 1 < box.count ? (
              <Action
                secondary
                onClick={() =>
                  navigate(box.items[index + 1]?.registered ? "profit" : "item", index + 1)
                }
              >
                次の商品へ
              </Action>
            ) : null}
          </div>
        </>
      ) : null}

      {step === "list" ? (
        <>
          <div className={ui.stats}>
            <div>
              <span>検品・登録</span>
              <strong>
                {registered} / {box.count}点
              </strong>
            </div>
            <div>
              <span>利益を計算</span>
              <strong>
                {calculated} / {box.count}点
              </strong>
            </div>
          </div>
          {registered < box.count ? (
            <Action
              onClick={() =>
                navigate(
                  "item",
                  Math.max(
                    0,
                    box.items.findIndex((product) => !product.registered),
                  ),
                )
              }
            >
              未登録の商品を検品する
            </Action>
          ) : null}
          {box.items.slice(0, visibleItems).map((product, i) => (
            <button
              type="button"
              className={ui.productRow}
              key={product.id}
              onClick={() => navigate(product.registered ? "profit" : "item", i)}
            >
              <span className={ui.number}>{i + 1}</span>
              <span>
                <strong>{product.name || "これから登録"}</strong>
                <small>
                  {[product.brand, product.size].filter(Boolean).join(" / ") ||
                    "ブランド・サイズは任意"}
                </small>
                <small>
                  {product.registered ? inspectionLabels[product.inspection] : "検品・登録が未完了"}
                </small>
              </span>
              <span className={ui.rowResult}>
                {profits[i]
                  ? yen(profits[i].gross)
                  : product.registered
                    ? "利益を調べる ›"
                    : "登録する ›"}
              </span>
            </button>
          ))}
          {visibleItems < box.items.length ? (
            <Action secondary onClick={() => setVisibleItems(visibleItems + 30)}>
              さらに30点を表示
            </Action>
          ) : null}
          <div className={ui.result}>
            <span>箱全体の見込み粗利</span>
            <strong>
              {calculated === box.count && box.count > 0
                ? yen(profits.reduce((sum, value) => sum + (value?.gross ?? 0), 0))
                : "全点の確認後に表示"}
            </strong>
            <p>
              {calculated} / {box.count}点を計算済み。
              {calculated !== box.count
                ? "未確認の商品を0円の利益として合計しません。"
                : "販売不可と確認した商品の仕入れ代も差し引いています。"}
            </p>
          </div>
        </>
      ) : null}

      <details className={ui.card}>
        <summary>別の箱・保存について</summary>
        <p className={ui.hint}>
          入力はこの端末のこのブラウザーに保存されます。他の端末には共有されません。ブラウザーのデータを消すと失われるため、大切な記録は控えを保存してください。
        </p>
        <div className={ui.actions}>
          <Action secondary onClick={() => current.current && downloadState(current.current)}>
            箱と商品の控えを保存
          </Action>
          <Action secondary disabled={state.boxes.length >= 100} onClick={newBox}>
            別の箱を登録する
          </Action>
        </div>
        <div className={ui.boxes}>
          {state.boxes.map((savedBox) => (
            <button
              type="button"
              key={savedBox.id}
              aria-current={savedBox.id === box.id ? "true" : undefined}
              onClick={() => {
                const latest = current.current!;
                navigate(savedBox.confirmed ? "list" : "count", 0, {
                  ...latest,
                  activeBoxId: savedBox.id,
                });
              }}
            >
              {savedBox.name || "名前のない箱"} · {savedBox.count}点
            </button>
          ))}
        </div>
      </details>
    </section>
  );
}

export function IntakeProductList() {
  const [state, setState] = useState<IntakeState | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    try {
      setState(readIntake(window.localStorage).state);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }, []);
  return (
    <section className={ui.flow} aria-label="届いた箱の商品">
      <h2 className={ui.heading}>届いた箱から登録した商品</h2>
      <a className={ui.external} href={entry}>
        箱の点数・検品を進める ›
      </a>
      {error ? (
        <p role="alert" className={ui.error}>
          {error}
        </p>
      ) : null}
      {state?.boxes.map((box) => (
        <div key={box.id} className={ui.card}>
          <h3>{box.name || "名前のない箱"}</h3>
          <p>
            {box.items.filter((item) => item.registered).length} / {box.count}点 登録
          </p>
          <a className={ui.external} href={`${entry}?box=${encodeURIComponent(box.id)}&step=list`}>
            この箱の商品一覧・見込み利益へ ›
          </a>
        </div>
      ))}
      {state && !state.boxes.length ? (
        <p className={ui.hint}>
          まだ箱は登録されていません。箱の点数を数えるところから始められます。
        </p>
      ) : null}
    </section>
  );
}
