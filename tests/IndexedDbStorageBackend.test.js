import { IndexedDbStorageBackend } from '../storage/IndexedDbStorageBackend.js';
import { LocalStorageProvider, installLocalStorageBackend, flushLocalStorage } from '../storage/LocalStorageProvider.js';
import { openBrowserStorage } from '../storage/openBrowserStorage.js';
import { StorageFullError } from '../storage/StorageFullError.js';
import { saveDocument } from '../ui/components/saveDocument.js';
import { assert } from './support/Assert.js';

// IndexedDbStorageBackend's in-memory copy, write batching, failure
// handling and cross-tab updates, against a fake database. Real IndexedDB
// (opening, moving localStorage data, reopening, two tabs) is covered by
// tests/IndexedDbStorageBackendBrowser.test.js.

// A database whose transactions run, in the order they were created, on
// the next macrotask, or abort with `failWith` when it is set (read-only
// ones never fail).
function fakeDatabase() {
    const database = {
        stored: new Map(),
        transactions: [],
        failWith: null,
        transaction(storeName, mode, options) {
            const record = { mode, durability: options && options.durability, operations: [] };
            database.transactions.push(record);
            const transaction = {
                error: null,
                oncomplete: null,
                onabort: null,
                abort() {},
                objectStore: () => ({
                    put: (value, key) => record.operations.push(['put', key, value]),
                    delete: (key) => record.operations.push(['delete', key]),
                    get: (key) => {
                        const request = { result: undefined };
                        record.operations.push(['get', key, request]);
                        return request;
                    }
                })
            };
            setTimeout(() => {
                if (database.failWith && mode === 'readwrite') {
                    transaction.error = database.failWith;
                    transaction.onabort();
                    return;
                }
                for (const [op, key, value] of record.operations) {
                    if (op === 'put') database.stored.set(key, value);
                    else if (op === 'delete') database.stored.delete(key);
                    else value.result = database.stored.get(key);
                }
                transaction.oncomplete();
            }, 0);
            return transaction;
        },
        close() {}
    };
    return database;
}

// An in-process BroadcastChannel: delivers to every other channel of the
// same name, asynchronously, like the real one.
function fakeBroadcastChannelClass() {
    const channels = new Set();
    return class {
        constructor(name) {
            this.name = name;
            this.onmessage = null;
            channels.add(this);
        }
        postMessage(data) {
            const copy = structuredClone(data);
            for (const channel of channels) {
                if (channel !== this && channel.name === this.name) {
                    setTimeout(() => channel.onmessage && channel.onmessage({ data: copy }), 0);
                }
            }
        }
        close() { channels.delete(this); }
    };
}

const nextMacrotask = () => new Promise((resolve) => setTimeout(resolve, 0));
// A broadcast, then the read-back it starts.
const afterReadBack = async () => { await nextMacrotask(); await nextMacrotask(); };

// Reads and writes are answered from memory at once; writes in one task
// become one relaxed transaction.
{
    const database = fakeDatabase();
    const backend = new IndexedDbStorageBackend(database, new Map([['old', '"kept"']]));
    backend.setItem('a', '1');
    backend.setItem('b', '2');
    backend.setItem('a', '3');
    backend.removeItem('old');
    assert(backend.getItem('a') === '3' && backend.getItem('b') === '2' && backend.getItem('old') === null, 'reads see writes immediately');
    assert(backend.keys().sort().join() === 'a,b', 'keys() lists what memory holds');
    assert(database.transactions.length === 0, 'nothing is written during the task that made the changes');
    await Promise.resolve();
    assert(database.transactions.length === 1, 'writes made in one task are committed in one transaction');
    const [transaction] = database.transactions;
    assert(transaction.mode === 'readwrite' && transaction.durability === 'relaxed', 'background commits are relaxed');
    assert(transaction.operations.length === 3, 'each changed name is written once, with its latest value');
    await backend.flush();
    assert(database.stored.get('a') === '3' && database.stored.get('b') === '2' && !database.stored.has('old'), 'the database holds the latest values');
    console.log('✓ writes are answered from memory and batched per task');
}

// flush() commits waiting writes with strict durability, and asks once for
// persistent storage.
{
    const database = fakeDatabase();
    let persistCalls = 0;
    const navigatorStorage = { persisted: async () => false, persist: async () => { persistCalls++; return true; } };
    const backend = new IndexedDbStorageBackend(database, new Map(), { navigatorStorage });
    backend.setItem('doc', '{"x":1}');
    await backend.flush();
    assert(database.transactions.length === 1 && database.transactions[0].durability === 'strict', 'flush() commits right away, strictly');
    assert(database.stored.get('doc') === '{"x":1}', 'flush() resolves once the write is stored');
    await nextMacrotask();
    await backend.flush();
    await nextMacrotask();
    assert(persistCalls === 1, 'persistent storage is requested once, after the first flush');
    console.log('✓ flush() stores waiting writes durably');
}

// A failed write stays in memory, is reported as StorageFullError when the
// quota is the cause, and is written again by the next commit.
{
    const database = fakeDatabase();
    const backend = new IndexedDbStorageBackend(database, new Map());
    const reported = [];
    backend.onWriteError((error) => reported.push(error));
    database.failWith = new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    backend.setItem('doc', '"big"');
    let thrown = null;
    try { await backend.flush(); } catch (error) { thrown = error; }
    assert(thrown instanceof StorageFullError && thrown.cause.name === 'QuotaExceededError', 'a quota failure rejects flush() with StorageFullError');
    assert(reported.length === 1 && reported[0] === thrown, 'write-error listeners hear about it');
    assert(backend.getItem('doc') === '"big"', 'the value is still in memory');
    database.failWith = null;
    backend.setItem('other', '1');
    await backend.flush();
    assert(database.stored.get('doc') === '"big"' && database.stored.get('other') === '1', 'the next commit writes the failed value too');
    console.log('✓ a failed write is reported and retried');
}

// Other tabs update their copy after a commit by reading the written names
// back, except for names they have written themselves and not yet stored.
{
    const BroadcastChannel = fakeBroadcastChannelClass();
    const sharedDatabase = fakeDatabase();
    const tabA = new IndexedDbStorageBackend(sharedDatabase, new Map(), { BroadcastChannel });
    const tabB = new IndexedDbStorageBackend(sharedDatabase, new Map(), { BroadcastChannel });
    tabA.setItem('friends', '["x"]');
    tabA.setItem('gone', '1');
    await tabA.flush();
    await afterReadBack();
    assert(tabB.getItem('friends') === '["x"]' && tabB.getItem('gone') === '1', 'a commit in one tab reaches the other tab\'s copy');
    tabA.removeItem('gone');
    await tabA.flush();
    await afterReadBack();
    assert(tabB.getItem('gone') === null, 'removals reach it too');

    // Both tabs write the same name; B's transaction is created after A's,
    // so B's value is what ends up on disk, whichever message comes first.
    tabA.setItem('friends', '["theirs"]');
    tabB.setItem('friends', '["mine"]');
    assert(tabB.getItem('friends') === '["mine"]', 'a tab reads its own write at once');
    await Promise.all([tabA.flush(), tabB.flush()]);
    await afterReadBack();
    assert(sharedDatabase.stored.get('friends') === '["mine"]', 'the later transaction wins on disk');
    assert(tabA.getItem('friends') === '["mine"]' && tabB.getItem('friends') === '["mine"]', '...and in both tabs\' copies');

    // A message about a name this tab has an unsaved write for leaves it.
    tabB.setItem('draft', '"local"');
    tabB._readBackRemoteWrites({ names: ['draft'] });
    await nextMacrotask();
    assert(tabB.getItem('draft') === '"local"', 'a tab keeps its own unsaved write');

    const before = sharedDatabase.transactions.length;
    tabB._readBackRemoteWrites({ names: [42, null] });
    tabB._readBackRemoteWrites({ entries: 'junk' });
    tabB._readBackRemoteWrites(null);
    assert(sharedDatabase.transactions.length === before, 'malformed messages are ignored');
    await tabB.flush();
    tabA.close();
    tabB.close();
    console.log('✓ tabs keep each other up to date');
}

// LocalStorageProvider uses the installed backend and returns fresh
// objects; without one it uses window.localStorage.
{
    const database = fakeDatabase();
    const backend = new IndexedDbStorageBackend(database, new Map());
    installLocalStorageBackend(backend);
    try {
        const provider = new LocalStorageProvider();
        provider.save('doc', { bricks: [1] });
        const loaded = provider.load('doc');
        loaded.bricks.push(2);
        assert(provider.load('doc').bricks.length === 1, 'load() returns a fresh copy the caller may change');
        assert(new LocalStorageProvider().list().join() === 'doc', 'every instance shares the installed backend');
        await flushLocalStorage();
        assert(database.stored.get('doc') === '{"bricks":[1]}', 'flushLocalStorage() stores the installed backend\'s writes');
        provider.remove('doc');
        assert(provider.load('doc') === null, 'remove() works through the backend');
    } finally {
        installLocalStorageBackend(null);
    }
    const items = new Map();
    globalThis.window = {
        localStorage: {
            getItem: (k) => (items.has(k) ? items.get(k) : null),
            setItem: (k, v) => items.set(k, String(v)),
            removeItem: (k) => items.delete(k),
            key: (i) => [...items.keys()][i] ?? null,
            get length() { return items.size; }
        }
    };
    const provider = new LocalStorageProvider();
    provider.save('doc', { a: 1 });
    items.set('someone-else', 'x');
    assert(items.get('forkbuild:doc') === '{"a":1}' && provider.list().join() === 'doc', 'without a backend it uses prefixed window.localStorage keys');
    await flushLocalStorage();
    delete globalThis.window;
    console.log('✓ LocalStorageProvider routes through the installed backend');
}

// The Editor's Save waits for storage, and marks the document unsaved again
// if the write fails.
{
    const database = fakeDatabase();
    const backend = new IndexedDbStorageBackend(database, new Map());
    backend.onWriteError(() => {});
    installLocalStorageBackend(backend);
    try {
        const calls = [];
        const documentManager = { markDirty: () => calls.push('markDirty') };
        const saveUseCase = { execute: () => { calls.push('execute'); new LocalStorageProvider().save('doc', 1); } };
        await saveDocument(saveUseCase, documentManager);
        assert(calls.join() === 'execute' && database.stored.get('doc') === '1', 'a successful Save resolves after the document is stored');

        database.failWith = new DOMException('full', 'QuotaExceededError');
        let thrown = null;
        try { await saveDocument(saveUseCase, documentManager); } catch (error) { thrown = error; }
        assert(thrown instanceof StorageFullError, 'a Save that cannot be stored rejects with StorageFullError');
        assert(calls.join() === 'execute,execute,markDirty', '...and marks the document unsaved again');
    } finally {
        installLocalStorageBackend(null);
    }
    console.log('✓ Save waits for its writes to be stored');
}

// openBrowserStorage() falls back to localStorage when IndexedDB is missing
// or does not open in time.
{
    const originalWarn = console.warn;
    console.warn = () => {};
    try {
        assert(await openBrowserStorage({ indexedDB: null }) === null, 'no IndexedDB: stays on localStorage');
        const neverOpens = { open: () => ({}) };
        assert(await openBrowserStorage({ indexedDB: neverOpens, timeoutMs: 10 }) === null, 'an open that hangs times out and stays on localStorage');
    } finally {
        console.warn = originalWarn;
    }
    installLocalStorageBackend(null);
    console.log('✓ openBrowserStorage() falls back to localStorage');
}
