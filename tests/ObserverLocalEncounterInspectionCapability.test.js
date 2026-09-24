import { AutomaticSnapshotEncounterCascade } from '../application/snapshot/AutomaticSnapshotEncounterCascade.js';
import { DecentralizedSnapshotResolutionOutcome } from '../application/snapshot/DecentralizedSnapshotResolutionOutcome.js';
import { SnapshotWorldPlacementOutcome } from '../application/snapshot/placement/SnapshotWorldPlacementOutcome.js';
import { SnapshotWorldRegistrationOutcome } from '../application/snapshot/placement/SnapshotWorldRegistrationOutcome.js';
import { composeDiscoverSnapshotRuntime } from '../application/snapshot/DiscoverSnapshotRuntimeComposition.js';
import { executeDiscoverSnapshotCandidatesCommand } from '../application/snapshot/DiscoverSnapshotCandidatesCommand.js';
import { executeResolveSelectedSnapshotCommand } from '../application/snapshot/ResolveSelectedSnapshotCommand.js';
import { executeMaterializeSelectedSnapshotCommand } from '../application/snapshot/materialization/MaterializeSelectedSnapshotCommand.js';
import { MaterializeSnapshotFromSelectedCandidateUseCase } from '../application/snapshot/materialization/MaterializeSnapshotFromSelectedCandidateUseCase.js';
import { StoreSnapshotContentUseCase } from '../application/snapshot/materialization/StoreSnapshotContentUseCase.js';
import { NostrSnapshotDiscoveryPublisher } from '../application/nostr/NostrSnapshotDiscoveryPublisher.js';
import { WorldDiscoverySourceRegistry } from '../application/discovery/WorldDiscoverySourceRegistry.js';
import { ObserverLocalEncounterStore } from '../application/worldEncounter/ObserverLocalEncounterStore.js';
import { materializedSnapshotWorldOrigin } from '../application/snapshot/materialization/MaterializedSnapshotWorldDiscoveryBridge.js';
import { LocalWorldEncounterMaterialSource } from '../application/worldEncounter/LocalWorldEncounterMaterialSource.js';
import { WorldEncounterKind } from '../core/WorldEncounter.js';
import { WorldEncounterSelectionOutcomeStatus } from '../application/worldEncounter/WorldEncounterSelectionOutcome.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
import { ContentReference } from '../core/ContentReference.js';
import { Position } from '../core/Position.js';
import { Publication } from '../publisher/Publication.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { worldEncounterCanvasFiles } from './support/SourceFileGroups.js';

// 0.9.554 — Observer-Local Encounter Inspection Capability.
//
// TYPE: production implementation milestone. Modified:
// ui/components/WorldEncounterCanvas.js (a new, narrow "observe -> select
// -> inspect" surface — see that file's own "0.9.554" header), css/main.css
// (cursor affordance for the now-clickable marker). Amends: tests/
// ObserverLocalEncounterExperienceProductReassessment.test.js (Sections F,
// G, L — the PRODUCT_GAP that 0.9.553 named as closed here, in place,
// exactly like 0.9.552 amended 0.9.551's own D4 for the identical
// situation one milestone earlier in this same chain).
//
// 0.9.553's own Section G proved, empirically, that an observer-local
// encounter's identity cannot be reached through the EXISTING selection
// machinery (`selectEncounter()` -> `selectionOutcome` ->
// `resolvedEncounterSelection`) without producing a false `UNAVAILABLE`
// notice — that machinery answers "which registered WorldDiscoverySource
// offers this identity," and an observer-local encounter, by construction,
// was never registered with any registry at all. This milestone builds the
// narrow, genuinely separate surface that gap called for: a click on the
// observer-local marker resolves DIRECTLY to `materialSources.local` via
// `materializedSnapshotWorldOrigin()` (the SAME derivation
// `registerMaterializedSnapshotWorldSource()` itself would use for the
// identical publicationId/contentHash pair), then calls the EXISTING
// `inspectWorldEncounterMaterial()` orchestration boundary — never a
// second loader, never a second verifier, and never a PlacementRecord.
//
// AMENDED BY 0.9.595 — Admit Verified Observer-Local Publications into
// Repository Discovery. At the time this file was written, this surface
// also never reached Repository/Catalog admission (0.9.553's own Section
// H boundary, held here too). Section K below is amended IN PLACE, per
// this codebase's own established convention (see immediately above, "the
// PRODUCT_GAP... closed here, in place"), to prove the current, opposite
// behavior: a fully AVAILABLE + VERIFIED resolution now DOES admit,
// through the identical, unmodified `admitToRepositoryDiscovery()` gate
// the primary encounter family already used — see
// tests/AdmitVerifiedObserverLocalPublicationsIntoRepositoryDiscoveryAudit.test.js
// for the full, dedicated flagship proof of that journey end to end.
//
// This file verifies that surface's own acceptance criteria A-L against
// the real, unmodified production cascade, store, descriptor, and the real
// `ui/components/WorldEncounterCanvas.js` component driven directly
// through its own `data`/`computed`/`methods`/`mounted`/`beforeUnmount` —
// the SAME "call X.call(ctx)" discipline
// tests/ObserverLocalEncounterExperienceProductReassessment.test.js (0.9.553)
// already established for this exact component.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
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

    let resolveCallCount = 0;
    let materializeCallCount = 0;
    const discoverSnapshotCandidatesCommand = () => executeDiscoverSnapshotCandidatesCommand({ discoveryTag, discoveryQueryService: queryService });
    const resolveSelectedSnapshotCommand = (candidate) => {
        resolveCallCount += 1;
        return executeResolveSelectedSnapshotCommand({ candidate, resolver, contentStore });
    };
    const materializeSelectedSnapshotCommand = (resolution) => {
        materializeCallCount += 1;
        return executeMaterializeSelectedSnapshotCommand({ resolution, materializer });
    };

    return {
        gateway, signer, network, discoveryTag, resolver, contentStore, queryService, announcer,
        localContentStore,
        discoverSnapshotCandidatesCommand, resolveSelectedSnapshotCommand, materializeSelectedSnapshotCommand,
        callCounts: () => ({ resolve: resolveCallCount, materialize: materializeCallCount })
    };
}

async function placeAndAnnounce(host, bytes, { publicationId = undefined, claimedPosition = undefined } = {}) {
    const reference = await host.contentStore.put(bytes);
    await host.announcer.publish({ contentHash: reference.hash, locator: reference.uri, storage: reference.storage, publicationId, claimedPosition });
    return reference;
}

function makeWorldModel() {
    const publications = new Map();
    const placementRegistry = new LocalPlacementRegistry(new InMemoryStorageProvider());
    return {
        publications,
        placementRegistry,
        knowPublication(publication) { publications.set(publication.id, publication); },
        placeAt(publicationId, position, owner = 'alice') {
            placementRegistry.add(new PlacementRecord({ publicationId, position, owner }));
        },
        resolvePlacementInfo: (publicationId) => {
            const records = placementRegistry.findByPublicationId(publicationId);
            if (records.length === 0) return null;
            const record = records.reduce((latest, r) => (!latest || r.updatedAt > latest.updatedAt) ? r : latest, null);
            return { placementId: record.placementId, publicationId: record.publicationId, position: { x: record.position.x, y: record.position.y, z: record.position.z } };
        },
        findPublicationById: (publicationId) => publications.get(publicationId) || null
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

// Writes a plain Publication record directly into the SAME
// 'forkbuild-publications' storage key LocalDiscoveryProvider/
// LocalWorldEncounterMaterialSource already read from — the minimal
// fixture needed to make a publicationId "locally known" for material
// inspection purposes, without the full sign/publish flow this test does
// not otherwise exercise.
function knowPublicationLocally(storageProvider, { id, title = 'Known Locally', contentHash }) {
    const publication = new Publication({ id, title, contentReference: new ContentReference({ hash: contentHash }) });
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

class GatedMaterialSource {
    constructor(inner) { this._inner = inner; this._gates = new Map(); this.calls = []; }
    gate(objectId) {
        let resolve;
        const promise = new Promise((res) => { resolve = res; });
        this._gates.set(objectId, promise);
        return () => resolve();
    }
    async load(resolvedSelection) {
        this.calls.push(resolvedSelection);
        const gatePromise = this._gates.get(resolvedSelection && resolvedSelection.objectId);
        if (gatePromise) await gatePromise;
        return this._inner.load(resolvedSelection);
    }
}

// ===================================================================
// WorldEncounterCanvas real-component harness — mirrors tests/
// ObserverLocalEncounterExperienceProductReassessment.test.js's own
// buildCanvasInstance()/mountCanvas()/unmountCanvas() exactly, duplicated
// here per this codebase's own established convention (each audit/
// implementation file owns its own harness rather than importing another
// test file's internals).
// ===================================================================

function buildCanvasInstance({ registry = null, observerLocalEncounterRegistry = null, materialSources = null, materialVerifier = null, decentralizedPublicationDiscoveryProvider = null } = {}) {
    const ctx = {
        registry,
        observerLocalEncounterRegistry,
        view: WorldEncounterCanvas.props.view.default(),
        materialSources,
        materialVerifier,
        decentralizedPublicationDiscoveryProvider
    };
    Object.assign(ctx, WorldEncounterCanvas.data.call(ctx));
    Object.assign(ctx, WorldEncounterCanvas.methods);
    for (const name of ['resolvedEncounterSelection', 'resolvedLead', 'observerLocalEncounterResolvedSelection']) {
        Object.defineProperty(ctx, name, {
            get() { return WorldEncounterCanvas.computed[name].call(ctx); }
        });
    }
    return ctx;
}

function mountCanvas(ctx) { WorldEncounterCanvas.mounted.call(ctx); }
function unmountCanvas(ctx) { WorldEncounterCanvas.beforeUnmount.call(ctx); }

function projectedObserverLocalEncountersOf(ctx) {
    return WorldEncounterCanvas.computed.projectedObserverLocalEncounters.call(ctx);
}

function flush() { return new Promise((resolve) => setTimeout(resolve, 0)); }

async function runTests() {
    console.log('Running Observer-Local Encounter Inspection Capability tests...\n');

    // ===============================================================
    // Section A — Flagship: real encounter, real click, real inspection.
    // ===============================================================
    {
        const host = makeHost('0.9.554-section-a');
        const publicationId = 'unknown-publisher-pub-a';
        const claimedPosition = { x: 4200, y: 0, z: 4200 };
        const wandererPosition = { x: 12, y: 0, z: -7 };

        const worldModel = makeWorldModel();
        const registry = new WorldDiscoverySourceRegistry();
        const store = new ObserverLocalEncounterStore();
        const cascade = makeCascade(host, worldModel, registry, { resolveEncounterPosition: () => wandererPosition });

        const reference = await placeAndAnnounce(host, 'novel-bytes-a', { publicationId, claimedPosition });
        const [candidate] = await host.discoverSnapshotCandidatesCommand();
        const result = await cascade.processCandidate(candidate);
        assert(result.outcome === SnapshotWorldPlacementOutcome.UNPLACED, 'A1. Sanity: no authoritative placement exists.');
        assert(result.encounter !== null, 'A2. Sanity: an observer-local encounter was produced.');
        store.record(result.encounter);

        // This device separately already knows this exact Publication's own
        // metadata (a realistic case: the Wanderer synced/authored it some
        // other way even though no WorldPlacement exists for it yet) — this
        // is what lets materialSources.local actually FIND something.
        const storageProvider = new InMemoryStorageProvider();
        knowPublicationLocally(storageProvider, { id: publicationId, title: 'Discovered Work', contentHash: reference.hash });
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const verifier = new MapVerifier({ [publicationId]: true });

        const ctx = buildCanvasInstance({ registry, observerLocalEncounterRegistry: store, materialSources: { local: localSource }, materialVerifier: verifier });
        mountCanvas(ctx);
        const [marker] = projectedObserverLocalEncountersOf(ctx);
        assert(marker && marker.publicationId === publicationId && marker.contentHash === reference.hash, 'A3. The projected marker carries the real publicationId/contentHash.');

        ctx.selectObserverLocalEncounter(marker);
        assert(ctx.selectedObserverLocalEncounter && ctx.selectedObserverLocalEncounter.publicationId === publicationId, 'A4. selectObserverLocalEncounter() records the click.');
        await flush();

        assert(ctx.observerLocalEncounterInspection !== null, 'A5. Inspection resolved.');
        assert(ctx.observerLocalEncounterInspection.loading.status === 'AVAILABLE', 'A6. Material was FOUND, through materialSources.local alone.');
        assert(ctx.observerLocalEncounterInspection.verification.status === 'VERIFIED', 'A7. Verification confirms correspondence, through the SAME injected verifier every other World Encounter inspection already uses.');
        assert(verifier.calls.length === 1 && verifier.calls[0].resolvedSelection.objectId === publicationId, 'A8. The verifier was actually invoked, once, for the correct identity.');

        unmountCanvas(ctx);
        console.log('✓ A — a real encounter, clicked, resolves through the new capability to a real, verified Material/Verification result.');
    }

    // ===============================================================
    // Section B — Exact Publication identity, never substituted.
    // ===============================================================
    {
        const publicationId = 'identity-pub-b';
        const contentHash = 'identity-hash-b';
        const ctx = buildCanvasInstance({});
        ctx.selectObserverLocalEncounter({ publicationId, contentHash });
        const resolved = ctx.observerLocalEncounterResolvedSelection;
        assert(resolved.kind === 'PUBLICATION', 'B1. kind is always PUBLICATION.');
        assert(resolved.objectId === publicationId, 'B2. objectId is EXACTLY publicationId — never contentHash, never a documentId.');
        assert(resolved.origin === materializedSnapshotWorldOrigin(contentHash, publicationId), 'B3. origin is EXACTLY the same derivation registerMaterializedSnapshotWorldSource() would itself use for this pair — never a re-implementation, never a guess.');
        assert(!('documentId' in resolved) && !('locator' in resolved) && !('claimedPosition' in resolved), 'B4. No documentId/locator/claimedPosition ever substitutes for identity.');
        console.log('✓ B — the resolved selection carries exact, unsubstituted Publication identity.');
    }

    // ===============================================================
    // Section C — Verification continuity: the SAME verifier, never a
    // second, independently-invented check.
    // ===============================================================
    {
        const publicationId = 'continuity-pub-c';
        const contentHash = 'continuity-hash-c';
        const storageProvider = new InMemoryStorageProvider();
        knowPublicationLocally(storageProvider, { id: publicationId, contentHash });
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const verifier = new MapVerifier({ [publicationId]: true });

        const ctx = buildCanvasInstance({ materialSources: { local: localSource }, materialVerifier: verifier });
        ctx.selectObserverLocalEncounter({ publicationId, contentHash });
        await flush();
        assert(ctx.observerLocalEncounterInspection.verification.status === 'VERIFIED', 'C1. Verified through the injected verifier.');
        assert(verifier.calls.length === 1, 'C2. The verifier is called exactly once for one selection — no duplicate/parallel verification pass.');

        // Re-selecting the SAME identity again calls the SAME verifier
        // again (a fresh check, not a cache) — never a second, different
        // verifier or mechanism.
        ctx.selectObserverLocalEncounter({ publicationId, contentHash });
        await flush();
        assert(verifier.calls.length === 2, 'C3. A fresh selection of the identical identity re-verifies through the SAME verifier — never skipped, never routed elsewhere.');
        console.log('✓ C — verification continuity holds: exactly one verifier, the same one every other World Encounter inspection already uses, with no second/parallel mechanism.');
    }

    // ===============================================================
    // Section D — Material continuity: no second download.
    // ===============================================================
    {
        const host = makeHost('0.9.554-section-d');
        const publicationId = 'no-second-download-pub-d';
        const worldModel = makeWorldModel();
        const registry = new WorldDiscoverySourceRegistry();
        const cascade = makeCascade(host, worldModel, registry, { resolveEncounterPosition: () => ({ x: 1, y: 0, z: 1 }) });

        const reference = await placeAndAnnounce(host, 'novel-bytes-d', { publicationId, claimedPosition: { x: 9, y: 0, z: 9 } });
        const [candidate] = await host.discoverSnapshotCandidatesCommand();
        const result = await cascade.processCandidate(candidate);
        assert(result.encounter !== null, 'D0. Sanity.');

        const storageProvider = new InMemoryStorageProvider();
        knowPublicationLocally(storageProvider, { id: publicationId, contentHash: reference.hash });
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);

        const ctx = buildCanvasInstance({ materialSources: { local: localSource }, materialVerifier: new MapVerifier({ [publicationId]: true }) });
        ctx.selectObserverLocalEncounter({ publicationId, contentHash: reference.hash });
        await flush();
        assert(ctx.observerLocalEncounterInspection.loading.status === 'AVAILABLE', 'D1. Sanity: material found.');

        assert(host.callCounts().resolve === 1 && host.callCounts().materialize === 1, `D2. Inspecting the encounter triggers NO additional resolve/materialize call on the cascade's own collaborators — the cascade already ran exactly once, at discovery time (resolve=${host.callCounts().resolve}, materialize=${host.callCounts().materialize}).`);

        // Re-selecting (or re-inspecting) again still never re-invokes
        // Nostr/Arweave resolution or materialization — inspection reads
        // only the already-materialized local metadata/content, never the
        // original decentralized pipeline.
        ctx.selectObserverLocalEncounter({ publicationId, contentHash: reference.hash });
        await flush();
        assert(host.callCounts().resolve === 1 && host.callCounts().materialize === 1, 'D3. A second selection of the identical encounter still triggers no additional resolve/materialize call.');
        console.log('✓ D — inspecting an observer-local encounter never re-downloads or re-materializes anything; it only ever reads what the original cascade already produced.');
    }

    // ===============================================================
    // Section E — No placement mutation.
    // ===============================================================
    {
        const publicationId = 'no-placement-pub-e';
        const contentHash = 'no-placement-hash-e';
        const worldModel = makeWorldModel();
        const registry = new WorldDiscoverySourceRegistry();
        let setSourceCalls = 0;
        const originalSetSource = registry.setSource.bind(registry);
        registry.setSource = (...args) => { setSourceCalls += 1; return originalSetSource(...args); };

        const storageProvider = new InMemoryStorageProvider();
        knowPublicationLocally(storageProvider, { id: publicationId, contentHash });
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);

        const ctx = buildCanvasInstance({ registry, materialSources: { local: localSource }, materialVerifier: new MapVerifier({ [publicationId]: true }) });
        ctx.selectObserverLocalEncounter({ publicationId, contentHash });
        await flush();
        assert(ctx.observerLocalEncounterInspection.verification.status === 'VERIFIED', 'E0. Sanity: verified.');

        assert(setSourceCalls === 0, 'E1. registry.setSource() is never called by selecting/inspecting an observer-local encounter.');
        assert(worldModel.placementRegistry.findByPublicationId(publicationId).length === 0, 'E2. No PlacementRecord exists for this publicationId after selection/inspection.');
        ctx.dismissObserverLocalEncounterInspection();
        assert(setSourceCalls === 0, 'E3. Dismissing likewise mutates nothing.');
        console.log('✓ E — no placement mutation of any kind: PlacementRegistry and WorldDiscoverySourceRegistry are both untouched by selection, inspection, or dismissal.');
    }

    // ===============================================================
    // Section F — No claimed-position authority.
    // ===============================================================
    {
        const host = makeHost('0.9.554-section-f');
        const publicationId = 'claim-authority-pub-f';
        const maliciousClaim = { x: 999999, y: 0, z: 999999 };
        const worldModel = makeWorldModel();
        const registry = new WorldDiscoverySourceRegistry();
        const cascade = makeCascade(host, worldModel, registry, { resolveEncounterPosition: () => ({ x: 3, y: 0, z: 3 }) });

        const reference = await placeAndAnnounce(host, 'novel-bytes-f', { publicationId, claimedPosition: maliciousClaim });
        const [candidate] = await host.discoverSnapshotCandidatesCommand();
        const result = await cascade.processCandidate(candidate);

        const ctx = buildCanvasInstance({});
        ctx.selectObserverLocalEncounter({ publicationId: result.encounter.publicationId, contentHash: result.encounter.contentHash });
        const resolved = ctx.observerLocalEncounterResolvedSelection;
        assert(!('claimedPosition' in resolved) && !('position' in resolved) && !('x' in resolved), 'F1. The resolved selection carries no position field of any kind — claimedPosition never reaches it, and neither does the encounter\'s own (Wanderer-supplied) position.');
        assert(worldModel.placementRegistry.findByPublicationId(publicationId).length === 0, 'F2. No PlacementRecord was created anywhere, at the malicious claim or otherwise.');
        console.log('✓ F — an adversarial claimedPosition has no path into this capability at all: the resolved selection is derived purely from contentHash/publicationId, never a position of any kind.');
    }

    // ===============================================================
    // Section G — Session isolation between two Wanderers.
    // ===============================================================
    {
        const publicationId = 'session-isolation-pub-g';
        const contentHash = 'session-isolation-hash-g';
        const storageProvider = new InMemoryStorageProvider();
        knowPublicationLocally(storageProvider, { id: publicationId, contentHash });
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);

        const ctxA = buildCanvasInstance({ materialSources: { local: localSource }, materialVerifier: new MapVerifier({ [publicationId]: true }) });
        const ctxB = buildCanvasInstance({ materialSources: { local: localSource }, materialVerifier: new MapVerifier({ [publicationId]: true }) });

        ctxA.selectObserverLocalEncounter({ publicationId, contentHash });
        await flush();
        assert(ctxA.observerLocalEncounterInspection !== null, 'G1. Wanderer A\'s own selection resolves.');
        assert(ctxB.selectedObserverLocalEncounter === null && ctxB.observerLocalEncounterInspection === null, 'G2. Wanderer B\'s own component instance is completely untouched by A\'s selection — two genuinely separate pieces of page-local state, never a shared object.');
        console.log('✓ G — selection/inspection state is per-component-instance: one Wanderer\'s own click never reaches another\'s.');
    }

    // ===============================================================
    // Section H — Coexistence with the existing, authoritative selection.
    // ===============================================================
    {
        const publicationId = 'placed-pub-h';
        const observerPublicationId = 'observer-pub-h';
        const observerContentHash = 'observer-hash-h';
        const worldModel = makeWorldModel();
        worldModel.placeAt(publicationId, new Position(3, 0, 3));
        worldModel.knowPublication(new Publication({ id: publicationId, title: 'Placed', contentReference: new ContentReference({ hash: 'placeholder' }) }));
        const registry = new WorldDiscoverySourceRegistry();
        registry.setSource({ origin: 'local', publications: [worldModel.findPublicationById(publicationId)], placements: [{ publicationId, position: { x: 3, y: 0, z: 3 } }], avatarProfiles: [], avatarPresences: [] });

        // Both Publications' own metadata need to live in the SAME
        // 'forkbuild-publications' storage entry LocalWorldEncounterMaterialSource
        // reads from — InMemoryStorageProvider.save() replaces the whole
        // array on each call, so both are written together.
        const storageProvider = new InMemoryStorageProvider();
        const placedPublication = new Publication({ id: publicationId, title: 'Placed', contentReference: new ContentReference({ hash: 'placeholder' }) });
        const observerPublication = new Publication({ id: observerPublicationId, title: 'Observed', contentReference: new ContentReference({ hash: observerContentHash }) });
        storageProvider.save('forkbuild-publications', [placedPublication.toJSON(), observerPublication.toJSON()]);
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const verifier = new MapVerifier({ [publicationId]: true, [observerPublicationId]: true });

        const ctx = buildCanvasInstance({ registry, materialSources: { local: localSource }, materialVerifier: verifier });
        mountCanvas(ctx);

        // The existing, authoritative selection.
        ctx.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: publicationId });
        // The NEW, separate observer-local selection, in the SAME mount.
        ctx.selectObserverLocalEncounter({ publicationId: observerPublicationId, contentHash: observerContentHash });
        await flush();

        assert(ctx.selectionOutcome && ctx.selectionOutcome.status === WorldEncounterSelectionOutcomeStatus.RESOLVED, 'H1. The authoritative selection still resolves normally.');
        assert(ctx.materialInspection && ctx.materialInspection.verification.status === 'VERIFIED', 'H2. Its own material inspection still runs through the EXISTING, unmodified path.');
        assert(ctx.selectedObserverLocalEncounter && ctx.selectedObserverLocalEncounter.publicationId === observerPublicationId, 'H3. The NEW observer-local selection coexists, unaffected.');
        assert(ctx.observerLocalEncounterInspection && ctx.observerLocalEncounterInspection.verification.status === 'VERIFIED', 'H4. Its own inspection resolves too, independently.');
        assert(ctx.materialInspection.selection.objectId === publicationId && ctx.observerLocalEncounterInspection.selection.objectId === observerPublicationId, 'H5. Neither inspection result ever crosses over into the other\'s own identity.');

        unmountCanvas(ctx);
        console.log('✓ H — the existing authoritative selection/inspection and the new observer-local one coexist, side by side, in one mount, without either ever disturbing the other.');
    }

    // ===============================================================
    // Section I — Failure isolation.
    // ===============================================================
    {
        // I1. No materialSources at all: inspection stays null, never throws.
        {
            const ctx = buildCanvasInstance({});
            ctx.selectObserverLocalEncounter({ publicationId: 'no-sources-pub-i', contentHash: 'no-sources-hash-i' });
            assert(ctx.observerLocalEncounterInspection === null, 'I1. No materialSources supplied: observerLocalEncounterInspection stays null, no throw.');
        }

        // I2. Publication genuinely not known locally (the realistic
        // "unknown publisher" case): an honest UNAVAILABLE/UNVERIFIABLE
        // degrade, never a crash, never a fabricated result.
        {
            const storageProvider = new InMemoryStorageProvider();
            const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
            const ctx = buildCanvasInstance({ materialSources: { local: localSource }, materialVerifier: new MapVerifier({}) });
            ctx.selectObserverLocalEncounter({ publicationId: 'truly-unknown-pub-i', contentHash: 'truly-unknown-hash-i' });
            await flush();
            assert(ctx.observerLocalEncounterInspection !== null, 'I2a. A result is still produced (not null) — the ORCHESTRATION ran; it simply found nothing.');
            assert(ctx.observerLocalEncounterInspection.loading.status === 'UNAVAILABLE', 'I2b. Honestly reports UNAVAILABLE — this device does not locally hold this Publication\'s own metadata, distinct from (and never contradicting) the fact that its Snapshot bytes were already verified at discovery time.');
            assert(ctx.observerLocalEncounterInspection.verification.status === 'UNVERIFIABLE', 'I2c. UNVERIFIABLE, never REJECTED — nothing was loaded to judge, so nothing is judged.');
        }

        // I3. A malformed marker (missing identity fields) is a silent
        // no-op — never throws, never corrupts existing state.
        {
            const ctx = buildCanvasInstance({});
            ctx.selectObserverLocalEncounter({ publicationId: 'p-only' });
            assert(ctx.selectedObserverLocalEncounter === null, 'I3a. A marker missing contentHash is ignored.');
            ctx.selectObserverLocalEncounter(null);
            assert(ctx.selectedObserverLocalEncounter === null, 'I3b. A null marker is ignored.');
            ctx.selectObserverLocalEncounter({ publicationId: 'ok-pub', contentHash: 'ok-hash' });
            assert(ctx.selectedObserverLocalEncounter !== null, 'I3c. Sanity: a well-formed marker still works after two malformed attempts.');
        }

        // I4. A failing/throwing local source degrades the SAME way any
        // other World Encounter selection's own material loading already
        // does — a genuine rejection propagates out of
        // inspectWorldEncounterMaterial() unswallowed (mirroring that
        // file's own "a thrown rejection is never swallowed," and
        // refreshMaterialInspection()'s own identical, pre-existing
        // "un-.catch()'d .then()" shape for the PRIMARY selection — this
        // is not a new gap 0.9.554 introduces), but critically never
        // corrupts unrelated state: other encounters, the store, and the
        // World's own rendering are all untouched. The rejection itself
        // becomes an unhandled promise rejection in this Node harness
        // exactly as it would in a browser console — caught here only so
        // this test file's own process does not abort.
        {
            const store = new ObserverLocalEncounterStore();
            store.record({ publicationId: 'unrelated-pub-i', contentHash: 'unrelated-hash-i', position: { x: 0, y: 0, z: 0 } });
            const throwingSource = { load: () => { throw new Error('simulated broken local source'); } };
            const ctx = buildCanvasInstance({ observerLocalEncounterRegistry: store, materialSources: { local: throwingSource }, materialVerifier: new MapVerifier({}) });
            mountCanvas(ctx);
            let threw = false;
            let observedRejection = null;
            const onUnhandledRejection = (error) => { observedRejection = error; };
            process.on('unhandledRejection', onUnhandledRejection);
            try {
                ctx.selectObserverLocalEncounter({ publicationId: 'broken-pub-i', contentHash: 'broken-hash-i' });
            } catch {
                threw = true;
            }
            assert(!threw, 'I4a. selectObserverLocalEncounter() itself never throws synchronously — the failure surfaces only in the async inspection promise.');
            await flush();
            process.removeListener('unhandledRejection', onUnhandledRejection);
            assert(observedRejection !== null, 'I4b. The broken source\'s own failure genuinely propagates (as an unhandled rejection here) rather than being silently swallowed into a fabricated UNAVAILABLE result.');
            assert(ctx.observerLocalEncounters.length === 1, 'I4c. The unrelated, already-recorded encounter remains in the store/rendering — untouched by the broken selection.');
            unmountCanvas(ctx);
        }

        console.log('✓ I — failure isolation holds across four distinct failure modes: no material sources, an honestly-unresolvable identity, a malformed selection, and a broken collaborator — none of them throws synchronously, corrupts unrelated state, or produces a fabricated result.');
    }

    // ===============================================================
    // Section J — Stale async lifecycle.
    // ===============================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        knowPublicationLocally(storageProvider, { id: 'slow-pub-j', contentHash: 'slow-hash-j' });
        knowPublicationLocally(storageProvider, { id: 'fast-pub-j', contentHash: 'fast-hash-j' });
        // Re-write BOTH records together — InMemoryStorageProvider.save()
        // replaces the whole 'forkbuild-publications' array each call, so
        // add both up front instead of overwriting one with the other.
        const slowPublication = new Publication({ id: 'slow-pub-j', title: 'Slow', contentReference: new ContentReference({ hash: 'slow-hash-j' }) });
        const fastPublication = new Publication({ id: 'fast-pub-j', title: 'Fast', contentReference: new ContentReference({ hash: 'fast-hash-j' }) });
        storageProvider.save('forkbuild-publications', [slowPublication.toJSON(), fastPublication.toJSON()]);

        const gatedSource = new GatedMaterialSource(new LocalWorldEncounterMaterialSource(storageProvider));
        const releaseSlow = gatedSource.gate('slow-pub-j');
        const verifier = new MapVerifier({ 'slow-pub-j': true, 'fast-pub-j': true });

        const ctx = buildCanvasInstance({ materialSources: { local: gatedSource }, materialVerifier: verifier });

        // J1. Select the slow one first (its own load() blocks on the gate).
        ctx.selectObserverLocalEncounter({ publicationId: 'slow-pub-j', contentHash: 'slow-hash-j' });
        // J2. Before it resolves, select a second, different encounter —
        // its own load() is ungated and resolves immediately.
        ctx.selectObserverLocalEncounter({ publicationId: 'fast-pub-j', contentHash: 'fast-hash-j' });
        await flush();
        assert(ctx.observerLocalEncounterInspection && ctx.observerLocalEncounterInspection.selection.objectId === 'fast-pub-j', 'J1. The fast, later selection\'s own result is current.');

        // J3. NOW release the slow one's gate — its late result must never
        // overwrite the current (fast) one.
        releaseSlow();
        await flush();
        assert(ctx.observerLocalEncounterInspection.selection.objectId === 'fast-pub-j', 'J2. The slow selection\'s own late-arriving result was discarded — the request-counter guard held, exactly mirroring materialInspectionRequestId\'s own established behavior one selection concept over.');

        // J4. Dismissal also invalidates a still-in-flight request.
        const releaseSlowAgain = gatedSource.gate('slow-pub-j');
        ctx.selectObserverLocalEncounter({ publicationId: 'slow-pub-j', contentHash: 'slow-hash-j' });
        ctx.dismissObserverLocalEncounterInspection();
        releaseSlowAgain();
        await flush();
        assert(ctx.selectedObserverLocalEncounter === null && ctx.observerLocalEncounterInspection === null, 'J3. A dismissal followed by a late-arriving response for the dismissed selection never resurrects it.');

        // J5. Unmounting invalidates a still-in-flight request too.
        const releaseSlowOnceMore = gatedSource.gate('slow-pub-j');
        ctx.selectObserverLocalEncounter({ publicationId: 'slow-pub-j', contentHash: 'slow-hash-j' });
        mountCanvas(ctx);
        unmountCanvas(ctx);
        releaseSlowOnceMore();
        await flush();
        assert(ctx.observerLocalEncounterInspection === null, 'J4. A late response arriving after unmount is discarded too — beforeUnmount() bumped the request counter.');

        console.log('✓ J — the observer-local inspection request-counter guard mirrors materialInspectionRequestId\'s own established behavior exactly: a superseded selection, a dismissal, and an unmount all correctly discard a late response.');
    }

    // ===============================================================
    // Section K — AMENDED BY 0.9.595 (Admit Verified Observer-Local
    // Publications into Repository Discovery). At the time this file was
    // written (0.9.554), an observer-local encounter never reached
    // app-wide Repository discovery, matching 0.9.553's own Section H
    // boundary. 0.9.594's own audit found the downstream continuity cost
    // that restriction left unmeasured, and 0.9.595 closed it by adding
    // exactly one call — `admitToRepositoryDiscovery()`, the identical,
    // unmodified method the PRIMARY encounter family already used — to
    // `refreshObserverLocalEncounterInspection()`. This section now proves
    // the OPPOSITE of its original name: a fully AVAILABLE + VERIFIED
    // observer-local resolution now DOES admit, through that same,
    // unmodified gate.
    // ===============================================================
    {
        const publicationId = 'repository-boundary-pub-k';
        const contentHash = 'repository-boundary-hash-k';
        const storageProvider = new InMemoryStorageProvider();
        const realPublication = knowPublicationLocally(storageProvider, { id: publicationId, contentHash });
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const verifier = new MapVerifier({ [publicationId]: true });

        let addCalls = 0;
        let lastAdded = null;
        const discoveryProvider = { add: (publication) => { addCalls += 1; lastAdded = publication; } };

        const ctx = buildCanvasInstance({ materialSources: { local: localSource }, materialVerifier: verifier, decentralizedPublicationDiscoveryProvider: discoveryProvider });
        ctx.selectObserverLocalEncounter({ publicationId, contentHash });
        await flush();
        assert(ctx.observerLocalEncounterInspection.verification.status === 'VERIFIED', 'K0. Sanity: a genuine, VERIFIED resolution — precisely the case admitToRepositoryDiscovery() acts on.');
        assert(addCalls === 1, 'K1. AMENDED BY 0.9.595 — a fully AVAILABLE + VERIFIED observer-local resolution now DOES call decentralizedPublicationDiscoveryProvider.add(), exactly once, through the same admitToRepositoryDiscovery() gate the PRIMARY encounter family already used.');
        assert(lastAdded === ctx.observerLocalEncounterInspection.loading.material, 'K2. The admitted object is the EXACT Publication instance the inspection resolved — never reconstructed.');
        console.log('✓ K — AMENDED BY 0.9.595: an observer-local encounter now reaches app-wide Repository discovery once its own material resolves fully AVAILABLE and VERIFIED, admitting the exact resolved instance.');
    }

    // ===============================================================
    // Section K2 — 0.9.595: the same AVAILABLE + VERIFIED gate still
    // excludes everything it always excluded (UNVERIFIABLE, REJECTED,
    // UNAVAILABLE) — admitToRepositoryDiscovery()'s own gate is reused
    // verbatim, never loosened for this new call site.
    // ===============================================================
    {
        const publicationId = 'repository-boundary-pub-k2';
        const contentHash = 'repository-boundary-hash-k2';
        const storageProvider = new InMemoryStorageProvider();
        knowPublicationLocally(storageProvider, { id: publicationId, contentHash });
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        // A verifier that never confirms this identity — verification.status
        // resolves to UNVERIFIABLE/REJECTED, never VERIFIED.
        const verifier = new MapVerifier({});

        let addCalls = 0;
        const discoveryProvider = { add: () => { addCalls += 1; } };

        const ctx = buildCanvasInstance({ materialSources: { local: localSource }, materialVerifier: verifier, decentralizedPublicationDiscoveryProvider: discoveryProvider });
        ctx.selectObserverLocalEncounter({ publicationId, contentHash });
        await flush();
        assert(ctx.observerLocalEncounterInspection.loading.status === 'AVAILABLE', 'K2-0. Sanity: material was found.');
        assert(ctx.observerLocalEncounterInspection.verification.status !== 'VERIFIED', 'K2-1. Sanity: verification did NOT confirm — UNVERIFIABLE or REJECTED.');
        assert(addCalls === 0, 'K2-2. An AVAILABLE-but-not-VERIFIED observer-local resolution is still never admitted — the exact same exclusion admitToRepositoryDiscovery() already applied to the primary encounter family.');
        console.log('✓ K2 — an unverified observer-local resolution is still excluded from Repository admission, exactly like its primary-encounter sibling.');
    }

    // ===============================================================
    // Section K3 — 0.9.595: Repository admission never creates a
    // PlacementRecord, and claimedPosition remains completely unread.
    // ===============================================================
    {
        const host = makeHost('0.9.595-section-k3');
        const publicationId = 'no-auto-placement-pub-k3';
        const maliciousClaim = { x: 12345, y: 0, z: 12345 };
        const worldModel = makeWorldModel();
        const registry = new WorldDiscoverySourceRegistry();
        const cascade = makeCascade(host, worldModel, registry, { resolveEncounterPosition: () => ({ x: 2, y: 0, z: 2 }) });

        const reference = await placeAndAnnounce(host, 'novel-bytes-k3', { publicationId, claimedPosition: maliciousClaim });
        const [candidate] = await host.discoverSnapshotCandidatesCommand();
        const result = await cascade.processCandidate(candidate);
        assert(result.encounter !== null, 'K3-0. Sanity.');

        const storageProvider = new InMemoryStorageProvider();
        knowPublicationLocally(storageProvider, { id: publicationId, contentHash: reference.hash });
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);

        let addCalls = 0;
        const discoveryProvider = { add: () => { addCalls += 1; } };

        const ctx = buildCanvasInstance({ registry, materialSources: { local: localSource }, materialVerifier: new MapVerifier({ [publicationId]: true }), decentralizedPublicationDiscoveryProvider: discoveryProvider });
        ctx.selectObserverLocalEncounter({ publicationId: result.encounter.publicationId, contentHash: result.encounter.contentHash });
        await flush();

        assert(addCalls === 1, 'K3-1. Sanity: Repository admission occurred.');
        assert(worldModel.placementRegistry.findByPublicationId(publicationId).length === 0, 'K3-2. Repository admission never created a PlacementRecord — the malicious claimedPosition never reached the World, admitted or not.');
        console.log('✓ K3 — Repository admission is a fact about which Publication is now knowable, never a fact about where it belongs: no PlacementRecord is ever created by admission, and claimedPosition stays completely unread.');
    }

    // ===============================================================
    // Section L — Structural/mechanical checks against real source.
    // ===============================================================
    {
        const fs = await import('node:fs/promises');
        const canvasSource = (await Promise.all(worldEncounterCanvasFiles().map((file) => fs.readFile(new URL(`../${file}`, import.meta.url), 'utf8')))).join('\n');
        const blockStart = canvasSource.indexOf('world-encounter-observer-local-marker');
        const block = canvasSource.slice(blockStart, canvasSource.indexOf('</g>', blockStart));
        assert(block.includes('@click="selectObserverLocalEncounter(marker)"'), 'L1. The marker binds @click to selectObserverLocalEncounter(), by name.');
        assert(!block.includes('@select'), 'L2. Still never @select — a genuinely separate event, never a repurposing of the existing WorldEncounterMarker emission contract.');
        assert(!block.includes('<WorldEncounterMarker'), 'L3. Still a plain <g>, never a <WorldEncounterMarker> — never entering the existing selection component.');

        // dismissObserverLocalEncounterInspection() clears both pieces of
        // state and bumps the request-counter guard (Section J already
        // proved the guard's own effect; this checks the method's own
        // direct, synchronous contract).
        const ctx = buildCanvasInstance({});
        ctx.selectedObserverLocalEncounter = { publicationId: 'x', contentHash: 'y' };
        ctx.observerLocalEncounterInspection = { fake: true };
        const requestIdBefore = ctx.observerLocalEncounterInspectionRequestId;
        ctx.dismissObserverLocalEncounterInspection();
        assert(ctx.selectedObserverLocalEncounter === null && ctx.observerLocalEncounterInspection === null, 'L4. dismissObserverLocalEncounterInspection() clears both pieces of state.');
        assert(ctx.observerLocalEncounterInspectionRequestId === requestIdBefore + 1, 'L5. ...and bumps the request-counter guard by exactly one.');

        console.log('✓ L — structural checks against real, unmodified production source confirm the new capability is additive, narrow, and never a repurposing of the existing selection machinery.');
    }

    console.log('\n✅ All Observer-Local Encounter Inspection Capability tests passed.');
}

runTests().then(() => {
    console.log('\n✓ All ObserverLocalEncounterInspectionCapability tests passed');
}).catch((error) => {
    console.error('\n✗ ObserverLocalEncounterInspectionCapability tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
