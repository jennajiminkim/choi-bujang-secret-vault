const CACHE = 'byte-back-public-app-preparation-v1';
const PUBLIC = ['/app/offline.html', '/app/icon-192.png', '/app/icon-512.png', '/app/manifest.webmanifest'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PUBLIC)));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== 'GET') return;
  // Only the public app navigation gets an offline fallback. API requests,
  // existing vault navigation, credentials and protected data are never cached.
  if (event.request.mode !== 'navigate' || !['/app/', '/app/index.html'].includes(url.pathname)) return;
  event.respondWith(fetch(event.request).catch(() => caches.open(CACHE).then(cache => cache.match('/app/offline.html'))));
});
