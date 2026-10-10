// Keeps which network writers this browser has switched on (core/
// NetworkWriters.js). Personal and local: never published, shared or part of
// any World; a backup carries it with the other Network settings.
import { StorageProvider } from '../../storage/StorageProvider.js';
import { isNetworkWriter, normalizeNetworkWriterSettings } from '../../core/NetworkWriters.js';

const STORAGE_KEY = 'network-writer-settings';

export class NetworkWriterSettingsStore {
    constructor({ storageProvider }) {
        if (!(storageProvider instanceof StorageProvider)) {
            throw new Error('NetworkWriterSettingsStore requires a StorageProvider');
        }
        this._storage = storageProvider;
        this._listeners = new Set();
    }

    get() {
        try {
            return normalizeNetworkWriterSettings(this._storage.load(STORAGE_KEY));
        } catch {
            return normalizeNetworkWriterSettings(null);
        }
    }

    isEnabled(id) {
        return this.get()[id] === true;
    }

    setEnabled(id, enabled) {
        if (!isNetworkWriter(id)) throw new Error(`not a network writer: ${id}`);
        const settings = normalizeNetworkWriterSettings({ ...this.get(), [id]: enabled === true });
        this._storage.save(STORAGE_KEY, settings);
        for (const listener of this._listeners) listener(id, settings[id]);
        return settings;
    }

    // Called with (id, enabled) after each change; returns a function that
    // stops it.
    onChange(listener) {
        this._listeners.add(listener);
        return () => this._listeners.delete(listener);
    }
}
