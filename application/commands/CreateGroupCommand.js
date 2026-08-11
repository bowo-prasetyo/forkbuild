import { Group } from '../../core/Group.js';
import { Command } from './Command.js';

// Creates a flat, named group over existing bricks. Intent: worldId,
// brickIds, name — never a group id: the group's identity is created at
// execution time and recorded (_executedGroupId, serialized), so
// undo -> redo and history replay recreate the SAME group. This is the
// exact PlaceBrickCommand identity contract, applied to groups.
//
// Atomic: if any referenced brick doesn't exist, nothing is created.
export class CreateGroupCommand extends Command {
    constructor({ worldId, brickIds = [], name = null, id, timestamp } = {}) {
        super({ id, timestamp });
        this._worldId = worldId;
        this._brickIds = [...brickIds];
        this._name = name;
        this._executedGroupId = null;
    }

    get worldId() { return this._worldId; }
    get brickIds() { return [...this._brickIds]; }
    get name() { return this._name; }
    get executedGroupId() { return this._executedGroupId; }
    get type() { return 'create-group'; }

    execute(context) {
        this._assertWorldMatches(context);
        for (const brickId of this._brickIds) {
            if (!this._findBrick(context, brickId)) {
                throw new Error(`CreateGroupCommand: brick ${brickId} not found`);
            }
        }
        const group = new Group({
            id: this._executedGroupId || undefined,
            name: this._name,
            brickIds: this._brickIds
        });
        context.world.addGroup(group);
        this._executedGroupId = group.id;
        return group;
    }

    undo(context) {
        this._assertWorldMatches(context);
        if (!this._executedGroupId) {
            throw new Error('CreateGroupCommand: cannot undo before execute() has run');
        }
        context.world.removeGroup(this._executedGroupId);
    }

    canUndo() {
        return this._executedGroupId !== null;
    }

    describe() {
        return `Group ${this._brickIds.length} ${this._brickIds.length === 1 ? 'Brick' : 'Bricks'}`;
    }

    toJSON() {
        return {
            type: this.type,
            id: this._id,
            timestamp: this._timestamp.toISOString(),
            worldId: this._worldId,
            brickIds: [...this._brickIds],
            name: this._name,
            executedGroupId: this._executedGroupId
        };
    }

    static fromJSON(json, registry) {
        const cmd = new CreateGroupCommand({
            worldId: json.worldId,
            brickIds: json.brickIds || [],
            name: json.name || null,
            id: json.id,
            timestamp: new Date(json.timestamp)
        });
        cmd._executedGroupId = json.executedGroupId || null;
        return cmd;
    }

    _findBrick(context, brickId) {
        for (const building of context.world.getBuildings()) {
            const brick = building.findBrick(brickId);
            if (brick) {
                return brick;
            }
        }
        return null;
    }

    _assertWorldMatches(context) {
        if (context.world.id !== this._worldId) {
            throw new Error(
                `CreateGroupCommand: worldId mismatch (command targets ${this._worldId}, context has ${context.world.id})`
            );
        }
    }
}
