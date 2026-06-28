const CACHE_NAME = "onedesk-v5";
const ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./billing.js",
  "./data.js",
  "./vocab.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Se cachea uno por uno (no con addAll) a propósito: si un solo
      // archivo falla, addAll cancela TODA la instalación del service
      // worker, y sin un service worker instalado, Chrome no ofrece el
      // botón de "Instalar app". Con esto, un fallo aislado no tumba
      // el resto.
      Promise.all(
        ASSETS.map((url) =>
          cache.add(url).catch((err) => console.warn("No se pudo cachear:", url, err))
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Network-first for navigation, cache-first for static assets.
  // This keeps the app shell always available even with zero connectivity,
  // which is the #1 complaint OneDesk is designed to never repeat:
  // "the app went blank and I lost my work."
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && event.request.method === "GET") {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match("./index.html"));
    })
  );
});
