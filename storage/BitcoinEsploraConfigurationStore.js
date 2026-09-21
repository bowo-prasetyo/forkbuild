import { StorageProvider } from './StorageProvider.js';
import { LocalStorageProvider } from './LocalStorageProvider.js';
import { BitcoinEsploraConfiguration, isValidBitcoinEsploraApiUrl } from '../core/BitcoinEsploraConfiguration.js';

const BITCOIN_ESPLORA_CONFIGURATION_STORE_KEY = 'bitcoin-esplora-configuration';

// User-Configurable Bitcoin Esplora Endpoint Configuration Persistence.
//
// Mirrors storage/ArweaveGatewayConfigurationStore.js exactly, one field.
//
// "ABSENT" AND "DEFAULT" ARE NEVER THE SAME PERSISTED FACT. `get()` returns
// `null` — never a BitcoinEsploraConfiguration holding
// `DEFAULT_BITCOIN_ESPLORA_API_URL` — when nothing has been saved. A caller
// resolving the EFFECTIVE endpoint falls back to
// `DEFAULT_BITCOIN_ESPLORA_API_URL` itself; this store never performs that
// fallback.
//
// MALFORMED DATA DEGRADES; A GENUINE STORAGE FAILURE PROPAGATES — a
// persisted payload that isn't a plain object, or whose `apiUrl` fails
// validation, degrades silently to "absent." The injected StorageProvider's
// own save()/load() throwing is never caught here.
export class BitcoinEsploraConfigurationStore {
    constructor(storageProvider = new LocalStorageProvider()) {
        if (!(storageProvider instanceof StorageProvider)) {
            throw new Error('BitcoinEsploraConfigurationStore requires a StorageProvider');
        }
        this._storageProvider = storageProvider;
    }

    save(configuration) {
        if (!(configuration instanceof BitcoinEsploraConfiguration)) {
            throw new Error('BitcoinEsploraConfigurationStore.save() requires a BitcoinEsploraConfiguration instance');
        }
        this._storageProvider.save(BITCOIN_ESPLORA_CONFIGURATION_STORE_KEY, configuration.toJSON());
    }

    get() {
        const raw = this._storageProvider.load(BITCOIN_ESPLORA_CONFIGURATION_STORE_KEY);
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            return null;
        }
        if (!isValidBitcoinEsploraApiUrl(raw.apiUrl)) {
            return null;
        }
        return new BitcoinEsploraConfiguration({ apiUrl: raw.apiUrl });
    }

    // The one way back to "no override, use the deployment default" — see
    // core/BitcoinEsploraConfiguration.js's own header, "a value object,
    // never a default-injecting one."
    clear() {
        this._storageProvider.remove(BITCOIN_ESPLORA_CONFIGURATION_STORE_KEY);
    }
}
