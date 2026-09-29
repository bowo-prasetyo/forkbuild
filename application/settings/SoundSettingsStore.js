// Keeps this device's sound preference. Personal and local: never published,
// shared or part of any World.
import { StorageProvider } from '../../storage/StorageProvider.js';
import { normalizeSoundSettings } from '../../core/SoundSettings.js';

const STORAGE_KEY = 'sound-settings';

export class SoundSettingsStore {
    constructor({ storageProvider }) {
        if (!(storageProvider instanceof StorageProvider)) {
            throw new Error('SoundSettingsStore requires a StorageProvider');
        }
        this._storage = storageProvider;
    }

    get() {
        try {
            return normalizeSoundSettings(this._storage.load(STORAGE_KEY));
        } catch {
            return normalizeSoundSettings(null);
        }
    }

    save(settings) {
        const normalized = normalizeSoundSettings(settings);
        this._storage.save(STORAGE_KEY, { muted: normalized.muted, volume: normalized.volume, spatial: normalized.spatial });
        return normalized;
    }
}
