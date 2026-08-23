import { WorldRegion } from '../../core/WorldRegion.js';
import { Command } from './Command.js';

// 0.5.0 — World Regions & Decentralized Place Naming.
//
// Removes an existing WorldRegion from the World. The regionId is
// stored at construction and never reassigned. _removedRegionJson
// tracks what was removed for undo() correctness, following the same
// pattern as RemoveWorldLandmarkCommand. Removing a region never
// touches any other region that happens to name it as a
// parentRegionId — see core/WorldRegion.js's own header on why that
// field is informational only, never cascade-enforced.
export class RemoveWorldRegionCommand extends Command {
    constructor({ worldId, regionId, id, timestamp } = {}) {
        super({ id, timestamp });
        this._worldId = worldId;
        this._regionId = regionId;
        this._removedRegionJson = null;
    }

    get worldId() { return this._worldId; }
    get regionId() { return this._regionId; }
    get type() { return 'remove-world-region'; }

    // context: { world } — the live World this command applies to.
    // Returns the removed WorldRegion (or null if not found).
    execute(context) {
        this._assertWorldMatches(context);
        const region = context.world.getWorldRegion(this._regionId);
        if (!region) {
            throw new Error(
                `RemoveWorldRegionCommand: region ${this._regionId} not found`
            );
        }

        this._removedRegionJson = region.toJSON();
        context.world.removeWorldRegion(this._regionId);
        return region;
    }

    undo(context) {
        this._assertWorldMatches(context);
        if (!this._removedRegionJson) {
            throw new Error('RemoveWorldRegionCommand: cannot undo before execute() has run');
        }

        const snapshot = this._removedRegionJson;
        const restoredRegion = WorldRegion.fromJSON(snapshot);
        context.world.addWorldRegion(restoredRegion);
    }

    canUndo() {
        return this._removedRegionJson !== null;
    }

    describe() {
        return `Remove Region "${this._regionId}"`;
    }

    toJSON() {
        return {
            type: this.type,
            id: this._id,
            timestamp: this._timestamp.toISOString(),
            worldId: this._worldId,
            regionId: this._regionId,
            removedRegionJson: this._removedRegionJson
        };
    }

    static fromJSON(json) {
        const cmd = new RemoveWorldRegionCommand({
            worldId: json.worldId,
            regionId: json.regionId,
            id: json.id,
            timestamp: new Date(json.timestamp)
        });
        cmd._removedRegionJson = json.removedRegionJson || null;
        return cmd;
    }

    _assertWorldMatches(context) {
        if (context.world.id !== this._worldId) {
            throw new Error(
                `RemoveWorldRegionCommand: worldId mismatch (command targets ${this._worldId}, context has ${context.world.id})`
            );
        }
    }
}
