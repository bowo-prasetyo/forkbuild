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
import { SpatialAllocationPolicy } from '../core/SpatialAllocationPolicy.js';

// 0.9.202 — Unpublished Placement Physical-Occupancy Audit.
//
// Test-only. No production changes. 0.9.201 deliberately drew a line
// between two different questions a "position" can be asked:
//
//   - getDocumentsAtPosition() ("what can a person PRESENT here?") —
//     0.9.201 taught it to omit an orphan entirely.
//   - checkPlacementOverlap() ("what physically OCCUPIES this
//     coordinate?") — 0.9.201's own header, and its Section G, both say
//     this stays unfiltered ON PURPOSE: an orphan remains a real
//     physical occupant for collision purposes.
//
// That second half was asserted narrowly (one occupant, unresolved
// shape) but never exercised end to end: does an orphan actually change
// what happens when someone tries to PLACE or MOVE something onto its
// exact coordinate? This file asks exactly that, with real, running
// code, against the same real (not mocked) collaborators every other
// file in this arc uses — and changes no production behavior either way.
//
// Per this milestone's own brief, it deliberately does NOT:
//   - reject, block, or auto-offset a placement/move that lands on an
//     orphan's position,
//   - tombstone, reattach, or auto-clean an orphaned PlacementRecord,
//   - invent a new Publication/placement lifecycle state, flag, or error, or
//   - decide a cleanup POLICY for the orphan case.
//
// It only establishes, precisely, what the EXISTING placement machinery
// already does — so that decision (Outcome 1 vs Outcome 2, see the
// closing summary) can be made with evidence instead of assumption.

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
    const publishDocumentUseCase = new PublishDocumentUseCase(publisher, alice);
    const documentCloneService = new DocumentCloneService();

    // Every session built by this file uses the DEFAULT
    // SpatialAllocationPolicy (WARN) unless a section explicitly says
    // otherwise — the same default every real WorldNavigationSession in
    // production runs with (see WorldNavigationSession's own
    // constructor default).
    function buildSession(extra = {}) {
        const session = new WorldNavigationSession({
            registry, loadPublicationDocumentUseCase, worldLayoutProvider,
            saveDocumentUseCase, publishDocumentUseCase, identityProvider: alice,
            documentCloneService, discoveryProvider, placementRegistry,
            removeWorldPlacementUseCase, unpublishDocumentUseCase, moveWorldPlacementUseCase,
            ...extra
        });
        session._session = stubRenderer();
        return session;
    }

    // Creates an already-placed, still-published "mover" document whose
    // OWN placement is used purely as the vantage point
    // checkPlacementOverlap() requires (it answers "if I moved THIS
    // placement to newPosition, what's there" — it is not usable
    // without an existing placement of its own; see Section B1 below,
    // which establishes that fact directly rather than assuming it).
    function makeMover(session, label, position) {
        const publication = publishDocumentUseCase.execute(new DocumentManager(makeDocument(label)));
        placePublicationUseCase.execute(publication.id, position);
        return publication;
    }

    // -------------------------------------------------------------
    // A — Physical occupancy after unpublish. Confirm that the orphan
    // remains visible to checkPlacementOverlap() exactly as before, with
    // nothing about the COUNT or GEOMETRY of what it reports changed by
    // unpublishing — only the RESOLVED shape of that one occupant
    // degrades, exactly as 0.9.201 documented.
    // -------------------------------------------------------------
    {
        const session = buildSession();
        const target = publishDocumentUseCase.execute(new DocumentManager(makeDocument('A: Target')));
        const position = new Position(40000, 0, 0);
        placePublicationUseCase.execute(target.id, position);

        const mover = makeMover(session, 'A: Mover', new Position(40500, 0, 0));

        const before = session.checkPlacementOverlap(mover.documentId, position);
        assert(before !== null, 'A1. BEFORE unpublish: checkPlacementOverlap runs normally against the target\'s position');
        assert(before.occupants.length === 1, 'A2. BEFORE: exactly one physical occupant reported');
        assert(before.occupants[0].documentId === target.documentId, 'A3. BEFORE: that occupant resolves to the target document');

        session.unpublishDocument(target.documentId, target.id);

        const after = session.checkPlacementOverlap(mover.documentId, position);
        assert(after !== null, 'A4. AFTER unpublish: checkPlacementOverlap STILL runs — never refuses merely because an occupant it will find is now orphaned');
        assert(after.occupants.length === 1, 'A5. AFTER: STILL exactly one physical occupant — unpublishing removed nothing from physical occupancy, only from the document-facing read models 0.9.200/0.9.201 already covered');
        assert(after.occupants[0].documentId === null, 'A6. AFTER: the SAME occupant now reports documentId: null — the resolution degrades, the occupancy fact itself does not');
        assert(after.occupants[0].publicationId === target.id, 'A7. AFTER: the occupant is still identified by the target\'s own (now-dead) publicationId, not blanked or substituted');

        console.log('✓ A — an orphan remains visible to checkPlacementOverlap() exactly as before unpublishing: same occupant count, same identity, only the resolved documentId/title degrade');
    }

    // -------------------------------------------------------------
    // B — Placement collision. What happens when an ORDINARY (fresh,
    // never-before-placed) publication is placed at the orphan's exact
    // position?
    // -------------------------------------------------------------
    {
        const session = buildSession();
        const orphanSource = publishDocumentUseCase.execute(new DocumentManager(makeDocument('B: Orphan Source')));
        const position = new Position(41000, 0, 0);
        const orphanPlacement = placePublicationUseCase.execute(orphanSource.id, position);
        session.unpublishDocument(orphanSource.documentId, orphanSource.id);

        // B1 — checkPlacementOverlap cannot even be asked the question
        // for a document that has never been placed: it resolves a
        // placement FOR the requesting document first (the placement
        // being "moved"), and a fresh publication has none yet. This is
        // true regardless of orphans — it is the existing "null when
        // the question doesn't apply" rule (see the method's own
        // header) — but it means INITIAL placement never goes through
        // this pre-flight check at all, orphan or not.
        const incoming = publishDocumentUseCase.execute(new DocumentManager(makeDocument('B: Incoming')));
        assert(session.checkPlacementOverlap(incoming.documentId, position) === null,
            'B1. checkPlacementOverlap(documentId, position) returns null for a not-yet-placed document — there is no pre-flight collision check in the initial-placement path for ANY position, orphaned or not (see WorldNavigationSession\'s own 0.2.25 comment: automatic/initial placement is deliberately not routed through this policy)');

        // B2 — PlacePublicationUseCase itself performs no overlap
        // check of its own either (see its own source: it never reads
        // placementRegistry.list() or calls detectSpatialOverlap at
        // all) — placing directly AT the orphan's coordinate succeeds
        // exactly like placing anywhere else.
        let placed;
        let threw = false;
        try {
            placed = placePublicationUseCase.execute(incoming.id, position);
        } catch (e) {
            threw = true;
        }
        assert(!threw, 'B2. placePublicationUseCase.execute() does not throw, warn, refuse, or auto-offset when the requested position is already occupied by an orphan — it PERMITS the placement unconditionally, the same as it would against any other occupant');
        assert(placed.position.x === position.x && placed.position.z === position.z, 'B3. the new placement lands at EXACTLY the requested position — no silent auto-offset occurred');

        // B4 — both records now genuinely coexist at the same
        // coordinate: the orphan was never displaced, removed, or
        // overwritten by the new arrival.
        assert(placementRegistry.get(orphanPlacement.id) !== null, 'B4. the orphan\'s own PlacementRecord is untouched by the new placement landing on top of it');
        assert(placementRegistry.get(placed.id) !== null, 'B5. the new PlacementRecord exists independently, its own placementId distinct from the orphan\'s');
        const coOccupants = placementRegistry.list().filter((r) => r.position.x === position.x && r.position.z === position.z);
        assert(coOccupants.length === 2, 'B6. exactly two PlacementRecords now genuinely share this coordinate — the orphan and the new arrival');

        // B7 — the new arrival itself is completely unaffected by
        // sharing a coordinate with an orphan: it resolves normally
        // through every ordinary read model.
        assert(session.getPlacementInfo(incoming.documentId)?.placementId === placed.id, 'B7. the new document\'s OWN document-keyed placement lookup resolves normally, undisturbed by the co-located orphan');
        assert(worldLayoutProvider.findVisibleDocuments(position, 50).includes(incoming.documentId), 'B8. the new document streams in normally at this position');

        console.log('✓ B — an ordinary, fresh placement at an orphan\'s exact position is PERMITTED unconditionally: initial placement has no pre-flight collision check at all (orphaned or not), and PlacePublicationUseCase itself performs none either — the new placement lands exactly where requested, fully functional, alongside the still-present orphan');
    }

    // -------------------------------------------------------------
    // C — Movement collision. Does an EXPLICIT move onto an orphan's
    // position follow the SAME physical rules as moving onto any other
    // occupied position — or is the orphan special-cased in either
    // direction?
    // -------------------------------------------------------------
    {
        const session = buildSession();

        // One orphan, one ordinary (still-published) occupant, at two
        // different positions, so the SAME mover's move-onto-either
        // can be compared directly, in the same section, under
        // identical conditions.
        const orphanSource = publishDocumentUseCase.execute(new DocumentManager(makeDocument('C: Orphan Source')));
        const orphanPosition = new Position(42000, 0, 0);
        placePublicationUseCase.execute(orphanSource.id, orphanPosition);
        session.unpublishDocument(orphanSource.documentId, orphanSource.id);

        const ordinaryOccupant = publishDocumentUseCase.execute(new DocumentManager(makeDocument('C: Ordinary Occupant')));
        const ordinaryPosition = new Position(42500, 0, 0);
        placePublicationUseCase.execute(ordinaryOccupant.id, ordinaryPosition);

        const mover = makeMover(session, 'C: Mover', new Position(43000, 0, 0));

        // C1/C2 — the default (WARN) policy decision is IDENTICAL in
        // shape for both destinations: allowed, but requiring
        // confirmation. The orphan is not silently let through with
        // less friction, nor blocked with more.
        const towardOrphan = session.checkPlacementOverlap(mover.documentId, orphanPosition);
        const towardOrdinary = session.checkPlacementOverlap(mover.documentId, ordinaryPosition);
        assert(towardOrphan.allowed === true && towardOrphan.requiresConfirmation === true,
            'C1. moving onto the orphan\'s position: allowed, requiresConfirmation — the WARN policy\'s ordinary decision, not a hard block');
        assert(towardOrdinary.allowed === true && towardOrdinary.requiresConfirmation === true,
            'C2. moving onto the ordinary, still-published occupant\'s position: the IDENTICAL decision shape — proving the orphan gets no special treatment, worse or better, from the policy layer');

        // C3 — movePlacement() itself, like PlacePublicationUseCase,
        // never consults the policy decision on its own (that is the
        // CALLER's — the UI's — responsibility, per
        // docs/Principles.md, "Overlap Is A Fact; Collision Is A
        // Policy Decision"). Calling it directly against the orphan's
        // position, without ever inspecting the WARN decision above,
        // succeeds unconditionally — exactly like B2 already
        // established for initial placement.
        const moved = session.movePlacement(mover.documentId, orphanPosition);
        assert(moved.position.x === orphanPosition.x && moved.position.z === orphanPosition.z, 'C3. movePlacement() actually moves the mover onto the orphan\'s exact coordinate when called directly, unconditionally — the pre-flight check is advisory to the caller, never enforced by the mutation itself');

        // C4 — after the move, physical occupancy at that position
        // reflects BOTH the orphan and the mover's placement, sharing
        // the coordinate exactly like B4-B6 already established for a
        // fresh placement.
        const after = placementRegistry.list().filter((r) => r.position.x === orphanPosition.x && r.position.z === orphanPosition.z);
        assert(after.length === 2, 'C4. after the move, exactly two PlacementRecords occupy the orphan\'s former-lone position — the orphan and the moved-in mover');

        console.log('✓ C — an explicit move onto an orphan\'s position produces the IDENTICAL policy decision (allowed + requiresConfirmation) as moving onto any other occupied position, and the underlying move itself is permitted unconditionally when the caller proceeds — the orphan participates in the exact same physical rules as any other occupant, no better and no worse');
    }

    // -------------------------------------------------------------
    // D — Document presentation isolation. Re-confirm 0.9.201's result
    // holds even in the CO-OCCUPIED case this file specifically
    // constructs: one orphan and one resolvable placement sharing a
    // single coordinate, checked side by side through both surfaces at
    // once.
    // -------------------------------------------------------------
    {
        const session = buildSession();
        const orphanSource = publishDocumentUseCase.execute(new DocumentManager(makeDocument('D: Orphan Source')));
        const position = new Position(44000, 0, 0);
        placePublicationUseCase.execute(orphanSource.id, position);
        session.unpublishDocument(orphanSource.documentId, orphanSource.id);

        const resolvable = publishDocumentUseCase.execute(new DocumentManager(makeDocument('D: Resolvable')));
        placePublicationUseCase.execute(resolvable.id, position);

        const mover = makeMover(session, 'D: Mover', new Position(44500, 0, 0));

        // Documents Here: exactly one row, the resolvable one.
        const presented = session.getDocumentsAtPosition(position);
        assert(presented.length === 1, 'D1. "Documents Here" at the shared position shows exactly ONE row, not two — the orphan is omitted even while genuinely co-located with a resolvable document');
        assert(presented[0].documentId === resolvable.documentId, 'D2. ...and that one row is the resolvable document, correctly identified');

        // Physical occupancy: exactly two occupants, orphan included.
        const physical = session.checkPlacementOverlap(mover.documentId, position);
        assert(physical.occupants.length === 2, 'D3. checkPlacementOverlap at the SAME position reports BOTH physical occupants — the orphan is not invisible to collision detection merely because it is invisible to presentation');
        const resolvedCount = physical.occupants.filter((o) => o.documentId !== null).length;
        assert(resolvedCount === 1, 'D4. exactly one of those two physical occupants resolves to a document — the other is the orphan, present but unresolved, confirming the split is real and not an artifact of either query alone');

        console.log('✓ D — at one and the same position, "Documents Here" presents exactly the resolvable occupant while checkPlacementOverlap reports both — the presentation/physical-occupancy split 0.9.201 established holds even under genuine co-occupancy, not merely for an orphan in isolation');
    }

    // -------------------------------------------------------------
    // E — Recovery. The existing clean recovery sequence (0.9.200
    // Section G) still works, checked here specifically against
    // PHYSICAL occupancy rather than the document-keyed read models
    // 0.9.200 already covered.
    // -------------------------------------------------------------
    {
        const session = buildSession();
        const orphanSource = publishDocumentUseCase.execute(new DocumentManager(makeDocument('E: Orphan Source')));
        const position = new Position(45000, 0, 0);
        const orphanPlacement = placePublicationUseCase.execute(orphanSource.id, position);
        session.unpublishDocument(orphanSource.documentId, orphanSource.id);

        const mover = makeMover(session, 'E: Mover', new Position(45500, 0, 0));
        const before = session.checkPlacementOverlap(mover.documentId, position);
        assert(before.occupants.length === 1, 'E1. sanity: the orphan is still a physical occupant before recovery');

        // Remove the orphan through the existing raw-capable operation
        // — RemoveWorldPlacementUseCase given the placementId directly
        // (the same bypass 0.9.199/0.9.200 already established, since
        // the document-keyed removePlacement() can no longer resolve
        // it once unpublished).
        removeWorldPlacementUseCase.execute(orphanPlacement.id);

        const afterRemoval = session.checkPlacementOverlap(mover.documentId, position);
        assert(afterRemoval.occupants.length === 0, 'E2. after removal, physical occupancy at the old position is genuinely empty — checkPlacementOverlap, not just the document-keyed read models, confirms nothing is left there');
        assert(spatialIndexProvider.get(orphanPlacement.id) === null, 'E3. the raw spatial index entry is gone too, not merely the registry record');

        // Publish and place again — a fully ordinary flow.
        const republished = publishDocumentUseCase.execute(new DocumentManager(makeDocument('E: Republished')));
        const replaced = placePublicationUseCase.execute(republished.id, position);

        const afterRecovery = session.checkPlacementOverlap(mover.documentId, position);
        assert(afterRecovery.occupants.length === 1 && afterRecovery.occupants[0].documentId === republished.documentId,
            'E4. after publish/place recovery, physical occupancy at that position shows exactly the new, fully-resolved document — no trace of the original orphan remains, physically or otherwise');
        assert(placementRegistry.findByPublicationId(orphanSource.id).length === 0, 'E5. no PlacementRecord anywhere still references the original, long-dead publicationId');

        console.log('✓ E — unpublish → remove the orphan via the raw-capable operation → publish → place still recovers a fully clean state, confirmed directly against PHYSICAL occupancy (checkPlacementOverlap, the raw spatial index), not merely the document-keyed read models 0.9.200 already checked');
    }

    // -------------------------------------------------------------
    // F — Cross-document isolation. An orphan from document A must
    // never alter physical-occupancy results for an unrelated document
    // B's position.
    // -------------------------------------------------------------
    {
        const session = buildSession();
        const orphanSource = publishDocumentUseCase.execute(new DocumentManager(makeDocument('F: Orphan A')));
        const orphanPosition = new Position(46000, 0, 0);
        placePublicationUseCase.execute(orphanSource.id, orphanPosition);
        session.unpublishDocument(orphanSource.documentId, orphanSource.id);

        const untouchedB = publishDocumentUseCase.execute(new DocumentManager(makeDocument('F: Untouched B')));
        const positionB = new Position(47000, 0, 0);
        const placementB = placePublicationUseCase.execute(untouchedB.id, positionB);

        const mover = makeMover(session, 'F: Mover', new Position(48000, 0, 0));

        const overlapAtB = session.checkPlacementOverlap(mover.documentId, positionB);
        assert(overlapAtB.occupants.length === 1, 'F1. physical occupancy at B\'s position shows exactly one occupant — A\'s orphan (at a completely different coordinate) never leaks in');
        assert(overlapAtB.occupants[0].documentId === untouchedB.documentId, 'F2. ...and it is correctly B itself, fully resolved');
        assert(overlapAtB.occupants[0].publicationId === untouchedB.id, 'F3. ...keyed by B\'s own publicationId, not A\'s');

        // B's own read models are untouched too, as every prior file in
        // this arc already established for its own surfaces — repeated
        // here against checkPlacementOverlap specifically.
        assert(session.getPlacementInfo(untouchedB.documentId)?.placementId === placementB.id, 'F4. B\'s document-keyed placement lookup remains correct');

        console.log('✓ F — an orphan in document A never alters checkPlacementOverlap\'s result for an unrelated document B\'s position: no cross-document leakage of any kind');
    }

    // -------------------------------------------------------------
    // G — Identity. Collision behavior is driven by the existing
    // placement identity/geometry machinery (position + placementId),
    // never by a reconstructed documentId or publicationId.
    // -------------------------------------------------------------
    {
        const session = buildSession();
        const orphanSource = publishDocumentUseCase.execute(new DocumentManager(makeDocument('G: Orphan Source')));
        const position = new Position(49000, 0, 0);
        const orphanPlacement = placePublicationUseCase.execute(orphanSource.id, position);
        session.unpublishDocument(orphanSource.documentId, orphanSource.id);

        const mover = makeMover(session, 'G: Mover', new Position(49500, 0, 0));
        const check = session.checkPlacementOverlap(mover.documentId, position);

        // The occupant reported is derived from the SAME raw record —
        // same (dead) publicationId — not a value reconstructed from
        // the (now-unresolvable) documentId, which does not even exist
        // for this occupant. _describeSpatialOccupant()'s own returned
        // shape (documentId/publicationId/title/owner) is checked
        // field-by-field below.
        const rawOccupant = placementRegistry.list().find((r) => r.position.x === position.x && r.position.z === position.z);
        assert(rawOccupant.placementId === orphanPlacement.id, 'G1. the raw PlacementRecord backing the occupant is identified by its own placementId, unchanged since creation');
        assert(check.occupants[0].publicationId === rawOccupant.publicationId, 'G2. the reported occupant\'s publicationId is read directly off the raw record — never invented, blanked, or substituted because the publication is dead');
        assert(check.occupants[0].documentId === null, 'G3. documentId is null (unresolvable) — never reconstructed from the publicationId, position, or any other value; this is a genuine "cannot resolve," not a degraded guess');

        // detectSpatialOverlap itself (core/SpatialOverlap.js) matches
        // occupants by POSITION and excludes by placementId ONLY — it
        // has no publicationId- or documentId-aware branch at all, so
        // there is no code path here for an orphan to take that a live
        // placement would not also take.
        const overlapSource = await rawSource('core/SpatialOverlap.js');
        const overlapBody = codeOnlyLines(overlapSource).join('\n');
        assert(!/discoveryProvider|publicationId\s*[!=]==?\s*null|documentId/.test(overlapBody),
            'G4. detectSpatialOverlap() (core/SpatialOverlap.js) contains no publicationId-existence check, no documentId reference, and no discoveryProvider dependency of any kind — matching is purely positional, by placementId, identical for an orphan and a live placement alike');

        console.log('✓ G — collision behavior is driven entirely by the existing placement identity (placementId) and geometry (position) machinery; nothing about an orphan\'s reported identity is reconstructed, guessed, or specially derived');
    }

    // -------------------------------------------------------------
    // H — Structural boundary. Collision detection remains
    // independent of Publication unpublish state, Snapshot machinery,
    // Nostr/Arweave, and introduces no new orphan-lifecycle vocabulary.
    // -------------------------------------------------------------
    {
        const overlapSource = codeOnlyLines(await rawSource('core/SpatialOverlap.js')).join('\n');
        const policySource = codeOnlyLines(await rawSource('core/SpatialAllocationPolicy.js')).join('\n');
        const placeSource = codeOnlyLines(await rawSource('application/PlacePublicationUseCase.js')).join('\n');
        const moveSource = codeOnlyLines(await rawSource('application/MoveWorldPlacementUseCase.js')).join('\n');
        const sessionSource = codeOnlyLines(await rawSource('application/WorldNavigationSession.js')).join('\n');

        const unpublishAwareness = /UnpublishDocumentUseCase|isPublished|publicationExists|\bunpublish(ed)?\b/i;
        assert(!unpublishAwareness.test(overlapSource), 'H1. core/SpatialOverlap.js never references UnpublishDocumentUseCase or any unpublish/isPublished concept');
        assert(!unpublishAwareness.test(policySource), 'H2. core/SpatialAllocationPolicy.js never references UnpublishDocumentUseCase or any unpublish/isPublished concept — collision POLICY is defined purely in terms of allow/warn/reject/auto_offset, with no case for "occupant is orphaned"');
        assert(!unpublishAwareness.test(moveSource), 'H3. application/MoveWorldPlacementUseCase.js never references unpublish state — a move executes identically whether its destination is empty, live-occupied, or orphan-occupied');

        const forbiddenCollaborators = /Snapshot|Nostr|Arweave/;
        assert(!forbiddenCollaborators.test(overlapSource), 'H4. core/SpatialOverlap.js has no dependency on Snapshot machinery, Nostr, or Arweave');
        assert(!forbiddenCollaborators.test(policySource), 'H5. core/SpatialAllocationPolicy.js has no dependency on Snapshot machinery, Nostr, or Arweave');
        assert(!forbiddenCollaborators.test(placeSource), 'H6. application/PlacePublicationUseCase.js has no dependency on Snapshot machinery, Nostr, or Arweave in its own placement logic');

        const noNewOrphanVocabulary = /\borphan(ed)?\b|\bisOrphaned\b|\bplacementOrphaned\b|\bUNPUBLISHED_PLACEMENT\b|\bSTALE_PUBLICATION\b/i;
        assert(!noNewOrphanVocabulary.test(overlapSource), 'H7. core/SpatialOverlap.js introduces no orphan-lifecycle vocabulary');
        assert(!noNewOrphanVocabulary.test(policySource), 'H8. core/SpatialAllocationPolicy.js introduces no orphan-lifecycle vocabulary');
        assert(!noNewOrphanVocabulary.test(sessionSource), 'H9. WorldNavigationSession.js still introduces no orphaned/isOrphaned vocabulary in code (0.9.199/0.9.200\'s own finding, reconfirmed unchanged by this audit)');

        console.log('✓ H — collision detection (core/SpatialOverlap.js, core/SpatialAllocationPolicy.js) and the placement mutations that act on it (PlacePublicationUseCase, MoveWorldPlacementUseCase) remain structurally independent of Publication unpublish state, Snapshot machinery, and Nostr/Arweave, and no new orphan-lifecycle vocabulary exists anywhere in production code');
    }

    console.log('\n✅ All Unpublished Placement Physical-Occupancy Audit tests passed.');
    console.log(`
--------------------------------------------------------------------
0.9.202 DECISION (per this milestone's own brief — one of two):

OUTCOME 1 — INTENTIONAL PHYSICAL OCCUPANCY. No production change.

An unpublished Publication's surviving PlacementRecord behaves as an
ORDINARY physical occupant, in every respect this audit could exercise:

  - Section A: unpublishing changes nothing about physical-occupancy
    COUNT or GEOMETRY — only the RESOLVED shape of that one occupant
    degrades (documentId: null), exactly as 0.9.200/0.9.201 already
    established for presentation.
  - Section B: an ordinary, fresh placement lands directly on top of an
    orphan's position with ZERO friction — but this is not orphan-
    specific: NEITHER initial placement's pre-flight path (checkPlacementOverlap
    returns null for a not-yet-placed document) NOR PlacePublicationUseCase
    itself performs any overlap check at all, against an orphan or
    anything else. This is the SAME "placement never blocks a publish"
    rule 0.2.23/0.2.25 already established, pre-dating orphans entirely.
  - Section C: an explicit MOVE onto an orphan's position produces the
    IDENTICAL WARN-policy decision (allowed + requiresConfirmation) as
    moving onto any other occupied position, and the underlying
    mutation (MoveWorldPlacementUseCase) is, like PlacePublicationUseCase,
    never itself policy-aware — enforcement is entirely the CALLER's
    (the UI's) responsibility, per docs/Principles.md, "Overlap Is A
    Fact; Collision Is A Policy Decision." An orphan gets no special
    treatment, worse or better, than a live occupant.
  - Section D: at a genuinely CO-OCCUPIED position, "Documents Here"
    presents only the resolvable occupant while checkPlacementOverlap
    reports both — confirming 0.9.201's presentation/physical-occupancy
    split holds under real co-occupancy, not merely for an isolated
    orphan.
  - Section E: the existing recovery sequence (unpublish, remove the
    orphan via the raw-capable RemoveWorldPlacementUseCase bypass,
    publish, place) leaves PHYSICAL occupancy fully clean too, not just
    the document-keyed read models 0.9.200 already checked.
  - Section F: an orphan in one document never leaks into
    checkPlacementOverlap's result for an unrelated document's position.
  - Section G: collision behavior is driven purely by the pre-existing
    placement identity (placementId) and geometry (position) machinery —
    nothing about an orphan's reported identity is reconstructed or
    specially derived; detectSpatialOverlap() has no publicationId- or
    documentId-aware branch of any kind.
  - Section H: collision detection and the mutations that act on it stay
    structurally independent of Publication unpublish state, Snapshot
    machinery, and Nostr/Arweave, with no new orphan-lifecycle
    vocabulary introduced anywhere.

The split this audit confirms is coherent and already fully
implemented, not merely aspirational:

    Publication lifecycle  ->  controls document-facing visibility
    Placement lifecycle    ->  controls physical occupancy

An orphan CAN sit at the same coordinate as a new arrival — but so can
any two ordinary, still-published placements (0.2.25's own "a shared
world can legitimately hold more than one publication at the same
position" is the pre-existing rule this audit found the orphan case
simply falls under, not an exception to it). Nothing observed here
blocks a legitimate new placement or move, silently corrupts either
occupant, or leaves a Wanderer/Publisher without an existing, already-
proven recovery path (Section E).

--------------------------------------------------------------------
0.9.202 RECOMMENDATION:

Per this milestone's own brief, Outcome 1 (documented, no production
change) is the result. I recommend STOPPING this orphan thread here.
The sequence — gap audit (0.9.196) -> UI actions (0.9.197/0.9.198) ->
convergence audit (0.9.199) -> lifecycle audit (0.9.200) -> presentation
fix (0.9.201) -> physical-occupancy audit (0.9.202) — has now examined
every read model and mutation path a Wanderer or Publisher can reach
through the existing UI, and found exactly one genuine rough edge
(0.9.201's fix) plus one now-confirmed, coherent, intentional boundary
(this file). I would NOT prescribe a 0.9.203 "Orphaned Physical
Occupancy Resolution" milestone — there is no concrete product gap for
it to resolve. The next milestone should return to the broader
question: what is the next concrete thing a Wanderer or Publisher
should be able to do that they currently cannot?
--------------------------------------------------------------------
`);
}

runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
