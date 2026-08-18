import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import manifest from "./app/manifest";

describe("zero-cost PWA contract", () => {
  it("is installable from the mobile route without a native app store", () => {
    const value = manifest();
    expect(value.display).toBe("standalone");
    expect(value.start_url).toBe("/mobile");
    expect(value.icons?.length).toBeGreaterThan(0);
  });

  it("never puts API responses into the service worker cache", () => {
    const worker = readFileSync(resolve("apps/web/public/sw.js"), "utf8");
    expect(worker).toContain('url.pathname.startsWith("/api/")');
    expect(worker).toContain('url.pathname.startsWith("/v1/")');
    expect(worker).toContain("CLEAR_BUSINESS_CACHE");
  });

  it("allows only the explicit shipping task and assignment proxy paths", () => {
    const proxy = readFileSync(
      resolve("apps/web/src/app/v1/workspaces/[workspaceId]/[[...segments]]/route.ts"),
      "utf8",
    );
    expect(proxy).toContain('segments[0] === "shipping-tasks"');
    expect(proxy).toContain('"assignment"');
    expect(proxy).toContain("orderActions.has");
  });

  it("registers the worker even when React mounts after the window load event", () => {
    const registration = readFileSync(
      resolve("apps/web/src/components/pwa-registration.tsx"),
      "utf8",
    );
    expect(registration).toContain('document.readyState === "complete"');
    expect(registration).toContain('register("/sw.js"');
  });

  it("clears offline data only after server-side logout succeeds", () => {
    const logout = readFileSync(resolve("apps/web/src/components/logout-button.tsx"), "utf8");
    const requestIndex = logout.indexOf('fetch("/v1/session/logout"');
    const statusIndex = logout.indexOf("response.status !== 204");
    const clearIndex = logout.indexOf("await clearOfflineBusinessData()");
    expect(requestIndex).toBeGreaterThan(-1);
    expect(statusIndex).toBeGreaterThan(requestIndex);
    expect(clearIndex).toBeGreaterThan(statusIndex);
    const proxy = readFileSync(resolve("apps/web/src/app/v1/session/logout/route.ts"), "utf8");
    expect(proxy).toContain("API_INTERNAL_ORIGIN");
    expect(proxy).toContain("APP_ORIGIN");
    expect(proxy).toContain('"sec-fetch-site": "same-origin"');
    expect(proxy).toContain("sessionと端末データは変更していません");
    expect(proxy).not.toMatch(/console\.|localStorage|sessionStorage/u);
  });

  it("keeps login passwords out of URL and browser storage", () => {
    const form = readFileSync(resolve("apps/web/src/components/login-form.tsx"), "utf8");
    const proxy = readFileSync(resolve("apps/web/src/app/v1/session/login/route.ts"), "utf8");
    expect(form).toContain('type="password"');
    expect(form).toContain('fetch("/v1/session/login"');
    expect(form).toContain('action="/v1/session/login"');
    expect(form).toContain('method="post"');
    expect(form).toContain('method: "POST"');
    expect(form).not.toMatch(/localStorage|sessionStorage|indexedDB|URLSearchParams/u);
    expect(proxy).not.toMatch(/console\.|localStorage|sessionStorage/u);
    expect(proxy).toContain('cache: "no-store"');
  });

  it("keeps offline putaway minimal and never auto-overwrites a conflict", () => {
    const outbox = readFileSync(resolve("apps/web/src/lib/offline-outbox.ts"), "utf8");
    const status = readFileSync(resolve("apps/web/src/components/offline-sync-status.tsx"), "utf8");
    expect(outbox).toContain("syncPendingPutaways");
    expect(outbox).toContain('status === 401) return "authentication_required"');
    expect(outbox).toContain('status === 403) return "forbidden"');
    expect(outbox).toContain('status >= 500) return "unavailable"');
    expect(outbox).toContain('result === "authentication_required"');
    expect(outbox).toContain("discarded += 1");
    expect(outbox).toContain("throw new Error(body?.message");
    expect(outbox).not.toMatch(/address|receiptText|purchasePrice|taxDocument/u);
    expect(status).toContain('addEventListener("online"');
    expect(status).toContain("自動上書きせず、再読取してください");
    expect(status).toContain("担当解除・変更のため端末から消去しました");
    expect(status).toContain("再ログイン後に同期待ちを再送します。端末内に保持しています");
  });

  it("stages every capture file before network upload and clears revoked assignments", () => {
    const capture = readFileSync(
      resolve("apps/web/src/components/mobile-capture-workspace.tsx"),
      "utf8",
    );
    const save = capture.slice(capture.indexOf("async function save()"));
    const stageIndex = save.indexOf("await prepareCaptureUpload");
    const uploadIndex = save.indexOf("await requestJson(");
    expect(stageIndex).toBeGreaterThan(-1);
    expect(uploadIndex).toBeGreaterThan(stageIndex);
    expect(save).toContain("const stagedUploads = new Map");
    expect(save).toContain("clearCaptureUploads(workspaceId, task.skuId)");
    expect(capture).toContain("clearCaptureBusinessData");
    expect(capture).toContain("clearUnassignedCaptureUploads");
    expect(capture).toContain("reason.status === 403");
    expect(capture).not.toContain("reason.status === 401 || reason.status === 403");
    const outbox = readFileSync(resolve("apps/web/src/lib/capture-outbox.ts"), "utf8");
    expect(outbox).toContain('crypto.subtle.digest("SHA-256"');
    expect(outbox).toContain("existing.fileSha256 === fileSha256");
    expect(capture).toContain('capture="environment"');
  });

  it("clears the application cache even before a service worker controls the page", () => {
    const outbox = readFileSync(resolve("apps/web/src/lib/offline-outbox.ts"), "utf8");
    expect(outbox).toContain('if ("caches" in window)');
    expect(outbox).toContain('cacheName.startsWith("resale-ops-")');
    expect(outbox).toContain("caches.delete(cacheName)");
  });

  it("runs free Linux CI for PRs and main pushes without macOS jobs", () => {
    const workflow = readFileSync(resolve(".github/workflows/ci.yml"), "utf8");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("push:");
    expect(workflow).toContain("npm test");
    expect(workflow).toContain("npm run lint");
    expect(workflow).toContain("npm run build");
    expect(workflow).not.toContain("macos-");
    const pages = readFileSync(resolve(".github/workflows/pages.yml"), "utf8");
    expect(pages).toContain("actions/deploy-pages@v4");
    expect(pages).toContain("pages: write");
  });

  it("protects sensitive pages with a server-side session and role allowlist", () => {
    const guard = readFileSync(resolve("apps/web/src/lib/server-session.ts"), "utf8");
    const home = readFileSync(resolve("apps/web/src/app/page.tsx"), "utf8");
    const inventory = readFileSync(resolve("apps/web/src/app/inventory/page.tsx"), "utf8");
    const workflow = readFileSync(resolve("apps/web/src/app/workflow/page.tsx"), "utf8");
    const mobile = readFileSync(resolve("apps/web/src/app/mobile/page.tsx"), "utf8");
    const scan = readFileSync(resolve("apps/web/src/app/mobile/scan/page.tsx"), "utf8");
    const shipping = readFileSync(resolve("apps/web/src/app/shipping/page.tsx"), "utf8");

    expect(guard).toContain('import "server-only"');
    expect(guard).toContain('cache: "no-store"');
    expect(guard).toContain("sessionContextResponseSchema.safeParse");
    expect(guard).toContain('redirect("/login")');
    expect(guard).toContain('redirect("/forbidden")');
    expect(guard).not.toMatch(/console\.|localStorage|sessionStorage/u);
    for (const source of [home, inventory, workflow]) {
      expect(source).toContain('export const dynamic = "force-dynamic"');
      expect(source).toContain('requirePageSession(["owner", "inventory_manager"])');
      expect(source).not.toContain('"field_worker"');
    }
    expect(mobile).toMatch(
      /requirePageSession\(\[\s*"owner",\s*"inventory_manager",\s*"field_worker",\s*"shipping",?\s*\]\)/u,
    );
    for (const source of [scan]) {
      expect(source).toContain('export const dynamic = "force-dynamic"');
      expect(source).toContain(
        'requirePageSession(["owner", "inventory_manager", "field_worker"])',
      );
    }
    expect(shipping).toContain('requirePageSession(["owner", "inventory_manager", "shipping"])');
    expect(mobile).toContain("canViewManagement");
  });
});
