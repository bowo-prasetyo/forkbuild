import { StorageProvider } from './StorageProvider.js';
import { LocalStorageProvider } from './LocalStorageProvider.js';
import { IpfsGatewayConfiguration, isValidIpfsGatewayUrl } from '../core/IpfsGatewayConfiguration.js';

const IPFS_GATEWAY_CONFIGURATION_STORE_KEY = 'ipfs-gateway-configuration';

// 0.9.665 — User-Configurable IPFS Gateway Configuration Persistence.
//
// Mirrors storage/ArweaveGatewayConfigurationStore.js exactly, one field
// instead of a list — see core/IpfsGatewayConfiguration.js's own header
// for why this stays single-value.
//
// "ABSENT" AND "DEFAULT" ARE NEVER THE SAME PERSISTED FACT. get() returns
// null — never an IpfsGatewayConfiguration holding
// DEFAULT_IPFS_GATEWAY_URL — when nothing has been saved. A caller
// resolving the EFFECTIVE gateway falls back to DEFAULT_IPFS_GATEWAY_URL
// itself; this store never performs that fallback.
//
// MALFORMED DATA DEGRADES; A GENUINE STORAGE FAILURE PROPAGATES — a
// persisted payload that isn't a plain object, or whose gatewayUrl fails
// isValidIpfsGatewayUrl(), degrades silently to "absent." The injected
// StorageProvider's own save()/load() throwing is never caught here.
export class IpfsGatewayConfigurationStore {
    constructor(storageProvider = new LocalStorageProvider()) {
        if (!(storageProvider instanceof StorageProvider)) {
            throw new Error('IpfsGatewayConfigurationStore requires a StorageProvider');
        }
        this._storageProvider = storageProvider;
    }

    save(configuration) {
        if (!(configuration instanceof IpfsGatewayConfiguration)) {
            throw new Error('IpfsGatewayConfigurationStore.save() requires an IpfsGatewayConfiguration instance');
        }
        this._storageProvider.save(IPFS_GATEWAY_CONFIGURATION_STORE_KEY, configuration.toJSON());
    }

    get() {
        const raw = this._storageProvider.load(IPFS_GATEWAY_CONFIGURATION_STORE_KEY);
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            return null;
        }
        if (isValidIpfsGatewayUrl(raw.gatewayUrl)) {
            return new IpfsGatewayConfiguration({ gatewayUrl: raw.gatewayUrl });
        }
        return null;
    }

    // The one way back to "no override, use the deployment default" — see
    // core/IpfsGatewayConfiguration.js's own header, "a value object,
    // never a default-injecting one."
    clear() {
        this._storageProvider.remove(IPFS_GATEWAY_CONFIGURATION_STORE_KEY);
    }
}
