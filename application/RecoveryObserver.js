// Watches a DocumentManager for document-identity changes and probes the
// existing CheckRecoveryUseCase exactly once per identity — the recovery
// counterpart to AutosaveScheduler.js, which watches the same
// DocumentManager for dirty-state changes. Neither class knows about the
// other; both are independent observers of the one DocumentManager, per
// docs/Roadmap.md 0.9.204 ("keep autosave and recovery semantically
// separate").
//
// Gating on identity (document.world.id), not on every onStateChanged
// tick, matters because DocumentManager fires that event on every dirty/
// clean transition too — an edit, an undo, an explicit Save. Without the
// gate, opening a document would re-run CheckRecoveryUseCase (which has
// its own side effects: it deletes an obsolete/corrupted checkpoint) on
// every keystroke instead of once at open time, exactly the "infer
// recovery from … dirty flags" anti-pattern this milestone's brief warns
// against.
//
// Lives in application/ for the identical reason AutosaveScheduler does:
// depends on DocumentManager + CheckRecoveryUseCase, framework-agnostic,
// no UI import.
export class RecoveryObserver {
    constructor(checkRecoveryUseCase, documentManager, options = {}) {
        const { onChange = null } = options;
        this._checkRecoveryUseCase = checkRecoveryUseCase;
        this._documentManager = documentManager;
        this._onChange = onChange;
        this._unsubscribe = null;
        this._checkedDocumentId = undefined;
        this._status = null;
    }

    // The most recent check result offered for the current document, or
    // null when none is available (no document, no checkpoint, or the
    // checkpoint was superseded/discarded/recovered).
    get status() {
        return this._status;
    }

    start() {
        if (this._unsubscribe) {
            return;
        }
        this._unsubscribe = this._documentManager.onStateChanged(() => this._checkCurrentDocument());
        this._checkCurrentDocument();
    }

    stop() {
        if (this._unsubscribe) {
            this._unsubscribe();
            this._unsubscribe = null;
        }
    }

    // Recover/Discard both resolve the checkpoint for the CURRENT
    // document without changing its identity, so no further
    // onStateChanged tick would naturally re-probe it. Callers invoke
    // this right after RecoverDocumentUseCase/DiscardRecoveryUseCase
    // succeeds so the offered status clears immediately rather than
    // staying stale until some later, unrelated document change.
    clear() {
        this._checkedDocumentId = this._currentDocumentId();
        this._setStatus(null);
    }

    _currentDocumentId() {
        const document = this._documentManager.document;
        return document ? document.world.id : null;
    }

    _checkCurrentDocument() {
        const documentId = this._currentDocumentId();
        if (documentId === this._checkedDocumentId) {
            return;
        }
        this._checkedDocumentId = documentId;
        if (documentId === null) {
            this._setStatus(null);
            return;
        }
        const result = this._checkRecoveryUseCase.execute(documentId);
        this._setStatus(result.available ? result : null);
    }

    _setStatus(status) {
        this._status = status;
        if (this._onChange) {
            this._onChange(status);
        }
    }
}
