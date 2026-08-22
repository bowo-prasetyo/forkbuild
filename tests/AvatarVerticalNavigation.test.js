import { AvatarMovementState } from '../core/AvatarMovementState.js';
import { simulateAvatarMovement } from '../core/AvatarMovementSimulation.js';
import { AvatarAnimationState } from '../core/AvatarAnimationState.js';
import { AvatarVerticalState, deriveAvatarVerticalState, isValidAvatarVerticalState } from '../core/AvatarVerticalState.js';
import { deriveWorldSpatialActivity, WorldSpatialActivity, isValidWorldSpatialActivity } from '../core/WorldSpatialActivity.js';
import { isStepClimbable, DEFAULT_MAX_STEP_HEIGHT } from '../core/BrickWalkability.js';
import { AvatarStepConstraint } from '../application/AvatarStepConstraint.js';
import { AvatarMovementConstraint } from '../application/AvatarMovementConstraint.js';
import { AvatarMovementController } from '../application/AvatarMovementController.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { AvatarProfileUseCase } from '../application/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';

// 0.3.4 — Vertical World Navigation.
//
//   Section A: core/AvatarVerticalState.js        — the pure SUPPORTED/RISING/FALLING vocabulary
//   Section B: core/AvatarMovementSimulation.js    — `result.verticalState`, derived, not duplicated
//   Section C: application/AvatarStepConstraint.js — a step DOWN beyond maxStepHeight now falls
//   Section D: application/AvatarMovementController.js — falling flips `grounded` for the next tick
//   Section E: core/WorldSpatialActivity.js        — the JUMPING/FALLING vocabulary extension
//   Section F: FLAGSHIP — climb, walk off the edge, fall, land, jump, determinism
//   Section G: Edge case — falling lands on a SLOPE's own per-point surface,
//              never a brick's flat bounding-box max
//
// Central architectural claim under test throughout — see docs/Principles.md,
// "Falling Still Asks WalkableSurface The Same Question Walking Always Has
// (0.3.4)": there is no second "falling surface" concept anywhere in this
// codebase. `application/AvatarStepConstraint.js#supportHeightAt()` — the
// SAME function 0.3.2/0.3.3 already built — is what a walking step snaps
// onto AND what a falling avatar lands on. No physics engine, no rigid
// bodies, no momentum beyond the one signed `verticalVelocity` scalar
// core/AvatarMovementSimulation.js has carried since 0.2.36.

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function almostEqual(a, b, epsilon = 1e-6) {
    return Math.abs(a - b) < epsilon;
}

function buildRegistry() {
    const registry = new AvatarTemplateRegistry();
    registry.register(CoreAvatarTemplateLibrary);
    return registry;
}

// Same minimal, duck-typed "loaded document" every 0.3.2/0.3.3 movement
// test already relies on — only `document.world.getBuildings()` is ever
// read by AvatarMovementConstraint/AvatarStepConstraint.
function documentWithBricks(bricks) {
    const world = new World();
    const building = new Building({ creator: 'vertical-navigation-test' });
    for (const brick of bricks) building.addBrick(brick);
    world.addBuilding(building);
    return { world };
}

function buildAvatarPresence(registry, username, initialPosition) {
    const storage = new InMemoryStorageProvider();
    const identityProvider = new LocalIdentityProvider(storage);
    identityProvider.login(username);
    const avatarProfileUseCase = new AvatarProfileUseCase(storage, identityProvider, registry);
    avatarProfileUseCase.updateProfile({ templateId: 'humanoid-01', displayName: username });
    const profile = avatarProfileUseCase.getProfile();
    return new AvatarPresenceSession(profile, { position: initialPosition });
}

async function runTests() {
    const registry = buildRegistry();
    const brickRegistry = new CreateBrickRegistryUseCase().execute();
    const cube = brickRegistry.get('core:cube');
    const plate = brickRegistry.get('core:plate_2x4');
    const slab = brickRegistry.get('core:slab_4x4');
    const stair = brickRegistry.get('core:stair');
    const slope = brickRegistry.get('core:slope_45');

    // -------------------------------------------------------------
    // Section A — core/AvatarVerticalState.js: a pure label over
    // existing grounded/verticalVelocity bookkeeping, nothing more.
    // -------------------------------------------------------------
    {
        assert(deriveAvatarVerticalState({ grounded: true }) === AvatarVerticalState.SUPPORTED,
            '1. deriveAvatarVerticalState: grounded is always SUPPORTED, regardless of verticalVelocity');
        assert(deriveAvatarVerticalState({ grounded: true, verticalVelocity: -50 }) === AvatarVerticalState.SUPPORTED,
            '2. deriveAvatarVerticalState: grounded wins even with a nonsensical leftover velocity');
        assert(deriveAvatarVerticalState({ grounded: false, verticalVelocity: 2 }) === AvatarVerticalState.RISING,
            '3. deriveAvatarVerticalState: airborne with positive velocity is RISING');
        assert(deriveAvatarVerticalState({ grounded: false, verticalVelocity: -2 }) === AvatarVerticalState.FALLING,
            '4. deriveAvatarVerticalState: airborne with negative velocity is FALLING');
        assert(deriveAvatarVerticalState({ grounded: false, verticalVelocity: 0 }) === AvatarVerticalState.FALLING,
            '5. deriveAvatarVerticalState: airborne at the exact apex (velocity 0) counts as FALLING — gravity is about to win');
        assert(deriveAvatarVerticalState({ grounded: false, verticalVelocity: NaN }) === AvatarVerticalState.FALLING,
            '6. deriveAvatarVerticalState: a non-finite velocity degrades to FALLING, never throws or propagates NaN');
        assert(deriveAvatarVerticalState() === AvatarVerticalState.SUPPORTED,
            '7. deriveAvatarVerticalState: called with nothing at all defaults to SUPPORTED');
        assert(isValidAvatarVerticalState('supported') && isValidAvatarVerticalState('rising') && isValidAvatarVerticalState('falling'),
            '8. isValidAvatarVerticalState: recognizes all three real states');
        assert(!isValidAvatarVerticalState('flying'), '9. isValidAvatarVerticalState: rejects an unrecognized value');
    }

    // -------------------------------------------------------------
    // Section B — core/AvatarMovementSimulation.js: the pure kinematics
    // now report `verticalState` alongside `grounded`/`verticalVelocity`
    // — additive, derived, never a second source of truth.
    // -------------------------------------------------------------
    {
        const grounded = simulateAvatarMovement({
            position: { x: 0, y: 0, z: 0 }, rotationY: 0, verticalVelocity: 0, grounded: true,
            movementState: AvatarMovementState.idle(), deltaSeconds: 0.5
        });
        assert(grounded.verticalState === AvatarVerticalState.SUPPORTED, '10. simulateAvatarMovement: a grounded tick reports SUPPORTED');
    }
    {
        const rising = simulateAvatarMovement({
            position: { x: 0, y: 1, z: 0 }, rotationY: 0, verticalVelocity: 3, grounded: false,
            movementState: AvatarMovementState.idle(), deltaSeconds: 0.05
        });
        assert(rising.verticalState === AvatarVerticalState.RISING, '11. simulateAvatarMovement: the ascending half of a jump reports RISING');
    }
    {
        const falling = simulateAvatarMovement({
            position: { x: 0, y: 5, z: 0 }, rotationY: 0, verticalVelocity: -1, grounded: false,
            movementState: AvatarMovementState.idle(), deltaSeconds: 0.05
        });
        assert(falling.verticalState === AvatarVerticalState.FALLING, '12. simulateAvatarMovement: descending under gravity reports FALLING');
    }
    {
        // Pressing Space from the ground: RISING at takeoff, FALLING
        // past the apex, SUPPORTED again on landing — the whole arc
        // visible purely through `verticalState`, with no separate
        // bookkeeping needed to observe it.
        let position = { x: 0, y: 0, z: 0 };
        let verticalVelocity = 0;
        let grounded = true;
        let sawRising = false;
        let sawFalling = false;
        for (let i = 0; i < 60; i++) {
            const movementState = i === 0 ? new AvatarMovementState({ jumpRequested: true }) : AvatarMovementState.idle();
            const r = simulateAvatarMovement({ position, rotationY: 0, verticalVelocity, grounded, movementState, deltaSeconds: 0.05 });
            position = r.position; verticalVelocity = r.verticalVelocity; grounded = r.grounded;
            if (r.verticalState === AvatarVerticalState.RISING) sawRising = true;
            if (r.verticalState === AvatarVerticalState.FALLING) sawFalling = true;
        }
        assert(sawRising, '13. simulateAvatarMovement: a jump\'s own arc passes through RISING');
        assert(sawFalling, '14. simulateAvatarMovement: ...and through FALLING before landing');
        assert(grounded && position.y === 0, '15. simulateAvatarMovement: the arc ends back on the ground, exactly like before this milestone');
    }

    // -------------------------------------------------------------
    // Section C — application/AvatarStepConstraint.js: a step DOWN
    // beyond maxStepHeight now falls; a step UP beyond it is still a
    // wall. The two directions were always a named simplification
    // treating them alike — see this class's own 0.3.4 header — and
    // this is exactly where that simplification stops.
    // -------------------------------------------------------------
    {
        // Standing atop a tall cube (support height 1), stepping DOWN
        // onto bare ground (support height 0) — an unsupported ledge.
        const document = documentWithBricks([
            new Brick({ definitionId: 'core:cube', position: new Position(0, cube.height / 2, 0) })
        ]);
        const loadedDocuments = new Map([['doc-fall', document]]);
        const constraint = new AvatarStepConstraint({ loadedDocuments, getWorldPosition: () => ({ x: 0, y: 0, z: 0 }), brickRegistry });
        assert(isStepClimbable(1, 0, DEFAULT_MAX_STEP_HEIGHT) === false, 'sanity: a 1-unit drop is not climbable');
        const result = constraint.apply({ x: 0, y: 1, z: 0 }, { x: 2, y: 1, z: 0 }, { grounded: true });
        assert(result.blocked === false, '16. AvatarStepConstraint: a step DOWN beyond maxStepHeight is no longer blocked');
        assert(result.falling === true, '17. AvatarStepConstraint: ...it is reported as falling instead');
        assert(result.position.x === 2 && result.position.z === 0, '18. AvatarStepConstraint: X/Z proceed to the desired position — walking off an edge is never a wall');
        assert(result.position.y === 1, '19. AvatarStepConstraint: Y is passed through UNSNAPPED — still resting at the OLD support height, for gravity to take over next tick');
    }
    {
        // The exact opposite direction — approaching the SAME tall
        // cube from bare ground — remains a genuine wall, never falling.
        const document = documentWithBricks([
            new Brick({ definitionId: 'core:cube', position: new Position(2, cube.height / 2, 0) })
        ]);
        const loadedDocuments = new Map([['doc-wall', document]]);
        const constraint = new AvatarStepConstraint({ loadedDocuments, getWorldPosition: () => ({ x: 0, y: 0, z: 0 }), brickRegistry });
        const result = constraint.apply({ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { grounded: true });
        assert(result.blocked === true, '20. AvatarStepConstraint: stepping UP beyond maxStepHeight is still blocked — falling only ever explains a drop');
        assert(result.falling === false, '21. AvatarStepConstraint: ...and is never reported as falling');
        assert(result.position.x === 0 && result.position.z === 0, '22. AvatarStepConstraint: a blocked step still reverts X/Z to where the avatar already stood');
    }
    {
        // A small drop WITHIN maxStepHeight is still an ordinary step
        // down — climbed (in the downward sense), never a fall.
        const document = documentWithBricks([
            new Brick({ definitionId: 'core:plate_2x4', position: new Position(0, plate.height / 2, 0) })
        ]);
        const loadedDocuments = new Map([['doc-small-drop', document]]);
        const constraint = new AvatarStepConstraint({ loadedDocuments, getWorldPosition: () => ({ x: 0, y: 0, z: 0 }), brickRegistry });
        const result = constraint.apply({ x: 0, y: plate.height, z: 0 }, { x: 3, y: plate.height, z: 0 }, { grounded: true });
        assert(result.blocked === false && result.falling === false, '23. AvatarStepConstraint: a drop within maxStepHeight is neither blocked nor falling — an ordinary step down');
        assert(result.position.y === 0, '24. AvatarStepConstraint: Y snaps onto the flat plane, exactly like a climbable step always has');
    }
    {
        // Airborne ticks still pass straight through, completely
        // unmodified — a step/falling decision only ever originates
        // from a GROUNDED tick.
        const document = documentWithBricks([
            new Brick({ definitionId: 'core:cube', position: new Position(1, cube.height / 2, 0) })
        ]);
        const loadedDocuments = new Map([['doc-airborne', document]]);
        const constraint = new AvatarStepConstraint({ loadedDocuments, getWorldPosition: () => ({ x: 0, y: 0, z: 0 }), brickRegistry });
        const result = constraint.apply({ x: 0, y: 2, z: 0 }, { x: 1, y: 1.9, z: 0 }, { grounded: false });
        assert(result.blocked === false && result.falling === false, '25. AvatarStepConstraint: an airborne tick never reports falling FROM this constraint — the avatar was already falling before it ever got here');
    }

    // -------------------------------------------------------------
    // Section D — application/AvatarMovementController.js: `falling`
    // flips `grounded` to false for the NEXT tick, and `verticalState()`
    // reflects the whole SUPPORTED -> FALLING -> SUPPORTED arc.
    // -------------------------------------------------------------
    {
        const platform = brickRegistry.get('core:cube'); // top height 1, footprint z:[0.5,1.5]
        const document = documentWithBricks([
            new Brick({ definitionId: 'core:cube', position: new Position(0, platform.height / 2, 1) })
        ]);
        const loadedDocuments = new Map([['doc-controller-fall', document]]);
        const getWorldPosition = () => ({ x: 0, y: 0, z: 0 });
        const movementConstraint = new AvatarMovementConstraint({ loadedDocuments, getWorldPosition, brickRegistry, maxStepHeight: DEFAULT_MAX_STEP_HEIGHT });
        const stepConstraint = new AvatarStepConstraint({ loadedDocuments, getWorldPosition, brickRegistry });
        const avatarPresenceSession = buildAvatarPresence(registry, 'vertical-controller-d1', { x: 0, y: 1, z: 1 });
        const controller = new AvatarMovementController(avatarPresenceSession, movementConstraint, null, stepConstraint);

        assert(controller.verticalState() === AvatarVerticalState.SUPPORTED, '26. AvatarMovementController: starts SUPPORTED (the default before any tick)');

        controller.keyDown('w'); // default facing walks +Z, straight toward the platform's own far edge
        let sawFalling = false;
        let landedAfterFall = false;
        for (let i = 0; i < 300; i++) {
            controller.tick(0.03);
            const vs = controller.verticalState();
            if (vs === AvatarVerticalState.FALLING) sawFalling = true;
            if (sawFalling && vs === AvatarVerticalState.SUPPORTED) { landedAfterFall = true; break; }
        }
        controller.keyUp('w');
        assert(sawFalling, '27. AvatarMovementController: walking off the platform\'s own edge transitions to FALLING');
        assert(landedAfterFall, '28. AvatarMovementController: the avatar eventually lands and returns to SUPPORTED');
        assert(almostEqual(avatarPresenceSession.current.position.y, 0), '29. AvatarMovementController: it lands back on the flat baseline ground — no brick beyond the platform\'s own edge');
    }
    {
        // Backward compatibility: a controller with NO step constraint
        // wired computes none of this — `verticalState()` just reflects
        // the same grounded/jump kinematics 0.2.36 always had.
        const avatarPresenceSession = buildAvatarPresence(registry, 'vertical-controller-d2', { x: 0, y: 0, z: 0 });
        const controller = new AvatarMovementController(avatarPresenceSession);
        assert(controller.verticalState() === AvatarVerticalState.SUPPORTED, '30. AvatarMovementController: verticalState() works even with no constraints wired at all');
        controller.keyDown(' ');
        controller.tick(0.05);
        assert(controller.verticalState() === AvatarVerticalState.RISING, '31. AvatarMovementController: Space still jumps identically without a step constraint');
    }

    // -------------------------------------------------------------
    // Section E — core/WorldSpatialActivity.js: the JUMPING/FALLING
    // vocabulary extension. Backward compatible — every pre-0.3.4
    // caller that never mentions rising/falling gets byte-for-byte the
    // same vocabulary as before.
    // -------------------------------------------------------------
    {
        assert(deriveWorldSpatialActivity({}) === WorldSpatialActivity.IDLE, '32. deriveWorldSpatialActivity: omitting rising/falling entirely changes nothing — still IDLE by default');
        assert(deriveWorldSpatialActivity({ rising: true }) === WorldSpatialActivity.JUMPING, '33. deriveWorldSpatialActivity: rising becomes JUMPING');
        assert(deriveWorldSpatialActivity({ falling: true }) === WorldSpatialActivity.FALLING, '34. deriveWorldSpatialActivity: falling becomes FALLING');
        assert(deriveWorldSpatialActivity({ rising: true, hasSelection: true, canEdit: true }) === WorldSpatialActivity.JUMPING,
            '35. deriveWorldSpatialActivity: vertical motion outranks BUILDING — a selection underneath an airborne avatar is not what\'s happening right now');
        assert(deriveWorldSpatialActivity({ falling: true, isMoving: true }) === WorldSpatialActivity.FALLING,
            '36. deriveWorldSpatialActivity: vertical motion outranks WALKING');
        assert(deriveWorldSpatialActivity({ gizmoActive: true, gizmoMode: 'translate', rising: true }) === WorldSpatialActivity.MOVING_STRUCTURE,
            '37. deriveWorldSpatialActivity: an active gizmo gesture still outranks vertical motion — the most specific, most intentional fact wins');
        assert(isValidWorldSpatialActivity(WorldSpatialActivity.JUMPING) && isValidWorldSpatialActivity(WorldSpatialActivity.FALLING),
            '38. isValidWorldSpatialActivity: recognizes both new values');
    }

    // -------------------------------------------------------------
    // Section F — FLAGSHIP: ground -> low step -> stair -> upper
    // platform -> walk off the edge -> FALLING -> land -> jump ->
    // RISING -> apex -> FALLING -> land, then determinism.
    // -------------------------------------------------------------
    function buildClimbDocument() {
        return documentWithBricks([
            // 1. A low step, exactly like every flagship since 0.3.2.
            new Brick({ definitionId: 'core:plate_2x4', position: new Position(0, plate.height / 2, 1.5) }),
            // 2. A stair, climbing tread by tread up to height 1.0 —
            //    spans world Z in [4, 5].
            new Brick({ definitionId: 'core:stair', position: new Position(0, stair.height / 2, 4.5), rotation: -90 }),
            // 3. An upper platform, flush with the stair's own top (no
            //    lip between them) — spans world Z in [5, 9]. Nothing
            //    stands beyond it: walking off its own far edge is a
            //    genuine, unsupported 1.0-unit drop.
            new Brick({ definitionId: 'core:slab_4x4', position: new Position(0, stair.height - slab.height / 2, 7) })
        ]);
    }

    async function runVerticalFlagship(username) {
        const loadedDocuments = new Map([['flagship-vertical', buildClimbDocument()]]);
        const getWorldPosition = () => ({ x: 0, y: 0, z: 0 });
        const movementConstraint = new AvatarMovementConstraint({ loadedDocuments, getWorldPosition, brickRegistry, maxStepHeight: DEFAULT_MAX_STEP_HEIGHT });
        const stepConstraint = new AvatarStepConstraint({ loadedDocuments, getWorldPosition, brickRegistry });
        const avatarPresenceSession = buildAvatarPresence(registry, username, { x: 0, y: 0, z: 0 });
        const controller = new AvatarMovementController(avatarPresenceSession, movementConstraint, null, stepConstraint);

        const trajectory = [];
        const phases = { reachedPlatform: false, sawFalling: false, landedAfterFall: false, sawRisingAnimation: false, sawRising: false, jumpLanded: false };

        // Phase A + B + C — climb the step/stair onto the platform,
        // keep walking, fall off its far edge, land.
        controller.keyDown('w');
        for (let i = 0; i < 900; i++) {
            controller.tick(0.03);
            const p = avatarPresenceSession.current.position;
            const vs = controller.verticalState();
            trajectory.push({ x: p.x, y: p.y, z: p.z, vs });
            if (almostEqual(p.y, stair.height, 1e-3) && p.z > 5 && p.z < 9) phases.reachedPlatform = true;
            if (vs === AvatarVerticalState.FALLING) phases.sawFalling = true;
            if (phases.sawFalling && vs === AvatarVerticalState.SUPPORTED && p.z > 9) phases.landedAfterFall = true;
        }
        controller.keyUp('w');
        assert(controller.verticalState() === AvatarVerticalState.SUPPORTED,
            `FLAGSHIP sanity (${username}): the avatar is genuinely back on the ground before Phase D begins — increase the tick budget above if this ever fails`);

        // Phase D — Space only ever jumps while grounded (see
        // core/AvatarMovementSimulation.js, unchanged since 0.2.36):
        // RISING -> apex -> FALLING -> landing.
        controller.keyDown(' ');
        for (let i = 0; i < 10; i++) {
            controller.tick(0.03);
            const p = avatarPresenceSession.current.position;
            const vs = controller.verticalState();
            trajectory.push({ x: p.x, y: p.y, z: p.z, vs });
            if (vs === AvatarVerticalState.RISING) phases.sawRising = true;
            if (avatarPresenceSession.current.animation === AvatarAnimationState.JUMPING) phases.sawRisingAnimation = true;
        }
        controller.keyUp(' ');
        for (let i = 0; i < 150; i++) {
            controller.tick(0.03);
            const p = avatarPresenceSession.current.position;
            const vs = controller.verticalState();
            trajectory.push({ x: p.x, y: p.y, z: p.z, vs });
            if (phases.sawRising && vs === AvatarVerticalState.SUPPORTED) phases.jumpLanded = true;
        }

        return { trajectory, phases, finalPosition: avatarPresenceSession.current.position };
    }

    {
        const run = await runVerticalFlagship('alice-vertical-flagship');
        assert(run.phases.reachedPlatform, '39. FLAGSHIP Phase A: Alice climbs the low step and the stair onto the upper platform');
        assert(run.phases.sawFalling, '40. FLAGSHIP Phase B: walking off the platform\'s own far edge transitions to FALLING');
        assert(run.phases.landedAfterFall, '41. FLAGSHIP Phase C: Alice lands and returns to SUPPORTED, on the flat ground beyond the platform');
        assert(run.phases.sawRising, '42. FLAGSHIP Phase D: pressing Space from the ground transitions to RISING');
        assert(run.phases.sawRisingAnimation, '43. FLAGSHIP Phase D: the ascending half of the jump reports the JUMPING animation, exactly like every jump since 0.2.36');
        assert(run.phases.jumpLanded, '44. FLAGSHIP Phase D: the jump completes its own arc and lands back to SUPPORTED');
    }
    {
        // Phase E — determinism: identical initial state + identical
        // scripted inputs + identical World => an identical trajectory,
        // tick for tick, vertical state for vertical state.
        const runA = await runVerticalFlagship('alice-vertical-determinism-a');
        const runB = await runVerticalFlagship('alice-vertical-determinism-b');
        assert(runA.trajectory.length === runB.trajectory.length, '45. FLAGSHIP Phase E: determinism — identical tick counts');
        let identical = true;
        for (let i = 0; i < runA.trajectory.length; i++) {
            const a = runA.trajectory[i];
            const b = runB.trajectory[i];
            if (!almostEqual(a.x, b.x) || !almostEqual(a.y, b.y) || !almostEqual(a.z, b.z) || a.vs !== b.vs) {
                identical = false;
                break;
            }
        }
        assert(identical, '46. FLAGSHIP Phase E: the exact same trajectory AND vertical-state sequence results from the exact same initial state, inputs, and World, tick for tick — no randomness, no wall-clock dependency anywhere in the pipeline');
    }

    // -------------------------------------------------------------
    // Section G — Edge case: falling lands on a SLOPE's own per-point
    // surface, never a brick's flat bounding-box max and never merely
    // "back to the flat baseline." This is the payoff named in
    // docs/Roadmap.md: falling reads the exact same WalkableSurface
    // abstraction walking always has.
    // -------------------------------------------------------------
    {
        const RAISED_HEIGHT = 2;
        // A small "diving platform" touching a slope's own low edge —
        // no gap of bare ground between them, so the very first support
        // height queried once the avatar leaves the platform is already
        // the slope's own, never the flat plane.
        const document = documentWithBricks([
            new Brick({ definitionId: 'core:cube', position: new Position(0, RAISED_HEIGHT - cube.height / 2, 0) }), // top = 2, spans z:[-0.5, 0.5]
            new Brick({ definitionId: 'core:slope_45', position: new Position(0, slope.height / 2, 1), rotation: -90 }) // spans z:[0.5, 1.5], climbs 0 -> 1.0
        ]);
        const loadedDocuments = new Map([['doc-edge-slope', document]]);
        const getWorldPosition = () => ({ x: 0, y: 0, z: 0 });
        const movementConstraint = new AvatarMovementConstraint({ loadedDocuments, getWorldPosition, brickRegistry, maxStepHeight: DEFAULT_MAX_STEP_HEIGHT });
        const stepConstraint = new AvatarStepConstraint({ loadedDocuments, getWorldPosition, brickRegistry });
        const avatarPresenceSession = buildAvatarPresence(registry, 'vertical-edge-slope', { x: 0, y: RAISED_HEIGHT, z: -0.3 });
        const controller = new AvatarMovementController(avatarPresenceSession, movementConstraint, null, stepConstraint);

        controller.keyDown('w');
        let fellAt = null;
        let frozen = null;
        for (let i = 0; i < 400 && !frozen; i++) {
            controller.tick(0.03);
            const vs = controller.verticalState();
            if (fellAt === null && vs === AvatarVerticalState.FALLING) {
                fellAt = i;
            } else if (fellAt !== null && i - fellAt >= 5) {
                // A few more ticks of forward drift, still mid-fall,
                // carries the avatar well into the slope's own
                // interior before input is released — proving the
                // eventual landing height genuinely comes from a
                // per-point ramp position, not merely its low edge.
                const p = avatarPresenceSession.current.position;
                frozen = { x: p.x, z: p.z };
                controller.keyUp('w');
            }
        }
        assert(fellAt !== null, '47. Edge case: the avatar leaves the diving platform and starts falling');
        assert(frozen !== null, '48. Edge case: forward input is released a few ticks into the fall, freezing X/Z for a pure vertical drop from there');

        const expectedHeight = stepConstraint.supportHeightAt(frozen.x, frozen.z);
        assert(expectedHeight > 0.05 && expectedHeight < slope.height - 0.05,
            '49. Edge case: the frozen landing point sits genuinely INSIDE the slope\'s own ramp — neither its base nor its peak');

        let landed = false;
        for (let i = 0; i < 400 && !landed; i++) {
            controller.tick(0.03);
            if (controller.verticalState() === AvatarVerticalState.SUPPORTED) landed = true;
        }
        assert(landed, '50. Edge case: the avatar eventually lands');
        const finalPosition = avatarPresenceSession.current.position;
        assert(almostEqual(finalPosition.x, frozen.x) && almostEqual(finalPosition.z, frozen.z),
            '51. Edge case: X/Z never drifted once forward input was released — a pure vertical fall, no residual momentum');
        assert(almostEqual(finalPosition.y, expectedHeight, 1e-3),
            '52. Edge case: the avatar lands EXACTLY on the slope\'s own per-point WalkableSurface height — never the brick\'s flat bounding-box max (2 or 1), and never the flat baseline (0)');
    }

    console.log('✅ All Vertical World Navigation tests passed.');
}

await runTests();
