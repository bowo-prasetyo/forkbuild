import { IndexedDbStorageBackend } from './IndexedDbStorageBackend.js';
import { installLocalStorageBackend } from './LocalStorageProvider.js';

// Opening IndexedDB can wait indefinitely (another tab holding an old
// version open), and the app cannot start until storage is ready.
const OPEN_TIMEOUT_MS = 10000;

// Moves every LocalStorageProvider onto IndexedDB (see
// storage/IndexedDbStorageBackend.js). Must finish before anything reads
// storage: ui/boot.js awaits it before loading the app. Returns the
// backend, or null when IndexedDB could not be opened: the app then keeps
// using window.localStorage for this session, and what it saves there is
// moved into IndexedDB the next time IndexedDB opens.
export async function openBrowserStorage({ timeoutMs = OPEN_TIMEOUT_MS, ...options } = {}) {
    let timer;
    let timedOut = false;
    const opening = IndexedDbStorageBackend.open(options);
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
            timedOut = true;
            reject(new Error(`IndexedDB did not open within ${timeoutMs / 1000}s`));
        }, timeoutMs);
    });
    try {
        const backend = await Promise.race([opening, timeout]);
        installLocalStorageBackend(backend);
        return backend;
    } catch (error) {
        if (timedOut) {
            // Close the database if it opens after all: this session is
            // using localStorage now.
            opening.then((backend) => backend.close(), () => {});
        }
        console.warn('ForkBuild: using localStorage, because IndexedDB could not be opened.', error);
        return null;
    } finally {
        clearTimeout(timer);
    }
}
