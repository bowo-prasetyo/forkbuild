import { StorageProvider } from './StorageProvider.js';
import { LocalStorageProvider } from './LocalStorageProvider.js';

// Uploads to Steem content storage that posted their manifest but not yet
// every part, so that storing the same content again with the same account
// resumes the upload instead of starting over (docs/Protocol.md, "Proposed:
// Steem Content Storage", "Uploading"). One record per account and content
// hash: `{ author, permlink, contentHash }`. The chain stays the source of
// truth; a record only says where to look.

const KEY_PREFIX = 'steem-content-upload:';

export class SteemContentUploadStore {
    constructor(storageProvider = new LocalStorageProvider()) {
        if (!(storageProvider instanceof StorageProvider)) {
            throw new Error('SteemContentUploadStore requires a StorageProvider');
        }
        this._storageProvider = storageProvider;
    }

    get(author, contentHash) {
        const raw = this._storageProvider.load(key(author, contentHash));
        if (!raw || typeof raw !== 'object' || raw.author !== author || raw.contentHash !== contentHash || typeof raw.permlink !== 'string') {
            return null;
        }
        return Object.freeze({ author: raw.author, permlink: raw.permlink, contentHash: raw.contentHash });
    }

    save({ author, permlink, contentHash }) {
        this._storageProvider.save(key(author, contentHash), { author, permlink, contentHash });
    }

    remove(author, contentHash) {
        this._storageProvider.remove(key(author, contentHash));
    }
}

function key(author, contentHash) {
    return `${KEY_PREFIX}${author}:${contentHash}`;
}
