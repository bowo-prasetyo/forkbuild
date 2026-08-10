import { Brick } from '../../core/Brick.js';
import { Position } from '../../core/Position.js';
import { Command } from './Command.js';

// Immutable in the sense that matters: worldId, buildingId, definitionId,
// position, and rotation are set once at construction and never
// reassigned — this is what makes the command serializable, replayable,
// and transmittable (toJSON()/fromJSON() round-trip exactly those fields,
// nothing else). No brickId in the constructor: the command creates the
// Brick's identity when executed, it doesn't receive one.
//
// One narrow exception to immutability, required for undo() to be
// correct: after execute() runs, this command remembers the id of the
// brick IT created, in _executedBrickId. Without that, undo() would only
// know "a brick matching this definition and position" — ambiguous if
// two identical bricks exist. This is bookkeeping about what happened,
// not part of the command's own stated intent, and it's deliberately excluded
// from toJSON() — a command replayed elsewhere (multiplayer, a fresh
// session loading from storage) creates a brand new brick with a brand
// new identity, which is correct: that's a different placement than the
// original, not a resurrection of it.
//
// execute() reuses _executedBrickId if it's already set, so that
// undo() -> redo() (execute() again) recreates the SAME brick identity
// rather than a new one each time — redo should be indistinguishable
// from "the undo never happened," not "a new brick that looks similar."
//
// Completely ignorant of the renderer. Its job ends at
// World.addBrickToBuilding()/removeBrickFromBuilding() (which publish
// BrickAdded/BrickRemoved) — the renderer, preview system, selection
// system, and eventually networking all react to those events on their
// own. No collision checking here either; that's PlacementValidator's
// job, called by whoever constructs this command (PlacementTool), not by
// the command itself.
export class PlaceBrickCommand extends Command {
    constructor({ worldId, buildingId, definitionId, position, rotation = 0, id, timestamp } = {}) {
        super({ id, timestamp });
        this._worldId = worldId;
        this._buildingId = buildingId;
        this._definitionId = definitionId;
        this._position = position;
        this._rotation = rotation;
        this._executedBrickId = null;
    }

    get worldId() { return this._worldId; }
    get buildingId() { return this._buildingId; }
    get definitionId() { return this._definitionId; }
    get position() { return this._position; }
    get rotation() { return this._rotation; }
    get type() { return 'place-brick'; }

    // context: { world } — the live World this command applies to.
    // Returns the created (or, on redo, re-created with the same id) Brick.
    execute(context) {
        this._assertWorldMatches(context);
        const brick = new Brick({
            id: this._executedBrickId || undefined,
            definitionId: this._definitionId,
            position: this._position,
            rotation: this._rotation
        });
        context.world.addBrickToBuilding(this._buildingId, brick);
        this._executedBrickId = brick.id;
        return brick;
    }

    undo(context) {
        this._assertWorldMatches(context);
        if (!this._executedBrickId) {
            throw new Error('PlaceBrickCommand: cannot undo before execute() has run');
        }
        context.world.removeBrickFromBuilding(this._buildingId, this._executedBrickId);
    }

    canUndo() {
        return this._executedBrickId !== null;
    }

    describe() {
        return 'Place Brick';
    }

    toJSON() {
        return {
            type: this.type,
            id: this._id,
            timestamp: this._timestamp.toISOString(),
            worldId: this._worldId,
            buildingId: this._buildingId,
            definitionId: this._definitionId,
            position: this._position.toJSON(),
            rotation: this._rotation,
            executedBrickId: this._executedBrickId
        };
    }

    static fromJSON(json, registry) {
        const cmd = new PlaceBrickCommand({
            worldId: json.worldId,
            buildingId: json.buildingId,
            definitionId: json.definitionId,
            position: Position.fromJSON(json.position),
            rotation: json.rotation,
            id: json.id,
            timestamp: new Date(json.timestamp)
        });
        cmd._executedBrickId = json.executedBrickId || null;
        return cmd;
    }

    _assertWorldMatches(context) {
        if (context.world.id !== this._worldId) {
            throw new Error(
                `PlaceBrickCommand: worldId mismatch (command targets ${this._worldId}, context has ${context.world.id})`
            );
        }
    }
}
