// Base class every command extends. execute(context) is the only method
// required today — not for polymorphism's own sake, but so CommandHistory
// has exactly one thing to call. undo() will be added here once commands
// know how to reverse themselves, without CommandHistory's API changing.
export class Command {
    execute(context) {
        throw new Error('Command.execute() must be implemented by a subclass');
    }
}
