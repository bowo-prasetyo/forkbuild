import { Command } from './Command.js';

// 0.3.7 — World Landmarks & Personal Waypoints.
//
// Updates an existing WorldLandmark's title and/or description.
// The landmarkId is stored at construction and never reassigned.
// _originalState tracks the prior values for undo() correctness.
export class UpdateWorldLandmarkCommand extends Command {
    constructor({ worldId, landmarkId, title, description, id, timestamp } = {}) {
        super({ id, timestamp });
        this._worldId = worldId;
        this._landmarkId = landmarkId;
        this._title = title;
        this._description = description;
        this._originalState = null;
    }

    get worldId() { return this._worldId; }
    get landmarkId() { return this._landmarkId; }
    get title() { return this._title; }
    get description() { return this._description; }
    get type() { return 'update-world-landmark'; }

    // context: { world } — the live World this command applies to.
    execute(context) {
        this._assertWorldMatches(context);
        const landmark = context.world.getWorldLandmark(this._landmarkId);
        if (!landmark) {
            throw new Error(`UpdateWorldLandmarkCommand: landmark ${this._landmarkId} not found`);
        }

        // Capture original state for undo on first execution
        if (!this._originalState) {
            this._originalState = {
                title: landmark.title,
                description: landmark.description
            };
        }

        const updates = {};
        if (this._title !== undefined) {
            updates.title = this._title;
        }
        if (this._description !== undefined) {
            updates.description = this._description;
        }
        context.world.updateWorldLandmark(this._landmarkId, updates);
        return landmark;
    }

    undo(context) {
        this._assertWorldMatches(context);
        if (!this._originalState) {
            throw new Error('UpdateWorldLandmarkCommand: cannot undo before execute() has run');
        }
        context.world.updateWorldLandmark(this._landmarkId, this._originalState);
    }

    canUndo() {
        return this._originalState !== null;
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
            landmarkId: this._landmarkId,
            title: this._title,
            description: this._description,
            originalState: this._originalState
        };
    }

    static fromJSON(json) {
        const cmd = new UpdateWorldLandmarkCommand({
            worldId: json.worldId,
            landmarkId: json.landmarkId,
            title: json.title,
            description: json.description,
            id: json.id,
            timestamp: new Date(json.timestamp)
        });
        cmd._originalState = json.originalState || null;
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
