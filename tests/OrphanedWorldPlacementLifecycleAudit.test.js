import { readFile } from 'node:fs/promises';

import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
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
import { UnpublishDocumentUseCase } from '../application/UnpublishDocumentUseCase.js';
import { DocumentCloneService } from '../application/DocumentCloneService.js';
import { DocumentManager } from '../application/DocumentManager.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { PlacePublicationUseCase } from '../application/PlacePublicationUseCase.js';
import { RemoveWorldPlacementUseCase } from '../application/RemoveWorldPlacementUseCase.js';
import { MoveWorldPlacementUseCase } from '../application/MoveWorldPlacementUseCase.js';
import { DiscoverWorldsUseCase } from '../application/DiscoverWorldsUseCase.js';
import { SpatialCameraController } from '../application/SpatialCameraController.js';

// 0.9.200 — Orphaned World Placement Lifecycle Audit.
//
// Test-only. No production changes. 0.9.198's own Section D first
// observed, and 0.9.199's Section B reconfirmed without repairing, that
// unpublishing a Publication leaves its WorldPlacement/PlacementRecord
// behind: reachable at the raw-registry/spatial-index level, unreachable
// through the ordinary document-keyed read model. Both of those files
// asked that question in passing, as one section among several about a
// DIFFERENT convergence question (do removal and unpublish stay
// independent). This file is the first one to ask the orphan question
// as its OWN subject: what, precisely, can a Wanderer or Publisher still
// DO with a surviving orphaned placement, using only operations that
// already exist?
//
// Per this milestone's own brief, it deliberately does NOT:
//   - remove a placement automatically when its Publication is unpublished,
//   - tombstone, reattach, or auto-clean an orphaned PlacementRecord,
//   - invent a new Publication/placement lifecycle state, flag, or error, or
//   - decide a cleanup POLICY for the orphan case (that is explicitly a
//     product decision for whatever milestone follows this one, if any).
//
// It asks the question with real, running code, against the same real
// (not mocked) collaborators every other file in this arc already uses.

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

function stubRenderer(extra = {}) {
    const calls = { addWorld: [], removeWorld: [] };
    // A real camera state, tracked here — unlike 0.9.199's own
    // stubRenderer (which never drives SpatialCameraController and so
    // never needed one), this file's Section B actually moves the
    // camera and reads updateSpatialView()'s streaming result back, so
    // getCameraState/setCameraState need to genuinely round-trip.
    let cameraState = { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } };
    const renderer = {
        addWorld(world, documentId, position) { calls.addWorld.push(documentId); },
        removeWorld(world, documentId) { calls.removeWorld.push(documentId); },
        dispose() {},
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
        setCameraState(state) { cameraState = state; },
        ...extra
    };
    renderer._calls = calls;
    return renderer;
}

function makeDocument(title, brickCount = 1) {
    const world = new World();
    const building = new Building({ creator: 'alice' });
    for (let i = 0; i < brickCount; i++) {
        building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(i * 2, 0.5, 0) }));
    }
    world.addBuilding(building);
    return new Document({
        world,
        metadata: new DocumentMetadata({ title, author: 'alice', license: new License({ id: LicenseId.CC0_1_0 }) })
    });
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

// Same restraint every prior file in this arc applies to its own
// structural sweeps: full-line `//` comments are stripped before
// pattern-matching, so a comment that merely NAMES a class or word in
// prose (this file's own header, not least) is never mistaken for a
// real production reference.
function codeOnlyLines(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//'));
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
    const removeWorldPlacementUseCase = new RemoveWorldPlacementUseCase(spatialIndexProvider, placementRegistry);
    const moveWorldPlacementUseCase = new MoveWorldPlacementUseCase(spatialIndexProvider, placementRegistry, null, alice);
    const unpublishDocumentUseCase = new UnpublishDocumentUseCase(publisher);
    const discoverUseCase = new DiscoverWorldsUseCase(spatialIndexProvider);
    const publishDocumentUseCase = new PublishDocumentUseCase(publisher, alice);
    const documentCloneService = new DocumentCloneService();

    function buildSession(extra = {}) {
        const session = new WorldNavigationSession({
            registry, loadPublicationDocumentUseCase, worldLayoutProvider,
            saveDocumentUseCase, publishDocumentUseCase, identityProvider: alice,
            documentCloneService, discoveryProvider, placementRegistry,
            removeWorldPlacementUseCase, unpublishDocumentUseCase, moveWorldPlacementUseCase,
            ...extra
        });
        session._session = stubRenderer();
        // 0.9.199's own buildSession never wires this — none of its
        // sections drive camera/streaming. This file's Section B does
        // (updateSpatialView/findVisibleDocuments-through-the-session),
        // so it needs the same SpatialCameraController.start() itself
        // wires production-side, minus the real renderer/DOM container
        // start() would otherwise require.
        session._spatialCameraController = new SpatialCameraController(session._session);
        return session;
    }

    // -------------------------------------------------------------
    // A — FLAGSHIP: create the orphan, capturing every relevant
    // identity before and after, and asserting PRECISELY which
    // observations disappear and which survive.
    // -------------------------------------------------------------
    {
        const doc = makeDocument('A: Flagship Orphan', 3);
        const publication = publishDocumentUseCase.execute(new DocumentManager(doc));
        const position = new Position(20000, 0, 0);
        const placement = placePublicationUseCase.execute(publication.id, position);

        const identities = {
            documentId: publication.documentId,
            publicationId: publication.id,
            placementId: placement.id,
            contentHash: publication.contentHash
        };
        assert(Object.values(identities).every((v) => typeof v === 'string' && v.length > 0),
            'A1. all four identities are present, non-empty strings before anything is unpublished');

        const session = buildSession();
        session._loadWorld(identities.documentId);

        // BEFORE: every read model this file cares about resolves.
        assert(session.getPublicationForDocument(identities.documentId)?.id === identities.publicationId, 'A2. BEFORE: Publication resolves');
        assert(session.getPlacementInfo(identities.documentId)?.placementId === identities.placementId, 'A3. BEFORE: placement resolves through the document-keyed read model');
        assert(discoveryProvider.findById(identities.publicationId) !== null, 'A4. BEFORE: discovery catalog carries the Publication');
        assert(placementRegistry.get(identities.placementId) !== null, 'A5. BEFORE: the raw PlacementRecord exists');

        session.unpublishDocument(identities.documentId, identities.publicationId);

        // AFTER: precisely what disappears.
        assert(session.getPublicationForDocument(identities.documentId) === null, 'A6. AFTER: Publication read model returns null');
        assert(discoveryProvider.findById(identities.publicationId) === null, 'A7. AFTER: the catalog no longer carries the Publication (fresh, independent query)');
        assert(session.getPlacementInfo(identities.documentId) === null, 'A8. AFTER: the document-keyed placement read model ALSO returns null — this is the orphaning itself');

        // AFTER: precisely what survives, byte-identical.
        const survivingRecord = placementRegistry.get(identities.placementId);
        assert(survivingRecord !== null, 'A9. AFTER: the raw PlacementRecord itself was never deleted');
        assert(survivingRecord.placementId === identities.placementId, 'A10. AFTER: placementId unchanged');
        assert(survivingRecord.publicationId === identities.publicationId, 'A11. AFTER: publicationId unchanged — still names the now-dead Publication, never rewritten to null or anything else');
        assert(survivingRecord.position.x === position.x && survivingRecord.position.z === position.z, 'A12. AFTER: position unchanged');
        assert(survivingRecord.contentHash, 'A13. AFTER: the record still carries its own contentHash');
        assert(contentStore.has(publication.contentReference), 'A14. AFTER: the material itself survives — unpublish never touches content-addressed storage');
        const reloaded = loadPublicationDocumentUseCase.execute(identities.documentId);
        assert(reloaded.world.getBuildings()[0].getBricks().length === 3, 'A15. AFTER: the editable Document itself loads back completely intact');

        console.log('✓ A — flagship orphan creation: Publication and document-keyed placement lookup both vanish; the raw PlacementRecord, its identities, its content, and the editable Document all survive untouched');
    }

    // -------------------------------------------------------------
    // B — World visibility. Does the orphan remain rendered? Does it
    // disappear from ordinary World streaming? Does it remain in the
    // spatial index? Is it discoverable through any OTHER existing
    // path? No new path is added merely to answer this — every method
    // exercised below already exists in production.
    // -------------------------------------------------------------
    {
        const doc = makeDocument('B: World Visibility', 2);
        const publication = publishDocumentUseCase.execute(new DocumentManager(doc));
        const position = new Position(21000, 0, 0);
        placePublicationUseCase.execute(publication.id, position);

        // B1 — while published, an ordinary streaming query sees it.
        const visibleBefore = worldLayoutProvider.findVisibleDocuments(position, 50);
        assert(visibleBefore.includes(publication.documentId), 'B1. BEFORE: findVisibleDocuments() — the actual streaming query WorldNavigationSession.updateSpatialView() drives — includes this document');

        const session = buildSession();
        session.unpublishDocument(publication.documentId, publication.id);

        // B2 — the SAME streaming query, fresh, no longer includes it.
        // findVisibleDocuments() resolves each raw spatial-index hit
        // BACK to a Publication via discoveryProvider.findById(); once
        // that lookup fails, the hit is silently skipped rather than
        // surfaced — this is what actually keeps an orphan off of
        // ordinary World streaming, not any orphan-specific check.
        const visibleAfter = worldLayoutProvider.findVisibleDocuments(position, 50);
        assert(!visibleAfter.includes(publication.documentId), 'B2. AFTER: findVisibleDocuments() no longer includes the orphaned document — a fresh Wanderer streaming through this position never sees it stream in at all');

        console.log('✓ B1/B2 — the ordinary streaming query includes a published world and excludes the same world once orphaned, via its own pre-existing discoveryProvider resolution step');
    }

    // -------------------------------------------------------------
    // B3 — an ALREADY-LOADED copy (loaded before the unpublish, as a
    // Wanderer already standing here would have) is not yanked out
    // from under them instantly, but does not survive the NEXT
    // ordinary streaming pass either — updateSpatialView()'s own
    // toUnload/toLoad logic decides purely from findVisibleDocuments(),
    // with no special case for "this was visible a moment ago." Kept
    // as its own isolated block so a setup mistake here can never mask
    // a regression in B1/B2 above.
    // -------------------------------------------------------------
    {
        const doc = makeDocument('B3: Already-Loaded Copy Unloads', 2);
        const publication = publishDocumentUseCase.execute(new DocumentManager(doc));
        const position = new Position(21500, 0, 0);
        placePublicationUseCase.execute(publication.id, position);

        const session = buildSession();
        session.updateSpatialView(); // camera starts at the origin; nothing in range yet
        session._spatialCameraController.moveCamera({ x: position.x, y: 0, z: position.z });
        const first = session.updateSpatialView();
        assert(first.loaded.includes(publication.documentId), 'B3a. BEFORE unpublish: the document streams in and is loaded, exactly like any other published world nearby');

        session.unpublishDocument(publication.documentId, publication.id);

        // The world is still loaded right now — unpublishing does not
        // reach into the renderer and yank it out mid-observation.
        assert(session._loadedDocuments.has(publication.documentId), 'B3b. IMMEDIATELY AFTER unpublish, before any new streaming pass: the already-loaded copy is still present — unpublish has no rendering side effect of its own');

        // The next ordinary streaming pass (camera doesn't even need to
        // move — updateSpatialView() re-evaluates visibility every
        // time it runs) unloads it, because findVisibleDocuments() no
        // longer names it.
        const second = session.updateSpatialView();
        assert(!second.visible.includes(publication.documentId), 'B3c. AFTER the next streaming pass: no longer reported visible');
        assert(!second.loaded.includes(publication.documentId), 'B3d. AFTER the next streaming pass: no longer loaded — the SAME toUnload path an ordinary "walked out of range" world already takes, not a new orphan-specific unload');
        assert(session._session._calls.removeWorld.includes(publication.documentId), 'B3e. the renderer\'s own removeWorld() was actually called for it — this is a real unload, not merely a bookkeeping change');

        console.log('✓ B3 — an already-loaded orphan is not force-unloaded the instant its Publication goes away, but does not survive the very next ordinary streaming pass either, via the SAME visibility logic that unloads any world a Wanderer walks out of range of');
    }

    // -------------------------------------------------------------
    // B (continued) — the spatial index, the raw discovery use case,
    // the publicationId bypass, and the "documents at this location"
    // surface, checked together against ONE orphan.
    // -------------------------------------------------------------
    {
        const doc = makeDocument('B: Bypass And Ghost Row', 1);
        const publication = publishDocumentUseCase.execute(new DocumentManager(doc));
        const position = new Position(22000, 0, 0);
        const placement = placePublicationUseCase.execute(publication.id, position);

        const session = buildSession();
        session.unpublishDocument(publication.documentId, publication.id);

        // B4 — remains in the raw spatial index and the raw registry.
        assert(spatialIndexProvider.get(placement.id) !== null, 'B4a. the raw spatial index entry survives');
        assert(discoverUseCase.execute(position, 50).length === 1, 'B4b. DiscoverWorldsUseCase — a pure spatial-index query with no discoveryProvider dependency at all — still finds it');
        assert(placementRegistry.findByPublicationId(publication.id).length === 1, 'B4c. the PlacementRegistry still indexes it by its (now-dead) publicationId');

        // B5 — the publicationId-keyed bypass remains the one
        // documented surviving path (0.9.198/0.9.199).
        const bypass = session.getPlacementInfoForPublication(publication.id);
        assert(bypass !== null && bypass.placementId === placement.id, 'B5. getPlacementInfoForPublication() still resolves the orphan directly by its (dead) publicationId');

        // B6 — "documents at this location" (getDocumentsAtPosition,
        // the read model behind ui/components/LocationDocumentsDialog.js,
        // reached from PlacementInfoPanel's "View" link once
        // overlapCount > 0). AT THE TIME this file was originally
        // written (0.9.200), this query was NOT filtered by whether
        // each occupant's Publication still existed, and produced one
        // degraded row here: documentId null, title falling back to
        // the raw (dead) publicationId string. 0.9.201 fixed exactly
        // that seam — getDocumentsAtPosition() now omits an occupant it
        // cannot resolve to a Publication — so this section now
        // documents the CURRENT behavior instead: no row at all. See
        // tests/DegradedOrphanRowHandling.test.js for the full audit of
        // that fix (including confirming checkPlacementOverlap's own,
        // separate use of _describeSpatialOccupant() deliberately stays
        // unfiltered, since that's a collision check, not a document
        // listing).
        const occupants = session.getDocumentsAtPosition(position);
        assert(occupants.length === 0, 'B6. (0.9.201) the orphan no longer appears as an occupant at its own position at all — "documents at this location" now omits it rather than presenting a degraded, opaque-id row');

        console.log('✓ B — the orphan is invisible to ordinary World streaming (findVisibleDocuments/updateSpatialView), remains fully present in the raw spatial index/registry/DiscoverWorldsUseCase/publicationId bypass, and (as of 0.9.201) produces no row at all in the "documents at this location" dialog either');
    }

    // -------------------------------------------------------------
    // C — Mutation reachability. Does the existing system already
    // provide a coherent way to handle the orphan using operations
    // that already exist?
    // -------------------------------------------------------------
    {
        const doc = makeDocument('C: Mutation Reachability', 1);
        const publication = publishDocumentUseCase.execute(new DocumentManager(doc));
        const position = new Position(23000, 0, 0);
        const placement = placePublicationUseCase.execute(publication.id, position);

        const session = buildSession();
        session.unpublishDocument(publication.documentId, publication.id);

        // C1 — the document-keyed "move" path fails identically to
        // the document-keyed "remove" path (0.9.199, Section B) —
        // both resolve a placement BY WAY OF the document's current
        // Publication, and neither has a special case for "orphaned."
        assertThrows(() => session.movePlacement(publication.documentId, new Position(23000, 0, 500)),
            'C1. session.movePlacement(documentId) cannot resolve a placement to move once its governing Publication is gone — the SAME resolution failure removePlacement() already produces, never a new orphan-specific error');
        assertThrows(() => session.removePlacement(publication.documentId),
            'C2. session.removePlacement(documentId) cannot resolve it either (0.9.199 Section B, reconfirmed here as this file\'s own baseline)');

        // C3 — the raw use cases, given the placementId directly
        // (the SAME bypass value getPlacementInfoForPublication already
        // exposes), remain fully capable — proving the orphan is a
        // live, ordinary PlacementRecord, not frozen or corrupted.
        const moved = moveWorldPlacementUseCase.execute(placement.id, new Position(23000, 0, 500));
        assert(moved.position.z === 500, 'C3. the raw MoveWorldPlacementUseCase, given the placementId directly, moves the orphan exactly like any other placement');
        assert(placementRegistry.get(placement.id).revision === 2, 'C4. ...and the PlacementRegistry recorded a genuine new revision, the same causal machinery any other move gets — the orphan is not exempted from ordinary placement history');

        removeWorldPlacementUseCase.execute(placement.id);
        assert(placementRegistry.get(placement.id) === null, 'C5. the raw RemoveWorldPlacementUseCase, given the same placementId, removes it — the orphan is reachable end to end by anyone who already holds its placementId');

        console.log('✓ C — both document-keyed mutation paths (move, remove) refuse to resolve an orphan, identically to how they already refuse a never-placed document; both RAW use cases, given the placementId the publicationId bypass already exposes, remain fully capable — moving it, then removing it, exactly like an ordinary placement');
    }

    // -------------------------------------------------------------
    // D — Cross-document isolation. An orphan from document A must
    // never interfere with an unrelated, still-fully-published document B
    // — across every read model this file has introduced, not merely
    // the ones already checked by 0.9.199.
    // -------------------------------------------------------------
    {
        const pubA = publishDocumentUseCase.execute(new DocumentManager(makeDocument('D: Orphan A')));
        const pubB = publishDocumentUseCase.execute(new DocumentManager(makeDocument('D: Untouched B')));
        const posA = new Position(24000, 0, 0);
        const posB = new Position(25000, 0, 0);
        placePublicationUseCase.execute(pubA.id, posA);
        const placementB = placePublicationUseCase.execute(pubB.id, posB);

        const session = buildSession();
        session.unpublishDocument(pubA.documentId, pubA.id);

        // A is orphaned...
        assert(session.getPlacementInfo(pubA.documentId) === null, 'D1. A\'s placement is orphaned from its own document-keyed read model');
        assert(!worldLayoutProvider.findVisibleDocuments(posA, 50).includes(pubA.documentId), 'D2. A no longer streams in');

        // ...B is completely unaffected, across every surface B1-C exercised.
        assert(worldLayoutProvider.findVisibleDocuments(posB, 50).includes(pubB.documentId), 'D3. B still streams in normally');
        assert(session.getPlacementInfo(pubB.documentId)?.placementId === placementB.id, 'D4. B\'s document-keyed placement lookup is untouched');
        assert(session.getPublicationForDocument(pubB.documentId)?.id === pubB.id, 'D5. B\'s Publication lookup is untouched');
        const occupantsAtB = session.getDocumentsAtPosition(posB);
        assert(occupantsAtB.length === 1 && occupantsAtB[0].documentId === pubB.documentId, 'D6. "documents at this location" for B\'s position shows only B, fully resolved — A\'s orphan does not leak into an unrelated position\'s occupant list');
        assert(discoverUseCase.execute(posB, 50).length === 1, 'D7. B is independently discoverable via the raw spatial query too');

        console.log('✓ D — an orphaned placement in document A never interferes with document B\'s Publication, placement, streaming visibility, or "documents at this location" listing');
    }

    // -------------------------------------------------------------
    // E — Identity preservation. Unpublishing must never rewrite the
    // surviving PlacementRecord's own identity fields.
    // -------------------------------------------------------------
    {
        const doc = makeDocument('E: Identity Preservation', 2);
        const publication = publishDocumentUseCase.execute(new DocumentManager(doc));
        const position = new Position(26000, 0, 0);
        const placement = placePublicationUseCase.execute(publication.id, position);
        const before = placementRegistry.get(placement.id).toJSON();

        const session = buildSession();
        session.unpublishDocument(publication.documentId, publication.id);

        const after = placementRegistry.get(placement.id).toJSON();
        assert(after.placementId === before.placementId, 'E1. placementId unchanged');
        assert(after.publicationId === before.publicationId, 'E2. publicationId unchanged — never rewritten, blanked, or substituted for anything else');
        assert(after.contentHash === before.contentHash, 'E3. contentHash unchanged');
        assert(after.revision === before.revision, 'E4. revision unchanged — unpublish creates no new placement revision');
        assert(JSON.stringify(after.position) === JSON.stringify(before.position), 'E5. position unchanged');
        assert(JSON.stringify(after.rotation) === JSON.stringify(before.rotation), 'E6. rotation unchanged');
        assert(after.owner === before.owner, 'E7. owner unchanged');
        assert(JSON.stringify(after) === JSON.stringify(before), 'E8. the ENTIRE serialized record is byte-for-byte identical before and after unpublish — no field of any kind was touched');

        console.log('✓ E — unpublishing rewrites nothing on the surviving PlacementRecord; its serialized form is byte-for-byte identical before and after');
    }

    // -------------------------------------------------------------
    // F — Re-publication. The combined lifecycle: publish, place,
    // unpublish, re-publish, then observe what the EXISTING placement
    // actually does. Does it reattach, remain orphaned, or require a
    // new placement? Whatever the answer is, this documents it rather
    // than changing it.
    // -------------------------------------------------------------
    {
        const doc = makeDocument('F: Re-publication', 2);
        const firstPublish = publishDocumentUseCase.execute(new DocumentManager(doc));
        const position = new Position(27000, 0, 0);
        const placement = placePublicationUseCase.execute(firstPublish.id, position);

        const session = buildSession();
        session.unpublishDocument(firstPublish.documentId, firstPublish.id);
        assert(session.getPlacementInfoForPublication(firstPublish.id)?.placementId === placement.id, 'F1. sanity: the orphan is reachable via the bypass, keyed by the FIRST publicationId, before re-publishing');

        const secondPublish = publishDocumentUseCase.execute(new DocumentManager(doc));
        assert(secondPublish.documentId === firstPublish.documentId, 'F2. sanity: same document, re-published');
        assert(secondPublish.id !== firstPublish.id, 'F3. sanity: a genuinely new publicationId');

        // The answer: the existing placement does NOT naturally
        // reattach to the new Publication. PlacePublicationUseCase was
        // never called again, so no new PlacementRecord exists for
        // secondPublish.id — and the OLD record's own publicationId
        // field still names the FIRST (dead) id (Section E already
        // proved unpublish never rewrites it; nothing about publish
        // touches it either).
        assert(session.getPlacementInfo(firstPublish.documentId) === null, 'F4. the document-keyed read model resolves the CURRENT (second) Publication first, finds zero PlacementRecords under ITS id, and reports null — exactly as if this document had never been placed at all, even though an orphan for it still exists');
        assert(session.getPlacementInfoForPublication(secondPublish.id) === null, 'F5. the bypass, keyed by the NEW publicationId, finds nothing either — there is genuinely no PlacementRecord for the new Publication yet');
        const stillOrphaned = session.getPlacementInfoForPublication(firstPublish.id);
        assert(stillOrphaned !== null && stillOrphaned.placementId === placement.id, 'F6. the bypass, keyed by the OLD (still-dead) publicationId, still resolves the SAME original PlacementRecord — re-publishing neither reattaches it nor deletes it; it is now orphaned from BOTH the current Publication and the catalog, simultaneously');
        assert(placementRegistry.get(placement.id).publicationId === firstPublish.id, 'F7. the record\'s own publicationId field is confirmed unchanged, still naming the id that died first');

        console.log('✓ F — re-publishing the same document produces a brand-new Publication with NO placement of its own; the original orphaned PlacementRecord remains exactly where it was, reattached to nothing, requiring a genuinely NEW placement (Section G) rather than reviving automatically');
    }

    // -------------------------------------------------------------
    // G — Re-placement. Establish whether the system can recover
    // cleanly using ONLY existing operations: unpublish, remove the
    // surviving orphan, publish again, place again.
    // -------------------------------------------------------------
    {
        const doc = makeDocument('G: Clean Recovery', 2);
        const firstPublish = publishDocumentUseCase.execute(new DocumentManager(doc));
        const firstPosition = new Position(28000, 0, 0);
        const firstPlacement = placePublicationUseCase.execute(firstPublish.id, firstPosition);

        const session = buildSession();
        session.unpublishDocument(firstPublish.documentId, firstPublish.id);

        // Remove the surviving orphan via the raw use case — the one
        // path Section C proved still works.
        removeWorldPlacementUseCase.execute(firstPlacement.id);
        assert(placementRegistry.get(firstPlacement.id) === null, 'G1. the orphan is genuinely gone after the raw removal');
        assert(session.getDocumentsAtPosition(firstPosition).length === 0, 'G2. the ghost row Section B found is gone too — nothing left to degrade at the old position');

        const secondPublish = publishDocumentUseCase.execute(new DocumentManager(doc));
        const secondPosition = new Position(28000, 0, 500);
        const secondPlacement = placePublicationUseCase.execute(secondPublish.id, secondPosition);

        // The document is now in a FULLY clean state: exactly one
        // Publication, exactly one PlacementRecord, both resolving
        // normally through the ordinary document-keyed read models —
        // no trace of the earlier orphan anywhere a Wanderer could see.
        assert(session.getPublicationForDocument(secondPublish.documentId)?.id === secondPublish.id, 'G3. the document-keyed Publication lookup resolves the new Publication');
        assert(session.getPlacementInfo(secondPublish.documentId)?.placementId === secondPlacement.id, 'G4. the document-keyed placement lookup resolves the new placement');
        assert(worldLayoutProvider.findVisibleDocuments(secondPosition, 50).includes(secondPublish.documentId), 'G5. the document streams in normally at its new position');
        assert(!worldLayoutProvider.findVisibleDocuments(firstPosition, 50).includes(secondPublish.documentId), 'G6. ...and is correctly ABSENT from the old position — nothing was left behind there either');
        assert(placementRegistry.findByPublicationId(firstPublish.id).length === 0, 'G7. no PlacementRecord anywhere still references the original, long-dead publicationId');

        console.log('✓ G — unpublish, remove the surviving orphan, publish again, place again: the existing operations, used in sequence, already recover a fully clean state with no trace of the earlier orphan left anywhere a Wanderer could observe');
    }

    // -------------------------------------------------------------
    // H — Structural audit. Confirm no hidden cleanup currently
    // occurs on unpublish OR on publish, unless it is already a
    // consequence of the existing domain operation this file has
    // behaviorally exercised above.
    // -------------------------------------------------------------
    {
        const unpublishUseCaseSource = await rawSource('application/UnpublishDocumentUseCase.js');
        const publisherProviderSource = await rawSource('publisher/LocalPublisherProvider.js');
        const cleanupVocabulary = /RemoveWorldPlacementUseCase|PlacementRegistry|SpatialIndexProvider|_placementRegistry|_spatialIndexProvider/;

        assert(!cleanupVocabulary.test(codeOnlyLines(unpublishUseCaseSource).join('\n')),
            'H1. UnpublishDocumentUseCase.js\'s own code never references RemoveWorldPlacementUseCase, PlacementRegistry, or SpatialIndexProvider in any form');
        assert(!cleanupVocabulary.test(codeOnlyLines(publisherProviderSource).join('\n')),
            'H2. LocalPublisherProvider.js — where unpublish()/publish() actually live — carries the same absence: no placement or spatial-index collaborator of any kind is constructed, injected, or referenced');

        // No orphan-specific vocabulary was introduced anywhere in
        // production by writing THIS file's own new production-facing
        // read models — there are none; this file adds test code only.
        const sessionSource = await rawSource('application/WorldNavigationSession.js');
        const noNewFlagVocabulary = /\borphan(ed)?\b|\bisOrphaned\b|\bplacementOrphaned\b/i;
        assert(!noNewFlagVocabulary.test(codeOnlyLines(sessionSource).join('\n')),
            'H3. WorldNavigationSession.js still introduces no orphaned/isOrphaned vocabulary in code (0.9.199\'s own Section G, reconfirmed unchanged)');

        console.log('✓ H — no hidden cleanup exists on unpublish OR publish: neither touches a placement or spatial-index collaborator at all, and no new orphan-shaped vocabulary exists anywhere in production code');
    }

    console.log('\n✅ All Orphaned World Placement Lifecycle Audit tests passed.');
    console.log(`
--------------------------------------------------------------------
0.9.200 DECISION (per this milestone's own brief — one of two, not
both, and deliberately not a cleanup policy):

OUTCOME 1 — INTENTIONAL BOUNDARY, with one documented rough edge.

An unpublished Publication may leave an orphaned raw World placement.
This is an internal storage consequence, not a user-facing lifecycle
trap:

  - It is INVISIBLE to ordinary World streaming (Section B1/B2) — a
    fresh Wanderer never sees it stream in, because findVisibleDocuments()
    already resolves every spatial-index hit through discoveryProvider
    and silently skips a miss.
  - An already-loaded copy does not survive the next ordinary
    streaming pass (Section B3) — the SAME "walked out of range" unload
    path, no special case needed.
  - Both document-keyed mutation paths (move, remove) already refuse
    to resolve it, with the SAME error a never-placed document already
    produces (Section C) — never a dangling action a Wanderer could
    take by accident through the normal UI.
  - The existing operations (unpublish, remove, publish, place) already
    compose into a fully clean recovery with zero manual cleanup
    (Section G).
  - No hidden coupling and no new lifecycle vocabulary exists anywhere
    in production (Section H).

The one honest exception AT THE TIME THIS AUDIT WAS WRITTEN:
getDocumentsAtPosition() — the read model behind the existing
"Documents Here" dialog — was NOT filtered by Publication existence, so
an orphan produced one degraded row there: a title that falls back to a
raw publicationId string, with an already-disabled "Focus" button
(Section B6, as originally written). This was inert, not a trap —
nothing could be clicked, nothing broke — but it was a genuine, if
minor, rough edge: a person could see a meaningless-looking id in that
list and wonder what it is.

Per this milestone's own brief, the decision THIS audit produced was
NOT to fix that itself — whether that one row was worth a small future
polish was left as an explicitly optional, low-priority follow-up, never
a mandated cleanup feature.

UPDATE — 0.9.201 took up exactly that optional follow-up:
getDocumentsAtPosition() now omits an occupant it cannot resolve to a
Publication, so "Documents Here" produces no row at all for an orphan
(Section B6 above now asserts that, not the original degraded shape).
No orphan-lifecycle state or vocabulary was introduced to do it — see
tests/DegradedOrphanRowHandling.test.js for the full fix and its own
focused audit, including confirmation that checkPlacementOverlap's
separate, unfiltered use of the same _describeSpatialOccupant() shape
(a collision check, not a document listing) was deliberately left
untouched.
--------------------------------------------------------------------
`);
}

runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
