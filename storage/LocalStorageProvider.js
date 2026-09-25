import { StorageProvider } from './StorageProvider.js';
import { StorageFullError, isStorageFullError } from './StorageFullError.js';

const KEY_PREFIX = 'forkbuild:';

// StorageProvider backed by window.localStorage. All keys are namespaced
// under "forkbuild:" so list() only ever returns ForkBuild's own entries
// — the page's localStorage may hold data from other scripts, and that
// isn't ours to assume ownership of.
export class LocalStorageProvider extends StorageProvider {
    // Throws StorageFullError when the browser's quota is used up; the
    // previous value under `name`, if any, is left as it was.
    save(name, data) {
        try {
            window.localStorage.setItem(KEY_PREFIX + name, JSON.stringify(data));
        } catch (error) {
            throw isStorageFullError(error) ? new StorageFullError(error) : error;
        }
    }

    load(name) {
        const raw = window.localStorage.getItem(KEY_PREFIX + name);
        if (raw === null) {
            return null;
        }
        return JSON.parse(raw);
    }

    remove(name) {
        window.localStorage.removeItem(KEY_PREFIX + name);
    }

    list() {
        const names = [];
        for (let i = 0; i < window.localStorage.length; i++) {
            const key = window.localStorage.key(i);
            if (key && key.startsWith(KEY_PREFIX)) {
                names.push(key.slice(KEY_PREFIX.length));
            }
        }
        return names;
    }
}
