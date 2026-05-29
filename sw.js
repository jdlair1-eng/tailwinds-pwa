// HachikoLove PWA service worker.
//
// Strategy:
//   - App shell: precached on install, served cache-first for static GETs.
//   - Navigations: network-first with cache fallback so updates flow.
//   - Query POSTs: passed through to network; the page itself caches
//     successful responses in localStorage (last 10) for offline replay.
//     SWs can't key the Cache API on POST bodies cleanly, so we keep
//     offline query storage on the page side where it belongs.

const VERSION = "v3.1.0";
const SHELL_CACHE = `hachikolove-shell-${VERSION}`;
const SHELL_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  "https://cdn.jsdelivr.net/npm/marked/marked.min.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter(
            (k) =>
              (k.startsWith("hachikolove-shell-") || k.startsWith("tailwinds-shell-")) &&
              k !== SHELL_CACHE
          )
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Don't touch the Railway API — let it go straight to network so the page
  // can detect offline and fall back to its localStorage query cache.
  if (req.url.includes("railway.app")) return;

  // Only GETs are cacheable here.
  if (req.method !== "GET") return;

  // Navigations: network-first, fall back to cached shell.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Static assets: cache-first.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && res.type !== "opaqueredirect") {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
        }
        return res;
      });
    })
  );
});
