import { readFile } from 'node:fs/promises';
import { deriveAvatarVehicleDismountTransition } from '../core/AvatarVehicleDismountTransition.js';
import { AvatarVehicleMount, createAvatarVehicleMount } from '../core/AvatarVehicleMount.js';
import { AvatarVehicleDismountIntent } from '../core/AvatarVehicleDismountIntent.js';
import { Position } from '../core/Position.js';

// 0.9.82 — Avatar-Vehicle Dismount Transition, core/AvatarVehicleDismountTransition.js.
//
//   Section A: successful transition — mounted + DISMOUNT + clear destination -> dismounted
//   Section B: no transition — every way the rule's four conditions can fail
//   Section C: identity/reference semantics
//   Section D: repeated invocation — one-shot safety, no special case needed
//   Section E: defensive / malformed input
//   Section F: architectural regression — no clearance/destination
//              recalculation, no vehicle awareness, no movement,
//              collision, input, rendering, persistence, networking
//
// Central architectural claim under test throughout: this file decides
// only whether an already-mounted avatar, a DISMOUNT intent, an
// already-resolved dismount position, and an already-computed
// clearance verdict together justify the one `mounted -> unmounted`
// state change — it never recomputes clearance, never recomputes a
// destination, and never asks whether `currentMount` names the same
// vehicle the destination/clearance came from. See docs/Roadmap.md,
// 0.9.82.

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

const { NONE, DISMOUNT } = AvatarVehicleDismountIntent;
const CLEAR = { clear: true };
const BLOCKED = { clear: false };

async function runTests() {
    // -------------------------------------------------------------
    // Section A — successful transition
    // -------------------------------------------------------------
    {
        const mount = createAvatarVehicleMount('vehicle:seed:12,8');
        const currentPosition = new Position(3, 0, 4);
        const destination = new Position(4, 0, 4);
        const result = deriveAvatarVehicleDismountTransition({
            currentMount: mount, currentPosition, dismountIntent: DISMOUNT,
            dismountPosition: destination, destinationClearance: CLEAR
        });
        assert(result.mount === null, '1. mounted + DISMOUNT + clear destination -> mount becomes null');
        assert(result.position === destination, '2. position becomes the exact supplied destination, same reference');
    }
    {
        const mount = createAvatarVehicleMount('vehicle:A');
        const destination = new Position(0, 7.25, 0);
        const result = deriveAvatarVehicleDismountTransition({
            currentMount: mount, currentPosition: new Position(0, 0, 0), dismountIntent: DISMOUNT,
            dismountPosition: destination, destinationClearance: CLEAR
        });
        assert(result.position.y === 7.25, '3. Y is preserved exactly from the supplied destination, never overwritten');
    }
    {
        const mount = createAvatarVehicleMount('vehicle:A');
        const destination = new Position(1, 2, 3);
        const beforeJSON = destination.toJSON();
        deriveAvatarVehicleDismountTransition({
            currentMount: mount, currentPosition: new Position(9, 9, 9), dismountIntent: DISMOUNT,
            dismountPosition: destination, destinationClearance: CLEAR
        });
        assert(JSON.stringify(destination.toJSON()) === JSON.stringify(beforeJSON), '4. the destination object is never mutated');
    }

    // -------------------------------------------------------------
    // Section B — no transition
    // -------------------------------------------------------------
    {
        const currentPosition = new Position(1, 1, 1);
        const destination = new Position(2, 0, 2);
        const result = deriveAvatarVehicleDismountTransition({
            currentMount: null, currentPosition, dismountIntent: DISMOUNT,
            dismountPosition: destination, destinationClearance: CLEAR
        });
        assert(result.mount === null, '5. no mount at all -> remains unmounted (null)');
        assert(result.position === currentPosition, '6. ...and position is left exactly as it was, since nothing was mounted to dismount from');
    }
    {
        const mount = createAvatarVehicleMount('vehicle:A');
        const currentPosition = new Position(1, 1, 1);
        const destination = new Position(2, 0, 2);
        const result = deriveAvatarVehicleDismountTransition({
            currentMount: mount, currentPosition, dismountIntent: NONE,
            dismountPosition: destination, destinationClearance: CLEAR
        });
        assert(result.mount === mount, '7. NONE intent -> remains mounted');
        assert(result.position === currentPosition, '8. ...and position is unchanged');
    }
    {
        const mount = createAvatarVehicleMount('vehicle:A');
        const currentPosition = new Position(1, 1, 1);
        const result = deriveAvatarVehicleDismountTransition({
            currentMount: mount, currentPosition, dismountIntent: DISMOUNT,
            dismountPosition: null, destinationClearance: CLEAR
        });
        assert(result.mount === mount, '9. a missing (null) destination -> remains mounted, exactly 0.9.80\'s own honest "no destination known"');
    }
    {
        const mount = createAvatarVehicleMount('vehicle:A');
        const result = deriveAvatarVehicleDismountTransition({
            currentMount: mount, currentPosition: new Position(), dismountIntent: DISMOUNT,
            dismountPosition: new Position(1, 0, 1), destinationClearance: BLOCKED
        });
        assert(result.mount === mount, '10. { clear: false } -> remains mounted, the destination was judged unsafe');
    }
    {
        const mount = createAvatarVehicleMount('vehicle:A');
        const result = deriveAvatarVehicleDismountTransition({
            currentMount: mount, currentPosition: new Position(), dismountIntent: DISMOUNT,
            dismountPosition: new Position(1, 0, 1)
            // destinationClearance omitted entirely.
        });
        assert(result.mount === mount, '11. a missing clearance verdict -> remains mounted; clearance is never assumed');
    }

    // -------------------------------------------------------------
    // Section C — identity/reference semantics
    // -------------------------------------------------------------
    {
        const mount = createAvatarVehicleMount('vehicle:A');
        const result = deriveAvatarVehicleDismountTransition({
            currentMount: mount, currentPosition: new Position(), dismountIntent: NONE
        });
        assert(result.mount === mount, '12. an unchanged mount is the exact same reference, never a newly constructed look-alike');
    }
    {
        const currentPosition = new Position(5, 0, 5);
        const result = deriveAvatarVehicleDismountTransition({
            currentMount: null, currentPosition, dismountIntent: NONE
        });
        assert(result.position === currentPosition, '13. an unchanged position is the exact same reference, never a newly constructed look-alike');
    }
    {
        const mount = createAvatarVehicleMount('vehicle:A');
        const beforeJSON = mount.toJSON();
        deriveAvatarVehicleDismountTransition({
            currentMount: mount, currentPosition: new Position(), dismountIntent: DISMOUNT,
            dismountPosition: new Position(1, 0, 1), destinationClearance: CLEAR
        });
        assert(JSON.stringify(mount.toJSON()) === JSON.stringify(beforeJSON), '14. a successful transition never mutates the supplied currentMount instance');
        assert(Object.isFrozen(mount), '15. ...and it remains frozen');
    }
    {
        const mount = createAvatarVehicleMount('vehicle:A');
        const destination = Object.freeze(new Position(1, 0, 1));
        const result = deriveAvatarVehicleDismountTransition({
            currentMount: mount, currentPosition: new Position(), dismountIntent: DISMOUNT,
            dismountPosition: destination, destinationClearance: CLEAR
        });
        assert(result.position === destination, '16. a successful transition never mutates (or clones) the supplied destination');
    }

    // -------------------------------------------------------------
    // Section D — repeated invocation (one-shot safety)
    // -------------------------------------------------------------
    {
        const mount = createAvatarVehicleMount('vehicle:A');
        const destination = new Position(1, 0, 1);
        const first = deriveAvatarVehicleDismountTransition({
            currentMount: mount, currentPosition: new Position(), dismountIntent: DISMOUNT,
            dismountPosition: destination, destinationClearance: CLEAR
        });
        assert(first.mount === null, '17. setup: the first call dismounts');

        // Applying the exact same DISMOUNT intent/destination/clearance a
        // second time, now starting from the FIRST call's own result,
        // must not produce a second dismount — there is nothing left to
        // dismount from.
        const second = deriveAvatarVehicleDismountTransition({
            currentMount: first.mount, currentPosition: first.position, dismountIntent: DISMOUNT,
            dismountPosition: destination, destinationClearance: CLEAR
        });
        assert(second.mount === null, '18. a second call starting from an already-dismounted state stays unmounted');
        assert(second.position === first.position, '19. ...and the position from the first dismount is preserved exactly, never moved again');
    }

    // -------------------------------------------------------------
    // Section E — defensive / malformed input
    // -------------------------------------------------------------
    {
        assertThrows(
            () => deriveAvatarVehicleDismountTransition({ currentMount: 'vehicle:A', dismountIntent: NONE }),
            '20. a bare string currentMount is rejected — not null, not a real AvatarVehicleMount instance'
        );
        assertThrows(
            () => deriveAvatarVehicleDismountTransition({ currentMount: { vehicleId: 'vehicle:A' }, dismountIntent: NONE }),
            '21. a plain object shaped like a mount is rejected as currentMount'
        );
        assertThrows(
            () => deriveAvatarVehicleDismountTransition({ currentMount: null, currentPosition: { x: 0, y: 0, z: 0 }, dismountIntent: NONE }),
            '22. a plain {x,y,z} object is rejected as currentPosition — only a real Position instance is accepted'
        );
        assertThrows(
            () => deriveAvatarVehicleDismountTransition({ currentMount: null, dismountIntent: 'dismount-now' }),
            '23. an unrecognized dismountIntent string is rejected outright, never silently treated as NONE'
        );
        assertThrows(
            () => deriveAvatarVehicleDismountTransition({ currentMount: null, dismountIntent: undefined }),
            '24. a missing dismountIntent throws rather than silently defaulting'
        );
        assertThrows(
            () => deriveAvatarVehicleDismountTransition({
                currentMount: createAvatarVehicleMount('vehicle:A'), dismountIntent: DISMOUNT,
                dismountPosition: { x: 1, y: 0, z: 1 }, destinationClearance: CLEAR
            }),
            '25. a plain {x,y,z} object is rejected as dismountPosition — only a real Position instance (or null) is accepted'
        );
        assertThrows(
            () => deriveAvatarVehicleDismountTransition({
                currentMount: createAvatarVehicleMount('vehicle:A'), dismountIntent: DISMOUNT,
                dismountPosition: new Position(1, 0, 1), destinationClearance: 'clear'
            }),
            '26. a bare string destinationClearance is rejected — only null/undefined or a { clear: boolean } object is accepted'
        );
        assertThrows(
            () => deriveAvatarVehicleDismountTransition({
                currentMount: createAvatarVehicleMount('vehicle:A'), dismountIntent: DISMOUNT,
                dismountPosition: new Position(1, 0, 1), destinationClearance: { clear: 'yes' }
            }),
            '27. a destinationClearance whose clear field is not a real boolean is rejected'
        );
        assertThrows(() => deriveAvatarVehicleDismountTransition({}), '28. a call with no dismountIntent at all throws rather than silently resolving');
    }

    // -------------------------------------------------------------
    // Section F — architectural regression
    // -------------------------------------------------------------
    {
        const sourceUrl = new URL('../core/AvatarVehicleDismountTransition.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');

        const forbidden = [
            'VehiclePresence', 'VehicleType', 'VehiclePlacement', 'vehiclePresenceInRegion', 'VehicleIdentity', 'vehicleIdFor',
            'AvatarVehicleProximity', 'withinRadiusXZ', 'VEHICLE_INTERACTION_RADIUS',
            'AvatarVehicleInteractionTarget', 'resolveAvatarVehicleInteractionTarget', 'AvatarVehicleInteractionIntent',
            'AvatarVehicleMountTransition', 'deriveAvatarVehicleMount',
            'AvatarVehicleDismountPosition.js', 'resolveAvatarVehicleDismountPosition',
            'AvatarVehicleDismountClearance.js', 'isAvatarVehicleDismountPositionClear',
            'AvatarTreeCollision', 'avatarCollisionCircleAt', 'avatarTreeCollision(', 'TreeCollisionGeometry',
            'treeCollisionCandidatesForMovement', 'treeCollisionGeometryInRegion',
            'AvatarMovementController', 'AvatarMovementState', 'AvatarMovementSimulation', 'AvatarTreeMovement',
            'TerrainHeightField', 'terrainHeightAt', 'Terrain',
            'keyboard', 'Keyboard', 'controller', 'Controller', 'gamepad', 'Gamepad',
            'THREE', 'from \'three\'', 'Renderer', 'render',
            'animation', 'Animation', 'camera', 'Camera',
            'velocity', 'acceleration', 'mass', 'gravity', 'collision', 'physics',
            'Math.random', 'Date.now',
            'localStorage', 'StorageProvider', 'fetch(', 'WebSocket'
        ];
        for (const term of forbidden) {
            assert(!codeOnly.includes(term), `29. core/AvatarVehicleDismountTransition.js's own code never references "${term}" — a pure state transition only, never vehicle awareness/target-resolution/destination-or-clearance recalculation/movement/collision/input/rendering/persistence/networking/randomness/clock`);
        }
        assert(codeOnly.includes('isValidAvatarVehicleMount'), '30. this file does consume isValidAvatarVehicleMount() from core/AvatarVehicleMount.js — the existing validator, never a reimplementation');
        assert(codeOnly.includes('AvatarVehicleDismountIntent.DISMOUNT'), '31. this file does consume the existing AvatarVehicleDismountIntent vocabulary rather than a bare string literal');
    }
    {
        const exportsModule = await import('../core/AvatarVehicleDismountTransition.js');
        const exportedNames = Object.keys(exportsModule).sort();
        assert(
            JSON.stringify(exportedNames) === JSON.stringify(['deriveAvatarVehicleDismountTransition']),
            '32. core/AvatarVehicleDismountTransition.js exports exactly the one transition function — nothing else'
        );
    }
    {
        // Confirms this file truly does not re-derive clearance or the
        // destination: a destination/clearance pair that is internally
        // "impossible" (a destination far from any real vehicle,
        // clearance asserting it is safe anyway) is still trusted and
        // acted on at face value — exactly as a real caller's own
        // 0.9.80/0.9.81 output would be trusted.
        const mount = createAvatarVehicleMount('vehicle:A');
        const implausibleDestination = new Position(999999, 0, 999999);
        const result = deriveAvatarVehicleDismountTransition({
            currentMount: mount, currentPosition: new Position(), dismountIntent: DISMOUNT,
            dismountPosition: implausibleDestination, destinationClearance: CLEAR
        });
        assert(result.position === implausibleDestination, '33. destination and clearance are trusted as-is, with no independent recomputation of either');
    }
    {
        // Confirms this file never compares currentMount.vehicleId
        // against anything — a destination/clearance pair sourced from a
        // vehicle entirely unrelated to currentMount.vehicleId still
        // completes the transition, because that comparison is upstream's
        // job, not this file's.
        const mount = createAvatarVehicleMount('vehicle:the-one-mounted');
        const result = deriveAvatarVehicleDismountTransition({
            currentMount: mount, currentPosition: new Position(), dismountIntent: DISMOUNT,
            dismountPosition: new Position(1, 0, 1), destinationClearance: CLEAR
        });
        assert(result.mount === null, '34. this file never asks whether the destination/clearance actually belong to currentMount\'s own vehicle');
    }

    console.log('✅ All Avatar-Vehicle Dismount Transition tests passed.');
}

await runTests();
