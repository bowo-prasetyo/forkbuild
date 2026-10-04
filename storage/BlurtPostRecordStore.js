import { StorageProvider } from './StorageProvider.js';
import { LocalStorageProvider } from './LocalStorageProvider.js';

// Which Blurt transaction this device made that commits to a contentHash
// (docs/Protocol.md, "Proposed: Blurt Substrate", "Anchoring"), so that
// anchoring that contentHash later reuses the post instead of making
// another. One record per account and contentHash: `{ author, permlink,
// trxId, blockNum }`. The anchor publisher still finds the transaction in
// its block before it trusts a record.

const KEY_PREFIX = 'blurt-post-record:';
const TRANSACTION_ID_PATTERN = /^[0-9a-f]{40}$/;

export class BlurtPostRecordStore {
    constructor(storageProvider = new LocalStorageProvider()) {
        if (!(storageProvider instanceof StorageProvider)) {
            throw new Error('BlurtPostRecordStore requires a StorageProvider');
        }
        this._storageProvider = storageProvider;
    }

    get(author, contentHash) {
        const raw = this._storageProvider.load(key(author, contentHash));
        if (!raw || typeof raw !== 'object' || raw.author !== author || typeof raw.permlink !== 'string' || !TRANSACTION_ID_PATTERN.test(raw.trxId ?? '')) {
            return null;
        }
        return Object.freeze({ author: raw.author, permlink: raw.permlink, trxId: raw.trxId, blockNum: Number.isSafeInteger(raw.blockNum) ? raw.blockNum : null });
    }

    save(author, contentHash, { permlink, trxId, blockNum = null }) {
        this._storageProvider.save(key(author, contentHash), { author, permlink, trxId, blockNum });
    }

    remove(author, contentHash) {
        this._storageProvider.remove(key(author, contentHash));
    }
}

function key(author, contentHash) {
    return `${KEY_PREFIX}${author}:${contentHash}`;
}
