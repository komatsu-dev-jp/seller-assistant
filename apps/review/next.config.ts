import type { NextConfig } from "next";

const configuredBasePath = process.env.REVIEW_BASE_PATH?.trim() ?? "";
const basePath =
  configuredBasePath.length > 0 && configuredBasePath !== "/"
    ? `/${configuredBasePath.replace(/^\/+|\/+$/gu, "")}`
    : "";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  reactStrictMode: true,
  poweredByHeader: false,
  basePath,
  ...(basePath ? { assetPrefix: basePath } : {}),
  env: {
    NEXT_PUBLIC_REVIEW_BASE_PATH: basePath,
    NEXT_PUBLIC_REVIEW_ONLY: "true",
  },
};

export default nextConfig;
