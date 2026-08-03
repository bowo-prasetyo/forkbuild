// Base class every command extends. execute(context) and undo(context)
// both throw by default — a command must explicitly implement undo() to
// support it; there is no contract that says a command CAN reverse
// itself just because it exists. Pretending otherwise would be
// misleading, so both fail loudly rather than silently no-op.
// canUndo() defaults to true; concrete commands override it to report
// false when they haven't run yet (nothing to reverse) or, for
// CompositeCommand, when any child can't be undone.
//
// describe() returns a short human-readable label (e.g. "Place Brick"),
// used by CommandHistory.getUndoLabel()/getRedoLabel() — defaults to the
// class name so a command that forgets to override it still produces
// something reasonable rather than throwing.
//
// No redo() here — redo is simply execute() again. CommandHistory
// manages which direction is being replayed; Command doesn't need to
// know.
export class Command {
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
}
