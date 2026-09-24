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

    execute({ apiUrl } = {}) {
        const configuration = new BitcoinEsploraConfiguration({ apiUrl });
        this._store.save(configuration);
        return configuration;
    }
}
