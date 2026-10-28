import { SpatialBounds } from '../../core/world/SpatialBounds.js';
import { boxOfBricks } from '../../core/building/BrickResting.js';
import { TransformMath } from './TransformMath.js';

// "Would this structure placement overlap anything already here?" — the
// structure-placement counterpart to core/publication/PlacementValidator.js's
// exact-position brick check, one rung up, per the 0.2.90 design
// conversation: "Use the same spatial abstraction already used for
// building collision... initially, conservative bounds are perfectly
// reasonable."
//
// Deliberately AABB-only: boxes, but turned boxes. A build placed with a
// turn is checked by its turned box (placedWorldBounds() below), and the
// caller passes the turned box of what it is placing, so a long build
// turned a quarter is checked along its real length. For an angle that
// isn't a quarter turn the box is a little larger than the build, so the
// check stays conservative (may refuse a placement an oriented check would
// allow) rather than permissive — the same posture
// core/publication/PlacementValidator.js already takes toward exact-cell brick
// collision. Real oriented/mesh-level collision is future work.
//
// Lives in application/, not core/, because checking a NEW structure
// against EXISTING structure placements requires resolving other
// documents' content (application/editor/StructureDocumentResolver.js) — an
// I/O-touching concern core/ never has. Checking against ordinary
// bricks needs nothing but the current World + BrickRegistry, exactly
// like core/publication/PlacementValidator.js.
export class StructurePlacementValidator {
    // world: the CONTAINING World (core/document/World.js) the placement would
    //   join. registry: BrickRegistry, for existing bricks' real
    //   dimensions. resolver: StructureDocumentResolver, for other
    //   placements' own bounds. localBounds: the SpatialBounds of the
    //   structure being placed, in ITS OWN local space and with its turn
    //   (typically placedWorldBounds(resolver.resolve(documentId),
    //   registry, rotation) — computed by the caller, not here).
    // position: the candidate position, local to `world`.
    // excludePlacementId: omit a placement from consideration against
    //   itself — unused today (0.2.90 never moves an existing
    //   placement) but kept for symmetry with core/world/SpatialOverlap.js's
    //   own detectSpatialOverlap(), and so 0.2.91's move/duplicate work
    //   doesn't need a second signature.
    canPlace(world, registry, resolver, { localBounds, position, excludePlacementId = null } = {}) {
        if (!localBounds || !position) {
            return false;
        }
        const targetBounds = localBounds.getGlobalBounds(position);

        for (const building of world.getBuildings()) {
            for (const brick of building.getBricks()) {
                const brickBounds = brickBox(brick, registry);
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
            const otherBounds = placedWorldBounds(placedWorld, registry, placement.rotation).getGlobalBounds(placement.position);
            if (aabbOverlap(targetBounds, otherBounds)) {
                return false;
            }
        }

        return true;
    }
}

// A placed build's box in its own space, turned as WorldRenderer draws it
// (every brick turned round the placement's origin by `rotation`): the
// box round its bricks, each by its own turned footprint, then turned
// itself and boxed again. Exact for a quarter turn; for any other angle a
// little larger than the build, never smaller, so a check against it
// stays on the safe side. A build with no bricks has
// SpatialBounds.fromWorld()'s small default box (docs/reviews/
// EditorPlacementUX-2026-10-27.md, P2-12).
export function placedWorldBounds(world, registry, rotation = 0) {
    const bricks = [];
    for (const building of world.getBuildings()) bricks.push(...building.getBricks());
    const box = boxOfBricks(bricks, (id) => (registry ? registry.get(id) : null));
    if (!box) return SpatialBounds.fromWorld(world, registry);
    const turn = ((Number(rotation) || 0) % 360 + 360) % 360;
    if (turn === 0) {
        return new SpatialBounds({ min: { x: box.minX, y: box.minY, z: box.minZ }, max: { x: box.maxX, y: box.maxY, z: box.maxZ } });
    }
    const corners = [[box.minX, box.minZ], [box.maxX, box.minZ], [box.minX, box.maxZ], [box.maxX, box.maxZ]]
        .map(([x, z]) => TransformMath.rotatePointAroundPivotY({ x, y: 0, z }, { x: 0, y: 0, z: 0 }, turn));
    // Rounded so a quarter turn's sines and cosines land on the grid exactly.
    const tidy = (value) => Math.round(value * 1e9) / 1e9;
    return new SpatialBounds({
        min: { x: tidy(Math.min(...corners.map((c) => c.x))), y: box.minY, z: tidy(Math.min(...corners.map((c) => c.z))) },
        max: { x: tidy(Math.max(...corners.map((c) => c.x))), y: box.maxY, z: tidy(Math.max(...corners.map((c) => c.z))) }
    });
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

// A brick's box by its turned and tilted footprint (a 1x4 turned a quarter
// runs along z), as structures rest by (core/building/BrickResting.js).
function brickBox(brick, registry) {
    const box = boxOfBricks([brick], (id) => (registry ? registry.get(id) : null));
    return new SpatialBounds({ min: { x: box.minX, y: box.minY, z: box.minZ }, max: { x: box.maxX, y: box.maxY, z: box.maxZ } });
}
