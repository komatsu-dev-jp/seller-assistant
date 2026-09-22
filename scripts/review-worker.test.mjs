import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

import { injectPrecacheManifest } from "./review-precache.mjs";

const origin = "https://example.test";
const scope = `${origin}/seller-assistant/`;
const home = `${scope}mobile/screens/04/`;
const paths = [
  ...Array.from({ length: 49 }, (_, i) => `mobile/screens/${String(i + 1).padStart(2, "0")}/`),
  ...[
    ["photo", 7],
    ["box", 7],
    ["sales", 6],
    ["genre-suit", 6],
  ].flatMap(([prefix, count]) =>
    Array.from(
      { length: count },
      (_, i) => `mobile/screens/${prefix}-${String(i + 1).padStart(2, "0")}/`,
    ),
  ),
  ...Array.from({ length: 52 }, (_, i) => `pc/${i + 1}/`),
];
const source = injectPrecacheManifest(readFileSync("apps/review/public/sw.js", "utf8"), {
  cacheName: "resale-review-current",
  urls: ["./", "./mobile/app/", "./_next/static/current.js", ...paths.map((p) => `./${p}`)],
});

function harness() {
  const handlers = {};
  const stores = new Map();
  const cacheFor = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const entries = stores.get(name);
    return {
      put: vi.fn(async (request, response) =>
        entries.set(request.url ?? request, response.clone()),
      ),
      match: vi.fn(async (request, options = {}) => {
        const key = request.url ?? request;
        const pair = [...entries].find(([url]) =>
          options.ignoreSearch ? url.split("?")[0] === key.split("?")[0] : url === key,
        );
        return pair?.[1].clone();
      }),
    };
  };
  const caches = {
    open: vi.fn(async (name) => cacheFor(name)),
    keys: vi.fn(async () => [...stores.keys()]),
    delete: vi.fn(async (name) => stores.delete(name)),
  };
  const clients = paths.map((path) => ({
    url: `${scope}${path}`,
    navigate: vi.fn(async () => undefined),
  }));
  clients.push({ url: `${origin}/another-app/`, navigate: vi.fn(async () => undefined) });
  const self = {
    location: { href: `${scope}sw.js`, origin },
    registration: { scope },
    skipWaiting: vi.fn(async () => undefined),
    clients: { claim: vi.fn(async () => undefined), matchAll: vi.fn(async () => clients) },
    addEventListener: (type, handler) => {
      handlers[type] = handler;
    },
  };
  class WorkerRequest {
    constructor(input, options = {}) {
      Object.assign(
        this,
        typeof input === "string" ? { url: input, method: "GET", mode: "navigate" } : input,
        options,
      );
    }
  }
  const fetch = vi.fn(async () => new globalThis.Response("current screen"));
  vm.runInNewContext(source, { self, caches, fetch, URL, Request: WorkerRequest });
  return {
    caches,
    cacheFor,
    stores,
    clients,
    self,
    fetch,
    async dispatch(type, request) {
      const waits = [];
      let response;
      handlers[type]({
        request,
        waitUntil: (p) => waits.push(p),
        respondWith: (p) => {
          response = p;
        },
      });
      let result;
      try {
        result = await response;
      } finally {
        await Promise.all(waits);
      }
      return result;
    },
    request: (url = home, mode = "navigate") => new WorkerRequest(url, { mode }),
  };
}

describe("public review worker upgrade", () => {
  it("saves a visited script and reuses it offline", async () => {
    const h = harness();
    const request = h.request(`${scope}_next/static/current.js`, "cors");
    expect(await (await h.dispatch("fetch", request)).text()).toBe("current screen");
    h.fetch.mockRejectedValue(new Error("offline"));
    expect(await (await h.dispatch("fetch", request)).text()).toBe("current screen");
  });
  it("replaces the old worker even when every asset download would fail", async () => {
    const h = harness();
    h.fetch.mockRejectedValue(new Error("offline asset"));
    await h.dispatch("install");
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.self.skipWaiting).toHaveBeenCalledOnce();
  });

  it("refreshes all 75 mobile and 52 PC clients while preserving unrelated caches", async () => {
    const h = harness();
    h.cacheFor("resale-review-old");
    h.cacheFor("resale-ops-public-review-v4");
    h.cacheFor("resale-review-current");
    h.cacheFor("another-app");
    h.clients[0].navigate.mockRejectedValue(new Error("closed tab"));
    await h.dispatch("activate");
    expect(paths).toHaveLength(127);
    for (const client of h.clients.slice(0, 127))
      expect(client.navigate).toHaveBeenCalledWith(client.url);
    expect(h.clients[127].navigate).not.toHaveBeenCalled();
    expect([...h.stores.keys()]).toEqual(["resale-review-current", "another-app"]);
    expect(h.self.clients.claim).toHaveBeenCalledOnce();
  });

  it("activates even when Safari refuses cache storage", async () => {
    const h = harness();
    h.caches.keys.mockRejectedValue(new Error("storage denied"));
    await h.dispatch("activate");
    expect(h.self.clients.claim).toHaveBeenCalledOnce();
    expect(h.clients[0].navigate).toHaveBeenCalled();
  });

  it("fetches fresh HTML for every page and stores visited pages for offline reuse", async () => {
    const h = harness();
    for (const path of paths) {
      const request = h.request(`${scope}${path}`);
      await h
        .cacheFor("resale-review-old")
        .put(request, new globalThis.Response("9:41 old chrome"));
      const response = await h.dispatch("fetch", request);
      expect(await response.text()).toBe("current screen");
    }
    expect(h.fetch).toHaveBeenCalledTimes(127);
    expect(h.fetch.mock.calls.every(([request]) => request.cache === "no-store")).toBe(true);
    h.fetch.mockRejectedValue(new Error("offline"));
    expect(await (await h.dispatch("fetch", h.request())).text()).toBe("current screen");
  });

  it("does not resurrect old HTML when the new page has never been visited offline", async () => {
    const h = harness();
    await h
      .cacheFor("resale-review-old")
      .put(h.request(), new globalThis.Response("9:41 old chrome"));
    h.fetch.mockRejectedValue(new Error("offline"));
    await expect(h.dispatch("fetch", h.request())).rejects.toThrow("offline");
  });

  it("still displays the network response when cache writes fail", async () => {
    const h = harness();
    h.caches.open.mockRejectedValue(new Error("quota exceeded"));
    expect(await (await h.dispatch("fetch", h.request())).text()).toBe("current screen");
  });

  it("does not cache HTTP failures or intercept another app", async () => {
    const h = harness();
    h.fetch.mockResolvedValue(new globalThis.Response("unavailable", { status: 503 }));
    expect((await h.dispatch("fetch", h.request())).status).toBe(503);
    expect(h.caches.open).not.toHaveBeenCalled();
    h.fetch.mockClear();
    expect(await h.dispatch("fetch", h.request(`${origin}/another-app/`))).toBeUndefined();
    expect(h.fetch).not.toHaveBeenCalled();
  });
});
