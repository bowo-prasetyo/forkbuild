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

    markSaved() {
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
    // undone, or redone command marks this document dirty — without
    // CommandHistory, or any tool, needing to call markDirty() directly.
    // History already knows which operations actually changed the
    // document; that's exactly why this responsibility lives here rather
    // than being called from PlacementTool/SelectionTool. Simplification
    // worth naming: undo currently also marks dirty, even if it happens
    // to land exactly back on a previously-saved state — true "is the
    // content identical to what's on disk" tracking is future work, not
    // needed until this dirty indicator makes the distinction observable
    // enough to matter.
    // Returns an unsubscribe function.
    trackCommandHistory(commandHistory) {
        const markDirty = () => this.markDirty();
        const subscriptions = [
            commandHistory.eventBus.subscribe(CommandHistoryEvent.COMMAND_EXECUTED, markDirty),
            commandHistory.eventBus.subscribe(CommandHistoryEvent.COMMAND_UNDONE, markDirty),
            commandHistory.eventBus.subscribe(CommandHistoryEvent.COMMAND_REDONE, markDirty)
        ];
        return () => subscriptions.forEach((subscription) => subscription.unsubscribe());
    }

    _setState(state) {
        this._state = state;
        this._eventBus.publish(DocumentManagerEvent.STATE_CHANGED, { state });
    }
}
