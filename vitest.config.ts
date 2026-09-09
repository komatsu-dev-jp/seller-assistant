import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/**/*.test.ts", "packages/**/*.test.ts", "scripts/**/*.test.mjs"],
    coverage: {
      provider: "v8",
      include: [
        "packages/domain/src/**/*.ts",
        "packages/contracts/src/**/*.ts",
        "apps/api/src/address-crypto.ts",
        "apps/api/src/auth.ts",
        "apps/api/src/db-security.ts",
        "apps/api/src/local-media-store.ts",
        "apps/api/src/security.ts",
        "apps/api/src/session.ts",
        "apps/web/src/lib/request-origin.ts",
        "apps/web/src/lib/workspace-proxy-request.ts",
      ],
      exclude: ["**/*.test.ts", "**/index.ts"],
      thresholds: {
        lines: 80,
        branches: 75,
        functions: 80,
        statements: 80,
      },
      reporter: ["text", "json-summary", "html"],
    },
  },
});
