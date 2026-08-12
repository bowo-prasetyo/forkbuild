import { RecoveryStore } from './RecoveryStore.js';

const RECOVERY_KEY_PREFIX = 'recovery:';

// The V0.1 concrete recovery store: checkpoints namespaced under
// 'recovery:' via an injected StorageProvider (LocalStorageProvider
// further prefixes to 'forkbuild:recovery:'). Kept strictly separate
// from the canonical saved documents ('forkbuild:<documentId>') and from
// publication snapshots ('forkbuild:snapshot:<publicationId>'), so the
// three persistence concerns never share a key space.
export class LocalRecoveryStore extends RecoveryStore {
    constructor(storageProvider) {
        super();
        this._storageProvider = storageProvider;
    }
    save(documentId, checkpoint) {
        this._storageProvider.save(RECOVERY_KEY_PREFIX + documentId, checkpoint);
    }
    load(documentId) {
        return this._storageProvider.load(RECOVERY_KEY_PREFIX + documentId);
    }
    remove(documentId) {
        this._storageProvider.remove(RECOVERY_KEY_PREFIX + documentId);
    }
    exists(documentId) {
        return this.load(documentId) !== null;
    }
}
