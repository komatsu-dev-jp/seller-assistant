import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

function readOption(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

const baseUrl = readOption("--base-url", "http://127.0.0.1:3031").replace(/\/+$/u, "");
const debugPort = Number(readOption("--debug-port", "9361"));
const precacheTimeoutMs = Number(readOption("--precache-timeout-ms", "90000"));
if (!Number.isInteger(debugPort) || debugPort <= 0 || debugPort > 65535) {
  throw new Error(`--debug-port must be an integer from 1 to 65535. Received: ${debugPort}`);
}
if (!Number.isInteger(precacheTimeoutMs) || precacheTimeoutMs <= 0) {
  throw new Error(
    `--precache-timeout-ms must be a positive integer. Received: ${precacheTimeoutMs}`,
  );
}
const reviewUrl = new URL(baseUrl);
const basePath = reviewUrl.pathname.replace(/\/+$/u, "");
const serviceWorkerUrl = basePath ? `${basePath}/sw.js` : "/sw.js";
const serviceWorkerScope = basePath ? `${basePath}/` : "/";
const skipHttpPreflight = process.argv.includes("--skip-http-preflight");
const outputDirectory = path.resolve(
  readOption("--output-dir", "output/playwright/review-offline-verification"),
);
const temporaryProfilePrefix = "resale-review-offline-";
const profileDirectory = await mkdtemp(path.join(os.tmpdir(), temporaryProfilePrefix));
const chromePath =
  process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

await mkdir(outputDirectory, { recursive: true });

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function withTimeout(promise, milliseconds, label) {
  return Promise.race([
    promise,
    delay(milliseconds).then(() => {
      throw new Error(`${label} timed out after ${milliseconds}ms.`);
    }),
  ]);
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

async function waitForChrome() {
  let lastError;
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

async function verifyPrecacheResponses() {
  const workerUrl = `${baseUrl}/sw.js`;
  const response = await fetch(workerUrl);
  if (!response.ok) throw new Error(`Unable to load ${workerUrl}: ${response.status}`);
  const source = await response.text();
  const startMarker = "/* REVIEW_PRECACHE_START */";
  const endMarker = "/* REVIEW_PRECACHE_END */";
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);
  if (start < 0 || end <= start) throw new Error("Generated precache markers are missing.");
  const serializedUrls = source.slice(start + startMarker.length, end).match(/"(?:\\.|[^"\\])*"/gu);
  if (!serializedUrls) throw new Error("Generated precache list is empty.");
  const urls = serializedUrls.map((value) => JSON.parse(value));
  const failures = [];
  const batchSize = 1;
  for (let startIndex = 0; startIndex < urls.length; startIndex += batchSize) {
    const batch = urls.slice(startIndex, startIndex + batchSize);
    const results = await Promise.all(
      batch.map(async (url) => {
        try {
          const itemResponse = await fetch(new URL(url, workerUrl));
          return { url, status: itemResponse.status, ok: itemResponse.ok };
        } catch (error) {
          return { url, status: 0, ok: false, error: String(error) };
        }
      }),
    );
    failures.push(...results.filter((result) => !result.ok));
  }
  if (failures.length > 0) {
    throw new Error(`Precache HTTP failures: ${JSON.stringify(failures.slice(0, 20))}`);
  }
  return { urls: urls.length, failures: failures.length };
}

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.events = new Map();
    this.subscriptions = new Map();
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
      const subscribers = this.subscriptions.get(message.method) ?? [];
      subscribers.forEach((callback) => callback(message.params ?? {}));
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

  on(method, callback) {
    const subscribers = this.subscriptions.get(method) ?? [];
    subscribers.push(callback);
    this.subscriptions.set(method, subscribers);
  }

  close() {
    this.socket.close();
  }
}

async function navigate(client, url) {
  const loaded = client.once("Page.loadEventFired");
  const navigation = await client.send("Page.navigate", { url });
  if (navigation.errorText) {
    throw new Error(`Navigation failed for ${url}: ${navigation.errorText}`);
  }
  await withTimeout(loaded, 15000, `Page load for ${url}`);
  await client.send("Runtime.evaluate", {
    expression:
      "(async () => { if (document.fonts?.ready) await document.fonts.ready; await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))); })()",
    awaitPromise: true,
  });
}

async function evaluateValue(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? "Runtime evaluation failed.");
  }
  return result.result?.value;
}

function attachNetworkEvidence(client) {
  const events = [];
  const methods = [
    "Network.requestWillBeSent",
    "Network.requestWillBeSentExtraInfo",
    "Network.responseReceived",
    "Network.loadingFailed",
    "Network.requestServedFromCache",
  ];
  methods.forEach((method) => {
    client.on(method, (params) => events.push({ method, params }));
  });
  return events;
}

function summarizeNetworkEvidence(events, url = null) {
  const requestIds = new Set();
  events.forEach(({ params }) => {
    const eventUrl =
      params.request?.url ?? params.response?.url ?? params.redirectResponse?.url ?? null;
    if ((!url || eventUrl === url) && params.requestId) requestIds.add(params.requestId);
  });

  const relevant = events.filter(
    ({ params }) => params.requestId && requestIds.has(params.requestId),
  );
  const requests = relevant
    .filter(({ method }) => method === "Network.requestWillBeSent")
    .map(({ params }) => ({
      requestId: params.requestId,
      url: params.request?.url ?? null,
      method: params.request?.method ?? null,
      type: params.type ?? null,
    }));
  const responses = relevant
    .filter(({ method }) => method === "Network.responseReceived")
    .map(({ params }) => ({
      requestId: params.requestId,
      url: params.response?.url ?? null,
      type: params.type ?? null,
      status: params.response?.status ?? null,
      fromServiceWorker: params.response?.fromServiceWorker ?? false,
      fromDiskCache: params.response?.fromDiskCache ?? false,
      fromPrefetchCache: params.response?.fromPrefetchCache ?? false,
      fromEarlyHints: params.response?.fromEarlyHints ?? false,
      serviceWorkerResponseSource: params.response?.serviceWorkerResponseSource ?? null,
      cacheStorageCacheName: params.response?.cacheStorageCacheName ?? null,
      protocol: params.response?.protocol ?? null,
    }));
  const failures = relevant
    .filter(({ method }) => method === "Network.loadingFailed")
    .map(({ params }) => ({
      requestId: params.requestId,
      errorText: params.errorText ?? null,
      canceled: params.canceled ?? false,
      blockedReason: params.blockedReason ?? null,
    }));
  const extraInfo = relevant
    .filter(({ method }) => method === "Network.requestWillBeSentExtraInfo")
    .map(({ params }) => ({
      requestId: params.requestId,
      appliedNetworkConditionsId: params.appliedNetworkConditionsId ?? null,
    }));
  const servedFromCache = relevant
    .filter(({ method }) => method === "Network.requestServedFromCache")
    .map(({ params }) => ({ requestId: params.requestId }));

  return {
    url,
    requestIds: [...requestIds],
    requests,
    responses,
    failures,
    extraInfo,
    servedFromCache,
  };
}

async function overrideNavigatorOffline(client) {
  await client.send("Network.overrideNetworkState", {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0,
    connectionType: "none",
  });
}

async function setOffline(client) {
  const result = await client.send("Network.emulateNetworkConditionsByRule", {
    offline: true,
    emulateOfflineServiceWorker: true,
    matchedNetworkConditions: [
      {
        urlPattern: "",
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
        connectionType: "none",
        offline: true,
      },
    ],
  });
  await overrideNavigatorOffline(client);
  return { globalOffline: true, ruleIds: result.ruleIds ?? [] };
}

async function restoreNetwork(client) {
  await client.send("Network.emulateNetworkConditionsByRule", {
    offline: false,
    emulateOfflineServiceWorker: false,
    matchedNetworkConditions: [],
  });
  await client.send("Network.overrideNetworkState", {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
    connectionType: "none",
  });
}

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
    "--disable-software-rasterizer",
    "--disable-sync",
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

let client;
let offlineEnabled = false;
let serviceWorkerBypass = false;
try {
  await waitForChrome();
  const target = await fetchJson(`http://127.0.0.1:${debugPort}/json/new?about:blank`, {
    method: "PUT",
  });
  client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Network.enable");
  await client.send("ServiceWorker.enable");
  await client.send("Log.enable");

  const workerErrors = [];
  const runtimeExceptions = [];
  const logEntries = [];
  client.on("ServiceWorker.workerErrorReported", (event) => workerErrors.push(event));
  client.on("Runtime.exceptionThrown", (event) => runtimeExceptions.push(event));
  client.on("Log.entryAdded", (event) => logEntries.push(event.entry ?? event));

  console.log("[offline] Checking every generated precache URL over loopback HTTP.");
  const precacheHttp = skipHttpPreflight ? { skipped: true } : await verifyPrecacheResponses();
  console.log(`[offline] Precache HTTP: ${JSON.stringify(precacheHttp)}`);
  console.log("[offline] Opening the review app online.");
  await navigate(client, `${baseUrl}/mobile/screens/01/`);
  await delay(1500);
  const automaticRegistration = await evaluateValue(
    client,
    `(async () => ({
      supported: "serviceWorker" in navigator,
      secureContext: isSecureContext,
      registrations: (await navigator.serviceWorker.getRegistrations()).map((item) => item.scope),
      scripts: [...document.scripts].map((item) => item.src).filter(Boolean),
    }))()`,
  );
  automaticRegistration.registered = automaticRegistration.registrations.length > 0;
  console.log(`[offline] Automatic registration: ${JSON.stringify(automaticRegistration)}`);

  let directRegistrationProbe = null;
  if (!automaticRegistration.registered) {
    directRegistrationProbe = await evaluateValue(
      client,
      `(async () => {
        try {
          const registration = await navigator.serviceWorker.register(${JSON.stringify(serviceWorkerUrl)}, {
            scope: ${JSON.stringify(serviceWorkerScope)},
          });
          const worker = registration.installing ?? registration.waiting ?? registration.active;
          if (!worker) return { succeeded: true, scope: registration.scope, states: [] };
          const states = [worker.state];
          return await new Promise((resolve) => {
            let errorEvent = null;
            const finish = () => resolve({
              succeeded: worker.state === "activated",
              scope: registration.scope,
              states,
              errorEvent,
            });
            worker.addEventListener("error", (event) => {
              errorEvent = {
                message: event.message ?? null,
                filename: event.filename ?? null,
                lineno: event.lineno ?? null,
              };
            });
            worker.addEventListener("statechange", () => {
              states.push(worker.state);
              if (worker.state === "activated" || worker.state === "redundant") finish();
            });
            setTimeout(finish, 30000);
          });
        } catch (error) {
          return {
            succeeded: false,
            name: error instanceof Error ? error.name : "UnknownError",
            message: error instanceof Error ? error.message : String(error),
          };
        }
      })()`,
    );
    console.log(`[offline] Direct registration probe: ${JSON.stringify(directRegistrationProbe)}`);
  }
  console.log(
    `[offline] Browser diagnostics: ${JSON.stringify({ workerErrors, runtimeExceptions, logEntries })}`,
  );
  if (directRegistrationProbe && !directRegistrationProbe.succeeded) {
    throw new Error(
      `Service worker install failed: ${JSON.stringify({ directRegistrationProbe, workerErrors, runtimeExceptions, logEntries })}`,
    );
  }
  console.log("[offline] Waiting for service worker registration and precache.");
  const cacheState = await evaluateValue(
    client,
    `(async () => {
      const deadline = Date.now() + ${precacheTimeoutMs};
      let lastState = null;
      while (Date.now() < deadline) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        const registration = registrations[0];
        const names = (await caches.keys()).filter((name) => name.startsWith("resale-review-"));
        const cacheSizes = {};
        for (const name of names) {
          const cache = await caches.open(name);
          cacheSizes[name] = (await cache.keys()).length;
        }
        lastState = {
          registrations: registrations.map((item) => ({
            scope: item.scope,
            active: item.active?.state ?? null,
            installing: item.installing?.state ?? null,
            waiting: item.waiting?.state ?? null,
          })),
          cacheSizes,
          controlled: Boolean(navigator.serviceWorker.controller),
        };
        if (names.length === 1) {
          const cache = await caches.open(names[0]);
          const keys = await cache.keys();
          if (registration?.active?.state === "activated" && keys.length >= 750) {
            return {
              cacheName: names[0],
              cachedResponses: keys.length,
              controlled: Boolean(navigator.serviceWorker.controller),
              scope: registration.scope,
              timedOut: false,
            };
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return { timedOut: true, lastState };
    })()`,
  );

  if (cacheState.timedOut) {
    throw new Error(`Review precache did not finish: ${JSON.stringify(cacheState.lastState)}`);
  }

  if (!cacheState.controlled) {
    console.log("[offline] Reloading once so the active service worker controls the page.");
    await navigate(client, `${baseUrl}/mobile/screens/01/`);
    const controlled = await evaluateValue(
      client,
      `(() => Boolean(navigator.serviceWorker.controller))()`,
    );
    if (!controlled) throw new Error("The active service worker does not control the review page.");
    cacheState.controlled = true;
  }

  console.log("[offline] Disabling network access.");
  const networkEvidence = attachNetworkEvidence(client);
  const offlineConfiguration = await setOffline(client);
  offlineEnabled = true;
  const offlineNavigatorState = await evaluateValue(
    client,
    `(async () => {
      const deadline = Date.now() + 1000;
      let state = {
        online: navigator.onLine,
        connectionType: navigator.connection?.type ?? null,
        effectiveType: navigator.connection?.effectiveType ?? null,
      };
      while (state.online && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        state = {
          online: navigator.onLine,
          connectionType: navigator.connection?.type ?? null,
          effectiveType: navigator.connection?.effectiveType ?? null,
        };
      }
      return state;
    })()`,
  );

  // A request handled by the service worker can return an HTTP 404 even when
  // the network is unavailable. Use a unique URL with the service worker
  // bypassed as the control: a real network response makes this proof fail,
  // while a loadingFailed event proves that Chrome blocked the request.
  const probeUrl = `${baseUrl}/__network_must_be_offline__?probe=${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
  await client.send("Network.setBypassServiceWorker", { bypass: true });
  serviceWorkerBypass = true;
  const probeEventStart = networkEvidence.length;
  const probeFetch = await evaluateValue(
    client,
    `(async () => {
      try {
        const response = await fetch(${JSON.stringify(probeUrl)}, {
          cache: "no-store",
          credentials: "omit",
          redirect: "error",
        });
        return { blocked: false, status: response.status, type: response.type };
      } catch (error) {
        return {
          blocked: true,
          name: error instanceof Error ? error.name : "UnknownError",
          message: error instanceof Error ? error.message : String(error),
        };
      }
    })()`,
  );
  await delay(250);
  const probeEvidence = summarizeNetworkEvidence(networkEvidence.slice(probeEventStart), probeUrl);
  const configuredRuleIds = new Set(offlineConfiguration.ruleIds);
  const networkRuleApplied = probeEvidence.extraInfo.some((item) =>
    configuredRuleIds.has(item.appliedNetworkConditionsId),
  );
  const disconnectedByChrome = probeEvidence.failures.some(
    (item) => item.errorText === "net::ERR_INTERNET_DISCONNECTED",
  );
  const offlineNetworkProbe = {
    url: probeUrl,
    bypassServiceWorker: true,
    fetch: probeFetch,
    evidence: probeEvidence,
    configuredRuleIds: offlineConfiguration.ruleIds,
    globalOffline: offlineConfiguration.globalOffline,
    networkRuleApplied,
    disconnectedByChrome,
    blocked:
      probeFetch.blocked === true &&
      probeEvidence.requests.length > 0 &&
      probeEvidence.failures.length > 0 &&
      probeEvidence.responses.length === 0 &&
      disconnectedByChrome &&
      (offlineConfiguration.globalOffline || networkRuleApplied),
  };
  await client.send("Network.setBypassServiceWorker", { bypass: false });
  serviceWorkerBypass = false;
  console.log(`[offline] Network-block proof: ${JSON.stringify(offlineNetworkProbe)}`);
  console.log(`[offline] Navigator network state: ${JSON.stringify(offlineNavigatorState)}`);

  const checks = [
    { path: "/mobile/screens/49/", expectedText: "作成・取込履歴" },
    { path: "/pc/52/", expectedText: "外部連携の状態" },
  ];
  const results = [];
  for (const check of checks) {
    console.log(`[offline] Opening ${check.path} without network access.`);
    const routeEventStart = networkEvidence.length;
    const routeUrl = `${baseUrl}${check.path}`;
    await navigate(client, `${baseUrl}${check.path}`);
    // Page.navigate can create a new renderer. Reapply the navigator override
    // so navigator.onLine is verified in the document that was just loaded.
    await overrideNavigatorOffline(client);
    await delay(250);
    const pageState = await evaluateValue(
      client,
      `(() => ({
        pathname: location.pathname,
        title: document.title,
        expectedTextFound: document.body.innerText.includes(${JSON.stringify(check.expectedText)}),
        notFound: document.body.innerText.includes("404") || document.body.innerText.includes("This page could not be found"),
        online: navigator.onLine,
      }))()`,
    );
    const routeEvidence = summarizeNetworkEvidence(networkEvidence.slice(routeEventStart));
    const documentResponse =
      [...routeEvidence.responses]
        .reverse()
        .find((response) => response.url === routeUrl && response.type === "Document") ??
      [...routeEvidence.responses].reverse().find((response) => response.url === routeUrl) ??
      null;
    const baseOrigin = new URL(baseUrl).origin;
    const sameOriginResponses = routeEvidence.responses.filter((response) => {
      try {
        return new URL(response.url).origin === baseOrigin;
      } catch {
        return false;
      }
    });
    const directNetworkResponses = sameOriginResponses.filter(
      (response) =>
        !response.fromServiceWorker && !response.fromDiskCache && !response.fromPrefetchCache,
    );
    const serviceWorkerNetworkResponses = sameOriginResponses.filter(
      (response) =>
        response.fromServiceWorker && response.serviceWorkerResponseSource === "network",
    );
    const servedFromCacheStorage =
      documentResponse?.status === 200 &&
      documentResponse?.fromServiceWorker === true &&
      documentResponse.serviceWorkerResponseSource === "cache-storage";
    results.push({
      ...check,
      ...pageState,
      network: {
        requestedUrl: routeUrl,
        documentResponse,
        servedFromCacheStorage,
        directNetworkResponses,
        serviceWorkerNetworkResponses,
        evidence: routeEvidence,
        noSuccessfulNetworkResponse:
          directNetworkResponses.length === 0 && serviceWorkerNetworkResponses.length === 0,
      },
    });
  }

  const failures = results.filter(
    (result) =>
      result.pathname !== `${basePath}${result.path}` ||
      !result.expectedTextFound ||
      result.notFound ||
      result.online !== false ||
      !result.network.servedFromCacheStorage ||
      !result.network.noSuccessfulNetworkResponse,
  );
  const report = {
    baseUrl,
    precacheHttp,
    automaticRegistration,
    directRegistrationProbe,
    cache: cacheState,
    offlineNetworkProbe,
    offlineNavigatorState,
    offlineRoutes: results,
    passed:
      automaticRegistration.registered &&
      offlineNetworkProbe.blocked &&
      offlineNavigatorState.online === false &&
      failures.length === 0,
  };
  await writeFile(
    path.join(outputDirectory, "offline-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) {
    const reasons = [
      ...(!automaticRegistration.registered ? ["automatic service-worker registration"] : []),
      ...(!offlineNetworkProbe.blocked ? ["network-offline CDP proof"] : []),
      ...(offlineNavigatorState.online !== false ? ["navigator.onLine override"] : []),
      ...failures.map((item) => item.path),
    ];
    throw new Error(`Offline verification failed for: ${reasons.join(", ")}`);
  }
} finally {
  if (serviceWorkerBypass && client) {
    await client.send("Network.setBypassServiceWorker", { bypass: false }).catch(() => undefined);
  }
  if (offlineEnabled && client) {
    await restoreNetwork(client).catch(() => undefined);
  }
  client?.close();
  chrome.kill();
  await delay(300);
  const resolvedTempRoot = path.resolve(os.tmpdir());
  const resolvedProfile = path.resolve(profileDirectory);
  if (resolvedProfile.startsWith(`${resolvedTempRoot}${path.sep}${temporaryProfilePrefix}`)) {
    await rm(resolvedProfile, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    }).catch(() => undefined);
  }
}
