import { WorldRegion } from '../../core/WorldRegion.js';
import { Position } from '../../core/Position.js';
import { RegionKind } from '../../core/RegionKind.js';
import { createId } from '../../core/createId.js';
import { Command } from './Command.js';

// 0.5.0 — World Regions & Decentralized Place Naming.
//
// Creates a new WorldRegion (a named area — center + radius) at the
// specified position. Mirrors application/commands/CreateWorldLandmarkCommand.js
// exactly: execute() creates the region's identity, it doesn't receive
// one, and mints its own id via createId() on first execute() since
// core/WorldRegion.js requires one explicitly.
//
// _executedRegionId tracks what was created for undo() correctness AND
// is included in toJSON(), the same "redo() must recreate the SAME
// identity" precedent CreateWorldLandmarkCommand#executedLandmarkId
// already established.
export class CreateWorldRegionCommand extends Command {
    constructor({
        worldId, authorIdentityId, name, description = '', kind = RegionKind.PLACE,
        position, radius, parentRegionId = null, id, timestamp
    } = {}) {
        super({ id, timestamp });
        this._worldId = worldId;
        this._authorIdentityId = authorIdentityId;
        this._name = name;
        this._description = description;
        this._kind = kind;
        this._position = position;
        this._radius = radius;
        this._parentRegionId = parentRegionId;
        this._executedRegionId = null;
    }

    get worldId() { return this._worldId; }
    get authorIdentityId() { return this._authorIdentityId; }
    get name() { return this._name; }
    get description() { return this._description; }
    get kind() { return this._kind; }
    get position() { return this._position; }
    get radius() { return this._radius; }
    get parentRegionId() { return this._parentRegionId; }
    get type() { return 'create-world-region'; }
    // The id of the region this command created — null until execute()
    // has run. Mirrors CreateWorldLandmarkCommand#executedLandmarkId.
    get executedRegionId() { return this._executedRegionId; }

    // context: { world } — the live World this command applies to.
    // Returns the created (or re-created on redo) WorldRegion.
    execute(context) {
        this._assertWorldMatches(context);
        const region = new WorldRegion({
            id: this._executedRegionId || createId(),
            worldId: this._worldId,
            authorIdentityId: this._authorIdentityId,
            name: this._name,
            description: this._description,
            kind: this._kind,
            position: this._position,
            radius: this._radius,
            parentRegionId: this._parentRegionId
        });
        context.world.addWorldRegion(region);
        this._executedRegionId = region.id;
        return region;
    }

    undo(context) {
        this._assertWorldMatches(context);
        if (!this._executedRegionId) {
            throw new Error('CreateWorldRegionCommand: cannot undo before execute() has run');
        }
        context.world.removeWorldRegion(this._executedRegionId);
    }

    canUndo() {
        return this._executedRegionId !== null;
    }

    describe() {
        return `Create Region "${this._name}"`;
    }

    toJSON() {
        return {
            type: this.type,
            id: this._id,
            timestamp: this._timestamp.toISOString(),
            worldId: this._worldId,
            authorIdentityId: this._authorIdentityId,
            name: this._name,
            description: this._description,
            kind: this._kind,
            position: this._position.toJSON(),
            radius: this._radius,
            parentRegionId: this._parentRegionId,
            executedRegionId: this._executedRegionId
        };
    }

    static fromJSON(json) {
        const cmd = new CreateWorldRegionCommand({
            worldId: json.worldId,
            authorIdentityId: json.authorIdentityId,
            name: json.name,
            description: json.description || '',
            kind: json.kind || RegionKind.PLACE,
            position: Position.fromJSON(json.position),
            radius: json.radius,
            parentRegionId: json.parentRegionId || null,
            id: json.id,
            timestamp: new Date(json.timestamp)
        });
        cmd._executedRegionId = json.executedRegionId || null;
        return cmd;
    }

    _assertWorldMatches(context) {
        if (context.world.id !== this._worldId) {
            throw new Error(
                `CreateWorldRegionCommand: worldId mismatch (command targets ${this._worldId}, context has ${context.world.id})`
            );
        }
    }
}
