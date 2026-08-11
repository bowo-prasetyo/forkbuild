import { Command } from './Command.js';

// Mirror of AddToGroupCommand: records which ids were ACTUALLY removed
// (non-members are skipped), and undo re-adds exactly those. Bricks are
// never touched — membership only.
export class RemoveFromGroupCommand extends Command {
    constructor({ worldId, groupId, brickIds = [], id, timestamp } = {}) {
        super({ id, timestamp });
        this._worldId = worldId;
        this._groupId = groupId;
        this._brickIds = [...brickIds];
        this._removedBrickIds = null;
    }

    get worldId() { return this._worldId; }
    get groupId() { return this._groupId; }
    get brickIds() { return [...this._brickIds]; }
    get removedBrickIds() { return this._removedBrickIds ? [...this._removedBrickIds] : []; }
    get type() { return 'remove-from-group'; }

    execute(context) {
        this._assertWorldMatches(context);
        const group = context.world.getGroup(this._groupId);
        if (!group) {
            throw new Error(`RemoveFromGroupCommand: group ${this._groupId} not found`);
        }
        const removed = [];
        for (const brickId of this._brickIds) {
            if (context.world.removeMemberFromGroup(this._groupId, brickId)) {
                removed.push(brickId);
            }
        }
        this._removedBrickIds = removed;
        return removed.length;
    }

    undo(context) {
        this._assertWorldMatches(context);
        if (this._removedBrickIds === null) {
            throw new Error('RemoveFromGroupCommand: cannot undo before execute() has run');
        }
        for (const brickId of this._removedBrickIds) {
            context.world.addMemberToGroup(this._groupId, brickId);
        }
    }

    canUndo() {
        return this._removedBrickIds !== null;
    }

    describe() {
        return `Remove ${this._brickIds.length} ${this._brickIds.length === 1 ? 'Brick' : 'Bricks'} from Group`;
    }

    toJSON() {
        return {
            type: this.type,
            id: this._id,
            timestamp: this._timestamp.toISOString(),
            worldId: this._worldId,
            groupId: this._groupId,
            brickIds: [...this._brickIds],
            removedBrickIds: this._removedBrickIds
        };
    }

    static fromJSON(json, registry) {
        const cmd = new RemoveFromGroupCommand({
            worldId: json.worldId,
            groupId: json.groupId,
            brickIds: json.brickIds || [],
            id: json.id,
            timestamp: new Date(json.timestamp)
        });
        cmd._removedBrickIds = Array.isArray(json.removedBrickIds) ? [...json.removedBrickIds] : null;
        return cmd;
    }

    _assertWorldMatches(context) {
        if (context.world.id !== this._worldId) {
            throw new Error(
                `RemoveFromGroupCommand: worldId mismatch (command targets ${this._worldId}, context has ${context.world.id})`
            );
        }
    }
}
