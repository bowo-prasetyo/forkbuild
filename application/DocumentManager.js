import { EventBus } from '../core/events/EventBus.js';
import { Document } from '../core/Document.js';
import { DocumentState } from './editor-state/DocumentState.js';
import { CommandHistoryEvent } from './events/CommandHistoryEvent.js';
import { DocumentManagerEvent } from './events/DocumentManagerEvent.js';

// Owns document lifecycle — mirrors what CommandHistory does for command
// execution: one place decides what "the current document" is and how
// its DocumentState (dirty/readOnly/loadedFrom/lastSaved) changes.
// Nothing else should mutate DocumentState directly.
//
// As of 0.1.20B, every state change publishes DocumentManagerEvent.
// STATE_CHANGED through its own EventBus, so ui/ (a dirty indicator, a
// recent-documents list) can react without polling. onStateChanged()
// wraps the subscription — ui/ never imports DocumentManagerEvent or
// EventBus itself, same reasoning as PaletteUseCase.onActiveBrickChanged().
export class DocumentManager {
    constructor(document = new Document()) {
        this._document = document;
        this._state = new DocumentState();
        this._eventBus = new EventBus();
        this._trackedCommandHistory = null;
    }

    get document() {
        return this._document;
    }

    get state() {
        return this._state;
    }

    markDirty() {
        this._setState(new DocumentState({
            dirty: true,
            readOnly: this._state.readOnly,
            loadedFrom: this._state.loadedFrom,
            lastSaved: this._state.lastSaved
        }));
    }

    // As of 0.1.39, also moves the tracked CommandHistory's save point to
    // its current cursor — SaveDocumentUseCase calls this after a
    // successful save, and from that moment on history.isDirty() answers
    // "changed relative to what is on disk."
    markSaved() {
        if (this._trackedCommandHistory) {
            this._trackedCommandHistory.markSaved();
        }
        this._setState(new DocumentState({
            dirty: false,
            readOnly: this._state.readOnly,
            loadedFrom: this._state.loadedFrom,
            lastSaved: new Date()
        }));
    }

    newDocument(document = new Document()) {
        this._document = document;
        this._setState(new DocumentState());
    }

    load(document, loadedFrom = null) {
        this._document = document;
        this._setState(new DocumentState({ dirty: false, loadedFrom, lastSaved: new Date() }));
    }

    close() {
        this._document = null;
        this._setState(new DocumentState());
    }

    // Returns an unsubscribe function.
    onStateChanged(callback) {
        const subscription = this._eventBus.subscribe(
            DocumentManagerEvent.STATE_CHANGED,
            ({ state }) => callback(state)
        );
        return () => subscription.unsubscribe();
    }

    // Subscribes to a CommandHistory's own event bus so every executed,
    // undone, or redone command refreshes this document's dirty flag —
    // without CommandHistory, or any tool, needing to call markDirty()
    // directly.
    //
    // As of 0.1.39 dirty is COMPUTED from the history's save point
    // (history.isDirty()) rather than set blindly on every event. This
    // resolves the 0.1.17 simplification: undoing back onto the saved
    // state correctly reports clean again, because the history knows
    // whether its current cursor sits on the save point. DocumentManager
    // remembers the tracked history so markSaved() can move the save
    // point in lockstep with DocumentState.
    // Returns an unsubscribe function.
    trackCommandHistory(commandHistory) {
        this._trackedCommandHistory = commandHistory;
        const syncDirty = () => this._syncDirtyFromHistory();
        const subscriptions = [
            commandHistory.eventBus.subscribe(CommandHistoryEvent.COMMAND_EXECUTED, syncDirty),
            commandHistory.eventBus.subscribe(CommandHistoryEvent.COMMAND_UNDONE, syncDirty),
            commandHistory.eventBus.subscribe(CommandHistoryEvent.COMMAND_REDONE, syncDirty)
        ];
        return () => {
            subscriptions.forEach((subscription) => subscription.unsubscribe());
            if (this._trackedCommandHistory === commandHistory) {
                this._trackedCommandHistory = null;
            }
        };
    }

    _syncDirtyFromHistory() {
        if (!this._trackedCommandHistory) {
            return;
        }
        this._setState(new DocumentState({
            dirty: this._trackedCommandHistory.isDirty(),
            readOnly: this._state.readOnly,
            loadedFrom: this._state.loadedFrom,
            lastSaved: this._state.lastSaved
        }));
    }

    _setState(state) {
        this._state = state;
        this._eventBus.publish(DocumentManagerEvent.STATE_CHANGED, { state });
    }
}
