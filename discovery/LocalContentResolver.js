import { ContentResolver } from './ContentResolver.js';

// The V0.1 concrete content resolver: reads snapshots from the
// PublisherProvider's storage. This exercises the exact interface a
// future IPFSContentResolver or ArweaveContentResolver will use.
export class LocalContentResolver extends ContentResolver {
    constructor(publisherProvider) {
        super();
        this._publisherProvider = publisherProvider;
    }

    resolve(publicationId) {
        return this._publisherProvider.loadSnapshot(publicationId);
    }

    verify(publicationId, expectedHash) {
        return this._publisherProvider.verifySnapshot(publicationId, expectedHash);
    }
}
