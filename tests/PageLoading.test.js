// While a page asked for is still downloading, ui/pageLoading.js says so
// (ui/components/PageLoadingNotice.js shows it), but only once it has taken
// a moment: a page that arrives at once never flashes it.
import { pageLoading, watchPageLoading, PAGE_LOADING_DELAY_MS } from '../ui/pageLoading.js';
import { assert } from './support/Assert.js';

function fakeRouter() {
    const hooks = { before: [], after: [], error: [] };
    return {
        beforeEach: (hook) => hooks.before.push(hook),
        afterEach: (hook) => hooks.after.push(hook),
        onError: (hook) => hooks.error.push(hook),
        start: () => hooks.before.forEach((hook) => hook({}, {})),
        finish: () => hooks.after.forEach((hook) => hook({}, {})),
        fail: () => hooks.error.forEach((hook) => hook(new Error('Failed to fetch dynamically imported module'), {}))
    };
}

function fakeTimers() {
    const timers = new Map();
    let next = 1;
    return {
        setTimeoutFn: (callback, ms) => { timers.set(next, { callback, ms }); return next++; },
        clearTimeoutFn: (id) => timers.delete(id),
        pending: () => timers.size,
        delays: () => [...timers.values()].map((timer) => timer.ms),
        fire: () => { const due = [...timers.values()]; timers.clear(); due.forEach((timer) => timer.callback()); }
    };
}

{
    const router = fakeRouter();
    const timers = fakeTimers();
    watchPageLoading(router, timers);
    assert(pageLoading.value === false, 'nothing is loading before a navigation');

    router.start();
    assert(pageLoading.value === false && timers.delays().join() === String(PAGE_LOADING_DELAY_MS), 'a navigation waits a moment before saying so');
    router.finish();
    assert(timers.pending() === 0 && pageLoading.value === false, 'a page that arrives at once never shows it');

    router.start();
    timers.fire();
    assert(pageLoading.value === true, 'a page still downloading after the moment is shown loading');
    router.finish();
    assert(pageLoading.value === false, 'until it arrives');

    router.start();
    timers.fire();
    router.fail();
    assert(pageLoading.value === false && timers.pending() === 0, 'a page that fails to download stops it (its own notice says why)');

    router.start();
    router.start();
    assert(timers.pending() === 1, 'a navigation that replaces another keeps one timer');
    timers.fire();
    router.finish();
    assert(pageLoading.value === false, 'and its end clears it');
    console.log('✓ a page still downloading is said to be loading after a moment, and no longer once it arrives or fails');
}
