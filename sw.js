const CACHE_NAME = 'homefront-v11';
const OFFLINE_URLS = [
  './index.html', './home.html', './appliances.html',
  './settings.html', './systems.html', './seasonal.html',
  './history.html', './savings.html', './privacy.html',
  './report.html', './timeline.html', './movein.html',
  './moveout.html', './terms.html',
  './manifest.json', './icons/icon-192.png', './icons/icon-512.png'
];

// ── Install: cache all pages ──
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(OFFLINE_URLS);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// ── Activate: clear old caches ──
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(name) { return name !== CACHE_NAME; })
          .map(function(name) { return caches.delete(name); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// ── Fetch: serve from cache, fall back to network ──
self.addEventListener('fetch', function(event) {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) return cached;
      return fetch(event.request).then(function(response) {
        if (!response || response.status !== 200 || response.type !== 'basic') return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) { cache.put(event.request, clone); });
        return response;
      }).catch(function() {
        return caches.match('./index.html');
      });
    })
  );
});

// ── Push notifications ──
self.addEventListener('push', function(event) {
  let data = { title: 'Homefront', body: 'You have a maintenance task due.', icon: './icons/icon-192.png' };
  try { if (event.data) data = { ...data, ...event.data.json() }; } catch(e) {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || './icons/icon-192.png',
      badge: './icons/icon-192.png',
      tag: 'homefront-reminder',
      renotify: true,
      data: { url: data.url || './home.html' }
    })
  );
});

// ── Notification click: open the app ──
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || './home.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list) {
      for (let c of list) {
        if (c.url.includes(self.registration.scope) && 'focus' in c) return c.focus();
      }
      const base = self.registration.scope;
      return clients.openWindow(base + 'home.html');
    })
  );
});

// ── Background sync: check due tasks and schedule local notification ──
self.addEventListener('periodicsync', function(event) {
  if (event.tag === 'check-tasks') {
    event.waitUntil(checkAndNotify());
  }
});

async function checkAndNotify() {
  try {
    // Read appliances from cache storage (set by app)
    const cache = await caches.open('homefront-data');
    const res = await cache.match('due-tasks');
    if (!res) return;
    const { count, nextTask } = await res.json();
    if (count > 0 && nextTask) {
      await self.registration.showNotification('Homefront reminder', {
        body: nextTask + (count > 1 ? ' and ' + (count-1) + ' more task' + (count > 2 ? 's' : '') + ' are due.' : ' is due.'),
        icon: './icons/icon-192.png',
        tag: 'homefront-reminder',
        data: { url: './home.html' }
      });
    }
  } catch(e) {}
}