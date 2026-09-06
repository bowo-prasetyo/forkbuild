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

// 0.9.201 — Degraded Orphan Row Handling.
//
// 0.9.200's own audit found exactly one honest, minor rough edge left by
// its "orphan is an intentional boundary" decision: getDocumentsAtPosition()
// — the read model behind the existing "Documents Here" dialog
// (ui/components/LocationDocumentsDialog.js) — was NOT filtered by
// Publication existence, so an orphaned placement (a surviving
// PlacementRecord whose Publication has been unpublished) still produced
// one degraded row there: a title falling back to a raw publicationId
// string, with an already-disabled Focus button.
//
// This file is the production fix (application/WorldNavigationSession.js's
// getDocumentsAtPosition() now omits an occupant it cannot resolve to a
// Publication) plus the focused E2E audit proving the fix is exactly as
// narrow as 0.9.200 recommended:
//
//   - the raw PlacementRecord is untouched (never deleted, never rewritten),
//   - the Publication is never resurrected,
//   - the material is untouched,
//   - ordinary World streaming is unchanged (it already excluded the
//     orphan; this milestone doesn't touch that path at all),
//   - re-publish/re-place recovery (0.9.200 Section G) still works, and
//   - an unrelated, still-published document at a different position is
//     completely unaffected.
//
// Per this milestone's own brief, it deliberately does NOT:
//   - introduce an ORPHANED/UNPUBLISHED_PLACEMENT/STALE_PUBLICATION state,
//     flag, or any other new orphan-lifecycle vocabulary,
//   - delete, tombstone, or otherwise mutate the surviving PlacementRecord,
//   - teach the presentation layer WHY a publication failed to resolve —
//     it only ever observes "publication lookup → null → not presentable".
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

function stubRenderer(extra = {}) {
    const calls = { addWorld: [], removeWorld: [] };
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
// prose is never mistaken for a real production reference.
function codeOnlyLines(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//'));
}

// Extracts one named method's own body text out of a class source file —
// from its own declaration line up to its own matching closing brace.
// Scoped structural checks (Section F below) audit ONLY what a named
// method's own body references, not the whole file (which legitimately
// references plenty of these collaborators elsewhere, for unrelated
// features).
function extractMethodBody(source, name) {
    const marker = `    ${name}(`;
    const startIndex = source.indexOf(marker);
    assert(startIndex !== -1, `sanity — ${name}() is found verbatim in its source file`);
    const braceOpen = source.indexOf('{', startIndex);
    let depth = 0;
    let index = braceOpen;
    for (; index < source.length; index++) {
        if (source[index] === '{') depth++;
        else if (source[index] === '}') {
            depth--;
            if (depth === 0) break;
        }
    }
    assert(depth === 0, `sanity — ${name}()'s own closing brace is found`);
    return source.slice(startIndex, index + 1);
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
        session._spatialCameraController = new SpatialCameraController(session._session);
        return session;
    }

    // -------------------------------------------------------------
    // A — FLAGSHIP: publish, place, confirm the row appears; unpublish;
    // confirm the SAME PlacementRecord survives; confirm "Documents
    // Here" now shows no degraded actionable row at all.
    // -------------------------------------------------------------
    {
        const doc = makeDocument('A: Flagship Degraded Row', 3);
        const publication = publishDocumentUseCase.execute(new DocumentManager(doc));
        const position = new Position(30000, 0, 0);
        const placement = placePublicationUseCase.execute(publication.id, position);

        const session = buildSession();

        // BEFORE: the placement appears, fully resolved, in "Documents Here".
        const before = session.getDocumentsAtPosition(position);
        assert(before.length === 1, 'A1. BEFORE unpublish: the placement appears as one occupant of "Documents Here"');
        assert(before[0].documentId === publication.documentId, 'A2. BEFORE unpublish: fully resolved — a real documentId, an actionable Focus target');
        assert(before[0].title === 'A: Flagship Degraded Row', 'A3. BEFORE unpublish: the real title, not a raw id');

        session.unpublishDocument(publication.documentId, publication.id);

        // AFTER: the SAME raw PlacementRecord survives, byte-identical
        // to what it recorded before (0.9.200's own Section A/E already
        // proved this; reconfirmed here as this fix's own precondition).
        const survivingRecord = placementRegistry.get(placement.id);
        assert(survivingRecord !== null, 'A4. AFTER unpublish: the raw PlacementRecord itself was never deleted');
        assert(survivingRecord.publicationId === publication.id, 'A5. AFTER unpublish: publicationId unchanged — still names the now-dead Publication');
        assert(survivingRecord.position.x === position.x && survivingRecord.position.z === position.z, 'A6. AFTER unpublish: position unchanged');

        // AFTER: "Documents Here" — the SAME query, fresh — no longer
        // produces ANY row for this position. Not a degraded row with a
        // disabled button: no row at all.
        const after = session.getDocumentsAtPosition(position);
        assert(after.length === 0, 'A7. AFTER unpublish: getDocumentsAtPosition() returns ZERO occupants at this position — no degraded, opaque-id row is presented');

        console.log('✓ A — flagship: a placement visible in "Documents Here" while published produces no row at all once its Publication is unpublished, even though the same PlacementRecord survives underneath');
    }

    // -------------------------------------------------------------
    // B — Nothing about the fix reaches into storage. The placement
    // was not deleted, the Publication was not resurrected, and the
    // material itself was never touched.
    // -------------------------------------------------------------
    {
        const doc = makeDocument('B: Storage Untouched', 2);
        const publication = publishDocumentUseCase.execute(new DocumentManager(doc));
        const position = new Position(31000, 0, 0);
        const placement = placePublicationUseCase.execute(publication.id, position);
        const beforeJSON = placementRegistry.get(placement.id).toJSON();

        const session = buildSession();
        session.unpublishDocument(publication.documentId, publication.id);
        session.getDocumentsAtPosition(position); // the very read this milestone changed — call it, then verify nothing moved

        const afterJSON = placementRegistry.get(placement.id).toJSON();
        assert(JSON.stringify(afterJSON) === JSON.stringify(beforeJSON), 'B1. the PlacementRecord is byte-for-byte identical before and after calling the (now-filtering) getDocumentsAtPosition() — the fix reads, it never writes');
        assert(discoveryProvider.findById(publication.id) === null, 'B2. the Publication was not resurrected by asking "Documents Here" about its old position — the catalog still reports it gone');
        assert(contentStore.has(publication.contentReference), 'B3. the material itself survives, content-addressed and untouched, exactly as unpublish alone already left it');
        const reloaded = loadPublicationDocumentUseCase.execute(publication.documentId);
        assert(reloaded.world.getBuildings()[0].getBricks().length === 2, 'B4. the editable Document itself still loads back completely intact');

        console.log('✓ B — the fix is read-only: the PlacementRecord, the Publication\'s (still-dead) catalog state, and the underlying material are all exactly as unpublish alone left them');
    }

    // -------------------------------------------------------------
    // C — World streaming behavior is unchanged. 0.9.200 already
    // established that findVisibleDocuments()/updateSpatialView()
    // exclude an orphan via their OWN pre-existing discoveryProvider
    // resolution — this milestone touches none of that machinery, so
    // it must still hold, unmodified, after this fix.
    // -------------------------------------------------------------
    {
        const doc = makeDocument('C: Streaming Unchanged', 2);
        const publication = publishDocumentUseCase.execute(new DocumentManager(doc));
        const position = new Position(32000, 0, 0);
        placePublicationUseCase.execute(publication.id, position);

        const visibleBefore = worldLayoutProvider.findVisibleDocuments(position, 50);
        assert(visibleBefore.includes(publication.documentId), 'C1. BEFORE unpublish: ordinary streaming includes the published document');

        const session = buildSession();
        session.updateSpatialView();
        session._spatialCameraController.moveCamera({ x: position.x, y: 0, z: position.z });
        const firstPass = session.updateSpatialView();
        assert(firstPass.loaded.includes(publication.documentId), 'C2. BEFORE unpublish: it streams in and loads normally');

        session.unpublishDocument(publication.documentId, publication.id);
        session.getDocumentsAtPosition(position); // exercise the fixed read model in between

        const visibleAfter = worldLayoutProvider.findVisibleDocuments(position, 50);
        assert(!visibleAfter.includes(publication.documentId), 'C3. AFTER unpublish: findVisibleDocuments() still excludes it — unchanged from 0.9.200, this milestone never touches world-layout streaming');

        const secondPass = session.updateSpatialView();
        assert(!secondPass.loaded.includes(publication.documentId), 'C4. AFTER unpublish: the next streaming pass still unloads the already-loaded copy, the same pre-existing path');
        assert(session._session._calls.removeWorld.includes(publication.documentId), 'C5. ...via a real renderer removeWorld() call, exactly as 0.9.200 already found');

        console.log('✓ C — ordinary World streaming (findVisibleDocuments/updateSpatialView) behaves identically before and after this fix; it was never part of the seam this milestone touches');
    }

    // -------------------------------------------------------------
    // D — Re-publish/re-place recovery (0.9.200 Section G) still
    // works exactly as documented, using only existing operations.
    // -------------------------------------------------------------
    {
        const doc = makeDocument('D: Recovery Still Works', 2);
        const firstPublish = publishDocumentUseCase.execute(new DocumentManager(doc));
        const firstPosition = new Position(33000, 0, 0);
        const firstPlacement = placePublicationUseCase.execute(firstPublish.id, firstPosition);

        const session = buildSession();
        session.unpublishDocument(firstPublish.documentId, firstPublish.id);
        assert(session.getDocumentsAtPosition(firstPosition).length === 0, 'D1. immediately after unpublish, the old position shows no row (this fix, exercised again)');

        removeWorldPlacementUseCase.execute(firstPlacement.id);
        assert(placementRegistry.get(firstPlacement.id) === null, 'D2. the raw orphan can still be removed via the raw use case, exactly as 0.9.200 Section G found');

        const secondPublish = publishDocumentUseCase.execute(new DocumentManager(doc));
        const secondPosition = new Position(33000, 0, 500);
        const secondPlacement = placePublicationUseCase.execute(secondPublish.id, secondPosition);

        assert(session.getPublicationForDocument(secondPublish.documentId)?.id === secondPublish.id, 'D3. the document-keyed Publication lookup resolves the new Publication');
        assert(session.getPlacementInfo(secondPublish.documentId)?.placementId === secondPlacement.id, 'D4. the document-keyed placement lookup resolves the new placement');

        const recovered = session.getDocumentsAtPosition(secondPosition);
        assert(recovered.length === 1 && recovered[0].documentId === secondPublish.documentId, 'D5. "Documents Here" at the NEW position shows the re-placed document, fully resolved, actionable — recovery via existing operations is untouched by this fix');
        assert(session.getDocumentsAtPosition(firstPosition).length === 0, 'D6. ...and the OLD position still shows nothing — no trace of the earlier orphan anywhere');

        console.log('✓ D — unpublish, remove the surviving orphan, publish again, place again still recovers a fully clean, fully actionable state — this fix changes nothing about that path');
    }

    // -------------------------------------------------------------
    // E — Cross-document isolation: an orphan from document A must
    // never affect what "Documents Here" shows for an unrelated,
    // still-published document B at a different position.
    // -------------------------------------------------------------
    {
        const pubA = publishDocumentUseCase.execute(new DocumentManager(makeDocument('E: Orphan A')));
        const pubB = publishDocumentUseCase.execute(new DocumentManager(makeDocument('E: Untouched B')));
        const posA = new Position(34000, 0, 0);
        const posB = new Position(35000, 0, 0);
        placePublicationUseCase.execute(pubA.id, posA);
        placePublicationUseCase.execute(pubB.id, posB);

        const session = buildSession();
        session.unpublishDocument(pubA.documentId, pubA.id);

        const occupantsAtA = session.getDocumentsAtPosition(posA);
        assert(occupantsAtA.length === 0, 'E1. A\'s own position now shows no row');

        const occupantsAtB = session.getDocumentsAtPosition(posB);
        assert(occupantsAtB.length === 1, 'E2. B\'s position still shows exactly its own document — one row, not zero, not two');
        assert(occupantsAtB[0].documentId === pubB.documentId, 'E3. ...fully resolved, unaffected by A\'s orphan existing elsewhere');
        assert(occupantsAtB[0].title === 'E: Untouched B', 'E4. ...with its real title, never degraded');

        console.log('✓ E — an orphaned placement in document A never removes, degrades, or otherwise affects the "Documents Here" row for an unrelated, still-published document B');
    }

    // -------------------------------------------------------------
    // F — Structural audit: the presentation layer stays exactly as
    // ignorant of WHY a publication is unavailable as the brief
    // requires — no dependency on UnpublishDocumentUseCase,
    // RemoveWorldPlacementUseCase, placement deletion, Snapshot
    // machinery, Nostr/Arweave, or any new orphan-lifecycle
    // vocabulary, scoped to the ACTUAL methods this fix touches (not
    // the whole file, which legitimately references plenty of these
    // collaborators elsewhere for unrelated features).
    // -------------------------------------------------------------
    {
        const sessionSource = await rawSource('application/WorldNavigationSession.js');
        const dialogSource = await rawSource('ui/components/LocationDocumentsDialog.js');

        const getDocumentsAtPositionBody = codeOnlyLines(extractMethodBody(sessionSource, 'getDocumentsAtPosition')).join('\n');
        const describeSpatialOccupantBody = codeOnlyLines(extractMethodBody(sessionSource, '_describeSpatialOccupant')).join('\n');

        const forbiddenCollaborators = /UnpublishDocumentUseCase|RemoveWorldPlacementUseCase|removePlacement|deletePlacement|Snapshot|Nostr|Arweave/;
        assert(!forbiddenCollaborators.test(getDocumentsAtPositionBody),
            'F1. getDocumentsAtPosition()\'s own body references none of UnpublishDocumentUseCase, RemoveWorldPlacementUseCase, placement deletion, Snapshot machinery, or Nostr/Arweave');
        assert(!forbiddenCollaborators.test(describeSpatialOccupantBody),
            'F2. _describeSpatialOccupant()\'s own body carries the same absence — the resolution step it performs is a plain discoveryProvider lookup, nothing else');

        const noNewLifecycleVocabulary = /\bORPHANED\b|\bUNPUBLISHED_PLACEMENT\b|\bSTALE_PUBLICATION\b|\borphan(ed)?\b|\bisOrphaned\b|\bplacementOrphaned\b/i;
        assert(!noNewLifecycleVocabulary.test(getDocumentsAtPositionBody),
            'F3. getDocumentsAtPosition() introduces no ORPHANED/UNPUBLISHED_PLACEMENT/STALE_PUBLICATION state, flag, or other orphan-lifecycle vocabulary — it only ever observes "publication lookup → null → not presentable"');
        assert(!noNewLifecycleVocabulary.test(describeSpatialOccupantBody),
            'F4. _describeSpatialOccupant() carries the same absence');
        assert(!noNewLifecycleVocabulary.test(codeOnlyLines(dialogSource).join('\n')),
            'F5. LocationDocumentsDialog.js (the presentation component itself) introduces no orphan-lifecycle vocabulary either — it never learns WHY a row is missing, only that "Documents Here" now has fewer of them');
        assert(!forbiddenCollaborators.test(codeOnlyLines(dialogSource).join('\n')),
            'F6. LocationDocumentsDialog.js has no dependency of its own on UnpublishDocumentUseCase, RemoveWorldPlacementUseCase, placement deletion, Snapshot machinery, or Nostr/Arweave — the omission happens entirely upstream, in the read model, before this component ever runs');

        console.log('✓ F — the presentation layer (getDocumentsAtPosition, _describeSpatialOccupant, and LocationDocumentsDialog.js itself) stays completely ignorant of WHY a publication failed to resolve, and introduces no new orphan-lifecycle vocabulary of any kind');
    }

    // -------------------------------------------------------------
    // G — checkPlacementOverlap (the move pre-flight collision check)
    // is a DIFFERENT consumer of the SAME _describeSpatialOccupant()
    // and is deliberately left unfiltered — it answers "what's
    // physically here to collide with," not "what documents can a
    // person act on." Confirms the fix is scoped to ONE presentation
    // surface, not a blanket change to shared plumbing.
    // -------------------------------------------------------------
    {
        const doc = makeDocument('G: Collision Check Unfiltered', 1);
        const publication = publishDocumentUseCase.execute(new DocumentManager(doc));
        const position = new Position(36000, 0, 0);
        placePublicationUseCase.execute(publication.id, position);

        const movingDoc = makeDocument('G: The Mover', 1);
        const movingPublication = publishDocumentUseCase.execute(new DocumentManager(movingDoc));
        placePublicationUseCase.execute(movingPublication.id, new Position(36500, 0, 0));

        const session = buildSession();
        session.unpublishDocument(publication.documentId, publication.id);

        // "Documents Here" at the orphan's position now shows nothing...
        assert(session.getDocumentsAtPosition(position).length === 0, 'G1. sanity — the orphan produces no row in "Documents Here"');

        // ...but a collision pre-flight check against that SAME position
        // still reports the raw occupant — it is a physical-occupancy
        // fact, not a document listing, and this milestone never touches it.
        const overlapCheck = session.checkPlacementOverlap(movingPublication.documentId, position);
        assert(overlapCheck !== null, 'G2. checkPlacementOverlap() still runs normally');
        assert(overlapCheck.occupants.length === 1, 'G3. ...and STILL reports the orphan as a physical occupant of that position — collision detection is unaffected by this milestone\'s presentation-only fix');
        assert(overlapCheck.occupants[0].documentId === null, 'G4. ...via the SAME pre-existing degraded shape _describeSpatialOccupant() always produced for an unresolvable publication — nothing about that shared method changed');

        console.log('✓ G — checkPlacementOverlap keeps seeing the raw, unfiltered occupant at a collision check; only getDocumentsAtPosition (the "Documents Here" read model) was taught to omit it — confirming this is a narrow, single-surface presentation fix, not a change to shared placement plumbing');
    }

    console.log('\n✅ All Degraded Orphan Row Handling tests passed.');
    console.log(`
--------------------------------------------------------------------
0.9.201 SUMMARY:

The one rough edge 0.9.200 documented and deliberately left unfixed —
an orphaned placement (a PlacementRecord surviving its own Publication
being unpublished) producing one degraded, opaque-id row in "Documents
Here" — is now resolved, narrowly, at exactly the seam recommended:

  getDocumentsAtPosition() [application/WorldNavigationSession.js]
      occupant → _describeSpatialOccupant() → publication lookup → null
                                                      │
                                                      ▼
                                            occupant.documentId === null
                                                      │
                                                      ▼
                                    (0.9.201) filtered out, never returned

No orphan state, flag, or lifecycle vocabulary was introduced anywhere.
The presentation layer remains as ignorant of WHY a publication cannot
be resolved as it was before this fix — it only ever observes
"publication lookup → null → not presentable." The raw PlacementRecord,
the spatial index, DiscoverWorldsUseCase, the publicationId bypass, and
checkPlacementOverlap's own (deliberately unfiltered) collision-detection
occupants are all untouched — this is presentation-only, exactly as
narrow as 0.9.200 recommended.
--------------------------------------------------------------------
`);
}

runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
