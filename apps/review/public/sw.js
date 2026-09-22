const CACHE_NAME = "resale-review-template";
const CACHE_PREFIX = "resale-review-";
const LEGACY_CACHE_PREFIX = "resale-ops-public-review-";
const PRECACHE_URLS = [
  /* REVIEW_PRECACHE_START */
  "./",
  /* REVIEW_PRECACHE_END */
];
// This list limits runtime caching to files in the public static export.
// Never block replacement of a legacy worker on downloading the entire app.
const PUBLIC_PATHS = new Set(
  PRECACHE_URLS.map((relativeUrl) => new URL(relativeUrl, self.location.href).pathname),
);

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.allSettled(
          keys
            .filter(
              (key) =>
                (key.startsWith(CACHE_PREFIX) || key.startsWith(LEGACY_CACHE_PREFIX)) &&
                key !== CACHE_NAME,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .catch(() => undefined)
      .then(() => self.clients.claim())
      .then(async () => {
        const scopePath = new URL(self.registration.scope).pathname;
        const rootPath = scopePath.endsWith("/") ? scopePath : `${scopePath}/`;
        const windowClients = await self.clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });
        // Navigation fetches wait for activation to finish. Waiting for those
        // navigations here would keep this worker in "activating" forever.
        void Promise.allSettled(
          windowClients.map((client) => {
            const clientUrl = new URL(client.url);
            const isPublicReviewPage =
              clientUrl.origin === self.location.origin &&
              (clientUrl.pathname === rootPath.slice(0, -1) ||
                clientUrl.pathname.startsWith(rootPath));
            return isPublicReviewPage ? client.navigate(client.url) : undefined;
          }),
        );
      }),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  const publicPath = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
  if (!PUBLIC_PATHS.has(url.pathname) && !PUBLIC_PATHS.has(publicPath)) return;

  event.respondWith(
    fetch(new Request(event.request, { cache: "no-store" }))
      .then(async (response) => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(
            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(event.request, copy))
              .catch(() => undefined),
          );
        }
        return response;
      })
      .catch(async (error) => {
        // Only this release's cache is eligible. Never resurrect legacy HTML.
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(event.request, {
          ignoreSearch: event.request.mode === "navigate",
        });
        if (cached) return cached;
        throw error;
      }),
  );
});
