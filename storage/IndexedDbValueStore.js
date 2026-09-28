// A few values that can't be JSON, kept in their own small IndexedDB
// database: a folder handle and a CryptoKey both survive IndexedDB's
// structured clone, while StorageProvider keeps JSON strings only. Like
// everything else, they go when this site's data is cleared.
const STORE_NAME = 'values';

export class IndexedDbValueStore {
    constructor({ databaseName, indexedDB = globalThis.indexedDB }) {
        this._databaseName = databaseName;
        this._indexedDB = indexedDB;
        this._opening = null;
    }

    get available() {
        return Boolean(this._indexedDB);
    }

    async get(key) {
        const value = await this._request('readonly', (store) => store.get(key));
        return value === undefined ? null : value;
    }

    async set(key, value) {
        await this._request('readwrite', (store) => store.put(value, key));
    }

    async delete(key) {
        await this._request('readwrite', (store) => store.delete(key));
    }

    _open() {
        if (!this._opening) {
            this._opening = new Promise((resolve, reject) => {
                const request = this._indexedDB.open(this._databaseName, 1);
                request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            this._opening.catch(() => { this._opening = null; });
        }
        return this._opening;
    }

    async _request(mode, operation) {
        if (!this.available) throw new Error('IndexedDB is not available in this browser.');
        const database = await this._open();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(STORE_NAME, mode);
            const request = operation(transaction.objectStore(STORE_NAME));
            transaction.oncomplete = () => resolve(request.result);
            transaction.onerror = () => reject(transaction.error || request.error);
            transaction.onabort = () => reject(transaction.error || request.error);
        });
    }
}
