/*
 * Pour Choices service worker -- Phase 10 C2.
 *
 * DELIBERATELY BORING. A service worker is the easiest way to break an app permanently: cache the
 * wrong thing and users are served stale HTML forever, with no way for us to reach them. So the
 * rule here is narrow and absolute:
 *
 *   CACHE ONLY IMMUTABLE, CONTENT-HASHED, SAME-ORIGIN ASSETS. NEVER HTML. NEVER API DATA.
 *
 * `/_next/static/*` filenames contain a content hash, so a cached copy can never be stale -- a new
 * deploy produces new filenames, and the old page keeps working with the old ones. Everything else,
 * including every navigation and every Supabase call, goes straight to the network and is not
 * touched. That means no offline mode, which is the correct trade for a data-driven, auth-gated app
 * whose screens are meaningless without fresh data.
 *
 * It exists mainly so Web Push has somewhere to live (Phase 10 D3). Push and notificationclick
 * handlers get added there, not here, so this version stays easy to reason about.
 */

const VERSION = 'pc-v1';
const STATIC_CACHE = `${VERSION}-static`;

// Small, stable, and needed before the first paint of an installed app.
const PRECACHE = [
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      // Individually, so one 404 cannot fail the whole install and leave the app without a worker.
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/** Only immutable, same-origin static assets are cacheable. */
function isCacheable(url) {
  if (url.origin !== self.location.origin) return false;
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/apple-touch-icon.png' ||
    url.pathname === '/manifest.webmanifest'
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Never interfere with anything that changes state or renders a page. Navigations fall through
  // to the network untouched, which is what keeps a bad deploy recoverable by a plain reload.
  if (request.method !== 'GET') return;
  if (request.mode === 'navigate') return;

  const url = new URL(request.url);
  if (!isCacheable(url)) return;

  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request).then((response) => {
        // Only store a clean, complete same-origin response.
        if (response && response.status === 200 && response.type === 'basic') {
          const copy = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});

// Lets the page trigger an immediate update instead of waiting for the next navigation.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
