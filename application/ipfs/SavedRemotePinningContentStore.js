import { ContentStore } from '../../content/ContentStore.js';
import { HttpPinningProvider } from '../../content/HttpPinningProvider.js';
import { IpfsRemotePinningContentStore } from '../../content/IpfsRemotePinningContentStore.js';
import { remotePinningConfigurationFromSettings } from './IpfsRemotePinningDraft.js';

// Places a snapshot with the remote pinning service saved under Content
// Provider, for the saved IPFS (Remote Pinning) preference. It reads the
// saved service and this visit's token on every put(), so a change applies
// at once, and builds a fresh pinning provider each time: nothing here holds
// a credential between uploads. What it places is ordinary IPFS content, so
// its `storage` is 'ipfs' and a placement made through it resolves like any
// other IPFS placement.
//
// Write-only: reading IPFS content goes through the gateways.
export class SavedRemotePinningContentStore extends ContentStore {
    constructor({ settingsStore, createPinningProvider = (options) => new HttpPinningProvider(options) } = {}) {
        super();
        if (!settingsStore || typeof settingsStore.get !== 'function') {
            throw new Error('SavedRemotePinningContentStore: an IpfsRemotePinningSettingsStore is required');
        }
        this._settingsStore = settingsStore;
        this._createPinningProvider = createPinningProvider;
    }

    get storage() { return 'ipfs'; }

    // Whether a service is saved, so the preference can say so before trying.
    isConfigured() {
        return this._settingsStore.get() !== null;
    }

    async put(bytes) {
        const configuration = remotePinningConfigurationFromSettings(this._settingsStore.get());
        if (!configuration) {
            throw new Error('No remote pinning service is set up. Set one up under Network Settings → Content Provider.');
        }
        const provider = this._createPinningProvider({
            endpoint: configuration.endpoint,
            credential: configuration.credential,
            ...(configuration.requestField ? { fileFieldName: configuration.requestField } : {}),
            ...(configuration.responseField ? { cidField: configuration.responseField } : {})
        });
        return new IpfsRemotePinningContentStore({ provider }).put(bytes);
    }

    async get() {
        throw new Error('SavedRemotePinningContentStore is write-only; IPFS content is read through the gateways');
    }
}
