/*
 * Piñata app-shell service worker.
 *
 * Read this file as a privacy control, not a performance one. `/c/<slug>` is one URL that
 * renders two different projections — the owner's wishlist and the friends' secret ledger — and
 * every response on it is `private, no-store` precisely so that no cache anywhere can serve the
 * owner's page to a friend's device or the reverse. A worker that cached the wrong document
 * would undo RLS, the projections and the route headers in one line. So the rule here is a
 * closed allow-list: this worker stores bytes for the URLs listed in SHELL_URLS and nothing
 * else, ever. There is no pattern that matches a circle page, and the write path re-checks the
 * deny-list so a future edit to the allow-list cannot open a hole by accident.
 *
 * Four things make "structurally impossible" true rather than "unlikely":
 *
 * 1. Only GET requests are considered. Claims, contributions and card entries are POSTs and
 *    this worker does not look at them at all.
 * 2. Only same-origin responses are considered. A cross-origin response is opaque, and an
 *    opaque body in the cache is a body nobody audited.
 * 3. A response is stored only when it is a plain 200 `basic` response whose Cache-Control
 *    says neither no-store, no-cache nor private, and which sets no cookie. The RESPONSE header
 *    wins over the URL: a shell asset that starts declaring no-store stops being cached.
 * 4. Anything that is not on the allow-list is network-only. For navigations that is still
 *    network-only; the offline page is a different, public document, not a cached private one.
 *
 * skipWaiting/clientsClaim are deliberate. The cost is cosmetic: a document already on screen
 * keeps its parsed HTML while its next asset fetch may hit a newer shell, so a stylesheet can
 * land one navigation late. The benefit is that the code holding rules 1-4 is this file, and a
 * worker that refuses to be replaced is a worker that refuses to be fixed.
 */

const VERSION = 'v1';
const SHELL_CACHE = `pinata-shell-${VERSION}`;
const OFFLINE_URL = '/offline';

// The complete set of URLs this worker may store. Every entry is a public, non-personal,
// build-time artifact: the shared stylesheet, the four local brand fonts, the icon set, the
// manifest, and the offline document.
const SHELL_URLS = Object.freeze([
  '/pinata.css',
  '/fonts/syne-latin-700-normal.woff2',
  '/fonts/manrope-latin-400-normal.woff2',
  '/fonts/manrope-latin-600-normal.woff2',
  '/fonts/space-grotesk-latin-600-normal.woff2',
  '/icon.png',
  '/apple-icon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/manifest.webmanifest',
  OFFLINE_URL,
]);

// Shell bytes that may lag one load behind in exchange for an instant paint. Fonts and icons are
// not here: they only ever change when the file name changes, so serving them cache-first is
// not a freshness decision.
const REVALIDATED_URLS = new Set(['/pinata.css', '/manifest.webmanifest', OFFLINE_URL]);

/** Paths that must never be read from or written to this cache, whatever the allow-list says. */
function isNeverCacheable(pathname) {
  return (
    // The circle and every screen under it: two projections of one ledger.
    pathname === '/c' || pathname.startsWith('/c/') ||
    // Server-side data endpoints.
    pathname.startsWith('/api/') ||
    // RSC payloads, which carry the same per-role projection as the document.
    pathname.startsWith('/_next/data/') ||
    // Gift cards and card PNGs. Broad on purpose: it also covers /card-preview.js, which the
    // shell has no use for.
    pathname.includes('/card')
  );
}

/** The single gate in front of every cache write. Fail closed: unknown means do not store. */
function mayStore(url) {
  if (url.origin !== self.location.origin) return false;
  if (isNeverCacheable(url.pathname)) return false;
  return SHELL_URLS.includes(url.pathname);
}

// `max-age=0` and `must-revalidate` are deliberately NOT in here: Next answers a static
// document with exactly that, and refusing it would mean the offline page can never be cached,
// which is the one thing this worker exists to do. What is refused is the directives that say
// "this body is somebody's" — and a circle page says precisely that.
function refusesCaching(value) {
  return /(?:^|[,;])\s*(?:no-store|no-cache|private)\b/i.test(value ?? '');
}

function isStorable(request, response) {
  if (!response) return false;
  // 200 only: a redirect, a 204 or an error page is not the shell.
  if (response.status !== 200) return false;
  // `basic` only: same-origin, non-opaque, so the headers below are real and readable.
  if (response.type !== 'basic') return false;
  if (response.headers.get('set-cookie')) return false;
  if (refusesCaching(response.headers.get('cache-control'))) return false;
  if (refusesCaching(request.headers.get('cache-control'))) return false;
  if (['no-store', 'no-cache', 'reload-no-cache'].includes(request.cache)) return false;
  return true;
}

async function openShell() {
  return caches.open(SHELL_CACHE);
}

/** Background refresh of a shell asset. Never throws into the caller's response path. */
async function revalidate(cache, request, key) {
  try {
    const response = await fetch(request, { cache: 'reload' });
    if (isStorable(request, response)) await cache.put(key, response);
  } catch {
    // Offline or a dropped request: the cached shell is still the right answer.
  }
}

async function serveShell(event, request, url) {
  const cache = await openShell();
  // Keyed by pathname: these are static artifacts, so a cache-busting query is not a variant.
  const key = url.pathname;
  const cached = await cache.match(key);
  if (cached) {
    if (REVALIDATED_URLS.has(key)) event.waitUntil(revalidate(cache, request, key));
    return cached;
  }
  const response = await fetch(request);
  if (isStorable(request, response)) {
    event.waitUntil(cache.put(key, response.clone()));
  }
  return response;
}

/**
 * A navigation to anything that is not shell: `/c/<slug>` and its screens, `/app`, `/`.
 * Strictly to the network, with nothing written on the way. Only when the network itself
 * refuses does this return the cached offline document, which is a public page authored in
 * `src/app/offline/page.tsx` and contains no circle, person or amount.
 */
async function serveNavigation(request) {
  try {
    return await fetch(request);
  } catch {
    const offline = await (await openShell()).match(OFFLINE_URL);
    if (offline) return offline;
    throw new Error('pinata_offline_page_unavailable');
  }
}

async function precache() {
  const cache = await openShell();
  const results = await Promise.allSettled(
    SHELL_URLS.map(async (url) => {
      const request = new Request(url, { cache: 'reload' });
      const response = await fetch(request);
      // The same gate as the live path: a dev server that answers these with no-store simply
      // gets nothing cached, rather than a special case that could be wrong in production.
      if (!isStorable(request, response)) return;
      await cache.put(url, response);
    }),
  );
  const failed = results.filter((result) => result.status === 'rejected').length;
  if (failed > 0) console.warn(`pinata shell precache: ${failed} of ${SHELL_URLS.length} assets unavailable, install continues`);
}

self.addEventListener('install', (event) => {
  // A failed precache must not strand an older worker: the shell is a nicety, and this worker
  // is also the thing that keeps private surfaces off the cache.
  event.waitUntil(precache().catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== SHELL_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (mayStore(url)) {
    event.respondWith(serveShell(event, request, url));
    return;
  }
  // Navigations get an offline fallback; every other request is left on the network untouched,
  // which is the same as never installing a worker at all.
  if (request.mode === 'navigate') {
    event.respondWith(serveNavigation(request));
  }
});
