import { Command } from './Command.js';

// Immutable: describes what SHOULD happen (remove this brick from this
// building in this world), not what already happened. Mirrors
// PlaceBrickCommand's shape closely, as expected — placement and
// deletion are near-inverses. Also renderer-ignorant: execute() calls
// World.removeBrickFromBuilding() (which publishes BrickRemoved) and
// stops; WorldRenderer removes the mesh on its own, reacting to the
// event exactly as it does for every other BrickRemoved.
export class DeleteBrickCommand extends Command {
    constructor({ worldId, buildingId, brickId }) {
        super();
        this._worldId = worldId;
        this._buildingId = buildingId;
        this._brickId = brickId;
    }

    get worldId() {
        return this._worldId;
    }

    get buildingId() {
        return this._buildingId;
    }

    get brickId() {
        return this._brickId;
    }

    execute(context) {
        if (context.world.id !== this._worldId) {
            throw new Error(
                `DeleteBrickCommand: worldId mismatch (command targets ${this._worldId}, context has ${context.world.id})`
            );
        }
        context.world.removeBrickFromBuilding(this._buildingId, this._brickId);
    }

    toJSON() {
        return {
            worldId: this._worldId,
            buildingId: this._buildingId,
            brickId: this._brickId
        };
    }

    static fromJSON(json) {
        return new DeleteBrickCommand({
            worldId: json.worldId,
            buildingId: json.buildingId,
            brickId: json.brickId
        });
    }
}
