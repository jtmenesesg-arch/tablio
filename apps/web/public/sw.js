const CACHE_NAME = "tablio-shell-v1";
const STATIC_ASSETS = [
  "/fonts/plus-jakarta-sans-400.ttf",
  "/fonts/plus-jakarta-sans-500.ttf",
  "/fonts/plus-jakarta-sans-600.ttf",
  "/fonts/plus-jakarta-sans-700.ttf",
  "/fonts/plus-jakarta-sans-800.ttf",
  "/icons/tablio-192.svg",
  "/icons/tablio-512.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    requestUrl.origin !== self.location.origin ||
    requestUrl.pathname.startsWith("/api/") ||
    requestUrl.pathname.startsWith("/mesa/")
  ) {
    return;
  }
  if (
    requestUrl.pathname.startsWith("/fonts/") ||
    requestUrl.pathname.startsWith("/icons/")
  ) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached ?? fetch(event.request)),
    );
  }
});

