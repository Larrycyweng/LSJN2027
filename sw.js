/* App shell：網路優先，斷網時用快取。data/*.json 一律網路優先。 */
const CACHE = 'lsjn-shell-v5';
const SHELL = ['./', './index.html', './app.js', './outline.js', './vendor/jszip.min.js', './manifest.webmanifest', './icon.svg'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok && !url.pathname.includes('/data/')) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
      return res;
    }).catch(() => caches.match(e.request, {ignoreSearch: true}).then(r => r || new Response(url.pathname.includes('/data/') ? '[]' : '', {status: 200, headers: {'Content-Type': url.pathname.includes('/data/') ? 'application/json' : 'text/plain'}})))
  );
});
