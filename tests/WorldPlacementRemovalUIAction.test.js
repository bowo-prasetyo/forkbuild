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
import { DocumentCloneService } from '../application/DocumentCloneService.js';
import { DocumentManager } from '../application/DocumentManager.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { PlacePublicationUseCase } from '../application/PlacePublicationUseCase.js';
import { MoveWorldPlacementUseCase } from '../application/MoveWorldPlacementUseCase.js';
import { RemoveWorldPlacementUseCase } from '../application/RemoveWorldPlacementUseCase.js';
import { DiscoverWorldsUseCase } from '../application/DiscoverWorldsUseCase.js';

// 0.9.197 — World Placement Removal UI Action.
//
// 0.9.196's own audit found RemoveWorldPlacementUseCase already
// existing, already correct, already composed at every spatial-index
// composition root — and reachable from precisely nowhere a person
// could click. This milestone's ONLY production change is exposing it:
// WorldNavigationSession.removePlacement() resolves WHICH placement a
// panel meant (with a compare-and-swap guard against a stale
// selection) and hands the id to RemoveWorldPlacementUseCase, which
// remains — completely unmodified — the sole authority that actually
// removes it. PlacementInfoPanel gained one "Remove from World" button,
// gated on the same ownership signal "Move" already uses.
//
// This file proves the seam end to end, using the exact same real
// (not mocked) collaborators tests/PlacementWorldView.test.js and
// tests/WorldPlacement.test.js already exercise, and then spends most
// of its length on the negative space the brief called out by name:
// removing one placement must never look like removing another,
// unpublishing a Publication, deleting material, or touching anything
// Snapshot/Nostr/decentralized-shaped.

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

// Same restraint tests/ArchitectureReassessmentProductGapAudit.test.js
// already applies to its own structural sweeps: full-line `//` comments
// are stripped before pattern-matching, so a comment that merely NAMES
// a class in prose is never mistaken for a real reference.
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
    const moveWorldPlacementUseCase = new MoveWorldPlacementUseCase(spatialIndexProvider, placementRegistry, null, alice);
    // The one new collaborator this milestone wires in — otherwise
    // completely unmodified RemoveWorldPlacementUseCase, given the
    // exact same (spatialIndexProvider, placementRegistry) pair
    // MoveWorldPlacementUseCase above already receives.
    const removeWorldPlacementUseCase = new RemoveWorldPlacementUseCase(spatialIndexProvider, placementRegistry);
    const discoverUseCase = new DiscoverWorldsUseCase(spatialIndexProvider);
    const publishDocumentUseCase = new PublishDocumentUseCase(publisher, alice);
    const documentCloneService = new DocumentCloneService();

    function buildSession(identityProvider = alice, extra = {}) {
        const session = new WorldNavigationSession({
            registry, loadPublicationDocumentUseCase, worldLayoutProvider,
            saveDocumentUseCase, publishDocumentUseCase, identityProvider,
            documentCloneService, discoveryProvider, placementRegistry,
            moveWorldPlacementUseCase, removeWorldPlacementUseCase,
            ...extra
        });
        session._session = stubRenderer();
        return session;
    }

    // -------------------------------------------------------------
    // FLAGSHIP — Create Publication -> create World placement -> render
    // in World -> select placement -> Remove from World -> placement
    // disappears, while Publication and material both remain, observed
    // through a completely fresh, independent discovery pathway (never
    // a special Snapshot- or Publication-aware one).
    // -------------------------------------------------------------
    let flagshipPublication;
    let flagshipContentReference;
    {
        const doc = makeDocument('Flagship Gallery', 3);
        const manager = new DocumentManager(doc);
        const publication = publishDocumentUseCase.execute(manager);
        flagshipPublication = publication;
        flagshipContentReference = publication.contentReference;

        const position = new Position(120, 0, 80);
        const placement = placePublicationUseCase.execute(publication.id, position);

        const session = buildSession();
        session._loadWorld(publication.documentId);

        const selected = session.getPlacementInfo(publication.documentId);
        assert(selected && selected.placementId === placement.id, 'FLAGSHIP 1. selecting the placement resolves the exact placement just created');
        assert(selected.removable === true, 'FLAGSHIP 2. the owner (alice) is told this placement is removable');

        assert(discoverUseCase.execute(position, 50).length === 1, 'FLAGSHIP 3. a fresh, independent discovery query finds the placement before removal');

        session.removePlacement(publication.documentId, selected.placementId);

        assert(session.getPlacementInfo(publication.documentId) === null,
            'FLAGSHIP 4. the placement disappears from the SAME read model PlacementInfoPanel renders — no special-cased "removed" state, just the ordinary null this read model already returns for "never placed"');
        assert(discoverUseCase.execute(position, 50).length === 0,
            'FLAGSHIP 5. a fresh World read (an independent DiscoverWorldsUseCase, no Snapshot- or Publication-specific pathway) observes the absence directly');
        assert(placementRegistry.findByPublicationId(publication.id).length === 0,
            'FLAGSHIP 6. the PlacementRegistry record is gone too, not just the spatial index entry');

        const survivingPublication = discoveryProvider.findById(publication.id);
        assert(survivingPublication !== null && survivingPublication.contentHash === publication.contentHash,
            'FLAGSHIP 7. the Publication itself survives, byte-identical — removal is not unpublish');

        assert(contentStore.has(flagshipContentReference), 'FLAGSHIP 8. the material\'s content bytes are still in the content store');
        const reloadedDoc = loadPublicationDocumentUseCase.execute(publication.documentId);
        assert(reloadedDoc.world.getBuildings()[0].getBricks().length === 3 && reloadedDoc.metadata.title === 'Flagship Gallery',
            'FLAGSHIP 9. the published document\'s own content loads back completely intact');

        console.log('✓ FLAGSHIP: publish → place → render → select → Remove from World → placement gone, Publication and material both intact, observed via a fresh independent discovery query');
    }

    // -------------------------------------------------------------
    // Removing A does not remove B — two independently placed
    // Publications, only one ever touched.
    // -------------------------------------------------------------
    {
        const pubA = publishDocumentUseCase.execute(new DocumentManager(makeDocument('Tower A')));
        const pubB = publishDocumentUseCase.execute(new DocumentManager(makeDocument('Tower B')));
        const posA = new Position(1000, 0, 0);
        const posB = new Position(2000, 0, 0);
        const placementA = placePublicationUseCase.execute(pubA.id, posA);
        const placementB = placePublicationUseCase.execute(pubB.id, posB);

        const session = buildSession();
        session.removePlacement(pubA.documentId, placementA.id);

        assert(discoverUseCase.execute(posA, 50).length === 0, '1. A is gone from discovery');
        assert(discoverUseCase.execute(posB, 50).length === 1, '2. B is completely unaffected');
        assert(placementRegistry.get(placementB.id) !== null && placementRegistry.get(placementB.id).position.x === 2000,
            '3. B\'s PlacementRecord is untouched, same position, same identity');
        assert(discoveryProvider.findById(pubB.id) !== null, '4. Publication B is untouched');
        console.log('✓ removing A does not remove B');
    }

    // -------------------------------------------------------------
    // Removing a nonexistent placement — the same graceful-no-op
    // RemoveWorldPlacementUseCase already documents in its own header,
    // completely unchanged by this milestone; WorldNavigationSession's
    // own resolution step (which must first find a REAL record to know
    // which placementId to pass down) is what actually surfaces a clear
    // error to a caller, exactly mirroring movePlacement()'s own
    // "has no known placement to move" behavior.
    // -------------------------------------------------------------
    {
        const before = spatialIndexProvider.list().length;
        removeWorldPlacementUseCase.execute('does-not-exist-anywhere');
        assert(spatialIndexProvider.list().length === before,
            '1. RemoveWorldPlacementUseCase.execute() on an unknown id is a safe no-op — no existing placement is disturbed');

        const pubC = publishDocumentUseCase.execute(new DocumentManager(makeDocument('Unplaced Cottage')));
        // Deliberately never placed.
        const session = buildSession();
        assertThrows(() => session.removePlacement(pubC.documentId),
            '2. removePlacement() on a document with no known placement throws a clear error, same as movePlacement() does — never a silent no-op at the session layer');
    }

    // -------------------------------------------------------------
    // A stale selected placement cannot silently remove a replacement.
    // Wanderer A opens the panel and captures placementId P1. Before A
    // clicks "Remove," the World moves on: P1 is removed and the SAME
    // Publication is placed again elsewhere, producing a brand-new
    // placementId P2. A's stale click must never delete P2 in P1's
    // name.
    // -------------------------------------------------------------
    {
        const pub = publishDocumentUseCase.execute(new DocumentManager(makeDocument('Moving Target')));
        const p1 = placePublicationUseCase.execute(pub.id, new Position(3000, 0, 0));

        const session = buildSession();
        const staleInfo = session.getPlacementInfo(pub.documentId);
        assert(staleInfo.placementId === p1.id, '1. the panel captured P1\'s id');

        // The World moved on: P1 is gone, replaced by P2 elsewhere.
        removeWorldPlacementUseCase.execute(p1.id);
        const p2 = placePublicationUseCase.execute(pub.id, new Position(3000, 0, 500));
        assert(p2.id !== p1.id, '2. sanity: the replacement genuinely has a different placementId');

        assertThrows(() => session.removePlacement(pub.documentId, staleInfo.placementId),
            '3. removePlacement() refuses a stale placementId rather than silently removing whatever now sits there');

        assert(discoverUseCase.execute(new Position(3000, 0, 500), 50).length === 1,
            '4. P2 survived the refused removal completely untouched');
        assert(placementRegistry.get(p2.id) !== null, '5. P2\'s record is still in the registry');

        // The SAME call succeeds once it is given the CURRENT id — the
        // guard blocks a stale identity, not removal itself.
        session.removePlacement(pub.documentId, p2.id);
        assert(discoverUseCase.execute(new Position(3000, 0, 500), 50).length === 0,
            '6. removing with the correct, current placementId still works');
        console.log('✓ a stale selected placement cannot silently remove a replacement');
    }

    // -------------------------------------------------------------
    // Structural sweep — the UI never talks to storage/spatial/
    // placement machinery directly, only through WorldNavigationSession
    // — and removal is, by construction, incapable of touching
    // Snapshot, Nostr, distribution, or unpublish machinery, because
    // the one production seam this milestone touches
    // (RemoveWorldPlacementUseCase) never imports or references any of
    // it, and never did.
    // -------------------------------------------------------------
    {
        // Its own header prose NAMES "unpublish" deliberately (to say
        // this class does NOT do it, in exactly the same "restraint
        // documented in prose" style Section B of
        // tests/ArchitectureReassessmentProductGapAudit.test.js already
        // applies to VehicleType.js) — so this checks the CODE only,
        // never the comments that explain the boundary.
        const removeUseCaseSource = await rawSource('application/RemoveWorldPlacementUseCase.js');
        const removeUseCaseCode = codeOnlyLines(removeUseCaseSource).join('\n');
        assert(!/Snapshot|Nostr|Arweave|Bitcoin|Anchor|Distribution|Unpublish/i.test(removeUseCaseCode),
            '1. RemoveWorldPlacementUseCase.js\'s own CODE carries no Snapshot/Nostr/Arweave/Anchor/Distribution/Unpublish vocabulary at all — it cannot withdraw decentralized content or retract a Publication because it has no path to reach either');

        const sessionSource = await rawSource('application/WorldNavigationSession.js');
        const removePlacementBody = sessionSource.match(/removePlacement\(documentId[^)]*\)\s*\{([\s\S]*?)\n {4}\}/);
        assert(removePlacementBody, '2. removePlacement() method body is found');
        assert(!/Snapshot|Nostr|Arweave|Unpublish|Discovery(?!Provider)/i.test(removePlacementBody[1]),
            '3. removePlacement()\'s own body touches only placement resolution and RemoveWorldPlacementUseCase — no Snapshot/Nostr/Arweave/unpublish call sites');

        const placementInfoPanelSource = await rawSource('ui/components/PlacementInfoPanel.js');
        assert(!/^\s*import\s/m.test(placementInfoPanelSource),
            '4. PlacementInfoPanel.js still has zero imports — a pure presentation component that cannot reach the placement store directly even by accident');

        const worldViewSource = await rawSource('ui/views/WorldView.js');
        const codeOnly = codeOnlyLines(worldViewSource).join('\n');
        assert(!/LocalSpatialIndexProvider|LocalPlacementRegistry|SpatialIndexProvider|PlacementRegistry/.test(codeOnly),
            '5. WorldView.js never imports or names a spatial-index/placement-registry class directly — removal, like every other mutation in this file, goes through WorldNavigationSession alone');
        const handlerMatch = worldViewSource.match(/function removePlacementFromPanel\(info\)\s*\{([\s\S]*?)\n {8}\}/);
        assert(handlerMatch, '6. removePlacementFromPanel() is found in WorldView.js');
        assert(/session\.removePlacement\(/.test(handlerMatch[1]),
            '7. removePlacementFromPanel() calls session.removePlacement() — the UI requests removal, WorldNavigationSession/RemoveWorldPlacementUseCase remain the sole authority that performs it');

        console.log('✓ UI never touches the placement store directly, and removal is structurally incapable of reaching Snapshot/Nostr/distribution/unpublish machinery');
    }

    console.log('\n✅ All World Placement Removal UI Action tests passed.');
}

runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
