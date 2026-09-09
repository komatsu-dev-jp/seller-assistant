import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/out/**",
      "**/coverage/**",
      "**/playwright-report/**",
      "**/output/**",
      "**/.playwright-cli/**",
      "**/.chrome*/**",
      "eslint.config.mjs",
      "docs/**",
      ".github/pages/**",
      "_worktrees/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["*.config.ts", "apps/web/next.config.ts"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-floating-promises": "error",
    },
  },
  {
    ...tseslint.configs.disableTypeChecked,
    files: ["**/*.test.ts", "apps/*/public/**/*.js", "scripts/**/*.mjs"],
  },
  {
    files: [
      "apps/web/src/components/approved-mobile/**/*.tsx",
      "apps/web/src/components/approved-pc/**/*.tsx",
    ],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "no-irregular-whitespace": "off",
    },
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        AbortController: "readonly",
        Buffer: "readonly",
        clearTimeout: "readonly",
        console: "readonly",
        fetch: "readonly",
        process: "readonly",
        setTimeout: "readonly",
        TextDecoder: "readonly",
        URL: "readonly",
        WebSocket: "readonly",
      },
    },
  },
  {
    files: ["apps/*/public/**/*.js"],
    languageOptions: {
      globals: {
        self: "readonly",
        caches: "readonly",
        console: "readonly",
        fetch: "readonly",
        Request: "readonly",
        URL: "readonly",
      },
    },
  },
);
