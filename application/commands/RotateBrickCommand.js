import { Command } from './Command.js';

// Undoable rotation in degrees. The domain stores degrees; the renderer
// converts to radians. deltaRotation is added to the current rotation.
export class RotateBrickCommand extends Command {
    constructor({ worldId, buildingId, brickId, deltaRotation }) {
        super();
        this._worldId = worldId;
        this._buildingId = buildingId;
        this._brickId = brickId;
        this._deltaRotation = deltaRotation;
        this._originalRotation = null;
    }

    get worldId() { return this._worldId; }
    get buildingId() { return this._buildingId; }
    get brickId() { return this._brickId; }

    execute(context) {
        this._assertWorldMatches(context);
        const building = context.world.getBuilding(this._buildingId);
        const brick = building ? building.findBrick(this._brickId) : null;
        if
