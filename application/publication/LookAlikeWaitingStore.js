const STORAGE_KEY = 'look-alike-waiting:entries';

// The builds LookAlikeBuildNotifier is waiting to compare because their bytes
// hadn't reached this device yet, kept so a visit that ends before they arrive
// doesn't forget them: `{ publicationId, contentHash, since }` each, `since`
// the time (ms) it started waiting. Ids and hashes only; the Publications
// themselves are rebuilt at startup from what this device already keeps.
// Never leaves the device. Reading or writing never throws: a full or blocked
// storage only loses the list.
export class LookAlikeWaitingStore {
    constructor({ storageProvider }) {
        if (!storageProvider || typeof storageProvider.load !== 'function' || typeof storageProvider.save !== 'function') {
            throw new Error('LookAlikeWaitingStore: a storageProvider is required');
        }
        this._storage = storageProvider;
    }

    load() {
        let entries;
        try {
            entries = this._storage.load(STORAGE_KEY);
        } catch {
            return [];
        }
        return (Array.isArray(entries) ? entries : []).filter((entry) => entry
            && typeof entry.publicationId === 'string' && entry.publicationId
            && typeof entry.contentHash === 'string' && entry.contentHash
            && Number.isFinite(entry.since));
    }

    save(entries) {
        try {
            this._storage.save(STORAGE_KEY, entries.map(({ publicationId, contentHash, since }) => ({ publicationId, contentHash, since })));
        } catch {
            // See this class's header.
        }
    }
}
