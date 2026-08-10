import { Command } from './Command.js';

// A Command made of other Commands, treated as one atomic unit by
// CommandHistory — one undo step regardless of how many child commands
// it contains. Now fully serializable via CommandRegistry.
export class CompositeCommand extends Command {
    constructor({ id, timestamp, description = null } = {}) {
        super({ id, timestamp });
        this._commands = [];
        this._description = description;
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
        const executed = [];
        try {
            for (const command of this._commands) {
                command.execute(context);
                executed.push(command);
            }
        } catch (error) {
            for (let i = executed.length - 1; i >= 0; i--) {
                executed[i].undo(context);
            }
            throw error;
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
        if (this._description) {
            return this._description;
        }
        if (this._commands.length === 0) {
            return 'Empty Action';
        }
        if (this._commands.length === 1) {
            return this._commands[0].describe();
        }
        const descriptions = new Set(this._commands.map((command) => command.describe()));
        if (descriptions.size === 1) {
            const description = descriptions.values().next().value;
            return `${description.replace(' Brick', ` ${this._commands.length} Bricks`)}`;
        }
        return `${this._commands.length} actions`;
    }

    toJSON() {
        return {
            type: this.type,
            id: this._id,
            timestamp: this._timestamp.toISOString(),
            description: this._description,
            commands: this._commands.map((command) => command.toJSON())
        };
    }

    static fromJSON(json, registry) {
        const cmd = new CompositeCommand({
            id: json.id,
            timestamp: new Date(json.timestamp),
            description: json.description || null
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
