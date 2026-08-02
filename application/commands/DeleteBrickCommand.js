import { Brick } from '../../core/Brick.js';
import { Command } from './Command.js';

// Mirrors PlaceBrickCommand's shape closely, as expected — placement and
// deletion are near-inverses. Constructor fields (worldId, buildingId,
// brickId) never change after construction.
//
// execute() must capture the brick's full data (definitionId, position,
// rotation) BEFORE removing it — once World.removeBrickFromBuilding()
// runs, that data is gone. This snapshot is the same kind of "what
// actually happened" bookkeeping PlaceBrickCommand keeps for its
// _executedBrickId: necessary for undo() to be correct, not part of the
// command's stated intent, and excluded from toJSON() for the same
// reason.
//
// undo() recreates the brick with its ORIGINAL id (not a fresh one) —
// delete -> undo should be indistinguishable from "the delete never
// happened," which requires the exact same identity back, not a
// similar-looking replacement.
export class DeleteBrickCommand extends Command {
    constructor({ worldId, buildingId, brickId }) {
        super();
        this._worldId = worldId;
        this._buildingId = buildingId;
        this._brickId = brickId;
        this._removedBrickSnapshot = null;
    }

    get worldId() {
        return this._worldId;
    }

    get buildingId() {
        return this._buildingId;
    }

    get brickId() {
        return this._brickId;
    }

    execute(context) {
        this._assertWorldMatches(context);

        const building = context.world.getBuilding(this._buildingId);
        const brick = building ? building.findBrick(this._brickId) : null;
        if (!brick) {
            throw new Error(
                `DeleteBrickCommand: brick ${this._brickId} not found in building ${this._buildingId}`
            );
        }

        this._removedBrickSnapshot = {
            id: brick.id,
            definitionId: brick.definitionId,
            position: brick.position,
            rotation: brick.rotation
        };
        context.world.removeBrickFromBuilding(this._buildingId, this._brickId);
    }

    undo(context) {
        this._assertWorldMatches(context);
        if (!this._removedBrickSnapshot) {
            throw new Error('DeleteBrickCommand: cannot undo before execute() has run');
        }

        const snapshot = this._removedBrickSnapshot;
        const restoredBrick = new Brick({
            id: snapshot.id,
            definitionId: snapshot.definitionId,
            position: snapshot.position,
            rotation: snapshot.rotation
        });
        context.world.addBrickToBuilding(this._buildingId, restoredBrick);
    }

    canUndo() {
        return this._removedBrickSnapshot !== null;
    }

    toJSON() {
        return {
            worldId: this._worldId,
            buildingId: this._buildingId,
            brickId: this._brickId
        };
    }

    static fromJSON(json) {
        return new DeleteBrickCommand({
            worldId: json.worldId,
            buildingId: json.buildingId,
            brickId: json.brickId
        });
    }

    _assertWorldMatches(context) {
        if (context.world.id !== this._worldId) {
            throw new Error(
                `DeleteBrickCommand: worldId mismatch (command targets ${this._worldId}, context has ${context.world.id})`
            );
        }
    }
}
