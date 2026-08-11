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
// toJSON()/fromJSON(). Canonical document persistence and session history
// persistence remain separate concerns (see 0.1.37).
//
// As of 0.1.40, CommandHistory is also the source of REPLAY — the history
// itself, never a second recording mechanism. Baseline snapshot
// (baselineWorld in the envelope), replay(targetContext, { registry,
// startCursor, endCursor }) — serialized reconstruction, history-suppressed,
// transactional — and getTimeline() for the Operation Timeline. See the
// 0.1.40 notes in the architecture documentation for the full invariants.
//
// As of 0.1.41, the save point gains its mirror operation: markUnsaved().
// Historical State Restoration rebases editing onto a reconstructed past
// state — a fresh history whose cursor sits at 0. Without more, that
// history would report CLEAN, but the storage still holds the pre-restore
// document: no cursor in the new history corresponds to what is on disk.
// markUnsaved() invalidates the save point without moving it, so
// isDirty() stays true until an explicit Save calls markSaved() and
// establishes the new save point. This must live in the history (not just
// DocumentManager.markDirty()) because DocumentManager COMPUTES dirty
// from history.isDirty() on every command event (0.1.39) — a manual
// markDirty would be overwritten by the very next edit. Like the save
// point itself, markUnsaved() is session-local bookkeeping and is never
// serialized.
export class CommandHistory {
    constructor(context, eventBus = new EventBus()) {
        this._context = context;
        this._eventBus = eventBus;
        this._undoStack = [];
        this._redoStack = [];
        this._savedCursor = 0;
        this._savePointValid = true;
        this._baselineWorld = CommandHistory._captureBaseline(context);
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

    markSaved() {
        this._savedCursor = this._undoStack.length;
        this._savePointValid = true;
    }

    // Mirror of markSaved(): declares that the current state differs from
    // the persisted state and that NO cursor in this history corresponds
    // to it. Used by Historical State Restoration (0.1.41) after rebasing
    // a session onto a reconstructed past state. isDirty() reports true
    // until the next markSaved().
    markUnsaved() {
        this._savePointValid = false;
    }

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

    // The world state BEFORE the first command in this history, captured
    // at construction (or restored from the envelope). Null for contexts
    // without a world and for pre-0.1.40 envelopes. Treat as immutable.
    getBaselineWorld() {
        return this._baselineWorld;
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

    // Operation Timeline projection (0.1.40). One entry per top-level
    // command, chronological. `applied` marks whether the entry sits
    // before the current cursor; entries beyond it are the
    // undone-but-remembered tail of the linear sequence.
    getTimeline() {
        const cursor = this.getCursor();
        return this.getCommands().map((command, index) => ({
            index,
            id: command.id,
            type: command.type,
            description: command.describe(),
            timestamp: command.timestamp,
            childCount: command.getChildCount(),
            applied: index < cursor
        }));
    }

    // Replay kernel (0.1.40). Reconstructs commands[startCursor..endCursor)
    // from SERIALIZED form via the CommandRegistry and executes the fresh
    // instances against targetContext. Never touches this history's
    // stacks, cursor, or save point — replay cannot pollute history.
    // Transactional: on failure, already-executed commands are undone in
    // reverse and the error is rethrown. Returns the number of commands
    // executed.
    replay(targetContext, { registry, startCursor = 0, endCursor = null } = {}) {
        if (!registry) {
            throw new Error('CommandHistory.replay(): a CommandRegistry is required');
        }
        const commands = this.toJSON().commands;
        const end = endCursor === null ? commands.length : endCursor;
        if (!Number.isInteger(startCursor) || !Number.isInteger(end)
            || startCursor < 0 || end < startCursor || end > commands.length) {
            throw new Error(
                `CommandHistory.replay(): invalid range [${startCursor}, ${end}) for ${commands.length} commands`
            );
        }
        const executed = [];
        try {
            for (let i = startCursor; i < end; i++) {
                const command = registry.fromJSON(commands[i]);
                command.execute(targetContext);
                executed.push(command);
            }
        } catch (error) {
            for (let i = executed.length - 1; i >= 0; i--) {
                executed[i].undo(targetContext);
            }
            throw error;
        }
        return executed.length;
    }

    toJSON() {
        const commands = this.getCommands().map((command) => command.toJSON());
        const json = {
            schemaVersion: COMMAND_HISTORY_SCHEMA_VERSION,
            cursor: this._undoStack.length,
            commands
        };
        // The baseline makes a persisted history self-sufficient for
        // replay. Omitted when there is no world context (keeps
        // world-less test contexts lightweight and old writers unchanged).
        if (this._baselineWorld) {
            json.baselineWorld = this._baselineWorld;
        }
        return json;
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
        // The persisted baseline wins over the constructor snapshot: a
        // world passed as restore-context already has commands applied,
        // so it is NOT the baseline. Pre-0.1.40 envelopes have none.
        history._baselineWorld = normalized.baselineWorld !== undefined
            ? normalized.baselineWorld
            : null;
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
                commands: [...executed, ...redo.slice().reverse()],
                baselineWorld: undefined
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
        if (json.baselineWorld !== undefined
            && (json.baselineWorld === null || typeof json.baselineWorld !== 'object' || Array.isArray(json.baselineWorld))) {
            throw new Error('CommandHistory.fromJSON(): baselineWorld must be an object');
        }
        return { cursor: json.cursor, commands, baselineWorld: json.baselineWorld };
    }

    static _requireArray(value, fieldName) {
        if (!Array.isArray(value)) {
            throw new Error(`CommandHistory.fromJSON(): ${fieldName} must be an array`);
        }
        return value;
    }

    static _captureBaseline(context) {
        const world = context ? context.world : null;
        if (world && typeof world.toJSON === 'function') {
            return world.toJSON();
        }
        return null;
    }
}
