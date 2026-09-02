// Cleaner PWA shell cache (OPS-6): the app shell loads offline; data comes from the local cache in the page.
const CACHE = "pms-cleaner-v1";
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/cleaner"])));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.pathname.startsWith("/api/")) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches
          .open(CACHE)
          .then((c) => c.put(e.request, copy))
          .catch(() => undefined);
        return res;
      })
      .catch(() => caches.match(e.request).then((m) => m ?? caches.match("/cleaner"))),
  );
});
