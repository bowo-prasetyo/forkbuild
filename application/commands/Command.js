import { createId } from '../../core/createId.js';

// Base class every command extends. Now carries id and timestamp for
// history tracking and serialization. execute(context) and undo(context)
// both throw by default. canUndo() defaults to true. describe() defaults
// to the class name. type must be implemented by every subclass.
export class Command {
    constructor({ id = createId(), timestamp = new Date() } = {}) {
        this._id = id;
        this._timestamp = timestamp instanceof Date ? timestamp : new Date(timestamp);
    }

    get id() {
        return this._id;
    }

    get timestamp() {
        return this._timestamp;
    }

    get type() {
        throw new Error('Command.type must be implemented by a subclass');
    }

    execute(context) {
        throw new Error('Command.execute() must be implemented by a subclass');
    }

    undo(context) {
        throw new Error('Command.undo() must be implemented by a subclass');
    }

    canUndo() {
        return true;
    }

    describe() {
        return this.constructor.name;
    }

    // Number of DIRECT child commands (0 for atomic commands). Exposed so
    // projections like the Operation Timeline (0.1.40) can describe
    // composite operations without importing concrete command classes —
    // CommandHistory stays registry-agnostic.
    getChildCount() {
        return 0;
    }
}
