import { Command } from './Command.js';

// 0.5.0 — World Regions & Decentralized Place Naming.
//
// Updates an existing WorldRegion's name, description, kind, and/or
// radius. The regionId is stored at construction and never reassigned.
// Center and parentRegionId are deliberately not editable here — see
// core/World.js#updateWorldRegion()'s own comment: relocating or
// reparenting a region is remove + recreate, the same restraint
// UpdateWorldLandmarkCommand already takes with a landmark's position.
// _originalState tracks the prior values for undo() correctness.
export class UpdateWorldRegionCommand extends Command {
    constructor({ worldId, regionId, name, description, kind, radius, id, timestamp } = {}) {
        super({ id, timestamp });
        this._worldId = worldId;
        this._regionId = regionId;
        this._name = name;
        this._description = description;
        this._kind = kind;
        this._radius = radius;
        this._originalState = null;
    }

    get worldId() { return this._worldId; }
    get regionId() { return this._regionId; }
    get name() { return this._name; }
    get description() { return this._description; }
    get kind() { return this._kind; }
    get radius() { return this._radius; }
    get type() { return 'update-world-region'; }

    // context: { world } — the live World this command applies to.
    execute(context) {
        this._assertWorldMatches(context);
        const region = context.world.getWorldRegion(this._regionId);
        if (!region) {
            throw new Error(`UpdateWorldRegionCommand: region ${this._regionId} not found`);
        }

        // Capture original state for undo on first execution
        if (!this._originalState) {
            this._originalState = {
                name: region.name,
                description: region.description,
                kind: region.kind,
                radius: region.radius
            };
        }

        const updates = {};
        if (this._name !== undefined) {
            updates.name = this._name;
        }
        if (this._description !== undefined) {
            updates.description = this._description;
        }
        if (this._kind !== undefined) {
            updates.kind = this._kind;
        }
        if (this._radius !== undefined) {
            updates.radius = this._radius;
        }
        context.world.updateWorldRegion(this._regionId, updates);
        return region;
    }

    undo(context) {
        this._assertWorldMatches(context);
        if (!this._originalState) {
            throw new Error('UpdateWorldRegionCommand: cannot undo before execute() has run');
        }
        context.world.updateWorldRegion(this._regionId, this._originalState);
    }

    canUndo() {
        return this._originalState !== null;
    }

    describe() {
        return `Update Region "${this._name || this._regionId}"`;
    }

    toJSON() {
        return {
            type: this.type,
            id: this._id,
            timestamp: this._timestamp.toISOString(),
            worldId: this._worldId,
            regionId: this._regionId,
            name: this._name,
            description: this._description,
            kind: this._kind,
            radius: this._radius,
            originalState: this._originalState
        };
    }

    static fromJSON(json) {
        const cmd = new UpdateWorldRegionCommand({
            worldId: json.worldId,
            regionId: json.regionId,
            name: json.name,
            description: json.description,
            kind: json.kind,
            radius: json.radius,
            id: json.id,
            timestamp: new Date(json.timestamp)
        });
        cmd._originalState = json.originalState || null;
        return cmd;
    }

    _assertWorldMatches(context) {
        if (context.world.id !== this._worldId) {
            throw new Error(
                `UpdateWorldRegionCommand: worldId mismatch (command targets ${this._worldId}, context has ${context.world.id})`
            );
        }
    }
}
