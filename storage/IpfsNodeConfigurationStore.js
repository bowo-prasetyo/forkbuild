import { StorageProvider } from './StorageProvider.js';
import { LocalStorageProvider } from './LocalStorageProvider.js';
import { IpfsNodeConfiguration, isValidIpfsNodeApiUrl } from '../core/IpfsNodeConfiguration.js';

const IPFS_NODE_CONFIGURATION_STORE_KEY = 'ipfs-node-configuration';

// User-Configurable IPFS Node API URL Persistence.
//
// Mirrors storage/IpfsGatewayConfigurationStore.js exactly, one axis over —
// this store persists the WRITE-path Kubo node's own `apiUrl` (content/
// IpfsContentStore.js), never the READ-path gateway list that file's own
// sibling store governs. A separate storage key keeps the two settings from
// ever colliding or being confused for one another.
//
// MALFORMED DATA DEGRADES; A GENUINE STORAGE FAILURE PROPAGATES — a
// persisted payload that isn't a plain object, or whose apiUrl fails
// validation, degrades silently to "absent." The injected StorageProvider's
// own save()/load() throwing is never caught here.
export class IpfsNodeConfigurationStore {
    constructor(storageProvider = new LocalStorageProvider()) {
        if (!(storageProvider instanceof StorageProvider)) {
            throw new Error('IpfsNodeConfigurationStore requires a StorageProvider');
        }
        this._storageProvider = storageProvider;
    }

    save(configuration) {
        if (!(configuration instanceof IpfsNodeConfiguration)) {
            throw new Error('IpfsNodeConfigurationStore.save() requires an IpfsNodeConfiguration instance');
        }
        this._storageProvider.save(IPFS_NODE_CONFIGURATION_STORE_KEY, configuration.toJSON());
    }

    get() {
        const raw = this._storageProvider.load(IPFS_NODE_CONFIGURATION_STORE_KEY);
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            return null;
        }
        if (!isValidIpfsNodeApiUrl(raw.apiUrl)) {
            return null;
        }
        return new IpfsNodeConfiguration({ apiUrl: raw.apiUrl });
    }

    // The one way back to "no override, use the deployment default" — see
    // core/IpfsNodeConfiguration.js's own header, "a value object, never a
    // default-injecting one."
    clear() {
        this._storageProvider.remove(IPFS_NODE_CONFIGURATION_STORE_KEY);
    }
}
