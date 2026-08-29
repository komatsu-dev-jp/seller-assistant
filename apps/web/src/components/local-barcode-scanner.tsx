"use client";

import { BrowserMultiFormatOneDReader, type IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { useCallback, useEffect, useRef, useState } from "react";

export function LocalBarcodeScanner({
  onDetected,
  label = "バーコード",
}: {
  onDetected: (value: string) => void;
  label?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const stopCamera = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setCameraActive(false);
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia || !videoRef.current) {
      setError("この画面ではカメラを直接使えません。写真選択か番号入力をお使いください。");
      return;
    }

    stopCamera();
    setBusy(true);
    setError("");
    setCameraActive(true);
    try {
      const controls = await createReader().decodeFromConstraints(
        { audio: false, video: { facingMode: { ideal: "environment" } } },
        videoRef.current,
        (result, _decodeError, callbackControls) => {
          if (!result) return;
          callbackControls.stop();
          controlsRef.current = null;
          setCameraActive(false);
          onDetected(result.getText());
        },
      );
      controlsRef.current = controls;
    } catch {
      setCameraActive(false);
      setError("カメラを開けませんでした。許可を確認するか、写真選択・番号入力をお使いください。");
    } finally {
      setBusy(false);
    }
  }

  async function scanImage(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 25 * 1024 * 1024) {
      setError("25MB以下の画像を選んでください。");
      return;
    }

    stopCamera();
    setBusy(true);
    setError("");
    const objectUrl = URL.createObjectURL(file);
    try {
      const result = await createReader().decodeFromImageUrl(objectUrl);
      onDetected(result.getText());
    } catch {
      setError("画像からバーコードを読めませんでした。番号を手入力してください。");
    } finally {
      URL.revokeObjectURL(objectUrl);
      setBusy(false);
    }
  }

  return (
    <div className="localBarcodeScanner">
      <div className={`localScannerPreview ${cameraActive ? "isActive" : ""}`}>
        <video ref={videoRef} muted playsInline aria-label={`${label}のカメラ映像`} />
        {!cameraActive ? (
          <div>
            <span aria-hidden="true">▥</span>
            <strong>{label}を枠内に合わせます</strong>
            <small>画像と番号は外部サービスへ送りません</small>
          </div>
        ) : null}
      </div>

      <div className="localScannerActions">
        {cameraActive ? (
          <button type="button" className="secondaryButton" onClick={stopCamera}>
            カメラを止める
          </button>
        ) : (
          <button type="button" onClick={() => void startCamera()} disabled={busy}>
            {busy ? "準備中…" : "カメラで読み取る"}
          </button>
        )}
        <label className="localScannerFile">
          写真から読み取る
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              void scanImage(file);
            }}
          />
        </label>
      </div>
      {error ? (
        <p className="formError" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function createReader(): BrowserMultiFormatOneDReader {
  const hints = new Map<DecodeHintType, unknown>();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128]);
  return new BrowserMultiFormatOneDReader(hints, {
    delayBetweenScanAttempts: 180,
    delayBetweenScanSuccess: 500,
  });
}
