import { RecoveryStore, checkpointInfo } from './RecoveryStore.js';

const RECOVERY_KEY_PREFIX = 'recovery:';
// A small record of each checkpoint's revision, time and title, so
// autosave, Save and the Editor's offer of unsaved work can read them
// without parsing the whole checkpoint (a large build's is megabytes).
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
        this._storageProvider.save(RECOVERY_INFO_KEY_PREFIX + documentId, checkpointInfo(checkpoint || {}));
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
    list() {
        return this._storageProvider.list()
            .filter((name) => name.startsWith(RECOVERY_KEY_PREFIX))
            .map((name) => name.slice(RECOVERY_KEY_PREFIX.length));
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
    // Info records written before they carried the time and title fall back
    // to reading the checkpoint itself.
    loadInfo(documentId) {
        const info = this._loadInfo(documentId);
        if (info && 'savedAt' in info) {
            return { revision: Number.isFinite(info.revision) ? info.revision : 0, savedAt: info.savedAt, title: info.title ?? null };
        }
        return super.loadInfo(documentId);
    }
    _loadInfo(documentId) {
        return this._storageProvider.load(RECOVERY_INFO_KEY_PREFIX + documentId);
    }
}
