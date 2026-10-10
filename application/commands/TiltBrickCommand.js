import { Command } from './Command.js';
import { Position } from '../../core/Position.js';
import { normalizeTilt } from '../../core/BrickOrientation.js';
import { bricksMessage } from './HistoryDescription.js';

// Undoable tilt: lays one brick on another side (core/BrickOrientation.js).
// Carries the brick's new tilt and the position it rests at once tilted
// (EditorSession#tiltSelection() keeps its bottom where it was), both
// absolute, so every replica applying it gets the same brick. Remembers
// the old tilt and position for undo. A multi-brick tilt wraps several in a
// CompositeCommand, as recoloring does.
export class TiltBrickCommand extends Command {
    constructor({ worldId, buildingId, brickId, tilt, position, id, timestamp } = {}) {
        super({ id, timestamp });
        this._worldId = worldId;
        this._buildingId = buildingId;
        this._brickId = brickId;
        this._tilt = normalizeTilt(tilt);
        this._position = position;
        this._original = null;
    }

    get worldId() { return this._worldId; }
    get buildingId() { return this._buildingId; }
    get brickId() { return this._brickId; }
    get tilt() { return this._tilt; }
    get position() { return this._position; }
    get type() { return 'tilt-brick'; }

    execute(context) {
        this._assertWorldMatches(context);
        const building = context.world.getBuilding(this._buildingId);
        const brick = building ? building.findBrick(this._brickId) : null;
        if (!brick) {
            throw new Error(`TiltBrickCommand: brick ${this._brickId} not found in building ${this._buildingId}`);
        }
        this._original = { tilt: brick.tilt, position: brick.position.clone() };
        context.world.updateBrick(this._buildingId, this._brickId, { tilt: this._tilt, position: this._position.clone() });
    }

    undo(context) {
        this._assertWorldMatches(context);
        if (!this._original) {
            throw new Error('TiltBrickCommand: cannot undo before execute() has run');
        }
        context.world.updateBrick(this._buildingId, this._brickId, {
            tilt: this._original.tilt,
            position: this._original.position.clone()
        });
    }

    canUndo() {
        return this._original !== null;
    }

    describe() {
        return bricksMessage('history.tiltBricks', 1);
    }

    toJSON() {
        return {
            type: this.type,
            id: this._id,
            timestamp: this._timestamp.toISOString(),
            worldId: this._worldId,
            buildingId: this._buildingId,
            brickId: this._brickId,
            tilt: this._tilt,
            position: this._position.toJSON(),
            original: this._original
                ? { tilt: this._original.tilt, position: this._original.position.toJSON() }
                : null
        };
    }

    static fromJSON(json) {
        const command = new TiltBrickCommand({
            worldId: json.worldId,
            buildingId: json.buildingId,
            brickId: json.brickId,
            tilt: json.tilt,
            position: Position.fromJSON(json.position),
            id: json.id,
            timestamp: new Date(json.timestamp)
        });
        if (json.original) {
            command._original = { tilt: normalizeTilt(json.original.tilt), position: Position.fromJSON(json.original.position) };
        }
        return command;
    }

    _assertWorldMatches(context) {
        if (context.world.id !== this._worldId) {
            throw new Error(
                `TiltBrickCommand: worldId mismatch (command targets ${this._worldId}, context has ${context.world.id})`
            );
        }
    }
}
