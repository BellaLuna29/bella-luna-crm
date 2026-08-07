// Minimal service worker — only exists to satisfy "installable" PWA criteria
// (add to home screen, standalone window). No caching: every request goes
// straight to the network, since the app's data changes constantly and a
// stale cache would actively hurt a live booking calendar.
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request))
})
