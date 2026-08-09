import { SpatialEditingContext } from './spatial-state/SpatialEditingContext.js';
import { Position } from '../core/Position.js';

// Translates spatial editing intent into domain mutations.
// The UI calls this; it never touches Brick directly.
export class SpatialEditingService {
    constructor(session) {
        this._session = session;
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
                capabilities: { move: true, rotate: false, delete: true }
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
        const building = world.getBuilding(buildingId);
        const brick = building ? building.findBrick(brickId) : null;
        if (!brick) {
            return false;
        }

        const current = brick.position;
        const newPos = new Position(
            current.x + delta.x,
            current.y + delta.y,
            current.z + delta.z
        );

        world.updateBrick(buildingId, brickId, { position: newPos });
        return true;
    }

    deleteBrick(documentId, buildingId, brickId) {
        const document = this._session.getDocument(documentId);
        if (!document) {
            return false;
        }

        const world = document.world;
        world.removeBrickFromBuilding(buildingId, brickId);
        return true;
    }
}
