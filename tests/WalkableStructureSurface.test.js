import {
    WalkableSurfaceKind,
    DEFAULT_STAIR_STEP_COUNT,
    walkableSurfaceKindFor,
    resolveWalkableSurfaceAt
} from '../core/WalkableSurface.js';
import { isStepClimbable, DEFAULT_MAX_STEP_HEIGHT } from '../core/BrickWalkability.js';
import { AvatarStepConstraint } from '../application/AvatarStepConstraint.js';
import { AvatarMovementConstraint } from '../application/AvatarMovementConstraint.js';
import { AvatarMovementController } from '../application/AvatarMovementController.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { AvatarProfileUseCase } from '../application/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';

// 0.3.3 — Walkable Structures.
//
//   Section A: core/WalkableSurface.js — pure per-shape surface geometry
//   Section B: walkableSurfaceKindFor() — the definitionId -> shape lookup
//   Section C: application/AvatarStepConstraint.js — real stair/slope support height
//   Section D: application/AvatarMovementConstraint.js — a directional shape is
//              never a flat-topped wall, even when its own peak is unreachable
//   Section E: AvatarMovementController — climbing a stair and a slope end to end
//   Section F: FLAGSHIP — the design doc's own scripted scenario
//   Section G: Geometry flagship — continuity across brick/tread boundaries
//
// Central architectural claim under test throughout — see
// docs/Principles.md, "Walkability Is Not Collision (0.3.3)":
// core/SpatialBounds.js and core/AvatarCollision.js keep answering "what
// occupies this space," entirely unchanged; core/WalkableSurface.js
// answers a different question, "where may an avatar stand," and a
// stair/slope's own non-uniform walkable height is never reduced to a
// single AABB scalar anywhere in this pipeline. No physics engine, no
// momentum — every step remains the exact same deterministic
// height constraint 0.3.2 already established, just applied to a real
// per-point surface height instead of a single flat top face.

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

function almostEqual(a, b, epsilon = 1e-9) {
    return Math.abs(a - b) < epsilon;
}

function buildRegistry() {
    const registry = new AvatarTemplateRegistry();
    registry.register(CoreAvatarTemplateLibrary);
    return registry;
}

function buildAvatarStack(registry, username) {
    const storage = new InMemoryStorageProvider();
    const identityProvider = new LocalIdentityProvider(storage);
    identityProvider.login(username);
    const avatarProfileUseCase = new AvatarProfileUseCase(storage, identityProvider, registry);
    const profile = avatarProfileUseCase.getProfile();
    const avatarPresenceSession = new AvatarPresenceSession(profile);
    return { storage, identityProvider, avatarProfileUseCase, avatarPresenceSession };
}

// Same minimal, duck-typed "loaded document" tests/AvatarStepUpMovement.test.js
// already established — only `document.world.getBuildings()` is ever read.
function documentWithBricks(bricks) {
    const world = new World();
    const building = new Building({ creator: 'walkable-surface-test' });
    for (const brick of bricks) building.addBrick(brick);
    world.addBuilding(building);
    return { world };
}

function spyFacade() {
    const calls = { onAnimationFrameCallbacks: [] };
    return {
        calls,
        setLocalAvatar() {}, updateLocalAvatarAppearance() {},
        updateLocalAvatarPresence() {}, setLocalAvatarVisible() {}, removeLocalAvatar() {},
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
        dispose() {}
    };
}

async function runTests() {
    const registry = buildRegistry();
    const brickRegistry = new CreateBrickRegistryUseCase().execute();
    const stair = brickRegistry.get('core:stair');
    const slope = brickRegistry.get('core:slope_45');
    const cube = brickRegistry.get('core:cube');
    const plate = brickRegistry.get('core:plate_2x4');
    const slab = brickRegistry.get('core:slab_4x4');

    // -------------------------------------------------------------
    // Section A — core/WalkableSurface.js: pure per-shape geometry
    // -------------------------------------------------------------
    {
        // FLAT delegates straight back to walkableTopAt() — identical
        // to a plain box, unchanged from 0.3.2.
        const surface = resolveWalkableSurfaceAt({
            shapeKind: WalkableSurfaceKind.FLAT, center: { x: 0, y: 1, z: 0 }, width: 1, height: 2, depth: 1
        }, 0, 0);
        assert(surface !== null && surface.height === 2, '1. FLAT: reports the box\'s own top face');
        assert(surface.kind === WalkableSurfaceKind.FLAT, '2. FLAT: kind is reported as FLAT');
        assert(surface.normal.x === 0 && surface.normal.y === 1 && surface.normal.z === 0, '3. FLAT: normal points straight up');
        const outside = resolveWalkableSurfaceAt({
            shapeKind: WalkableSurfaceKind.FLAT, center: { x: 0, y: 1, z: 0 }, width: 1, height: 2, depth: 1
        }, 10, 10);
        assert(outside === null, '4. FLAT: outside the footprint reports null, never a height of zero');
    }
    {
        // STEP: a 1x1x1 stair, unrotated, centered at the world
        // origin — ascends along LOCAL +X in DEFAULT_STAIR_STEP_COUNT
        // discrete treads, exactly matching
        // renderer/ThreeBrickFactory.js's own stairMeshFactory() profile.
        const geometry = { shapeKind: WalkableSurfaceKind.STEP, center: { x: 0, y: 0.5, z: 0 }, width: 1, height: 1, depth: 1 };
        const stepHeight = 1 / DEFAULT_STAIR_STEP_COUNT;

        const front = resolveWalkableSurfaceAt(geometry, -0.5, 0);
        assert(front !== null && almostEqual(front.height, stepHeight), '5. STEP: the very front edge is already one riser up, never a zero-height lip');
        assert(front.kind === WalkableSurfaceKind.STEP, '6. STEP: kind is reported as STEP');

        const back = resolveWalkableSurfaceAt(geometry, 0.5, 0);
        assert(almostEqual(back.height, 1), '7. STEP: the back edge reports the FULL brick height — identical to an ordinary flat-topped box of the same height');

        const mid = resolveWalkableSurfaceAt(geometry, 0, 0);
        // x=0 is the boundary between the 2nd and 3rd tread (stepWidth=0.25);
        // floor(0.5 / 0.25) = 2 -> tread index 2 -> height (2+1)*0.25 = 0.75.
        assert(almostEqual(mid.height, 0.75), '8. STEP: an interior point reports its own tread\'s height, not the brick\'s overall extremes');

        assert(resolveWalkableSurfaceAt(geometry, 10, 10) === null, '9. STEP: outside the footprint reports null');
        assert(resolveWalkableSurfaceAt(geometry, 0, 0.5) !== null, '10. STEP: the depth-axis edge is inclusive, matching walkableTopAt()\'s own convention');
    }
    {
        // STEP: honoring Brick.rotation — a stair rotated -90° climbs
        // along WORLD +Z instead of WORLD +X, so an avatar walking
        // straight toward it (its default facing) actually experiences
        // a climb rather than a constant mid-tread height throughout.
        const geometry = {
            shapeKind: WalkableSurfaceKind.STEP, center: { x: 0, y: 0.5, z: 5 }, width: 1, height: 1, depth: 1, rotationDegrees: -90
        };
        const stepHeight = 1 / DEFAULT_STAIR_STEP_COUNT;
        const nearEdge = resolveWalkableSurfaceAt(geometry, 0, 4.5);
        const farEdge = resolveWalkableSurfaceAt(geometry, 0, 5.5);
        assert(almostEqual(nearEdge.height, stepHeight), '11. STEP + rotation: the near (low-Z) edge is the FIRST tread, not the last');
        assert(almostEqual(farEdge.height, 1), '12. STEP + rotation: the far (high-Z) edge is the full brick height');
        // Walking straight along world X (perpendicular to the rotated
        // climb axis) at a fixed Z stays on the SAME tread the whole way.
        const sideA = resolveWalkableSurfaceAt(geometry, -0.4, 4.5);
        const sideB = resolveWalkableSurfaceAt(geometry, 0.4, 4.5);
        assert(almostEqual(sideA.height, sideB.height), '13. STEP + rotation: strafing along the tread\'s own uniform axis never changes height');
    }
    {
        // SLOPE: a 1x1x1 slope_45 ramps CONTINUOUSLY from 0 to the
        // full brick height across its own width — rise/run = 1, a
        // true 45 degrees, and never discretized into treads.
        const geometry = { shapeKind: WalkableSurfaceKind.SLOPE, center: { x: 0, y: 0.5, z: 0 }, width: 1, height: 1, depth: 1 };
        const front = resolveWalkableSurfaceAt(geometry, -0.5, 0);
        const mid = resolveWalkableSurfaceAt(geometry, 0, 0);
        const back = resolveWalkableSurfaceAt(geometry, 0.5, 0);
        assert(almostEqual(front.height, 0), '14. SLOPE: the front (low) edge is exactly the brick\'s own base');
        assert(almostEqual(mid.height, 0.5), '15. SLOPE: the midpoint is exactly halfway up — a straight ramp, not a curve or a stair');
        assert(almostEqual(back.height, 1), '16. SLOPE: the back (high) edge is the full brick height');
        assert(mid.kind === WalkableSurfaceKind.SLOPE, '17. SLOPE: kind is reported as SLOPE');

        // Monotonic, strictly increasing across many sample points —
        // proof this is a genuine continuous ramp, not a hidden stair.
        let previous = -Infinity;
        let sawStrictIncrease = false;
        for (let i = 0; i <= 20; i++) {
            const localX = -0.5 + i * (1 / 20);
            const sample = resolveWalkableSurfaceAt(geometry, localX, 0);
            assert(sample.height >= previous - 1e-9, `18.${i} SLOPE: height is monotonically non-decreasing along the ramp`);
            if (sample.height > previous + 1e-6) sawStrictIncrease = true;
            previous = sample.height;
        }
        assert(sawStrictIncrease, '19. SLOPE: the ramp genuinely rises across its sampled span, not a flat plateau');

        // The normal is a real unit vector, tilted away from straight
        // up (never used by movement this milestone — see
        // docs/Roadmap.md — but must still be well-formed).
        const length = Math.sqrt(mid.normal.x ** 2 + mid.normal.y ** 2 + mid.normal.z ** 2);
        assert(almostEqual(length, 1, 1e-6), '20. SLOPE: the reported normal is unit length');
        assert(mid.normal.y > 0 && mid.normal.y < 1, '21. SLOPE: the normal tilts away from straight up — a real ramp, not a flat top');
    }
    {
        // Degenerate/defensive inputs never throw.
        assert(resolveWalkableSurfaceAt(null, 0, 0) === null, '22. resolveWalkableSurfaceAt: a missing geometry degrades to null, never throws');
        assert(resolveWalkableSurfaceAt({ shapeKind: WalkableSurfaceKind.FLAT, center: { x: 0, y: 0, z: 0 } }, 0, 0) === null,
            '23. resolveWalkableSurfaceAt: missing width/height/depth degrades to null, never throws');
    }

    // -------------------------------------------------------------
    // Section B — walkableSurfaceKindFor(): the definitionId lookup
    // -------------------------------------------------------------
    {
        assert(walkableSurfaceKindFor('core:stair') === WalkableSurfaceKind.STEP, '24. walkableSurfaceKindFor: core:stair is STEP');
        assert(walkableSurfaceKindFor('core:slope_45') === WalkableSurfaceKind.SLOPE, '25. walkableSurfaceKindFor: core:slope_45 is SLOPE');
        assert(walkableSurfaceKindFor('core:cube') === WalkableSurfaceKind.FLAT, '26. walkableSurfaceKindFor: an ordinary box is FLAT');
        assert(walkableSurfaceKindFor('core:not-a-real-definition') === WalkableSurfaceKind.FLAT,
            '27. walkableSurfaceKindFor: an unrecognized definitionId degrades to FLAT, never throws');
    }

    // -------------------------------------------------------------
    // Section C — application/AvatarStepConstraint.js: real stair/slope
    // support height, through the exact same public supportHeightAt()
    // 0.3.2 already established.
    // -------------------------------------------------------------
    {
        const document = documentWithBricks([
            new Brick({ definitionId: 'core:stair', position: new Position(0, stair.height / 2, 0), rotation: 0 })
        ]);
        const loadedDocuments = new Map([['doc-stair', document]]);
        const constraint = new AvatarStepConstraint({ loadedDocuments, getWorldPosition: () => ({ x: 0, y: 0, z: 0 }), brickRegistry });
        const stepHeight = stair.height / DEFAULT_STAIR_STEP_COUNT;
        assert(almostEqual(constraint.supportHeightAt(-0.5, 0), stepHeight), '28. AvatarStepConstraint: reports the stair\'s own first tread height at its front edge');
        assert(almostEqual(constraint.supportHeightAt(0.5, 0), stair.height), '29. AvatarStepConstraint: reports the stair\'s own full height at its back edge');
        assert(constraint.supportHeightAt(50, 50) === 0, '30. AvatarStepConstraint: far outside the stair, support height is still the flat plane');
    }
    {
        const document = documentWithBricks([
            new Brick({ definitionId: 'core:slope_45', position: new Position(0, slope.height / 2, 0), rotation: 0 })
        ]);
        const loadedDocuments = new Map([['doc-slope', document]]);
        const constraint = new AvatarStepConstraint({ loadedDocuments, getWorldPosition: () => ({ x: 0, y: 0, z: 0 }), brickRegistry });
        assert(almostEqual(constraint.supportHeightAt(0, 0), slope.height / 2), '31. AvatarStepConstraint: reports the slope\'s own continuous ramp height at its midpoint');
    }
    {
        // A stair sitting BEHIND a stack of an already-loaded flat
        // brick still reports the topmost surface among ALL loaded
        // geometry, at each point independently — never "whichever
        // brick was added first."
        const document = documentWithBricks([
            new Brick({ definitionId: 'core:stair', position: new Position(0, stair.height / 2, 0) }),
            new Brick({ definitionId: 'core:cube', position: new Position(5, cube.height / 2, 0) })
        ]);
        const loadedDocuments = new Map([['doc-mixed', document]]);
        const constraint = new AvatarStepConstraint({ loadedDocuments, getWorldPosition: () => ({ x: 0, y: 0, z: 0 }), brickRegistry });
        assert(almostEqual(constraint.supportHeightAt(0.5, 0), stair.height), '32. AvatarStepConstraint: the stair\'s own surface wins at its own footprint');
        assert(almostEqual(constraint.supportHeightAt(5, 0), cube.height), '33. AvatarStepConstraint: the unrelated cube\'s own flat top wins at ITS footprint, unaffected by the stair');
        assert(constraint.supportHeightAt(2.5, 0) === 0, '34. AvatarStepConstraint: between the two, plain flat ground');
    }

    // -------------------------------------------------------------
    // Section D — application/AvatarMovementConstraint.js: a
    // directional shape is never a flat wall via its own peak height.
    // -------------------------------------------------------------
    {
        // Backward compatibility: with stepping entirely OFF
        // (maxStepHeight omitted, the pre-0.3.2 default), a stair is
        // still a genuine, full-height wall — exactly as before this
        // milestone and 0.3.2 alike.
        const document = documentWithBricks([
            new Brick({ definitionId: 'core:stair', position: new Position(1, stair.height / 2, 0) })
        ]);
        const loadedDocuments = new Map([['doc-off', document]]);
        const constraint = new AvatarMovementConstraint({ loadedDocuments, getWorldPosition: () => ({ x: 0, y: 0, z: 0 }), brickRegistry });
        const result = constraint.apply({ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 });
        assert(result.collided === true, '35. AvatarMovementConstraint: with stepping off, a stair still blocks like an ordinary wall');
    }
    {
        // With stepping ON, a stair is excluded from horizontal
        // collision UNCONDITIONALLY — even though its own overall peak
        // height (1.0) is far beyond maxStepHeight (0.6), which would
        // have blocked an ordinary flat brick of the same overall height.
        const document = documentWithBricks([
            new Brick({ definitionId: 'core:stair', position: new Position(1, stair.height / 2, 0) })
        ]);
        assert(stair.height > DEFAULT_MAX_STEP_HEIGHT, 'sanity: core:stair is taller overall than the default step limit');
        const loadedDocuments = new Map([['doc-on', document]]);
        const constraint = new AvatarMovementConstraint({
            loadedDocuments, getWorldPosition: () => ({ x: 0, y: 0, z: 0 }), brickRegistry, maxStepHeight: DEFAULT_MAX_STEP_HEIGHT
        });
        const result = constraint.apply({ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { supportHeight: 0 });
        assert(result.collided === false && result.position.x === 2,
            '36. AvatarMovementConstraint: a stair is excluded from horizontal collision entirely once stepping is enabled, regardless of its own overall peak height');
    }
    {
        // The same is true for a slope.
        const document = documentWithBricks([
            new Brick({ definitionId: 'core:slope_45', position: new Position(1, slope.height / 2, 0) })
        ]);
        const loadedDocuments = new Map([['doc-slope-on', document]]);
        const constraint = new AvatarMovementConstraint({
            loadedDocuments, getWorldPosition: () => ({ x: 0, y: 0, z: 0 }), brickRegistry, maxStepHeight: DEFAULT_MAX_STEP_HEIGHT
        });
        const result = constraint.apply({ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { supportHeight: 0 });
        assert(result.collided === false, '37. AvatarMovementConstraint: a slope is likewise excluded from horizontal collision once stepping is enabled');
    }
    {
        // An ordinary FLAT brick's own peak-height comparison is
        // completely unaffected by any of this — zero regression.
        const document = documentWithBricks([
            new Brick({ definitionId: 'core:cube', position: new Position(1, cube.height / 2, 0) })
        ]);
        const loadedDocuments = new Map([['doc-flat-still', document]]);
        const constraint = new AvatarMovementConstraint({
            loadedDocuments, getWorldPosition: () => ({ x: 0, y: 0, z: 0 }), brickRegistry, maxStepHeight: DEFAULT_MAX_STEP_HEIGHT
        });
        const result = constraint.apply({ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { supportHeight: 0 });
        assert(result.collided === true, '38. AvatarMovementConstraint: a plain too-tall flat cube still blocks exactly like 0.3.2 — the directional-shape carve-out never widens to ordinary boxes');
    }

    // -------------------------------------------------------------
    // Section E — AvatarMovementController: climbing a stair and a
    // slope end to end, tread by tread / continuously.
    // -------------------------------------------------------------
    {
        const { avatarPresenceSession } = buildAvatarStack(registry, 'walkable-stair-climb');
        // Rotated -90 so the stair's own climb axis (LOCAL +X) aligns
        // with WORLD +Z — the avatar's own default walking direction
        // (rotation 0 faces +Z, see core/AvatarMovementSimulation.js).
        // A flat landing immediately beyond the stair's own far edge
        // (flush with its own top) lets the avatar actually WALK OFF
        // the top once climbed, onto more flat, valid support — proving
        // the climb reached a genuinely walkable surface, not merely a
        // single-tick peak. The landing itself is finite (`plate_2x4`
        // is 4 units deep — see core/library/CoreLibrary.js), so a long
        // enough walk eventually crosses ITS OWN far edge too and falls
        // (0.3.4 — see tests/AvatarVerticalNavigation.test.js for that
        // behavior in full); this test only cares about what happens
        // WHILE still on the stair/landing, so it watches for the
        // full-height/far-edge facts DURING the walk rather than
        // asserting on wherever the avatar has wandered to once the
        // fixed tick budget below runs out.
        const document = documentWithBricks([
            new Brick({ definitionId: 'core:stair', position: new Position(0, stair.height / 2, 3), rotation: -90 }),
            new Brick({ definitionId: 'core:plate_2x4', position: new Position(0, stair.height - plate.height / 2, 5.5) })
        ]);
        const loadedDocuments = new Map([['doc-climb', document]]);
        const getWorldPosition = () => ({ x: 0, y: 0, z: 0 });
        const movementConstraint = new AvatarMovementConstraint({ loadedDocuments, getWorldPosition, brickRegistry, maxStepHeight: DEFAULT_MAX_STEP_HEIGHT });
        const stepConstraint = new AvatarStepConstraint({ loadedDocuments, getWorldPosition, brickRegistry });
        const controller = new AvatarMovementController(avatarPresenceSession, movementConstraint, null, stepConstraint);

        controller.keyDown('w');
        const observedHeights = new Set();
        let reachedFullHeight = false;
        let crossedFarEdge = false;
        for (let i = 0; i < 400; i++) {
            controller.tick(0.03);
            const p = avatarPresenceSession.current.position;
            observedHeights.add(Math.round(p.y * 1000) / 1000);
            if (p.y >= stair.height - 1e-6) reachedFullHeight = true;
            if (p.z > 3.5) crossedFarEdge = true;
        }
        controller.keyUp('w');

        const stepHeight = Math.round((stair.height / DEFAULT_STAIR_STEP_COUNT) * 1000) / 1000;
        assert(observedHeights.has(stepHeight), '39. AvatarMovementController: the avatar visibly rests on the FIRST tread at some point');
        assert(observedHeights.size >= 3, '40. AvatarMovementController: the avatar visibly rests at several DISTINCT tread heights while climbing, not a single jump straight to the top');
        assert(reachedFullHeight,
            '41. AvatarMovementController: the avatar reaches the stair\'s own full height by climbing tread by tread');
        assert(crossedFarEdge,
            '42. AvatarMovementController: the avatar actually crosses past the stair\'s own far edge — it was climbed, not merely tolerated');
    }
    {
        const { avatarPresenceSession } = buildAvatarStack(registry, 'walkable-slope-climb');
        const document = documentWithBricks([
            new Brick({ definitionId: 'core:slope_45', position: new Position(0, slope.height / 2, 3), rotation: -90 }),
            // Same landing-beyond-the-edge reasoning as the stair test
            // above — a flat landing to walk onto once the ramp is
            // crested. It is finite too, so this test watches for the
            // full-height fact DURING the walk rather than at the end
            // of a fixed tick budget that may, by then, have carried
            // the avatar off the landing's own far edge as well (0.3.4
            // — see tests/AvatarVerticalNavigation.test.js).
            new Brick({ definitionId: 'core:plate_2x4', position: new Position(0, slope.height - plate.height / 2, 5.5) })
        ]);
        const loadedDocuments = new Map([['doc-slope-climb', document]]);
        const getWorldPosition = () => ({ x: 0, y: 0, z: 0 });
        const movementConstraint = new AvatarMovementConstraint({ loadedDocuments, getWorldPosition, brickRegistry, maxStepHeight: DEFAULT_MAX_STEP_HEIGHT });
        const stepConstraint = new AvatarStepConstraint({ loadedDocuments, getWorldPosition, brickRegistry });
        const controller = new AvatarMovementController(avatarPresenceSession, movementConstraint, null, stepConstraint);

        controller.keyDown('w');
        let sawStrictlyBetween = false;
        let reachedFullHeight = false;
        for (let i = 0; i < 400; i++) {
            controller.tick(0.03);
            const y = avatarPresenceSession.current.position.y;
            assert(Number.isFinite(y), '43. AvatarMovementController: the avatar\'s Y stays finite throughout a slope climb');
            if (y > 0.05 && y < slope.height - 0.05) sawStrictlyBetween = true;
            if (y >= slope.height - 1e-6) reachedFullHeight = true;
        }
        controller.keyUp('w');
        assert(sawStrictlyBetween, '44. AvatarMovementController: the avatar passes through a genuinely intermediate height while crossing the slope — a continuous ramp, not a teleport');
        assert(reachedFullHeight, '45. AvatarMovementController: the avatar reaches the slope\'s own full height');
    }
    {
        // Approaching a stair from its OWN tall/back side directly
        // (never having touched a lower tread first) is genuinely
        // blocked — the per-tick height-delta check still protects
        // against this even though AvatarMovementConstraint no longer
        // treats the stair as a flat wall at all.
        const { avatarPresenceSession } = buildAvatarStack(registry, 'walkable-stair-backside');
        // Rotated +90 instead of -90 -- the stair's tall/back face now
        // meets an avatar walking in +Z FIRST, instead of its low front.
        const document = documentWithBricks([
            new Brick({ definitionId: 'core:stair', position: new Position(0, stair.height / 2, 3), rotation: 90 })
        ]);
        const loadedDocuments = new Map([['doc-backside', document]]);
        const getWorldPosition = () => ({ x: 0, y: 0, z: 0 });
        const movementConstraint = new AvatarMovementConstraint({ loadedDocuments, getWorldPosition, brickRegistry, maxStepHeight: DEFAULT_MAX_STEP_HEIGHT });
        const stepConstraint = new AvatarStepConstraint({ loadedDocuments, getWorldPosition, brickRegistry });
        const controller = new AvatarMovementController(avatarPresenceSession, movementConstraint, null, stepConstraint);

        controller.keyDown('w');
        for (let i = 0; i < 300; i++) {
            controller.tick(0.03);
        }
        controller.keyUp('w');
        assert(avatarPresenceSession.current.position.y < DEFAULT_MAX_STEP_HEIGHT + 0.01,
            '46. AvatarMovementController: the avatar never climbs onto a stair\'s own tall back face directly');
        assert(avatarPresenceSession.current.position.z < 2.6,
            '47. AvatarMovementController: the avatar is genuinely stopped before the stair\'s own footprint, never standing inside it at the wrong height');
    }

    // -------------------------------------------------------------
    // Section F — FLAGSHIP: ground -> low step -> stair -> slope ->
    // upper platform -> tall wall, rejected.
    // -------------------------------------------------------------
    function buildFlagshipDocument() {
        return documentWithBricks([
            // 1. A low step, exactly like 0.3.2's own flagship.
            new Brick({ definitionId: 'core:plate_2x4', position: new Position(0, plate.height / 2, 1.5) }),
            // 2. A stair, rotated so its climb axis meets the avatar's
            //    own default +Z walk direction — spans world Z in [4, 5].
            new Brick({ definitionId: 'core:stair', position: new Position(0, stair.height / 2, 4.5), rotation: -90 }),
            // 3. A slope, immediately continuing the stair's own top
            //    height (1.0) up to 2.0 — spans world Z in [5, 6].
            new Brick({ definitionId: 'core:slope_45', position: new Position(0, stair.height + slope.height / 2, 5.5), rotation: -90 }),
            // 4. An upper platform, its own top flush with the slope's
            //    own top (2.0) — no additional lip between them —
            //    spans world Z in [6, 10].
            new Brick({ definitionId: 'core:slab_4x4', position: new Position(0, stair.height + slope.height - slab.height / 2, 8) }),
            // 5. A tall wall standing ON the platform, well beyond
            //    maxStepHeight above it — genuinely impassable.
            new Brick({ definitionId: 'core:cube', position: new Position(0, stair.height + slope.height + cube.height / 2, 9) })
        ]);
    }

    async function runFlagshipScenario(username) {
        const storage = new InMemoryStorageProvider();
        const alice = new LocalIdentityProvider(storage);
        alice.login(username);
        const avatarProfileUseCase = new AvatarProfileUseCase(storage, alice, registry);
        avatarProfileUseCase.updateProfile({ templateId: 'humanoid-01', displayName: 'Alice' });
        const profile = avatarProfileUseCase.getProfile();
        const avatarPresenceSession = new AvatarPresenceSession(profile, { position: { x: 0, y: 0, z: 0 } });

        const session = new WorldNavigationSession({
            registry: brickRegistry, loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            identityProvider: alice, avatarProfileUseCase, avatarPresenceSession, avatarTemplateRegistry: registry
        });
        session._session = spyFacade();
        session._setupLocalAvatar();
        session._loadedDocuments.set('flagship-walkable', buildFlagshipDocument());
        session._getWorldPosition = () => ({ x: 0, y: 0, z: 0 });

        const trajectory = [];
        session.setAvatarControlMode(true);
        session.avatarKeyDown('w');
        let reachedPlatform = false;
        for (let i = 0; i < 1400; i++) {
            session._avatarMovementController.tick(0.03);
            const p = avatarPresenceSession.current.position;
            assert(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z),
                `48.${i} FLAGSHIP: position stays finite at every tick — no NaN/Infinity anywhere in the pipeline`);
            trajectory.push({ x: p.x, y: p.y, z: p.z });
            if (almostEqual(p.y, stair.height + slope.height, 1e-3) && p.z > 6) reachedPlatform = true;
        }
        // Keep walking well past the platform to prove the wall genuinely stops Alice.
        for (let i = 0; i < 300; i++) {
            session._avatarMovementController.tick(0.03);
            const p = avatarPresenceSession.current.position;
            trajectory.push({ x: p.x, y: p.y, z: p.z });
        }
        session.avatarKeyUp('w');

        return { trajectory, reachedPlatform, finalPosition: avatarPresenceSession.current.position };
    }

    {
        const run = await runFlagshipScenario('alice-walkable-flagship');
        assert(run.reachedPlatform, '49. FLAGSHIP: Alice reaches the upper platform, having climbed the low step, the stair, AND the slope in sequence');
        assert(run.finalPosition.y < stair.height + slope.height + cube.height - DEFAULT_MAX_STEP_HEIGHT,
            '50. FLAGSHIP: Alice never climbs onto the tall wall standing on the platform');
        assert(almostEqual(run.finalPosition.y, stair.height + slope.height, 1e-3),
            '51. FLAGSHIP: Alice remains resting on the platform\'s own valid support surface, not somewhere ungrounded/ambiguous');
        assert(run.finalPosition.z < 9 - 0.3,
            '52. FLAGSHIP: Alice never crosses into the tall wall\'s own footprint — genuinely rejected, not merely slowed');
    }
    {
        // Determinism: identical initial state + identical inputs +
        // identical World => an identical trajectory, tick for tick.
        const runA = await runFlagshipScenario('alice-walkable-determinism-a');
        const runB = await runFlagshipScenario('alice-walkable-determinism-b');
        assert(runA.trajectory.length === runB.trajectory.length, '53. FLAGSHIP: determinism — identical tick counts');
        let identical = true;
        for (let i = 0; i < runA.trajectory.length; i++) {
            const a = runA.trajectory[i];
            const b = runB.trajectory[i];
            if (!almostEqual(a.x, b.x) || !almostEqual(a.y, b.y) || !almostEqual(a.z, b.z)) {
                identical = false;
                break;
            }
        }
        assert(identical, '54. FLAGSHIP: determinism — the exact same trajectory results from the exact same initial state, inputs, and World, tick for tick');
    }

    // -------------------------------------------------------------
    // Section G — Geometry flagship: continuity across boundaries.
    // -------------------------------------------------------------
    {
        // Two adjacent FLAT bricks of the SAME height, touching edges
        // — sampling just before and just after the shared seam must
        // never show a spurious bump. (See the design doc's own
        // concern: "we don't want a tiny discontinuity to produce an
        // unexpected avatar bump.")
        const document = documentWithBricks([
            new Brick({ definitionId: 'core:cube', position: new Position(0, cube.height / 2, 0) }),
            new Brick({ definitionId: 'core:cube', position: new Position(1, cube.height / 2, 0) }) // touches at x = 0.5
        ]);
        const loadedDocuments = new Map([['doc-seam', document]]);
        const constraint = new AvatarStepConstraint({ loadedDocuments, getWorldPosition: () => ({ x: 0, y: 0, z: 0 }), brickRegistry });
        const epsilon = 1e-6;
        const justBefore = constraint.supportHeightAt(0.5 - epsilon, 0);
        const justAfter = constraint.supportHeightAt(0.5 + epsilon, 0);
        assert(almostEqual(justBefore, cube.height, 1e-4), '55. Geometry: just before a flat-flat seam reports the shared height');
        assert(almostEqual(justAfter, cube.height, 1e-4), '56. Geometry: just after the SAME seam reports the identical height — no discontinuity between two equal-height neighbors');
    }
    {
        // A stair's own tread boundary DOES show a jump — and it must
        // be EXACTLY one riser, deterministically, never a surprise.
        const geometry = { shapeKind: WalkableSurfaceKind.STEP, center: { x: 0, y: 0.5, z: 0 }, width: 1, height: 1, depth: 1 };
        const stepWidth = 1 / DEFAULT_STAIR_STEP_COUNT;
        const stepHeight = 1 / DEFAULT_STAIR_STEP_COUNT;
        const boundaryX = -0.5 + stepWidth; // the seam between tread 0 and tread 1
        const epsilon = 1e-6;
        const before = resolveWalkableSurfaceAt(geometry, boundaryX - epsilon, 0);
        const after = resolveWalkableSurfaceAt(geometry, boundaryX + epsilon, 0);
        assert(almostEqual(before.height, stepHeight, 1e-4), '57. Geometry: just before a tread riser is the LOWER tread\'s own height');
        assert(almostEqual(after.height, stepHeight * 2, 1e-4), '58. Geometry: just after the SAME riser is EXACTLY one riser higher — a deterministic, intentional jump, not float noise');
        assert(isStepClimbable(before.height, after.height, DEFAULT_MAX_STEP_HEIGHT),
            '59. Geometry: a single stair riser stays well within the default step limit — genuinely climbable tread by tread');
    }
    {
        // A slope shows NO jump anywhere in its interior — arbitrarily
        // small movement produces arbitrarily small height change.
        const geometry = { shapeKind: WalkableSurfaceKind.SLOPE, center: { x: 0, y: 0.5, z: 0 }, width: 1, height: 1, depth: 1 };
        const epsilon = 1e-6;
        const before = resolveWalkableSurfaceAt(geometry, 0 - epsilon, 0);
        const after = resolveWalkableSurfaceAt(geometry, 0 + epsilon, 0);
        assert(Math.abs(after.height - before.height) < 1e-4, '60. Geometry: a slope\'s own height changes smoothly — no seam anywhere in its interior');
    }
    {
        // The footprint's own boundary is inclusive on the surface
        // side, matching core/BrickWalkability.js#walkableTopAt()'s
        // own documented convention — verified for a directional shape
        // too, not just FLAT.
        const geometry = { shapeKind: WalkableSurfaceKind.STEP, center: { x: 0, y: 0.5, z: 0 }, width: 1, height: 1, depth: 1 };
        assert(resolveWalkableSurfaceAt(geometry, -0.5, 0) !== null, '61. Geometry: the footprint\'s own low edge is inclusive');
        assert(resolveWalkableSurfaceAt(geometry, -0.5 - 1e-6, 0) === null, '62. Geometry: one hair outside the footprint is null');
    }

    console.log('✅ All Walkable Structures tests passed.');
}

await runTests();
