// Finds unsaved work the Editor can offer when it opens: the newest recovery
// checkpoint, for a build other than the open one, that is still newer than
// that build's last save. Each visit to the Editor starts a new document, so
// a checkpoint left behind when the page closed belongs to a build that is
// not open, and RecoveryObserver, which probes only the open build, would
// never offer it; a build that was never saved can't even be opened to ask.
export class FindUnsavedWorkUseCase {
    constructor(recoveryStore, checkRecoveryUseCase) {
        this._recoveryStore = recoveryStore;
        this._checkRecoveryUseCase = checkRecoveryUseCase;
    }

    // CheckRecoveryUseCase's descriptor for that checkpoint, with the build's
    // `title` (null when unknown), or null when there is nothing to offer.
    // The check removes obsolete and corrupt checkpoints on the way.
    execute({ excludeDocumentId = null } = {}) {
        const candidates = [];
        for (const documentId of this._recoveryStore.list()) {
            if (documentId === excludeDocumentId) continue;
            const info = this._readInfo(documentId);
            if (info) candidates.push({ documentId, info });
        }
        candidates.sort((a, b) => savedTime(b.info) - savedTime(a.info));
        for (const { documentId, info } of candidates) {
            let status;
            try {
                status = this._checkRecoveryUseCase.execute(documentId);
            } catch {
                // An unreadable checkpoint never stops the rest being offered.
                continue;
            }
            if (status.available) return { ...status, title: info.title };
        }
        return null;
    }

    _readInfo(documentId) {
        try {
            return this._recoveryStore.loadInfo(documentId);
        } catch {
            return null;
        }
    }
}

function savedTime(info) {
    const time = Date.parse(info.savedAt);
    return Number.isNaN(time) ? 0 : time;
}
