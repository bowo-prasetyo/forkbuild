import { Command } from './Command.js';

// 0.2.91 — World Instance Editing & Placement Management. The
// StructurePlacement counterpart to RotateBrickCommand.js, one rung up.
// deltaRotation is added to the placement's current rotation (e.g. +90
// or −90), the exact "orient once" convention 0.2.87/0.2.90 already
// established for bricks and for the pending-placement preview.
//
// Mutates ONLY StructurePlacement.rotation — every brick INSIDE the
// referenced Document keeps its own local rotation untouched; the whole
// instance turns as one rigid unit, composed at render time exactly the
// way renderer/WorldRenderer.js#_renderStructurePlacement() already
// does for the FIRST placement (rotation set once at PlaceStructureCommand
// time). Rotating never needs a collision check: core/SpatialBounds.js's
// own V1 simplification computes a placement's AABB translate-only,
// never rotated, so a placement's bounding box is identical at every
// rotation — see application/StructurePlacementValidator.js's own header.
export class RotateStructurePlacementCommand extends Command {
    constructor({ worldId, placementId, deltaRotation, id, timestamp } = {}) {
        super({ id, timestamp });
        this._worldId = worldId;
        this._placementId = placementId;
        this._deltaRotation = deltaRotation;
        this._originalRotation = null;
    }

    get worldId() { return this._worldId; }
    get placementId() { return this._placementId; }
    get deltaRotation() { return this._deltaRotation; }
    get type() { return 'rotate-structure-placement'; }

    execute(context) {
        this._assertWorldMatches(context);
        const placement = context.world.getStructurePlacement(this._placementId);
        if (!placement) {
            throw new Error(
                `RotateStructurePlacementCommand: placement ${this._placementId} not found`
            );
        }

        this._originalRotation = placement.rotation;
        const newRotation = placement.rotation + this._deltaRotation;
        context.world.updateStructurePlacement(this._placementId, { rotation: newRotation });
    }

    undo(context) {
        this._assertWorldMatches(context);
        if (this._originalRotation === null) {
            throw new Error('RotateStructurePlacementCommand: cannot undo before execute() has run');
        }
        context.world.updateStructurePlacement(this._placementId, { rotation: this._originalRotation });
    }

    canUndo() {
        return this._originalRotation !== null;
    }

    describe() {
        return 'Rotate Structure Placement';
    }

    toJSON() {
        return {
            type: this.type,
            id: this._id,
            timestamp: this._timestamp.toISOString(),
            worldId: this._worldId,
            placementId: this._placementId,
            deltaRotation: this._deltaRotation,
            originalRotation: this._originalRotation
        };
    }

    static fromJSON(json) {
        const cmd = new RotateStructurePlacementCommand({
            worldId: json.worldId,
            placementId: json.placementId,
            deltaRotation: json.deltaRotation,
            id: json.id,
            timestamp: new Date(json.timestamp)
        });
        cmd._originalRotation = json.originalRotation !== undefined ? json.originalRotation : null;
        return cmd;
    }

    _assertWorldMatches(context) {
        if (context.world.id !== this._worldId) {
            throw new Error(
                `RotateStructurePlacementCommand: worldId mismatch (command targets ${this._worldId}, context has ${context.world.id})`
            );
        }
    }
}
