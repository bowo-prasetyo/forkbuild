import { StorageProvider } from './StorageProvider.js';
import { LocalStorageProvider } from './LocalStorageProvider.js';
import { BlurtAnnouncingConfiguration } from '../core/BlurtAnnouncingConfiguration.js';

const BLURT_ANNOUNCING_CONFIGURATION_STORE_KEY = 'blurt-announcing-configuration';

export class BlurtAnnouncingConfigurationStore {
    constructor(storageProvider = new LocalStorageProvider()) {
        if (!(storageProvider instanceof StorageProvider)) {
            throw new Error('BlurtAnnouncingConfigurationStore requires a StorageProvider');
        }
        this._storageProvider = storageProvider;
    }

    save(configuration) {
        if (!(configuration instanceof BlurtAnnouncingConfiguration)) {
            throw new Error('BlurtAnnouncingConfigurationStore.save() requires a BlurtAnnouncingConfiguration instance');
        }
        this._storageProvider.save(BLURT_ANNOUNCING_CONFIGURATION_STORE_KEY, configuration.toJSON());
    }

    get() {
        const raw = this._storageProvider.load(BLURT_ANNOUNCING_CONFIGURATION_STORE_KEY);
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
        return BlurtAnnouncingConfiguration.fromJSON(raw);
    }

    clear() {
        this._storageProvider.remove(BLURT_ANNOUNCING_CONFIGURATION_STORE_KEY);
    }
}
