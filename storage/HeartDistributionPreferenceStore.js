import { StorageProvider } from './StorageProvider.js';
import { LocalStorageProvider } from './LocalStorageProvider.js';
import { isValidCommentaryDistributionProvider } from '../core/CommentaryDistributionProvider.js';

// The network this device sends hearts to (Settings → Announcement /
// Discovery → Hearts): one of the comment networks or "Local & peers only".
// Nothing saved means Nostr, never the comment or announcement default: a
// heart is one tap, and Nostr is the one network where a tap costs nothing.
const HEART_DISTRIBUTION_PREFERENCE_STORE_KEY = 'heart-distribution-preference';
export const DEFAULT_HEART_DISTRIBUTION_PROVIDER = 'nostr';

export class HeartDistributionPreferenceStore {
    constructor(storageProvider = new LocalStorageProvider()) {
        if (!(storageProvider instanceof StorageProvider)) {
            throw new Error('HeartDistributionPreferenceStore requires a StorageProvider');
        }
        this._storageProvider = storageProvider;
    }

    save(providerKey) {
        if (!isValidCommentaryDistributionProvider(providerKey)) {
            throw new Error(`HeartDistributionPreferenceStore.save() does not know the provider "${providerKey}"`);
        }
        this._storageProvider.save(HEART_DISTRIBUTION_PREFERENCE_STORE_KEY, { providerKey });
    }

    // The saved network, else Nostr.
    get() {
        const raw = this._storageProvider.load(HEART_DISTRIBUTION_PREFERENCE_STORE_KEY);
        const saved = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw.providerKey : null;
        return isValidCommentaryDistributionProvider(saved) ? saved : DEFAULT_HEART_DISTRIBUTION_PROVIDER;
    }
}
