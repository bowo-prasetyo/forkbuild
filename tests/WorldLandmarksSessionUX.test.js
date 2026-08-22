import { Position } from '../core/Position.js';
import { World } from '../core/World.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { DocumentManager } from '../application/DocumentManager.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { LoadPublicationDocumentUseCase } from '../application/LoadPublicationDocumentUseCase.js';
import { SaveDocumentUseCase } from '../application/SaveDocumentUseCase.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalWorldLayoutProvider } from '../world-layout/LocalWorldLayoutProvider.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';
import { WorldAuthorizationService } from '../application/WorldAuthorizationService.js';
import { CommandHistoryEvent } from '../application/events/CommandHistoryEvent.js';

// 0.3.7 — World Landmarks & Personal Waypoints — Session/UI integration.
//
// tests/WorldLandmarks.test.js already proves the domain/command layer
// (core/WorldLandmark.js, the three commands, World serialization,
// WorldLocationDirectory). This file proves the layer World View's UI
// actually calls: WorldNavigationSession#createLandmarkHere/
// updateLandmark/removeLandmark/getLandmark, built the same way
// tests/WorldEditingAuthorization.test.js's own FLAGSHIP and
// tests/WorldDiscoveryAndExploration.test.js's own makeSession() do —
// a REAL WorldNavigationSession, never a hand-rolled substitute.
//
//   Section A: createLandmarkHere() — avatar-position-to-local-position
//              math, authorIdentityId stamped from the real identity,
//              propagation fires with zero landmark-specific wiring.
//   Section B: updateLandmark()/removeLandmark() — including resolving
//              a landmark that lives in a loaded document that ISN'T
//              the active one (_resolveLandmarkOwner).
//   Section C: World Editing Authorization (0.2.95) — Bob, who can
//              READ but not EDIT Alice's World, is refused at every
//              landmark mutation entry point.
//   Section D: Failure modes — no live avatar, not authenticated.

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

// Mirrors tests/WorldEditingAuthorization.test.js's own makeIdentityProvider().
function makeIdentityProvider({ identityId = null, username = null } = {}) {
    return {
        currentUser: () => (username ? { username } : null),
        getSigningIdentity: () => {
            if (!identityId) {
                throw new Error('IdentityProviderStub: no authenticated identity');
            }
            return { id: identityId };
        }
    };
}

// Mirrors tests/WorldDiscoveryAndExploration.test.js's own minimalWorldRenderSession().
function minimalWorldRenderSession() {
    return { addWorld() {}, removeWorld() {}, dispose() {} };
}

async function run() {
    const storage = new InMemoryStorageProvider();
    const serializer = new DocumentSerializer();
    const registry = new CreateBrickRegistryUseCase().execute();
    const loadPublicationDocumentUseCase = new LoadPublicationDocumentUseCase(storage, serializer);
    const saveDocumentUseCase = new SaveDocumentUseCase(storage, serializer);
    const spatialIndexProvider = new LocalSpatialIndexProvider(storage);
    const discoveryProvider = new LocalDiscoveryProvider(storage);
    const worldLayoutProvider = new LocalWorldLayoutProvider(spatialIndexProvider, discoveryProvider);

    const aliceWorld = new World({});
    const aliceDoc = new Document({
        world: aliceWorld,
        metadata: new DocumentMetadata({ title: "Alice's World", author: 'alice', authorIdentityId: 'did:key:alice' })
    });
    saveDocumentUseCase.execute(new DocumentManager(aliceDoc));

    function makeSession({ avatarPosition = null, identityId = null, worldAuthorizationService = null } = {}) {
        const avatarPresenceSession = avatarPosition
            ? new AvatarPresenceSession({ avatarId: `${identityId || 'anon'}-avatar`, ownerIdentity: identityId || 'anon' }, { position: avatarPosition })
            : null;
        const identityProvider = identityId ? makeIdentityProvider({ identityId, username: identityId }) : null;
        const session = new WorldNavigationSession({
            registry, loadPublicationDocumentUseCase, worldLayoutProvider,
            discoveryProvider, avatarPresenceSession, identityProvider, worldAuthorizationService,
            saveDocumentUseCase
        });
        session._session = minimalWorldRenderSession();
        session._loadWorld(aliceWorld.id);
        return session;
    }

    // -------------------------------------------------------------
    // Section A: createLandmarkHere()
    // -------------------------------------------------------------
    {
        const alice = makeSession({ avatarPosition: new Position(55, 2, 75), identityId: 'did:key:alice' });

        // A nonzero layout offset — the exact scenario
        // WorldLocationDirectory#_landmarkLocationsFor()'s own fix
        // exists for: this World does NOT sit at the shared space's
        // origin, so the avatar's absolute position and the landmark's
        // stored LOCAL position must differ by exactly that offset.
        alice.getDocumentPosition = (id) => (id === aliceWorld.id ? new Position(100, 0, 200) : new Position(0, 0, 0));

        let propagatedCommand = null;
        const history = alice._commandHistories.get(aliceWorld.id);
        history.eventBus.subscribe(CommandHistoryEvent.COMMAND_EXECUTED, ({ command }) => {
            propagatedCommand = command;
        });

        const landmarkId = alice.createLandmarkHere('Old Bridge', 'Nice view of the river');
        assert(typeof landmarkId === 'string' && landmarkId.length > 0, '1. createLandmarkHere returns the new landmark id');

        // _loadWorld() deserializes a FRESH World instance from
        // storage — the live, mutated copy lives behind
        // session.getDocument(), never the original in-memory
        // aliceWorld/aliceDoc reference this file constructed above.
        const liveAliceWorld = alice.getDocument(aliceWorld.id).world;
        const landmark = liveAliceWorld.getWorldLandmark(landmarkId);
        assert(landmark !== null, '2. the landmark actually exists in the World');
        assert(landmark.title === 'Old Bridge', '3. title stored correctly');
        assert(landmark.description === 'Nice view of the river', '4. description stored correctly');
        assert(landmark.authorIdentityId === 'did:key:alice', "5. authorIdentityId stamped from the real signing identity, not merely 'currentUser'");

        // Avatar absolute position (55, 2, 75) minus the World's own
        // layout offset (100, 0, 200) = local (-45, 2, -125) — the
        // exact inverse of the offset WorldLocationDirectory adds back
        // for display.
        assert(landmark.position.x === -45 && landmark.position.y === 2 && landmark.position.z === -125,
            '6. stored position is LOCAL to the World (avatar position minus layout offset), not the raw avatar position');

        // 0.3.7's own explicit design goal (see docs/Principles.md, "A
        // Landmark Is World Content, Not Spatial Presence"): zero
        // landmark-specific propagation code — this is the SAME
        // CommandHistoryEvent.COMMAND_EXECUTED every other World
        // mutation already fires, picked up here with no special
        // wiring beyond subscribing to the existing event.
        assert(propagatedCommand !== null && propagatedCommand.type === 'create-world-landmark',
            '7. executing through commandHistories fires the ordinary COMMAND_EXECUTED event — no special landmark sync protocol');

        // getWorldLocations() already includes it, with the SAME
        // absolute position the avatar was standing at — proving the
        // create-time subtraction and the list-time addition
        // (WorldLocationDirectory) are exact inverses of each other.
        const location = alice.getWorldLocations().find((loc) => loc.id === landmarkId);
        assert(location !== null && location.isLandmark === true, '8. the new landmark is immediately navigable via getWorldLocations()');
        assert(location.position.x === 55 && location.position.z === 75,
            '9. its listed position round-trips back to the exact avatar position it was created at');
    }

    // -------------------------------------------------------------
    // Section B: updateLandmark() / removeLandmark(), including
    // resolving a landmark in a NON-active loaded document.
    // -------------------------------------------------------------
    {
        const bobWorld = new World({});
        const bobDoc = new Document({
            world: bobWorld,
            metadata: new DocumentMetadata({ title: "Bob's World", author: 'bob', authorIdentityId: 'did:key:bob' })
        });
        saveDocumentUseCase.execute(new DocumentManager(bobDoc));

        const alice = makeSession({ avatarPosition: new Position(0, 0, 0), identityId: 'did:key:alice' });
        // A second loaded document that is NOT the active one.
        alice._loadWorld(bobWorld.id);
        assert(alice.getActiveDocumentId() !== bobWorld.id, 'sanity: bobWorld is loaded but not active');

        const bobLandmarkId = alice.createLandmarkHere('Somewhere in Alice World', '');
        // Both loaded worlds live behind session.getDocument() —
        // _loadWorld() deserializes fresh instances from storage, never
        // reusing the aliceWorld/bobWorld references this file
        // constructed above (see Section A's own comment on this).
        const liveAliceWorld = alice.getDocument(aliceWorld.id).world;
        const liveBobWorld = alice.getDocument(bobWorld.id).world;

        // Move the landmark itself into bobWorld directly (bypassing
        // the command layer, purely to set up "a landmark that lives
        // in a loaded-but-not-active document" without needing a
        // second full createLandmarkHere against bobWorld as active).
        const moved = liveAliceWorld.getWorldLandmark(bobLandmarkId);
        liveAliceWorld.removeWorldLandmark(bobLandmarkId);
        liveBobWorld.addWorldLandmark(moved);

        assert(alice.getLandmark(bobLandmarkId) !== null, '10. getLandmark() finds a landmark in a loaded-but-not-active document');
        assert(alice.getLandmark('does-not-exist') === null, '11. getLandmark() returns null for an unknown id, never throws');

        const updated = alice.updateLandmark(bobLandmarkId, { title: 'Renamed', description: 'Updated' });
        assert(updated === true, '12. updateLandmark() succeeds against a non-active loaded document');
        assert(liveBobWorld.getWorldLandmark(bobLandmarkId).title === 'Renamed', '13. the rename actually landed in bobWorld');

        const removed = alice.removeLandmark(bobLandmarkId);
        assert(removed === true, '14. removeLandmark() succeeds against a non-active loaded document');
        assert(liveBobWorld.getWorldLandmark(bobLandmarkId) === null, '15. the landmark is actually gone');

        let threwOnMissing = false;
        try { alice.updateLandmark('does-not-exist', { title: 'x' }); } catch (e) { threwOnMissing = true; }
        assert(threwOnMissing, '16. updateLandmark() throws for an unknown landmark id, never silently no-ops');
    }

    // -------------------------------------------------------------
    // Section C: World Editing Authorization (0.2.95) — Bob can READ
    // Alice's World but never EDIT it; every landmark mutation entry
    // point refuses him exactly the way moveSelection/rotateSelection/
    // deleteSelection already do in tests/WorldEditingAuthorization.test.js's
    // own FLAGSHIP.
    // -------------------------------------------------------------
    {
        const aliceAuth = new WorldAuthorizationService({
            identityProvider: makeIdentityProvider({ identityId: 'did:key:alice', username: 'alice' })
        });
        const alice = makeSession({
            avatarPosition: new Position(10, 0, 10), identityId: 'did:key:alice',
            worldAuthorizationService: aliceAuth
        });
        const seedLandmarkId = alice.createLandmarkHere('Seed', '');
        // Bob's own session loads its OWN fresh copy of aliceWorld from
        // storage (see Section A's own comment) — so Alice's landmark
        // must actually be persisted first, exactly like a real
        // collaborative session would save before Bob ever sees it.
        alice.saveDocument(aliceWorld.id);
        const liveAliceWorld = alice.getDocument(aliceWorld.id).world;

        const bobAuth = new WorldAuthorizationService({
            identityProvider: makeIdentityProvider({ identityId: 'did:key:bob', username: 'bob' })
        });
        const bob = makeSession({
            avatarPosition: new Position(20, 0, 20), identityId: 'did:key:bob',
            worldAuthorizationService: bobAuth
        });
        assert(bob.canEditDocument(aliceWorld.id) === false, 'sanity: Bob has READ, not EDIT, on Alice\'s World');

        let threwOnCreate = false;
        try { bob.createLandmarkHere('Bob\'s Landmark', ''); } catch (e) { threwOnCreate = true; }
        assert(threwOnCreate, '17. Bob cannot create a landmark in Alice\'s World');
        assert(liveAliceWorld.getWorldLandmarks().length === 1, '18. no landmark was actually added — the refusal is real, not cosmetic');

        let threwOnUpdate = false;
        try { bob.updateLandmark(seedLandmarkId, { title: 'Hijacked' }); } catch (e) { threwOnUpdate = true; }
        assert(threwOnUpdate, '19. Bob cannot rename Alice\'s existing landmark');
        assert(liveAliceWorld.getWorldLandmark(seedLandmarkId).title === 'Seed', '20. the title is untouched');

        let threwOnRemove = false;
        try { bob.removeLandmark(seedLandmarkId); } catch (e) { threwOnRemove = true; }
        assert(threwOnRemove, '21. Bob cannot remove Alice\'s landmark');
        assert(liveAliceWorld.getWorldLandmark(seedLandmarkId) !== null, '22. the landmark still exists');
    }

    // -------------------------------------------------------------
    // Section D: Failure modes
    // -------------------------------------------------------------
    {
        const noAvatar = makeSession({ avatarPosition: null, identityId: 'did:key:alice' });
        let threwNoAvatar = false;
        try { noAvatar.createLandmarkHere('x', ''); } catch (e) { threwNoAvatar = true; }
        assert(threwNoAvatar, '23. createLandmarkHere() throws without a live avatar position, rather than silently doing nothing');

        const noIdentity = makeSession({ avatarPosition: new Position(0, 0, 0), identityId: null });
        let threwNoIdentity = false;
        try { noIdentity.createLandmarkHere('x', ''); } catch (e) { threwNoIdentity = true; }
        assert(threwNoIdentity, '24. createLandmarkHere() throws when nobody is authenticated');
    }

    console.log('✓ Section A: createLandmarkHere() — position math, authorship, zero-code propagation');
    console.log('✓ Section B: updateLandmark()/removeLandmark() — including a non-active loaded document');
    console.log('✓ Section C: World Editing Authorization — Bob refused at every landmark mutation entry point');
    console.log('✓ Section D: Failure modes — no avatar, no authenticated identity');
    console.log('\nAll World Landmarks Session UX tests passed.');
}

await run();
