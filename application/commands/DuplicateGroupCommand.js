import { Brick } from '../../core/Brick.js';
import { Group } from '../../core/Group.js';
import { Position } from '../../core/Position.js';
import { Command } from './Command.js';

// Duplicates a group: fresh brick identities (definitionId/rotation
// copied, position shifted by the intent offset) plus a fresh group
// identity referencing the new bricks — G1 -> G2, A -> D, B -> E, C -> F.
// The source group is never mutated: duplicating (or moving) a group
// never changes the original's identity or membership.
//
// Everything created is recorded (_executedBrickIds, _executedGroupId —
// serialized) so undo removes exactly what was created and replay
// recreates identical identities: the same contract as
// PasteBricksCommand. Members that no longer exist are skipped
// (membership is referential). Transactional: on failure, any bricks
// already added are removed again before the error propagates.
export class DuplicateGroupCommand extends Command {
    constructor({ worldId, groupId, offset = { x: 2, y: 0, z: 2 }, description = null, id, timestamp } = {}) {
        super({ id, timestamp });
        this._worldId = worldId;
        this._groupId = groupId;
        this._offset = { ...offset };
        this._description = description;
        this._executedBrickIds = [];
        this._executedGroupId = null;
    }

    get worldId() { return this._worldId; }
    get groupId() { return this._groupId; }
    get executedGroupId() { return this._executedGroupId; }
    get executedBrickIds() { return [...this._executedBrickIds]; }
    get type() { return 'duplicate-group'; }

    execute(context) {
        this._assertWorldMatches(context);
        const source = context.world.getGroup(this._groupId);
        if (!source) {
            throw new Error(`DuplicateGroupCommand: group ${this._groupId} not found`);
        }
        const sourceBricks = context.world.getGroupBricks(this._groupId);
        if (sourceBricks.length === 0) {
            throw new Error('DuplicateGroupCommand: group has no resolvable members');
        }
        const added = [];
        try {
            for (let i = 0; i < sourceBricks.length; i++) {
                const brick = sourceBricks[i];
                const buildingId = this._findBuildingIdForBrick(context, brick.id);
                const copy = new Brick({
                    id: this._executedBrickIds[i] || undefined,
                    definitionId: brick.definitionId,
                    position: new Position(
                        brick.position.x + this._offset.x,
                        brick.position.y + this._offset.y,
                        brick.position.z + this._offset.z
                    ),
                    rotation: brick.rotation
                });
                context.world.addBrickToBuilding(buildingId, copy);
                added.push(copy.id);
                this._executedBrickIds[i] = copy.id;
            }
            const group = new Group({
                id: this._executedGroupId || undefined,
                name: source.name ? `Copy of ${source.name}` : null,
                brickIds: [...added]
            });
            context.world.addGroup(group);
            this._executedGroupId = group.id;
        } catch (error) {
            if (this._executedGroupId) {
                context.world.removeGroup(this._executedGroupId);
                this._executedGroupId = null;
            }
            for (const brickId of added) {
                const buildingId = this._findBuildingIdForBrick(context, brickId);
                if (buildingId) {
                    context.world.removeBrickFromBuilding(buildingId, brickId);
                }
            }
            this._executedBrickIds = [];
            throw error;
        }
        return this._executedGroupId;
    }

    undo(context) {
        this._assertWorldMatches(context);
        if (!this._executedGroupId || this._executedBrickIds.length === 0) {
            throw new Error('DuplicateGroupCommand: cannot undo before execute() has run');
        }
        context.world.removeGroup(this._executedGroupId);
        for (const brickId of this._executedBrickIds) {
            const buildingId = this._findBuildingIdForBrick(context, brickId);
            if (buildingId) {
                context.world.removeBrickFromBuilding(buildingId, brickId);
            }
        }
    }

    canUndo() {
        return this._executedGroupId !== null && this._executedBrickIds.length > 0;
    }

    describe() {
        return this._description || 'Duplicate Group';
    }

    toJSON() {
        return {
            type: this.type,
            id: this._id,
            timestamp: this._timestamp.toISOString(),
            worldId: this._worldId,
            groupId: this._groupId,
            offset: { ...this._offset },
            description: this._description,
            executedBrickIds: this._executedBrickIds.length > 0 ? [...this._executedBrickIds] : null,
            executedGroupId: this._executedGroupId
        };
    }

    static fromJSON(json, registry) {
        const cmd = new DuplicateGroupCommand({
            worldId: json.worldId,
            groupId: json.groupId,
            offset: json.offset || { x: 2, y: 0, z: 2 },
            description: json.description || null,
            id: json.id,
            timestamp: new Date(json.timestamp)
        });
        cmd._executedBrickIds = Array.isArray(json.executedBrickIds) ? [...json.executedBrickIds] : [];
        cmd._executedGroupId = json.executedGroupId || null;
        return cmd;
    }

    _findBuildingIdForBrick(context, brickId) {
        for (const building of context.world.getBuildings()) {
            if (building.findBrick(brickId)) {
                return building.id;
            }
        }
        return null;
    }

    _assertWorldMatches(context) {
        if (context.world.id !== this._worldId) {
            throw new Error(
                `DuplicateGroupCommand: worldId mismatch (command targets ${this._worldId}, context has ${context.world.id})`
            );
        }
    }
}
