import { readFile } from 'node:fs/promises';
import { deriveAvatarVehicleMount } from '../core/AvatarVehicleMountTransition.js';
import { AvatarVehicleMount, createAvatarVehicleMount } from '../core/AvatarVehicleMount.js';
import { AvatarVehicleInteractionIntent } from '../core/AvatarVehicleInteractionIntent.js';

// 0.9.78 — Avatar-Vehicle Mount Transition, core/AvatarVehicleMountTransition.js.
//
//   Section A: initial mounting — null + MOUNT + target -> a valid mount
//   Section B: no intent — NONE leaves the existing state unchanged
//   Section C: no target — MOUNT with no target leaves state unchanged
//   Section D: same-target idempotence
//   Section E: different-target protection (no silent vehicle switching)
//   Section F: exact identity preservation of the supplied target id
//   Section G: no VehiclePresence dependency — operates on the id only
//   Section H: purity — same inputs, same result
//   Section I: immutability — existing AvatarVehicleMount instances are
//              never mutated, and unchanged results are the same
//              reference, never a new look-alike instance
//   Section J: serialization compatibility — the result round-trips
//              through AvatarVehicleMount's own toJSON()/fromJSON()
//   Section K: defensive / malformed input
//   Section L: architectural regression — no proximity, target
//              resolution internals, vehicle placement, vehicle
//              movement, avatar movement, collision, physics,
//              rendering, animation, keyboard, persistence,
//              networking, camera, or terrain
//
// Central architectural claim under test throughout: this file decides
// only whether a MOUNT request, given a resolved target, transitions the
// avatar from unmounted to mounted on that target — mounting only, no
// dismounting, no vehicle switching, no movement changes. See
// docs/Roadmap.md, 0.9.78.

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

const { NONE, MOUNT } = AvatarVehicleInteractionIntent;

async function runTests() {
    // -------------------------------------------------------------
    // Section A — initial mounting
    // -------------------------------------------------------------
    {
        const result = deriveAvatarVehicleMount({
            currentMount: null, interactionIntent: MOUNT, targetVehicleId: 'vehicle:seed:12,8'
        });
        assert(result instanceof AvatarVehicleMount, '1. null + MOUNT + a target produces an AvatarVehicleMount instance');
        assert(result.vehicleId === 'vehicle:seed:12,8', '2. the produced mount carries the exact target vehicle id');
    }
    {
        // currentMount omitted entirely is treated as "not currently
        // mounted," the same as an explicit null — convenient at avatar
        // initialization, before any mount has ever been established.
        const result = deriveAvatarVehicleMount({ interactionIntent: MOUNT, targetVehicleId: 'vehicle:1:0,0' });
        assert(result instanceof AvatarVehicleMount, '3. an omitted currentMount is treated as unmounted');
        assert(result.vehicleId === 'vehicle:1:0,0', '4. ...and mounts onto the supplied target');
    }

    // -------------------------------------------------------------
    // Section B — no intent
    // -------------------------------------------------------------
    {
        const result = deriveAvatarVehicleMount({
            currentMount: null, interactionIntent: NONE, targetVehicleId: 'vehicle:1:0,0'
        });
        assert(result === null, '5. NONE intent leaves an unmounted avatar unmounted, even with a resolved target present');
    }
    {
        const existing = createAvatarVehicleMount('vehicle:1:0,0');
        const result = deriveAvatarVehicleMount({
            currentMount: existing, interactionIntent: NONE, targetVehicleId: 'vehicle:9:9,9'
        });
        assert(result === existing, '6. NONE intent leaves an already-mounted avatar\'s mount exactly as it was, regardless of any target');
    }

    // -------------------------------------------------------------
    // Section C — no target
    // -------------------------------------------------------------
    {
        const result = deriveAvatarVehicleMount({ currentMount: null, interactionIntent: MOUNT, targetVehicleId: null });
        assert(result === null, '7. MOUNT intent with no target leaves an unmounted avatar unmounted');
    }
    {
        const result = deriveAvatarVehicleMount({ currentMount: null, interactionIntent: MOUNT });
        assert(result === null, '8. an omitted targetVehicleId behaves exactly like an explicit null');
    }
    {
        const existing = createAvatarVehicleMount('vehicle:1:0,0');
        const result = deriveAvatarVehicleMount({ currentMount: existing, interactionIntent: MOUNT, targetVehicleId: null });
        assert(result === existing, '9. MOUNT intent with no target never clears an existing mount');
    }

    // -------------------------------------------------------------
    // Section D — same-target idempotence
    // -------------------------------------------------------------
    {
        const existing = createAvatarVehicleMount('vehicle:A');
        const result = deriveAvatarVehicleMount({ currentMount: existing, interactionIntent: MOUNT, targetVehicleId: 'vehicle:A' });
        assert(result === existing, '10. already mounted on A, targeting A again, remains the same mount — holding the interaction key down while mounted is harmless');
    }

    // -------------------------------------------------------------
    // Section E — different-target protection
    // -------------------------------------------------------------
    {
        const existing = createAvatarVehicleMount('vehicle:A');
        const result = deriveAvatarVehicleMount({ currentMount: existing, interactionIntent: MOUNT, targetVehicleId: 'vehicle:B' });
        assert(result === existing, '11. already mounted on A, a nearby different target B does not silently switch the avatar onto B');
        assert(result.vehicleId === 'vehicle:A', '12. the vehicleId remains A, never B');
    }

    // -------------------------------------------------------------
    // Section F — exact identity preservation
    // -------------------------------------------------------------
    {
        const id = 'vehicle:seed:-3,42';
        const result = deriveAvatarVehicleMount({ currentMount: null, interactionIntent: MOUNT, targetVehicleId: id });
        assert(result.vehicleId === id, '13. the target vehicle id is preserved exactly, never transformed or synthesized');
        assert(result.vehicleId === id && typeof result.vehicleId === 'string', '14. the preserved id is the same string value');
    }

    // -------------------------------------------------------------
    // Section G — no VehiclePresence dependency
    // -------------------------------------------------------------
    {
        // The function's own signature accepts only a plain vehicle id
        // string as targetVehicleId — there is no way to even attempt to
        // pass a VehiclePresence-shaped object through it meaningfully,
        // since a non-string, non-null targetVehicleId is rejected.
        const vehicleLikeObject = { id: 'vehicle:1:0,0', type: 'bicycle', position: { x: 0, y: 0, z: 0 } };
        assertThrows(
            () => deriveAvatarVehicleMount({ currentMount: null, interactionIntent: MOUNT, targetVehicleId: vehicleLikeObject }),
            '15. a VehiclePresence-shaped object as targetVehicleId is rejected — only a plain string id is accepted'
        );
    }

    // -------------------------------------------------------------
    // Section H — purity
    // -------------------------------------------------------------
    {
        const existing = createAvatarVehicleMount('vehicle:A');
        const inputs = { currentMount: existing, interactionIntent: MOUNT, targetVehicleId: 'vehicle:B' };
        const first = deriveAvatarVehicleMount(inputs);
        const second = deriveAvatarVehicleMount(inputs);
        assert(first === second, '16. the same inputs produce the exact same result on repeated calls');
    }
    {
        const first = deriveAvatarVehicleMount({ currentMount: null, interactionIntent: MOUNT, targetVehicleId: 'vehicle:1:0,0' });
        const second = deriveAvatarVehicleMount({ currentMount: null, interactionIntent: MOUNT, targetVehicleId: 'vehicle:1:0,0' });
        assert(first !== second, '17. two separate initial-mount calls produce distinct instances...');
        assert(first.vehicleId === second.vehicleId, '18. ...but agree on vehicleId, since neither call carries any hidden state');
    }

    // -------------------------------------------------------------
    // Section I — immutability
    // -------------------------------------------------------------
    {
        const existing = createAvatarVehicleMount('vehicle:A');
        const beforeJSON = existing.toJSON();
        deriveAvatarVehicleMount({ currentMount: existing, interactionIntent: MOUNT, targetVehicleId: 'vehicle:B' });
        deriveAvatarVehicleMount({ currentMount: existing, interactionIntent: NONE, targetVehicleId: null });
        assert(JSON.stringify(existing.toJSON()) === JSON.stringify(beforeJSON), '19. an existing AvatarVehicleMount instance is never mutated by any call, whatever the outcome');
        assert(Object.isFrozen(existing), '20. the existing instance remains frozen');
    }
    {
        const existing = createAvatarVehicleMount('vehicle:A');
        const result = deriveAvatarVehicleMount({ currentMount: existing, interactionIntent: MOUNT, targetVehicleId: 'vehicle:A' });
        assert(result === existing, '21. an unchanged result is the exact same reference, never a newly constructed look-alike instance');
    }

    // -------------------------------------------------------------
    // Section J — serialization compatibility
    // -------------------------------------------------------------
    {
        const result = deriveAvatarVehicleMount({ currentMount: null, interactionIntent: MOUNT, targetVehicleId: 'vehicle:seed:1,2' });
        const json = result.toJSON();
        const roundTripped = AvatarVehicleMount.fromJSON(json);
        assert(roundTripped.vehicleId === result.vehicleId, '22. the produced mount round-trips through AvatarVehicleMount\'s own toJSON()/fromJSON() unchanged');
    }

    // -------------------------------------------------------------
    // Section K — defensive / malformed input
    // -------------------------------------------------------------
    {
        assertThrows(() => deriveAvatarVehicleMount({ currentMount: 'vehicle:A', interactionIntent: MOUNT, targetVehicleId: 'vehicle:A' }), '23. a bare string currentMount is rejected — not null, not a real AvatarVehicleMount instance');
        assertThrows(() => deriveAvatarVehicleMount({ currentMount: { vehicleId: 'vehicle:A' }, interactionIntent: MOUNT, targetVehicleId: null }), '24. a plain object shaped like a mount is rejected as currentMount');
        assertThrows(() => deriveAvatarVehicleMount({ currentMount: false, interactionIntent: MOUNT }), '25. a boolean currentMount is rejected');
        assertThrows(() => deriveAvatarVehicleMount({ currentMount: null, interactionIntent: 'dismount', targetVehicleId: null }), '26. an unrecognized interactionIntent string is rejected outright, never silently treated as NONE');
        assertThrows(() => deriveAvatarVehicleMount({ currentMount: null, interactionIntent: undefined, targetVehicleId: null }), '27. a missing interactionIntent throws rather than silently defaulting');
        assertThrows(() => deriveAvatarVehicleMount({ currentMount: null, interactionIntent: MOUNT, targetVehicleId: '' }), '28. an empty-string targetVehicleId is rejected — it is neither null nor a real id');
        assertThrows(() => deriveAvatarVehicleMount({ currentMount: null, interactionIntent: MOUNT, targetVehicleId: 42 }), '29. a numeric targetVehicleId is rejected');
        assertThrows(() => deriveAvatarVehicleMount({}), '30. a call with no interactionIntent at all throws rather than silently resolving');
    }

    // -------------------------------------------------------------
    // Section L — architectural regression
    // -------------------------------------------------------------
    {
        const sourceUrl = new URL('../core/AvatarVehicleMountTransition.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');

        const forbidden = [
            'VehiclePresence', 'VehicleType', 'AvatarPresence',
            'AvatarVehicleProximity', 'withinRadiusXZ', 'VEHICLE_INTERACTION_RADIUS',
            'AvatarVehicleInteractionTarget', 'resolveAvatarVehicleInteractionTarget',
            'AvatarMovementController', 'AvatarMovementState', 'AvatarMovementSimulation',
            'VehiclePlacement', 'vehiclePresenceInRegion',
            'dismount', 'Dismount',
            'keyboard', 'Keyboard', 'controller', 'Controller', 'gamepad', 'Gamepad',
            'THREE', 'from \'three\'', 'Renderer', 'render',
            'animation', 'Animation', 'camera', 'Camera', 'terrain', 'Terrain',
            'velocity', 'acceleration', 'mass', 'gravity', 'collision', 'physics',
            'Math.random', 'Date.now',
            'localStorage', 'StorageProvider', 'fetch(', 'WebSocket'
        ];
        for (const term of forbidden) {
            assert(!codeOnly.includes(term), `31. core/AvatarVehicleMountTransition.js's own code never references "${term}" — a mount transition only, never proximity/target-resolution internals/vehicle placement/vehicle or avatar movement/dismounting/input/rendering/physics/persistence/networking/randomness/clock`);
        }
    }
    {
        const exportsModule = await import('../core/AvatarVehicleMountTransition.js');
        const exportedNames = Object.keys(exportsModule).sort();
        assert(JSON.stringify(exportedNames) === JSON.stringify(['deriveAvatarVehicleMount']),
            '32. core/AvatarVehicleMountTransition.js exports exactly deriveAvatarVehicleMount — nothing else');
    }
    {
        // Confirms this file truly does not re-derive proximity: a
        // target id that is syntactically well-formed but was never
        // actually validated against any position or radius is accepted
        // at face value, exactly as 0.9.76's own targetVehicleId output
        // would be trusted.
        const result = deriveAvatarVehicleMount({
            currentMount: null, interactionIntent: MOUNT, targetVehicleId: 'vehicle:not-really-checked:999,999'
        });
        assert(result.vehicleId === 'vehicle:not-really-checked:999,999', '33. targetVehicleId is trusted as-is, with no independent proximity recomputation');
    }

    console.log('✅ All Avatar-Vehicle Mount Transition tests passed.');
}

await runTests();
