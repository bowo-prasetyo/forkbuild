// 0.3.7 — World Landmarks & Personal Waypoints.
//
// Command to create a new WorldLandmark at the user's current position.
// The landmark's Y coordinate is derived from the walkable surface at
// execution time, following the principle that ground elevation is
// derived from the World, not stored arbitrarily.
import { Command } from './Command.js';
import { createId } from '../../core/createId.js';
import { Position } from '../../core/Position.js';
import { WorldLandmark } from '../../core/WorldLandmark.js';

export class CreateWorldLandmarkCommand extends Command {
    constructor({ id, timestamp, worldId, authorIdentityId, title, description = '', position } = {}) {
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

    execute(context) {
        this._assertWorldMatches(context);
        
        // Derive Y from walkable surface if not provided
        let finalPosition = this._position;
        if (context.walkableSurface) {
            const surface = context.walkableSurface.getSurfaceAt(this._position.x, this._position.z);
            if (surface) {
                finalPosition = new Position(this._position.x, surface.y, this._position.z);
            }
        }

        const landmark = new WorldLandmark({
            id: this._executedLandmarkId || createId(),
            worldId: this._worldId,
            authorIdentityId: this._authorIdentityId,
            title: this._title,
            description: this._description,
            position: finalPosition,
            createdAt: this._timestamp
        });

        context.world.addLandmark(landmark);
        this._executedLandmarkId = landmark.id;
        return landmark;
    }

    undo(context) {
        this._assertWorldMatches(context);
        if (!this._executedLandmarkId) {
            throw new Error('CreateWorldLandmarkCommand: cannot undo before execute() has run');
        }
        context.world.removeLandmark(this._executedLandmarkId);
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

    static fromJSON(json, registry) {
        const cmd = new CreateWorldLandmarkCommand({
            worldId: json.worldId,
            authorIdentityId: json.authorIdentityId,
            title: json.title,
            description: json.description,
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
