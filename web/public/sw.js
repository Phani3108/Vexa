// Vexa service worker: app shell offline, network-first for everything live.
const CACHE = 'vexa-shell-v2'
const SHELL = ['/', '/manifest.webmanifest', '/icon.svg', '/icon-192.png']

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()))
})
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== location.origin) return
  if (/^\/(api|voice|socket\.io|health)/.test(url.pathname)) return // never cache live data
  if (url.pathname.startsWith('/assets/')) {
    // hashed build assets: cache-first
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res })))
    return
  }
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => caches.match('/')))
  }
})

// Web Push: urgent calls, blocked scams, reminders, family alerts
self.addEventListener('push', e => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch { d = { title: 'Vexa', body: e.data && e.data.text() } }
  e.waitUntil(self.registration.showNotification(d.title || 'Vexa', {
    body: d.body || '',
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: d.tag || undefined,
    renotify: !!d.urgent,
    requireInteraction: !!d.urgent,
    data: { url: d.url || '/' }
  }))
})
self.addEventListener('notificationclick', e => {
  e.notification.close()
  const url = (e.notification.data && e.notification.data.url) || '/'
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const open = list.find(c => c.url.startsWith(self.location.origin))
    if (open) { open.navigate(url); return open.focus() }
    return self.clients.openWindow(url)
  }))
})
