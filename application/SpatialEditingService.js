import { SpatialEditingContext } from './spatial-state/SpatialEditingContext.js';
import { Position } from '../core/Position.js';
import { MoveBrickCommand } from './commands/MoveBrickCommand.js';
import { RotateBrickCommand } from './commands/RotateBrickCommand.js';
import { DeleteBrickCommand } from './commands/DeleteBrickCommand.js';

// Translates spatial editing intent into domain mutations via CommandHistory.
// The UI calls this; it never touches Brick directly.
export class SpatialEditingService {
    constructor(session, commandHistories) {
        this._session = session;
        this._commandHistories = commandHistories;
    }

    getEditingContext(selection) {
        if (!selection || selection.isEmpty) {
            return SpatialEditingContext.empty();
        }

        const document = this._session.getDocument(selection.documentId);
        if (!document) {
            return SpatialEditingContext.empty();
        }

        if (selection.type === 'brick') {
            return new SpatialEditingContext({
                type: 'brick',
                documentId: selection.documentId,
                buildingId: selection.buildingId,
                brickId: selection.brickId,
                capabilities: { move: true, rotate: true, delete: true }
            });
        }

        if (selection.type === 'ground') {
            return new SpatialEditingContext({
                type: 'ground',
                documentId: selection.documentId,
                capabilities: { place: true }
            });
        }

        return SpatialEditingContext.empty();
    }

    moveBrick(documentId, buildingId, brickId, delta) {
        const document = this._session.getDocument(documentId);
        if (!document) {
            return false;
        }

        const world = document.world;
        const history = this._commandHistories.get(world.id);
        if (!history) {
            return false;
        }

        const building = world.getBuilding(buildingId);
        const brick = building ? building.findBrick(brickId) : null;
        if (!brick) {
            return false;
        }

        const command = new MoveBrickCommand({
            worldId: world.id,
            buildingId,
            brickId,
            delta
        });
        history.execute(command);
        return true;
    }

    rotateBrick(documentId, buildingId, brickId, deltaRotation) {
        const document = this._session.getDocument(documentId);
        if (!document) {
            return false;
        }

        const world = document.world;
        const history = this._commandHistories.get(world.id);
        if (!history) {
            return false;
        }

        const building = world.getBuilding(buildingId);
        const brick = building ? building.findBrick(brickId) : null;
        if (!brick) {
            return false;
        }

        const command = new RotateBrickCommand({
            worldId: world.id,
            buildingId,
            brickId,
            deltaRotation
        });
        history.execute(command);
        return true;
    }

    deleteBrick(documentId, buildingId, brickId) {
        const document = this._session.getDocument(documentId);
        if (!document) {
            return false;
        }

        const world = document.world;
        const history = this._commandHistories.get(world.id);
        if (!history) {
            return false;
        }

        const command = new DeleteBrickCommand({
            worldId: world.id,
            buildingId,
            brickId
        });
        history.execute(command);
        return true;
    }
}
