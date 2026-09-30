// ui/loadRecovery.js: when the app's modules fail to download, the page is
// reloaded once; a second failure soon after shows a message instead of
// reloading again, and an error that is not a failed download is thrown.
import { isModuleLoadFailure, loadApp } from '../ui/loadRecovery.js';
import { assert } from './support/Assert.js';

const KEY = 'forkbuild.reloadedAfterFailedLoadAt';

function memoryStorage(initial = {}) {
    const items = new Map(Object.entries(initial));
    return {
        getItem: (key) => (items.has(key) ? items.get(key) : null),
        setItem: (key, value) => { items.set(key, String(value)); },
        removeItem: (key) => { items.delete(key); },
        items
    };
}

function harness({ storage = memoryStorage(), time = 1_000_000 } = {}) {
    const calls = { reload: 0, showFailure: 0 };
    return {
        calls,
        storage,
        options: {
            storage,
            now: () => time,
            reload: () => { calls.reload++; },
            showFailure: async () => { calls.showFailure++; }
        }
    };
}

const downloadFailure = () => Promise.reject(new TypeError('Failed to fetch dynamically imported module: https://example.test/ui/start.js'));

// The messages each browser rejects import() with when a module did not download.
{
    assert(isModuleLoadFailure(new TypeError('Failed to fetch dynamically imported module: https://x/ui/App.js')), 'Chromium');
    assert(isModuleLoadFailure(new TypeError('error loading dynamically imported module: https://x/ui/App.js')), 'Firefox');
    assert(isModuleLoadFailure(new TypeError('Importing a module script failed.')), 'Safari');
    assert(!isModuleLoadFailure(new TypeError('Cannot read properties of undefined (reading \'get\')')), 'a bug in a module is not a failed download');
    assert(!isModuleLoadFailure(new Error('Failed to fetch dynamically imported module: x')), 'only the TypeError browsers reject with');
    assert(!isModuleLoadFailure(null), 'nothing is not a failed download');
    console.log('✓ a failed download is told apart from other errors');
}

// Loading succeeds: nothing else happens, and an earlier reload is forgotten.
{
    const { calls, storage, options } = harness({ storage: memoryStorage({ [KEY]: '999999' }) });
    let loaded = false;
    await loadApp(async () => { loaded = true; }, options);
    assert(loaded && calls.reload === 0 && calls.showFailure === 0, 'a load that works is left alone');
    assert(!storage.items.has(KEY), 'an earlier reload is forgotten once loading works');
    console.log('✓ a successful load does nothing more');
}

// A failed download reloads the page, once.
{
    const { calls, storage, options } = harness({ time: 5_000_000 });
    await loadApp(downloadFailure, options);
    assert(calls.reload === 1 && calls.showFailure === 0, 'the first failed download reloads the page');
    assert(storage.items.get(KEY) === '5000000', 'and records when');

    const again = harness({ storage, time: 5_030_000 });
    await loadApp(downloadFailure, again.options);
    assert(again.calls.reload === 0 && again.calls.showFailure === 1, 'failing again 30 s after that reload shows the message instead of reloading');

    const later = harness({ storage, time: 5_061_000 });
    await loadApp(downloadFailure, later.options);
    assert(later.calls.reload === 1, 'a failure more than a minute later reloads again');
    console.log('✓ a failed download reloads once, then shows a message');
}

// Without somewhere to record the reload, it could repeat forever: show the message.
{
    const none = harness({ storage: null });
    await loadApp(downloadFailure, none.options);
    assert(none.calls.reload === 0 && none.calls.showFailure === 1, 'no sessionStorage: the message, no reload');

    const throwing = {
        getItem() { throw new Error('SecurityError'); },
        setItem() { throw new Error('SecurityError'); },
        removeItem() { throw new Error('SecurityError'); }
    };
    const blocked = harness({ storage: throwing });
    await loadApp(downloadFailure, blocked.options);
    assert(blocked.calls.reload === 0 && blocked.calls.showFailure === 1, 'sessionStorage that throws: the message, no reload');
    await loadApp(async () => {}, blocked.options);
    console.log('✓ with no way to remember a reload, the message is shown instead');
}

// Anything else is not fixed by reloading, and is thrown as before.
{
    const { calls, options } = harness();
    const bug = new TypeError('Cannot read properties of undefined (reading \'get\')');
    let thrown = null;
    try {
        await loadApp(() => Promise.reject(bug), options);
    } catch (error) {
        thrown = error;
    }
    assert(thrown === bug, 'the error is thrown unchanged');
    assert(calls.reload === 0 && calls.showFailure === 0, 'and the page is neither reloaded nor replaced');
    console.log('✓ other errors are thrown, not reloaded');
}

console.log('\n✅ All LoadRecovery tests passed.');
