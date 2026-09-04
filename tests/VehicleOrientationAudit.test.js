import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { resolveVehicleHeadingFromMovement } from '../core/VehicleMovementHeading.js';
import { VehicleInstance, vehicleInstanceFromPresence } from '../core/VehicleInstance.js';
import { VehicleType } from '../core/VehicleType.js';
import { VehiclePresence } from '../core/VehiclePresence.js';
import { VehicleRuntimeInstances } from '../application/VehicleRuntimeInstances.js';
import { AvatarVehicleMovementController, isMovableVehicleType } from '../application/AvatarVehicleMovementController.js';
import { AvatarMovementConstraint } from '../application/AvatarMovementConstraint.js';
import { resolveAvatarVehicleMovementCapability } from '../core/AvatarVehicleMovementCapability.js';
import { DEFAULT_WORLD_SEED, terrainHeightAt } from '../core/TerrainHeightField.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { createAvatarVehicleMount } from '../core/AvatarVehicleMount.js';
import { VehicleRenderer } from '../renderer/VehicleRenderer.js';
import { VehicleVisual } from '../renderer/VehicleVisual.js';
import { VehicleFieldRenderer } from '../renderer/VehicleFieldRenderer.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { AvatarProfileUseCase } from '../application/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';

// 0.9.124 — Vehicle Orientation Audit.
//
// 0.9.123 (core/VehicleMovementHeading.js, core/VehicleInstance.js,
// application/VehicleRuntimeInstances.js, application/AvatarVehicleMovementController.js,
// renderer/VehicleVisual.js, renderer/VehicleFieldRenderer.js) gave a
// mounted vehicle a second runtime fact, `heading`, alongside `position`.
// This milestone is the audit 0.9.118/0.9.120 already established as this
// vehicle line's own rhythm — a follow-up milestone that locks a freshly
// opened seam down as a regression suite, with NO production code
// changes — applied to this one. The invariant under test throughout:
//
//   A vehicle's heading represents the direction of its realized
//   horizontal displacement during the latest successful movement,
//   and nothing else.
//
//       movement intent
//             |
//             v
//       vehicle movement simulation
//             |
//             v
//       collision constraints
//             |
//             v
//       realized final position
//             |
//       +-----+------------------------+
//       |                              |
//   no horizontal displacement    horizontal displacement
//       |                              |
//   heading unchanged              resolve heading
//                                      |
//                                      v
//                                VehicleInstance
//                                      |
//                                      v
//                                VehicleVisual
//
// Steering does not appear anywhere in that chain — this milestone is
// also a REGRESSION GUARD against 0.9.125 (Vehicle Steering Intent, the
// recommended next milestone) accidentally landing inside this one's own
// files instead of as the new, independent seam it is meant to be.
//
//   Section A: core heading semantics — the pure function, cardinal/
//              diagonal/arbitrary directions, finiteness, [0,360) range
//   Section B: FLAGSHIP — realized movement vs. requested movement:
//              reversing while facing forward, a collision-clipped
//              diagonal, and a fully-absorbed step, all proving heading
//              tracks the REALIZED (dx, dz), never steering/intent
//   Section C: blocked and idle behavior — heading survives repeated
//              blocked/idle ticks, never resets to 0
//   Section D: runtime-store authority — VehicleRuntimeInstances#setHeading()
//   Section E: immutability boundary — withPosition()/withHeading() never
//              couple, repeated interleaving never leaks state, frozen
//   Section F: rendering semantics — VehicleVisual observes heading, it
//              never computes one; stable Object3D across heading changes
//   Section G: FLAGSHIP — cross-pipeline: spawn, mount, ride one
//              direction, turn and ride another, then a real collision
//              block, through one continuous real session
//   Section H: structural exclusion audit — no steering input, steering
//              angle, angular velocity, turn rate, turning radius, wheel
//              rotation, oriented collision, vehicle physics, avatar
//              rotationY synchronization, persistence, or multiplayer
//              synchronization anywhere in the files this line touches
//
// NO PRODUCTION CODE CHANGES. Every invariant below already holds under
// 0.9.123's own implementation — this file is the audit itself, not a
// fix. See docs/Roadmap.md, 0.9.124.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function buildRegistry() {
    const registry = new AvatarTemplateRegistry();
    registry.register(CoreAvatarTemplateLibrary);
    return registry;
}

function buildAvatarStack(registry, username, startPosition) {
    const storage = new InMemoryStorageProvider();
    const identityProvider = new LocalIdentityProvider(storage);
    identityProvider.login(username);
    const avatarProfileUseCase = new AvatarProfileUseCase(storage, identityProvider, registry);
    const profile = avatarProfileUseCase.getProfile();
    const avatarPresenceSession = new AvatarPresenceSession(profile, { position: startPosition, rotation: { y: 0 } });
    return { avatarProfileUseCase, avatarPresenceSession };
}

function spyFacade() {
    const calls = { onAnimationFrameCallbacks: [], syncVehicleCalls: [] };
    return {
        calls,
        setLocalAvatar() {}, updateLocalAvatarAppearance() {}, updateLocalAvatarPresence() {},
        setLocalAvatarVisible() {}, removeLocalAvatar() {},
        onAnimationFrame: (callback) => { calls.onAnimationFrameCallbacks.push(callback); return () => {}; },
        getCameraState: () => ({ position: { x: 10, y: 10, z: 10 }, target: { x: 0, y: 0, z: 0 }, zoom: 1 }),
        setCameraState() {},
        addWorld() {}, removeWorld() {}, clearSelection() {}, clearHover() {},
        selectBricks() {}, hoverBrick() {}, showPreview() {}, hidePreview() {},
        showGizmo() {}, hideGizmo() {},
        gizmoHitTest() { return true; }, gizmoPointerDown() { return false; },
        gizmoPointerMove() { return { consumed: false, hovered: false, feedback: null }; },
        gizmoPointerUp() { return { consumed: false, committed: false, feedback: null }; },
        gizmoKeyDown() { return false; },
        pick() { return null; }, pickGround() { return null; }, pickRectangle() { return []; },
        setControlsEnabled() {},
        setRemoteAvatar() {}, updateRemoteAvatarPresence() {}, removeRemoteAvatar() {},
        setRemoteAvatarsVisible() {},
        syncVehicles: (instances) => calls.syncVehicleCalls.push(instances),
        dispose() {}
    };
}

function buildSession(registry, avatarProfileUseCase, avatarPresenceSession) {
    const session = new WorldNavigationSession({
        registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
        avatarProfileUseCase, avatarPresenceSession
    });
    session._session = spyFacade();
    session._setupLocalAvatar();
    session._setupVehicleRendering();
    return session;
}

function fireFrame(session, deltaSeconds) {
    for (const callback of session._session.calls.onAnimationFrameCallbacks) {
        callback(deltaSeconds);
    }
}

async function sourceOf(relativePath) {
    const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

function buildSingleBrickConstraint(center) {
    const world = new World();
    const building = new Building();
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(center.x, center.y, center.z) }));
    world.addBuilding(building);
    const loadedDocuments = new Map([['doc-1', { world }]]);
    const brickRegistry = new CreateBrickRegistryUseCase().execute();
    return new AvatarMovementConstraint({ loadedDocuments, getWorldPosition: () => ({ x: 0, y: 0, z: 0 }), brickRegistry });
}

// A short WALL of adjacent 'core:cube' bricks along Z, at a fixed X — used
// by Section B's diagonal-collision case to keep blocking the X axis at
// every Z the vehicle reaches, rather than a single brick a diagonal ride
// could simply pass alongside of once past its own narrow Z extent.
function buildWallConstraint(x, y, zFrom, zTo) {
    const world = new World();
    const building = new Building();
    for (let z = zFrom; z <= zTo; z++) {
        building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(x, y, z) }));
    }
    world.addBuilding(building);
    const loadedDocuments = new Map([['doc-1', { world }]]);
    const brickRegistry = new CreateBrickRegistryUseCase().execute();
    return new AvatarMovementConstraint({ loadedDocuments, getWorldPosition: () => ({ x: 0, y: 0, z: 0 }), brickRegistry });
}

function groundedBrickCenter(x, z) {
    return { x, y: terrainHeightAt(DEFAULT_WORLD_SEED, x, z) + 0.5, z };
}

function installSyntheticBrickObstacle(session, docId, worldCenter) {
    const world = new World();
    const building = new Building();
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, worldCenter.y, 0) }));
    world.addBuilding(building);
    session._loadedDocuments.set(docId, { world });
    session._localPositions.set(docId, { x: worldCenter.x, y: 0, z: worldCenter.z });
}

const BICYCLE_CAPABILITY = resolveAvatarVehicleMovementCapability(VehicleType.BICYCLE);
const BICYCLE_RADIUS = BICYCLE_CAPABILITY.collisionRadius;
const FORWARD_INTENT = Object.freeze({ direction: 1, turnAxis: 0, running: false, brakingRequested: false });
const BACKWARD_INTENT = Object.freeze({ direction: -1, turnAxis: 0, running: false, brakingRequested: false });
const IDLE_INTENT = Object.freeze({ direction: 0, turnAxis: 0, running: false, brakingRequested: false });

function fakeVehicleStore(instance) {
    let current = instance;
    return {
        get(id) { return id === current.id ? current : null; },
        setPosition(id, nextPosition) {
            if (id !== current.id) return null;
            current = current.withPosition(nextPosition);
            return current;
        },
        setHeading(id, nextHeading) {
            if (id !== current.id) return null;
            current = current.withHeading(nextHeading);
            return current;
        },
        _current: () => current
    };
}

function bicycle(id, position, heading) {
    return new VehicleInstance({ id, type: VehicleType.BICYCLE, spawnPosition: position, position, heading });
}

function degreesToRadians(degrees) { return degrees * (Math.PI / 180); }

async function runTests() {
    // -------------------------------------------------------------
    // Section A — core heading semantics: the pure function.
    // -------------------------------------------------------------
    {
        assert(resolveVehicleHeadingFromMovement({ dx: 0, dz: 5, previousHeading: 999 }) === 0,
            '1. +Z movement resolves to heading 0 (north)');
        assert(resolveVehicleHeadingFromMovement({ dx: 0, dz: -5, previousHeading: 999 }) === 180,
            '2. -Z movement resolves to heading 180 (south) — the exact opposite of +Z');
        assert(resolveVehicleHeadingFromMovement({ dx: 5, dz: 0, previousHeading: 999 }) === 90,
            '3. +X movement resolves to heading 90 (east)');
        assert(resolveVehicleHeadingFromMovement({ dx: -5, dz: 0, previousHeading: 999 }) === 270,
            '4. -X movement resolves to heading 270 (west) — the exact opposite of +X');
        assert(Math.abs(resolveVehicleHeadingFromMovement({ dx: 5, dz: 5, previousHeading: 999 }) - 45) < 1e-9,
            '5. diagonal (+X, +Z) movement resolves to heading 45 (northeast)');
        assert(Math.abs(resolveVehicleHeadingFromMovement({ dx: -5, dz: -5, previousHeading: 999 }) - 225) < 1e-9,
            '6. the opposite diagonal (-X, -Z) resolves to heading 225 (southwest)');
        {
            // An arbitrary, non-45-degree diagonal — dx=3, dz=-4 — proves
            // the function is genuine trigonometry, not a lookup table of
            // eight compass points.
            const expected = Math.atan2(3, -4) * (180 / Math.PI);
            const got = resolveVehicleHeadingFromMovement({ dx: 3, dz: -4, previousHeading: 999 });
            assert(Math.abs(got - expected) < 1e-9, `7. an arbitrary diagonal (3, -4) resolves to ${expected}, got ${got}`);
            assert(got > 90 && got < 180, '8. that arbitrary diagonal genuinely lies between east (90) and south (180), matching its own signs');
        }
        {
            // Finiteness holds across absurdly large and absurdly small
            // real displacements — no NaN/Infinity from extreme magnitudes.
            for (const magnitude of [1e10, 1e-10, 1e300]) {
                const heading = resolveVehicleHeadingFromMovement({ dx: magnitude, dz: magnitude, previousHeading: 0 });
                assert(Number.isFinite(heading), `9.${magnitude} heading stays finite even for an extreme displacement magnitude`);
            }
        }
        {
            // [0, 360) normalization holds in every quadrant — never a
            // negative degree value escapes this function.
            const quadrants = [{ dx: 1, dz: 1 }, { dx: 1, dz: -1 }, { dx: -1, dz: -1 }, { dx: -1, dz: 1 }];
            for (const { dx, dz } of quadrants) {
                const heading = resolveVehicleHeadingFromMovement({ dx, dz, previousHeading: 0 });
                assert(heading >= 0 && heading < 360, `10.(${dx},${dz}) heading ${heading} lies within [0, 360)`);
            }
        }
        {
            // The heading comes from `finalPosition - tickStartPosition`,
            // never from a raw request: build two VehicleInstances whose
            // spawnPosition/position genuinely differ, and confirm the
            // heading a caller would compute is driven by the ACTUAL
            // position delta, entirely independent of spawnPosition.
            const spawn = new Position(0, 0, 0);
            const tickStart = new Position(100, 0, 100);
            const final = new Position(100, 0, 105);
            const instance = new VehicleInstance({ id: 'vehicle:a1', type: VehicleType.BICYCLE, spawnPosition: spawn, position: tickStart });
            const heading = resolveVehicleHeadingFromMovement({
                dx: final.x - tickStart.x, dz: final.z - tickStart.z, previousHeading: instance.heading
            });
            assert(heading === 0, '11. heading is computed from (finalPosition - tickStartPosition), never from spawnPosition (0,0,0) vs. anything else');
        }
    }

    // -------------------------------------------------------------
    // Section B — FLAGSHIP: realized movement vs. requested movement.
    // -------------------------------------------------------------
    {
        // B1 — reversing while facing forward: the cleanest possible proof
        // that heading tracks REALIZED displacement, never steering. The
        // vehicle's own facing (rotationY, fed back in and returned
        // unchanged every tick here, since turnAxis stays 0 throughout)
        // never leaves 0 (north) — but riding BACKWARD genuinely displaces
        // the vehicle toward -Z, so heading must flip to 180 (south) even
        // though the vehicle never "turned around."
        const store = fakeVehicleStore(bicycle('vehicle:b1', { x: 0, y: 0, z: 0 }));
        const controller = new AvatarVehicleMovementController(store, null, null);

        let lastRotationY = 0;
        for (let i = 0; i < 40; i++) {
            const result = controller.tick({
                seed: DEFAULT_WORLD_SEED, vehicleId: 'vehicle:b1', capability: BICYCLE_CAPABILITY,
                movementIntent: FORWARD_INTENT, currentRotationY: 0, deltaSeconds: 0.05
            });
            lastRotationY = result.rotationY;
        }
        assert(Math.abs(lastRotationY - 0) < 1e-6, '12. sanity: rotationY (steering) stays at 0 (north) — turnAxis was never held');
        assert(store._current().position.z > 0.5, '13. sanity: the vehicle genuinely advanced forward (+Z) under held forward input');
        assert(store._current().heading === 0, '14. heading resolves to 0 (north), matching the realized forward displacement');

        for (let i = 0; i < 60; i++) {
            const result = controller.tick({
                seed: DEFAULT_WORLD_SEED, vehicleId: 'vehicle:b1', capability: BICYCLE_CAPABILITY,
                movementIntent: BACKWARD_INTENT, currentRotationY: 0, deltaSeconds: 0.05
            });
            lastRotationY = result.rotationY;
        }
        assert(Math.abs(lastRotationY - 0) < 1e-6,
            '15. THE STEERING FACT: rotationY (the vehicle\'s own facing) is STILL 0 (north) — riding backward never turns it around');
        assert(store._current().heading === 180,
            '16. THE HEADING FACT: heading is now 180 (south) — the REALIZED displacement this whole backward ride actually produced — completely independent of, and different from, the unchanged steering rotationY of 0');
    }
    {
        // B2 — a real, world-collision-clipped diagonal: requesting a
        // steady diagonal (northeast-ish) against a WALL that blocks only
        // the X axis produces a realized displacement bent sharply back
        // toward due north — never the ~45-degree heading the SAME
        // request would resolve to with no obstacle at all.
        const start = { x: 0, y: 0.5, z: 0 };
        const stepsCount = 40;
        const stepSize = 0.3;

        // Control: the identical diagonal request, entirely unconstrained.
        let unconstrained = { ...start };
        for (let i = 0; i < stepsCount; i++) {
            unconstrained = { x: unconstrained.x + stepSize, y: start.y, z: unconstrained.z + stepSize };
        }
        const unconstrainedHeading = resolveVehicleHeadingFromMovement({
            dx: unconstrained.x - start.x, dz: unconstrained.z - start.z, previousHeading: 0
        });
        assert(Math.abs(unconstrainedHeading - 45) < 1e-9, '17. CONTROL: the same diagonal request, unconstrained, resolves to heading 45 (northeast)');

        // A wall of bricks at x = 2, spanning the vehicle's whole Z path —
        // it blocks any further eastward progress once the vehicle's own
        // combined radius reaches it, but never blocks northward progress.
        const wall = buildWallConstraint(2, start.y, -1, 14);
        let constrained = { ...start };
        for (let i = 0; i < stepsCount; i++) {
            const desired = { x: constrained.x + stepSize, y: start.y, z: constrained.z + stepSize };
            const result = wall.apply(constrained, desired, { avatarRadius: BICYCLE_RADIUS });
            constrained = result.position;
        }
        const realizedDx = constrained.x - start.x;
        const realizedDz = constrained.z - start.z;
        assert(realizedDz > stepsCount * stepSize * 0.5, '18. sanity: the vehicle still made substantial northward progress — the wall never blocked Z');
        assert(realizedDx > 0 && realizedDx < (2 - 0.5 - BICYCLE_RADIUS) + 1e-6,
            '19. sanity: the vehicle\'s own X was genuinely clipped well short of the unconstrained diagonal\'s own X');

        const constrainedHeading = resolveVehicleHeadingFromMovement({ dx: realizedDx, dz: realizedDz, previousHeading: 0 });
        assert(constrainedHeading > 0 && constrainedHeading < 20,
            `20. THE FLAGSHIP CLAIM: the SAME requested diagonal, once world collision clips its X component, resolves a REALIZED heading of ${constrainedHeading} — close to due north (0), never the unconstrained request's own 45 — heading tracks what the vehicle actually did, not what it asked to do`);
        assert(constrainedHeading < unconstrainedHeading - 20,
            '21. ...and that realized heading is substantially, unambiguously different from the same request\'s own unconstrained heading');
    }
    {
        // B3 — requested movement, but collision absorbs it entirely:
        // heading stays exactly at whatever it already was — never resets,
        // never invents a heading for a vehicle that did not actually move.
        const center = groundedBrickCenter(0, 5);
        const constraint = buildSingleBrickConstraint(center);
        const spawn = { x: 0, y: 0, z: 0 };
        const store = fakeVehicleStore(bicycle('vehicle:b3', spawn, 123));
        const controller = new AvatarVehicleMovementController(store, constraint, null);

        assert(store._current().heading === 123, '22. sanity: the vehicle starts with a real, pre-existing heading of 123 — never the default 0');

        // Ride all the way up to, and stopped by, the real brick.
        for (let i = 0; i < 200; i++) {
            controller.tick({
                seed: DEFAULT_WORLD_SEED, vehicleId: 'vehicle:b3', capability: BICYCLE_CAPABILITY,
                movementIntent: FORWARD_INTENT, currentRotationY: 0, deltaSeconds: 0.05
            });
        }
        assert(controller.isCollided() === true, '23. sanity: the ride actually collided with the real brick');
        const headingAtFirstStop = store._current().heading;
        assert(headingAtFirstStop !== 123, '24. sanity: the vehicle DID move before being stopped, so heading legitimately changed from its initial 123');

        // "requested: forward, collision result: no movement, heading:
        // previous heading" — several more ticks against the SAME
        // already-blocked position never move heading again.
        for (let i = 0; i < 30; i++) {
            controller.tick({
                seed: DEFAULT_WORLD_SEED, vehicleId: 'vehicle:b3', capability: BICYCLE_CAPABILITY,
                movementIntent: FORWARD_INTENT, currentRotationY: 0, deltaSeconds: 0.05
            });
            assert(store._current().heading === headingAtFirstStop,
                `25.${i} THE FLAGSHIP CLAIM: requested forward movement fully absorbed by collision never changes heading again — it stays exactly at ${headingAtFirstStop}`);
        }
    }

    // -------------------------------------------------------------
    // Section C — blocked and idle behavior: heading survives, and is
    // never accidentally reset to 0.
    // -------------------------------------------------------------
    {
        assert(resolveVehicleHeadingFromMovement({ dx: 0, dz: 0, previousHeading: 271.5 }) === 271.5,
            '26. zero-length displacement (dx=0, dz=0) returns previousHeading verbatim, never 0');
        assert(resolveVehicleHeadingFromMovement({ dx: NaN, dz: 5, previousHeading: 88 }) === 88,
            '27. a non-finite dx falls back to previousHeading rather than producing NaN');
        assert(resolveVehicleHeadingFromMovement({ dx: 5, dz: Infinity, previousHeading: 88 }) === 88,
            '28. a non-finite dz falls back to previousHeading rather than producing NaN/Infinity');
    }
    {
        // A vehicle spawned with a genuinely non-zero starting heading,
        // already sitting flush against a real obstacle's own combined-
        // radius boundary — its very FIRST attempted step is therefore
        // already fully absorbed, with zero real movement ever occurring.
        // Heading must never snap to 0 regardless.
        const center = groundedBrickCenter(0, 5);
        const constraint = buildSingleBrickConstraint(center);
        const spawn = { x: 0, y: center.y, z: center.z - 0.5 - BICYCLE_RADIUS };
        const store = fakeVehicleStore(bicycle('vehicle:c1', spawn, 200));
        const controller = new AvatarVehicleMovementController(store, constraint, null);

        for (let i = 0; i < 20; i++) {
            controller.tick({
                seed: DEFAULT_WORLD_SEED, vehicleId: 'vehicle:c1', capability: BICYCLE_CAPABILITY,
                movementIntent: FORWARD_INTENT, currentRotationY: 0, deltaSeconds: 0.05
            });
            assert(store._current().heading === 200,
                `30.${i} REPEATED BLOCKED TICKS: heading stays exactly 200 — never resets to 0, no matter how many further blocked ticks follow`);
        }
    }
    {
        // Repeated IDLE ticks (no movement intent at all) never alter
        // heading either — the exact structural twin of the blocked case.
        const store = fakeVehicleStore(bicycle('vehicle:c2', { x: 3000, y: 0, z: 3000 }, 77));
        const controller = new AvatarVehicleMovementController(store, null, null);
        for (let i = 0; i < 20; i++) {
            controller.tick({
                seed: DEFAULT_WORLD_SEED, vehicleId: 'vehicle:c2', capability: BICYCLE_CAPABILITY,
                movementIntent: IDLE_INTENT, currentRotationY: 0, deltaSeconds: 0.05
            });
            assert(store._current().heading === 77, `30b.${i} REPEATED IDLE TICKS: heading stays exactly 77 — no movement intent means no new heading fact exists`);
            assert(store._current().position.x === 3000 && store._current().position.z === 3000, `30c.${i} ...and position genuinely never moved either`);
        }
    }

    // -------------------------------------------------------------
    // Section D — runtime-store authority: VehicleRuntimeInstances#setHeading().
    // -------------------------------------------------------------
    {
        const store = new VehicleRuntimeInstances();
        assert(store.setHeading('vehicle:unknown', 90) === null, '31. setHeading() on an unknown id returns null — no destination is known from here');
    }
    {
        const store = new VehicleRuntimeInstances();
        const original = bicycle('vehicle:d1', { x: 10, y: 0, z: 20 }, 0);
        store._instances.set('vehicle:d1', original);

        const updated = store.setHeading('vehicle:d1', 180);
        assert(updated !== null && updated.heading === 180, '32. setHeading() on a known id returns the updated VehicleInstance with the new heading');
        assert(store.get('vehicle:d1').heading === 180, '33. the store itself now reports the new heading for subsequent get() calls');
        assert(updated.position.x === 10 && updated.position.z === 20, '34. position is completely unchanged by setHeading()');
        assert(updated.spawnPosition.x === 10 && updated.spawnPosition.z === 20, '35. spawnPosition is completely unchanged by setHeading()');
        assert(updated.id === 'vehicle:d1' && updated.type === VehicleType.BICYCLE, '36. id/type are completely unchanged by setHeading()');
    }
    {
        // Other tracked instances are entirely untouched by one vehicle's
        // own setHeading() call.
        const store = new VehicleRuntimeInstances();
        store._instances.set('vehicle:d2a', bicycle('vehicle:d2a', { x: 0, y: 0, z: 0 }, 10));
        store._instances.set('vehicle:d2b', bicycle('vehicle:d2b', { x: 5, y: 0, z: 5 }, 20));

        store.setHeading('vehicle:d2a', 300);
        assert(store.get('vehicle:d2a').heading === 300, '37. the targeted vehicle\'s heading updated');
        assert(store.get('vehicle:d2b').heading === 20, '38. THE UNTARGETED VEHICLE\'S OWN HEADING IS COMPLETELY UNTOUCHED');
        assert(store.get('vehicle:d2b').position.x === 5 && store.get('vehicle:d2b').position.z === 5, '39. ...and its position, too, is untouched');
    }
    {
        // Rendering subsequently observes the new heading, through the
        // exact same store -> renderer path the real pipeline uses.
        const store = new VehicleRuntimeInstances();
        store._instances.set('vehicle:d3', bicycle('vehicle:d3', { x: 0, y: 0, z: 0 }, 0));
        const field = new VehicleFieldRenderer();

        const before = field.setVehicle(store.get('vehicle:d3'));
        const rotationBefore = before.rotation.y;

        store.setHeading('vehicle:d3', 200);
        const after = field.setVehicle(store.get('vehicle:d3'));
        assert(after === before, '40. sanity: still the SAME tracked Object3D — a heading-only change never rebuilds it');
        assert(after.rotation.y !== rotationBefore, '41. THE STORE\'S OWN NEW HEADING IS OBSERVABLE THROUGH RENDERING: root.rotation.y changed to reflect it');
    }

    // -------------------------------------------------------------
    // Section E — immutability boundary: withPosition()/withHeading()
    // never couple, and repeated interleaving never leaks state.
    // -------------------------------------------------------------
    {
        const original = new VehicleInstance({ id: 'vehicle:e1', type: VehicleType.BICYCLE, spawnPosition: { x: 0, y: 0, z: 0 }, heading: 45 });
        const moved = original.withPosition({ x: 99, y: 0, z: 99 });
        assert(moved.heading === 45, '42. withPosition() never alters heading — still 45');
        assert(original.heading === 45 && original.position.x === 0, '43. sanity: the ORIGINAL instance is completely untouched — withPosition() never mutates in place');
    }
    {
        const original = new VehicleInstance({ id: 'vehicle:e2', type: VehicleType.BICYCLE, spawnPosition: { x: 5, y: 0, z: 5 } });
        const reoriented = original.withHeading(270);
        assert(reoriented.position.x === 5 && reoriented.position.z === 5, '44. withHeading() never alters position — still (5, 5)');
        assert(reoriented.spawnPosition.x === 5 && reoriented.spawnPosition.z === 5, '45. withHeading() never alters spawnPosition either');
        assert(original.heading === 0, '46. sanity: the ORIGINAL instance is completely untouched — withHeading() never mutates in place');
    }
    {
        // Repeated, interleaved withPosition()/withHeading() calls never
        // create hidden coupling between the two facts — each call only
        // ever changes the ONE fact it names, regardless of call order or
        // how many times each has already been called.
        let instance = new VehicleInstance({ id: 'vehicle:e3', type: VehicleType.BICYCLE, spawnPosition: { x: 0, y: 0, z: 0 } });
        instance = instance.withPosition({ x: 1, y: 0, z: 1 });
        instance = instance.withPosition({ x: 2, y: 0, z: 2 });
        instance = instance.withHeading(30);
        instance = instance.withHeading(60);
        assert(instance.position.x === 2 && instance.position.z === 2, '47. after withPosition(), withPosition(), withHeading(), withHeading(): position reflects only the LAST withPosition() call');
        assert(instance.heading === 60, '48. ...and heading reflects only the LAST withHeading() call');

        instance = instance.withHeading(90);
        assert(instance.position.x === 2 && instance.position.z === 2, '49. a SUBSEQUENT withHeading() still never disturbs the position two calls set earlier');
        instance = instance.withPosition({ x: 7, y: 0, z: 7 });
        assert(instance.heading === 90, '50. a SUBSEQUENT withPosition() still never disturbs the heading set just before it');
        assert(instance.spawnPosition.x === 0 && instance.spawnPosition.z === 0, '51. spawnPosition survives this entire six-call chain, byte-for-byte, untouched');
        assert(instance.id === 'vehicle:e3' && instance.type === VehicleType.BICYCLE, '52. id/type survive this entire chain too');
    }
    {
        // Frozen: neither field can be mutated in place on any
        // VehicleInstance, regardless of how it was produced.
        const instance = new VehicleInstance({ id: 'vehicle:e4', type: VehicleType.BICYCLE, spawnPosition: { x: 0, y: 0, z: 0 }, heading: 15 })
            .withPosition({ x: 1, y: 0, z: 1 }).withHeading(200);
        assert(Object.isFrozen(instance), '53. a VehicleInstance produced through withPosition()/withHeading() is still Object.frozen');
        let threw = false;
        try { instance.heading = 999; } catch (err) { threw = true; }
        assert(threw && instance.heading === 200, '54. attempting to assign .heading directly throws (strict mode) and never actually changes it');
    }
    {
        // vehicleInstanceFromPresence() still seeds heading at the same
        // neutral 0 default — 0.9.124 changes nothing about that bridge.
        const presence = new VehiclePresence({ id: 'vehicle:e5', type: VehicleType.BICYCLE, position: new Position(1, 0, 1) });
        const instance = vehicleInstanceFromPresence(presence);
        assert(instance.heading === 0, '55. vehicleInstanceFromPresence() still seeds heading at the neutral default 0');
    }

    // -------------------------------------------------------------
    // Section F — rendering semantics: VehicleVisual observes heading,
    // it never computes one.
    // -------------------------------------------------------------
    {
        const visual = new VehicleVisual(new VehicleRenderer(), VehicleType.BICYCLE);
        visual.setHeading(45);
        const rotationAt45 = visual.root.rotation.y;
        const rootRef = visual.root;
        const builtRef = visual._built;

        visual.setHeading(315);
        assert(visual.root === rootRef, '56. THE SAME Object3D SURVIVES A HEADING CHANGE — never rebuilt');
        assert(visual._built === builtRef, '57. ...and the same built geometry group is still attached — heading changes never rebuild geometry');
        assert(visual.root.rotation.y !== rotationAt45, '58. a different heading produces a different root.rotation.y on that SAME root');

        function countMeshes(object3D) {
            let count = 0;
            object3D.traverse((node) => { if (node.isMesh) count++; });
            return count;
        }
        const meshCountAt45 = countMeshes(visual.root);
        visual.setHeading(10);
        assert(countMeshes(visual.root) === meshCountAt45, '59. changing heading never changes the number of mesh objects — no geometry rebuild of any kind');
    }
    {
        // Position changes don't reset heading, and heading changes don't
        // reset position — the renderer-side twin of Section E's own
        // VehicleInstance-level claim, now proven on the live Object3D.
        const visual = new VehicleVisual(new VehicleRenderer(), VehicleType.BICYCLE);
        visual.setHeading(123);
        visual.setPosition({ x: 4, y: 0, z: 9 });
        assert(Math.abs(visual.root.rotation.y - (degreesToRadians(123) - Math.PI / 2)) < 1e-9,
            '60. setPosition() never resets a rotation a prior setHeading() call already applied');

        visual.setPosition({ x: 4, y: 0, z: 9 });
        visual.setHeading(200);
        assert(visual.root.position.x === 4 && visual.root.position.z === 9,
            '61. setHeading() never resets a position a prior setPosition() call already applied');
    }
    {
        // Unsupported vehicle types remain unsupported — 0.9.124 changes
        // nothing about which types this renderer can show.
        for (const type of [VehicleType.MOTORCYCLE, VehicleType.CAR, VehicleType.DRONE]) {
            const visual = new VehicleVisual(new VehicleRenderer(), type);
            assert(visual.isSupported === false, `62.${type} still reports isSupported === false`);
            visual.setHeading(90); // must never throw even with no built geometry
            assert(visual.root instanceof THREE.Group, `63.${type} root is still a valid, if empty, Object3D after setHeading()`);
        }
    }
    {
        // The renderer never computes a heading of its own — a pure
        // source sweep, mirroring the "observes, never decides" audits
        // this vehicle line has run at every prior seam.
        const visualSource = await sourceOf('../renderer/VehicleVisual.js');
        for (const term of ['atan2', 'Math.atan', 'dx', 'dz', 'previousHeading', 'displacement']) {
            assert(!visualSource.includes(term),
                `64. renderer/VehicleVisual.js's own code never references "${term}" — it only ever APPLIES a heading it is handed, never computes one`);
        }
        const fieldSource = await sourceOf('../renderer/VehicleFieldRenderer.js');
        for (const term of ['atan2', 'Math.atan', 'resolveVehicleHeadingFromMovement']) {
            assert(!fieldSource.includes(term), `65. renderer/VehicleFieldRenderer.js's own code never references "${term}" either`);
        }
    }

    // -------------------------------------------------------------
    // Section G — FLAGSHIP: cross-pipeline, one continuous real session.
    // Spawn, mount, ride one direction, turn and ride another, then a
    // real collision block — heading tracked correctly at every phase,
    // the avatar following the vehicle's own position on every frame.
    // -------------------------------------------------------------
    {
        const registry = buildRegistry();
        const VEHICLE_ID = 'vehicle:audit-g-flagship';
        const spawnPosition = { x: 96000, y: 0, z: 96000 };
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'audit-g1', new Position(spawnPosition.x, 0, spawnPosition.z));
        const session = buildSession(registry, avatarProfileUseCase, avatarPresenceSession);
        session.setAvatarControlMode(true);

        session._vehicleRuntimeInstances._instances.set(VEHICLE_ID, new VehicleInstance({ id: VEHICLE_ID, type: VehicleType.BICYCLE, spawnPosition, position: spawnPosition }));
        const originalId = session._vehicleRuntimeInstances.get(VEHICLE_ID).id;
        const originalType = session._vehicleRuntimeInstances.get(VEHICLE_ID).type;
        const originalSpawnPosition = session._vehicleRuntimeInstances.get(VEHICLE_ID).spawnPosition;

        session._avatarVehicleInteractionController._mount = createAvatarVehicleMount(VEHICLE_ID);
        assert(session.avatarVehicleMount() !== null && session.avatarVehicleMount().vehicleId === VEHICLE_ID, '66. setup: mounted');
        assert(session._vehicleRuntimeInstances.get(VEHICLE_ID).heading === 0, '67. setup: a freshly spawned, never-moved vehicle starts at heading 0');

        function assertAvatarFollowsVehicle(label, i) {
            const vehiclePosition = session._vehicleRuntimeInstances.get(VEHICLE_ID).position;
            const avatarPosition = avatarPresenceSession.current.position;
            assert(avatarPosition.x === vehiclePosition.x && avatarPosition.z === vehiclePosition.z,
                `68.${label}.${i} the avatar's position exactly equals the vehicle's own already-committed position, on every single frame`);
        }

        // Phase 1 — ride straight ahead (the avatar's default facing,
        // heading 0/north) with no turning at all.
        session.avatarKeyDown('w');
        for (let i = 0; i < 60; i++) {
            fireFrame(session, 0.05);
            assertAvatarFollowsVehicle('phase1', i);
        }
        const afterPhase1 = session._vehicleRuntimeInstances.get(VEHICLE_ID);
        assert(afterPhase1.position.z > spawnPosition.z + 1, '69. phase 1: the vehicle genuinely advanced');
        assert(afterPhase1.heading === 0, '70. phase 1: heading resolves to 0 (north), matching the realized straight-ahead ride');

        // Phase 2 — hold the turn key alongside forward: the vehicle
        // genuinely turns (steering, rate-limited) and rides a SECOND,
        // different realized direction. A held turn key rotates
        // CONTINUOUSLY, not toward a fixed target (see
        // core/AvatarMovementSimulation.js's own 0.9.94 header) — at the
        // bicycle's own 3.5 rad/s steering rate that is ~10 degrees per
        // 0.05s tick, so 9 ticks closes very close to a quarter turn
        // (~90 degrees) without overshooting past it.
        session.avatarKeyDown('d');
        for (let i = 0; i < 9; i++) {
            fireFrame(session, 0.05);
            assertAvatarFollowsVehicle('phase2', i);
        }
        session.avatarKeyUp('d');
        // A few more straight frames to let the just-completed turn's own
        // realized displacement (this tick's step, not merely the
        // steering angle) settle into a stable, unambiguous heading.
        for (let i = 0; i < 20; i++) {
            fireFrame(session, 0.05);
            assertAvatarFollowsVehicle('phase2-settle', i);
        }
        const afterPhase2 = session._vehicleRuntimeInstances.get(VEHICLE_ID);
        assert(Math.abs(afterPhase2.heading - 90) < 15,
            `71. phase 2: THE SECOND REALIZED DIRECTION: heading is now close to 90 (east) — ${afterPhase2.heading} — genuinely different from phase 1's own 0 (north), tracking the vehicle's own new realized travel direction`);
        assert(afterPhase2.position.x > afterPhase1.position.x + 1, '72. phase 2: the vehicle genuinely made real eastward progress during the turn');

        // Phase 3 — a REAL collision block, directly ahead of the
        // vehicle's own current position and current direction of travel.
        // `isCollided()` first turning true does not itself mean heading
        // has already settled — the SAME tick that first clips the
        // vehicle's own step can still carry real, if partial, horizontal
        // movement, so heading can genuinely pass through more than one
        // real value (first the partial approach's own direction, then
        // whatever a fully-stopped vehicle's residual slip settles into)
        // before it stops changing altogether. This loop watches for
        // heading itself to stay bit-identical across several consecutive
        // frames — the actual, unambiguous signal that no further
        // realized horizontal movement is occurring — rather than keying
        // off the collision flag's own timing.
        installSyntheticBrickObstacle(session, 'flagship-g-doc', groundedBrickCenter(afterPhase2.position.x + 5, afterPhase2.position.z));
        let firstBlockedHeading = null;
        let blockedAtX = null;
        let blockedAtZ = null;
        let previousHeading = session._vehicleRuntimeInstances.get(VEHICLE_ID).heading;
        let stableStreak = 0;
        for (let i = 0; i < 80 && firstBlockedHeading === null; i++) {
            fireFrame(session, 0.05);
            assertAvatarFollowsVehicle('phase3', i);
            const current = session._vehicleRuntimeInstances.get(VEHICLE_ID);
            stableStreak = current.heading === previousHeading ? stableStreak + 1 : 0;
            previousHeading = current.heading;
            if (session._avatarVehicleMovementController.isCollided() && stableStreak >= 5) {
                firstBlockedHeading = current.heading;
                blockedAtX = current.position.x;
                blockedAtZ = current.position.z;
            }
        }
        assert(firstBlockedHeading !== null, '73. sanity: the ride collided with the real, freshly-installed obstacle and its own heading settled to a stable value within 80 frames');

        // Continued held forward input against the same obstacle: heading
        // never changes again once the vehicle is genuinely stopped —
        // the flagship claim of Section C, now proven through this same
        // full, real, continuous session. X (the axis collision actually
        // blocks) stays bit-exact; Z is allowed a small numerical
        // tolerance — the axis-separated resolver can keep making tiny,
        // rapidly-decaying corrections along the UNBLOCKED axis while
        // held against a wall at a slight residual angle, which is a
        // pre-existing fact about `core/AvatarCollision.js`'s own
        // resolver, entirely unrelated to heading and unchanged by this
        // milestone — the point under test here is that HEADING itself
        // never moves again once resolved, regardless.
        for (let i = 0; i < 30; i++) {
            fireFrame(session, 0.05);
            const current = session._vehicleRuntimeInstances.get(VEHICLE_ID);
            assert(current.heading === firstBlockedHeading,
                `74.${i} PHASE 3 — BLOCKED: heading stays exactly ${firstBlockedHeading} under continued held forward input against a real obstacle — never drifts, never resets`);
            assert(current.position.x === blockedAtX,
                `74b.${i} ...and the axis collision actually blocks (X) stays bit-exact — never advances one unit further`);
            assert(Math.abs(current.position.z - blockedAtZ) < 0.5,
                `74c.${i} ...and Z stays within a small bound of where the vehicle was first stopped`);
        }
        session.avatarKeyUp('w');

        const finalInstance = session._vehicleRuntimeInstances.get(VEHICLE_ID);
        assert(finalInstance.id === originalId && finalInstance.type === originalType, '75. id/type survive the entire spawn -> mount -> ride -> turn -> block lifecycle unchanged');
        assert(finalInstance.spawnPosition.x === originalSpawnPosition.x && finalInstance.spawnPosition.z === originalSpawnPosition.z,
            '76. spawnPosition survives the entire lifecycle unchanged — only position and heading ever moved');
    }

    // -------------------------------------------------------------
    // Section H — structural exclusion audit: 0.9.123/0.9.124 did NOT
    // accidentally introduce steering, physics, avatar rotationY
    // synchronization, persistence, or multiplayer synchronization.
    // -------------------------------------------------------------
    {
        const orientationFiles = [
            '../core/VehicleInstance.js',
            '../core/VehicleMovementHeading.js',
            '../application/VehicleRuntimeInstances.js',
            '../renderer/VehicleVisual.js',
            '../renderer/VehicleFieldRenderer.js'
        ];
        // Real, would-be identifiers a steering/physics/persistence
        // feature would actually introduce into these files' own CODE
        // (comments describing what these files deliberately exclude are
        // stripped by sourceOf() first, so this only ever catches REAL
        // code, never the prose that documents the exclusion itself).
        const forbidden = [
            'steeringAngle', 'SteeringAngle', 'steeringInput', 'SteeringInput', 'SteeringIntent',
            'turnRate', 'TurnRate', 'angularVelocity', 'AngularVelocity',
            'turningRadius', 'TurningRadius', 'wheelRotation', 'WheelRotation',
            'OrientedBoundingBox', 'RectangularFootprint', 'VehiclePhysics', 'vehiclePhysics',
            'rotationY', // the avatar's own steering fact — never belongs in these files at all
            'StorageProvider', '.save(', 'localStorage', 'IndexedDB',
            'WebSocket', 'RTCPeerConnection', 'broadcast(', 'PeerConnection'
        ];
        for (const path of orientationFiles) {
            const codeOnly = await sourceOf(path);
            for (const term of forbidden) {
                assert(!codeOnly.includes(term),
                    `77. ${path} never references "${term}" in its own code — no steering, physics, persistence, or networking vocabulary has leaked into the orientation seam`);
            }
        }
    }
    {
        // application/AvatarVehicleMovementController.js legitimately
        // reuses capability.steering.steeringRate for the AVATAR's own
        // pre-existing facing (rotationY) — that is 0.9.94's own,
        // untouched feature, not a regression. What must NEVER appear is
        // a heading-vs-steering coupling in the OTHER direction: heading
        // driving rotationY, or rotationY being read to COMPUTE heading.
        const controllerCode = await sourceOf('../application/AvatarVehicleMovementController.js');
        assert(!controllerCode.includes('resolveVehicleHeadingFromMovement({ dx: currentRotationY'),
            '78. heading is never derived FROM rotationY/steering — only from the realized (dx, dz) position delta');
        assert(!controllerCode.includes('setHeading(vehicleId, result.rotationY)') && !controllerCode.includes('setHeading(vehicleId, currentRotationY)'),
            '79. setHeading() is never called with the steering rotationY value directly — only with resolveVehicleHeadingFromMovement()\'s own output');
    }
    {
        // application/WorldNavigationSession.js — the ONE place both
        // facts (heading and rotationY) are read in the same frame —
        // never wires the vehicle's own heading into the avatar's
        // rotation. The avatar's rotation while mounted comes ONLY from
        // `moved.rotationY` (steering); `moved.vehicleInstance.heading`
        // is never read there at all.
        const sessionCode = await sourceOf('../application/WorldNavigationSession.js');
        assert(sessionCode.includes('rotation: { y: moved.rotationY }'),
            '80. sanity: the avatar\'s own rotation while riding still comes from moved.rotationY, exactly as before 0.9.123');
        assert(!sessionCode.includes('moved.vehicleInstance.heading') && !sessionCode.includes('vehicleInstance.heading'),
            '81. THE EXCLUSION ITSELF: application/WorldNavigationSession.js never reads a mounted vehicle\'s own .heading to drive the avatar\'s rotation — heading and the avatar\'s own facing stay two entirely independent facts');
    }
    {
        // A closed vocabulary for steering intent (NONE/LEFT/RIGHT, or
        // any equivalent) did not exist anywhere as of this milestone —
        // that was 0.9.125's own job, deliberately not started here.
        // core/VehicleInstance.js and core/VehicleMovementHeading.js
        // still define none of it, and still never will (see
        // tests/VehicleSteeringIntegrationAudit.test.js's own Section E,
        // "no steering field needs to be added to VehicleInstance").
        // application/AvatarVehicleMovementController.js is the ONE
        // exception, by explicit, later design — 0.9.127 (Vehicle
        // Steering Integration Audit) is the milestone this orientation
        // audit's own header already named as this line's own future
        // recommendation, wiring `core/VehicleSteeringIntent.js` into
        // that one file's own `tick()`; see that milestone's own suite
        // for the full audit of exactly how, and why every invariant
        // THIS file itself already covers (heading comes only from
        // realized movement, never steering) still holds unchanged.
        for (const path of ['../core/VehicleInstance.js', '../core/VehicleMovementHeading.js']) {
            const codeOnly = await sourceOf(path);
            for (const term of ['SteeringIntent', 'VehicleSteering', 'steeringIntent']) {
                assert(!codeOnly.includes(term), `82. ${path} defines no steering-intent vocabulary of any kind — that seam was never opened here`);
            }
        }
    }
    {
        // isMovableVehicleType() is still gated on BICYCLE alone — this
        // audit introduces no new movable vehicle type.
        assert(isMovableVehicleType(VehicleType.BICYCLE) === true, '83. sanity: BICYCLE is still movable');
        for (const type of [VehicleType.MOTORCYCLE, VehicleType.CAR, VehicleType.DRONE]) {
            assert(isMovableVehicleType(type) === false, `84.${type} is still never movable — 0.9.124 adds no new capability of any kind`);
        }
    }

    console.log('✅ All Vehicle Orientation Audit tests passed.');
}

await runTests();
