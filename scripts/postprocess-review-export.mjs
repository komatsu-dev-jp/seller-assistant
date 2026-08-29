import { readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  createPrecacheManifest,
  injectPrecacheManifest,
  verifyApprovedRouteCoverage,
} from "./review-precache.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const exportRoot = path.join(repositoryRoot, "apps", "review", "out");
const configuredBasePath = process.env.REVIEW_BASE_PATH?.trim() ?? "";
const basePath =
  configuredBasePath.length > 0 && configuredBasePath !== "/"
    ? `/${configuredBasePath.replace(/^\/+|\/+$/gu, "")}`
    : "";
const textExtensions = new Set([".css", ".html", ".js", ".json", ".txt", ".webmanifest", ".xml"]);
const absolutePrefixes = ["/approved-assets/", "/mobile/", "/pc/"];

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const target = path.join(directory, entry.name);
      return entry.isDirectory() ? listFiles(target) : [target];
    }),
  );
  return nested.flat();
}

function prefixAbsolutePaths(content) {
  if (!basePath) return content;

  let updated = content;
  absolutePrefixes.forEach((prefix, index) => {
    const expected = `${basePath}${prefix}`;
    const token = `__REVIEW_BASE_PATH_${index}__`;
    const absolutePathPattern = new RegExp(
      `(?<![A-Za-z0-9._~/-])${escapeRegularExpression(prefix)}`,
      "gu",
    );
    updated = updated.replaceAll(expected, token);
    updated = updated.replace(absolutePathPattern, expected);
    updated = updated.replaceAll(token, expected);
  });
  return updated;
}

const files = await listFiles(exportRoot);
let changed = 0;

for (const file of files) {
  if (!textExtensions.has(path.extname(file))) continue;
  const original = await readFile(file, "utf8");
  const updated = prefixAbsolutePaths(original);
  if (updated === original) continue;
  await writeFile(file, updated, "utf8");
  changed += 1;
}

const manifest = await createPrecacheManifest(files, exportRoot);
const routeCoverage = verifyApprovedRouteCoverage(manifest.urls);
const workerPath = path.join(exportRoot, "sw.js");
const workerSource = await readFile(workerPath, "utf8");
const generatedWorker = injectPrecacheManifest(workerSource, manifest);
await writeFile(workerPath, generatedWorker, "utf8");

console.log(
  `Postprocessed ${changed} exported files for base path ${basePath || "/"}; precached ${manifest.urls.length} files (${routeCoverage.mobile} mobile + ${routeCoverage.pc} PC routes) in ${manifest.cacheName}.`,
);
