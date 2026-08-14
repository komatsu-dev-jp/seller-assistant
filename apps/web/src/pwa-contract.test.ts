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

  it("keeps external CI manual and free of macOS jobs", () => {
    const workflow = readFileSync(resolve(".github/workflows/ci.yml"), "utf8");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toMatch(/pull_request:|push:|macos-/u);
  });
});
