import { Command } from './Command.js';
import { Position } from '../../core/Position.js';

// 0.2.97 — Shared World Ordering & Conflict Resolution.
//
// An ABSOLUTE counterpart to MoveStructurePlacementCommand/
// RotateStructurePlacementCommand's own RELATIVE deltas — sets a
// StructurePlacement's position and/or rotation to an EXACT target
// value, remembering the prior exact value for undo(). Mirrors
// application/SpatialEditingService.js#applyNumericTransform()'s own
// existing ABSOLUTE convention for bricks/selections (0.1.49) — the
// natural future caller for this command is the same numeric-transform-
// input surface, extended to structure placements.
//
// Exists because a RELATIVE delta command, replayed under
// replication/WorldConflictResolver.js's own reordering rebase, always
// COMPOSES with whatever else happened to the same placement — correct,
// and exercised by tests/SharedWorldConflictResolution.test.js's own
// "concurrent, composing" scenarios — but a delta can never demonstrate
// genuine last-writer-wins semantics for two concurrent edits that each
// target a specific, EXACT final value (the "Alice moves House to
// (10, 20); Bob moves House to (30, 40); there must be one deterministic
// winner" example this milestone's own design conversation used). This
// command is what makes that scenario expressible at all: whichever of
// two concurrent SetStructurePlacementTransformCommands is canonically
// LATER (core/WorldOperationOrder.js) is the one whose exact target
// value survives, on every replica, regardless of arrival order — see
// replication/WorldConflictResolver.js's own header for the mechanism.
export class SetStructurePlacementTransformCommand extends Command {
    constructor({ worldId, placementId, position = null, rotation = null, id, timestamp } = {}) {
        super({ id, timestamp });
        this._worldId = worldId;
        this._placementId = placementId;
        this._position = position
            ? (position instanceof Position ? position : new Position(position.x || 0, position.y || 0, position.z || 0))
            : null;
        this._rotation = rotation === undefined ? null : rotation;
        this._previousPosition = null;
        this._previousRotation = null;
        this._hasRun = false;
    }

    get worldId() { return this._worldId; }
    get placementId() { return this._placementId; }
    get position() { return this._position; }
    get rotation() { return this._rotation; }
    get type() { return 'set-structure-placement-transform'; }

    execute(context) {
        this._assertWorldMatches(context);
        const placement = context.world.getStructurePlacement(this._placementId);
        if (!placement) {
            throw new Error(
                `SetStructurePlacementTransformCommand: placement ${this._placementId} not found`
            );
        }
        this._previousPosition = placement.position.clone();
        this._previousRotation = placement.rotation;
        this._hasRun = true;
        const changes = {};
        if (this._position) changes.position = this._position;
        if (this._rotation !== null) changes.rotation = this._rotation;
        context.world.updateStructurePlacement(this._placementId, changes);
    }

    undo(context) {
        this._assertWorldMatches(context);
        if (!this._hasRun) {
            throw new Error('SetStructurePlacementTransformCommand: cannot undo before execute() has run');
        }
        context.world.updateStructurePlacement(this._placementId, {
            position: this._previousPosition,
            rotation: this._previousRotation
        });
    }

    canUndo() {
        return this._hasRun;
    }

    describe() {
        return 'Set Structure Placement Transform';
    }

    toJSON() {
        return {
            type: this.type,
            id: this._id,
            timestamp: this._timestamp.toISOString(),
            worldId: this._worldId,
            placementId: this._placementId,
            position: this._position ? this._position.toJSON() : null,
            rotation: this._rotation,
            previousPosition: this._previousPosition ? this._previousPosition.toJSON() : null,
            previousRotation: this._previousRotation
        };
    }

    static fromJSON(json) {
        const cmd = new SetStructurePlacementTransformCommand({
            worldId: json.worldId,
            placementId: json.placementId,
            position: json.position ? Position.fromJSON(json.position) : null,
            rotation: json.rotation !== undefined ? json.rotation : null,
            id: json.id,
            timestamp: new Date(json.timestamp)
        });
        if (json.previousPosition) {
            cmd._previousPosition = Position.fromJSON(json.previousPosition);
            cmd._hasRun = true;
        }
        if (json.previousRotation !== undefined && json.previousRotation !== null) {
            cmd._previousRotation = json.previousRotation;
            cmd._hasRun = true;
        }
        return cmd;
    }

    _assertWorldMatches(context) {
        if (context.world.id !== this._worldId) {
            throw new Error(
                `SetStructurePlacementTransformCommand: worldId mismatch (command targets ${this._worldId}, context has ${context.world.id})`
            );
        }
    }
}
