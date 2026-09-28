export const OWN_SNAPSHOT_DISTRIBUTIONS_KEY = 'own-snapshot-distributions';
const MAX_ENTRIES = 500;

// Where this device has distributed snapshots (Distribute Snapshot, in the
// Editor's dialog, World View and the Publications page): the storage the
// bytes went to and the substrate that announced them. Nothing else keeps
// these results past a reload, and the Repository reads them to say where
// your own publications were distributed.
//
// One entry per content hash, storage and announcement substrate, newest
// last: { contentHash, publicationId, storage, uri, substrate, announcementId, at }.
export class OwnSnapshotDistributionLog {
    constructor(storageProvider, { now = () => new Date() } = {}) {
        this._storage = storageProvider;
        this._now = now;
    }

    // `result` is executeSnapshotDistributionCommand()'s { contentReference,
    // announcement }; `substrate` is 'nostr', 'arweave' or 'steem'.
    record({ result, substrate, publicationId = null }) {
        const reference = result && result.contentReference;
        if (!reference || typeof reference.hash !== 'string' || !reference.storage || reference.storage === 'local') return;
        const announcement = result.announcement && result.announcement.id ? result.announcement : null;
        const entry = {
            contentHash: reference.hash,
            publicationId: typeof publicationId === 'string' ? publicationId : null,
            storage: String(reference.storage),
            uri: typeof reference.uri === 'string' ? reference.uri : null,
            substrate: announcement && typeof substrate === 'string' ? substrate : null,
            announcementId: announcement ? String(announcement.id) : null,
            at: this._now().toISOString()
        };
        const kept = this.list().filter((e) => !(e.contentHash === entry.contentHash && e.storage === entry.storage && e.substrate === entry.substrate));
        kept.push(entry);
        this._storage.save(OWN_SNAPSHOT_DISTRIBUTIONS_KEY, kept.slice(-MAX_ENTRIES));
    }

    list() {
        const stored = this._storage.load(OWN_SNAPSHOT_DISTRIBUTIONS_KEY);
        return Array.isArray(stored) ? stored.filter((e) => e && typeof e.contentHash === 'string' && typeof e.storage === 'string') : [];
    }

    findByContentHash(contentHash) {
        return this.list().filter((e) => e.contentHash === contentHash);
    }
}
