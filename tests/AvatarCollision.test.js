import {
    AVATAR_COLLISION_RADIUS, AVATAR_COLLISION_HEIGHT,
    avatarAabbAt, brickAabb, translateAabb, aabbsOverlap, resolveHorizontalMovement
} from '../core/AvatarCollision.js';
import { AvatarMovementConstraint } from '../application/AvatarMovementConstraint.js';
import { AvatarMovementController } from '../application/AvatarMovementController.js';
import { AvatarAnimationState } from '../core/AvatarAnimationState.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { AvatarProfileUseCase } from '../application/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { LocalAvatarPresenceBroadcastProvider } from '../presence/LocalAvatarPresenceBroadcastProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { LocalWorldLayoutProvider } from '../world-layout/LocalWorldLayoutProvider.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { PlacePublicationUseCase } from '../application/PlacePublicationUseCase.js';
import { GridPlacementStrategy } from '../application/InitialPlacementStrategy.js';
import { PublishDocumentUseCase } from '../application/PublishDocumentUseCase.js';
import { LoadPublicationDocumentUseCase } from '../application/LoadPublicationDocumentUseCase.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { License, LicenseId } from '../core/License.js';

// 0.2.42 — Avatar-World Collision & Movement Constraints.
//
//   Section A: core/AvatarCollision.js — pure geometry
//   Section B: application/AvatarMovementConstraint.js — supplies loaded-world geometry
//   Section C: application/AvatarMovementController.js — collision wired into the movement pipeline
//   Section D: WorldNavigationSession integration — loaded geometry only, never the whole world
//   Section E: FLAGSHIP — the design doc's own scripted scenario
//
// Central architectural claim under test throughout: collision is a
// CONSTRAINT applied to movement, never a rewrite of the pure
// kinematic simulation (core/AvatarMovementSimulation.js is untouched
// this milestone), and the local avatar is constrained only by
// collision geometry CURRENTLY AVAILABLE to this replica — never by
// the entire decentralized world, published or not, loaded or not.

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

// Publishes a document containing a short, 3-brick-wide "wall" (core:cube
// bricks, 1x1x1, at local x = 0,1,2, y = 0.5, z = 0) and returns
// everything a test needs, including the FULL decentralized stack
// (worldLayoutProvider etc.) so a real WorldNavigationSession can
// stream it in exactly like any other publication.
function publishWallDocument(identityProvider, brickRegistry, title = 'Wall Plaza') {
    const storage = identityProvider._storage || new InMemoryStorageProvider();
    const contentStore = new LocalContentStore(storage);
    const publisher = new LocalPublisherProvider(storage, contentStore);
    const discoveryProvider = new LocalDiscoveryProvider(storage);
    const spatialIndexProvider = new LocalSpatialIndexProvider(storage);
    const placementRegistry = new LocalPlacementRegistry(storage, spatialIndexProvider);
    const worldLayoutProvider = new LocalWorldLayoutProvider(spatialIndexProvider, discoveryProvider);
    const loadPublicationDocumentUseCase = new LoadPublicationDocumentUseCase(storage);
    const placePublicationUseCase = new PlacePublicationUseCase(
        spatialIndexProvider, discoveryProvider, loadPublicationDocumentUseCase, brickRegistry, placementRegistry, identityProvider
    );
    const publishDocumentUseCase = new PublishDocumentUseCase(publisher, identityProvider, placePublicationUseCase, new GridPlacementStrategy());

    const world = new World();
    const building = new Building({ creator: identityProvider.currentUser().username });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(1, 0.5, 0) }));
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(2, 0.5, 0) }));
    world.addBuilding(building);
    const document = new Document({ world, metadata: new DocumentMetadata({ title, author: identityProvider.currentUser().username, license: new License({ id: LicenseId.CC0_1_0 }) }) });
    const publication = publishDocumentUseCase.execute({ document });
    const worldPosition = worldLayoutProvider.getPosition(publication.documentId);

    return {
        storage, discoveryProvider, spatialIndexProvider, placementRegistry, worldLayoutProvider,
        loadPublicationDocumentUseCase, placePublicationUseCase, publishDocumentUseCase,
        document, publication, worldPosition
    };
}

function spyFacade() {
    const calls = { setLocalAvatar: [], updateLocalAvatarAppearance: [], updateLocalAvatarPresence: [], setLocalAvatarVisible: [], removeLocalAvatar: 0, onAnimationFrameCallbacks: [] };
    return {
        calls,
        setLocalAvatar: (template, appearance, presence) => calls.setLocalAvatar.push({ template, appearance, presence }),
        updateLocalAvatarAppearance: (template, appearance) => calls.updateLocalAvatarAppearance.push({ template, appearance }),
        updateLocalAvatarPresence: (presence) => calls.updateLocalAvatarPresence.push({ presence }),
        setLocalAvatarVisible: (visible) => calls.setLocalAvatarVisible.push(visible),
        removeLocalAvatar: () => { calls.removeLocalAvatar++; },
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
        // Remote-avatar surface — several sections here wire
        // _setupRemoteAvatars() too (for real presence publishing).
        setRemoteAvatar() {}, updateRemoteAvatarPresence() {}, removeRemoteAvatar() {},
        setRemoteAvatarsVisible() {},
        dispose() {}
    };
}

async function runTests() {
    const registry = buildRegistry();
    const brickRegistry = new CreateBrickRegistryUseCase().execute();

    // -------------------------------------------------------------
    // Section A — core/AvatarCollision.js: pure geometry
    // -------------------------------------------------------------
    {
        const aabb = avatarAabbAt({ x: 5, y: 0, z: 5 });
        assert(aabb.min.x === 5 - AVATAR_COLLISION_RADIUS && aabb.max.x === 5 + AVATAR_COLLISION_RADIUS,
            '1. avatarAabbAt centers X/Z on the avatar radius');
        assert(aabb.min.y === 0 && aabb.max.y === AVATAR_COLLISION_HEIGHT,
            '2. avatarAabbAt spans from the given Y up to the avatar height — never below it');
    }
    {
        const definition = { width: 2, height: 1, depth: 3 };
        const aabb = brickAabb({ x: 0, y: 0.5, z: 0 }, definition);
        assert(aabb.min.x === -1 && aabb.max.x === 1, '3. brickAabb: width is split evenly around the center');
        assert(aabb.min.y === 0 && aabb.max.y === 1, '4. brickAabb: height likewise');
        assert(aabb.min.z === -1.5 && aabb.max.z === 1.5, '5. brickAabb: depth likewise');
        assert(brickAabb({ x: 0, y: 0, z: 0 }, null).max.x === 0.5, '6. brickAabb: a missing definition degrades to a 1x1x1 default, never throws');
    }
    {
        const translated = translateAabb({ min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } }, { x: 10, y: 0, z: -5 });
        assert(translated.min.x === 10 && translated.max.x === 11, '7. translateAabb shifts min/max together');
        assert(translated.min.z === -5 && translated.max.z === -4, '8. translateAabb: every axis, including negative offsets');
    }
    {
        const a = { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } };
        const overlapping = { min: { x: 0.5, y: 0.5, z: 0.5 }, max: { x: 1.5, y: 1.5, z: 1.5 } };
        const touching = { min: { x: 1, y: 0, z: 0 }, max: { x: 2, y: 1, z: 1 } }; // shares a face, no VOLUME overlap
        const separate = { min: { x: 5, y: 5, z: 5 }, max: { x: 6, y: 6, z: 6 } };
        assert(aabbsOverlap(a, overlapping) === true, '9. aabbsOverlap: genuinely overlapping boxes');
        assert(aabbsOverlap(a, touching) === false, '10. aabbsOverlap: merely touching faces is NOT an overlap (strict inequality)');
        assert(aabbsOverlap(a, separate) === false, '11. aabbsOverlap: clearly separate boxes');
    }
    {
        // No obstacles at all -> movement passes through untouched.
        const result = resolveHorizontalMovement({ position: { x: 0, y: 0, z: 0 }, dx: 2, dz: 0, obstacles: [] });
        assert(result.x === 2 && result.z === 0 && result.collided === false, '12. resolveHorizontalMovement: no obstacles, no collision');
    }
    {
        // Head-on: a wall directly ahead on +Z blocks forward motion,
        // clamping just short of its near face.
        const wall = { min: { x: -5, y: 0, z: 2 }, max: { x: 5, y: 2, z: 3 } };
        const result = resolveHorizontalMovement({ position: { x: 0, y: 0, z: 0 }, dx: 0, dz: 5, obstacles: [wall] });
        assert(result.collided === true, '13. resolveHorizontalMovement: head-on wall registers a collision');
        assert(result.z < 2 && result.z > 1, '14. resolveHorizontalMovement: clamped just short of the wall\'s near face, never past it');
        assert(result.z + AVATAR_COLLISION_RADIUS <= wall.min.z, '15. resolveHorizontalMovement: the avatar\'s own AABB never actually penetrates the wall');
    }
    {
        // Diagonal approach into a CORNER: X is blocked by a wall,
        // while Z (perpendicular, clear) keeps moving — the slide.
        const wall = { min: { x: 2, y: 0, z: -5 }, max: { x: 3, y: 2, z: 5 } };
        const result = resolveHorizontalMovement({ position: { x: 0, y: 0, z: 0 }, dx: 5, dz: 3, obstacles: [wall] });
        assert(result.collided === true, '16. resolveHorizontalMovement: diagonal-into-a-wall still registers collided');
        assert(result.x < 2, '17. resolveHorizontalMovement: X is blocked by the wall...');
        assert(Math.abs(result.z - 3) < 1e-9, '18. ...while Z, genuinely unobstructed, moves the FULL requested distance — a true slide, not a dead stop');
    }
    {
        // No tunneling: a THIN wall (0.1 units deep) sitting entirely
        // inside a single large step must still stop the avatar — a
        // naive "check only the endpoint" implementation would miss
        // this because the final position lands cleanly on the far
        // side.
        const thinWall = { min: { x: -5, y: 0, z: 0.95 }, max: { x: 5, y: 2, z: 1.05 } };
        const result = resolveHorizontalMovement({ position: { x: 0, y: 0, z: 0 }, dx: 0, dz: 2, obstacles: [thinWall] });
        assert(result.collided === true, '19. resolveHorizontalMovement: a thin obstacle mid-step is still detected (swept, not endpoint-only)');
        assert(result.z < 0.95, '20. resolveHorizontalMovement: stops before the thin wall — never tunnels through to the far side');
    }
    {
        // Multiple obstacles along the same sweep — the NEAREST one
        // wins, never whichever happened to be checked last.
        const near = { min: { x: -5, y: 0, z: 1 }, max: { x: 5, y: 2, z: 1.5 } };
        const far = { min: { x: -5, y: 0, z: 3 }, max: { x: 5, y: 2, z: 3.5 } };
        const result = resolveHorizontalMovement({ position: { x: 0, y: 0, z: 0 }, dx: 0, dz: 10, obstacles: [far, near] });
        assert(result.z < 1 && result.z > 0.5, '21. resolveHorizontalMovement: stops at the NEAREST obstacle, ignoring the farther one behind it');
    }
    {
        // A wall entirely ABOVE the avatar's height (floating
        // geometry, or a tall building's upper floor) never obstructs
        // ordinary ground-level walking — vertical AABB overlap is a
        // real, load-bearing part of the test, not an accident of
        // full-height walls in every other test here.
        const floatingWall = { min: { x: -5, y: 5, z: 1 }, max: { x: 5, y: 6, z: 1.5 } };
        const result = resolveHorizontalMovement({ position: { x: 0, y: 0, z: 0 }, dx: 0, dz: 5, obstacles: [floatingWall] });
        assert(result.collided === false && result.z === 5, '22. resolveHorizontalMovement: a wall entirely above the avatar\'s height never blocks ground-level movement');
    }
    {
        // No attempted movement on an axis (delta === 0) leaves it
        // completely untouched, and a wall that's simply nowhere near
        // the OTHER axis's own travel range never obstructs it either.
        const wall = { min: { x: 10, y: 0, z: 1 }, max: { x: 15, y: 2, z: 1.5 } };
        const result = resolveHorizontalMovement({ position: { x: 0, y: 0, z: 0.9 }, dx: 3, dz: 0, obstacles: [wall] });
        assert(result.z === 0.9, '23. resolveHorizontalMovement: zero Z-delta leaves Z untouched regardless of nearby geometry');
        assert(result.x === 3 && result.collided === false, '24. resolveHorizontalMovement: X moves freely — the wall sits nowhere near this step\'s own travel range');
    }
    {
        // Retreating: an obstacle the avatar is already flush against
        // must never block movement AWAY from it — only movement
        // heading TOWARD an obstacle should ever be constrained. See
        // core/AvatarCollision.js's own comment on this exact edge
        // case (the sweep check deliberately includes the origin, to
        // catch tunneling, which would otherwise also wrongly catch a
        // retreat from something already touched).
        const wall = { min: { x: -5, y: 0, z: 1 }, max: { x: 5, y: 2, z: 1.5 } };
        const result = resolveHorizontalMovement({ position: { x: 0, y: 0, z: 0.9 }, dx: 0, dz: -3, obstacles: [wall] });
        assert(result.z === -2.1 && result.collided === false,
            '25. resolveHorizontalMovement: moving AWAY from an adjacent obstacle is never blocked');
    }

    // -------------------------------------------------------------
    // Section B — application/AvatarMovementConstraint.js
    // -------------------------------------------------------------
    {
        const constraint = new AvatarMovementConstraint({ loadedDocuments: new Map(), getWorldPosition: () => ({ x: 0, y: 0, z: 0 }), brickRegistry });
        const result = constraint.apply({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
        assert(result.position.x === 1 && result.collided === false, '26. AvatarMovementConstraint: an empty loadedDocuments set never blocks anything');
    }
    {
        const result = new AvatarMovementConstraint({}).apply({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
        assert(result.position.x === 1 && result.collided === false, '27. AvatarMovementConstraint: missing loadedDocuments/getWorldPosition degrades to a no-op, never throws');
    }
    {
        const alice = new LocalIdentityProvider(new InMemoryStorageProvider());
        alice.login('constraint-alice');
        const wallStack = publishWallDocument(alice, brickRegistry, 'Constraint Wall');
        const document = wallStack.loadPublicationDocumentUseCase.execute(wallStack.publication.documentId);
        const loadedDocuments = new Map([[wallStack.publication.documentId, document]]);
        const constraint = new AvatarMovementConstraint({
            loadedDocuments, getWorldPosition: () => wallStack.worldPosition, brickRegistry
        });

        // Approaching the 3-brick wall head-on along +Z is blocked;
        // the wall spans local X 0..2 (world X offset..offset+2), so
        // starting at the middle brick's X keeps this a clean
        // head-on test.
        const start = { x: wallStack.worldPosition.x + 1, y: 0, z: wallStack.worldPosition.z - 2 };
        const desired = { x: start.x, y: 0, z: wallStack.worldPosition.z + 5 };
        const result = constraint.apply(start, desired);
        assert(result.collided === true, '28. AvatarMovementConstraint: a real published, placed, loaded wall blocks approach');
        assert(result.position.z < wallStack.worldPosition.z - 0.5, '29. AvatarMovementConstraint: clamped short of the wall\'s own world-space near face');

        // A document this constraint was never told about (never
        // added to loadedDocuments) contributes NOTHING, even if its
        // getWorldPosition would happily resolve it — the collection
        // step only ever walks loadedDocuments' own entries.
        const emptyConstraint = new AvatarMovementConstraint({
            loadedDocuments: new Map(), getWorldPosition: () => wallStack.worldPosition, brickRegistry
        });
        const passthrough = emptyConstraint.apply(start, desired);
        assert(passthrough.collided === false && passthrough.position.z === desired.z,
            '30. AvatarMovementConstraint: geometry never added to loadedDocuments never obstructs, regardless of where it would resolve to');

        // An unrecognized brick definitionId degrades gracefully —
        // never an obstacle, never a thrown error.
        const strangeWorld = new World();
        const strangeBuilding = new Building({ creator: 'constraint-alice' });
        strangeBuilding.addBrick(new Brick({ definitionId: 'nonexistent:brick', position: new Position(0, 0.5, 0) }));
        strangeWorld.addBuilding(strangeBuilding);
        const strangeDoc = { world: strangeWorld };
        const strangeConstraint = new AvatarMovementConstraint({
            loadedDocuments: new Map([['strange-doc', strangeDoc]]),
            getWorldPosition: () => ({ x: 0, y: 0, z: 0 }),
            brickRegistry
        });
        let threw = false;
        let strangeResult;
        try {
            strangeResult = strangeConstraint.apply({ x: 0, y: 0, z: -2 }, { x: 0, y: 0, z: 2 });
        } catch (e) { threw = true; }
        assert(!threw, '31. AvatarMovementConstraint: an unrecognized brick definitionId never throws');
        assert(strangeResult.collided === false, '32. AvatarMovementConstraint: ...and is simply never treated as an obstacle');
    }
    {
        // Distance culling: a document whose OWN placement is far
        // beyond the query radius contributes no obstacles, without
        // even needing its bricks to be examined (a performance
        // property, but observable here as "never blocks").
        const alice = new LocalIdentityProvider(new InMemoryStorageProvider());
        alice.login('far-alice');
        const wallStack = publishWallDocument(alice, brickRegistry, 'Far Wall');
        const document = wallStack.loadPublicationDocumentUseCase.execute(wallStack.publication.documentId);
        const farAwayPosition = { x: wallStack.worldPosition.x + 100000, y: 0, z: wallStack.worldPosition.z + 100000 };
        const loadedDocuments = new Map([[wallStack.publication.documentId, document]]);
        const constraint = new AvatarMovementConstraint({
            loadedDocuments, getWorldPosition: () => wallStack.worldPosition, brickRegistry, queryRadius: 12
        });
        const result = constraint.apply(farAwayPosition, { x: farAwayPosition.x + 3, y: 0, z: farAwayPosition.z });
        assert(result.collided === false, '33. AvatarMovementConstraint: a document far outside the query radius never obstructs movement happening elsewhere');
    }

    // -------------------------------------------------------------
    // Section C — application/AvatarMovementController.js
    // -------------------------------------------------------------
    {
        // Backward compatibility: a controller built the OLD way
        // (single argument, exactly 0.2.36's own constructor call)
        // still works — movementConstraint defaults to null/absent.
        const { avatarPresenceSession } = buildAvatarStack(registry, 'controller-legacy');
        const controller = new AvatarMovementController(avatarPresenceSession);
        controller.keyDown('w');
        controller.tick(0.5);
        assert(avatarPresenceSession.current.position.z > 0, '34. AvatarMovementController: unchanged single-argument construction still moves normally');
        assert(controller.isCollided() === false, '35. AvatarMovementController: isCollided() is false with no constraint wired at all');
    }
    {
        // A constraint that always blocks everything (a deliberately
        // extreme stand-in) proves the controller actually CONSULTS
        // it, and that isCollided() reflects the outcome.
        const { avatarPresenceSession } = buildAvatarStack(registry, 'controller-blocked');
        const alwaysBlocks = { apply: (position) => ({ position, collided: true }) };
        const controller = new AvatarMovementController(avatarPresenceSession, alwaysBlocks);
        controller.keyDown('w');
        const currentPos = avatarPresenceSession.current.position;
        const before = { x: currentPos.x, y: currentPos.y, z: currentPos.z };
        controller.tick(0.5);
        assert(avatarPresenceSession.current.position.x === before.x && avatarPresenceSession.current.position.z === before.z,
            '36. AvatarMovementController: a constraint that fully blocks movement is actually honored — position never advances');
        assert(controller.isCollided() === true, '37. AvatarMovementController: isCollided() reflects the constraint\'s own outcome');
    }
    {
        // isCollided() is TRANSIENT, recomputed fresh every tick —
        // once the obstruction clears, it goes back to false.
        const { avatarPresenceSession } = buildAvatarStack(registry, 'controller-transient');
        let blocking = true;
        const toggle = { apply: (position, desired) => (blocking ? { position, collided: true } : { position: desired, collided: false }) };
        const controller = new AvatarMovementController(avatarPresenceSession, toggle);
        controller.keyDown('w');
        controller.tick(0.5);
        assert(controller.isCollided() === true, '38. AvatarMovementController: collided while the constraint blocks');
        blocking = false;
        controller.tick(0.5);
        assert(controller.isCollided() === false, '39. AvatarMovementController: ...and false again the very next tick once it stops blocking — never sticky');
    }
    {
        // isCollided() never leaks into AvatarPresence itself — the
        // wire shape (0.2.37/0.2.38) stays exactly what it always
        // was.
        const { avatarPresenceSession } = buildAvatarStack(registry, 'controller-shape');
        const alwaysBlocks = { apply: (position) => ({ position, collided: true }) };
        const controller = new AvatarMovementController(avatarPresenceSession, alwaysBlocks);
        controller.keyDown('a'); // turning alone still ticks/updates without touching X/Z collision meaningfully
        controller.tick(0.5);
        const json = avatarPresenceSession.current.toJSON();
        assert(!('collided' in json) && !('grounded' in json),
            '40. AvatarMovementController: collision/grounded state never appears on AvatarPresence\'s own JSON shape');
    }

    // -------------------------------------------------------------
    // Section D — WorldNavigationSession integration: loaded
    // geometry only, never the entire (decentralized, possibly
    // unstreamed) world.
    // -------------------------------------------------------------
    {
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'session-wall');
        const alice = new LocalIdentityProvider(new InMemoryStorageProvider());
        alice.login('session-wall-owner');
        const wallStack = publishWallDocument(alice, brickRegistry, 'Session Wall');

        const session = new WorldNavigationSession({
            registry: brickRegistry, loadPublicationDocumentUseCase: wallStack.loadPublicationDocumentUseCase,
            worldLayoutProvider: wallStack.worldLayoutProvider, discoveryProvider: wallStack.discoveryProvider,
            placementRegistry: wallStack.placementRegistry, avatarProfileUseCase, avatarPresenceSession
        });
        session._session = spyFacade();
        session._setupLocalAvatar();
        // Loads the wall's document into _loadedDocuments WITHOUT
        // going through the camera/focus machinery — the same direct
        // call other flagships already use to stream a document in.
        session._loadWorld(wallStack.publication.documentId);

        avatarPresenceSession.update({ position: { x: wallStack.worldPosition.x + 1, y: 0, z: wallStack.worldPosition.z - 2 } });
        session.setAvatarControlMode(true);
        session.avatarKeyDown('w');
        for (let i = 0; i < 60; i++) {
            session._avatarMovementController.tick(0.05);
        }
        session.avatarKeyUp('w');

        assert(avatarPresenceSession.current.position.z < wallStack.worldPosition.z - 0.5,
            '41. WorldNavigationSession: a LOADED wall blocks the local avatar\'s own movement');
        assert(session._avatarMovementController.isCollided() === true,
            '42. WorldNavigationSession: the controller reports the collision');
    }
    {
        // The exact same wall, published and placed identically, but
        // NEVER loaded into this session — the local avatar walks
        // straight through the space it would occupy. This is the
        // design doc's own central honesty requirement: "loaded
        // geometry != entire world."
        const { avatarProfileUseCase, avatarPresenceSession } = buildAvatarStack(registry, 'session-unloaded');
        const alice = new LocalIdentityProvider(new InMemoryStorageProvider());
        alice.login('session-unloaded-owner');
        const wallStack = publishWallDocument(alice, brickRegistry, 'Unloaded Wall');

        const session = new WorldNavigationSession({
            registry: brickRegistry, loadPublicationDocumentUseCase: wallStack.loadPublicationDocumentUseCase,
            worldLayoutProvider: wallStack.worldLayoutProvider, discoveryProvider: wallStack.discoveryProvider,
            placementRegistry: wallStack.placementRegistry, avatarProfileUseCase, avatarPresenceSession
        });
        session._session = spyFacade();
        session._setupLocalAvatar();
        // Deliberately NOT calling session._loadWorld() — this
        // replica never streamed the wall's document in at all.

        avatarPresenceSession.update({ position: { x: wallStack.worldPosition.x + 1, y: 0, z: wallStack.worldPosition.z - 2 } });
        session.setAvatarControlMode(true);
        session.avatarKeyDown('w');
        for (let i = 0; i < 60; i++) {
            session._avatarMovementController.tick(0.05);
        }
        session.avatarKeyUp('w');

        assert(avatarPresenceSession.current.position.z > wallStack.worldPosition.z + 0.5,
            '43. WorldNavigationSession: an UNLOADED wall never obstructs — the avatar walks straight through where it would be');
        assert(session._avatarMovementController.isCollided() === false,
            '44. WorldNavigationSession: no collision is ever reported for geometry this replica never streamed in');
    }
    {
        // A session with no local avatar at all (nobody logged in) —
        // _setupLocalAvatar() returns immediately, exactly 0.2.35's
        // own established behavior; this milestone changes nothing
        // about that early return.
        const session = new WorldNavigationSession({ registry: brickRegistry, loadPublicationDocumentUseCase: null, worldLayoutProvider: null });
        session._session = spyFacade();
        let threw = false;
        try { session._setupLocalAvatar(); } catch (e) { threw = true; }
        assert(!threw, '45. WorldNavigationSession: _setupLocalAvatar() with no avatar wired never throws, collision or otherwise');
        assert(session._avatarMovementController === null, '46. WorldNavigationSession: no movement controller is ever built without a local avatar');
    }

    // -------------------------------------------------------------
    // Section E — FLAGSHIP: the design doc's own scripted scenario.
    //
    //   Publish a wall -> place it -> load it into Alice's World View
    //   -> stand next to it -> hold W -> stop at the boundary ->
    //   turn 90 degrees -> slide along it -> jump against it ->
    //   never penetrate -> Document/Publication/Placement remain
    //   byte-identical -> AvatarPresence's own wire shape is
    //   unchanged -> a real remote replica (Bob) sees Alice's
    //   ALREADY-CONSTRAINED movement through ordinary presence sync,
    //   with zero special-casing anywhere in his own session.
    // -------------------------------------------------------------
    {
        const channelName = 'forkbuild-test-flagship-0-2-42';

        const storage = new InMemoryStorageProvider();
        const alice = new LocalIdentityProvider(storage);
        alice.login('alice');
        const aliceAvatarProfileUseCase = new AvatarProfileUseCase(storage, alice, registry);
        aliceAvatarProfileUseCase.updateProfile({ templateId: 'humanoid-01', displayName: 'Alice' });
        const aliceProfile = aliceAvatarProfileUseCase.getProfile();
        const aliceAvatarPresenceSession = new AvatarPresenceSession(aliceProfile, { position: { x: 0, y: 0, z: 0 } });
        const aliceBroadcastProvider = new LocalAvatarPresenceBroadcastProvider(channelName);

        const wallStack = publishWallDocument(alice, brickRegistry, 'Flagship Wall');
        const worldPos = wallStack.worldPosition;

        const placementBefore = wallStack.placementRegistry.findByPublicationId(wallStack.publication.id)[0];
        const placementJsonBefore = JSON.stringify(placementBefore.toJSON());
        const documentKeysBefore = storage.list().filter((k) => k.startsWith('document:')).length;
        const aliceProfileJsonBefore = JSON.stringify(aliceAvatarProfileUseCase.getProfile().toJSON());

        const aliceSession = new WorldNavigationSession({
            registry: brickRegistry, loadPublicationDocumentUseCase: wallStack.loadPublicationDocumentUseCase,
            worldLayoutProvider: wallStack.worldLayoutProvider, identityProvider: alice,
            discoveryProvider: wallStack.discoveryProvider, placementRegistry: wallStack.placementRegistry,
            avatarProfileUseCase: aliceAvatarProfileUseCase, avatarPresenceSession: aliceAvatarPresenceSession,
            presenceBroadcastProvider: aliceBroadcastProvider, avatarTemplateRegistry: registry
        });
        const aliceFacade = spyFacade();
        aliceSession._session = aliceFacade;
        aliceSession._setupRemoteAvatars();
        aliceSession._setupLocalAvatar();
        aliceSession._loadWorld(wallStack.publication.documentId);

        // Stand Alice directly south of the wall's middle brick,
        // facing it (rotationY 0 -> +Z is "forward").
        aliceAvatarPresenceSession.update({ position: { x: worldPos.x + 1, y: 0, z: worldPos.z - 2 }, rotation: { y: 0 } });

        // 1-2. Hold W toward it -> verify she stops at the boundary.
        aliceSession.setAvatarControlMode(true);
        aliceSession.avatarKeyDown('w');
        for (let i = 0; i < 60; i++) { // 3 real seconds at WALK_SPEED=3 -> 9 units of unobstructed travel, way more than the 1.5-unit gap
            aliceSession._avatarMovementController.tick(0.05);
        }
        aliceSession.avatarKeyUp('w');
        const stoppedZ = aliceAvatarPresenceSession.current.position.z;
        assert(stoppedZ < worldPos.z - 0.5, '47. FLAGSHIP: Alice stops before the wall\'s near face...');
        assert(stoppedZ > worldPos.z - 1, '48. FLAGSHIP: ...specifically AT the collision boundary, not somewhere well short of it');
        assert(aliceSession._avatarMovementController.isCollided() === true, '49. FLAGSHIP: the controller reports the collision');

        // 3-4. Turn 90 degrees, then slide along the wall.
        aliceSession.avatarKeyDown('d');
        for (let i = 0; i < 12; i++) { // 150 deg/s * 0.6s = 90 degrees
            aliceSession._avatarMovementController.tick(0.05);
        }
        aliceSession.avatarKeyUp('d');
        assert(Math.abs(aliceAvatarPresenceSession.current.rotation.y - 90) < 1,
            '50. FLAGSHIP: Alice has turned approximately 90 degrees');
        const zAfterTurn = aliceAvatarPresenceSession.current.position.z;

        aliceSession.avatarKeyDown('w');
        for (let i = 0; i < 20; i++) {
            aliceSession._avatarMovementController.tick(0.05);
        }
        aliceSession.avatarKeyUp('w');
        assert(aliceAvatarPresenceSession.current.position.x > worldPos.x + 1,
            '51. FLAGSHIP: sliding along the wall\'s face — X keeps advancing...');
        assert(Math.abs(aliceAvatarPresenceSession.current.position.z - zAfterTurn) < 0.05,
            '52. FLAGSHIP: ...while Z stays essentially where the wall left it — a slide, not a re-block or a fall-away');

        // 5-6. Reposition in front of the wall again and jump against
        // it — verify she still cannot penetrate it while airborne.
        aliceAvatarPresenceSession.update({ position: { x: worldPos.x + 1, y: 0, z: worldPos.z - 1.5 }, rotation: { y: 0 } });
        aliceSession.avatarKeyDown('w');
        aliceSession.avatarKeyDown(' ');
        let everAirborne = false;
        let penetrated = false;
        for (let i = 0; i < 40; i++) {
            aliceSession._avatarMovementController.tick(0.05);
            if (aliceAvatarPresenceSession.current.position.y > 0.01) everAirborne = true;
            if (aliceAvatarPresenceSession.current.position.z >= worldPos.z - AVATAR_COLLISION_RADIUS) penetrated = true;
        }
        aliceSession.avatarKeyUp('w');
        aliceSession.avatarKeyUp(' ');
        assert(everAirborne === true, '53. FLAGSHIP: Alice actually left the ground at some point (a real jump happened)');
        assert(penetrated === false, '54. FLAGSHIP: ...and never penetrated the wall while airborne, even once');

        // 7. Document, Publication, and Placement remain byte-identical.
        const placementAfter = wallStack.placementRegistry.findByPublicationId(wallStack.publication.id)[0];
        assert(JSON.stringify(placementAfter.toJSON()) === placementJsonBefore,
            '55. FLAGSHIP: WorldPlacement/PlacementRecord is byte-identical after the entire collision scenario');
        assert(wallStack.document.metadata.title === 'Flagship Wall', '56. FLAGSHIP: DocumentMetadata is untouched');
        const documentKeysAfter = storage.list().filter((k) => k.startsWith('document:')).length;
        assert(documentKeysAfter === documentKeysBefore, '57. FLAGSHIP: no document is ever created for the avatar, its movement, or a collision');
        assert(JSON.stringify(aliceAvatarProfileUseCase.getProfile().toJSON()) === aliceProfileJsonBefore,
            '58. FLAGSHIP: AvatarProfile is completely untouched by collision — appearance and movement stay separate concerns');

        // 8. Presence's own wire shape carries only avatar state —
        // no collided/grounded ever leaks onto it.
        const presenceJson = aliceAvatarPresenceSession.current.toJSON();
        const presenceKeys = Object.keys(presenceJson).sort();
        assert(JSON.stringify(presenceKeys) === JSON.stringify(['animation', 'avatarId', 'ownerIdentity', 'position', 'rotation', 'sequence', 'timestamp']),
            '59. FLAGSHIP: AvatarPresence\'s own JSON shape is EXACTLY what 0.2.33/0.2.37 established — nothing collision-related ever joins it');

        // 9. A real remote replica (Bob) sees Alice's ALREADY-
        // CONSTRAINED movement through completely ordinary presence
        // sync — no collision-aware special-casing anywhere in his
        // own session; he just receives whatever position Alice's own
        // (already-collided) presence actually holds.
        const bob = new LocalIdentityProvider(new InMemoryStorageProvider());
        bob.login('bob');
        const bobBroadcastProvider = new LocalAvatarPresenceBroadcastProvider(channelName);
        const bobSession = new WorldNavigationSession({
            registry: brickRegistry, loadPublicationDocumentUseCase: wallStack.loadPublicationDocumentUseCase,
            worldLayoutProvider: wallStack.worldLayoutProvider, discoveryProvider: wallStack.discoveryProvider,
            placementRegistry: wallStack.placementRegistry,
            presenceBroadcastProvider: bobBroadcastProvider, avatarTemplateRegistry: registry
        });
        const bobFacade = spyFacade();
        bobSession._session = bobFacade;
        bobSession._setupRemoteAvatars();
        assert(bobSession.hasLocalAvatar() === false, '60. FLAGSHIP: Bob has no avatar of his own — watching never requires having one');

        // Alice moves once more (a small, deliberate nudge along the
        // wall, still constrained) so a fresh presence advertisement
        // actually goes out on the wire for Bob to receive.
        aliceAvatarPresenceSession.update({ position: { x: worldPos.x + 1, y: 0, z: worldPos.z - 1.5 }, rotation: { y: 90 } });
        aliceSession.avatarKeyDown('w');
        for (let i = 0; i < 10; i++) {
            aliceSession._avatarMovementController.tick(0.05);
        }
        aliceSession.avatarKeyUp('w');
        const aliceFinal = aliceAvatarPresenceSession.current.position;

        await new Promise((resolve) => setTimeout(resolve, 50));
        const bobKnown = bobSession._presenceSyncService.pull(Date.now());
        bobSession._remoteAvatarRegistry.sync(bobKnown, Date.now());
        const aliceAsSeenByBob = bobKnown.find((k) => k.advertisement.avatarId === aliceProfile.avatarId);
        assert(aliceAsSeenByBob !== undefined, '61. FLAGSHIP: Bob actually receives Alice\'s presence');
        assert(Math.abs(aliceAsSeenByBob.advertisement.position.x - aliceFinal.x) < 1e-9
            && Math.abs(aliceAsSeenByBob.advertisement.position.z - aliceFinal.z) < 1e-9,
            '62. FLAGSHIP: Bob sees EXACTLY Alice\'s own already-constrained position — no second, differently-computed value, no special-casing');

        aliceSession.dispose();
        aliceBroadcastProvider.dispose();
        bobBroadcastProvider.dispose();
    }

    console.log('✅ All Avatar-World Collision & Movement Constraint tests passed.');
}

// Top-level await — see tests/AvatarRendering.test.js's comment for
// why the usual fire-and-forget `runTests().catch(...)` pattern isn't
// reliably safe even for a file with no real macrotask scheduling.
await runTests();
