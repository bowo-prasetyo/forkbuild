import { Position } from '../core/Position.js';
import { SpatialOverlap, detectSpatialOverlap } from '../core/SpatialOverlap.js';
import { SpatialAllocationPolicy, evaluateSpatialAllocation } from '../core/SpatialAllocationPolicy.js';
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

// 0.2.25 — Spatial Allocation & Placement Collision Policy.
//
// Core claim under test: an overlap (two placements sharing an exact
// world position) is a plain geometric fact, never an error by
// itself. What happens next is a POLICY decision — the default
// (WARN) requires confirmation for an explicit, interactive move, but
// never blocks, never silently relocates, and never invalidates an
// otherwise valid, signed placement. See docs/Principles.md, "Overlap
// Is A Fact; Collision Is A Policy Decision."

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

function makeDocument(title) {
    const world = new World();
    const building = new Building({ creator: 'alice' });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    return new Document({
        world,
        metadata: new DocumentMetadata({ title, author: 'alice', license: new License({ id: LicenseId.CC0_1_0 }) })
    });
}

async function runTests() {
    // -------------------------------------------------------------
    // 1-4. core/SpatialOverlap.js — pure geometric fact-finding.
    // -------------------------------------------------------------
    {
        const empty = detectSpatialOverlap(new Position(0, 0, 0), []);
        assert(empty instanceof SpatialOverlap && empty.isEmpty && empty.count === 0,
            '1. no existing records -> an empty overlap');

        const records = [
            { placementId: 'p1', publicationId: 'pub-1', position: new Position(100, 0, 100) },
            { placementId: 'p2', publicationId: 'pub-2', position: new Position(200, 0, 200) }
        ];
        const noMatch = detectSpatialOverlap(new Position(0, 0, 0), records);
        assert(noMatch.isEmpty, '2. no record at the requested position -> empty overlap');

        const match = detectSpatialOverlap(new Position(100, 0, 100), records);
        assert(!match.isEmpty && match.count === 1 && match.occupants[0].publicationId === 'pub-1',
            '3. a record at the exact requested position is found');

        const excluded = detectSpatialOverlap(new Position(100, 0, 100), records, { excludePlacementId: 'p1' });
        assert(excluded.isEmpty, '4. excludePlacementId omits a placement from overlapping against itself');
    }

    // -------------------------------------------------------------
    // 5-10. core/SpatialAllocationPolicy.js — policy is independent
    //       of the overlap's existence; only what happens NEXT differs.
    // -------------------------------------------------------------
    {
        const overlap = detectSpatialOverlap(new Position(1, 1, 1), [
            { placementId: 'x', publicationId: 'pub-x', position: new Position(1, 1, 1) }
        ]);
        const empty = new SpatialOverlap({ position: new Position(9, 9, 9), occupants: [] });

        const allowEmpty = evaluateSpatialAllocation(SpatialAllocationPolicy.WARN, empty);
        assert(allowEmpty.allowed && !allowEmpty.requiresConfirmation,
            '5. an empty overlap never requires confirmation, regardless of policy');

        const allow = evaluateSpatialAllocation(SpatialAllocationPolicy.ALLOW, overlap);
        assert(allow.allowed && !allow.requiresConfirmation,
            '6. ALLOW places at the requested position with no friction, even when occupied');

        const warn = evaluateSpatialAllocation(SpatialAllocationPolicy.WARN, overlap);
        assert(warn.allowed && warn.requiresConfirmation,
            '7. WARN allows the position but flags that confirmation is required');

        const reject = evaluateSpatialAllocation(SpatialAllocationPolicy.REJECT, overlap);
        assert(!reject.allowed && !reject.requiresConfirmation,
            '8. REJECT refuses the requested position outright');

        let threw = false;
        try {
            evaluateSpatialAllocation(SpatialAllocationPolicy.AUTO_OFFSET, overlap);
        } catch (e) {
            threw = true;
        }
        assert(threw, '9. AUTO_OFFSET is deliberately unimplemented and throws rather than silently relocating anything');

        let threwUnknown = false;
        try {
            evaluateSpatialAllocation('not-a-real-policy', overlap);
        } catch (e) {
            threwUnknown = true;
        }
        assert(threwUnknown, '10. an unrecognized policy name throws rather than silently defaulting to something');
    }

    // -------------------------------------------------------------
    // 11-18. WorldNavigationSession.checkPlacementOverlap — the
    //        pre-flight query an explicit Move Placement UI runs
    //        BEFORE calling movePlacement.
    // -------------------------------------------------------------
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

    function buildSession(extra = {}) {
        const session = new WorldNavigationSession({
            registry, loadPublicationDocumentUseCase, worldLayoutProvider,
            saveDocumentUseCase, publishDocumentUseCase, identityProvider: alice,
            documentCloneService, discoveryProvider, placementRegistry, moveWorldPlacementUseCase,
            ...extra
        });
        session._session = {
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
            setCameraState() {}
        };
        return session;
    }

    // Two publications, explicitly placed at the SAME position — a
    // deliberate, legitimate overlap (e.g. two independently authored
    // exhibits sharing a coordinate), not something either publish
    // operation should have refused.
    const sharedPosition = new Position(500, 0, 300);
    const publicationA = publisher.publish(makeDocument('Alice Castle'), alice);
    placePublicationUseCase.execute(publicationA.id, sharedPosition);
    const publicationB = publisher.publish(makeDocument('Bob Tower'), alice);
    placePublicationUseCase.execute(publicationB.id, sharedPosition);

    const publicationC = publisher.publish(makeDocument('Carol Cabin'), alice);
    placePublicationUseCase.execute(publicationC.id, new Position(0, 0, 0));

    {
        const session = buildSession();
        session._loadWorld(publicationC.documentId);

        const check = session.checkPlacementOverlap(publicationC.documentId, sharedPosition);
        assert(check.policy === SpatialAllocationPolicy.WARN, '11. WorldNavigationSession defaults to the WARN policy');
        assert(check.allowed === true, '12. WARN still ALLOWS the requested position');
        assert(check.requiresConfirmation === true, '13. WARN flags that confirmation is required for an occupied position');
        assert(check.occupants.length === 2, '14. both existing occupants at that position are reported');
        const titles = check.occupants.map((o) => o.title).sort();
        assert(titles[0] === 'Alice Castle' && titles[1] === 'Bob Tower',
            '15. occupants are resolved to their publication titles, not raw ids');

        const clear = session.checkPlacementOverlap(publicationC.documentId, new Position(999, 0, 999));
        assert(clear.requiresConfirmation === false && clear.occupants.length === 0,
            '16. an unoccupied destination requires no confirmation');

        // Moving Carol's Cabin back onto its OWN current position must
        // not warn about itself.
        const self = session.checkPlacementOverlap(publicationC.documentId, new Position(0, 0, 0));
        assert(self.requiresConfirmation === false,
            '17. checking a placement against its own current position never counts itself as an occupant');
    }

    // -------------------------------------------------------------
    // 18. ALLOW policy: same overlapping destination, no confirmation
    //     required — proves the policy, not the overlap, controls
    //     whether the UI is expected to pause.
    // -------------------------------------------------------------
    {
        const allowSession = buildSession({ spatialAllocationPolicy: SpatialAllocationPolicy.ALLOW });
        allowSession._loadWorld(publicationC.documentId);
        const check = allowSession.checkPlacementOverlap(publicationC.documentId, sharedPosition);
        assert(check.allowed === true && check.requiresConfirmation === false,
            '18. an ALLOW-policy session never requires confirmation, even for an occupied position');
    }

    // -------------------------------------------------------------
    // 19-20. The existence of an overlap never invalidates an
    //        otherwise authorized placement — movePlacement (the
    //        actual authority for creating a revision) has no idea
    //        checkPlacementOverlap even exists, and succeeds
    //        regardless of what else occupies the destination.
    // -------------------------------------------------------------
    {
        const session = buildSession();
        session._loadWorld(publicationC.documentId);
        const moved = session.movePlacement(publicationC.documentId, sharedPosition);
        assert(moved.position.x === 500 && moved.position.z === 300,
            '19. movePlacement succeeds onto an already-occupied position — overlap is not a rejection reason');

        const info = session.getPlacementInfo(publicationC.documentId);
        assert(info.overlapCount === 2,
            '20. getPlacementInfo reports the resulting overlap passively (2 other occupants), after the fact');
    }

    // -------------------------------------------------------------
    // 21. Graceful degradation: no placementRegistry wired ->
    //     checkPlacementOverlap returns null, matching the same
    //     "null when the question doesn't apply" rule getPlacementInfo
    //     already follows.
    // -------------------------------------------------------------
    {
        const bareSession = new WorldNavigationSession({
            registry, loadPublicationDocumentUseCase, worldLayoutProvider,
            saveDocumentUseCase, publishDocumentUseCase, identityProvider: alice,
            documentCloneService, discoveryProvider
        });
        bareSession._session = buildSession()._session;
        bareSession._loadWorld(publicationC.documentId);
        assert(bareSession.checkPlacementOverlap(publicationC.documentId, sharedPosition) === null,
            '21. no placementRegistry wired -> checkPlacementOverlap returns null, not a broken shape');
    }

    console.log('✅ All Spatial Allocation & Placement Collision Policy tests passed.');
}

runTests().catch((e) => { console.error(e); throw e; });
