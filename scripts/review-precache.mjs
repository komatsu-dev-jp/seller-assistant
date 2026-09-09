import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const CACHE_NAME_TEMPLATE = "resale-review-template";
const PRECACHE_START_MARKER = "/* REVIEW_PRECACHE_START */";
const PRECACHE_END_MARKER = "/* REVIEW_PRECACHE_END */";

export function toPrecacheUrl(relativeFilePath) {
  const normalizedPath = relativeFilePath.replaceAll("\\", "/");

  if (normalizedPath === "sw.js") return null;
  if (normalizedPath === "index.html") return "./";
  if (normalizedPath.endsWith("/index.html")) {
    return `./${normalizedPath.slice(0, -"index.html".length)}`;
  }

  return `./${normalizedPath}`;
}

export async function createPrecacheManifest(files, exportRoot) {
  const hash = createHash("sha256");
  const entries = [];

  for (const file of [...files].sort()) {
    const relativeFilePath = path.relative(exportRoot, file);
    const url = toPrecacheUrl(relativeFilePath);
    if (!url) continue;

    const content = await readFile(file);
    hash.update(url);
    hash.update("\0");
    hash.update(content);
    entries.push(url);
  }

  return {
    cacheName: `resale-review-${hash.digest("hex").slice(0, 12)}`,
    urls: [...new Set(entries)].sort(),
  };
}

export function injectPrecacheManifest(workerSource, manifest) {
  if (!workerSource.includes(CACHE_NAME_TEMPLATE)) {
    throw new Error("Service worker cache-name marker was not found.");
  }

  const markerStart = workerSource.indexOf(PRECACHE_START_MARKER);
  const markerEnd = workerSource.indexOf(PRECACHE_END_MARKER);
  if (markerStart < 0 || markerEnd <= markerStart) {
    throw new Error("Service worker precache markers were not found in the expected order.");
  }

  const listStart = markerStart + PRECACHE_START_MARKER.length;
  const serializedUrls = `\n  ${manifest.urls.map((url) => JSON.stringify(url)).join(",\n  ")},\n  `;

  return (
    workerSource.slice(0, listStart) +
    serializedUrls +
    workerSource.slice(markerEnd)
  ).replace(CACHE_NAME_TEMPLATE, manifest.cacheName);
}

export function verifyApprovedRouteCoverage(urls) {
  const mobileRoutes = urls.filter((url) =>
    /^\.\/mobile\/screens\/(?:\d{2}|photo-\d{2}|box-\d{2}|sales-\d{2}|genre-suit-\d{2})\/$/u.test(
      url,
    ),
  );
  const pcRoutes = urls.filter((url) => /^\.\/pc\/(?:[1-9]|[1-4]\d|5[0-2])\/$/u.test(url));

  if (mobileRoutes.length !== 75 || pcRoutes.length !== 52) {
    throw new Error(
      `Incomplete review precache: mobile ${mobileRoutes.length}/75, PC ${pcRoutes.length}/52.`,
    );
  }

  return { mobile: mobileRoutes.length, pc: pcRoutes.length };
}
