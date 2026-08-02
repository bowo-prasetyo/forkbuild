// Tools call commandHistory.execute(command) instead of
// command.execute(context) directly — the history decides what happens
// next, and tools never need to know whether history/undo/redo even
// exists. context (today: { world }) is bound once at construction, not
// passed per-call.
//
// undo()/redo() establish the API surface now, matching the plan of
// adding Command.undo() later without CommandHistory's shape changing.
// Both throw today: no Command implements undo() yet (only execute()),
// so there is nothing real to reverse. Once commands gain undo(), this
// becomes a real implementation without any tool code changing.
export class CommandHistory {
    constructor(context) {
        this._context = context;
        this._executed = [];
    }

    execute(command) {
        command.execute(this._context);
        this._executed.push(command);
        return command;
    }

    undo() {
        throw new Error('CommandHistory.undo() is not implemented yet — no Command supports undo() yet.');
    }

    redo() {
        throw new Error('CommandHistory.redo() is not implemented yet.');
    }

    getExecutedCommands() {
        return [...this._executed];
    }
}
