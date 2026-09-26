import { StorageProvider } from './StorageProvider.js';
import { LocalStorageProvider } from './LocalStorageProvider.js';
import { SteemReadingConfiguration } from '../core/SteemReadingConfiguration.js';

const STEEM_READING_CONFIGURATION_STORE_KEY = 'steem-reading-configuration';

export class SteemReadingConfigurationStore {
    constructor(storageProvider = new LocalStorageProvider()) {
        if (!(storageProvider instanceof StorageProvider)) {
            throw new Error('SteemReadingConfigurationStore requires a StorageProvider');
        }
        this._storageProvider = storageProvider;
    }

    save(configuration) {
        if (!(configuration instanceof SteemReadingConfiguration)) {
            throw new Error('SteemReadingConfigurationStore.save() requires a SteemReadingConfiguration instance');
        }
        this._storageProvider.save(STEEM_READING_CONFIGURATION_STORE_KEY, configuration.toJSON());
    }

    // A saved value that no longer validates reads as no override.
    get() {
        const raw = this._storageProvider.load(STEEM_READING_CONFIGURATION_STORE_KEY);
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
        return SteemReadingConfiguration.fromJSON(raw);
    }

    clear() {
        this._storageProvider.remove(STEEM_READING_CONFIGURATION_STORE_KEY);
    }
}
