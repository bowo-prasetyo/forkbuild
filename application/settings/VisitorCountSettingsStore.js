// Keeps whether this browser takes part in the daily visitor count, and the
// day it last did (core/VisitorCount.js). Personal and local: never
// published, shared or part of any World.
import { StorageProvider } from '../../storage/StorageProvider.js';
import { normalizeVisitorCountSettings } from '../../core/VisitorCount.js';

const STORAGE_KEY = 'visitor-count-settings';

export class VisitorCountSettingsStore {
    constructor({ storageProvider }) {
        if (!(storageProvider instanceof StorageProvider)) {
            throw new Error('VisitorCountSettingsStore requires a StorageProvider');
        }
        this._storage = storageProvider;
    }

    get() {
        try {
            return normalizeVisitorCountSettings(this._storage.load(STORAGE_KEY));
        } catch {
            return normalizeVisitorCountSettings(null);
        }
    }

    setEnabled(enabled) {
        return this._save({ ...this.get(), enabled: enabled === true });
    }

    recordCounted(day) {
        return this._save({ ...this.get(), lastCountedDay: day });
    }

    _save(settings) {
        const normalized = normalizeVisitorCountSettings(settings);
        this._storage.save(STORAGE_KEY, { enabled: normalized.enabled, lastCountedDay: normalized.lastCountedDay });
        return normalized;
    }
}
