import { Command } from './Command.js';

// Central registry for command deserialization. Every serializable command
// type registers itself here so CommandHistory.fromJSON() can reconstruct
// arbitrary command stacks without knowing concrete classes.
//
//   registry.register('move-brick', MoveBrickCommand);
//   const command = registry.fromJSON({ type: 'move-brick', ... });
export class CommandRegistry {
    constructor() {
        this._types = new Map();
    }

    register(type, CommandClass) {
        if (!type || typeof type !== 'string') {
            throw new Error('CommandRegistry.register(): type must be a non-empty string');
        }
        if (!CommandClass || !(CommandClass.prototype instanceof Command)) {
            throw new Error('CommandRegistry.register(): CommandClass must extend Command');
        }
        this._types.set(type, CommandClass);
    }

    fromJSON(json) {
        if (!json || typeof json !== 'object' || !json.type) {
            throw new Error('CommandRegistry.fromJSON(): JSON must have a type field');
        }

        const CommandClass = this._types.get(json.type);
        if (!CommandClass) {
            throw new Error(`CommandRegistry.fromJSON(): unknown command type "${json.type}"`);
        }

        return CommandClass.fromJSON(json, this);
    }
}
