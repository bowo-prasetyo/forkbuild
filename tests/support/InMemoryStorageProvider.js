// Test-support only. A StorageProvider kept in memory. save() and load() copy
// values through JSON, so a test cannot mutate what was stored.
import { StorageProvider } from '../../storage/StorageProvider.js';

export class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}
