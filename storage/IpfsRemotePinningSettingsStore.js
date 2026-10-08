import { StorageProvider } from './StorageProvider.js';
import { LocalStorageProvider } from './LocalStorageProvider.js';
import { IpfsRemotePinningSettings } from '../core/IpfsRemotePinningSettings.js';

const IPFS_REMOTE_PINNING_SETTINGS_STORE_KEY = 'ipfs-remote-pinning-settings';

// Keeps core/IpfsRemotePinningSettings.js on this device: the endpoint and
// field names only. There is no place for a credential in what it saves.
export class IpfsRemotePinningSettingsStore {
    constructor(storageProvider = new LocalStorageProvider()) {
        if (!(storageProvider instanceof StorageProvider)) {
            throw new Error('IpfsRemotePinningSettingsStore requires a StorageProvider');
        }
        this._storageProvider = storageProvider;
    }

    save(settings) {
        if (!(settings instanceof IpfsRemotePinningSettings)) {
            throw new Error('IpfsRemotePinningSettingsStore.save() requires an IpfsRemotePinningSettings instance');
        }
        this._storageProvider.save(IPFS_REMOTE_PINNING_SETTINGS_STORE_KEY, settings.toJSON());
    }

    // null when nothing usable is saved.
    get() {
        const raw = this._storageProvider.load(IPFS_REMOTE_PINNING_SETTINGS_STORE_KEY);
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
        try {
            return new IpfsRemotePinningSettings({ endpoint: raw.endpoint, requestField: raw.requestField, responseField: raw.responseField });
        } catch {
            return null;
        }
    }

    clear() {
        this._storageProvider.remove(IPFS_REMOTE_PINNING_SETTINGS_STORE_KEY);
    }
}
