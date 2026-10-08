import { reactive } from 'vue';

// The page's side of the service worker (ui/pwa/serviceWorker.js, sw.js on
// the published site): registering it where the page names one, saying when
// a new version is ready, and following a clicked notification to where it
// points. The page names one only when scripts/build.mjs built it, so the
// unbundled repository runs with no service worker.

const META_NAME = 'forkbuild-service-worker';

// `updateReady` is true once a new version has installed and waits for this
// page to say to go ahead (AppUpdateBanner).
export const serviceWorkerState = reactive({ registered: false, updateReady: false });

let registration = null;
let reloading = false;

export function serviceWorkerScript(doc = document) {
    const content = doc.querySelector(`meta[name="${META_NAME}"]`)?.getAttribute('content');
    return typeof content === 'string' && content ? content : null;
}

// `navigate(path)` follows a clicked notification inside the app. Never
// throws: the app works without a service worker.
export async function registerServiceWorker({ navigate }) {
    const script = serviceWorkerScript();
    if (!script || !('serviceWorker' in navigator)) return null;
    try {
        navigator.serviceWorker.addEventListener('message', (event) => {
            const data = event.data || {};
            if (data.type === 'forkbuild:navigate' && typeof data.path === 'string' && data.path.startsWith('/')) navigate(data.path);
        });
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            // Only after this page asked for the new version; a first install
            // taking over the page needs no reload.
            if (reloading) window.location.reload();
        });
        registration = await navigator.serviceWorker.register(script, { scope: './' });
        serviceWorkerState.registered = true;
        watchForUpdate(registration);
        await navigator.serviceWorker.ready;
        keepLoadedFiles();
        return registration;
    } catch {
        return null;
    }
}

function watchForUpdate(current) {
    const markReady = () => {
        // A waiting worker beside one already in charge is a new version; the
        // very first install has nothing in charge and takes over by itself.
        if (current.waiting && navigator.serviceWorker.controller) serviceWorkerState.updateReady = true;
    };
    markReady();
    current.addEventListener('updatefound', () => {
        const installing = current.installing;
        installing?.addEventListener('statechange', () => {
            if (installing.state === 'installed') markReady();
        });
    });
}

// Starts the new version: the page reloads once it is in charge.
export function applyUpdate() {
    if (!registration?.waiting) return false;
    reloading = true;
    registration.waiting.postMessage({ type: 'forkbuild:skip-waiting' });
    return true;
}

// The files this page loaded before the worker was in charge of it (on a
// first visit, all of them), so the language in use is kept for offline use.
function keepLoadedFiles() {
    const worker = navigator.serviceWorker.controller || registration?.active;
    if (!worker || typeof performance?.getEntriesByType !== 'function') return;
    const urls = performance.getEntriesByType('resource')
        .map((entry) => entry.name)
        .filter((url) => url.startsWith(window.location.origin));
    worker.postMessage({ type: 'forkbuild:keep', urls });
}

// Shows a notification through the service worker where there is one (the
// only way on Android), else directly. `path` is where clicking it goes.
// Resolves to whether it was shown.
export async function showDeviceNotification({ title, body, path, tag }, { navigate }) {
    const options = { body, tag, icon: 'assets/icons/icon-192.png', badge: 'assets/icons/icon-192.png', data: { path } };
    try {
        if (registration && typeof registration.showNotification === 'function') {
            await registration.showNotification(title, options);
            return true;
        }
        if (typeof Notification === 'function') {
            const notification = new Notification(title, options);
            notification.onclick = () => {
                window.focus();
                notification.close();
                navigate(path);
            };
            return true;
        }
    } catch {
        // Not shown; it is still in the bell's history.
    }
    return false;
}
