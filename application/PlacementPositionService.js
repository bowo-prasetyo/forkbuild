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

    // 0.9.611 — the structure-placement counterpart to calculateStack()
    // above. Generalizes the same per-axis half-extent math from a
    // BrickDefinition's width/height/depth to a SpatialBounds' size,
    // placing `movingBounds` flush against whichever horizontal face of
    // `anchorBounds` the normal points away from. anchorPosition/
    // anchorBounds describe the EXISTING, already-placed structure being
    // snapped against — this never changes anchorPosition, only computes
    // where the NEW structure should sit (see StructurePlacementTool's
    // own header: "snap the structure being placed, never the one it
    // snaps against").
    //
    // Matches calculateStructureGround()'s own "Y always 0, ground-plane
    // only" invariant: there is no structure-on-structure Y-stacking, so
    // a Y-dominant normal (the anchor's top or bottom face) resolves to
    // neither branch below and returns null — exactly like a missing
    // BrickDefinition does in calculateStack() above — leaving the
    // caller to fall back to calculateStructureGround(), mirroring
    // PlacementTool's own pickedBrick-first/ground-fallback shape.
    //
    // Unlike calculateStack(), the TOUCHING axis itself is left
    // unsnapped: a forked structure's footprint has no reason to sum to
    // a whole grid multiple, and rounding it back onto the grid would
    // reintroduce exactly the "adjacent structures can appear slightly
    // separated" gap this method exists to close (see
    // tests/StructureRelativeSnappingBoundaryAudit.test.js, assertions
    // 26-27). Only the carried-over axis is grid-snapped, matching
    // calculateStructureGround()'s existing behavior for that axis.
    calculateStructureStack(anchorPosition, anchorBounds, normal, movingBounds, settings = {}) {
        if (!anchorPosition || !anchorBounds || !normal || !movingBounds) {
            return null;
        }

        const snapEnabled = settings.gridSnapEnabled !== false;
        const snapSize = settings.gridSnapSize || 1;
        const anchorGlobal = anchorBounds.getGlobalBounds(anchorPosition);
        const movingMin = movingBounds.min;
        const movingMax = movingBounds.max;

        let x = anchorPosition.x;
        let z = anchorPosition.z;

        if (Math.abs(normal.x) > 0.5) {
            x = Math.sign(normal.x) > 0
                ? anchorGlobal.max.x - movingMin.x
                : anchorGlobal.min.x - movingMax.x;
            if (snapEnabled) z = Math.round(z / snapSize) * snapSize;
        } else if (Math.abs(normal.z) > 0.5) {
            z = Math.sign(normal.z) > 0
                ? anchorGlobal.max.z - movingMin.z
                : anchorGlobal.min.z - movingMax.z;
            if (snapEnabled) x = Math.round(x / snapSize) * snapSize;
        } else {
            return null;
        }

        return new Position(x, 0, z);
    }
}
