const CACHE_NAME = 'meter-ai-cache-v2';
const ASSETS = [
  '/',
  '/index.html',
  '/styles.css?v=1.0.2',
  '/script.js?v=1.0.1',
  '/assets/logo.svg',
  '/assets/logo-maskable.svg',
  '/privacy.html',
  '/terms.html'
];

// Install Event - Pre-cache core files
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Pre-caching static assets...');
        return cache.addAll(ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate Event - Clean up stale cache records
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Cleaning up old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Serve cached resource with network fallback
self.addEventListener('fetch', event => {
  // Only handle GET requests and local scope origins
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // Bypass cache for admin API queries or dashboard admin pages
  if (event.request.url.includes('/api/admin/') || event.request.url.includes('/admin')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) {
          // Serve from cache, fetch network in background to refresh cache (Stale-While-Revalidate)
          fetch(event.request).then(networkResponse => {
            if (networkResponse.status === 200) {
              caches.open(CACHE_NAME).then(cache => cache.put(event.request, networkResponse));
            }
          }).catch(() => { /* Silence fetch errors when offline */ });
          
          return cachedResponse;
        }

        return fetch(event.request).then(response => {
          // Cache newly requested landing assets on the fly
          if (response.status === 200 && response.type === 'basic') {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        });
      }).catch(() => {
        // Fallback for document navigation offline
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      })
  );
});
