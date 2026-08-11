import { Brick } from '../../core/Brick.js';
import { Group } from '../../core/Group.js';
import { Position } from '../../core/Position.js';
import { Command } from './Command.js';

// Pastes a set of bricks as ONE atomic history entry (0.1.42), creating
// any groups carried by the clipboard intent (0.1.43).
//
// Constructor fields (worldId, buildingId, items, groups) are the
// command's INTENT and never change: each item is { definitionId,
// position, rotation }; each group is { name, memberIndices } pointing
// into items. No brick ids and no group ids in the intent: identities
// are created at execution time, the same contract PlaceBrickCommand
// established.
//
// After execute() runs, the command remembers the ids it created
// (_executedBrickIds, _executedGroupIds) and that record IS serialized —
// what makes undo -> redo recreate the SAME pasted bricks/groups and
// keeps history replay byte-identical (the 0.1.40 guarantee).
//
// Transactional: on failure, any groups and bricks already added are
// removed again before the error propagates. Completely
// renderer-ignorant: its job ends at World.addBrickToBuilding()/
// removeBrickFromBuilding()/addGroup()/removeGroup().
export class PasteBricksCommand extends Command {
    constructor({ worldId, buildingId, items = [], groups = [], description = null, id, timestamp } = {}) {
        super({ id, timestamp });
        this._worldId = worldId;
        this._buildingId = buildingId;
        this._items = items.map((item) => ({
            definitionId: item.definitionId,
            position: item.position instanceof Position
                ? item.position.clone()
                : Position.fromJSON(item.position),
            rotation: item.rotation || 0
        }));
        this._groups = groups.map((group) => ({
            name: group.name || null,
            memberIndices: [...group.memberIndices]
        }));
        this._description = description;
        this._executedBrickIds = [];
        this._executedGroupIds = [];
    }

    get worldId() { return this._worldId; }
    get buildingId() { return this._buildingId; }
    get items() {
        return this._items.map((item) => ({
            definitionId: item.definitionId,
            position: item.position.clone(),
            rotation: item.rotation
        }));
    }
    get groups() {
        return this._groups.map((group) => ({
            name: group.name,
            memberIndices: [...group.memberIndices]
        }));
    }
    get executedBrickIds() { return [...this._executedBrickIds]; }
    get executedGroupIds() { return [...this._executedGroupIds]; }
    get type() { return 'paste-bricks'; }

    execute(context) {
        this._assertWorldMatches(context);
        const building = context.world.getBuilding(this._buildingId);
        if (!building) {
            throw new Error(`PasteBricksCommand: unknown building ${this._buildingId}`);
        }
        const added = [];
        try {
            for (let i = 0; i < this._items.length; i++) {
                const item = this._items[i];
                const brick = new Brick({
                    id: this._executedBrickIds[i] || undefined,
                    definitionId: item.definitionId,
                    position: item.position.clone(),
                    rotation: item.rotation
                });
                context.world.addBrickToBuilding(this._buildingId, brick);
                added.push(brick.id);
                this._executedBrickIds[i] = brick.id;
            }
            // Group intent (0.1.43): create the carried groups over the
            // freshly created bricks. Indices resolve against the ids
            // THIS execution created — the clipboard never carried ids.
            for (let i = 0; i < this._groups.length; i++) {
                const groupIntent = this._groups[i];
                const memberIds = groupIntent.memberIndices
                    .map((index) => this._executedBrickIds[index])
                    .filter((id) => id);
                if (memberIds.length === 0) {
                    continue;
                }
                const group = new Group({
                    id: this._executedGroupIds[i] || undefined,
                    name: groupIntent.name,
                    brickIds: memberIds
                });
                context.world.addGroup(group);
                this._executedGroupIds[i] = group.id;
            }
        } catch (error) {
            for (const groupId of this._executedGroupIds) {
                if (groupId) {
                    context.world.removeGroup(groupId);
                }
            }
            this._executedGroupIds = [];
            for (const brickId of added) {
                context.world.removeBrickFromBuilding(this._buildingId, brickId);
            }
            this._executedBrickIds = [];
            throw error;
        }
        return added.length;
    }

    undo(context) {
        this._assertWorldMatches(context);
        if (this._items.length === 0 || this._executedBrickIds.length !== this._items.length) {
            throw new Error('PasteBricksCommand: cannot undo before execute() has run');
        }
        for (const groupId of this._executedGroupIds) {
            if (groupId) {
                context.world.removeGroup(groupId);
            }
        }
        for (const brickId of this._executedBrickIds) {
            context.world.removeBrickFromBuilding(this._buildingId, brickId);
        }
    }

    canUndo() {
        return this._items.length > 0 && this._executedBrickIds.length === this._items.length;
    }

    describe() {
        if (this._description) {
            return this._description;
        }
        return `Paste ${this._items.length} ${this._items.length === 1 ? 'Brick' : 'Bricks'}`;
    }

    toJSON() {
        return {
            type: this.type,
            id: this._id,
            timestamp: this._timestamp.toISOString(),
            worldId: this._worldId,
            buildingId: this._buildingId,
            description: this._description,
            items: this._items.map((item) => ({
                definitionId: item.definitionId,
                position: item.position.toJSON(),
                rotation: item.rotation
            })),
            groups: this._groups.map((group) => ({
                name: group.name,
                memberIndices: [...group.memberIndices]
            })),
            executedBrickIds: this._executedBrickIds.length === this._items.length && this._items.length > 0
                ? [...this._executedBrickIds]
                : null,
            executedGroupIds: this._executedGroupIds.length > 0 ? [...this._executedGroupIds] : null
        };
    }

    static fromJSON(json, registry) {
        const cmd = new PasteBricksCommand({
            worldId: json.worldId,
            buildingId: json.buildingId,
            items: json.items || [],
            groups: json.groups || [],
            description: json.description || null,
            id: json.id,
            timestamp: new Date(json.timestamp)
        });
        cmd._executedBrickIds = Array.isArray(json.executedBrickIds)
            ? [...json.executedBrickIds]
            : [];
        cmd._executedGroupIds = Array.isArray(json.executedGroupIds)
            ? [...json.executedGroupIds]
            : [];
        return cmd;
    }

    _assertWorldMatches(context) {
        if (context.world.id !== this._worldId) {
            throw new Error(
                `PasteBricksCommand: worldId mismatch (command targets ${this._worldId}, context has ${context.world.id})`
            );
        }
    }
}
