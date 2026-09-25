import { StorageProvider } from './StorageProvider.js';
import { StorageFullError, isStorageFullError } from './StorageFullError.js';

const KEY_PREFIX = 'forkbuild:';

// StorageProvider for this device's browser storage. Values are stored as
// JSON strings in a backend: window.localStorage by default, or whichever
// backend installLocalStorageBackend() installed — in the app, the
// IndexedDB one ui/boot.js opens before anything else runs (see
// storage/IndexedDbStorageBackend.js). Every instance shares that one
// backend, so constructing a fresh LocalStorageProvider anywhere is fine.
//
// In window.localStorage all keys are namespaced under "forkbuild:" so
// list() only ever returns ForkBuild's own entries — the page's
// localStorage may hold data from other scripts, and that isn't ours to
// assume ownership of.
export class LocalStorageProvider extends StorageProvider {
    // Throws StorageFullError when window.localStorage's quota is used up;
    // the previous value under `name`, if any, is left as it was. The
    // IndexedDB backend reports a full storage from flushLocalStorage()
    // instead, since its writes finish later.
    save(name, data) {
        currentBackend().setItem(name, String(JSON.stringify(data)));
    }

    load(name) {
        const raw = currentBackend().getItem(name);
        if (raw === null) {
            return null;
        }
        return JSON.parse(raw);
    }

    remove(name) {
        currentBackend().removeItem(name);
    }

    list() {
        return currentBackend().keys();
    }
}

// A backend holds JSON strings under ForkBuild's own names:
// getItem(name) -> string | null, setItem(name, json), removeItem(name),
// keys() -> string[], and flush() -> Promise resolving once every write
// is stored. Passing null goes back to window.localStorage.
let installedBackend = null;

export function installLocalStorageBackend(backend) {
    installedBackend = backend;
}

// Resolves once every write made so far is stored; rejects with the
// error that stopped one (StorageFullError when the storage is full).
export function flushLocalStorage() {
    return installedBackend ? installedBackend.flush() : Promise.resolve();
}

function currentBackend() {
    return installedBackend || windowLocalStorageBackend;
}

const windowLocalStorageBackend = {
    getItem(name) {
        return window.localStorage.getItem(KEY_PREFIX + name);
    },
    setItem(name, json) {
        try {
            window.localStorage.setItem(KEY_PREFIX + name, json);
        } catch (error) {
            throw isStorageFullError(error) ? new StorageFullError(error) : error;
        }
    },
    removeItem(name) {
        window.localStorage.removeItem(KEY_PREFIX + name);
    },
    keys() {
        const names = [];
        for (let i = 0; i < window.localStorage.length; i++) {
            const key = window.localStorage.key(i);
            if (key && key.startsWith(KEY_PREFIX)) {
                names.push(key.slice(KEY_PREFIX.length));
            }
        }
        return names;
    },
    flush() {
        return Promise.resolve();
    }
};
