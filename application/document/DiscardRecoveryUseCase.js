// Explicitly discards a recovery checkpoint WITHOUT touching the saved
// document. This is the user saying "throw away the autosaved work."
// The canonical document is untouched — discard only removes the
// protective checkpoint.
export class DiscardRecoveryUseCase {
    constructor(recoveryStore) {
        this._recoveryStore = recoveryStore;
    }
    // Returns true if a checkpoint existed and was removed.
    execute(documentId) {
        if (!this._recoveryStore.exists(documentId)) {
            return false;
        }
        this._recoveryStore.remove(documentId);
        return true;
    }
}
