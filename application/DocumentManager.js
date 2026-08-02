import { Document } from '../core/Document.js';
import { DocumentState } from './editor-state/DocumentState.js';
import { CommandHistoryEvent } from './events/CommandHistoryEvent.js';

// Owns document lifecycle — mirrors what CommandHistory does for command
// execution: one place decides what "the current document" is and how
// its DocumentState (dirty/readOnly/loadedFrom/lastSaved) changes.
// Nothing else should mutate DocumentState directly.
export class DocumentManager {
    constructor(document = new Document()) {
        this._document = document;
        this._state = new DocumentState();
    }

    get document() {
        return this._document;
    }

    get state() {
        return this._state;
    }

    markDirty() {
        this._state = new DocumentState({
            dirty: true,
            readOnly: this._state.readOnly,
            loadedFrom: this._state.loadedFrom,
            lastSaved: this._state.lastSaved
        });
    }

    markSaved() {
        this._state = new DocumentState({
            dirty: false,
            readOnly: this._state.readOnly,
            loadedFrom: this._state.loadedFrom,
            lastSaved: new Date()
        });
    }

    newDocument(document = new Document()) {
        this._document = document;
        this._state = new DocumentState();
    }

    load(document, loadedFrom = null) {
        this._document = document;
        this._state = new DocumentState({ dirty: false, loadedFrom, lastSaved: new Date() });
    }

    close() {
        this._document = null;
        this._state = new DocumentState();
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
    // needed until Serializer/Local Storage exist to make it observable.
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
}
