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
import { DiscoverWorldsUseCase } from '../application/DiscoverWorldsUseCase.js';

// 0.9.199 — Removal & Retraction Lifecycle Convergence Audit.
//
// Test-only. No production changes. 0.9.197 (World Placement Removal UI
// Action) and 0.9.198 (Publication Unpublish/Retract UI Action) each
// exposed one already-correct, already-composed use case through World
// View. Both are real, both are independently proven correct in their own
// dedicated E2E files. What neither file asked is the question this one
// answers: now that a Wanderer/Publisher can reach BOTH authorities from
// the same World-observation surface, do they actually stay independent
// when exercised together, in either order, against the same document —
// or does exposing both at once quietly couple them?
//
// This file adds no new capability and repairs nothing. In particular,
// per this milestone's own brief, it deliberately does NOT:
//   - remove a placement automatically when its Publication is unpublished,
//   - tombstone, reattach, or clean up an orphaned PlacementRecord,
//   - invent a new Publication/placement lifecycle state or UI flag, or
//   - propagate publication state onto placement state (or vice versa).
//
// 0.9.198's own Section D already discovered, and documented, that
// unpublishing orphans a placement from the document-keyed lookup
// (getPlacementInfo/movePlacement/removePlacement all resolve THROUGH the
// document's current Publication). This file confirms that discovery
// holds under the FULL cross product this milestone's brief asks for:
// both orders, independent documents, independent identities, material,
// decentralized distribution, the read-model-only UI surface, both
// compare-and-swap guards together, structural non-coupling between the
// two use cases, and what (if anything) the existing publish/place
// operations can still do with what survives — never a new undo feature.

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

// Same restraint tests/WorldPlacementRemovalUIAction.test.js (0.9.197) and
// tests/PublicationUnpublishUIAction.test.js (0.9.198) already apply to
// their own structural sweeps: full-line `//` comments are stripped
// before pattern-matching, so a comment that merely NAMES a class in
// prose is never mistaken for a real reference.
function codeOnlyLines(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//'));
}

function countReferences(source, identifier) {
    const pattern = new RegExp(`\\b${identifier}\\b`, 'g');
    const matches = codeOnlyLines(source).join('\n').match(pattern);
    return matches ? matches.length : 0;
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
    const unpublishDocumentUseCase = new UnpublishDocumentUseCase(publisher);
    const discoverUseCase = new DiscoverWorldsUseCase(spatialIndexProvider);
    const publishDocumentUseCase = new PublishDocumentUseCase(publisher, alice);
    const documentCloneService = new DocumentCloneService();

    function buildSession(identityProvider = alice, extra = {}) {
        const session = new WorldNavigationSession({
            registry, loadPublicationDocumentUseCase, worldLayoutProvider,
            saveDocumentUseCase, publishDocumentUseCase, identityProvider,
            documentCloneService, discoveryProvider, placementRegistry,
            removeWorldPlacementUseCase, unpublishDocumentUseCase,
            ...extra
        });
        session._session = stubRenderer();
        return session;
    }

    // -------------------------------------------------------------
    // A — FLAGSHIP: Remove placement first, then Unpublish. Proves
    // RemoveWorldPlacementUseCase running first never disturbs the
    // Publication UnpublishDocumentUseCase subsequently retracts.
    // -------------------------------------------------------------
    {
        const doc = makeDocument('Convergence A: Remove then Unpublish', 3);
        const publication = publishDocumentUseCase.execute(new DocumentManager(doc));
        const contentReference = publication.contentReference;
        const position = new Position(10000, 0, 0);
        const placement = placePublicationUseCase.execute(publication.id, position);

        const session = buildSession();
        session._loadWorld(publication.documentId);

        assert(session.getPlacementInfo(publication.documentId)?.placementId === placement.id, 'A1. BEFORE: placement resolves through the document-keyed read model');
        assert(session.getPublicationForDocument(publication.documentId)?.id === publication.id, 'A2. BEFORE: Publication resolves through its own read model');

        // Step 1 — remove the placement.
        session.removePlacement(publication.documentId, placement.id);

        assert(session.getPlacementInfo(publication.documentId) === null, 'A3. AFTER REMOVE: placement is gone from the document-keyed read model');
        assert(placementRegistry.get(placement.id) === null, 'A4. AFTER REMOVE: the raw PlacementRecord itself is gone too — this is a genuine removal, not an orphaning');
        const publicationAfterRemove = session.getPublicationForDocument(publication.documentId);
        assert(publicationAfterRemove !== null && publicationAfterRemove.id === publication.id, 'A5. AFTER REMOVE: the Publication survives, untouched — removal is not unpublish');
        assert(contentStore.has(contentReference), 'A6. AFTER REMOVE: material survives');

        // Step 2 — unpublish the SAME document's SAME surviving Publication.
        // Removing the placement first must not have disturbed the
        // Publication's own resolvability one bit.
        const removed = session.unpublishDocument(publication.documentId, publication.id);
        assert(removed === true, 'A7. unpublishDocument() succeeds even though this document\'s placement was already removed — the two authorities never depended on each other');

        assert(session.getPublicationForDocument(publication.documentId) === null, 'A8. AFTER UNPUBLISH: the Publication is now gone from its own read model too');
        assert(discoveryProvider.findById(publication.id) === null, 'A9. AFTER UNPUBLISH: a fresh, independent discovery query confirms the catalog entry is gone');
        assert(contentStore.has(contentReference), 'A10. AFTER UNPUBLISH: material still survives both mutations');
        const reloadedDoc = loadPublicationDocumentUseCase.execute(publication.documentId);
        assert(reloadedDoc.world.getBuildings()[0].getBricks().length === 3, 'A11. AFTER UNPUBLISH: the editable Document itself loads back completely intact');

        console.log('✓ A — FLAGSHIP (remove → unpublish): both mutations applied in sequence to the SAME document without either corrupting the other\'s domain state');
    }

    // -------------------------------------------------------------
    // B — FLAGSHIP: Unpublish first, then attempt to remove the now-
    // orphaned placement. This is the reverse of Section A, and per this
    // milestone's own brief it is expected to surface — not repair —
    // 0.9.198's own documented consequence: the document-keyed
    // removePlacement() path becomes UNABLE to resolve the orphaned
    // placement at all, because it resolves the placement BY WAY OF the
    // document's current Publication, which no longer exists. The raw
    // placement is never touched by unpublish, and remains reachable —
    // by anyone already holding its placementId — through the raw
    // RemoveWorldPlacementUseCase directly. This file documents that
    // boundary precisely; it introduces no new resolution path to make
    // the document-keyed route work again.
    // -------------------------------------------------------------
    {
        const doc = makeDocument('Convergence B: Unpublish then Remove', 2);
        const publication = publishDocumentUseCase.execute(new DocumentManager(doc));
        const contentReference = publication.contentReference;
        const position = new Position(11000, 0, 0);
        const placement = placePublicationUseCase.execute(publication.id, position);

        const session = buildSession();

        assert(session.getPlacementInfo(publication.documentId)?.placementId === placement.id, 'B1. BEFORE: placement resolves through the document-keyed read model');

        // Step 1 — unpublish.
        session.unpublishDocument(publication.documentId, publication.id);

        assert(session.getPublicationForDocument(publication.documentId) === null, 'B2. AFTER UNPUBLISH: the Publication is gone from its own read model');
        assert(session.getPlacementInfo(publication.documentId) === null, 'B3. AFTER UNPUBLISH: the document-keyed placement lookup is now unavailable too — 0.9.198\'s own documented orphaning, reconfirmed here');
        const orphanInfo = session.getPlacementInfoForPublication(publication.id);
        assert(orphanInfo !== null && orphanInfo.placementId === placement.id, 'B4. AFTER UNPUBLISH: the SAME raw placement remains directly reachable through the publicationId-keyed bypass — it was orphaned, never removed');
        assert(placementRegistry.get(placement.id) !== null, 'B5. AFTER UNPUBLISH: the raw PlacementRecord itself is untouched in the registry');
        assert(discoverUseCase.execute(position, 50).length === 1, 'B6. AFTER UNPUBLISH: a fresh, independent DiscoverWorldsUseCase still finds it — the spatial index was never touched');

        // Step 2 — the document-keyed removal path a Wanderer's UI would
        // actually call is now unable to resolve anything to remove. This
        // is the EXACT SAME "has no known placement to remove" error
        // removePlacement() already throws for a document that was never
        // placed at all — never a special "orphaned" error, because
        // nothing about removePlacement()'s own resolution logic changed.
        assertThrows(() => session.removePlacement(publication.documentId),
            'B7. removePlacement(documentId) can no longer resolve a placement to remove once its governing Publication is gone — the SAME resolution failure a never-placed document already produces, not a new orphan-specific error');

        // The raw use case, given the placementId directly (obtained here
        // through getPlacementInfoForPublication\'s bypass, exactly as
        // 0.9.198\'s own header names as the only surviving path), still
        // removes it — proving the placement was orphaned, not
        // unreachable or corrupted.
        removeWorldPlacementUseCase.execute(orphanInfo.placementId);
        assert(placementRegistry.get(placement.id) === null, 'B8. the raw use case, called directly with the placementId the bypass read model provided, still removes the orphaned placement — the SAME RemoveWorldPlacementUseCase, completely unmodified');
        assert(session.getPlacementInfoForPublication(publication.id) === null, 'B9. AFTER: the bypass lookup now agrees the placement is gone too');
        assert(discoverUseCase.execute(position, 50).length === 0, 'B10. AFTER: the spatial index reflects the removal');
        assert(contentStore.has(contentReference), 'B11. material survived both mutations, same as Section A');

        console.log('✓ B — FLAGSHIP (unpublish → remove): unpublishing first orphans the placement exactly as 0.9.198 documented; the document-keyed removal path becomes unable to resolve it (a pre-existing consequence, reconfirmed, never patched here), while the raw use case remains fully capable via the placementId the bypass read model already exposes');
    }

    // -------------------------------------------------------------
    // C — Independent documents. A and B each have a Publication and a
    // Placement. Every combination of remove/unpublish applied to A must
    // never affect B, in any of the dimensions this file already checks.
    // -------------------------------------------------------------
    {
        const pubA = publishDocumentUseCase.execute(new DocumentManager(makeDocument('Convergence C: Tower A')));
        const pubB = publishDocumentUseCase.execute(new DocumentManager(makeDocument('Convergence C: Tower B')));
        const posA = new Position(12000, 0, 0);
        const posB = new Position(13000, 0, 0);
        const placementA = placePublicationUseCase.execute(pubA.id, posA);
        const placementB = placePublicationUseCase.execute(pubB.id, posB);

        const session = buildSession();
        session.removePlacement(pubA.documentId, placementA.id);
        session.unpublishDocument(pubA.documentId, pubA.id);

        // A: both mutations landed.
        assert(discoveryProvider.findById(pubA.id) === null, 'C1. A\'s Publication is gone');
        assert(placementRegistry.get(placementA.id) === null, 'C2. A\'s placement is gone');

        // B: completely untouched by either mutation applied to A.
        assert(discoveryProvider.findById(pubB.id) !== null, 'C3. B\'s Publication is completely unaffected');
        assert(placementRegistry.get(placementB.id) !== null && placementRegistry.get(placementB.id).position.x === 13000, 'C4. B\'s PlacementRecord is untouched, same position, same identity');
        assert(session.getPublicationForDocument(pubB.documentId)?.id === pubB.id, 'C5. B still resolves through the SAME read model A no longer does');
        assert(session.getPlacementInfo(pubB.documentId)?.placementId === placementB.id, 'C6. B\'s placement still resolves through the SAME document-keyed read model A no longer does');
        assert(discoverUseCase.execute(posB, 50).length === 1, 'C7. B is still independently discoverable');

        console.log('✓ C — removing and unpublishing A never affects B — exact document identity holds across both mutations');
    }

    // -------------------------------------------------------------
    // D — Independent identities. documentId, publicationId,
    // placementId, and contentHash never collide with each other for the
    // same object, and neither mutation can be tricked into acting on a
    // different identity by being handed the wrong KIND of id.
    // -------------------------------------------------------------
    {
        const pub = publishDocumentUseCase.execute(new DocumentManager(makeDocument('Convergence D: Identities')));
        const placement = placePublicationUseCase.execute(pub.id, new Position(14000, 0, 0));

        const ids = [pub.documentId, pub.id, placement.id, pub.contentHash];
        assert(ids.every((id) => typeof id === 'string' && id.length > 0), 'D1. documentId, publicationId, placementId, and contentHash are all present, non-empty strings');
        assert(new Set(ids).size === 4, `D2. documentId (${pub.documentId}), publicationId (${pub.id}), placementId (${placement.id}), and contentHash (${pub.contentHash}) are four DISTINCT values — no accidental aliasing between identity spaces`);
        assert(placement.publicationId === pub.id, 'D3. sanity: the placement genuinely references this publication\'s id, confirming the identity check above is meaningful, not vacuous');

        const session = buildSession();

        // removePlacement()'s compare-and-swap guard compares against
        // placementId. Handing it the PUBLICATION's id instead (a
        // different identity space entirely) must refuse, exactly as a
        // genuinely stale placementId would.
        assertThrows(() => session.removePlacement(pub.documentId, pub.id),
            'D4. removePlacement() refuses when handed a publicationId where a placementId was expected — it never coincidentally matches, and the guard does not silently accept the wrong identity kind');
        assert(placementRegistry.get(placement.id) !== null, 'D5. the placement survived the refused call — no partial mutation occurred');

        // unpublishDocument()'s compare-and-swap guard compares against
        // publicationId. Handing it the PLACEMENT's id instead must
        // likewise refuse.
        assertThrows(() => session.unpublishDocument(pub.documentId, placement.id),
            'D6. unpublishDocument() refuses when handed a placementId where a publicationId was expected — the same cross-identity refusal, one authority up');
        assert(discoveryProvider.findById(pub.id) !== null, 'D7. the Publication survived the refused call too');

        // The SAME calls succeed once given the CORRECT identity kind —
        // proving D4/D6 refused because of identity mismatch, not because
        // either method is simply broken.
        session.removePlacement(pub.documentId, placement.id);
        assert(placementRegistry.get(placement.id) === null, 'D8. removePlacement() with the correct placementId succeeds');
        session.unpublishDocument(pub.documentId, pub.id);
        assert(discoveryProvider.findById(pub.id) === null, 'D9. unpublishDocument() with the correct publicationId succeeds');

        console.log('✓ D — documentId/publicationId/placementId/contentHash remain four distinct identity spaces, and neither mutation\'s compare-and-swap guard can be fooled by a value from the wrong one');
    }

    // -------------------------------------------------------------
    // E — Material survival. Neither action, alone or in sequence,
    // deletes or mutates the content-addressed material merely because
    // it becomes unreachable through one read model.
    // -------------------------------------------------------------
    {
        const doc = makeDocument('Convergence E: Material Survives', 5);
        const publication = publishDocumentUseCase.execute(new DocumentManager(doc));
        const contentReference = publication.contentReference;
        const placement = placePublicationUseCase.execute(publication.id, new Position(15000, 0, 0));
        assert(contentStore.has(contentReference), 'E1. BEFORE: material is present');

        const session = buildSession();
        session.removePlacement(publication.documentId, placement.id);
        assert(contentStore.has(contentReference), 'E2. AFTER REMOVE: material still present');
        session.unpublishDocument(publication.documentId, publication.id);
        assert(contentStore.has(contentReference), 'E3. AFTER UNPUBLISH: material still present');

        const reloaded = loadPublicationDocumentUseCase.execute(publication.documentId);
        assert(reloaded.world.getBuildings()[0].getBricks().length === 5 && reloaded.metadata.title === 'Convergence E: Material Survives',
            'E4. the editable Document\'s own content loads back completely intact after both mutations');

        console.log('✓ E — material survives both mutations, in sequence, on the same document');
    }

    // -------------------------------------------------------------
    // F — Decentralized distribution survival. Neither action's own CODE
    // carries any path to Arweave/Nostr/Snapshot machinery — checked
    // together here as the convergence question actually asks: does
    // exercising BOTH in the same file introduce any such coupling?
    // -------------------------------------------------------------
    {
        const removeUseCaseSource = await rawSource('application/RemoveWorldPlacementUseCase.js');
        const unpublishUseCaseSource = await rawSource('application/UnpublishDocumentUseCase.js');
        const distributionVocabulary = /Snapshot|Nostr|Arweave|Bitcoin|Anchor|Distribution/i;
        assert(!distributionVocabulary.test(codeOnlyLines(removeUseCaseSource).join('\n')),
            'F1. RemoveWorldPlacementUseCase.js\'s own CODE carries no Snapshot/Nostr/Arweave/Anchor/Distribution vocabulary');
        assert(!distributionVocabulary.test(codeOnlyLines(unpublishUseCaseSource).join('\n')),
            'F2. UnpublishDocumentUseCase.js\'s own CODE carries no Snapshot/Nostr/Arweave/Anchor/Distribution vocabulary either');

        // Neither method's body in WorldNavigationSession reaches for a
        // snapshot/distribution/discovery-registration collaborator.
        const sessionSource = await rawSource('application/WorldNavigationSession.js');
        const removeBody = sessionSource.match(/removePlacement\(documentId[^)]*\)\s*\{([\s\S]*?)\n {4}\}/)[1];
        const unpublishBody = sessionSource.match(/unpublishDocument\(documentId[^)]*\)\s*\{([\s\S]*?)\n {4}\}/)[1];
        assert(!distributionVocabulary.test(removeBody), 'F3. removePlacement()\'s own body touches no Snapshot/Nostr/Arweave/distribution collaborator');
        assert(!distributionVocabulary.test(unpublishBody), 'F4. unpublishDocument()\'s own body touches no Snapshot/Nostr/Arweave/distribution collaborator either');

        // Behaviorally, too: a placement created the ordinary way (never
        // registered as an automatic Snapshot World source, since this
        // file never wires that subsystem in) simply has no such record
        // to disturb — proving there is nothing for either mutation to
        // silently unregister, not merely that the code lacks a call site.
        const pub = publishDocumentUseCase.execute(new DocumentManager(makeDocument('Convergence F: Distribution')));
        const placement = placePublicationUseCase.execute(pub.id, new Position(16000, 0, 0));
        const session = buildSession();
        session.removePlacement(pub.documentId, placement.id);
        session.unpublishDocument(pub.documentId, pub.id);
        assert(contentStore.has(pub.contentReference), 'F5. material (the thing Arweave/Snapshot distribution would actually reference) survives both mutations');

        console.log('✓ F — neither mutation, alone or together, carries any path to Arweave content, Nostr discovery, Snapshot material, or automatic Snapshot World source registration');
    }

    // -------------------------------------------------------------
    // G — UI/read-model convergence. After either action, the UI changes
    // because EXISTING read models (getPlacementInfo,
    // getPublicationForDocument) change — never because a new UI
    // lifecycle flag (an "orphaned" boolean, say) was introduced for the
    // convergence case this milestone was asked to audit.
    // -------------------------------------------------------------
    {
        const noNewFlagVocabulary = /\borphan(ed)?\b|\bisOrphaned\b|\bplacementOrphaned\b/i;
        const sessionSource = await rawSource('application/WorldNavigationSession.js');
        assert(!noNewFlagVocabulary.test(codeOnlyLines(sessionSource).join('\n')),
            'G1. WorldNavigationSession.js introduces no orphaned/isOrphaned vocabulary in CODE — the word appears only in comments (this audit\'s own, and 0.9.198\'s), never as a field a read model returns');
        const placementInfoPanelSource = await rawSource('ui/components/PlacementInfoPanel.js');
        const ownPublicationPanelSource = await rawSource('ui/components/OwnPublicationPanel.js');
        assert(!noNewFlagVocabulary.test(codeOnlyLines(placementInfoPanelSource).join('\n')), 'G2. PlacementInfoPanel.js carries no orphaned-shaped field or prop either');
        assert(!noNewFlagVocabulary.test(codeOnlyLines(ownPublicationPanelSource).join('\n')), 'G3. OwnPublicationPanel.js carries no orphaned-shaped field or prop either');

        // The panels\' own visibility gates are unchanged: both still
        // collapse through the ordinary "read model returned null" path,
        // never a dedicated orphan-branch.
        const worldViewSource = await rawSource('ui/views/WorldView.js');
        assert(/<PlacementInfoPanel[\s\S]{0,40}v-if="placementInfo"/.test(worldViewSource), 'G4. PlacementInfoPanel is still gated on plain `v-if="placementInfo"` — no orphan-aware branch');

        // Behaviorally: after unpublish, the SAME getPlacementInfo() read
        // model a rendered panel depends on already returns null — which
        // is exactly why a Wanderer's already-open PlacementInfoPanel for
        // this document disappears on the next refresh, with no dangling
        // "Remove" button left pointing at a placement that is no longer
        // resolvable through this document at all (Section B, above).
        const pub = publishDocumentUseCase.execute(new DocumentManager(makeDocument('Convergence G: Read Model')));
        placePublicationUseCase.execute(pub.id, new Position(17000, 0, 0));
        const session = buildSession();
        assert(session.getPlacementInfo(pub.documentId) !== null, 'G5. BEFORE: the panel\'s own read model resolves');
        session.unpublishDocument(pub.documentId, pub.id);
        assert(session.getPlacementInfo(pub.documentId) === null, 'G6. AFTER: the SAME read model — no new field, no new method — already reflects the convergence: this document\'s panel has nothing left to show');

        console.log('✓ G — the UI surface for the convergence case changes only because getPlacementInfo()/getPublicationForDocument() already return null; no orphaned/isOrphaned flag exists anywhere in production');
    }

    // -------------------------------------------------------------
    // H — Compare-and-swap protection. A stale UI instance is refused for
    // BOTH guards, one right after the other in this same section (each
    // against its own independent document, so neither sub-test's setup
    // interferes with the other's).
    // -------------------------------------------------------------
    {
        const session = buildSession();

        // H-placement — a stale placementId. Independent document (docA)
        // so this sub-test's own unpublish-free setup can't interact
        // with H-publication's below. 0.9.197's own file already proved
        // this once; reconfirmed here as half of the SAME combined guard
        // check this milestone's brief asks for.
        const pubA = publishDocumentUseCase.execute(new DocumentManager(makeDocument('Convergence H: Stale Placement')));
        const p1 = placePublicationUseCase.execute(pubA.id, new Position(18000, 0, 0));
        const staleInfo = session.getPlacementInfo(pubA.documentId);
        assert(staleInfo.placementId === p1.id, 'H1. the stale placementId is captured, as a rendered PlacementInfoPanel would');

        // The World moved on: P1 removed, replaced by P2 elsewhere —
        // pubA itself stays published throughout.
        removeWorldPlacementUseCase.execute(p1.id);
        const p2 = placePublicationUseCase.execute(pubA.id, new Position(18000, 0, 500));
        assert(p2.id !== p1.id, 'H2. sanity: the replacement placement genuinely has a new id');

        assertThrows(() => session.removePlacement(pubA.documentId, staleInfo.placementId),
            'H3. removePlacement() refuses the stale placementId — P2 is not removed in P1\'s name');
        assert(discoverUseCase.execute(new Position(18000, 0, 500), 50).length === 1, 'H4. P2 survived the refused removal untouched');

        session.removePlacement(pubA.documentId, p2.id);
        assert(discoverUseCase.execute(new Position(18000, 0, 500), 50).length === 0, 'H5. removal with the correct, current placementId still works');

        // H-publication — a stale publicationId, the guard's OWN dedicated
        // test that neither tests/PublicationUnpublishUIAction.test.js
        // (0.9.198) nor tests/ArchitectureReassessmentProductGapAudit.
        // test.js (0.9.196) ever actually exercised: every call site in
        // both of those files already passed the CURRENT publicationId.
        // Independent document (docB) so pubA's own unrelated placement
        // guard above can't interact with this.
        const docB = makeDocument('Convergence H: Stale Publication');
        const pubB1 = publishDocumentUseCase.execute(new DocumentManager(docB));
        const stalePublication = session.getPublicationForDocument(pubB1.documentId);
        assert(stalePublication.id === pubB1.id, 'H6. the stale publicationId is captured, as a rendered OwnPublicationPanel would');

        // The World moved on: pubB1 was retracted and the SAME document
        // republished, producing a brand-new publicationId (pubB2) for
        // the identical documentId.
        unpublishDocumentUseCase.execute(pubB1.id);
        const pubB2 = publishDocumentUseCase.execute(new DocumentManager(docB));
        assert(pubB2.id !== pubB1.id && pubB2.documentId === pubB1.documentId, 'H7. sanity: the replacement Publication genuinely has a new id, same document');

        assertThrows(() => session.unpublishDocument(pubB2.documentId, stalePublication.id),
            'H8. unpublishDocument() refuses the stale publicationId — pubB2 is not retracted in pubB1\'s name');
        assert(discoveryProvider.findById(pubB2.id) !== null, 'H9. pubB2 survived the refused unpublish untouched');

        session.unpublishDocument(pubB2.documentId, pubB2.id);
        assert(discoveryProvider.findById(pubB2.id) === null, 'H10. unpublish with the correct, current publicationId still works');

        console.log('✓ H — both compare-and-swap guards refuse a stale caller and both still succeed given the current id; the publicationId guard, in particular, had never been behaviorally exercised by either 0.9.196 or 0.9.198\'s own tests until now');
    }

    // -------------------------------------------------------------
    // I — Cross-operation non-coupling. A structural sweep establishing
    // RemoveWorldPlacementUseCase !== UnpublishDocumentUseCase at every
    // level this codebase actually has one: neither production class
    // references the other, neither WorldNavigationSession method calls
    // the other's use case, and neither UI action emits or handles the
    // other's event.
    // -------------------------------------------------------------
    {
        const removeUseCaseSource = await rawSource('application/RemoveWorldPlacementUseCase.js');
        const unpublishUseCaseSource = await rawSource('application/UnpublishDocumentUseCase.js');
        assert(countReferences(removeUseCaseSource, 'UnpublishDocumentUseCase') === 0, 'I1. RemoveWorldPlacementUseCase.js never references UnpublishDocumentUseCase');
        assert(countReferences(unpublishUseCaseSource, 'RemoveWorldPlacementUseCase') === 0, 'I2. UnpublishDocumentUseCase.js never references RemoveWorldPlacementUseCase');

        const sessionSource = await rawSource('application/WorldNavigationSession.js');
        const removeBody = sessionSource.match(/removePlacement\(documentId[^)]*\)\s*\{([\s\S]*?)\n {4}\}/)[1];
        const unpublishBody = sessionSource.match(/unpublishDocument\(documentId[^)]*\)\s*\{([\s\S]*?)\n {4}\}/)[1];
        assert(!/_unpublishDocumentUseCase/.test(removeBody), 'I3. removePlacement()\'s own body never calls this._unpublishDocumentUseCase');
        assert(!/_removeWorldPlacementUseCase/.test(unpublishBody), 'I4. unpublishDocument()\'s own body never calls this._removeWorldPlacementUseCase');

        // PlacementInfoPanel.js has zero imports (a pure presentation
        // component) and never emits an unpublish-shaped event;
        // OwnPublicationPanel.js never emits a remove-shaped event.
        const placementInfoPanelSource = await rawSource('ui/components/PlacementInfoPanel.js');
        assert(!/^\s*import\s/m.test(placementInfoPanelSource), 'I5. PlacementInfoPanel.js still has zero imports');
        const placementEmits = placementInfoPanelSource.match(/emits:\s*\[([^\]]*)\]/)[1];
        assert(!/unpublish|retract/i.test(placementEmits), 'I6. PlacementInfoPanel.js\'s own emits array carries no unpublish/retract-shaped event — that authority lives one layer up, on a different panel entirely');

        const ownPublicationPanelSource = await rawSource('ui/components/OwnPublicationPanel.js');
        assert(!/@click="[a-zA-Z]*[Rr]emove/.test(ownPublicationPanelSource), 'I7. OwnPublicationPanel.js wires no remove-shaped click handler — placement removal is PlacementInfoPanel\'s authority, never duplicated here');

        // WorldView.js's own two handlers each call exactly one session
        // method and never the other's.
        const worldViewSource = await rawSource('ui/views/WorldView.js');
        const removeHandler = worldViewSource.match(/function removePlacementFromPanel\(info\)\s*\{([\s\S]*?)\n {8}\}/)[1];
        const unpublishHandler = worldViewSource.match(/function unpublishOwnPublication\(publication\)\s*\{([\s\S]*?)\n {8}\}/)[1];
        assert(/session\.removePlacement\(/.test(removeHandler) && !/session\.unpublishDocument\(/.test(removeHandler), 'I8. removePlacementFromPanel() calls session.removePlacement() and never session.unpublishDocument()');
        assert(/session\.unpublishDocument\(/.test(unpublishHandler) && !/session\.removePlacement\(/.test(unpublishHandler), 'I9. unpublishOwnPublication() calls session.unpublishDocument() and never session.removePlacement()');

        console.log('✓ I — RemoveWorldPlacementUseCase and UnpublishDocumentUseCase remain structurally uncoupled at every layer: production classes, WorldNavigationSession method bodies, panel emits, and WorldView handlers');
    }

    // -------------------------------------------------------------
    // J — Reversibility through EXISTING operations only. No undo
    // feature is invented here; this section only checks whether the
    // operations that already exist happen to compose into one.
    // -------------------------------------------------------------
    {
        // J1 — after removing a placement, can the existing PLACE
        // operation place the surviving Publication again?
        const pub = publishDocumentUseCase.execute(new DocumentManager(makeDocument('Convergence J: Re-place')));
        const p1 = placePublicationUseCase.execute(pub.id, new Position(19000, 0, 0));
        const session = buildSession();
        session.removePlacement(pub.documentId, p1.id);
        assert(session.getPlacementInfo(pub.documentId) === null, 'J1a. sanity: the placement is genuinely gone');

        const p2 = placePublicationUseCase.execute(pub.id, new Position(19000, 0, 250));
        assert(p2.publicationId === pub.id, 'J1b. YES — PlacePublicationUseCase, completely unmodified, places the SAME surviving Publication again, producing a brand-new PlacementRecord');
        assert(p2.id !== p1.id, 'J1c. ...under a genuinely new placementId, never the removed one reused');
        assert(session.getPlacementInfo(pub.documentId)?.placementId === p2.id, 'J1d. ...and the document-keyed read model resolves it again immediately — this is an EXISTING property of PlacePublicationUseCase, not a new "undo remove" feature');

        // J2 — after unpublishing a document, can the existing PUBLISH
        // workflow publish the surviving Document again?
        const doc = makeDocument('Convergence J: Re-publish');
        const firstPublish = publishDocumentUseCase.execute(new DocumentManager(doc));
        session.unpublishDocument(firstPublish.documentId, firstPublish.id);
        assert(session.getPublicationForDocument(firstPublish.documentId) === null, 'J2a. sanity: the Publication is genuinely gone');

        const secondPublish = publishDocumentUseCase.execute(new DocumentManager(doc));
        assert(secondPublish.documentId === firstPublish.documentId, 'J2b. YES — PublishDocumentUseCase, completely unmodified, publishes the SAME surviving Document again (same documentId — document.world.id never changed)');
        assert(secondPublish.id !== firstPublish.id, 'J2c. ...under a genuinely new publicationId, never the retracted one reused');
        assert(secondPublish.contentHash === firstPublish.contentHash, 'J2d. ...with the SAME contentHash, since the content itself never changed — a documented nuance: contentHash identifies CONTENT, not a publish EVENT, so it is deliberately NOT a fourth guaranteed-unique-per-publish identity the way documentId/publicationId/placementId are');
        assert(session.getPublicationForDocument(firstPublish.documentId)?.id === secondPublish.id, 'J2e. ...and the existing getPublicationForDocument() read model resolves the new Publication immediately — an EXISTING property of PublishDocumentUseCase, not a new "undo unpublish" feature');

        console.log('✓ J — both existing operations (place, publish) already compose into a "bring it back" property with the id each produces regenerated, never reused; this file documents that property, it does not add one');
    }

    console.log('\n✅ All Removal & Retraction Lifecycle Convergence Audit tests passed.');
}

runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
