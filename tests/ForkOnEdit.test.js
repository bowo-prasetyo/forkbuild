import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { LoadPublicationDocumentUseCase } from '../application/LoadPublicationDocumentUseCase.js';
import { SaveDocumentUseCase } from '../application/SaveDocumentUseCase.js';
import { PublishDocumentUseCase } from '../application/PublishDocumentUseCase.js';
import { DocumentCloneService } from '../application/DocumentCloneService.js';
import { LocalWorldLayoutProvider } from '../world-layout/LocalWorldLayoutProvider.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { SpatialSelectionState } from '../application/spatial-state/SpatialSelectionState.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { License, LicenseId } from '../core/License.js';
import { SpatialCameraController } from '../application/SpatialCameraController.js';
import { EditorActionRegistry, createStandardActions } from '../application/EditorActionRegistry.js';
import { EditorActionContext } from '../application/EditorActionContext.js';

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------
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

function assertThrows(fn, message) {
    try {
        fn();
        assert(false, message);
    } catch (e) {
        // expected
    }
}

// WorldNavigationSession's renderer collaborator is a real Three.js
// scene (RenderWorldViewUseCase, only constructed inside .start()).
// These tests exercise the SESSION/DOCUMENT logic — fork-on-write is
// entirely a document-management concern, never a rendering one — so a
// minimal duck-typed stub stands in for the renderer, exactly the
// injected-collaborator seam `this._session` already is.
function stubRenderer(extra = {}) {
    return {
        addWorld() {}, removeWorld() {}, dispose() {},
        clearSelection() {}, clearHover() {}, selectBricks() {}, hoverBrick() {},
        showPreview() {}, hidePreview() {}, showGizmo() {}, hideGizmo() {},
        // Real renderer: a hit test never arms anything, so it's safe
        // to run on every pointer-down. Default true keeps the
        // existing gizmo-drag tests (which don't care about the gate)
        // working unchanged; section 18 below overrides it to false.
        gizmoHitTest() { return true; },
        gizmoPointerDown() { return false; },
        gizmoPointerMove() { return { consumed: false, hovered: false, feedback: null }; },
        gizmoPointerUp() { return { consumed: false, committed: false, feedback: null }; },
        gizmoKeyDown() { return false; },
        pick() { return null; }, pickGround() { return null; }, pickRectangle() { return []; },
        setControlsEnabled() {},
        getCameraState() { return { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } }; },
        setCameraState() {},
        ...extra
    };
}

function makeDocument(title, licenseId = LicenseId.CC0_1_0) {
    const world = new World();
    const building = new Building({ creator: 'alice' });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    return new Document({
        world,
        metadata: new DocumentMetadata({ title, author: 'alice', license: new License({ id: licenseId }) })
    });
}

async function runTests() {
    const storage = new InMemoryStorageProvider();
    const alice = new LocalIdentityProvider(storage);
    alice.login('alice');
    const registry = new CreateBrickRegistryUseCase().execute();

    const contentStore = new LocalContentStore(storage);
    const publisher = new LocalPublisherProvider(storage, contentStore);
    const discoveryProvider = new LocalDiscoveryProvider(storage);
    const spatialIndexProvider = new LocalSpatialIndexProvider(storage);
    const worldLayoutProvider = new LocalWorldLayoutProvider(spatialIndexProvider, discoveryProvider);
    const loadPublicationDocumentUseCase = new LoadPublicationDocumentUseCase(storage);
    const saveDocumentUseCase = new SaveDocumentUseCase(storage);
    const publishDocumentUseCase = new PublishDocumentUseCase(publisher, alice);
    const documentCloneService = new DocumentCloneService();

    function buildSession(extraRenderer) {
        const session = new WorldNavigationSession({
            registry, loadPublicationDocumentUseCase, worldLayoutProvider,
            saveDocumentUseCase, publishDocumentUseCase, identityProvider: alice,
            documentCloneService, discoveryProvider
        });
        session._session = stubRenderer(extraRenderer);
        return session;
    }

    function selectFirstBrick(session, documentId) {
        const building = session.getDocument(documentId).world.getBuildings()[0];
        const brickId = building.getBricks()[0].id;
        session._setSpatialSelection(SpatialSelectionState.brick({ documentId, buildingId: building.id, brickId }));
        return { buildingId: building.id, brickId };
    }

    // -------------------------------------------------------------
    // 1-2. Viewing a published world is genuinely read-only: no fork
    //      is created by navigation, selection, hover, or inspection.
    // -------------------------------------------------------------
    {
        const publication = publisher.publish(makeDocument('Viewed Only'), alice);
        const session = buildSession();
        session._loadWorld(publication.documentId);

        assert(session.isDocumentPublished(publication.documentId), '1. a freshly streamed-in world is published/immutable');
        selectFirstBrick(session, publication.documentId);
        assert(session.isDocumentPublished(publication.documentId), '2. selecting a brick does not fork');
        session.clearSelection();
        assert(session.getLoadedDocuments().length === 1, '2b. exactly one loaded document — no fork exists');
        assert(session.isDocumentPublished(publication.documentId), '2c. still published after a full view-only interaction');
    }

    // -------------------------------------------------------------
    // 3-9. The flagship lifecycle: publish -> view -> edit -> exactly
    //      one automatic fork -> original unchanged -> fork carries
    //      the mutation and lineage -> publish the fork -> original
    //      publication still resolves identically.
    // -------------------------------------------------------------
    let flagshipOriginal, flagshipForkId, flagshipNewPublication;
    {
        const publication = publisher.publish(makeDocument('Castle'), alice);
        flagshipOriginal = publication;
        const session = buildSession();
        session._loadWorld(publication.documentId);
        selectFirstBrick(session, publication.documentId);

        const moved = session.moveSelection({ x: 3, y: 0, z: 0 });
        assert(moved === true, '3. the edit itself succeeds');
        assert(!session.isDocumentPublished(publication.documentId), '4. the published id is no longer tracked as published');
        assert(session.getDocument(publication.documentId) === null,
            '4b. the published source is superseded in this session (not silently mutated in place)');

        const forkId = session.getActiveDocumentId();
        flagshipForkId = forkId;
        assert(forkId !== publication.documentId, '5. exactly one NEW document exists — the fork');
        assert(session.getLoadedDocuments().length === 1, '5b. still exactly one loaded document (fork replaces source in this session)');
        assert(!session.isDocumentPublished(forkId), '6. the fork itself is editable');

        const forkDoc = session.getDocument(forkId);
        assert(forkDoc.metadata.parentDocumentId === publication.documentId,
            '7. fork provenance points at the original published document');
        assert(forkDoc.world.getBuildings()[0].getBricks()[0].position.x === 3,
            '7b. the mutation landed on the fork');

        // The published snapshot's own storage is untouched — reloading
        // it fresh (as any other viewer would) resolves the ORIGINAL
        // geometry, byte-for-byte.
        const reloaded = loadPublicationDocumentUseCase.execute(publication.documentId);
        assert(reloaded.world.getBuildings()[0].getBricks()[0].position.x === 0,
            '8. the original published snapshot is verifiably unchanged');
        assert(publisher.verifySnapshot(publication.id, publication.contentHash),
            '8b. the original publication still verifies against its own content hash');

        // A second mutation in the SAME session stays on the same
        // fork — the boundary is crossed once, not once per command.
        session.moveSelection({ x: 1, y: 0, z: 0 });
        assert(session.getActiveDocumentId() === forkId, '9. a second mutation does not create a second fork');
        assert(session.getLoadedDocuments().length === 1, '9b. still exactly one loaded document');

        session.saveDocument(forkId);
        const newPublication = session.publishDocument(forkId);
        flagshipNewPublication = newPublication;
        assert(newPublication.id !== publication.id, '10. publishing the fork creates a genuinely new Publication');
        assert(newPublication.contentReference.hash !== publication.contentReference.hash,
            '10b. the new publication has its own, different ContentReference');
        assert(newPublication.parentDocumentId === publication.documentId,
            '10c. the new publication carries lineage back to the original document');
        assert(publisher.verifySnapshot(publication.id, publication.contentHash),
            '11. the original publication still resolves identically after the fork was published');
        console.log('✓ flagship lifecycle: publish -> view -> edit -> fork -> publish fork -> original untouched');
    }

    // -------------------------------------------------------------
    // 12. "Alice publishes; Bob opens, only views -> no fork exists.
    //     Bob edits -> exactly one fork exists." (Ownership is
    //     irrelevant to the boundary — even Alice editing her OWN
    //     published world must fork; ownership never bypasses it.)
    // -------------------------------------------------------------
    {
        const bob = new LocalIdentityProvider(new InMemoryStorageProvider());
        bob.login('bob');
        const publication = publisher.publish(makeDocument('Bob Views This'), alice);

        const bobSession = new WorldNavigationSession({
            registry, loadPublicationDocumentUseCase, worldLayoutProvider,
            saveDocumentUseCase, publishDocumentUseCase, identityProvider: bob,
            documentCloneService, discoveryProvider
        });
        bobSession._session = stubRenderer();
        bobSession._loadWorld(publication.documentId);

        selectFirstBrick(bobSession, publication.documentId);
        bobSession.clearSelection();
        assert(bobSession.getLoadedDocuments().length === 1 && bobSession.isDocumentPublished(publication.documentId),
            '12a. Bob viewing only: NO fork exists');

        selectFirstBrick(bobSession, publication.documentId);
        bobSession.moveSelection({ x: 5, y: 0, z: 0 });
        assert(bobSession.getLoadedDocuments().length === 1 && !bobSession.isDocumentPublished(publication.documentId),
            '12b. Bob edits: exactly ONE fork exists, and it is his');
        const bobForkDoc = bobSession.getDocument(bobSession.getActiveDocumentId());
        assert(bobForkDoc.metadata.author === 'bob', '12c. the fork is attributed to Bob, not Alice');
        console.log('✓ view-only creates no fork; the first edit creates exactly one');
    }

    // -------------------------------------------------------------
    // 13-14. Fork policy is enforced (0.2.13): a license that forbids
    //        forking rejects the edit outright rather than silently
    //        forking or silently mutating.
    // -------------------------------------------------------------
    {
        const publication = publisher.publish(makeDocument('All Rights Reserved', LicenseId.ALL_RIGHTS_RESERVED), alice);
        const session = buildSession();
        session._loadWorld(publication.documentId);
        selectFirstBrick(session, publication.documentId);

        assertThrows(() => session.moveSelection({ x: 1, y: 0, z: 0 }),
            '13. editing a fork-forbidden published world is rejected, not silently forked');
        assert(session.isDocumentPublished(publication.documentId),
            '14. the source remains published/unforked after a denied attempt — no partial fork');
        assert(session.getLoadedDocuments().length === 1, '14b. no stray fork was created by the failed attempt');
    }

    // -------------------------------------------------------------
    // 15. Defense in depth: Save/Publish refuse to act on a document
    //     that is still a published, unforked snapshot — even if
    //     called directly, bypassing the selection-driven guards.
    // -------------------------------------------------------------
    {
        const publication = publisher.publish(makeDocument('Never Edited'), alice);
        const session = buildSession();
        session._loadWorld(publication.documentId);

        assertThrows(() => session.saveDocument(publication.documentId),
            '15. saveDocument refuses a still-published document');
        assertThrows(() => session.publishDocument(publication.documentId),
            '15b. publishDocument refuses a still-published document');
    }

    // -------------------------------------------------------------
    // 16. A gizmo-driven drag (not a keyboard command) crosses the
    //     boundary too — the renderer receives the FORKED selection,
    //     not the published one, because the fork happens before the
    //     drag is even armed.
    // -------------------------------------------------------------
    {
        let selectionSeenByRenderer = null;
        const publication = publisher.publish(makeDocument('Gizmo Drag'), alice);
        const session = buildSession({
            gizmoPointerDown(x, y, selection) {
                selectionSeenByRenderer = selection.documentId;
                return true;
            }
        });
        session._loadWorld(publication.documentId);
        selectFirstBrick(session, publication.documentId);

        session.gizmoPointerDown({ button: 0, clientX: 10, clientY: 10 });
        assert(selectionSeenByRenderer !== null && selectionSeenByRenderer !== publication.documentId,
            '16. the renderer receives the fork, not the published document, at drag start');
        assert(session.getDocument(publication.documentId) === null,
            '16b. the published source is already superseded before the drag begins');
    }

    // -------------------------------------------------------------
    // 17. Multi-brick selection remaps every member to the fork —
    //     the mutation is not silently narrowed to a single brick.
    // -------------------------------------------------------------
    {
        const world = new World();
        const building = new Building({ creator: 'alice' });
        building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
        building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(2, 0.5, 0) }));
        world.addBuilding(building);
        const doc = new Document({
            world, metadata: new DocumentMetadata({ title: 'Two Bricks', author: 'alice', license: new License({ id: LicenseId.CC0_1_0 }) })
        });
        const publication = publisher.publish(doc, alice);
        const session = buildSession();
        session._loadWorld(publication.documentId);

        const buildingRef = session.getDocument(publication.documentId).world.getBuildings()[0];
        const [brick1, brick2] = buildingRef.getBricks();
        session._setSpatialSelection(SpatialSelectionState.bricks({
            documentId: publication.documentId,
            items: [
                { type: 'brick', buildingId: buildingRef.id, brickId: brick1.id },
                { type: 'brick', buildingId: buildingRef.id, brickId: brick2.id }
            ]
        }));

        session.moveSelection({ x: 0, y: 1, z: 0 });
        const forkId = session.getActiveDocumentId();
        const forkBricks = session.getDocument(forkId).world.getBuildings()[0].getBricks();
        assert(forkBricks.length === 2 && forkBricks.every((b) => b.position.y === 1.5),
            '17. every selected brick was remapped to the fork and received the mutation');
    }

    // -------------------------------------------------------------
    // 18. gizmoPointerDown runs on EVERY pointer-down while something
    //     is selected (gizmo-first: try the gizmo, fall back to a
    //     plain click otherwise) — that alone must never fork. Only
    //     an actual handle hit may cross the boundary; a pointer-down
    //     that misses (e.g. clicking a different brick to reselect)
    //     is not a mutation and must leave the snapshot untouched.
    // -------------------------------------------------------------
    {
        let hitTestCalls = 0;
        const publication = publisher.publish(makeDocument('No Eager Fork'), alice);
        const session = buildSession({
            gizmoHitTest() { hitTestCalls++; return false; },
            gizmoPointerDown() { throw new Error('must not arm a drag when the hit test misses'); }
        });
        session._loadWorld(publication.documentId);
        selectFirstBrick(session, publication.documentId);

        const consumed = session.gizmoPointerDown({ button: 0, clientX: 5, clientY: 5 });
        assert(consumed === false, '18. a pointer-down that misses the gizmo is not consumed');
        assert(hitTestCalls === 1, '18b. the hit test ran before any fork decision was made');
        assert(session.isDocumentPublished(publication.documentId),
            '18c. no fork was created merely by a pointer-down elsewhere — lazy means on the actual mutation, not on every click');
    }

    // -------------------------------------------------------------
    // 19. A fork inherits the EXACT position of the snapshot it
    //     replaces. The layout/discovery providers can never resolve
    //     a position for a fork's id on their own (it is never
    //     published), so every position lookup after the fork must
    //     come from what was remembered at fork time, not a fresh
    //     (and silently wrong) query.
    // -------------------------------------------------------------
    {
        // A couple of decoys push this publication off index 0, so a
        // coincidental (0,0,0) grid slot can't hide a broken lookup.
        publisher.publish(makeDocument('Decoy A'), alice);
        publisher.publish(makeDocument('Decoy B'), alice);
        const publication = publisher.publish(makeDocument('Positioned'), alice);
        const session = buildSession();
        session._loadWorld(publication.documentId);
        const sourcePos = session.getDocumentPosition(publication.documentId);
        assert(sourcePos.x !== 0 || sourcePos.z !== 0,
            '19. precondition: the source resolves to a real, non-origin deterministic position');

        selectFirstBrick(session, publication.documentId);
        session.moveSelection({ x: 1, y: 0, z: 0 });
        const forkId = session.getActiveDocumentId();
        const forkPos = session.getDocumentPosition(forkId);
        assert(forkPos.x === sourcePos.x && forkPos.y === sourcePos.y && forkPos.z === sourcePos.z,
            '19b. the fork inherits the source position exactly, instead of a fresh lookup falling back to (0,0,0)');
    }

    // -------------------------------------------------------------
    // 20. A saved (no-longer-dirty) fork survives spatial streaming.
    //     A fork can never appear in findVisibleDocuments() (it was
    //     never published), so it must stay pinned unconditionally —
    //     the pre-existing dirty-only pin clears on save, and the very
    //     next camera-driven updateSpatialView() would otherwise
    //     stream the fork's bricks (and its whole in-memory state)
    //     out, with no way to stream them back in.
    // -------------------------------------------------------------
    {
        const pinStorage = new InMemoryStorageProvider();
        const carol = new LocalIdentityProvider(pinStorage);
        carol.login('carol');
        const pinContentStore = new LocalContentStore(pinStorage);
        const pinPublisher = new LocalPublisherProvider(pinStorage, pinContentStore);
        const pinDiscovery = new LocalDiscoveryProvider(pinStorage);
        const pinSpatialIndex = new LocalSpatialIndexProvider(pinStorage);
        const pinLayout = new LocalWorldLayoutProvider(pinSpatialIndex, pinDiscovery);

        const publication = pinPublisher.publish(makeDocument('Streaming Pin'), carol);
        const session = new WorldNavigationSession({
            registry,
            loadPublicationDocumentUseCase: new LoadPublicationDocumentUseCase(pinStorage),
            worldLayoutProvider: pinLayout,
            saveDocumentUseCase: new SaveDocumentUseCase(pinStorage),
            publishDocumentUseCase: new PublishDocumentUseCase(pinPublisher, carol),
            identityProvider: carol,
            documentCloneService,
            discoveryProvider: pinDiscovery
        });
        // Camera parked far from the source's (index-0, origin) grid
        // slot: findVisibleDocuments() legitimately excludes the
        // original publication too, so the only thing this update can
        // possibly stream in/out is whether the fork gets dropped —
        // that isolation is the point of the test, not a re-fetch of
        // the original publication as a second, overlapping world.
        session._session = stubRenderer({
            getCameraState() {
                return { position: { x: 1000, y: 0, z: 1000 }, target: { x: 1000, y: 0, z: 1000 } };
            }
        });
        session._spatialCameraController = new SpatialCameraController(session._session);

        session._loadWorld(publication.documentId);
        selectFirstBrick(session, publication.documentId);
        session.moveSelection({ x: 2, y: 0, z: 0 });
        const forkId = session.getActiveDocumentId();

        session.saveDocument(forkId);
        assert(!session.isDocumentDirty(forkId), '20. precondition: the fork is clean after saving');

        session.updateSpatialView();
        assert(session.getDocument(forkId) !== null,
            '20b. a saved, undiscoverable fork is NOT streamed out just because it can never appear in visibleIds');
        assert(session.getLoadedDocuments().length === 1,
            '20c. still loaded — the fork\'s bricks were not torn down by the streaming pass');
    }

    // -------------------------------------------------------------
    // 21. getEditabilityNotice: the proactive "why" query the UI uses
    //     to explain fork-on-edit BEFORE the user hits a blocked
    //     action, not just after.
    // -------------------------------------------------------------
    {
        const forkablePub = publisher.publish(makeDocument('Notice Forkable'), alice);
        const blockedPub = publisher.publish(makeDocument('Notice Blocked', LicenseId.ALL_RIGHTS_RESERVED), alice);
        const session = buildSession();
        session._loadWorld(forkablePub.documentId);
        session._loadWorld(blockedPub.documentId);

        const forkableNotice = session.getEditabilityNotice(forkablePub.documentId);
        assert(forkableNotice && forkableNotice.blocked === false,
            '21. a forkable published snapshot reports blocked:false with an explanatory message');

        const blockedNotice = session.getEditabilityNotice(blockedPub.documentId);
        assert(blockedNotice && blockedNotice.blocked === true && /ALL-RIGHTS-RESERVED/.test(blockedNotice.message),
            '21b. a fork-forbidden published snapshot reports blocked:true naming the license');

        assert(session.getEditabilityNotice(null) === null && session.getEditabilityNotice('nonexistent') === null,
            '21c. nothing to say about a non-tracked document');
    }

    // -------------------------------------------------------------
    // 22. UX: a mutation the fork policy refuses surfaces as
    //     transient feedback through the EditorActionRegistry (0.1.50's
    //     existing "degrade to feedback instead of throwing" contract,
    //     extended to a REFUSED capability, not just a missing one) —
    //     never as an uncaught exception reaching the UI raw.
    // -------------------------------------------------------------
    {
        const publication = publisher.publish(makeDocument('Feedback On Denial', LicenseId.ALL_RIGHTS_RESERVED), alice);
        const session = buildSession();
        session._loadWorld(publication.documentId);
        selectFirstBrick(session, publication.documentId);

        const messages = [];
        const feedback = { show(message) { messages.push(message); } };
        const registry = new EditorActionRegistry(createStandardActions({ session, feedback, ui: {} }));
        const context = EditorActionContext.capture({ session, selectionCount: 1 });

        let threw = false;
        try {
            registry.execute('transform.nudgeRight', context);
        } catch (e) {
            threw = true;
        }
        assert(!threw, '22. a policy-denied action never throws out of the registry');
        assert(messages.length === 1 && /forking/i.test(messages[0]),
            '22b. the denial reason reaches the user as feedback instead of silently failing');
        assert(session.isDocumentPublished(publication.documentId),
            '22c. the source is still untouched — the caught error does not paper over a partial mutation');
    }

    console.log('✅ All Fork-on-Edit & Immutable Snapshot Lineage tests passed.');
}

runTests().catch((e) => { console.error(e); throw e; });
