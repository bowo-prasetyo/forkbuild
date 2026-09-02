import { readFile } from 'node:fs/promises';
import { isAvatarVehicleDismountPositionClear } from '../core/AvatarVehicleDismountClearance.js';
import { resolveAvatarVehicleDismountPosition } from '../core/AvatarVehicleDismountPosition.js';
import { treeCollisionCandidatesForMovement } from '../core/AvatarTreeCollisionQuery.js';
import { treeCollisionGeometryInRegion } from '../core/TreeCollisionGeometry.js';
import { AVATAR_COLLISION_RADIUS } from '../core/AvatarCollision.js';
import { DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { VehiclePresence } from '../core/VehiclePresence.js';
import { VehicleType } from '../core/VehicleType.js';
import { Position } from '../core/Position.js';

// 0.9.81 — Vehicle Dismount Destination Clearance, core/AvatarVehicleDismountClearance.js.
//
//   Section A: clear position — no nearby tree
//   Section B: tree collision — an overlapping tree blocks
//   Section C: exact contact — touching the combined boundary blocks
//   Section D: nearby but clear — a tree outside the combined radius never blocks
//   Section E: X/Z semantics — vertical separation never fakes a clear result
//   Section F: determinism — same position + same tree circles -> same result
//   Section G: no mutation — inputs are read, never written
//   Section H: unsupported vehicle types — 0.9.80's own null is never
//              handed in as if it were a real candidate
//   Section I: architectural regression — no mount transition, mutation,
//              dismount intent, vehicle awareness, second collision
//              system, input, rendering, animation, camera, persistence,
//              networking
//
// Central architectural claim under test throughout: this file answers
// only "is this ALREADY-RESOLVED position clear of the trees it is
// handed" — it never resolves a dismount position itself, never touches
// a vehicle or mount state, and never builds any collision geometry
// beyond composing core/AvatarTreeCollision.js's own existing
// avatarCollisionCircleAt()/avatarTreeCollision() primitives. See
// docs/Roadmap.md, 0.9.81.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function assertThrows(fn, message) {
    let threw = false;
    try {
        fn();
    } catch (err) {
        threw = true;
    }
    assert(threw, message);
}

// A synthetic tree circle, in exactly the frozen shape
// core/TreeCollisionGeometry.js#treeCollisionCircleFor() produces —
// deliberately independent of any real seed, so most sections here
// never need to depend on world generation to reason about a precise
// distance.
function treeCircleAt(x, z, radius) {
    return Object.freeze({
        kind: 'TREE',
        shape: 'CIRCLE',
        center: Object.freeze({ x, z }),
        radius
    });
}

async function runTests() {
    // -------------------------------------------------------------
    // Section A — clear position
    // -------------------------------------------------------------
    {
        const result = isAvatarVehicleDismountPositionClear({
            position: { x: 100, y: 0, z: 100 },
            treeCollisions: []
        });
        assert(result.clear === true, '1. no tree candidates at all -> clear');
    }
    {
        const result = isAvatarVehicleDismountPositionClear({
            position: { x: 0, y: 0, z: 0 },
            treeCollisions: [treeCircleAt(50, 50, 0.3)]
        });
        assert(result.clear === true, '2. a tree far from the position -> clear');
    }

    // -------------------------------------------------------------
    // Section B — tree collision
    // -------------------------------------------------------------
    {
        // The bicycle dismount destination itself: dead center on a tree.
        const result = isAvatarVehicleDismountPositionClear({
            position: { x: 10, y: 0, z: 10 },
            treeCollisions: [treeCircleAt(10, 10, 0.3)]
        });
        assert(result.clear === false, '3. a tree centered exactly on the position -> blocked');
    }
    {
        // Genuinely overlapping, but not centered.
        const result = isAvatarVehicleDismountPositionClear({
            position: { x: 0, y: 0, z: 0 },
            treeCollisions: [treeCircleAt(0.4, 0, 0.3)]
        });
        const combined = AVATAR_COLLISION_RADIUS + 0.3;
        assert(0.4 < combined, '4. setup: this tree genuinely overlaps the avatar circle at the position');
        assert(result.clear === false, '5. a tree overlapping the avatar circle at the position -> blocked');
    }
    {
        // A later tree in the array blocks even when an earlier one does not.
        const result = isAvatarVehicleDismountPositionClear({
            position: { x: 0, y: 0, z: 0 },
            treeCollisions: [treeCircleAt(500, 500, 0.3), treeCircleAt(0, 0, 0.3)]
        });
        assert(result.clear === false, '6. any single colliding tree in the array blocks, regardless of position in the array');
    }

    // -------------------------------------------------------------
    // Section C — exact contact
    // -------------------------------------------------------------
    {
        const treeRadius = 0.3;
        const combined = AVATAR_COLLISION_RADIUS + treeRadius;
        const result = isAvatarVehicleDismountPositionClear({
            position: { x: 0, y: 0, z: 0 },
            treeCollisions: [treeCircleAt(combined, 0, treeRadius)]
        });
        assert(result.clear === false, '7. a tree touching exactly at the combined radius -> blocked, not clear');
    }
    {
        // Just outside exact contact — the boundary is not accidentally
        // one-sided.
        const treeRadius = 0.3;
        const combined = AVATAR_COLLISION_RADIUS + treeRadius;
        const result = isAvatarVehicleDismountPositionClear({
            position: { x: 0, y: 0, z: 0 },
            treeCollisions: [treeCircleAt(combined + 0.01, 0, treeRadius)]
        });
        assert(result.clear === true, '8. a tree just past the combined radius -> clear');
    }

    // -------------------------------------------------------------
    // Section D — nearby but clear
    // -------------------------------------------------------------
    {
        const treeRadius = 0.3;
        const combined = AVATAR_COLLISION_RADIUS + treeRadius;
        const result = isAvatarVehicleDismountPositionClear({
            position: { x: 0, y: 0, z: 0 },
            treeCollisions: [treeCircleAt(combined + 0.5, 0, treeRadius)]
        });
        assert(result.clear === true, '9. a tree nearby, but outside the combined avatar/tree radius -> clear');
    }

    // -------------------------------------------------------------
    // Section E — X/Z semantics: vertical separation never fakes a
    // clear (or blocked) result, because this file never consults Y.
    // -------------------------------------------------------------
    {
        const result = isAvatarVehicleDismountPositionClear({
            position: { x: 10, y: 500, z: 10 },
            treeCollisions: [treeCircleAt(10, 10, 0.3)]
        });
        assert(result.clear === false, '10. a large Y on the position never turns a genuine horizontal overlap into a clear result');
    }
    {
        const result = isAvatarVehicleDismountPositionClear({
            position: { x: 10, y: -500, z: 10 },
            treeCollisions: [treeCircleAt(10, 10, 0.3)]
        });
        assert(result.clear === false, '11. ...nor does a large negative Y');
    }
    {
        // A position with no y at all is still judged purely on x/z.
        const result = isAvatarVehicleDismountPositionClear({
            position: { x: 10, z: 10 },
            treeCollisions: [treeCircleAt(10, 10, 0.3)]
        });
        assert(result.clear === false, '12. a position with no y field at all is still judged on x/z alone');
    }

    // -------------------------------------------------------------
    // Section F — determinism
    // -------------------------------------------------------------
    {
        const position = { x: 3, y: 1.5, z: -7 };
        const treeCollisions = [treeCircleAt(3.2, -7, 0.3)];
        const first = isAvatarVehicleDismountPositionClear({ position, treeCollisions });
        const second = isAvatarVehicleDismountPositionClear({ position, treeCollisions });
        assert(first.clear === second.clear, '13. the same position and the same tree circles always resolve to the same result');
    }
    {
        // Determinism against a REAL, seeded tree field — the same seed
        // and the same query always finds the same candidates, and this
        // file's own judgment of them is equally repeatable end to end.
        const wide = treeCollisionGeometryInRegion(DEFAULT_WORLD_SEED, -200, -200, 200, 200);
        const realTree = wide[0];
        const position = { x: realTree.center.x, y: 0, z: realTree.center.z };
        const treeCollisionsA = treeCollisionCandidatesForMovement({ seed: DEFAULT_WORLD_SEED, currentPosition: position, requestedPosition: position });
        const treeCollisionsB = treeCollisionCandidatesForMovement({ seed: DEFAULT_WORLD_SEED, currentPosition: position, requestedPosition: position });
        const resultA = isAvatarVehicleDismountPositionClear({ position, treeCollisions: treeCollisionsA });
        const resultB = isAvatarVehicleDismountPositionClear({ position, treeCollisions: treeCollisionsB });
        assert(resultA.clear === false, '14. setup: standing exactly at a real tree\'s own center is genuinely blocked');
        assert(resultA.clear === resultB.clear, '15. the same real-world seed and position resolve identically across two independent queries');
    }

    // -------------------------------------------------------------
    // Section G — no mutation
    // -------------------------------------------------------------
    {
        const position = Object.freeze({ x: 4, y: 0, z: 4 });
        const tree = treeCircleAt(4.2, 4, 0.3);
        const treeCollisions = Object.freeze([tree]);
        const positionBefore = JSON.stringify(position);
        const treeCollisionsBefore = JSON.stringify(treeCollisions);
        const result = isAvatarVehicleDismountPositionClear({ position, treeCollisions });
        assert(result.clear === false, '16. setup: this call does detect a collision, so mutation could plausibly have been tempting to add');
        assert(JSON.stringify(position) === positionBefore, '17. the position is never mutated');
        assert(JSON.stringify(treeCollisions) === treeCollisionsBefore, '18. the treeCollisions array and its entries are never mutated');
    }

    // -------------------------------------------------------------
    // Section H — unsupported vehicle types: 0.9.80's own null must
    // never be silently treated as a real candidate.
    // -------------------------------------------------------------
    {
        for (const type of [VehicleType.MOTORCYCLE, VehicleType.CAR, VehicleType.DRONE]) {
            const vehicle = new VehiclePresence({ id: 'vehicle:1:0,0', type, position: new Position(1, 1, 1) });
            const resolved = resolveAvatarVehicleDismountPosition(vehicle);
            assert(resolved === null, `19. setup: a ${type} vehicle still resolves to null under 0.9.80`);
            assertThrows(
                () => isAvatarVehicleDismountPositionClear({ position: resolved, treeCollisions: [] }),
                `20. handing this file a ${type} vehicle's own null candidate throws rather than inventing a destination to judge`
            );
        }
    }
    {
        assertThrows(() => isAvatarVehicleDismountPositionClear({ position: null, treeCollisions: [] }), '21. a null position is rejected outright');
        assertThrows(() => isAvatarVehicleDismountPositionClear({ position: undefined, treeCollisions: [] }), '22. an undefined position is rejected');
        assertThrows(() => isAvatarVehicleDismountPositionClear({ position: { x: 1, z: Number.NaN }, treeCollisions: [] }), '23. a non-finite coordinate is rejected');
        assertThrows(() => isAvatarVehicleDismountPositionClear({ position: { x: 0, z: 0 }, treeCollisions: null }), '24. a non-array treeCollisions is rejected');
        assertThrows(() => isAvatarVehicleDismountPositionClear({ position: { x: 0, z: 0 } }), '25. a missing treeCollisions is rejected');
        assertThrows(() => isAvatarVehicleDismountPositionClear(), '26. calling with no arguments at all is rejected, never defaulted to a clear result');
    }
    {
        // A genuine end-to-end composition: 0.9.80's own resolved bicycle
        // candidate, judged against a real, far-away patch of world
        // where no tree could plausibly interfere.
        const vehicle = new VehiclePresence({ id: 'vehicle:1:0,0', type: VehicleType.BICYCLE, position: new Position(1000, 3, 1000) });
        const destination = resolveAvatarVehicleDismountPosition(vehicle);
        const treeCollisions = treeCollisionCandidatesForMovement({ seed: DEFAULT_WORLD_SEED, currentPosition: destination, requestedPosition: destination });
        const result = isAvatarVehicleDismountPositionClear({ position: destination, treeCollisions });
        assert(result.clear === true, '27. a real bicycle\'s own 0.9.80 dismount destination, judged against the real trees around it, comes back clear when genuinely isolated');
    }

    // -------------------------------------------------------------
    // Section I — architectural regression
    // -------------------------------------------------------------
    {
        const sourceUrl = new URL('../core/AvatarVehicleDismountClearance.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');

        const forbidden = [
            'AvatarVehicleMount', 'clearAvatarVehicleMount', 'createAvatarVehicleMount', 'isValidAvatarVehicleMount',
            'AvatarVehicleMountTransition', 'deriveAvatarVehicleMount',
            'AvatarVehicleDismountIntent', 'deriveAvatarVehicleDismountIntent',
            'AvatarVehicleDismountPosition.js', 'resolveAvatarVehicleDismountPosition(',
            'AvatarVehicleInteractionIntent', 'AvatarVehicleInteractionTarget', 'resolveAvatarVehicleInteractionTarget',
            'AvatarVehicleProximity', 'withinRadiusXZ', 'VEHICLE_INTERACTION_RADIUS',
            'VehiclePresence', 'VehicleType', 'VehiclePlacement', 'vehiclePresenceInRegion', 'VehicleIdentity', 'vehicleIdFor',
            'treeCollisionCandidatesForMovement', 'treeCollisionGeometryInRegion', 'naturalFeaturesInRegion',
            'resolveAvatarTreeMovement',
            'TerrainHeightField', 'terrainHeightAt', 'TerrainEcology', 'ecologyZoneAt', 'Hydrology', 'isRiverAt',
            'QuadTree', 'RTree', 'HashGrid', 'SpatialIndex',
            'AvatarMovementController', 'AvatarMovementState', 'AvatarMovementSimulation',
            'keyboard', 'Keyboard', 'controller', 'Controller', 'gamepad', 'Gamepad',
            'THREE', 'from \'three\'', 'Renderer', 'render',
            'animation', 'Animation', 'camera', 'Camera',
            'velocity', 'acceleration', 'mass', 'gravity', 'physics',
            'Math.random', 'Date.now',
            'localStorage', 'StorageProvider', 'fetch(', 'WebSocket'
        ];
        for (const term of forbidden) {
            assert(!codeOnly.includes(term), `28. core/AvatarVehicleDismountClearance.js's own code never references "${term}" — a pure adapter over the existing avatar-tree collision detector only, never mount-state/dismount-intent/vehicle-lookup/a-second-collision-system/spatial-index/terrain-sampling/input/rendering/persistence/networking`);
        }
        assert(codeOnly.includes('avatarCollisionCircleAt'), '29. this file does consume avatarCollisionCircleAt() from core/AvatarTreeCollision.js — the existing avatar-circle primitive, never a reimplementation of it');
        assert(codeOnly.includes('avatarTreeCollision'), '30. this file does consume avatarTreeCollision() from core/AvatarTreeCollision.js — the existing detector, never a second circlesIntersect() of its own');
    }
    {
        const exportsModule = await import('../core/AvatarVehicleDismountClearance.js');
        const exportedNames = Object.keys(exportsModule).sort();
        assert(
            JSON.stringify(exportedNames) === JSON.stringify(['isAvatarVehicleDismountPositionClear']),
            '31. core/AvatarVehicleDismountClearance.js exports exactly the one predicate — nothing else'
        );
    }

    console.log('✅ All Vehicle Dismount Destination Clearance tests passed.');
}

await runTests();
