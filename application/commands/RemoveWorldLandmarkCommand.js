import { WorldLandmark } from '../../core/WorldLandmark.js';
import { Command } from './Command.js';

// 0.3.7 — World Landmarks & Personal Waypoints.
//
// Removes an existing WorldLandmark from the World.
// The landmarkId is stored at construction and never reassigned.
// _removedLandmarkJson tracks what was removed for undo() correctness,
// following the same pattern as RemoveStructurePlacementCommand.
export class RemoveWorldLandmarkCommand extends Command {
    constructor({ worldId, landmarkId, id, timestamp } = {}) {
        super({ id, timestamp });
        this._worldId = worldId;
        this._landmarkId = landmarkId;
        this._removedLandmarkJson = null;
    }

    get worldId() { return this._worldId; }
    get landmarkId() { return this._landmarkId; }
    get type() { return 'remove-world-landmark'; }

    // context: { world } — the live World this command applies to.
    // Returns the removed WorldLandmark (or null if not found).
    execute(context) {
        this._assertWorldMatches(context);
        const landmark = context.world.getWorldLandmark(this._landmarkId);
        if (!landmark) {
            throw new Error(
                `RemoveWorldLandmarkCommand: landmark ${this._landmarkId} not found`
            );
        }

        this._removedLandmarkJson = landmark.toJSON();
        context.world.removeWorldLandmark(this._landmarkId);
        return landmark;
    }

    undo(context) {
        this._assertWorldMatches(context);
        if (!this._removedLandmarkJson) {
            throw new Error('RemoveWorldLandmarkCommand: cannot undo before execute() has run');
        }

        const snapshot = this._removedLandmarkJson;
        const restoredLandmark = WorldLandmark.fromJSON(snapshot);
        context.world.addWorldLandmark(restoredLandmark);
    }

    canUndo() {
        return this._removedLandmarkJson !== null;
    }

    describe() {
        return `Remove Landmark "${this._landmarkId}"`;
    }

    toJSON() {
        return {
            type: this.type,
            id: this._id,
            timestamp: this._timestamp.toISOString(),
            worldId: this._worldId,
            landmarkId: this._landmarkId,
            removedLandmarkJson: this._removedLandmarkJson
        };
    }

    static fromJSON(json) {
        const cmd = new RemoveWorldLandmarkCommand({
            worldId: json.worldId,
            landmarkId: json.landmarkId,
            id: json.id,
            timestamp: new Date(json.timestamp)
        });
        cmd._removedLandmarkJson = json.removedLandmarkJson || null;
        return cmd;
    }

    _assertWorldMatches(context) {
        if (context.world.id !== this._worldId) {
            throw new Error(
                `RemoveWorldLandmarkCommand: worldId mismatch (command targets ${this._worldId}, context has ${context.world.id})`
            );
        }
    }
}
