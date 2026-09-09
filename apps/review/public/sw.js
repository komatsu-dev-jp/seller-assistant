const CACHE_NAME = "resale-review-template";
const CACHE_PREFIX = "resale-review-";
const PRECACHE_URLS = [
  /* REVIEW_PRECACHE_START */
  "./",
  /* REVIEW_PRECACHE_END */
];
async function precacheReview() {
  const cache = await caches.open(CACHE_NAME);
  // Fetch and store one response at a time. This is deliberately conservative:
  // it works on GitHub Pages and on basic local HTTP/1.0 servers that can drop
  // bursty Cache.addAll installs even when every generated URL is valid.
  for (const relativeUrl of PRECACHE_URLS) {
    const request = new Request(new URL(relativeUrl, self.location.href));
    try {
      const response = await fetch(request);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      await cache.put(request, response);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[review-precache] ${request.url}: ${message}`);
      throw new Error(`Precache failed for ${request.url}: ${message}`, { cause: error });
    }
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheReview().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then(async (cached) => {
      if (cached) return cached;

      try {
        return await fetch(event.request);
      } catch (error) {
        if (event.request.mode === "navigate") {
          const fallback = await caches.match("./404.html");
          if (fallback) return fallback;
        }
        throw error;
      }
    }),
  );
});
