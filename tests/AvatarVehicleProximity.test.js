import { readFile } from 'node:fs/promises';
import {
    avatarVehicleProximity, withinRadiusXZ, VEHICLE_INTERACTION_RADIUS
} from '../core/AvatarVehicleProximity.js';
import { AVATAR_COLLISION_RADIUS } from '../core/AvatarCollision.js';
import { VehiclePresence } from '../core/VehiclePresence.js';
import { VehicleType } from '../core/VehicleType.js';
import { Position } from '../core/Position.js';

// 0.9.73 — Avatar-Vehicle Proximity Detection, core/AvatarVehicleProximity.js.
//
//   Section A: basic proximity — far/within/exactly-at-range
//   Section B: X/Z-only behavior — Y is ignored entirely
//   Section C: determinism — same inputs always produce the same fact
//   Section D: multiple vehicles — evaluated independently, no selection
//   Section E: invalid input — defensive validation of malformed inputs
//   Section F: architectural regression — this file stays proximity-only,
//              never reaching into collision, mounting, input, rendering,
//              movement, randomness, or the clock
//
// Central architectural claim under test throughout: this file answers
// only "is this avatar within interaction range of this vehicle" — never
// whether they physically collide, which vehicle to prefer, or what
// happens next. See docs/Roadmap.md, 0.9.73.

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

function bicycleAt(x, y, z) {
    return new VehiclePresence({ type: VehicleType.BICYCLE, position: { x, y, z } });
}

async function runTests() {
    // -------------------------------------------------------------
    // Section A — basic proximity
    // -------------------------------------------------------------
    {
        const vehicle = bicycleAt(0, 0, 0);
        const farAway = { x: 500, y: 0, z: 500 };
        assert(avatarVehicleProximity(farAway, vehicle).withinRange === false, '1. an avatar far away is not within range');
    }
    {
        const vehicle = bicycleAt(0, 0, 0);
        const near = { x: 1, y: 0, z: 0 };
        assert(avatarVehicleProximity(near, vehicle).withinRange === true, '2. an avatar within VEHICLE_INTERACTION_RADIUS is within range');
    }
    {
        // Exactly at the boundary counts as within range — the same
        // inclusive-boundary convention already used by
        // core/AvatarTreeCollision.js#circlesIntersect().
        const vehicle = bicycleAt(0, 0, 0);
        const exactlyAtRange = { x: VEHICLE_INTERACTION_RADIUS, y: 0, z: 0 };
        assert(avatarVehicleProximity(exactlyAtRange, vehicle).withinRange === true, '3. an avatar exactly at VEHICLE_INTERACTION_RADIUS is within range (inclusive boundary)');
        const justPast = { x: VEHICLE_INTERACTION_RADIUS + 0.001, y: 0, z: 0 };
        assert(avatarVehicleProximity(justPast, vehicle).withinRange === false, '4. an avatar just past VEHICLE_INTERACTION_RADIUS is no longer within range');
    }
    {
        // The result carries only `withinRange` — no distance, no
        // direction, no nearest-point — matching this milestone's own
        // brief to prefer the boolean alone.
        const vehicle = bicycleAt(0, 0, 0);
        const result = avatarVehicleProximity({ x: 0, y: 0, z: 0 }, vehicle);
        assert(Object.keys(result).length === 1 && 'withinRange' in result, '5. the result object has exactly one key, `withinRange`');
    }

    // -------------------------------------------------------------
    // Section B — X/Z-only behavior
    // -------------------------------------------------------------
    {
        // Same X/Z, wildly different Y -> identical result. A bicycle's
        // Y is a terrain sample, not a meaningful interaction boundary.
        const vehicle = bicycleAt(10, 0, 10);
        const low = avatarVehicleProximity({ x: 11, y: 0, z: 10 }, vehicle);
        const high = avatarVehicleProximity({ x: 11, y: 250, z: 10 }, vehicle);
        assert(low.withinRange === true && high.withinRange === true, '6. same X/Z, different Y — both within range identically');

        const vehicleHighUp = bicycleAt(10, 900, 10);
        const avatarOnGround = avatarVehicleProximity({ x: 11, y: 0, z: 10 }, vehicleHighUp);
        assert(avatarOnGround.withinRange === true, '7. a vehicle with a very different Y from the avatar still registers as in range — only X/Z is compared');
    }
    {
        // Horizontal distance alone determines proximity: a purely
        // vertical separation of any size never affects the result.
        const vehicle = bicycleAt(0, 0, 0);
        const directlyAbove = avatarVehicleProximity({ x: 0, y: 1000, z: 0 }, vehicle);
        assert(directlyAbove.withinRange === true, '8. an avatar directly above the vehicle (identical X/Z) is within range regardless of vertical distance');
    }

    // -------------------------------------------------------------
    // Section C — determinism
    // -------------------------------------------------------------
    {
        const vehicle = bicycleAt(3, 0, -7);
        const avatarPosition = { x: 4, y: 0, z: -7 };
        const resultA = avatarVehicleProximity(avatarPosition, vehicle);
        const resultB = avatarVehicleProximity(avatarPosition, vehicle);
        assert(JSON.stringify(resultA) === JSON.stringify(resultB), '9. calling twice with identical inputs produces an identical result');

        const vehicleAgain = bicycleAt(3, 0, -7);
        const resultC = avatarVehicleProximity(avatarPosition, vehicleAgain);
        assert(JSON.stringify(resultA) === JSON.stringify(resultC), '10. a freshly-constructed VehiclePresence at the same position produces the same result as the original');
    }
    {
        // A real Position instance behaves identically to a plain
        // {x, y, z} object — this file duck-types the avatar position.
        const vehicle = bicycleAt(0, 0, 0);
        const plain = avatarVehicleProximity({ x: 1, y: 0, z: 0 }, vehicle);
        const positionInstance = avatarVehicleProximity(new Position(1, 0, 0), vehicle);
        assert(JSON.stringify(plain) === JSON.stringify(positionInstance), '11. a plain {x,y,z} object and an equivalent Position instance produce the same result');
    }

    // -------------------------------------------------------------
    // Section D — multiple vehicles, evaluated independently
    // -------------------------------------------------------------
    {
        const bicycleA = bicycleAt(0, 0, 0);
        const bicycleB = bicycleAt(100, 0, 100);
        const avatarNearA = { x: 0.5, y: 0, z: 0 };

        const resultA = avatarVehicleProximity(avatarNearA, bicycleA);
        const resultB = avatarVehicleProximity(avatarNearA, bicycleB);
        assert(resultA.withinRange === true, '12. avatar near bicycle A registers in range for bicycle A');
        assert(resultB.withinRange === false, '13. the SAME avatar position registers out of range for distant bicycle B — each call is independent');
    }
    {
        // Both vehicles in range simultaneously — this file never picks
        // one over the other; it is asked about each independently.
        const bicycleA = bicycleAt(0, 0, 0);
        const bicycleB = bicycleAt(1, 0, 0);
        const avatarBetween = { x: 0.5, y: 0, z: 0 };
        assert(avatarVehicleProximity(avatarBetween, bicycleA).withinRange === true, '14. avatar between two close vehicles is in range of vehicle A');
        assert(avatarVehicleProximity(avatarBetween, bicycleB).withinRange === true, '15. and independently in range of vehicle B — no selection occurs');
    }
    {
        // No "nearest vehicle" function exists on this module's surface.
        const module = await import('../core/AvatarVehicleProximity.js');
        assert(!('nearestVehicleToAvatar' in module), '16. no nearestVehicleToAvatar export exists — selection among candidates is deliberately not this milestone\'s job');
    }

    // -------------------------------------------------------------
    // Section E — invalid input, handled defensively
    // -------------------------------------------------------------
    {
        const vehicle = bicycleAt(0, 0, 0);
        assertThrows(() => avatarVehicleProximity(null, vehicle), '17. a null avatar position throws rather than silently producing a result');
        assertThrows(() => avatarVehicleProximity(undefined, vehicle), '18. an undefined avatar position throws');
        assertThrows(() => avatarVehicleProximity({ x: NaN, y: 0, z: 0 }, vehicle), '19. a NaN avatar x throws');
        assertThrows(() => avatarVehicleProximity({ x: 0, y: 0, z: Infinity }, vehicle), '20. a non-finite avatar z throws');
        assertThrows(() => avatarVehicleProximity({ y: 0, z: 0 }, vehicle), '21. a missing avatar x throws');
    }
    {
        // An absent or malformed vehicle is rejected just as strictly —
        // this file only ever operates on a real VehiclePresence, never
        // a loose {x,y,z} standing in for one.
        assertThrows(() => avatarVehicleProximity({ x: 0, y: 0, z: 0 }, null), '22. a null vehicle throws');
        assertThrows(() => avatarVehicleProximity({ x: 0, y: 0, z: 0 }, undefined), '23. an undefined vehicle throws');
        assertThrows(() => avatarVehicleProximity({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }), '24. a plain {x,y,z} object standing in for a VehiclePresence throws — it must be a real instance');
    }
    {
        assertThrows(() => withinRadiusXZ(null, { x: 0, z: 0 }, 1), '25. withinRadiusXZ throws on a malformed first point');
        assertThrows(() => withinRadiusXZ({ x: 0, z: 0 }, { x: NaN, z: 0 }, 1), '26. withinRadiusXZ throws on a malformed second point');
    }

    // -------------------------------------------------------------
    // Section F — architectural regression
    // -------------------------------------------------------------
    {
        const sourceUrl = new URL('../core/AvatarVehicleProximity.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');

        const forbidden = [
            'AvatarTreeCollision', 'TreeCollisionGeometry', 'circlesIntersect',
            'AvatarMovementConstraint', 'AvatarTerrainConstraint', 'AvatarMovementSimulation',
            'resolveHorizontalMovement', 'aabbsOverlap', 'brickAabb',
            'mount', 'Mount', 'dismount', 'Dismount', 'currentVehicle', 'rider', 'Rider', 'occupant',
            'keyboard', 'Keyboard', 'controller', 'Controller', 'gamepad', 'Gamepad',
            'THREE', 'from \'three\'', 'Renderer', 'render',
            'animation', 'Animation',
            'velocity', 'acceleration', 'mass', 'gravity',
            'Math.random', 'Date.now',
            'localStorage', 'StorageProvider', 'fetch(', 'WebSocket'
        ];
        for (const term of forbidden) {
            assert(!codeOnly.includes(term), `27. core/AvatarVehicleProximity.js's own code never references "${term}" — proximity-only, never collision/mounting/input/rendering/movement/animation/randomness/clock/storage`);
        }
        assert(codeOnly.includes('VEHICLE_INTERACTION_RADIUS'), '28. core/AvatarVehicleProximity.js does define its own VEHICLE_INTERACTION_RADIUS — the one constant this seam is built around');
    }
    {
        const exportsModule = await import('../core/AvatarVehicleProximity.js');
        const exportedNames = Object.keys(exportsModule).sort();
        assert(JSON.stringify(exportedNames) === JSON.stringify(['VEHICLE_INTERACTION_RADIUS', 'avatarVehicleProximity', 'withinRadiusXZ']),
            '29. core/AvatarVehicleProximity.js exports exactly VEHICLE_INTERACTION_RADIUS, avatarVehicleProximity, and withinRadiusXZ — nothing else');
    }
    {
        // A detected proximity fact is never itself used to move or
        // mutate anything — neither argument is touched by the call.
        const vehicle = bicycleAt(2, 0, 2);
        const avatarPosition = { x: 2.1, y: 0, z: 2 };
        const frozenSnapshot = JSON.stringify(vehicle.toJSON());
        avatarVehicleProximity(avatarPosition, vehicle);
        assert(JSON.stringify(vehicle.toJSON()) === frozenSnapshot, '30. calling avatarVehicleProximity never mutates the VehiclePresence it was given');
    }

    console.log('✅ All Avatar-Vehicle Proximity Detection tests passed.');
}

await runTests();
