// Keeps the app's own files available offline. Data is handled by the app (Firestore keeps its own offline copy).
const CACHE = 'lifedesk-v24';
const FILES = ['./', 'index.html', 'css/app.css', 'js/app.js', 'js/logic.js', 'js/store.js', 'js/config.js', 'js/seed.js', 'js/icons.js', 'js/sample.js', 'js/vault.js', 'js/reports.js', 'js/charts.js', 'js/insights.js',
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

// Push notifications from the hourly sender (backend/push-sender.gs), also when LifeDesk is closed. A message carries
// plain wording without names, plus each reminder sealed (name + amount) with the notification key, which only the
// user's devices hold (IndexedDB, put there by the app). Here it is unsealed and the wording names the reminder;
// without the key (device locked or signed out) the plain wording is shown. Every push shows a notification.
const notifyKey = () => new Promise((resolve) => {
    const open = indexedDB.open('lifedesk-notify', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('keys');
    open.onerror = () => resolve(null);
    open.onsuccess = () => {
        const req = open.result.transaction('keys').objectStore('keys').get('notify');
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
    };
});
const bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
async function unseal(keyText, sealed) {
    const key = await crypto.subtle.importKey('raw', bytes(keyText), 'AES-GCM', false, ['decrypt']);
    const [iv, ct] = sealed.split('.');
    return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(iv) }, key, bytes(ct))));
}
const dayText = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
/** Title and text naming the reminder(s); items: [{ n: name, a: amount text, d: days left, due }]. */
function named(items, plainTitle) {
    if (items.length === 1) {
        const { n, a, d, due } = items[0];
        const title = d < 0 ? `⚠️ ${n} is overdue` : d === 0 ? `⏰ ${n} is due today` : d === 1 ? `🔔 ${n} is due tomorrow` : `🔔 ${n} is due in ${d} days`;
        const when = d < 0 ? `was due on ${dayText(due)} (${plural(-d, 'day')} ago)` : d === 0 ? `due today, ${dayText(due)}` : `due on ${dayText(due)}`;
        const text = `${a ? `${a} · ` : ''}${when}. Tap to open it in LifeDesk.`;
        return { title, body: text.charAt(0).toUpperCase() + text.slice(1) };
    }
    const short = (d) => (d < 0 ? 'overdue' : d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`);
    return { title: plainTitle, body: items.map((x) => `${x.n}${x.a ? ` (${x.a})` : ''} – ${short(x.d)}`).join(' · ') };
}
async function showPush(p) {
    const d = { ...(p.notification || {}), ...(p.data || {}) };
    let { title = 'LifeDesk', body = '' } = d;
    try {
        const key = d.items && (await notifyKey());
        if (key) {
            const items = await Promise.all(JSON.parse(d.items).map(async (x) => ({ ...(await unseal(key, x.s)), d: x.d, due: x.due })));
            ({ title, body } = named(items, title));
        }
    } catch (e) {
        // a key from another account or an old message: keep the plain wording
    }
    return self.registration.showNotification(title, { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png',
        // each one its own tag: replacing an older one with the same tag makes Chrome on the Mac briefly count none
        // and add its own "This site has been updated in the background"
        tag: `${d.tag || 'lifedesk'}-${Date.now()}`, data: { link: d.link || './' } });
}
self.addEventListener('push', (event) => {
    let p = {};
    try {
        p = event.data ? event.data.json() : {};
    } catch (e) {
        p = { data: { body: event.data ? event.data.text() : '' } };
    }
    event.waitUntil(showPush(p));
});
// Tapping it opens LifeDesk on that screen (links are relative to the app, e.g. "#renewals/<id>"), reusing an
// open window when there is one.
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const link = new URL((event.notification.data && event.notification.data.link) || './', self.registration.scope).href;
    event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
        const open = list.find((c) => c.url.startsWith(self.registration.scope));
        if (!open) {
            return self.clients.openWindow(link);
        }
        // focus first (allowed only while handling the click), then move that window to the screen
        return open.focus().then((c) => (c || open).navigate(link)).catch(() => self.clients.openWindow(link));
    }));
});
