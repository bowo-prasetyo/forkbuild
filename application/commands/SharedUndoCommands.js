import { Command } from './Command.js';
import { message } from '../../core/Message.js';

// Undo and Redo while building together (Build with me,
// application/buildTogether/): each is an operation of its own, sent to
// every co-builder like any edit, that takes back (or puts back) one earlier
// step by its id. Every replica finds that step in its own history and runs
// the step's own undo() (or execute()) there, so all of them change the same
// way, with no new merging: the same commands' own execute() and undo() the
// conflict resolver already relies on (docs/principles/collaboration.md,
// "A Conflict Resolver Reorders Commands; It Never Reinvents Them").
//
// The replica supplies, in the command context:
//   findOperation(id): the step with that id this replica executed, or null;
//   operationAuthor(id): who made it (the identity its connection proved,
//     or this replica), or undefined when unknown.
// A step only its own author may take back: an undo whose author is not the
// step's does nothing, on every replica (your Undo never undoes someone
// else's change). A step that can't be undone any more (what it changed is
// gone, a friend deleted the brick: undoing it would change nothing) is
// skipped the same way everywhere;
// `applied` says which happened, for the Editor to say so. A replay of the
// history (CommandHistory#replay, which knows no authors) skips again the
// ones skipped here.

function worldState(context) {
    const world = context?.world;
    return world && typeof world.toJSON === 'function' ? JSON.stringify(world.toJSON()) : null;
}

class SharedStepCommand extends Command {
    constructor({ worldId, targetId, id, timestamp, skipped = false } = {}) {
        super({ id, timestamp });
        if (typeof targetId !== 'string' || !targetId) {
            throw new Error(`${new.target.name}: targetId is required`);
        }
        this._worldId = worldId;
        this._targetId = targetId;
        this._applied = false;
        this._executed = false;
        // Skipped where it was recorded (from a persisted history).
        this._skipped = skipped === true;
        this._targetDescription = null;
    }

    get worldId() { return this._worldId; }
    get targetId() { return this._targetId; }
    // Whether it changed anything here (false: skipped).
    get applied() { return this._applied; }

    // The step, when this replica has it and the same person made both.
    _target(context) {
        const target = typeof context?.findOperation === 'function' ? context.findOperation(this._targetId) : null;
        if (!target || target === this) return null;
        if (typeof context.operationAuthor === 'function') {
            const mine = context.operationAuthor(this.id);
            const its = context.operationAuthor(this._targetId);
            if (mine !== undefined && its !== undefined && mine !== its) return null;
        }
        return target;
    }

    _run(context, step) {
        this._applied = false;
        this._executed = true;
        if (this._skipped && typeof context?.operationAuthor !== 'function') return;
        const target = this._target(context);
        if (!target) return;
        try {
            this._targetDescription = typeof target.describe === 'function' ? target.describe() : null;
            const before = worldState(context);
            step(target);
            // Nothing changed (the brick it placed was deleted since): skipped,
            // so a Redo can't bring back what someone else removed.
            this._applied = before === null || worldState(context) !== before;
        } catch {
            // Skipped here, as it is on every replica that has the same state.
            this._applied = false;
        }
    }

    _reverse(context, step) {
        if (!this._applied) return;
        const target = this._target(context);
        if (!target) return;
        step(target);
    }

    canUndo() {
        return true;
    }

    toJSON() {
        const json = { type: this.type, id: this._id, timestamp: this._timestamp.toISOString(), worldId: this._worldId, targetId: this._targetId };
        if (this._executed ? !this._applied : this._skipped) json.skipped = true;
        return json;
    }
}

export class UndoOperationCommand extends SharedStepCommand {
    get type() { return 'undo-operation'; }

    execute(context) {
        this._run(context, (target) => {
            if (!target.canUndo()) throw new Error('UndoOperationCommand: the step cannot be undone');
            target.undo(context);
        });
    }

    undo(context) {
        this._reverse(context, (target) => target.execute(context));
    }

    describe() {
        return this._targetDescription ? message('history.undoOf', { action: this._targetDescription }) : message('history.undoStep');
    }

    static fromJSON(json) {
        return new UndoOperationCommand({ worldId: json.worldId, targetId: json.targetId, id: json.id, timestamp: json.timestamp, skipped: json.skipped });
    }
}

export class RedoOperationCommand extends SharedStepCommand {
    get type() { return 'redo-operation'; }

    execute(context) {
        this._run(context, (target) => target.execute(context));
    }

    undo(context) {
        this._reverse(context, (target) => target.undo(context));
    }

    describe() {
        return this._targetDescription ? message('history.redoOf', { action: this._targetDescription }) : message('history.redoStep');
    }

    static fromJSON(json) {
        return new RedoOperationCommand({ worldId: json.worldId, targetId: json.targetId, id: json.id, timestamp: json.timestamp, skipped: json.skipped });
    }
}

export function isSharedStepCommand(command) {
    return command instanceof SharedStepCommand;
}
