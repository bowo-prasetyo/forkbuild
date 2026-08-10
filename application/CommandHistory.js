import { EventBus } from '../core/events/EventBus.js';
import { CommandHistoryEvent } from './events/CommandHistoryEvent.js';

// Tools call commandHistory.execute(command) instead of
// command.execute(context) directly — the history decides what happens
// next, and tools never need to know whether undo/redo exists.
//
// As of 0.1.35, CommandHistory is fully serializable:
//   toJSON()      → { executed: [...], redo: [...] }
//   fromJSON()    → reconstructs stacks via CommandRegistry
//
// Linear history invariant: execute() after undo() clears the redo
// branch entirely. A fresh action invalidates whatever "future" an undo
// had left available.
export class CommandHistory {
    constructor(context, eventBus = new EventBus()) {
        this._context = context;
        this._eventBus = eventBus;
        this._undoStack = [];
        this._redoStack = [];
    }

    get eventBus() {
        return this._eventBus;
    }

    execute(command) {
        command.execute(this._context);
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

    // The current undo stack, oldest first — commands that are presently
    // "applied" to the document. A command that's been undone (moved to
    // the redo stack) is not included; this reflects the document's
    // current history, not a permanent audit log of everything ever run.
    getExecutedCommands() {
        return [...this._undoStack];
    }

    getRedoCommands() {
        return [...this._redoStack];
    }

    // Human-readable labels for a future Edit menu / status bar, e.g.
    // "Undo Place Brick". null when there's nothing to undo/redo, so
    // callers can disable a menu item without a separate canUndo() check.
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

    // -----------------------------------------------------------------
    // Serialization (0.1.35)
    // -----------------------------------------------------------------

    toJSON() {
        return {
            executed: this._undoStack.map((command) => command.toJSON()),
            redo: this._redoStack.map((command) => command.toJSON())
        };
    }

    static fromJSON(json, context, registry) {
        if (!json || typeof json !== 'object') {
            throw new Error('CommandHistory.fromJSON(): invalid JSON');
        }
        if (!registry) {
            throw new Error('CommandHistory.fromJSON(): a CommandRegistry is required');
        }

        const history = new CommandHistory(context);

        for (const cmdJson of json.executed || []) {
            history._undoStack.push(registry.fromJSON(cmdJson));
        }

        for (const cmdJson of json.redo || []) {
            history._redoStack.push(registry.fromJSON(cmdJson));
        }

        return history;
    }
}
