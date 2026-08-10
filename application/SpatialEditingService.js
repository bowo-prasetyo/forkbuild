import { SpatialEditingContext } from './spatial-state/SpatialEditingContext.js';
import { Position } from '../core/Position.js';
import { MoveBrickCommand } from './commands/MoveBrickCommand.js';
import { RotateBrickCommand } from './commands/RotateBrickCommand.js';
import { DeleteBrickCommand } from './commands/DeleteBrickCommand.js';
import { CompositeCommand } from './commands/CompositeCommand.js';

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

        if (selection.type === 'brick' || selection.type === 'bricks') {
            return new SpatialEditingContext({
                type: selection.isSingle ? 'brick' : 'bricks',
                documentId: selection.documentId,
                buildingId: selection.buildingId,
                brickId: selection.brickId,
                items: selection.items,
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

    moveSelection(selection, delta) {
        return this._executeForSelection(selection, (world, item) => new MoveBrickCommand({
            worldId: world.id, buildingId: item.buildingId, brickId: item.brickId, delta
        }), `Move ${selection.items.length} Bricks`);
    }

    rotateSelection(selection, deltaRotation) {
        return this._executeForSelection(selection, (world, item) => new RotateBrickCommand({
            worldId: world.id, buildingId: item.buildingId, brickId: item.brickId, deltaRotation
        }), `Rotate ${selection.items.length} Bricks`);
    }

    deleteSelection(selection) {
        return this._executeForSelection(selection, (world, item) => new DeleteBrickCommand({
            worldId: world.id, buildingId: item.buildingId, brickId: item.brickId
        }), `Delete ${selection.items.length} Bricks`);
    }

    _executeForSelection(selection, createCommand, description) {
        if (!selection || selection.isEmpty || selection.type === 'ground') return false;
        const document = this._session.getDocument(selection.documentId);
        if (!document) return false;
        const world = document.world;
        const history = this._commandHistories.get(world.id);
        if (!history) return false;
        const commands = [];
        for (const item of selection.items) {
            const building = world.getBuilding(item.buildingId);
            if (!building || !building.findBrick(item.brickId)) return false;
            commands.push(createCommand(world, item));
        }
        if (commands.length === 0) return false;
        const command = commands.length === 1 ? commands[0] : commands.reduce((composite, child) => composite.add(child), new CompositeCommand({ description }));
        history.execute(command);
        return true;
    }

}
