import { SpatialInspectionState } from './spatial-state/SpatialInspectionState.js';
import { Position } from '../core/Position.js';
import { terrainHeightAt, DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';

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

        if (selection.type === 'brick' || selection.type === 'bricks') {
            return this._inspectBrick(document, selection);
        }

        if (selection.type === 'ground') {
            return this._inspectGround(document, selection);
        }

        // 0.2.93 — World View Instance Inspection: a StructurePlacement,
        // selected whole (see SpatialSelectionState's own header). This
        // is the ENTIRE World View surface for a placed instance — no
        // sibling "editing context" branch exists for it the way brick
        // selection has one in SpatialEditingService, by design.
        if (selection.type === 'placement') {
            return this._inspectPlacement(document, selection);
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

        const layoutPos = this._session.getDocumentPosition(selection.documentId);
        const worldPos = new Position(
            brick.position.x + layoutPos.x,
            brick.position.y + layoutPos.y,
            brick.position.z + layoutPos.z
        );

        const data = {
            worldTitle: document.metadata.title || 'Untitled',
            worldAuthor: document.metadata.author || 'anonymous',
            worldId: world.id,
            buildingId: building.id,
            buildingBrickCount: building.getBricks().length,
            brickId: brick.id,
            brickType: brick.definitionId,
            localPosition: brick.position,
            worldPosition: worldPos,
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

    // 0.2.93 — resolves a `placement` selection into plain data for
    // ui/views/WorldView.js's read-only inspection panel: exactly what
    // application/EditorSession.js#getSelectedPlacementInfo() exposes to
    // the Editor's StructureInstancePanel, MINUS anything editable —
    // there is no numeric X/Z/rotation target here, because World View
    // inspection never mutates a placement (see this class's own
    // "READ WORLD vs EDIT WORLD" framing in docs/Principles.md).
    // `sourceTitle`/`sourceDocumentId` name the REFERENCED Document
    // (what "Edit Source" opens) — deliberately distinct field names
    // from `worldTitle`/`documentId` (the CONTAINING World this
    // placement sits inside), the same "don't blur the concepts"
    // separation ui/views/WorldView.js's own placementInfo/documentInfo
    // split already established for a different pair of concepts.
    _inspectPlacement(document, selection) {
        const world = document.world;
        const placement = world.getStructurePlacement(selection.placementId);
        if (!placement) {
            return SpatialInspectionState.empty();
        }

        const layoutPos = this._session.getDocumentPosition(selection.documentId);
        const worldPosition = new Position(
            placement.position.x + layoutPos.x,
            placement.position.y + layoutPos.y,
            placement.position.z + layoutPos.z
        );
        // Sampled at the CONTAINING document's own world offset, never
        // the placement's own local x/z — mirrors exactly what
        // renderer/WorldRenderer.js#_renderStructurePlacement() actually
        // draws (one groundY per document, applied to every brick/
        // placement inside it as a single rigid lift), so this reads
        // what the user is actually looking at, not a value computed a
        // different way than the render.
        const groundY = terrainHeightAt(DEFAULT_WORLD_SEED, layoutPos.x, layoutPos.z);

        const data = {
            worldTitle: document.metadata.title || 'Untitled',
            worldAuthor: document.metadata.author || 'anonymous',
            worldId: world.id,
            placementId: placement.id,
            sourceDocumentId: placement.documentId,
            sourceTitle: this._session.getSavedDocumentTitle(placement.documentId),
            localPosition: placement.position,
            worldPosition,
            rotation: placement.rotation,
            groundY
        };

        return new SpatialInspectionState({
            type: 'placement',
            documentId: selection.documentId,
            placementId: selection.placementId,
            data
        });
    }

    _inspectGround(document, selection) {
        const data = {
            worldTitle: document.metadata.title || 'Untitled',
            worldAuthor: document.metadata.author || 'anonymous',
            worldId: document.world.id,
            position: selection.position // already world-space from pickGround
        };

        return new SpatialInspectionState({
            type: 'ground',
            documentId: selection.documentId,
            data
        });
    }
}
