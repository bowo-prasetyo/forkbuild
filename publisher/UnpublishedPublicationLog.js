export const UNPUBLISHED_PUBLICATIONS_KEY = 'forkbuild-unpublished-publications';

// The ids of Publications this device unpublished. Unpublishing only removes
// the local record: anything already distributed stays on Nostr, Arweave or
// Steem for good, and the Repository's search of the networks
// (application/publication/RepositoryNetworkDiscovery.js) would otherwise
// find it there and list it again as a new creation. This log is what tells
// it not to.
//
// A per-device memory, never a tombstone: nothing is announced, and other
// devices and other people still find the Publication. Explicit actions
// (opening a shared link, a peer sharing it, a World Encounter) are not
// affected. Ids are never dropped, so an entry never expires; publishing
// again makes a new id, which this log never names.
export class UnpublishedPublicationLog {
    constructor(storageProvider) {
        this._storage = storageProvider;
    }

    add(publicationId) {
        if (typeof publicationId !== 'string' || publicationId.length === 0) return;
        const ids = this.list();
        if (ids.includes(publicationId)) return;
        ids.push(publicationId);
        this._storage.save(UNPUBLISHED_PUBLICATIONS_KEY, ids);
    }

    has(publicationId) {
        return typeof publicationId === 'string' && this.list().includes(publicationId);
    }

    list() {
        const stored = this._storage.load(UNPUBLISHED_PUBLICATIONS_KEY);
        return Array.isArray(stored) ? stored.filter((id) => typeof id === 'string' && id.length > 0) : [];
    }
}
