// 0.3.7 — World Landmarks & Personal Waypoints.
//
// Command to update an existing WorldLandmark's title, description, or position.
import { Command } from './Command.js';
import { Position } from '../../core/Position.js';

export class UpdateWorldLandmarkCommand extends Command {
    constructor({ id, timestamp, worldId, authorIdentityId, landmarkId, title, description, position } = {}) {
        super({ id, timestamp });
        this._worldId = worldId;
        this._authorIdentityId = authorIdentityId;
        this._landmarkId = landmarkId;
        this._title = title;
        this._description = description;
        this._position = position;
        this._previousState = null;
    }

    get worldId() { return this._worldId; }
    get authorIdentityId() { return this._authorIdentityId; }
    get landmarkId() { return this._landmarkId; }
    get title() { return this._title; }
    get description() { return this._description; }
    get position() { return this._position; }
    get type() { return 'update-world-landmark'; }

    execute(context) {
        this._assertWorldMatches(context);
        
        const landmark = context.world.getLandmark(this._landmarkId);
        if (!landmark) {
            throw new Error('UpdateWorldLandmarkCommand: landmark not found');
        }

        // Save previous state for undo
        this._previousState = {
            title: landmark.title,
            description: landmark.description,
            position: { x: landmark.position.x, y: landmark.position.y, z: landmark.position.z }
        };

        let finalPosition = this._position;
        if (finalPosition && context.walkableSurface) {
            const surface = context.walkableSurface.getSurfaceAt(finalPosition.x, finalPosition.z);
            if (surface) {
                finalPosition = new Position(finalPosition.x, surface.y, finalPosition.z);
            }
        }

        context.world.updateLandmark(this._landmarkId, {
            title: this._title,
            description: this._description,
            position: finalPosition
        });

        return landmark;
    }

    undo(context) {
        this._assertWorldMatches(context);
        if (!this._previousState) {
            throw new Error('UpdateWorldLandmarkCommand: cannot undo before execute() has run');
        }
        
        context.world.updateLandmark(this._landmarkId, {
            title: this._previousState.title,
            description: this._previousState.description,
            position: this._previousState.position
        });
    }

    canUndo() {
        return this._previousState !== null;
    }

    describe() {
        return `Update Landmark "${this._title || this._landmarkId}"`;
    }

    toJSON() {
        return {
            type: this.type,
            id: this._id,
            timestamp: this._timestamp.toISOString(),
            worldId: this._worldId,
            authorIdentityId: this._authorIdentityId,
            landmarkId: this._landmarkId,
            title: this._title,
            description: this._description,
            position: this._position ? this._position.toJSON() : null,
            previousState: this._previousState
        };
    }

    static fromJSON(json, registry) {
        const cmd = new UpdateWorldLandmarkCommand({
            worldId: json.worldId,
            authorIdentityId: json.authorIdentityId,
            landmarkId: json.landmarkId,
            title: json.title,
            description: json.description,
            position: json.position ? Position.fromJSON(json.position) : null,
            id: json.id,
            timestamp: new Date(json.timestamp)
        });
        cmd._previousState = json.previousState || null;
        return cmd;
    }

    _assertWorldMatches(context) {
        if (context.world.id !== this._worldId) {
            throw new Error(
                `UpdateWorldLandmarkCommand: worldId mismatch (command targets ${this._worldId}, context has ${context.world.id})`
            );
        }
    }
}
