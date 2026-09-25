import { RecoveryStore } from './RecoveryStore.js';

const RECOVERY_KEY_PREFIX = 'recovery:';
// A small record of each checkpoint's revision, so autosave and Save can
// read it without parsing the whole checkpoint (a large build's is
// megabytes).
const RECOVERY_INFO_KEY_PREFIX = 'recovery-info:';

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
        this._storageProvider.save(RECOVERY_INFO_KEY_PREFIX + documentId, {
            revision: checkpoint && Number.isFinite(checkpoint.revision) ? checkpoint.revision : 0
        });
    }
    load(documentId) {
        return this._storageProvider.load(RECOVERY_KEY_PREFIX + documentId);
    }
    remove(documentId) {
        this._storageProvider.remove(RECOVERY_KEY_PREFIX + documentId);
        this._storageProvider.remove(RECOVERY_INFO_KEY_PREFIX + documentId);
    }
    exists(documentId) {
        return this._loadInfo(documentId) !== null || this.load(documentId) !== null;
    }
    // Checkpoints written before the info record existed fall back to
    // reading the checkpoint itself.
    loadRevision(documentId) {
        const info = this._loadInfo(documentId);
        if (info) {
            return Number.isFinite(info.revision) ? info.revision : 0;
        }
        return super.loadRevision(documentId);
    }
    _loadInfo(documentId) {
        return this._storageProvider.load(RECOVERY_INFO_KEY_PREFIX + documentId);
    }
}
