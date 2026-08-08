import { DiscoveryProvider } from './DiscoveryProvider.js';
import { Publication } from '../publisher/Publication.js';

const PUBLICATIONS_KEY = 'forkbuild-publications';

// The V0.1 concrete discovery provider: reads the same localStorage key
// that LocalPublisherProvider writes to. No indexing, no search backend —
// just a straightforward scan that exercises the exact interface a future
// SteemDiscoveryProvider or IPFSDiscoveryProvider will use.
export class LocalDiscoveryProvider extends DiscoveryProvider {
    constructor(storageProvider) {
        super();
        this._storageProvider = storageProvider;
    }

    list() {
        return this._loadRecords().map((record) => Publication.fromJSON(record));
    }

    findById(id) {
        const record = this._loadRecords().find((r) => r.id === id);
        return record ? Publication.fromJSON(record) : null;
    }

    findByAuthor(author) {
        return this._loadRecords()
            .filter((r) => r.author === author)
            .map((record) => Publication.fromJSON(record));
    }

    findByParentId(parentDocumentId) {
        return this._loadRecords()
            .filter((r) => r.parentDocumentId === parentDocumentId)
            .map((record) => Publication.fromJSON(record));
    }

    _loadRecords() {
        return this._storageProvider.load(PUBLICATIONS_KEY) || [];
    }
}
