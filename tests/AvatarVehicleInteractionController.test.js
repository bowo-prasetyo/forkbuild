import { AvatarVehicleInteractionController } from '../application/AvatarVehicleInteractionController.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';
import { vehiclePresenceInRegion } from '../core/VehiclePlacement.js';
import { Position } from '../core/Position.js';

// 0.9.83 — Avatar-Vehicle Mount/Dismount Runtime Integration,
// application/AvatarVehicleInteractionController.js.
//
//   Section A: Mount integration — a real, deterministically-placed
//              bicycle, approached and mounted through the entire chain
//   Section B: Dismount integration — the same avatar, dismounting to a
//              real, clear destination
//   Section C: Blocked dismount — a real, deterministically-placed
//              bicycle whose dismount destination overlaps a real tree
//   Section D: Held-key / key-repeat safety — the one bug this
//              milestone's own design had to specifically guard against
//   Section E: No vehicle nearby
//   Section F: architectural regression — no vehicle movement, no
//              coupling with AvatarMovementController, no persistent
//              vehicle registry
//
// Central architectural claim under test throughout: this controller
// adds NO mount/dismount policy of its own. It only connects the
// already-complete, already independently tested chain —
// core/AvatarVehicleInteractionIntent.js (0.9.75),
// core/AvatarVehicleInteractionTarget.js (0.9.76),
// core/AvatarVehicleMountTransition.js (0.9.78),
// core/AvatarVehicleDismountIntent.js (0.9.79),
// core/AvatarVehicleDismountPosition.js (0.9.80),
// core/AvatarVehicleDismountClearance.js (0.9.81), and
// core/AvatarVehicleDismountTransition.js (0.9.82) — to a real
// AvatarPresenceSession and a real, deterministic vehicle field. See
// docs/Roadmap.md, 0.9.83, for the full milestone story.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function buildAvatarPresenceSession(startPosition) {
    return new AvatarPresenceSession(
        { avatarId: 'tester-avatar', ownerIdentity: 'tester-owner' },
        { position: startPosition }
    );
}

// A real, deterministic seed under which this file already knows (by
// direct computation — see the milestone's own working notes) of two
// real bicycles: one whose dismount destination is clear, and one
// whose dismount destination overlaps a real tree. Neither fact is
// approximate — both are load-bearing, exact fixtures, the same
// "find a real deterministic tree" discipline
// tests/AvatarTreeCollisionIntegration.test.js already established,
// extended here to a real deterministic bicycle.
const SEED = 29;

// vehicle:29:-6,-1 — a real bicycle whose dismount destination
// (vehicle.x + 1, 0, vehicle.z) is clear of every real tree nearby.
const CLEAR_VEHICLE_ID = 'vehicle:29:-6,-1';
// vehicle:29:-4,-8 — a real bicycle whose dismount destination
// overlaps a real tree's own collision circle.
const BLOCKED_VEHICLE_ID = 'vehicle:29:-4,-8';

function findVehicle(id) {
    const vehicles = vehiclePresenceInRegion(SEED, -300, -300, 300, 300);
    const vehicle = vehicles.find((v) => v.id === id);
    if (!vehicle) {
        throw new Error(`Test fixture vehicle ${id} not found under seed ${SEED} — has core/VehiclePlacement.js changed?`);
    }
    return vehicle;
}

async function runTests() {
    const clearVehicle = findVehicle(CLEAR_VEHICLE_ID);
    const blockedVehicle = findVehicle(BLOCKED_VEHICLE_ID);

    // -------------------------------------------------------------
    // Section A — Mount integration
    // -------------------------------------------------------------
    {
        const startPosition = new Position(clearVehicle.position.x - 0.5, 0, clearVehicle.position.z);
        const avatarPresenceSession = buildAvatarPresenceSession(startPosition);
        const controller = new AvatarVehicleInteractionController(avatarPresenceSession, { seed: SEED });

        assert(controller.mount() === null, '1. a fresh controller starts unmounted');
        assert(controller.keyDown('e') === true, '2. the interaction key (E) is recognized and consumed');

        controller.tick();
        const mount = controller.mount();
        assert(mount !== null, '3. approaching a real, deterministic bicycle and pressing E mounts it');
        assert(mount.vehicleId === CLEAR_VEHICLE_ID, '4. the correct nearest vehicle is selected as the mount target');
        assert(
            avatarPresenceSession.current.position.x === startPosition.x
            && avatarPresenceSession.current.position.z === startPosition.z,
            '5. mounting never changes the avatar\'s own position'
        );

        // Holding the key (still down, no release) must never replace
        // an already-established mount — see this file's own header,
        // "held-key / key-repeat safety."
        controller.tick();
        controller.tick();
        assert(controller.mount() === mount, '6. holding E after a successful mount never replaces the existing mount — same object reference, not merely equal-looking');
    }
    {
        // An unrecognized key is never consumed, and never affects
        // mount state.
        const startPosition = new Position(clearVehicle.position.x - 0.5, 0, clearVehicle.position.z);
        const avatarPresenceSession = buildAvatarPresenceSession(startPosition);
        const controller = new AvatarVehicleInteractionController(avatarPresenceSession, { seed: SEED });
        assert(controller.keyDown('w') === false, '7. an unrelated key (W) is never recognized by this controller');
        controller.tick();
        assert(controller.mount() === null, '8. an unrelated key never mounts anything');
    }

    // -------------------------------------------------------------
    // Section B — Dismount integration
    // -------------------------------------------------------------
    {
        const startPosition = new Position(clearVehicle.position.x - 0.5, 0, clearVehicle.position.z);
        const avatarPresenceSession = buildAvatarPresenceSession(startPosition);
        const controller = new AvatarVehicleInteractionController(avatarPresenceSession, { seed: SEED });

        controller.keyDown('e');
        controller.tick();
        assert(controller.mount() !== null, '9. setup: mounted the real bicycle');

        // A genuine release + re-press — see Section D for why this
        // matters, and why merely continuing to hold the key would not
        // trigger the dismount at all.
        controller.keyUp('e');
        controller.keyDown('e');
        controller.tick();

        assert(controller.mount() === null, '10. pressing E again while mounted dismounts — mount becomes null');
        const finalPosition = avatarPresenceSession.current.position;
        assert(
            Math.abs(finalPosition.x - (clearVehicle.position.x + 1)) < 1e-9
            && finalPosition.y === 0
            && Math.abs(finalPosition.z - clearVehicle.position.z) < 1e-9,
            '11. the avatar moves to the exact resolved dismount destination (vehicle.x + 1, 0, vehicle.z)'
        );

        // The avatar can subsequently be moved normally — dismounting
        // leaves no residual state that would prevent an ordinary
        // presence update (e.g. AvatarMovementController's own tick()).
        const afterDismount = avatarPresenceSession.update({
            position: new Position(finalPosition.x + 2, 0, finalPosition.z),
            rotation: avatarPresenceSession.current.rotation,
            animation: avatarPresenceSession.current.animation
        });
        assert(afterDismount.position.x === finalPosition.x + 2, '12. the avatar walks normally after dismounting — nothing about this controller blocks an ordinary presence update');
    }

    // -------------------------------------------------------------
    // Section C — Blocked dismount: a real bicycle whose destination
    // overlaps a real, deterministic tree
    // -------------------------------------------------------------
    {
        const startPosition = new Position(blockedVehicle.position.x - 0.5, 0, blockedVehicle.position.z);
        const avatarPresenceSession = buildAvatarPresenceSession(startPosition);
        const controller = new AvatarVehicleInteractionController(avatarPresenceSession, { seed: SEED });

        controller.keyDown('e');
        controller.tick();
        const mount = controller.mount();
        assert(mount !== null && mount.vehicleId === BLOCKED_VEHICLE_ID, '13. setup: mounted the real bicycle whose dismount destination is blocked');

        controller.keyUp('e');
        controller.keyDown('e');
        controller.tick();

        assert(controller.mount() === mount, '14. a blocked destination leaves the avatar mounted — same mount object, unchanged');
        assert(
            avatarPresenceSession.current.position.x === startPosition.x
            && avatarPresenceSession.current.position.z === startPosition.z,
            '15. a blocked destination leaves the avatar\'s position completely unchanged'
        );

        // Continuing to hold E retries every tick (idempotent — the
        // real tree is not going anywhere) without ever throwing or
        // corrupting state.
        controller.tick();
        controller.tick();
        assert(controller.mount() === mount, '16. repeatedly retrying a blocked dismount stays a harmless no-op');
    }

    // -------------------------------------------------------------
    // Section D — Held-key / key-repeat safety: the mount<->dismount
    // ping-pong this controller's own design specifically guards
    // against (see application/AvatarVehicleInteractionController.js's
    // own header, "Why held state alone is not enough").
    // -------------------------------------------------------------
    {
        const startPosition = new Position(clearVehicle.position.x - 0.5, 0, clearVehicle.position.z);
        const avatarPresenceSession = buildAvatarPresenceSession(startPosition);
        const controller = new AvatarVehicleInteractionController(avatarPresenceSession, { seed: SEED });

        // Mount, then release + re-press once to arm a fresh dismount
        // request (mirroring Section B).
        controller.keyDown('e');
        controller.tick();
        assert(controller.mount() !== null, '17. setup: mounted');
        controller.keyUp('e');
        controller.keyDown('e');
        controller.tick();
        assert(controller.mount() === null, '18. setup: dismounted — the avatar now stands well within the same vehicle\'s own interaction radius');

        // The key is STILL physically held at this point (no keyUp was
        // called) — simulating a browser's own auto-repeat continuing
        // to fire keydown for the same physical press. Without the
        // consumed-key guard, this next tick would immediately remount
        // the vehicle the avatar just left.
        controller.tick();
        assert(controller.mount() === null, '19. FLAGSHIP: holding the SAME key press across a successful dismount never immediately remounts — the real bug this milestone\'s design guards against');
        controller.tick();
        controller.tick();
        assert(controller.mount() === null, '20. ...and stays that way for as long as the original press remains held');

        // A genuine release re-arms the controller: pressing again now
        // mounts the very same vehicle, since the avatar is standing
        // right next to it.
        controller.keyUp('e');
        controller.keyDown('e');
        controller.tick();
        assert(controller.mount() !== null && controller.mount().vehicleId === CLEAR_VEHICLE_ID, '21. releasing and pressing again genuinely re-arms the controller — the avatar can remount the same vehicle it just left');
    }

    // -------------------------------------------------------------
    // Section E — No vehicle nearby
    // -------------------------------------------------------------
    {
        const avatarPresenceSession = buildAvatarPresenceSession(new Position(0, 0, 0));
        const controller = new AvatarVehicleInteractionController(avatarPresenceSession, { seed: SEED });
        controller.keyDown('e');
        controller.tick();
        controller.tick();
        controller.tick();
        assert(controller.mount() === null, '22. pressing E with no vehicle anywhere nearby never mounts anything, however many ticks pass');
    }
    {
        // A controller with no avatarPresenceSession at all is a
        // harmless no-op, the same graceful-absence posture
        // application/AvatarMovementController.js#tick() already
        // establishes for a null avatarPresenceSession.
        const controller = new AvatarVehicleInteractionController(null, { seed: SEED });
        controller.keyDown('e');
        controller.tick();
        assert(controller.mount() === null, '23. a controller with no avatarPresenceSession never throws and never mounts anything');
    }

    // -------------------------------------------------------------
    // Section F — architectural regression
    // -------------------------------------------------------------
    {
        const { readFile } = await import('node:fs/promises');
        const sourceUrl = new URL('../application/AvatarVehicleInteractionController.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');

        assert(!codeOnly.includes('AvatarMovementController'),
            '24. application/AvatarVehicleInteractionController.js never imports or references AvatarMovementController — no movement coupling of any kind');
        assert(!/\bspeed\b/i.test(codeOnly),
            '25. application/AvatarVehicleInteractionController.js never mentions vehicle speed');
        const forbidden = ['THREE', 'from \'three\'', 'Renderer', 'Math.random', 'localStorage', 'fetch(', 'WebSocket', 'setTimeout', 'setInterval', 'requestAnimationFrame'];
        for (const term of forbidden) {
            assert(!codeOnly.includes(term), `26. application/AvatarVehicleInteractionController.js's own code never references "${term}" — no engine dependency, no persistence, no networking, no timers of its own`);
        }
        assert(codeOnly.includes('deriveAvatarVehicleInteractionIntent')
            && codeOnly.includes('resolveAvatarVehicleInteractionTarget')
            && codeOnly.includes('deriveAvatarVehicleMount')
            && codeOnly.includes('deriveAvatarVehicleDismountIntent')
            && codeOnly.includes('resolveAvatarVehicleDismountPosition')
            && codeOnly.includes('isAvatarVehicleDismountPositionClear')
            && codeOnly.includes('deriveAvatarVehicleDismountTransition'),
            '27. all seven already-complete 0.9.75-0.9.82 semantic entry points are actually consumed, never reimplemented');
    }

    console.log('✅ All Avatar-Vehicle Interaction Controller tests passed.');
}

await runTests();
