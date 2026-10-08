import {
    completeFirstBuildSteps, firstBuildStepsForEdit, FirstBuildStep, isFirstBuildComplete, normalizeFirstBuildProgress
} from '../../core/FirstBuildChecklist.js';
import { EDITOR_ACTIVITY } from '../../core/EditorSoundCues.js';

// Ticks off the guided first build (core/FirstBuildChecklist.js) as the
// person works in the Editor: its own edits (EditorSession#onCommandActivity,
// so undo, redo and collaborators' edits never count), a save, and a link
// copied or shared. Saves each change to `store` and tells `subscribe()`
// listeners. Never throws into the Editor.
export class FirstBuildChecklistTracker {
    // `brickHeight(definitionId)` tells a placed brick on the ground from one
    // stacked on another.
    constructor({ store, brickHeight = () => 1 }) {
        this._store = store;
        this._brickHeight = brickHeight;
        this._listeners = new Set();
        this._progress = store.get();
    }

    // A device that has never seen the guide but already saved or published
    // work knows the Editor: the guide starts hidden there (Show guide brings
    // it back).
    start({ experienced = false } = {}) {
        if (experienced && !this._store.hasRecord()) {
            this._set({ ...this._progress, dismissed: true });
        }
        return this._progress;
    }

    progress() {
        return this._progress;
    }

    subscribe(listener) {
        this._listeners.add(listener);
        return () => this._listeners.delete(listener);
    }

    // Follows `editorSession`'s edits; returns the unsubscribe function.
    observe(editorSession) {
        if (!editorSession || typeof editorSession.onCommandActivity !== 'function') return () => {};
        return editorSession.onCommandActivity((activity, command) => {
            if (activity !== EDITOR_ACTIVITY.EXECUTED) return;
            this._complete(firstBuildStepsForEdit(command, this._brickHeight));
        });
    }

    saved() {
        this._complete([FirstBuildStep.SAVE]);
    }

    shared() {
        this._complete([FirstBuildStep.SHARE]);
    }

    dismiss() {
        this._set({ ...this._progress, dismissed: true });
    }

    // Brings the guide back; a finished one shows its finish again.
    show() {
        this._set({ ...this._progress, dismissed: false, celebrated: false });
    }

    // The finish has been seen: a complete guide then stays out of the way.
    celebrated() {
        if (isFirstBuildComplete(this._progress)) this._set({ ...this._progress, celebrated: true });
    }

    restart() {
        this._set(normalizeFirstBuildProgress(null));
    }

    _complete(steps) {
        if (!steps.length || steps.every((step) => this._progress.completed.includes(step))) return;
        this._set(completeFirstBuildSteps(this._progress, steps));
    }

    _set(progress) {
        try {
            this._progress = this._store.save(progress);
        } catch {
            this._progress = normalizeFirstBuildProgress(progress);
        }
        for (const listener of [...this._listeners]) {
            try {
                listener(this._progress);
            } catch {
                // A listener's failure never stops the others.
            }
        }
    }
}
