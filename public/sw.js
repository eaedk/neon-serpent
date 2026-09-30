// Offline support for the web/PWA build (not used inside the native apps).
// Pages are network-first (so updates arrive), other files cache-first
// (Vite gives them content hashes). The cache is filled as files load.
const CACHE = 'neon-serpent-v1';

const store = (request, res) => {
  if (res.ok) {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(request, copy));
  }
  return res;
};

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html', './manifest.webmanifest', './icon.svg'])));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then((res) => store(request, res)).catch(() => caches.match(request)));
    return;
  }
  event.respondWith(caches.match(request).then((hit) => hit || fetch(request).then((res) => store(request, res))));
});
