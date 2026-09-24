import { AvatarStepConstraint } from '../application/avatar/AvatarStepConstraint.js';
import { AvatarMovementConstraint } from '../application/avatar/AvatarMovementConstraint.js';
import { AvatarMovementController } from '../application/avatar/AvatarMovementController.js';
import { AvatarProfileUseCase } from '../application/avatar/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/avatar/AvatarPresenceSession.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { DEFAULT_MAX_STEP_HEIGHT } from '../core/BrickWalkability.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';

// Regression coverage for the "invisible wall under a floating bridge
// plate" bug: a flat-topped brick placed far ABOVE the avatar's reach
// (e.g. core:plate_2x4 bridging two rooflines) used to make
// AvatarStepConstraint#supportHeightAt() report that brick's own top as
// "the floor" for its ENTIRE horizontal footprint, all the way down to
// bare ground — so walking into that footprint at ground level read as
// an impossible single-tick climb and was rejected exactly like walking
// into a solid wall, with no brick AABB and nothing selectable anywhere
// near the avatar to explain it.
//
// The fix: supportHeightAt() takes an optional `referenceHeight` — a
// candidate surface more than maxStepHeight ABOVE it is no longer
// allowed to win the max. Both real callers (AvatarStepConstraint#apply()
// and AvatarMovementController's own currentSupportHeight read) now pass
// the avatar's own REAL current height as that reference.

function documentWithBricks(bricks) {
    const world = new World();
    const building = new Building({ creator: 'bridge-fix-test' });
    for (const brick of bricks) building.addBrick(brick);
    world.addBuilding(building);
    return { world };
}

function assert(condition, message) {
    if (!condition) throw new Error('FAILED: ' + message);
    console.log('  ✓ ' + message);
}

function buildAvatarPresenceSession(username, position) {
    const storage = new InMemoryStorageProvider();
    const identityProvider = new LocalIdentityProvider(storage);
    identityProvider.login(username);
    const registry = { register() {}, get() { return null; }, getAll() { return []; } };
    const avatarProfileUseCase = new AvatarProfileUseCase(storage, identityProvider, registry);
    const profile = avatarProfileUseCase.getProfile();
    return new AvatarPresenceSession(profile, { position });
}

async function runTests() {
    const brickRegistry = new CreateBrickRegistryUseCase().execute();
    const plate = brickRegistry.get('core:plate_2x4'); // width 2, height 0.25, depth 4

    // A bridge deck floating high overhead (world Y ~6.125, matching the
    // exact real-world scenario this bug was reported from), spanning a
    // 2x4 footprint centered at the world origin: X -1..1, Z -2..2.
    const bridgeY = 6.125;
    const bridgeDocument = documentWithBricks([
        new Brick({ definitionId: 'core:plate_2x4', position: new Position(0, bridgeY, 0) })
    ]);
    const loadedDocuments = new Map([['bridge-doc', bridgeDocument]]);
    const getWorldPosition = () => ({ x: 0, y: 0, z: 0 });

    // -------------------------------------------------------------
    // Section A — supportHeightAt()'s own new `referenceHeight` filter
    // -------------------------------------------------------------
    {
        const constraint = new AvatarStepConstraint({ loadedDocuments, getWorldPosition, brickRegistry });
        assert(constraint.supportHeightAt(0, 0) === bridgeY + plate.height / 2,
            '1. supportHeightAt: with NO referenceHeight given, behavior is byte-identical to before the fix (the floating plate still wins the max)');
        assert(constraint.supportHeightAt(0, 0, 0) === 0,
            '2. supportHeightAt: with referenceHeight=0 (true ground), the floating plate is far out of reach and no longer wins — support height is plain ground');
        assert(Math.abs(constraint.supportHeightAt(0, 0, bridgeY) - (bridgeY + plate.height / 2)) < 1e-9,
            '3. supportHeightAt: with referenceHeight already AT the plate\'s own height (avatar standing on/near it), the plate correctly still wins');
        assert(constraint.supportHeightAt(50, 50, 0) === 0,
            '4. supportHeightAt: far outside the plate\'s footprint entirely, support height is plain ground regardless of reference');
    }

    // -------------------------------------------------------------
    // Section B — apply(): walking from open ground into the floating
    // plate's footprint is no longer treated as an impossible climb
    // -------------------------------------------------------------
    {
        const constraint = new AvatarStepConstraint({ loadedDocuments, getWorldPosition, brickRegistry });
        const position = { x: 0, y: 0, z: -3 }; // outside the footprint (Z -2..2)
        const desiredPosition = { x: 0, y: 0, z: -1 }; // now inside it
        const result = constraint.apply(position, desiredPosition, { grounded: true });
        assert(result.blocked === false,
            '5. apply(): stepping from open ground into the floating plate\'s footprint is NOT blocked');
        assert(Math.abs(result.position.y - 0) < 1e-9,
            '6. apply(): Y stays at true ground level — the avatar is never silently snapped up toward the floating plate');
    }

    // -------------------------------------------------------------
    // Section C — regression: an ORDINARY, reachable low step still
    // climbs exactly as before (the fix must not break Step-Up Movement)
    // -------------------------------------------------------------
    {
        const low = brickRegistry.get('core:plate_2x4');
        const document = documentWithBricks([
            new Brick({ definitionId: 'core:plate_2x4', position: new Position(0, low.height / 2, 0) })
        ]);
        const loaded = new Map([['low-doc', document]]);
        const constraint = new AvatarStepConstraint({ loadedDocuments: loaded, getWorldPosition, brickRegistry });
        const result = constraint.apply({ x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 0 }, { grounded: true });
        assert(result.blocked === false, '7. apply(): a genuinely low, reachable step is still climbable after the fix');
        assert(Math.abs(result.position.y - low.height) < 1e-9, '8. apply(): Y still snaps onto the low brick\'s own top, exactly as before');
    }
    {
        // A too-tall brick directly ahead must still genuinely block —
        // the fix only excludes UNREACHABLE candidates from the max, it
        // never widens what counts as climbable.
        const tall = brickRegistry.get('core:cube');
        const document = documentWithBricks([
            new Brick({ definitionId: 'core:cube', position: new Position(0, tall.height / 2, 0) })
        ]);
        const loaded = new Map([['tall-doc', document]]);
        const constraint = new AvatarStepConstraint({ loadedDocuments: loaded, getWorldPosition, brickRegistry });
        const result = constraint.apply({ x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 0 }, { grounded: true });
        assert(result.blocked === true, '9. apply(): a genuinely too-tall brick directly ahead is still blocked after the fix');
    }
    {
        // The exact scenario diagnosed earlier in this codebase's own
        // history: a core:stair is ROOTED at the ground (base = 0) but
        // its own BACK face reads as its full, unclimbable height. A
        // naive "filter by reported surface height" fix would have let
        // this vanish into "bare ground" exactly like the floating
        // plate does — which would silently let an avatar walk straight
        // through a solid stair from its tall side. Filtering by the
        // brick's own BASE instead of its surface height must NOT
        // regress this: approaching the stair's tall back face stays
        // genuinely blocked.
        const stair = brickRegistry.get('core:stair'); // 1x1x1, base at y=0
        const document = documentWithBricks([
            new Brick({ definitionId: 'core:stair', position: new Position(0, stair.height / 2, 0) })
        ]);
        const loaded = new Map([['stair-doc', document]]);
        const constraint = new AvatarStepConstraint({ loadedDocuments: loaded, getWorldPosition, brickRegistry });
        // Stepping onto the stair's own BACK edge (local +X, the full-
        // height end — see core/WalkableSurface.js#stepSurfaceAt()) from
        // flat ground just outside its footprint, in a single tick.
        const result = constraint.apply({ x: -1, y: 0, z: 0 }, { x: 0.49, y: 0, z: 0 }, { grounded: true });
        assert(result.blocked === true, '10. apply(): approaching a ground-rooted stair\'s own tall back face is still genuinely blocked, not excused as "unreachable and therefore absent"');
    }

    // -------------------------------------------------------------
    // Section D — end to end: AvatarMovementController walks the avatar
    // straight through the open space under a floating bridge deck
    // -------------------------------------------------------------
    {
        const avatarPresenceSession = buildAvatarPresenceSession('bridge-walker', { x: 0, y: 0, z: -6 });
        const movementConstraint = new AvatarMovementConstraint({ loadedDocuments, getWorldPosition, brickRegistry, maxStepHeight: DEFAULT_MAX_STEP_HEIGHT });
        const stepConstraint = new AvatarStepConstraint({ loadedDocuments, getWorldPosition, brickRegistry });
        const controller = new AvatarMovementController(avatarPresenceSession, movementConstraint, null, stepConstraint);
        controller.keyDown('w'); // default facing walks toward +z, straight under the bridge
        let everBlocked = false;
        let everCollided = false;
        let maxYSeen = 0;
        for (let i = 0; i < 400; i++) {
            controller.tick(0.05);
            if (controller.isBlockedByStepHeight()) everBlocked = true;
            if (controller.isCollided()) everCollided = true;
            maxYSeen = Math.max(maxYSeen, avatarPresenceSession.current.position.y);
        }
        controller.keyUp('w');
        assert(everBlocked === false, '11. AvatarMovementController: the avatar is never reported blocked walking under the floating bridge deck');
        assert(everCollided === false, '12. AvatarMovementController: building collision never fires either — the plate is genuinely out of the avatar\'s reach');
        assert(avatarPresenceSession.current.position.z > 0, '13. AvatarMovementController: the avatar actually crosses all the way through, past the bridge\'s own footprint (Z -2..2)');
        assert(maxYSeen < 1.0, '14. AvatarMovementController: the avatar\'s Y never rises toward the floating deck — it walks underneath, not up onto it');
    }

    console.log('✅ All AvatarStepConstraint unreachable-surface fix tests passed.');
}

await runTests();
