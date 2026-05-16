const CACHE  = 'nest-v7';
const SHELL  = ['/nest/', '/nest/index.html'];

// Install: cache the app shell
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

// Activate: remove old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);

  // ── Rule 1: Non-GET requests (PUT, POST, DELETE) ──────────────────────
  // NEVER cache these. Pass straight to network.
  // This is critical — GitHub API sync uses PUT. Trying to cache a PUT
  // response throws a TypeError on iOS standalone mode and kills the request.
  if (req.method !== 'GET') {
    e.respondWith(fetch(req));
    return;
  }

  // ── Rule 2: External APIs (GitHub, Frankfurter, CDN) ─────────────────
  // Always go network-first. Fall back to cache only if network fails.
  if (url.hostname !== self.location.hostname) {
    e.respondWith(
      fetch(req)
        .then(res => {
          // Only cache CDN assets (Chart.js), not API responses
          if (url.hostname.includes('jsdelivr') && res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(req, clone));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // ── Rule 3: App shell files (same origin, GET) ────────────────────────
  // Cache-first for offline support.
  e.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(req, clone));
        }
        return res;
      });
    })
  );
});
