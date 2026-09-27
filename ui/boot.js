import { openBrowserStorage } from '../storage/openBrowserStorage.js';

// The page's entry point. Storage is opened first because every store
// reads it synchronously (see storage/IndexedDbStorageBackend.js); the
// app is imported only after that, so none of its modules can read
// storage before it is ready.
await openBrowserStorage();
await importAppWithRetry();

// The app is well over a thousand unbundled modules, fetched all at once.
// When the host drops or refuses even one of those requests (GitHub Pages
// does this under the burst, seen in Firefox), the browser rejects the
// whole import and cancels every fetch still in flight, so nothing runs
// and the page stays blank. No module is evaluated until the whole graph
// has loaded, so trying again is safe: the modules that did arrive come
// back from the HTTP cache and only the missing ones are requested again.
async function importAppWithRetry() {
    const retryDelaysMs = [500, 1000, 2000, 4000, 8000];
    for (let attempt = 0; ; attempt++) {
        try {
            await import('./main.js');
            return;
        } catch (error) {
            if (attempt >= retryDelaysMs.length) throw error;
            console.warn(`Loading the app failed; retrying (${attempt + 1}/${retryDelaysMs.length}).`, error);
            await new Promise((resolve) => setTimeout(resolve, retryDelaysMs[attempt]));
        }
    }
}
