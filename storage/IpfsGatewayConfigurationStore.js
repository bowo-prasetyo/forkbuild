import { StorageProvider } from './StorageProvider.js';
import { LocalStorageProvider } from './LocalStorageProvider.js';
import { IpfsGatewayConfiguration, isValidIpfsGatewayUrl } from '../core/IpfsGatewayConfiguration.js';

const IPFS_GATEWAY_CONFIGURATION_STORE_KEY = 'ipfs-gateway-configuration';

// 0.9.665 — User-Configurable IPFS Gateway Configuration Persistence.
//
// Mirrors storage/ArweaveGatewayConfigurationStore.js exactly.
//
// "ABSENT" AND "DEFAULT" ARE NEVER THE SAME PERSISTED FACT. get() returns
// null — never an IpfsGatewayConfiguration holding
// DEFAULT_IPFS_GATEWAY_URL — when nothing has been saved. A caller
// resolving the EFFECTIVE gateway falls back to DEFAULT_IPFS_GATEWAY_URL
// itself; this store never performs that fallback.
//
// MALFORMED DATA DEGRADES; A GENUINE STORAGE FAILURE PROPAGATES — a
// persisted payload that isn't a plain object, or whose gatewayUrl(s) fail
// validation, degrades silently to "absent." The injected StorageProvider's
// own save()/load() throwing is never caught here.
//
// 0.9.666 — BOTH persisted shapes round-trip. configuration.toJSON() has
// written { gatewayUrls: [...] } since 0.9.666, but a payload saved by an
// earlier build of this codebase — { gatewayUrl: '...' } — is still read
// back exactly as it always was: a genuine, one-element ordered list,
// byte-identical in effect to what it always meant. An upgrade never
// loses, and never silently reinterprets, a user's existing single-gateway
// preference.
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
        if (Array.isArray(raw.gatewayUrls) && raw.gatewayUrls.length > 0 && raw.gatewayUrls.every(isValidIpfsGatewayUrl)) {
            return new IpfsGatewayConfiguration({ gatewayUrls: raw.gatewayUrls });
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
