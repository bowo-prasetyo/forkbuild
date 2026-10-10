// Keeps which network writers this browser has switched on (core/
// NetworkWriters.js). Personal and local: never published, shared or part of
// any World; a backup carries it with the other Network settings.
import { StorageProvider } from '../../storage/StorageProvider.js';
import { isNetworkWriter, normalizeNetworkWriterSettings } from '../../core/NetworkWriters.js';

const STORAGE_KEY = 'network-writer-settings';

//
// `defaults` maps a writer to a function saying whether it starts on for a
// device that never switched it either way: Steem's and Blurt's are on where
// an account to post as is already saved, so a device that posted there
// before writers became switches keeps posting. Once switched, the saved
// choice decides.
export class NetworkWriterSettingsStore {
    constructor({ storageProvider, defaults = {} }) {
        if (!(storageProvider instanceof StorageProvider)) {
            throw new Error('NetworkWriterSettingsStore requires a StorageProvider');
        }
        this._storage = storageProvider;
        this._defaults = defaults;
        this._listeners = new Set();
    }

    get() {
        let saved = null;
        try {
            saved = this._storage.load(STORAGE_KEY);
        } catch {
            saved = null;
        }
        return normalizeNetworkWriterSettings(saved, this._defaultValues());
    }

    _defaultValues() {
        const values = {};
        for (const [id, isOn] of Object.entries(this._defaults || {})) {
            try {
                values[id] = typeof isOn === 'function' && isOn() === true;
            } catch {
                values[id] = false;
            }
        }
        return values;
    }

    isEnabled(id) {
        return this.get()[id] === true;
    }

    setEnabled(id, enabled) {
        if (!isNetworkWriter(id)) throw new Error(`not a network writer: ${id}`);
        // Only the switch changed is saved: the others keep following their
        // defaults until they are switched themselves.
        let saved = null;
        try {
            saved = this._storage.load(STORAGE_KEY);
        } catch {
            saved = null;
        }
        const explicit = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
        this._storage.save(STORAGE_KEY, { ...explicit, [id]: enabled === true });
        const settings = this.get();
        for (const listener of this._listeners) listener(id, settings[id]);
        return settings;
    }

    // Saves, as switched on, each writer never switched either way whose
    // default is on now: run once as the app starts, so a device that already
    // posts to Steem keeps its switch on even after clearing its account.
    // Returns the ids it saved.
    adoptDefaults() {
        let saved = null;
        try {
            saved = this._storage.load(STORAGE_KEY);
        } catch {
            saved = null;
        }
        const explicit = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
        const defaults = this._defaultValues();
        const adopted = Object.keys(defaults).filter((id) => isNetworkWriter(id) && typeof explicit[id] !== 'boolean' && defaults[id] === true);
        if (adopted.length > 0) {
            this._storage.save(STORAGE_KEY, { ...explicit, ...Object.fromEntries(adopted.map((id) => [id, true])) });
        }
        return adopted;
    }

    // Called with (id, enabled) after each change; returns a function that
    // stops it.
    onChange(listener) {
        this._listeners.add(listener);
        return () => this._listeners.delete(listener);
    }
}
