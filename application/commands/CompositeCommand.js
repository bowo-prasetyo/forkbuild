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

    // Transactional execution: if any child fails, roll back all 
    // previously executed children in reverse order and re-throw.
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
        if (this._commands.length === 0) return 'Empty Action';
        if (this._commands.length === 1) return this._commands[0].describe();

        const descriptions = new Set(this._commands.map(c => c.describe()));
        
        // If all children are "Move Brick", return "Move N Bricks"
        if (descriptions.size === 1) {
            const base = Array.from(descriptions)[0];
            return `${this._commands.length} ${base.replace(' Brick', ' Bricks')}`;
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
