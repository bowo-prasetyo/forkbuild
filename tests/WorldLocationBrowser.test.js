import { Position } from '../core/Position.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { License, LicenseId } from '../core/License.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { LocalWorldLayoutProvider } from '../world-layout/LocalWorldLayoutProvider.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { LoadPublicationDocumentUseCase } from '../application/LoadPublicationDocumentUseCase.js';
import { SaveDocumentUseCase } from '../application/SaveDocumentUseCase.js';
import { PublishDocumentUseCase } from '../application/PublishDocumentUseCase.js';
import { DocumentCloneService } from '../application/DocumentCloneService.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { PlacePublicationUseCase } from '../application/PlacePublicationUseCase.js';
import { MoveWorldPlacementUseCase } from '../application/MoveWorldPlacementUseCase.js';
import { SearchWorldUseCase } from '../application/SearchWorldUseCase.js';
import { SpatialCameraController } from '../application/SpatialCameraController.js';

// 0.2.29 — World Location Browser & Spatial Exploration.
//
// Explores the world by CAMERA position rather than by already
// knowing a document's name or typing coordinates — built entirely on
// top of the 0.2.28 spatial query (exploreLocation/exploreHere/
// whatsHere are thin wrappers over searchWorldByLocation, one
// discovery path), and strictly read-only: Focus/Select/Inspect must
// never fork, load-and-mutate, or otherwise touch a document. See
// WorldNavigationSession's "World Location Browser (0.2.29)" section.
//
// 0.2.30: exploreLocation/exploreHere/whatsHere now return
// { documents, diagnostics } rather than a bare array (see
// core/DiscoveryDiagnosticsSummary.js) — every assertion below reads
// `.documents` for the result list. No test in this file wires a
// spatialDiscoveryProvider, so diagnostics.available is false
// throughout; the trust-aware scenarios (available/complete/warnings/
// fatal, with a REAL DecentralizedSpatialDiscoveryProvider) live in
// tests/DiscoveryDiagnosticsSummary.test.js instead, alongside this
// file's own no-provider-wired baseline assertions (1b, 5f, 11).

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

function makeDocument(title, author = 'alice') {
    const world = new World();
    const building = new Building({ creator: author });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    return new Document({
        world,
        metadata: new DocumentMetadata({ title, author, license: new License({ id: LicenseId.CC0_1_0 }) })
    });
}

// Same stateful stub as tests/WorldViewContext.test.js — a no-op
// setCameraState() can never prove "the camera did not move," and
// exploreHere/whatsHere specifically need a real, settable camera
// position to query from.
function statefulStubRenderer() {
    let cameraState = { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 }, zoom: 1 };
    return {
        addWorld() {}, removeWorld() {}, dispose() {},
        clearSelection() {}, clearHover() {}, selectBricks() {}, hoverBrick() {},
        showPreview() {}, hidePreview() {}, showGizmo() {}, hideGizmo() {},
        gizmoHitTest() { return true; },
        gizmoPointerDown() { return false; },
        gizmoPointerMove() { return { consumed: false, hovered: false, feedback: null }; },
        gizmoPointerUp() { return { consumed: false, committed: false, feedback: null }; },
        gizmoKeyDown() { return false; },
        pick() { return null; }, pickGround() { return null; }, pickRectangle() { return []; },
        setControlsEnabled() {},
        getCameraState() { return cameraState; },
        setCameraState(cs) { cameraState = cs; }
    };
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
    const placementRegistry = new LocalPlacementRegistry(storage, spatialIndexProvider);
    const placePublicationUseCase = new PlacePublicationUseCase(
        spatialIndexProvider, discoveryProvider, loadPublicationDocumentUseCase, registry, placementRegistry, alice
    );
    const moveWorldPlacementUseCase = new MoveWorldPlacementUseCase(spatialIndexProvider, placementRegistry, null, alice);
    const publishDocumentUseCase = new PublishDocumentUseCase(publisher, alice);
    const documentCloneService = new DocumentCloneService();
    const searchWorldUseCase = new SearchWorldUseCase(discoveryProvider);

    function buildSession() {
        const session = new WorldNavigationSession({
            registry, loadPublicationDocumentUseCase, worldLayoutProvider,
            saveDocumentUseCase, publishDocumentUseCase, identityProvider: alice,
            documentCloneService, discoveryProvider, placementRegistry, moveWorldPlacementUseCase,
            searchWorldUseCase
        });
        session._session = statefulStubRenderer();
        session._spatialCameraController = new SpatialCameraController(session._session);
        return session;
    }

    // Fixture:
    //   - alicesTower / bobsTower: SAME position (100, 0, 100) — the
    //     "multiple documents at the same location" scenario.
    //   - carolsShed: 20 World Units away at (120, 0, 100) — inside
    //     the default explore radius (25) but outside the small
    //     What's Here? tolerance (5), so it distinguishes the two.
    //   - farLighthouse: nowhere near anything else.
    //   - unplacedCabin: never explicitly placed — resolves only
    //     through the 0.2.24 deterministic fallback.
    const sharedPosition = new Position(100, 0, 100);
    const alicesTower = publisher.publish(makeDocument("Alice's Tower", 'alice'), alice);
    placePublicationUseCase.execute(alicesTower.id, sharedPosition);
    const bobsTower = publisher.publish(makeDocument("Bob's Tower", 'bob'), alice);
    placePublicationUseCase.execute(bobsTower.id, sharedPosition);
    const carolsShed = publisher.publish(makeDocument("Carol's Shed", 'carol'), alice);
    placePublicationUseCase.execute(carolsShed.id, new Position(120, 0, 100));
    const farLighthouse = publisher.publish(makeDocument('Far Lighthouse', 'dave'), alice);
    placePublicationUseCase.execute(farLighthouse.id, new Position(9000, 0, 9000));
    const unplacedCabin = publisher.publish(makeDocument('Unplaced Cabin', 'eve'), alice);
    // No placement for unplacedCabin — deliberate.

    // -------------------------------------------------------------
    // 1. Explore an empty location — nowhere near anything fixtures
    //    placed. 0.2.30: exploreLocation now returns an envelope
    //    { documents, diagnostics } rather than a bare array — see
    //    core/DiscoveryDiagnosticsSummary.js. No spatialDiscoveryProvider
    //    is wired anywhere in this file, so diagnostics.available is
    //    false throughout — the honest "no trust layer consulted"
    //    default this milestone establishes for the plain local path.
    // -------------------------------------------------------------
    {
        const session = buildSession();
        const envelope = session.exploreLocation({ center: { x: -9999, y: -9999, z: -9999 }, radius: 5 });
        assert(Array.isArray(envelope.documents) && envelope.documents.length === 0,
            '1. exploring an empty location returns an empty result, not an error');
        assert(envelope.diagnostics.available === false && envelope.diagnostics.fatal === null,
            '1b. no spatialDiscoveryProvider wired -> diagnostics honestly report unavailable, not a fabricated "complete"');
    }

    // -------------------------------------------------------------
    // 2. Multiple documents at the exact same location.
    // -------------------------------------------------------------
    {
        const session = buildSession();
        const { documents: results } = session.exploreLocation({ center: { x: 100, y: 0, z: 100 }, radius: 1 });
        assert(results.length === 2, '2. both towers sharing the exact coordinate are found');
        assert(results.every((r) => r.distance === 0),
            '2b. both report distance 0 from a center exactly at their shared position');
        const ids = results.map((r) => r.documentId).sort();
        assert(ids.includes(alicesTower.documentId) && ids.includes(bobsTower.documentId),
            '2c. it is specifically Alice\'s Tower and Bob\'s Tower, not some other pair');
    }

    // -------------------------------------------------------------
    // 3. Overlapping locations — two different centers/radii whose
    //    result sets legitimately overlap (share members) rather than
    //    partitioning the world into disjoint regions.
    // -------------------------------------------------------------
    {
        const session = buildSession();
        const fromTowers = session.exploreLocation({ center: { x: 100, y: 0, z: 100 }, radius: 25 }).documents;
        const fromShed = session.exploreLocation({ center: { x: 120, y: 0, z: 100 }, radius: 25 }).documents;

        assert(fromTowers.length === 3 && fromShed.length === 3,
            '3. both queries find all three nearby documents (towers + shed) — 20 World Units is within a radius of 25 either way');
        const towerIds = new Set(fromTowers.map((r) => r.documentId));
        const shedIds = new Set(fromShed.map((r) => r.documentId));
        const intersection = [...towerIds].filter((id) => shedIds.has(id));
        assert(intersection.length === 3,
            '3b. the two queries\' result sets fully overlap here — exploring a location is a real spatial query, not a partition');
    }

    // -------------------------------------------------------------
    // 4. Focus a result — moves the camera and (by default) makes it
    //    active, exactly like focusDocument always has. Never forks
    //    or mutates anything.
    // -------------------------------------------------------------
    {
        const session = buildSession();
        const results = session.exploreLocation({ center: { x: 120, y: 0, z: 100 }, radius: 1 }).documents;
        assert(results.length === 1 && results[0].documentId === carolsShed.documentId,
            '4. precondition: found Carol\'s Shed');

        session.focusDocument(carolsShed.documentId);
        assert(session.getFocusedDocumentId() === carolsShed.documentId, '4b. Focus moved the camera to it');
        assert(session.getActiveDocumentId() === carolsShed.documentId, '4c. and made it active, by default');
        assert(session.isDocumentPublished(carolsShed.documentId),
            '4d. Carol\'s Shed is still a plain published snapshot — Focus never forks anything');
    }

    // -------------------------------------------------------------
    // 5. Inspect a result — never changes the active document, never
    //    forces a load. documentInfo comes back null (not loaded);
    //    placementInfo is available regardless, since it comes from
    //    the placement registry, not from a loaded Document.
    // -------------------------------------------------------------
    {
        const session = buildSession();
        session.setActiveDocument(alicesTower.documentId);

        const inspected = session.inspectDocument(carolsShed.documentId);
        assert(inspected.documentId === carolsShed.documentId, '5. inspectDocument reports the document it inspected');
        assert(inspected.documentInfo === null,
            '5b. documentInfo is null — Carol\'s Shed was never loaded into this session, and Inspect must not force that');
        assert(inspected.placementInfo !== null && inspected.placementInfo.position.x === 120,
            '5c. placementInfo is still available — it comes from the placement registry, independent of whether the document is loaded');
        assert(session.getActiveDocumentId() === alicesTower.documentId,
            '5d. the active document is completely untouched by Inspect — still Alice\'s Tower');
        assert(session.getDocument(carolsShed.documentId) === null,
            '5e. Carol\'s Shed was never loaded as a side effect of inspecting it');
        assert(inspected.trust === null,
            '5f. no diagnostics-capable provider was ever consulted -> trust is honestly null, not a fabricated status');
    }

    // -------------------------------------------------------------
    // 6. Select a result — WorldNavigationSession.setActiveDocument:
    //    makes it the active document WITHOUT moving the camera. Same
    //    0.2.27 guarantee, just reached from a location-browser result
    //    instead of a brick pick.
    // -------------------------------------------------------------
    {
        const session = buildSession();
        session.focusDocument(alicesTower.documentId);
        const cameraBefore = session._session.getCameraState();

        session.setActiveDocument(bobsTower.documentId);
        const cameraAfter = session._session.getCameraState();

        assert(session.getActiveDocumentId() === bobsTower.documentId, '6. Select made Bob\'s Tower the active document');
        assert(session.getFocusedDocumentId() === alicesTower.documentId,
            '6b. camera focus is untouched — still Alice\'s Tower');
        assert(cameraBefore.position.x === cameraAfter.position.x
            && cameraBefore.position.y === cameraAfter.position.y
            && cameraBefore.position.z === cameraAfter.position.z,
            '6c. and the camera itself never moved');
    }

    // -------------------------------------------------------------
    // 7. "Explore Here" — the query center comes from the CAMERA's
    //    current world position, independent of whatever document (if
    //    any) is active. Setting the camera exactly onto the shared
    //    tower position and exploring from there finds exactly what a
    //    manual exploreLocation at that same center would.
    // -------------------------------------------------------------
    {
        const session = buildSession();
        session._session.setCameraState({
            position: { x: 100, y: 0, z: 100 },
            target: { x: 100, y: 0, z: 100 },
            zoom: 1
        });
        // No active document at all — proves exploreHere doesn't
        // depend on one (see docs/Principles.md, "Camera Focus,
        // Active Document, and Selection Are Three Different Things").
        assert(session.getActiveDocumentId() === null, '7. precondition: nothing is active');

        const fromExploreHere = session.exploreHere(1).documents.map((r) => r.documentId).sort();
        const fromManualQuery = session.exploreLocation({ center: { x: 100, y: 0, z: 100 }, radius: 1 })
            .documents.map((r) => r.documentId).sort();
        assert(fromExploreHere.length === 2 && JSON.stringify(fromExploreHere) === JSON.stringify(fromManualQuery),
            '7b. exploreHere(1) from the camera position finds exactly what the equivalent manual query would');
    }

    // -------------------------------------------------------------
    // 8. "What's Here?" — a small fixed tolerance, distinct from
    //    exploreHere's configurable radius. From the same camera
    //    position, whatsHere() must find the two co-located towers
    //    but NOT Carol's Shed (20 World Units away — well outside the
    //    small tolerance), while exploreHere with a larger radius
    //    finds all three.
    // -------------------------------------------------------------
    {
        const session = buildSession();
        session._session.setCameraState({
            position: { x: 100, y: 0, z: 100 },
            target: { x: 100, y: 0, z: 100 },
            zoom: 1
        });

        const nearby = session.whatsHere().documents;
        assert(nearby.length === 2 && nearby.every((r) => r.documentId !== carolsShed.documentId),
            '8. whatsHere() finds only the exact-coordinate towers, not Carol\'s Shed 20 World Units away');

        const wider = session.exploreHere(25).documents;
        assert(wider.length === 3 && wider.some((r) => r.documentId === carolsShed.documentId),
            '8b. exploreHere with a larger radius from the same camera position finds Carol\'s Shed too');
    }

    // -------------------------------------------------------------
    // 9. A fallback (never explicitly placed) publication is still
    //    found, and still honestly labeled — a fallback position must
    //    never be presented as an authored one.
    // -------------------------------------------------------------
    {
        const session = buildSession();
        const fallbackPos = worldLayoutProvider.getPosition(unplacedCabin.documentId);
        const results = session.exploreLocation({ center: fallbackPos, radius: 0.01 }).documents;
        assert(results.length === 1 && results[0].documentId === unplacedCabin.documentId,
            '9. the unplaced cabin is found via its deterministic fallback position');
        assert(results[0].hasPlacement === false,
            '9b. and correctly flagged hasPlacement:false');
    }

    // -------------------------------------------------------------
    // 10. Published documents remain untouched by a whole browsing
    //     session — explore, inspect, and select never fork, edit, or
    //     even LOAD anything into the session (isDocumentPublished
    //     only has an opinion once something is loaded — see
    //     getDocumentInfo's own comment — so the real proof that
    //     nothing was silently forked is that nothing was loaded at
    //     all; only an explicit Focus, tested separately in #4, loads
    //     a document).
    // -------------------------------------------------------------
    {
        const session = buildSession();
        session.exploreLocation({ center: { x: 100, y: 0, z: 100 }, radius: 25 });
        session.inspectDocument(alicesTower.documentId);
        session.inspectDocument(carolsShed.documentId);
        session.setActiveDocument(bobsTower.documentId);

        assert(session.getLoadedDocuments().length === 0,
            '10. exploring, inspecting, and selecting never load a single document into the session — nothing to fork');
        assert(session.getDocument(alicesTower.documentId) === null
            && session.getDocument(bobsTower.documentId) === null
            && session.getDocument(carolsShed.documentId) === null,
            '10b. none of the browsed documents were loaded as a side effect');
    }

    // -------------------------------------------------------------
    // 11. Graceful degradation: the decentralized-provider contract
    //     (exploreLocation/exploreHere/whatsHere all ultimately answer
    //     "what can the configured discovery provider find," not
    //     "what happens to be loaded") holds even when nothing is
    //     wired — no searchWorldUseCase, and no camera/render session
    //     at all.
    // -------------------------------------------------------------
    {
        const bareSession = new WorldNavigationSession({
            registry, loadPublicationDocumentUseCase, worldLayoutProvider,
            saveDocumentUseCase, publishDocumentUseCase, identityProvider: alice,
            documentCloneService, discoveryProvider
            // no searchWorldUseCase, no _session/_spatialCameraController wired
        });
        const noSearchUseCase = bareSession.exploreLocation({ center: { x: 0, y: 0, z: 0 }, radius: 100 });
        assert(noSearchUseCase.documents.length === 0 && noSearchUseCase.diagnostics.available === false,
            '11. no SearchWorldUseCase wired -> exploreLocation degrades to an empty envelope, not a throw');
        assert(bareSession.exploreHere(25).documents.length === 0,
            '11b. no camera state yet -> exploreHere degrades to an empty envelope, not a throw');
        assert(bareSession.whatsHere().documents.length === 0,
            '11c. same for whatsHere()');
    }

    console.log('✅ All World Location Browser & Spatial Exploration tests passed.');
}

runTests().catch((e) => { console.error(e); throw e; });
