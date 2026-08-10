import { EventBus } from '../core/events/EventBus.js';
import { CommandHistoryEvent } from './events/CommandHistoryEvent.js';

const COMMAND_HISTORY_SCHEMA_VERSION = 1;

// Tools call commandHistory.execute(command) instead of
// command.execute(context) directly — the history decides what happens
// next, and tools never need to know whether undo/redo exists.
//
// As of 0.1.37, CommandHistory has an explicit persistent-session shape:
//   toJSON()   → { schemaVersion, cursor, commands: [...] }
//   fromJSON() → validates the envelope, reconstructs command instances,
//                and splits them into undo/redo stacks at cursor.
//
// This is intentionally separate from Document serialization. A document is
// canonical world state; command-history persistence is optional editing
// session state layered around that document.
//
// Linear history invariant: execute() after undo() clears the redo branch
// entirely. A fresh action invalidates whatever "future" an undo had left
// available.
//
// As of 0.1.39, CommandHistory also tracks a *save point*: markSaved()
// records the current cursor as "the state that is on disk," and isDirty()
// answers "does the current state differ from it." This is what makes the
// dirty indicator honest about undo: execute -> dirty, undo back onto the
// save point -> clean again.
//
// One subtlety: undoing PAST the save point and then executing a NEW
// command wipes the redo branch that contained the saved state — the save
// point becomes permanently unreachable and isDirty() stays true until the
// next markSaved(). Executing exactly AT the save point (normal forward
// work) keeps it valid.
//
// The save point is deliberately session-local: it is NOT part of
// toJSON()/fromJSON(). A restored history starts with its save point at
// cursor 0 (i.e. "dirty" whenever it contains commands); a caller that
// knows the restored state matches disk calls markSaved(). Canonical
// document persistence and session history persistence remain separate
// concerns (see 0.1.37).
export class CommandHistory {
    constructor(context, eventBus = new EventBus()) {
        this._context = context;
        this._eventBus = eventBus;
        this._undoStack = [];
        this._redoStack = [];
        this._savedCursor = 0;
        this._savePointValid = true;
    }

    get eventBus() {
        return this._eventBus;
    }

    execute(command) {
        command.execute(this._context);
        // If the save point was sitting in the redo branch, this execute
        // just wiped it — the saved state is no longer reachable. Checked
        // AFTER a successful execute (a throwing command changes nothing)
        // and BEFORE the push, so _undoStack.length is the pre-execute
        // cursor.
        if (this._undoStack.length < this._savedCursor) {
            this._savePointValid = false;
        }
        this._undoStack.push(command);
        this._redoStack = [];
        this._eventBus.publish(CommandHistoryEvent.COMMAND_EXECUTED, { command });
        return command;
    }

    canUndo() {
        return this._undoStack.length > 0
            && this._undoStack[this._undoStack.length - 1].canUndo();
    }

    undo() {
        if (!this.canUndo()) {
            throw new Error('CommandHistory.undo(): nothing to undo');
        }
        const command = this._undoStack.pop();
        command.undo(this._context);
        this._redoStack.push(command);
        this._eventBus.publish(CommandHistoryEvent.COMMAND_UNDONE, { command });
        return command;
    }

    canRedo() {
        return this._redoStack.length > 0;
    }

    redo() {
        if (!this.canRedo()) {
            throw new Error('CommandHistory.redo(): nothing to redo');
        }
        const command = this._redoStack.pop();
        command.execute(this._context);
        this._undoStack.push(command);
        this._eventBus.publish(CommandHistoryEvent.COMMAND_REDONE, { command });
        return command;
    }

    // Marks the current cursor as the saved state. Called by
    // DocumentManager.markSaved() (which SaveDocumentUseCase calls after a
    // successful save) — CommandHistory itself never knows about storage.
    markSaved() {
        this._savedCursor = this._undoStack.length;
        this._savePointValid = true;
    }

    // True when the current state differs from the save point.
    isDirty() {
        return !this._savePointValid || this._undoStack.length !== this._savedCursor;
    }

    getExecutedCommands() {
        return [...this._undoStack];
    }

    getRedoCommands() {
        return [...this._redoStack];
    }

    getCursor() {
        return this._undoStack.length;
    }

    getCommands() {
        return [...this._undoStack, ...[...this._redoStack].reverse()];
    }

    getUndoLabel() {
        if (!this.canUndo()) {
            return null;
        }
        return `Undo ${this._undoStack[this._undoStack.length - 1].describe()}`;
    }

    getRedoLabel() {
        if (!this.canRedo()) {
            return null;
        }
        return `Redo ${this._redoStack[this._redoStack.length - 1].describe()}`;
    }

    toJSON() {
        const commands = this.getCommands().map((command) => command.toJSON());
        return {
            schemaVersion: COMMAND_HISTORY_SCHEMA_VERSION,
            cursor: this._undoStack.length,
            commands
        };
    }

    static fromJSON(json, context, registry, eventBus = new EventBus()) {
        if (!registry) {
            throw new Error('CommandHistory.fromJSON(): a CommandRegistry is required');
        }
        const normalized = CommandHistory._normalizePersistentJSON(json);
        const commands = normalized.commands.map((cmdJson, index) => {
            try {
                return registry.fromJSON(cmdJson);
            } catch (error) {
                throw new Error(`CommandHistory.fromJSON(): invalid command at index ${index}: ${error.message}`);
            }
        });
        const history = new CommandHistory(context, eventBus);
        history._undoStack = commands.slice(0, normalized.cursor);
        history._redoStack = commands.slice(normalized.cursor).reverse();
        return history;
    }

    static _normalizePersistentJSON(json) {
        if (!json || typeof json !== 'object' || Array.isArray(json)) {
            throw new Error('CommandHistory.fromJSON(): history JSON must be an object');
        }
        // Backward compatibility for the pre-0.1.37 stack shape. New writes
        // always use the cursor-based representation below.
        if (Array.isArray(json.executed) || Array.isArray(json.redo)) {
            const executed = CommandHistory._requireArray(json.executed || [], 'executed');
            const redo = CommandHistory._requireArray(json.redo || [], 'redo');
            return {
                cursor: executed.length,
                commands: [...executed, ...redo.slice().reverse()]
            };
        }
        if (json.schemaVersion !== COMMAND_HISTORY_SCHEMA_VERSION) {
            throw new Error(`CommandHistory.fromJSON(): unsupported schemaVersion ${json.schemaVersion}`);
        }
        const commands = CommandHistory._requireArray(json.commands, 'commands');
        if (!Number.isInteger(json.cursor)) {
            throw new Error('CommandHistory.fromJSON(): cursor must be an integer');
        }
        if (json.cursor < 0 || json.cursor > commands.length) {
            throw new Error('CommandHistory.fromJSON(): cursor must be within command bounds');
        }
        return { cursor: json.cursor, commands };
    }

    static _requireArray(value, fieldName) {
        if (!Array.isArray(value)) {
            throw new Error(`CommandHistory.fromJSON(): ${fieldName} must be an array`);
        }
        return value;
    }
}
