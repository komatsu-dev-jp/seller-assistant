import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const numericMobile = Array.from({ length: 49 }, (_, index) => String(index + 1).padStart(2, "0"));
const mobileKeys = [
  ...numericMobile,
  ...Array.from({ length: 7 }, (_, index) => `photo-${String(index + 1).padStart(2, "0")}`),
  ...Array.from({ length: 7 }, (_, index) => `box-${String(index + 1).padStart(2, "0")}`),
  ...Array.from({ length: 6 }, (_, index) => `sales-${String(index + 1).padStart(2, "0")}`),
  ...Array.from({ length: 6 }, (_, index) => `genre-suit-${String(index + 1).padStart(2, "0")}`),
];
const pcKeys = Array.from({ length: 52 }, (_, index) => String(index + 1).padStart(2, "0"));

function readOption(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

const baseUrl = readOption("--base-url", "http://127.0.0.1:3005").replace(/\/+$/u, "");
const platform = readOption("--platform", "all");
const outputDirectory = path.resolve(readOption("--output-dir", "output/playwright/final-build"));
const chromePath =
  process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const debugPort = Number(readOption("--debug-port", "9338"));
const pcFrom = Number(readOption("--pc-from", "1"));
const pcTo = Number(readOption("--pc-to", "52"));
const profileDirectoryPrefix = "resale-approved-ui-";

if (!new Set(["all", "mobile", "pc"]).has(platform)) {
  throw new Error(`Unsupported --platform value: ${platform}`);
}
if (
  !Number.isInteger(pcFrom) ||
  !Number.isInteger(pcTo) ||
  pcFrom < 1 ||
  pcTo > pcKeys.length ||
  pcFrom > pcTo
) {
  throw new Error(`Invalid PC range: ${pcFrom}..${pcTo}; expected 1..${pcKeys.length}.`);
}

const selectedPcKeys = pcKeys.filter((key) => {
  const screenNumber = Number(key);
  return screenNumber >= pcFrom && screenNumber <= pcTo;
});

await mkdir(outputDirectory, { recursive: true });
const profileDirectory = await mkdtemp(path.join(os.tmpdir(), profileDirectoryPrefix));

const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    "--disable-gpu",
    "--disable-gpu-sandbox",
    "--disable-background-networking",
    "--disable-breakpad",
    "--disable-client-side-phishing-detection",
    "--disable-component-update",
    "--disable-crash-reporter",
    "--disable-default-apps",
    "--disable-domain-reliability",
    "--disable-sync",
    "--hide-scrollbars",
    "--no-pings",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-allow-origins=*",
    "--remote-debugging-address=127.0.0.1",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profileDirectory}`,
    "about:blank",
  ],
  { stdio: "ignore", windowsHide: true },
);

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

async function waitForChrome() {
  let lastError;
  // Chrome can need more than ten seconds to start on a busy Windows host.
  // Keep the retry bounded, but allow enough time for a clean fidelity run.
  for (let attempt = 0; attempt < 300; attempt += 1) {
    try {
      return await fetchJson(`http://127.0.0.1:${debugPort}/json/version`);
    } catch (error) {
      lastError = error;
      await delay(100);
    }
  }
  throw lastError ?? new Error("Chrome DevTools did not become ready.");
}

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.events = new Map();
    this.listening = false;
  }

  async connect() {
    if (this.socket.readyState !== WebSocket.OPEN) {
      await new Promise((resolve, reject) => {
        this.socket.addEventListener("open", resolve, { once: true });
        this.socket.addEventListener("error", reject, { once: true });
      });
    }
    if (this.listening) return;
    this.listening = true;
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const waiter = this.pending.get(message.id);
        if (!waiter) return;
        this.pending.delete(message.id);
        if (message.error) waiter.reject(new Error(message.error.message));
        else waiter.resolve(message.result ?? {});
        return;
      }
      const listeners = this.events.get(message.method) ?? [];
      listeners.splice(0).forEach((resolve) => resolve(message.params ?? {}));
    });
    this.socket.addEventListener("close", (event) => {
      const error = new Error(
        `Chrome DevTools connection closed (${event.code}${event.reason ? `: ${event.reason}` : ""}).`,
      );
      this.pending.forEach((waiter) => waiter.reject(error));
      this.pending.clear();
    });
  }

  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  once(method) {
    return new Promise((resolve) => {
      const listeners = this.events.get(method) ?? [];
      listeners.push(resolve);
      this.events.set(method, listeners);
    });
  }

  close() {
    this.socket.close();
  }
}

async function capture(client, { url, width, height, fileName }) {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: width,
    screenHeight: height,
  });
  const loaded = client.once("Page.loadEventFired");
  await client.send("Page.navigate", { url });
  await loaded;
  await client.send("Runtime.evaluate", {
    expression:
      "(async () => { window.scrollTo(0, 0); if (document.fonts?.ready) await document.fonts.ready; await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))); })()",
    awaitPromise: true,
  });
  await delay(80);
  const result = await client.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await writeFile(path.join(outputDirectory, fileName), Buffer.from(result.data, "base64"));

  const metricsResult = await client.send("Runtime.evaluate", {
    expression: `(() => {
      const root = document.documentElement;
      const body = document.body;
      const scrollWidth = Math.max(root?.scrollWidth ?? 0, body?.scrollWidth ?? 0);
      const scrollHeight = Math.max(root?.scrollHeight ?? 0, body?.scrollHeight ?? 0);
      const externalResources = performance
        .getEntriesByType("resource")
        .map((entry) => entry.name)
        .filter((resourceUrl) => {
          try {
            const parsed = new URL(resourceUrl, location.href);
            return (parsed.protocol === "http:" || parsed.protocol === "https:") &&
              parsed.origin !== location.origin;
          } catch {
            return false;
          }
        });
      const clippedInteractiveElements = [...document.querySelectorAll(
        "a, button, input, textarea, select, [role='button']",
      )]
        .filter((element) => {
          const style = getComputedStyle(element);
          if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
            return false;
          }
          const rect = element.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) return false;
          return (
            rect.left < -1 ||
            rect.top < -1 ||
            rect.right > window.innerWidth + 1 ||
            rect.bottom > window.innerHeight + 1
          );
        })
        .map((element) => ({
          tag: element.tagName.toLowerCase(),
          label: (element.getAttribute("aria-label") || element.textContent || "")
            .replace(/\\s+/gu, " ")
            .trim()
            .slice(0, 100),
          rect: (() => {
            const rect = element.getBoundingClientRect();
            return {
              left: Math.round(rect.left),
              top: Math.round(rect.top),
              right: Math.round(rect.right),
              bottom: Math.round(rect.bottom),
            };
          })(),
        }));
      return {
        pathname: location.pathname,
        title: document.title,
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        scrollWidth,
        scrollHeight,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        horizontalOverflow: scrollWidth > window.innerWidth + 1,
        verticalOverflow: scrollHeight > window.innerHeight + 1,
        clippedInteractiveElements,
        externalResources: [...new Set(externalResources)],
      };
    })()`,
    returnByValue: true,
  });

  return {
    url,
    fileName,
    expectedViewport: { width, height },
    ...(metricsResult.result?.value ?? {}),
  };
}

let client;
try {
  await waitForChrome();
  const target = await fetchJson(`http://127.0.0.1:${debugPort}/json/new?about:blank`, {
    method: "PUT",
  });
  client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();
  await client.send("Page.enable");
  await client.send("Runtime.enable");

  let completed = 0;
  const captureReport = [];
  if (platform === "all" || platform === "mobile") {
    for (const key of mobileKeys) {
      captureReport.push(
        await capture(client, {
          url: `${baseUrl}/mobile/screens/${key}`,
          width: 390,
          height: 844,
          fileName: `mobile-final-all-${key}.png`,
        }),
      );
      completed += 1;
      console.log(`[${completed}] mobile ${key}`);
    }
  }

  if (platform === "all" || platform === "pc") {
    for (const key of selectedPcKeys) {
      captureReport.push(
        await capture(client, {
          url: `${baseUrl}/pc/${Number(key)}`,
          width: 1440,
          height: 960,
          fileName: `pc-final-all-${key}.png`,
        }),
      );
      completed += 1;
      console.log(`[${completed}] pc ${key}`);
    }
  }

  await writeFile(
    path.join(outputDirectory, "capture-report.json"),
    `${JSON.stringify(captureReport, null, 2)}\n`,
  );

  const viewportFailures = captureReport.filter(
    (entry) =>
      entry.innerWidth !== entry.expectedViewport.width ||
      entry.innerHeight !== entry.expectedViewport.height ||
      entry.scrollX !== 0 ||
      entry.scrollY !== 0 ||
      entry.horizontalOverflow ||
      entry.verticalOverflow ||
      (entry.clippedInteractiveElements?.length ?? 0) > 0,
  );
  const externalResourceFailures = captureReport.filter(
    (entry) => (entry.externalResources?.length ?? 0) > 0,
  );
  console.log(`Captured ${completed} approved UI routes in ${outputDirectory}.`);
  console.log(
    `Viewport checks: ${captureReport.length - viewportFailures.length}/${captureReport.length} passed; ` +
      `external resources: ${externalResourceFailures.length} routes.`,
  );
  if (viewportFailures.length > 0 || externalResourceFailures.length > 0) {
    const failedFiles = [
      ...new Set([
        ...viewportFailures.map((entry) => entry.fileName),
        ...externalResourceFailures.map((entry) => entry.fileName),
      ]),
    ];
    throw new Error(`Capture verification failed for: ${failedFiles.join(", ")}`);
  }
} finally {
  client?.close();
  chrome.kill();
  const resolvedTempRoot = path.resolve(os.tmpdir());
  const resolvedProfile = path.resolve(profileDirectory);
  if (resolvedProfile.startsWith(`${resolvedTempRoot}${path.sep}${profileDirectoryPrefix}`)) {
    await rm(resolvedProfile, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    }).catch(() => undefined);
  }
}
