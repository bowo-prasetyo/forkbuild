import { StorageFullError, isStorageFullError } from './StorageFullError.js';

const DATABASE_NAME = 'forkbuild';
const DATABASE_VERSION = 1;
const ENTRIES_STORE = 'entries';
const CHANNEL_NAME = 'forkbuild-storage';
const LEGACY_KEY_PREFIX = 'forkbuild:';

// A LocalStorageProvider backend (see storage/LocalStorageProvider.js)
// that keeps ForkBuild's data in IndexedDB, whose quota is a share of the
// disk rather than localStorage's ~5 MB.
//
// StorageProvider is synchronous and IndexedDB is not, so every entry is
// read into memory once, by open(), before the app starts; reads are
// answered from that copy and writes update it at once, then reach
// IndexedDB in the background. Values are the same JSON strings
// localStorage held, so load() keeps returning a fresh object the caller
// may change.
//
// Writes made in the same task are committed together, in one transaction,
// at the end of that task. flush() commits whatever is waiting with
// 'strict' durability (on disk, not only handed to the OS) and resolves
// once every write so far is stored, or rejects with the error that
// stopped one (StorageFullError when the quota is used up). A failed
// write stays in memory and is retried with the next commit.
//
// Other tabs keep their own copy. After a commit the names it wrote are
// sent on a BroadcastChannel, and other tabs read those entries back from
// IndexedDB. Reading them, rather than taking values from the message,
// keeps every copy equal to what is on disk: IndexedDB orders the tabs'
// transactions, while messages can arrive in any order. Entries a tab has
// written itself and not yet stored are left alone; its own commit and
// broadcast follow.
//
// On open, any 'forkbuild:' entries still in localStorage (from before
// IndexedDB was used, or from a session that had to fall back to it) are
// moved here, replacing what IndexedDB held under the same name, and are
// removed from localStorage once stored.
export class IndexedDbStorageBackend {
    static async open({
        indexedDB = globalThis.indexedDB,
        localStorage = readGlobalLocalStorage(),
        BroadcastChannel = globalThis.BroadcastChannel,
        navigatorStorage = globalThis.navigator?.storage,
        databaseName = DATABASE_NAME
    } = {}) {
        const database = await openDatabase(indexedDB, databaseName);
        try {
            const entries = await readAllEntries(database);
            await moveLegacyEntries(database, localStorage, entries);
            return new IndexedDbStorageBackend(database, entries, { BroadcastChannel, navigatorStorage });
        } catch (error) {
            database.close();
            throw error;
        }
    }

    constructor(database, entries, { BroadcastChannel = null, navigatorStorage = null } = {}) {
        this._database = database;
        this._entries = entries;
        this._navigatorStorage = navigatorStorage;
        this._persistenceRequested = false;
        // Names written here and not yet committed, or whose commit failed.
        this._pending = new Set();
        // Name -> number of commits in progress that write it.
        this._inFlight = new Map();
        // Commits in progress; each resolves to null or the error that failed it.
        this._commits = new Set();
        this._commitScheduled = false;
        // Name -> number of the latest read-back started for it, so an
        // older read finishing late never replaces a newer one.
        this._readBacks = new Map();
        this._readBackCount = 0;
        this._writeErrorListeners = new Set();
        this._channel = BroadcastChannel ? new BroadcastChannel(CHANNEL_NAME) : null;
        if (this._channel) {
            this._channel.onmessage = (event) => this._readBackRemoteWrites(event.data);
        }
        // A newer version of the app opening the database in another tab
        // must not be blocked by this one.
        this._database.onversionchange = () => this._database.close();
    }

    getItem(name) {
        return this._entries.has(name) ? this._entries.get(name) : null;
    }

    setItem(name, json) {
        this._entries.set(name, String(json));
        this._markPending(name);
    }

    removeItem(name) {
        this._entries.delete(name);
        this._markPending(name);
    }

    keys() {
        return [...this._entries.keys()];
    }

    async flush() {
        this._commit('strict');
        const errors = await Promise.all([...this._commits]);
        const error = errors.find(Boolean);
        if (error) {
            throw error;
        }
        this._requestPersistence();
    }

    // Calls listener(error) whenever a background write fails. Returns an
    // unsubscribe function.
    onWriteError(listener) {
        this._writeErrorListeners.add(listener);
        return () => this._writeErrorListeners.delete(listener);
    }

    close() {
        if (this._channel) {
            this._channel.close();
        }
        this._database.close();
    }

    _markPending(name) {
        this._pending.add(name);
        if (!this._commitScheduled) {
            this._commitScheduled = true;
            queueMicrotask(() => this._commit('relaxed'));
        }
    }

    _commit(durability) {
        this._commitScheduled = false;
        if (this._pending.size === 0) {
            return;
        }
        const written = [...this._pending].map((name) => [name, this.getItem(name)]);
        this._pending.clear();
        const names = written.map(([name]) => name);
        names.forEach((name) => this._inFlight.set(name, (this._inFlight.get(name) || 0) + 1));

        const commit = new Promise((resolve) => {
            const settle = (error) => {
                names.forEach((name) => {
                    const count = this._inFlight.get(name) - 1;
                    if (count === 0) this._inFlight.delete(name); else this._inFlight.set(name, count);
                });
                if (error) {
                    resolve(this._writeFailed(names, error));
                } else {
                    this._broadcast(names);
                    resolve(null);
                }
            };
            let transaction;
            try {
                transaction = this._database.transaction(ENTRIES_STORE, 'readwrite', { durability });
                const store = transaction.objectStore(ENTRIES_STORE);
                for (const [name, json] of written) {
                    if (json === null) store.delete(name); else store.put(json, name);
                }
            } catch (error) {
                if (transaction) {
                    try { transaction.abort(); } catch { /* already finished */ }
                }
                settle(error);
                return;
            }
            transaction.oncomplete = () => settle(null);
            transaction.onabort = () => settle(transaction.error || new Error('IndexedDB transaction aborted'));
        });
        this._commits.add(commit);
        commit.then(() => this._commits.delete(commit));
    }

    // The failed names go back to pending: memory still holds their latest
    // value, which the next commit writes.
    _writeFailed(names, cause) {
        names.forEach((name) => this._pending.add(name));
        const error = isStorageFullError(cause) ? new StorageFullError(cause) : cause;
        if (this._writeErrorListeners.size === 0) {
            console.error('ForkBuild storage: a write to IndexedDB failed', error);
        }
        this._writeErrorListeners.forEach((listener) => listener(error));
        return error;
    }

    _broadcast(names) {
        if (!this._channel) {
            return;
        }
        try {
            this._channel.postMessage({ names });
        } catch (error) {
            console.error('ForkBuild storage: could not tell other tabs about a write', error);
        }
    }

    _readBackRemoteWrites(message) {
        const names = message && Array.isArray(message.names)
            ? message.names.filter((name) => typeof name === 'string')
            : [];
        if (names.length === 0) {
            return;
        }
        const readBack = ++this._readBackCount;
        names.forEach((name) => this._readBacks.set(name, readBack));
        let transaction;
        try {
            transaction = this._database.transaction(ENTRIES_STORE, 'readonly');
        } catch (error) {
            console.error('ForkBuild storage: could not read another tab\'s write', error);
            return;
        }
        const store = transaction.objectStore(ENTRIES_STORE);
        const requests = names.map((name) => [name, store.get(name)]);
        transaction.oncomplete = () => {
            for (const [name, request] of requests) {
                if (this._readBacks.get(name) !== readBack) continue;
                this._readBacks.delete(name);
                if (this._pending.has(name) || this._inFlight.has(name)) continue;
                if (typeof request.result === 'string') this._entries.set(name, request.result);
                else this._entries.delete(name);
            }
        };
        transaction.onabort = () => {
            names.forEach((name) => {
                if (this._readBacks.get(name) === readBack) this._readBacks.delete(name);
            });
        };
    }

    // Asks the browser not to evict ForkBuild's data under storage
    // pressure. Done on the first flush (an explicit Save) rather than at
    // startup, since some browsers ask the user.
    _requestPersistence() {
        if (this._persistenceRequested || !this._navigatorStorage || typeof this._navigatorStorage.persist !== 'function') {
            return;
        }
        this._persistenceRequested = true;
        const storage = this._navigatorStorage;
        Promise.resolve(typeof storage.persisted === 'function' ? storage.persisted() : false)
            .then((persisted) => persisted || storage.persist())
            .catch(() => {});
    }
}

function readGlobalLocalStorage() {
    try {
        return globalThis.localStorage ?? null;
    } catch {
        // Some browsers throw when site data is blocked.
        return null;
    }
}

function requestResult(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'));
    });
}

function openDatabase(indexedDB, databaseName) {
    if (!indexedDB) {
        return Promise.reject(new Error('IndexedDB is not available'));
    }
    const request = indexedDB.open(databaseName, DATABASE_VERSION);
    request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(ENTRIES_STORE)) {
            request.result.createObjectStore(ENTRIES_STORE);
        }
    };
    return requestResult(request);
}

async function readAllEntries(database) {
    const transaction = database.transaction(ENTRIES_STORE, 'readonly');
    const store = transaction.objectStore(ENTRIES_STORE);
    // Both lists come back in key order, so they line up.
    const [keys, values] = await Promise.all([requestResult(store.getAllKeys()), requestResult(store.getAll())]);
    await transactionDone(transaction);
    const entries = new Map();
    keys.forEach((key, index) => {
        if (typeof key === 'string' && typeof values[index] === 'string') {
            entries.set(key, values[index]);
        }
    });
    return entries;
}

async function moveLegacyEntries(database, localStorage, entries) {
    if (!localStorage) {
        return;
    }
    const legacy = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(LEGACY_KEY_PREFIX)) {
            const value = localStorage.getItem(key);
            if (value !== null) legacy.push([key, value]);
        }
    }
    if (legacy.length === 0) {
        return;
    }
    const transaction = database.transaction(ENTRIES_STORE, 'readwrite', { durability: 'strict' });
    const store = transaction.objectStore(ENTRIES_STORE);
    for (const [key, value] of legacy) {
        store.put(value, key.slice(LEGACY_KEY_PREFIX.length));
    }
    await transactionDone(transaction);
    for (const [key, value] of legacy) {
        entries.set(key.slice(LEGACY_KEY_PREFIX.length), value);
        localStorage.removeItem(key);
    }
}
