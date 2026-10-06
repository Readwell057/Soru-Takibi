// Soru Takibi — service worker.
// Strategy: network-first with a short timeout (so a new deploy is picked up quickly when
// online, and a blocked/filtered network falls back to cache fast instead of hanging),
// falling back to the cache when the network fails or a response was never reached.
// IMPORTANT: for this to work on a network that blocks the site, the app must have been
// opened at least once successfully (e.g. at home, or on mobile data) so this service
// worker gets installed and the app shell gets cached. After that first successful visit,
// it will keep opening even on a network that blocks this site entirely.
const CACHE = 'soru-takibi-v3';
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
  const isNavigation = event.request.mode === 'navigate';
  // The 4s race is only for the page itself — so a blocked network falls back to the
  // cached app shell quickly instead of hanging. Large files (pdf.js, fonts, chart.js)
  // are NOT raced against a timeout: on a slow connection a multi-MB file can genuinely
  // take longer than a few seconds, and capping it made real, successful downloads look
  // like failures. Those just get a normal network-first attempt with no artificial cap.
  const networkPromise = isNavigation ? Promise.race([fetch(event.request), timeout(4000)]) : fetch(event.request);
  event.respondWith(
    networkPromise
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => {});
        return res;
      })
      .catch(() =>
        caches.match(event.request).then((cached) => {
          if (cached) return cached;
          if (isNavigation) return caches.match('./index.html');
          return Response.error();
        })
      )
  );
});
