import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "apps/review/app/page.tsx"), "utf8");
const entry = readFileSync(resolve(process.cwd(), "apps/review/app/public-app-entry.tsx"), "utf8");
const registration = readFileSync(
  resolve(process.cwd(), "apps/review/app/pwa-registration.tsx"),
  "utf8",
);
const worker = readFileSync(resolve(process.cwd(), "apps/review/public/sw.js"), "utf8");
const mobileEntry = readFileSync(
  resolve(process.cwd(), "apps/review/app/mobile/app/page.tsx"),
  "utf8",
);
const manifest = readFileSync(resolve(process.cwd(), "apps/review/app/manifest.ts"), "utf8");

describe("public app home navigation", () => {
  it("opens the current mobile or PC application instead of the old review selector", () => {
    expect(page).toContain("<PublicAppEntry />");
    expect(entry).toContain('window.matchMedia("(max-width: 900px)")');
    expect(entry).toContain("window.location.replace(destination)");
    expect(entry).toContain('const mobileHome = "/mobile/app/"');
    expect(entry).toContain('const pcHome = "/pc/2/"');
    expect(entry).not.toContain("NEXT_PUBLIC_REVIEW_BASE_PATH");
    expect(entry).toContain("スマホ版を開く");
    expect(entry).not.toContain("承認デザイン確認用");
    expect(entry).not.toContain("表示する画面を選んでください");
    expect(entry).not.toContain('from "next/link"');
    expect(entry).not.toContain("<Link");
  });

  it("uses an uncached mobile entry to escape the legacy cache without clearing saved review data", () => {
    expect(mobileEntry).toContain('<ApprovedMobileDemo screenId="04" />');
    expect(manifest).toContain("start_url: `${basePath}/mobile/app/`");
    expect(mobileEntry).not.toContain("localStorage.clear");
    expect(mobileEntry).not.toContain("indexedDB.deleteDatabase");
  });

  it("forces a service-worker update and refreshes every open review page after activation", () => {
    expect(registration).toContain('updateViaCache: "none"');
    expect(registration).toContain("registration.update()");
    expect(worker).toContain('type: "window"');
    expect(worker).toContain("includeUncontrolled: true");
    expect(worker).toContain("clientUrl.pathname.startsWith(rootPath)");
    expect(worker).toContain("client.navigate(client.url)");
    expect(worker).toContain('event.request.mode === "navigate"');
  });

  it("uses native navigation in the mobile index without requesting server route payloads", () => {
    const index = readFileSync(
      resolve(process.cwd(), "apps/review/app/mobile/screens/page.tsx"),
      "utf8",
    );
    expect(index).not.toContain('from "next/link"');
    expect(index).not.toContain("<Link");
    expect(index).toContain("<a href={`/mobile/screens/${screen}`}>{screen}</a>");
  });
});
