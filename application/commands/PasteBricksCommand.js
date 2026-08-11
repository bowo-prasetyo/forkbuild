import { Brick } from '../../core/Brick.js';
import { Position } from '../../core/Position.js';
import { Command } from './Command.js';

// Pastes a set of bricks as ONE atomic history entry (0.1.42).
//
// Constructor fields (worldId, buildingId, items) are the command's
// INTENT and never change: each item is { definitionId, position,
// rotation } — pivot-relative geometry re-anchored by
// PasteClipboardUseCase, dimensions/materials implied by definitionId
// through BrickRegistry. No brick ids in the intent: the command
// creates the pasted bricks' identities at execution time, the same
// contract PlaceBrickCommand established — the clipboard that feeds
// this command never carries an id either.
//
// One narrow, deliberate crack in immutability — same shape as
// PlaceBrickCommand: after execute() runs, the command remembers the
// ids of the bricks it created (_executedBrickIds), and that record IS
// serialized. That is what makes undo -> redo recreate the SAME pasted
// bricks, and what lets history replay reconstruct byte-identical
// documents (the 0.1.40 guarantee). A paste replayed into another
// session without that record correctly creates fresh identities — a
// different paste, not a resurrection of the original.
//
// execute() is transactional like CompositeCommand: if anything throws
// mid-paste, already-added bricks are removed again before the error
// propagates. Completely renderer-ignorant: its job ends at
// World.addBrickToBuilding() / removeBrickFromBuilding().
export class PasteBricksCommand extends Command {
    constructor({ worldId, buildingId, items = [], description = null, id, timestamp } = {}) {
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
        this._description = description;
        this._executedBrickIds = [];
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
    get executedBrickIds() { return [...this._executedBrickIds]; }
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
        } catch (error) {
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
            executedBrickIds: this._items.length > 0 && this._executedBrickIds.length === this._items.length
                ? [...this._executedBrickIds]
                : null
        };
    }

    static fromJSON(json, registry) {
        const cmd = new PasteBricksCommand({
            worldId: json.worldId,
            buildingId: json.buildingId,
            items: json.items || [],
            description: json.description || null,
            id: json.id,
            timestamp: new Date(json.timestamp)
        });
        cmd._executedBrickIds = Array.isArray(json.executedBrickIds)
            ? [...json.executedBrickIds]
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
