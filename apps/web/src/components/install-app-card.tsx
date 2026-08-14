"use client";

import { useEffect, useState } from "react";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallAppCard() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    setIsIos(/iphone|ipad|ipod/iu.test(navigator.userAgent));
    setIsStandalone(window.matchMedia("(display-mode: standalone)").matches);
    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", capturePrompt);
    return () => window.removeEventListener("beforeinstallprompt", capturePrompt);
  }, []);

  if (isStandalone) return <span className="installedBadge">ホーム画面アプリで使用中</span>;
  if (!promptEvent && !isIos) return null;

  return (
    <aside className="installCard" aria-label="ホーム画面へ追加">
      <div>
        <strong>iPhoneでアプリのように使えます</strong>
        <p>
          {isIos
            ? "Safariの共有ボタンを押し、「ホーム画面に追加」を選んでください。"
            : "この端末へインストールすると、独立した画面で開けます。"}
        </p>
      </div>
      {promptEvent ? (
        <button
          type="button"
          onClick={() => {
            void promptEvent
              .prompt()
              .then(() => promptEvent.userChoice)
              .then(() => setPromptEvent(null));
          }}
        >
          ホーム画面へ追加
        </button>
      ) : null}
    </aside>
  );
}
