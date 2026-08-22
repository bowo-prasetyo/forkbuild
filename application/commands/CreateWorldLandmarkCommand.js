import { WorldLandmark } from '../../core/WorldLandmark.js';
import { Position } from '../../core/Position.js';
import { createId } from '../../core/createId.js';
import { Command } from './Command.js';

// 0.3.7 — World Landmarks & Personal Waypoints.
//
// Creates a new WorldLandmark at the specified position. The command
// stores worldId, authorIdentityId, title, description, and position;
// execute() creates the landmark's identity, it doesn't receive one,
// following the same pattern as PlaceStructureCommand and PlaceBrickCommand.
// Unlike Brick/StructurePlacement, WorldLandmark does not default its own
// id (core/WorldLandmark.js requires one explicitly), so this command
// mints one itself via createId() on first execute().
//
// _executedLandmarkId tracks what was created for undo() correctness AND
// is included in toJSON(), the same "redo() must recreate the SAME
// identity" precedent core/commands/PlaceBrickCommand.js#executedBrickId
// and CreateGroupCommand.js#executedGroupId already established.
export class CreateWorldLandmarkCommand extends Command {
    constructor({ worldId, authorIdentityId, title, description = '', position, id, timestamp } = {}) {
        super({ id, timestamp });
        this._worldId = worldId;
        this._authorIdentityId = authorIdentityId;
        this._title = title;
        this._description = description;
        this._position = position;
        this._executedLandmarkId = null;
    }

    get worldId() { return this._worldId; }
    get authorIdentityId() { return this._authorIdentityId; }
    get title() { return this._title; }
    get description() { return this._description; }
    get position() { return this._position; }
    get type() { return 'create-world-landmark'; }
    // The id of the landmark this command created — null until execute()
    // has run. Lets a caller (e.g. WorldNavigationSession#createLandmarkHere)
    // learn what was just created, mirroring CreateGroupCommand#executedGroupId.
    get executedLandmarkId() { return this._executedLandmarkId; }

    // context: { world } — the live World this command applies to.
    // Returns the created (or re-created on redo) WorldLandmark.
    execute(context) {
        this._assertWorldMatches(context);
        const landmark = new WorldLandmark({
            id: this._executedLandmarkId || createId(),
            worldId: this._worldId,
            authorIdentityId: this._authorIdentityId,
            title: this._title,
            description: this._description,
            position: this._position
        });
        context.world.addWorldLandmark(landmark);
        this._executedLandmarkId = landmark.id;
        return landmark;
    }

    undo(context) {
        this._assertWorldMatches(context);
        if (!this._executedLandmarkId) {
            throw new Error('CreateWorldLandmarkCommand: cannot undo before execute() has run');
        }
        context.world.removeWorldLandmark(this._executedLandmarkId);
    }

    canUndo() {
        return this._executedLandmarkId !== null;
    }

    describe() {
        return `Create Landmark "${this._title}"`;
    }

    toJSON() {
        return {
            type: this.type,
            id: this._id,
            timestamp: this._timestamp.toISOString(),
            worldId: this._worldId,
            authorIdentityId: this._authorIdentityId,
            title: this._title,
            description: this._description,
            position: this._position.toJSON(),
            executedLandmarkId: this._executedLandmarkId
        };
    }

    static fromJSON(json) {
        const cmd = new CreateWorldLandmarkCommand({
            worldId: json.worldId,
            authorIdentityId: json.authorIdentityId,
            title: json.title,
            description: json.description || '',
            position: Position.fromJSON(json.position),
            id: json.id,
            timestamp: new Date(json.timestamp)
        });
        cmd._executedLandmarkId = json.executedLandmarkId || null;
        return cmd;
    }

    _assertWorldMatches(context) {
        if (context.world.id !== this._worldId) {
            throw new Error(
                `CreateWorldLandmarkCommand: worldId mismatch (command targets ${this._worldId}, context has ${context.world.id})`
            );
        }
    }
}
