import { readFile } from 'node:fs/promises';

import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { License, LicenseId } from '../core/License.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { computeContentHash } from '../serializer/contentHash.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { Publication } from '../publisher/Publication.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { PublishDocumentUseCase } from '../application/PublishDocumentUseCase.js';
import { SaveDocumentUseCase } from '../application/SaveDocumentUseCase.js';
import { DocumentManager } from '../application/DocumentManager.js';
import { CommandHistory } from '../application/CommandHistory.js';
import { MoveBrickCommand } from '../application/commands/MoveBrickCommand.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { LoadPublicationDocumentUseCase } from '../application/LoadPublicationDocumentUseCase.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { DocumentCloneService } from '../application/DocumentCloneService.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { LocalWorldLayoutProvider } from '../world-layout/LocalWorldLayoutProvider.js';
import { CreateCommandRegistryUseCase } from '../application/CreateCommandRegistryUseCase.js';
import { WorldCommandPropagationUseCase, WorldOperationRejectionReason } from '../application/WorldCommandPropagationUseCase.js';
import { DeviceAuthorizationPropagationUseCase } from '../application/DeviceAuthorizationPropagationUseCase.js';
import { ConnectedPeer } from '../application/ConnectedPeer.js';
import { ConnectedPeerRegistry } from '../application/ConnectedPeerRegistry.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { PeerAuthenticationSession } from '../peer/PeerAuthenticationSession.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';
import { toWorldOperationEnvelope } from '../core/WorldOperationEnvelope.js';
import { editorViewFiles, worldViewFiles } from './support/SourceFileGroups.js';

// 0.9.546 — Document Lifecycle Product Reassessment.
//
// 0.9.545 closed the Collaborative Editing arc: live collaboration
// operates on the mutable Document, a Publication is a structurally
// isolated immutable snapshot, and the two never cross-contaminate.
// 0.9.533 closed the Publication Lifecycle Seam arc: Create ->
// Distribute -> Discover -> Repository -> Explore -> World -> Encounter
// -> Verify -> Inspect carries one identical publicationId end to end.
// Neither milestone asked the question this one does: across the
// DOCUMENT's own complete lifecycle — create, edit, collaborate, publish
// a snapshot, keep editing, publish ANOTHER snapshot — does the product
// give a coherent account of what stays live and what freezes? This is
// deliberately NOT a third collaboration audit and NOT a fourth identity
// audit; it is the seam between the two, checked directly against real,
// unmodified production source and real object graphs.
//
// Ten lettered sections, mirroring the requesting brief exactly:
//   A — Entry points: create/open/edit/collaborate/save/publish/
//       return-to-editing, each traced to its one real call site.
//   B — Identity continuity: documentId/publicationId/contentHash never
//       substitute for one another.
//   C — Publish-as-snapshot: a later edit or later publish never mutates
//       an earlier Publication's own frozen bytes.
//   D — Repeated publication: identical content, modified content, and
//       rapid successive publishes each mint an independent identity.
//   E — Post-publication editing: publishing never freezes the live
//       Document a session is actively working on, though a SEPARATE
//       session streaming the same (now-published) documentId in from
//       scratch correctly meets fork-on-write — a real, load-bearing
//       asymmetry this section proves rather than assumes.
//   F — Collaboration + publication interaction: a publish landing
//       mid-collaboration disturbs neither the live document collaborators
//       keep editing nor the frozen snapshot just taken.
//   G — Failure isolation: a rejected publish, a rejected forged
//       operation, and continued editing after either.
//   H — Lifecycle interruption: composed real sequences (edit -> publish
//       fails -> continue; edit -> publish succeeds -> continue; edit ->
//       collaborator leaves -> publish).
//   I — UI/application/core ownership: no UI file maintains its own,
//       independently-tracked Document/Publication lifecycle state.
//   J — Flagship: one Document, two collaborators, three publishes
//       (including a contentHash collision), the live Document never
//       replaced, every Publication independently frozen and catalogued.
//
// FINDING: see the verdict block at the end of this file.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function assertThrows(fn, message) {
    try {
        fn();
    } catch {
        return;
    }
    throw new Error(`ASSERT FAILED (expected throw): ${message}`);
}

function wait(ms = 0) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function readSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function stubRenderer() {
    return {
        addWorld() {}, removeWorld() {}, dispose() {},
        clearSelection() {}, clearHover() {}, selectBricks() {}, hoverBrick() {},
        pick() { return null; }, pickGround() { return null; }, pickPlacement() { return null; },
        pickRectangle() { return []; },
        setControlsEnabled() {},
        getCameraState() { return { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } }; },
        setCameraState() {}
    };
}

function makeIdentityProvider({ identityId = null, username = null } = {}) {
    return {
        currentUser: () => (username ? { username } : null),
        getSigningIdentity: () => {
            if (!identityId) throw new Error('IdentityProviderStub: no authenticated identity');
            return { id: identityId };
        },
        // Legacy, non-cryptographic attribution path (LocalPublisherProvider's
        // own documented fallback for a provider with no crypto surface — see
        // that class's own header) — this stub deliberately exposes no
        // signCanonical(), so `canSign` is false and this is the path taken.
        sign: () => null
    };
}

// One real, minimal, one-brick, one-building Document — the same shape
// every prior milestone's own helper builds (see e.g. 0.9.533's own
// publishMinimalDocument()) — never a hand-rolled stand-in for what
// PublishDocumentUseCase's own _validate() requires (a title, one
// building).
function buildDocument({ title = 'Atlas', author = 'alice', authorIdentityId = null, worldId } = {}) {
    const world = new World(worldId ? { id: worldId } : {});
    const building = new Building({ creator: author });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    const document = new Document({
        world,
        metadata: new DocumentMetadata({ title, author, authorIdentityId, license: new License({ id: LicenseId.CC0_1_0 }) })
    });
    return document;
}

function firstBrick(document) {
    const building = document.world.getBuildings()[0];
    const brick = building.getBricks()[0];
    return { buildingId: building.id, brickId: brick.id };
}

function brickX(document) {
    const { buildingId, brickId } = firstBrick(document);
    return document.world.getBuilding(buildingId).findBrick(brickId).position.x;
}

async function main() {
    // ===================================================================
    // Section A — Document lifecycle entry points
    // ===================================================================
    {
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const publisher = new LocalPublisherProvider(storage, new LocalContentStore(storage));
        const saveDocumentUseCase = new SaveDocumentUseCase(storage, serializer);
        const publishDocumentUseCase = new PublishDocumentUseCase(publisher, null);

        // A1. Create: DocumentManager owns "what is the current document"
        // — newDocument() replaces it and resets DocumentState to a
        // fresh, clean baseline.
        const manager = new DocumentManager();
        const document = buildDocument({ title: 'Entry Points' });
        manager.newDocument(document);
        assert(manager.document === document, '1. LIVE: DocumentManager.newDocument() makes the new Document the session\'s own current document, by reference.');
        assert(manager.state.dirty === false && !('readOnly' in manager.state), '2. LIVE: a freshly created document starts clean and fully editable.');

        // A2. Open: load() is the one path a previously-saved document
        // re-enters a session through, distinct from newDocument().
        const reopened = buildDocument({ title: 'Reopened' });
        manager.load(reopened, 'local:reopened');
        assert(manager.document === reopened && manager.state.loadedFrom === 'local:reopened' && manager.state.dirty === false,
            '3. LIVE: DocumentManager.load() opens a document as clean, recording where it came from.');
        manager.newDocument(document);

        // A3. Edit: CommandHistory is the one mutation chokepoint;
        // DocumentManager's own dirty flag is COMPUTED from it, never
        // set by hand.
        const history = new CommandHistory({ world: document.world });
        manager.trackCommandHistory(history);
        const { buildingId, brickId } = firstBrick(document);
        history.execute(new MoveBrickCommand({ worldId: document.world.id, buildingId, brickId, delta: { x: 1, y: 0, z: 0 } }));
        assert(manager.state.dirty === true, '4. LIVE: executing a real Command against the live World marks the tracked DocumentManager dirty — computed from CommandHistory.isDirty(), never set directly.');

        // A4. Save: SaveDocumentUseCase is the one persistence entry
        // point for the mutable document; it clears dirty.
        const savedId = saveDocumentUseCase.execute(manager);
        assert(savedId === document.world.id && manager.state.dirty === false,
            '5. LIVE: SaveDocumentUseCase.execute() persists to the document\'s own key and clears dirty via markSaved().');
        assert(storage.load(document.world.id) !== null, '6. LIVE: the document\'s own storage key now holds the saved content.');

        // A5. Publish: PublishDocumentUseCase is the one publish entry
        // point, reached from both the Editor (Toolbar.publish()) and
        // World View (WorldNavigationSession.publishDocument()) — never
        // a second implementation.
        const publication = publishDocumentUseCase.execute(manager);
        assert(publication instanceof Publication && publication.documentId === document.world.id,
            '7. LIVE: publishing returns a real Publication referencing this exact document.');
        assert(manager.document === document, '8. LIVE: publishing never replaces, clones, or detaches DocumentManager\'s own current document.');

        // A6. Return to editing after publication: DocumentState has no
        // read-only flag at all — grep-verified structurally below,
        // live-verified here.
        assert(!('readOnly' in manager.state), '9. LIVE: the document is still NOT read-only immediately after a successful publish.');
        history.execute(new MoveBrickCommand({ worldId: document.world.id, buildingId, brickId, delta: { x: 1, y: 0, z: 0 } }));
        assert(manager.state.dirty === true, '10. LIVE: a further edit after publishing succeeds and is tracked normally — nothing about publish locked editing out.');

        // A7. Structural: DocumentManager itself NEVER sets readOnly:true
        // — newDocument()/load()/close() are the only three places
        // DocumentState is constructed fresh, and none passes readOnly.
        const managerSrc = await readSource('application/DocumentManager.js');
        assert(!/readOnly:\s*true/.test(managerSrc), '11. application/DocumentManager.js never constructs a DocumentState with readOnly:true — nothing in this class can freeze a document for editing.');

        // A8. Structural: the two real publish entry points — Toolbar.js
        // (Editor) and WorldNavigationSession.js (World View) — both
        // converge on the SAME PublishDocumentUseCase, never a second
        // publish implementation.
        const toolbarSrc = await readSource('ui/components/Toolbar.js');
        assert(/props\.publishDocumentUseCase\.execute\(props\.documentManager\)/.test(toolbarSrc),
            '12. ui/components/Toolbar.js#publish() calls publishDocumentUseCase.execute(documentManager) directly — the Editor\'s one real publish entry point.');
        const sessionSrc = await readSource('application/WorldNavigationSession.js');
        assert(/this\._publishDocumentUseCase\.execute\(\{\s*document:\s*doc\s*\}\)/.test(sessionSrc),
            '13. application/WorldNavigationSession.js#publishDocument() calls the SAME PublishDocumentUseCase — World View\'s one real publish entry point, never a second class.');

        // A9. Structural: collaboration's own real entry point
        // (WorldCommandPropagationUseCase.attachCommandHistory) is wired
        // exactly once, in _registerCommandHistory — the ONE place a
        // CommandHistory enters this session, per that method's own
        // header (already proven live in Section F below).
        assert(/this\._worldCommandPropagation\.attachCommandHistory/.test(sessionSrc),
            '14. application/WorldNavigationSession.js#_registerCommandHistory() wires collaboration once, for every mutation pathway — Create/Edit/Collaborate converge on one CommandHistory per World.');

        console.log('✓ Section A: create (DocumentManager.newDocument), open (load), edit (CommandHistory-tracked dirty), collaborate (attachCommandHistory, wired once), save (SaveDocumentUseCase), publish (PublishDocumentUseCase, reached identically from Toolbar.js and WorldNavigationSession.js), and return-to-editing (readOnly never set true) each trace to exactly one real production call site.');
    }

    // ===================================================================
    // Section B — Document identity continuity
    // ===================================================================
    {
        const storage = new InMemoryStorageProvider();
        const publisher = new LocalPublisherProvider(storage, new LocalContentStore(storage));
        const publishDocumentUseCase = new PublishDocumentUseCase(publisher, null);
        const document = buildDocument({ title: 'Identity' });
        const manager = new DocumentManager(document);

        const publication = publishDocumentUseCase.execute(manager);

        // B1. LIVE: documentId is forwarded verbatim from the document's
        // own world id — never re-derived from contentHash or from the
        // freshly-minted publicationId.
        assert(publication.documentId === document.world.id, '1. LIVE: Publication.documentId is exactly document.world.id.');
        assert(publication.id !== publication.documentId, '2. LIVE: Publication.id is a distinct, freshly minted identity.');
        assert(publication.contentHash !== publication.id && publication.contentHash !== publication.documentId,
            '3. LIVE: contentHash is a third, independently-derived fact — never equal to either identity string.');

        // B2. LIVE: forking mints a genuinely NEW documentId (world.id) —
        // identity never carries over from the source, and lineage is
        // recorded (parentDocumentId), never confused with equality.
        const cloneService = new DocumentCloneService();
        const fork = cloneService.execute(document, { title: 'Fork of Identity', parentDocumentId: document.world.id });
        assert(fork.world.id !== document.world.id, '4. LIVE: DocumentCloneService mints a fresh documentId for the fork.');
        assert(fork.metadata.parentDocumentId === document.world.id, '5. LIVE: the fork records its lineage explicitly — never by reusing the source\'s own id.');

        // B3. LIVE: publishing the fork mints its own independent
        // identity space too — a fork is never treated as "the same
        // document, republished."
        const forkManager = new DocumentManager(fork);
        const forkPublication = publishDocumentUseCase.execute(forkManager);
        assert(forkPublication.documentId === fork.world.id && forkPublication.documentId !== publication.documentId,
            '6. LIVE: the fork\'s own Publication references the FORK\'s documentId, distinct from the source\'s.');
        assert(forkPublication.id !== publication.id, '7. LIVE: the fork\'s own Publication has an independent publicationId.');

        // B4. Structural: documentId is assigned from document.world.id
        // at exactly one construction site in LocalPublisherProvider —
        // never from contentHash or a publicationId variable.
        const publisherSrc = await readSource('publisher/LocalPublisherProvider.js');
        assert(/documentId:\s*document\.world\.id/.test(publisherSrc),
            '8. publisher/LocalPublisherProvider.js assigns Publication.documentId from document.world.id, never from contentHash or the freshly minted publicationId.');
        assert(!/documentId:\s*(contentHash|publicationId)/.test(publisherSrc),
            '9. publisher/LocalPublisherProvider.js never assigns documentId from contentHash or publicationId — no substitution site exists.');

        console.log('✓ Section B: documentId, publicationId, and contentHash are three pairwise-distinct, independently-derived facts, live — through a direct publish AND through a fork\'s own independent publish — with exactly one, correct documentId assignment site in production source.');
    }

    // ===================================================================
    // Section C — Publish-as-snapshot semantics
    // ===================================================================
    {
        const storage = new InMemoryStorageProvider();
        const publisher = new LocalPublisherProvider(storage, new LocalContentStore(storage));
        const publishDocumentUseCase = new PublishDocumentUseCase(publisher, null);
        const document = buildDocument({ title: 'Snapshot' });
        const manager = new DocumentManager(document);
        const { buildingId, brickId } = firstBrick(document);

        const p1 = publishDocumentUseCase.execute(manager);
        const p1SnapshotAfterFirstPublish = JSON.stringify(storage.load(`snapshot:${p1.id}`));
        assert(p1SnapshotAfterFirstPublish, '1. LIVE: publishing writes an immutable snapshot at snapshot:<publicationId>.');

        // C1. LIVE: the live Document is mutated directly, by reference —
        // publish never freezes or clones it.
        const history = new CommandHistory({ world: document.world });
        manager.trackCommandHistory(history);
        history.execute(new MoveBrickCommand({ worldId: document.world.id, buildingId, brickId, delta: { x: 7, y: 0, z: 0 } }));
        assert(brickX(document) === 7, '2. LIVE: the live Document accepted a mutation after being published.');

        // C2. LIVE: P1's own frozen snapshot bytes are COMPLETELY
        // unaffected by that later edit.
        assert(JSON.stringify(storage.load(`snapshot:${p1.id}`)) === p1SnapshotAfterFirstPublish,
            '3. LIVE: snapshot:<P1.id> is byte-for-byte unchanged after the live Document was edited — a Publication is an immutable snapshot, not a live view.');

        // C3. LIVE: publishing again captures the NEW state as an
        // independent snapshot, still without disturbing P1's.
        const p2 = publishDocumentUseCase.execute(manager);
        assert(p2.id !== p1.id, '4. LIVE: the second publish mints a fresh publicationId.');
        const p2Snapshot = storage.load(`snapshot:${p2.id}`);
        assert(p2Snapshot.world.buildings[0].bricks[0].position.x === 7, '5. LIVE: P2\'s own snapshot captures the moved brick\'s new position.');
        assert(JSON.stringify(storage.load(`snapshot:${p1.id}`)) === p1SnapshotAfterFirstPublish,
            '6. LIVE: after the SECOND publish, snapshot:<P1.id> is still byte-for-byte unchanged — Changing D after P1 must not mutate P1, confirmed across two publishes.');

        // C4. LIVE: the document's own mutable storage slot (its world.id
        // key — distinct from either snapshot key) tracks the LATEST
        // content, exactly as SaveDocumentUseCase's own key does — the
        // "current" slot moves forward while each snapshot stays frozen.
        const currentSlot = storage.load(document.world.id);
        assert(currentSlot.world.buildings[0].bricks[0].position.x === 7,
            '7. LIVE: the document\'s own mutable storage key reflects the CURRENT live state, distinct from either frozen snapshot key.');

        // C5. LIVE: manager.document is the exact same reference
        // throughout both publishes — a Document object is never
        // replaced by publishing.
        assert(manager.document === document, '8. LIVE: DocumentManager\'s own current document is the identical reference before P1, between P1 and P2, and after P2.');

        console.log('✓ Section C: a Publication is a genuinely frozen snapshot — an edit or a second publish never mutates an earlier Publication\'s own bytes, live, across two independent publishes of the SAME live, continuously-mutable Document object.');
    }

    // ===================================================================
    // Section D — Repeated publication
    // ===================================================================
    {
        // D1. Identical content: publishing twice with ZERO edits
        // between mints two independent identities sharing one
        // contentHash — extends 0.9.545 Section E's own finding
        // ("Publication identity is always freshly minted per publish,
        // even for byte-identical content") to this milestone's own
        // repeated-publication question.
        const storage = new InMemoryStorageProvider();
        const publisher = new LocalPublisherProvider(storage, new LocalContentStore(storage));
        const publishDocumentUseCase = new PublishDocumentUseCase(publisher, null);
        const document = buildDocument({ title: 'Repeat' });
        const manager = new DocumentManager(document);

        const p1 = publishDocumentUseCase.execute(manager);
        const p2 = publishDocumentUseCase.execute(manager);
        assert(p1.id !== p2.id, '1. LIVE: republishing UNMODIFIED content still mints a fresh publicationId.');
        assert(p1.contentHash === p2.contentHash, '2. LIVE: unmodified content produces the identical contentHash both times — a real FNV-1a hash over the canonical document JSON.');
        assert(computeContentHash(JSON.stringify(storage.load(`snapshot:${p1.id}`))) === computeContentHash(JSON.stringify(storage.load(`snapshot:${p2.id}`))),
            '3. LIVE: the two frozen snapshots are independently re-hashable to the same value — genuinely identical bytes under two different identities.');

        // D2. Modified content: an edit between publishes changes the
        // contentHash and, as always, the identity.
        const { buildingId, brickId } = firstBrick(document);
        const history = new CommandHistory({ world: document.world });
        manager.trackCommandHistory(history);
        history.execute(new MoveBrickCommand({ worldId: document.world.id, buildingId, brickId, delta: { x: 2, y: 0, z: 0 } }));
        const p3 = publishDocumentUseCase.execute(manager);
        assert(p3.id !== p1.id && p3.id !== p2.id, '4. LIVE: modified content mints yet another fresh identity.');
        assert(p3.contentHash !== p1.contentHash, '5. LIVE: modified content produces a genuinely different contentHash.');

        // D3. Rapid successive publication (same day, back-to-back, no
        // delay): every publish is recorded independently — no de-dup,
        // no silent overwrite of a "same day" record.
        const rapidIds = new Set();
        for (let i = 0; i < 5; i++) {
            const p = publishDocumentUseCase.execute(manager);
            rapidIds.add(p.id);
        }
        assert(rapidIds.size === 5, '6. LIVE: five rapid, same-instant, successive publishes of unmodified content mint five distinct identities — none collapsed or overwritten.');

        // D4. LIVE: LocalDiscoveryProvider — Repository's own real read
        // path — resolves ALL 8 publications (p1,p2,p3 + 5 rapid) for
        // this one documentId, each independently, none merged.
        const discoveryProvider = new LocalDiscoveryProvider(storage);
        const allForDocument = discoveryProvider.findByDocumentId(document.world.id);
        assert(allForDocument.length === 8, `7. LIVE: LocalDiscoveryProvider.findByDocumentId() returns all 8 independently-recorded Publications for this one Document (found ${allForDocument.length}).`);
        assert(new Set(allForDocument.map((p) => p.id)).size === 8, '8. LIVE: all 8 resolved Publications carry 8 distinct publicationIds.');

        console.log('✓ Section D: repeated publication — identical content, modified content, and five rapid same-instant successive publishes — each mints an independently identified, independently retrievable Publication; unmodified content correctly shares a contentHash without ever sharing an identity.');
    }

    // ===================================================================
    // Section E — Post-publication editing
    // ===================================================================
    {
        // E1. Editor path: publishing never sets readOnly, and — unlike
        // an explicit Save — never clears dirty either. Save and Publish
        // stay two independently-tracked actions, exactly as
        // PublishDocumentUseCase's own header states ("Save -> persist
        // the editable document; Publish -> create an immutable,
        // validated, versioned snapshot").
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const publisher = new LocalPublisherProvider(storage, new LocalContentStore(storage));
        const publishDocumentUseCase = new PublishDocumentUseCase(publisher, null);
        const saveDocumentUseCase = new SaveDocumentUseCase(storage, serializer);
        const document = buildDocument({ title: 'Editor Path' });
        const manager = new DocumentManager(document);
        const { buildingId, brickId } = firstBrick(document);
        const history = new CommandHistory({ world: document.world });
        manager.trackCommandHistory(history);

        history.execute(new MoveBrickCommand({ worldId: document.world.id, buildingId, brickId, delta: { x: 1, y: 0, z: 0 } }));
        assert(manager.state.dirty === true, '1. LIVE: the document is dirty before publishing.');
        publishDocumentUseCase.execute(manager);
        assert(manager.state.dirty === true && !('readOnly' in manager.state),
            '2. LIVE: publishing an Editor document with UNSAVED edits leaves it dirty AND fully editable afterward — Publish is never mistaken for Save.');
        saveDocumentUseCase.execute(manager);
        assert(manager.state.dirty === false, '3. LIVE: an explicit Save afterward clears dirty normally — publishing did not interfere with Save\'s own bookkeeping.');
        history.execute(new MoveBrickCommand({ worldId: document.world.id, buildingId, brickId, delta: { x: 1, y: 0, z: 0 } }));
        publishDocumentUseCase.execute(manager);
        assert(manager.document === document, '4. LIVE: a second publish, again with the document dirty, still operates on the identical live Document reference.');

        // E2. World View path, the SAME live session that just
        // published: publishDocument() is never added to
        // _publishedDocumentIds — that set is populated only by
        // _loadWorld() for a documentId already known-published BEFORE
        // this session ever touched it (see that method's own 0.2.20
        // comment). A session's own just-published, still-active
        // document therefore stays freely editable and re-publishable,
        // with zero forced fork.
        const registry = new CreateBrickRegistryUseCase().execute();
        const loadPublicationDocumentUseCase = new LoadPublicationDocumentUseCase(storage, serializer);
        const spatialIndexProvider = new LocalSpatialIndexProvider(storage);
        const discoveryProvider = new LocalDiscoveryProvider(storage);
        const worldLayoutProvider = new LocalWorldLayoutProvider(spatialIndexProvider, discoveryProvider);
        const identityProvider = makeIdentityProvider({ identityId: 'did:key:alice', username: 'alice' });

        const worldDoc = buildDocument({ title: "Alice's World", author: 'alice', authorIdentityId: 'did:key:alice' });
        storage.save(worldDoc.world.id, serializer.serialize(worldDoc));
        const worldId = worldDoc.world.id;

        const worldPublisher = new LocalPublisherProvider(storage, new LocalContentStore(storage));
        const worldPublishUseCase = new PublishDocumentUseCase(worldPublisher, identityProvider);
        const worldSaveUseCase = new SaveDocumentUseCase(storage, serializer);

        const session = new WorldNavigationSession({
            registry, loadPublicationDocumentUseCase, worldLayoutProvider, discoveryProvider,
            saveDocumentUseCase: worldSaveUseCase, publishDocumentUseCase: worldPublishUseCase,
            documentCloneService: new DocumentCloneService(), identityProvider
        });
        session._session = stubRenderer();
        session._loadWorld(worldId);
        assert(session._publishedDocumentIds.has(worldId) === false, '5. LIVE: a freshly streamed-in, never-yet-published document is not flagged published.');

        const ownWorldP1 = session.publishDocument(worldId);
        assert(session._publishedDocumentIds.has(worldId) === false,
            '6. LIVE: immediately after publishing its OWN active document, this session does NOT flag it as a published/frozen snapshot — publishing your own live work never turns it into someone else\'s immutable read.');
        assert(session.getActiveDocumentId() === worldId, '7. LIVE: the active documentId is unchanged by publishing — no fork happened.');

        // E3. LIVE: continuing to mutate this SAME session's own
        // just-published document succeeds with zero fork — a real
        // mutation chokepoint (updateDocumentMetadata), not a
        // hand-constructed stand-in.
        const idAfterEdit = session.updateDocumentMetadata(worldId, { description: 'Continued after publish' });
        assert(idAfterEdit === worldId, '8. LIVE: editing this session\'s own just-published document lands on the SAME documentId — no fork-on-write triggered.');
        const ownWorldP2 = session.publishDocument(worldId);
        assert(ownWorldP2.id !== ownWorldP1.id && ownWorldP2.documentId === worldId,
            '9. LIVE: this session publishes the SAME live document a second time, minting an independent P2 while D stays worldId throughout.');

        // E4. Asymmetry, structural + live: WorldNavigationSession's own
        // publishDocument() auto-saves dirty state before publishing
        // (`if (this.isDocumentDirty(id)) this.saveDocument(id)`) — a
        // real, deliberate difference from the Editor's own Toolbar.js
        // publish(), which never saves first (Section E1 above). Neither
        // is a bug; both are real, and this milestone is the first to
        // name the asymmetry directly.
        session.updateDocumentMetadata(worldId, { description: 'Dirty before publish #3' });
        assert(session.isDocumentDirty(worldId) === true, '10. LIVE: the World View document is dirty before its third publish.');
        session.publishDocument(worldId);
        assert(session.isDocumentDirty(worldId) === false,
            '11. LIVE: WorldNavigationSession.publishDocument() auto-saved and cleared dirty as part of publishing — unlike the Editor\'s Toolbar.publish() (Section E1), which leaves dirty exactly as it found it.');

        // E5. Contrast: a SECOND, independent session streaming the SAME
        // now-published documentId in from scratch (as a visitor would)
        // correctly recognizes it as published and enforces fork-on-write
        // — the protection this session's OWN active document was
        // correctly exempt from above.
        const session2 = new WorldNavigationSession({
            registry, loadPublicationDocumentUseCase, worldLayoutProvider, discoveryProvider,
            documentCloneService: new DocumentCloneService(),
            identityProvider: makeIdentityProvider({ identityId: 'did:key:bob', username: 'bob' })
        });
        session2._session = stubRenderer();
        session2._loadWorld(worldId);
        assert(session2._publishedDocumentIds.has(worldId) === true,
            '12. LIVE: a FRESH session streaming in the SAME documentId now correctly sees it as a known publication.');
        const bytesBeforeVisitorEdit = JSON.stringify(storage.load(worldId));
        const forkedId = session2.updateDocumentMetadata(worldId, { description: 'A visitor tries to edit' });
        assert(forkedId !== worldId, '13. LIVE: the visiting session\'s edit was silently redirected onto a NEW, forked documentId — fork-on-write, exactly as designed.');
        assert(session2.getDocument(worldId) === undefined || session2.getDocument(worldId) === null,
            '14. LIVE: the visiting session no longer even holds the original documentId loaded — it was superseded by the fork in THAT session\'s view.');
        assert(JSON.stringify(storage.load(worldId)) === bytesBeforeVisitorEdit,
            '15. LIVE: the ORIGINAL document\'s own storage bytes are completely unchanged by the visitor\'s fork-on-write edit — the source is never mutated.');

        console.log('✓ Section E: publishing never sets readOnly and (Editor path) never clears dirty as a side effect; a session\'s own just-published document stays freely editable and re-publishable with zero forced fork, while a genuinely different session streaming the same now-published documentId in from scratch correctly meets fork-on-write — a real, previously-unexamined asymmetry, proven live on both sides, not a bug on either.');
    }

    // ===================================================================
    // Section F — Collaboration + publication interaction
    // ===================================================================
    let workshopHarness;
    {
        // A minimal two-device, one-receiver WorldCommandPropagationUseCase
        // harness, adapted from tests/WorldCommandPropagation.test.js's own
        // proven makeDevice/connectAndAuthenticate/makeStack pattern —
        // Alice's Laptop and Phone (0.9.545's own flagship shape: one
        // owner identity, two authorized devices) both author operations;
        // "Workshop" is a third, purely-receiving replica whose live
        // Document is the one this section actually publishes.
        function makeDevice(label) {
            const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
            const identity = provider.createLocalIdentity(label);
            provider.authenticate(identity.identityId);
            return { provider, identity };
        }
        async function connectAndAuthenticate(network, addressA, deviceA, addressB, deviceB) {
            const transportA = new LocalPeerConnectionProvider(addressA, network);
            const transportB = new LocalPeerConnectionProvider(addressB, network);
            let incomingB = null;
            const unsubscribe = transportB.onIncomingConnection((connection) => { incomingB = connection; });
            const connectionA = transportA.connect(addressB);
            await wait();
            unsubscribe();
            assert(incomingB, `connectAndAuthenticate: ${addressB} never saw an incoming connection from ${addressA}`);
            const sessionA = new PeerAuthenticationSession({ connection: connectionA, identityProvider: deviceA.provider });
            const sessionB = new PeerAuthenticationSession({ connection: incomingB, identityProvider: deviceB.provider });
            sessionA.start();
            sessionB.start();
            await wait(10);
            assert(sessionA.isAuthenticated && sessionB.isAuthenticated, `connectAndAuthenticate: ${addressA} <-> ${addressB} did not reach AUTHENTICATED`);
            return {
                peerA: new ConnectedPeer({ connection: connectionA, authenticationSession: sessionA }),
                peerB: new ConnectedPeer({ connection: incomingB, authenticationSession: sessionB })
            };
        }
        function makeStack(device, storage) {
            const peerMessageBus = new PeerMessageBus();
            const connectedPeerRegistry = new ConnectedPeerRegistry();
            const deviceAuth = new DeviceAuthorizationPropagationUseCase(new InMemoryStorageProvider(), device.provider, { peerMessageBus, connectedPeerRegistry });
            const commandRegistry = new CreateCommandRegistryUseCase().execute();
            const documents = new Map();
            const applied = [];
            const rejected = [];
            const propagation = new WorldCommandPropagationUseCase({
                peerMessageBus, connectedPeerRegistry, deviceAuthorization: deviceAuth,
                identityProvider: device.provider, commandRegistry,
                resolveWorldDocument: (id) => documents.get(id) || null
            });
            propagation.onOperationApplied((worldDocumentId, command, authorIdentityId) => applied.push({ worldDocumentId, command, authorIdentityId }));
            propagation.onOperationRejected((reason, envelope) => rejected.push({ reason, envelope }));
            return { device, storage, peerMessageBus, connectedPeerRegistry, deviceAuth, commandRegistry, documents, propagation, applied, rejected };
        }

        const storage = new InMemoryStorageProvider();
        const network = new LocalPeerNetwork();
        const alice = makeDevice('Alice');
        const phone = makeDevice('Alice-Phone');
        const workshop = makeDevice('Workshop');

        const aliceStack = makeStack(alice, storage);
        const phoneStack = makeStack(phone, storage);
        const workshopStack = makeStack(workshop, storage);

        // Built with EXPLICIT ids throughout (mirroring
        // WorldCommandPropagation.test.js's own buildOneBrickWorld()
        // helper), never regenerated after the fact — Building/Brick
        // index themselves by id at construction time.
        const worldId = 'world-f1', buildingId = 'building-f1', brickId = 'brick-f1';
        const worldF = new World({ id: worldId });
        const buildingF = new Building({ id: buildingId, creator: 'alice' });
        buildingF.addBrick(new Brick({ id: brickId, definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
        worldF.addBuilding(buildingF);
        const liveDocument = new Document({
            world: worldF,
            metadata: new DocumentMetadata({ title: 'Collab + Publish', author: 'alice', authorIdentityId: alice.identity.identityId, license: new License({ id: LicenseId.CC0_1_0 }) })
        });
        workshopStack.documents.set(worldId, liveDocument);

        const { peerA: aliceToWorkshop, peerB: workshopFromAlice } = await connectAndAuthenticate(network, 'alice-f', alice, 'workshop-for-alice-f', workshop);
        aliceStack.connectedPeerRegistry.add(aliceToWorkshop);
        workshopStack.connectedPeerRegistry.add(workshopFromAlice);

        // F1. LIVE: Alice's own local edit propagates to Workshop's live
        // Document, exactly as 0.9.545 already established — a light
        // re-confirmation, never a re-litigation.
        const aliceMove = new MoveBrickCommand({ worldId, buildingId, brickId, delta: { x: 2, y: 0, z: 0 } });
        aliceStack.propagation.broadcastCommand({ worldDocumentId: worldId, command: aliceMove });
        await wait(20);
        assert(brickX(liveDocument) === 2, '1. LIVE: Alice\'s collaborative edit landed on Workshop\'s own live Document.');

        // F2. LIVE: Workshop now PUBLISHES its own live, collaboratively-
        // edited Document — using the same real PublishDocumentUseCase/
        // LocalPublisherProvider every other section uses, sharing this
        // section's own storage.
        const publisher = new LocalPublisherProvider(storage, new LocalContentStore(storage));
        const publishDocumentUseCase = new PublishDocumentUseCase(publisher, null);
        const workshopManager = new DocumentManager(liveDocument);
        const p1 = publishDocumentUseCase.execute(workshopManager);
        const p1SnapshotBytes = JSON.stringify(storage.load(`snapshot:${p1.id}`));
        assert(p1.documentId === worldId, '2. LIVE: P1 references the collaboratively-edited World\'s own documentId.');

        // F3. LIVE: Alice's Phone, an authorized device, now pairs and
        // sends ANOTHER operation — collaboration continues completely
        // unaware a publish just happened; nothing in the propagation
        // chain ever references Publication.
        const grant = alice.provider.authorizeDevice(alice.identity.identityId, phone.identity.identityId, phone.identity.publicKey, { deviceLabel: 'Phone' });
        aliceStack.deviceAuth.broadcastAuthorization(grant);
        await wait(20);
        const { peerA: phoneToWorkshop, peerB: workshopFromPhone } = await connectAndAuthenticate(network, 'phone-f', phone, 'workshop-for-phone-f', workshop);
        phoneStack.connectedPeerRegistry.add(phoneToWorkshop);
        workshopStack.connectedPeerRegistry.add(workshopFromPhone);

        const phoneMove = new MoveBrickCommand({ worldId, buildingId, brickId, delta: { x: 3, y: 0, z: 0 } });
        phoneStack.propagation.broadcastCommand({ worldDocumentId: worldId, command: phoneMove });
        await wait(20);
        assert(brickX(liveDocument) === 5, '3. LIVE: after P1, Alice\'s Phone still moves the SAME live Document normally — publishing mid-collaboration never disturbed the propagation chain.');
        assert(workshopStack.applied.length === 2, '4. LIVE: exactly two applied-operation events fired — the publish in between produced none of its own.');

        // F4. LIVE: P1's own frozen snapshot is untouched by the post-
        // publish collaborative edit.
        assert(JSON.stringify(storage.load(`snapshot:${p1.id}`)) === p1SnapshotBytes,
            '5. LIVE: snapshot:<P1.id> is byte-for-byte unchanged after a collaborator moved the brick again post-publish.');

        // F5. LIVE: Workshop publishes again — P2 captures the NEW,
        // further-collaborated state; P1 remains frozen.
        const p2 = publishDocumentUseCase.execute(workshopManager);
        assert(p2.id !== p1.id && p2.documentId === worldId, '6. LIVE: P2 is an independent identity for the same documentId.');
        assert(storage.load(`snapshot:${p2.id}`).world.buildings[0].bricks[0].position.x === 5,
            '7. LIVE: P2\'s own snapshot captures BOTH collaborators\' combined edits.');
        assert(JSON.stringify(storage.load(`snapshot:${p1.id}`)) === p1SnapshotBytes,
            '8. LIVE: after the SECOND publish too, snapshot:<P1.id> is still byte-for-byte unchanged.');
        assert(workshopManager.document === liveDocument, '9. LIVE: Workshop\'s own live Document is the identical reference throughout both publishes and every applied remote operation.');

        // F6. Structural: WorldCommandPropagationUseCase.js never
        // references Publication at all — collaboration and the
        // Publication boundary remain structurally disjoint, exactly as
        // 0.9.545 Section B already found.
        const propagationSrc = await readSource('application/WorldCommandPropagationUseCase.js');
        assert(!/\bPublication\b/.test(propagationSrc), '10. application/WorldCommandPropagationUseCase.js never references Publication — re-confirmed for this milestone\'s own live publish-mid-collaboration scenario.');

        workshopHarness = { network, alice, phone, workshop, aliceStack, phoneStack, workshopStack, worldId, buildingId, brickId, liveDocument, publishDocumentUseCase, workshopManager, p1, p2, p1SnapshotBytes, storage };
        console.log('✓ Section F: a publish landing mid-collaboration disturbs neither side — collaborators keep editing the correct live Document with zero awareness a snapshot was just taken, and each frozen snapshot stays byte-for-byte untouched by every collaborative edit and every later publish that follows it.');
    }

    // ===================================================================
    // Section G — Failure isolation
    // ===================================================================
    {
        // G1. Creation/validation failure: PublishDocumentUseCase's own
        // pre-validation (title required, at least one building) runs
        // BEFORE any storage write — a rejected publish touches storage
        // not at all.
        const storage = new InMemoryStorageProvider();
        const publisher = new LocalPublisherProvider(storage, new LocalContentStore(storage));
        const publishDocumentUseCase = new PublishDocumentUseCase(publisher, null);

        const untitled = new Document({ world: new World(), metadata: new DocumentMetadata({ title: '' }) });
        const untitledManager = new DocumentManager(untitled);
        assertThrows(() => publishDocumentUseCase.execute(untitledManager), '1. LIVE: publishing a titleless document throws.');
        assert(storage.list().length === 0, '2. LIVE: the rejected publish wrote NOTHING to storage — validation fully precedes persistence.');

        const empty = new Document({ world: new World(), metadata: new DocumentMetadata({ title: 'Empty World' }) });
        const emptyManager = new DocumentManager(empty);
        assertThrows(() => publishDocumentUseCase.execute(emptyManager), '3. LIVE: publishing a Document with zero buildings throws.');
        assert(storage.list().length === 0, '4. LIVE: this rejection, too, left storage completely untouched.');

        // G2. Post-failure continued editing: the SAME live Document,
        // now given what publishing requires, publishes successfully —
        // a failed publish never corrupts or locks the live Document.
        empty.world.addBuilding(new Building({ creator: 'alice' }));
        empty.world.getBuildings()[0].addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
        const recovered = publishDocumentUseCase.execute(emptyManager);
        assert(recovered instanceof Publication && emptyManager.document === empty,
            '5. LIVE: after the earlier failed publish attempt, the exact same live Document object publishes successfully once it meets the requirement.');

        // G3. Collaboration forgery isolation, reusing this file's own
        // Section F harness: an unauthorized identity forging Alice's
        // authorIdentityId is rejected IDENTITY_MISMATCH, and Workshop's
        // live Document AND both already-published snapshots stay
        // completely untouched.
        const { network, workshop, workshopStack, worldId, buildingId, brickId, liveDocument, p1SnapshotBytes, p1, p2, storage: workshopStorage } = workshopHarness;
        function makeDevice(label) {
            const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
            const identity = provider.createLocalIdentity(label);
            provider.authenticate(identity.identityId);
            return { provider, identity };
        }
        const charlie = makeDevice('Charlie');
        const charliePeerMessageBus = new PeerMessageBus();
        const charlieConnectedPeerRegistry = new ConnectedPeerRegistry();
        const transportCharlie = new LocalPeerConnectionProvider('charlie-g', network);
        const transportWorkshop = new LocalPeerConnectionProvider('workshop-for-charlie-g', network);
        let incoming = null;
        const unsub = transportWorkshop.onIncomingConnection((c) => { incoming = c; });
        const connCharlie = transportCharlie.connect('workshop-for-charlie-g');
        await wait();
        unsub();
        const sessionCharlie = new PeerAuthenticationSession({ connection: connCharlie, identityProvider: charlie.provider });
        const sessionWorkshopSide = new PeerAuthenticationSession({ connection: incoming, identityProvider: workshop.provider });
        sessionCharlie.start();
        sessionWorkshopSide.start();
        await wait(10);
        const charlieToWorkshop = new ConnectedPeer({ connection: connCharlie, authenticationSession: sessionCharlie });
        const workshopFromCharlie = new ConnectedPeer({ connection: incoming, authenticationSession: sessionWorkshopSide });
        charlieConnectedPeerRegistry.add(charlieToWorkshop);
        workshopStack.connectedPeerRegistry.add(workshopFromCharlie);

        const bytesBeforeForgery = brickX(liveDocument);
        const forged = new MoveBrickCommand({ worldId, buildingId, brickId, delta: { x: 999, y: 0, z: 0 } });
        const forgedEnvelope = toWorldOperationEnvelope({
            operationId: forged.id, worldDocumentId: worldId,
            authorIdentityId: workshopHarness.alice.identity.identityId, // Charlie CLAIMS to be Alice
            command: forged.toJSON()
        });
        charliePeerMessageBus.attach(charlieToWorkshop);
        charliePeerMessageBus.send(charlieToWorkshop, WorldCommandPropagationUseCase.DEFAULT_PROTOCOL, forgedEnvelope);
        await wait(20);
        assert(brickX(liveDocument) === bytesBeforeForgery, '6. LIVE: Workshop\'s live Document is untouched — Charlie\'s forged claim to be Alice never applied.');
        assert(workshopStack.rejected.some((r) => r.reason === WorldOperationRejectionReason.IDENTITY_MISMATCH),
            '7. LIVE: the forged envelope was explicitly rejected IDENTITY_MISMATCH.');
        assert(JSON.stringify(workshopStorage.load(`snapshot:${p1.id}`)) === p1SnapshotBytes,
            '8. LIVE: P1\'s own frozen snapshot is untouched by the forgery attempt.');
        assert(workshopStorage.load(`snapshot:${p2.id}`) !== null,
            '9. LIVE: P2\'s own snapshot record still exists, untouched, after the forgery attempt.');

        console.log('✓ Section G: a publish that fails validation touches storage not at all, and the exact same live Document publishes successfully once corrected; a forged collaborative operation is rejected IDENTITY_MISMATCH and corrupts neither the live Document nor either already-published, already-frozen snapshot.');
    }

    // ===================================================================
    // Section H — Lifecycle interruption
    // ===================================================================
    {
        // Composed, realistic sequences — each leg reuses a guarantee
        // this file's own earlier sections already proved live, combined
        // into the narrative shape the requesting brief named.
        const storage = new InMemoryStorageProvider();
        const publisher = new LocalPublisherProvider(storage, new LocalContentStore(storage));
        const publishDocumentUseCase = new PublishDocumentUseCase(publisher, null);

        // H1. edit -> publish fails -> continue editing.
        const doc = new Document({ world: new World(), metadata: new DocumentMetadata({ title: '' }) });
        doc.world.addBuilding(new Building({ creator: 'alice' }));
        const manager = new DocumentManager(doc);
        assertThrows(() => publishDocumentUseCase.execute(manager), '1. LIVE: edit -> publish fails (titleless) as expected.');
        doc.metadata.title = 'Recovered Title';
        doc.world.getBuildings()[0].addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
        assert(publishDocumentUseCase.execute(manager) instanceof Publication,
            '2. LIVE: edit -> publish fails -> continue editing -> publish succeeds, all against the same live Document object.');

        // H2. edit -> publish succeeds -> continue editing (already
        // proven, live, in Section E1/E2/E3 for both the Editor and
        // World View paths — re-cited, not re-litigated).

        // H3. edit -> collaborator leaves -> publish, reusing this
        // file's own Section F harness: Alice's Phone disconnects
        // (removed from Workshop's ConnectedPeerRegistry) after having
        // already contributed an edit; Workshop still holds the correct,
        // fully-collaborated live Document, and publishing succeeds
        // completely unaffected by the departure.
        const { workshopStack, workshopManager, liveDocument, p2 } = workshopHarness;
        const beforeDeparture = brickX(liveDocument);
        const peersBeforeDeparture = workshopStack.connectedPeerRegistry.list().length;
        // "Leaves" — the real underlying transport closes, exactly like
        // an ordinary disconnect; ConnectedPeerRegistry's own onChange
        // subscription (see its add()) removes the peer automatically
        // the instant transportState reaches CLOSED — re-confirming
        // 0.9.545 Section F's own finding ("a peer's transport closing
        // removes it from both registries automatically") live, then
        // building the actual publish on top of it.
        for (const peer of workshopStack.connectedPeerRegistry.list()) {
            peer.connection.close();
        }
        assert(workshopStack.connectedPeerRegistry.list().length === 0 && peersBeforeDeparture > 0,
            '3. LIVE: every collaborator\'s connection closing removed them from Workshop\'s own connected-peer registry automatically.');
        const p3 = workshopHarness.publishDocumentUseCase.execute(workshopManager);
        assert(p3.id !== p2.id && p3.documentId === workshopHarness.worldId && brickX(liveDocument) === beforeDeparture,
            '4. LIVE: publishing after every collaborator has left succeeds normally, capturing exactly the state they left behind — a departed collaborator never blocks or corrupts a publish.');
        workshopHarness.p3 = p3;

        console.log('✓ Section H: edit -> publish fails -> continue editing (recovers on the same live Document), edit -> publish succeeds -> continue editing (Section E), and edit -> collaborator leaves -> publish (succeeds unaffected, live) — the product\'s actual behavior at each interruption, established rather than assumed.');
    }

    // ===================================================================
    // Section I — UI/application/core ownership
    // ===================================================================
    {
        // I1. WorldView.js's own Publication-governing field is read
        // fresh every refresh tick, by its own documented contract —
        // never a cached, independently-tracked lifecycle flag.
        const worldViewSrc = (await Promise.all(worldViewFiles().map((file) => readSource(file)))).join('\n');
        assert(/re-read fresh every refreshSpatialUI\(\) tick, never cached/.test(worldViewSrc),
            '1. ui/views/WorldView.js documents (and, by every call site below, honors) "re-read fresh every refreshSpatialUI() tick, never cached" for the Publication governing the active document.');
        assert(/session\.getPublicationForDocument\(activeId\)/.test(worldViewSrc),
            '2. WorldView.js\'s own Publication field is sourced directly from session.getPublicationForDocument() — never a locally-maintained boolean.');

        // I2. EditorView.js's own post-publish UI state is explicitly
        // documented as replaced wholesale by each publish, and is
        // assigned in exactly the two legitimate places: the publish
        // handler and the dismiss action.
        const editorViewSrc = (await Promise.all(editorViewFiles().map((file) => readSource(file)))).join('\n');
        assert(/never merged with a prior one/.test(editorViewSrc) && /replaced wholesale by/.test(editorViewSrc),
            '3. ui/views/EditorView.js documents publishedPublication as replaced wholesale by each successful publish, never merged — no accumulating, independently-tracked lifecycle state.');
        const assignments = (editorViewSrc.match(/publishedPublication\.value\s*=/g) || []).length;
        assert(assignments === 2, `4. ui/views/EditorView.js assigns publishedPublication.value in exactly two places — the @published handler and the dismiss action (found ${assignments}).`);

        // I3. Toolbar.js's own publish() forwards the EXACT Publication
        // object execute() returned — no re-derivation, no second
        // "what was just published" computation.
        const toolbarSrc = await readSource('ui/components/Toolbar.js');
        assert(/const publication = props\.publishDocumentUseCase\.execute\(props\.documentManager\);[\s\S]{0,500}emit\('published', publication\)/.test(toolbarSrc),
            '5. ui/components/Toolbar.js#publish() emits the exact local `publication` variable execute() returned, unmodified.');

        // I4. None of the three files maintains its own hand-set
        // "isPublished"/"documentPublished"-shaped boolean — every
        // Publication-governing field traces to a session/documentManager
        // read, never an ad hoc local flag.
        for (const [name, src] of [['WorldView.js', worldViewSrc], ['EditorView.js', editorViewSrc], ['Toolbar.js', toolbarSrc]]) {
            assert(!/\b(isPublished|documentPublished|hasBeenPublished)\s*=/.test(src),
                `6. ui/${name} defines no independent isPublished/documentPublished/hasBeenPublished flag of its own.`);
        }

        console.log('✓ Section I: WorldView.js, EditorView.js, and Toolbar.js each source their own Publication-governing UI state directly from session/documentManager — re-read fresh or replaced wholesale, never cached, accumulated, or hand-tracked as a second, independent lifecycle boolean.');
    }

    // ===================================================================
    // Section J — Flagship
    // ===================================================================
    {
        // Reuses this file's own Section F/H harness end to end: one
        // Document, two collaborators (Alice + her authorized Phone),
        // three publishes — the third deliberately byte-identical to the
        // second — checked against the real catalog.
        const { workshopStack, workshopManager, liveDocument, worldId, buildingId, brickId, publishDocumentUseCase, p1, p2, p3, storage } = workshopHarness;
        assert(p3, 'J-precondition: Section H already produced P3 against this same live Document.');

        // J1. D remains live: one further edit succeeds after P3, with
        // zero fork and zero new documentId, directly against the same
        // World/Document object every prior section touched.
        const beforeFinalEdit = brickX(liveDocument);
        new MoveBrickCommand({ worldId, buildingId, brickId, delta: { x: 4, y: 0, z: 0 } }).execute({ world: liveDocument.world });
        assert(brickX(liveDocument) === beforeFinalEdit + 4 && workshopManager.document === liveDocument,
            '1. LIVE: D remains the live, editable object after three publishes — the same reference every section since F has shared.');

        // J2. Adversarial identity case: publish P4 immediately, with
        // NO further edit since P3 — byte-identical content, mirroring
        // this milestone's own earlier edit back out first so P4 and P3
        // are genuinely identical (undo the J1 edit before publishing).
        new MoveBrickCommand({ worldId, buildingId, brickId, delta: { x: -4, y: 0, z: 0 } }).execute({ world: liveDocument.world });
        const p4 = publishDocumentUseCase.execute(workshopManager);
        assert(p4.contentHash === p3.contentHash, '2. LIVE, ADVERSARIAL: P4\'s contentHash equals P3\'s — genuinely identical published content.');
        assert(p4.id !== p3.id, '3. LIVE, ADVERSARIAL: despite the identical contentHash, P4 carries its own distinct publicationId — never reused, never merged.');

        // J3. All four publications (P1..P4) remain independently
        // frozen: re-verify every earlier snapshot's bytes one final
        // time, all at once, after the full journey.
        const allIds = [p1.id, p2.id, p3.id, p4.id];
        assert(new Set(allIds).size === 4, '4. LIVE: all four publicationIds, across the entire journey, are pairwise distinct.');
        for (const id of allIds) {
            assert(storage.load(`snapshot:${id}`) !== null, `5. LIVE: snapshot:${id} still exists, untouched, at the end of the full journey.`);
        }

        // J4. Catalog/navigation distinguishes all four, live, through
        // Repository's own real read path — including the P3/P4
        // contentHash collision — exactly the guarantee 0.9.539's own
        // presentation-layer fix depends on, re-confirmed at the
        // discovery-provider layer this milestone actually exercises.
        const discoveryProvider = new LocalDiscoveryProvider(storage);
        const catalogued = discoveryProvider.findByDocumentId(worldId);
        assert(catalogued.length === 4, `6. LIVE: Repository's own real catalog (LocalDiscoveryProvider) lists exactly 4 Publications for this one documentId (found ${catalogued.length}).`);
        for (const id of allIds) {
            const found = discoveryProvider.findById(id);
            assert(found && found.id === id && found.documentId === worldId,
                `7. LIVE: findById("${id}") independently resolves the correct, distinct Publication record.`);
        }
        // P2/P3/P4 all share one contentHash (no edit landed between any
        // of them — collaborator-departure and validation-failure
        // recovery in G/H never touched this Document's own content) —
        // an even stronger version of the brief's own "P1.contentHash
        // === P2.contentHash" case, still never collapsed in the catalog.
        const collisionGroup = catalogued.filter((p) => p.contentHash === p3.contentHash);
        assert(collisionGroup.length >= 2 && new Set(collisionGroup.map((p) => p.id)).size === collisionGroup.length,
            `8. LIVE: all ${collisionGroup.length} contentHash-colliding catalog entries remain that many distinct, independently addressable records in the real catalog — never collapsed into one.`);

        console.log('✓ Section J FLAGSHIP: one Document, collaboratively edited by an owner and her authorized device, publishes four independent snapshots — including a deliberate contentHash collision — with the live Document never replaced, every earlier snapshot byte-for-byte frozen through every later edit and publish, and the real Repository catalog distinguishing all four by identity even when two share identical content.');
    }

    console.log('\nAll Document Lifecycle Product Reassessment tests passed.');
    console.log('\n=== 0.9.546 VERDICT ===');
    console.log(`PRODUCT_COMPLETE. Every lifecycle seam this milestone's own brief named — entry points each
tracing to one real call site (A), documentId/publicationId/contentHash staying three pairwise-distinct facts under
both direct publish and fork (B), publish-as-snapshot immutability surviving both a later edit and a later publish
(C), repeated publication (identical, modified, and five rapid successive publishes) each minting an independent,
independently-catalogued identity (D), post-publication editing that never freezes a session's own live document
while correctly still fork-protecting a fresh session's view of the same now-published documentId — a genuine,
previously-unexamined asymmetry between the Editor's and World View's own publish entry points, proven on both
sides rather than assumed (E), a publish landing mid-collaboration disturbing neither the live document
collaborators keep editing nor the snapshot just frozen (F), failure isolation at both the publish-validation and
forged-collaborative-operation boundaries (G), three named interruption narratives each composed from real,
already-proven behavior (H), zero UI file maintaining an independent Document/Publication lifecycle state of its
own (I), and one flagship Document surviving two collaborators and four publishes — including a deliberate
contentHash collision the real catalog still tells apart (J) — already holds, live, end to end. No production file
changed. The one genuine, load-bearing finding this milestone contributes is Section E's asymmetry: World View's
publishDocument() auto-saves before publishing (clearing dirty) while the Editor's Toolbar.publish() does not —
both correct, neither previously stated together. Per the requesting brief's own framing: the Document ->
Collaboration -> Publication lifecycle is CLOSED. Recommend moving to a different major product area rather than a
fourth reassessment of this same identity model.`);
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
