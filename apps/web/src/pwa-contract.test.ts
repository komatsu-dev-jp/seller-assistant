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
    expect(form).toContain('method: "POST"');
    expect(form).not.toMatch(/localStorage|sessionStorage|indexedDB|URLSearchParams/u);
    expect(proxy).not.toMatch(/console\.|localStorage|sessionStorage/u);
    expect(proxy).toContain('cache: "no-store"');
  });

  it("keeps offline putaway minimal and never auto-overwrites a conflict", () => {
    const outbox = readFileSync(resolve("apps/web/src/lib/offline-outbox.ts"), "utf8");
    const status = readFileSync(resolve("apps/web/src/components/offline-sync-status.tsx"), "utf8");
    expect(outbox).toContain("syncPendingPutaways");
    expect(outbox).toContain('if (response.status >= 500) return "unavailable"');
    expect(outbox).toContain("response.status === 401 || response.status === 403");
    expect(outbox).toContain("discarded += 1");
    expect(outbox).toContain("throw new Error(body?.message");
    expect(outbox).not.toMatch(/address|receiptText|purchasePrice|taxDocument/u);
    expect(status).toContain('addEventListener("online"');
    expect(status).toContain("自動上書きせず、再読取してください");
    expect(status).toContain("担当解除・変更のため端末から消去しました");
  });

  it("keeps external CI manual and free of macOS jobs", () => {
    const workflow = readFileSync(resolve(".github/workflows/ci.yml"), "utf8");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toMatch(/pull_request:|push:|macos-/u);
  });

  it("protects sensitive pages with a server-side session and role allowlist", () => {
    const guard = readFileSync(resolve("apps/web/src/lib/server-session.ts"), "utf8");
    const home = readFileSync(resolve("apps/web/src/app/page.tsx"), "utf8");
    const inventory = readFileSync(resolve("apps/web/src/app/inventory/page.tsx"), "utf8");
    const workflow = readFileSync(resolve("apps/web/src/app/workflow/page.tsx"), "utf8");
    const mobile = readFileSync(resolve("apps/web/src/app/mobile/page.tsx"), "utf8");
    const scan = readFileSync(resolve("apps/web/src/app/mobile/scan/page.tsx"), "utf8");

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
    for (const source of [mobile, scan]) {
      expect(source).toContain('export const dynamic = "force-dynamic"');
      expect(source).toContain(
        'requirePageSession(["owner", "inventory_manager", "field_worker"])',
      );
    }
    expect(mobile).toContain("canViewManagement");
  });
});
