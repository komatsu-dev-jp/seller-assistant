import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { PwaRegistration } from "../components/pwa-registration";
import "./globals.css";

export const metadata: Metadata = {
  title: "Resale Ops",
  description: "仕入から在庫・発送・会計準備までをつなぐ業務アプリ",
  applicationName: "Resale Operations",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Resale Ops" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#13213a",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ja">
      <body>
        {children}
        <PwaRegistration />
      </body>
    </html>
  );
}
