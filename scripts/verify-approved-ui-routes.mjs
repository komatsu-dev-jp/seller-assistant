#!/usr/bin/env node

/**
 * Verify the approved UI route contract against a loopback web server.
 *
 * This script intentionally has no third-party dependencies.  The title and
 * primary-action expectations are read from the existing static source map
 * (`.github/pages/approved-ui.js`) instead of being copied into this file.
 * The source map is inspected as text; it is never evaluated.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APPROVED_UI_PATH = path.join(ROOT, ".github", "pages", "approved-ui.js");
const DEFAULT_BASE_URL = "http://127.0.0.1:3005";
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const REQUEST_CONCURRENCY = 6;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

const MOBILE_ADDITIONAL_KEYS = [
  ...range(1, 7, "photo"),
  ...range(1, 7, "box"),
  ...range(1, 6, "sales"),
  ...range(1, 6, "genre-suit"),
];

const ERROR_MARKERS = [
  /NEXT_NOT_FOUND/iu,
  /NEXT_HTTP_ERROR_FALLBACK/iu,
  /NEXT_ERROR/iu,
  /next-error/iu,
  /__next_error__/iu,
  /this page could not be found/iu,
  /application error:\s*a server-side exception has occurred/iu,
  /unhandled runtime error/iu,
  /<title[^>]*>\s*(?:404|500)\b/iu,
];

function range(start, end, prefix) {
  return Array.from(
    { length: end - start + 1 },
    (_, index) => `${prefix}-${String(start + index).padStart(2, "0")}`,
  );
}

function lineNumber(source, offset) {
  return source.slice(0, offset).split("\n").length;
}

function skipQuotedString(source, index, quote) {
  let cursor = index + 1;
  while (cursor < source.length) {
    if (source[cursor] === "\\") {
      cursor += 2;
      continue;
    }
    if (source[cursor] === quote) return cursor + 1;
    cursor += 1;
  }
  return source.length;
}

function findMatchingBracket(source, openIndex) {
  let depth = 0;
  let cursor = openIndex;
  while (cursor < source.length) {
    const character = source[cursor];
    if (character === '"' || character === "'" || character === "`") {
      cursor = skipQuotedString(source, cursor, character);
      continue;
    }
    if (character === "/" && source[cursor + 1] === "/") {
      const newline = source.indexOf("\n", cursor + 2);
      cursor = newline === -1 ? source.length : newline + 1;
      continue;
    }
    if (character === "/" && source[cursor + 1] === "*") {
      const endComment = source.indexOf("*/", cursor + 2);
      cursor = endComment === -1 ? source.length : endComment + 2;
      continue;
    }
    if (character === "[") depth += 1;
    if (character === "]") {
      depth -= 1;
      if (depth === 0) return cursor;
    }
    cursor += 1;
  }
  return -1;
}

function extractArrayBlock(source, declaration) {
  const marker = `const ${declaration} = [`;
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) {
    throw new Error(`missing declaration: ${declaration}`);
  }
  const openIndex = markerIndex + marker.length - 1;
  const closeIndex = findMatchingBracket(source, openIndex);
  if (closeIndex === -1) {
    throw new Error(`unterminated declaration: ${declaration}`);
  }
  return {
    block: source.slice(openIndex, closeIndex + 1),
    offset: openIndex,
  };
}

function topLevelArrayRows(block) {
  const rows = [];
  let rowStart = -1;
  let depth = 0;
  let cursor = 1;
  while (cursor < block.length - 1) {
    const character = block[cursor];
    if (character === '"' || character === "'" || character === "`") {
      cursor = skipQuotedString(block, cursor, character);
      continue;
    }
    if (character === "/" && block[cursor + 1] === "/") {
      const newline = block.indexOf("\n", cursor + 2);
      cursor = newline === -1 ? block.length : newline + 1;
      continue;
    }
    if (character === "/" && block[cursor + 1] === "*") {
      const endComment = block.indexOf("*/", cursor + 2);
      cursor = endComment === -1 ? block.length : endComment + 2;
      continue;
    }
    if (character === "[") {
      if (depth === 0) rowStart = cursor;
      depth += 1;
    } else if (character === "]") {
      depth -= 1;
      if (depth === 0 && rowStart !== -1) {
        rows.push(block.slice(rowStart, cursor + 1));
        rowStart = -1;
      }
    }
    cursor += 1;
  }
  return rows;
}

function parseStringLiterals(row) {
  const values = [];
  let cursor = 0;
  while (cursor < row.length) {
    const character = row[cursor];
    if (character === '"' || character === "'") {
      const end = skipQuotedString(row, cursor, character);
      const raw = row.slice(cursor, end);
      if (character === '"') {
        try {
          values.push(JSON.parse(raw));
        } catch {
          values.push(raw.slice(1, -1));
        }
      } else {
        values.push(raw.slice(1, -1).replace(/\\([\\'])/gu, "$1"));
      }
      cursor = end;
      continue;
    }
    cursor += 1;
  }
  return values;
}

function expectedFromSource(source) {
  const declarations = ["MOBILE_SCREENS", "MOBILE_ADDITIONAL_SCREENS", "PC_SCREENS"];
  const extracted = Object.fromEntries(
    declarations.map((declaration) => [declaration, extractArrayBlock(source, declaration)]),
  );
  const rows = Object.fromEntries(
    declarations.map((declaration) => [
      declaration,
      topLevelArrayRows(extracted[declaration].block).map(parseStringLiterals),
    ]),
  );

  const mobile = rows.MOBILE_SCREENS.map(([code, title, , primary]) => ({
    kind: "mobile",
    id: `m-${code}`,
    code,
    route: `/mobile/screens/${code}`,
    title,
    primary,
  }));
  const additional = rows.MOBILE_ADDITIONAL_SCREENS.map(([id, title, , primary]) => ({
    kind: "mobile",
    id,
    code: id,
    route: `/mobile/screens/${id}`,
    title,
    primary,
  }));
  const pc = rows.PC_SCREENS.map(([code, title, , primary]) => ({
    kind: "pc",
    id: `p-${code}`,
    code,
    route: `/pc/${Number(code)}`,
    title,
    primary,
  }));

  return {
    source,
    rows,
    offsets: Object.fromEntries(
      declarations.map((declaration) => [declaration, extracted[declaration].offset]),
    ),
    mobile,
    additional,
    pc,
  };
}

function expectedSequence(prefix, count) {
  return Array.from(
    { length: count },
    (_, index) => `${prefix}-${String(index + 1).padStart(2, "0")}`,
  );
}

function compareSequence(actual, expected, label, failures) {
  if (actual.length !== expected.length) {
    failures.push(`${label}: expected ${expected.length} rows, found ${actual.length}`);
  }
  const missing = expected.filter((key) => !actual.includes(key));
  const extra = actual.filter((key) => !expected.includes(key));
  const duplicate = actual.filter((key, index) => actual.indexOf(key) !== index);
  if (missing.length > 0) failures.push(`${label}: missing ${missing.join(", ")}`);
  if (extra.length > 0) failures.push(`${label}: unexpected ${extra.join(", ")}`);
  if (duplicate.length > 0)
    failures.push(`${label}: duplicate ${[...new Set(duplicate)].join(", ")}`);
  if (actual.some((key, index) => key !== expected[index])) {
    failures.push(`${label}: entries are not in approved order`);
  }
}

function staticCheck(parsed) {
  const failures = [];
  const { source, rows } = parsed;
  const mobileCodes = rows.MOBILE_SCREENS.map((row) => row[0]);
  const additionalKeys = rows.MOBILE_ADDITIONAL_SCREENS.map((row) => row[0]);
  const pcCodes = rows.PC_SCREENS.map((row) => row[0]);

  compareSequence(
    mobileCodes.map((code) => `m-${code}`),
    expectedSequence("m", 49),
    "mobile canonical keys",
    failures,
  );
  compareSequence(additionalKeys, MOBILE_ADDITIONAL_KEYS, "mobile additional keys", failures);
  compareSequence(
    pcCodes.map((code) => `p-${code}`),
    expectedSequence("p", 52),
    "PC entries",
    failures,
  );

  if (!/id\s*:\s*`m-\$\{number\}`/u.test(source)) {
    failures.push("mobile canonical key generator is missing");
  }
  if (!/id\s*:\s*`p-\$\{number\}`/u.test(source)) {
    failures.push("PC key generator is missing");
  }
  if (
    !/const\s+ALL_MOBILE_SCREENS\s*=\s*\[\.\.\.MOBILE_SCREENS,\s*\.\.\.MOBILE_ADDITIONAL_SCREENS\]/u.test(
      source,
    )
  ) {
    failures.push("mobile canonical and additional maps are not combined");
  }

  const externalFindings = [];
  const runtimePatterns = [
    { pattern: /\bfetch\s*\(/giu, label: "fetch()" },
    { pattern: /\b(?:XMLHttpRequest|WebSocket|EventSource)\b/giu, label: "browser network API" },
    { pattern: /\bnavigator\s*\.\s*sendBeacon\s*\(/giu, label: "navigator.sendBeacon()" },
  ];
  for (const { pattern, label } of runtimePatterns) {
    for (const match of source.matchAll(pattern)) {
      externalFindings.push(`${label} at line ${lineNumber(source, match.index ?? 0)}`);
    }
  }
  for (const match of source.matchAll(/\bhttps?:\/\/[^\s"'`<>]+/giu)) {
    let hostname;
    try {
      hostname = new URL(match[0]).hostname.toLowerCase().replace(/^\[|\]$/gu, "");
    } catch {
      externalFindings.push(`invalid URL at line ${lineNumber(source, match.index ?? 0)}`);
      continue;
    }
    if (!LOOPBACK_HOSTS.has(hostname)) {
      externalFindings.push(`external URL at line ${lineNumber(source, match.index ?? 0)}`);
    }
  }
  if (externalFindings.length > 0) {
    failures.push(`external runtime URL/fetch findings: ${externalFindings.join("; ")}`);
  }

  return {
    failures,
    externalFindings,
    mobileKeyCount: new Set([...mobileCodes.map((code) => `m-${code}`), ...additionalKeys]).size,
    pcEntryCount: new Set(pcCodes.map((code) => `p-${code}`)).size,
  };
}

function stripMarkup(value) {
  return value
    .replace(/<!--[\s\S]*?-->/gu, " ")
    .replace(/<script\b[\s\S]*?<\/script>/giu, " ")
    .replace(/<style\b[\s\S]*?<\/style>/giu, " ")
    .replace(/<[^>]*>/gu, " ");
}

function decodeHtml(value) {
  return value
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;/giu, "'")
    .replace(/&#x([\da-f]+);/giu, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number(code)));
}

function visibleText(value) {
  return decodeHtml(stripMarkup(value)).replace(/\s+/gu, " ").trim();
}

function normalizedControlText(value) {
  return visibleText(value)
    .replace(/[›→↗↓‹←⌄]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function extractControls(html) {
  const controls = [];
  const controlPattern = /<(a|button)\b[^>]*>([\s\S]*?)<\/\1>/giu;
  for (const match of html.matchAll(controlPattern)) {
    controls.push({
      tag: match[1].toLowerCase(),
      text: visibleText(match[2]),
      normalized: normalizedControlText(match[2]),
    });
  }
  return controls;
}

function extractHeadings(html) {
  const headings = [];
  const headingPattern = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/giu;
  for (const match of html.matchAll(headingPattern)) headings.push(visibleText(match[2]));
  return headings;
}

function pageHasErrorMarker(html) {
  // Next's dev client includes the phrase "This page could not be found" in
  // JavaScript source on every page. Remove scripts/styles before checking so
  // that only the rendered error document can trigger this guard.
  const renderedDocument = html
    .replace(/<script\b[\s\S]*?<\/script>/giu, " ")
    .replace(/<style\b[\s\S]*?<\/style>/giu, " ");
  return ERROR_MARKERS.find((marker) => marker.test(renderedDocument));
}

function hasExpectedTitle(html, expectedTitle) {
  const headings = extractHeadings(html);
  if (headings.some((heading) => heading === expectedTitle || heading.includes(expectedTitle)))
    return true;

  // The login screen intentionally has no heading; its title is the exact
  // primary action. Keep this fallback narrow so a global nav label cannot
  // make a wrong route pass the title check.
  const controls = extractControls(html);
  return controls.some((control) => control.normalized === normalizedControlText(expectedTitle));
}

function hasExpectedPrimary(html, expectedPrimary) {
  const expected = normalizedControlText(expectedPrimary);
  // Some final approved PC boards intentionally have no single primary CTA
  // (for example, screen 09 is a choice screen and screen 52 is a status
  // screen). An empty contract value means "no primary assertion" rather
  // than "find a control whose label is empty".
  if (!expected) return true;
  return extractControls(html).some((control) => control.normalized === expected);
}

function parseBaseUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`invalid base URL: ${value}`);
  }
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  if (!LOOPBACK_HOSTS.has(hostname)) {
    throw new Error(`base URL must be loopback-only (127.0.0.1, localhost, or ::1): ${value}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`base URL must use http or https: ${value}`);
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("base URL must not contain credentials, query, or hash");
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/u, "") || "/";
  return parsed;
}

function routeUrl(base, route) {
  const prefix = base.pathname === "/" ? "" : base.pathname;
  return new URL(`${prefix}${route}`, base.origin).toString();
}

async function readResponseBody(response) {
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > MAX_RESPONSE_BYTES) {
    throw new Error(`response exceeds ${MAX_RESPONSE_BYTES} bytes`);
  }
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_RESPONSE_BYTES) {
    throw new Error(`response exceeds ${MAX_RESPONSE_BYTES} bytes`);
  }
  return new TextDecoder().decode(bytes);
}

async function checkRoute(base, screen) {
  const failures = [];
  const url = routeUrl(base, screen.route);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { redirect: "manual", signal: controller.signal });
    if (response.status !== 200) failures.push(`HTTP ${response.status}`);
    const html = await readResponseBody(response);
    const marker = pageHasErrorMarker(html);
    if (marker) failures.push(`Next/error page marker ${marker}`);
    if (!hasExpectedTitle(html, screen.title)) {
      const headings = extractHeadings(html).slice(0, 4);
      failures.push(
        `title mismatch (expected ${JSON.stringify(screen.title)}, headings ${JSON.stringify(headings)})`,
      );
    }
    if (!hasExpectedPrimary(html, screen.primary)) {
      failures.push(`primary button mismatch (expected ${JSON.stringify(screen.primary)})`);
    }
  } catch (error) {
    const message =
      error?.name === "AbortError" ? `timeout after ${REQUEST_TIMEOUT_MS}ms` : error?.message;
    failures.push(`request error: ${message || String(error)}`);
  } finally {
    clearTimeout(timeout);
  }
  return { screen, failures };
}

async function mapBounded(items, workerLimit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function runWorker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(workerLimit, items.length) }, () => runWorker()));
  return results;
}

function usage() {
  console.log(
    `Usage: node scripts/verify-approved-ui-routes.mjs [base-url]\nDefault: ${DEFAULT_BASE_URL}`,
  );
}

async function main() {
  if (process.argv.slice(2).some((argument) => argument === "--help" || argument === "-h")) {
    usage();
    return;
  }
  if (process.argv.length > 3) {
    throw new Error("accepts at most one positional base URL argument");
  }

  let source;
  try {
    source = await readFile(APPROVED_UI_PATH, "utf8");
  } catch (error) {
    throw new Error(`cannot read ${path.relative(ROOT, APPROVED_UI_PATH)}: ${error.message}`, {
      cause: error,
    });
  }

  let parsed;
  try {
    parsed = expectedFromSource(source);
  } catch (error) {
    throw new Error(`cannot parse approved UI source map: ${error.message}`, { cause: error });
  }
  const staticResult = staticCheck(parsed);
  console.log(
    `[STATIC] ${staticResult.failures.length === 0 ? "PASS" : "FAIL"} ` +
      `.github/pages/approved-ui.js — mobile keys ${staticResult.mobileKeyCount}/75, ` +
      `PC entries ${staticResult.pcEntryCount}/52, ` +
      `external runtime findings ${staticResult.externalFindings.length}`,
  );
  for (const failure of staticResult.failures) console.log(`[STATIC][FAIL] ${failure}`);

  let base;
  try {
    base = parseBaseUrl(process.argv[2] || DEFAULT_BASE_URL);
  } catch (error) {
    console.error(`[FAIL] base URL — ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const screens = [...parsed.pc, ...parsed.mobile, ...parsed.additional];
  if (screens.length !== 127) {
    console.error(`[FAIL] route map — expected 127 screens, found ${screens.length}`);
    process.exitCode = 1;
    return;
  }
  const routeResults = await mapBounded(screens, REQUEST_CONCURRENCY, (screen) =>
    checkRoute(base, screen),
  );
  let routeFailures = 0;
  for (const result of routeResults) {
    if (result.failures.length === 0) {
      console.log(`[PASS] ${result.screen.kind} ${result.screen.route}`);
      continue;
    }
    routeFailures += 1;
    console.log(
      `[FAIL] ${result.screen.kind} ${result.screen.route} — ${result.failures.join("; ")}`,
    );
  }

  const totalFailures = staticResult.failures.length + routeFailures;
  const routePasses = screens.length - routeFailures;
  console.log(
    `[SUMMARY] routes ${routePasses}/${screens.length} passed, ${routeFailures} failed; ` +
      `static checks ${staticResult.failures.length === 0 ? "passed" : "failed"}`,
  );
  if (totalFailures > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
