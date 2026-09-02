import { readFile } from 'node:fs/promises';
import {
    resolveAvatarVehicleInteractionTarget
} from '../core/AvatarVehicleInteractionTarget.js';
import { VEHICLE_INTERACTION_RADIUS } from '../core/AvatarVehicleProximity.js';
import { AvatarVehicleInteractionIntent } from '../core/AvatarVehicleInteractionIntent.js';
import { VehiclePresence } from '../core/VehiclePresence.js';
import { VehicleType } from '../core/VehicleType.js';

// 0.9.76 — Avatar-Vehicle Interaction Target Resolution,
// core/AvatarVehicleInteractionTarget.js.
//
//   Section A: no interaction — NONE always produces no target
//   Section B: no vehicles — MOUNT + empty list produces no target
//   Section C: a single nearby vehicle is targeted
//   Section D: nearby + distant — only the nearby vehicle participates
//   Section E: multiple nearby vehicles — nearest one wins
//   Section F: exact proximity boundary — inclusive, matching 0.9.73
//   Section G: Y is ignored entirely
//   Section H: equal-distance tie — deterministic id tie-break
//   Section I: input order independence — candidate array order never
//              changes the result
//   Section J: vehicle identity preservation — the real id, never a
//              synthesized one
//   Section K: no mutation of the vehicles array or its VehiclePresence
//              instances
//   Section L: defensive/malformed input
//   Section M: architectural regression — no mounting, no movement, no
//              rendering, no persistence; this file only ever resolves
//              a target, never establishes one
//
// Central architectural claim under test throughout: this file answers
// only "which vehicle, if any, does the current interaction request
// target" — never whether the mount succeeds, and it never stores its
// own answer anywhere. See docs/Roadmap.md, 0.9.76.

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

function bicycleAt(id, x, y, z) {
    return new VehiclePresence({ id, type: VehicleType.BICYCLE, position: { x, y, z } });
}

const { NONE, MOUNT } = AvatarVehicleInteractionIntent;

async function runTests() {
    // -------------------------------------------------------------
    // Section A — no interaction
    // -------------------------------------------------------------
    {
        const vehicles = [bicycleAt('vehicle:1:0,0', 0, 0, 0)];
        const result = resolveAvatarVehicleInteractionTarget({
            avatarPosition: { x: 0, y: 0, z: 0 }, vehicles, interactionIntent: NONE
        });
        assert(result.targetVehicleId === null, '1. NONE intent produces no target even with a vehicle right on top of the avatar');
    }
    {
        const vehicles = [bicycleAt('vehicle:1:0,0', 0, 0, 0)];
        const result = resolveAvatarVehicleInteractionTarget({
            avatarPosition: { x: 0, y: 0, z: 0 }, vehicles, interactionIntent: undefined
        });
        assert(result.targetVehicleId === null, '2. an unspecified interactionIntent produces no target');
    }

    // -------------------------------------------------------------
    // Section B — no vehicles
    // -------------------------------------------------------------
    {
        const result = resolveAvatarVehicleInteractionTarget({
            avatarPosition: { x: 0, y: 0, z: 0 }, vehicles: [], interactionIntent: MOUNT
        });
        assert(result.targetVehicleId === null, '3. MOUNT with an empty vehicle list produces no target');
    }

    // -------------------------------------------------------------
    // Section C — a single nearby vehicle
    // -------------------------------------------------------------
    {
        const vehicle = bicycleAt('vehicle:1:0,0', 0, 0, 0);
        const result = resolveAvatarVehicleInteractionTarget({
            avatarPosition: { x: 1, y: 0, z: 0 }, vehicles: [vehicle], interactionIntent: MOUNT
        });
        assert(result.targetVehicleId === 'vehicle:1:0,0', '4. a single vehicle within range is targeted by its own id');
    }
    {
        const result = resolveAvatarVehicleInteractionTarget({
            avatarPosition: { x: 0, y: 0, z: 0 }, vehicles: [], interactionIntent: MOUNT
        });
        assert(Object.keys(result).length === 1 && 'targetVehicleId' in result, '5. the result object has exactly one key, `targetVehicleId`');
    }

    // -------------------------------------------------------------
    // Section D — nearby + distant vehicles
    // -------------------------------------------------------------
    {
        const near = bicycleAt('vehicle:1:0,0', 0, 0, 0);
        const far = bicycleAt('vehicle:1:100,100', 100, 0, 100);
        const result = resolveAvatarVehicleInteractionTarget({
            avatarPosition: { x: 0.5, y: 0, z: 0 }, vehicles: [near, far], interactionIntent: MOUNT
        });
        assert(result.targetVehicleId === near.id, '6. only the nearby vehicle participates — the distant one is never targeted');
    }
    {
        const far = bicycleAt('vehicle:1:100,100', 100, 0, 100);
        const result = resolveAvatarVehicleInteractionTarget({
            avatarPosition: { x: 0, y: 0, z: 0 }, vehicles: [far], interactionIntent: MOUNT
        });
        assert(result.targetVehicleId === null, '7. a vehicle entirely out of range never becomes the target, even as the only candidate');
    }

    // -------------------------------------------------------------
    // Section E — multiple nearby vehicles: nearest wins
    // -------------------------------------------------------------
    {
        const closer = bicycleAt('vehicle:1:0,0', 0.5, 0, 0);
        const farther = bicycleAt('vehicle:1:1,0', 1, 0, 0);
        const result = resolveAvatarVehicleInteractionTarget({
            avatarPosition: { x: 0, y: 0, z: 0 }, vehicles: [closer, farther], interactionIntent: MOUNT
        });
        assert(result.targetVehicleId === closer.id, '8. among several eligible candidates, the nearest one wins');
    }
    {
        // Same as above, but the nearer candidate has the lexically
        // LARGER id — proving distance, not id order, decides the
        // non-tied case.
        const closer = bicycleAt('vehicle:zzz', 0.5, 0, 0);
        const farther = bicycleAt('vehicle:aaa', 1, 0, 0);
        const result = resolveAvatarVehicleInteractionTarget({
            avatarPosition: { x: 0, y: 0, z: 0 }, vehicles: [closer, farther], interactionIntent: MOUNT
        });
        assert(result.targetVehicleId === 'vehicle:zzz', '9. nearest-wins holds even when it does not also have the lexically smaller id');
    }

    // -------------------------------------------------------------
    // Section F — exact proximity boundary
    // -------------------------------------------------------------
    {
        const vehicle = bicycleAt('vehicle:1:0,0', VEHICLE_INTERACTION_RADIUS, 0, 0);
        const result = resolveAvatarVehicleInteractionTarget({
            avatarPosition: { x: 0, y: 0, z: 0 }, vehicles: [vehicle], interactionIntent: MOUNT
        });
        assert(result.targetVehicleId === vehicle.id, '10. a vehicle exactly at VEHICLE_INTERACTION_RADIUS is eligible (inclusive boundary, matching 0.9.73)');
    }
    {
        const vehicle = bicycleAt('vehicle:1:0,0', VEHICLE_INTERACTION_RADIUS + 0.001, 0, 0);
        const result = resolveAvatarVehicleInteractionTarget({
            avatarPosition: { x: 0, y: 0, z: 0 }, vehicles: [vehicle], interactionIntent: MOUNT
        });
        assert(result.targetVehicleId === null, '11. a vehicle just past VEHICLE_INTERACTION_RADIUS is not eligible');
    }

    // -------------------------------------------------------------
    // Section G — Y is ignored
    // -------------------------------------------------------------
    {
        const vehicle = bicycleAt('vehicle:1:0,0', 1, 900, 0);
        const result = resolveAvatarVehicleInteractionTarget({
            avatarPosition: { x: 0, y: 0, z: 0 }, vehicles: [vehicle], interactionIntent: MOUNT
        });
        assert(result.targetVehicleId === vehicle.id, '12. a vehicle at a wildly different Y (different terrain elevation) is still targeted — only X/Z matters');
    }
    {
        const low = bicycleAt('vehicle:1:low', 0.5, 0, 0);
        const high = bicycleAt('vehicle:1:high', 1, 500, 0);
        const result = resolveAvatarVehicleInteractionTarget({
            avatarPosition: { x: 0, y: 0, z: 0 }, vehicles: [low, high], interactionIntent: MOUNT
        });
        assert(result.targetVehicleId === low.id, '13. nearest-by-X/Z still wins when candidates sit at very different elevations');
    }

    // -------------------------------------------------------------
    // Section H — equal-distance tie: deterministic id tie-break
    // -------------------------------------------------------------
    {
        const a = bicycleAt('vehicle:1:aaa', 1, 0, 0);
        const b = bicycleAt('vehicle:1:bbb', -1, 0, 0);
        const result = resolveAvatarVehicleInteractionTarget({
            avatarPosition: { x: 0, y: 0, z: 0 }, vehicles: [a, b], interactionIntent: MOUNT
        });
        assert(result.targetVehicleId === 'vehicle:1:aaa', '14. an exact distance tie is broken by ascending lexical vehicle id order');
    }
    {
        const a = bicycleAt('vehicle:1:aaa', 1, 0, 0);
        const b = bicycleAt('vehicle:1:bbb', -1, 0, 0);
        const result = resolveAvatarVehicleInteractionTarget({
            avatarPosition: { x: 0, y: 0, z: 0 }, vehicles: [b, a], interactionIntent: MOUNT
        });
        assert(result.targetVehicleId === 'vehicle:1:aaa', '15. the tie-break winner is the same regardless of which tied candidate appears first in the array');
    }

    // -------------------------------------------------------------
    // Section I — input order independence
    // -------------------------------------------------------------
    {
        const a = bicycleAt('vehicle:1:a', 0.4, 0, 0);
        const b = bicycleAt('vehicle:1:b', 0.6, 0, 0);
        const c = bicycleAt('vehicle:1:c', 100, 0, 100);
        const avatarPosition = { x: 0, y: 0, z: 0 };
        const resultAbc = resolveAvatarVehicleInteractionTarget({ avatarPosition, vehicles: [a, b, c], interactionIntent: MOUNT });
        const resultCab = resolveAvatarVehicleInteractionTarget({ avatarPosition, vehicles: [c, a, b], interactionIntent: MOUNT });
        const resultBca = resolveAvatarVehicleInteractionTarget({ avatarPosition, vehicles: [b, c, a], interactionIntent: MOUNT });
        assert(resultAbc.targetVehicleId === a.id, '16. [a,b,c] resolves to the nearest, a');
        assert(resultCab.targetVehicleId === a.id, '17. [c,a,b] resolves to the same target, a');
        assert(resultBca.targetVehicleId === a.id, '18. [b,c,a] resolves to the same target, a — selection never depends on array order');
    }

    // -------------------------------------------------------------
    // Section J — vehicle identity preservation
    // -------------------------------------------------------------
    {
        const vehicle = bicycleAt('vehicle:7:12,8', 0.2, 0, 0);
        const result = resolveAvatarVehicleInteractionTarget({
            avatarPosition: { x: 0, y: 0, z: 0 }, vehicles: [vehicle], interactionIntent: MOUNT
        });
        assert(result.targetVehicleId === 'vehicle:7:12,8', '19. the resolver returns the vehicle\'s own real id verbatim, never a synthesized or transformed one');
    }

    // -------------------------------------------------------------
    // Section K — no mutation
    // -------------------------------------------------------------
    {
        const a = bicycleAt('vehicle:1:a', 0.5, 0, 0);
        const b = bicycleAt('vehicle:1:b', 100, 0, 100);
        const vehicles = [a, b];
        const snapshot = JSON.stringify(vehicles.map((v) => v.toJSON()));
        resolveAvatarVehicleInteractionTarget({ avatarPosition: { x: 0, y: 0, z: 0 }, vehicles, interactionIntent: MOUNT });
        assert(vehicles.length === 2, '20. the vehicles array is never mutated in length');
        assert(JSON.stringify(vehicles.map((v) => v.toJSON())) === snapshot, '21. no VehiclePresence in the array is mutated by resolution');
    }

    // -------------------------------------------------------------
    // Section L — defensive / malformed input
    // -------------------------------------------------------------
    {
        assertThrows(() => resolveAvatarVehicleInteractionTarget({ avatarPosition: null, vehicles: [], interactionIntent: MOUNT }), '22. a null avatarPosition throws');
        assertThrows(() => resolveAvatarVehicleInteractionTarget({ avatarPosition: { x: NaN, z: 0 }, vehicles: [], interactionIntent: MOUNT }), '23. a NaN avatarPosition.x throws');
        assertThrows(() => resolveAvatarVehicleInteractionTarget({ avatarPosition: { x: 0, z: 0 }, vehicles: 'not-an-array', interactionIntent: MOUNT }), '24. a non-array vehicles throws');
        assertThrows(() => resolveAvatarVehicleInteractionTarget({ avatarPosition: { x: 0, z: 0 }, vehicles: [{ x: 0, y: 0, z: 0 }], interactionIntent: MOUNT }), '25. a plain object standing in for a VehiclePresence throws');
        assertThrows(() => resolveAvatarVehicleInteractionTarget({}), '26. missing avatarPosition entirely throws rather than silently resolving');
    }
    {
        // An unrecognized interactionIntent string is simply treated as
        // "not MOUNT" — the same permissive-but-safe default as an
        // absent one, rather than throwing for a value this file itself
        // does not own the vocabulary of.
        const vehicle = bicycleAt('vehicle:1:0,0', 0, 0, 0);
        const result = resolveAvatarVehicleInteractionTarget({
            avatarPosition: { x: 0, y: 0, z: 0 }, vehicles: [vehicle], interactionIntent: 'dismount'
        });
        assert(result.targetVehicleId === null, '27. an interactionIntent other than MOUNT (even an unrecognized one) produces no target');
    }

    // -------------------------------------------------------------
    // Section M — architectural regression
    // -------------------------------------------------------------
    {
        const sourceUrl = new URL('../core/AvatarVehicleInteractionTarget.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');

        const forbidden = [
            'mount(', 'Mount(', 'dismount', 'Dismount', 'currentVehicle', 'targetedByAvatar',
            'AvatarPresence.prototype', '.targetVehicleId =',
            'keyboard', 'Keyboard', 'controller', 'Controller', 'gamepad', 'Gamepad',
            'THREE', 'from \'three\'', 'Renderer', 'render',
            'animation', 'Animation',
            'velocity', 'acceleration', 'mass', 'gravity',
            'Math.random', 'Date.now',
            'localStorage', 'StorageProvider', 'fetch(', 'WebSocket',
            'facing', 'direction', 'heading'
        ];
        for (const term of forbidden) {
            assert(!codeOnly.includes(term), `28. core/AvatarVehicleInteractionTarget.js's own code never references "${term}" — target resolution only, never mounting/persistence/input/rendering/movement/animation/randomness/clock/storage/direction`);
        }
    }
    {
        const exportsModule = await import('../core/AvatarVehicleInteractionTarget.js');
        const exportedNames = Object.keys(exportsModule).sort();
        assert(JSON.stringify(exportedNames) === JSON.stringify(['resolveAvatarVehicleInteractionTarget']),
            '29. core/AvatarVehicleInteractionTarget.js exports exactly resolveAvatarVehicleInteractionTarget — nothing else');
    }
    {
        // No new persistent field is added to VehiclePresence by this
        // milestone — its own export surface stays exactly what 0.9.74
        // left it as.
        const vehicle = bicycleAt('vehicle:1:0,0', 0.5, 0, 0);
        resolveAvatarVehicleInteractionTarget({
            avatarPosition: { x: 0, y: 0, z: 0 }, vehicles: [vehicle], interactionIntent: MOUNT
        });
        assert(!('targetedByAvatar' in vehicle), '30. resolving a target never adds a targetedByAvatar (or any other) field onto the VehiclePresence itself');
    }

    console.log('✅ All Avatar-Vehicle Interaction Target Resolution tests passed.');
}

await runTests();
