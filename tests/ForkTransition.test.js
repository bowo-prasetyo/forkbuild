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

// 0.2.22 — Fork Transition & World View Document Switching.
//
// The mechanics of forking itself (exactly one fork, lazy on first
// mutation, positional selection remap, fork policy enforcement, the
// gizmo path, streaming/position correctness) are already covered by
// tests/ForkOnEdit.test.js and the 0.2.20-hardening sections in it —
// this file does not repeat that coverage. What 0.2.22 adds is a
// single new invariant on top of an already-correct fork mechanism:
//
//   Every World View interaction operates against exactly one ACTIVE
//   document. The moment a mutation forks, session.
//   getActiveDocumentId() — the one piece of state the header title,
//   the browser route, and every subsequent mutation's target all
//   derive from (ui/views/WorldView.js's refreshSpatialUI) — reflects
//   the fork, not the source, from that same refresh onward. On a
//   DENIED fork, none of that moves: the active document stays the
//   source.
//
// The router/title-binding half of this lives in ui/views/WorldView.js
// (no unit harness in this repo touches ui/ — see every prior
// milestone's test file) and is reasoned about directly in
// docs/Architecture.md; what's tested here is the session-level
// guarantee that binding depends on: getActiveDocumentId() is correct
// and stable across every mutation path, immediately, with no
// intermediate state where it points at neither the old nor the new
// document.

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

    function buildSession(identityProvider = alice) {
        const session = new WorldNavigationSession({
            registry, loadPublicationDocumentUseCase, worldLayoutProvider,
            saveDocumentUseCase, publishDocumentUseCase, identityProvider,
            documentCloneService, discoveryProvider
        });
        session._session = stubRenderer();
        return session;
    }

    function selectFirstBrick(session, documentId) {
        const building = session.getDocument(documentId).world.getBuildings()[0];
        const brickId = building.getBricks()[0].id;
        session._setSpatialSelection(SpatialSelectionState.brick({ documentId, buildingId: building.id, brickId }));
    }

    // -------------------------------------------------------------
    // 1-8. The flagship transition: the active document, not just
    //      "a fork somewhere", switches — atomically, on the same
    //      mutation that created it.
    // -------------------------------------------------------------
    {
        const publication = publisher.publish(makeDocument('Alice World'), alice);
        const bob = new LocalIdentityProvider(new InMemoryStorageProvider());
        bob.login('bob');
        const session = buildSession(bob);
        session._loadWorld(publication.documentId);

        assert(session.getActiveDocumentId() === publication.documentId,
            '1. before any edit, the active document is the published source');

        selectFirstBrick(session, publication.documentId);
        const sourcePos = session.getDocumentPosition(publication.documentId);

        session.moveSelection({ x: 3, y: 0, z: 0 });

        const activeId = session.getActiveDocumentId();
        assert(activeId !== publication.documentId,
            '2. the active document switched away from the source the same mutation that forked it');
        assert(session.getDocument(publication.documentId) === null,
            '3. the source is gone from this session\'s view — there is no state where the screen could still show it');
        assert(session.getLoadedDocuments().length === 1,
            '4. exactly one loaded document: the fork now occupies the source\'s place, not alongside it');

        const info = session.getDocumentInfo(activeId);
        assert(info.status === 'draft', '5. the active (forked) document reports Draft, not Published');
        assert(info.parentDocumentId === publication.documentId, '6. lineage points back at the source');
        assert(info.editable === true, '6b. the active document is editable');

        assert(session.getSpatialSelection().documentId === activeId,
            '7. the selection now belongs to the active document, not the source');
        const forkPos = session.getDocumentPosition(activeId);
        assert(forkPos.x === sourcePos.x && forkPos.y === sourcePos.y && forkPos.z === sourcePos.z,
            '8. the fork occupies the exact same world-space position the source did — only identity changed, not location');

        const notice = session.consumeForkNotice();
        assert(notice && notice.forkId === activeId,
            '8b. the fork notice names the SAME document the active id now points at — one fact, not two that could disagree');

        assert(publisher.verifySnapshot(publication.id, publication.contentHash),
            "8c. Alice's original publication is untouched by Bob's edit");
        console.log('✓ the active document atomically switches to the fork on first mutation');
    }

    // -------------------------------------------------------------
    // 9. The reverse case: a denied fork must leave EVERYTHING
    //    pointing at the source — active document, selection, and
    //    editability all unmoved. There is no third state where the
    //    active document is ambiguous.
    // -------------------------------------------------------------
    {
        const publication = publisher.publish(makeDocument('Locked World', LicenseId.ALL_RIGHTS_RESERVED), alice);
        const session = buildSession();
        session._loadWorld(publication.documentId);
        selectFirstBrick(session, publication.documentId);

        assertThrows(() => session.moveSelection({ x: 1, y: 0, z: 0 }),
            '9. a fork-forbidden edit is rejected outright');

        assert(session.getActiveDocumentId() === publication.documentId,
            '9b. the active document is still the source after a denial — it never became ambiguous');
        assert(session.getSpatialSelection().documentId === publication.documentId,
            '9c. selection still belongs to the source');
        assert(session.isDocumentPublished(publication.documentId), '9d. the source is still published/unforked');
        assert(session.consumeForkNotice() === null, '9e. no fork notice — nothing forked, nothing to announce');

        const info = session.getDocumentInfo(publication.documentId);
        assert(info.status === 'published' && info.editabilityNotice && info.editabilityNotice.blocked === true,
            '9f. the Document Info the header would show still correctly says Published + blocked, with a reason');
    }

    // -------------------------------------------------------------
    // 10. A metadata edit (0.2.21) transitions the active document
    //     exactly the same way a brick move does — the invariant is
    //     "any mutation", not "brick mutations specifically".
    // -------------------------------------------------------------
    {
        const publication = publisher.publish(makeDocument('Renamed On Fork'), alice);
        const session = buildSession();
        session._loadWorld(publication.documentId);

        const forkId = session.updateDocumentMetadata(publication.documentId, { title: 'My Copy' });
        assert(session.getActiveDocumentId() === forkId,
            '10. a metadata-only edit ALSO switches the active document, same as a spatial mutation');
        assert(session.getDocument(publication.documentId) === null,
            '10b. the source is gone from this session here too — one switching mechanism, not two');
    }

    // -------------------------------------------------------------
    // 11. Once switched, every subsequent interaction — spatial or
    //     metadata, in either order — stays on the SAME active
    //     document. No interaction re-forks an already-editable one.
    // -------------------------------------------------------------
    {
        const publication = publisher.publish(makeDocument('Stays Put'), alice);
        const session = buildSession();
        session._loadWorld(publication.documentId);

        const forkId = session.updateDocumentMetadata(publication.documentId, { title: 'First Edit' });
        selectFirstBrick(session, forkId);
        session.moveSelection({ x: 1, y: 0, z: 0 });
        assert(session.getActiveDocumentId() === forkId, '11. active document unchanged after a second (spatial) edit');

        session.updateDocumentMetadata(forkId, { description: 'Third edit.' });
        assert(session.getActiveDocumentId() === forkId, '11b. and unchanged after a third (metadata) edit');
        assert(session.getLoadedDocuments().length === 1, '11c. still exactly one loaded document throughout');
    }

    console.log('✅ All Fork Transition & World View Document Switching tests passed.');
}

runTests().catch((e) => { console.error(e); throw e; });
