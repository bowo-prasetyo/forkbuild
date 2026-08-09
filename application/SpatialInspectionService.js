import { SpatialInspectionState } from './spatial-state/SpatialInspectionState.js';

// Resolves SpatialSelectionState into domain metadata by reaching into
// the loaded Document/World model. Keeps all Three.js knowledge out
// of inspection — the UI sees only plain data.
export class SpatialInspectionService {
    constructor(session) {
        this._session = session;
    }

    inspect(selection) {
        if (!selection || selection.isEmpty) {
            return SpatialInspectionState.empty();
        }

        const document = this._session.getDocument(selection.documentId);
        if (!document) {
            return SpatialInspectionState.empty();
        }

        if (selection.type === 'brick') {
            return this._inspectBrick(document, selection);
        }

        if (selection.type === 'ground') {
            return this._inspectGround(document, selection);
        }

        return SpatialInspectionState.empty();
    }

    _inspectBrick(document, selection) {
        const world = document.world;
        const building = world.getBuilding(selection.buildingId);
        const brick = building ? building.findBrick(selection.brickId) : null;

        if (!brick) {
            return SpatialInspectionState.empty();
        }

        const data = {
            worldTitle: document.metadata.title || 'Untitled',
            worldAuthor: document.metadata.author || 'anonymous',
            worldId: world.id,
            buildingId: building.id,
            buildingBrickCount: building.getBricks().length,
            brickId: brick.id,
            brickType: brick.definitionId,
            position: brick.position,
            rotation: brick.rotation
        };

        return new SpatialInspectionState({
            type: 'brick',
            documentId: selection.documentId,
            buildingId: selection.buildingId,
            brickId: selection.brickId,
            data
        });
    }

    _inspectGround(document, selection) {
        const data = {
            worldTitle: document.metadata.title || 'Untitled',
            worldAuthor: document.metadata.author || 'anonymous',
            worldId: document.world.id,
            position: selection.position
        };

        return new SpatialInspectionState({
            type: 'ground',
            documentId: selection.documentId,
            data
        });
    }
}
