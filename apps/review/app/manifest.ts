import type { MetadataRoute } from "next";

const basePath = process.env.NEXT_PUBLIC_REVIEW_BASE_PATH ?? "";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "フリマ物販業務アプリ",
    short_name: "物販業務",
    description: "スマホとPCで実装済みの業務フローを確認できる無料のWebアプリ",
    start_url: `${basePath}/mobile/screens/04/`,
    scope: `${basePath || ""}/`,
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    orientation: "portrait-primary",
    icons: [
      {
        src: `${basePath}/review-icon.svg`,
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
