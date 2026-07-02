/* موجة service worker — offline shell cache */
const CACHE = "mawja-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./i18n.js",
  "./engine.js",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // never cache measurement/API traffic — always hit the network
  if (url.hostname.includes("cloudflare.com") ||
      url.hostname.includes("dns.google") ||
      url.hostname.includes("quad9.net") ||
      url.hostname.includes("nextdns.io")) {
    return; // default network handling
  }
  if (e.request.method !== "GET") return;
  // cache-first for our own shell/fonts, fall back to network
  e.respondWith(
    caches.match(e.request).then((cached) =>
      cached || fetch(e.request).then((res) => {
        if (res.ok && (url.origin === location.origin || url.hostname.includes("gstatic") || url.hostname.includes("googleapis"))) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      }).catch(() => cached)
    )
  );
});
