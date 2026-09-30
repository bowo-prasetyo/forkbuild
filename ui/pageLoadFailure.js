import { ref } from 'vue';
import { isModuleLoadFailure } from './loadRecovery.js';

// A page that failed to download while the app was already running: its
// modules, or a service group it needs (ui/router/index.js), did not arrive
// even after a retry. Chromium keeps such a failure for the life of the page,
// so only a new page can fetch what is missing, and a new page ends what the
// app is doing, a voice call among it. So the person decides:
// ui/components/PageLoadFailureNotice.js says the page could not load and
// offers to reload ForkBuild on it, instead of the click seeming to do
// nothing. (When the app's first load fails, ui/loadRecovery.js reloads by
// itself: nothing is running yet.)

// null, or { fullPath } of the page that could not load.
export const pageLoadFailure = ref(null);

// Watches `router`'s navigations: a page that fails to download sets
// pageLoadFailure, any navigation that completes clears it. Other errors are
// logged as Vue Router logs them when no handler is registered.
export function watchPageLoads(router) {
    router.onError((error, to) => {
        if (isModuleLoadFailure(error) && to) {
            console.warn(`Opening ${to.fullPath} failed: its files did not download.`, error);
            pageLoadFailure.value = { fullPath: to.fullPath };
            return;
        }
        console.error(error);
    });
    router.afterEach((to, from, failure) => {
        if (!failure) pageLoadFailure.value = null;
    });
}

// Loads ForkBuild again on the page that could not load (the router uses the
// URL's hash).
export function reloadOnPage(fullPath, location = window.location) {
    location.hash = `#${fullPath}`;
    location.reload();
}
