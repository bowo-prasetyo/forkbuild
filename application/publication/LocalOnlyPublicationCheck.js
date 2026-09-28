import { PublicationDistributionLifecyclePersistence } from './distribution/PublicationDistributionLifecyclePersistence.js';
import { PublicationDistributionState } from './distribution/PublicationDistributionLifecycle.js';

const OWN_PUBLICATIONS_KEY = 'forkbuild-publications';
const LOCAL_STORAGE_KIND = 'local';

// Whether one of your own publications exists only in this browser:
// published here, and never uploaded from here to IPFS or Arweave (neither
// its Signed Claim nor a placement of its snapshot). Clearing the
// browser's data would delete it for good, so the Repository says so.
// Uploads made from another device, or shares with peers, are not known
// here; peers hold a copy only while they keep it.
export class LocalOnlyPublicationCheck {
    constructor({
        storageProvider,
        placementCatalog = null,
        lifecyclePersistence = new PublicationDistributionLifecyclePersistence(storageProvider)
    }) {
        this._storage = storageProvider;
        this._placementCatalog = placementCatalog;
        this._lifecyclePersistence = lifecyclePersistence;
    }

    isOnlyOnThisDevice(publication) {
        if (!publication || !publication.id || !publication.contentHash) return false;
        const records = this._storage.load(OWN_PUBLICATIONS_KEY);
        const own = Array.isArray(records)
            && records.some((record) => record && record.id === publication.id && record.contentHash === publication.contentHash);
        if (!own) return false;
        const lifecycle = this._lifecyclePersistence.load(publication.id);
        if (lifecycle && lifecycle.material.state === PublicationDistributionState.PRESENT) return false;
        const placements = this._placementCatalog ? this._placementCatalog.findByContentHash(publication.contentHash) : [];
        return !placements.some((placement) => placement.storage !== LOCAL_STORAGE_KIND);
    }
}
