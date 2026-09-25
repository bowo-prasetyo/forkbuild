import { StorageFullError, isStorageFullError, STORAGE_FULL_MESSAGE } from '../storage/StorageFullError.js';
import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { AutosaveScheduler } from '../application/document/AutosaveScheduler.js';
import { saveFailureMessage, autosaveFailureMessage } from '../ui/components/saveFailureMessages.js';
import { assert } from './support/Assert.js';

// Browser storage is a few megabytes per site. When it runs out, saving and
// crash-recovery checkpoints fail; the user must be told something they can
// act on, and nothing may throw uncaught.

// A localStorage with a byte quota, throwing the way Chrome does.
function quotaLimitedLocalStorage(quotaChars) {
    const items = new Map();
    const used = () => [...items].reduce((sum, [k, v]) => sum + k.length + v.length, 0);
    return {
        get length() { return items.size; },
        key: (i) => [...items.keys()][i] ?? null,
        getItem: (k) => (items.has(k) ? items.get(k) : null),
        removeItem: (k) => { items.delete(k); },
        setItem(k, v) {
            const previous = items.get(k);
            items.delete(k);
            if (used() + k.length + String(v).length > quotaChars) {
                if (previous !== undefined) items.set(k, previous);
                throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
            }
            items.set(k, String(v));
        }
    };
}

// Every engine's quota error is recognized; other errors are not.
{
    assert(isStorageFullError(new DOMException('full', 'QuotaExceededError')), 'Chrome/Safari QuotaExceededError');
    assert(isStorageFullError(Object.assign(new Error('full'), { name: 'NS_ERROR_DOM_QUOTA_REACHED', code: 1014 })), 'older Firefox NS_ERROR_DOM_QUOTA_REACHED');
    assert(isStorageFullError(new StorageFullError()), 'StorageFullError itself');
    assert(!isStorageFullError(new TypeError('x is undefined')) && !isStorageFullError(null), 'ordinary errors are not storage-full errors');
    console.log('✓ quota errors are recognized in every engine\'s form');
}

// LocalStorageProvider turns a quota error into StorageFullError and keeps
// the previous value.
{
    globalThis.window = { localStorage: quotaLimitedLocalStorage(200) };
    const provider = new LocalStorageProvider();
    provider.save('doc', { text: 'small' });
    let thrown = null;
    try { provider.save('doc', { text: 'x'.repeat(500) }); } catch (error) { thrown = error; }
    assert(thrown instanceof StorageFullError && thrown.message === STORAGE_FULL_MESSAGE, 'a write over quota throws StorageFullError with a message for the user');
    assert(thrown.cause && thrown.cause.name === 'QuotaExceededError', '...carrying the browser\'s own error as its cause');
    assert(provider.load('doc').text === 'small', 'the previous value is still there');
    delete globalThis.window;
    console.log('✓ LocalStorageProvider reports a full storage as StorageFullError');
}

// The Editor's messages: storage full says what to do instead of "try again".
{
    assert(/storage for ForkBuild is full/.test(saveFailureMessage(new StorageFullError())) && /Export/.test(saveFailureMessage(new StorageFullError())),
        'a save that fails for lack of space says so and points to Export');
    assert(!/Try again/.test(saveFailureMessage(new StorageFullError())), '...and does not suggest trying again, which cannot help');
    assert(/Try again/.test(saveFailureMessage(new Error('disk hiccup'))), 'any other save failure still suggests trying again');
    assert(/Crash recovery is paused/.test(autosaveFailureMessage(new StorageFullError())), 'a full storage pausing crash recovery is explained');
    console.log('✓ save and autosave failures produce messages the user can act on');
}

// A failing autosave checkpoint is reported, never thrown from the timer.
{
    let fire = null;
    const errors = [];
    const documentManager = { state: { dirty: true }, onStateChanged: () => () => {} };
    const failingUseCase = { execute() { throw new StorageFullError(); } };
    const scheduler = new AutosaveScheduler(failingUseCase, documentManager, {
        setTimeoutFn: (fn) => { fire = fn; return 1; },
        clearTimeoutFn: () => {},
        onError: (error) => errors.push(error)
    });
    scheduler._schedule();
    fire();
    assert(errors.length === 1 && errors[0] instanceof StorageFullError, 'the timer hands the failure to onError instead of throwing');

    const quiet = new AutosaveScheduler(failingUseCase, documentManager, { setTimeoutFn: (fn) => { fire = fn; return 1; }, clearTimeoutFn: () => {} });
    const originalError = console.error;
    console.error = () => {};
    try {
        quiet._schedule();
        fire();
    } finally {
        console.error = originalError;
    }
    console.log('✓ a failing crash-recovery checkpoint never throws from the autosave timer');
}

console.log('\n✅ All StorageFullHandling tests passed.');
