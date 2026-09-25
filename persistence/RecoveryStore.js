// Base class every recovery store extends. A RecoveryStore persists
// autosave checkpoints — the "recovery state" layer that protects
// unsaved work against application failure. It is deliberately tiny:
// save / load / remove / exists, keyed by documentId.
//
// The application never knows whether the backend is localStorage,
// IndexedDB, a filesystem, or remote storage — the same adapter pattern
// as StorageProvider / DiscoveryProvider / PublisherProvider.
export class RecoveryStore {
    save(documentId, checkpoint) {
        throw new Error('RecoveryStore.save() must be implemented by a subclass');
    }
    load(documentId) {
        throw new Error('RecoveryStore.load() must be implemented by a subclass');
    }
    remove(documentId) {
        throw new Error('RecoveryStore.remove() must be implemented by a subclass');
    }
    exists(documentId) {
        throw new Error('RecoveryStore.exists() must be implemented by a subclass');
    }
    // The checkpoint's revision, or 0 when there is none. A store that can
    // answer without reading the whole checkpoint overrides this.
    loadRevision(documentId) {
        const checkpoint = this.load(documentId);
        return checkpoint && Number.isFinite(checkpoint.revision) ? checkpoint.revision : 0;
    }
}
