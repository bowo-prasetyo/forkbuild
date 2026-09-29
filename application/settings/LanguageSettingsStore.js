// Keeps this device's language choice. Personal and local: never published,
// shared or part of any World.
import { StorageProvider } from '../../storage/StorageProvider.js';
import { normalizeLanguageSettings } from '../../core/LanguageSettings.js';

const STORAGE_KEY = 'language-settings';

export class LanguageSettingsStore {
    constructor({ storageProvider }) {
        if (!(storageProvider instanceof StorageProvider)) {
            throw new Error('LanguageSettingsStore requires a StorageProvider');
        }
        this._storage = storageProvider;
    }

    get() {
        try {
            return normalizeLanguageSettings(this._storage.load(STORAGE_KEY));
        } catch {
            return normalizeLanguageSettings(null);
        }
    }

    // `locale` null means "follow the browser".
    save(settings) {
        const normalized = normalizeLanguageSettings(settings);
        this._storage.save(STORAGE_KEY, { locale: normalized.locale });
        return normalized;
    }
}
