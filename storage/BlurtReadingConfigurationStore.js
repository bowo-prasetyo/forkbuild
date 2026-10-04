import { StorageProvider } from './StorageProvider.js';
import { LocalStorageProvider } from './LocalStorageProvider.js';
import { BlurtReadingConfiguration } from '../core/BlurtReadingConfiguration.js';

const BLURT_READING_CONFIGURATION_STORE_KEY = 'blurt-reading-configuration';

export class BlurtReadingConfigurationStore {
    constructor(storageProvider = new LocalStorageProvider()) {
        if (!(storageProvider instanceof StorageProvider)) {
            throw new Error('BlurtReadingConfigurationStore requires a StorageProvider');
        }
        this._storageProvider = storageProvider;
    }

    save(configuration) {
        if (!(configuration instanceof BlurtReadingConfiguration)) {
            throw new Error('BlurtReadingConfigurationStore.save() requires a BlurtReadingConfiguration instance');
        }
        this._storageProvider.save(BLURT_READING_CONFIGURATION_STORE_KEY, configuration.toJSON());
    }

    // A saved value that no longer validates reads as no override.
    get() {
        const raw = this._storageProvider.load(BLURT_READING_CONFIGURATION_STORE_KEY);
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
        return BlurtReadingConfiguration.fromJSON(raw);
    }

    clear() {
        this._storageProvider.remove(BLURT_READING_CONFIGURATION_STORE_KEY);
    }
}
