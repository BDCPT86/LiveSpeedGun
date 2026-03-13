const CACHE_NAME = 'speedgun-v3';
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './style.css',
  './app.js',
  './bowlers.js',
  './video.js',
  './analyser.js',
  './review.js',
  './pwa.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Network-first for API calls, cache-first for assets
  if (e.request.url.includes('anthropic.com') || e.request.url.includes('fonts.googleapis')) {
    return; // Let these go straight to network
  }
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
