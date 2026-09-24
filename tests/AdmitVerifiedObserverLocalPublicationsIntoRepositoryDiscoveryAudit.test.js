import { AutomaticSnapshotEncounterCascade } from '../application/snapshot/AutomaticSnapshotEncounterCascade.js';
import { SnapshotWorldPlacementOutcome } from '../application/snapshot/placement/SnapshotWorldPlacementOutcome.js';
import { composeDiscoverSnapshotRuntime } from '../application/snapshot/DiscoverSnapshotRuntimeComposition.js';
import { executeDiscoverSnapshotCandidatesCommand } from '../application/snapshot/DiscoverSnapshotCandidatesCommand.js';
import { executeResolveSelectedSnapshotCommand } from '../application/snapshot/ResolveSelectedSnapshotCommand.js';
import { executeMaterializeSelectedSnapshotCommand } from '../application/snapshot/materialization/MaterializeSelectedSnapshotCommand.js';
import { MaterializeSnapshotFromSelectedCandidateUseCase } from '../application/snapshot/materialization/MaterializeSnapshotFromSelectedCandidateUseCase.js';
import { StoreSnapshotContentUseCase } from '../application/snapshot/materialization/StoreSnapshotContentUseCase.js';
import { NostrSnapshotDiscoveryPublisher } from '../application/nostr/NostrSnapshotDiscoveryPublisher.js';
import { WorldDiscoverySourceRegistry } from '../application/discovery/WorldDiscoverySourceRegistry.js';
import { ObserverLocalEncounterStore } from '../application/worldEncounter/ObserverLocalEncounterStore.js';
import { LocalWorldEncounterMaterialSource } from '../application/worldEncounter/LocalWorldEncounterMaterialSource.js';
import { DecentralizedPublicationDiscoveryProvider } from '../discovery/DecentralizedPublicationDiscoveryProvider.js';
import { SearchPublicationsUseCase } from '../application/publication/SearchPublicationsUseCase.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
import { ContentReference } from '../core/ContentReference.js';
import { Publication } from '../publisher/Publication.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { WorldNavigationSession } from '../application/world/WorldNavigationSession.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalWorldLayoutProvider } from '../world-layout/LocalWorldLayoutProvider.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LoadPublicationDocumentUseCase } from '../application/publication/LoadPublicationDocumentUseCase.js';
import { SaveDocumentUseCase } from '../application/document/SaveDocumentUseCase.js';
import { PublishDocumentUseCase } from '../application/publication/PublishDocumentUseCase.js';
import { DocumentCloneService } from '../application/document/DocumentCloneService.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { readFile } from 'node:fs/promises';
import { worldEncounterCanvasFiles, worldViewFiles } from './support/SourceFileGroups.js';

// 0.9.595 — Admit Verified Observer-Local Publications into Repository
// Discovery — dedicated flagship audit.
//
// TYPE: production implementation milestone. Modified: exactly one
// production file, ui/components/WorldEncounterCanvas.js — one new call,
// `this.admitToRepositoryDiscovery(result.loading, result.verification)`,
// added inside the existing `refreshObserverLocalEncounterInspection()`'s
// own `.then()` callback, mirroring `refreshMaterialInspection()`'s
// identical, unmodified call (0.9.474) verbatim. See that file's own
// "0.9.595" header for the full design rationale.
//
// 0.9.594's own audit (Discovered-Unplaced Publication Actionability
// Product Boundary Audit) found CONTINUITY_GAP_CONFIRMED and recommended
// exactly this remedy. This file is the dedicated, narrow flagship proof
// of what that remedy actually delivers — and, honestly, what it does
// NOT — reusing the SAME real harness (makeHost/makeCascade/
// placeAndAnnounce) tests/ObserverLocalEncounterInspectionCapability.test.js
// (0.9.554) already established for exercising a genuine observer-local
// encounter end to end.
//
// SECTIONS.
//   A. Flagship — a real, novel, observer-local encounter, resolved and
//      verified, is admitted into the app-wide Repository catalog.
//   B. Gate correctness — the SAME AVAILABLE+VERIFIED gate excludes
//      UNVERIFIABLE, REJECTED, and UNAVAILABLE, exactly as it always has.
//   C. Exact identity — the admitted object is the literal (===) instance
//      resolved, never reconstructed from contentHash/locator/position/
//      claimedPosition/announcement id.
//   D. Repository visibility — SearchPublicationsUseCase finds it.
//   E. claimedPosition remains inert, and no PlacementRecord is ever
//      created by admission alone.
//   F. Ghost suppression (0.9.570/0.9.571) is unaffected by admission.
//   G. Failure isolation — a misbehaving provider never breaks resolution.
//   H. No duplicate mechanism — one admission method, three callers.
//   I. THE KNOWN, HONEST LIMIT — live-proven: admission does NOT, by
//      itself, make OwnPublicationPanel resolve the Publication, because
//      WorldNavigationSession's own discoveryProvider is a structurally
//      separate instance. Never silently assumed — see
//      ui/components/WorldEncounterCanvas.js's own "0.9.595" header, "A
//      KNOWN, PRE-EXISTING LIMIT."
//   J. Production scope guard — exactly one production file references
//      the new call.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function wait(ms = 0) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

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
        placeAt(publicationId, position, owner = 'alice') {
            placementRegistry.add(new PlacementRecord({ publicationId, position, owner }));
        },
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

async function run() {
    console.log('Running Admit Verified Observer-Local Publications Into Repository Discovery flagship audit...\n');

    // ===============================================================
    // Section A — Flagship: a real, novel, observer-local encounter,
    // resolved and verified, is admitted into the app-wide catalog.
    // ===============================================================
    {
        const publicationId = 'flagship-pub-a';
        const env = await encounterVerified('0.9.595-a', { publicationId, claimedPosition: { x: 500, y: 0, z: 500 }, encounterPosition: { x: 1, y: 0, z: 1 }, bytes: 'flagship-bytes-a' });
        const decentralizedPublicationDiscoveryProvider = new DecentralizedPublicationDiscoveryProvider();
        const ctx = buildCanvasInstance({ registry: env.registry, observerLocalEncounterRegistry: env.store, materialSources: env.materialSources, materialVerifier: env.verifier, decentralizedPublicationDiscoveryProvider });
        mountCanvas(ctx);
        const [marker] = ctx.projectedObserverLocalEncounters;
        assert(marker && marker.publicationId === publicationId, 'A1. Sanity: the marker carries the real publicationId.');
        ctx.selectObserverLocalEncounter(marker);
        await wait();
        assert(ctx.observerLocalEncounterInspection.verification.status === 'VERIFIED', 'A2. Sanity: a genuine, VERIFIED resolution.');
        assert(decentralizedPublicationDiscoveryProvider.list().length === 1, 'A3. Exactly one Publication was admitted into the app-wide catalog.');
        assert(decentralizedPublicationDiscoveryProvider.findById(publicationId) !== null, 'A4. It is findable by id, on the real, unmodified DecentralizedPublicationDiscoveryProvider.');
        unmountCanvas(ctx);
        console.log('✓ A — a real, novel, observer-local encounter, once resolved AVAILABLE + VERIFIED, is admitted into the app-wide Repository catalog.');
    }

    // ===============================================================
    // Section B — Gate correctness: UNVERIFIABLE/REJECTED/UNAVAILABLE
    // all remain excluded, exactly as the gate always required.
    // ===============================================================
    {
        // B1: REJECTED (verifier rejects).
        {
            const publicationId = 'gate-pub-rejected';
            const contentHash = 'gate-hash-rejected';
            const storageProvider = new InMemoryStorageProvider();
            knowPublicationLocally(storageProvider, { id: publicationId, contentHash });
            const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
            const decentralizedPublicationDiscoveryProvider = new DecentralizedPublicationDiscoveryProvider();
            const ctx = buildCanvasInstance({ materialSources: { local: localSource }, materialVerifier: new MapVerifier({}), decentralizedPublicationDiscoveryProvider });
            ctx.selectObserverLocalEncounter({ publicationId, contentHash });
            await wait();
            assert(ctx.observerLocalEncounterInspection.verification.status === 'REJECTED', 'B1-0. Sanity: REJECTED.');
            assert(decentralizedPublicationDiscoveryProvider.list().length === 0, 'B1. A REJECTED resolution is never admitted.');
        }
        // B2: UNVERIFIABLE (no verifier injected at all).
        {
            const publicationId = 'gate-pub-unverifiable';
            const contentHash = 'gate-hash-unverifiable';
            const storageProvider = new InMemoryStorageProvider();
            knowPublicationLocally(storageProvider, { id: publicationId, contentHash });
            const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
            const decentralizedPublicationDiscoveryProvider = new DecentralizedPublicationDiscoveryProvider();
            const ctx = buildCanvasInstance({ materialSources: { local: localSource }, materialVerifier: null, decentralizedPublicationDiscoveryProvider });
            ctx.selectObserverLocalEncounter({ publicationId, contentHash });
            await wait();
            assert(ctx.observerLocalEncounterInspection.verification.status === 'UNVERIFIABLE', 'B2-0. Sanity: UNVERIFIABLE.');
            assert(decentralizedPublicationDiscoveryProvider.list().length === 0, 'B2. An UNVERIFIABLE resolution is never admitted.');
        }
        // B3: UNAVAILABLE (material never found).
        {
            const publicationId = 'gate-pub-unavailable';
            const decentralizedPublicationDiscoveryProvider = new DecentralizedPublicationDiscoveryProvider();
            const emptyStorage = new InMemoryStorageProvider();
            const localSource = new LocalWorldEncounterMaterialSource(emptyStorage);
            const ctx = buildCanvasInstance({ materialSources: { local: localSource }, materialVerifier: new MapVerifier({ [publicationId]: true }), decentralizedPublicationDiscoveryProvider });
            ctx.selectObserverLocalEncounter({ publicationId, contentHash: 'irrelevant-hash' });
            await wait();
            assert(ctx.observerLocalEncounterInspection.loading.status === 'UNAVAILABLE', 'B3-0. Sanity: UNAVAILABLE.');
            assert(decentralizedPublicationDiscoveryProvider.list().length === 0, 'B3. An UNAVAILABLE resolution is never admitted.');
        }
        console.log('✓ B — the AVAILABLE+VERIFIED gate excludes REJECTED, UNVERIFIABLE, and UNAVAILABLE resolutions, exactly as admitToRepositoryDiscovery() always required — unweakened by this milestone.');
    }

    // ===============================================================
    // Section C — Exact identity: never reconstructed.
    // ===============================================================
    {
        const publicationId = 'identity-pub-c';
        const contentHash = 'identity-hash-c';
        const maliciousClaim = { x: 77777, y: 0, z: 77777 };
        const storageProvider = new InMemoryStorageProvider();
        knowPublicationLocally(storageProvider, { id: publicationId, documentId: 'identity-doc-c', contentHash });
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const decentralizedPublicationDiscoveryProvider = new DecentralizedPublicationDiscoveryProvider();
        const ctx = buildCanvasInstance({ materialSources: { local: localSource }, materialVerifier: new MapVerifier({ [publicationId]: true }), decentralizedPublicationDiscoveryProvider });
        ctx.selectObserverLocalEncounter({ publicationId, contentHash, claimedPosition: maliciousClaim });
        await wait();
        const resolvedMaterial = ctx.observerLocalEncounterInspection.loading.material;
        assert(resolvedMaterial instanceof Publication, 'C1. Sanity: a real Publication instance resolved.');
        const admitted = decentralizedPublicationDiscoveryProvider.findById(publicationId);
        assert(admitted === resolvedMaterial, 'C2. The admitted object is the LITERAL (===) instance the inspection resolved — never reconstructed from contentHash, locator, position, claimedPosition, or announcement id.');
        assert(admitted.documentId === 'identity-doc-c', 'C3. documentId survives intact, unmodified.');
        console.log('✓ C — the admitted object is the exact resolved Publication instance, never rebuilt from any partial identity fact, and claimedPosition (even adversarial) never substitutes for or contaminates it.');
    }

    // ===============================================================
    // Section D — Repository visibility.
    // ===============================================================
    {
        const publicationId = 'search-pub-d';
        const contentHash = 'search-hash-d';
        const storageProvider = new InMemoryStorageProvider();
        knowPublicationLocally(storageProvider, { id: publicationId, documentId: 'search-doc-d', title: 'Findable By Search', author: 'bob', contentHash });
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const decentralizedPublicationDiscoveryProvider = new DecentralizedPublicationDiscoveryProvider();
        const ctx = buildCanvasInstance({ materialSources: { local: localSource }, materialVerifier: new MapVerifier({ [publicationId]: true }), decentralizedPublicationDiscoveryProvider });
        ctx.selectObserverLocalEncounter({ publicationId, contentHash });
        await wait();
        const searchUseCase = new SearchPublicationsUseCase(decentralizedPublicationDiscoveryProvider);
        assert(searchUseCase.execute({ text: 'Findable' }).items.some((i) => i.id === publicationId), 'D1. Repository\'s own real, unmodified SearchPublicationsUseCase finds this Publication by text.');
        assert(!searchUseCase.execute({ text: 'No Such Title' }).items.some((i) => i.id === publicationId), 'D1b. ...and a non-matching text search excludes it, so D1 really exercises the text filter.');
        assert(searchUseCase.execute({ author: 'bob' }).items.some((i) => i.id === publicationId), 'D2. ...and by author.');
        console.log('✓ D — Repository search finds the admitted Publication through its normal, unmodified query path.');
    }

    // ===============================================================
    // Section E — claimedPosition remains inert; admission never
    // creates a PlacementRecord.
    // ===============================================================
    {
        const publicationId = 'inert-pub-e';
        const maliciousClaim = { x: 424242, y: 0, z: 424242 };
        const env = await encounterVerified('0.9.595-e', { publicationId, claimedPosition: maliciousClaim, encounterPosition: { x: 2, y: 0, z: 2 }, bytes: 'inert-bytes-e' });
        const decentralizedPublicationDiscoveryProvider = new DecentralizedPublicationDiscoveryProvider();
        const ctx = buildCanvasInstance({ registry: env.registry, observerLocalEncounterRegistry: env.store, materialSources: env.materialSources, materialVerifier: env.verifier, decentralizedPublicationDiscoveryProvider });
        mountCanvas(ctx);
        const [marker] = ctx.projectedObserverLocalEncounters;
        ctx.selectObserverLocalEncounter(marker);
        await wait();
        assert(decentralizedPublicationDiscoveryProvider.list().length === 1, 'E1. Sanity: admission occurred.');
        assert(env.worldModel.placementRegistry.findByPublicationId(publicationId).length === 0, 'E2. No PlacementRecord exists anywhere — admission never creates one, even with an adversarial claimedPosition in play.');
        const resolvedSelection = ctx.observerLocalEncounterResolvedSelection;
        assert(!('claimedPosition' in resolvedSelection) && !('position' in resolvedSelection), 'E3. claimedPosition never reaches the resolved selection at all — the 0.9.551 boundary holds.');
        unmountCanvas(ctx);
        console.log('✓ E — Repository admission is purely a fact about which Publication is now knowable; claimedPosition stays completely inert, and no PlacementRecord is ever created by admission alone.');
    }

    // ===============================================================
    // Section F — Ghost suppression (0.9.570/0.9.571) is unaffected.
    // ===============================================================
    {
        const publicationId = 'ghost-pub-f';
        const env = await encounterVerified('0.9.595-f', { publicationId, claimedPosition: { x: 8, y: 0, z: 8 }, encounterPosition: { x: 3, y: 0, z: 3 }, bytes: 'ghost-bytes-f' });
        const decentralizedPublicationDiscoveryProvider = new DecentralizedPublicationDiscoveryProvider();
        const ctx = buildCanvasInstance({ registry: env.registry, observerLocalEncounterRegistry: env.store, materialSources: env.materialSources, materialVerifier: env.verifier, decentralizedPublicationDiscoveryProvider });
        mountCanvas(ctx);
        assert(ctx.projectedObserverLocalEncounters.length === 1, 'F1. Before any authoritative placement: the observer-local marker renders — admission (a Repository fact) does not itself suppress it.');
        const [marker] = ctx.projectedObserverLocalEncounters;
        ctx.selectObserverLocalEncounter(marker);
        await wait();
        assert(decentralizedPublicationDiscoveryProvider.list().length === 1, 'F2. Sanity: admission occurred from selecting/inspecting.');
        assert(ctx.projectedObserverLocalEncounters.length === 1, 'F3. Still rendered — Repository admission is not itself an authoritative placement, and must not suppress the ghost on its own.');

        // Now register an authoritative placement — via publicationRows,
        // the SAME live signal projectedObserverLocalEncounters already
        // filters against (0.9.570) — and confirm suppression still works.
        ctx.publicationRows = [{ objectId: publicationId }];
        assert(ctx.projectedObserverLocalEncounters.length === 0, 'F4. Once an authoritative placement exists, the ghost IS suppressed — unaffected by this milestone.');
        ctx.publicationRows = [];
        assert(ctx.projectedObserverLocalEncounters.length === 1, 'F5. Removing the placement makes the marker reappear — reversible, unaffected by this milestone.');
        unmountCanvas(ctx);
        console.log('✓ F — ghost suppression keys exclusively on authoritative placement (publicationRows), never on Repository admission; the two remain independent facts, exactly as designed.');
    }

    // ===============================================================
    // Section G — Failure isolation.
    // ===============================================================
    {
        const publicationId = 'failure-pub-g';
        const contentHash = 'failure-hash-g';
        const storageProvider = new InMemoryStorageProvider();
        knowPublicationLocally(storageProvider, { id: publicationId, contentHash });
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const throwingProvider = { add: () => { throw new Error('injected provider failure'); } };
        const ctx = buildCanvasInstance({ materialSources: { local: localSource }, materialVerifier: new MapVerifier({ [publicationId]: true }), decentralizedPublicationDiscoveryProvider: throwingProvider });
        ctx.selectObserverLocalEncounter({ publicationId, contentHash });
        await wait();
        assert(ctx.observerLocalEncounterInspection !== null && ctx.observerLocalEncounterInspection.verification.status === 'VERIFIED', 'G1. A throwing discovery provider never prevents the already-successful World Encounter resolution from being written — failure isolation holds, inherited from admitToRepositoryDiscovery()\'s own try/catch (0.9.474), never reimplemented.');
        console.log('✓ G — a discovery-admission failure never turns an already-successful observer-local resolution into a failed one.');
    }

    // ===============================================================
    // Section H — No duplicate discovery mechanism.
    // ===============================================================
    {
        const canvasSource = (await Promise.all(worldEncounterCanvasFiles().map((file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8')))).join('\n');
        const addCallSites = (canvasSource.match(/decentralizedPublicationDiscoveryProvider\.add\(/g) || []);
        assert(addCallSites.length === 1, `H1. Exactly one call site invokes .add() on the injected provider — inside admitToRepositoryDiscovery() itself (found ${addCallSites.length}).`);
        const callerCount = (canvasSource.match(/this\.admitToRepositoryDiscovery\(/g) || []).length;
        assert(callerCount === 3, `H2. admitToRepositoryDiscovery() is called from exactly three places — refreshMaterialInspection(), refreshComparisonMaterialInspection(), and refreshObserverLocalEncounterInspection() (found ${callerCount}).`);
        assert(!/new DecentralizedPublicationDiscoveryProvider\(/.test(canvasSource), 'H3. WorldEncounterCanvas.js never constructs a catalog of its own.');
        console.log('✓ H — no duplicate discovery mechanism: one admission method, reused, never forked, by all three refresh call sites.');
    }

    // ===============================================================
    // Section I — THE KNOWN, HONEST LIMIT. Live-proven, never assumed:
    // admission does NOT, by itself, make OwnPublicationPanel resolve
    // the Publication, because WorldNavigationSession's own
    // discoveryProvider is a structurally separate instance.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const alice = new LocalIdentityProvider(storage);
        alice.login('alice');
        const registry = new CreateBrickRegistryUseCase().execute();
        const contentStore = new LocalContentStore(storage);
        const publisher = new LocalPublisherProvider(storage, contentStore);
        const sessionDiscoveryProvider = new LocalDiscoveryProvider(storage);
        const spatialIndexProvider = new LocalSpatialIndexProvider(storage);
        const worldLayoutProvider = new LocalWorldLayoutProvider(spatialIndexProvider, sessionDiscoveryProvider);
        const session = new WorldNavigationSession({
            registry,
            loadPublicationDocumentUseCase: new LoadPublicationDocumentUseCase(storage),
            worldLayoutProvider,
            saveDocumentUseCase: new SaveDocumentUseCase(storage),
            publishDocumentUseCase: new PublishDocumentUseCase(publisher, alice),
            identityProvider: alice,
            documentCloneService: new DocumentCloneService(),
            discoveryProvider: sessionDiscoveryProvider
        });

        const publicationId = 'limit-pub-i';
        const contentHash = 'limit-hash-i';
        const documentId = 'limit-doc-i';
        const storageForEncounter = new InMemoryStorageProvider();
        knowPublicationLocally(storageForEncounter, { id: publicationId, documentId, contentHash });
        const localSource = new LocalWorldEncounterMaterialSource(storageForEncounter);
        const decentralizedPublicationDiscoveryProvider = new DecentralizedPublicationDiscoveryProvider();
        const ctx = buildCanvasInstance({ materialSources: { local: localSource }, materialVerifier: new MapVerifier({ [publicationId]: true }), decentralizedPublicationDiscoveryProvider });
        ctx.selectObserverLocalEncounter({ publicationId, contentHash });
        await wait();

        assert(decentralizedPublicationDiscoveryProvider.findByDocumentId(documentId).length === 1, 'I1. Sanity: this milestone\'s own admission genuinely occurred — findByDocumentId finds it on the provider WorldEncounterCanvas admits into.');
        assert(session.getPublicationForDocument(documentId) === null, 'I2. LIVE PROOF, THE HONEST LIMIT: a real WorldNavigationSession\'s own getPublicationForDocument() — the ONE input OwnPublicationPanel\'s own `publication` prop is keyed on (per ui/views/WorldView.js) — still returns null. Admission into decentralizedPublicationDiscoveryProvider does NOT reach it, because session\'s own discoveryProvider is a structurally separate LocalDiscoveryProvider instance.');

        // Sanity: the SAME session DOES resolve it once known to ITS OWN
        // provider — confirming I2 is a real instance-identity fact, never
        // a broken fixture or a bug in getPublicationForDocument() itself.
        storage.save('forkbuild-publications', [new Publication({ id: publicationId, documentId, title: 'x', contentReference: new ContentReference({ hash: contentHash }) }).toJSON()]);
        assert(session.getPublicationForDocument(documentId) !== null, 'I3. Sanity check on I2: the SAME session resolves a Publication once it exists in ITS OWN discoveryProvider — I2\'s null was about provider identity, never a broken fixture.');

        console.log('✓ I — HONEST LIMIT, live-proven: this milestone makes an observer-local Publication findable via Repository search (Section D) — it does NOT make it reachable through OwnPublicationPanel. That gap is pre-existing (equally true for the already-shipped primary/registered encounter family\'s own 0.9.474 admission) and deliberately left open — see ui/components/WorldEncounterCanvas.js\'s own "0.9.595" header, "A KNOWN, PRE-EXISTING LIMIT," for the full account and what closing it would require.');
    }

    // ===============================================================
    // Section J — Production scope guard.
    // ===============================================================
    {
        const canvasSource = (await Promise.all(worldEncounterCanvasFiles().map((file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8')))).join('\n');
        const otherFilesToCheck = [
            '../application/world/WorldNavigationSession.js',
            '../application/world/CreateWorldViewUseCase.js',
            '../ui/components/OwnPublicationPanel.js'
        ];
        for (const rel of otherFilesToCheck) {
            const src = await readFile(new URL(rel, import.meta.url), 'utf8');
            assert(!/admitToRepositoryDiscovery/.test(src), `J1. ${rel} does not reference admitToRepositoryDiscovery at all — this milestone's own new call lives exclusively in WorldEncounterCanvas.js.`);
        }
        // ui/views/WorldView.js legitimately NAMES admitToRepositoryDiscovery
        // in its own 0.9.474 wiring commentary (explaining the shared
        // decentralizedPublicationDiscoveryProvider prop) — never CALLS it.
        // This milestone adds no call there either.
        const worldViewSrc = (await Promise.all(worldViewFiles().map((file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8')))).join('\n');
        assert(!/\.admitToRepositoryDiscovery\(/.test(worldViewSrc), 'J1b. ui/views/WorldView.js never CALLS admitToRepositoryDiscovery() — it only ever passes the shared provider through as a prop.');
        assert(/refreshObserverLocalEncounterInspection\(\) \{[\s\S]*?this\.admitToRepositoryDiscovery\(result\.loading, result\.verification\);/.test(canvasSource),
            'J2. The new call is exactly where it should be: inline inside refreshObserverLocalEncounterInspection()\'s own .then() callback.');
        console.log('✓ J — the new call lives in exactly one production file, exactly one method, and no other file was touched to make this work.');
    }

    console.log('\n✅ All AdmitVerifiedObserverLocalPublicationsIntoRepositoryDiscoveryAudit tests passed.');
}

run().catch((error) => {
    console.error('AdmitVerifiedObserverLocalPublicationsIntoRepositoryDiscoveryAudit.test.js FAILED:', error);
    process.exitCode = 1;
});
