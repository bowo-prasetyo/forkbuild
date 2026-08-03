import { EventBus } from '../core/events/EventBus.js';
import { CommandHistoryEvent } from './events/CommandHistoryEvent.js';

// Tools call commandHistory.execute(command) instead of
// command.execute(context) directly — the history decides what happens
// next, and tools never need to know whether undo/redo exists.
// context (today: { world }) is bound once at construction, not passed
// per call.
//
// Traditional undo/redo stacks: execute() pushes onto the undo stack and
// clears the redo stack (a fresh action invalidates whatever "future" an
// undo had left available — you can't redo into a timeline that no
// longer exists once you've done something new). undo() pops from the
// undo stack, calls command.undo(), and pushes onto the redo stack.
// redo() is literally execute() again — Command has no redo() method;
// CommandHistory manages direction, not the command.
//
// Publishes CommandExecuted/CommandUndone/CommandRedone through its own
// EventBus on every successful operation, so interested subscribers
// (DocumentManager, today) can react without CommandHistory needing to
// know they exist — it doesn't call documentManager.markDirty() itself;
// that coupling lives in DocumentManager.trackCommandHistory() instead.
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
}
