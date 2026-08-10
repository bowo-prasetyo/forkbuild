import { SpatialEditingContext } from './spatial-state/SpatialEditingContext.js';
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
        if (!selection || selection.isEmpty) return SpatialEditingContext.empty();

        const document = this._session.getDocument(selection.documentId);
        if (!document) return SpatialEditingContext.empty();

        if (selection.type === 'brick') {
            return new SpatialEditingContext({
                type: selection.isSingle ? 'brick' : 'bricks',
                documentId: selection.documentId,
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

    moveBricks(documentId, items, delta) {
        const history = this._getHistory(documentId);
        if (!history || items.length === 0) return false;

        const composite = new CompositeCommand();
        for (const item of items) {
            composite.add(new MoveBrickCommand({
                worldId: history._context.world.id,
                buildingId: item.buildingId,
                brickId: item.brickId,
                delta
            }));
        }

        history.execute(composite);
        return true;
    }

    rotateBricks(documentId, items, deltaRotation) {
        const history = this._getHistory(documentId);
        if (!history || items.length === 0) return false;

        const composite = new CompositeCommand();
        for (const item of items) {
            composite.add(new RotateBrickCommand({
                worldId: history._context.world.id,
                buildingId: item.buildingId,
                brickId: item.brickId,
                deltaRotation
            }));
        }

        history.execute(composite);
        return true;
    }

    deleteBricks(documentId, items) {
        const history = this._getHistory(documentId);
        if (!history || items.length === 0) return false;

        const composite = new CompositeCommand();
        for (const item of items) {
            composite.add(new DeleteBrickCommand({
                worldId: history._context.world.id,
                buildingId: item.buildingId,
                brickId: item.brickId
            }));
        }

        history.execute(composite);
        return true;
    }

    _getHistory(documentId) {
        const doc = this._session.getDocument(documentId);
        return doc ? this._commandHistories.get(doc.world.id) : null;
    }
}
