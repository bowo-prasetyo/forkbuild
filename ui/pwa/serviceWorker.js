// ForkBuild's service worker: what lets the published site install as an app
// and open without a connection (docs/Deployment.md, "Installing and working
// offline"). scripts/build.mjs writes it to the site's root as sw.js, with
// the two values below filled in; the unbundled repository registers no
// service worker at all (ui/pwa/serviceWorkerClient.js), so working on
// ForkBuild never runs into a stale cache.
//
// - On install, keeps the app's own files: the page, the bundle's code and
//   stylesheet (translations aside: the language in use is kept once the
//   page has loaded it), the manifest and the icons.
// - The page is asked of the network first, so a new version arrives as soon
//   as there is one, and the kept copy opens it offline. The bundle's files
//   are named by their content, so a kept one is always right and is used
//   first. Anything else from this site is kept as it is fetched and used
//   when the network can't be reached. Nothing from any other site is
//   touched or kept.
// - A new version waits until every ForkBuild tab has closed, or until the
//   page says to go ahead ("A new version of ForkBuild is ready").
// - Shows nothing on its own: notifications come from an open page
//   (application/notification/DeviceNotificationRelay.js), and clicking one
//   opens ForkBuild where it points.

const VERSION = '__FORKBUILD_VERSION__';
const PRECACHE = __FORKBUILD_PRECACHE__;
const CACHE = `forkbuild-${VERSION}`;
const PAGE = './index.html';

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        for (const name of await caches.keys()) {
            if (name.startsWith('forkbuild-') && name !== CACHE) await caches.delete(name);
        }
        await self.clients.claim();
    })());
});

self.addEventListener('message', (event) => {
    const data = event.data || {};
    if (data.type === 'forkbuild:skip-waiting') {
        self.skipWaiting();
    } else if (data.type === 'forkbuild:keep' && Array.isArray(data.urls)) {
        // What the page loaded before this worker was in charge of it.
        event.waitUntil(keep(data.urls));
    }
});

async function keep(urls) {
    const cache = await caches.open(CACHE);
    for (const url of urls) {
        if (typeof url !== 'string' || new URL(url, self.location.href).origin !== self.location.origin) continue;
        if (await cache.match(url)) continue;
        try {
            const response = await fetch(url);
            if (response.ok) await cache.put(url, response);
        } catch {
            // Kept the next time it is fetched.
        }
    }
}

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;
    if (request.mode === 'navigate') {
        // Any address in the app is its one page; embed.html (a build embedded
        // on another site, opened here on its own) is a page of its own, kept
        // as itself so it never takes the app's place.
        event.respondWith(networkFirst(request, url.pathname.endsWith('/embed.html') ? null : PAGE));
    } else if (url.pathname.includes('/bundle/')) {
        event.respondWith(cacheFirst(request));
    } else {
        event.respondWith(networkFirst(request, null));
    }
});

async function networkFirst(request, fallback) {
    const cache = await caches.open(CACHE);
    try {
        const response = await fetch(request);
        if (response.ok) await cache.put(fallback || request, response.clone());
        return response;
    } catch (error) {
        const kept = await cache.match(fallback || request, { ignoreSearch: Boolean(fallback) });
        if (kept) return kept;
        throw error;
    }
}

async function cacheFirst(request) {
    const cache = await caches.open(CACHE);
    const kept = await cache.match(request);
    if (kept) return kept;
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
}

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const path = typeof event.notification.data?.path === 'string' ? event.notification.data.path : '/';
    event.waitUntil((async () => {
        const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
        if (open) {
            await open.focus();
            open.postMessage({ type: 'forkbuild:navigate', path });
        } else {
            await self.clients.openWindow(`./#${path}`);
        }
    })());
});
