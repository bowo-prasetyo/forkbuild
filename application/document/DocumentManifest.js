const MANIFEST_KEY = 'forkbuild-index';

// The catalog of saved documents — {id, title, modified, revision,
// contentHash} entries — kept as its own stored blob so a future Open
// Document dialog can read one small object instead of scanning every key
// a StorageProvider holds. As of 0.2.6 entries also carry `revision`
// (the last explicit save's revision) and `contentHash` for integrity.
export class DocumentManifest {
    constructor(storageProvider) {
        this._storageProvider = storageProvider;
    }
    list() {
        return this._storageProvider.load(MANIFEST_KEY) || [];
    }
    // 0.2.6 — look up a single entry by document id.
    find(id) {
        return this.list().find((item) => item.id === id) || null;
    }
    upsert(entry) {
        const entries = this.list().filter((item) => item.id !== entry.id);
        entries.push(entry);
        this._storageProvider.save(MANIFEST_KEY, entries);
    }
    remove(id) {
        const entries = this.list().filter((item) => item.id !== id);
        this._storageProvider.save(MANIFEST_KEY, entries);
    }
}
