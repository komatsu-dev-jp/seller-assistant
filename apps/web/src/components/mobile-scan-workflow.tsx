"use client";

import { useMemo, useState } from "react";

import { createPendingPutaway, savePutawayOnlineFirst } from "../lib/offline-outbox";

type Step = "inventory" | "location" | "confirm" | "saved";

const inventoryPattern = /^INV-[0-9]{6}$/u;
const locationPattern = /^[A-Z]{2,4}-[0-9]{3,6}-[0-9]$/u;

export function MobileScanWorkflow() {
  const [step, setStep] = useState<Step>("inventory");
  const [value, setValue] = useState("");
  const [inventoryNumber, setInventoryNumber] = useState<string | null>(null);
  const [locationCode, setLocationCode] = useState<string | null>(null);
  const [inventoryScannedAt, setInventoryScannedAt] = useState<string | null>(null);
  const [locationScannedAt, setLocationScannedAt] = useState<string | null>(null);
  const [saveMode, setSaveMode] = useState<"synced" | "queued" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const title = useMemo(() => {
    if (step === "inventory") return "商品ラベルを確認";
    if (step === "location") return "場所ラベルを確認";
    if (step === "confirm") return "現物を人が確認";
    return "同期待ちに保存";
  }, [step]);

  function acceptValue() {
    const normalized = value.trim().toUpperCase();
    if (normalized.length > 256 || /address|token|secret/iu.test(normalized)) {
      setError("ラベルに保存できない情報が含まれています。");
      return;
    }
    if (step === "inventory" && !inventoryPattern.test(normalized)) {
      setError("在庫番号は INV-000001 の形式で入力してください。");
      return;
    }
    if (step === "location" && !locationPattern.test(normalized)) {
      setError("場所コードは BX-014-3 のようなチェック値付き形式です。");
      return;
    }
    if (step === "inventory") {
      setInventoryNumber(normalized);
      setInventoryScannedAt(new Date().toISOString());
      setLocationCode(null);
      setLocationScannedAt(null);
      setStep("location");
    } else {
      setLocationCode(normalized);
      setLocationScannedAt(new Date().toISOString());
      setStep("confirm");
    }
    setValue("");
    setError(null);
  }

  if (step === "saved") {
    return (
      <main className="mobileScanPage successScreen">
        <div className="successIcon">✓</div>
        <p className="eyebrow">{saveMode === "synced" ? "SERVER CONFIRMED" : "OFFLINE READY"}</p>
        <h1>{saveMode === "synced" ? "サーバーへ格納しました" : "同期待ちに保存しました"}</h1>
        <p>
          {saveMode === "synced"
            ? "商品と場所の二重読取をDBで再確認し、格納履歴を保存しました。"
            : "接続後に現在地を再確認します。競合時は自動上書きしません。"}
        </p>
        <a className="primaryButton" href="/mobile">
          今日の作業へ戻る
        </a>
      </main>
    );
  }

  return (
    <main className="mobileScanPage">
      <header>
        <a href="/mobile" aria-label="戻る">
          ‹
        </a>
        <div>
          <p className="eyebrow">PUTAWAY</p>
          <h1>{title}</h1>
        </div>
      </header>

      <ol className="scanSteps" aria-label="読取の進行状況">
        <li className={step !== "inventory" ? "done" : "active"}>商品</li>
        <li className={step === "confirm" ? "done" : step === "location" ? "active" : ""}>場所</li>
        <li className={step === "confirm" ? "active" : ""}>確認</li>
      </ol>

      <section className="scanEvidence panel">
        <div>
          <span>商品</span>
          <strong>{inventoryNumber ?? "未確認"}</strong>
        </div>
        <div>
          <span>場所</span>
          <strong>{locationCode ?? "未確認"}</strong>
        </div>
      </section>

      {step !== "confirm" ? (
        <section className="scanInput panel">
          <div className="cameraFrame">
            <span aria-hidden="true">＋</span>
            <strong>{step === "inventory" ? "商品ラベル" : "場所ラベル"}</strong>
            <small>カメラ写真または手入力</small>
          </div>
          <label className="cameraInput">
            カメラを開く
            <input type="file" accept="image/*" capture="environment" />
          </label>
          <label>
            管理番号を手入力
            <input
              type="text"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={step === "inventory" ? "INV-000001" : "BX-014-3"}
              autoCapitalize="characters"
              autoComplete="off"
            />
          </label>
          {error ? <p className="formError">{error}</p> : null}
          <button type="button" onClick={acceptValue}>
            この番号を確認
          </button>
          <p className="fieldHelp">
            カメラで読み取れない場合も、チェック値付き番号で作業できます。
          </p>
        </section>
      ) : (
        <section className="scanConfirm panel">
          <div className="confirmProduct" aria-hidden="true">
            ♜
          </div>
          <h2>現物と場所は一致していますか？</h2>
          <p>
            {inventoryNumber} を {locationCode} へ格納します。
          </p>
          <p>読取だけでは確定しません。最後に人が現物を確認してください。</p>
          {error ? <p className="formError">{error}</p> : null}
          <button
            type="button"
            disabled={isSaving}
            onClick={() => {
              if (!inventoryNumber || !locationCode || !inventoryScannedAt || !locationScannedAt)
                return;
              setIsSaving(true);
              setError(null);
              const operation = createPendingPutaway(
                inventoryNumber,
                locationCode,
                inventoryScannedAt,
                locationScannedAt,
              );
              void savePutawayOnlineFirst(operation)
                .then((mode) => {
                  setSaveMode(mode);
                  setStep("saved");
                })
                .catch((saveError) =>
                  setError(
                    saveError instanceof Error
                      ? saveError.message
                      : "格納を確認できませんでした。最初から読み直してください。",
                  ),
                )
                .finally(() => setIsSaving(false));
            }}
          >
            {isSaving ? "端末内へ保存中…" : "一致を確認して保存"}
          </button>
          <button
            type="button"
            className="secondaryButton"
            onClick={() => {
              setInventoryNumber(null);
              setLocationCode(null);
              setInventoryScannedAt(null);
              setLocationScannedAt(null);
              setStep("inventory");
            }}
          >
            最初から読み直す
          </button>
        </section>
      )}
    </main>
  );
}
