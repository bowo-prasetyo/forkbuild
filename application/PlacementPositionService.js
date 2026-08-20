import { Position } from '../core/Position.js';

// Shared placement logic used by both PlacementTool (EditorView) and
// SpatialPlacementService (WorldView). Calculates document-local positions
// from ground hits or brick surface hits, using actual brick dimensions.
export class PlacementPositionService {
    constructor(registry) {
        this._registry = registry;
    }

    calculateGround(worldPosition, definitionId, settings = {}) {
        const def = this._registry.get(definitionId);
        if (!def) return null;

        const snapEnabled = settings.gridSnapEnabled !== false;
        const snapSize = settings.gridSnapSize || 1;

        const snappedX = snapEnabled ? Math.round(worldPosition.x / snapSize) * snapSize : worldPosition.x;
        const snappedZ = snapEnabled ? Math.round(worldPosition.z / snapSize) * snapSize : worldPosition.z;
        const y = def.height / 2;

        return new Position(snappedX, y, snappedZ);
    }

    // 0.2.90 — the structure-placement counterpart to calculateGround()
    // above. A StructurePlacement has no BrickDefinition of its own (it
    // references a whole Document, not one registry entry), so there is
    // no `def.height / 2` to rest on — the placement's local Y stays
    // exactly 0, and the structure's own bricks keep whatever Y each
    // already has within the referenced Document's local space. This is
    // "the structure remains rigid" from the design conversation: the
    // WHOLE placement moves as one unit, never one brick nudged to meet
    // the ground while its neighbors don't. Terrain elevation is layered
    // on top of this at RENDER time only (renderer/WorldRenderer.js),
    // exactly like every other placement fact in this engine — see
    // docs/Principles.md, "Terrain Elevation Is A Rendering-Time Offset,
    // Never A Presence Or Placement Fact."
    calculateStructureGround(worldPosition, settings = {}) {
        const snapEnabled = settings.gridSnapEnabled !== false;
        const snapSize = settings.gridSnapSize || 1;

        const snappedX = snapEnabled ? Math.round(worldPosition.x / snapSize) * snapSize : worldPosition.x;
        const snappedZ = snapEnabled ? Math.round(worldPosition.z / snapSize) * snapSize : worldPosition.z;

        return new Position(snappedX, 0, snappedZ);
    }

    calculateStack(existingBrick, normal, definitionId, settings = {}) {
        const existingDef = this._registry.get(existingBrick.definitionId);
        const newDef = this._registry.get(definitionId);
        if (!existingDef || !newDef) return null;

        const snapEnabled = settings.gridSnapEnabled !== false;
        const snapSize = settings.gridSnapSize || 1;

        let dx = 0, dy = 0, dz = 0;

        if (Math.abs(normal.x) > 0.5) {
            dx = Math.sign(normal.x) * (existingDef.width / 2 + newDef.width / 2);
        } else if (Math.abs(normal.y) > 0.5) {
            dy = Math.sign(normal.y) * (existingDef.height / 2 + newDef.height / 2);
        } else if (Math.abs(normal.z) > 0.5) {
            dz = Math.sign(normal.z) * (existingDef.depth / 2 + newDef.depth / 2);
        }

        let newX = existingBrick.position.x + dx;
        let newY = existingBrick.position.y + dy;
        let newZ = existingBrick.position.z + dz;

        if (snapEnabled) {
            newX = Math.round(newX / snapSize) * snapSize;
            newZ = Math.round(newZ / snapSize) * snapSize;
            // Y is intentionally NOT snapped — exact dimensional stacking preserves
            // face-contact geometry (e.g. a 0.25-height plate on a 1.0-height cube).
        }

        return new Position(newX, newY, newZ);
    }
}
