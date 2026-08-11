import { Command } from './Command.js';

// Intent: worldId, groupId, brickIds. Records which ids were ACTUALLY
// added — bricks already in the group are skipped — so undo removes
// exactly what execute changed. The recorded effect is serialized, so a
// replayed command behaves identically to the original execution.
export class AddToGroupCommand extends Command {
    constructor({ worldId, groupId, brickIds = [], id, timestamp } = {}) {
        super({ id, timestamp });
        this._worldId = worldId;
        this._groupId = groupId;
        this._brickIds = [...brickIds];
        this._addedBrickIds = null;
    }

    get worldId() { return this._worldId; }
    get groupId() { return this._groupId; }
    get brickIds() { return [...this._brickIds]; }
    get addedBrickIds() { return this._addedBrickIds ? [...this._addedBrickIds] : []; }
    get type() { return 'add-to-group'; }

    execute(context) {
        this._assertWorldMatches(context);
        const group = context.world.getGroup(this._groupId);
        if (!group) {
            throw new Error(`AddToGroupCommand: group ${this._groupId} not found`);
        }
        const added = [];
        for (const brickId of this._brickIds) {
            if (context.world.addMemberToGroup(this._groupId, brickId)) {
                added.push(brickId);
            }
        }
        this._addedBrickIds = added;
        return added.length;
    }

    undo(context) {
        this._assertWorldMatches(context);
        if (this._addedBrickIds === null) {
            throw new Error('AddToGroupCommand: cannot undo before execute() has run');
        }
        for (const brickId of this._addedBrickIds) {
            context.world.removeMemberFromGroup(this._groupId, brickId);
        }
    }

    canUndo() {
        return this._addedBrickIds !== null;
    }

    describe() {
        return `Add ${this._brickIds.length} ${this._brickIds.length === 1 ? 'Brick' : 'Bricks'} to Group`;
    }

    toJSON() {
        return {
            type: this.type,
            id: this._id,
            timestamp: this._timestamp.toISOString(),
            worldId: this._worldId,
            groupId: this._groupId,
            brickIds: [...this._brickIds],
            addedBrickIds: this._addedBrickIds
        };
    }

    static fromJSON(json, registry) {
        const cmd = new AddToGroupCommand({
            worldId: json.worldId,
            groupId: json.groupId,
            brickIds: json.brickIds || [],
            id: json.id,
            timestamp: new Date(json.timestamp)
        });
        cmd._addedBrickIds = Array.isArray(json.addedBrickIds) ? [...json.addedBrickIds] : null;
        return cmd;
    }

    _assertWorldMatches(context) {
        if (context.world.id !== this._worldId) {
            throw new Error(
                `AddToGroupCommand: worldId mismatch (command targets ${this._worldId}, context has ${context.world.id})`
            );
        }
    }
}
