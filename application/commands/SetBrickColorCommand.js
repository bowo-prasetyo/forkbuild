import { Command } from './Command.js';

// Undoable per-instance recolor — "Choose Your Brick Color." Mirrors
// RotateBrickCommand's own shape exactly: remembers the brick's previous
// color so undo() restores it precisely, one command per brick (a
// multi-brick recolor wraps several of these in a CompositeCommand, the
// same pattern EditorSession#deleteSelection() already uses for a
// multi-brick delete). color is an absolute 0xRRGGBB value, or null to
// clear the override and fall back to the brick's BrickDefinition color.
export class SetBrickColorCommand extends Command {
    constructor({ worldId, buildingId, brickId, color, id, timestamp } = {}) {
        super({ id, timestamp });
        this._worldId = worldId;
        this._buildingId = buildingId;
        this._brickId = brickId;
        this._color = color;
        this._originalColor = undefined;
    }

    get worldId() { return this._worldId; }
    get buildingId() { return this._buildingId; }
    get brickId() { return this._brickId; }
    get color() { return this._color; }
    get type() { return 'set-brick-color'; }

    execute(context) {
        this._assertWorldMatches(context);
        const building = context.world.getBuilding(this._buildingId);
        const brick = building ? building.findBrick(this._brickId) : null;
        if (!brick) {
            throw new Error(
                `SetBrickColorCommand: brick ${this._brickId} not found in building ${this._buildingId}`
            );
        }

        this._originalColor = brick.color;
        context.world.updateBrick(this._buildingId, this._brickId, { color: this._color });
    }

    undo(context) {
        this._assertWorldMatches(context);
        if (this._originalColor === undefined) {
            throw new Error('SetBrickColorCommand: cannot undo before execute() has run');
        }
        context.world.updateBrick(this._buildingId, this._brickId, { color: this._originalColor });
    }

    canUndo() {
        return this._originalColor !== undefined;
    }

    describe() {
        return 'Recolor Brick';
    }

    toJSON() {
        return {
            type: this.type,
            id: this._id,
            timestamp: this._timestamp.toISOString(),
            worldId: this._worldId,
            buildingId: this._buildingId,
            brickId: this._brickId,
            color: this._color,
            originalColor: this._originalColor !== undefined ? this._originalColor : null
        };
    }

    static fromJSON(json, registry) {
        const cmd = new SetBrickColorCommand({
            worldId: json.worldId,
            buildingId: json.buildingId,
            brickId: json.brickId,
            color: json.color,
            id: json.id,
            timestamp: new Date(json.timestamp)
        });
        cmd._originalColor = json.originalColor !== undefined ? json.originalColor : undefined;
        return cmd;
    }

    _assertWorldMatches(context) {
        if (context.world.id !== this._worldId) {
            throw new Error(
                `SetBrickColorCommand: worldId mismatch (command targets ${this._worldId}, context has ${context.world.id})`
            );
        }
    }
}
