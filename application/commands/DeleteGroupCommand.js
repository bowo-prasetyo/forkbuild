import { Group } from '../../core/Group.js';
import { Command } from './Command.js';

// Intent: worldId, groupId. execute() snapshots the group (id, name,
// members) before removing it; undo() recreates the group with its
// ORIGINAL id — delete -> undo is indistinguishable from "the delete
// never happened," the exact DeleteBrickCommand contract. Bricks are
// untouched: deleting a group removes the relationship, not the members.
export class DeleteGroupCommand extends Command {
    constructor({ worldId, groupId, id, timestamp } = {}) {
        super({ id, timestamp });
        this._worldId = worldId;
        this._groupId = groupId;
        this._removedGroupSnapshot = null;
    }

    get worldId() { return this._worldId; }
    get groupId() { return this._groupId; }
    get type() { return 'delete-group'; }

    execute(context) {
        this._assertWorldMatches(context);
        const group = context.world.getGroup(this._groupId);
        if (!group) {
            throw new Error(`DeleteGroupCommand: group ${this._groupId} not found`);
        }
        this._removedGroupSnapshot = {
            id: group.id,
            name: group.name,
            brickIds: group.brickIds
        };
        context.world.removeGroup(this._groupId);
    }

    undo(context) {
        this._assertWorldMatches(context);
        if (!this._removedGroupSnapshot) {
            throw new Error('DeleteGroupCommand: cannot undo before execute() has run');
        }
        context.world.addGroup(new Group(this._removedGroupSnapshot));
    }

    canUndo() {
        return this._removedGroupSnapshot !== null;
    }

    describe() {
        return 'Delete Group';
    }

    toJSON() {
        return {
            type: this.type,
            id: this._id,
            timestamp: this._timestamp.toISOString(),
            worldId: this._worldId,
            groupId: this._groupId,
            removedGroupSnapshot: this._removedGroupSnapshot
                ? { ...this._removedGroupSnapshot, brickIds: [...this._removedGroupSnapshot.brickIds] }
                : null
        };
    }

    static fromJSON(json, registry) {
        const cmd = new DeleteGroupCommand({
            worldId: json.worldId,
            groupId: json.groupId,
            id: json.id,
            timestamp: new Date(json.timestamp)
        });
        cmd._removedGroupSnapshot = json.removedGroupSnapshot
            ? { ...json.removedGroupSnapshot, brickIds: [...(json.removedGroupSnapshot.brickIds || [])] }
            : null;
        return cmd;
    }

    _assertWorldMatches(context) {
        if (context.world.id !== this._worldId) {
            throw new Error(
                `DeleteGroupCommand: worldId mismatch (command targets ${this._worldId}, context has ${context.world.id})`
            );
        }
    }
}
