/* App shell：網路優先，斷網時用快取。data/*.json 一律網路優先。 */
const CACHE = 'lsjn-shell-v9';
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
    }).catch(() => {
      /* v0.5.4：data/*.json 斷網時回 503，讓 app.js 改用本機快照並顯示「本機」。
         舊版回傳 200 的空陣列 '[]'，app.js 把它當成遠端讀取成功，畫面上所有學習時數歸零且標示「已同步」。 */
      if (url.pathname.includes('/data/')) return new Response('', {status: 503, statusText: 'offline'});
      return caches.match(e.request, {ignoreSearch: true}).then(r => r || new Response('', {status: 200, headers: {'Content-Type': 'text/plain'}}));
    })
  );
});
