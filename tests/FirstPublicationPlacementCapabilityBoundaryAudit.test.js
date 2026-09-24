import { readFile } from 'node:fs/promises';

import { PlacePublicationUseCase } from '../application/placement/PlacePublicationUseCase.js';
import { LoadPublicationDocumentUseCase } from '../application/publication/LoadPublicationDocumentUseCase.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { DecentralizedPublicationDiscoveryProvider } from '../discovery/DecentralizedPublicationDiscoveryProvider.js';
import { CompositeDiscoveryProvider } from '../discovery/CompositeDiscoveryProvider.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { worldNavigationSessionFiles, ownPublicationPanelFiles } from './support/SourceFileGroups.js';

// 0.9.599 — First Publication Placement Capability Boundary Audit.
//
// TYPE: test-only audit. PRODUCTION CHANGES: none. Constructs and calls
// only real production classes; reads real production source with
// readFile to confirm claims against the literal current code.
//
// CENTRAL QUESTION (from the requesting brief): should an
// already-published/discovered Publication that has no existing
// placement be explicitly placeable by the user, and if so, can the
// existing placement machinery support that without violating the
// Publication/World ownership boundaries?
//
// 0.9.598's own Section D already established WHAT is missing (no
// user-reachable action creates a Publication's FIRST placement outside
// PublishDocumentUseCase's own internal call) and recommended, in prose,
// wiring the already-built PlacePublicationUseCase into a new
// session.placePublication(). This audit is the first to actually
// construct PlacePublicationUseCase directly — exactly as
// CreateWorldViewUseCase.js wires it today — and call .execute() on a
// Publication that exists ONLY in the app-wide Repository catalog
// (decentralizedPublicationDiscoveryProvider), never locally published.
// The result is more specific than 0.9.598's own recommendation assumed:
// PlacePublicationUseCase.execute() has NO logic of any kind that
// distinguishes or rejects a first placement (Section C1-C3) — but the
// EXACT instance CreateWorldViewUseCase.js constructs today cannot
// resolve such a Publication at all, because it is wired to the same
// narrow `discoveryProvider` WorldNavigationSession uses for fork-policy
// (Section C-Wiring) — a SEPARATE, previously-unexamined fact from
// 0.9.598's own "one call site" finding.
//
// SECTIONS:
//   A. Inventory — which component owns creation/validation/persistence/
//      replacement/movement/removal of a placement (source trace).
//   B. Initial vs. explicit placement — what information the automatic
//      path actually has that a Repository-admitted Publication may
//      lack, and whether PlacePublicationUseCase already degrades
//      gracefully when it's missing.
//   C. PlacePublicationUseCase, called directly — THE central test.
//      C1: no built-in rejection of "no existing placement" exists at
//          all (calling it twice creates two independent placements —
//          multi-placement is the ordinary case, never a special one).
//      C2: the exact production-wired instance (discoveryProvider =
//          the narrow LocalDiscoveryProvider) cannot resolve a
//          Repository-admitted-only Publication — THROWS.
//   C-Wiring. The same class, given the already-composed, already-safe
//      publicationActionDiscoveryProvider (0.9.597) instead, resolves
//      and places it successfully — isolating the gap to a one-line
//      constructor argument, not a domain rejection.
//   D. Ownership boundary — the PlacementRecord's owner is the placer's
//      identity, never the Publication's author; PlacePublicationUseCase
//      never reads publication.author at all.
//   E. claimedPosition remains non-authoritative — structurally
//      unreachable from PlacePublicationUseCase's own inputs.
//   F. Authorization — confirms placement is UNGATED by any fork-policy
//      or authorization check today, for ANY resolvable Publication;
//      this is an open question this audit surfaces, not answers.
//   G. UI reachability — which existing OwnPublicationPanel surface is
//      already keyed the right way (by publicationId, not documentId)
//      to host a "Place" action.
//   H. Classification and recommendation.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
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

if (typeof globalThis.window === 'undefined') {
    const store = new Map();
    globalThis.window = {
        localStorage: {
            getItem: (k) => (store.has(k) ? store.get(k) : null),
            setItem: (k, v) => { store.set(k, String(v)); },
            removeItem: (k) => { store.delete(k); },
            key: (i) => Array.from(store.keys())[i] ?? null,
            get length() { return store.size; }
        }
    };
}

// Builds the exact placement-relevant subset of what
// application/world/CreateWorldViewUseCase.js#execute() itself constructs, so
// Section C-Wiring's own "narrow vs. composite discoveryProvider" finding
// is a fact about the real composition root, not this test's own
// invention. `discoveryProviderForPlacement` lets Section C-Wiring swap
// in the composite without duplicating the rest of the wiring.
function buildPlacementMachinery(storage, identity, { discoveryProviderForPlacement = null } = {}) {
    const registry = new CreateBrickRegistryUseCase().execute();
    const discoveryProvider = new LocalDiscoveryProvider(storage);
    const spatialIndexProvider = new LocalSpatialIndexProvider(storage);
    const placementRegistry = new LocalPlacementRegistry(storage, spatialIndexProvider);
    const placePublicationUseCase = new PlacePublicationUseCase(
        spatialIndexProvider,
        discoveryProviderForPlacement || discoveryProvider,
        new LoadPublicationDocumentUseCase(storage),
        registry,
        placementRegistry,
        identity
    );
    return { registry, discoveryProvider, spatialIndexProvider, placementRegistry, placePublicationUseCase };
}

async function run() {
    console.log('Running First Publication Placement Capability Boundary Audit...\n');

    // ===============================================================
    // Section A — Inventory: which component owns what.
    // ===============================================================
    {
        const placePublicationSrc = await readSource('application/placement/PlacePublicationUseCase.js');
        const placementRecordSrc = await readSource('core/PlacementRecord.js');
        const localRegistrySrc = await readSource('placement/LocalPlacementRegistry.js');
        const worldNavSrc = (await Promise.all(worldNavigationSessionFiles().map((file) => readSource(file)))).join('\n');

        assert(/this\._spatialIndexProvider\.add\(placement\)/.test(placePublicationSrc) && /this\._placementRegistry\.add\(record\)/.test(placePublicationSrc),
            'A1. CREATION: PlacePublicationUseCase is the sole class that constructs a fresh WorldPlacement + PlacementRecord and adds (never updates) both the spatial index and the placement registry.');
        assert(!/publication\.author/.test(placePublicationSrc),
            'A2. VALIDATION: PlacePublicationUseCase performs no Publication-level validation of its own (no license/author/fork-policy check) — it validates only that the Publication resolves at all (execute()\'s own "not found" throw) and that a position was supplied.');
        assert(/class LocalPlacementRegistry extends PlacementRegistry/.test(localRegistrySrc) && /add\(record\)/.test(localRegistrySrc),
            'A3. PERSISTENCE: LocalPlacementRegistry owns durable storage of PlacementRecords (and the parallel WorldPlacement spatial-index mirror) — PlacePublicationUseCase only ever calls into it, never persists directly.');
        assert(/withPosition\(newPosition\)/.test(placementRecordSrc),
            'A4. REPLACEMENT/MOVEMENT: PlacementRecord.withPosition() — an immutable revision bump — is the sole mechanism that changes an EXISTING placement\'s position; PlacePublicationUseCase never calls it (confirmed A1: it only ever constructs `new PlacementRecord(...)` with revision 1).');
        assert(/movePlacement\(documentId, newPosition\)/.test(worldNavSrc) && /removePlacement\(documentId, expectedPlacementId = null\)/.test(worldNavSrc),
            'A5. MOVEMENT/REMOVAL (session level): WorldNavigationSession#movePlacement()/removePlacement() are the sole session-level mutators of an EXISTING placement, each delegating to MoveWorldPlacementUseCase/RemoveWorldPlacementUseCase — neither constructs a PlacementRecord from scratch.');

        console.log('✓ A — ownership is cleanly separated: PlacePublicationUseCase creates (revision 1, always fresh); PlacementRecord.withPosition() + Move/RemoveWorldPlacementUseCase mutate an existing one. PlacePublicationUseCase is not, by name or by any special-cased logic, an inherently "first-placement-only" API — see Section C.');
    }

    // ===============================================================
    // Section B — Initial (automatic) vs. explicit placement: what
    // information does the automatic path have that a Repository-
    // admitted Publication may not, and does PlacePublicationUseCase
    // already degrade gracefully when it's missing?
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const identity = new LocalIdentityProvider(storage);
        identity.login('alice');

        // A Publication this replica has never locally published: no
        // document JSON saved under its id, exactly the shape a
        // Repository-admitted-only (observer-local) Publication has.
        const publicationId = 'section-b-unloadable-pub';
        const discoveryProvider = new LocalDiscoveryProvider(storage);
        storage.save('forkbuild-publications', [
            new Publication({ id: publicationId, documentId: 'section-b-doc', title: 'B Pub', author: 'bob', contentReference: new ContentReference({ hash: 'b'.repeat(64) }) }).toJSON()
        ]);
        assert(discoveryProvider.findById(publicationId) !== null, 'B1. Sanity: the Publication itself IS locally knowable (unlike Section C\'s Repository-only case) — only its WORLD DOCUMENT is not.');
        assert(storage.load(publicationId) === null, 'B2. Sanity: confirmed no document JSON exists under this id — LoadPublicationDocumentUseCase.execute(publicationId) must fail.');

        const { placePublicationUseCase: usable, placementRegistry } = buildPlacementMachinery(storage, identity, { discoveryProviderForPlacement: discoveryProvider });
        const placement = usable.execute(publicationId, { x: 5, y: 0, z: 5 });
        assert(placement !== null, 'B3. Sanity: placement succeeded and returned a real WorldPlacement.');
        const record = placementRegistry.list().find((r) => r.publicationId === publicationId);
        assert(record !== undefined, 'B4. LIVE PROOF: PlacePublicationUseCase.execute() SUCCEEDS even when the Publication\'s own world document cannot be loaded — it falls back to a default SpatialBounds ({-0.5,0,-0.5}..{0.5,1,0.5}) rather than requiring it. Missing "source document context" (the audit brief\'s own candidate prerequisite) does NOT block placement today.');
        assert(record.bounds.min.x === -0.5 && record.bounds.max.x === 0.5, 'B5. Confirms the exact fallback bounds used, live.');

        // options.bounds bypasses the load attempt entirely — a caller
        // that already knows (or has resolved) real bounds never needs
        // LoadPublicationDocumentUseCase/the brickRegistry at all.
        const publicationId2 = 'section-b-explicit-bounds-pub';
        storage.save('forkbuild-publications', [
            ...(discoveryProvider.list().map((p) => p.toJSON())),
            new Publication({ id: publicationId2, documentId: 'section-b-doc-2', title: 'B2 Pub', author: 'bob', contentReference: new ContentReference({ hash: 'c'.repeat(64) }) }).toJSON()
        ]);
        const { SpatialBounds } = await import('../core/SpatialBounds.js');
        const explicitBounds = new SpatialBounds({ min: { x: -2, y: 0, z: -2 }, max: { x: 2, y: 3, z: 2 } });
        const placement2 = usable.execute(publicationId2, { x: 1, y: 0, z: 1 }, { bounds: explicitBounds });
        assert(placement2.bounds.max.x === 2, 'B6. options.bounds, when supplied, is used as-is — confirming bounds is a genuine input the CALLER may supply directly, never something only PublishDocumentUseCase\'s own internal flow can produce.');

        console.log('✓ B — the only fact the automatic initial-placement path has that a discovered Publication typically lacks (its own loadable world document, for real bounds) is ALREADY handled by an existing, tested fallback — not a missing prerequisite this milestone would need to invent. Publication ownership/lifecycle state/placement authorization are never read by PlacePublicationUseCase at all (Section A2, Section D).');
    }

    // ===============================================================
    // Section C — PlacePublicationUseCase, called directly. THE
    // CENTRAL TEST.
    // ===============================================================
    let sectionCContext;
    {
        const storage = new InMemoryStorageProvider();
        const identity = new LocalIdentityProvider(storage);
        identity.login('alice');

        // A Publication that exists ONLY in the app-wide Repository
        // catalog — never locally published, never saved under
        // 'forkbuild-publications' — exactly the P1 shape 0.9.595-0.9.598
        // established is fully reachable/resolvable/actionable through
        // Open/Fork/Explore/Comment today.
        const publicationId = 'section-c-repository-only-pub';
        const decentralizedPublicationDiscoveryProvider = new DecentralizedPublicationDiscoveryProvider();
        const publication = new Publication({ id: publicationId, documentId: 'section-c-doc', title: 'C Pub', author: 'bob', contentReference: new ContentReference({ hash: 'd'.repeat(64) }) });
        decentralizedPublicationDiscoveryProvider.add(publication);

        // C2 — the EXACT wiring CreateWorldViewUseCase.js constructs
        // today: PlacePublicationUseCase's own discoveryProvider
        // argument is the narrow, local-only one.
        const { placePublicationUseCase: productionWiredUseCase, discoveryProvider: narrowDiscoveryProvider } = buildPlacementMachinery(storage, identity);
        assert(narrowDiscoveryProvider.findById(publicationId) === null, 'C2-0. Sanity: the narrow discoveryProvider genuinely does not know this Publication.');
        let threw = null;
        try { productionWiredUseCase.execute(publicationId, { x: 3, y: 0, z: 3 }); } catch (e) { threw = e; }
        assert(threw !== null && /not found/.test(threw.message),
            'C2. LIVE PROOF: the EXACT PlacePublicationUseCase instance application/world/CreateWorldViewUseCase.js constructs today — given the identical publicationId a real observer-local encounter would produce — THROWS "not found." This is possibility #3 from the requesting brief (technically supports it, but no production caller\'s own wiring can reach a Repository-admitted-only Publication), not possibility #2 (a deliberate domain rejection of first placement).');

        console.log('✓ C2 — confirmed live: today\'s production wiring cannot place a Repository-admitted-only Publication, and fails with a resolution error, not an authorization or "already placed" error.');

        sectionCContext = { storage, identity, publicationId, publication, decentralizedPublicationDiscoveryProvider, narrowDiscoveryProvider };
    }

    // ===============================================================
    // Section C-Wiring — the SAME class, given the already-composed,
    // already-safe publicationActionDiscoveryProvider (0.9.597) instead
    // of the narrow one, in place of C2's own use case.
    // ===============================================================
    {
        const { storage, identity, publicationId, publication, decentralizedPublicationDiscoveryProvider, narrowDiscoveryProvider } = sectionCContext;

        // Exactly application/world/CreateWorldViewUseCase.js's own 0.9.597
        // composition (BW-5b in tests/DiscoveredUnplacedPublicationActionabilityProductBoundaryAudit.test.js):
        // publicationActionDiscoveryProvider = CompositeDiscoveryProvider([discoveryProvider, decentralizedPublicationDiscoveryProvider]).
        const publicationActionDiscoveryProvider = new CompositeDiscoveryProvider([narrowDiscoveryProvider, decentralizedPublicationDiscoveryProvider]);
        const { placePublicationUseCase: widenedUseCase, placementRegistry } = buildPlacementMachinery(storage, identity, { discoveryProviderForPlacement: publicationActionDiscoveryProvider });

        assert(publicationActionDiscoveryProvider.findById(publicationId) === publication, 'CW1. Sanity: the composite DOES resolve it, by exact instance — the identical fact 0.9.597 already proved for getPublicationForDocument()/findPublicationById().');

        const placement = widenedUseCase.execute(publicationId, { x: 8, y: 0, z: 8 });
        assert(placement !== null, 'CW2. LIVE PROOF: given ONLY the already-composed publicationActionDiscoveryProvider instead of the narrow one — a ONE-ARGUMENT change to an already-existing constructor call, never a new provider, never a new merge mechanism — PlacePublicationUseCase.execute() SUCCEEDS for a Repository-admitted-only Publication, producing a real WorldPlacement.');
        const records = placementRegistry.findByPublicationId(publicationId);
        assert(records.length === 1, 'CW3. Exactly one PlacementRecord now exists for this Publication\'s FIRST placement.');
        const record = records[0];
        assert(record.revision === 1, 'CW4. It is a genuine revision-1 genesis record — the identical shape PublishDocumentUseCase\'s own automatic placement produces (0.9.598 E2).');
        assert(record.signature !== null && record.causalStamp !== null, 'CW5. It is signed and causally-stamped exactly like an automatically-placed publication\'s own initial record — no reduced trust tier for an explicitly-placed, discovered Publication.');

        // C1 (placed here, after CW's own successful first placement, so
        // it can be demonstrated on a record that actually exists): no
        // rejection of "place it again" exists either — multi-placement
        // (0.9.308) is the ordinary case PlacePublicationUseCase already
        // implements, never a special "first vs. later" branch.
        widenedUseCase.execute(publicationId, { x: -8, y: 0, z: -8 });
        const recordsAfterSecond = placementRegistry.findByPublicationId(publicationId);
        assert(recordsAfterSecond.length === 2, 'C1. LIVE PROOF: calling PlacePublicationUseCase.execute() a SECOND time for the SAME publicationId creates a SECOND, independent PlacementRecord (different placementId, both revision 1) rather than throwing "already placed" or silently overwriting the first. There is no first-vs-later distinction anywhere in this class\'s own logic — every call is the identical operation docs/Principles.md already names ("an exhibition copy here, a personal copy... there").');
        assert(recordsAfterSecond.every((r) => r.revision === 1) && new Set(recordsAfterSecond.map((r) => r.placementId)).size === 2,
            'C1b. Confirms both are independent revision-1 genesis records, never one revision-2 supersession of the other.');

        console.log('✓ C-Wiring/C1 — POSSIBILITY #3 confirmed precisely: PlacePublicationUseCase.execute() already, unconditionally, supports creating a Publication\'s first (and every subsequent) placement. The gap Section C2 found is entirely which discoveryProvider instance the already-built use case is constructed with in application/world/CreateWorldViewUseCase.js today — not a missing capability inside the use case, and not a deliberate rejection.');
    }

    // ===============================================================
    // Section D — Placement ownership boundary.
    // ===============================================================
    {
        const { storage, publicationId, publication, decentralizedPublicationDiscoveryProvider, narrowDiscoveryProvider } = sectionCContext;
        const bob = new LocalIdentityProvider(storage);
        // A DIFFERENT identity than the Publication's own author ('bob'
        // the string author field vs. a real, separate signing identity
        // 'carol' who merely encountered and placed bob's work) — the
        // exact scenario Section I of the brief asks about.
        bob.login('carol');
        const publicationActionDiscoveryProvider = new CompositeDiscoveryProvider([narrowDiscoveryProvider, decentralizedPublicationDiscoveryProvider]);
        const { placePublicationUseCase, placementRegistry } = buildPlacementMachinery(storage, bob, { discoveryProviderForPlacement: publicationActionDiscoveryProvider });

        const carolsPlacement = placePublicationUseCase.execute(publicationId, { x: 2, y: 0, z: 2 });
        const record = placementRegistry.get(carolsPlacement.id);
        assert(record.owner === 'carol', 'D1. LIVE PROOF: the PlacementRecord\'s owner is the PLACER\'S identity (carol) — never the Publication\'s own author field ("bob") — confirming placing someone else\'s discovered work never claims their authorship.');
        assert(publication.author === 'bob', 'D2. Sanity: the Publication\'s own author is untouched — placement creates no side effect on the Publication object at all.');

        const placePublicationSrc = await readSource('application/placement/PlacePublicationUseCase.js');
        assert(!/publication\.author|publisherIdentity/.test(placePublicationSrc),
            'D3. Structurally: PlacePublicationUseCase.js never reads publication.author or publication.publisherIdentity anywhere — it has no code path that COULD conflate placement ownership with publication ownership, even by accident.');

        // The enrichment WorldNavigationSession exposes to the UI
        // (movable/removable) already keys off the PLACEMENT's owner,
        // not the Publication's — so once this capability is wired in,
        // "who may move/remove THIS placement later" already means "the
        // person who placed it," never "the person who published it."
        const worldNavSrc = (await Promise.all(worldNavigationSessionFiles().map((file) => readSource(file)))).join('\n');
        assert(/const ownerName = record\.owner \|\| \(record\.ownerIdentity/.test(worldNavSrc),
            'D4. Confirmed in real source: _enrichPlacementRecord()\'s own movable/removable computation reads record.owner (the placement\'s own owner) — never any Publication-level author/identity field.');

        console.log('✓ D — the ownership boundary the brief asks about already holds, structurally and live: a PlacementRecord\'s owner is always the identity that performed the Place action, never the Publication\'s author — "place this already-known Publication in my local World" cannot, even accidentally, become "I now own or authored this Publication."');
    }

    // ===============================================================
    // Section E — claimedPosition remains non-authoritative.
    // ===============================================================
    {
        const { publication } = sectionCContext;
        assert(!('claimedPosition' in publication) && !('position' in publication),
            'E1. Reconfirmed (0.9.598 D9b): a resolved Publication object never carries a claimedPosition or position field to begin with — there is nothing for PlacePublicationUseCase\'s own `position` PARAMETER (an explicit user choice, per its own call signature) to be confused with.');

        const placePublicationSrc = await readSource('application/placement/PlacePublicationUseCase.js');
        assert(!/claimedPosition/.test(placePublicationSrc),
            'E2. Structurally: PlacePublicationUseCase.js never references claimedPosition anywhere — the `position` it places at can only ever be the value its caller explicitly passed as an argument, never something read off the Publication or a discovery candidate.');

        console.log('✓ E — claimedPosition ≠ first placement holds, both live and structurally: nothing in this capability\'s own execution path can turn a distributed position claim into an authoritative PlacementRecord by itself. Wiring in an explicit Place action changes nothing about this — it is still keyed entirely on whatever position the PERSON, not the claim, supplies.');
    }

    // ===============================================================
    // Section F — Authorization: this capability is currently UNGATED,
    // for ANY resolvable Publication. Surfaced as an open question, not
    // resolved here (per the requesting brief's own Section I / the
    // 0.9.598 recommendation's own closing caveat).
    // ===============================================================
    {
        const placePublicationSrc = await readSource('application/placement/PlacePublicationUseCase.js');
        assert(!/isKnownPublication|checkForkPolicy|WorldAuthorizationService|AuthorizationVerifier/.test(placePublicationSrc),
            'F1. Structurally: PlacePublicationUseCase.js contains no fork-policy check, no WorldAuthorizationService/authorization-verifier call, and no ownership gate of any kind — ANY identity holding a resolvable publicationId and a position can place ANY Publication that resolves, today, including one it never published and does not own.');

        // Live: Section D's own carol-places-bob's-work scenario already
        // succeeded without any authorization decision being consulted
        // — reconfirmed explicitly here as its own, named finding rather
        // than an incidental fact of Section D's ownership test.
        const { storage, publicationId, decentralizedPublicationDiscoveryProvider, narrowDiscoveryProvider } = sectionCContext;
        const dave = new LocalIdentityProvider(new InMemoryStorageProvider());
        dave.login('dave');
        const publicationActionDiscoveryProvider = new CompositeDiscoveryProvider([narrowDiscoveryProvider, decentralizedPublicationDiscoveryProvider]);
        const { placePublicationUseCase } = buildPlacementMachinery(storage, dave, { discoveryProviderForPlacement: publicationActionDiscoveryProvider });
        const placement = placePublicationUseCase.execute(publicationId, { x: 99, y: 0, z: 99 });
        assert(placement !== null, 'F2. LIVE PROOF: a THIRD, unrelated identity (dave, neither the Publication\'s author nor its first placer) can also place the identical Publication today, with no policy consulted and no error raised — this is the current, real behavior, not a hypothetical risk.');

        console.log('✓ F — this is real, but it is not a new risk this milestone introduces: F1/F2 describe PlacePublicationUseCase\'s CURRENT, pre-existing behavior, already true of the one production call site it has today (PublishDocumentUseCase\'s own initial placement is likewise ungated, just always self-authored). Wiring this into a new, explicit, user-triggered action makes the SAME already-open question reachable by more people, more often — which is exactly the "genuine, separate product decision" 0.9.598 flagged and did not answer. This audit does not answer it either; it only makes precisely what is and is not gated, today, explicit and testable.');
    }

    // ===============================================================
    // Section G — UI reachability: which existing surface is already
    // keyed the right way.
    // ===============================================================
    {
        const ownPublicationPanelSrc = (await Promise.all(ownPublicationPanelFiles().map((file) => readSource(file)))).join('\n');

        assert(/getPublicationPlacementsCommand\(publication\.id\)/.test(ownPublicationPanelSrc),
            'G1. ui/components/OwnPublicationPanel.js already has a publicationId-keyed placement surface (0.9.308\'s own getPublicationPlacementsCommand(publication.id)) — the SAME key (publicationId, not documentId) the new capability needs, since Section C\'s own Publication has no locally-known documentId path at all.');
        assert(/placementInfo: \{/.test(ownPublicationPanelSrc),
            'G2. By contrast, the OLDER `placementInfo` prop (0.9.159) — the one movePlacement()/removePlacement() ultimately serve — is fed from WorldNavigationSession#getPlacementInfo(documentId), which Section D of 0.9.598 already proved is unreachable for this family (documentId-keyed, gated behind the narrow, fork-policy-sensitive discoveryProvider).');

        console.log('✓ G — the smallest natural home for a "Place" action is beside the EXISTING, already publicationId-keyed .own-publication-placements listing (getPublicationPlacementsCommand), never the older, documentId-keyed placementInfo/movePlacement surface — this follows directly from Section C-Wiring\'s own finding that publicationId-based resolution (via publicationActionDiscoveryProvider) is what already reaches a Repository-admitted-only Publication, while documentId-based resolution structurally does not and should not (0.9.596\'s own fork-policy rationale).');
    }

    // ===============================================================
    // Section H — Classification and recommendation.
    // ===============================================================
    {
        console.log(`
✓ H — PRODUCT CONCLUSION.

  CLASSIFICATION: CAPABILITY_GAP — narrow, precisely bounded, and
  smaller than it first appeared. Not ALREADY_SUPPORTED: today's actual
  production wiring (application/world/CreateWorldViewUseCase.js's own
  PlacePublicationUseCase construction, Section C2) cannot resolve a
  Repository-admitted-only Publication and throws. Not
  BOUNDARY_CONFLICT: nothing about making first placement reachable
  would blur Publication/Placement ownership (Section D), invent a new
  claimedPosition->PlacementRecord path (Section E), or touch anything
  fork-policy already protects (Section G) — the domain object itself
  (PlacePublicationUseCase) already, unconditionally, supports creating
  a Publication's first placement (Section C-Wiring/C1); it simply is
  not reachable today because of ONE constructor argument.

  THE SMALLEST LEGITIMATE NEXT STEP, per Sections C-Wiring/D/G:
    1. In application/world/CreateWorldViewUseCase.js, construct
       PlacePublicationUseCase with publicationActionDiscoveryProvider
       instead of the plain discoveryProvider — mirroring the identical,
       already-reasoned-through widening 0.9.597 already applied to
       findPublicationById()/getPublicationForDocument() (an exact-id
       lookup, carrying none of _findPublications()'s documentId-
       collision/fork-policy risk).
    2. Add WorldNavigationSession#placePublication(publicationId,
       position) — PUBLICATION-ID-KEYED, unlike movePlacement()/
       removePlacement()'s own documentId-keyed shape, precisely
       because the whole point is reaching Publications that
       documentId-based resolution deliberately does not (Section G2)
       — delegating directly to the already-injected
       placePublicationUseCase.
    3. Surface a "Place" action from OwnPublicationPanel's own EXISTING,
       already publicationId-keyed .own-publication-placements listing
       (Section G1) — never a new panel, list, or surface.

  EXPLICITLY LEFT OPEN, NOT DECIDED BY THIS AUDIT: authorization
  (Section F) — today NOTHING gates who may place someone else's
  discovered Publication, for the one production call site that exists.
  Wiring in a new, explicit, easily-triggered action makes that same,
  already-true fact reachable more often; whether that is acceptable as
  a decentralized, "anyone may place a copy of a discovered work in
  their own local World" design (consistent with docs/Principles.md's
  own "an exhibition copy here, a personal copy... there") or needs an
  explicit gate is a genuine product decision, not a technical one, and
  is not resolved here — consistent with this file's own type: a
  test-only audit that implements nothing.
`);
    }

    console.log('✅ All FirstPublicationPlacementCapabilityBoundaryAudit tests passed.');
}

run().catch((error) => {
    console.error('FirstPublicationPlacementCapabilityBoundaryAudit.test.js FAILED:', error);
    process.exitCode = 1;
});
