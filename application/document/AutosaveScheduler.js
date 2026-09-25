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
            clearTimeoutFn = null,
            // Called with the error when a timed checkpoint fails (a full
            // browser storage, most likely). The timer runs outside any
            // caller, so without this the error would go uncaught.
            onError = null
        } = options;
        this._onError = typeof onError === 'function' ? onError : null;
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
            if (!this._documentManager.state.dirty) {
                return;
            }
            try {
                this._autosaveDocumentUseCase.execute(this._documentManager);
            } catch (error) {
                if (this._onError) {
                    this._onError(error);
                } else {
                    console.error('Autosave: could not write a recovery checkpoint', error);
                }
            }
        }, this._delay);
    }

    cancel() {
        if (this._timer !== null) {
            this._clearTimeout(this._timer);
            this._timer = null;
        }
    }

    // 0.9.580 — Editor Trailing-Autosave Loss Window closure. Intended
    // caller: EditorView.js's own onBeforeUnmount(), immediately before
    // stop() below — closing the exact gap 0.9.579 Section C proved:
    // stop() alone is cancel()-then-unsubscribe, so a timer pending at
    // the moment of a genuine exit was simply discarded, silently
    // losing whatever edit(s) triggered it.
    //
    // Fires the checkpoint early ONLY when a timer is actually PENDING
    // — i.e. there is scheduled work this exit would otherwise cancel
    // unfired. That, not `state.dirty` alone, is what distinguishes "an
    // edit is still waiting on its debounce" from "the debounce already
    // fired": AutosaveDocumentUseCase deliberately never clears dirty
    // (see that class's own header), so a checkpoint that already ran
    // still leaves the document reading dirty, with no timer pending. A
    // trailing flush() call after a normal firing (or with no edit ever
    // made) is therefore always a safe no-op, never a redundant second
    // write — see this class's own test suite for both orderings.
    //
    // Propagates whatever AutosaveDocumentUseCase.execute() throws,
    // unchanged: the same "no try/catch here" contract this codebase
    // already applies to an explicit Save failure (ui/components/
    // Toolbar.js's own save()) — no new failure vocabulary invented for
    // this narrower, exit-time case. AutosaveDocumentUseCase's own
    // atomic failure behavior (see that class's own test coverage)
    // already guarantees a thrown failure here leaves DocumentManager
    // state, and the recovery store, completely untouched.
    flush() {
        const wasPending = this._timer !== null;
        this.cancel();
        if (!wasPending || !this._documentManager.state.dirty) {
            return null;
        }
        return this._autosaveDocumentUseCase.execute(this._documentManager);
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
