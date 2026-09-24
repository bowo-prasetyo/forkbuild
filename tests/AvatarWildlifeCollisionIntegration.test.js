import { readFile } from 'node:fs/promises';
import { AvatarWildlifeConstraint } from '../application/avatar/AvatarWildlifeConstraint.js';
import { AvatarMovementController } from '../application/avatar/AvatarMovementController.js';
import { wildlifeCollisionGeometryInRegion } from '../core/WildlifeCollisionGeometry.js';
import { DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { AVATAR_COLLISION_RADIUS } from '../core/AvatarCollision.js';
import { VehicleType } from '../core/VehicleType.js';
import { resolveAvatarVehicleMovementCapability } from '../core/AvatarVehicleMovementCapability.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { AvatarProfileUseCase } from '../application/avatar/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/avatar/AvatarPresenceSession.js';
import { WorldNavigationSession } from '../application/world/WorldNavigationSession.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// Avatar Movement Wildlife Collision Integration, application/avatar/AvatarWildlifeConstraint.js
// — the direct structural twin of tests/AvatarTreeCollisionIntegration.test.js.
//
//   Section A: application/avatar/AvatarWildlifeConstraint.js — real animals
//   Section B: application/avatar/AvatarMovementController.js — wildlife constraint wired into the movement pipeline
//   Section C: WorldNavigationSession integration
//   Section D: FLAGSHIP — a real avatar walking straight at a real,
//              deterministic animal through the entire chain
//   Section E: architectural regression — no new collision mathematics,
//              no new status vocabulary
//
// Central architectural claim under test throughout: this adds NO new
// collision mathematics of its own — it reuses core/AvatarTreeMovement.js's
// own resolveAvatarTreeMovement() (already generic over any list of
// `{ center, radius }` circles) against a wildlife-specific candidate set
// from core/AvatarWildlifeCollisionQuery.js, wired into the same
// application/avatar/AvatarMovementController.js pipeline
// application/avatar/AvatarTreeConstraint.js already plugs into.

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

function spyFacade() {
    const calls = { updateLocalAvatarPresence: [], onAnimationFrameCallbacks: [] };
    return {
        calls,
        setLocalAvatar() {}, updateLocalAvatarAppearance() {},
        updateLocalAvatarPresence: (presence) => calls.updateLocalAvatarPresence.push({ presence }),
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
        dispose() {}
    };
}

// A real, deterministic animal under DEFAULT_WORLD_SEED — found the exact
// same way tests/AvatarWildlifeCollisionQuery.test.js already finds one.
function findRealAnimal() {
    const wide = wildlifeCollisionGeometryInRegion(DEFAULT_WORLD_SEED, -300, -300, 300, 300);
    return wide[0];
}

async function runTests() {
    const registry = buildRegistry();
    const realAnimal = findRealAnimal();

    // -------------------------------------------------------------
    // Section A — application/avatar/AvatarWildlifeConstraint.js
    // -------------------------------------------------------------
    {
        const constraint = new AvatarWildlifeConstraint();
        const far = { x: 1000, y: 0, z: 1000 };
        const desired = { x: 1001, y: 0, z: 1000 };
        const result = constraint.apply(far, desired);
        assert(result.position.x === desired.x && result.position.y === desired.y && result.position.z === desired.z,
            '1. AvatarWildlifeConstraint: free movement far from any animal passes the requested position through unchanged');
        assert(result.collided === false, '2. AvatarWildlifeConstraint: free movement never reports a collision');
    }
    {
        // Direct approach: the avatar actually stops at the animal's own
        // collision boundary, walking straight at a real animal.
        const constraint = new AvatarWildlifeConstraint();
        const approachStart = { x: realAnimal.center.x, y: 1.7, z: realAnimal.center.z - (realAnimal.radius + AVATAR_COLLISION_RADIUS + 5) };
        const desired = { x: realAnimal.center.x, y: 1.7, z: realAnimal.center.z };
        const result = constraint.apply(approachStart, desired);
        assert(result.collided === true, '3. AvatarWildlifeConstraint: walking straight into a real animal is detected as a collision');
        const distToCenter = Math.hypot(result.position.x - realAnimal.center.x, result.position.z - realAnimal.center.z);
        const combinedRadius = realAnimal.radius + AVATAR_COLLISION_RADIUS;
        assert(distToCenter >= combinedRadius - 1e-6, '4. AvatarWildlifeConstraint: the resolved position never penetrates the animal\'s own combined collision radius');
        assert(distToCenter < combinedRadius + 1e-6, '5. AvatarWildlifeConstraint: the avatar actually stops AT the boundary, not short of it or arbitrarily far away');
    }
    {
        // Diagonal approach: sliding behavior, reused unchanged from
        // resolveAvatarTreeMovement(), is exercised end to end for
        // animals too.
        const constraint = new AvatarWildlifeConstraint();
        const start = { x: realAnimal.center.x - (realAnimal.radius + AVATAR_COLLISION_RADIUS + 3), y: 0, z: realAnimal.center.z - (realAnimal.radius + AVATAR_COLLISION_RADIUS + 3) };
        const desired = { x: realAnimal.center.x + 3, y: 0, z: realAnimal.center.z + 3 };
        const result = constraint.apply(start, desired);
        assert(result.collided === true, '6. AvatarWildlifeConstraint: a diagonal approach through a real animal is detected');
        assert(!(result.position.x === start.x && result.position.z === start.z),
            '7. AvatarWildlifeConstraint: a diagonal approach SLIDES around the animal — it never freezes the avatar dead at its starting point');
    }
    {
        // Moving away: never permanently attached to an animal the
        // avatar starts touching.
        const constraint = new AvatarWildlifeConstraint();
        const touching = { x: realAnimal.center.x + (realAnimal.radius + AVATAR_COLLISION_RADIUS), y: 0, z: realAnimal.center.z };
        const movingAway = { x: touching.x + 0.05, y: 0, z: touching.z };
        const result = constraint.apply(touching, movingAway);
        assert(result.position.x === movingAway.x && result.position.z === movingAway.z,
            '8. AvatarWildlifeConstraint: walking directly away from an animal the avatar starts touching is completely unobstructed');
    }
    {
        // Y preservation.
        const constraint = new AvatarWildlifeConstraint();
        const collidingResult = constraint.apply(
            { x: realAnimal.center.x, y: 3.5, z: realAnimal.center.z - (realAnimal.radius + AVATAR_COLLISION_RADIUS + 2) },
            { x: realAnimal.center.x, y: 3.5, z: realAnimal.center.z }
        );
        assert(collidingResult.position.y === 3.5, '9. AvatarWildlifeConstraint: Y is preserved exactly even when the step collided with an animal');
        const freeResult = constraint.apply({ x: 500, y: -2.25, z: 500 }, { x: 501, y: -2.25, z: 500 });
        assert(freeResult.position.y === -2.25, '10. AvatarWildlifeConstraint: Y is preserved exactly for a free (non-colliding) step too');
    }
    {
        // Determinism.
        const from = { x: realAnimal.center.x - 2, y: 0, z: realAnimal.center.z - 2 };
        const to = { x: realAnimal.center.x + 2, y: 0, z: realAnimal.center.z + 2 };
        const a = new AvatarWildlifeConstraint().apply(from, to);
        const b = new AvatarWildlifeConstraint().apply(from, to);
        assert(JSON.stringify(a) === JSON.stringify(b),
            '11. AvatarWildlifeConstraint: two independent default-seed instances resolve the identical movement identically');
    }
    {
        // avatarRadius passthrough: a car-sized radius stops strictly
        // further from a real animal than the default (walking) radius.
        const carRadius = 0.80;
        const approachStart = { x: realAnimal.center.x, y: 0, z: realAnimal.center.z - (realAnimal.radius + carRadius + 5) };
        const desired = { x: realAnimal.center.x, y: 0, z: realAnimal.center.z };

        const walkResult = new AvatarWildlifeConstraint().apply(approachStart, desired);
        const carResult = new AvatarWildlifeConstraint().apply(approachStart, desired, { avatarRadius: carRadius });

        const walkDistToCenter = Math.hypot(walkResult.position.x - realAnimal.center.x, walkResult.position.z - realAnimal.center.z);
        const carDistToCenter = Math.hypot(carResult.position.x - realAnimal.center.x, carResult.position.z - realAnimal.center.z);
        assert(carResult.collided === true, '12. AvatarWildlifeConstraint: a car-sized avatarRadius still detects the real animal as a collision');
        assert(carDistToCenter > walkDistToCenter,
            '13. AvatarWildlifeConstraint: a car-sized avatarRadius stops strictly further from the real animal\'s own center than the default (walking) radius does');
        assert(Math.abs(carDistToCenter - (carRadius + realAnimal.radius)) < 1e-6,
            '14. AvatarWildlifeConstraint: the car-sized resolution stops exactly at carRadius + animal.radius');
    }

    // -------------------------------------------------------------
    // Section B — application/avatar/AvatarMovementController.js
    // -------------------------------------------------------------
    {
        // Existing movement regression: a controller built WITHOUT a
        // wildlifeConstraint at all behaves exactly as before.
        const { avatarPresenceSession } = buildAvatarStack(registry, 'wildlife-legacy');
        const controller = new AvatarMovementController(avatarPresenceSession, null, null, null);
        controller.keyDown('w');
        controller.tick(0.5);
        assert(avatarPresenceSession.current.position.z > 0, '15. AvatarMovementController: a controller built without a 7th argument still moves normally');
        assert(controller.isCollidedWithWildlife() === false, '16. AvatarMovementController: isCollidedWithWildlife() defaults false with no wildlife constraint wired at all');
    }
    {
        const { avatarPresenceSession } = buildAvatarStack(registry, 'wildlife-collides');
        const before = avatarPresenceSession.current.position;
        const alwaysCollides = { apply: (position) => ({ position, collided: true }) };
        const controller = new AvatarMovementController(avatarPresenceSession, null, null, null, null, null, alwaysCollides);
        controller.keyDown('w');
        controller.tick(0.5);
        assert(avatarPresenceSession.current.position.x === before.x && avatarPresenceSession.current.position.z === before.z,
            '17. AvatarMovementController: a wildlife constraint that fully holds the avatar in place is actually honored');
        assert(controller.isCollidedWithWildlife() === true, '18. AvatarMovementController: isCollidedWithWildlife() reflects the constraint\'s own outcome');
    }
    {
        // Transient — recomputed fresh every tick, never sticky.
        const { avatarPresenceSession } = buildAvatarStack(registry, 'wildlife-transient');
        let colliding = true;
        const toggle = { apply: (position, desired) => (colliding ? { position, collided: true } : { position: desired, collided: false }) };
        const controller = new AvatarMovementController(avatarPresenceSession, null, null, null, null, null, toggle);
        controller.keyDown('w');
        controller.tick(0.5);
        assert(controller.isCollidedWithWildlife() === true, '19. AvatarMovementController: collided while the wildlife constraint collides');
        colliding = false;
        controller.tick(0.5);
        assert(controller.isCollidedWithWildlife() === false, '20. AvatarMovementController: ...and false again the very next tick once it stops colliding — never sticky');
    }
    {
        // Never leaks into AvatarPresence's own wire shape.
        const { avatarPresenceSession } = buildAvatarStack(registry, 'wildlife-shape');
        const alwaysCollides = { apply: (position) => ({ position, collided: true }) };
        const controller = new AvatarMovementController(avatarPresenceSession, null, null, null, null, null, alwaysCollides);
        controller.keyDown('a');
        controller.tick(0.5);
        const json = avatarPresenceSession.current.toJSON();
        assert(!('collided' in json) && !('collidedWithWildlife' in json) && !('blocked' in json),
            '21. AvatarMovementController: wildlife-collision state never appears on AvatarPresence\'s own JSON shape');
    }
    {
        // Composition order: tree collision runs BEFORE wildlife
        // collision — wildlife is evaluated against whatever position
        // tree collision already resolved to.
        const { avatarPresenceSession } = buildAvatarStack(registry, 'wildlife-order');
        const slidesToOrigin = { apply: (position) => ({ position, collided: true }) };
        let wildlifeSawTo = null;
        const observingWildlife = {
            apply: (position, desired) => {
                wildlifeSawTo = { ...desired };
                return { position: desired, collided: false };
            }
        };
        const controller = new AvatarMovementController(avatarPresenceSession, null, null, null, slidesToOrigin, null, observingWildlife);
        const startPos = avatarPresenceSession.current.position;
        controller.keyDown('w');
        controller.tick(0.5);
        assert(wildlifeSawTo.x === startPos.x && wildlifeSawTo.z === startPos.z,
            '22. AvatarMovementController: wildlife collision is evaluated against the position tree collision ALREADY resolved to, never the raw pre-collision kinematic proposal');
    }
    {
        // avatarRadius wire: the active movement capability's own
        // collisionRadius reaches the wildlife constraint too.
        const { avatarPresenceSession } = buildAvatarStack(registry, 'wildlife-radius-wire');
        let wildlifeSawOptions = null;
        const observingWildlife = {
            apply: (position, desired, options) => {
                wildlifeSawOptions = options;
                return { position: desired, collided: false };
            }
        };
        const controller = new AvatarMovementController(avatarPresenceSession, null, null, null, null, null, observingWildlife);

        controller.keyDown('w');
        controller.tick(0.5);
        assert(wildlifeSawOptions.avatarRadius === undefined,
            '23. AvatarMovementController: with no movement capability ever set, the wildlife constraint\'s own avatarRadius option is undefined — the documented default');

        controller.setMovementCapability(resolveAvatarVehicleMovementCapability(VehicleType.CAR));
        controller.tick(0.5);
        assert(wildlifeSawOptions.avatarRadius === 0.80,
            '24. AvatarMovementController: switching to CAR movement capability immediately feeds its own collisionRadius (0.80) to the wildlife constraint on the very next tick');
        controller.keyUp('w');
    }
    {
        // Swept-path detection: a single, fast tick straight through a
        // real animal is still stopped.
        const { avatarPresenceSession } = buildAvatarStack(registry, 'wildlife-swept');
        avatarPresenceSession.update({
            position: { x: realAnimal.center.x, y: 0, z: realAnimal.center.z - (realAnimal.radius + AVATAR_COLLISION_RADIUS + 10) },
            rotation: { y: 0 }
        });
        const wildlifeConstraint = new AvatarWildlifeConstraint();
        const controller = new AvatarMovementController(avatarPresenceSession, null, null, null, null, null, wildlifeConstraint);
        controller.keyDown('w');
        controller.tick(20);
        controller.keyUp('w');
        const finalDistance = Math.hypot(
            avatarPresenceSession.current.position.x - realAnimal.center.x,
            avatarPresenceSession.current.position.z - realAnimal.center.z
        );
        assert(finalDistance >= realAnimal.radius + AVATAR_COLLISION_RADIUS - 1e-6,
            '25. AvatarMovementController: a single fast tick cannot jump clean through an animal — the full swept segment is tested, not merely the tick\'s starting point');
    }

    // -------------------------------------------------------------
    // Section C — WorldNavigationSession integration
    // -------------------------------------------------------------
    {
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'session-wildlife-wired');
        const session = new WorldNavigationSession({
            registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            avatarProfileUseCase, avatarPresenceSession
        });
        session._session = spyFacade();
        session._setupLocalAvatar();
        assert(session._avatarMovementController._wildlifeConstraint instanceof AvatarWildlifeConstraint,
            '26. WorldNavigationSession: a real AvatarWildlifeConstraint is built and wired for the local avatar');
        assert(session._avatarMovementController.isCollidedWithWildlife() === false,
            '27. WorldNavigationSession: a fresh session reports no wildlife collision before any movement has happened');
    }

    // -------------------------------------------------------------
    // Section D — FLAGSHIP: a real avatar walking straight at a real,
    // deterministic animal, through the ENTIRE chain — WildlifeField ->
    // WildlifeCollisionGeometry -> AvatarWildlifeCollisionQuery ->
    // AvatarTreeMovement (reused) -> AvatarWildlifeConstraint ->
    // AvatarMovementController -> avatar position.
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const alice = new LocalIdentityProvider(storage);
        alice.login('alice-wildlife');
        const avatarProfileUseCase = new AvatarProfileUseCase(storage, alice, registry);
        avatarProfileUseCase.updateProfile({ templateId: 'humanoid-01', displayName: 'Alice' });
        const profile = avatarProfileUseCase.getProfile();
        const startZ = realAnimal.center.z - (realAnimal.radius + AVATAR_COLLISION_RADIUS + 8);
        const avatarPresenceSession = new AvatarPresenceSession(profile, { position: { x: realAnimal.center.x, y: 0, z: startZ } });

        const session = new WorldNavigationSession({
            registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            identityProvider: alice, avatarProfileUseCase, avatarPresenceSession, avatarTemplateRegistry: registry
        });
        session._session = spyFacade();
        session._setupLocalAvatar();

        session.setAvatarControlMode(true);
        session.avatarKeyDown('w');
        let everCollided = false;
        let maxStepDistance = 0;
        let lastPosition = avatarPresenceSession.current.position;
        for (let i = 0; i < 400; i++) {
            session._avatarMovementController.tick(0.05);
            if (session._avatarMovementController.isCollidedWithWildlife()) everCollided = true;
            const p = avatarPresenceSession.current.position;
            assert(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z),
                `28. FLAGSHIP: position stays finite at every tick (tick ${i}) approaching a real animal`);
            const stepDistance = Math.hypot(p.x - lastPosition.x, p.z - lastPosition.z);
            maxStepDistance = Math.max(maxStepDistance, stepDistance);
            lastPosition = p;
        }
        session.avatarKeyUp('w');

        assert(everCollided === true, '29. FLAGSHIP: the local avatar\'s own movement is genuinely constrained by a real animal, end to end');
        const finalDistance = Math.hypot(
            avatarPresenceSession.current.position.x - realAnimal.center.x,
            avatarPresenceSession.current.position.z - realAnimal.center.z
        );
        assert(finalDistance >= realAnimal.radius + AVATAR_COLLISION_RADIUS - 1e-6,
            '30. FLAGSHIP: the avatar never penetrates the real animal\'s own collision circle');
        assert(maxStepDistance < 1, '31. FLAGSHIP: no single tick ever produces a discontinuous jump through the animal');
    }

    // -------------------------------------------------------------
    // Section E — architectural regression: no new collision
    // mathematics, no new status vocabulary
    // -------------------------------------------------------------
    {
        const sourceUrl = new URL('../application/avatar/AvatarWildlifeConstraint.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');

        const forbidden = [
            'circlesIntersect', 'avatarCollisionCircleAt', 'animalCollisionCircleFor',
            'wildlifeCollisionGeometryInRegion', 'wildlifeInRegion',
            'AvatarTerrainConstraint', 'AvatarMovementConstraint', 'AvatarStepConstraint',
            'terrainHeightAt', 'isWalkableSlope',
            'QuadTree', 'RTree', 'HashGrid', 'SpatialIndex',
            'THREE', 'from \'three\'', 'Renderer',
            'Math.random', 'Date.now',
            'localStorage', 'StorageProvider', 'fetch(', 'WebSocket',
            'CollisionEvent', 'velocity', 'acceleration', 'mass'
        ];
        for (const term of forbidden) {
            assert(!codeOnly.includes(term), `32. application/avatar/AvatarWildlifeConstraint.js's own code never references "${term}" — a thin adapter only, never a second collision algorithm`);
        }
        assert(codeOnly.includes('wildlifeCollisionCandidatesForMovement'),
            '33. application/avatar/AvatarWildlifeConstraint.js does consume wildlifeCollisionCandidatesForMovement() from core/AvatarWildlifeCollisionQuery.js');
        assert(codeOnly.includes('resolveAvatarTreeMovement'),
            '34. application/avatar/AvatarWildlifeConstraint.js reuses resolveAvatarTreeMovement() from core/AvatarTreeMovement.js — never a cloned copy of the same resolution math');
    }
    {
        const exportsModule = await import('../application/avatar/AvatarWildlifeConstraint.js');
        const exportedNames = Object.keys(exportsModule).sort();
        assert(JSON.stringify(exportedNames) === JSON.stringify(['AvatarWildlifeConstraint']),
            '35. application/avatar/AvatarWildlifeConstraint.js exports exactly the AvatarWildlifeConstraint class — nothing else');
    }

    console.log('✅ All Avatar Movement Wildlife Collision Integration tests passed.');
}

await runTests();
