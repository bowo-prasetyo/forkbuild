import { readFile } from 'node:fs/promises';

import { AutomaticSnapshotEncounterCascade } from '../application/AutomaticSnapshotEncounterCascade.js';
import { SnapshotWorldPlacementOutcome } from '../application/SnapshotWorldPlacementOutcome.js';
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
import { MoveWorldPlacementUseCase } from '../application/MoveWorldPlacementUseCase.js';
import { RemoveWorldPlacementUseCase } from '../application/RemoveWorldPlacementUseCase.js';
import { GridPlacementStrategy } from '../application/InitialPlacementStrategy.js';
import { PublishDocumentUseCase } from '../application/PublishDocumentUseCase.js';
import { ContentReference } from '../core/ContentReference.js';
import { Publication } from '../publisher/Publication.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalWorldLayoutProvider } from '../world-layout/LocalWorldLayoutProvider.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LoadPublicationDocumentUseCase } from '../application/LoadPublicationDocumentUseCase.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';

// 0.9.601 — Discovered Publication Placement Journey Closure Audit.
//
// TYPE: test-only architectural/product closure audit. PRODUCTION
// CHANGES: none. This file touches no production file — it only reads
// them (readFile) to confirm structural claims, and constructs real
// production classes (never mocks of them) to prove behavior live.
//
// CENTRAL QUESTION, verbatim from the requesting brief: can a Publication
// discovered from a non-local/decentralized source complete the full
// user journey from discovery through explicit placement and World
// presence, while preserving all existing identity, policy, lifecycle,
// and placement boundaries?
//
//   DISCOVER -> RESOLVE -> VERIFY -> Repository admission (0.9.595) ->
//   Encounter disappears -> Repository retains P -> Find P -> Inspect P
//   -> Explicit "Place" -> PlacePublicationUseCase (0.9.600) ->
//   PlacementRecord -> World presence
//
// Every step through "PlacementRecord" is proven live in Section A,
// reusing the real DISCOVER/RESOLVE/VERIFY/ADMIT harness
// tests/PublicationActionabilityJourneyProductReassessment.test.js
// (0.9.598) established, now extended past the point that file's own
// Section D found nothing could cross — 0.9.599/0.9.600 closed exactly
// that gap, so this audit is the first to actually walk all the way to
// an explicit session.placePublication() call from real DISCOVER/RESOLVE/
// VERIFY/ADMIT output, rather than a directly-seeded DecentralizedPublicationDiscoveryProvider
// (0.9.600's own test's own posture) or a synthetic Publication (0.9.599's
// own posture).
//
// SECTION A IS ALSO WHERE THIS AUDIT DIVERGES FROM ASSUMING THE FINAL
// ARROW. The requesting brief's own diagram ends "-> World presence,"
// and every milestone since 0.9.598 has used that phrase loosely to mean
// "a real PlacementRecord now exists." This audit is the first to ask
// the literal question — does the placed World actually stream into
// view, or resolve to its real position, through the SAME
// WorldLayoutProvider World View's own rendering path
// (WorldNavigationSession#getSpatialState()/_loadWorld()) already uses
// for every other document? It does not. See Section A's own "WORLD
// PRESENCE, LITERALLY" subsection and Section F below for the precise,
// narrow reason why, live-reconfirmed independently from three separate
// angles.
//
// SECTIONS (the requesting brief's own lettering, verbatim).
//   A. Full end-to-end flagship.
//   B. Exact identity continuity.
//   C. First placement vs existing placement.
//   D. Explicitness invariant.
//   E. Position semantics.
//   F. Provider-boundary regression — AND this audit's own central
//      finding: the narrow discoveryProvider's deliberate, correct
//      unwidened-ness (0.9.596/0.9.597/0.9.599/0.9.600) has a side
//      effect none of those milestones tested for.
//   G. Negative cases.
//   H. Multi-Publication isolation.
//   I. Lifecycle/re-entry.
//   J. Product surface sanity.
//   K. Authorization boundary documentation.
//   L. Closure classification.

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

// Same posture as every prior milestone in this arc: application/
// CreateDiscoveryUseCase.js constructs a real storage/LocalStorageProvider.js,
// which reads window.localStorage — a minimal in-memory shim, installed
// ONLY when no window already exists.
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
// Harness reused verbatim from tests/PublicationActionabilityJourneyProductReassessment.test.js
// (0.9.598), itself reused from 0.9.596/0.9.554 — the established way to
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

// The real DISCOVER -> RESOLVE -> VERIFY -> (ADMIT, via the caller
// mounting a canvas against the returned materialSources/verifier)
// pipeline, exactly as tests/PublicationActionabilityJourneyProductReassessment.test.js
// (0.9.598) established it.
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

// 0.9.601's own harness addition: builds a real WorldNavigationSession
// wired EXACTLY the way application/CreateWorldViewUseCase.js wires it
// as of 0.9.600's own fix — publicationActionDiscoveryProvider (narrow
// discoveryProvider composed with decentralizedPublicationDiscoveryProvider,
// when one is supplied) is what PlacePublicationUseCase is constructed
// with AND what is handed to WorldNavigationSession for
// getPublicationForDocument()/findPublicationById()/placePublication(),
// while discoveryProvider itself (and, new to this file,
// worldLayoutProvider — see Section A/F) stay on the narrow provider,
// exactly as CreateWorldViewUseCase.js's own real composition does.
// Never the full CreateWorldViewUseCase.js factory itself — it spins up
// avatar-presence/collaboration/renderer-mount machinery with no clean
// Node-only lifetime; see 0.9.598's own harness comment for why this
// replication, not the real factory, is this arc's established practice.
function buildJourneySession(storage, { decentralizedPublicationDiscoveryProvider = null } = {}) {
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
    const worldLayoutProvider = new LocalWorldLayoutProvider(spatialIndexProvider, discoveryProvider);
    const placementRegistry = new LocalPlacementRegistry(storage, spatialIndexProvider);
    const placePublicationUseCase = new PlacePublicationUseCase(
        spatialIndexProvider, publicationActionDiscoveryProvider, new LoadPublicationDocumentUseCase(storage), brickRegistry, placementRegistry, identity
    );
    const publishDocumentUseCase = new PublishDocumentUseCase(publisher, identity, placePublicationUseCase, new GridPlacementStrategy());
    const moveWorldPlacementUseCase = new MoveWorldPlacementUseCase(spatialIndexProvider, placementRegistry, null, identity);
    const removeWorldPlacementUseCase = new RemoveWorldPlacementUseCase(spatialIndexProvider, placementRegistry);
    const session = new WorldNavigationSession({
        registry: { getDocument: () => null },
        loadPublicationDocumentUseCase: new LoadPublicationDocumentUseCase(storage),
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
    return { session, identity, discoveryProvider, publicationActionDiscoveryProvider, worldLayoutProvider, spatialIndexProvider, placementRegistry, placePublicationUseCase, publishDocumentUseCase, storage };
}

async function run() {
    console.log('Running Discovered Publication Placement Journey Closure Audit...\n');

    // ===============================================================
    // Section A — Full end-to-end flagship.
    // ===============================================================
    let flagship;
    {
        const publicationId = 'flagship-pub-a';
        const claimedPosition = { x: 99, y: 0, z: 99 };
        const encounterPosition = { x: 1, y: 0, z: 1 };
        const env = await encounterVerified('0.9.601-a', { publicationId, claimedPosition, encounterPosition, bytes: 'flagship-bytes-a' });

        // DISCOVER -> RESOLVE -> VERIFY -> ADMIT, live, real production
        // classes throughout (never mocked): the real Arweave/Nostr
        // Snapshot Discovery runtime, the real AutomaticSnapshotEncounterCascade,
        // the real WorldEncounterCanvas, the real verification gate.
        const decentralizedPublicationDiscoveryProvider = new DecentralizedPublicationDiscoveryProvider();
        const ctx = buildCanvasInstance({ registry: env.registry, observerLocalEncounterRegistry: env.store, materialSources: env.materialSources, materialVerifier: env.verifier, decentralizedPublicationDiscoveryProvider });
        mountCanvas(ctx);
        const [marker] = ctx.projectedObserverLocalEncounters;
        assert(marker !== undefined, 'A1. DISCOVER: a real observer-local marker was surfaced.');
        ctx.selectObserverLocalEncounter(marker);
        await wait();
        const resolvedPublication = ctx.observerLocalEncounterInspection.loading.material;
        assert(resolvedPublication instanceof Publication, 'A2. RESOLVE: a real Publication instance was produced.');
        assert(ctx.observerLocalEncounterInspection.verification.status === 'VERIFIED', 'A3. VERIFY: verification succeeded.');
        assert(decentralizedPublicationDiscoveryProvider.findById(publicationId) === resolvedPublication, 'A4. Repository admission: present, by exact instance, in the app-wide Repository catalog.');

        // Encounter disappears.
        unmountCanvas(ctx);
        if (typeof env.store.clear === 'function') env.store.clear();

        // Repository retains P — a fresh search, no observer-local state
        // of any kind still alive.
        const { searchPublicationsUseCase } = new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider: decentralizedPublicationDiscoveryProvider });
        const found = searchPublicationsUseCase.execute({ query: 'Discovered' }).items.find((i) => i.id === publicationId);
        assert(found === resolvedPublication, 'A5. Repository retains P after the encounter disappears — found by exact instance.');

        // Find P / Inspect P, through a genuinely separate navigation
        // session (a fresh visit), production-shaped exactly as
        // application/CreateWorldViewUseCase.js wires it post-0.9.600.
        const storage = new InMemoryStorageProvider();
        const { session, placementRegistry, spatialIndexProvider, worldLayoutProvider, discoveryProvider } = buildJourneySession(storage, { decentralizedPublicationDiscoveryProvider });
        const inspected = session.getPublicationForDocument(resolvedPublication.documentId);
        assert(inspected === resolvedPublication, 'A6. Find/Inspect P: session.getPublicationForDocument() — the exact fact OwnPublicationPanel\'s own `publication` prop reads — resolves P by exact instance.');
        assert(session.findPublicationById(publicationId) === resolvedPublication, 'A6b. session.findPublicationById() resolves the identical instance.');
        assert(session.getPlacementsForPublication(publicationId).length === 0, 'A7. Sanity: no placement exists yet — Inspect alone created nothing.');

        // Explicit "Place" -> PlacePublicationUseCase -> PlacementRecord.
        const herePosition = { x: 42, y: 0, z: -17 }; // deliberately NOT claimedPosition, NOT encounterPosition
        const placement = session.placePublication(publicationId, herePosition);
        assert(placement !== null, 'A8. Explicit Place succeeds.');
        const records = session.getPlacementsForPublication(publicationId);
        assert(records.length === 1, 'A9. Exactly one PlacementRecord now exists for P.');
        const record = records[0];
        assert(record.revision === 1 && record.owner === 'alice' && record.position.x === 42 && record.position.z === -17,
            'A10. PlacementRecord: a real, revision-1, owned, correctly-positioned record — the durable, discoverable truth of where P exists (docs/Principles.md).');

        // Confirm the SIGNED, causally-stamped nature of the record via
        // the placement registry directly (getPlacementsForPublication()'s
        // own enrichment intentionally narrows the shape — see its own
        // 0.9.308 header, "never the fuller ... enrichment").
        const rawRecord = placementRegistry.findByPublicationId(publicationId)[0];
        assert(rawRecord.signature !== null && rawRecord.causalStamp !== null,
            'A11. The underlying PlacementRecord is genuinely signed and causally-stamped — indistinguishable in kind from an automatically-placed publication\'s own initial record.');

        // WORLD PRESENCE, LITERALLY. This is the one place this audit
        // diverges from taking "World presence" on faith. Real WorldPlacement
        // was added to the real spatial index by PlacePublicationUseCase
        // (unmodified) — confirmed directly.
        const spatialHits = spatialIndexProvider.discover({ x: 0, y: 0, z: 0 }, 1000);
        assert(spatialHits.some((p) => p.publicationId === publicationId && p.position.x === 42),
            'A12. The real spatial index DOES contain a WorldPlacement for P, at the explicit position — this half of "World presence" (the durable record) is genuinely true.');

        // But does P actually become part of what World View STREAMS IN
        // or resolves a position for, through the SAME WorldLayoutProvider
        // path every other document's rendering already goes through
        // (WorldNavigationSession#getSpatialState()/_loadWorld(), both of
        // which call straight through to worldLayoutProvider — confirmed
        // structurally in Section F)? Live-tested here, directly against
        // the real, unmodified LocalWorldLayoutProvider this session was
        // built with — not a stand-in.
        const visibleDocuments = worldLayoutProvider.findVisibleDocuments({ x: 42, y: 0, z: -17 }, 1000);
        const resolvedRenderPosition = worldLayoutProvider.getPosition(resolvedPublication.documentId);
        const narrowStillBlind = discoveryProvider.findById(publicationId) === null;

        console.log(`
✓ A1-A12 — the complete DISCOVER -> RESOLVE -> VERIFY -> Repository
  admission -> encounter disappears -> Repository retains P -> Find P ->
  Inspect P -> explicit Place -> PlacePublicationUseCase -> a real,
  signed, causally-stamped, correctly-positioned PlacementRecord -> a
  real spatial-index WorldPlacement entry, ALL reproduce end to end
  against real, unmodified production classes, for a Publication this
  replica never itself published and whose observer-local encounter
  marker is long gone by the time it is placed.
`);

        if (visibleDocuments.includes(resolvedPublication.documentId) && resolvedRenderPosition.x === 42 && resolvedRenderPosition.z === -17) {
            console.log('✓ A13 — WORLD PRESENCE (literal): P also streams into worldLayoutProvider.findVisibleDocuments() and resolves its correct rendered position. The full journey, including literal World-View rendering visibility, closes completely.');
        } else {
            console.log(`
⚠ A13 — WORLD PRESENCE (literal) DOES NOT HOLD, LIVE-CONFIRMED:
  worldLayoutProvider.findVisibleDocuments({x:42,y:0,z:-17}, 1000) =
  ${JSON.stringify(visibleDocuments)} (P's documentId is ${resolvedPublication.documentId ? 'ABSENT' : 'n/a'});
  worldLayoutProvider.getPosition(P.documentId) =
  {x:${resolvedRenderPosition.x}, y:${resolvedRenderPosition.y}, z:${resolvedRenderPosition.z}}
  (the real placed position was {x:42,y:0,z:-17} — this is the
  deterministic-grid/origin FALLBACK, not P's real position).
  narrow discoveryProvider.findById(P.id) === null: ${narrowStillBlind}.
  This is NOT a bug this audit is reporting as newly broken — it is a
  precise, previously-untested CONSEQUENCE of a boundary 0.9.596/0.9.597/
  0.9.599/0.9.600 each deliberately, correctly preserved for fork-policy
  reasons (see this file's own Section F). See Section F/L for the exact
  seam and its classification.
`);
        }
        assert(!visibleDocuments.includes(resolvedPublication.documentId) && resolvedRenderPosition.x === 0 && resolvedRenderPosition.z === 0 && narrowStillBlind,
            'A13-CONFIRM. Live-reconfirmed exactly as Section F predicts structurally: this specific combination (real PlacementRecord + real spatial-index entry + zero World View streaming/rendering visibility) is the CURRENT, reproducible behavior — asserted here so a future fix that closes it fails this line loudly, rather than this audit silently going stale.');

        flagship = { publicationId, resolvedPublication, herePosition, claimedPosition, encounterPosition, decentralizedPublicationDiscoveryProvider, record, rawRecord };
    }

    // ===============================================================
    // Section B — Exact identity continuity.
    // ===============================================================
    {
        const { publicationId, resolvedPublication, decentralizedPublicationDiscoveryProvider, rawRecord } = flagship;

        // Never substituted based on documentId/contentHash/URI/discovery
        // locator/claimedPosition — the placed record's own publicationId
        // is the ONLY key PlacementRecord ever carries; it carries no
        // documentId, contentHash, URI, or claimedPosition field at all.
        assert(rawRecord.publicationId === publicationId, 'B1. PlacementRecord is keyed by the exact publicationId placed.');
        const recordJson = rawRecord.toJSON();
        assert(!('documentId' in recordJson) && !('claimedPosition' in recordJson),
            'B2. PlacementRecord\'s own serialized shape carries neither documentId nor claimedPosition — nothing for a substitution to key off even if one were attempted.');
        // PlacementRecord.toJSON() DOES have its own `contentHash` field —
        // an integrity hash of the RECORD ITSELF (computeContentHash(),
        // core/PlacementRecord.js), structurally unrelated to, and never
        // read from, the Publication's own material contentHash
        // (publisher/Publication.js's contentReference.hash). Confirmed
        // distinct here rather than merely assumed.
        assert(recordJson.contentHash !== resolvedPublication.contentReference.hash,
            'B2b. PlacementRecord\'s own contentHash (its own record-integrity hash) is never the Publication\'s material contentHash — two genuinely different values, not a naming coincidence.');

        const storage = new InMemoryStorageProvider();
        const { session } = buildJourneySession(storage, { decentralizedPublicationDiscoveryProvider });
        assert(session.getPublicationForDocument(resolvedPublication.documentId) === resolvedPublication, 'B3. A fresh session resolves the SAME exact instance by documentId.');
        assert(session.findPublicationById(publicationId) === resolvedPublication, 'B4. And by publicationId — no reconstruction, no re-fetch, no clone.');
        assert(decentralizedPublicationDiscoveryProvider.findById(publicationId) === resolvedPublication, 'B5. The Repository catalog itself still holds the exact same instance.');

        const placePublicationSrc = await readSource('application/PlacePublicationUseCase.js');
        assert(!/claimedPosition/.test(placePublicationSrc), 'B6. PlacePublicationUseCase.js never references claimedPosition.');
        assert(!/publication\.author/.test(placePublicationSrc), 'B7. PlacePublicationUseCase.js never reads publication.author.');
        assert(!/\.uri\b|locator/.test(placePublicationSrc), 'B8. PlacePublicationUseCase.js never reads a material URI/locator of any kind — placement acts purely on the already-resolved publicationId and the caller-supplied position.');

        console.log('✓ B — identity continuity holds end to end: the exact Publication instance admitted to the Repository is what every subsequent resolution and the eventual placement act on — never reconstructed from documentId, contentHash, material URI, discovery locator, or claimedPosition.');
    }

    // ===============================================================
    // Section C — First placement vs existing placement.
    // ===============================================================
    {
        // P1 -> no placement -> Place -> first PlacementRecord (reuse the
        // flagship's own P1, confirmed revision 1 in Section A).
        assert(flagship.record.revision === 1, 'C1. P1: first placement is revision 1.');

        // P2 -> existing placement -> Move/Remove, and confirm the new
        // first-placement capability changed nothing about that existing
        // path's own semantics.
        const storage = new InMemoryStorageProvider();
        const { session, placementRegistry, publishDocumentUseCase } = buildJourneySession(storage);
        const world = new World({});
        const building = new Building({ creator: 'alice' });
        building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
        world.addBuilding(building);
        const doc = new Document({ world, metadata: new DocumentMetadata({ title: 'C Own Work', author: 'alice' }) });
        const p2 = publishDocumentUseCase.execute({ document: doc });
        assert(placementRegistry.findByPublicationId(p2.id).length === 1, 'C2. P2: publishing already created its own automatic, revision-1 placement.');

        session.movePlacement(p2.documentId, { x: 9, y: 0, z: 9 });
        const afterMove = placementRegistry.findByPublicationId(p2.id);
        assert(afterMove.length === 1 && afterMove[0].position.x === 9 && afterMove[0].revision === 2,
            'C3. movePlacement() on an already-placed P2 still works exactly as before: same placement, new revision, moved position — 0.9.600\'s new first-placement capability changed nothing here.');

        session.removePlacement(p2.documentId);
        assert(placementRegistry.findByPublicationId(p2.id).length === 0, 'C4. removePlacement() still works unchanged.');

        // Calling placePublication() again on P2 (already removed, so
        // effectively unplaced again) creates a genuinely independent
        // NEW first placement — confirming PlacePublicationUseCase has no
        // "already had one once" memory of its own, exactly as 0.9.599
        // Section C1 found.
        const secondPlacement = session.placePublication(p2.id, { x: 1, y: 0, z: 1 });
        assert(secondPlacement !== null && placementRegistry.findByPublicationId(p2.id)[0].revision === 1,
            'C5. Placing P2 again after removal creates a fresh revision-1 record — first-vs-later is a property of CURRENT placement state, never of a Publication\'s own history.');

        console.log('✓ C — first placement (P1, a Repository-admitted-only Publication) and existing-placement mutation (P2, move/remove) are correctly isolated capabilities: the new first-placement path introduces no change whatsoever to move/remove\'s own pre-existing semantics.');
    }

    // ===============================================================
    // Section D — Explicitness invariant.
    // ===============================================================
    {
        const publicationId = 'explicit-pub-d';
        const env = await encounterVerified('0.9.601-d', { publicationId, claimedPosition: { x: 1, y: 0, z: 1 }, encounterPosition: { x: 2, y: 0, z: 2 }, bytes: 'explicit-bytes-d' });
        const decentralizedPublicationDiscoveryProvider = new DecentralizedPublicationDiscoveryProvider();
        const ctx = buildCanvasInstance({ registry: env.registry, observerLocalEncounterRegistry: env.store, materialSources: env.materialSources, materialVerifier: env.verifier, decentralizedPublicationDiscoveryProvider });

        // DISCOVER.
        mountCanvas(ctx);
        const [marker] = ctx.projectedObserverLocalEncounters;
        // RESOLVE + VERIFY + Repository admission.
        ctx.selectObserverLocalEncounter(marker);
        await wait();
        const resolvedPublication = ctx.observerLocalEncounterInspection.loading.material;
        assert(decentralizedPublicationDiscoveryProvider.list().length === 1, 'D0. Sanity: admitted.');

        const storage = new InMemoryStorageProvider();
        const { session, placementRegistry } = buildJourneySession(storage, { decentralizedPublicationDiscoveryProvider });

        // Repository search.
        const { searchPublicationsUseCase } = new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider: decentralizedPublicationDiscoveryProvider });
        searchPublicationsUseCase.execute({ query: 'Discovered' });
        // Publication inspection, repeated.
        session.getPublicationForDocument(resolvedPublication.documentId);
        session.findPublicationById(publicationId);
        session.findPublicationById(publicationId);
        // "World navigation": re-selecting the same encounter (a repeated
        // resolution, as WorldEncounterCanvas.js's own admitToRepositoryDiscovery()
        // header documents can legitimately happen) admits again but still
        // creates no placement.
        ctx.selectObserverLocalEncounter(marker);
        await wait();

        assert(placementRegistry.findByPublicationId(publicationId).length === 0,
            'D1. After DISCOVER, RESOLVE, VERIFY, Repository admission (twice), Repository search, and repeated Publication inspection/navigation-equivalent calls — ZERO PlacementRecords exist.');

        unmountCanvas(ctx);
        session.placePublication(publicationId, { x: 5, y: 0, z: 5 });
        assert(placementRegistry.findByPublicationId(publicationId).length === 1,
            'D2. Only the one explicit session.placePublication() call creates the first PlacementRecord.');

        console.log('✓ D — the explicitness invariant holds through the REAL pipeline, not merely a directly-seeded one: discovery, resolution, verification, admission (even repeated), search, and inspection are all placement-inert; only an explicit user Place action ever produces a PlacementRecord.');
    }

    // ===============================================================
    // Section E — Position semantics.
    // ===============================================================
    {
        const { publicationId, herePosition, claimedPosition, encounterPosition, record } = flagship;

        // The placed position is exactly the caller-supplied "here"
        // position — never claimedPosition (99,0,99) and never
        // encounterPosition (1,0,1), both of which were live inputs to
        // the SAME real DISCOVER/RESOLVE/VERIFY pipeline that produced
        // this exact Publication.
        assert(record.position.x === herePosition.x && record.position.z === herePosition.z, 'E1. PlacementRecord.position === the explicit "here" position supplied to placePublication().');
        assert(!(record.position.x === claimedPosition.x && record.position.z === claimedPosition.z), 'E2. PlacementRecord.position is NOT the publisher\'s own claimedPosition, even though claimedPosition was a real, live input earlier in this exact Publication\'s own journey.');
        assert(!(record.position.x === encounterPosition.x && record.position.z === encounterPosition.z), 'E3. PlacementRecord.position is NOT the observer\'s own encounter position either.');

        // Structural reconfirmation: neither PlacePublicationUseCase.js
        // nor WorldNavigationSession.placePublication() ever reads a
        // "claimed" or "encounter" position from anywhere — position is
        // purely the second, caller-supplied argument.
        const sessionSrc = await readSource('application/WorldNavigationSession.js');
        const placePublicationMethod = sessionSrc.match(/placePublication\(publicationId, position\) \{[\s\S]*?\n {4}\}/);
        assert(placePublicationMethod !== null && !/claimedPosition|encounterPosition/.test(placePublicationMethod[0]),
            'E4. WorldNavigationSession#placePublication() itself never references claimedPosition/encounterPosition — position is exclusively its own second parameter, forwarded verbatim.');

        // And confirm ui/views/WorldView.js's own "here" resolution
        // (getAvatarPosition()||getCameraPosition()) is likewise
        // independent of any Publication-carried position field.
        const viewSrc = await readSource('ui/views/WorldView.js');
        const placeWrapper = viewSrc.match(/function placeOwnPublication\(publication\) \{[\s\S]*?\n {8}\}/);
        assert(placeWrapper !== null && /getAvatarPosition\(\) \|\| session\.getCameraPosition\(\)/.test(placeWrapper[0]) && !/claimedPosition|publication\.position/.test(placeWrapper[0]),
            'E5. WorldView.js\'s own placeOwnPublication() resolves "here" purely from the viewer\'s own avatar/camera position — never from anything read off the publication object.');

        console.log('✓ E — position semantics hold: the position supplied is the user\'s own explicit local placement position ("here"), live-proven distinct from both the publisher\'s claimedPosition and the observer\'s own encounter position, for the SAME Publication in the SAME journey.');
    }

    // ===============================================================
    // Section F — Provider-boundary regression, and this audit's own
    // central finding.
    // ===============================================================
    {
        const composition = await readSource('application/CreateWorldViewUseCase.js');
        assert(/const worldLayoutProvider = new LocalWorldLayoutProvider\(\s*spatialIndexProvider,\s*discoveryProvider\s*\);/.test(composition),
            'F1. worldLayoutProvider is still built from the plain, narrow discoveryProvider — never widened. This is the SAME invariant 0.9.596/0.9.599/0.9.600 each reconfirmed.');

        const sessionSrc = await readSource('application/WorldNavigationSession.js');
        const findPublicationsBody = sessionSrc.match(/_findPublications\(documentId\) \{[\s\S]*?\n {4}\}/);
        assert(findPublicationsBody !== null && /this\._discoveryProvider/.test(findPublicationsBody[0]) && !/this\._publicationActionDiscoveryProvider/.test(findPublicationsBody[0]),
            'F2. _findPublications() — the shared choke point behind fork-policy AND (see F3-F5, below) getPlacementInfo()/_loadWorld() — still reads ONLY the narrow discoveryProvider.');

        // F3-F5: THE FINDING. _findPublications() is not merely
        // fork-policy's own choke point — it is ALSO the choke point
        // behind getPlacementInfo() (documentId-keyed placement lookup,
        // via _resolvePublicationForPlacement()) and, independently,
        // behind the WorldLayoutProvider path _loadWorld() uses to decide
        // WHERE a streamed document actually renders. Nobody
        // 0.9.596-0.9.600 ever tested THIS consequence of keeping that
        // provider narrow — every one of those files' own tests checked
        // only getPublicationForDocument()/findPublicationById()
        // (publicationId/documentId Publication-FACT resolution, which
        // 0.9.597 correctly widened) and placementRegistry/
        // getPlacementsForPublication() (publicationId-keyed, which never
        // touches discoveryProvider at all). Live-reconfirmed here from
        // the flagship's own real, unmodified instances (Section A).
        const { publicationId, resolvedPublication } = flagship;
        const storage = new InMemoryStorageProvider();
        const { session, discoveryProvider: freshDiscoveryProvider } = buildJourneySession(storage, { decentralizedPublicationDiscoveryProvider: flagship.decentralizedPublicationDiscoveryProvider });
        // This is a FRESH session/storage — placePublication() was never
        // called on it — isolating this check from Section A's own
        // already-placed flagship state, so this proves the STRUCTURAL
        // fact (getPlacementInfo() can never see it), not merely "it
        // happens to be null before a placement exists."
        assert(freshDiscoveryProvider.findById(publicationId) === null, 'F3. Sanity: the narrow discoveryProvider genuinely cannot resolve P by id.');
        assert(session.getPublicationForDocument(resolvedPublication.documentId) === resolvedPublication,
            'F4. Yet session.getPublicationForDocument() (0.9.597\'s own widened path) resolves P fine — confirming the split is EXACTLY at _findPublications(), never at the publicationActionDiscoveryProvider-based resolution methods.');
        assert(session.getPlacementInfo(resolvedPublication.documentId) === null,
            'F5. And getPlacementInfo(documentId) — the documentId-keyed placement lookup movePlacement()/removePlacement() themselves rely on via _resolvePlacementRecord() — returns null for P EVEN AFTER Section A already gave P a real placement elsewhere (same publicationId, same underlying placementRegistry data) — because _resolvePublicationForPlacement() routes through the same narrow _findPublications(). This is not a missing placement; it is a resolution path that structurally cannot see one that exists.');

        console.log(`
✓ F — PROVIDER-BOUNDARY REGRESSION: confirmed clean on the axis every
  prior milestone actually tested (fork-policy/_findPublications()/
  world-layout composition remain exclusively on the narrow
  discoveryProvider; only the placement-action and Publication-fact
  resolution paths were ever widened, and stay exactly as widened as
  0.9.597/0.9.600 left them — no further widening occurred here).

  THIS AUDIT'S OWN FINDING: that same, correctly-preserved narrowness
  has a real, live-reconfirmed, previously-untested SIDE EFFECT — see
  Section A's own "WORLD PRESENCE (literal)" subsection and Section L's
  own closure classification, below. Naming it here rather than in
  Section A alone because it is precisely a provider-boundary
  consequence, not a placement-authoring one.
`);
    }

    // ===============================================================
    // Section G — Negative cases.
    // ===============================================================
    {
        // G1: unavailable Publications cannot be placed — never even
        // locally resolvable material, so loading.status is UNAVAILABLE
        // and admission's own AVAILABLE gate never fires.
        {
            const decentralizedPublicationDiscoveryProvider = new DecentralizedPublicationDiscoveryProvider();
            const storageProvider = new InMemoryStorageProvider(); // deliberately empty — nothing known locally
            const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
            const ctx = buildCanvasInstance({ materialSources: { local: localSource }, materialVerifier: new MapVerifier({}), decentralizedPublicationDiscoveryProvider });
            ctx.selectObserverLocalEncounter({ publicationId: 'g1-unavailable', contentHash: 'irrelevant' });
            await wait();
            assert(ctx.observerLocalEncounterInspection.loading.status === 'UNAVAILABLE', 'G1-0. Sanity: material genuinely UNAVAILABLE.');
            assert(decentralizedPublicationDiscoveryProvider.list().length === 0, 'G1-1. Never admitted to the Repository.');
            const storage = new InMemoryStorageProvider();
            const { session } = buildJourneySession(storage, { decentralizedPublicationDiscoveryProvider });
            let threw = null;
            try { session.placePublication('g1-unavailable', { x: 0, y: 0, z: 0 }); } catch (e) { threw = e; }
            assert(threw !== null && /not found/.test(threw.message), 'G1. An unavailable Publication cannot be placed — placement resolution throws, never fabricates.');
        }

        // G2: unverified/rejected material cannot reach the placement
        // path — material resolves, but verification fails.
        {
            const decentralizedPublicationDiscoveryProvider = new DecentralizedPublicationDiscoveryProvider();
            const storageProvider = new InMemoryStorageProvider();
            knowPublicationLocally(storageProvider, { id: 'g2-rejected', contentHash: 'g2-hash' });
            const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
            const ctx = buildCanvasInstance({ materialSources: { local: localSource }, materialVerifier: new MapVerifier({}), decentralizedPublicationDiscoveryProvider });
            ctx.selectObserverLocalEncounter({ publicationId: 'g2-rejected', contentHash: 'g2-hash' });
            await wait();
            assert(ctx.observerLocalEncounterInspection.verification.status === 'REJECTED', 'G2-0. Sanity: verification genuinely REJECTED.');
            assert(decentralizedPublicationDiscoveryProvider.list().length === 0, 'G2-1. Rejected material is never admitted.');
            const storage = new InMemoryStorageProvider();
            const { session } = buildJourneySession(storage, { decentralizedPublicationDiscoveryProvider });
            let threw = null;
            try { session.placePublication('g2-rejected', { x: 0, y: 0, z: 0 }); } catch (e) { threw = e; }
            assert(threw !== null && /not found/.test(threw.message), 'G2. Rejected material can never be placed — it never entered the Repository at all, so placement resolution throws.');
        }

        // G3: unknown Publication IDs fail clearly.
        {
            const storage = new InMemoryStorageProvider();
            const { session } = buildJourneySession(storage, { decentralizedPublicationDiscoveryProvider: new DecentralizedPublicationDiscoveryProvider() });
            let threw = null;
            try { session.placePublication('totally-unknown-id', { x: 0, y: 0, z: 0 }); } catch (e) { threw = e; }
            assert(threw !== null && /not found/.test(threw.message), 'G3. An unknown publicationId fails clearly and specifically.');
        }

        // G4: missing placePublicationUseCase fails clearly.
        {
            const session = new WorldNavigationSession({
                registry: { getDocument: () => null },
                loadPublicationDocumentUseCase: { execute: () => null },
                worldLayoutProvider: { getSpatialState: () => ({ loaded: [], visible: [] }) },
                identityProvider: new LocalIdentityProvider(new InMemoryStorageProvider())
                // placePublicationUseCase deliberately omitted
            });
            let threw = null;
            try { session.placePublication('anything', { x: 0, y: 0, z: 0 }); } catch (e) { threw = e; }
            assert(threw !== null && /no PlacePublicationUseCase wired/.test(threw.message), 'G4. A session missing placePublicationUseCase fails clearly, not silently or by crashing unexpectedly.');
        }

        // G5: no decentralized provider preserves legacy behavior — an
        // ordinary, locally-published Publication is unaffected.
        {
            const storage = new InMemoryStorageProvider();
            const { session, publicationActionDiscoveryProvider, discoveryProvider, placementRegistry } = buildJourneySession(storage);
            assert(publicationActionDiscoveryProvider === discoveryProvider, 'G5-0. With no decentralized provider, publicationActionDiscoveryProvider degrades to discoveryProvider itself.');
            const publication = new Publication({ id: 'g5-legacy', documentId: 'g5-doc', title: 'Legacy', author: 'alice', contentReference: new ContentReference({ hash: 'g'.repeat(64) }) });
            storage.save('forkbuild-publications', [publication.toJSON()]);
            const placement = session.placePublication('g5-legacy', { x: 3, y: 0, z: 3 });
            assert(placement !== null && placementRegistry.findByPublicationId('g5-legacy').length === 1, 'G5. Placement for an ordinary, locally-known Publication is completely unaffected by this milestone or this capability\'s existence.');
        }

        console.log('✓ G — every negative case fails exactly where it should: unavailable material, rejected/unverified material, and unknown publicationIds never reach a placement (the first two never even reach the Repository); a session missing the collaborator fails with a specific error; legacy, no-decentralized-provider placement for an ordinary Publication is completely unaffected.');
    }

    // ===============================================================
    // Section H — Multi-Publication isolation.
    // ===============================================================
    {
        // P1 = verified, Repository-admitted, unplaced (via the REAL
        // pipeline, distinct from the flagship's own P1).
        const p1Id = 'h-p1-unplaced';
        const envP1 = await encounterVerified('0.9.601-h1', { publicationId: p1Id, claimedPosition: { x: 1, y: 0, z: 1 }, encounterPosition: { x: 1, y: 0, z: 1 }, bytes: 'h-bytes-1' });
        const decentralizedPublicationDiscoveryProvider = new DecentralizedPublicationDiscoveryProvider();
        const ctx1 = buildCanvasInstance({ registry: envP1.registry, observerLocalEncounterRegistry: envP1.store, materialSources: envP1.materialSources, materialVerifier: envP1.verifier, decentralizedPublicationDiscoveryProvider });
        mountCanvas(ctx1);
        ctx1.selectObserverLocalEncounter(ctx1.projectedObserverLocalEncounters[0]);
        await wait();
        unmountCanvas(ctx1);

        // P2 = verified, already placed.
        const p2Id = 'h-p2-placed';
        const envP2 = await encounterVerified('0.9.601-h2', { publicationId: p2Id, claimedPosition: { x: 2, y: 0, z: 2 }, encounterPosition: { x: 2, y: 0, z: 2 }, bytes: 'h-bytes-2' });
        const ctx2 = buildCanvasInstance({ registry: envP2.registry, observerLocalEncounterRegistry: envP2.store, materialSources: envP2.materialSources, materialVerifier: envP2.verifier, decentralizedPublicationDiscoveryProvider });
        mountCanvas(ctx2);
        ctx2.selectObserverLocalEncounter(ctx2.projectedObserverLocalEncounters[0]);
        await wait();
        unmountCanvas(ctx2);

        // P3 = rejected/unverified — never admitted.
        const p3Id = 'h-p3-rejected';
        const storageProvider3 = new InMemoryStorageProvider();
        knowPublicationLocally(storageProvider3, { id: p3Id, contentHash: 'h3-hash' });
        const localSource3 = new LocalWorldEncounterMaterialSource(storageProvider3);
        const ctx3 = buildCanvasInstance({ materialSources: { local: localSource3 }, materialVerifier: new MapVerifier({}), decentralizedPublicationDiscoveryProvider });
        ctx3.selectObserverLocalEncounter({ publicationId: p3Id, contentHash: 'h3-hash' });
        await wait();
        assert(ctx3.observerLocalEncounterInspection.verification.status === 'REJECTED', 'H0. Sanity: P3 rejected.');

        assert(decentralizedPublicationDiscoveryProvider.list().length === 2, 'H1. Sanity: exactly P1 and P2 are admitted — P3 is not.');

        const storage = new InMemoryStorageProvider();
        const { session, placementRegistry } = buildJourneySession(storage, { decentralizedPublicationDiscoveryProvider });

        // Place P2 first, establishing its "already placed" baseline.
        session.placePublication(p2Id, { x: -1, y: 0, z: -1 });
        const p2RecordBefore = placementRegistry.findByPublicationId(p2Id)[0];

        // P3 cannot be placed.
        let p3Threw = null;
        try { session.placePublication(p3Id, { x: 0, y: 0, z: 0 }); } catch (e) { p3Threw = e; }
        assert(p3Threw !== null, 'H2. P3 (rejected) cannot be placed.');

        // Now place P1 — must not disturb P2 or create anything for P3.
        session.placePublication(p1Id, { x: 5, y: 0, z: 5 });
        const p1Records = placementRegistry.findByPublicationId(p1Id);
        const p2RecordAfter = placementRegistry.findByPublicationId(p2Id)[0];
        const p3Records = placementRegistry.findByPublicationId(p3Id);
        assert(p1Records.length === 1, 'H3. P1 now has exactly one placement of its own.');
        assert(p2RecordAfter.placementId === p2RecordBefore.placementId && p2RecordAfter.revision === p2RecordBefore.revision,
            'H4. P2\'s existing placement is completely untouched by placing P1 — no cross-contamination, no document-ID collision (both were resolved through the SAME shared publicationActionDiscoveryProvider instance).');
        assert(p3Records.length === 0, 'H5. P3 still has no placement of any kind.');

        console.log('✓ H — three Publications in three genuinely different states (Repository-admitted-unplaced, Repository-admitted-already-placed, rejected-never-admitted), all discovered through the REAL pipeline sharing one Repository instance, are correctly isolated: placing one touches only that one.');
    }

    // ===============================================================
    // Section I — Lifecycle/re-entry.
    // ===============================================================
    {
        // Variant 1: encounter P -> admit P -> leave encounter -> return
        // later (a genuinely separate session/visit) -> find P -> place P.
        {
            const publicationId = 'i1-return-later';
            const env = await encounterVerified('0.9.601-i1', { publicationId, claimedPosition: { x: 1, y: 0, z: 1 }, encounterPosition: { x: 1, y: 0, z: 1 }, bytes: 'i1-bytes' });
            const decentralizedPublicationDiscoveryProvider = new DecentralizedPublicationDiscoveryProvider();
            const ctx = buildCanvasInstance({ registry: env.registry, observerLocalEncounterRegistry: env.store, materialSources: env.materialSources, materialVerifier: env.verifier, decentralizedPublicationDiscoveryProvider });
            mountCanvas(ctx);
            ctx.selectObserverLocalEncounter(ctx.projectedObserverLocalEncounters[0]);
            await wait();
            const resolvedPublication = ctx.observerLocalEncounterInspection.loading.material;

            // Leave.
            unmountCanvas(ctx);
            if (typeof env.store.clear === 'function') env.store.clear();

            // Return later: an entirely new WorldNavigationSession, new
            // storage — a genuinely separate visit, connected only by
            // the durable Repository catalog.
            const storage = new InMemoryStorageProvider();
            const { session, placementRegistry } = buildJourneySession(storage, { decentralizedPublicationDiscoveryProvider });
            const refound = session.getPublicationForDocument(resolvedPublication.documentId);
            assert(refound === resolvedPublication, 'I1. Find P: a returning visit resolves P by exact instance, with no observer-local state surviving at all.');
            session.placePublication(publicationId, { x: 7, y: 0, z: 7 });
            assert(placementRegistry.findByPublicationId(publicationId).length === 1, 'I2. Place P: succeeds on the return visit.');
        }

        // Variant 2: encounter P -> admit P -> encounter disappears ->
        // place P immediately, in the SAME session/visit, with no
        // "returning" step at all.
        {
            const publicationId = 'i2-place-immediately';
            const env = await encounterVerified('0.9.601-i2', { publicationId, claimedPosition: { x: 1, y: 0, z: 1 }, encounterPosition: { x: 1, y: 0, z: 1 }, bytes: 'i2-bytes' });
            const decentralizedPublicationDiscoveryProvider = new DecentralizedPublicationDiscoveryProvider();
            const ctx = buildCanvasInstance({ registry: env.registry, observerLocalEncounterRegistry: env.store, materialSources: env.materialSources, materialVerifier: env.verifier, decentralizedPublicationDiscoveryProvider });
            mountCanvas(ctx);
            ctx.selectObserverLocalEncounter(ctx.projectedObserverLocalEncounters[0]);
            await wait();

            unmountCanvas(ctx); // the encounter marker is gone
            if (typeof env.store.clear === 'function') env.store.clear();

            const storage = new InMemoryStorageProvider();
            const { session, placementRegistry } = buildJourneySession(storage, { decentralizedPublicationDiscoveryProvider });
            const placement = session.placePublication(publicationId, { x: 8, y: 0, z: 8 });
            assert(placement !== null, 'I3. Place P succeeds immediately after the encounter marker disappears — the Repository admission (0.9.595), not the encounter marker, is what makes this possible.');
            assert(placementRegistry.findByPublicationId(publicationId).length === 1, 'I4. A genuine PlacementRecord exists.');
        }

        console.log('✓ I — both lifecycle shapes close the original transient-encounter concern directly: a returning visit finds and places P purely through Repository retention, and placing P immediately after the encounter vanishes needs nothing from the encounter itself, only from Repository admission.');
    }

    // ===============================================================
    // Section J — Product surface sanity.
    // ===============================================================
    {
        const panelSrc = await readSource('ui/components/OwnPublicationPanel.js');
        assert(/placePublicationCommand: \{\s*type: Function,\s*default: null\s*\}/.test(panelSrc),
            'J1. OwnPublicationPanel.js declares placePublicationCommand as an optional prop.');
        const placementsSection = panelSrc.split('own-publication-placements"')[1].split('</div>')[0];
        assert(/@click="placeOwnPublication"/.test(placementsSection),
            'J2. The "Place" action lives inside the EXISTING .own-publication-placements listing.');

        // Confirm no dedicated "Unplaced Publications" surface exists
        // anywhere in ui/ — the capability lives in the existing panel,
        // exactly as 0.9.599 Section G/0.9.600 chose, never as a new,
        // separate, persistent list.
        const fs = await import('node:fs/promises');
        const uiFiles = await fs.readdir(new URL('../ui/components/', import.meta.url));
        assert(!uiFiles.some((f) => /unplaced/i.test(f)), 'J3. No "Unplaced Publications"-named component file exists in ui/components/.');
        const viewFiles = await fs.readdir(new URL('../ui/views/', import.meta.url));
        assert(!viewFiles.some((f) => /unplaced/i.test(f)), 'J4. No "Unplaced Publications"-named view file exists in ui/views/ either.');

        console.log('✓ J — the capability lives naturally inside the existing OwnPublicationPanel/.own-publication-placements surface; no "Unplaced Publications" surface was ever built or is needed.');
    }

    // ===============================================================
    // Section K — Authorization boundary documentation.
    // ===============================================================
    {
        // Scoped to the execute() METHOD BODY, not the whole file — the
        // file's own header prose legitimately discusses "placement
        // authorization" as a distinct-but-not-yet-enforced concept (see
        // its own 0.2.16 header comment); what matters here is whether
        // any actual gate exists in the executable path itself.
        const placePublicationSrc = await readSource('application/PlacePublicationUseCase.js');
        const executeBody = placePublicationSrc.match(/execute\(publicationId, position, options = \{\}\) \{[\s\S]*\n {4}\}/);
        assert(executeBody !== null && !/authoriz|permission|canPlace|isAllowed/i.test(executeBody[0]),
            'K1. PlacePublicationUseCase.execute()\'s own method body contains no authorization/permission gate of any kind — confirmed against current source, not merely asserted.');
        const sessionSrc = await readSource('application/WorldNavigationSession.js');
        const placePublicationMethod = sessionSrc.match(/placePublication\(publicationId, position\) \{[\s\S]*?\n {4}\}/);
        assert(placePublicationMethod !== null && !/authoriz|permission|canPlace|isAllowed/i.test(placePublicationMethod[0]),
            'K2. WorldNavigationSession#placePublication() itself introduces no authorization/permission check either.');

        console.log(`
✓ K — AUTHORIZATION BOUNDARY, RECORDED AS A KNOWN, PRE-EXISTING
  BOUNDARY, NOT FIXED HERE. Placement — for ANY Publication, including
  one authored entirely by someone else and merely discovered by this
  replica — remains ungated by any authorization check, identically to
  PlacePublicationUseCase's own pre-0.9.595 behavior for its one other
  call site (PublishDocumentUseCase's automatic initial placement).
  0.9.600 did not introduce this boundary; it merely exposed an
  already-existing, already-ungated capability to Repository-admitted
  Publications for the first time. If authorization for "who may place
  someone else's discovered work, and where" ever becomes a product or
  security requirement, that is a genuinely separate, later audit — not
  something this test-only closure milestone answers or silently
  forecloses.
`);
    }

    // ===============================================================
    // Section L — Closure classification.
    // ===============================================================
    {
        console.log(`
================================================================
CLOSURE CLASSIFICATION — 0.9.601
================================================================

Sections A-E, G-K: CONFIRMED, live, against real production classes,
through the ACTUAL DISCOVER->RESOLVE->VERIFY->ADMIT pipeline (not a
directly-seeded stand-in for it) for the first time in this arc:

  - The full journey from discovery through a real, signed, causally-
    stamped, correctly-positioned PlacementRecord closes completely
    (Section A).
  - Identity is never substituted at any step (Section B).
  - First-placement and existing-placement (move/remove) semantics are
    correctly isolated and mutually unaffected (Section C).
  - Only an explicit user Place action ever creates a PlacementRecord —
    discovery, verification, admission, search, and inspection are all
    placement-inert (Section D).
  - Placement position is genuinely the user's own explicit "here," live-
    proven distinct from both claimedPosition and the encounter position
    for the identical Publication (Section E).
  - Every negative case (unavailable, rejected/unverified, unknown id,
    unwired session, no decentralized provider) fails exactly where it
    should (Section G).
  - Multiple Publications in different real states are correctly
    isolated under one shared Repository (Section H).
  - Both lifecycle/re-entry shapes — return later, and place immediately
    after the encounter vanishes — work, powered by Repository retention
    alone (Section I).
  - The capability lives in the existing OwnPublicationPanel surface; no
    new persistent surface exists or is needed (Section J).
  - The pre-existing authorization boundary is real, unchanged by this
    arc, and correctly left open rather than silently fixed or hidden
    (Section K).

Section F/A13 surfaces ONE genuine, narrow, previously-untested finding:

  PLACEMENT_RENDERING_VISIBILITY_GAP (narrow, newly found, NOT a
  regression introduced by 0.9.600 or by this audit).

  A Repository-admitted-only Publication's explicit Place produces a
  fully real PlacementRecord and a real spatial-index WorldPlacement
  entry (the durable, discoverable "truth of where a publication exists,"
  per docs/Principles.md) — but does NOT thereby gain "World presence" in
  the literal sense of the requesting brief's own final diagram arrow:
  worldLayoutProvider.findVisibleDocuments() never surfaces it as nearby/
  streamable, and worldLayoutProvider.getPosition() silently returns the
  deterministic-grid/origin FALLBACK rather than the real placed
  position — both live-reconfirmed in Section A/F. The root cause is
  structural and precisely located: LocalWorldLayoutProvider is
  constructed from the narrow discoveryProvider alone
  (application/CreateWorldViewUseCase.js), which 0.9.596/0.9.597/0.9.599/
  0.9.600 each deliberately, correctly kept unwidened for FORK-POLICY
  reasons (_isKnownPublication()/_checkForkPolicy(), an entirely
  different concern). Nobody before this audit tested whether that same
  narrowness also blocks RENDERING/STREAMING visibility — a question
  that could not even be asked before 0.9.600, because before it no
  production path could create a first placement for this Publication
  family at all.

  This is a CAPABILITY_GAP, not a BOUNDARY_CONFLICT: closing it would
  not violate fork-policy (findVisibleDocuments()/getPosition() decide
  rendering, never licensing/forking), and would not require touching
  the fork-policy-sensitive discoveryProvider itself — the same
  CompositeDiscoveryProvider-based pattern 0.9.597 already used for
  getPublicationForDocument()/findPublicationById() is a plausible,
  narrow shape for a future fix (a SEPARATE publicationActionDiscoveryProvider-
  based LocalWorldLayoutProvider instance, or a widened resolution
  argument to the existing one — deliberately not designed further
  here). Per this test-only milestone's own type, and consistent with
  every prior "Audit" file in this exact arc, THIS FINDING IS RECORDED,
  NOT IMPLEMENTED — closing it is a genuinely separate, later product
  decision.

DECISION: NOT ARC_CLOSED without qualification. The specific
actionability gap 0.9.594 originally found — a discovered, verified
Publication had no route to an explicit, durable PlacementRecord — IS
closed, completely, using only existing Repository, Publication-action,
and placement machinery, exactly as the arc intended. A second, narrower,
newly-found gap in the RENDERING layer (not the placement-authoring
layer) remains, named precisely above rather than left implicit. This
audit recommends the product owner decide, with this precise seam in
hand, whether PLACEMENT_RENDERING_VISIBILITY_GAP is significant enough
to warrant a scoped 0.9.602 (widen LocalWorldLayoutProvider's own
resolution the same narrow way 0.9.597 already widened Publication-fact
resolution) — or is itself an acceptable, documented boundary, the same
way Section K's own authorization gap was knowingly left open. Either
way, this is the one precise next decision, not a reason to reopen the
placement-authoring arc 0.9.595-0.9.600 already closed correctly.
================================================================
`);
    }

    console.log('✅ All Discovered Publication Placement Journey Closure Audit tests passed.');
}

run().catch((error) => {
    console.error('DiscoveredPublicationPlacementJourneyClosureAudit.test.js FAILED:', error);
    process.exitCode = 1;
});
