import { readFile, readdir } from 'node:fs/promises';

import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { DecentralizedPublicationDiscoveryProvider } from '../discovery/DecentralizedPublicationDiscoveryProvider.js';
import { CompositeDiscoveryProvider } from '../discovery/CompositeDiscoveryProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { LocalWorldLayoutProvider } from '../world-layout/LocalWorldLayoutProvider.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { PlacePublicationUseCase } from '../application/PlacePublicationUseCase.js';
import { MoveWorldPlacementUseCase } from '../application/MoveWorldPlacementUseCase.js';
import { RemoveWorldPlacementUseCase } from '../application/RemoveWorldPlacementUseCase.js';
import { GridPlacementStrategy } from '../application/InitialPlacementStrategy.js';
import { PublishDocumentUseCase } from '../application/PublishDocumentUseCase.js';
import { LoadPublicationDocumentUseCase } from '../application/LoadPublicationDocumentUseCase.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { ContentReference } from '../core/ContentReference.js';
import { Publication } from '../publisher/Publication.js';
import { WorldPlacement } from '../core/WorldPlacement.js';
import { SpatialBounds } from '../core/SpatialBounds.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';

// 0.9.602 — Post-Placement World Visibility Product Boundary Audit.
//
// TYPE: test-only product/architectural boundary audit. PRODUCTION
// CHANGES: none. This file touches no production file — it only reads
// them (readFile/readdir) to confirm structural claims, and constructs
// real production classes (never mocks of them) to prove behavior live.
//
// CENTRAL QUESTION, verbatim from the requesting brief: after a user
// explicitly places a discovered Publication, is the resulting World
// state supposed to make that Publication visible/presentable in the
// World View, or is successful placement intentionally allowed to exist
// without rendering because the Publication is outside the World Layout
// discovery domain?
//
// STARTING POINT. 0.9.601's own Section F/A13 already proved, live, the
// raw fact this audit investigates: a Repository-admitted-only
// Publication's explicit Place produces a real, signed, causally-stamped
// PlacementRecord and a real spatial-index WorldPlacement entry, but
// worldLayoutProvider.findVisibleDocuments()/getPosition() never surface
// it. 0.9.601 correctly stopped there and classified it
// PLACEMENT_RENDERING_VISIBILITY_GAP — a narrow, RECORDED-not-FIXED
// finding — and explicitly asked a future milestone to determine whether
// it is significant enough to close, or an acceptable, documented
// boundary. This audit is that determination. The full DISCOVER ->
// RESOLVE -> VERIFY -> ADMIT -> Explicit Place -> PlacementRecord journey
// is NOT re-proven here — 0.9.601 already did that live, through the
// real production pipeline, exhaustively. This audit instead begins from
// an already-placed state (directly-seeded Repository admission, the
// same narrower posture 0.9.599's own precedent established for a
// deeper, more focused audit one layer past a already-proven journey)
// and asks a single, different, unanswered question: what, precisely,
// separates a placed-and-rendered Publication from a placed-and-invisible
// one, and is that separation a deliberate boundary or a gap.
//
// THE INSTRUCTION THIS AUDIT MOST CAREFULLY FOLLOWS: do NOT conclude
// "the rendering is missing, therefore WorldLayoutProvider should widen
// to the CompositeDiscoveryProvider" without first checking whether doing
// so would recreate the 0.9.596 policy problem, AND without first
// checking whether a provider widening is even SUFFICIENT on its own.
// Section D/E/F below is where this audit earns that conclusion rather
// than assuming it — the answer turns out to be neither "yes, just widen
// it" nor "no, leave it alone," but a precise two-ingredient decomposition
// (see Section D's own 2x2 matrix and Section K's own classification).
//
// SECTIONS (the requesting brief's own lettering, adapted to what was
// actually found — some of the brief's own sections turned out to
// collapse into a single, more precise result; see the collapse notes
// inline).
//   A. Reproduce the complete post-placement state.
//   B. Semantic meaning of PlacementRecord.
//   C. Locally-published vs. discovered Publication comparison.
//   D. Rendering prerequisites — the full 2x2 ingredient matrix.
//   E. Provider-boundary preservation.
//   F. Material availability vs. Publication availability.
//   G. Architecture-intent check against docs/Principles.md.
//   H. Re-entry and lifecycle.
//   I. User-visible truthfulness.
//   J. Regression / no production changes.
//   K. Closure classification.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function readSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
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

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

const UNIT_BOUNDS = () => new SpatialBounds({ min: { x: -0.5, y: 0, z: -0.5 }, max: { x: 0.5, y: 1, z: 0.5 } });

function makeSerializedDocumentJson(documentId, title = 'D') {
    const world = new World({ id: documentId });
    const building = new Building({ creator: 'x' });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    const doc = new Document({ world, metadata: new DocumentMetadata({ title, author: 'x' }) });
    return new DocumentSerializer().serialize(doc);
}

// Builds a WorldNavigationSession wired EXACTLY the way
// application/CreateWorldViewUseCase.js wires production today (as of
// 0.9.600's own fix) — the same replication convention 0.9.598-0.9.601's
// own harnesses each already established: never the real factory itself
// (avatar-presence/collaboration/renderer-mount machinery has no clean
// Node-only lifetime), but a structural mirror of it, kept in sync with
// it by Section E's own source-level assertions below.
//
// `worldLayoutDiscoveryProvider` lets this audit swap ONLY the one
// argument Section D's own matrix varies — never anything else — so each
// matrix cell differs from production by exactly one, named, deliberate
// substitution.
function buildJourneySession(storage, { decentralizedPublicationDiscoveryProvider = null, worldLayoutDiscoveryProvider = undefined } = {}) {
    const identity = new LocalIdentityProvider(storage);
    identity.login('alice');
    const brickRegistry = new CreateBrickRegistryUseCase().execute();
    const contentStore = new LocalContentStore(storage);
    const publisher = new LocalPublisherProvider(storage, contentStore);
    const discoveryProvider = new LocalDiscoveryProvider(storage);
    const publicationActionDiscoveryProvider = decentralizedPublicationDiscoveryProvider
        ? new CompositeDiscoveryProvider([discoveryProvider, decentralizedPublicationDiscoveryProvider])
        : discoveryProvider;
    const spatialIndexProvider = new LocalSpatialIndexProvider(storage);
    const worldLayoutProvider = new LocalWorldLayoutProvider(
        spatialIndexProvider,
        worldLayoutDiscoveryProvider === undefined ? discoveryProvider : worldLayoutDiscoveryProvider
    );
    const placementRegistry = new LocalPlacementRegistry(storage, spatialIndexProvider);
    const loadPublicationDocumentUseCase = new LoadPublicationDocumentUseCase(storage);
    const placePublicationUseCase = new PlacePublicationUseCase(
        spatialIndexProvider, publicationActionDiscoveryProvider, loadPublicationDocumentUseCase, brickRegistry, placementRegistry, identity
    );
    const publishDocumentUseCase = new PublishDocumentUseCase(publisher, identity, placePublicationUseCase, new GridPlacementStrategy());
    const moveWorldPlacementUseCase = new MoveWorldPlacementUseCase(spatialIndexProvider, placementRegistry, null, identity);
    const removeWorldPlacementUseCase = new RemoveWorldPlacementUseCase(spatialIndexProvider, placementRegistry);
    const session = new WorldNavigationSession({
        registry: { getDocument: () => null },
        loadPublicationDocumentUseCase,
        worldLayoutProvider,
        publishDocumentUseCase,
        identityProvider: identity,
        discoveryProvider,
        publicationActionDiscoveryProvider,
        placementRegistry,
        placePublicationUseCase,
        moveWorldPlacementUseCase,
        removeWorldPlacementUseCase
    });
    return {
        session, identity, discoveryProvider, publicationActionDiscoveryProvider, worldLayoutProvider,
        spatialIndexProvider, placementRegistry, placePublicationUseCase, publishDocumentUseCase,
        loadPublicationDocumentUseCase, storage
    };
}

function seedRepositoryAdmittedPublication(decentralizedProvider, { id, documentId = id, title = 'Discovered Work', author = 'someone-else' } = {}) {
    const publication = new Publication({ id, documentId, title, author, contentReference: new ContentReference({ hash: 'a'.repeat(64) }) });
    decentralizedProvider.add(publication);
    return publication;
}

async function run() {
    console.log('Running Post-Placement World Visibility Product Boundary Audit...\n');

    // ===============================================================
    // Section A — Reproduce the complete post-placement state.
    // ===============================================================
    let flagship;
    {
        const publicationId = 'a-flagship-pub';
        const documentId = 'a-flagship-doc';
        const decentralized = new DecentralizedPublicationDiscoveryProvider();
        const publication = seedRepositoryAdmittedPublication(decentralized, { id: publicationId, documentId });

        const storage = new InMemoryStorageProvider();
        const { session, placementRegistry, spatialIndexProvider, worldLayoutProvider } =
            buildJourneySession(storage, { decentralizedPublicationDiscoveryProvider: decentralized });

        assert(session.getPublicationForDocument(documentId) === publication, 'A1. The Repository-admitted Publication is resolvable through the exact fact OwnPublicationPanel\'s own `publication` prop reads.');
        assert(session.getPlacementsForPublication(publicationId).length === 0, 'A2. Sanity: unplaced before this section\'s own explicit Place.');

        const herePosition = { x: 42, y: 0, z: -17 };
        const placement = session.placePublication(publicationId, herePosition);
        assert(placement !== null, 'A3. Explicit Place succeeds.');
        const records = placementRegistry.findByPublicationId(publicationId);
        assert(records.length === 1 && records[0].position.x === 42 && records[0].position.z === -17,
            'A4. PlacementRecord: a real, correctly-positioned record now exists.');

        const spatialHits = spatialIndexProvider.discover({ x: 0, y: 0, z: 0 }, 1000);
        assert(spatialHits.some((p) => p.publicationId === publicationId && p.position.x === 42),
            'A5. The real spatial index contains a WorldPlacement for P, at the explicit position.');

        const visible = worldLayoutProvider.findVisibleDocuments({ x: 42, y: 0, z: -17 }, 1000);
        const resolvedPosition = worldLayoutProvider.getPosition(documentId);
        assert(!visible.includes(documentId), 'A6. RECONFIRMED (0.9.601 Section F/A13): worldLayoutProvider.findVisibleDocuments() does NOT surface P, in this fresh, minimal harness, exactly as the full-journey harness also found.');
        assert(resolvedPosition.x === 0 && resolvedPosition.z === 0, 'A7. RECONFIRMED: worldLayoutProvider.getPosition() falls back to the deterministic-grid/origin position, silently discarding the real placed position.');

        console.log('✓ A — the starting fact this audit investigates is reconfirmed, live, in a fresh minimal harness: PlacementRecord (A4) and spatial index (A5) both hold real, correctly-positioned truth; worldLayoutProvider rendering (A6/A7) does not surface it. Sections B-K below determine exactly why, whether closing it is safe, and whether closing it is even sufficient.');
        flagship = { publicationId, documentId, publication, decentralized, herePosition };
    }

    // ===============================================================
    // Section B — Semantic meaning of PlacementRecord.
    // ===============================================================
    {
        const placementRecordSrc = await readSource('core/PlacementRecord.js');
        assert(!/worldLayout|WorldView|render|findVisible|streaming/i.test(placementRecordSrc),
            'B1. core/PlacementRecord.js itself never references rendering, World View, or streaming in any form — its own vocabulary is entirely position/identity/revision/signature.');
        const registrySrc = await readSource('placement/LocalPlacementRegistry.js');
        assert(!/worldLayout|WorldView|render(?!ed)|findVisible/i.test(registrySrc),
            'B2. placement/LocalPlacementRegistry.js — the producer/consumer of PlacementRecords — never references rendering or World View either.');
        const spatialSrc = await readSource('spatial/LocalSpatialIndexProvider.js');
        assert(!/worldLayout|WorldView|render(?!ed)/i.test(spatialSrc),
            'B3. spatial/LocalSpatialIndexProvider.js — the durable spatial-truth store PlacementRecord/WorldPlacement both write through — likewise never references rendering or World View.');

        const principles = await readSource('docs/Principles.md');
        assert(/PlacementRecord is the durable, discoverable truth of where a publication\s*\nexists\. LoadedWorld is the ephemeral runtime state of that placement in\s*\na specific client's memory\./.test(principles),
            'B4. docs/Principles.md (0.2.12) explicitly and deliberately distinguishes PlacementRecord (durable, decentralized truth) from LoadedWorld (ephemeral, per-client runtime rendering state) — this is a documented architectural principle, not this audit\'s own inference.');
        assert(/The World View discovers placements first; publications and snapshots\s*\nare resolved only for spatially relevant placements/.test(principles),
            'B5. docs/Principles.md (0.2.11) states placement discovery and Publication/content resolution are two DELIBERATELY SEPARATE steps — "the spatial discovery pipeline returns lightweight PlacementRecords; the caller decides which publications to actually load."');

        console.log('✓ B — PlacementRecord\'s own implementation and this codebase\'s own documented architecture agree: a PlacementRecord is durable spatial/ownership truth, and is BY DESIGN a separate fact from whether that placement\'s content is currently loaded/rendered anywhere. "Placement ≠ Rendering" is not a gap this audit is inventing — it is an existing, named principle (0.2.11/0.2.12). Section G returns to this exact text to check whether the CURRENT IMPLEMENTATION actually honors it.');
    }

    // ===============================================================
    // Section C — Locally-published vs. discovered Publication
    // comparison (P1 vs P2, both explicitly placed, in the SAME
    // session, under the SAME production-shaped composition).
    // ===============================================================
    {
        const decentralized = new DecentralizedPublicationDiscoveryProvider();
        const p2Id = 'c-p2-discovered';
        const p2DocId = 'c-p2-doc';
        seedRepositoryAdmittedPublication(decentralized, { id: p2Id, documentId: p2DocId, title: 'Discovered' });

        const storage = new InMemoryStorageProvider();
        const { session, publishDocumentUseCase, worldLayoutProvider } =
            buildJourneySession(storage, { decentralizedPublicationDiscoveryProvider: decentralized });

        // P1: an ordinary, LOCALLY-published Publication (LocalPublisherProvider.publish()
        // writes the migrated Document JSON to storage[document.world.id] in
        // addition to the publications catalog — see publisher/LocalPublisherProvider.js
        // lines 54-55 — this is the ingredient Section F below shows P2 never gets).
        const world = new World({});
        const building = new Building({ creator: 'alice' });
        building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
        world.addBuilding(building);
        const doc = new Document({ world, metadata: new DocumentMetadata({ title: 'C Own Work', author: 'alice' }) });
        const p1 = publishDocumentUseCase.execute({ document: doc }); // auto-placed at publish (0.2.23)

        session.placePublication(p2Id, { x: 9, y: 0, z: 9 });

        const p1Visible = worldLayoutProvider.findVisibleDocuments(worldLayoutProvider.getPosition(p1.documentId), 1000);
        const p2Visible = worldLayoutProvider.findVisibleDocuments({ x: 9, y: 0, z: 9 }, 1000);

        assert(p1Visible.includes(p1.documentId), 'C1. P1 (locally published, then placed): worldLayoutProvider.findVisibleDocuments() DOES surface it — full PlacementRecord -> spatial index -> rendering closes completely for a locally-authored Publication.');
        assert(!p2Visible.includes(p2DocId), 'C2. P2 (Repository-admitted-only, then explicitly placed): worldLayoutProvider.findVisibleDocuments() does NOT surface it — PlacementRecord and spatial index both hold real truth (Section A), but rendering stops short, for the SAME session, the SAME worldLayoutProvider instance, the SAME kind of explicit Place action.');

        // Isolate the exact single seam: swap ONLY worldLayoutProvider's
        // own discoveryProvider argument in a FRESH session over the SAME
        // storage/state — nothing else about P1's or P2's placement
        // changes.
        const rebuilt = buildJourneySession(storage, {
            decentralizedPublicationDiscoveryProvider: decentralized,
            worldLayoutDiscoveryProvider: new CompositeDiscoveryProvider([rebuiltDiscovery(storage), decentralized])
        });
        function rebuiltDiscovery(s) { return new LocalDiscoveryProvider(s); }
        const p2VisibleAfterSwap = rebuilt.worldLayoutProvider.findVisibleDocuments({ x: 9, y: 0, z: 9 }, 1000);
        const p1VisibleAfterSwap = rebuilt.worldLayoutProvider.findVisibleDocuments(rebuilt.worldLayoutProvider.getPosition(p1.documentId), 1000);
        assert(p2VisibleAfterSwap.includes(p2DocId), 'C3. Swapping ONLY worldLayoutProvider\'s own discoveryProvider argument to the already-composed publicationActionDiscoveryProvider (the exact widening this section isolates) is enough to make P2\'s VISIBILITY/POSITION resolve correctly — confirming the seam is precisely, and only, that one constructor argument (reconfirmed exhaustively in Section D\'s own matrix, including why this alone is not yet the full story).');
        assert(p1VisibleAfterSwap.includes(p1.documentId), 'C4. The same swap changes nothing about P1 — a locally-published Publication was already resolvable through the narrow discoveryProvider alone, so widening it is additive, never disruptive, for the existing case.');

        console.log('✓ C — P1 (locally published) and P2 (Repository-admitted-only) diverge at exactly ONE seam: worldLayoutProvider\'s own discoveryProvider argument (application/CreateWorldViewUseCase.js). Both share identical PlacementRecord/spatial-index truth once placed (Section A); only the RESOLUTION step downstream of the spatial index differs.');
    }

    // ===============================================================
    // Section D — Rendering prerequisites: the full 2x2 ingredient
    // matrix. This is this audit's own central empirical result.
    // ===============================================================
    {
        // Two independent variables:
        //   DISCOVERY SCOPE  — is worldLayoutProvider built on the narrow
        //                      discoveryProvider (current production) or
        //                      the already-composed publicationActionDiscoveryProvider?
        //   DOCUMENT MATERIAL — is the actual World Document JSON present
        //                      at storage[documentId] (what
        //                      LoadPublicationDocumentUseCase/_loadWorld()
        //                      actually reads) or absent (the real, current
        //                      state for a genuinely decentralized-only
        //                      Publication — see Section F)?
        function buildCell({ widenDiscovery, materialPresent }) {
            const storage = new InMemoryStorageProvider();
            const discoveryProvider = new LocalDiscoveryProvider(storage);
            const decentralized = new DecentralizedPublicationDiscoveryProvider();
            const publicationId = 'd-pub';
            const documentId = 'd-doc';
            const publication = seedRepositoryAdmittedPublication(decentralized, { id: publicationId, documentId });
            const spatialIndexProvider = new LocalSpatialIndexProvider(storage);
            spatialIndexProvider.add(new WorldPlacement({
                publicationId, position: { x: 5, y: 0, z: 5 },
                rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, bounds: UNIT_BOUNDS()
            }));
            const worldLayoutProvider = new LocalWorldLayoutProvider(
                spatialIndexProvider,
                widenDiscovery ? new CompositeDiscoveryProvider([discoveryProvider, decentralized]) : discoveryProvider
            );
            if (materialPresent) {
                storage.save(documentId, makeSerializedDocumentJson(documentId));
            }
            const loadPublicationDocumentUseCase = new LoadPublicationDocumentUseCase(storage);
            return { worldLayoutProvider, loadPublicationDocumentUseCase, documentId, publication };
        }

        // Cell 1: narrow + absent — CURRENT PRODUCTION STATE for a
        // Repository-admitted-only Publication.
        {
            const { worldLayoutProvider, loadPublicationDocumentUseCase, documentId } = buildCell({ widenDiscovery: false, materialPresent: false });
            assert(!worldLayoutProvider.findVisibleDocuments({ x: 5, y: 0, z: 5 }, 1000).includes(documentId), 'D1a. [narrow discovery, no material] NOT visible — the current, real production state.');
            let threw = null;
            try { loadPublicationDocumentUseCase.execute(documentId); } catch (e) { threw = e; }
            assert(threw !== null, 'D1b. [narrow discovery, no material] streaming this document would also throw — doubly blocked.');
        }

        // Cell 2: narrow + present — does the document merely BEING
        // available (as if some future fix wrote it locally) rescue
        // visibility on its own, with NO change to discovery scope?
        {
            const { worldLayoutProvider, loadPublicationDocumentUseCase, documentId } = buildCell({ widenDiscovery: false, materialPresent: true });
            assert(!worldLayoutProvider.findVisibleDocuments({ x: 5, y: 0, z: 5 }, 1000).includes(documentId),
                'D2a. [narrow discovery, material PRESENT] STILL NOT VISIBLE — worldLayoutProvider never reads storage[documentId] directly; it only ever walks discoveryProvider.list()/findById(). Document material availability ALONE is not sufficient.');
            const doc = loadPublicationDocumentUseCase.execute(documentId);
            assert(doc !== null, 'D2b. [narrow discovery, material PRESENT] the document itself WOULD load fine if a caller ever reached it — confirming D2a\'s failure is specifically a visibility/resolution failure, not a material one.');
        }

        // Cell 3: widened + absent — does discovery-scope widening ALONE
        // (the fix pattern this audit's own header warns not to assume)
        // rescue rendering entirely, with NO change to document material?
        {
            const { worldLayoutProvider, loadPublicationDocumentUseCase, documentId } = buildCell({ widenDiscovery: true, materialPresent: false });
            assert(worldLayoutProvider.findVisibleDocuments({ x: 5, y: 0, z: 5 }, 1000).includes(documentId),
                'D3a. [WIDENED discovery, no material] visibility/position resolution NOW WORKS — findVisibleDocuments() surfaces it.');
            const pos = worldLayoutProvider.getPosition(documentId);
            assert(pos.x === 5 && pos.z === 5, 'D3b. [WIDENED discovery, no material] getPosition() now resolves the REAL placed position, not the origin/grid fallback.');
            let threw = null;
            try { loadPublicationDocumentUseCase.execute(documentId); } catch (e) { threw = e; }
            assert(threw !== null && /no document found/.test(threw.message),
                'D3c. [WIDENED discovery, no material] YET streaming the actual World content STILL THROWS "no document found" — discovery-scope widening alone makes P "visible" as a position/marker, but the World it would stream in cannot actually be loaded. THIS IS THIS AUDIT\'S OWN CENTRAL FINDING: the fix the brief warned against assuming ("just widen WorldLayoutProvider") is necessary but NOT sufficient on its own.');
        }

        // Cell 4: widened + present — both ingredients together.
        {
            const { worldLayoutProvider, loadPublicationDocumentUseCase, documentId } = buildCell({ widenDiscovery: true, materialPresent: true });
            assert(worldLayoutProvider.findVisibleDocuments({ x: 5, y: 0, z: 5 }, 1000).includes(documentId), 'D4a. [WIDENED discovery, material PRESENT] visible.');
            const doc = loadPublicationDocumentUseCase.execute(documentId);
            assert(doc !== null, 'D4b. [WIDENED discovery, material PRESENT] AND streamable — only when BOTH ingredients are present does the full journey to literal World View rendering actually close.');
        }

        console.log(`
✓ D — THE 2x2 MATRIX, LIVE-PROVEN:

           discovery: narrow          discovery: WIDENED
  material   ┌─────────────────────┬─────────────────────┐
  ABSENT     │ NOT visible (D1)    │ visible/positioned  │
  (current)  │ AND not streamable  │ but NOT streamable  │
             │                     │ (D3 — the trap)     │
             ├─────────────────────┼─────────────────────┤
  material   │ NOT visible (D2)    │ visible AND         │
  PRESENT    │ though streamable   │ streamable (D4)     │
             │  if ever reached    │                     │
             └─────────────────────┴─────────────────────┘

Neither ingredient alone is sufficient (D2, D3); both together close the
journey completely (D4). A future fix that ONLY widens
LocalWorldLayoutProvider's discoveryProvider argument — the fix this
audit's own header was warned not to assume — would move a Repository-
admitted-only Publication from cell (narrow, absent) to cell (widened,
absent): NEWLY VISIBLE AS A POSITION/MARKER, but its World content STILL
CANNOT STREAM IN. That is arguably a worse UX than today's silent
omission: a place-shaped hole in the World with no content, rather than
nothing at all. See Section F for why the (widened, PRESENT) cell — the
only one that fully closes the journey — requires a second, separate,
and materially larger piece of work.
`);
    }

    // ===============================================================
    // Section E — Provider-boundary preservation.
    // ===============================================================
    {
        const worldLayoutSrc = await readSource('world-layout/LocalWorldLayoutProvider.js');
        assert(!/forkPolicy|isKnownPublication|license|authoriz/i.test(worldLayoutSrc),
            'E1. world-layout/LocalWorldLayoutProvider.js itself contains no fork-policy, licensing, or authorization logic of any kind — structurally reconfirmed here, not merely assumed. Widening its OWN discoveryProvider argument therefore cannot, by construction, touch fork-policy at all.');

        const sessionSrc = await readSource('application/WorldNavigationSession.js');
        const findPublicationsBody = sessionSrc.match(/_findPublications\(documentId\) \{[\s\S]*?\n {4}\}/);
        assert(findPublicationsBody !== null && /this\._discoveryProvider/.test(findPublicationsBody[0]) && !/this\._publicationActionDiscoveryProvider/.test(findPublicationsBody[0]),
            'E2. RECONFIRMED (0.9.601 Section F2): _findPublications() — fork-policy\'s own choke point (_isKnownPublication()/_checkForkPolicy()) — still reads ONLY the narrow discoveryProvider. A worldLayoutProvider widening (Section D3/D4\'s own hypothetical) is a COMPLETELY SEPARATE constructor argument in application/CreateWorldViewUseCase.js from the one _findPublications() reads — the two have never been the same object since 0.9.597, and this audit changes nothing about that.');

        const composition = await readSource('application/CreateWorldViewUseCase.js');
        assert(/const worldLayoutProvider = new LocalWorldLayoutProvider\(\s*spatialIndexProvider,\s*discoveryProvider\s*\);/.test(composition),
            'E3. RECONFIRMED: production still builds worldLayoutProvider from the plain, narrow discoveryProvider — this audit\'s own Section D matrix is entirely a controlled, isolated hypothetical; nothing about today\'s actual wiring was touched to produce it.');

        console.log('✓ E — the SPECIFIC widening Section D\'s own D3/D4 cells rely on (worldLayoutProvider\'s own discoveryProvider argument -> publicationActionDiscoveryProvider) is, on its own, structurally SAFE: LocalWorldLayoutProvider has no fork-policy coupling to violate, and fork-policy\'s own _findPublications() choke point reads a completely different, already-separate constructor argument that this hypothetical does not touch. If a future milestone pursues ONLY this half of Section D\'s matrix, it would not recreate the 0.9.596 boundary problem. It would, however, land in cell (widened, absent) — Section D\'s own trap — unless Section F\'s own, separate gap is also closed.');
    }

    // ===============================================================
    // Section F — Material availability vs. Publication availability.
    // ===============================================================
    {
        const loadDocSrc = await readSource('application/LoadPublicationDocumentUseCase.js');
        assert(/this\._storageProvider\.load\(documentId\)/.test(loadDocSrc),
            'F1. LoadPublicationDocumentUseCase — what WorldNavigationSession#_loadWorld() actually calls to stream a document in (see F2) — reads storage[documentId] DIRECTLY. No discoveryProvider, no contentStore, no contentHash anywhere in this class.');
        const sessionSrc = await readSource('application/WorldNavigationSession.js');
        assert(/this\._loadPublicationDocumentUseCase\.execute\(documentId, this\._eventBus\)/.test(sessionSrc),
            'F2. _loadWorld(documentId) — the real method updateSpatialView() calls for every document entering the streamed/visible set — calls exactly that use case, with the streamed documentId, and nothing else.');

        const publisherSrc = await readSource('publisher/LocalPublisherProvider.js');
        assert(/this\._storageProvider\.save\(document\.world\.id, migratedJson\)/.test(publisherSrc),
            'F3. The ONE place in this codebase that populates storage[documentId] for a Publication\'s own World content is LocalPublisherProvider.publish() — LOCAL AUTHORSHIP ONLY (publisher/LocalPublisherProvider.js, lines 54-55). This is exactly why P1 (Section C) renders and P2 does not: P1 went through this method; P2 never did and never could (P2 was never authored by this replica).');
        const contentStoreSrc = await readSource('content/LocalContentStore.js');
        assert(/CONTENT_KEY_PREFIX = 'content:'/.test(contentStoreSrc) && /this\._storageProvider\.save\(CONTENT_KEY_PREFIX \+ hash, text\)/.test(contentStoreSrc),
            'F4. The real DISCOVER/RESOLVE/VERIFY/materialize pipeline (StoreSnapshotContentUseCase, application/StoreSnapshotContentUseCase.js) stores a discovered Publication\'s bytes into a COMPLETELY DIFFERENT storage namespace: content-hash-addressed (`content:<hash>`), via LocalContentStore — never storage[documentId]. This is confirmed here at the storage-key level, not merely inferred from the classes involved.');

        // Live-confirm: nothing bridges the two namespaces today.
        {
            const storage = new InMemoryStorageProvider();
            const contentStore = new LocalContentStore(storage);
            const bytes = JSON.stringify({ schemaVersion: 1, world: { id: 'f-bridge-doc', buildings: [] }, metadata: { title: 'Bridge', author: 'x' } });
            const reference = contentStore.put(bytes); // simulates a successful materialize (StoreSnapshotContentUseCase's own STORED outcome)
            assert(contentStore.has(reference), 'F5. Sanity: the materialized content genuinely IS available, content-hash-addressed, in this replica\'s own local store.');
            const loadPublicationDocumentUseCase = new LoadPublicationDocumentUseCase(storage);
            let threw = null;
            try { loadPublicationDocumentUseCase.execute('f-bridge-doc'); } catch (e) { threw = e; }
            assert(threw !== null && /no document found/.test(threw.message),
                'F6. YET LoadPublicationDocumentUseCase — the live World View streaming path\'s own document loader — still cannot find it, because it never looks in the content-hash-addressed store at all. Materialized content and "streamable World content" are, today, two namespaces with no bridge between them.');
        }

        // The codebase DOES already have a precedent for content-hash-based
        // Document resolution — confirm it is real, tested, production
        // code, not a hypothetical this audit is inventing.
        const resolveSrc = await readSource('application/ResolvePublicationUseCase.js');
        assert(/this\._contentResolver\.resolve\(publication\.id\)/.test(resolveSrc) || /contentResolver/.test(resolveSrc),
            'F7. application/ResolvePublicationUseCase.js is a REAL, existing production class that resolves a Publication into a Document via a contentResolver collaborator — never via storage[documentId].');
        const loadPublishedSrc = await readSource('application/LoadPublishedWorldSessionUseCase.js');
        assert(/this\._contentStore\.get\(publication\.contentReference\)/.test(loadPublishedSrc),
            'F8. application/LoadPublishedWorldSessionUseCase.js likewise resolves a Document directly from a Publication\'s own contentReference via a contentStore — exactly the content-hash-addressed shape F4-F6 showed the live streaming path lacks. This pattern is not hypothetical; it already exists and is exercised by tests/PublishedWorld.test.js, tests/DecentralizedContent.test.js, and others.');

        // But confirm this precedent is never wired into the LIVE World
        // View streaming path.
        assert(!/LoadPublishedWorldSessionUseCase|ResolvePublicationUseCase/.test(sessionSrc),
            'F9. application/WorldNavigationSession.js — the class whose _loadWorld()/updateSpatialView() actually drives live World View streaming — imports neither of these classes.');
        const mainSrc = await readSource('ui/main.js');
        assert(/CreateWorldViewUseCase/.test(mainSrc) && !/CreateWorldViewStreamingUseCase/.test(mainSrc),
            'F10. ui/main.js — the app\'s own real composition root — wires CreateWorldViewUseCase.js (the narrow-discoveryProvider, storage[documentId]-based World View this whole arc has been examining) and never wires application/CreateWorldViewStreamingUseCase.js, a SEPARATE, parallel World View streaming subsystem (world/WorldViewStreamingSession.js) that DOES use ResolvePublicationUseCase\'s content-hash-based resolution. That second subsystem exists in this codebase but is orphaned — never reachable from the actual running app.');

        // And confirm that orphaned subsystem would not even help here: its
        // OWN content resolver is itself local-storage-only.
        const contentResolverSrc = await readSource('discovery/LocalContentResolver.js');
        assert(/this\._publisherProvider\.loadSnapshot\(publicationId\)/.test(contentResolverSrc),
            'F11. Even application/CreateWorldViewStreamingUseCase.js\'s OWN contentResolver (discovery/LocalContentResolver.js) reads publisherProvider.loadSnapshot(publicationId) — which reads storage["snapshot:" + publicationId], populated ONLY by LocalPublisherProvider.publish() (the same local-authorship-only write as F3). This orphaned subsystem would NOT resolve a genuinely decentralized-discovered Publication\'s content either — it has the identical local-only limitation as the live path, just expressed through a different key.');

        console.log(`
✓ F — MATERIAL AVAILABILITY vs. PUBLICATION AVAILABILITY, PRECISELY
  LOCATED. A Publication being "available" (Repository-admitted,
  resolvable by id/documentId — 0.9.595-0.9.601's own arc) is a
  completely different fact from its WORLD CONTENT being available in
  the one storage shape (storage[documentId]) the live World View
  streaming path actually reads (F1/F2). The real DISCOVER/RESOLVE/
  VERIFY/materialize pipeline populates a different, content-hash-
  addressed namespace instead (F3/F4), and nothing bridges the two
  today, live-confirmed (F5/F6). This codebase already has a working,
  tested, content-hash-based Document-resolution pattern (F7/F8) — so a
  future fix is not "invent a new mechanism" — but that pattern is
  wired only to a separate, orphaned streaming subsystem no production
  code path ever reaches (F9/F10), and even that subsystem's own
  resolver would not actually help, because it is ALSO local-storage-
  only under a different key (F11). No ready-made bridge exists
  anywhere in this codebase today; closing this cell is real,
  additional integration work, not a wiring fix.
`);
    }

    // ===============================================================
    // Section G — Architecture-intent check against docs/Principles.md.
    // ===============================================================
    {
        const worldLayoutSrc = await readSource('world-layout/LocalWorldLayoutProvider.js');
        const findVisibleBody = worldLayoutSrc.match(/findVisibleDocuments\(viewCenter, viewRadius = 100\) \{[\s\S]*?\n {4}\}/);
        assert(findVisibleBody !== null, 'G1. Sanity: findVisibleDocuments() body located.');
        assert(/const placements = this\._spatialIndexProvider\.discover\(viewCenter, viewRadius\);/.test(findVisibleBody[0]),
            'G2. Phase 1 genuinely matches docs/Principles.md 0.2.11\'s own design: the spatial index IS queried first, and DOES return the lightweight WorldPlacement(s) for a Repository-admitted-only Publication\'s real placement (reconfirmed live in Section A5/D — the spatial index never fails to find P).');
        assert(/const publication = this\._discoveryProvider\.findById\(p\.publicationId\);\s*\n\s*if \(publication\) \{/.test(findVisibleBody[0]),
            'G3. But Phase 2 does NOT match 0.2.11\'s own "the caller decides which publications to actually load" design: resolution to a full Publication happens INSIDE the visibility query itself, and a placement whose Publication cannot be resolved (narrow discoveryProvider, Section A/C) is SILENTLY DROPPED from the visible set entirely — never surfaced as "a placement exists here, content not yet resolved," the two-phase shape 0.2.11\'s own text describes.');

        console.log(`
✓ G — This is the textual basis for this audit\'s own classification
  (Section K). docs/Principles.md 0.2.11 explicitly describes VISIBILITY
  (which placements are spatially relevant) and RESOLUTION (loading the
  actual Publication/content for those placements) as two separate
  phases, with the caller — not the spatial-discoverability layer itself
  — deciding what to do when resolution is not possible or not yet done.
  The CURRENT LocalWorldLayoutProvider implementation conflates them:
  Publication resolution happens as an unconditional, inseparable part
  of computing "is this document visible" at all. A placement that is
  genuinely, spatially relevant (its WorldPlacement IS found — G2) is
  treated identically to a placement that does not exist, purely because
  step 2 could not resolve it. This is not the deliberate rendering/
  placement separation Section B\'s own 0.2.11/0.2.12 quotes describe —
  it is a narrower implementation detail (an unconditional inline
  resolve-or-drop) that happens to ALSO enforce that separation as a
  side effect, for exactly the Publication family (Repository-admitted-
  only) that 0.9.595 is what first made this distinction observable at
  all. Restoring 0.2.11's own two-phase design as ACTUALLY DESCRIBED —
  visibility from the spatial index alone, resolution as a separate,
  later, caller-decided step — is a more precise target than "widen the
  discoveryProvider argument," though Section D/F already showed the
  ingredient decomposition is the harder part regardless of which frame
  is used to describe the fix.
`);
    }

    // ===============================================================
    // Section H — Re-entry and lifecycle.
    // ===============================================================
    {
        const decentralized = new DecentralizedPublicationDiscoveryProvider();
        const publicationId = 'h-pub';
        const documentId = 'h-doc';
        seedRepositoryAdmittedPublication(decentralized, { id: publicationId, documentId });
        const storage = new InMemoryStorageProvider();

        // Visit 1: place P.
        {
            const { session } = buildJourneySession(storage, { decentralizedPublicationDiscoveryProvider: decentralized });
            session.placePublication(publicationId, { x: 3, y: 0, z: 3 });
        }

        // Visit 2: an entirely separate session/replica object graph over
        // the SAME persisted storage — "leave and return."
        {
            const { worldLayoutProvider, placementRegistry } = buildJourneySession(storage, { decentralizedPublicationDiscoveryProvider: decentralized });
            assert(placementRegistry.findByPublicationId(publicationId).length === 1, 'H1. The PlacementRecord itself survived re-entry perfectly, as durable truth should (0.2.12).');
            assert(!worldLayoutProvider.findVisibleDocuments({ x: 3, y: 0, z: 3 }, 1000).includes(documentId),
                'H2. The rendering gap is STILL PRESENT on a fresh, separate visit — it is not a transient, session-local glitch that a reload or re-entry happens to fix; it is deterministic given the same underlying provider composition.');
        }

        // Visit 3: yet another fresh session — confirms determinism, not
        // a one-off.
        {
            const { worldLayoutProvider } = buildJourneySession(storage, { decentralizedPublicationDiscoveryProvider: decentralized });
            assert(!worldLayoutProvider.findVisibleDocuments({ x: 3, y: 0, z: 3 }, 1000).includes(documentId),
                'H3. Reconfirmed a second time — the gap is a structural, deterministic function of today\'s provider composition, never a race, cache-staleness, or first-visit-only artifact.');
        }

        console.log('✓ H — this is squarely a PERMANENT semantic state ("placed but not currently presentable"), never a transient materialization concern that time, re-entry, or a second visit resolves on its own (contrast with a genuine "material became available later" story, which Section D\'s own material-present cells show WOULD resolve it, once the missing ingredient is actually supplied).');
    }

    // ===============================================================
    // Section I — User-visible truthfulness.
    // ===============================================================
    {
        const viewSrc = await readSource('ui/views/WorldView.js');
        const placeWrapper = viewSrc.match(/function placeOwnPublication\(publication\) \{[\s\S]*?\n {8}\}/);
        assert(placeWrapper !== null, 'I1. Sanity: placeOwnPublication() located.');
        assert(/session\.placePublication\(publication\.id, position\);\s*\n\s*feedback\.show\('Publication placed in World'\);/.test(placeWrapper[0]),
            'I2. placeOwnPublication() calls feedback.show(\'Publication placed in World\') UNCONDITIONALLY, immediately after session.placePublication() returns — with no check of worldLayoutProvider visibility, no check of whether the document is currently streamable, and no distinction between P1\'s case (Section C: genuinely, immediately visible) and P2\'s case (Section A/C: PlacementRecord exists, nothing renders). The message is literally true in the PlacementRecord/0.2.12 sense (Section B) — "placed" — but reads, to a user with no knowledge of this architecture, as "now present and visible in the World," which for a Repository-admitted-only Publication it currently is not.');

        console.log('✓ I — recorded as a real, precise, previously-unmeasured truthfulness question, per this audit\'s own remit (Section H of the requesting brief): NOT asserted to be wrong — "placed" is accurate to the PlacementRecord\'s own documented meaning — but the ONE user-facing sentence this action produces makes no distinction between a Publication that will and will not actually appear, and a user has no other signal available to tell the two apart in the moment. This is exactly the shape of gap Section K\'s own classification below accounts for.');
    }

    // ===============================================================
    // Section J — Regression / no production changes.
    // ===============================================================
    {
        const composition = await readSource('application/CreateWorldViewUseCase.js');
        assert(/const worldLayoutProvider = new LocalWorldLayoutProvider\(\s*spatialIndexProvider,\s*discoveryProvider\s*\);/.test(composition),
            'J1. Production composition is unchanged by this audit — reconfirmed one more time at the very end, the same invariant Section E already established.');
        const placePublicationSrc = await readSource('application/PlacePublicationUseCase.js');
        assert(!/publication\.author/.test(placePublicationSrc),
            'J2. RECONFIRMED (0.9.601 Section B7): PlacePublicationUseCase.js still never reads publication.author — placement-authoring logic itself is untouched by anything in this file; see 0.9.601 Section B/C/G/H for that arc\'s own exhaustive regression coverage.');
        const uiFiles = await readdir(new URL('../ui/components/', import.meta.url));
        assert(!uiFiles.some((f) => /unplaced|presentab/i.test(f)), 'J3. No new UI surface of any kind was introduced by this audit — consistent with its own test-only type.');

        console.log('✓ J — this file touches no production file (readFile/readdir only) and introduces no new production capability, surface, or behavior. Existing placement-authoring regression coverage (move/remove, multi-Publication isolation, negative cases, authorization boundary) is 0.9.601\'s own, already-passing, entirely unaffected by this audit\'s own read-only + isolated-hypothetical methodology.');
    }

    // ===============================================================
    // Section K — Closure classification.
    // ===============================================================
    {
        console.log(`
================================================================
CLOSURE CLASSIFICATION — 0.9.602
================================================================

CENTRAL QUESTION, answered: after an explicit Place, is a Repository-
admitted-only Publication's absence from World View rendering a
deliberate boundary (ALREADY_CORRECT) or a genuine continuity gap?

NOT ALREADY_CORRECT, WITHOUT QUALIFICATION. docs/Principles.md 0.2.11
explicitly describes a two-phase design — spatial visibility from the
index, Publication/content resolution as a separate, caller-decided
step — that the CURRENT LocalWorldLayoutProvider implementation does
not actually follow (Section G): it conflates the two phases, silently
dropping a genuinely-placed publication from the visible set the
moment Publication resolution fails, rather than surfacing "placed,
not yet resolved" as its own distinct state the way 0.2.11's own text
anticipates. The narrowness is real and, on its own restricted axis
(fork-policy non-interference — Section E), safe to widen. So this is
not a case of "the architecture intends exactly this restriction and it
is working as designed" — Section G runs directly against that reading.

NOT A SIMPLE PRESENTATION_GAP EITHER. A presentation gap would mean the
World state is already fully correct and only a UI layer fails to
expose it. Section D's own 2x2 matrix rules this out precisely: even
with discovery-scope widened (cell D3), the actual World content
literally cannot be loaded — LoadPublicationDocumentUseCase throws "no
document found." No UI-only fix can paper over a document that does not
exist at the storage key the streaming path reads.

CLASSIFICATION: POST_PLACEMENT_CONTINUITY_GAP, decomposing into exactly
two independently-scoped pieces — this decomposition, not either piece
alone, is this audit's own primary product of value:

  (i) A narrow, low-risk CAPABILITY_GAP in DISCOVERY SCOPE
      (worldLayoutProvider's own discoveryProvider argument,
      application/CreateWorldViewUseCase.js) — the same shape of fix
      0.9.597/0.9.599/0.9.600 already used and validated for Publication-
      fact and placement-action resolution, structurally safe here too
      (Section E: LocalWorldLayoutProvider has zero fork-policy coupling
      to violate; fork-policy's own _findPublications() choke point
      reads an entirely separate, already-established argument). BUT
      this piece ALONE, live-proven (Section D3), lands in the WORSE of
      the two incomplete cells: a Publication becomes visible/positioned
      as a place-shaped marker whose actual World content still cannot
      stream in. Not recommended to ship in isolation.

  (ii) A genuinely separate, materially larger MATERIALIZATION_GAP:
      bridging content-hash-addressed decentralized material (what the
      real DISCOVER/RESOLVE/VERIFY/materialize pipeline actually
      produces — Section F) into the documentId-keyed local storage the
      live World View streaming path requires. This codebase already
      has a working, tested content-hash-based Document-resolution
      pattern (ResolvePublicationUseCase/LoadPublishedWorldSessionUseCase)
      — this is not "invent a new mechanism" — but that pattern is wired
      only to an orphaned, unreachable parallel subsystem
      (CreateWorldViewStreamingUseCase/WorldViewStreamingSession) that
      ui/main.js never constructs, and even that subsystem's own
      resolver would not solve this specific case (Section F11). Closing
      this piece is real integration work: deciding how/when a placed-
      but-unmaterialized Publication's content gets fetched and bridged
      into the streaming path, a genuinely separate, larger product and
      architectural decision this audit does not design further, per
      its own remit ("no new UI until the audit establishes what
      'placed' is supposed to mean" — precisely honored here).

RECOMMENDATION, PRECISELY SCOPED, NOTHING IMPLEMENTED HERE. If the
product owner decides this journey should close: do NOT ship (i) alone
(Section D3's own trap). Either (a) scope a single future milestone that
does both (i) and (ii) together — the only combination (Section D4)
that actually closes the journey to literal World View presence — or
(b) leave the current, silent omission in place, but pair it with a
SMALL, HONEST fix to Section I's own finding: distinguish "placed" from
"placed and visible" in the one user-facing message this action
produces, so a user is never told something that is not yet true,
independent of whether or when the larger (ii) is ever built. Both
paths are legitimate, narrowly-scoped next decisions; this audit
recommends neither over the other — that remains the product owner's
call, now with the precise seam, its exact two-part cost, and the
existing-but-unwired precedent for half of it all in hand, rather than
a single, underspecified "PlacementRecord exists, rendering doesn't."
================================================================
`);
    }

    console.log('✅ All Post-Placement World Visibility Product Boundary Audit tests passed.');
}

run().catch((error) => {
    console.error('PostPlacementWorldVisibilityProductBoundaryAudit.test.js FAILED:', error);
    process.exitCode = 1;
});
