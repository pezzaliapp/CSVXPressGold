// service-worker.js — CSVXpressGold (v1.1.3)
// Obiettivo: evitare JS "vecchio" che manipola il DOM.
// Strategia:
// - Navigations (index.html): NETWORK-FIRST (così la shell si aggiorna)
// - app.js / style.css: STALE-WHILE-REVALIDATE (subito cached, ma si aggiorna in background)
// - altri asset locali: CACHE-FIRST
// - CDN: NETWORK-FIRST

const CACHE_NAME = 'csvxpressgold-v1.1.3';

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
  self.skipWaiting();
});

// ACTIVATE
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)));
    await self.clients.claim();
  })());
});

// opzionale: comando manuale per saltare waiting
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

// FETCH
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isCDN = url.hostname.includes('cdnjs.cloudflare.com');

  // 1) Navigations -> NETWORK FIRST (fondamentale per aggiornare la shell)
  if (req.mode === 'navigate') {
    event.respondWith(networkFirstWithCacheUpdate(new Request('./index.html', { cache: 'reload' })));
    return;
  }

  // 2) CDN -> NETWORK FIRST
  if (isCDN) {
    event.respondWith(networkFirst(req));
    return;
  }

  // 3) Locali: app.js e style.css -> Stale-While-Revalidate (anti “JS vecchio”)
  if (isSameOrigin) {
    const path = url.pathname.replace(/\/+$/, '');
    if (path.endsWith('/app.js') || path.endsWith('/style.css')) {
      event.respondWith(staleWhileRevalidate(req));
      return;
    }
    // 4) Altri asset locali -> CACHE FIRST (ignoreSearch per evitare duplicati ?v=)
    event.respondWith(cacheFirstIgnoreSearch(req));
    return;
  }

  // fallback
  event.respondWith(networkFirst(req));
});

// ---------- STRATEGIE ----------

function normalizeKey(req) {
  const u = new URL(req.url);
  // normalizza la chiave togliendo querystring (evita duplicati in cache)
  u.search = '';
  return new Request(u.toString(), { method: 'GET' });
}

async function cacheFirstIgnoreSearch(req) {
  const cache = await caches.open(CACHE_NAME);
  const key = normalizeKey(req);

  const cached = await cache.match(key);
  if (cached) return cached;

  try {
    const res = await fetch(req);
    if (res && res.status === 200) cache.put(key, res.clone());
    return res;
  } catch (e) {
    // fallback: prova index
    return (await cache.match(normalizeKey(new Request('./index.html')))) || Response.error();
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE_NAME);
  const key = normalizeKey(req);

  const cached = await cache.match(key);
  const fetchPromise = fetch(req)
    .then((res) => {
      if (res && res.status === 200) cache.put(key, res.clone());
      return res;
    })
    .catch(() => null);

  // rispondi subito con cache se c'è, intanto aggiorna in background
  return cached || (await fetchPromise) || Response.error();
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  const key = normalizeKey(req);

  try {
    const res = await fetch(req);
    if (res && res.status === 200) cache.put(key, res.clone());
    return res;
  } catch (e) {
    const cached = await cache.match(key);
    return cached || Response.error();
  }
}

async function networkFirstWithCacheUpdate(req) {
  // usato per index.html: network-first, fallback cache
  return networkFirst(req);
}
