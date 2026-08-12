import { DocumentManager } from './DocumentManager.js';

const DEFAULT_AUTOSAVE_DELAY_MS = 2000;

// Debounced autosave orchestration (0.2.6). Deliberately boring and
// framework-agnostic: it knows nothing about Vue or Three.js. It watches
// the DocumentManager's state; while the document stays dirty it keeps
// postponing the checkpoint, and only fires AutosaveDocumentUseCase once
// the document has been idle for the configured delay. When the document
// becomes clean (explicit save), any pending autosave is cancelled.
//
// Lives in application/ (not persistence/) because it depends on
// DocumentManager and AutosaveDocumentUseCase — persistence/ must not
// import application/. Timer functions are injectable for deterministic
// testing.
export class AutosaveScheduler {
    constructor(autosaveDocumentUseCase, documentManager, options = {}) {
        const {
            delay = DEFAULT_AUTOSAVE_DELAY_MS,
            setTimeoutFn = null,
            clearTimeoutFn = null
        } = options;
        this._autosaveDocumentUseCase = autosaveDocumentUseCase;
        this._documentManager = documentManager;
        this._delay = delay;
        this._setTimeout = setTimeoutFn || ((fn, ms) => setTimeout(fn, ms));
        this._clearTimeout = clearTimeoutFn || ((id) => clearTimeout(id));
        this._timer = null;
        this._unsubscribe = null;
    }

    start() {
        if (this._unsubscribe) {
            return;
        }
        this._unsubscribe = this._documentManager.onStateChanged((state) => {
            if (state.dirty) {
                this._schedule();
            } else {
                this.cancel();
            }
        });
    }

    _schedule() {
        this.cancel();
        this._timer = this._setTimeout(() => {
            this._timer = null;
            if (this._documentManager.state.dirty) {
                this._autosaveDocumentUseCase.execute(this._documentManager);
            }
        }, this._delay);
    }

    cancel() {
        if (this._timer !== null) {
            this._clearTimeout(this._timer);
            this._timer = null;
        }
    }

    stop() {
        this.cancel();
        if (this._unsubscribe) {
            this._unsubscribe();
            this._unsubscribe = null;
        }
    }
}
AutosaveScheduler.DEFAULT_DELAY_MS = DEFAULT_AUTOSAVE_DELAY_MS;
