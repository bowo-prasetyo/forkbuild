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
//              WorldNavigationSession, including a direct call into
//              application/SpatialEditingService.js that skips every
//              session-level wrapper, proving the gate lives below the
//              UI, not merely behind it.

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
    //   mutation entry point WorldNavigationSession exposes is a no-op
    //   for him, including one that bypasses the session wrapper
    //   entirely and calls SpatialEditingService directly. Charlie is
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

        const aliceWorld = buildOneBrickWorld(new Position(0, 0.5, 0));
        const building = aliceWorld.getBuildings()[0];
        const brick = building.getBricks()[0];
        const aliceDoc = new Document({
            world: aliceWorld,
            metadata: new DocumentMetadata({ title: "Alice's World", author: 'alice', authorIdentityId: 'did:key:alice' })
        });
        storage.save(aliceWorld.id, serializer.serialize(aliceDoc));

        function buildSession(worldAuthorizationService) {
            const session = new WorldNavigationSession({
                registry, loadPublicationDocumentUseCase, worldLayoutProvider,
                discoveryProvider, worldAuthorizationService
            });
            session._session = stubRenderer();
            session._loadWorld(aliceWorld.id);
            return session;
        }

        function selectBrick(session) {
            session._session.pick = () => ({ documentId: aliceWorld.id, buildingId: building.id, brickId: brick.id, distance: 1 });
            return session.pick(400, 300);
        }

        function readBrick(session) {
            const b = session.getDocument(aliceWorld.id).world.getBuilding(building.id).findBrick(brick.id);
            return { x: b.position.x, y: b.position.y, z: b.position.z, rotation: b.rotation };
        }

        // --- Alice: owner -----------------------------------------------
        {
            const aliceAuth = new WorldAuthorizationService({
                identityProvider: makeIdentityProvider({ identityId: 'did:key:alice', username: 'alice' })
            });
            const alice = buildSession(aliceAuth);
            assert(alice.getWorldAccessLevel(aliceWorld.id) === WorldAccessLevel.EDIT, '42. Alice: EDIT');
            assert(alice.canReadDocument(aliceWorld.id) === true, '43. Alice: canRead true');
            assert(alice.canEditDocument(aliceWorld.id) === true, '44. Alice: canEdit true');

            selectBrick(alice);
            const before = readBrick(alice);
            assert(alice.moveSelection({ x: 3, y: 0, z: 0 }) === true, '45. Alice: moveSelection succeeds on her own World');
            const after = readBrick(alice);
            assert(after.x === before.x + 3, '46. Alice: the brick actually moved');
            assert(alice.rotateSelection(90) === true, '47. Alice: rotateSelection succeeds too');
            assert(alice.deleteSelection() === true, '48. Alice: deleteSelection succeeds — she owns this World outright');
        }

        // --- Bob: read-only observer -------------------------------------
        {
            const bobAuth = new WorldAuthorizationService({
                identityProvider: makeIdentityProvider({ identityId: 'did:key:bob', username: 'bob' })
            });
            const bob = buildSession(bobAuth);
            assert(bob.getWorldAccessLevel(aliceWorld.id) === WorldAccessLevel.READ, '49. Bob: READ, not EDIT');
            assert(bob.canReadDocument(aliceWorld.id) === true, '50. Bob: canRead true — World View stays an exploration surface for him');
            assert(bob.canEditDocument(aliceWorld.id) === false, '51. Bob: canEdit false');

            const selection = selectBrick(bob);
            assert(selection !== null, '52. Bob: he can still SELECT/inspect the House — selection is not gated, only mutation');
            const before = readBrick(bob);

            assert(bob.moveSelection({ x: 3, y: 0, z: 0 }) === false, '53. Bob: moveSelection() is a no-op');
            assert(bob.rotateSelection(90) === false, '54. Bob: rotateSelection() is a no-op');
            assert(bob.deleteSelection() === false, '55. Bob: deleteSelection() is a no-op');
            assert(bob.alignSelection('x-min') === false, '56. Bob: alignSelection() is a no-op');
            assert(bob.applyNumericTransform({ translation: { x: 9, y: 0, z: 0 }, rotation: null }, { absolute: true }) === false,
                '57. Bob: applyNumericTransform() is a no-op');

            const after = readBrick(bob);
            assert(after.x === before.x && after.y === before.y && after.z === before.z && after.rotation === before.rotation,
                '58. Bob: the brick is byte-identical after every attempted mutation');
            assert(bob._commandHistories.get(aliceWorld.id).canUndo() === false,
                '59. Bob: zero CommandHistory entries were ever created — nothing was even attempted at the domain layer');

            // Even bypassing the UI entirely: call straight into
            // SpatialEditingService, skipping WorldNavigationSession's
            // own moveSelection()/rotateSelection() wrappers completely.
            const bypassResult = bob._editingService.moveSelection(bob.getSpatialSelection(), { x: 3, y: 0, z: 0 });
            assert(bypassResult === false, '60. Bob: bypassing the session wrapper and calling SpatialEditingService directly is STILL refused');
            const stillBefore = readBrick(bob);
            assert(stillBefore.x === before.x, '61. Bob: ...and the World is still byte-identical after the bypass attempt');
        }

        // --- Charlie: blocked / unauthorized -----------------------------
        {
            const charlieAuth = new WorldAuthorizationService({
                identityProvider: makeIdentityProvider({ identityId: 'did:key:charlie', username: 'charlie' }),
                isBlocked: (id) => id === 'did:key:charlie'
            });
            const charlie = buildSession(charlieAuth);
            assert(charlie.getWorldAccessLevel(aliceWorld.id) === WorldAccessLevel.NONE, '62. Charlie: NONE');
            assert(charlie.canReadDocument(aliceWorld.id) === false, '63. Charlie: canRead false');
            assert(charlie.canEditDocument(aliceWorld.id) === false, '64. Charlie: canEdit false');

            selectBrick(charlie);
            assert(charlie.moveSelection({ x: 1, y: 0, z: 0 }) === false, '65. Charlie: moveSelection() is a no-op');
            assert(charlie.deleteSelection() === false, '66. Charlie: deleteSelection() is a no-op');
            const stillThere = charlie.getDocument(aliceWorld.id).world.getBuilding(building.id).findBrick(brick.id);
            assert(stillThere !== null, '67. Charlie: the brick was never deleted');
        }

        // --- Multi-device: Alice's Laptop and Phone ----------------------
        {
            // Laptop: DIRECT — Alice's own raw signing identity, exactly
            // the single-device case above.
            const laptopAuth = new WorldAuthorizationService({
                identityProvider: makeIdentityProvider({ identityId: 'did:key:alice', username: 'alice' })
            });
            const laptop = buildSession(laptopAuth);
            assert(laptop.canEditDocument(aliceWorld.id) === true, '68. Alice\'s Laptop: EDIT (direct)');

            // Phone: a DIFFERENT physical key (did:key:alice-phone), but
            // resolveSocialIdentity reports it as a currently-authorized
            // DEVICE of Alice's own parent identity — the exact shape
            // application/DeviceAuthorizationPropagationUseCase.js#
            // resolveOwnSocialIdentity() returns for an authorized device.
            const phoneAuthAuthorized = new WorldAuthorizationService({
                identityProvider: makeIdentityProvider({ identityId: 'did:key:alice-phone', username: 'alice' }),
                resolveSocialIdentity: () => ({ identityId: 'did:key:alice', mode: 'DEVICE', deviceIdentityId: 'did:key:alice-phone' })
            });
            const phoneAuthorized = buildSession(phoneAuthAuthorized);
            assert(phoneAuthorized.canEditDocument(aliceWorld.id) === true,
                '69. Alice\'s Phone, authorized device: EDIT — inherited through device authorization, never a second owner record');

            selectBrick(phoneAuthorized);
            assert(phoneAuthorized.moveSelection({ x: 1, y: 0, z: 0 }) === true,
                '70. Alice\'s Phone, authorized device: can actually move the brick, same as the Laptop');

            // Same physical phone key — but the grant naming it has since
            // been revoked. resolveOwnSocialIdentity() itself falls back
            // to DIRECT the moment the grant is gone (see that method's
            // own header) — this class never has to know a revocation
            // happened at all, it just asks the same question again.
            const phoneAuthRevoked = new WorldAuthorizationService({
                identityProvider: makeIdentityProvider({ identityId: 'did:key:alice-phone', username: 'alice-phone-device' }),
                resolveSocialIdentity: () => ({ identityId: 'did:key:alice-phone', mode: 'DIRECT', deviceIdentityId: 'did:key:alice-phone' })
            });
            const phoneRevoked = buildSession(phoneAuthRevoked);
            assert(phoneRevoked.canEditDocument(aliceWorld.id) === false,
                '71. Alice\'s Phone, device authorization REVOKED: no EDIT — same physical device, same World, authority gone');
            assert(phoneRevoked.canReadDocument(aliceWorld.id) === true,
                '72. ...but still READ — a revoked device is an unauthorized editor, not a blocked stranger');

            selectBrick(phoneRevoked);
            assert(phoneRevoked.moveSelection({ x: 1, y: 0, z: 0 }) === false,
                '73. Alice\'s Phone, device authorization REVOKED: moveSelection() is now a no-op');
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
