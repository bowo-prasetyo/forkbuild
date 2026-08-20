import { StructurePlacement } from '../../core/StructurePlacement.js';
import { Position } from '../../core/Position.js';
import { Command } from './Command.js';

// Mirrors application/commands/PlaceBrickCommand.js exactly, one rung
// up: worldId, documentId (what to place — a REFERENCE, never bricks),
// position, and rotation are set once at construction and never
// reassigned. No placementId in the constructor — execute() creates the
// StructurePlacement's identity, it doesn't receive one, for the same
// replay/serialization reasons PlaceBrickCommand's own header explains.
//
// _executedPlacementId is the same "what actually happened" bookkeeping
// PlaceBrickCommand keeps in _executedBrickId: required for undo() to be
// correct, deliberately excluded from toJSON() — a command replayed
// elsewhere creates a brand new placement identity, which is correct.
//
// Completely ignorant of collision: PlacementValidator-equivalent
// checking (application/StructurePlacementValidator.js) is the caller's
// job (application/tools/StructurePlacementTool.js), exactly like
// PlacementTool never asks PlaceBrickCommand to validate itself.
export class PlaceStructureCommand extends Command {
    constructor({ worldId, documentId, position, rotation = 0, id, timestamp } = {}) {
        super({ id, timestamp });
        this._worldId = worldId;
        this._documentId = documentId;
        this._position = position;
        this._rotation = rotation;
        this._executedPlacementId = null;
    }

    get worldId() { return this._worldId; }
    get documentId() { return this._documentId; }
    get position() { return this._position; }
    get rotation() { return this._rotation; }
    get type() { return 'place-structure'; }

    // context: { world } — the live World this command applies to.
    // Returns the created (or, on redo, re-created with the same id)
    // StructurePlacement.
    execute(context) {
        this._assertWorldMatches(context);
        const placement = new StructurePlacement({
            id: this._executedPlacementId || undefined,
            documentId: this._documentId,
            position: this._position,
            rotation: this._rotation
        });
        context.world.addStructurePlacement(placement);
        this._executedPlacementId = placement.id;
        return placement;
    }

    undo(context) {
        this._assertWorldMatches(context);
        if (!this._executedPlacementId) {
            throw new Error('PlaceStructureCommand: cannot undo before execute() has run');
        }
        context.world.removeStructurePlacement(this._executedPlacementId);
    }

    canUndo() {
        return this._executedPlacementId !== null;
    }

    describe() {
        return 'Place Structure';
    }

    toJSON() {
        return {
            type: this.type,
            id: this._id,
            timestamp: this._timestamp.toISOString(),
            worldId: this._worldId,
            documentId: this._documentId,
            position: this._position.toJSON(),
            rotation: this._rotation,
            executedPlacementId: this._executedPlacementId
        };
    }

    static fromJSON(json) {
        const cmd = new PlaceStructureCommand({
            worldId: json.worldId,
            documentId: json.documentId,
            position: Position.fromJSON(json.position),
            rotation: json.rotation,
            id: json.id,
            timestamp: new Date(json.timestamp)
        });
        cmd._executedPlacementId = json.executedPlacementId || null;
        return cmd;
    }

    _assertWorldMatches(context) {
        if (context.world.id !== this._worldId) {
            throw new Error(
                `PlaceStructureCommand: worldId mismatch (command targets ${this._worldId}, context has ${context.world.id})`
            );
        }
    }
}
