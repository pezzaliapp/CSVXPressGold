// service-worker.js — CSVXpressGold
// Cache-first per asset, network-first per CDN con fallback.
// IMPORTANT: usa path relativi (./) -> ok su GitHub Pages.

const CACHE_NAME = 'csvxpressgold-v1.1.0';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon/CSVXpressGold-192.png',
  './icon/CSVXpressGold-512.png',
  './icon/CSVXpressGold-1024.png',
  'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.3.2/papaparse.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null))
      )
    )
  );
  self.clients.claim();
});

// Strategia:
// - stessa origin: cache-first (veloce, offline)
// - CDN: network-first con fallback a cache (riduce problemi di CORS/aggiornamento)
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Solo GET
  if (req.method !== 'GET') return;

  const isSameOrigin = url.origin === self.location.origin;
  const isCDN = url.hostname.includes('cdnjs.cloudflare.com');

  if (isCDN) {
    event.respondWith(networkFirst(req));
    return;
  }

  if (isSameOrigin) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // default
  event.respondWith(networkFirst(req));
});

function cacheFirst(req) {
  return caches.match(req).then((cached) => {
    if (cached) return cached;
    return fetch(req)
      .then((res) => {
        // metti in cache solo risposte valide
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match('./index.html'));
  });
}

function networkFirst(req) {
  return fetch(req)
    .then((res) => {
      if (res && res.status === 200) {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
      }
      return res;
    })
    .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')));
}
