import { Command } from './Command.js';
import { Position } from '../../core/Position.js';

// Undoable spatial translation. Remembers the original position so
// undo() can restore it exactly. delta is a plain {x,y,z} offset.
export class MoveBrickCommand extends Command {
    constructor({ worldId, buildingId, brickId, delta, id, timestamp } = {}) {
        super({ id, timestamp });
        this._worldId = worldId;
        this._buildingId = buildingId;
        this._brickId = brickId;
        this._delta = delta;
        this._originalPosition = null;
    }

    get worldId() { return this._worldId; }
    get buildingId() { return this._buildingId; }
    get brickId() { return this._brickId; }
    get type() { return 'move-brick'; }

    execute(context) {
        this._assertWorldMatches(context);
        const building = context.world.getBuilding(this._buildingId);
        const brick = building ? building.findBrick(this._brickId) : null;
        if (!brick) {
            throw new Error(
                `MoveBrickCommand: brick ${this._brickId} not found in building ${this._buildingId}`
            );
        }

        this._originalPosition = brick.position.clone();
        const newPos = new Position(
            brick.position.x + this._delta.x,
            brick.position.y + this._delta.y,
            brick.position.z + this._delta.z
        );
        context.world.updateBrick(this._buildingId, this._brickId, { position: newPos });
    }

    undo(context) {
        this._assertWorldMatches(context);
        if (!this._originalPosition) {
            throw new Error('MoveBrickCommand: cannot undo before execute() has run');
        }
        context.world.updateBrick(this._buildingId, this._brickId, { position: this._originalPosition });
    }

    canUndo() {
        return this._originalPosition !== null;
    }

    describe() {
        return 'Move Brick';
    }

    toJSON() {
        return {
            type: this.type,
            id: this._id,
            timestamp: this._timestamp.toISOString(),
            worldId: this._worldId,
            buildingId: this._buildingId,
            brickId: this._brickId,
            delta: this._delta,
            originalPosition: this._originalPosition ? this._originalPosition.toJSON() : null
        };
    }

    static fromJSON(json, registry) {
        const cmd = new MoveBrickCommand({
            worldId: json.worldId,
            buildingId: json.buildingId,
            brickId: json.brickId,
            delta: json.delta,
            id: json.id,
            timestamp: new Date(json.timestamp)
        });
        if (json.originalPosition) {
            cmd._originalPosition = Position.fromJSON(json.originalPosition);
        }
        return cmd;
    }

    _assertWorldMatches(context) {
        if (context.world.id !== this._worldId) {
            throw new Error(
                `MoveBrickCommand: worldId mismatch (command targets ${this._worldId}, context has ${context.world.id})`
            );
        }
    }
}
