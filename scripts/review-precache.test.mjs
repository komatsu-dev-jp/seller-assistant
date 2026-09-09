import { describe, expect, it } from "vitest";

import {
  injectPrecacheManifest,
  toPrecacheUrl,
  verifyApprovedRouteCoverage,
} from "./review-precache.mjs";

describe("review export precache", () => {
  it("maps exported route HTML to the URL visitors actually open", () => {
    expect(toPrecacheUrl("index.html")).toBe("./");
    expect(toPrecacheUrl("mobile/screens/04/index.html")).toBe("./mobile/screens/04/");
    expect(toPrecacheUrl("pc/52/index.html")).toBe("./pc/52/");
    expect(toPrecacheUrl("_next/static/chunks/app.js")).toBe("./_next/static/chunks/app.js");
    expect(toPrecacheUrl("sw.js")).toBeNull();
  });

  it("injects a versioned cache and every generated URL into the worker", () => {
    const template = `const CACHE_NAME = "resale-review-template";\nconst PRECACHE_URLS = [\n  /* REVIEW_PRECACHE_START */\n  "./",\n  /* REVIEW_PRECACHE_END */\n];`;
    const result = injectPrecacheManifest(template, {
      cacheName: "resale-review-a1b2c3d4e5f6",
      urls: ["./", "./mobile/screens/04/", "./pc/52/"],
    });

    expect(result).toContain('const CACHE_NAME = "resale-review-a1b2c3d4e5f6"');
    expect(result).toContain('"./mobile/screens/04/"');
    expect(result).toContain('"./pc/52/"');
    expect(result).not.toContain('"resale-review-template"');
  });

  it("requires all 75 mobile and 52 PC review routes", () => {
    const urls = [
      ...Array.from(
        { length: 49 },
        (_, index) => `./mobile/screens/${String(index + 1).padStart(2, "0")}/`,
      ),
      ...Array.from(
        { length: 7 },
        (_, index) => `./mobile/screens/photo-${String(index + 1).padStart(2, "0")}/`,
      ),
      ...Array.from(
        { length: 7 },
        (_, index) => `./mobile/screens/box-${String(index + 1).padStart(2, "0")}/`,
      ),
      ...Array.from(
        { length: 6 },
        (_, index) => `./mobile/screens/sales-${String(index + 1).padStart(2, "0")}/`,
      ),
      ...Array.from(
        { length: 6 },
        (_, index) => `./mobile/screens/genre-suit-${String(index + 1).padStart(2, "0")}/`,
      ),
      ...Array.from({ length: 52 }, (_, index) => `./pc/${index + 1}/`),
    ];

    expect(verifyApprovedRouteCoverage(urls)).toEqual({ mobile: 75, pc: 52 });
    expect(() => verifyApprovedRouteCoverage(urls.slice(1))).toThrow(
      "Incomplete review precache: mobile 74/75, PC 52/52.",
    );
  });
});
