import { ref } from 'vue';

// Whether a page asked for is still downloading: most pages are loaded on
// demand (ui/router/index.js), and until one arrives the page area stays
// empty, which on a slow connection looks like nothing happened.
// ui/components/PageLoadingNotice.js says it is loading. Set only after a
// short delay, so a page already downloaded never flashes it.
export const pageLoading = ref(false);

export const PAGE_LOADING_DELAY_MS = 300;

// Watches `router`'s navigations: one still pending after `delayMs` sets
// pageLoading; one that completes, is cancelled or fails clears it (a
// download that failed is ui/pageLoadFailure.js's to report).
export function watchPageLoading(router, { delayMs = PAGE_LOADING_DELAY_MS, setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout } = {}) {
    let timer = null;
    const settle = () => {
        if (timer !== null) {
            clearTimeoutFn(timer);
            timer = null;
        }
        pageLoading.value = false;
    };
    router.beforeEach(() => {
        settle();
        timer = setTimeoutFn(() => {
            timer = null;
            pageLoading.value = true;
        }, delayMs);
    });
    router.afterEach(settle);
    router.onError(settle);
}
