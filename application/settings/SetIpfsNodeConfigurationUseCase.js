import { IpfsNodeConfiguration } from '../../core/IpfsNodeConfiguration.js';
import { IpfsNodeConfigurationStore } from '../../storage/IpfsNodeConfigurationStore.js';

// IPFS Node Settings Write Use Case. Mirrors application/
// SetIpfsGatewayConfigurationUseCase.js exactly: a settings view hands this
// a plain { apiUrl }, never a constructed value object; this class alone
// builds and validates the IpfsNodeConfiguration and persists it. An
// invalid URL throws before save() is ever called, so a rejected input
// leaves whatever was previously on file untouched.
export class SetIpfsNodeConfigurationUseCase {
    constructor({ ipfsNodeConfigurationStore } = {}) {
        if (!(ipfsNodeConfigurationStore instanceof IpfsNodeConfigurationStore)) {
            throw new Error('SetIpfsNodeConfigurationUseCase requires an IpfsNodeConfigurationStore');
        }
        this._store = ipfsNodeConfigurationStore;
    }

    execute({ apiUrl } = {}) {
        const configuration = new IpfsNodeConfiguration({ apiUrl });
        this._store.save(configuration);
        return configuration;
    }
}
