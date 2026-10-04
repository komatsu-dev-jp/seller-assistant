import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "../../web/src/app/globals.css";
import { PwaRegistration } from "./pwa-registration";

const basePath = process.env.NEXT_PUBLIC_REVIEW_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "フリマ物販業務アプリ",
  description:
    "箱の検品・見込み利益と、出品準備の操作見本。入力はこの端末のブラウザー内に保存します。外部への自動送信・端末間共有はありません。",
  applicationName: "フリマ物販業務",
  manifest: `${basePath}/manifest.webmanifest`,
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "物販業務",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>
        {children}
        <PwaRegistration />
      </body>
    </html>
  );
}
