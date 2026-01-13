// service-worker.js — CSVXpressGold (FIX HARD)
// Obiettivo: evitare JS vecchio.
// Strategia:
// - Navigations (index.html): NETWORK-FIRST (fallback cache)
// - app.js + style.css: NETWORK-FIRST (fallback cache)  ✅ FIX
// - altri asset locali: CACHE-FIRST (con ignore query)
// - CDN: NETWORK-FIRST

const CACHE_NAME = 'csvxpressgold-v1.1.4'; // 🔥 bump

// Base URL corretto anche su GitHub Pages
const SCOPE = self.registration.scope; // es: https://user.github.io/repo/
const BASE = new URL(SCOPE);

// Helper per costruire URL assoluti nella scope
const u = (p) => new URL(p, BASE).toString();

const ASSETS = [
  u('./'),
  u('./index.html'),
  u('./style.css'),
  u('./app.js'),
  u('./manifest.json'),
  u('./icon/CSVXpressGold-192.png'),
  u('./icon/CSVXpressGold-512.png'),
  u('./icon/CSVXpressGold-1024.png'),
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

// opzionale
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

  // 1) Navigations -> index.html network-first
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(u('./index.html')));
    return;
  }

  // 2) CDN -> network-first
  if (isCDN) {
    event.respondWith(networkFirst(req));
    return;
  }

  // 3) Locali
  if (isSameOrigin) {
    const path = url.pathname;

    // ✅ FIX: app.js + style.css network-first (evita JS vecchio)
    if (path.endsWith('/app.js') || path.endsWith('/style.css')) {
      event.respondWith(networkFirst(req));
      return;
    }

    // altri asset locali cache-first (no duplicati query)
    event.respondWith(cacheFirstIgnoreSearch(req));
    return;
  }

  event.respondWith(networkFirst(req));
});

// ---------- STRATEGIE ----------

function normalizeKey(req) {
  const u = new URL(req.url);
  u.search = '';
  return u.toString();
}

async function cacheFirstIgnoreSearch(req) {
  const cache = await caches.open(CACHE_NAME);
  const key = normalizeKey(req);

  const cached = await cache.match(key);
  if (cached) return cached;

  try {
    const res = await fetch(req);
    if (res && res.status === 200) await cache.put(key, res.clone());
    return res;
  } catch (e) {
    const fallback = await cache.match(u('./index.html'));
    return fallback || Response.error();
  }
}

async function networkFirst(reqOrUrl) {
  const cache = await caches.open(CACHE_NAME);
  const req = (typeof reqOrUrl === 'string') ? new Request(reqOrUrl, { cache: 'no-store' }) : reqOrUrl;
  const key = (typeof reqOrUrl === 'string') ? reqOrUrl : normalizeKey(req);

  try {
    const res = await fetch(req);
    if (res && res.status === 200) await cache.put(key, res.clone());
    return res;
  } catch (e) {
    const cached = await cache.match(key);
    return cached || Response.error();
  }
}
