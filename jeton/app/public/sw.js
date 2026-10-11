// Minimal app-shell cache so the POS opens offline. API calls are never cached here (catalog is cached by the app).
const CACHE = 'jeton-shell-v1'
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html'])).then(() => self.skipWaiting())) })
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())) })
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url)
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.includes('/v1/') || u.pathname.startsWith('/t/')) return
  e.respondWith(fetch(e.request).then((r) => { const c = r.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); return r }).catch(() => caches.match(e.request).then((m) => m || caches.match('./index.html'))))
})
