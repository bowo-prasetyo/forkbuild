import { Command } from './Command.js';

// Undoable rotation in degrees. The domain stores degrees; the renderer
// converts to radians at the Three.js boundary. deltaRotation is added
// to the current rotation (e.g. +90 or –90).
export class RotateBrickCommand extends Command {
    constructor({ worldId, buildingId, brickId, deltaRotation, id, timestamp } = {}) {
        super({ id, timestamp });
        this._worldId = worldId;
        this._buildingId = buildingId;
        this._brickId = brickId;
        this._deltaRotation = deltaRotation;
        this._originalRotation = null;
    }

    get worldId() { return this._worldId; }
    get buildingId() { return this._buildingId; }
    get brickId() { return this._brickId; }
    get type() { return 'rotate-brick'; }

    execute(context) {
        this._assertWorldMatches(context);
        const building = context.world.getBuilding(this._buildingId);
        const brick = building ? building.findBrick(this._brickId) : null;
        if (!brick) {
            throw new Error(
                `RotateBrickCommand: brick ${this._brickId} not found in building ${this._buildingId}`
            );
        }

        this._originalRotation = brick.rotation;
        const newRotation = brick.rotation + this._deltaRotation;
        context.world.updateBrick(this._buildingId, this._brickId, { rotation: newRotation });
    }

    undo(context) {
        this._assertWorldMatches(context);
        if (this._originalRotation === null) {
            throw new Error('RotateBrickCommand: cannot undo before execute() has run');
        }
        context.world.updateBrick(this._buildingId, this._brickId, { rotation: this._originalRotation });
    }

    canUndo() {
        return this._originalRotation !== null;
    }

    describe() {
        return 'Rotate Brick';
    }

    toJSON() {
        return {
            type: this.type,
            id: this._id,
            timestamp: this._timestamp.toISOString(),
            worldId: this._worldId,
            buildingId: this._buildingId,
            brickId: this._brickId,
            deltaRotation: this._deltaRotation,
            originalRotation: this._originalRotation
        };
    }

    static fromJSON(json, registry) {
        const cmd = new RotateBrickCommand({
            worldId: json.worldId,
            buildingId: json.buildingId,
            brickId: json.brickId,
            deltaRotation: json.deltaRotation,
            id: json.id,
            timestamp: new Date(json.timestamp)
        });
        cmd._originalRotation = json.originalRotation !== undefined ? json.originalRotation : null;
        return cmd;
    }

    _assertWorldMatches(context) {
        if (context.world.id !== this._worldId) {
            throw new Error(
                `RotateBrickCommand: worldId mismatch (command targets ${this._worldId}, context has ${context.world.id})`
            );
        }
    }
}
