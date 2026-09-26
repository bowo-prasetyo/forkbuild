import { StorageProvider } from './StorageProvider.js';
import { LocalStorageProvider } from './LocalStorageProvider.js';
import { SteemAnnouncingConfiguration } from '../core/SteemAnnouncingConfiguration.js';

const STEEM_ANNOUNCING_CONFIGURATION_STORE_KEY = 'steem-announcing-configuration';

export class SteemAnnouncingConfigurationStore {
    constructor(storageProvider = new LocalStorageProvider()) {
        if (!(storageProvider instanceof StorageProvider)) {
            throw new Error('SteemAnnouncingConfigurationStore requires a StorageProvider');
        }
        this._storageProvider = storageProvider;
    }

    save(configuration) {
        if (!(configuration instanceof SteemAnnouncingConfiguration)) {
            throw new Error('SteemAnnouncingConfigurationStore.save() requires a SteemAnnouncingConfiguration instance');
        }
        this._storageProvider.save(STEEM_ANNOUNCING_CONFIGURATION_STORE_KEY, configuration.toJSON());
    }

    get() {
        const raw = this._storageProvider.load(STEEM_ANNOUNCING_CONFIGURATION_STORE_KEY);
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
        return SteemAnnouncingConfiguration.fromJSON(raw);
    }

    clear() {
        this._storageProvider.remove(STEEM_ANNOUNCING_CONFIGURATION_STORE_KEY);
    }
}
