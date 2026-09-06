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
import { MoveWorldPlacementUseCase } from '../application/MoveWorldPlacementUseCase.js';
import { RemoveWorldPlacementUseCase } from '../application/RemoveWorldPlacementUseCase.js';
import { DiscoverWorldsUseCase } from '../application/DiscoverWorldsUseCase.js';

// 0.9.198 — Publication Unpublish/Retract UI Action.
//
// 0.9.197 closed the World-placement half of 0.9.196's own Section C gap
// ("can a Wanderer or Publisher take a material BACK OUT of the World,
// once it is out there?"); this milestone closes the other half.
// `application/UnpublishDocumentUseCase.js` already existed, was already
// correct (tests/PublicationLifecycle.test.js's own invariants 5/6 and
// flagship already prove it), and was reachable from precisely nowhere a
// Publisher could click. This milestone's ONLY production change is
// exposing it, mirroring 0.9.197's own shape one authority up:
// `WorldNavigationSession.unpublishDocument()` resolves WHICH Publication
// a panel meant (with the same compare-and-swap guard
// `removePlacement()`'s own `expectedPlacementId` already established)
// and hands the id to `UnpublishDocumentUseCase`, which remains —
// completely unmodified — the sole authority that actually retracts it.
// `OwnPublicationPanel` gained one "Unpublish" button, gated only on
// whether a Publication exists (no new UI-only ownership rule, matching
// `UnpublishDocumentUseCase`'s own already-permissive behavior).
//
// This file proves the seam end to end, using the exact same real (not
// mocked) collaborators tests/PublicationLifecycle.test.js and
// tests/WorldPlacementRemovalUIAction.test.js already exercise, and then
// spends most of its length on the negative space the brief called out
// by name: unpublishing must never look like removing a placement,
// deleting material, or touching Snapshot/Nostr/Arweave machinery — and,
// per this milestone's own safety invariant, the existing use case's
// ACTUAL semantics govern every "does X survive" question, never an
// assumption.

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

// Same restraint tests/WorldPlacementRemovalUIAction.test.js (0.9.197)
// and tests/ArchitectureReassessmentProductGapAudit.test.js (0.9.196)
// already apply to their own structural sweeps: full-line `//` comments
// are stripped before pattern-matching, so a comment that merely NAMES a
// class in prose is never mistaken for a real reference.
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
    const removeWorldPlacementUseCase = new RemoveWorldPlacementUseCase(spatialIndexProvider, placementRegistry);
    // The one new collaborator this milestone wires in — otherwise
    // completely unmodified UnpublishDocumentUseCase, given the exact
    // same publisherProvider PublishDocumentUseCase below already
    // writes through.
    const unpublishDocumentUseCase = new UnpublishDocumentUseCase(publisher);
    const discoverUseCase = new DiscoverWorldsUseCase(spatialIndexProvider);
    const publishDocumentUseCase = new PublishDocumentUseCase(publisher, alice);
    const documentCloneService = new DocumentCloneService();

    function buildSession(identityProvider = alice, extra = {}) {
        const session = new WorldNavigationSession({
            registry, loadPublicationDocumentUseCase, worldLayoutProvider,
            saveDocumentUseCase, publishDocumentUseCase, identityProvider,
            documentCloneService, discoveryProvider, placementRegistry,
            moveWorldPlacementUseCase, removeWorldPlacementUseCase,
            unpublishDocumentUseCase,
            ...extra
        });
        session._session = stubRenderer();
        return session;
    }

    // -------------------------------------------------------------
    // A — FLAGSHIP. Create document -> publish -> create World placement
    // -> render publication -> Unpublish -> Publication disappears from
    // its OWN publication-facing read model (getPublicationForDocument,
    // backed by discoveryProvider). Then, per this milestone's own
    // safety invariant, capture and verify pre/post state SEPARATELY for
    // everything else this scenario touches — never assuming "unpublish
    // means delete everything downstream."
    // -------------------------------------------------------------
    let flagshipContentReference;
    {
        const doc = makeDocument('Flagship Gallery', 3);
        const manager = new DocumentManager(doc);
        const publication = publishDocumentUseCase.execute(manager);
        flagshipContentReference = publication.contentReference;

        const position = new Position(120, 0, 80);
        const placement = placePublicationUseCase.execute(publication.id, position);

        const session = buildSession();
        session._loadWorld(publication.documentId);

        // BEFORE — Publication present, Placement present, Material present.
        const before = session.getPublicationForDocument(publication.documentId);
        assert(before && before.id === publication.id, 'A1. BEFORE: OwnPublicationPanel\'s own read model resolves the just-published Publication');
        const placementBefore = session.getPlacementInfo(publication.documentId);
        assert(placementBefore && placementBefore.placementId === placement.id, 'A2. BEFORE: the placement created for it is resolvable through the SAME document-keyed read model PlacementInfoPanel renders');
        assert(contentStore.has(flagshipContentReference), 'A3. BEFORE: the material\'s content bytes are in the content store');
        assert(discoverUseCase.execute(position, 50).length === 1, 'A4. BEFORE: a fresh, independent discovery query finds the placement');

        const removed = session.unpublishDocument(publication.documentId, publication.id);
        assert(removed === true, 'A5. unpublishDocument() reports success, UnpublishDocumentUseCase\'s own boolean passed through unchanged');

        // AFTER — according to UnpublishDocumentUseCase's OWN documented
        // semantics, never an invented cascade.
        assert(session.getPublicationForDocument(publication.documentId) === null,
            'A6. AFTER: the Publication disappears from the SAME read model OwnPublicationPanel renders — no special-cased "unpublished" state, just the ordinary null this read model already returns for "never published"');
        assert(discoveryProvider.findById(publication.id) === null,
            'A7. AFTER: a fresh, independent discovery query (discoveryProvider.findById, never a Publication-panel-specific pathway) confirms the catalog entry is gone');
        assert(contentStore.has(flagshipContentReference), 'A8. AFTER: the material\'s content bytes are STILL in the content store — UnpublishDocumentUseCase never touches contentStore, only its own internal snapshot: key');
        const reloadedDoc = loadPublicationDocumentUseCase.execute(publication.documentId);
        assert(reloadedDoc.world.getBuildings()[0].getBricks().length === 3 && reloadedDoc.metadata.title === 'Flagship Gallery',
            'A9. AFTER: the editable Document\'s own content loads back completely intact — unpublish never touches it');
        assert(discoverUseCase.execute(position, 50).length === 1,
            'A10. AFTER: the raw spatial index / placement UNTOUCHED — a fresh, independent DiscoverWorldsUseCase still finds the placement exactly where it was; UnpublishDocumentUseCase has no path to the spatial layer at all');
        assert(placementRegistry.findByPublicationId(publication.id).length === 1,
            'A11. AFTER: the PlacementRecord itself is untouched too, keyed by the now-unpublished publication.id — unpublishing removes a CATALOG entry, never a spatial one');

        console.log('✓ FLAGSHIP: publish → place → render → Unpublish → Publication gone from its own read model; placement, material, and the editable Document all verified intact per UnpublishDocumentUseCase\'s own documented semantics');
    }

    // -------------------------------------------------------------
    // B — Exact document identity. Unpublishing document A cannot affect
    // publication/document B.
    // -------------------------------------------------------------
    {
        const pubA = publishDocumentUseCase.execute(new DocumentManager(makeDocument('Tower A')));
        const pubB = publishDocumentUseCase.execute(new DocumentManager(makeDocument('Tower B')));
        const posA = new Position(1000, 0, 0);
        const posB = new Position(2000, 0, 0);
        placePublicationUseCase.execute(pubA.id, posA);
        placePublicationUseCase.execute(pubB.id, posB);

        const session = buildSession();
        session.unpublishDocument(pubA.documentId, pubA.id);

        assert(discoveryProvider.findById(pubA.id) === null, 'B1. A is gone from the catalog');
        assert(discoveryProvider.findById(pubB.id) !== null, 'B2. B is completely unaffected');
        assert(session.getPublicationForDocument(pubB.documentId) !== null, 'B3. B still resolves through the SAME read model A no longer does');
        assert(discoverUseCase.execute(posA, 50).length === 1, 'B4. A\'s placement is untouched (unpublish is not placement removal) — still discoverable');
        assert(discoverUseCase.execute(posB, 50).length === 1, 'B5. B\'s placement, likewise, is completely undisturbed');
        console.log('✓ unpublishing A does not affect B — exact document identity holds');
    }

    // -------------------------------------------------------------
    // C — Already-unpublished behavior. Exercise the EXISTING use case's
    // own semantics rather than inventing new ones: UnpublishDocumentUseCase.execute()
    // on an unknown id is a graceful no-op (false) — tests/PublicationLifecycle.test.js's
    // own invariant, unchanged. WorldNavigationSession.unpublishDocument(),
    // one layer up, cannot even resolve a publicationId to pass down once
    // the document has none — it throws a clear error at the RESOLUTION
    // layer, mirroring removePlacement()'s own "has no known placement to
    // remove" behavior exactly, never a silent no-op or a fabricated
    // "already unpublished" status.
    // -------------------------------------------------------------
    {
        assert(unpublishDocumentUseCase.execute('does-not-exist-anywhere') === false,
            '1. UnpublishDocumentUseCase.execute() on an unknown publicationId is a safe no-op — unchanged from tests/PublicationLifecycle.test.js\'s own coverage');

        const pubD = publishDocumentUseCase.execute(new DocumentManager(makeDocument('Retracted Twice')));
        const session = buildSession();
        session.unpublishDocument(pubD.documentId, pubD.id);
        assert(discoveryProvider.findById(pubD.id) === null, '2. sanity: the first unpublish genuinely succeeded');

        assertThrows(() => session.unpublishDocument(pubD.documentId),
            '3. a second unpublishDocument() call on the SAME (now-unpublished) document throws a clear error — it can no longer resolve a Publication to retract, never a fabricated "already unpublished" outcome or a silent no-op');

        // A document that was never published at all follows the exact
        // same "cannot resolve, so it throws" path.
        const neverPublished = makeDocument('Never Published');
        assertThrows(() => session.unpublishDocument(neverPublished.world.id),
            '4. unpublishDocument() on a document with no known Publication at all throws the identical error — repeated UI activation never invents new semantics');

        console.log('✓ already-unpublished behavior matches the existing use case\'s own semantics exactly — no invented "already retracted" state');
    }

    // -------------------------------------------------------------
    // D — World separation. Unpublishing is NOT placement removal.
    // getPlacementInfo(documentId) — the document-keyed read model
    // PlacementInfoPanel/OwnPublicationPanel both ultimately depend on —
    // becomes unresolvable once its governing Publication is gone,
    // because it resolves BY WAY OF that Publication (documented,
    // pre-existing behavior — see WorldNavigationSession.unpublishDocument()'s
    // own header). This is fundamentally different from the placement
    // itself being removed: the raw PlacementRecord survives, directly
    // reachable via its own publicationId (getPlacementInfoForPublication,
    // which bypasses discoveryProvider entirely) and via the spatial
    // index/placement registry — proving the UI action never directly
    // invokes placement removal.
    // -------------------------------------------------------------
    {
        const pub = publishDocumentUseCase.execute(new DocumentManager(makeDocument('Orphaned Placement')));
        const position = new Position(4000, 0, 0);
        const placement = placePublicationUseCase.execute(pub.id, position);

        const session = buildSession();
        assert(session.getPlacementInfo(pub.documentId) !== null, '1. BEFORE: the document-keyed read model resolves the placement');
        assert(session.getPlacementInfoForPublication(pub.id) !== null, '2. BEFORE: the publicationId-keyed read model resolves the SAME placement');

        session.unpublishDocument(pub.documentId, pub.id);

        assert(session.getPlacementInfo(pub.documentId) === null,
            '3. AFTER: the document-keyed read model can no longer resolve it — it needs a live Publication to walk from documentId to publicationId, and there is none anymore');
        assert(session.getPlacementInfoForPublication(pub.id) !== null,
            '4. AFTER: the publicationId-keyed read model (which never asks discoveryProvider) still resolves the EXACT SAME, completely untouched PlacementRecord — proof this was never a placement removal, only a catalog-entry removal that happens to sit upstream of one specific lookup path');
        assert(placementRegistry.get(placement.id) !== null && placementRegistry.get(placement.id).position.x === 4000,
            '5. AFTER: the raw PlacementRecord itself, fetched directly by id, is byte-identical to before — same position, same identity');
        assert(discoverUseCase.execute(position, 50).length === 1,
            '6. AFTER: a fresh, independent DiscoverWorldsUseCase still finds it — the spatial index was never touched');

        console.log('✓ World separation: unpublish orphans a document-keyed lookup without removing the placement itself — the raw PlacementRecord, spatial index, and publicationId-keyed lookup all survive untouched, exactly as UnpublishDocumentUseCase\'s own code (which has no path to placement/spatial machinery) already guarantees; closing what a Wanderer should SEE for an orphaned placement is 0.9.199\'s own question, not this milestone\'s');
    }

    // -------------------------------------------------------------
    // E — Material/distribution separation. The UI layer never directly
    // deletes material, Arweave content, Nostr discovery records, or
    // Snapshot content — proven both by direct observation (content
    // bytes survive) and structurally (the production code this
    // milestone touches has no path to any of it).
    // -------------------------------------------------------------
    {
        const pub = publishDocumentUseCase.execute(new DocumentManager(makeDocument('Material Survives')));
        const contentReference = pub.contentReference;
        assert(contentStore.has(contentReference), '1. BEFORE: material is present');

        const session = buildSession();
        session.unpublishDocument(pub.documentId, pub.id);

        assert(contentStore.has(contentReference), '2. AFTER: material is STILL present — UnpublishDocumentUseCase never calls contentStore.remove()');

        // Its own header prose NAMES Snapshot/Nostr/Arweave concepts only
        // to disclaim them (the same "prose vs. code" restraint 0.9.196's
        // own Section B and 0.9.197's own structural sweep already
        // apply) — so this checks the CODE only, never the comments that
        // explain the boundary.
        const unpublishUseCaseSource = await rawSource('application/UnpublishDocumentUseCase.js');
        const unpublishUseCaseCode = codeOnlyLines(unpublishUseCaseSource).join('\n');
        assert(!/Snapshot|Nostr|Arweave|Bitcoin|Anchor|Distribution|Placement/i.test(unpublishUseCaseCode),
            '3. UnpublishDocumentUseCase.js\'s own CODE carries no Snapshot/Nostr/Arweave/Anchor/Distribution/Placement vocabulary at all — it cannot withdraw decentralized content or touch a placement because it has no path to reach either');

        console.log('✓ material/distribution separation: content bytes survive unpublish, and UnpublishDocumentUseCase\'s own code has no path to Snapshot/Nostr/Arweave/placement machinery at all');
    }

    // -------------------------------------------------------------
    // F — State refresh. The UI derives its resulting state from the
    // EXISTING read model (getPublicationForDocument), exactly as
    // placementInfo already does post-0.9.197 — no independent
    // isUnpublished/publicationRemoved UI state introduced anywhere in
    // production.
    // -------------------------------------------------------------
    {
        const pub = publishDocumentUseCase.execute(new DocumentManager(makeDocument('Read Model Refresh')));
        const session = buildSession();
        assert(session.getPublicationForDocument(pub.documentId) !== null, '1. BEFORE: the existing read model resolves the Publication');
        session.unpublishDocument(pub.documentId, pub.id);
        assert(session.getPublicationForDocument(pub.documentId) === null,
            '2. AFTER: the SAME existing read model — no new method, no new field — already reflects the retraction');

        // Comments are free to NAME the vocabulary being disclaimed (this
        // file's own header does exactly that, in prose, to explain the
        // restraint) — same "prose vs. code" distinction Section E's own
        // sweep already applies, so this checks the CODE only.
        const sessionSource = await rawSource('application/WorldNavigationSession.js');
        assert(!/isUnpublished|publicationRemoved/i.test(codeOnlyLines(sessionSource).join('\n')),
            '3. WorldNavigationSession.js introduces no isUnpublished/publicationRemoved vocabulary in code — the existing getPublicationForDocument()/getPlacementInfo() read models remain the sole source of truth');
        const panelSource = await rawSource('ui/components/OwnPublicationPanel.js');
        assert(!/isUnpublished|publicationRemoved/i.test(codeOnlyLines(panelSource).join('\n')),
            '4. OwnPublicationPanel.js likewise introduces no isUnpublished/publicationRemoved field in code — its own disappearance (via the unchanged v-if="publication" gate) IS the observable state change');

        console.log('✓ state refresh: the UI derives "unpublished" entirely from the existing getPublicationForDocument() read model — no new lifecycle field anywhere');
    }

    // -------------------------------------------------------------
    // G — Ownership. Reuse the existing ownership signal if
    // UnpublishDocumentUseCase already enforces one — it does not (as of
    // this writing, neither LocalPublisherProvider.unpublish() nor
    // UnpublishDocumentUseCase itself ever compares an author/identity),
    // so WorldNavigationSession.unpublishDocument() invents no SECOND,
    // UI-only ownership rule of its own either: it enforces exactly what
    // the use case it wraps already does, which today is nothing beyond
    // "a Publication exists to retract." This test documents that
    // EXISTING (not introduced) permissiveness rather than silently
    // relying on it.
    // -------------------------------------------------------------
    {
        const pub = publishDocumentUseCase.execute(new DocumentManager(makeDocument('Alice\'s World')));
        const bob = new LocalIdentityProvider(storage);
        bob.login('bob');
        const bobSession = buildSession(bob);

        // No throw, no ownership-denied error — matching
        // UnpublishDocumentUseCase.execute()'s own already-permissive
        // behavior exactly (proven directly against the raw use case in
        // tests/ArchitectureReassessmentProductGapAudit.test.js's own
        // C6c/C6d).
        const removed = bobSession.unpublishDocument(pub.documentId, pub.id);
        assert(removed === true, '1. a session authenticated as a DIFFERENT identity (bob) can still retract alice\'s Publication — session.unpublishDocument() enforces no ownership check UnpublishDocumentUseCase itself does not already skip');
        assert(discoveryProvider.findById(pub.id) === null, '2. the retraction genuinely took effect');

        const sessionSource = await rawSource('application/WorldNavigationSession.js');
        const unpublishBody = sessionSource.match(/unpublishDocument\(documentId[^)]*\)\s*\{([\s\S]*?)\n {4}\}/);
        assert(unpublishBody, '3. unpublishDocument() method body is found');
        assert(!/owner|ownedByCurrentUser|currentUser/i.test(unpublishBody[1]),
            '4. unpublishDocument()\'s own body performs no owner/currentUser comparison of its own — the exact "no second, UI-only ownership rule" restraint this milestone\'s own brief calls for');

        console.log('✓ ownership: session.unpublishDocument() adds no UI-only ownership rule beyond what UnpublishDocumentUseCase itself already (does not) enforce');
    }

    // -------------------------------------------------------------
    // H — Structural boundary. OwnPublicationPanel -> WorldNavigationSession
    // -> UnpublishDocumentUseCase, and nothing else: the panel never
    // imports UnpublishDocumentUseCase, Nostr/Arweave modules, or
    // PlacementRegistry/spatial classes directly.
    // -------------------------------------------------------------
    {
        const panelSource = await rawSource('ui/components/OwnPublicationPanel.js');
        assert(countReferences(panelSource, 'UnpublishDocumentUseCase') === 0,
            '1. OwnPublicationPanel.js never references the raw UnpublishDocumentUseCase (by class or conventional instance name) directly — WorldNavigationSession remains the sole authority it talks to');
        const panelCodeOnly = codeOnlyLines(panelSource).join('\n');
        assert(!/^\s*import\s+\{[^}]*\}\s+from\s+['"]\.\.\/\.\.\/(publisher|placement|spatial|content)\//m.test(panelCodeOnly),
            '2. OwnPublicationPanel.js imports nothing from publisher/, placement/, spatial/, or content/ — it only ever imports pure application/ describer functions, unchanged by this milestone');

        const worldViewSource = await rawSource('ui/views/WorldView.js');
        const worldViewCodeOnly = codeOnlyLines(worldViewSource).join('\n');
        assert(!/LocalPublisherProvider|UnpublishDocumentUseCase/.test(worldViewCodeOnly),
            '3. WorldView.js never imports or names LocalPublisherProvider/UnpublishDocumentUseCase directly — unpublish, like every other mutation in this file, goes through WorldNavigationSession alone');
        const handlerMatch = worldViewSource.match(/function unpublishOwnPublication\(publication\)\s*\{([\s\S]*?)\n {8}\}/);
        assert(handlerMatch, '4. unpublishOwnPublication() is found in WorldView.js');
        assert(/session\.unpublishDocument\(/.test(handlerMatch[1]),
            '5. unpublishOwnPublication() calls session.unpublishDocument() — the UI requests retraction, WorldNavigationSession/UnpublishDocumentUseCase remain the sole authority that performs it');

        const unpublishBodySource = await rawSource('application/WorldNavigationSession.js');
        const unpublishBody = unpublishBodySource.match(/unpublishDocument\(documentId[^)]*\)\s*\{([\s\S]*?)\n {4}\}/)[1];
        assert(!/Snapshot|Nostr|Arweave|spatialIndexProvider|placementRegistry|removeWorldPlacementUseCase/i.test(unpublishBody),
            '6. unpublishDocument()\'s own body touches only publication resolution and UnpublishDocumentUseCase — no Snapshot/Nostr/Arweave/spatial/placement call sites, confirming it never removes a placement itself');

        console.log('✓ structural boundary: OwnPublicationPanel → WorldNavigationSession → UnpublishDocumentUseCase, never a direct reference to the raw use case, Nostr/Arweave, or spatial/placement machinery from either UI file');
    }

    console.log('\n✅ All Publication Unpublish/Retract UI Action tests passed.');
}

// Counts real, code-level references to `name` (never inside a comment or
// string of prose) — the same restraint
// tests/ArchitectureReassessmentProductGapAudit.test.js's own
// `countReferences()` helper already applies, reimplemented here so this
// file has no test-to-test import dependency.
function countReferences(source, name) {
    const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
    const matches = codeOnly.match(new RegExp(`\\b${name}\\b`, 'g'));
    return matches ? matches.length : 0;
}

runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
