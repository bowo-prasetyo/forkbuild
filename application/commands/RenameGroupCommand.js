import { Command } from './Command.js';

// Intent: worldId, groupId, name. Snapshots the previous name so undo()
// restores it exactly. Membership and identity are untouched.
export class RenameGroupCommand extends Command {
    constructor({ worldId, groupId, name, id, timestamp } = {}) {
        super({ id, timestamp });
        this._worldId = worldId;
        this._groupId = groupId;
        this._name = name;
        this._originalName = null;
        this._executedFlag = false;
    }
    get worldId() { return this._worldId; }
    get groupId() { return this._groupId; }
    get name() { return this._name; }
    get type() { return 'rename-group'; }

    execute(context) {
        this._assertWorldMatches(context);
        const group = context.world.getGroup(this._groupId);
        if (!group) {
            throw new Error(`RenameGroupCommand: group ${this._groupId} not found`);
        }
        this._originalName = group.name;
        context.world.renameGroup(this._groupId, this._name);
        this._executedFlag = true;
    }

    undo(context) {
        this._assertWorldMatches(context);
        if (this._originalName === null && !this._executedFlag) {
            // Distinguish "original name was null" from "never executed".
        }
        if (!this._executedFlag) {
            throw new Error('RenameGroupCommand: cannot undo before execute() has run');
        }
        context.world.renameGroup(this._groupId, this._originalName);
    }

    canUndo() {
        return this._executedFlag === true;
    }

    describe() {
        return 'Rename Group';
    }

    toJSON() {
        return {
            type: this.type,
            id: this._id,
            timestamp: this._timestamp.toISOString(),
            worldId: this._worldId,
            groupId: this._groupId,
            name: this._name,
            originalName: this._executedFlag ? this._originalName : null,
            executed: this._executedFlag === true
        };
    }

    static fromJSON(json, registry) {
        const cmd = new RenameGroupCommand({
            worldId: json.worldId,
            groupId: json.groupId,
            name: json.name,
            id: json.id,
            timestamp: new Date(json.timestamp)
        });
        cmd._originalName = json.originalName !== undefined ? json.originalName : null;
        cmd._executedFlag = json.executed === true;
        return cmd;
    }

    _assertWorldMatches(context) {
        if (context.world.id !== this._worldId) {
            throw new Error(
                `RenameGroupCommand: worldId mismatch (command targets ${this._worldId}, context has ${context.world.id})`
            );
        }
    }
}
