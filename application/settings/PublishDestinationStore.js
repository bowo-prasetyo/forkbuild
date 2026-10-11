// Where this device sends a build each time it publishes (docs/Pillars.md,
// "Infrastructure, kept out of sight": one verb, Publish, and one choice
// inside it). Kept after a send that worked with "Send here every time I
// publish" ticked; null until then, or once unticked, and a build that is
// published stays on this device and in its links. Personal and local: never
// published or shared.
import { StorageProvider } from '../../storage/StorageProvider.js';

const STORAGE_KEY = 'publish-destination';

export const PUBLISH_DISCOVERY_PROVIDERS = Object.freeze(['nostr', 'arweave', 'steem', 'blurt']);
// Remote pinning is left out: its token is kept only for the visit
// (application/ipfs/IpfsRemotePublishingCredentialMemory.js).
export const PUBLISH_STORAGES = Object.freeze(['ar', 'ipfs', 'steem', 'blurt']);

// `{ discoveryProvider, storage }`, frozen, or null when either is unknown.
export function normalizePublishDestination(value) {
    if (!value || typeof value !== 'object') return null;
    const { discoveryProvider, storage } = value;
    if (!PUBLISH_DISCOVERY_PROVIDERS.includes(discoveryProvider) || !PUBLISH_STORAGES.includes(storage)) return null;
    return Object.freeze({ discoveryProvider, storage });
}

export class PublishDestinationStore {
    constructor({ storageProvider }) {
        if (!(storageProvider instanceof StorageProvider)) {
            throw new Error('PublishDestinationStore requires a StorageProvider');
        }
        this._storage = storageProvider;
    }

    get() {
        try {
            return normalizePublishDestination(this._storage.load(STORAGE_KEY));
        } catch {
            return null;
        }
    }

    // Returns what was kept: null for an unknown destination, which keeps nothing.
    save(destination) {
        const normalized = normalizePublishDestination(destination);
        if (!normalized) return null;
        this._storage.save(STORAGE_KEY, { ...normalized });
        return normalized;
    }

    clear() {
        try {
            this._storage.remove(STORAGE_KEY);
        } catch {
            // Nothing kept is the same as nothing to clear.
        }
    }
}
