// Who can find a build this device publishes (docs/Pillars.md, "one verb,
// Publish, and one choice inside it"): everyone, through a build note on
// Nostr that anyone's ForkBuild reads (core/BuildNote.js), or only people
// sent its link. Asked once, before the first publish, and changed in the
// same place later. Personal and local: never published or shared.
import { StorageProvider } from '../../storage/StorageProvider.js';

const STORAGE_KEY = 'publish-findability';

export const Findability = Object.freeze({
    EVERYONE: 'everyone',
    LINK: 'link'
});

const VALUES = new Set(Object.values(Findability));

export function normalizeFindability(value) {
    return VALUES.has(value) ? value : null;
}

export class FindabilityStore {
    constructor({ storageProvider }) {
        if (!(storageProvider instanceof StorageProvider)) {
            throw new Error('FindabilityStore requires a StorageProvider');
        }
        this._storage = storageProvider;
    }

    // The choice made on this device, or null before it is asked.
    get() {
        try {
            return normalizeFindability(this._storage.load(STORAGE_KEY)?.findability);
        } catch {
            return null;
        }
    }

    // Returns what was kept: null for anything that isn't a choice.
    set(findability) {
        const normalized = normalizeFindability(findability);
        if (!normalized) return null;
        this._storage.save(STORAGE_KEY, { findability: normalized });
        return normalized;
    }
}
