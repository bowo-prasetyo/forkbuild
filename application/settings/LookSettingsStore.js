// Keeps this device's choice of look (core/LookSettings.js). Personal and
// local: never published, shared or part of any World.
import { StorageProvider } from '../../storage/StorageProvider.js';
import { normalizeLookSettings } from '../../core/LookSettings.js';

const STORAGE_KEY = 'look-settings';

export class LookSettingsStore {
    constructor({ storageProvider }) {
        if (!(storageProvider instanceof StorageProvider)) {
            throw new Error('LookSettingsStore requires a StorageProvider');
        }
        this._storage = storageProvider;
    }

    get() {
        try {
            return normalizeLookSettings(this._storage.load(STORAGE_KEY));
        } catch {
            return normalizeLookSettings(null);
        }
    }

    save(settings) {
        const normalized = normalizeLookSettings(settings);
        this._storage.save(STORAGE_KEY, { look: normalized.look });
        return normalized;
    }
}
