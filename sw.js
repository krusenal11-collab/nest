// Nest service worker — v13
// Goal: new versions of the app show up on the next launch (no more stale copies),
// while the app still opens offline.
const CACHE = 'nest-v13';
const SHELL_URL = '/nest/index.html';
const SHELL = ['/nest/', SHELL_URL];

// Install: fetch the shell straight from the network (cache:'reload' skips the
// browser's own 10‑minute GitHub Pages cache, which is what caused stale copies).
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(SHELL.map(u =>
        fetch(new Request(u, { cache: 'reload' })).then(r => { if (r.ok) return c.put(u, r); })
      )))
      .then(() => self.skipWaiting())
  );
});

// Activate: remove every old cache, take control of open pages.
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first with a short timeout; fall back to the saved copy when offline.
function networkFirst(url, cacheKey, fallbackKey) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  return fetch(url, { cache: 'no-cache', signal: ctrl.signal })
    .then(res => {
      clearTimeout(timer);
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(cacheKey, copy));
      }
      return res;
    })
    .catch(() => {
      clearTimeout(timer);
      return caches.match(cacheKey).then(m => m || (fallbackKey && caches.match(fallbackKey)) || Response.error());
    });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);

  // Rule 1: never touch non-GET requests (the GitHub sync uses PUT).
  if (req.method !== 'GET') {
    e.respondWith(fetch(req));
    return;
  }

  // Rule 2: other sites (GitHub API, exchange rates, Chart.js CDN) — network first.
  if (url.hostname !== self.location.hostname) {
    e.respondWith(
      fetch(req)
        .then(res => {
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

  // Rule 3: the app page itself — always check for the newest version first.
  if (req.mode === 'navigate' || url.pathname === '/nest/' || url.pathname === SHELL_URL) {
    e.respondWith(networkFirst(SHELL_URL, SHELL_URL, '/nest/'));
    return;
  }

  // Rule 4: other files from this site (icon, manifest) — network first, saved copy offline.
  e.respondWith(networkFirst(req.url, req, null));
});
