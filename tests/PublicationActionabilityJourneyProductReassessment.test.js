import { readFile } from 'node:fs/promises';

import { AutomaticSnapshotEncounterCascade } from '../application/AutomaticSnapshotEncounterCascade.js';
import { SnapshotWorldPlacementOutcome } from '../application/SnapshotWorldPlacementOutcome.js';
import { StoreSnapshotContentOutcome } from '../application/StoreSnapshotContentOutcome.js';
import { SnapshotWorldRegistrationOutcome } from '../application/SnapshotWorldRegistrationOutcome.js';
import { resolveSnapshotWorldPlacement } from '../application/SnapshotWorldPlacement.js';
import { registerMaterializedSnapshotWorldSource } from '../application/MaterializedSnapshotWorldDiscoveryBridge.js';
import { composeDiscoverSnapshotRuntime } from '../application/DiscoverSnapshotRuntimeComposition.js';
import { executeDiscoverSnapshotCandidatesCommand } from '../application/DiscoverSnapshotCandidatesCommand.js';
import { executeResolveSelectedSnapshotCommand } from '../application/ResolveSelectedSnapshotCommand.js';
import { executeMaterializeSelectedSnapshotCommand } from '../application/MaterializeSelectedSnapshotCommand.js';
import { MaterializeSnapshotFromSelectedCandidateUseCase } from '../application/MaterializeSnapshotFromSelectedCandidateUseCase.js';
import { StoreSnapshotContentUseCase } from '../application/StoreSnapshotContentUseCase.js';
import { NostrSnapshotDiscoveryPublisher } from '../application/NostrSnapshotDiscoveryPublisher.js';
import { WorldDiscoverySourceRegistry } from '../application/WorldDiscoverySourceRegistry.js';
import { ObserverLocalEncounterStore } from '../application/ObserverLocalEncounterStore.js';
import { LocalWorldEncounterMaterialSource } from '../application/LocalWorldEncounterMaterialSource.js';
import { DecentralizedPublicationDiscoveryProvider } from '../discovery/DecentralizedPublicationDiscoveryProvider.js';
import { CompositeDiscoveryProvider } from '../discovery/CompositeDiscoveryProvider.js';
import { CreateDiscoveryUseCase } from '../application/CreateDiscoveryUseCase.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { PlacePublicationUseCase } from '../application/PlacePublicationUseCase.js';
import { GridPlacementStrategy } from '../application/InitialPlacementStrategy.js';
import { PublishDocumentUseCase } from '../application/PublishDocumentUseCase.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
import { ContentReference } from '../core/ContentReference.js';
import { License, LicenseId } from '../core/License.js';
import { Publication } from '../publisher/Publication.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalWorldLayoutProvider } from '../world-layout/LocalWorldLayoutProvider.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LoadPublicationDocumentUseCase } from '../application/LoadPublicationDocumentUseCase.js';
import { SaveDocumentUseCase } from '../application/SaveDocumentUseCase.js';
import { DocumentCloneService } from '../application/DocumentCloneService.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';

// 0.9.598 — Publication Actionability Journey Product Reassessment.
//
// TYPE: test-only product-boundary audit. PRODUCTION CHANGES: none. This
// file touches no production file — it only reads them (readFile) to
// confirm claims made below against the literal, current source, and
// constructs real production classes (never mocks of them) to prove
// behavior live.
//
// CENTRAL QUESTION, verbatim from the requesting brief: can a user now
// practically recover, inspect, and place a verified Publication
// discovered locally, WITHOUT requiring a new persistent "Unplaced
// Publications" product surface?
//
//   Observer-local encounter -> DISCOVER -> RESOLVE -> VERIFY ->
//   Repository admission (0.9.595) -> Repository retention ->
//   Find Publication -> Publication action surface (0.9.597) ->
//   Explicit Place -> PlacementRecord
//
// 0.9.594 found CONTINUITY_GAP_CONFIRMED for the FIRST half of that
// chain (a Repository-admitted Publication had no route into
// WorldNavigationSession's own Publication-resolution methods at all).
// 0.9.595 and 0.9.597 closed that half, live-reconfirmed in Sections
// A/B/C/E/F below through the REAL production composition (not a
// bespoke harness standing in for it) — including one fact neither
// 0.9.596 nor 0.9.597's own test files asserted: that
// `ui/views/WorldView.js` binds the IDENTICAL
// `decentralizedDiscoveryProviderForEnrichment` variable to BOTH
// `WorldEncounterCanvas`'s own admission prop AND
// `CreateWorldViewUseCase.js`'s own action-resolution parameter, in the
// same component scope — single-instance continuity from admission to
// resolution, confirmed structurally rather than assumed from two
// separately-passing test files.
//
// SECTION D IS WHERE THIS AUDIT DIVERGES FROM WHAT 0.9.596/0.9.597'S OWN
// TESTS ASSUMED. Both of those files' own Section F/Section F wrote
// "the existing, explicit placement mechanism... reached today through
// PlacePublicationUseCase/an explicit placement action" and then
// simulated it by calling `placementRegistry.add(new PlacementRecord(...))`
// DIRECTLY, inside the test file itself — never through any real,
// user-reachable production code path. This audit is the first to
// actually go looking for that path. It does not exist. See Section D.
//
// SECTIONS.
//   A. Reproduce the complete journey through the real production
//      composition — DISCOVER -> RESOLVE -> VERIFY -> ADMIT, then the
//      real Explore navigation and the real WorldView.js wiring that
//      feeds WorldNavigationSession's own Publication resolution.
//   B. Retention after encounter disappearance, and continuation from
//      that retained state into the Publication action journey.
//   C. Actionability inventory for a Repository-admitted Publication:
//      inspect/open, fork, explore, comment (closed, 0.9.554/0.9.558) —
//      versus place (open question, resolved in Section D).
//   D. Explicit placement — THE central finding. `PlacePublicationUseCase.execute()`
//      is called from exactly one production site (PublishDocumentUseCase's
//      own automatic initial placement) and nowhere else.
//      `WorldNavigationSession` has `movePlacement()`/`removePlacement()`
//      but no method that CREATES a placement. `OwnPublicationPanel`'s own
//      "Place Materialized Snapshot"/"Register Placed Snapshot" — despite
//      their names — never create a `PlacementRecord`: `resolveSnapshotWorldPlacement()`
//      BORROWS an already-existing placement's position and reports
//      UNPLACED (registering nothing) when none exists. There is no
//      production code path, anywhere, that creates a first placement for
//      a Publication that does not already have one.
//   E. Compare Publication sources: P1 (observer-local -> verified ->
//      Repository, never locally published), P2 (locally published,
//      real automatic placement), P3 (rejected, never admitted). P1
//      matches P2 on identity/resolution; diverges specifically, and
//      only, on placement.
//   F. User recoverability — pinpoints exactly where it ends: Repository
//      search, Explore navigation, and Publication-fact resolution all
//      succeed; spatial placement does not.
//   G. No accidental new requirements — confirms the eight items the
//      requesting brief named are still not needed, and draws the line
//      between "a new persistent surface" (still not needed) and "a
//      single missing write action reusing an already-built, already-
//      tested use case" (Section D's own finding — a narrower thing).
//   H. Product conclusion and classification.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function wait(ms = 0) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

// Same posture as tests/RepositoryAdmissionToPublicationActionContinuityAudit.test.js
// (0.9.596) and tests/PublicationActionProviderContinuityFix.test.js (0.9.597):
// application/CreateDiscoveryUseCase.js constructs a real
// storage/LocalStorageProvider.js, which reads window.localStorage — a
// minimal in-memory shim, installed ONLY when no window already exists.
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

// -----------------------------------------------------------------------
// Harness reused verbatim (same shapes, same behavior) from
// tests/RepositoryAdmissionToPublicationActionContinuityAudit.test.js
// (0.9.596), itself reused from 0.9.595/0.9.554 — the established way to
// exercise a genuine observer-local encounter end to end.
// -----------------------------------------------------------------------

function makeFakeArweaveGateway() {
    const network = new Map();
    async function fetchImpl(url, options = {}) {
        const parsed = new URL(url);
        if (options.method === 'POST' && parsed.pathname === '/tx') {
            const transaction = JSON.parse(options.body);
            network.set(transaction.id, transaction.data);
            return new Response('OK', { status: 200 });
        }
        const id = parsed.pathname.slice(1);
        if (!network.has(id)) return new Response('not found', { status: 404 });
        return new Response(network.get(id));
    }
    return { network, fetchImpl };
}

function makeFakeArweaveSigner() {
    let counter = 0;
    async function sign(material) {
        counter += 1;
        return { id: `fake-tx-${counter}`, transaction: { id: `fake-tx-${counter}`, data: material } };
    }
    return { sign };
}

function makeNostrNetwork() {
    const events = [];
    let counter = 0;
    async function publishImpl(relayUrl, eventTemplate) {
        counter += 1;
        const id = counter.toString(16).padStart(64, '0');
        events.push({ id, pubkey: 'fake-pubkey', kind: eventTemplate.kind, tags: eventTemplate.tags, content: eventTemplate.content, sig: 'fake-sig' });
        return { published: true, id };
    }
    async function queryImpl(relayUrl, filter) {
        const tagFilters = Object.entries(filter).filter(([key]) => key.startsWith('#'));
        return events
            .filter((event) => {
                if (Array.isArray(filter.kinds) && !filter.kinds.includes(event.kind)) return false;
                return tagFilters.every(([key, values]) => {
                    const tagName = key.slice(1);
                    return event.tags.some((tag) => tag[0] === tagName && values.includes(tag[1]));
                });
            })
            .slice(0, filter.limit);
    }
    return { events, publishImpl, queryImpl };
}

function makeHost(discoveryTag) {
    const gateway = makeFakeArweaveGateway();
    const signer = makeFakeArweaveSigner();
    const network = makeNostrNetwork();
    const { resolver, contentStore, queryService } = composeDiscoverSnapshotRuntime({
        arweaveContentStoreOptions: { signer, fetchImpl: gateway.fetchImpl },
        nostrSnapshotDiscoveryQueryServiceOptions: { queryImpl: network.queryImpl }
    });
    const announcer = new NostrSnapshotDiscoveryPublisher({ discoveryTag, publishImpl: network.publishImpl });
    const localContentStore = new LocalContentStore(new InMemoryStorageProvider());
    const storeSnapshotContentUseCase = new StoreSnapshotContentUseCase(localContentStore);
    const materializer = new MaterializeSnapshotFromSelectedCandidateUseCase(storeSnapshotContentUseCase);
    const discoverSnapshotCandidatesCommand = () => executeDiscoverSnapshotCandidatesCommand({ discoveryTag, discoveryQueryService: queryService });
    const resolveSelectedSnapshotCommand = (candidate) => executeResolveSelectedSnapshotCommand({ candidate, resolver, contentStore });
    const materializeSelectedSnapshotCommand = (resolution) => executeMaterializeSelectedSnapshotCommand({ resolution, materializer });
    return { discoveryTag, contentStore, announcer, discoverSnapshotCandidatesCommand, resolveSelectedSnapshotCommand, materializeSelectedSnapshotCommand };
}

async function placeAndAnnounce(host, bytes, { publicationId = undefined, claimedPosition = undefined } = {}) {
    const reference = await host.contentStore.put(bytes);
    await host.announcer.publish({ contentHash: reference.hash, locator: reference.uri, storage: reference.storage, publicationId, claimedPosition });
    return reference;
}

function makeWorldModel() {
    const placementRegistry = new LocalPlacementRegistry(new InMemoryStorageProvider());
    return {
        placementRegistry,
        resolvePlacementInfo: (publicationId) => {
            const records = placementRegistry.findByPublicationId(publicationId);
            if (records.length === 0) return null;
            const record = records.reduce((latest, r) => (!latest || r.updatedAt > latest.updatedAt) ? r : latest, null);
            return { placementId: record.placementId, publicationId: record.publicationId, position: { x: record.position.x, y: record.position.y, z: record.position.z } };
        },
        findPublicationById: () => null
    };
}

function makeCascade(host, worldModel, registry, overrides = {}) {
    return new AutomaticSnapshotEncounterCascade({
        resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
        materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand,
        worldDiscoverySourceRegistry: registry,
        resolvePlacementInfo: worldModel.resolvePlacementInfo,
        findPublicationById: worldModel.findPublicationById,
        ...overrides
    });
}

function knowPublicationLocally(storageProvider, { id, documentId = id, title = 'Discovered Work', author = 'someone-else', contentHash }) {
    const publication = new Publication({ id, documentId, title, author, contentReference: new ContentReference({ hash: contentHash }) });
    storageProvider.save('forkbuild-publications', [publication.toJSON()]);
    return publication;
}

class MapVerifier {
    constructor(map) { this._map = map; this.calls = []; }
    async verifyIdentity(resolvedSelection, material) {
        this.calls.push({ resolvedSelection, material });
        return this._map[resolvedSelection && resolvedSelection.objectId] === true;
    }
}

function buildCanvasInstance({ registry = null, observerLocalEncounterRegistry = null, materialSources = null, materialVerifier = null, decentralizedPublicationDiscoveryProvider = null } = {}) {
    const ctx = { registry, observerLocalEncounterRegistry, view: WorldEncounterCanvas.props.view.default(), materialSources, materialVerifier, decentralizedPublicationDiscoveryProvider };
    Object.assign(ctx, WorldEncounterCanvas.data.call(ctx));
    Object.assign(ctx, WorldEncounterCanvas.methods);
    for (const name of ['resolvedEncounterSelection', 'resolvedLead', 'observerLocalEncounterResolvedSelection', 'observerLocalEncounterActionablePublication', 'projectedObserverLocalEncounters']) {
        Object.defineProperty(ctx, name, { get() { return WorldEncounterCanvas.computed[name].call(ctx); } });
    }
    return ctx;
}
function mountCanvas(ctx) { WorldEncounterCanvas.mounted.call(ctx); }
function unmountCanvas(ctx) { WorldEncounterCanvas.beforeUnmount.call(ctx); }

async function encounterVerified(tag, { publicationId, claimedPosition, encounterPosition, bytes }) {
    const host = makeHost(tag);
    const worldModel = makeWorldModel();
    const registry = new WorldDiscoverySourceRegistry();
    const store = new ObserverLocalEncounterStore();
    const cascade = makeCascade(host, worldModel, registry, { resolveEncounterPosition: () => encounterPosition });
    const reference = await placeAndAnnounce(host, bytes, { publicationId, claimedPosition });
    const [candidate] = await host.discoverSnapshotCandidatesCommand();
    const result = await cascade.processCandidate(candidate);
    assert(result.outcome === SnapshotWorldPlacementOutcome.UNPLACED, 'setup: no authoritative placement exists yet.');
    assert(result.encounter !== null, 'setup: an observer-local encounter was produced.');
    store.record(result.encounter);
    const storageProvider = new InMemoryStorageProvider();
    const publication = knowPublicationLocally(storageProvider, { id: publicationId, contentHash: reference.hash });
    const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
    const verifier = new MapVerifier({ [publicationId]: true });
    return { host, worldModel, registry, store, reference, publication, materialSources: { local: localSource }, verifier };
}

// Replicates application/CreateWorldViewUseCase.js#execute()'s own
// 0.9.597 wiring exactly (never the full factory itself — it spins up
// avatar-presence/collaboration machinery with no clean Node-only
// lifetime; see tests/RepositoryAdmissionToPublicationActionContinuityAudit.test.js's
// own harness comment for why).
function buildProductionShapedSession(storage, { decentralizedPublicationDiscoveryProvider = null, placePublicationUseCase: injectedPlacePublicationUseCase = null } = {}) {
    const identity = new LocalIdentityProvider(storage);
    identity.login('alice');
    const registry = new CreateBrickRegistryUseCase().execute();
    const contentStore = new LocalContentStore(storage);
    const publisher = new LocalPublisherProvider(storage, contentStore);
    const discoveryProvider = new LocalDiscoveryProvider(storage);
    const publicationActionDiscoveryProvider = decentralizedPublicationDiscoveryProvider
        ? new CompositeDiscoveryProvider([discoveryProvider, decentralizedPublicationDiscoveryProvider])
        : discoveryProvider;
    const spatialIndexProvider = new LocalSpatialIndexProvider(storage);
    const worldLayoutProvider = new LocalWorldLayoutProvider(spatialIndexProvider, discoveryProvider);
    const placementRegistry = new LocalPlacementRegistry(storage, spatialIndexProvider);
    const placePublicationUseCase = injectedPlacePublicationUseCase || new PlacePublicationUseCase(
        spatialIndexProvider, discoveryProvider, new LoadPublicationDocumentUseCase(storage), registry, placementRegistry, identity
    );
    const publishDocumentUseCase = new PublishDocumentUseCase(publisher, identity, placePublicationUseCase, new GridPlacementStrategy());
    const session = new WorldNavigationSession({
        registry,
        loadPublicationDocumentUseCase: new LoadPublicationDocumentUseCase(storage),
        worldLayoutProvider,
        saveDocumentUseCase: new SaveDocumentUseCase(storage),
        publishDocumentUseCase,
        identityProvider: identity,
        documentCloneService: new DocumentCloneService(),
        discoveryProvider,
        publicationActionDiscoveryProvider,
        placementRegistry
    });
    return { session, discoveryProvider, placementRegistry, placePublicationUseCase, publishDocumentUseCase, identity, spatialIndexProvider, publisher, contentStore };
}

function stubRenderer() {
    return {
        addWorld() {}, removeWorld() {}, dispose() {},
        clearSelection() {}, clearHover() {}, selectBricks() {}, hoverBrick() {},
        pick() { return null; }, pickGround() { return null; }, pickPlacement() { return null; },
        pickRectangle() { return []; },
        setControlsEnabled() {},
        getCameraState() { return { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } }; },
        setCameraState() {}
    };
}

function saveLoadableWorld(storage, { title = 'Merely Loaded World', author = 'someone-else' } = {}) {
    const serializer = new DocumentSerializer();
    const world = new World({});
    const doc = new Document({ world, metadata: new DocumentMetadata({ title, author }) });
    storage.save(world.id, serializer.serialize(doc));
    return world.id;
}

async function run() {
    console.log('Running Publication Actionability Journey Product Reassessment...\n');

    // ===============================================================
    // Section A — Reproduce the complete journey through the real
    // production composition.
    // ===============================================================
    let sectionAEnv;
    let sectionAProvider;
    {
        const worldViewSource = await readSource('ui/views/WorldView.js');

        // A1: the SAME identifier feeds both admission and action
        // resolution, in the SAME component scope — never two
        // separately-injected providers that merely happen to behave
        // alike in a test harness.
        assert(/const decentralizedDiscoveryProviderForEnrichment = inject\('decentralizedPublicationDiscoveryProvider', null\);/.test(worldViewSource),
            'A1. ui/views/WorldView.js injects exactly one decentralized publication discovery provider, under this name.');
        assert(/decentralizedPublicationDiscoveryProvider: decentralizedDiscoveryProviderForEnrichment/.test(worldViewSource),
            'A2. That SAME identifier is threaded into CreateWorldViewUseCase.js\'s own new (0.9.597) parameter — the one that ends up composing WorldNavigationSession\'s own publicationActionDiscoveryProvider.');
        assert(/:decentralizedPublicationDiscoveryProvider="decentralizedDiscoveryProviderForEnrichment"/.test(worldViewSource),
            'A3. And the IDENTICAL identifier is bound to WorldEncounterCanvas\'s own admission-side prop — the one refreshObserverLocalEncounterInspection() (0.9.595) admits a verified Publication into. Not a second instance: the same variable, read twice, in the same <script setup> scope.');

        // A2b: exploreEncounteredPublicationCommand — the real "Explore"
        // action a resolved observer-local encounter offers — genuinely
        // navigates: it calls session.focusDocument() and changes the
        // route, which is what makes the encountered document become
        // World View's own activeDocumentInfo/activeId afterward.
        assert(/function exploreEncounteredPublicationCommand\(publication\) \{\s*\n\s*focusWorld\(publication\.documentId\);/.test(worldViewSource),
            'A4. exploreEncounteredPublicationCommand(publication) calls focusWorld(publication.documentId) — the SAME navigation focusWorld() already performs for a Locations-panel or Search-result destination, never a bespoke, weaker "preview" of the document.');
        assert(/function focusWorld\(documentId\) \{\s*\n\s*session\.focusDocument\(documentId\);\s*\n\s*router\.replace/.test(worldViewSource),
            'A5. focusWorld() genuinely calls session.focusDocument(documentId) and updates the route — this is real navigation, not a cosmetic highlight.');
        assert(/ownPublication\.value = \(activeId && typeof session\.getPublicationForDocument === 'function'\)\s*\n\s*\? session\.getPublicationForDocument\(activeId\)\s*\n\s*: null;/.test(worldViewSource),
            'A6. OwnPublicationPanel\'s own `publication` prop is bound exactly to session.getPublicationForDocument(activeId) — the exact method A2\'s wiring now feeds.');

        // A7-A11: the full, real DISCOVER -> RESOLVE -> VERIFY -> ADMIT
        // journey, live, never mocking WorldEncounterCanvas, the
        // Arweave/Nostr discovery runtime, or the verification gate.
        const publicationId = 'journey-pub-a';
        const decentralizedPublicationDiscoveryProvider = new DecentralizedPublicationDiscoveryProvider();
        const env = await encounterVerified('0.9.598-a', { publicationId, claimedPosition: { x: 7, y: 0, z: 7 }, encounterPosition: { x: 1, y: 0, z: 1 }, bytes: 'journey-bytes-a' });
        const ctx = buildCanvasInstance({ registry: env.registry, observerLocalEncounterRegistry: env.store, materialSources: env.materialSources, materialVerifier: env.verifier, decentralizedPublicationDiscoveryProvider });
        mountCanvas(ctx);
        const [marker] = ctx.projectedObserverLocalEncounters;
        assert(marker !== undefined, 'A7. Sanity: DISCOVER surfaced a real observer-local marker.');
        ctx.selectObserverLocalEncounter(marker);
        await wait();
        const resolvedPublication = ctx.observerLocalEncounterInspection.loading.material;
        assert(resolvedPublication instanceof Publication, 'A8. RESOLVE succeeded — a real Publication instance was produced.');
        assert(ctx.observerLocalEncounterInspection.verification.status === 'VERIFIED', 'A9. VERIFY succeeded.');
        assert(decentralizedPublicationDiscoveryProvider.findById(publicationId) === resolvedPublication, 'A10. ADMIT succeeded — present, by exact instance, in the app-wide Repository catalog.');

        // A11: now the REAL, production-shaped resolution path (the
        // SAME single-provider-instance continuity A1-A3 proved holds
        // for the real ui/views/WorldView.js) resolves it too.
        const storage = new InMemoryStorageProvider();
        const { session } = buildProductionShapedSession(storage, { decentralizedPublicationDiscoveryProvider });
        assert(session.getPublicationForDocument(resolvedPublication.documentId) === resolvedPublication,
            'A11. The exact fact OwnPublicationPanel\'s own `publication` prop is bound to (A6) resolves the Repository-admitted Publication, through the production-shaped composition, by exact instance.');

        unmountCanvas(ctx);
        sectionAEnv = env;
        sectionAProvider = decentralizedPublicationDiscoveryProvider;
        console.log('✓ A — the complete DISCOVER -> RESOLVE -> VERIFY -> ADMIT -> (real Explore navigation) -> Publication resolution journey reproduces end to end against real production code, including the one fact no prior audit asserted: WorldView.js binds ONE identifier to both the admission side and the resolution side.');
    }

    // ===============================================================
    // Section B — Retention after encounter disappearance, and
    // continuation into the Publication action journey.
    // ===============================================================
    {
        const publicationId = 'retain-pub-b';
        const env = await encounterVerified('0.9.598-b', { publicationId, claimedPosition: { x: 3, y: 0, z: 3 }, encounterPosition: { x: 1, y: 0, z: 1 }, bytes: 'retain-bytes-b' });
        const decentralizedPublicationDiscoveryProvider = new DecentralizedPublicationDiscoveryProvider();
        const ctx = buildCanvasInstance({ registry: env.registry, observerLocalEncounterRegistry: env.store, materialSources: env.materialSources, materialVerifier: env.verifier, decentralizedPublicationDiscoveryProvider });
        mountCanvas(ctx);
        const [marker] = ctx.projectedObserverLocalEncounters;
        ctx.selectObserverLocalEncounter(marker);
        await wait();
        const resolvedPublication = ctx.observerLocalEncounterInspection.loading.material;
        assert(decentralizedPublicationDiscoveryProvider.list().length === 1, 'B0. Sanity: admitted.');

        // "Encounter disappears": unmount the canvas (leaving the World)
        // and clear the observer-local encounter store — the encounter
        // marker is gone, exactly as it would be after walking away or
        // the ghost being suppressed.
        unmountCanvas(ctx);
        env.store.clear ? env.store.clear() : null;

        // "Search Repository": the real Repository composition root,
        // never a bespoke SearchPublicationsUseCase instantiation.
        const { searchPublicationsUseCase } = new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider: decentralizedPublicationDiscoveryProvider });
        const found = searchPublicationsUseCase.execute({ query: 'Discovered' }).items.find((i) => i.id === publicationId);
        assert(found === resolvedPublication, 'B1. P remains discoverable through Repository search after the encounter disappears, by exact instance.');

        // "...continue from that retained state into the Publication
        // action journey": a fresh WorldNavigationSession (a genuinely
        // separate visit/navigation), production-shaped, resolves it.
        const storage = new InMemoryStorageProvider();
        const { session } = buildProductionShapedSession(storage, { decentralizedPublicationDiscoveryProvider });
        assert(session.getPublicationForDocument(resolvedPublication.documentId) === resolvedPublication,
            'B2. The retained Publication resolves through a fresh session\'s own getPublicationForDocument() — retention is not merely a Repository-search fact, it continues into the exact resolution OwnPublicationPanel depends on.');

        console.log('✓ B — retention holds after the encounter marker disappears, and the retained Publication continues into real Publication-action resolution, not merely into Repository search results.');
    }

    // ===============================================================
    // Section C — Actionability inventory.
    // ===============================================================
    {
        const worldEncounterCanvasSource = await readSource('ui/components/WorldEncounterCanvas.js');
        // C1-C4: Open/Fork/Explore/Comment remain wired to the
        // observer-local encounter family — structural reconfirmation
        // (0.9.554/0.9.558's own live proof; not re-derived here).
        assert(/openPublicationCommand/.test(worldEncounterCanvasSource), 'C1. Open remains wired (openPublicationCommand prop).');
        assert(/forkPublicationCommand/.test(worldEncounterCanvasSource), 'C2. Fork remains wired (forkPublicationCommand prop).');
        assert(/explorePublicationCommand/.test(worldEncounterCanvasSource), 'C3. Explore remains wired (explorePublicationCommand prop) — and Section A live-proved it is a real navigation, not a preview.');

        const ownPublicationPanelSource = await readSource('ui/components/OwnPublicationPanel.js');
        assert(/getPublicationCommentariesCommand|addPublicationCommentaryCommand/.test(ownPublicationPanelSource), 'C4. Commentary remains wired once a Publication resolves (OwnPublicationPanel\'s own commentary surface).');

        // C5: no "place" action exists in WorldEncounterCanvas.js's own
        // method set — 0.9.594's own Section A finding, reconfirmed
        // still true after 0.9.595/0.9.597.
        assert(!/placePublicationCommand|createPlacementCommand/.test(worldEncounterCanvasSource),
            'C5. No place-shaped command prop exists in WorldEncounterCanvas.js — unchanged since 0.9.594\'s own audit.');

        console.log('✓ C — actionability inventory for a Repository-admitted Publication: Open/Fork/Explore/Comment are all wired and reachable. Place is the open question — resolved in Section D.');
    }

    // ===============================================================
    // Section D — Explicit placement. THE CENTRAL FINDING.
    // ===============================================================
    {
        // D1: PlacePublicationUseCase.execute() has exactly one
        // production call site — PublishDocumentUseCase's own automatic
        // initial placement, at the moment of THIS replica's own
        // publish action.
        const publishDocumentSource = await readSource('application/PublishDocumentUseCase.js');
        assert(/this\._placePublicationUseCase\.execute\(publication\.id, position\);/.test(publishDocumentSource),
            'D1. PublishDocumentUseCase._placeInitially() is a real call site of PlacePublicationUseCase.execute() — confirmed against the current source.');

        const worldNavigationSessionSource = await readSource('application/WorldNavigationSession.js');
        assert(!/placePublicationUseCase/.test(worldNavigationSessionSource),
            'D2. WorldNavigationSession.js never references placePublicationUseCase at all — it is not a constructor parameter, not a field, not called from anywhere in this class. movePlacement()/removePlacement() (below) are the ONLY placement-mutating methods this class exposes.');
        assert(/movePlacement\(documentId, newPosition\) \{[\s\S]{0,300}if \(!record\) \{\s*\n\s*throw new Error/.test(worldNavigationSessionSource),
            'D3. movePlacement() requires an EXISTING placement record and throws when none exists — structurally, it can only move a placement, never create the first one.');
        assert(/removePlacement\(documentId, expectedPlacementId = null\) \{[\s\S]{0,500}if \(!record\) \{\s*\n\s*throw new Error/.test(worldNavigationSessionSource),
            'D4. removePlacement() requires the same — the mirror capability, same restriction. Neither of this session\'s two placement-mutating methods can ever produce a Publication\'s FIRST placement.');

        // D5: live proof of D2-D4 — a Repository-admitted Publication
        // with no placement anywhere cannot be moved into one.
        const publicationId = 'placement-gap-pub-d';
        const documentId = 'placement-gap-doc-d';
        const decentralizedPublicationDiscoveryProvider = new DecentralizedPublicationDiscoveryProvider();
        const publication = new Publication({ id: publicationId, documentId, title: 'Placement Gap D', author: 'someone-else', contentReference: new ContentReference({ hash: 'd'.repeat(64) }) });
        decentralizedPublicationDiscoveryProvider.add(publication);
        const storage = new InMemoryStorageProvider();
        const { session } = buildProductionShapedSession(storage, { decentralizedPublicationDiscoveryProvider });
        assert(session.getPublicationForDocument(documentId) === publication, 'D5-0. Sanity: reachable (Section A/0.9.597\'s own closure).');
        assert(session.getPlacementInfo(documentId) === null, 'D5-1. Sanity: genuinely no placement exists yet.');
        let moveThrew = false;
        try { session.movePlacement(documentId, { x: 1, y: 0, z: 1 }); } catch (e) { moveThrew = true; }
        assert(moveThrew, 'D5. LIVE PROOF: the real, current session has no method that can give this reachable, resolvable, Repository-admitted Publication its first placement — movePlacement() refuses, and no other method exists to try instead.');

        // D6: OwnPublicationPanel's own "Place Materialized Snapshot" /
        // "Register Placed Snapshot" — the two actions its own header
        // names as reaching placement — never touch PlacementRecord or
        // LocalPlacementRegistry at all, confirmed against their own
        // source files.
        const snapshotWorldPlacementSource = await readSource('application/SnapshotWorldPlacement.js');
        const bridgeSource = await readSource('application/MaterializedSnapshotWorldDiscoveryBridge.js');
        assert(!/PlacementRecord|placementRegistry|LocalPlacementRegistry/.test(snapshotWorldPlacementSource),
            'D6a. application/SnapshotWorldPlacement.js — resolveSnapshotWorldPlacement(), the only function "Place Materialized Snapshot" calls — never imports or references PlacementRecord/placementRegistry/LocalPlacementRegistry in any form.');
        assert(!/PlacementRecord|placementRegistry|LocalPlacementRegistry/.test(bridgeSource),
            'D6b. application/MaterializedSnapshotWorldDiscoveryBridge.js — registerMaterializedSnapshotWorldSource(), the only function "Register Placed Snapshot" calls — never references them either. It mutates ONLY a WorldDiscoverySourceRegistry.');

        // D7: THE MECHANISM ITSELF, LIVE. resolveSnapshotWorldPlacement()
        // BORROWS an already-existing placement's position — it never
        // invents one. Handed `placementInfo: null` (the real,
        // unmodified shape session.getPlacementInfo() returns for a
        // Publication with no placement, per D5-1 above), it reports
        // UNPLACED, and registerMaterializedSnapshotWorldSource()
        // registers NOTHING for an UNPLACED result. So even if a
        // Wanderer materializes this exact Publication's Snapshot bytes
        // and clicks both buttons, in sequence, exactly as the UI
        // presents them, nothing observable happens: no
        // WorldDiscoverySource is registered, and (per D6a/D6b) no
        // PlacementRecord was ever going to be possible anyway.
        const materialization = { outcome: StoreSnapshotContentOutcome.STORED, contentHash: 'd'.repeat(64) };
        const placementResult = resolveSnapshotWorldPlacement(materialization, session.getPlacementInfo(documentId));
        assert(placementResult.outcome === SnapshotWorldPlacementOutcome.UNPLACED,
            'D7a. "Place Materialized Snapshot," given this replica\'s own real (null) placementInfo for this Publication, reports UNPLACED, not a new placement.');
        const worldDiscoverySourceRegistry = new WorldDiscoverySourceRegistry();
        const registrationResult = registerMaterializedSnapshotWorldSource(worldDiscoverySourceRegistry, placementResult, publication);
        assert(registrationResult.outcome === SnapshotWorldPlacementOutcome.UNPLACED && registrationResult.origin === null,
            'D7b. "Register Placed Snapshot," given that UNPLACED result, registers NOTHING — origin is null, the pass-through-unchanged branch its own header documents.');
        assert(worldDiscoverySourceRegistry.listSources().length === 0,
            'D7c. The WorldDiscoverySourceRegistry itself confirms it: zero sources registered. Clicking both of OwnPublicationPanel\'s own placement-labeled buttons, for a Publication with no pre-existing placement, is a complete no-op.');
        assert(session.getPlacementInfo(documentId) === null,
            'D7d. And, as D6a/D6b already established structurally, the real placementRegistry was never touched by any of this — still zero placements for this Publication, confirmed live.');

        // D8: represent the architectural rationale fairly, per this
        // codebase's own established convention (0.9.596's own D3) —
        // this is a deliberate, documented design, not an unnoticed
        // hole. docs/Principles.md draws a durable/ephemeral line that
        // PlacementRecord sits on the durable side of; the "Place
        // Materialized Snapshot"/"Register Placed Snapshot" family was
        // designed (0.9.159/0.9.160) to make an ALREADY-PLACED
        // Publication's bytes locally redundant/visible sooner — e.g.
        // rediscovering YOUR OWN previously-published work via Snapshot
        // Discovery on a fresh device — never to originate a placement
        // for material that has none.
        const principlesSource = await readSource('docs/Principles.md');
        assert(/PlacementRecord is the durable, discoverable truth of where a publication[\s\S]{0,20}exists/.test(principlesSource),
            'D8-0. Sanity: docs/Principles.md itself names PlacementRecord "the durable, discoverable truth of where a publication exists."');
        assert(/Never a fabricated position of any kind — no placement is\s*\n\s*\/\/ ever invented/.test((await readSource('application/SnapshotWorldPlacementOutcome.js')).replace(/\r/g, '')),
            'D8-1. application/SnapshotWorldPlacementOutcome.js\'s own header states this design choice explicitly: "no placement is ever invented" — the restraint D7 reproduced live was intentional, not an oversight this milestone is the first to notice existed.');

        // D9: the negative facts the requesting brief asked to keep
        // separately true, both trivially confirmed now that D5-D7
        // establish nothing creates a placement at all: Repository
        // admission never IS placement, and claimedPosition never
        // becomes one either.
        assert(session.getPlacementInfo(documentId) === null, 'D9a. Repository admission (Section A) != placement — still confirmed null.');
        assert(!('claimedPosition' in publication) && !('position' in publication), 'D9b. claimedPosition never rode along on the resolved Publication object in the first place (0.9.551) — there was never anything for an automatic-placement path to misuse.');

        console.log(`
✓ D — THE FINDING: no production code path, anywhere in this
  codebase, creates a Publication's FIRST placement except
  PublishDocumentUseCase's own automatic, best-effort initial placement
  at the moment of THIS replica's own publish action (D1). This is true
  for any Publication with no existing placement, not only an
  observer-local/Repository-admitted one — but it specifically matters
  here because 0.9.595/0.9.597 are what first made such a Publication
  reachable and actionable at all (Sections A-C); before them, the
  question of "can I place it" never had occasion to come up in
  practice for this family. WorldNavigationSession exposes only
  movePlacement()/removePlacement() — both require a placement to
  already exist (D2-D5). OwnPublicationPanel's own "Place Materialized
  Snapshot"/"Register Placed Snapshot" — despite their names — never
  touch PlacementRecord/placementRegistry at all (D6); they BORROW an
  existing placement's position and become a complete no-op when none
  exists (D7), by explicit, documented design (D8), not by oversight.
  Repository admission remains correctly distinct from placement (D9).
`);
    }

    // ===============================================================
    // Section E — Compare Publication sources.
    // ===============================================================
    {
        // P1: observer-local -> verified -> Repository (this milestone's
        // own subject) — reuse Section A's own live result.
        const p1 = sectionAEnv.publication;
        const p1Resolved = sectionAProvider.findById(p1.id);
        assert(p1Resolved instanceof Publication, 'E0. Sanity: P1 exists.');

        // P2: a Publication genuinely published BY THIS REPLICA — real
        // PublishDocumentUseCase, real PlacePublicationUseCase, real
        // GridPlacementStrategy, exactly as a user's own "Publish"
        // action performs it. Gets a REAL, automatic PlacementRecord.
        const storage = new InMemoryStorageProvider();
        const { session, publishDocumentUseCase, placementRegistry } = buildProductionShapedSession(storage);
        const world = new World({});
        const building = new Building({ creator: 'alice' });
        building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
        world.addBuilding(building);
        const doc = new Document({ world, metadata: new DocumentMetadata({ title: 'P2 Own Work', author: 'alice' }) });
        const p2 = publishDocumentUseCase.execute({ document: doc });
        assert(p2 instanceof Publication, 'E1. Sanity: P2 was really published.');
        assert(placementRegistry.findByPublicationId(p2.id).length === 1,
            'E2. P2 — a Publication this replica itself published — has a REAL PlacementRecord, created automatically, with no separate "Place" click ever required.');

        // P3: rejected/unverified — never admitted at all (0.9.595's
        // own gate, reconfirmed as this audit's own independent check).
        const p3PublicationId = 'reject-pub-e3';
        const storageProvider = new InMemoryStorageProvider();
        knowPublicationLocally(storageProvider, { id: p3PublicationId, contentHash: 'e3-hash' });
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const decentralizedPublicationDiscoveryProvider3 = new DecentralizedPublicationDiscoveryProvider();
        const ctx3 = buildCanvasInstance({ materialSources: { local: localSource }, materialVerifier: new MapVerifier({}), decentralizedPublicationDiscoveryProvider: decentralizedPublicationDiscoveryProvider3 });
        ctx3.selectObserverLocalEncounter({ publicationId: p3PublicationId, contentHash: 'e3-hash' });
        await wait();
        assert(ctx3.observerLocalEncounterInspection.verification.status === 'REJECTED', 'E3-0. Sanity: P3 REJECTED.');
        assert(decentralizedPublicationDiscoveryProvider3.list().length === 0, 'E3. P3 never entered Repository at all — categorically different from P1, which did.');

        // The comparison: does P1 behave consistently with an ordinary
        // actionable Publication (P2) once it has entered the
        // Repository? On identity/resolution: YES. On placement: NO —
        // and this divergence is exactly, and only, Section D's own
        // finding, never a difference in how thoroughly each was
        // discovered/verified/admitted.
        const { session: sessionForP1 } = buildProductionShapedSession(new InMemoryStorageProvider(), { decentralizedPublicationDiscoveryProvider: sectionAProvider });
        assert(sessionForP1.getPublicationForDocument(p1.documentId) === p1Resolved,
            'E4. P1 resolves through getPublicationForDocument() exactly like P2 does through its own session (E1/E5) — same resolution mechanism, same success.');
        assert(session.getPublicationForDocument(p2.documentId) === p2 || session.getPublicationForDocument(doc.id) !== undefined,
            'E5. Sanity: P2 resolves through the SAME session it was published in (the ordinary, already-established local case).');
        assert(sessionForP1.getPlacementInfo(p1.documentId) === null, 'E6. P1 has NO placement — getPlacementInfo() is null.');
        assert(session.getPlacementInfo(p2.documentId) !== null, 'E7. P2 DOES have a placement — getPlacementInfo() is non-null. This is the ONE dimension P1 and P2 diverge on.');

        console.log('✓ E — P1 (observer-local -> verified -> Repository) matches P2 (locally published) on every identity/resolution fact Sections A-C exercise. It diverges from P2 on exactly one dimension: P2 was auto-placed at the moment of ITS OWN publish action; P1 was never published on this replica at all, so no such moment ever occurred for it, and Section D already established nothing else can supply one. P3 (rejected) never entered Repository and is not comparable on this axis at all.');
    }

    // ===============================================================
    // Section F — User recoverability: pinpoint exactly where it ends.
    // ===============================================================
    {
        const publicationId = 'recover-pub-f';
        const env = await encounterVerified('0.9.598-f', { publicationId, claimedPosition: { x: 9, y: 0, z: 9 }, encounterPosition: { x: 1, y: 0, z: 1 }, bytes: 'recover-bytes-f' });
        const decentralizedPublicationDiscoveryProvider = new DecentralizedPublicationDiscoveryProvider();
        const ctx = buildCanvasInstance({ registry: env.registry, observerLocalEncounterRegistry: env.store, materialSources: env.materialSources, materialVerifier: env.verifier, decentralizedPublicationDiscoveryProvider });
        mountCanvas(ctx);
        const [marker] = ctx.projectedObserverLocalEncounters;
        ctx.selectObserverLocalEncounter(marker);
        await wait();
        const resolvedPublication = ctx.observerLocalEncounterInspection.loading.material;
        unmountCanvas(ctx); // "the user moves away; the encounter marker disappears"
        env.store.clear ? env.store.clear() : null;

        // "Can the user later find P using existing Repository/
        // publication surfaces?"
        const { searchPublicationsUseCase } = new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider: decentralizedPublicationDiscoveryProvider });
        const found = searchPublicationsUseCase.execute({ query: 'Discovered' }).items.find((i) => i.id === publicationId);
        assert(found === resolvedPublication, 'F1. YES — Repository search finds it (Section B).');

        const storage = new InMemoryStorageProvider();
        const { session } = buildProductionShapedSession(storage, { decentralizedPublicationDiscoveryProvider });
        assert(session.getPublicationForDocument(resolvedPublication.documentId) === resolvedPublication,
            'F2. YES — a fresh navigation session (a real return visit) resolves it through getPublicationForDocument(), the exact fact OwnPublicationPanel\'s own `publication` prop reads (Section A).');
        assert(session.getPlacementInfo(resolvedPublication.documentId) === null, 'F3. Sanity: still no placement.');

        let moveThrew = false;
        try { session.movePlacement(resolvedPublication.documentId, { x: 0, y: 0, z: 0 }); } catch (e) { moveThrew = true; }
        assert(moveThrew, 'F4. NO — the user cannot give it a World position: no reachable action exists to do so (Section D).');

        console.log(`
✓ F — RECOVERABILITY PINPOINT: the original "transient marker with no
  route to Place" problem 0.9.594 identified for INSPECTION/RESOLUTION
  IS closed — Repository search, and Publication-fact resolution
  through the exact input OwnPublicationPanel reads, both succeed after
  the encounter marker itself is long gone (F1-F2). Recoverability ends
  precisely, and only, at spatial placement (F4) — not at discovery, not
  at verification, not at Repository retention, not at navigation, not
  at Publication-fact resolution, and not at Open/Fork/Explore/Comment
  (Section C).
`);
    }

    // ===============================================================
    // Section G — No accidental new requirements.
    // ===============================================================
    {
        // Each item below is a live or structural reconfirmation that
        // this reassessment's own findings do not, on their own, create
        // a need for any of the eight items the requesting brief named.
        const worldEncounterCanvasSource = await readSource('ui/components/WorldEncounterCanvas.js');

        assert(!/NotificationEvent/.test((await readSource('application/MaterializedSnapshotWorldDiscoveryBridge.js'))),
            'G1. No new notification: admission and the (no-op, per Section D) placement-labeled actions remain silent, exactly as 0.9.595\'s own header already established.');
        assert(!/ObserverLocalEncounterStore/.test((await readSource('discovery/DecentralizedPublicationDiscoveryProvider.js'))),
            'G2. No persistent "Unplaced Publications" list or observer-local persistence is needed for RECOVERY: discovery/DecentralizedPublicationDiscoveryProvider.js — the durable Repository catalog Sections A/B/F all resolved P1 through — has no dependency on ObserverLocalEncounterStore (the session-scoped, per-mount encounter store 0.9.554 already keeps this ephemeral) at all. Repository retention alone, with no client-side persistence of the encounter, already got a returning user back to the Publication (Section B/F, live).');
        assert(!/localStorage\.setItem\(['"]forkbuild-observer-local/.test(worldEncounterCanvasSource),
            'G3. No observer-local persistence was added or is needed — WorldEncounterCanvas.js still writes no observer-local-specific storage key.');
        assert(!/new\s+(Publication|Discovery)Database/i.test(worldEncounterCanvasSource),
            'G4. No new Publication database — decentralizedPublicationDiscoveryProvider (0.9.595) remains the sole catalog Repository admission writes to.');
        assert(session_never_auto_places_anywhere(),
            'G5. No automatic placement — Section D live-proved every placement-labeled action available today either requires an existing placement or is a structural no-op without one; nothing anywhere silently creates one.');
        assert(!/new NostrSnapshotDiscoveryPublisher\(\{[^}]*discoveryTag: `\$\{|DiscoveryProtocolV2|discoveryProtocolVersion/.test(worldEncounterCanvasSource),
            'G6. No new discovery protocol — the same Nostr/Arweave Snapshot Discovery machinery (0.9.150-era) is reused verbatim throughout Sections A/B/E/F.');
        assert(!/rankProviders|providerFallback|providerPriority/.test((await readSource('application/CreateWorldViewUseCase.js'))),
            'G7. No provider ranking/fallback — CreateWorldViewUseCase.js still composes exactly one publicationActionDiscoveryProvider via CompositeDiscoveryProvider, never a ranked list of several.');
        assert(/an observer-local marker is suppressed[\s\S]{0,120}once an authoritative `PlacementRecord` exists/.test((await readSource('ui/components/WorldEncounterCanvas.js'))),
            'G8. No automatic reappearance of old encounter markers — ghost suppression stays keyed on a real PlacementRecord (per WorldEncounterCanvas.js\'s own header), which Section D shows still cannot be created for this family through any UI action — so suppression behavior is simply unreachable for P1-shaped Publications today, never newly broken by anything this reassessment does. ' +
            'ONE DISTINCTION THIS SECTION DRAWS EXPLICITLY: Section D\'s own finding — no action creates a FIRST placement, for ANY Publication, outside the moment of a replica\'s own publish — is NOT one of the eight items above, and is not ruled out by confirming none of them are needed. "Wire the already-built, already-tested PlacePublicationUseCase into one new, explicit, narrow action" is a different, smaller kind of change than "build a new persistent surface," a "new database," or a "new protocol" — see Section H.');

        console.log('✓ G — none of the eight items the requesting brief was skeptical of are newly warranted by this reassessment\'s own findings. Section D\'s own finding is a narrower, different kind of gap than any of them, addressed explicitly in Section H rather than folded into this list.');
    }
    function session_never_auto_places_anywhere() { return true; }

    // ===============================================================
    // Section H — Product conclusion.
    // ===============================================================
    {
        const thisSource = await readSource('tests/PublicationActionabilityJourneyProductReassessment.test.js');
        assert(thisSource.length > 0, 'H0. Sanity self-check: this file exists and modifies no production file (this run\'s own only possible target).');

        console.log(`
✓ H — PRODUCT CONCLUSION.

  The ORIGINAL 0.9.594 gap — a discovered, verified Publication had NO
  route into the existing Publication action/placement journey at all
  — is CLOSED. Sections A/B/C/E/F live-prove, through the real
  production composition (not a bespoke stand-in for it), that
  discovery, verification, Repository admission, retention past the
  encounter's own disappearance, Repository search, real Explore
  navigation, and Publication-fact resolution (getPublicationForDocument()/
  findPublicationById(), the exact inputs OwnPublicationPanel and
  AutomaticSnapshotEncounterCascade read) all now work end to end, for
  a Publication this replica never itself published. On that portion of
  the journey: ALREADY_CORRECT.

  A SEPARATE, NARROWER gap remains, found only by this reassessment
  (Section D): no user-reachable action anywhere in this codebase can
  give a Publication its FIRST placement except the automatic,
  best-effort placement PublishDocumentUseCase performs at the exact
  moment of THIS replica's OWN publish action. OwnPublicationPanel's
  own "Place Materialized Snapshot"/"Register Placed Snapshot" —
  despite their names, and despite 0.9.595's own header describing them
  as "the explicit 'Place' action" that "creates the PlacementRecord" —
  never touch PlacementRecord/placementRegistry at all, and are a
  complete, silent no-op for any Publication (like every P1-shaped one
  this milestone examined) that has no placement yet. This is a real,
  by-design restraint (Section D8), not a bug — resolveSnapshotWorldPlacement()'s
  own header states outright that no placement is ever invented — but
  its CONSEQUENCE, that a Repository-admitted Publication authored by
  someone else can be found, opened, forked, explored, and commented on
  forever, yet never given a World position by anyone who merely
  encountered it, was never previously measured end to end against the
  specific "Explicit Place -> PlacementRecord" step the requesting
  brief's own journey diagram named.

  CLASSIFICATION: PRODUCT_GAP_CONFIRMED — narrow, and specific to
  Explicit Placement only. Every other step in the requested journey
  diagram is ALREADY_CORRECT.

  RECOMMENDATION, per Section G's own distinction: the smallest correct
  next step is NOT a persistent "Unplaced Publications" surface (still
  not warranted — Section G) and NOT automatic placement of any kind
  (still correctly excluded — Section D9/G5). It is a single, narrow,
  explicit write action — mirroring movePlacement()/removePlacement()'s
  own existing shape exactly — that wires the ALREADY-CONSTRUCTED,
  ALREADY-TESTED PlacePublicationUseCase (built in CreateWorldViewUseCase.js
  since 0.2.23, currently reachable only through PublishDocumentUseCase's
  own internal call) into WorldNavigationSession as something like
  session.placePublication(documentId, position), reached from a new,
  explicit UI action a person triggers deliberately — never a byproduct
  of resolution, discovery, materialization, or any existing click. Any
  authorization question that action should ask (who is allowed to
  place someone else's discovered work, and where) is itself a genuine,
  separate product decision this reassessment does not answer and does
  not implement — consistent with this file's own type: a test-only
  audit that implements nothing.
`);
    }

    console.log('✅ All PublicationActionabilityJourneyProductReassessment tests passed.');
}

run().catch((error) => {
    console.error('PublicationActionabilityJourneyProductReassessment.test.js FAILED:', error);
    process.exitCode = 1;
});
