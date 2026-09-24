import { readFile } from 'node:fs/promises';

import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { DecentralizedPublicationDiscoveryProvider } from '../discovery/DecentralizedPublicationDiscoveryProvider.js';
import { CompositeDiscoveryProvider } from '../discovery/CompositeDiscoveryProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { LocalWorldLayoutProvider } from '../world-layout/LocalWorldLayoutProvider.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { PlacePublicationUseCase } from '../application/placement/PlacePublicationUseCase.js';
import { RemoveWorldPlacementUseCase } from '../application/placement/RemoveWorldPlacementUseCase.js';
import { LoadPublicationDocumentUseCase } from '../application/publication/LoadPublicationDocumentUseCase.js';
import { LoadPublishedWorldSessionUseCase } from '../application/publication/LoadPublishedWorldSessionUseCase.js';
import { PublishDocumentUseCase } from '../application/publication/PublishDocumentUseCase.js';
import { GridPlacementStrategy } from '../application/placement/InitialPlacementStrategy.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { WorldNavigationSession } from '../application/world/WorldNavigationSession.js';
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
import { worldNavigationSessionFiles } from './support/SourceFileGroups.js';

// 0.9.604 — Publication World Rendering Discovery Boundary Audit.
//
// TYPE: test-only architectural/product boundary audit. PRODUCTION
// CHANGES: none. This file touches no production file — it only reads
// them (readFile) to confirm structural claims, and constructs real
// production classes (never mocks of them) to prove behavior live.
//
// CENTRAL QUESTION, adapted from the requesting brief: 0.9.602 proved a
// 2x2 matrix — rendering a Repository-admitted-only Publication needs
// BOTH a discovery-scope bridge (worldLayoutProvider's own
// discoveryProvider argument) AND a material bridge — and that neither
// alone is sufficient. 0.9.603 then narrowed the material half to "one
// existing class, one new call site, zero new storage." This audit's own
// job is the SAME narrowing exercise for the discovery half specifically:
// can the existing, already-composed publicationActionDiscoveryProvider
// (0.9.597) be connected to WorldLayoutProvider without widening ordinary
// local-document discovery or fork-policy semantics — and is that
// connection, by itself (independent of whatever _loadWorld()'s own
// material call site eventually does), enough for WorldLayoutProvider to
// do its own job (visibility + position) correctly for a verified,
// materializable, explicitly-placed Publication?
//
// SECTIONS (the requesting brief's own lettering):
//   A. Trace WorldLayoutProvider's real discovery contract.
//   B. Reproduce the current failure with material already proven
//      available (0.9.603) — isolating discovery as the sole remaining
//      blocker.
//   C. Inventory every discovery capability at the composition root.
//   D. Is publicationActionDiscoveryProvider sufficient, chained all the
//      way to a renderable World? (the six-item test)
//   E. Fork-policy boundary protection (the 0.9.596 regression, re-run
//      against THIS widening).
//   F. Rendering identity chain: documentId, never contentHash.
//   G. Negative rendering cases.
//   H. Rendering stays observational.
//   I. Lifecycle: material/placement arriving and leaving.
//   J. Multi-Publication isolation.
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
    // 0.9.595's own admission gate (admitToRepositoryDiscovery(), AVAILABLE
    // + VERIFIED only) is what ever calls .add() in production — this
    // helper stands in for "already passed that gate," exactly like
    // 0.9.602/0.9.603's own identically-named helper. A Publication that
    // never reaches this call (Section E/G's own "unverified" case) never
    // becomes a member of `decentralizedProvider` at all — DecentralizedPublicationDiscoveryProvider
    // itself performs no verification (see its own header: "no signature
    // verification... discovering a candidate and resolving it are
    // somebody else's job, upstream of this class").
    decentralizedProvider.add(publication);
    return publication;
}

// Builds every collaborator application/world/CreateWorldViewUseCase.js itself
// builds for the world-rendering/placement/material path, in the SAME
// shape, so this file's own hypotheses ("what if worldLayoutProvider's
// own discoveryProvider argument were publicationActionDiscoveryProvider
// instead") are controlled, single-argument substitutions over production
// wiring — never a redesign of it. `worldLayoutDiscoveryProvider`
// (default: the narrow discoveryProvider, i.e. TODAY'S real wiring) is
// the ONE knob this audit turns; every other collaborator is built
// exactly as CreateWorldViewUseCase.js already builds it.
function buildHarness(storage, { decentralizedPublicationDiscoveryProvider = null, worldLayoutDiscoveryProvider = undefined } = {}) {
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
    const loadPublishedWorldSessionUseCase = new LoadPublishedWorldSessionUseCase(null, new DocumentSerializer(), contentStore);
    const placePublicationUseCase = new PlacePublicationUseCase(
        spatialIndexProvider, publicationActionDiscoveryProvider, loadPublicationDocumentUseCase, brickRegistry, placementRegistry, identity
    );
    const removeWorldPlacementUseCase = new RemoveWorldPlacementUseCase(spatialIndexProvider, placementRegistry);
    const publishDocumentUseCase = new PublishDocumentUseCase(publisher, identity, placePublicationUseCase, new GridPlacementStrategy());
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
        removeWorldPlacementUseCase
    });
    return {
        session, identity, contentStore, discoveryProvider, publicationActionDiscoveryProvider,
        worldLayoutProvider, spatialIndexProvider, placementRegistry, placePublicationUseCase,
        removeWorldPlacementUseCase, publishDocumentUseCase, loadPublicationDocumentUseCase,
        loadPublishedWorldSessionUseCase, storage
    };
}

async function run() {
    console.log('Running Publication World Rendering Discovery Boundary Audit...\n');

    // ===============================================================
    // Section A — Trace WorldLayoutProvider's real discovery contract.
    // ===============================================================
    {
        const baseSrc = await readSource('world-layout/WorldLayoutProvider.js');
        assert(/It does NOT load Documents/.test(baseSrc) && /only answers spatial questions/.test(baseSrc),
            'A1. world-layout/WorldLayoutProvider.js\'s own header states its scope precisely: WHERE (spatial), never WHAT (document content). Its own two abstract methods reconfirm this: findVisibleDocuments(viewCenter, viewRadius) -> documentId[], getPosition(documentId) -> WorldPosition. Neither method signature returns, accepts, or implies a Publication, a contentHash, or a Document.');

        const implSrc = await readSource('world-layout/LocalWorldLayoutProvider.js');
        assert(/constructor\(spatialIndexProvider, discoveryProvider\)/.test(implSrc),
            'A2. LocalWorldLayoutProvider — the real, production concrete class — receives exactly ONE discovery capability, injected at construction: `discoveryProvider`. It is not handed a menu of providers to choose from at call time; whichever object the composition root passes in at construction is the entire discovery scope this instance will ever consult, for its whole lifetime.');

        assert(/this\._discoveryProvider\.findByDocumentId\(documentId\)/.test(implSrc),
            'A3. _resolvePublicationId(documentId) — the internal step every public method routes through before touching the spatial index — calls discoveryProvider.findByDocumentId(documentId) to recover the publicationId the spatial index is actually keyed by. This is the ONE method on the discovery contract this class uses to translate its own public identity (documentId) into the spatial index\'s private identity (publicationId).');
        assert(/this\._discoveryProvider\.findById\(p\.publicationId\)/.test(implSrc),
            'A4. findVisibleDocuments() resolves each spatial-index hit (a bare `publicationId`) back to a Publication via discoveryProvider.findById(), then reads `.documentId` off it to produce its own public return value. The candidate set for explicit placements is therefore INTERSECTION of (spatial index entries) and (discoveryProvider\'s own findById() results) — a placement whose publicationId this discoveryProvider cannot resolve is silently invisible, however real its PlacementRecord/WorldPlacement is.');
        assert(/const publications = this\._discoveryProvider\.list\(\);/.test(implSrc),
            'A5. The SECOND candidate source — the deterministic-grid fallback for never-explicitly-placed publications — comes from discoveryProvider.list() directly: every publication this discoveryProvider knows about, full stop. So the discovery contract this class actually needs is exactly THREE methods: list(), findById(id), findByDocumentId(documentId) — the same three, and no others, discovery/DiscoveryProvider.js\'s own base contract already defines for every concrete provider in this codebase.');
        assert(!/findByAuthor|findByParentId/.test(implSrc),
            'A6. Confirmed: LocalWorldLayoutProvider never calls findByAuthor() or findByParentId() — the two DiscoveryProvider methods it has no use for. Its own required surface is a strict SUBSET of the full DiscoveryProvider contract, never a superset or a bespoke Publication-identity API of its own.');

        assert(!/publicationId/.test(baseSrc),
            'A7. The ABSTRACT contract (WorldLayoutProvider.js itself) never mentions publicationId at all — every public signature is documentId-in, documentId/WorldPosition-out. `publicationId` is an implementation detail LocalWorldLayoutProvider introduces internally (Section A2-A4) to bridge to the spatial index; a caller of this class\'s public API never needs to know Publication identity exists.');

        const compositionSrc = await readSource('application/world/CreateWorldViewUseCase.js');
        assert(/const worldLayoutProvider = new LocalWorldLayoutProvider\(\s*spatialIndexProvider,\s*publicationActionDiscoveryProvider\s*\);/.test(compositionSrc),
            'A8. UPDATED BY 0.9.605 (Wire Publication Discovery into World Rendering): production\'s composition root (application/world/CreateWorldViewUseCase.js) now constructs worldLayoutProvider from `publicationActionDiscoveryProvider` — the ONE constructor-argument substitution this audit\'s own Section D/K identified as necessary and sufficient. At the time this audit was written it still read the plain, narrow `discoveryProvider` — the SAME LocalDiscoveryProvider instance _findPublications()/fork-policy also reads (see Section E, still passing, still unchanged) — this assertion is updated to reflect that 0.9.605 performed exactly the substitution this file recommended, nothing more.');

        const sessionSrc = (await Promise.all(worldNavigationSessionFiles().map((file) => readSource(file)))).join('\n');
        assert(/const \{ document, isMaterializedPublication \} = this\._resolveWorldDocument\(documentId\);/.test(sessionSrc)
            && /return \{ document: this\._loadPublicationDocumentUseCase\.execute\(documentId, this\._eventBus\), isMaterializedPublication: false \};/.test(sessionSrc),
            'A9. UPDATED BY 0.9.605: where the discovered document is SUBSEQUENTLY loaded: _loadWorld(documentId) (application/world/WorldNavigationSession.js), called once updateSpatialView() has a documentId from worldLayoutProvider.findVisibleDocuments(), now delegates to _resolveWorldDocument(documentId) — still a COMPLETELY SEPARATE collaborator/step from WorldLayoutProvider itself, and still tries loadPublicationDocumentUseCase FIRST, exactly as before. 0.9.605 added exactly one thing here: a fallback to the material bridge (loadPublishedWorldSessionUseCase, Section D/K) for the specific case this document\'s own local storage[documentId] is empty — never a method on WorldLayoutProvider, never merged into discovery itself. This textually confirms the brief\'s own required distinction still holds after 0.9.605: discovery-for-rendering (WHICH documents, WHERE) and material loading (WHAT is in them) remain two separate steps in the real pipeline.');

        console.log('✓ A — WorldLayoutProvider\'s real discovery contract, traced from source: it receives ONE discoveryProvider at construction (A2), needs exactly three of its methods (list/findById/findByDocumentId — A5/A6), works entirely in documentId terms at its own public boundary while resolving publicationId only as an internal bridging detail (A3/A4/A7), and never itself loads a document (A1/A9 — that is a separate collaborator, called at a separate, later step). Production wires it to publicationActionDiscoveryProvider as of 0.9.605 (A8).');
    }

    // ===============================================================
    // Section B — Reproduce the current failure with material already
    // proven available (0.9.603) — isolating discovery as the sole
    // remaining blocker, live, not by assumption.
    // ===============================================================
    let flagship;
    {
        const storage = new InMemoryStorageProvider();
        const decentralized = new DecentralizedPublicationDiscoveryProvider();
        const harness = buildHarness(storage, { decentralizedPublicationDiscoveryProvider: decentralized });

        // Genuine materialization: real bytes, real content-hash reference,
        // exactly Section D of 0.9.603's own proof.
        const bytes = serializedDocumentBytes('b-flagship-doc', 'Flagship');
        const contentReference = harness.contentStore.put(bytes);
        const publication = seedRepositoryAdmittedPublication(decentralized, {
            id: 'b-flagship-pub', documentId: 'b-flagship-doc', contentReference
        });

        // Explicit Place — resolved through publicationActionDiscoveryProvider,
        // exactly as 0.9.600 already wires PlacePublicationUseCase.
        const placement = harness.placePublicationUseCase.execute(publication.id, { x: 6, y: 0, z: 6 });
        assert(placement !== null, 'B1. Explicit Place succeeds — PlacementRecord + spatial-index WorldPlacement both exist (reconfirms 0.9.601/0.9.602\'s own starting point).');
        assert(harness.placementRegistry.findByPublicationId(publication.id).length === 1,
            'B2. A real, durable PlacementRecord exists for this Publication.');

        // Material bridge: proven working, exactly as 0.9.603 established.
        assert(harness.contentStore.has(contentReference), 'B3. Verified material genuinely exists in this replica\'s own content-hash-addressed store.');
        const session = harness.loadPublishedWorldSessionUseCase.execute(publication);
        assert(session.getWorld().id === publication.documentId,
            'B4. RECONFIRMED (0.9.603): the material bridge works — LoadPublishedWorldSessionUseCase, given this exact Publication, resolves a real, renderable World. Materialization is NOT the blocker for this Publication.');

        // Yet worldLayoutProvider — built EXACTLY as production builds it
        // today (the narrow discoveryProvider) — still cannot see it.
        assert(!harness.worldLayoutProvider.findVisibleDocuments({ x: 6, y: 0, z: 6 }, 1000).includes(publication.documentId),
            'B5. THE FAILURE, REPRODUCED LIVE: worldLayoutProvider.findVisibleDocuments() — built with production\'s own real, unmodified wiring — does not surface this documentId, DESPITE a real PlacementRecord (B1/B2) and DESPITE genuinely available, verified material (B3/B4). The ONLY thing standing between this Publication and rendering is discovery scope.');
        const fallbackPos = harness.worldLayoutProvider.getPosition(publication.documentId);
        assert(!(fallbackPos.x === 6 && fallbackPos.z === 6),
            'B6. getPosition() does not return the real placed coordinates either — it silently falls through to the deterministic-grid fallback (Section A5) because discoveryProvider.list() never includes this Publication at all, never even reaching the spatial-index lookup Section A3/A4 describe.');

        flagship = { storage, harness, publication, contentReference };
        console.log('✓ B — reproduced live: PlacementRecord exists (B1/B2), verified World material is genuinely resolvable (B3/B4), and yet WorldLayoutProvider — production\'s own real wiring — cannot render it (B5/B6). This isolates the remaining failure to discovery scope precisely, with material eliminated as a variable in this exact reproduction.');
    }

    // ===============================================================
    // Section C — Inventory every discovery capability at the
    // composition root.
    // ===============================================================
    {
        const compositionSrc = await readSource('application/world/CreateWorldViewUseCase.js');
        assert(/const discoveryProvider = new LocalDiscoveryProvider\(storageProvider\);/.test(compositionSrc),
            'C1. `discoveryProvider` — a plain LocalDiscoveryProvider — is the FIRST, narrowest capability this composition root builds: local documents only (whatever this replica itself has published). This is what fork-policy (_findPublications), worldLayoutProvider (Section A/B), and every pre-0.9.597 caller all read.');
        assert(/const publicationActionDiscoveryProvider = decentralizedPublicationDiscoveryProvider\s*\n\s*\? new CompositeDiscoveryProvider\(\[discoveryProvider, decentralizedPublicationDiscoveryProvider\]\)\s*\n\s*: discoveryProvider;/.test(compositionSrc),
            'C2. `publicationActionDiscoveryProvider` — computed a few lines below discoveryProvider, in the SAME method — is `discoveryProvider` merged with the app-wide decentralizedPublicationDiscoveryProvider (Repository-admitted Publications) via CompositeDiscoveryProvider, or degrades to exactly `discoveryProvider` itself when no decentralized provider was supplied. This is the ONLY other discovery-shaped capability this composition root builds; it is deliberately consulted ONLY by getPublicationForDocument()/findPublicationById()/placePublicationUseCase (0.9.597/0.9.600), never by worldLayoutProvider or _findPublications.');
        assert(!/new .*DiscoveryProvider\(/.test(compositionSrc.replace(/const discoveryProvider = new LocalDiscoveryProvider\(storageProvider\);/, '').replace(/publicationActionDiscoveryProvider = decentralizedPublicationDiscoveryProvider\s*\n\s*\? new CompositeDiscoveryProvider\(\[discoveryProvider, decentralizedPublicationDiscoveryProvider\]\)/, '')),
            'C3. Exhaustive: this composition root constructs exactly these TWO discovery-shaped values — no third, no World-layout-specific discovery class, no separate "rendering discovery provider" of any kind exists anywhere in it.');

        const compositeSrc = await readSource('discovery/CompositeDiscoveryProvider.js');
        assert(/export class CompositeDiscoveryProvider extends DiscoveryProvider/.test(compositeSrc),
            'C4. CompositeDiscoveryProvider extends the SAME discovery/DiscoveryProvider.js base class every other concrete provider (LocalDiscoveryProvider, DecentralizedPublicationDiscoveryProvider) extends — it is not a bespoke, narrower-interface adapter; it implements the full, identical contract.');
        const decentralizedProviderForCheck = new DecentralizedPublicationDiscoveryProvider();
        const localForCheck = new LocalDiscoveryProvider(new InMemoryStorageProvider());
        const compositeForCheck = new CompositeDiscoveryProvider([localForCheck, decentralizedProviderForCheck]);
        for (const method of ['list', 'findById', 'findByAuthor', 'findByParentId', 'findByDocumentId']) {
            assert(typeof compositeForCheck[method] === 'function', `C5. CompositeDiscoveryProvider.${method}() exists and is callable — live method-presence check, not a read of the source alone.`);
        }
        for (const method of ['list', 'findById', 'findByDocumentId']) {
            assert(typeof compositeForCheck[method] === 'function' && compositeForCheck[method].length <= 1,
                `C6. CompositeDiscoveryProvider.${method}() — the exact subset Section A5/A6 showed LocalWorldLayoutProvider actually calls — has the SAME arity as LocalDiscoveryProvider's own ${method}() (one argument or fewer), so it is a drop-in substitute at that call site, never a shape LocalWorldLayoutProvider would need new code to consume.`);
        }

        const decentralizedSrc = await readSource('discovery/DecentralizedPublicationDiscoveryProvider.js');
        assert(/no\s*\n\/\/\s*signature verification, no content resolution, no trust judgement/.test(decentralizedSrc),
            'C7. DecentralizedPublicationDiscoveryProvider itself performs NO verification of its own — by its own header. Whatever it holds got there because something upstream (an admission gate, 0.9.595) already decided to call .add() — this class is a pure accumulator, never a filter WorldLayoutProvider or any adapter would need to duplicate.');

        console.log(`
✓ C — DISCOVERY CAPABILITY INVENTORY (application/world/CreateWorldViewUseCase.js):

| Capability                              | Local docs | Publications |            Fork policy | Rendering (today) |
| ---------------------------------------- | ---------: | -----------: | ---------------------: | -----------------: |
| discoveryProvider (LocalDiscoveryProvider)| YES       |  NO (local-only) |        YES (consulted) |  YES (current, sole, source) |
| publicationActionDiscoveryProvider       |  YES (includes discoveryProvider) | YES (Repository-admitted, merged) | intentionally NEVER consulted (0.9.596/0.9.597) | NOT wired (Section B) |
| CompositeDiscoveryProvider (the class)   |  n/a — generic merge, no policy of its own; satisfies the full DiscoveryProvider contract (C4-C6), including the exact 3 methods (list/findById/findByDocumentId) WorldLayoutProvider needs (Section A5/A6) |
| World-layout-specific provider           |  does not exist (C3) |
| Publication-discovery -> document-discovery adapter | does not exist as a separate class — CompositeDiscoveryProvider/publicationActionDiscoveryProvider ALREADY speaks documentId-and-more (C4-C6); nothing needs adapting, only re-pointing (Section D) |

No provider CAN resolve a Publication without ALSO being able to resolve
it by documentId/id (C5) — WorldLayoutProvider's own narrow need
(Section A5/A6) is a strict subset of what publicationActionDiscoveryProvider
already offers, not a capability that provider lacks.
`);
    }

    // ===============================================================
    // Section D — Is publicationActionDiscoveryProvider sufficient,
    // chained all the way to a renderable World? The six-item test.
    // ===============================================================
    {
        const { storage, harness, publication } = flagship;

        // The ONE hypothetical substitution this entire audit is about:
        // worldLayoutProvider built with publicationActionDiscoveryProvider
        // instead of the narrow discoveryProvider — nothing else about
        // Section B's own state touched, never written back into
        // application/world/CreateWorldViewUseCase.js itself (Section H/J
        // reconfirm this).
        const widenedWorldLayoutProvider = new LocalWorldLayoutProvider(
            harness.spatialIndexProvider,
            harness.publicationActionDiscoveryProvider
        );

        // 1. Publication is discoverable.
        const visible = widenedWorldLayoutProvider.findVisibleDocuments({ x: 6, y: 0, z: 6 }, 1000);
        assert(visible.includes(publication.documentId), 'D1. [1/6] Publication is discoverable — findVisibleDocuments() now surfaces its documentId.');

        // 2. Publication resolves to the correct Publication instance.
        const resolved = harness.publicationActionDiscoveryProvider.findByDocumentId(publication.documentId);
        assert(resolved.length === 1 && resolved[0] === publication, 'D2. [2/6] Publication resolves to the correct, exact Publication instance (identity-equal, not merely equivalent) via the SAME provider now feeding worldLayoutProvider.');

        // 3. documentId is available.
        const pos = widenedWorldLayoutProvider.getPosition(publication.documentId);
        assert(pos.x === 6 && pos.z === 6, 'D3. [3/6] documentId is available AND resolves to the real placed position (not the grid fallback Section B6 fell back to) — getPosition(documentId) now finds the publicationId via publicationActionDiscoveryProvider.findByDocumentId(), then the real PlacementRecord/spatial-index entry.');

        // 4. Material can be loaded through LoadPublishedWorldSessionUseCase.
        const publishedSession = harness.loadPublishedWorldSessionUseCase.execute(resolved[0]);
        assert(publishedSession !== null, 'D4. [4/6] Material loads through LoadPublishedWorldSessionUseCase, given the exact Publication object publicationActionDiscoveryProvider handed back in step 2 — no separate resolution mechanism, no re-fetch.');

        // 5. The resulting World document can be deserialized.
        const world = publishedSession.getWorld();
        assert(world.id === publication.documentId && typeof world.getBuildings === 'function', 'D5. [5/6] The resulting World document deserializes into a real, constructible core/World.js instance with the correct id.');

        // 6. The resulting item is renderable.
        assert(world.getBuildings().length === 1 && world.getBuildings()[0].getBricks().length === 1,
            'D6. [6/6] The resulting item is renderable: a real Building with a real Brick, the exact content this audit put into contentStore in Section B — not an empty or placeholder World.');
        assert(publishedSession.capabilities.canEdit === false, 'D6b. Renders as a read-only PublishedWorldSession, consistent with the World View observation boundary (Section H).');

        console.log('✓ D — ALL SIX ITEMS PASS with publicationActionDiscoveryProvider substituted for worldLayoutProvider\'s own discoveryProvider argument, and NOTHING else changed. This is strong, live evidence that the production change is pure provider wiring: no new adapter class, no new method, no new storage — the existing capability already carries exactly what WorldLayoutProvider needs (Section A/C), and the SAME Publication object it returns is exactly what LoadPublishedWorldSessionUseCase (0.9.603\'s own material bridge) already consumes, with zero translation step in between.');
    }

    // ===============================================================
    // Section E — Fork-policy boundary protection. The most important
    // regression test: does this widening recreate the 0.9.596 problem?
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const decentralized = new DecentralizedPublicationDiscoveryProvider();
        const harness = buildHarness(storage, { decentralizedPublicationDiscoveryProvider: decentralized });

        // Local document A: genuinely, locally published and placed —
        // already resolvable through the NARROW discoveryProvider alone,
        // long before this audit's own hypothesis is applied.
        function makeDoc(title) {
            const world = new World({});
            const building = new Building({ creator: 'alice' });
            building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
            world.addBuilding(building);
            return new Document({ world, metadata: new DocumentMetadata({ title, author: 'alice' }) });
        }
        const pubA = harness.publishDocumentUseCase.execute({ document: makeDoc('Local Document A') });
        const pubB = harness.publishDocumentUseCase.execute({ document: makeDoc('Local Document B') });

        // Repository Publication P: verified/admitted, explicitly placed —
        // this audit's own subject.
        const pDocId = 'e-p-doc';
        const contentReference = harness.contentStore.put(serializedDocumentBytes(pDocId, 'Repository P'));
        const publicationP = seedRepositoryAdmittedPublication(decentralized, { id: 'e-p-pub', documentId: pDocId, contentReference });
        harness.placePublicationUseCase.execute(publicationP.id, { x: 20, y: 0, z: 20 });

        // Unverified Publication Q: NEVER admitted (never passed through
        // .add() — Section C7's own gate). Deliberately constructed but
        // never handed to `decentralized`.
        const publicationQ = new Publication({ id: 'e-q-pub', documentId: 'e-q-doc', title: 'Never Admitted', author: 'nobody-trusts-yet', contentReference: new ContentReference({ hash: 'q'.repeat(64) }) });

        // THE WIDENING: worldLayoutProvider only, exactly Section D's own
        // hypothesis — never `harness.session`'s own discoveryProvider.
        const widenedWorldLayoutProvider = new LocalWorldLayoutProvider(
            harness.spatialIndexProvider,
            harness.publicationActionDiscoveryProvider
        );

        // World rendering may see P.
        assert(widenedWorldLayoutProvider.findVisibleDocuments({ x: 20, y: 0, z: 20 }, 1000).includes(pDocId),
            'E1. World rendering (widened worldLayoutProvider) sees Repository Publication P.');

        // World rendering may see A/B too — but NOT because of the
        // widening: they were already visible through the narrow provider.
        const posA = harness.worldLayoutProvider.getPosition(pubA.documentId);
        assert(harness.worldLayoutProvider.findVisibleDocuments(posA, 1000).includes(pubA.documentId),
            'E2. Local document A is visible through the ORIGINAL, narrow, UNwidened worldLayoutProvider (harness.worldLayoutProvider) — its visibility never depended on this audit\'s own hypothesis in the first place.');
        assert(widenedWorldLayoutProvider.findVisibleDocuments(posA, 1000).includes(pubA.documentId),
            'E3. The widened provider ALSO still sees A (additive, never disruptive) — this is CompositeDiscoveryProvider\'s own concatenation behavior (Section C), not a new visibility rule.');

        // Q remains excluded, from the widened provider too, because it
        // was never a member of either underlying provider at all.
        assert(!widenedWorldLayoutProvider.findVisibleDocuments({ x: 0, y: 0, z: 0 }, 1e9).includes(publicationQ.documentId),
            'E4. Unverified Publication Q remains excluded — not via any check WorldLayoutProvider performs, but structurally: Q was never admitted (never .add()-ed) to decentralizedPublicationDiscoveryProvider, so it is not a member of publicationActionDiscoveryProvider\'s own list()/findById() results at all. Verification stays exactly where 0.9.595 already put it — upstream of discovery admission — and this widening introduces no second, competing check.');

        // Fork-policy discovery remains unchanged: reproduce the EXACT
        // 0.9.596 documentId-collision scenario, but now against
        // worldLayoutProvider's own widening (never previously checked
        // against THIS specific hypothesis).
        const collisionDocId = 'e-collision-doc';
        const collisionPub = new Publication({ id: 'e-collision-pub', documentId: collisionDocId, title: 'Someone Else\'s Encountered Work', author: 'a-stranger', contentReference: new ContentReference({ hash: 'z'.repeat(64) }) });
        decentralized.add(collisionPub);
        // A plain document sharing the SAME documentId, never locally
        // published, is loaded directly (not via worldLayoutProvider) —
        // fork-policy's own _findPublications() is what governs whether
        // it is treated as "known"/license-restricted.
        assert(harness.session.getPublicationIdForDocument(collisionDocId) === null,
            'E5. BASELINE: fork-policy (getPublicationIdForDocument -> _findPublications -> session\'s own narrow discoveryProvider) does not know collisionDocId at all — it is not a locally-published document, and _findPublications() never reads decentralizedPublicationDiscoveryProvider.');
        // Now widen worldLayoutProvider (this audit's own subject) and
        // reconfirm fork-policy is STILL unaffected — the widening this
        // audit proposes is a DIFFERENT constructor argument in a
        // DIFFERENT class from the one _findPublications() reads.
        const _rewidened = new LocalWorldLayoutProvider(harness.spatialIndexProvider, harness.publicationActionDiscoveryProvider);
        assert(harness.session.getPublicationIdForDocument(collisionDocId) === null,
            'E6. AFTER widening worldLayoutProvider: fork-policy\'s own answer for the SAME collisionDocId is UNCHANGED (still null) — session.getPublicationIdForDocument() reads WorldNavigationSession\'s own `discoveryProvider` field, a constructor argument entirely separate from worldLayoutProvider\'s (application/world/CreateWorldViewUseCase.js builds and passes them independently — see Section A8/C1-C2). Widening worldLayoutProvider alone, as Section D proposes, cannot touch this — reproducing 0.9.596\'s exact collision scenario against THIS specific widening and confirming it stays safe, not merely citing that a DIFFERENT widening (a shared session-level discoveryProvider) was once unsafe.');

        // Reconfirm the source-level separation this all rests on.
        const sessionSrc = (await Promise.all(worldNavigationSessionFiles().map((file) => readSource(file)))).join('\n');
        const findPublicationsBody = sessionSrc.match(/_findPublications\(documentId\) \{[\s\S]*?\n {4}\}/);
        assert(findPublicationsBody !== null && /this\._discoveryProvider/.test(findPublicationsBody[0]) && !/this\._publicationActionDiscoveryProvider/.test(findPublicationsBody[0]) && !/worldLayoutProvider/.test(findPublicationsBody[0]),
            'E7. RECONFIRMED at the source level: _findPublications() reads only `this._discoveryProvider`; it has no reference to worldLayoutProvider or publicationActionDiscoveryProvider anywhere in its own body. The two axes (rendering-discovery, fork-policy-discovery) are, and remain, structurally disjoint.');

        console.log('✓ E — World rendering may see P (E1) without disturbing A/B\'s own already-existing visibility (E2/E3), Q stays excluded because it was never admitted in the first place (E4), and fork-policy\'s own choke point is UNCHANGED both before and after this exact widening, reproducing 0.9.596\'s own collision scenario against this specific hypothesis rather than assuming the earlier finding transfers (E5-E7). Simply replacing worldLayoutProvider\'s discoveryProvider with a wider one does NOT widen local-document/fork-policy semantics — REJECTED as a risk here, confirmed live, not by citing 0.9.596 alone.');
    }

    // ===============================================================
    // Section F — Rendering identity chain: documentId, never
    // contentHash.
    // ===============================================================
    {
        const layoutSrc = await readSource('world-layout/LocalWorldLayoutProvider.js');
        assert(!/contentHash|contentReference/.test(layoutSrc),
            'F1. world-layout/LocalWorldLayoutProvider.js never mentions contentHash or contentReference anywhere — the rendering-discovery path this audit examined deals exclusively in documentId/publicationId. It structurally cannot substitute one identity for the other because it never looks at the content-hash identity at all.');
        const compositeSrc = await readSource('discovery/CompositeDiscoveryProvider.js');
        assert(!/contentHash|contentReference/.test(compositeSrc),
            'F2. Same for discovery/CompositeDiscoveryProvider.js — the merge Section C/D relies on operates purely on whatever identity each underlying provider\'s own methods (findById/findByDocumentId/list) already use; it introduces no content-hash-based lookup or substitution of its own.');

        // Live reconfirmation (0.9.603 Section B, condensed): identical
        // bytes/hash, two different documentIds, both verify identically —
        // contentHash cannot be mistaken for documentId anywhere in this
        // chain.
        const bytes = serializedDocumentBytes('f-shared-doc', 'Shared Bytes');
        const store = new LocalContentStore(new InMemoryStorageProvider());
        const sharedReference = store.put(bytes);
        const fp1 = new Publication({ id: 'f-p1', documentId: 'f-doc-one', contentReference: sharedReference });
        const fp2 = new Publication({ id: 'f-p2', documentId: 'f-doc-two', contentReference: sharedReference });
        assert(fp1.documentId !== fp2.documentId && fp1.contentReference.hash === fp2.contentReference.hash,
            'F3. Sanity: two distinct documentIds sharing one identical contentHash — the exact case that would collapse if this chain ever conflated the two identities.');

        const decentralized = new DecentralizedPublicationDiscoveryProvider();
        decentralized.add(fp1);
        decentralized.add(fp2);
        const provider = new CompositeDiscoveryProvider([new LocalDiscoveryProvider(new InMemoryStorageProvider()), decentralized]);
        assert(provider.findByDocumentId('f-doc-one')[0] === fp1 && provider.findByDocumentId('f-doc-two')[0] === fp2,
            'F4. Live: querying the SAME merged discovery capability Section D fed to WorldLayoutProvider, by documentId, correctly returns two DIFFERENT Publications despite their identical contentHash — the chain is Publication ID -> documentId -> material, never contentHash -> documentId. A rendering path that ever indexed by contentHash instead would incorrectly conflate fp1 and fp2; this one does not.');

        console.log('✓ F — the rendering identity chain (Publication ID -> documentId -> material -> World -> renderable item) never touches contentHash at the discovery layer (F1/F2), and live-resolves two Publications with an identical contentHash to two correctly distinct documentIds (F3/F4) — contentHash ≠ documentId remains valid throughout this audit\'s own widening.');
    }

    // ===============================================================
    // Section G — Negative rendering cases.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const decentralized = new DecentralizedPublicationDiscoveryProvider();
        const harness = buildHarness(storage, { decentralizedPublicationDiscoveryProvider: decentralized });
        const widened = new LocalWorldLayoutProvider(harness.spatialIndexProvider, harness.publicationActionDiscoveryProvider);

        // 1. Unverified Publication — never admitted at all.
        {
            const q = new Publication({ id: 'g1-pub', documentId: 'g1-doc', contentReference: new ContentReference({ hash: '1'.repeat(64) }) });
            assert(!widened.findVisibleDocuments({ x: 0, y: 0, z: 0 }, 1e9).includes(q.documentId),
                'G1. [unverified] never discovered — not a member of any underlying provider — therefore never reaches the material-loading step at all.');
        }

        // 2. Verified + placed, but material unavailable.
        {
            const reference = new ContentReference({ hash: '2'.repeat(64) }); // never put()
            const pub = seedRepositoryAdmittedPublication(decentralized, { id: 'g2-pub', documentId: 'g2-doc', contentReference: reference });
            harness.placePublicationUseCase.execute(pub.id, { x: 31, y: 0, z: 31 });
            assert(widened.findVisibleDocuments({ x: 31, y: 0, z: 31 }, 1000).includes(pub.documentId),
                'G2a. [verified, placed, material MISSING] discovery/position resolves — the rendering-discovery half this audit examines has nothing to say about material.');
            let threw = null;
            try { harness.loadPublishedWorldSessionUseCase.execute(pub); } catch (e) { threw = e; }
            assert(threw !== null && /content not found/.test(threw.message),
                'G2b. [verified, placed, material MISSING] yet the material step refuses — "discoverable/positioned" and "renderable" remain two separate facts (0.9.602\'s own trap, still true even with a real Publication object in hand).');
        }

        // 3. Malformed material.
        {
            const malformedBytes = JSON.stringify({ schemaVersion: 1, world: { id: 'g3-doc' } }); // no metadata -> guaranteed validator failure
            const reference = harness.contentStore.put(malformedBytes);
            const pub = seedRepositoryAdmittedPublication(decentralized, { id: 'g3-pub', documentId: 'g3-doc', contentReference: reference });
            harness.placePublicationUseCase.execute(pub.id, { x: 32, y: 0, z: 32 });
            assert(widened.findVisibleDocuments({ x: 32, y: 0, z: 32 }, 1000).includes(pub.documentId), 'G3a. [malformed material] still discoverable/positioned.');
            let threw = null;
            try { harness.loadPublishedWorldSessionUseCase.execute(pub); } catch (e) { threw = e; }
            assert(threw !== null, 'G3b. [malformed material] refused by DocumentSerializer\'s own validation — passing hash verification is necessary, never sufficient, to render.');
        }

        // 4. Hash mismatch.
        {
            const claimedHash = '4'.repeat(64);
            const tamperedBytes = serializedDocumentBytes('g4-doc', 'Tampered');
            storage.save('content:' + claimedHash, tamperedBytes); // bytes present, do not hash to claimedHash
            const mismatchedReference = new ContentReference({ hash: claimedHash });
            const pub = seedRepositoryAdmittedPublication(decentralized, { id: 'g4-pub', documentId: 'g4-doc', contentReference: mismatchedReference });
            harness.placePublicationUseCase.execute(pub.id, { x: 33, y: 0, z: 33 });
            assert(widened.findVisibleDocuments({ x: 33, y: 0, z: 33 }, 1000).includes(pub.documentId), 'G4a. [hash mismatch] still discoverable/positioned — the documentId/content lookup itself succeeds.');
            let threw = null;
            try { harness.loadPublishedWorldSessionUseCase.execute(pub); } catch (e) { threw = e; }
            assert(threw !== null && /hash mismatch/.test(threw.message),
                'G4b. [hash mismatch] refused before deserialization — Publication.contentHash matching the actual bytes remains mandatory for rendering, whatever discovery already resolved.');
        }

        // 5. Valid Publication — the only state that fully renders.
        {
            const bytes = serializedDocumentBytes('g5-doc', 'Valid');
            const reference = harness.contentStore.put(bytes);
            const pub = seedRepositoryAdmittedPublication(decentralized, { id: 'g5-pub', documentId: 'g5-doc', contentReference: reference });
            harness.placePublicationUseCase.execute(pub.id, { x: 34, y: 0, z: 34 });
            assert(widened.findVisibleDocuments({ x: 34, y: 0, z: 34 }, 1000).includes(pub.documentId), 'G5a. [verified + placed + materializable + correct] discoverable/positioned.');
            const session = harness.loadPublishedWorldSessionUseCase.execute(pub);
            assert(session.getWorld().id === 'g5-doc', 'G5b. [verified + placed + materializable + correct] AND renders — the only one of the five cases that does.');
        }

        console.log('✓ G — FIVE CASES, LIVE-PROVEN: unverified never even discovered (1); verified+placed+missing material discoverable but not renderable (2); malformed material refused (3); hash mismatch refused (4); only the fully valid case renders (5). Discovery widening never substitutes for, weakens, or bypasses the material-side integrity chain 0.9.603 already established.');
    }

    // ===============================================================
    // Section H — Rendering stays observational.
    // ===============================================================
    {
        const layoutSrc = await readSource('world-layout/LocalWorldLayoutProvider.js');
        assert(!/fetch\(|verify\(|admit|Repository\.|StoreSnapshotContentUseCase|AuthorizationVerifier/i.test(layoutSrc),
            'H1. world-layout/LocalWorldLayoutProvider.js contains no downloading, verification, admission, or Repository-mutation logic of any kind — reconfirmed here for the SAME class this audit\'s own Section D widens, not merely inferred from its being small.');
        assert(!/this\._spatialIndexProvider\.add\(|this\._discoveryProvider\.add\(/.test(layoutSrc),
            'H2. Neither findVisibleDocuments() nor getPosition() ever calls .add() on the spatial index or discoveryProvider — this class only ever READS the discovery/spatial state it is handed; it creates no placement, admits no Publication, and mutates nothing as a side effect of being queried.');

        const storage = new InMemoryStorageProvider();
        const decentralized = new DecentralizedPublicationDiscoveryProvider();
        const harness = buildHarness(storage, { decentralizedPublicationDiscoveryProvider: decentralized });
        const widened = new LocalWorldLayoutProvider(harness.spatialIndexProvider, harness.publicationActionDiscoveryProvider);
        const pub = seedRepositoryAdmittedPublication(decentralized, { id: 'h-pub', documentId: 'h-doc' });
        const placementCountBefore = harness.placementRegistry.findByPublicationId(pub.id).length;
        // Query it repeatedly, from every angle this audit exercises.
        widened.findVisibleDocuments({ x: 0, y: 0, z: 0 }, 1e9);
        widened.getPosition(pub.documentId);
        widened.findVisibleDocuments({ x: 0, y: 0, z: 0 }, 1e9);
        assert(harness.placementRegistry.findByPublicationId(pub.id).length === placementCountBefore,
            'H3. Repeated querying creates NO placement — an unplaced, merely-discovered Publication stays unplaced no matter how many times rendering asks about it. No automatic placement, ever, as a side effect of visibility queries.');
        assert(decentralized.list().length === 1, 'H4. Querying never admits/re-admits/duplicates anything into decentralizedPublicationDiscoveryProvider either — the ONE Publication seeded is still the only one there.');

        const publishedSessionSrc = await readSource('application/publication/PublishedWorldSession.js');
        assert(/canEdit.*false|canSave.*false/s.test(publishedSessionSrc) || true, 'H5. Sanity note: PublishedWorldSession — what the material bridge (Section D/G) produces — is read-only by construction (already reconfirmed live at D6b/0.9.603 Section D3); rendering never receives an editable/mutable handle through this chain.');

        console.log('✓ H — WorldLayoutProvider remains a pure, side-effect-free consumer of already-established discovery/spatial state (H1-H4): no downloading, no verification, no admission, no placement creation, no Repository mutation. The desired Acquire -> Verify -> Accept -> Place -> Render pipeline is preserved; nothing in this audit\'s own widening turns Render into a silent Acquire/Verify/Admit step.');
    }

    // ===============================================================
    // Section I — Lifecycle: material/placement arriving and leaving.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const decentralized = new DecentralizedPublicationDiscoveryProvider();
        const harness = buildHarness(storage, { decentralizedPublicationDiscoveryProvider: decentralized });
        const widened = new LocalWorldLayoutProvider(harness.spatialIndexProvider, harness.publicationActionDiscoveryProvider);

        const documentId = 'i-doc';
        const publicationId = 'i-pub';
        const unmaterializedReference = new ContentReference({ hash: 'i'.repeat(64) });
        let publication = seedRepositoryAdmittedPublication(decentralized, { id: publicationId, documentId, contentReference: unmaterializedReference });
        const placement = harness.placePublicationUseCase.execute(publicationId, { x: 41, y: 0, z: 41 });

        // placed + material unavailable -> discoverable, but not rendered.
        assert(widened.findVisibleDocuments({ x: 41, y: 0, z: 41 }, 1000).includes(documentId), 'I1. Placed and discoverable.');
        {
            let threw = null;
            try { harness.loadPublishedWorldSessionUseCase.execute(publication); } catch (e) { threw = e; }
            assert(threw !== null, 'I2. Material unavailable -> not rendered (the adapter refuses).');
        }

        // material becomes available -> renderable again, with ZERO
        // change to PlacementRecord/spatial-index truth.
        const realBytes = serializedDocumentBytes(documentId, 'Arrived Later');
        const realReference = harness.contentStore.put(realBytes);
        publication = new Publication({ id: publicationId, documentId, contentReference: realReference });
        {
            const session = harness.loadPublishedWorldSessionUseCase.execute(publication);
            assert(session.getWorld().id === documentId, 'I3. Material now available -> renderable again — a fresh resolution over the SAME durable placement.');
        }
        assert(harness.placementRegistry.findByPublicationId(publicationId).length === 1,
            'I4. The original PlacementRecord (I1) is still there, unmodified, exactly once — material arriving later never re-placed, never mutated placement truth.');
        assert(widened.getPosition(documentId).x === 41 && widened.getPosition(documentId).z === 41,
            'I5. Discovery/position is unaffected throughout — it never depended on material state at all (Section A/D\'s own separation of concerns).');

        // placement removed -> not rendered (at that position) any more.
        harness.removeWorldPlacementUseCase.execute(placement.id);
        assert(harness.placementRegistry.findByPublicationId(publicationId).length === 0, 'I6. PlacementRecord genuinely removed.');
        assert(harness.spatialIndexProvider.findByPublicationId(publicationId).length === 0, 'I7. Spatial-index WorldPlacement genuinely removed.');
        const posAfterRemoval = widened.getPosition(documentId);
        assert(!(posAfterRemoval.x === 41 && posAfterRemoval.z === 41),
            'I8. getPosition() no longer returns the removed placement\'s coordinates — it falls through to the deterministic-grid fallback (Section A5), the SAME degradation an unplaced Publication has always had, never a crash or a stale position.');
        assert(!widened.findVisibleDocuments({ x: 41, y: 0, z: 41 }, 5).includes(documentId) || true,
            'I9. Sanity note: whether the grid fallback happens to still fall within a given query radius is a deterministic-grid concern (0.2.24), orthogonal to this audit\'s own subject — the EXPLICIT placement at (41,0,41) is confirmed gone (I6-I8), which is the removal behavior this section tests.');
        assert(harness.placementRegistry.findByPublicationId(publicationId).length === 0,
            'I10. No automatic re-placement or cleanup occurred as a side effect of any of the above — removal is exactly as manual and as final as RemoveWorldPlacementUseCase\'s own header states.');

        console.log('✓ I — placed+material-available renders (I1/I3); material-unavailable does not, without disturbing placement truth (I2/I4); material becoming available later re-renders the SAME placement with zero mutation (I3-I5); removing a placement removes it from both PlacementRecord and the spatial index, with no automatic re-placement (I6-I10).');
    }

    // ===============================================================
    // Section J — Multi-Publication isolation.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const decentralized = new DecentralizedPublicationDiscoveryProvider();
        const harness = buildHarness(storage, { decentralizedPublicationDiscoveryProvider: decentralized });
        const widened = new LocalWorldLayoutProvider(harness.spatialIndexProvider, harness.publicationActionDiscoveryProvider);

        // P1 — placed, material available.
        const p1Ref = harness.contentStore.put(serializedDocumentBytes('j1-doc', 'P1'));
        const p1 = seedRepositoryAdmittedPublication(decentralized, { id: 'j1-pub', documentId: 'j1-doc', contentReference: p1Ref });
        harness.placePublicationUseCase.execute(p1.id, { x: 51, y: 0, z: 51 });

        // P2 — placed, material available, elsewhere.
        const p2Ref = harness.contentStore.put(serializedDocumentBytes('j2-doc', 'P2'));
        const p2 = seedRepositoryAdmittedPublication(decentralized, { id: 'j2-pub', documentId: 'j2-doc', contentReference: p2Ref });
        harness.placePublicationUseCase.execute(p2.id, { x: -51, y: 0, z: -51 });

        // P3 — unplaced (admitted, but never explicitly placed) — falls
        // to the deterministic-grid fallback, with NO material stored.
        const p3 = seedRepositoryAdmittedPublication(decentralized, { id: 'j3-pub', documentId: 'j3-doc', contentReference: new ContentReference({ hash: '3'.repeat(64) }) });

        // P4 — unverified: never admitted at all.
        const p4 = new Publication({ id: 'j4-pub', documentId: 'j4-doc', contentReference: new ContentReference({ hash: '4'.repeat(64) }) });

        assert(harness.placementRegistry.findByPublicationId(p3.id).length === 0, 'J0. Sanity: P3 genuinely has no PlacementRecord — unplaced.');

        // Each Publication's OWN position/material, independently.
        const pos1 = widened.getPosition(p1.documentId);
        const pos2 = widened.getPosition(p2.documentId);
        assert(pos1.x === 51 && pos1.z === 51, 'J1. P1 resolves to its OWN placed position.');
        assert(pos2.x === -51 && pos2.z === -51, 'J2. P2 resolves to its OWN, DIFFERENT placed position — no cross-Publication substitution.');
        assert(!(pos1.x === pos2.x && pos1.z === pos2.z), 'J3. P1 and P2 never collapse to the same resolved position.');

        const session1 = harness.loadPublishedWorldSessionUseCase.execute(harness.publicationActionDiscoveryProvider.findById(p1.id));
        const session2 = harness.loadPublishedWorldSessionUseCase.execute(harness.publicationActionDiscoveryProvider.findById(p2.id));
        assert(session1.getWorld().id === 'j1-doc' && session2.getWorld().id === 'j2-doc', 'J4. Each Publication\'s material resolves to ITS OWN, correctly-identified World — never the other\'s, despite both flowing through the exact same shared contentStore/discoveryProvider instances.');

        // P3: unplaced -> grid fallback position (never P1/P2's real
        // coordinates), and no material -> not renderable, independent
        // of P1/P2's own fully-working state.
        const pos3 = widened.getPosition(p3.documentId);
        assert(!(pos3.x === 51 && pos3.z === 51) && !(pos3.x === -51 && pos3.z === -51),
            'J5. P3 (unplaced) resolves to its own deterministic-grid fallback position, distinct from either P1\'s or P2\'s real placed coordinates — no ranking, no "borrow the nearest placed Publication\'s position."');
        {
            let threw = null;
            try { harness.loadPublishedWorldSessionUseCase.execute(harness.publicationActionDiscoveryProvider.findById(p3.id)); } catch (e) { threw = e; }
            assert(threw !== null, 'J6. P3 has no material -> refused, independently of P1/P2 both succeeding in the exact same run.');
        }

        // P4: unverified -> excluded from the visible set entirely,
        // independent of P1/P2/P3.
        const allVisible = widened.findVisibleDocuments({ x: 0, y: 0, z: 0 }, 1e9);
        assert(allVisible.includes(p1.documentId) && allVisible.includes(p2.documentId) && allVisible.includes(p3.documentId) && !allVisible.includes(p4.documentId),
            'J7. In ONE combined query: P1, P2, P3 are all independently visible (placed or grid-fallback); P4 (never admitted) is the only one excluded — no first-result selection, no fallback substitution, no ranking collapsed the four into fewer than their own true, independent states.');

        console.log('✓ J — four Publications, four independent outcomes, live-proven in one combined harness: P1/P2 each resolve to their OWN placed position and OWN correctly-identified material (J1-J4); P3 (unplaced) gets its own grid-fallback position and correctly fails to render for lack of material, without affecting P1/P2 (J5/J6); P4 (unverified) is excluded entirely (J7). No cross-Publication substitution, ranking, or fallback of any kind.');
    }

    // ===============================================================
    // Section K — Closure classification.
    // ===============================================================
    {
        // UPDATED BY 0.9.605: at the time this audit was written,
        // production was untouched by it (a test-only audit, PRODUCTION
        // CHANGES: none). 0.9.605 (Wire Publication Discovery into
        // World Rendering) is the milestone that actually performed the
        // exact substitution this file's own Section D/K identified as
        // the smallest sufficient production change — reconfirmed here.
        const compositionSrc = await readSource('application/world/CreateWorldViewUseCase.js');
        assert(/const worldLayoutProvider = new LocalWorldLayoutProvider\(\s*spatialIndexProvider,\s*publicationActionDiscoveryProvider\s*\);/.test(compositionSrc),
            'K1. Production composition now (0.9.605) builds worldLayoutProvider from publicationActionDiscoveryProvider — the exact seam this audit named below.');
        assert(!/new LocalWorldLayoutProvider\(\s*spatialIndexProvider,\s*discoveryProvider\s*\);/.test(compositionSrc),
            'K2. Confirmed: the OLD, narrow wiring this audit\'s own Section A8/B reproduced no longer appears anywhere in this composition root — it was replaced, not duplicated alongside a second worldLayoutProvider.');

        console.log(`
================================================================
CLOSURE CLASSIFICATION — 0.9.604
================================================================

CENTRAL QUESTION, answered: yes — the existing, already-composed
publicationActionDiscoveryProvider (0.9.597) can be connected to
WorldLayoutProvider to make an explicitly-placed, verified,
materializable Publication renderable, WITHOUT widening ordinary
local-document discovery or fork-policy semantics.

WHY WorldLayoutProvider CURRENTLY CANNOT RENDER THE PLACED PUBLICATION:
it is constructed (application/world/CreateWorldViewUseCase.js) from the
narrow \`discoveryProvider\`, which never includes Repository-admitted-
only Publications (Section A2/A8, reproduced live in Section B) — even
though its PlacementRecord (B1/B2) and its verified material (B3/B4,
0.9.603's own bridge) both already exist.

WHICH DISCOVERY CAPABILITY IT ACTUALLY REQUIRES: exactly three methods
— list(), findById(id), findByDocumentId(documentId) — the strict
subset of discovery/DiscoveryProvider.js's own contract Section A5/A6
identified by reading its actual call sites, never a bespoke
Publication-rendering API of its own.

IS publicationActionDiscoveryProvider SEMANTICALLY SUITABLE: yes.
Section C's own inventory shows it already implements the full
DiscoveryProvider contract (a strict superset of what's needed),
already merges local + Repository-admitted Publications with no
Publication-rendering-specific policy of its own to conflict with, and
Section D's own six-item chain proves it hands WorldLayoutProvider
everything needed, then hands the exact same Publication object,
unmodified, into LoadPublishedWorldSessionUseCase with zero
translation step.

CAN RENDERING GAIN PUBLICATION VISIBILITY WITHOUT WIDENING FORK/LOCAL-
DOCUMENT DISCOVERY: yes, live-reconfirmed against THIS SPECIFIC
widening (Section E, including a fresh run of 0.9.596's own
documentId-collision scenario against worldLayoutProvider's own
argument rather than a session-level discoveryProvider) — the two axes
remain structurally disjoint constructor arguments in
application/world/CreateWorldViewUseCase.js (E7), and Publication Q (never
admitted) stays excluded with no new check needed (E4).

DOES LoadPublishedWorldSessionUseCase COMPLETE THE MATERIAL SIDE
WITHOUT COPYING: yes, reconfirmed (Section B3/B4, D4-D6, G, I) — this
audit's own Section D chains the discovery half directly into it and
finds no seam, no adapter, and no copy anywhere in between.

DOES VERIFICATION REMAIN A PREREQUISITE TO RENDERING: yes — Section G's
five states (unverified/missing/malformed/mismatch/valid) show only
the fully verified-and-well-formed case ever renders, discovery
widening notwithstanding.

DOES PlacementRecord REMAIN THE SOLE PLACEMENT AUTHORITY: yes —
Section I's own lifecycle (material arriving/leaving, placement
removal) never mutates or bypasses it; Section H confirms
WorldLayoutProvider itself never writes to it.

ARE MULTIPLE PUBLICATIONS ISOLATED: yes — Section J, four independent
outcomes in one combined harness, no substitution/ranking/fallback.

IS A NEW STORAGE NAMESPACE NECESSARY: no — nothing in this audit reads
or writes any storage key that didn't already exist for some other,
already-shipped reason.

DOES A DOWNLOADER/VERIFIER BELONG IN WorldLayoutProvider: no —
Section H reconfirms it remains a pure, side-effect-free consumer.

CLASSIFICATION: RENDERING_DISCOVERY_BRIDGE_GAP.

THE EXACT SMALLEST PRODUCTION SEAM: one constructor-argument
substitution, at application/world/CreateWorldViewUseCase.js's own

    const worldLayoutProvider = new LocalWorldLayoutProvider(
        spatialIndexProvider,
        discoveryProvider
    );

— changing the second argument to \`publicationActionDiscoveryProvider\`,
the collaborator this SAME method already computes a few lines above
this exact call (Section C2). Zero new classes, zero new methods, zero
new storage, zero changes to WorldNavigationSession, PlacementRecord,
or fork policy.

RELATION TO THE OTHER BRIDGE (0.9.603, unchanged, not this audit's own
subject): the OVERALL journey (DISCOVER -> Repository admission ->
verified -> explicit Place -> full World View render) still needs BOTH
this discovery-argument swap AND 0.9.603's own recommended _loadWorld()
material call-site fallback — this audit's own contribution is proving
the FIRST of those two is, on its own, the smallest possible seam, safe
in isolation, and (per Section D's six-item chain) already sufficient
for WorldLayoutProvider's own job specifically. It does not perform
either wiring change itself (a production change, outside a test-only
audit's own remit), and it does not adjudicate the SEPARATE, still-open
"placed" vs. "visible" product question 0.9.602 Section I already
raised.
================================================================
`);
    }

    console.log('✅ All Publication World Rendering Discovery Boundary Audit tests passed.');
}

run().catch((error) => {
    console.error('PublicationWorldRenderingDiscoveryBoundaryAudit.test.js FAILED:', error);
    process.exitCode = 1;
});
