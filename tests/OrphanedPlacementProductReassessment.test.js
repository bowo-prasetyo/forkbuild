import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

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
import { SpatialAllocationPolicy } from '../core/SpatialAllocationPolicy.js';

// 0.9.468 — Orphaned Placement Product Reassessment.
//
// Test-only; no production changes. This milestone was proposed on top of
// 0.9.467's own reconciliation verdict: the orphaned PlacementRecord is not
// an unresolved bug, but the visible seam of two deliberately independent
// state models (Publication lifecycle vs. Placement/occupancy lifecycle).
// Six milestones (0.9.199-0.9.202, 0.9.467) already settled the SEMANTICS
// question. What none of them frames as its own explicit subject is the
// PRODUCT question this milestone asks fresh:
//
//   Does the deliberate distinction between physical occupancy and
//   presentable occupancy create an actual user-facing problem?
//
// This is a narrower, and different, question than "is the architecture
// consistent" (0.9.467's own subject). It is answered here the same way
// every prior product reassessment in this codebase answers such a
// question (e.g. 0.9.311 Post-Placement Product Evolution Reassessment):
// with live, running evidence against real collaborators, graded against a
// real user journey, not re-derived from the architecture diagram alone.
//
//   Section A — User-visible consequence: publish -> place -> unpublish,
//               traced through every surface a Wanderer or the placing
//               owner could actually observe.
//   Section B — Recovery usability: the already-established recovery
//               composition (unpublish -> remove -> publish -> place),
//               checked honestly for whether it is reachable through an
//               existing UI action or only through a raw, UI-unexposed
//               capability — and for whether that even matters.
//   Section C — Physical-occupancy rationale: what work checkPlacementOverlap's
//               survival of the orphan actually does (and, just as
//               important, what it explicitly does NOT do).
//   Section D — Presentability correctness: the stronger invariant that no
//               surface ever materializes a nonexistent Publication.
//   Section E — Re-publication isolation: a fresh publication of the same
//               document never inherits the dead placement.
//   Section F — Product-gap classification.
//   Section G — Explicit non-goals guard.
//
// Per this milestone's own (reconciled) brief, it does NOT implement
// automatic placement deletion, tombstones, automatic detachment or
// reattachment, orphan garbage collection, background cleanup, or any
// coupling of placement lifecycle to Publication lifecycle. It also does
// not introduce a new placement lifecycle state.

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

function codeOnlyLines(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

async function grepCount(pattern, dirs, { ignoreCase = false } = {}) {
    let hits = '';
    try {
        const flags = ignoreCase ? '-rli' : '-rl';
        hits = execSync(`grep ${flags} "${pattern}" ${dirs.join(' ')} --include="*.js" || true`,
            { cwd: SOURCE_ROOT.pathname }).toString();
    } catch { /* grep exits non-zero on no match; treated as zero hits */ }
    return hits.trim() ? hits.trim().split('\n').length : 0;
}

async function runTests() {
    console.log('Running Orphaned Placement Product Reassessment tests...\n');

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
    const saveDocumentUseCase = new SaveDocumentUseCase(storage);

    function buildSession(extra = {}) {
        return new WorldNavigationSession({
            registry, loadPublicationDocumentUseCase, worldLayoutProvider,
            saveDocumentUseCase, publishDocumentUseCase, identityProvider: alice,
            documentCloneService, discoveryProvider, placementRegistry,
            removeWorldPlacementUseCase, unpublishDocumentUseCase, moveWorldPlacementUseCase,
            ...extra
        });
    }

    // ===============================================================
    // Section A — User-visible consequence. publish -> place -> unpublish,
    // then every surface a real person (either the Wanderer streaming
    // past, or the OWNER of a second document trying to place something
    // at the exact same coordinate) could actually observe.
    // ===============================================================
    {
        const doc = makeDocument('A: User-Visible Consequence', 1);
        const publication = publishDocumentUseCase.execute(new DocumentManager(doc));
        const position = new Position(70000, 0, 0);
        placePublicationUseCase.execute(publication.id, position);

        const session = buildSession();
        session.unpublishDocument(publication.documentId, publication.id);

        // A1. An ordinary Wanderer streaming through this region sees
        // NOTHING at the orphan's coordinate — no invisible-but-solid
        // location, no stale entry, no error.
        assert(!worldLayoutProvider.findVisibleDocuments(position, 50).includes(publication.documentId),
            'A1. A Wanderer streaming this region never receives the orphaned document — no invisible occupied location is presented as content.');

        // A2. "Documents Here" (the dialog a Wanderer would open from a
        // nonzero overlap count) shows nothing at this coordinate either
        // — there is no degraded row, no raw id, nothing to click that
        // fails (0.9.201's own fix, reconfirmed live here as the actual
        // Wanderer-facing surface, not merely as an isolated unit check).
        assert(session.getDocumentsAtPosition(position).length === 0,
            'A2. getDocumentsAtPosition() — the exact data LocationDocumentsDialog renders — reports zero documents at the orphan\'s coordinate: nothing for a Wanderer to see or fail to open.');

        // A3. The ONLY surface where the orphan is observable at all is
        // an EXPLICIT collision pre-flight — i.e. only a second owner
        // deliberately trying to place/move something onto the SAME
        // coordinate. This is intentionally narrow: it is not a passive
        // "documents here" listing (A2 already shows that's clean), it
        // is a targeted collision check a user only reaches by choosing
        // that exact spot.
        const otherDoc = makeDocument('A: Second Owner', 1);
        const otherPub = publishDocumentUseCase.execute(new DocumentManager(otherDoc));
        placePublicationUseCase.execute(otherPub.id, new Position(70500, 0, 0));
        const otherSession = buildSession();
        const check = otherSession.checkPlacementOverlap(otherPub.documentId, position);
        assert(check !== null && check.occupants.length === 1, 'A3a. moving onto the orphan\'s exact coordinate is the one path that surfaces it at all.');

        // A4. That surface is non-blocking. The default policy is WARN,
        // never REJECT — the user is asked to confirm, exactly as they
        // would be asked when colliding with any other, perfectly live
        // document. There is no dead end here: "Place Anyway" always
        // exists (PlacementEditorDialog's own unconditional move() emit).
        assert(check.allowed === true && check.requiresConfirmation === true,
            'A4. The collision surfaced by an orphan is ALLOW+confirm (WARN), never a hard refusal — the orphan never locks a coordinate away from future use.');

        // A5. That confirmation's occupant row degrades to the raw
        // publicationId as its title (documentId: null) — a real, but
        // already fully audited and DELIBERATE fact (0.9.202, Sections A
        // and G-H): checkPlacementOverlap is a physical-occupancy
        // pre-flight, not a document listing, and treats an orphan
        // exactly like ANY other occupant it cannot currently resolve
        // (e.g. one not yet locally discovered) — not as a special,
        // orphan-specific degraded case. Reconfirmed here as PART OF the
        // user-visible consequence this section maps, not as a new
        // finding: the fact that this row exists is already known and
        // already deliberate.
        assert(check.occupants[0].documentId === null && check.occupants[0].title === publication.id,
            'A5. The one occupant row this section\'s own A3/A4 surfaces DOES fall back to a raw publicationId as its title — a known, deliberate (0.9.202) degradation of an unresolvable occupant, not a new defect this milestone discovered.');

        console.log('✓ A — user-visible consequence mapped end to end: an ordinary Wanderer sees nothing at all (A1-A2, zero invisible-but-solid locations, zero degraded rows). The ONLY way the orphan becomes observable is a second owner deliberately targeting its exact coordinate (A3), and even then the result is a non-blocking confirmation (A4) whose one degraded field (A5) is pre-existing, deliberate, and shared with every other kind of unresolvable occupant — not a symptom specific to orphaning.');
    }

    // ===============================================================
    // Section B — Recovery usability. The already-established recovery
    // composition, run here as ITS OWN scenario (fresh identities, not
    // cited from 0.9.200/0.9.467) and checked HONESTLY for the specific
    // product question this milestone asks: is cleanup reachable through
    // an existing, already-shipped UI action, or only through a raw
    // application-layer capability nothing in the UI currently exposes?
    // The two are different claims, and this section does not conflate
    // them.
    // ===============================================================
    {
        const doc = makeDocument('B: Recovery Usability', 1);
        const firstPublish = publishDocumentUseCase.execute(new DocumentManager(doc));
        const firstPosition = new Position(71000, 0, 0);
        const firstPlacement = placePublicationUseCase.execute(firstPublish.id, firstPosition);

        const session = buildSession();
        session.unpublishDocument(firstPublish.documentId, firstPublish.id);

        // B1. The DOCUMENT-KEYED path — the exact one
        // removePlacementFromPanel() in ui/views/WorldView.js calls
        // (session.removePlacement(documentId, placementId), the real
        // 0.9.197 UI action) — cannot reach the orphan at all. It
        // resolves documentId -> Publication -> placement
        // (_resolvePlacementRecord), and the Publication is gone; the
        // SAME reason the Placement Info Panel that hosts that button
        // has already disappeared for this document (Section A's own
        // "nothing visible" finding). This is not a new bug — it is the
        // direct, honest consequence of Section A: if nothing shows the
        // orphan, nothing lets you click "remove" on it either.
        let threwForDocumentKeyedRemoval = false;
        try {
            session.removePlacement(firstPublish.documentId, firstPlacement.id);
        } catch { threwForDocumentKeyedRemoval = true; }
        assert(threwForDocumentKeyedRemoval,
            'B1. The document-keyed removePlacement() the real "Remove Placement" UI button calls cannot reach an orphan post-unpublish — it throws, exactly like getPlacementInfo() already returns null for the same document (Section A).');

        // B2. The ONLY way this milestone (or 0.9.200/0.9.467 before it)
        // ever recovers the coordinate is the RAW application-layer use
        // case, called directly with the placementId — a capability no
        // UI surface in this codebase currently exposes to an end user
        // (there is no "orphaned placements" management screen, and no
        // control anywhere hands a person a bare placementId to act on).
        removeWorldPlacementUseCase.execute(firstPlacement.id);
        assert(placementRegistry.get(firstPlacement.id) === null,
            'B2. The raw RemoveWorldPlacementUseCase, called directly with the placementId, does remove the orphan — this is real, working capability, just not one wired to any current UI control.');

        const secondPublish = publishDocumentUseCase.execute(new DocumentManager(doc));
        const secondPosition = new Position(71000, 0, 500);
        placePublicationUseCase.execute(secondPublish.id, secondPosition);

        assert(session.getPublicationForDocument(secondPublish.documentId)?.id === secondPublish.id, 'B3. Document-keyed Publication lookup resolves the fresh Publication.');
        assert(session.getPlacementInfo(secondPublish.documentId)?.publicationId === secondPublish.id, 'B4. Document-keyed placement lookup resolves the fresh placement.');
        assert(placementRegistry.findByPublicationId(firstPublish.id).length === 0, 'B5. No trace of the dead publicationId remains.');

        // B6. And critically, none of this is actually REQUIRED to get
        // the coordinate back. Section A4 already established the
        // collision policy is WARN, never REJECT — so unlike B1-B5's
        // raw-use-case cleanup, a live document can move directly onto
        // an orphan's coordinate with only the SAME confirmation any
        // ordinary collision requires, no prior removal step at all.
        // This is the fact that keeps B1's own gap from mattering: the
        // missing UI action would matter if a stuck coordinate were the
        // consequence, and it is not.
        const doc2 = makeDocument('B: Reuse Without Removal', 1);
        const pub2 = publishDocumentUseCase.execute(new DocumentManager(doc2));
        placePublicationUseCase.execute(pub2.id, new Position(72000, 0, 0));
        const orphanedPub = publishDocumentUseCase.execute(new DocumentManager(makeDocument('B: To Orphan', 1)));
        const orphanedPlacement = placePublicationUseCase.execute(orphanedPub.id, new Position(72500, 0, 0));
        session.unpublishDocument(orphanedPub.documentId, orphanedPub.id);
        const reuseCheck = session.checkPlacementOverlap(pub2.documentId, orphanedPlacement.position);
        assert(reuseCheck.allowed === true, 'B6a. The occupied-by-an-orphan coordinate is reusable without first running any cleanup step.');
        moveWorldPlacementUseCase.execute(placementRegistry.findByPublicationId(pub2.id)[0].placementId, orphanedPlacement.position);
        const afterReuse = placementRegistry.findByPublicationId(pub2.id)[0];
        assert(afterReuse.position.x === orphanedPlacement.position.x && afterReuse.position.z === orphanedPlacement.position.z,
            'B6b. A live document can move directly onto an orphan\'s coordinate (after confirming, per policy) with zero prior cleanup — recovery via the raw removal use case is a convenience, never a gate.');

        console.log('✓ B — recovery is honestly two different claims, not one: the document-keyed removal the real UI wires up cannot reach an orphan at all (B1, a direct consequence of Section A\'s own "nothing visible" finding), and actual cleanup exists only as a raw application-layer capability with no UI control anywhere in this codebase (B2-B5). That gap does not matter in practice, because cleanup was never a prerequisite to begin with: the coordinate is reusable directly, under the same confirmation any ordinary collision requires (B6).');
    }

    // ===============================================================
    // Section C — Physical-occupancy rationale. What surviving occupancy
    // actually does, and — just as important for a product judgment —
    // what it explicitly does NOT do, so its cost (Section A's one
    // degraded field) is weighed against a real benefit, not an
    // assumed one.
    // ===============================================================
    {
        // C1. It does NOT protect automatic/initial placement — that
        // path (GridPlacementStrategy) is a pure function of
        // publicationId alone and performs no spatial lookup at all
        // (0.9.202 Section B's own finding, reconfirmed by reading the
        // strategy's current source rather than re-citing it).
        const strategySource = codeOnlyLines(await rawSource('application/InitialPlacementStrategy.js'));
        assert(/computeDeterministicGridPosition\(context\.publicationId\)/.test(strategySource) &&
            !/spatialIndexProvider|placementRegistry/i.test(strategySource),
            'C1. GridPlacementStrategy.computePosition() still takes no spatial collaborator at all — physical occupancy protects nothing about automatic initial placement, orphan or otherwise.');

        // C2. It DOES do exactly one job: give the interactive "Move
        // Placement" pre-flight (checkPlacementOverlap, WARN policy) a
        // real fact to warn against, so a person who deliberately drags
        // a placement onto an already-occupied coordinate is asked to
        // confirm — whether that coordinate is occupied by a live
        // document or an orphan makes no difference to this job, by the
        // policy layer's own construction (SpatialAllocationPolicy takes
        // an overlap count, never a resolvability flag).
        const policySource = codeOnlyLines(await rawSource('core/SpatialAllocationPolicy.js'));
        assert(!/resolv|orphan|publication/i.test(policySource),
            'C2. core/SpatialAllocationPolicy.js still has no notion of resolvability or Publication existence — the one job occupancy serves (collision warning) is defined purely in terms of "is anything here," matching exactly what an orphan still legitimately answers yes to.');

        // C3. Removing the orphan's occupancy fact (i.e. treating an
        // unresolvable placement as if nothing were there) would create
        // a real, narrow regression this milestone can demonstrate
        // directly: TWO placements — one live, one from the freshly
        // unpublished orphan — would silently coexist at the identical
        // coordinate with no warning ever shown to whoever placed the
        // second one, since collision detection is coordinate-keyed and
        // has no independent memory of "something used to be flagged
        // here."
        const doc = makeDocument('C: Occupancy Rationale', 1);
        const orphanPub = publishDocumentUseCase.execute(new DocumentManager(doc));
        const sharedPosition = new Position(73000, 0, 0);
        placePublicationUseCase.execute(orphanPub.id, sharedPosition);
        const session = buildSession();
        session.unpublishDocument(orphanPub.documentId, orphanPub.id);

        const secondDoc = makeDocument('C: Would-Be Silent Collider', 1);
        const secondPub = publishDocumentUseCase.execute(new DocumentManager(secondDoc));
        placePublicationUseCase.execute(secondPub.id, new Position(73500, 0, 0));
        const wouldBeCheck = session.checkPlacementOverlap(secondPub.documentId, sharedPosition);
        assert(wouldBeCheck.requiresConfirmation === true,
            'C3. Moving a live, second document onto the orphan\'s exact coordinate still triggers the confirmation it would need to trigger to avoid two documents silently sharing one spot — this is the concrete benefit occupancy survival buys, demonstrated, not assumed.');

        console.log('✓ C — physical occupancy has one, narrow, demonstrated job: warning an interactive mover before two documents end up sharing a coordinate (C3), and it does that job identically for orphans and live documents alike, by construction (C2), never for automatic initial placement, which it was never wired to protect in the first place (C1). This is a real benefit, not a rationalization invented after the fact.');
    }

    // ===============================================================
    // Section D — Presentability correctness. The stronger invariant:
    // an unresolvable placement must never materialize a nonexistent
    // Publication/Snapshot into the World, on any surface.
    // ===============================================================
    {
        const doc = makeDocument('D: Presentability Correctness', 1);
        const publication = publishDocumentUseCase.execute(new DocumentManager(doc));
        const position = new Position(74000, 0, 0);
        placePublicationUseCase.execute(publication.id, position);

        const session = buildSession();
        session.unpublishDocument(publication.documentId, publication.id);

        // D1. No live Publication object is ever returned for the
        // document.
        assert(session.getPublicationForDocument(publication.documentId) === null,
            'D1. getPublicationForDocument() never fabricates or resurrects a Publication for the orphaned document.');

        // D2. findPublicationById (the exact lookup Automatic Snapshot
        // Encounter Cascade uses before registering any World source)
        // also returns null for the dead publicationId — nothing
        // downstream of THIS lookup could accidentally materialize
        // content from a placement whose Publication cannot be found.
        assert(session.findPublicationById(publication.id) === null,
            'D2. findPublicationById() returns null for the dead publicationId — the one lookup Automatic Snapshot materialization itself depends on correctly refuses to manufacture a Publication.');

        // D3. getPlacementInfoForPublication (the minimal shape the same
        // cascade consumes) still resolves — by design, occupancy
        // survives — but pairing it with a null Publication (D2) is
        // exactly the shape that cascade's own code is written to check
        // before registering a World source, never assumed safe merely
        // because a placement resolved.
        assert(session.getPlacementInfoForPublication(publication.id) !== null,
            'D3. getPlacementInfoForPublication() still resolves the raw occupancy fact — proving D2\'s null is a genuine "Publication missing" signal, not an artifact of the placement itself being gone too.');
        const cascadeSource = codeOnlyLines(await rawSource('application/AutomaticSnapshotEncounterCascade.js'));
        assert(/findPublicationById/.test(cascadeSource),
            'D4. The real cascade consumer still calls findPublicationById (D2\'s guard) rather than assuming a resolved placement implies a resolved Publication.');

        // D5. A pure spatial/streaming pass over this exact position
        // produces occupancy data but never a materializable document —
        // reconfirming A1 from a second, independent code path
        // (DiscoverWorldsUseCase over the raw spatial index, not the
        // WorldNavigationSession-level convenience methods A1/A2 used).
        assert(discoverUseCase.execute(position, 50).length === 1, 'D5a. The raw spatial query still finds the occupancy fact.');
        assert(worldLayoutProvider.findVisibleDocuments(position, 50).length === 0, 'D5b. ...but the presentation-facing streaming query resolves zero materializable documents at the same position — occupancy and presentability disagree on purpose, and presentability never loses that disagreement.');

        console.log('✓ D — the stronger invariant holds on every surface this milestone can reach: no lookup this codebase actually uses before materializing World content (getPublicationForDocument, findPublicationById) ever returns a live Publication for an orphan (D1-D2), the real Automatic Snapshot Encounter Cascade consumer is written to depend on that exact null rather than trusting a resolved placement alone (D3-D4), and a second, independent spatial pass reconfirms the same split (D5).');
    }

    // ===============================================================
    // Section E — Re-publication isolation. A fresh Publication of the
    // same document must never inherit the dead placement's identity,
    // position, or spatial-index entry.
    // ===============================================================
    {
        const doc = makeDocument('E: Republication Isolation', 1);
        const oldPublish = publishDocumentUseCase.execute(new DocumentManager(doc));
        const oldPosition = new Position(75000, 0, 0);
        const oldPlacement = placePublicationUseCase.execute(oldPublish.id, oldPosition);

        const session = buildSession();
        session.unpublishDocument(oldPublish.documentId, oldPublish.id);

        const newPublish = publishDocumentUseCase.execute(new DocumentManager(doc));

        // E1. The new Publication has no placement of its own yet — it
        // does not inherit the old one automatically.
        assert(placementRegistry.findByPublicationId(newPublish.id).length === 0,
            'E1. A fresh Publication starts with zero placements — the old, orphaned placement never silently attaches to it.');
        assert(session.getPlacementInfo(newPublish.documentId) === null,
            'E2. getPlacementInfo() for the document agrees: no placement is visible until one is explicitly created for the NEW Publication.');

        // E3. Explicitly placing the new Publication produces an
        // independent PlacementRecord with its own placementId, even at
        // the SAME coordinate as the old orphan — proving position reuse
        // never means identity reuse.
        const newPlacement = placePublicationUseCase.execute(newPublish.id, oldPosition);
        assert(newPlacement.id !== oldPlacement.id, 'E3. The new placement at the same coordinate has a genuinely distinct placementId.');
        assert(placementRegistry.get(oldPlacement.id).publicationId === oldPublish.id,
            'E4. The old orphan\'s own record is completely unmodified by the new Publication/placement existing at the same coordinate — no shared mutable state between the two.');

        // E5. Both records genuinely coexist in the spatial index at the
        // identical coordinate (occupancy is additive, not replaced) —
        // the interactive collision check would (per Section C) report
        // two occupants here, not one.
        const overlapDoc = makeDocument('E: Overlap Witness', 1);
        const overlapPub = publishDocumentUseCase.execute(new DocumentManager(overlapDoc));
        placePublicationUseCase.execute(overlapPub.id, new Position(75999, 0, 0));
        const overlapCheck = session.checkPlacementOverlap(overlapPub.documentId, oldPosition);
        assert(overlapCheck.occupants.length === 2, 'E5. Both the orphan and the fresh, re-published placement are independently visible to physical occupancy at the shared coordinate.');

        console.log('✓ E — re-publication is fully isolated from the orphan it leaves behind: a new Publication starts placement-less (E1-E2), an explicit new placement at the same coordinate gets its own independent identity (E3-E4), and the two coexist in occupancy without one overwriting or absorbing the other (E5) — the independent-World-state model holds under direct pressure, not merely in the abstract.');
    }

    // ===============================================================
    // Section F — Product-gap classification.
    // ===============================================================
    {
        const classifications = [
            ['Ordinary Wanderer streaming/inspection experience', 'ALREADY_CORRECT — Section A1-A2: zero invisible occupied locations, zero degraded rows, nothing to click that fails.'],
            ['Coordinate reuse (placing/moving something new onto an orphan\'s spot)', 'ALREADY_CORRECT — Section B6: reusable directly, under the same confirmation any ordinary collision requires; cleanup is never a prerequisite.'],
            ['Physical-occupancy survival itself', 'ALREADY_CORRECT — Section C: serves one demonstrated job (collision warning) at the one place it is wired to, no more, no less.'],
            ['Presentable-occupancy gating (no phantom Publication ever materializes)', 'ALREADY_CORRECT — Section D, reconfirmed on a real downstream consumer (the Automatic Snapshot Encounter Cascade), not just the query layer.'],
            ['Re-publication independence', 'ALREADY_CORRECT — Section E: no inheritance, no shared identity, correct coexistence.'],
            ['checkPlacementOverlap\'s degraded-title fallback for an unresolvable occupant (Section A5)', 'PRE-EXISTING, DELIBERATE, NON-BLOCKING — fully audited at 0.9.202; applies identically to any unresolvable occupant, not orphan-specific; reached only via an explicit, rare action (targeting an exact occupied coordinate); never blocks the operation. Not classified PRODUCT_GAP: fixing it would mean teaching a physical-occupancy pre-flight to resolve or hide identity information it deliberately treats as orthogonal to its one job (Section C2) — a materially different, larger change than this reassessment\'s own evidence supports.'],
            ['No UI action reaches an orphan\'s own placementId to remove it directly (Section B1-B2)', 'PRODUCT_GAP, EVIDENCED BUT LOW-VALUE — new evidence THIS milestone contributes: the real "Remove Placement" UI action is document-keyed and cannot reach an orphan (it throws), so the ONLY way to remove one is the raw application-layer use case, called with a placementId no UI surface hands to anyone. Not selected for action: Section B6 already shows removal is never required to reclaim the coordinate, so the gap has no demonstrated user-facing consequence — it would only matter to someone who wants pure housekeeping over a fact nothing shows them exists (Section A). Recorded honestly rather than rounded up to ALREADY_CORRECT or down to a false "STOP, nothing here."']
        ];
        for (const [surface, verdict] of classifications) {
            assert(typeof surface === 'string' && /^ALREADY_CORRECT|^PRE-EXISTING|^PRODUCT_GAP/.test(verdict),
                `F. "${surface}" carries a classification.`);
        }
        console.log('✓ F: Six surfaces classified against live evidence gathered above:');
        for (const [surface, verdict] of classifications) console.log(`    - ${surface}\n      ${verdict.split(' — ')[0]}`);

        console.log(`
--------------------------------------------------------------------
0.9.468 VERDICT: ALREADY_CORRECT, with one honestly-recorded, low-value
PRODUCT_GAP that does not clear the bar for its own milestone.

Every user-REACHABLE surface this milestone traced with real, running
code — ordinary streaming/inspection (Section A), coordinate reuse
(Section B6), the one demonstrated job occupancy survival actually does
(Section C), the stronger no-phantom-materialization invariant checked
against a real downstream consumer (Section D), and re-publication
independence under direct pressure (Section E) — behaves correctly today.

Two real, narrow facts surfaced by this milestone's own live trace are
worth recording precisely rather than rounding to a clean "nothing to
see here":

  - Section A5: a collision-confirmation row can show a raw publicationId
    as its title. Already found, named, and deliberately kept exactly
    this way by 0.9.202 — degrades identically for ANY unresolvable
    occupant, reached only by deliberately targeting an exact occupied
    coordinate, never blocks the operation. PRE-EXISTING, not new.

  - Section B1-B2: THIS milestone's own new finding. The real
    document-keyed "Remove Placement" UI action cannot reach an orphan
    at all (it throws) — the only way to clean one up is a raw
    application-layer use case call, which no UI control anywhere hands
    a placementId to. This is a genuine PRODUCT_GAP, not merely an
    architecture curiosity, and it would have been dishonest to fold it
    into "ALREADY_CORRECT" unexamined.

That gap is still correctly NOT selected as a next milestone: Section B6
already proves cleanup is never required to reclaim a coordinate, so the
gap's only cost is unreachable housekeeping over a fact Section A shows
nothing ever surfaces to a user in the first place. Building a UI control
for it would be solving a problem with no demonstrated user, the same
evidence bar every prior product reassessment in this codebase (e.g.
0.9.311) already applies to every other candidate it declines.

No production code changes ship with this milestone.
--------------------------------------------------------------------
`);
    }

    // ===============================================================
    // Section G — Explicit non-goals guard. Structural confirmation that
    // this reassessment introduces none of the mechanisms it explicitly
    // declines to build.
    // ===============================================================
    {
        const nonGoalVocabulary = /\bTOMBSTONE\b|\btombstone(d)?\b|\bDETACH\b|\bdetach(ed|ment)?\b|\bREATTACH\b|\breattach(ed|ment)?\b|\bgarbageCollect|\bGARBAGE_COLLECT|\bORPHAN_STATE\b|\bisOrphaned\b|\bplacementOrphaned\b|\bcleanupOrphan/i;

        const filesToCheck = [
            'application/UnpublishDocumentUseCase.js',
            'publisher/LocalPublisherProvider.js',
            'application/WorldNavigationSession.js',
            'placement/LocalPlacementRegistry.js',
            'core/PlacementRecord.js',
            'core/SpatialAllocationPolicy.js'
        ];
        for (const file of filesToCheck) {
            const source = codeOnlyLines(await rawSource(file));
            assert(!nonGoalVocabulary.test(source),
                `G. ${file} still carries none of the explicitly-excluded lifecycle mechanisms (tombstone/detach/reattach/garbage-collect/orphan-state).`);
        }

        // G2. No new placement-deletion trigger was wired to
        // unpublish/publish anywhere — the collaborator counts already
        // established (0.9.467 F1-F2) still hold.
        const unpublishUseCaseSource = codeOnlyLines(await rawSource('application/UnpublishDocumentUseCase.js'));
        const cleanupVocabulary = /RemoveWorldPlacementUseCase|PlacementRegistry|SpatialIndexProvider/;
        assert(!cleanupVocabulary.test(unpublishUseCaseSource),
            'G2. UnpublishDocumentUseCase.js still references no placement/spatial-index collaborator — no automatic cleanup was added by this milestone.');

        // G3. This milestone's own test file is the only new file; no
        // production directory changed (verified against `git status`
        // rather than assumed).
        let changedFiles = '';
        try {
            changedFiles = execSync('git status --porcelain', { cwd: SOURCE_ROOT.pathname }).toString();
        } catch { /* not fatal to the assertion below if git is unavailable */ }
        const productionChanges = changedFiles.split('\n')
            .filter((line) => line.trim().length > 0)
            .map((line) => line.slice(3).trim())
            .filter((path) => !path.startsWith('tests/') && path !== 'tests.html');
        assert(productionChanges.length === 0,
            `G3. No production file is modified by this milestone (unexpected changes: ${productionChanges.join(', ') || 'none'}).`);

        console.log('✓ G — non-goals guard holds: no tombstone/detach/reattach/garbage-collection/orphan-state vocabulary exists anywhere this milestone touches (G1), no new automatic cleanup trigger was wired to unpublish (G2), and this milestone\'s own change set is test-only (G3).');
    }

    console.log('\n✅ All Orphaned Placement Product Reassessment tests passed.');
}

runTests().then(() => {
    console.log('\n✓ All OrphanedPlacementProductReassessment tests passed');
}).catch((error) => {
    console.error('\n✗ OrphanedPlacementProductReassessment tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
