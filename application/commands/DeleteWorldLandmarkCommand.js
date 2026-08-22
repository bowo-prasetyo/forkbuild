// 0.3.7 — World Landmarks & Personal Waypoints.
//
// Command to delete an existing WorldLandmark.
import { Command } from './Command.js';

export class DeleteWorldLandmarkCommand extends Command {
    constructor({ id, timestamp, worldId, authorIdentityId, landmarkId } = {}) {
        super({ id, timestamp });
        this._worldId = worldId;
        this._authorIdentityId = authorIdentityId;
        this._landmarkId = landmarkId;
        this._deletedLandmark = null;
    }

    get worldId() { return this._worldId; }
    get authorIdentityId() { return this._authorIdentityId; }
    get landmarkId() { return this._landmarkId; }
    get type() { return 'delete-world-landmark'; }

    execute(context) {
        this._assertWorldMatches(context);
        
        const landmark = context.world.getLandmark(this._landmarkId);
        if (!landmark) {
            throw new Error('DeleteWorldLandmarkCommand: landmark not found');
        }

        // Save the landmark for undo
        this._deletedLandmark = landmark;
        context.world.removeLandmark(this._landmarkId);
        return landmark;
    }

    undo(context) {
        this._assertWorldMatches(context);
        if (!this._deletedLandmark) {
            throw new Error('DeleteWorldLandmarkCommand: cannot undo before execute() has run');
        }
        
        context.world.addLandmark(this._deletedLandmark);
    }

    canUndo() {
        return this._deletedLandmark !== null;
    }

    describe() {
        return `Delete Landmark "${this._deletedLandmark ? this._deletedLandmark.title : this._landmarkId}"`;
    }

    toJSON() {
        return {
            type: this.type,
            id: this._id,
            timestamp: this._timestamp.toISOString(),
            worldId: this._worldId,
            authorIdentityId: this._authorIdentityId,
            landmarkId: this._landmarkId,
            deletedLandmark: this._deletedLandmark ? this._deletedLandmark.toJSON() : null
        };
    }

    static fromJSON(json, registry) {
        const cmd = new DeleteWorldLandmarkCommand({
            worldId: json.worldId,
            authorIdentityId: json.authorIdentityId,
            landmarkId: json.landmarkId,
            id: json.id,
            timestamp: new Date(json.timestamp)
        });
        cmd._deletedLandmark = json.deletedLandmark ? registry.constructor.fromJSON(json.deletedLandmark) : null;
        return cmd;
    }

    _assertWorldMatches(context) {
        if (context.world.id !== this._worldId) {
            throw new Error(
                `DeleteWorldLandmarkCommand: worldId mismatch (command targets ${this._worldId}, context has ${context.world.id})`
            );
        }
    }
}
