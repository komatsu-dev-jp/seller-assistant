import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Resale Operations",
    short_name: "Resale Ops",
    description: "仕入・撮影・採寸・在庫・配送・収支を、人の確認を残してつなぐ業務アプリ",
    start_url: "/mobile",
    scope: "/",
    display: "standalone",
    background_color: "#f5f7fa",
    theme_color: "#13213a",
    orientation: "portrait-primary",
    lang: "ja",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
