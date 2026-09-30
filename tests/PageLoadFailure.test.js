// A page that fails to download after the app started: the router's error
// sets ui/pageLoadFailure.js's state, the next completed navigation clears
// it, and PageLoadFailureNotice offers to reload on that page, warning when a
// voice call would end. Other router errors are only logged, as before.
import { mountComponent } from 'vue';
import { pageLoadFailure, reloadOnPage, watchPageLoads } from '../ui/pageLoadFailure.js';
import PageLoadFailureNotice from '../ui/components/PageLoadFailureNotice.js';
import { assert } from './support/Assert.js';

function fakeRouter() {
    const handlers = { error: [], after: [] };
    return {
        onError: (fn) => { handlers.error.push(fn); },
        afterEach: (fn) => { handlers.after.push(fn); },
        fail: (error, to) => handlers.error.forEach((fn) => fn(error, to, null)),
        complete: (to, failure) => handlers.after.forEach((fn) => fn(to, null, failure))
    };
}

function quietly(fn) {
    const { warn, error } = console;
    const logged = [];
    console.warn = (...args) => logged.push(['warn', ...args]);
    console.error = (...args) => logged.push(['error', ...args]);
    try {
        fn();
    } finally {
        console.warn = warn;
        console.error = error;
    }
    return logged;
}

const downloadFailure = new TypeError('Failed to fetch dynamically imported module: https://example.test/ui/views/EditorView.js');

{
    const router = fakeRouter();
    watchPageLoads(router);
    pageLoadFailure.value = null;

    const logged = quietly(() => router.fail(downloadFailure, { fullPath: '/editor' }));
    assert(pageLoadFailure.value && pageLoadFailure.value.fullPath === '/editor', 'a page that did not download is remembered with its path');
    assert(logged.length === 1 && logged[0][0] === 'warn', 'and logged');

    router.complete({ fullPath: '/about' }, { type: 'aborted' });
    assert(pageLoadFailure.value, 'a navigation that did not complete leaves the notice');
    router.complete({ fullPath: '/about' }, undefined);
    assert(pageLoadFailure.value === null, 'a completed navigation clears it');

    const bug = new TypeError('Cannot read properties of undefined (reading \'meta\')');
    const loggedBug = quietly(() => router.fail(bug, { fullPath: '/editor' }));
    assert(pageLoadFailure.value === null, 'another error does not show the notice');
    assert(loggedBug.length === 1 && loggedBug[0][0] === 'error' && loggedBug[0][1] === bug, 'it is logged as Vue Router would');
    console.log('✓ a page that fails to download shows the notice until a navigation completes');
}

{
    const location = { hash: '#/', reloads: 0, reload() { this.reloads++; } };
    reloadOnPage('/world/abc?x=1', location);
    assert(location.hash === '#/world/abc?x=1' && location.reloads === 1, 'Reload loads ForkBuild again on the page that failed');
    console.log('✓ reloading opens the page that could not load');
}

{
    pageLoadFailure.value = { fullPath: '/publications' };
    const reloaded = [];
    const inCall = mountComponent(PageLoadFailureNotice, { voiceUseCase: { getActiveCall: () => ({ callId: 'c', state: 'ACTIVE' }) } }, { reload: (path) => reloaded.push(path) });
    assert(inCall.failure.value.fullPath === '/publications', 'the notice shows the failure');
    assert(inCall.inCall() === true, 'it warns when a voice call would end');
    inCall.reload();
    assert(reloaded.join() === '/publications', 'Reload reloads on that page');

    const noCall = mountComponent(PageLoadFailureNotice, { voiceUseCase: { getActiveCall: () => null } }, { reload: () => {} });
    assert(noCall.inCall() === false, 'no warning without a call');
    const broken = mountComponent(PageLoadFailureNotice, { voiceUseCase: { getActiveCall: () => { throw new Error('x'); } } }, { reload: () => {} });
    assert(broken.inCall() === false, 'no warning when the call state cannot be read');
    const noVoice = mountComponent(PageLoadFailureNotice, {}, { reload: () => {} });
    assert(noVoice.inCall() === false, 'no warning without voice');

    noCall.dismiss();
    assert(pageLoadFailure.value === null, 'Dismiss hides the notice');
    console.log('✓ the notice reloads on the page, warns about a call, and can be dismissed');
}

console.log('\n✅ All PageLoadFailure tests passed.');
