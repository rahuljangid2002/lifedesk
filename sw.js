// Keeps the app's own files available offline. Data is handled by the app (Firestore keeps its own offline copy).
const CACHE = 'lifedesk-v13';
const FILES = ['./', 'index.html', 'css/app.css', 'js/app.js', 'js/logic.js', 'js/store.js', 'js/config.js', 'js/seed.js', 'js/icons.js', 'js/sample.js', 'js/reports.js', 'js/charts.js', 'js/insights.js',
    'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
    );
});
// Network first, so a new version shows as soon as you are online; the cache is the fallback when offline.
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    if (event.request.method !== 'GET' || url.origin !== self.location.origin) {
        return;
    }
    event.respondWith(
        fetch(event.request)
            .then((res) => {
                const copy = res.clone();
                caches.open(CACHE).then((c) => c.put(event.request, copy));
                return res;
            })
            .catch(() => caches.match(event.request).then((hit) => hit || caches.match('index.html')))
    );
});
