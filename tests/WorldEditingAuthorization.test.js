import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { LoadPublicationDocumentUseCase } from '../application/LoadPublicationDocumentUseCase.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalWorldLayoutProvider } from '../world-layout/LocalWorldLayoutProvider.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { SpatialEditingService } from '../application/SpatialEditingService.js';
import { CommandHistory } from '../application/CommandHistory.js';
import { SpatialSelectionState } from '../application/spatial-state/SpatialSelectionState.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';
import { WorldAuthorizationService } from '../application/WorldAuthorizationService.js';
import { WorldAccessLevel, worldAccessAtLeast, isValidWorldAccessLevel } from '../core/WorldAccessLevel.js';
import { resolveSigningIdentityId } from '../identity/resolveSigningIdentityId.js';
import { ForkDocumentUseCase } from '../application/ForkDocumentUseCase.js';

// 0.2.95 — World Editing Authorization Foundation.
//
// 0.2.93 established "Selection In World View Does Not Imply Editing
// Authority" — but named its own limit plainly: "there is no permission
// check anywhere in this milestone's code, on purpose... that is what
// makes the eventual question 'is Alice AUTHORIZED to move this?'
// (0.2.95) attachable to one clean seam later." This file proves that
// seam actually exists and actually holds:
//
//   Section A: core/WorldAccessLevel.js — the closed NONE/READ/EDIT
//              vocabulary and its total order.
//   Section B: application/WorldAuthorizationService.js in isolation —
//              ownership by cryptographic identity, legacy label
//              fallback, blocking overrides ownership, graceful
//              defaults for an absent document/viewer.
//   Section C: core/DocumentMetadata.js#authorIdentityId — construction,
//              JSON round-trip, and tolerant degrade for a document
//              saved before this milestone.
//   Section D: identity/resolveSigningIdentityId.js — tolerant of a
//              provider with no crypto surface, a provider that throws
//              because nobody is authenticated, and a real identity.
//   Section E: application/SpatialEditingService.js — the ONE seam:
//              a `canEditDocument` predicate gates getEditingContext()
//              AND every real mutation chokepoint directly, so a caller
//              that skips getEditingContext() entirely still gets
//              refused. The pre-0.2.95 default (no predicate passed)
//              is untouched.
//   Section F: application/ForkDocumentUseCase.js — forking stamps the
//              FORKER's own identity as the new document's owner.
//   Section G: FLAGSHIP — Alice owns a World; Bob can read it but not
//              edit it; Charlie is blocked and can do neither; Alice's
//              own second device inherits her authority through device
//              authorization, and loses it the moment that
//              authorization is revoked — all verified against a real
//              WorldNavigationSession. 0.5.9 — World View Read-Only
//              Exploration & Fork-to-Edit retired every brick-mutation
//              entry point this section used to drive
//              (moveSelection/rotateSelection/deleteSelection/
//              alignSelection/applyNumericTransform — EditorSession
//              alone owns those now); this section now drives the SAME
//              canEditDocument() gate through createLandmarkHere()/
//              updateLandmark()/removeLandmark() instead — World
//              Region/Landmark naming is the one mutation surface
//              World View kept, and it is gated by the exact same
//              seam. See docs/Principles.md, "World View Observes and
//              Navigates; Editor Mutates and Builds (0.5.9)".

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

function buildOneBrickWorld(position = new Position(0, 0.5, 0)) {
    const world = new World({});
    const building = new Building({});
    building.addBrick(new Brick({ definitionId: 'core:cube', position }));
    world.addBuilding(building);
    return world;
}

// Mirrors tests/WorldViewInstanceInspection.test.js's own stubRenderer().
function stubRenderer(extra = {}) {
    const calls = { selectBricks: [], clearSelection: 0, clearHover: 0 };
    const facade = {
        addWorld() {}, removeWorld() {}, dispose() {},
        clearSelection() { calls.clearSelection++; },
        clearHover() { calls.clearHover++; },
        selectBricks(brickIds, primaryBrickId) { calls.selectBricks.push({ brickIds, primaryBrickId }); },
        hoverBrick() {},
        pick() { return null; }, pickGround() { return null; }, pickPlacement() { return null; },
        pickRectangle() { return []; },
        setControlsEnabled() {},
        getCameraState() { return { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } }; },
        setCameraState() {},
        ...extra
    };
    facade.calls = calls;
    return facade;
}

// An IdentityProvider test double implementing exactly the surface
// resolveSigningIdentityId()/currentUser() consult — never a full
// LocalIdentityProvider, mirroring how every other test in this suite
// builds the smallest double that satisfies the collaborator contract.
function makeIdentityProvider({ identityId = null, username = null, throwsOnSign = false } = {}) {
    return {
        currentUser: () => (username ? { username } : null),
        getSigningIdentity: () => {
            if (throwsOnSign || !identityId) {
                throw new Error('IdentityProviderStub: no authenticated identity');
            }
            return { id: identityId };
        }
    };
}

async function run() {
    // -------------------------------------------------------------
    // Section A: core/WorldAccessLevel.js
    // -------------------------------------------------------------
    {
        assert(WorldAccessLevel.NONE === 'none' && WorldAccessLevel.READ === 'read' && WorldAccessLevel.EDIT === 'edit',
            '1. the three-value vocabulary is exactly NONE/READ/EDIT');
        assert(isValidWorldAccessLevel(WorldAccessLevel.EDIT) === true, '2. EDIT is a valid level');
        assert(isValidWorldAccessLevel('admin') === false, '3. a role-shaped string is never a valid level — this is not a role system');
        assert(worldAccessAtLeast(WorldAccessLevel.EDIT, WorldAccessLevel.READ) === true, '4. EDIT >= READ');
        assert(worldAccessAtLeast(WorldAccessLevel.READ, WorldAccessLevel.EDIT) === false, '5. READ is not >= EDIT');
        assert(worldAccessAtLeast(WorldAccessLevel.NONE, WorldAccessLevel.READ) === false, '6. NONE is not >= READ');
        assert(worldAccessAtLeast(WorldAccessLevel.READ, WorldAccessLevel.READ) === true, '7. a level is always >= itself');
        assert(worldAccessAtLeast('bogus', WorldAccessLevel.READ) === false, '8. an invalid level never satisfies atLeast');
    }

    // -------------------------------------------------------------
    // Section B: application/WorldAuthorizationService.js in isolation
    // -------------------------------------------------------------
    {
        const ownedDoc = new Document({
            world: new World({}),
            metadata: new DocumentMetadata({ author: 'alice', authorIdentityId: 'did:key:alice' })
        });

        // Owner, resolved cryptographically.
        const ownerService = new WorldAuthorizationService({
            identityProvider: makeIdentityProvider({ identityId: 'did:key:alice', username: 'alice' })
        });
        assert(ownerService.resolveAccess(ownedDoc) === WorldAccessLevel.EDIT, '9. the cryptographic owner gets EDIT');
        assert(ownerService.canEdit(ownedDoc) === true && ownerService.canRead(ownedDoc) === true, '10. canEdit/canRead agree with resolveAccess');

        // A different identity, same or different username — never EDIT.
        const strangerService = new WorldAuthorizationService({
            identityProvider: makeIdentityProvider({ identityId: 'did:key:bob', username: 'alice' })
        });
        assert(strangerService.resolveAccess(ownedDoc) === WorldAccessLevel.READ,
            '11. a DIFFERENT identityId gets only READ even if the display name happens to match — the whole reason authorIdentityId exists');

        // No document at all -> NONE, never a throw.
        assert(ownerService.resolveAccess(null) === WorldAccessLevel.NONE, '12. a null document resolves to NONE');
        assert(ownerService.canEdit(null) === false && ownerService.canRead(null) === false, '13. canEdit/canRead are both false for a null document');

        // Blocking overrides ownership.
        const blockedOwnerService = new WorldAuthorizationService({
            identityProvider: makeIdentityProvider({ identityId: 'did:key:alice', username: 'alice' }),
            isBlocked: (id) => id === 'did:key:alice'
        });
        assert(blockedOwnerService.resolveAccess(ownedDoc) === WorldAccessLevel.NONE,
            '14. a blocked identity gets NONE even for a World it owns — block is checked first, ownership second');

        // Legacy label fallback: a document with no authorIdentityId at
        // all (pre-0.2.95) still recognizes its author by username.
        const legacyDoc = new Document({
            world: new World({}),
            metadata: new DocumentMetadata({ author: 'carol' })
        });
        const legacyOwnerService = new WorldAuthorizationService({
            identityProvider: makeIdentityProvider({ username: 'carol' }) // no identityId — no crypto surface
        });
        assert(legacyOwnerService.resolveAccess(legacyDoc) === WorldAccessLevel.EDIT,
            '15. a pre-0.2.95 document degrades to comparing the legacy author label when neither side has a strong identity');

        // The degrade is ONLY for "couldn't compare," never a fallback
        // after a strong comparison already failed.
        const strongMismatchButSameLabelDoc = new Document({
            world: new World({}),
            metadata: new DocumentMetadata({ author: 'carol', authorIdentityId: 'did:key:carol' })
        });
        const impersonatorService = new WorldAuthorizationService({
            identityProvider: makeIdentityProvider({ identityId: 'did:key:mallory', username: 'carol' })
        });
        assert(impersonatorService.resolveAccess(strongMismatchButSameLabelDoc) === WorldAccessLevel.READ,
            '16. typing the same display name never grants EDIT once the document records a real owner identity');

        // An anonymous/unresolvable viewer can still explore.
        const anonymousService = new WorldAuthorizationService({});
        assert(anonymousService.resolveAccess(ownedDoc) === WorldAccessLevel.READ,
            '17. a viewer with no resolvable identity at all still gets READ, never NONE — exploration stays open by default');

        // resolveSocialIdentity, when wired, takes priority over the
        // bare identityProvider signing identity — the multi-device path
        // exercised end-to-end in Section G below.
        const deviceService = new WorldAuthorizationService({
            identityProvider: makeIdentityProvider({ identityId: 'did:key:alice-phone', username: 'alice' }),
            resolveSocialIdentity: () => ({ identityId: 'did:key:alice', mode: 'DEVICE', deviceIdentityId: 'did:key:alice-phone' })
        });
        assert(deviceService.resolveAccess(ownedDoc) === WorldAccessLevel.EDIT,
            '18. resolveSocialIdentity resolving to the PARENT identity grants EDIT even though the raw signing key differs');
    }

    // -------------------------------------------------------------
    // Section C: core/DocumentMetadata.js#authorIdentityId
    // -------------------------------------------------------------
    {
        const meta = new DocumentMetadata({ author: 'alice', authorIdentityId: 'did:key:alice' });
        assert(meta.authorIdentityId === 'did:key:alice', '19. authorIdentityId is exposed alongside author');

        const json = meta.toJSON();
        assert(json.authorIdentityId === 'did:key:alice', '20. it round-trips through toJSON()');
        const restored = DocumentMetadata.fromJSON(json);
        assert(restored.authorIdentityId === 'did:key:alice', '21. ...and back through fromJSON()');

        // A document saved before 0.2.95 has no authorIdentityId field
        // in its JSON at all — degrades to null, never throws.
        const legacyJson = { title: 'Old World', author: 'dave', created: null, modified: null, license: null };
        const legacyRestored = DocumentMetadata.fromJSON(legacyJson);
        assert(legacyRestored.authorIdentityId === null, '22. a pre-0.2.95 JSON payload with no authorIdentityId degrades to null');
        assert(legacyRestored.author === 'dave', '23. ...while the legacy author label is unaffected');
    }

    // -------------------------------------------------------------
    // Section D: identity/resolveSigningIdentityId.js
    // -------------------------------------------------------------
    {
        assert(resolveSigningIdentityId(null) === null, '24. no provider at all resolves to null');
        assert(resolveSigningIdentityId({}) === null, '25. a provider with no getSigningIdentity() resolves to null');
        assert(resolveSigningIdentityId(makeIdentityProvider({ throwsOnSign: true })) === null,
            '26. a provider that throws (nobody authenticated) resolves to null, never propagates the error');
        assert(resolveSigningIdentityId(makeIdentityProvider({ identityId: 'did:key:alice' })) === 'did:key:alice',
            '27. a real signing identity resolves correctly');
    }

    // -------------------------------------------------------------
    // Section E: application/SpatialEditingService.js — the one seam
    // -------------------------------------------------------------
    {
        const world = buildOneBrickWorld();
        const building = world.getBuildings()[0];
        const brick = building.getBricks()[0];
        const document = new Document({ world, metadata: new DocumentMetadata({ author: 'alice' }) });
        const fakeSession = { getDocument: () => document };
        const commandHistories = new Map([[world.id, new CommandHistory({ world })]]);
        const selection = SpatialSelectionState.brick({
            documentId: world.id, buildingId: building.id, brickId: brick.id
        });

        // Pre-0.2.95 default: no predicate passed at all (only 4
        // positional args) — every existing call site's exact shape.
        const openService = new SpatialEditingService(fakeSession, commandHistories, null);
        assert(openService.getEditingContext(selection).isEmpty === false, '28. with no predicate wired, editing context is unaffected (pre-0.2.95 behavior)');
        assert(openService.beginTransformGesture(selection, { mode: 'translate' }) !== null, '29. ...and beginTransformGesture() still works');
        openService.cancelTransformGesture(selection);

        // A predicate that refuses everything.
        const closedService = new SpatialEditingService(fakeSession, commandHistories, null, undefined, () => false);
        assert(closedService.getEditingContext(selection).isEmpty === true, '30. a refusing predicate empties the editing context');
        assert(closedService.beginTransformGesture(selection, { mode: 'translate' }) === null, '31. ...and refuses beginTransformGesture() directly — the gizmo/move/rotate/numeric chokepoint');
        assert(closedService._executeLayoutOperation(selection, () => null, 'Align') === false, '32. ...and _executeLayoutOperation() — align/distribute\'s chokepoint');
        assert(closedService._executeForSelection(selection, () => null, 'Delete') === false, '33. ...and _executeForSelection() — delete\'s chokepoint');
        assert(closedService.moveBrick(world.id, building.id, brick.id, { x: 1, y: 0, z: 0 }) === false, '34. ...and the direct moveBrick() entry point');
        assert(closedService.rotateBrick(world.id, building.id, brick.id, 90) === false, '35. ...and rotateBrick()');
        assert(closedService.deleteBrick(world.id, building.id, brick.id) === false, '36. ...and deleteBrick()');

        // The predicate is re-consulted per call, never cached —
        // toggling it mid-session changes the outcome immediately.
        let allowed = false;
        const dynamicService = new SpatialEditingService(fakeSession, commandHistories, null, undefined, () => allowed);
        assert(dynamicService.beginTransformGesture(selection, { mode: 'translate' }) === null, '37. refused while allowed=false');
        allowed = true;
        const gizmo = dynamicService.beginTransformGesture(selection, { mode: 'translate' });
        assert(gizmo !== null, '38. the SAME service, SAME selection, now allowed=true — permitted immediately, no re-construction needed');
        dynamicService.cancelTransformGesture(selection);
    }

    // -------------------------------------------------------------
    // Section F: application/ForkDocumentUseCase.js stamps the FORKER
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const sourceWorld = buildOneBrickWorld();
        const sourceDoc = new Document({ world: sourceWorld, metadata: new DocumentMetadata({ title: 'Alice World', author: 'alice', authorIdentityId: 'did:key:alice' }) });
        storage.save(sourceWorld.id, serializer.serialize(sourceDoc));

        const forkUseCase = new ForkDocumentUseCase(storage, serializer);
        const bobProvider = makeIdentityProvider({ identityId: 'did:key:bob', username: 'bob' });
        const forked = forkUseCase.execute(sourceWorld.id, bobProvider);

        assert(forked.metadata.author === 'bob', '39. the fork\'s legacy author label is the FORKER, not the source owner');
        assert(forked.metadata.authorIdentityId === 'did:key:bob',
            '40. the fork\'s authorIdentityId is ALSO the forker\'s own identity — forking never inherits ownership, only content');
        assert(sourceDoc.metadata.authorIdentityId === 'did:key:alice', '41. the SOURCE document\'s own ownership is untouched by someone else forking it');
    }

    // -------------------------------------------------------------
    // Section G: FLAGSHIP
    // -------------------------------------------------------------
    //   Alice owns World W. Bob can READ it but never EDIT it — every
    //   mutation entry point WorldNavigationSession still exposes
    //   (createLandmarkHere/updateLandmark/removeLandmark — 0.5.9
    //   retired every brick-level one) is refused for him. Charlie is
    //   blocked: NONE on both axes. Alice's own second device (DEVICE
    //   authorization) inherits her EDIT authority; the moment that
    //   authorization is revoked, the SAME physical device loses it —
    //   all without a single line of code anywhere checking "is this
    //   device Alice's phone," only ever asking WorldAuthorizationService.
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const registry = new CreateBrickRegistryUseCase().execute();
        const loadPublicationDocumentUseCase = new LoadPublicationDocumentUseCase(storage, serializer);
        const spatialIndexProvider = new LocalSpatialIndexProvider(storage);
        const discoveryProvider = new LocalDiscoveryProvider(storage);
        const worldLayoutProvider = new LocalWorldLayoutProvider(spatialIndexProvider, discoveryProvider);

        const aliceWorld = new World({});
        const aliceDoc = new Document({
            world: aliceWorld,
            metadata: new DocumentMetadata({ title: "Alice's World", author: 'alice', authorIdentityId: 'did:key:alice' })
        });
        storage.save(aliceWorld.id, serializer.serialize(aliceDoc));

        function buildSession(worldAuthorizationService, { avatarPosition = null, identityId = null } = {}) {
            const avatarPresenceSession = avatarPosition
                ? new AvatarPresenceSession({ avatarId: `${identityId || 'anon'}-avatar`, ownerIdentity: identityId || 'anon' }, { position: avatarPosition })
                : null;
            // createLandmarkHere() needs a signing identity, not just an
            // avatar position — mirrors tests/WorldLandmarksSessionUX.test.js's
            // own makeSession(). worldAuthorizationService's OWN identityProvider
            // (constructed separately, above, for canEditDocument()) is a
            // different collaborator from this one on purpose — this is
            // "who is signing the command," that is "who is asking to edit."
            const identityProvider = identityId ? makeIdentityProvider({ identityId, username: identityId }) : null;
            const session = new WorldNavigationSession({
                registry, loadPublicationDocumentUseCase, worldLayoutProvider,
                discoveryProvider, worldAuthorizationService, avatarPresenceSession, identityProvider
            });
            session._session = stubRenderer();
            session._loadWorld(aliceWorld.id);
            return session;
        }

        function readLandmarks(session) {
            return session.getDocument(aliceWorld.id).world.getWorldLandmarks();
        }

        // --- Alice: owner -----------------------------------------------
        let seedLandmarkId;
        {
            const aliceAuth = new WorldAuthorizationService({
                identityProvider: makeIdentityProvider({ identityId: 'did:key:alice', username: 'alice' })
            });
            const alice = buildSession(aliceAuth, { avatarPosition: new Position(0, 0, 0), identityId: 'did:key:alice' });
            assert(alice.getWorldAccessLevel(aliceWorld.id) === WorldAccessLevel.EDIT, '42. Alice: EDIT');
            assert(alice.canReadDocument(aliceWorld.id) === true, '43. Alice: canRead true');
            assert(alice.canEditDocument(aliceWorld.id) === true, '44. Alice: canEdit true');

            seedLandmarkId = alice.createLandmarkHere('Village Well', '');
            assert(typeof seedLandmarkId === 'string' && seedLandmarkId.length > 0, '45. Alice: createLandmarkHere succeeds on her own World');
            assert(alice.updateLandmark(seedLandmarkId, { title: 'Village Well (renamed)' }) === true, '46. Alice: updateLandmark succeeds too');
            assert(readLandmarks(alice)[0].title === 'Village Well (renamed)', '47. Alice: the landmark actually changed');
            assert(alice.removeLandmark(seedLandmarkId) === true, '48. Alice: removeLandmark succeeds — she owns this World outright');
            alice.saveDocument(aliceWorld.id);
        }

        // Bob/Charlie/the multi-device pair all need something ALREADY
        // there to try to mutate — re-seed it under Alice now that it was
        // removed above, and persist so every OTHER session's own fresh
        // _loadWorld() (below) actually sees it.
        {
            const aliceAuth = new WorldAuthorizationService({
                identityProvider: makeIdentityProvider({ identityId: 'did:key:alice', username: 'alice' })
            });
            const alice = buildSession(aliceAuth, { avatarPosition: new Position(0, 0, 0), identityId: 'did:key:alice' });
            seedLandmarkId = alice.createLandmarkHere('Village Well', '');
            alice.saveDocument(aliceWorld.id);
        }

        // --- Bob: read-only observer -------------------------------------
        {
            const bobAuth = new WorldAuthorizationService({
                identityProvider: makeIdentityProvider({ identityId: 'did:key:bob', username: 'bob' })
            });
            const bob = buildSession(bobAuth, { avatarPosition: new Position(5, 0, 5), identityId: 'did:key:bob' });
            assert(bob.getWorldAccessLevel(aliceWorld.id) === WorldAccessLevel.READ, '49. Bob: READ, not EDIT');
            assert(bob.canReadDocument(aliceWorld.id) === true, '50. Bob: canRead true — World View stays an exploration surface for him');
            assert(bob.canEditDocument(aliceWorld.id) === false, '51. Bob: canEdit false');

            assert(readLandmarks(bob).length === 1, '52. Bob: he can still SEE Alice\'s landmark — reading is not gated, only mutation');

            let threwOnCreate = false;
            try { bob.createLandmarkHere('Bob\'s Landmark', ''); } catch (e) { threwOnCreate = true; }
            assert(threwOnCreate, '53. Bob: createLandmarkHere() throws — he cannot add World content here');

            let threwOnUpdate = false;
            try { bob.updateLandmark(seedLandmarkId, { title: 'Hijacked' }); } catch (e) { threwOnUpdate = true; }
            assert(threwOnUpdate, '54. Bob: updateLandmark() throws');

            let threwOnRemove = false;
            try { bob.removeLandmark(seedLandmarkId); } catch (e) { threwOnRemove = true; }
            assert(threwOnRemove, '55. Bob: removeLandmark() throws');

            assert(readLandmarks(bob).length === 1 && readLandmarks(bob)[0].title === 'Village Well',
                '56. Bob: the World is byte-identical after every attempted mutation');
            assert(bob._commandHistories.get(aliceWorld.id).canUndo() === false,
                '57. Bob: zero CommandHistory entries were ever created — nothing was even attempted at the domain layer');
        }

        // --- Charlie: blocked / unauthorized -----------------------------
        {
            const charlieAuth = new WorldAuthorizationService({
                identityProvider: makeIdentityProvider({ identityId: 'did:key:charlie', username: 'charlie' }),
                isBlocked: (id) => id === 'did:key:charlie'
            });
            const charlie = buildSession(charlieAuth, { avatarPosition: new Position(9, 0, 9), identityId: 'did:key:charlie' });
            assert(charlie.getWorldAccessLevel(aliceWorld.id) === WorldAccessLevel.NONE, '58. Charlie: NONE');
            assert(charlie.canReadDocument(aliceWorld.id) === false, '59. Charlie: canRead false');
            assert(charlie.canEditDocument(aliceWorld.id) === false, '60. Charlie: canEdit false');

            let threw = false;
            try { charlie.removeLandmark(seedLandmarkId); } catch (e) { threw = true; }
            assert(threw, '61. Charlie: removeLandmark() throws');
        }

        // --- Multi-device: Alice's Laptop and Phone ----------------------
        {
            // Laptop: DIRECT — Alice's own raw signing identity, exactly
            // the single-device case above.
            const laptopAuth = new WorldAuthorizationService({
                identityProvider: makeIdentityProvider({ identityId: 'did:key:alice', username: 'alice' })
            });
            const laptop = buildSession(laptopAuth, { avatarPosition: new Position(0, 0, 0), identityId: 'did:key:alice' });
            assert(laptop.canEditDocument(aliceWorld.id) === true, '62. Alice\'s Laptop: EDIT (direct)');

            // Phone: a DIFFERENT physical key (did:key:alice-phone), but
            // resolveSocialIdentity reports it as a currently-authorized
            // DEVICE of Alice's own parent identity — the exact shape
            // application/DeviceAuthorizationPropagationUseCase.js#
            // resolveOwnSocialIdentity() returns for an authorized device.
            const phoneAuthAuthorized = new WorldAuthorizationService({
                identityProvider: makeIdentityProvider({ identityId: 'did:key:alice-phone', username: 'alice' }),
                resolveSocialIdentity: () => ({ identityId: 'did:key:alice', mode: 'DEVICE', deviceIdentityId: 'did:key:alice-phone' })
            });
            const phoneAuthorized = buildSession(phoneAuthAuthorized, { avatarPosition: new Position(1, 0, 1), identityId: 'did:key:alice-phone' });
            assert(phoneAuthorized.canEditDocument(aliceWorld.id) === true,
                '63. Alice\'s Phone, authorized device: EDIT — inherited through device authorization, never a second owner record');
            assert(typeof phoneAuthorized.createLandmarkHere('Phone Landmark', '') === 'string',
                '64. Alice\'s Phone, authorized device: can actually add a landmark, same as the Laptop');

            // Same physical phone key — but the grant naming it has since
            // been revoked. resolveOwnSocialIdentity() itself falls back
            // to DIRECT the moment the grant is gone (see that method's
            // own header) — this class never has to know a revocation
            // happened at all, it just asks the same question again.
            const phoneAuthRevoked = new WorldAuthorizationService({
                identityProvider: makeIdentityProvider({ identityId: 'did:key:alice-phone', username: 'alice-phone-device' }),
                resolveSocialIdentity: () => ({ identityId: 'did:key:alice-phone', mode: 'DIRECT', deviceIdentityId: 'did:key:alice-phone' })
            });
            const phoneRevoked = buildSession(phoneAuthRevoked, { avatarPosition: new Position(1, 0, 1), identityId: 'did:key:alice-phone' });
            assert(phoneRevoked.canEditDocument(aliceWorld.id) === false,
                '65. Alice\'s Phone, device authorization REVOKED: no EDIT — same physical device, same World, authority gone');
            assert(phoneRevoked.canReadDocument(aliceWorld.id) === true,
                '66. ...but still READ — a revoked device is an unauthorized editor, not a blocked stranger');

            let threw = false;
            try { phoneRevoked.createLandmarkHere('Should Fail', ''); } catch (e) { threw = true; }
            assert(threw, '67. Alice\'s Phone, device authorization REVOKED: createLandmarkHere() now throws');
        }
    }

    console.log('✓ Section A: core/WorldAccessLevel.js — closed NONE/READ/EDIT vocabulary and total order');
    console.log('✓ Section B: application/WorldAuthorizationService.js — ownership, blocking, legacy fallback, graceful defaults');
    console.log('✓ Section C: core/DocumentMetadata.js#authorIdentityId — construction, round-trip, tolerant degrade');
    console.log('✓ Section D: identity/resolveSigningIdentityId.js — tolerant of every absence, correct when present');
    console.log('✓ Section E: application/SpatialEditingService.js — one predicate gates every real mutation chokepoint');
    console.log('✓ Section F: application/ForkDocumentUseCase.js — the forker becomes the new owner, cryptographically');
    console.log('✓ Section G: FLAGSHIP — Alice/Bob/Charlie + multi-device authority, including a UI-bypassing direct call');

    console.log('\nAll World editing authorization tests passed.');
}

await run();
