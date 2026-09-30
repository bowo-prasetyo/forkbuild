import { Command } from './Command.js';
import { descriptionFromJSON, descriptionToJSON } from './HistoryDescription.js';
import { isMessage, message } from '../../core/Message.js';

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

    // Its own description when it was given one; otherwise named after its
    // children: one child names it, children of one kind add their counts up
    // ("Place Brick" three times is "Place 3 Bricks"), and a mix is "3 actions".
    describe() {
        if (this._description) {
            return this._description;
        }
        if (this._commands.length === 0) {
            return message('history.emptyAction');
        }
        if (this._commands.length === 1) {
            return this._commands[0].describe();
        }
        const descriptions = this._commands.map((command) => command.describe());
        const first = descriptions[0];
        if (isMessage(first) && descriptions.every((d) => isMessage(d) && d.key === first.key)) {
            if (descriptions.every((d) => Number.isFinite(d.params.count))) {
                return message(first.key, { ...first.params, count: descriptions.reduce((sum, d) => sum + d.params.count, 0) });
            }
            if (descriptions.every((d) => JSON.stringify(d.params) === JSON.stringify(first.params))) {
                return first;
            }
        }
        return message('history.actions', { count: this._commands.length });
    }

    // The Operation Timeline shows a composite as ONE entry; this is how
    // it learns there are children inside without exposing them by default.
    getChildCount() {
        return this._commands.length;
    }

    toJSON() {
        return {
            type: this.type,
            id: this._id,
            timestamp: this._timestamp.toISOString(),
            ...descriptionToJSON(this._description),
            commands: this._commands.map((command) => command.toJSON())
        };
    }

    static fromJSON(json, registry) {
        const cmd = new CompositeCommand({
            id: json.id,
            timestamp: new Date(json.timestamp),
            description: descriptionFromJSON(json)
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
