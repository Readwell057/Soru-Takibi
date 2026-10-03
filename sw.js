// Soru Takibi — service worker.
// Strategy: network-first with a short timeout (so a new deploy is picked up quickly when
// online, and a blocked/filtered network falls back to cache fast instead of hanging),
// falling back to the cache when the network fails or a response was never reached.
// IMPORTANT: for this to work on a network that blocks the site, the app must have been
// opened at least once successfully (e.g. at home, or on mobile data) so this service
// worker gets installed and the app shell gets cached. After that first successful visit,
// it will keep opening even on a network that blocks this site entirely.
const CACHE = 'soru-takibi-v2';
const CORE_SHELL = ['./', './index.html', './manifest.json'];
// Optional — only present if the person uploaded them to self-host the libraries.
// Cached individually (not with addAll) so a missing file doesn't break install.
const OPTIONAL_SHELL = [
  './chart.umd.min.js',
  './jspdf.umd.min.js',
  './pdf.min.js',
  './pdf.worker.min.js',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      try { await cache.addAll(CORE_SHELL); } catch (e) { /* core files should exist; ignore if not */ }
      await Promise.all(OPTIONAL_SHELL.map(async (url) => {
        try {
          const res = await fetch(url, { cache: 'no-store' });
          if (res && res.ok) await cache.put(url, res);
        } catch (e) { /* file not uploaded / not reachable yet — fine, skip it */ }
      }));
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    Promise.race([fetch(event.request), timeout(4000)])
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => {});
        return res;
      })
      .catch(() =>
        caches.match(event.request).then((cached) => {
          if (cached) return cached;
          if (event.request.mode === 'navigate') return caches.match('./index.html');
          return Response.error();
        })
      )
  );
});
