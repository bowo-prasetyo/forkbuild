import { StructurePlacement } from '../../core/StructurePlacement.js';
import { Command } from './Command.js';

// Mirrors application/commands/DeleteBrickCommand.js exactly, one rung
// up — placement and removal are near-inverses here too. Constructor
// fields (worldId, placementId) never change after construction.
//
// execute() must snapshot the placement's full data (documentId,
// position, rotation) BEFORE removing it — once
// World.removeStructurePlacement() runs, that data is gone. Same
// bookkeeping reasoning as DeleteBrickCommand's own header.
//
// undo() recreates the placement with its ORIGINAL id — delete -> undo
// should be indistinguishable from "the delete never happened."
//
// The one semantic this command exists to make explicit (see the 0.2.90
// design conversation and core/StructurePlacement.js's own header):
// removing a placement NEVER touches the Document it referenced.
// Nothing here calls into storage, ForkStructureUseCase, or any
// Document-lifecycle use case — deleting a WorldPlacement-shaped
// reference is purely a World-local mutation, exactly as
// DeleteBrickCommand only ever removes a Brick, never the
// BrickDefinition it was an instance of.
export class RemoveStructurePlacementCommand extends Command {
    constructor({ worldId, placementId, id, timestamp } = {}) {
        super({ id, timestamp });
        this._worldId = worldId;
        this._placementId = placementId;
        this._removedPlacementSnapshot = null;
    }

    get worldId() { return this._worldId; }
    get placementId() { return this._placementId; }
    get type() { return 'remove-structure-placement'; }

    execute(context) {
        this._assertWorldMatches(context);
        const placement = context.world.getStructurePlacement(this._placementId);
        if (!placement) {
            throw new Error(
                `RemoveStructurePlacementCommand: placement ${this._placementId} not found`
            );
        }

        this._removedPlacementSnapshot = {
            id: placement.id,
            documentId: placement.documentId,
            position: placement.position,
            rotation: placement.rotation
        };
        context.world.removeStructurePlacement(this._placementId);
    }

    undo(context) {
        this._assertWorldMatches(context);
        if (!this._removedPlacementSnapshot) {
            throw new Error('RemoveStructurePlacementCommand: cannot undo before execute() has run');
        }

        const snapshot = this._removedPlacementSnapshot;
        const restoredPlacement = new StructurePlacement({
            id: snapshot.id,
            documentId: snapshot.documentId,
            position: snapshot.position,
            rotation: snapshot.rotation
        });
        context.world.addStructurePlacement(restoredPlacement);
    }

    canUndo() {
        return this._removedPlacementSnapshot !== null;
    }

    describe() {
        return 'Remove Structure Placement';
    }

    toJSON() {
        return {
            type: this.type,
            id: this._id,
            timestamp: this._timestamp.toISOString(),
            worldId: this._worldId,
            placementId: this._placementId,
            removedPlacementSnapshot: this._removedPlacementSnapshot
        };
    }

    static fromJSON(json) {
        const cmd = new RemoveStructurePlacementCommand({
            worldId: json.worldId,
            placementId: json.placementId,
            id: json.id,
            timestamp: new Date(json.timestamp)
        });
        cmd._removedPlacementSnapshot = json.removedPlacementSnapshot || null;
        return cmd;
    }

    _assertWorldMatches(context) {
        if (context.world.id !== this._worldId) {
            throw new Error(
                `RemoveStructurePlacementCommand: worldId mismatch (command targets ${this._worldId}, context has ${context.world.id})`
            );
        }
    }
}
