import { describePublicationClaimLocator } from '../../core/ForkBuildAppLinks.js';

const STORAGE_KEY = 'forkbuild-network-publication-locators';
// The admission log keeps the Publications themselves; this only remembers
// where each signed record was read, so the oldest can go first.
export const MAX_NETWORK_PUBLICATION_LOCATORS = 2000;

// Where the signed record of each Publication found by Repository network
// discovery was read (`ar://…`, `steem://…`, `ipfs://…`), so its card's
// Explore can open it through the link view, which fetches and checks its
// build the first time (application/publication/OpenPublicationLink.js).
export class NetworkPublicationLocatorStore {
    constructor(storageProvider) {
        if (!storageProvider) {
            throw new Error('NetworkPublicationLocatorStore: storageProvider is required');
        }
        this._storageProvider = storageProvider;
    }

    // First-seen-wins, like the admission log. A locator no link can open is
    // not kept.
    set(publicationId, locator) {
        if (typeof publicationId !== 'string' || publicationId.length === 0 || !describePublicationClaimLocator(locator)) {
            return false;
        }
        const all = this._loadAll();
        if (all.some((entry) => entry.publicationId === publicationId)) {
            return false;
        }
        all.push({ publicationId, locator });
        this._storageProvider.save(STORAGE_KEY, all.slice(-MAX_NETWORK_PUBLICATION_LOCATORS));
        return true;
    }

    get(publicationId) {
        const entry = this._loadAll().find((candidate) => candidate.publicationId === publicationId);
        return entry ? entry.locator : null;
    }

    // The app route that opens this Publication's signed record, or null.
    viewPath(publicationId) {
        const described = describePublicationClaimLocator(this.get(publicationId));
        return described ? described.path : null;
    }

    _loadAll() {
        const stored = this._storageProvider.load(STORAGE_KEY);
        return Array.isArray(stored) ? stored.filter((entry) => entry && typeof entry.publicationId === 'string') : [];
    }
}
