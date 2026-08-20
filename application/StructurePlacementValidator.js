import { SpatialBounds } from '../core/SpatialBounds.js';

// "Would this structure placement overlap anything already here?" — the
// structure-placement counterpart to core/PlacementValidator.js's
// exact-position brick check, one rung up, per the 0.2.90 design
// conversation: "Use the same spatial abstraction already used for
// building collision... initially, conservative bounds are perfectly
// reasonable."
//
// Deliberately AABB-only, translated by position and NOT rotated —
// exactly the simplification core/SpatialBounds.js's own header already
// established for whole-World bounds ("Rotation and scale are not
// applied to the bounds in V1"). A rotated structure's true footprint is
// smaller than its axis-aligned box in most orientations, so this is
// conservative (may refuse a placement a tighter oriented-bounding-box
// check would allow) rather than permissive — the same posture
// core/PlacementValidator.js already takes toward exact-cell brick
// collision. Real oriented/mesh-level collision is future work, not a
// gap introduced here.
//
// Lives in application/, not core/, because checking a NEW structure
// against EXISTING structure placements requires resolving other
// documents' content (application/StructureDocumentResolver.js) — an
// I/O-touching concern core/ never has. Checking against ordinary
// bricks needs nothing but the current World + BrickRegistry, exactly
// like core/PlacementValidator.js.
export class StructurePlacementValidator {
    // world: the CONTAINING World (core/World.js) the placement would
    //   join. registry: BrickRegistry, for existing bricks' real
    //   dimensions. resolver: StructureDocumentResolver, for other
    //   placements' own bounds. localBounds: the SpatialBounds of the
    //   structure being placed, in ITS OWN local space (typically
    //   SpatialBounds.fromWorld(resolver.resolve(documentId), registry)
    //   — computed once by the caller, not here, so a hover-preview
    //   loop doesn't re-resolve+re-derive it every frame).
    // position: the candidate position, local to `world`.
    // excludePlacementId: omit a placement from consideration against
    //   itself — unused today (0.2.90 never moves an existing
    //   placement) but kept for symmetry with core/SpatialOverlap.js's
    //   own detectSpatialOverlap(), and so 0.2.91's move/duplicate work
    //   doesn't need a second signature.
    canPlace(world, registry, resolver, { localBounds, position, excludePlacementId = null } = {}) {
        if (!localBounds || !position) {
            return false;
        }
        const targetBounds = localBounds.getGlobalBounds(position);

        for (const building of world.getBuildings()) {
            for (const brick of building.getBricks()) {
                const brickBounds = SpatialBounds.fromBricks([brick], registry);
                if (aabbOverlap(targetBounds, brickBounds)) {
                    return false;
                }
            }
        }

        for (const placement of world.getStructurePlacements()) {
            if (placement.id === excludePlacementId) {
                continue;
            }
            const placedWorld = resolver ? resolver.resolve(placement.documentId) : null;
            if (!placedWorld) {
                // Unresolvable placement (see StructureDocumentResolver's
                // own header) — nothing to collide with, same as it
                // contributing no bricks to the render.
                continue;
            }
            const otherBounds = SpatialBounds.fromWorld(placedWorld, registry).getGlobalBounds(placement.position);
            if (aabbOverlap(targetBounds, otherBounds)) {
                return false;
            }
        }

        return true;
    }
}

// Strict AABB intersection — two boxes that only touch along a face
// (min.x === max.x, etc.) do NOT count as overlapping, the same
// tolerance ordinary adjacent bricks already rely on everywhere else in
// this engine.
function aabbOverlap(a, b) {
    const aMin = a.min, aMax = a.max, bMin = b.min, bMax = b.max;
    return aMin.x < bMax.x && aMax.x > bMin.x
        && aMin.y < bMax.y && aMax.y > bMin.y
        && aMin.z < bMax.z && aMax.z > bMin.z;
}
