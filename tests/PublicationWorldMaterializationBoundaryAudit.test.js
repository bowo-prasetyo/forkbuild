import { readFile } from 'node:fs/promises';

import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { DecentralizedPublicationDiscoveryProvider } from '../discovery/DecentralizedPublicationDiscoveryProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { LocalWorldLayoutProvider } from '../world-layout/LocalWorldLayoutProvider.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { PlacePublicationUseCase } from '../application/PlacePublicationUseCase.js';
import { LoadPublicationDocumentUseCase } from '../application/LoadPublicationDocumentUseCase.js';
import { LoadPublishedWorldSessionUseCase } from '../application/LoadPublishedWorldSessionUseCase.js';
import { StoreSnapshotContentUseCase } from '../application/StoreSnapshotContentUseCase.js';
import { StoreSnapshotContentOutcome } from '../application/StoreSnapshotContentOutcome.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { WorldDiscoverySourceRegistry } from '../application/WorldDiscoverySourceRegistry.js';
import { registerMaterializedSnapshotWorldSource } from '../application/MaterializedSnapshotWorldDiscoveryBridge.js';
import { SnapshotWorldPlacementOutcome } from '../application/SnapshotWorldPlacementOutcome.js';
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

// 0.9.603 — Publication World Materialization Boundary Audit.
//
// TYPE: test-only architectural audit. PRODUCTION CHANGES: none. This
// file touches no production file — it only reads them (readFile) to
// confirm structural claims, and constructs real production classes
// (never mocks of them) to prove behavior live.
//
// CENTRAL QUESTION, adapted from the requesting brief: 0.9.602 proved,
// live, a 2x2 matrix — rendering a Repository-admitted-only Publication
// requires BOTH a discovery-scope bridge (worldLayoutProvider's own
// discoveryProvider argument) AND a material bridge (content-hash-
// addressed bytes reaching the documentId-keyed storage the streaming
// path reads) — and that neither alone is sufficient. 0.9.602 Section F
// already showed a working, tested content-hash-based resolution
// pattern exists (ResolvePublicationUseCase/LoadPublishedWorldSessionUseCase)
// but is wired only to an orphaned, unreachable parallel subsystem. This
// audit's own, different, previously-unanswered question is: what is the
// SMALLEST existing-capability path by which verified Publication
// material could cross the material bridge, WITHOUT (a) copying bytes
// into a second, duplicate storage[documentId] entry, (b) conflating
// contentHash with documentId, or (c) accepting anything short of fully
// verified bytes — and does anything ELSE already wired into the live
// app (in particular the WorldDiscoverySourceRegistry/WorldEncounterCanvas
// "World Encounters" panel, discovered by this audit's own preliminary
// investigation) already close this gap by some other route.
//
// SECTIONS:
//   A. Starting point, reconfirmed minimally (not re-derived).
//   B. The contentHash/documentId identity boundary.
//   C. WorldDiscoverySourceRegistry/WorldEncounterCanvas is NOT an
//      existing material bridge — falsified live.
//   D. An adapter over EXISTING storage, composed from EXISTING classes,
//      proven to resolve verified material with zero copying.
//   E. The composition root already holds every collaborator this
//      adapter needs — zero new collaborators, only a new call.
//   F. Four material states — only verified-and-well-formed renders.
//   G. Discovery-scope bridge, reconfirmed (0.9.602 Section E stands).
//   H. Lifecycle: material arriving later, live-proven non-destructive.
//   I. Security/integrity chain: discover -> acquire -> verify -> accept.
//   J. Regression / no production changes.
//   K. Decision matrix / closure classification.

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

function serializedDocumentBytes(documentId, title = 'D') {
    const world = new World({ id: documentId });
    const building = new Building({ creator: 'x' });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    const doc = new Document({ world, metadata: new DocumentMetadata({ title, author: 'x' }) });
    return JSON.stringify(new DocumentSerializer().serialize(doc));
}

function seedRepositoryAdmittedPublication(decentralizedProvider, { id, documentId = id, title = 'Discovered Work', author = 'someone-else', contentReference = null } = {}) {
    const publication = new Publication({
        id, documentId, title, author,
        contentReference: contentReference || new ContentReference({ hash: 'a'.repeat(64) })
    });
    decentralizedProvider.add(publication);
    return publication;
}

async function run() {
    console.log('Running Publication World Materialization Boundary Audit...\n');

    // ===============================================================
    // Section A — Starting point, reconfirmed minimally.
    // ===============================================================
    let flagship;
    {
        const storage = new InMemoryStorageProvider();
        const contentStore = new LocalContentStore(storage);
        const bytes = serializedDocumentBytes('a-flagship-doc', 'Flagship');
        const contentReference = contentStore.put(bytes);

        const decentralized = new DecentralizedPublicationDiscoveryProvider();
        const publication = seedRepositoryAdmittedPublication(decentralized, {
            id: 'a-flagship-pub', documentId: 'a-flagship-doc', contentReference
        });

        assert(contentStore.has(contentReference), 'A1. The flagship Publication\'s World content is genuinely, verifiably materialized in this replica\'s own content-hash-addressed store.');
        const loadPublicationDocumentUseCase = new LoadPublicationDocumentUseCase(storage);
        let threw = null;
        try { loadPublicationDocumentUseCase.execute(publication.documentId); } catch (e) { threw = e; }
        assert(threw !== null && /no document found/.test(threw.message),
            'A2. RECONFIRMED (0.9.602 Section F5/F6): the live World View streaming path (storage[documentId]) still cannot find it — materialized, verified content and "streamable World content" remain two disconnected facts today. This audit does not re-derive 0.9.602\'s own exhaustive 2x2 matrix; it begins from this single, already-established cell and investigates the material bridge specifically.');

        flagship = { storage, contentStore, contentReference, publication, bytes };
        console.log('✓ A — starting cell reconfirmed: verified material exists (A1), the live streaming path cannot see it (A2).');
    }

    // ===============================================================
    // Section B — The contentHash/documentId identity boundary.
    // ===============================================================
    {
        const referenceSrc = await readSource('core/ContentReference.js');
        assert(!/documentId/.test(referenceSrc),
            'B1. core/ContentReference.js itself never mentions documentId anywhere — its own verify() depends on bytes and a claimed hash alone (computeContentHash(text) === this._hash). It has no opinion about, and no access to, WHICH document those bytes are for.');

        // Live: the SAME bytes, hashed once, are referenced by two
        // DIFFERENT Publications naming two DIFFERENT documentIds. The
        // hash never changes; verify() passes for both, identically.
        // This proves content-hash verification and documentId
        // resolution are two independent facts — verifying bytes can
        // never, by itself, tell a caller which document they belong to.
        const bytes = serializedDocumentBytes('b-shared-doc', 'Shared Bytes');
        const reference = new ContentReference({ hash: 'irrelevant-because-recomputed-below' });
        const actualReference = new LocalContentStore(new InMemoryStorageProvider()).put(bytes);
        const p1 = new Publication({ id: 'b-p1', documentId: 'b-doc-one', contentReference: actualReference });
        const p2 = new Publication({ id: 'b-p2', documentId: 'b-doc-two', contentReference: actualReference });
        assert(p1.documentId !== p2.documentId, 'B2. Sanity: two distinct documentIds.');
        assert(p1.contentReference.hash === p2.contentReference.hash, 'B3. Sanity: identical contentHash (same bytes).');
        assert(actualReference.verify(bytes) === true, 'B4. verify() passes for the actual bytes.');
        assert(new ContentReference(p1.contentReference.toJSON()).verify(bytes) === new ContentReference(p2.contentReference.toJSON()).verify(bytes),
            'B5. verify() returns the IDENTICAL result regardless of which Publication (which documentId) is asking — reconfirmed live: hash verification never depends on, and never resolves, documentId. Treating "verified" as "verified FOR this specific documentId" would be a caller-invented assumption this class itself makes no attempt to support.');

        // The signing envelope is what actually BINDS a documentId to a
        // contentHash/contentReference, authoritatively, per-Publication
        // — never the hash itself.
        const descriptor = p1.getSigningDescriptor();
        assert(descriptor.payload.documentId === 'b-doc-one' && descriptor.payload.contentReference.hash === actualReference.hash,
            'B6. Publication.getSigningDescriptor() (publisher/Publication.js) carries BOTH documentId and contentReference in the SAME signed payload — reconfirmed live from a real Publication instance. A verified Publication signature (identity/AuthorizationVerifier, exercised elsewhere — VerifyPublicationUseCase.js) is therefore what authoritatively answers "these exact verified bytes belong to THIS documentId," never an inference from the hash alone.');

        const publicationSrc = await readSource('publisher/Publication.js');
        assert(/Identity -> signs -> Publication metadata\s*\n\/\/\s*-> references -> content hash\s*\n\/\/\s*-> identifies -> bytes/.test(publicationSrc),
            'B7. publisher/Publication.js\'s own header names exactly this chain in so many words — not this audit\'s own inference.');

        const contentStoreSrc = await readSource('content/LocalContentStore.js');
        assert(/CONTENT_KEY_PREFIX = 'content:'/.test(contentStoreSrc),
            'B8. Structurally, the two namespaces already coexist safely in the SAME underlying StorageProvider without any bridging work: LocalContentStore always writes under a `content:` prefix, disjoint by construction from the bare documentId keys LoadPublicationDocumentUseCase reads. A future bridge needs no new storage substrate — the substrate is already shared and already collision-free.');

        const encounterCanvasSrc = await readSource('ui/components/WorldEncounterCanvas.js');
        assert(/that identity\s*\n\/\/\s*\(`publicationId` \+ `contentHash`\) is deliberately never a `documentId`/.test(encounterCanvasSrc),
            'B9. This exact identity distinction is already a named, deliberate architectural principle ELSEWHERE in this codebase (ui/components/WorldEncounterCanvas.js, 0.9.552 family) — this audit is not inventing a new rule, only confirming one that already exists is honored consistently.');

        console.log('✓ B — contentHash and documentId are, and must remain, two independent identities: a content hash names WHAT bytes are present; documentId names WHICH document they are claimed to be. Verification (ContentReference#verify) establishes the former; a Publication\'s own signed envelope (Publication#getSigningDescriptor(), verified via VerifyPublicationUseCase/AuthorizationVerifier) establishes the binding between the two. No future bridge may treat contentHash === documentId, or infer one from the other — this reconfirms the brief\'s own concern is real, and shows the codebase already has the correct primitive (the Publication\'s own signed binding) to resolve it correctly, never a new identity rule.');
    }

    // ===============================================================
    // Section C — WorldDiscoverySourceRegistry/WorldEncounterCanvas is
    // NOT an existing material bridge. This audit's own preliminary
    // investigation surfaced this subsystem as a plausible
    // ALREADY_SUPPORTED candidate; this section falsifies that live.
    // ===============================================================
    {
        const registry = new WorldDiscoverySourceRegistry();
        const worldPlacementResult = Object.freeze({
            outcome: SnapshotWorldPlacementOutcome.PLACED,
            publicationId: flagship.publication.id,
            contentHash: flagship.contentReference.hash,
            position: { x: 7, y: 0, z: 7 }
        });
        const result = registerMaterializedSnapshotWorldSource(registry, worldPlacementResult, flagship.publication);
        assert(result.outcome === 'registered' || /registered/i.test(String(result.outcome)),
            'C1. Sanity: registering the flagship\'s already-materialized Snapshot into the registry succeeds (mirrors what OwnPublicationPanel\'s own DISCOVER->...->PLACE pipeline does today for the "World Encounters" panel).');

        const sources = registry.listSources();
        assert(sources.length === 1, 'C2. The registry now holds exactly one source for this Publication.');
        const source = sources[0];
        assert(!('document' in source) && !('world' in source) && !('bricks' in source) && !('buildings' in source),
            'C3. The registered source carries NO document/world/brick content of any kind — live-confirmed on the actual object this real production function returned, not merely inferred from reading source. It is a position + Publication-metadata marker (core/WorldEncounter.js\'s own "DISCOVERY PROJECTION, NEVER A NEW STORE"), structurally incapable of being the material bridge on its own.');

        // Registering into this ENTIRELY SEPARATE registry does nothing
        // whatsoever to the spatial index or storage[documentId] the
        // classic streaming path reads — confirmed live, not assumed.
        const spatialIndexProvider = new LocalSpatialIndexProvider(flagship.storage);
        const discoveryProvider = new LocalDiscoveryProvider(flagship.storage);
        const worldLayoutProvider = new LocalWorldLayoutProvider(spatialIndexProvider, discoveryProvider);
        assert(!worldLayoutProvider.findVisibleDocuments({ x: 7, y: 0, z: 7 }, 1000).includes(flagship.publication.documentId),
            'C4. worldLayoutProvider — the classic streaming path\'s own visibility query — remains completely unaffected: WorldDiscoverySourceRegistry and LocalSpatialIndexProvider are two disjoint, independently-constructed pieces of runtime state with no code path connecting them.');
        const loadPublicationDocumentUseCase = new LoadPublicationDocumentUseCase(flagship.storage);
        let threw = null;
        try { loadPublicationDocumentUseCase.execute(flagship.publication.documentId); } catch (e) { threw = e; }
        assert(threw !== null, 'C5. And storage[documentId] is still empty — registering a marker never materializes, copies, or bridges anything into the streaming path\'s own storage.');

        // Confirm, at the source level, that an "encounter" click can
        // only ever hand off BACK into the same classic streaming path
        // this audit's Section A already showed fails for this exact
        // Publication family — never hydrate a Document of its own.
        const worldViewSrc = await readSource('ui/views/WorldView.js');
        assert(/exploreEncounteredPublicationCommand[\s\S]{0,400}?focusWorld\(publication\.documentId\)/.test(worldViewSrc)
            || /focusWorld\(documentId\)/.test(worldViewSrc),
            'C6. ui/views/WorldView.js\'s own "explore" action on an encounter marker hands off via focusWorld(documentId) — the SAME documentId-keyed navigation that ultimately calls session.focusDocument()/_loadWorld(), never a document hydrated directly from the encounter\'s own contentHash/registry entry.');
        assert(!/function focusWorld[\s\S]{0,600}?(loadPublishedWorldSession|contentStore\.get|contentReference)/i.test(worldViewSrc),
            'C7. Confirmed: focusWorld() itself never reads a contentStore or a contentReference — it is pure navigation (router push to /world/<documentId>), not a second, alternate content-loading mechanism.');

        console.log('✓ C — FALSIFIED: WorldDiscoverySourceRegistry/WorldEncounterCanvas ("World Encounters" panel) is real, live, and production-wired (ui/main.js bootstraps it; ui/views/WorldView.js mounts it) — but it is a discovery-projection marker overlay, never a material bridge. It can tell a Wanderer "a verified Publication exists near here," but clicking through routes back into the EXACT SAME storage[documentId] streaming path Section A already showed cannot resolve this Publication family. This rules out ALREADY_SUPPORTED via this route, precisely, rather than by assumption.');
    }

    // ===============================================================
    // Section D — An adapter over EXISTING storage, composed from
    // EXISTING classes, proven to resolve verified material with zero
    // copying. This is the brief's own preferred architecture
    // (Section D): a read-through view, never a second source of truth.
    // ===============================================================
    {
        // Deliberately NOT a new class invented by this audit. This is
        // application/LoadPublishedWorldSessionUseCase.js — a real,
        // already-existing, already-tested production class (see this
        // section's own D3 below) — composed with the SAME contentStore
        // this audit's Section A already materialized bytes into, and
        // the SAME DocumentSerializer every other document path in this
        // codebase already uses. `publisherProvider` (null here) is only
        // ever consulted on the "legacy, no contentReference" branch —
        // never reached, because this flagship Publication always
        // carries a contentReference — the same "pass null for an
        // unused collaborator" convention 0.9.602's own harness already
        // used for MoveWorldPlacementUseCase's third argument.
        const adapter = new LoadPublishedWorldSessionUseCase(null, new DocumentSerializer(), flagship.contentStore);
        const session = adapter.execute(flagship.publication);

        assert(session.getWorld().id === flagship.publication.documentId,
            'D1. The adapter resolves the flagship Publication\'s VERIFIED, content-hash-addressed bytes into a real World whose id matches the Publication\'s own documentId — the material bridge this audit set out to locate, built ENTIRELY from an already-existing class.');
        assert(session.getPublication() === flagship.publication, 'D2. The resulting session carries the exact same Publication reference — no re-fetch, no re-description.');
        assert(session.capabilities.canEdit === false && session.capabilities.canSave === false,
            'D3. PublishedWorldSession\'s own read-only capability boundary (application/PublishedWorldSession.js) applies automatically — this bridge produces a VIEW, never a mutable, independently-editable copy.');

        // THE ZERO-COPY CLAIM, LIVE-PROVEN: storage[documentId] (the bare
        // key, never the `content:` prefix) is untouched by this entire
        // resolution — no new persistent write happened anywhere.
        const loadPublicationDocumentUseCase = new LoadPublicationDocumentUseCase(flagship.storage);
        let threw = null;
        try { loadPublicationDocumentUseCase.execute(flagship.publication.documentId); } catch (e) { threw = e; }
        assert(threw !== null, 'D4. storage[documentId] is STILL empty after the adapter successfully resolved a full World — confirming this is a genuine read-through VIEW over the existing content-hash store, never a copy into a second, duplicate storage[documentId] entry. Section D of the brief\'s own preferred architecture ("adapter over existing storage," not "copy into storage[documentId]") is realized here with an existing class, not a new persistence mechanism.');

        // Confirm this class is real, existing, ALREADY tested
        // elsewhere — not invented by, or exercised for the first time
        // by, this audit.
        const loadPublishedSrc = await readSource('application/LoadPublishedWorldSessionUseCase.js');
        assert(/pipeline enforces snapshot integrity before the document enters/.test(loadPublishedSrc),
            'D5. Sanity: the exact same production file this audit imported and exercised live, unmodified.');

        console.log('✓ D — the material bridge the brief asked this audit to look for is not a missing capability that needs inventing: application/LoadPublishedWorldSessionUseCase.js, composed with the SAME contentStore any composition root already builds, already IS that bridge — a read-through adapter, never a copy, never a second source of truth, live-proven end to end (D1-D4).');
    }

    // ===============================================================
    // Section E — The composition root already holds every collaborator
    // this adapter needs. Zero new collaborators, only a new call.
    // ===============================================================
    {
        const compositionSrc = await readSource('application/CreateWorldViewUseCase.js');
        assert(/const contentStore = new LocalContentStore\(storageProvider\);/.test(compositionSrc),
            'E1. application/CreateWorldViewUseCase.js already constructs a LocalContentStore, at composition time, unconditionally — Section D\'s own adapter needs no NEW content-hash store of its own.');
        assert(/contentStore\s*\n\s*\};/.test(compositionSrc) || /contentStore\s*$/m.test(compositionSrc),
            'E2. That SAME contentStore is already returned/exposed from execute() (with the comment "Expose the spatial index and content store so the application layer can construct spatial use cases for the UI to consume") — it is not private, internal-only state a bridge would have to newly thread through.');
        assert(/LoadPublishedWorldSessionUseCase/.test(compositionSrc),
            'E3. UPDATED BY 0.9.605 (Wire Publication Discovery into World Rendering): this composition root now DOES construct LoadPublishedWorldSessionUseCase — the exact, smallest wiring this audit\'s own Section D/E identified as sufficient, threaded into WorldNavigationSession#_loadWorld() as a fallback for exactly the case this section\'s own closing paragraph named: storage[documentId] empty, Publication carries a contentReference. At the time this audit was written the gap was still open; 0.9.605 closed it.');

        // Confirm, structurally, that no OTHER production composition
        // root reaches LoadPublishedWorldSessionUseCase either — this
        // is not "wired somewhere else that this audit missed."
        // (Deliberately not asserted against every file in the
        // codebase — that would be brittle; the specific claim is that
        // ui/main.js, the app's own real composition root, never
        // constructs it, which 0.9.602 Section F10 already established
        // for the sibling ResolvePublicationUseCase and is reconfirmed
        // here for this one.)
        const mainSrc = await readSource('ui/main.js');
        assert(!/LoadPublishedWorldSessionUseCase/.test(mainSrc),
            'E4. RECONFIRMED: ui/main.js — the app\'s own real composition root — never constructs application/LoadPublishedWorldSessionUseCase.js either. The class exists, is tested (Section D5, and tests/PublishedWorld.test.js/DecentralizedContent.test.js/ForkPublishedWorld.test.js), and needs no new collaborator per Section E1/E2 — it is simply never called from the one composition root that matters.');

        console.log('✓ E — the SMALLEST existing-capability path the brief\'s own central question asks for is now precisely named: no new class, no new collaborator, no new storage. Wiring `_loadWorld()` (application/WorldNavigationSession.js) to fall back to Section D\'s own adapter — using the discoveryProvider and contentStore this ONE composition root already builds — when storage[documentId] comes back empty, is the entire remaining gap. This audit does not perform that wiring (a production change, outside its own test-only remit) — it establishes, live, that doing so requires assembling existing pieces, never inventing a new mechanism.');
    }

    // ===============================================================
    // Section F — Four material states. Only verified-and-well-formed
    // material may ever become renderable.
    // ===============================================================
    {
        function makeAdapter(storage) {
            return new LoadPublishedWorldSessionUseCase(null, new DocumentSerializer(), new LocalContentStore(storage));
        }

        // State 1 — Publication + verified material. The candidate for
        // rendering.
        {
            const storage = new InMemoryStorageProvider();
            const contentStore = new LocalContentStore(storage);
            const bytes = serializedDocumentBytes('f1-doc');
            const reference = contentStore.put(bytes);
            const publication = new Publication({ id: 'f1-pub', documentId: 'f1-doc', contentReference: reference });
            const session = makeAdapter(storage).execute(publication);
            assert(session.getWorld().id === 'f1-doc', 'F1. [verified, well-formed] renders — the only state that should.');
        }

        // State 2 — Publication + missing material (never materialized
        // at all — the real, current state for a genuinely
        // decentralized-only Publication that was never fetched).
        {
            const storage = new InMemoryStorageProvider();
            const reference = new ContentReference({ hash: 'b'.repeat(64) }); // never put() into any store
            const publication = new Publication({ id: 'f2-pub', documentId: 'f2-doc', contentReference: reference });
            let threw = null;
            try { makeAdapter(storage).execute(publication); } catch (e) { threw = e; }
            assert(threw !== null && /content not found/.test(threw.message),
                'F2. [missing material] refused, with a precise, distinguishable reason — never silently treated as an empty-but-valid World.');
        }

        // State 3 — Publication + malformed material (hash matches —
        // an honest, non-tampering local corruption or a genuinely
        // malformed publish — but the bytes do not describe a valid
        // Document).
        {
            const storage = new InMemoryStorageProvider();
            const contentStore = new LocalContentStore(storage);
            const malformedBytes = JSON.stringify({ schemaVersion: 1, world: { id: 'f3-doc' } }); // no metadata: guaranteed DocumentValidator failure
            const reference = contentStore.put(malformedBytes);
            const publication = new Publication({ id: 'f3-pub', documentId: 'f3-doc', contentReference: reference });
            let threw = null;
            try { makeAdapter(storage).execute(publication); } catch (e) { threw = e; }
            assert(threw !== null, 'F3. [hash verified, schema malformed] refused by DocumentSerializer\'s own validation (serializer/DocumentValidator.js) — passing hash verification is necessary, never sufficient, for something to become a renderable World. A malformed blob a publisher never actually authored as a Document can never slip through merely because its bytes happen to hash-match what a Publication claims.');
        }

        // State 4 — Publication + hash mismatch. THE case the brief
        // most specifically calls out: a documentId lookup succeeding
        // must NEVER, on its own, make tampered/wrong bytes renderable.
        // Simulated the only way this can genuinely arise: bytes
        // physically present under a content-addressed key (e.g. local
        // corruption after storage, or an untrusted transport writing
        // under a claimed-but-wrong hash) that do NOT actually hash to
        // that key — never by asking LocalContentStore.put() to do the
        // mismatching itself, since put() always derives the key FROM
        // the bytes it is given and therefore can never produce one.
        {
            const storage = new InMemoryStorageProvider();
            const contentStore = new LocalContentStore(storage);
            const claimedHash = 'c'.repeat(64);
            const tamperedBytes = serializedDocumentBytes('f4-doc', 'Tampered After Storage');
            storage.save('content:' + claimedHash, tamperedBytes); // bytes present, but do not hash to claimedHash
            const mismatchedReference = new ContentReference({ hash: claimedHash });
            assert(contentStore.has(mismatchedReference), 'F4-sanity. The documentId/content lookup itself succeeds — bytes ARE physically present under this content key.');
            assert(mismatchedReference.verify(tamperedBytes) === false, 'F4-sanity. And those bytes genuinely do not hash to the claimed key — a real mismatch, not a contrived one.');
            const publication = new Publication({ id: 'f4-pub', documentId: 'f4-doc', contentReference: mismatchedReference });
            let threw = null;
            try { makeAdapter(storage).execute(publication); } catch (e) { threw = e; }
            assert(threw !== null && /hash mismatch/.test(threw.message),
                'F4. [hash mismatch] refused BEFORE any deserialization is attempted (application/LoadPublishedWorldSessionUseCase.js checks contentReference.verify(bytes) strictly before JSON.parse/deserialize) — reconfirms the brief\'s own explicit requirement, live: a hash mismatch must not become renderable merely because the documentId/content lookup itself succeeded. It did succeed here (F4-sanity); the SEPARATE hash check is still what gates rendering.');
        }

        // Cross-check: the SAME strict-verify-before-store discipline
        // already exists one layer over, in the acquisition pipeline
        // itself (application/StoreSnapshotContentUseCase.js) — this
        // audit's adapter is not the only place this boundary is
        // enforced; it is enforced wherever bytes cross a trust
        // boundary in this codebase.
        {
            const storeSnapshotContentUseCase = new StoreSnapshotContentUseCase(new LocalContentStore(new InMemoryStorageProvider()));
            const bytes = serializedDocumentBytes('f5-doc');
            const result = await storeSnapshotContentUseCase.execute({ contentHash: 'd'.repeat(64), bytes });
            assert(result.outcome === StoreSnapshotContentOutcome.HASH_MISMATCH && result.contentReference === null,
                'F5. RECONFIRMED one layer up: application/StoreSnapshotContentUseCase.js — the ONE place this codebase ever turns claimed bytes into local possession — already refuses a hash mismatch before anything is ever stored. This audit\'s own Section D/F adapter inherits, never duplicates, this discipline.');
        }

        console.log(`
✓ F — FOUR MATERIAL STATES, LIVE-PROVEN:
    1. verified + well-formed   -> renders (F1)
    2. missing                  -> refused, precise reason (F2)
    3. verified-hash + malformed schema -> refused (F3)
    4. hash mismatch            -> refused BEFORE deserialization (F4)
  Only state 1 ever produces a renderable World. The trust boundary this
  audit's own material-bridge candidate (Section D) relies on is not
  newly invented for this audit — it is the SAME boundary application/
  StoreSnapshotContentUseCase.js already enforces for every OTHER
  caller that ever turns bytes into local possession (F5).
`);
    }

    // ===============================================================
    // Section G — Discovery-scope bridge, reconfirmed. 0.9.602 Section
    // E already exhaustively proved this half is structurally safe;
    // this audit does not re-derive it, only reconfirms the one
    // invariant it depends on still holds, unchanged, today.
    // ===============================================================
    {
        const worldLayoutSrc = await readSource('world-layout/LocalWorldLayoutProvider.js');
        assert(!/forkPolicy|isKnownPublication|license|authoriz/i.test(worldLayoutSrc),
            'G1. RECONFIRMED (0.9.602 Section E1): world-layout/LocalWorldLayoutProvider.js still contains no fork-policy/licensing/authorization logic — widening its own discoveryProvider argument remains, by construction, incapable of touching fork-policy.');
        const sessionSrc = await readSource('application/WorldNavigationSession.js');
        const findPublicationsBody = sessionSrc.match(/_findPublications\(documentId\) \{[\s\S]*?\n {4}\}/);
        assert(findPublicationsBody !== null && /this\._discoveryProvider/.test(findPublicationsBody[0]) && !/this\._publicationActionDiscoveryProvider/.test(findPublicationsBody[0]),
            'G2. RECONFIRMED (0.9.602 Section E2): fork-policy\'s own choke point, _findPublications(), still reads only the narrow discoveryProvider — a completely separate constructor argument from worldLayoutProvider\'s own. Nothing in this audit\'s own Sections A-F touches, or needs to touch, that separation.');

        console.log('✓ G — the discovery-scope bridge (i) is unchanged from 0.9.602\'s own conclusion: narrow, low-risk, and structurally safe on its own axis, but (per 0.9.602 Section D3) insufficient alone. This audit\'s own contribution is entirely on the material-bridge (ii) side (Sections C-F above) — it does not revisit or re-litigate (i).');
    }

    // ===============================================================
    // Section H — Lifecycle: material arriving later, live-proven
    // non-destructive to the durable placement truth that already
    // exists independently of it.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const contentStore = new LocalContentStore(storage);
        const decentralized = new DecentralizedPublicationDiscoveryProvider();
        const documentId = 'h-doc';
        const publicationId = 'h-pub';
        // Publication known, but its material is not yet materialized.
        const unmaterializedReference = new ContentReference({ hash: 'e'.repeat(64) });
        let publication = seedRepositoryAdmittedPublication(decentralized, { id: publicationId, documentId, contentReference: unmaterializedReference });

        // Explicit Place, exactly as 0.9.601/0.9.602 already exercised:
        // durable PlacementRecord + spatial-index truth exist
        // regardless of material state.
        const identity = new LocalIdentityProvider(storage);
        identity.login('alice');
        const brickRegistry = new CreateBrickRegistryUseCase().execute();
        const spatialIndexProvider = new LocalSpatialIndexProvider(storage);
        const placementRegistry = new LocalPlacementRegistry(storage, spatialIndexProvider);
        const loadPublicationDocumentUseCase = new LoadPublicationDocumentUseCase(storage);
        const placePublicationUseCase = new PlacePublicationUseCase(
            spatialIndexProvider, decentralized, loadPublicationDocumentUseCase, brickRegistry, placementRegistry, identity
        );
        const placement = placePublicationUseCase.execute(publicationId, { x: 11, y: 0, z: 11 });
        assert(placement !== null, 'H1. Explicit Place succeeds — durable truth (PlacementRecord/spatial index) is entirely independent of material state.');

        // Visit 1: material still absent. The adapter correctly refuses.
        {
            const adapter = new LoadPublishedWorldSessionUseCase(null, new DocumentSerializer(), contentStore);
            let threw = null;
            try { adapter.execute(publication); } catch (e) { threw = e; }
            assert(threw !== null, 'H2. [material absent] the adapter refuses — "placed" and "materialized" remain observably distinct states, exactly as PlacementRecord\'s own documented semantics (docs/Principles.md 0.2.12, reconfirmed by 0.9.602 Section B) require.');
        }

        // Material becomes available (a real acquisition — this
        // audit's own Section F/StoreSnapshotContentUseCase discipline
        // — happens some time later, e.g. a successful peer fetch).
        const bytes = serializedDocumentBytes(documentId, 'Arrived Later');
        const realReference = contentStore.put(bytes);
        publication = new Publication({ id: publicationId, documentId, contentReference: realReference }); // the SAME Publication, now carrying the reference that matches what was actually materialized

        // Visit 2: a FRESH resolution attempt over the SAME durable
        // state (no re-placement, no mutation of PlacementRecord/spatial
        // truth) now succeeds.
        {
            const adapter = new LoadPublishedWorldSessionUseCase(null, new DocumentSerializer(), contentStore);
            const session = adapter.execute(publication);
            assert(session.getWorld().id === documentId, 'H3. [material now present] the exact same durable placement, re-resolved fresh, now renders — with zero change to PlacementRecord or the spatial index (H1\'s own placement record is untouched throughout).');
        }
        assert(placementRegistry.findByPublicationId(publicationId).length === 1,
            'H4. The original PlacementRecord (H1) still exists, unmodified, exactly once — material arriving later is a pure, deterministic function of CURRENT material availability, never a mutation that had to be applied to World/placement state to "unlock" rendering.');

        console.log('✓ H — rendering readiness is correctly a deterministic function of current material availability, not a permanent mutation of World or placement state — confirmed live, not merely inferred from the shape of the classes involved. This is exactly the "PLACED + MATERIALIZABLE -> PRESENT" vs. "PLACED + MATERIAL UNAVAILABLE -> NOT PRESENT" distinction the brief\'s own Section I names, without this audit inventing new product vocabulary of its own — the existing classes already behave this way.');
    }

    // ===============================================================
    // Section I — Security/integrity chain: discover -> acquire ->
    // verify -> accept -> render, never discover -> render.
    // ===============================================================
    {
        const storeSrc = await readSource('application/StoreSnapshotContentUseCase.js');
        assert(/if \(!reference\.verify\(bytes\)\)/.test(storeSrc) && /return \{ outcome: StoreSnapshotContentOutcome\.HASH_MISMATCH/.test(storeSrc),
            'I1. application/StoreSnapshotContentUseCase.js — the ONE boundary every explicit acquisition source (PACKAGE/PLACEMENT/PEER) shares — verifies before ever calling localContentStore.put(). ACQUIRE never bypasses VERIFY.');
        const loadPublishedSrc = await readSource('application/LoadPublishedWorldSessionUseCase.js');
        const bytesIndex = loadPublishedSrc.indexOf('this._contentStore.get(publication.contentReference)');
        const verifyIndex = loadPublishedSrc.indexOf('publication.contentReference.verify(bytes)');
        const parseIndex = loadPublishedSrc.indexOf('JSON.parse(bytes)');
        assert(bytesIndex !== -1 && verifyIndex !== -1 && parseIndex !== -1 && bytesIndex < verifyIndex && verifyIndex < parseIndex,
            'I2. Within Section D\'s own material bridge, the three steps appear in this exact, unskippable order in the SOURCE FILE ITSELF: fetch bytes from the content store, THEN verify, THEN parse/deserialize. VERIFY structurally cannot be skipped or reordered after ACCEPT without editing this file.');
        assert(loadPublishedSrc.indexOf('this._documentSerializer.deserialize(snapshotJson)') > verifyIndex,
            'I3. RENDER (deserialize into a real, constructible Document/World) happens strictly after VERIFY, never before — reconfirmed at the source-ordering level, not just by this audit\'s own Section F runtime behavior.');

        console.log('✓ I — the chain this bridge candidate relies on is, textually and behaviorally, discover -> acquire -> verify -> accept -> render, never discover -> render. Nothing in Sections C-H asked for, or would benefit from, a shortcut around this ordering.');
    }

    // ===============================================================
    // Section J — Regression / no production changes.
    // ===============================================================
    {
        const compositionSrc = await readSource('application/CreateWorldViewUseCase.js');
        assert(/const worldLayoutProvider = new LocalWorldLayoutProvider\(\s*spatialIndexProvider,\s*publicationActionDiscoveryProvider\s*\);/.test(compositionSrc),
            'J1. UPDATED BY 0.9.605: production composition now wires worldLayoutProvider to publicationActionDiscoveryProvider (the discovery-side bridge, Section G\'s own (i)) — this audit\'s own PRODUCTION CHANGES: none applied only at the time it was written; 0.9.605 is the milestone that actually performed the wiring both this file and 0.9.604 identified as the smallest sufficient change.');
        assert(/LoadPublishedWorldSessionUseCase/.test(compositionSrc),
            'J2. UPDATED BY 0.9.605: the material bridge (Section G\'s own (ii)) is now ALSO wired into the actual composition root, exactly as this section\'s own Section E closing paragraph specified — never a new class, never a new collaborator, only the one new call site (WorldNavigationSession#_loadWorld()\'s own fallback) this audit already named.');
        const placePublicationSrc = await readSource('application/PlacePublicationUseCase.js');
        assert(!/publication\.author/.test(placePublicationSrc),
            'J3. RECONFIRMED (0.9.601/0.9.602): PlacePublicationUseCase.js still never reads publication.author.');

        console.log('✓ J — this file touches no production file (readFile only) and introduces no new production capability, surface, or behavior.');
    }

    // ===============================================================
    // Section K — Decision matrix / closure classification.
    // ===============================================================
    {
        console.log(`
================================================================
CLOSURE CLASSIFICATION — 0.9.603
================================================================

CENTRAL QUESTION, answered: is there a smaller existing-capability path
to the material bridge 0.9.602 identified as missing, and does anything
already wired into the live app (the WorldDiscoverySourceRegistry/
WorldEncounterCanvas "World Encounters" panel, this audit's own new
investigation) already close it by another route?

NOT ALREADY_SUPPORTED. Section C falsifies, live, the one plausible
existing-bridge candidate this audit went looking for: the "World
Encounters" panel is a real, live, production-wired discovery-projection
marker overlay, but it is structurally incapable of carrying or
resolving World document content, and its own "explore" action hands off
back into the exact same broken storage[documentId] path 0.9.602 already
found. No other production-wired subsystem was found that bridges
content-hash material into the documentId-keyed streaming path.

NOT A NEW-MECHANISM MATERIAL_BRIDGE_GAP EITHER — a MORE PRECISE finding
than 0.9.602 Section F's own "closing this piece is real integration
work" left open. Section D proves, live, that application/
LoadPublishedWorldSessionUseCase.js — already existing, already tested
(tests/PublishedWorld.test.js, tests/DecentralizedContent.test.js,
tests/ForkPublishedWorld.test.js) — composed with the SAME contentStore
application/CreateWorldViewUseCase.js already constructs (Section E1-E2),
already IS the material bridge: a read-through adapter, never a copy
into a second storage[documentId] entry (Section D4), that correctly
distinguishes all four material states (Section F: verified, missing,
malformed, hash-mismatch — only the first renders) through the SAME
verify-then-accept discipline already enforced one layer up in
application/StoreSnapshotContentUseCase.js (Section F5/I1-I3), and that
never conflates contentHash with documentId (Section B).

CLASSIFICATION: BOTH_BRIDGES_REQUIRED, UNCHANGED FROM 0.9.602's OWN
CONCLUSION IN SUBSTANCE, BUT NARROWED IN SCOPE ON THE MATERIAL SIDE:

  (i) DISCOVERY_BRIDGE_GAP (worldLayoutProvider's own discoveryProvider
      argument) — unchanged, reconfirmed safe-but-insufficient-alone
      (Section G, citing 0.9.602 Section D3/E verbatim).

  (ii) MATERIAL_BRIDGE_GAP — narrower than 0.9.602 Section F's own
      framing suggested. The bridge is not "real integration work" in
      the sense of new mechanism design; it is ALREADY a fully-built,
      already-tested class (LoadPublishedWorldSessionUseCase) that
      needs exactly one new call site: _loadWorld()/updateSpatialView()
      (application/WorldNavigationSession.js) falling back to it, using
      collaborators (discoveryProvider, contentStore) the ONE real
      composition root (application/CreateWorldViewUseCase.js) already
      builds and already exposes, when storage[documentId] comes back
      empty for a document whose Publication carries a contentReference.

RECOMMENDATION, PRECISELY SCOPED, NOTHING IMPLEMENTED HERE. If (i) and
(ii) are pursued together in a future milestone (the only combination
0.9.602 Section D4 showed actually closes the journey), (ii)'s own scope
is now the smallest it has been in this audit arc: one new call site,
zero new classes, zero new storage, zero new identity rules — reusing
Section D's own exact composition. This audit still does not perform
that wiring itself (a production change, outside a test-only audit's own
remit) and still does not adjudicate whether (i)+(ii) together should
ship before, after, or independently of Section H/I's own product-
boundary question ("placed" vs. "placed and visible") 0.9.602 Section I
already raised and left to the product owner.
================================================================
`);
    }

    console.log('✅ All Publication World Materialization Boundary Audit tests passed.');
}

run().catch((error) => {
    console.error('PublicationWorldMaterializationBoundaryAudit.test.js FAILED:', error);
    process.exitCode = 1;
});
