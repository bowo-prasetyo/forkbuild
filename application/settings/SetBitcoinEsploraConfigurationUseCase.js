import { BitcoinEsploraConfiguration } from '../../core/BitcoinEsploraConfiguration.js';
import { BitcoinEsploraConfigurationStore } from '../../storage/BitcoinEsploraConfigurationStore.js';

// Bitcoin Esplora Endpoint Settings Write Use Case. Mirrors application/
// SetArweaveGatewayConfigurationUseCase.js exactly: a settings view hands
// this a plain `{ apiUrl }`, never a constructed value object; this class
// alone builds and validates the BitcoinEsploraConfiguration and persists
// it. An invalid URL throws before save() is ever called, so a rejected
// input leaves whatever was previously on file untouched.
export class SetBitcoinEsploraConfigurationUseCase {
    constructor({ bitcoinEsploraConfigurationStore } = {}) {
        if (!(bitcoinEsploraConfigurationStore instanceof BitcoinEsploraConfigurationStore)) {
            throw new Error('SetBitcoinEsploraConfigurationUseCase requires a BitcoinEsploraConfigurationStore');
        }
        this._store = bitcoinEsploraConfigurationStore;
    }

    // Takes either `apiUrls` (the settings page's list) or a single `apiUrl`;
    // core/BitcoinEsploraConfiguration.js rejects both or neither.
    execute({ apiUrl, apiUrls } = {}) {
        const configuration = new BitcoinEsploraConfiguration(apiUrls !== undefined ? { apiUrls } : { apiUrl });
        this._store.save(configuration);
        return configuration;
    }
}
