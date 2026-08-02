import { Brick } from '../../core/Brick.js';
import { Position } from '../../core/Position.js';

// Immutable: describes what SHOULD happen, not what already happened.
// Deliberately holds no brickId — the command creates the Brick's
// identity when executed, it doesn't receive one. That's what makes a
// command serializable, replayable, and transmittable: until execute()
// runs, this is just plain data (worldId, buildingId, definitionId,
// position, rotation), not a live object graph.
//
// Completely ignorant of the renderer. Its job ends at
// World.addBrickToBuilding() (which publishes BrickAdded) — the renderer,
// preview system, selection system, and eventually networking all react
// to that event on their own. No collision checking here either; that's
// PlacementValidator's job, called by whoever constructs this command
// (PlacementTool), not by the command itself.
export class PlaceBrickCommand {
    constructor({ worldId, buildingId, definitionId, position, rotation = 0 }) {
        this._worldId = worldId;
        this._buildingId = buildingId;
        this._definitionId = definitionId;
        this._position = position;
        this._rotation = rotation;
    }

    get worldId() {
        return this._worldId;
    }

    get buildingId() {
        return this._buildingId;
    }

    get definitionId() {
        return this._definitionId;
    }

    get position() {
        return this._position;
    }

    get rotation() {
        return this._rotation;
    }

    // context: { world } — the live World this command applies to.
    // Resolving worldId -> a live World is the caller's job. Today there
    // is only ever one World per session, so that's trivial; a future
    // multi-world/multiplayer setup would resolve worldId through some
    // WorldRegistry before calling execute(). Returns the created Brick.
    execute(context) {
        if (context.world.id !== this._worldId) {
            throw new Error(
                `PlaceBrickCommand: worldId mismatch (command targets ${this._worldId}, context has ${context.world.id})`
            );
        }

        const brick = new Brick({
            definitionId: this._definitionId,
            position: this._position,
            rotation: this._rotation
        });
        context.world.addBrickToBuilding(this._buildingId, brick);
        return brick;
    }

    toJSON() {
        return {
            worldId: this._worldId,
            buildingId: this._buildingId,
            definitionId: this._definitionId,
            position: this._position.toJSON(),
            rotation: this._rotation
        };
    }

    static fromJSON(json) {
        return new PlaceBrickCommand({
            worldId: json.worldId,
            buildingId: json.buildingId,
            definitionId: json.definitionId,
            position: Position.fromJSON(json.position),
            rotation: json.rotation
        });
    }
}
