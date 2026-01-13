// service-worker.js — CSVXpressGold
// Cache-first per asset locali, network-first per CDN
// Path relativi (./) → OK GitHub Pages

const CACHE_NAME = 'csvxpressgold-v1.1.2'; // 🔥 bump versione
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

// INSTALL
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting(); // ⬅️ forza install immediato
});

// ACTIVATE
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((k) => {
          if (k !== CACHE_NAME) {
            return caches.delete(k); // 🧹 elimina vecchie cache
          }
        })
      )
    )
  );
  self.clients.claim(); // ⬅️ prende subito controllo
});

// FETCH
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // solo GET
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isCDN = url.hostname.includes('cdnjs.cloudflare.com');

  // CDN → network first
  if (isCDN) {
    event.respondWith(networkFirst(req));
    return;
  }

  // stessa origin → cache first
  if (isSameOrigin) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // fallback
  event.respondWith(networkFirst(req));
});

// ---------- STRATEGIE ----------

function cacheFirst(req) {
  return caches.match(req).then((cached) => {
    if (cached) return cached;

    return fetch(req)
      .then((res) => {
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
    .catch(() =>
      caches.match(req).then((cached) => cached || caches.match('./index.html'))
    );
}
