// Basic service worker for caching key files

const CACHE_NAME = 'pour-choices-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/assets/index-DXYZ123A.js', // Update with actual build hash if needed
  '/assets/index-UVW456B.css', // Update with actual build hash if needed
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

// Fetch event - serve from cache when offline, but exclude API calls
self.addEventListener('fetch', (event) => {
  // Don't intercept API requests - let them go to the network
  if (event.request.url.includes('/api/') ||
      event.request.url.includes('localhost:3000') ||
      event.request.url.includes('localhost:3001')) {
    return;
  }

  // Only cache GET requests for same-origin assets
  if (event.request.method === 'GET' &&
      new URL(event.request.url).origin === location.origin) {
    event.respondWith(
      caches.match(event.request)
        .then((response) => {
          return response || fetch(event.request);
        })
    );
  }
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});
