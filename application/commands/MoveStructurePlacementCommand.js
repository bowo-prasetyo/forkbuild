import { Command } from './Command.js';
import { Position } from '../../core/Position.js';

// 0.2.91 — World Instance Editing & Placement Management. The
// StructurePlacement counterpart to MoveBrickCommand.js, one rung up:
// undoable spatial translation of an ENTIRE placed instance. Mirrors
// MoveBrickCommand's own shape exactly — delta is a plain {x,y,z}
// offset, the original position is remembered for undo().
//
// Mutates ONLY StructurePlacement.position via
// core/World.js#updateStructurePlacement() — never Document.bricks[*],
// never the referenced Document at all. This is the load-bearing
// distinction the whole milestone exists to make real: moving House
// Instance A never moves a single brick inside the House Document, and
// leaves every OTHER placement of that same Document (Instance B, C, …)
// completely untouched — see core/StructurePlacement.js's own header.
//
// Deliberately ignorant of collision: exactly like MoveBrickCommand and
// PlaceStructureCommand before it, validating the destination
// (application/StructurePlacementValidator.js, with excludePlacementId
// set to this placement's own id so it never collides with itself) is
// the caller's job — application/tools/SelectionTool.js and
// application/EditorSession.js#moveSelection() both ask before
// executing this command, never after.
export class MoveStructurePlacementCommand extends Command {
    constructor({ worldId, placementId, delta, id, timestamp } = {}) {
        super({ id, timestamp });
        this._worldId = worldId;
        this._placementId = placementId;
        this._delta = delta;
        this._originalPosition = null;
    }

    get worldId() { return this._worldId; }
    get placementId() { return this._placementId; }
    get delta() { return this._delta; }
    get type() { return 'move-structure-placement'; }

    execute(context) {
        this._assertWorldMatches(context);
        const placement = context.world.getStructurePlacement(this._placementId);
        if (!placement) {
            throw new Error(
                `MoveStructurePlacementCommand: placement ${this._placementId} not found`
            );
        }

        this._originalPosition = placement.position.clone();
        const newPos = new Position(
            placement.position.x + this._delta.x,
            placement.position.y + this._delta.y,
            placement.position.z + this._delta.z
        );
        context.world.updateStructurePlacement(this._placementId, { position: newPos });
    }

    undo(context) {
        this._assertWorldMatches(context);
        if (!this._originalPosition) {
            throw new Error('MoveStructurePlacementCommand: cannot undo before execute() has run');
        }
        context.world.updateStructurePlacement(this._placementId, { position: this._originalPosition });
    }

    canUndo() {
        return this._originalPosition !== null;
    }

    describe() {
        return 'Move Structure Placement';
    }

    toJSON() {
        return {
            type: this.type,
            id: this._id,
            timestamp: this._timestamp.toISOString(),
            worldId: this._worldId,
            placementId: this._placementId,
            delta: this._delta,
            originalPosition: this._originalPosition ? this._originalPosition.toJSON() : null
        };
    }

    static fromJSON(json) {
        const cmd = new MoveStructurePlacementCommand({
            worldId: json.worldId,
            placementId: json.placementId,
            delta: json.delta,
            id: json.id,
            timestamp: new Date(json.timestamp)
        });
        if (json.originalPosition) {
            cmd._originalPosition = Position.fromJSON(json.originalPosition);
        }
        return cmd;
    }

    _assertWorldMatches(context) {
        if (context.world.id !== this._worldId) {
            throw new Error(
                `MoveStructurePlacementCommand: worldId mismatch (command targets ${this._worldId}, context has ${context.world.id})`
            );
        }
    }
}
