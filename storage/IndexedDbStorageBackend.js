import { StorageFullError, isStorageFullError } from './StorageFullError.js';
import { StorageEntryNotLoadedError } from './StorageEntryNotLoadedError.js';

// Entries under these prefixes stay on disk: published content (by hash,
// including everything received from peers) and published snapshots. Each
// is a whole build, the set grows with every publication seen, and nothing
// reads them on a hot synchronous path. See "Cold entries" below.
export const COLD_KEY_PREFIXES = Object.freeze(['content:', 'snapshot:']);
// How much cold content, in characters, stays in memory after being read
// or written, most recently used first (the latest one always stays, even
// alone over this).
export const WARM_CACHE_LENGTH = 16 * 1024 * 1024;

const DATABASE_NAME = 'forkbuild';
const DATABASE_VERSION = 1;
const ENTRIES_STORE = 'entries';
const CHANNEL_NAME = 'forkbuild-storage';
const LEGACY_KEY_PREFIX = 'forkbuild:';

// A LocalStorageProvider backend (see storage/LocalStorageProvider.js)
// that keeps ForkBuild's data in IndexedDB, whose quota is a share of the
// disk rather than localStorage's ~5 MB.
//
// StorageProvider is synchronous and IndexedDB is not, so every entry
// except the cold ones (below) is read into memory once, by open(), before
// the app starts; reads are
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
//
// Cold entries (COLD_KEY_PREFIXES) are the exception to "everything in
// memory": open() reads only their names, and a written one leaves memory
// once it is stored. loadItem() reads one asynchronously into a small
// most-recently-used cache (WARM_CACHE_LENGTH); getItem() answers from
// that cache, or from a write not yet stored, and otherwise throws
// StorageEntryNotLoadedError rather than pretend the entry is missing.
// hasItem() and keys() know every cold entry without loading it.
export class IndexedDbStorageBackend {
    static async open({
        indexedDB = globalThis.indexedDB,
        IDBKeyRange = globalThis.IDBKeyRange,
        localStorage = readGlobalLocalStorage(),
        BroadcastChannel = globalThis.BroadcastChannel,
        navigatorStorage = globalThis.navigator?.storage,
        databaseName = DATABASE_NAME,
        coldPrefixes = COLD_KEY_PREFIXES,
        warmCacheLength = WARM_CACHE_LENGTH
    } = {}) {
        const database = await openDatabase(indexedDB, databaseName);
        try {
            const { entries, coldNames } = await readAllEntries(database, coldPrefixes, IDBKeyRange);
            await moveLegacyEntries(database, localStorage, entries, coldNames, (name) => isColdName(name, coldPrefixes));
            return new IndexedDbStorageBackend(database, entries, { BroadcastChannel, navigatorStorage, coldPrefixes, coldNames, warmCacheLength });
        } catch (error) {
            database.close();
            throw error;
        }
    }

    constructor(database, entries, {
        BroadcastChannel = null,
        navigatorStorage = null,
        coldPrefixes = [],
        coldNames = new Set(),
        warmCacheLength = WARM_CACHE_LENGTH
    } = {}) {
        this._database = database;
        // Resident values, plus cold ones written and not yet stored.
        this._entries = entries;
        this._coldPrefixes = [...coldPrefixes];
        // Every cold entry that exists (stored, or written and pending).
        this._coldNames = coldNames;
        // Cold values read or written recently: name -> value, oldest first.
        this._warm = new Map();
        this._warmLength = 0;
        this._warmCacheLength = warmCacheLength;
        // Name -> promise of a cold value being read.
        this._loading = new Map();
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
        if (this._entries.has(name)) {
            return this._entries.get(name);
        }
        if (!this._isCold(name)) {
            return null;
        }
        const warm = this._takeWarm(name);
        if (warm !== undefined) {
            return warm;
        }
        if (!this._coldNames.has(name)) {
            return null;
        }
        throw new StorageEntryNotLoadedError(name);
    }

    // Resolves to the value, reading a cold entry from IndexedDB when it is
    // not in memory; null when there is no such entry.
    async loadItem(name) {
        if (!this._isCold(name) || this._entries.has(name)) {
            return this.getItem(name);
        }
        const warm = this._takeWarm(name);
        if (warm !== undefined) {
            return warm;
        }
        if (!this._coldNames.has(name)) {
            return null;
        }
        if (!this._loading.has(name)) {
            const loading = readEntry(this._database, name).then((value) => {
                this._loading.delete(name);
                // A write while reading wins over what was read.
                if (this._entries.has(name)) {
                    return this._entries.get(name);
                }
                if (typeof value !== 'string' || !this._coldNames.has(name)) {
                    return null;
                }
                this._putWarm(name, value);
                return value;
            }, (error) => {
                this._loading.delete(name);
                throw error;
            });
            this._loading.set(name, loading);
        }
        return this._loading.get(name);
    }

    hasItem(name) {
        return this._entries.has(name) || (this._isCold(name) && this._coldNames.has(name));
    }

    // True when getItem(name) answers without throwing.
    isLoaded(name) {
        return this._entries.has(name) || !this._isCold(name) || this._warm.has(name) || !this._coldNames.has(name);
    }

    setItem(name, json) {
        this._entries.set(name, String(json));
        if (this._isCold(name)) {
            this._coldNames.add(name);
            this._dropWarm(name);
        }
        this._markPending(name);
    }

    removeItem(name) {
        this._entries.delete(name);
        if (this._isCold(name)) {
            this._coldNames.delete(name);
            this._dropWarm(name);
        }
        this._markPending(name);
    }

    keys() {
        const names = new Set(this._entries.keys());
        for (const name of this._coldNames) names.add(name);
        return [...names];
    }

    // Characters of cold content currently held in memory (warm cache).
    get warmLength() {
        return this._warmLength;
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
        const written = [...this._pending].map((name) => [name, this._entries.has(name) ? this._entries.get(name) : null]);
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
                    this._releaseStoredColdEntries(names);
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

    // A cold entry leaves memory (for the warm cache) once its latest
    // value is stored.
    _releaseStoredColdEntries(names) {
        for (const name of names) {
            if (!this._isCold(name) || this._pending.has(name) || this._inFlight.has(name) || !this._entries.has(name)) {
                continue;
            }
            const value = this._entries.get(name);
            this._entries.delete(name);
            this._putWarm(name, value);
        }
    }

    _isCold(name) {
        return isColdName(name, this._coldPrefixes);
    }

    _takeWarm(name) {
        const value = this._warm.get(name);
        if (value !== undefined) {
            // Most recently used goes last.
            this._warm.delete(name);
            this._warm.set(name, value);
        }
        return value;
    }

    // The value just read or stored always stays, even alone over budget,
    // so a synchronous reader waiting for it can then read it.
    _putWarm(name, value) {
        this._dropWarm(name);
        this._warm.set(name, value);
        this._warmLength += value.length;
        for (const [oldest, oldValue] of this._warm) {
            if (this._warmLength <= this._warmCacheLength || oldest === name) break;
            this._warm.delete(oldest);
            this._warmLength -= oldValue.length;
        }
    }

    _dropWarm(name) {
        const value = this._warm.get(name);
        if (value !== undefined) {
            this._warm.delete(name);
            this._warmLength -= value.length;
        }
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
        // For a cold entry only whether it exists matters; its value is read
        // when someone asks for it.
        const requests = names.map((name) => [name, this._isCold(name) ? store.count(name) : store.get(name)]);
        transaction.oncomplete = () => {
            for (const [name, request] of requests) {
                if (this._readBacks.get(name) !== readBack) continue;
                this._readBacks.delete(name);
                if (this._pending.has(name) || this._inFlight.has(name)) continue;
                if (this._isCold(name)) {
                    this._dropWarm(name);
                    if (request.result > 0) this._coldNames.add(name); else this._coldNames.delete(name);
                } else if (typeof request.result === 'string') {
                    this._entries.set(name, request.result);
                } else {
                    this._entries.delete(name);
                }
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

function isColdName(name, coldPrefixes) {
    for (const prefix of coldPrefixes) {
        if (name.startsWith(prefix)) return true;
    }
    return false;
}

// The key ranges outside every cold prefix. Keys starting with a prefix p
// are exactly those in [p, p with its last character incremented).
function residentKeyRanges(coldPrefixes, IDBKeyRange) {
    const prefixes = [...coldPrefixes].sort();
    if (prefixes.length === 0) {
        return [undefined];
    }
    const end = (prefix) => prefix.slice(0, -1) + String.fromCharCode(prefix.charCodeAt(prefix.length - 1) + 1);
    const ranges = [IDBKeyRange.upperBound(prefixes[0], true)];
    for (let i = 0; i + 1 < prefixes.length; i++) {
        ranges.push(IDBKeyRange.bound(end(prefixes[i]), prefixes[i + 1], false, true));
    }
    ranges.push(IDBKeyRange.lowerBound(end(prefixes[prefixes.length - 1])));
    return ranges;
}

// Every name, and the values of resident (non-cold) entries only.
async function readAllEntries(database, coldPrefixes, IDBKeyRange) {
    const transaction = database.transaction(ENTRIES_STORE, 'readonly');
    const store = transaction.objectStore(ENTRIES_STORE);
    const ranges = residentKeyRanges(coldPrefixes, IDBKeyRange);
    // Within a range, keys and values come back in the same key order.
    const [allKeys, ...residentParts] = await Promise.all([
        requestResult(store.getAllKeys()),
        ...ranges.map((range) => Promise.all([requestResult(store.getAllKeys(range)), requestResult(store.getAll(range))]))
    ]);
    await transactionDone(transaction);
    const entries = new Map();
    for (const [keys, values] of residentParts) {
        keys.forEach((key, index) => {
            if (typeof key === 'string' && typeof values[index] === 'string') {
                entries.set(key, values[index]);
            }
        });
    }
    const coldNames = new Set(allKeys.filter((key) => typeof key === 'string' && isColdName(key, coldPrefixes)));
    return { entries, coldNames };
}

async function readEntry(database, name) {
    const transaction = database.transaction(ENTRIES_STORE, 'readonly');
    const value = await requestResult(transaction.objectStore(ENTRIES_STORE).get(name));
    return value;
}

async function moveLegacyEntries(database, localStorage, entries, coldNames, isCold) {
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
        const name = key.slice(LEGACY_KEY_PREFIX.length);
        if (isCold(name)) {
            coldNames.add(name);
        } else {
            entries.set(name, value);
        }
        localStorage.removeItem(key);
    }
}
