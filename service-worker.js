// service-worker.js — bezpieczne cache.put (pomija chrome-extension i inne nie-http)
const CACHE_VERSION = 'v1';
const CACHE_NAME = `eregiojet-${CACHE_VERSION}`;
const ASSETS = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'manifest.json'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Bypass caching for Supabase API calls (keep fresh)
  if (url.hostname.includes('supabase.co') || url.pathname.startsWith('/rest/v1') || url.pathname.startsWith('/rpc')) {
    event.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }

  // For navigation requests (HTML) use network-first with fallback to cache
  if (req.mode === 'navigate' || (req.headers.get('accept') && req.headers.get('accept').includes('text/html'))) {
    event.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        try {
          if (copy && copy.url && (copy.url.startsWith('http://') || copy.url.startsWith('https://'))) {
            caches.open(CACHE_NAME).then(cache => cache.put(req, copy)).catch(()=>{});
          }
        } catch(e){}
        return res;
      }).catch(() => caches.match('index.html'))
    );
    return;
  }

  // For other requests use cache-first then network
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(networkRes => {
        try {
          if (networkRes && networkRes.url && (networkRes.url.startsWith('http://') || networkRes.url.startsWith('https://'))) {
            const copy = networkRes.clone();
            caches.open(CACHE_NAME).then(cache => {
              try { cache.put(req, copy); } catch (e) {}
            });
          }
        } catch (e) {}
        return networkRes;
      }).catch(() => {});
    })
  );
});

self.addEventListener('message', event => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
