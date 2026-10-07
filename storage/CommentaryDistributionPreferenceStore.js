import { StorageProvider } from './StorageProvider.js';
import { LocalStorageProvider } from './LocalStorageProvider.js';
import { isValidCommentaryDistributionProvider } from '../core/CommentaryDistributionProvider.js';

const COMMENTARY_DISTRIBUTION_PREFERENCE_STORE_KEY = 'commentary-distribution-preference';

// This device's default network for comments, or none saved. With none, comments
// follow the Announcement / Discovery provider (see
// core/CommentaryDistributionProvider.js). A stored value that isn't a known
// provider reads as none saved.
export class CommentaryDistributionPreferenceStore {
    constructor(storageProvider = new LocalStorageProvider()) {
        if (!(storageProvider instanceof StorageProvider)) {
            throw new Error('CommentaryDistributionPreferenceStore requires a StorageProvider');
        }
        this._storageProvider = storageProvider;
    }

    // `providerKey` is one of COMMENTARY_DISTRIBUTION_PROVIDER_KEYS, or null to
    // follow the Announcement / Discovery provider again.
    save(providerKey) {
        if (providerKey === null) {
            this._storageProvider.remove(COMMENTARY_DISTRIBUTION_PREFERENCE_STORE_KEY);
            return;
        }
        if (!isValidCommentaryDistributionProvider(providerKey)) {
            throw new Error(`CommentaryDistributionPreferenceStore.save() does not know the provider "${providerKey}"`);
        }
        this._storageProvider.save(COMMENTARY_DISTRIBUTION_PREFERENCE_STORE_KEY, { providerKey });
    }

    get() {
        const raw = this._storageProvider.load(COMMENTARY_DISTRIBUTION_PREFERENCE_STORE_KEY);
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
        return isValidCommentaryDistributionProvider(raw.providerKey) ? raw.providerKey : null;
    }
}
