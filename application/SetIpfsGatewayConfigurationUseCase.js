import { IpfsGatewayConfiguration } from '../core/IpfsGatewayConfiguration.js';
import { IpfsGatewayConfigurationStore } from '../storage/IpfsGatewayConfigurationStore.js';

// 0.9.665 — IPFS Gateway Settings Write Use Case. Mirrors application/
// SetArweaveGatewayConfigurationUseCase.js exactly: a settings view hands
// this a plain { gatewayUrl }, never a constructed value object; this
// class alone builds and validates the IpfsGatewayConfiguration and
// persists it. An invalid URL throws before save() is ever called, so a
// rejected input leaves whatever was previously on file untouched.
export class SetIpfsGatewayConfigurationUseCase {
    constructor({ ipfsGatewayConfigurationStore } = {}) {
        if (!(ipfsGatewayConfigurationStore instanceof IpfsGatewayConfigurationStore)) {
            throw new Error('SetIpfsGatewayConfigurationUseCase requires an IpfsGatewayConfigurationStore');
        }
        this._store = ipfsGatewayConfigurationStore;
    }

    execute({ gatewayUrl } = {}) {
        const configuration = new IpfsGatewayConfiguration({ gatewayUrl });
        this._store.save(configuration);
        return configuration;
    }
}
