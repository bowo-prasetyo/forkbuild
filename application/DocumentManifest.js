const MANIFEST_KEY = 'forkbuild-index';

// The catalog of saved documents — {id, title, modified} entries — kept
// as its own stored blob so a future Open Document dialog can read one
// small object instead of scanning every key a StorageProvider holds.
// StorageProvider itself doesn't know this concept exists; a manifest is
// just another named blob as far as it's concerned. Shared by
// SaveDocumentUseCase (upsert on every save) and LoadDocumentUseCase
// (list for a future picker) so the shaping logic lives in one place.
export class DocumentManifest {
    constructor(storageProvider) {
        this._storageProvider = storageProvider;
    }

    list() {
        return this._storageProvider.load(MANIFEST_KEY) || [];
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
