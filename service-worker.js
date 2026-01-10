const CACHE_NAME = 'eregiojet-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-256.png',
  '/icons/icon-384.png',
  '/icons/icon-512.png'
];

// Instalacja i cache podstawowych zasobów
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

// Aktywacja i czyszczenie starych cache'y
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

// Strategia fetch: cache-first dla zasobów statycznych, fallback do network
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(networkRes => {
        // runtime cache: zapisujemy kopię odpowiedzi (bez dużych zewnętrznych plików)
        return caches.open(CACHE_NAME).then(cache => {
          try { cache.put(req, networkRes.clone()); } catch(e) {}
          return networkRes;
        });
      }).catch(() => {
        // fallback: jeśli to żądanie HTML, zwróć index.html z cache
        if (req.headers.get('accept') && req.headers.get('accept').includes('text/html')) {
          return caches.match('/index.html');
        }
      });
    })
  );
});
