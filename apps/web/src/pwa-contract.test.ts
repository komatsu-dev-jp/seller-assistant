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

  it("keeps external CI manual and free of macOS jobs", () => {
    const workflow = readFileSync(resolve(".github/workflows/ci.yml"), "utf8");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toMatch(/pull_request:|push:|macos-/u);
  });
});
