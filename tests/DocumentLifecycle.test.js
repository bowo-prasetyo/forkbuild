import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { License, LicenseId } from '../core/License.js';
import { Document } from '../core/Document.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { DocumentManager } from '../application/DocumentManager.js';
import { UpdateDocumentMetadataUseCase } from '../application/UpdateDocumentMetadataUseCase.js';
import { PublishDocumentUseCase } from '../application/PublishDocumentUseCase.js';
import { DocumentCloneService } from '../application/DocumentCloneService.js';
import {
    LifecycleStatus,
    computeLifecycleStatus,
    describeLifecycleStatus
} from '../application/DocumentLifecycleStatus.js';
import { describeLicense, LICENSE_OPTIONS } from '../application/LicenseLabels.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';
import { LoadPublicationDocumentUseCase } from '../application/LoadPublicationDocumentUseCase.js';
import { SaveDocumentUseCase } from '../application/SaveDocumentUseCase.js';
import { LocalWorldLayoutProvider } from '../world-layout/LocalWorldLayoutProvider.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { SpatialSelectionState } from '../application/spatial-state/SpatialSelectionState.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';

// ---------------------------------------------------------------------
// Helpers (same conventions as tests/ForkOnEdit.test.js)
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

function makeWorld() {
    const world = new World();
    const building = new Building({ creator: 'alice' });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    return world;
}

function makeDocument(title, { licenseId = LicenseId.CC0_1_0, description = '' } = {}) {
    return new Document({
        world: makeWorld(),
        metadata: new DocumentMetadata({ title, description, author: 'alice', license: new License({ id: licenseId }) })
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
    }

    // -------------------------------------------------------------
    // 1-3. DocumentMetadata: defaults, setters, touch(), round-trip.
    // -------------------------------------------------------------
    {
        const fresh = new DocumentMetadata();
        assert(fresh.title && fresh.title.length > 0, '1. title has a sensible non-empty default');
        assert(fresh.description === '', '1b. description defaults to empty string, never null');
        assert(fresh.license.id === LicenseId.UNSPECIFIED, '1c. license defaults to UNSPECIFIED — absence is explicit, not null');

        const before = fresh.modified;
        fresh.title = 'My Castle';
        fresh.description = 'A small village on a hill.';
        fresh.touch();
        assert(fresh.title === 'My Castle' && fresh.description === 'A small village on a hill.',
            '2. title/description are directly settable');
        assert(fresh.modified instanceof Date && fresh.modified !== before,
            '2b. touch() stamps modified');

        const json = fresh.toJSON();
        assert(json.description === 'A small village on a hill.', '3. description round-trips through toJSON');
        const restored = DocumentMetadata.fromJSON(json);
        assert(restored.description === fresh.description, '3b. and back through fromJSON');

        const legacyJson = { title: 'Old Doc', author: 'alice' }; // no `description` field at all
        const legacy = DocumentMetadata.fromJSON(legacyJson);
        assert(legacy.description === '', '3c. pre-0.2.21 JSON with no description field defaults to empty — no migration needed');
    }

    // -------------------------------------------------------------
    // 4. UpdateDocumentMetadataUseCase: the Editor-side entry point.
    // -------------------------------------------------------------
    {
        const manager = new DocumentManager(makeDocument('Draft World'));
        manager.load(manager.document); // simulate "opened", dirty: false
        const useCase = new UpdateDocumentMetadataUseCase();

        useCase.execute(manager, { title: 'Renamed', description: 'New description' });
        assert(manager.document.metadata.title === 'Renamed', '4. title updated');
        assert(manager.document.metadata.description === 'New description', '4b. description updated');
        assert(manager.state.dirty === true, '4c. editing metadata marks the document dirty');

        // Partial update: omitted fields are left untouched.
        useCase.execute(manager, { title: 'Renamed Again' });
        assert(manager.document.metadata.description === 'New description',
            '4d. a partial update does not clobber fields the caller did not pass');
    }

    // -------------------------------------------------------------
    // 5. DocumentLifecycleStatus: the three tiers.
    // -------------------------------------------------------------
    {
        assert(computeLifecycleStatus({ hasBeenSaved: false, isPublished: false }) === LifecycleStatus.DRAFT,
            '5. never-saved -> Draft');
        assert(computeLifecycleStatus({ hasBeenSaved: true, isPublished: false }) === LifecycleStatus.SAVED,
            '5b. saved, not published -> Saved');
        assert(computeLifecycleStatus({ hasBeenSaved: true, isPublished: true }) === LifecycleStatus.PUBLISHED,
            '5c. published wins over merely saved');
        assert(computeLifecycleStatus({ hasBeenSaved: false, isPublished: true }) === LifecycleStatus.PUBLISHED,
            '5d. published wins even if somehow never explicitly saved');
        assert(/unsaved changes/i.test(describeLifecycleStatus(LifecycleStatus.SAVED, { dirty: true })),
            '5e. a dirty Saved document says so in its label');
    }

    // -------------------------------------------------------------
    // 6. PublishDocumentUseCase validates metadata before creating
    //    anything immutable — title required, world must not be empty.
    //    License choice itself is NOT validated (UNSPECIFIED/
    //    ALL_RIGHTS_RESERVED are legitimate, maximally-restrictive
    //    choices — 0.2.13).
    // -------------------------------------------------------------
    {
        const untitled = new DocumentManager(makeDocument('   ')); // whitespace-only
        assertThrows(() => publishDocumentUseCase.execute(untitled),
            '6. an empty/whitespace-only title is rejected before publishing');

        const emptyWorldDoc = new Document({
            world: new World(),
            metadata: new DocumentMetadata({ title: 'Nothing Built', license: new License({ id: LicenseId.CC0_1_0 }) })
        });
        assertThrows(() => publishDocumentUseCase.execute(new DocumentManager(emptyWorldDoc)),
            '6b. a world with no buildings is rejected before publishing');

        const restrictive = new DocumentManager(makeDocument('Restricted', { licenseId: LicenseId.UNSPECIFIED }));
        const publication = publishDocumentUseCase.execute(restrictive);
        assert(publication && publication.title === 'Restricted',
            '6c. an UNSPECIFIED license does not block publishing — only missing title/content does');
    }

    // -------------------------------------------------------------
    // 7. DocumentCloneService carries `description` through — it was
    //    added to DocumentMetadata in 0.2.21, after the clone
    //    mechanism already existed, so this is a real "did the new
    //    field get wired into the old code path" check.
    // -------------------------------------------------------------
    {
        const source = makeDocument('Original', { description: 'Hand-built keep.' });
        const clone = documentCloneService.execute(source);
        assert(clone.metadata.description === 'Hand-built keep.',
            '7. description survives cloning, same as license/author already did');
    }

    // -------------------------------------------------------------
    // 8. getDocumentInfo: normalized shape, status reflects reality.
    // -------------------------------------------------------------
    {
        const publication = publisher.publish(makeDocument('Info Panel World', { description: 'For the panel.' }), alice);
        const session = buildSession();
        session._loadWorld(publication.documentId);

        const info = session.getDocumentInfo(publication.documentId);
        assert(info.title === 'Info Panel World' && info.description === 'For the panel.',
            '8. getDocumentInfo surfaces title/description');
        assert(info.status === LifecycleStatus.PUBLISHED, '8b. a freshly streamed publication reports Published');
        assert(info.editable === false, '8c. a published snapshot reports editable:false');
        assert(info.editabilityNotice && info.editabilityNotice.blocked === false,
            '8d. forkable license -> editabilityNotice explains the first edit will fork, not blocked');
    }

    // -------------------------------------------------------------
    // 9. updateDocumentMetadata on a published, forkable snapshot:
    //    forks exactly once, the edit lands on the fork, the notice
    //    drains exactly once.
    // -------------------------------------------------------------
    {
        const publication = publisher.publish(makeDocument('Metadata Fork Source'), alice);
        const session = buildSession();
        session._loadWorld(publication.documentId);

        assert(session.consumeForkNotice() === null, '9. no fork notice before anything happened');

        const forkId = session.updateDocumentMetadata(publication.documentId, {
            title: 'My Renamed Copy',
            description: 'Edited after forking.'
        });
        assert(forkId !== publication.documentId, '9b. metadata edit on a published doc returns a NEW documentId');
        assert(session.getLoadedDocuments().length === 1, '9c. exactly one fork, replacing the source in this session');
        assert(!session.isDocumentPublished(forkId), '9d. the fork itself is editable');

        const forkDoc = session.getDocument(forkId);
        assert(forkDoc.metadata.title === 'My Renamed Copy' && forkDoc.metadata.description === 'Edited after forking.',
            '9e. the metadata edit landed on the fork');
        assert(forkDoc.metadata.parentDocumentId === publication.documentId, '9f. fork lineage points at the source');

        const reloaded = loadPublicationDocumentUseCase.execute(publication.documentId);
        assert(reloaded.metadata.title === 'Metadata Fork Source',
            '9g. the original published snapshot keeps its own title — never mutated in place');

        const notice = session.consumeForkNotice();
        assert(notice && notice.forkId === forkId, '9h. a fork notice was recorded for the UI to surface');
        assert(session.consumeForkNotice() === null, '9i. the notice drains — a second read returns null');
    }

    // -------------------------------------------------------------
    // 10. Fork policy still governs metadata edits: a fork-forbidden
    //     publication rejects the edit outright, same as any other
    //     mutation (0.2.13 + 0.2.20), and explains why.
    // -------------------------------------------------------------
    {
        const publication = publisher.publish(
            makeDocument('No License World', { licenseId: LicenseId.UNSPECIFIED }), alice
        );
        const session = buildSession();
        session._loadWorld(publication.documentId);

        assertThrows(() => session.updateDocumentMetadata(publication.documentId, { title: 'Hijacked' }),
            '10. editing metadata on an unlicensed publication is rejected, not silently forked');
        assert(session.isDocumentPublished(publication.documentId),
            '10b. the source remains published/unforked after the denial');

        const info = session.getDocumentInfo(publication.documentId);
        assert(info.editabilityNotice && info.editabilityNotice.blocked === true
            && /UNSPECIFIED/.test(info.editabilityNotice.message),
            '10c. the Document Info panel explains why — the actionable reason the design asked for');
    }

    // -------------------------------------------------------------
    // 11. Alice publishes; Bob views (no fork); Bob edits the title —
    //     exactly one fork, attributed to Bob, Alice's original
    //     untouched. (The exact scenario from the design doc, this
    //     time for a metadata edit rather than a brick move.)
    // -------------------------------------------------------------
    {
        const bob = new LocalIdentityProvider(new InMemoryStorageProvider());
        bob.login('bob');
        const publication = publisher.publish(makeDocument('Alice World'), alice);

        const bobSession = new WorldNavigationSession({
            registry, loadPublicationDocumentUseCase, worldLayoutProvider,
            saveDocumentUseCase, publishDocumentUseCase, identityProvider: bob,
            documentCloneService, discoveryProvider
        });
        bobSession._session = stubRenderer();
        bobSession._loadWorld(publication.documentId);

        const viewedInfo = bobSession.getDocumentInfo(publication.documentId);
        assert(viewedInfo.status === LifecycleStatus.PUBLISHED, '11. Bob viewing only: still Published, no fork');
        assert(bobSession.getLoadedDocuments().length === 1, '11b. still exactly one loaded document');

        const forkId = bobSession.updateDocumentMetadata(publication.documentId, { title: "Bob's Copy" });
        assert(bobSession.getLoadedDocuments().length === 1, '11c. Bob edits: exactly ONE fork exists');
        const bobFork = bobSession.getDocument(forkId);
        assert(bobFork.metadata.author === 'bob', '11d. the fork is attributed to Bob, not Alice');
        assert(bobFork.metadata.title === "Bob's Copy", '11e. the title edit landed on Bob\'s fork');

        assert(publisher.verifySnapshot(publication.id, publication.contentHash),
            "11f. Alice's original publication still verifies, untouched by Bob's edit");
    }

    // -------------------------------------------------------------
    // 12. Subsequent edits — a metadata change followed by a landmark
    //     mutation — stay on the SAME fork, not a second one. (0.5.9
    //     retired WorldNavigationSession's own moveSelection() —
    //     EditorSession alone owns brick mutation now.
    //     createLandmarkHere() is the one mutation surface World View
    //     kept, and it crosses through the exact same
    //     _ensureEditableDocumentId() seam moveSelection() used to; see
    //     docs/Principles.md "World View Observes and Navigates;
    //     Editor Mutates and Builds".)
    // -------------------------------------------------------------
    {
        const publication = publisher.publish(makeDocument('Two Edits'), alice);
        const avatarPresenceSession = new AvatarPresenceSession(
            { avatarId: 'alice-avatar', ownerIdentity: 'alice' },
            { position: new Position(0, 0, 0) }
        );
        const session = new WorldNavigationSession({
            registry, loadPublicationDocumentUseCase, worldLayoutProvider,
            saveDocumentUseCase, publishDocumentUseCase, identityProvider: alice,
            documentCloneService, discoveryProvider, avatarPresenceSession
        });
        session._session = stubRenderer();
        session._loadWorld(publication.documentId);

        const forkId = session.updateDocumentMetadata(publication.documentId, { title: 'Retitled' });
        session.createLandmarkHere('Second Edit', '');

        assert(session.getActiveDocumentId() === forkId, '12. the landmark mutation stayed on the same fork the metadata edit created');
        assert(session.getLoadedDocuments().length === 1, '12b. still exactly one loaded document — no second fork');
        assert(session.getDocument(forkId).metadata.title === 'Retitled',
            '12c. the earlier metadata edit is still there after the later landmark mutation');
    }

    // -------------------------------------------------------------
    // 13. LicenseLabels: every LicenseId has a human label, and the
    //     selector covers the full enum (nothing silently omitted).
    // -------------------------------------------------------------
    {
        for (const id of Object.values(LicenseId)) {
            const label = describeLicense(id);
            assert(typeof label === 'string' && label.length > 0, `13. describeLicense has a label for ${id}`);
        }
        const optionIds = new Set(LICENSE_OPTIONS.map((o) => o.id));
        for (const id of Object.values(LicenseId)) {
            assert(optionIds.has(id), `13b. LICENSE_OPTIONS includes ${id}`);
        }
    }

    console.log('✅ All Document Lifecycle & Metadata UI tests passed.');
}

runTests().catch((e) => { console.error(e); throw e; });
