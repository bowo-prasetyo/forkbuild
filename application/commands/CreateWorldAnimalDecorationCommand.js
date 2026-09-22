import { AnimalDecoration } from '../../core/AnimalDecoration.js';
import { Position } from '../../core/Position.js';
import { createId } from '../../core/createId.js';
import { Command } from './Command.js';

// 0.9.702 — World Animal Decorations.
//
// Creates a new AnimalDecoration at the specified position — the direct
// structural twin of CreateWorldLandmarkCommand.js, for a released
// animal being baked into durable World content instead of a named
// waypoint. execute() mints the decoration's identity, it doesn't
// receive one, the same PlaceStructureCommand/PlaceBrickCommand
// precedent CreateWorldLandmarkCommand.js's own header already cites.
//
// _executedDecorationId tracks what was created for undo() correctness
// AND is included in toJSON(), the same "redo() must recreate the SAME
// identity" precedent every sibling Create*Command in this directory
// already establishes.
export class CreateWorldAnimalDecorationCommand extends Command {
    constructor({ worldId, authorIdentityId, species, position, id, timestamp } = {}) {
        super({ id, timestamp });
        this._worldId = worldId;
        this._authorIdentityId = authorIdentityId;
        this._species = species;
        this._position = position;
        this._executedDecorationId = null;
    }

    get worldId() { return this._worldId; }
    get authorIdentityId() { return this._authorIdentityId; }
    get species() { return this._species; }
    get position() { return this._position; }
    get type() { return 'create-world-animal-decoration'; }
    // The id of the decoration this command created — null until
    // execute() has run. Lets a caller (WorldNavigationSession#
    // decorateNearestReleasedAnimalHere()) learn what was just created,
    // mirroring CreateWorldLandmarkCommand#executedLandmarkId.
    get executedDecorationId() { return this._executedDecorationId; }

    // context: { world } — the live World this command applies to.
    // Returns the created (or re-created on redo) AnimalDecoration.
    execute(context) {
        this._assertWorldMatches(context);
        const decoration = new AnimalDecoration({
            id: this._executedDecorationId || createId(),
            worldId: this._worldId,
            authorIdentityId: this._authorIdentityId,
            species: this._species,
            position: this._position
        });
        context.world.addAnimalDecoration(decoration);
        this._executedDecorationId = decoration.id;
        return decoration;
    }

    undo(context) {
        this._assertWorldMatches(context);
        if (!this._executedDecorationId) {
            throw new Error('CreateWorldAnimalDecorationCommand: cannot undo before execute() has run');
        }
        context.world.removeAnimalDecoration(this._executedDecorationId);
    }

    canUndo() {
        return this._executedDecorationId !== null;
    }

    describe() {
        return `Decorate World with ${this._species}`;
    }

    toJSON() {
        return {
            type: this.type,
            id: this._id,
            timestamp: this._timestamp.toISOString(),
            worldId: this._worldId,
            authorIdentityId: this._authorIdentityId,
            species: this._species,
            position: this._position.toJSON(),
            executedDecorationId: this._executedDecorationId
        };
    }

    static fromJSON(json) {
        const cmd = new CreateWorldAnimalDecorationCommand({
            worldId: json.worldId,
            authorIdentityId: json.authorIdentityId,
            species: json.species,
            position: Position.fromJSON(json.position),
            id: json.id,
            timestamp: new Date(json.timestamp)
        });
        cmd._executedDecorationId = json.executedDecorationId || null;
        return cmd;
    }

    _assertWorldMatches(context) {
        if (context.world.id !== this._worldId) {
            throw new Error(
                `CreateWorldAnimalDecorationCommand: worldId mismatch (command targets ${this._worldId}, context has ${context.world.id})`
            );
        }
    }
}
