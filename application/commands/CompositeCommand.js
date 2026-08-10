import { Command } from './Command.js';
import { createId } from '../../core/createId.js';

// A Command made of other Commands, treated as one atomic unit by
// CommandHistory — one undo step regardless of how many child commands
// it contains. Now fully serializable via CommandRegistry.
export class CompositeCommand extends Command {
    constructor({ id, timestamp } = {}) {
        super({ id, timestamp });
        this._commands = [];
    }

    get type() {
        return 'composite';
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

    toJSON() {
        return {
            type: this.type,
            id: this._id,
            timestamp: this._timestamp.toISOString(),
            commands: this._commands.map((command) => command.toJSON())
        };
    }

    static fromJSON(json, registry) {
        const cmd = new CompositeCommand({
            id: json.id,
            timestamp: new Date(json.timestamp)
        });
        if (json.commands && json.commands.length > 0) {
            if (!registry) {
                throw new Error('CompositeCommand.fromJSON(): a CommandRegistry is required to deserialize child commands');
            }
            for (const childJson of json.commands) {
                cmd.add(registry.fromJSON(childJson));
            }
        }
        return cmd;
    }
}
