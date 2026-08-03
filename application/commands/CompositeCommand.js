import { Command } from './Command.js';

// A Command made of other Commands, treated as one atomic unit by
// CommandHistory — one undo step regardless of how many child commands
// it contains. add(command) before execute(); order matters both ways:
// execute() runs children in the order they were added, undo() reverses
// them in the OPPOSITE order, since a later command might depend on an
// earlier one having already happened (undo has to unwind in the reverse
// sequence physical actions would).
//
// canUndo() is true only if the composite actually has children AND
// every one of them can be undone — a composite is only as undoable as
// its least-undoable part.
export class CompositeCommand extends Command {
    constructor() {
        super();
        this._commands = [];
    }

    add(command) {
        this._commands.push(command);
        return this;
    }

    get commands() {
        return [...this._commands];
    }

    execute(context) {
        for (const command of this._commands) {
            command.execute(context);
        }
    }

    undo(context) {
        for (let i = this._commands.length - 1; i >= 0; i--) {
            this._commands[i].undo(context);
        }
    }

    canUndo() {
        return this._commands.length > 0 && this._commands.every((command) => command.canUndo());
    }

    describe() {
        if (this._commands.length === 1) {
            return this._commands[0].describe();
        }
        return `${this._commands.length} actions`;
    }
}
