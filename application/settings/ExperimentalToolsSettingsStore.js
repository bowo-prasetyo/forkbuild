// Keeps whether this browser shows the Experimental tools: the Publications
// page's Wallet, Archive & Publisher Tools and the experimental Network
// Settings pages (docs/Pillars.md, "Infrastructure, kept out of sight").
// Off until a person turns it on. Personal and local: never published,
// shared or part of any World.
import { StorageProvider } from '../../storage/StorageProvider.js';

const STORAGE_KEY = 'experimental-tools-settings';

export class ExperimentalToolsSettingsStore {
    constructor({ storageProvider }) {
        if (!(storageProvider instanceof StorageProvider)) {
            throw new Error('ExperimentalToolsSettingsStore requires a StorageProvider');
        }
        this._storage = storageProvider;
    }

    get() {
        try {
            const saved = this._storage.load(STORAGE_KEY);
            return { shown: saved?.shown === true };
        } catch {
            return { shown: false };
        }
    }

    setShown(shown) {
        const settings = { shown: shown === true };
        this._storage.save(STORAGE_KEY, settings);
        return settings;
    }
}
