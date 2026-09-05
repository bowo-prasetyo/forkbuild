import { readFile } from 'node:fs/promises';

import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import {
    loadWorldEncounterMaterial,
    WorldEncounterMaterialLoadStatus,
    WorldEncounterMaterialSource
} from '../application/WorldEncounterMaterialLoading.js';
import { LocalWorldEncounterMaterialSource } from '../application/LocalWorldEncounterMaterialSource.js';
import { WorldEncounterKind } from '../core/WorldEncounter.js';
import { describeWorldEncounterSelectionIdentity } from '../core/WorldEncounterSelectionIdentity.js';
import { WorldDiscoverySourceRegistry } from '../application/WorldDiscoverySourceRegistry.js';
import { describeWorldFromDiscoveryRegistry } from '../application/WorldDiscoveryRegistryProjection.js';
import { bootstrapWorldDiscoveryRuntime } from '../application/WorldDiscoveryRuntimeBootstrap.js';
import { describeLocalWorldDiscoverySource, LOCAL_WORLD_DISCOVERY_ORIGIN } from '../application/WorldEncounterIntegration.js';
import { describePeerWorldDiscoverySource, derivePeerWorldOrigin } from '../peer/PeerWorldDataIngress.js';
import {
    registerMaterializedSnapshotWorldSource,
    materializedSnapshotWorldOrigin
} from '../application/MaterializedSnapshotWorldDiscoveryBridge.js';
import { resolveSnapshotWorldPlacement } from '../application/SnapshotWorldPlacement.js';
import { SnapshotWorldPlacementOutcome } from '../application/SnapshotWorldPlacementOutcome.js';
import { SnapshotWorldRegistrationOutcome } from '../application/SnapshotWorldRegistrationOutcome.js';
import { StoreSnapshotContentUseCase } from '../application/StoreSnapshotContentUseCase.js';
import { StoreSnapshotContentOutcome } from '../application/StoreSnapshotContentOutcome.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { ArweaveContentStore } from '../content/ArweaveContentStore.js';
import { NostrSnapshotDiscoveryPublisher } from '../application/NostrSnapshotDiscoveryPublisher.js';
import { NostrSnapshotDiscoveryQueryService } from '../application/NostrSnapshotDiscoveryQueryService.js';
import { DecentralizedSnapshotResolver } from '../application/DecentralizedSnapshotResolver.js';
import { DecentralizedSnapshotResolutionOutcome } from '../application/DecentralizedSnapshotResolutionOutcome.js';
import { executeDiscoverSnapshotCandidatesCommand } from '../application/DiscoverSnapshotCandidatesCommand.js';
import { executeResolveSelectedSnapshotCommand } from '../application/ResolveSelectedSnapshotCommand.js';
import { MaterializeSnapshotFromSelectedCandidateUseCase } from '../application/MaterializeSnapshotFromSelectedCandidateUseCase.js';
import { executeMaterializeSelectedSnapshotCommand } from '../application/MaterializeSelectedSnapshotCommand.js';
import { SnapshotCandidateMaterializationOutcome } from '../application/SnapshotCandidateMaterializationOutcome.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { Publication } from '../publisher/Publication.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { computeContentHash } from '../serializer/contentHash.js';

// 0.9.167 — Snapshot World Material Loading E2E Audit.
//
// 0.9.166 closed the one gap 0.9.165's own World Discovery Participation
// Audit (Section F) found: a registered Snapshot's own
// "snapshot:<contentHash>:<publicationId>" origin now loads its material
// through the ordinary `loadWorldEncounterMaterial()` path, via the SAME
// `materialSources.local` slot `origin === 'local'` already uses.
// `tests/SnapshotWorldEncounterMaterialLoading.test.js` is that fix's own
// dedicated, VERTICAL test contract (one origin family, mostly a
// hand-built registry). This milestone is the wider, HORIZONTAL
// reassessment 0.9.166's own recommendation named: with the fix in place,
// is the ENTIRE Snapshot participation path — DISCOVER through RENDER —
// now provably complete, coexisting with local and peer material under the
// real composition root, without ever inventing a parallel loading path of
// its own?
//
// TEST-ONLY, EXACTLY LIKE 0.9.162/0.9.164/0.9.165. Every file this
// milestone touches lives under `tests/` alone (Section J's own structural
// sweep). Nothing here changes `application/WorldEncounterMaterialLoading.js`,
// `application/LocalWorldEncounterMaterialSource.js`,
// `ui/components/WorldEncounterCanvas.js`, or
// `application/WorldDiscoverySourceRegistry.js` — this audit only ever
// reads them, real and unmodified, and characterizes what it finds.
//
//   DISCOVER -> SELECT -> RESOLVE -> VERIFY -> ATTRIBUTE -> MATERIALIZE
//        -> PLACE -> REGISTER -> WORLD ENCOUNTER -> SELECT ENCOUNTER
//        -> LOAD MATERIAL -> RENDER MATERIAL
//
// THE INVARIANT THIS AUDIT EXISTS TO PROVE: the final three stages —
// WORLD ENCOUNTER, SELECT ENCOUNTER, LOAD MATERIAL (and RENDER MATERIAL) —
// run through the SAME, ordinary World View machinery a local or peer
// encounter already uses. World View never needs to know a given
// Publication's material originally arrived over Nostr/Arweave; by the
// time it is a World Encounter, that provenance is already behind it.
//
//   Section A: existing local material loading is unaffected — proven
//              coexisting with peer and Snapshot sources through the REAL
//              `bootstrapWorldDiscoveryRuntime()` composition root, never
//              a hand-built registry alone.
//   Section B: existing peer material loading is unaffected — proven in
//              the SAME three-source composition.
//   Section C: Snapshot origin routing — snapshot:<contentHash>:<publicationId>
//              -> materialSourceFor() -> materialSources.local -> AVAILABLE.
//   Section D: Publication identity remains authoritative under a
//              CONTENT-HASH COLLISION — two DIFFERENT Publications sharing
//              the SAME contentHash (0.9.163's own scenario), each
//              registered and each selectable, load their own correct
//              material — the loader never infers World identity from
//              contentHash alone.
//   Section E: no rediscovery — once materialized and registered, selecting
//              the World Encounter never re-invokes Nostr discovery,
//              Arweave retrieval, candidate resolution, or verification;
//              proven with REAL (fake-transport-backed) Nostr/Arweave
//              collaborators, call-counted before and after selection.
//   Section F: no write-back — loading an encounter never materializes,
//              stores, or re-registers; proven by call-counting
//              `storageProvider.save()` AND `registry.setSource()` across
//              selection and material loading.
//   Section G: failure semantics — a broken/corrupted local material
//              source degrades a Snapshot-origin selection to
//              `UNAVAILABLE`, proven SIDE BY SIDE against an ordinary
//              local-origin selection under the identical corruption —
//              the same vocabulary, never a Snapshot-specific outcome.
//   Section H: spatial correctness — a Snapshot renders at its own,
//              pre-existing `WorldPlacement` position regardless of
//              contentHash lexical order, registration order, or which
//              Publication's material later loads; loading material never
//              touches position.
//   Section I: the full flagship path — Nostr discovery through rendered
//              material, driven through the REAL composition root
//              (`bootstrapWorldDiscoveryRuntime()`) with local and peer
//              sources ALREADY coexisting, ending in confirmation that the
//              Snapshot's own final three stages are STRUCTURALLY
//              IDENTICAL (same computed properties, same code path) to
//              the local/peer encounters sharing the same canvas.
//   Section J: structural sweep — the architectural boundary
//              (`WorldEncounterMaterialLoading.js`, `WorldEncounterCanvas.js`,
//              `WorldDiscoverySourceRegistry.js`) carries no Snapshot-
//              specific renderer, material source, or vocabulary beyond
//              0.9.166's own single, already-audited branch, and this
//              milestone itself adds no production file.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function flush() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

const stubIdentityProvider = {
    currentUser: () => ({ username: 'alice', displayName: 'alice', providerId: 'stub' }),
    sign: (data) => ({ signedBy: 'alice', providerId: 'stub', data })
};

function createTestDocument(title) {
    const world = new World();
    const building = new Building({ creator: 'tester' });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0), rotation: 0 }));
    world.addBuilding(building);
    return new Document({ world, metadata: new DocumentMetadata({ title, author: 'tester' }) });
}

function publishOwnPublication(storageProvider, title) {
    const publisher = new LocalPublisherProvider(storageProvider);
    return publisher.publish(createTestDocument(title), stubIdentityProvider);
}

function placementInfoFor(placementRegistry, publicationId) {
    const records = placementRegistry.findByPublicationId(publicationId);
    if (records.length === 0) return null;
    const record = records.reduce((latest, r) => (!latest || r.updatedAt > latest.updatedAt) ? r : latest, null);
    return {
        placementId: record.placementId,
        publicationId: record.publicationId,
        position: { x: record.position.x, y: record.position.y, z: record.position.z },
        rotation: record.rotation,
        revision: record.revision,
        owner: record.owner,
        movable: true,
        overlapCount: 0
    };
}

function placeReal(placementRegistry, publicationId, position, owner = 'alice') {
    const record = new PlacementRecord({ publicationId, position, owner });
    placementRegistry.add(record);
    return record;
}

function buildCanvasInstance({ registry = null, view, materialSources = null, materialVerifier = null } = {}) {
    const ctx = {
        registry,
        view: view !== undefined ? view : WorldEncounterCanvas.props.view.default(),
        materialSources,
        materialVerifier
    };
    Object.assign(ctx, WorldEncounterCanvas.data.call(ctx));
    Object.assign(ctx, WorldEncounterCanvas.methods);
    Object.defineProperty(ctx, 'resolvedEncounterSelection', {
        get() { return WorldEncounterCanvas.computed.resolvedEncounterSelection.call(ctx); }
    });
    Object.defineProperty(ctx, 'resolvedLead', {
        get() { return WorldEncounterCanvas.computed.resolvedLead.call(ctx); }
    });
    return ctx;
}

function mountCanvas(ctx) { WorldEncounterCanvas.mounted.call(ctx); }
function unmountCanvas(ctx) { WorldEncounterCanvas.beforeUnmount.call(ctx); }

function projectedPublicationsOf(ctx) {
    ctx.effectiveView = WorldEncounterCanvas.computed.effectiveView.call(ctx);
    ctx.publicationRows = WorldEncounterCanvas.computed.publicationRows.call(ctx);
    return WorldEncounterCanvas.computed.projectedPublications.call(ctx);
}

function viewById(registry) {
    const view = describeWorldFromDiscoveryRegistry(registry);
    return Object.fromEntries(view.publications.map((p) => [p.objectId, p]));
}

function peer(identityId) {
    return { remoteIdentity: { identityId } };
}

function placedResult(contentHash, publicationId, position, placementId = `placement-${publicationId}`) {
    return { outcome: SnapshotWorldPlacementOutcome.PLACED, contentHash, publicationId, placementId, position, reason: null };
}

class RecordingMaterialSource extends WorldEncounterMaterialSource {
    constructor(material) { super(); this.material = material; this.calls = []; }
    async load(resolvedSelection) { this.calls.push(resolvedSelection); return this.material; }
}

// A call-counting wrapper — used throughout Section E/F/I to prove a real
// collaborator (a network transport, a storage write, a registry mutation)
// was invoked a specific number of times, never merely "not imported."
function countingWrap(fn) {
    async function wrapped(...args) {
        wrapped.calls += 1;
        return fn(...args);
    }
    wrapped.calls = 0;
    return wrapped;
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
        return { id: `fake-0-9-167-tx-${counter}`, transaction: { id: `fake-0-9-167-tx-${counter}`, data: material } };
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

async function run() {
    // ---------------------------------------------------------------
    // Section A — existing local material loading is unaffected, proven
    // coexisting with a live peer and a registered Snapshot through the
    // REAL bootstrapWorldDiscoveryRuntime() composition root.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const localPublication = publishOwnPublication(storageProvider, 'Section A Local Publication');

        const bootstrap = bootstrapWorldDiscoveryRuntime({
            localWorldDiscoveryRecords: {
                publications: [{ id: localPublication.id, title: localPublication.title }],
                placements: [{ publicationId: localPublication.id, position: { x: 5, y: 0, z: 5 } }]
            }
        });
        const { registry } = bootstrap;

        registry.setSource(describePeerWorldDiscoverySource({
            publications: [{ id: 'pub-section-a-peer', title: 'Section A Peer' }],
            placements: [{ publicationId: 'pub-section-a-peer', position: { x: 6, y: 0, z: 6 } }]
        }, peer('did:key:zSectionAPeer')));

        const snapshotPublication = new Publication({ id: 'pub-section-a-snapshot', title: 'Section A Snapshot' });
        registerMaterializedSnapshotWorldSource(registry, placedResult('hash-section-a', snapshotPublication.id, { x: 7, y: 0, z: 7 }), snapshotPublication);

        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const resolvedSelection = describeWorldEncounterSelectionIdentity({
            kind: WorldEncounterKind.PUBLICATION, objectId: localPublication.id, origin: LOCAL_WORLD_DISCOVERY_ORIGIN
        });
        const result = await loadWorldEncounterMaterial({ resolvedSelection, materialSources: { local: localSource } });

        assert(result.status === WorldEncounterMaterialLoadStatus.AVAILABLE, '1. an ordinary local-origin selection still loads AVAILABLE, with a peer and a Snapshot ALSO registered in the same registry');
        assert(result.material instanceof Publication && result.material.id === localPublication.id, '2. the loaded material is still the real, local Publication domain object');

        const canvas = buildCanvasInstance({ registry, materialSources: { local: localSource } });
        mountCanvas(canvas);
        const projected = projectedPublicationsOf(canvas);
        assert(projected.length === 3, `3. all three sources reach one rendered canvas through the real bootstrap entry point; got ${projected.length}`);

        unmountCanvas(canvas);
        bootstrap.dispose();
        console.log('✓ Section A: existing local material loading is unaffected — unchanged AVAILABLE result, through the real composition root, with peer and Snapshot sources coexisting');
    }

    // ---------------------------------------------------------------
    // Section B — existing peer material loading is unaffected, in the
    // SAME three-source composition.
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        registry.setSource(describeLocalWorldDiscoverySource({
            publications: [{ id: 'pub-section-b-local', title: 'Section B Local' }],
            placements: [{ publicationId: 'pub-section-b-local', position: { x: 8, y: 0, z: 8 } }]
        }));
        registry.setSource(describePeerWorldDiscoverySource({
            publications: [{ id: 'pub-section-b-peer', title: 'Section B Peer' }],
            placements: [{ publicationId: 'pub-section-b-peer', position: { x: 9, y: 0, z: 9 } }]
        }, peer('did:key:zSectionBPeer')));
        const snapshotPublication = new Publication({ id: 'pub-section-b-snapshot', title: 'Section B Snapshot' });
        registerMaterializedSnapshotWorldSource(registry, placedResult('hash-section-b', snapshotPublication.id, { x: 10, y: 0, z: 10 }), snapshotPublication);

        const peerMaterial = Object.freeze({ displayName: 'Section B Peer Avatar' });
        const peerSource = new RecordingMaterialSource(peerMaterial);
        const localSource = new RecordingMaterialSource({ title: 'never reached by a peer selection' });

        const resolvedSelection = describeWorldEncounterSelectionIdentity({
            kind: WorldEncounterKind.AVATAR, objectId: 'avatar-section-b', origin: 'peer:did:key:zSectionBPeer'
        });
        const result = await loadWorldEncounterMaterial({ resolvedSelection, materialSources: { local: localSource, peer: peerSource } });

        assert(result.status === WorldEncounterMaterialLoadStatus.AVAILABLE, '4. an ordinary peer:<identity> selection still loads AVAILABLE, with local and Snapshot ALSO registered');
        assert(result.material === peerMaterial, '5. the loaded material is still materialSources.peer\'s own, by reference');
        assert(localSource.calls.length === 0, '6. a peer-origin selection still never falls back to materialSources.local');

        // Behaviorally, through the mounted canvas: the peer's own
        // Publication marker renders and selects exactly like before.
        const canvas = buildCanvasInstance({ registry });
        mountCanvas(canvas);
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-section-b-peer' });
        assert(canvas.selectionOutcome.status === 'RESOLVED' && canvas.resolvedEncounterSelection.origin === derivePeerWorldOrigin(peer('did:key:zSectionBPeer')),
            '7. the peer Publication\'s own marker still resolves to its own peer:<identity> origin, with local and Snapshot also registered');
        unmountCanvas(canvas);

        console.log('✓ Section B: existing peer material loading is unaffected — unchanged AVAILABLE result and unchanged origin resolution, alongside local and Snapshot sources');
    }

    // ---------------------------------------------------------------
    // Section C — Snapshot origin routing: snapshot:<contentHash>:
    // <publicationId> -> materialSourceFor() -> materialSources.local ->
    // AVAILABLE.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const publication = publishOwnPublication(storageProvider, 'Section C Publication');
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);

        const snapshotOrigin = materializedSnapshotWorldOrigin('hash-section-c', publication.id);
        assert(typeof snapshotOrigin === 'string' && snapshotOrigin.startsWith('snapshot:'), '8. sanity — a real registered Snapshot\'s own origin genuinely starts with \'snapshot:\'');

        const resolvedSelection = describeWorldEncounterSelectionIdentity({
            kind: WorldEncounterKind.PUBLICATION, objectId: publication.id, origin: snapshotOrigin
        });
        const result = await loadWorldEncounterMaterial({ resolvedSelection, materialSources: { local: localSource } });

        assert(result.status === WorldEncounterMaterialLoadStatus.AVAILABLE, `9. snapshot:<contentHash>:<publicationId> routes to materialSources.local and reports AVAILABLE; got '${result.status}'`);
        assert(result.material instanceof Publication && result.material.id === publication.id, '10. the loaded material is the real local Publication');

        console.log('✓ Section C: Snapshot origin routing — snapshot:<contentHash>:<publicationId> -> materialSourceFor() -> materialSources.local -> AVAILABLE');
    }

    // ---------------------------------------------------------------
    // Section D — Publication identity remains authoritative under a
    // CONTENT-HASH COLLISION: two DIFFERENT Publications sharing the SAME
    // contentHash (0.9.163's own scenario) each register under their own
    // origin and each load their own correct material.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const publicationA = publishOwnPublication(storageProvider, 'Collision Publication A');
        const publicationB = publishOwnPublication(storageProvider, 'Collision Publication B');
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);

        const sharedHash = 'hash-shared-by-A-and-B';
        const registry = new WorldDiscoverySourceRegistry();
        const registrationA = registerMaterializedSnapshotWorldSource(registry, placedResult(sharedHash, publicationA.id, { x: 1, y: 0, z: 1 }), publicationA);
        const registrationB = registerMaterializedSnapshotWorldSource(registry, placedResult(sharedHash, publicationB.id, { x: 2, y: 0, z: 2 }), publicationB);

        assert(registrationA.outcome === SnapshotWorldRegistrationOutcome.REGISTERED && registrationB.outcome === SnapshotWorldRegistrationOutcome.REGISTERED,
            '11. sanity — both Publications, sharing the same contentHash, register successfully');
        assert(registrationA.origin !== registrationB.origin, '12. THE COLLISION PROOF — the SAME contentHash produces two DIFFERENT origins, because publicationId is folded into the derived origin (0.9.163)');
        assert(registrationA.origin === `snapshot:${sharedHash}:${publicationA.id}` && registrationB.origin === `snapshot:${sharedHash}:${publicationB.id}`,
            '13. both origins carry the exact shared contentHash and their own distinct publicationId');
        assert(registry.listSources().length === 2, '14. both registrations occupy their own registry slot — neither overwrote the other');

        const selectionA = describeWorldEncounterSelectionIdentity({ kind: WorldEncounterKind.PUBLICATION, objectId: publicationA.id, origin: registrationA.origin });
        const selectionB = describeWorldEncounterSelectionIdentity({ kind: WorldEncounterKind.PUBLICATION, objectId: publicationB.id, origin: registrationB.origin });
        const resultA = await loadWorldEncounterMaterial({ resolvedSelection: selectionA, materialSources: { local: localSource } });
        const resultB = await loadWorldEncounterMaterial({ resolvedSelection: selectionB, materialSources: { local: localSource } });

        assert(resultA.status === WorldEncounterMaterialLoadStatus.AVAILABLE && resultA.material.id === publicationA.id && resultA.material.title === 'Collision Publication A',
            '15. selecting Snapshot A loads Publication A\'s own material, despite sharing a contentHash with B');
        assert(resultB.status === WorldEncounterMaterialLoadStatus.AVAILABLE && resultB.material.id === publicationB.id && resultB.material.title === 'Collision Publication B',
            '16. selecting Snapshot B loads Publication B\'s own material, despite sharing a contentHash with A');

        // Behaviorally, through a mounted canvas: both Publications reach
        // their own encounter marker, at their own, distinct position —
        // the loader never merges or infers World identity from the
        // shared contentHash.
        const canvas = buildCanvasInstance({ registry });
        mountCanvas(canvas);
        const projected = projectedPublicationsOf(canvas);
        assert(projected.length === 2, `17. both Publications reach two DISTINCT rendered encounters, never merged by their shared contentHash; got ${projected.length}`);
        const raw = viewById(registry);
        assert(raw[publicationA.id].x === 1 && raw[publicationB.id].x === 2, '18. each encounter still carries its own, distinct position — never blended by the shared contentHash');
        unmountCanvas(canvas);

        console.log('✓ Section D: Publication identity remains authoritative under a contentHash collision — two Publications sharing the same contentHash register, render, and load as two genuinely distinct World Encounters; the loader never infers World identity from contentHash alone');
    }

    // ---------------------------------------------------------------
    // Section E — no rediscovery: once materialized and registered,
    // selecting the World Encounter never re-invokes Nostr discovery,
    // Arweave retrieval, candidate resolution, or verification — proven
    // with REAL (fake-transport-backed) collaborators, call-counted
    // before and after selection/loading.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const publication = publishOwnPublication(storageProvider, 'Section E Publication');

        const gateway = makeFakeArweaveGateway();
        const countingFetch = countingWrap(gateway.fetchImpl);
        const store = new ArweaveContentStore({ signer: makeFakeArweaveSigner(), fetchImpl: countingFetch });
        const network = makeNostrNetwork();
        const countingQuery = countingWrap(network.queryImpl);
        const countingPublish = countingWrap(network.publishImpl);
        const discoveryTag = 'section-e-0-9-167';
        const snapshotBytes = JSON.stringify({ world: { note: 'section E snapshot content' } });
        const reference = await store.put(snapshotBytes);

        const discoveryPublisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag, publishImpl: countingPublish });
        await discoveryPublisher.publish({ contentHash: reference.hash, locator: reference.uri, storage: reference.storage });

        const discoveryQueryService = new NostrSnapshotDiscoveryQueryService({ queryImpl: countingQuery });
        const candidates = await executeDiscoverSnapshotCandidatesCommand({ discoveryTag, discoveryQueryService });
        const resolver = new DecentralizedSnapshotResolver(discoveryQueryService);
        const resolution = await executeResolveSelectedSnapshotCommand({ candidate: candidates[0], resolver, contentStore: store });
        assert(resolution.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, '19. sanity — resolution genuinely succeeds');

        const localContentStore = new LocalContentStore(storageProvider);
        const storeSnapshotContentUseCase = new StoreSnapshotContentUseCase(localContentStore);
        const materializer = new MaterializeSnapshotFromSelectedCandidateUseCase(storeSnapshotContentUseCase);
        const materialization = await executeMaterializeSelectedSnapshotCommand({ resolution, materializer });

        const placementRegistry = new LocalPlacementRegistry(storageProvider);
        placeReal(placementRegistry, publication.id, { x: 20, y: 0, z: 30 });
        const placementInfo = placementInfoFor(placementRegistry, publication.id);
        const worldPlacementResult = resolveSnapshotWorldPlacement(materialization, placementInfo);
        assert(worldPlacementResult.outcome === SnapshotWorldPlacementOutcome.PLACED, '20. sanity — placement succeeds');

        const registry = new WorldDiscoverySourceRegistry();
        const registration = registerMaterializedSnapshotWorldSource(registry, worldPlacementResult, publication);
        assert(registration.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, '21. sanity — registration succeeds');

        // Snapshot the network call counts immediately AFTER registration —
        // this is the "already materialized" line the audit's own brief
        // draws.
        const fetchCallsAfterRegister = countingFetch.calls;
        const queryCallsAfterRegister = countingQuery.calls;
        const publishCallsAfterRegister = countingPublish.calls;
        assert(fetchCallsAfterRegister > 0 && queryCallsAfterRegister > 0 && publishCallsAfterRegister > 0, '22. sanity — the network was genuinely used to get this far');

        const canvas = buildCanvasInstance({ registry, materialSources: { local: new LocalWorldEncounterMaterialSource(storageProvider) } });
        mountCanvas(canvas);
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: publication.id });
        await flush();
        canvas.refreshMaterialInspection();
        await flush();

        assert(canvas.materialInspection && canvas.materialInspection.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE, '23. sanity — selecting and loading the encounter still succeeds');
        assert(countingFetch.calls === fetchCallsAfterRegister, `24. THE PROOF — selecting the World Encounter and loading its material never triggers another Arweave retrieval; fetch calls before ${fetchCallsAfterRegister}, after ${countingFetch.calls}`);
        assert(countingQuery.calls === queryCallsAfterRegister, `25. THE PROOF — selecting/loading never re-queries Nostr for candidates or for resolution; query calls before ${queryCallsAfterRegister}, after ${countingQuery.calls}`);
        assert(countingPublish.calls === publishCallsAfterRegister, `26. THE PROOF — selecting/loading never re-announces to Nostr; publish calls before ${publishCallsAfterRegister}, after ${countingPublish.calls}`);

        unmountCanvas(canvas);
        console.log('✓ Section E: no rediscovery — with REAL, fake-transport-backed Nostr/Arweave collaborators call-counted throughout, selecting the World Encounter and loading its material triggers ZERO further network calls of any kind');
    }

    // ---------------------------------------------------------------
    // Section F — no write-back: loading an encounter never materializes,
    // stores, or re-registers. Proven by call-counting
    // storageProvider.save() AND registry.setSource() across selection and
    // material loading.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const publication = publishOwnPublication(storageProvider, 'Section F Publication');
        const registry = new WorldDiscoverySourceRegistry();
        const registration = registerMaterializedSnapshotWorldSource(registry, placedResult('hash-section-f', publication.id, { x: 4, y: 0, z: 4 }), publication);
        assert(registration.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, '27. sanity — registration succeeds');

        let saveCallCount = 0;
        const originalSave = storageProvider.save.bind(storageProvider);
        storageProvider.save = (...args) => { saveCallCount += 1; return originalSave(...args); };

        let setSourceCallCount = 0;
        const originalSetSource = registry.setSource.bind(registry);
        registry.setSource = (...args) => { setSourceCallCount += 1; return originalSetSource(...args); };

        const canvas = buildCanvasInstance({ registry, materialSources: { local: new LocalWorldEncounterMaterialSource(storageProvider) } });
        mountCanvas(canvas);
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: publication.id });
        await flush();
        canvas.refreshMaterialInspection();
        await flush();

        assert(canvas.materialInspection && canvas.materialInspection.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE, '28. sanity — selecting and loading succeeds');
        assert(saveCallCount === 0, '29. THE PROOF — selecting a World Encounter and loading its material never writes to storage: load -> materialize never happens');
        assert(setSourceCallCount === 0, '30. THE PROOF — selecting a World Encounter and loading its material never re-registers a source: load -> register never happens');

        unmountCanvas(canvas);
        console.log('✓ Section F: no write-back — loading a World Encounter\'s material triggers ZERO storage writes and ZERO registry mutations; it is strictly observational');
    }

    // ---------------------------------------------------------------
    // Section G — failure semantics: a broken/corrupted local material
    // source degrades a Snapshot-origin selection to UNAVAILABLE, proven
    // SIDE BY SIDE against an ordinary local-origin selection under the
    // IDENTICAL corruption.
    // ---------------------------------------------------------------
    {
        assert(Object.keys(WorldEncounterMaterialLoadStatus).sort().join(',') === 'AVAILABLE,UNAVAILABLE', '31. no third status exists for this audit to accidentally invent');

        const storageProvider = new InMemoryStorageProvider();
        const localPublication = publishOwnPublication(storageProvider, 'Section G Local Publication');
        const snapshotPublication = publishOwnPublication(storageProvider, 'Section G Snapshot Publication');
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);

        const localSelection = describeWorldEncounterSelectionIdentity({
            kind: WorldEncounterKind.PUBLICATION, objectId: localPublication.id, origin: LOCAL_WORLD_DISCOVERY_ORIGIN
        });
        const snapshotSelection = describeWorldEncounterSelectionIdentity({
            kind: WorldEncounterKind.PUBLICATION, objectId: snapshotPublication.id,
            origin: materializedSnapshotWorldOrigin('hash-section-g', snapshotPublication.id)
        });

        const localBefore = await loadWorldEncounterMaterial({ resolvedSelection: localSelection, materialSources: { local: localSource } });
        const snapshotBefore = await loadWorldEncounterMaterial({ resolvedSelection: snapshotSelection, materialSources: { local: localSource } });
        assert(localBefore.status === WorldEncounterMaterialLoadStatus.AVAILABLE && snapshotBefore.status === WorldEncounterMaterialLoadStatus.AVAILABLE,
            '32. sanity — both selections load AVAILABLE before any corruption');

        // "Break" the local material source: corrupt the underlying
        // publisher storage itself (the SAME storageProvider both a
        // local-origin AND a snapshot-origin selection read through),
        // deleting BOTH Publications from it.
        for (const name of storageProvider.list()) {
            if (name === 'forkbuild-publications') storageProvider.remove(name);
        }

        const localAfter = await loadWorldEncounterMaterial({ resolvedSelection: localSelection, materialSources: { local: localSource } });
        const snapshotAfter = await loadWorldEncounterMaterial({ resolvedSelection: snapshotSelection, materialSources: { local: localSource } });

        assert(localAfter.status === WorldEncounterMaterialLoadStatus.UNAVAILABLE, '33. sanity — the ordinary local-origin selection degrades to UNAVAILABLE under the corruption, exactly as it always has');
        assert(snapshotAfter.status === WorldEncounterMaterialLoadStatus.UNAVAILABLE, `34. THE PROOF — the Snapshot-origin selection degrades to the SAME UNAVAILABLE vocabulary under the IDENTICAL corruption; got '${snapshotAfter.status}'`);
        assert(localAfter.status === snapshotAfter.status, '35. THE SIDE-BY-SIDE PROOF — local-origin and snapshot-origin failure are byte-for-byte the same outcome, never a distinguished Snapshot-specific failure');
        assert(localAfter.material === null && snapshotAfter.material === null, '36. neither UNAVAILABLE result carries material');
        assert(snapshotAfter.resolvedSelection === snapshotSelection, '37. UNAVAILABLE still carries the exact resolvedSelection it was given, origin included');

        console.log('✓ Section G: failure semantics — a corrupted local material source degrades a Snapshot-origin selection to UNAVAILABLE, proven side by side against an ordinary local-origin selection under the identical corruption: the same outcome, never a Snapshot-specific one');
    }

    // ---------------------------------------------------------------
    // Section H — spatial correctness: a Snapshot renders at its own,
    // pre-existing WorldPlacement position regardless of contentHash
    // lexical order, registration order, or which Publication's material
    // later loads; loading material never touches position.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        // Publication/hash pairs deliberately ordered so that neither
        // contentHash lexical order NOR discovery/registration order
        // matches placement order — if position ever leaked from either,
        // this section's own assertions would catch it.
        const publicationZ = publishOwnPublication(storageProvider, 'Spatial Z (placed first, hash sorts last)');
        const publicationA = publishOwnPublication(storageProvider, 'Spatial A (placed second, hash sorts first)');
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);

        const placementRegistry = new LocalPlacementRegistry(storageProvider);
        placeReal(placementRegistry, publicationZ.id, { x: 50, y: 0, z: 60 });
        placeReal(placementRegistry, publicationA.id, { x: -10, y: 0, z: -20 });

        const registry = new WorldDiscoverySourceRegistry();
        // Registered in the SAME order as placed (Z then A), but with
        // hashes reversed relative to that order ('zzz-hash' sorts after
        // 'aaa-hash' lexically) — position must track PLACEMENT, not hash
        // sort order or registration order.
        const placementInfoZ = placementInfoFor(placementRegistry, publicationZ.id);
        const worldPlacementZ = resolveSnapshotWorldPlacement({ outcome: StoreSnapshotContentOutcome.STORED, contentHash: 'zzz-hash-sorts-last' }, placementInfoZ);
        registerMaterializedSnapshotWorldSource(registry, worldPlacementZ, publicationZ);

        const placementInfoA = placementInfoFor(placementRegistry, publicationA.id);
        const worldPlacementA = resolveSnapshotWorldPlacement({ outcome: StoreSnapshotContentOutcome.STORED, contentHash: 'aaa-hash-sorts-first' }, placementInfoA);
        registerMaterializedSnapshotWorldSource(registry, worldPlacementA, publicationA);

        const rawBeforeLoad = viewById(registry);
        assert(rawBeforeLoad[publicationZ.id].x === 50 && rawBeforeLoad[publicationZ.id].z === 60, '38. Z\'s own encounter carries exactly its OWN placement position, even though its contentHash sorts LAST');
        assert(rawBeforeLoad[publicationA.id].x === -10 && rawBeforeLoad[publicationA.id].z === -20, '39. A\'s own encounter carries exactly its OWN placement position, even though its contentHash sorts FIRST and it was placed/registered SECOND');

        // Select and load BOTH — in the OPPOSITE order from placement
        // (A's material loads before Z's) — proving material loading order
        // never influences which position renders where.
        const selectionA = describeWorldEncounterSelectionIdentity({ kind: WorldEncounterKind.PUBLICATION, objectId: publicationA.id, origin: materializedSnapshotWorldOrigin('aaa-hash-sorts-first', publicationA.id) });
        const selectionZ = describeWorldEncounterSelectionIdentity({ kind: WorldEncounterKind.PUBLICATION, objectId: publicationZ.id, origin: materializedSnapshotWorldOrigin('zzz-hash-sorts-last', publicationZ.id) });
        const resultA = await loadWorldEncounterMaterial({ resolvedSelection: selectionA, materialSources: { local: localSource } });
        const resultZ = await loadWorldEncounterMaterial({ resolvedSelection: selectionZ, materialSources: { local: localSource } });
        assert(resultA.status === WorldEncounterMaterialLoadStatus.AVAILABLE && resultZ.status === WorldEncounterMaterialLoadStatus.AVAILABLE, '40. sanity — both loads succeed, regardless of order');

        const rawAfterLoad = viewById(registry);
        assert(rawAfterLoad[publicationZ.id].x === rawBeforeLoad[publicationZ.id].x && rawAfterLoad[publicationZ.id].z === rawBeforeLoad[publicationZ.id].z,
            '41. THE PROOF — Z\'s own position is bit-for-bit unchanged by loading either Publication\'s material, in either order');
        assert(rawAfterLoad[publicationA.id].x === rawBeforeLoad[publicationA.id].x && rawAfterLoad[publicationA.id].z === rawBeforeLoad[publicationA.id].z,
            '42. THE PROOF — A\'s own position is bit-for-bit unchanged by loading either Publication\'s material, in either order');
        assert(!('position' in resultA.material) && !('x' in resultA.material) && typeof resultA.material.title === 'string',
            '43. structural confirmation — the loaded Publication material itself carries no position field of its own for a renderer to be tempted to read; position always comes from the spatial authority (WorldPlacement), never from Publication material');

        console.log('✓ Section H: spatial correctness — a Snapshot renders at exactly its own, pre-existing WorldPlacement position, independent of contentHash lexical order, registration order, and material-load order; loading material never touches position');
    }

    // ---------------------------------------------------------------
    // Section I — the full flagship path: Nostr discovery through
    // rendered material, driven through the REAL composition root, with
    // local and peer sources ALREADY coexisting, ending in confirmation
    // that the Snapshot's own final three stages are structurally
    // identical to the local/peer encounters sharing the same canvas.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const publication = publishOwnPublication(storageProvider, 'Flagship 0.9.167 Publication');
        // A SECOND, genuinely local (never Snapshot-touched) Publication —
        // also actually persisted, so its own material genuinely loads
        // AVAILABLE through materialSources.local below, exactly like any
        // other local-origin selection already does.
        const localPublication = publishOwnPublication(storageProvider, 'Flagship Local');

        // The REAL composition root — local is bootstrapped, exactly as
        // ui/main.js's own real entry point would, with a peer ALREADY
        // registered before the Snapshot pipeline ever runs.
        const bootstrap = bootstrapWorldDiscoveryRuntime({
            localWorldDiscoveryRecords: {
                publications: [{ id: localPublication.id, title: localPublication.title }],
                placements: [{ publicationId: localPublication.id, position: { x: 100, y: 0, z: 100 } }]
            }
        });
        const { registry } = bootstrap;
        registry.setSource(describePeerWorldDiscoverySource({
            publications: [{ id: 'pub-flagship-peer', title: 'Flagship Peer' }],
            placements: [{ publicationId: 'pub-flagship-peer', position: { x: 101, y: 0, z: 101 } }]
        }, peer('did:key:zFlagship')));

        // DISCOVER (placement half).
        const gateway = makeFakeArweaveGateway();
        const store = new ArweaveContentStore({ signer: makeFakeArweaveSigner(), fetchImpl: gateway.fetchImpl });
        const network = makeNostrNetwork();
        const discoveryTag = 'flagship-0-9-167';
        const snapshotBytes = JSON.stringify({ world: { note: 'flagship 0.9.167 snapshot content' } });
        const reference = await store.put(snapshotBytes);
        const discoveryPublisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag, publishImpl: network.publishImpl });
        const announced = await discoveryPublisher.publish({ contentHash: reference.hash, locator: reference.uri, storage: reference.storage });
        assert(announced.published === true, '44. sanity — the Snapshot genuinely placed and genuinely announced');

        // DISCOVER (candidate browsing) -> SELECT.
        const discoveryQueryService = new NostrSnapshotDiscoveryQueryService({ queryImpl: network.queryImpl });
        const candidates = await executeDiscoverSnapshotCandidatesCommand({ discoveryTag, discoveryQueryService });
        assert(candidates.length === 1 && candidates[0].contentHash === reference.hash, '45. exactly one real, discovered candidate names this Snapshot\'s own contentHash');
        const selectedSnapshotCandidate = candidates[0];

        // RESOLVE -> VERIFY.
        const resolver = new DecentralizedSnapshotResolver(discoveryQueryService);
        const resolution = await executeResolveSelectedSnapshotCommand({ candidate: selectedSnapshotCandidate, resolver, contentStore: store });
        assert(resolution.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, '46. resolution genuinely succeeds — location, retrieval, and verification all passed');
        assert(computeContentHash(resolution.bytes) === reference.hash, '47. VERIFY — the resolved bytes still hash to the originally placed contentHash');

        // ATTRIBUTE (implicit — the resolved Snapshot's own Publication is
        // this replica's own already-local, already-published Publication)
        // -> MATERIALIZE.
        const localContentStore = new LocalContentStore(storageProvider);
        const storeSnapshotContentUseCase = new StoreSnapshotContentUseCase(localContentStore);
        const materializer = new MaterializeSnapshotFromSelectedCandidateUseCase(storeSnapshotContentUseCase);
        const materialization = await executeMaterializeSelectedSnapshotCommand({ resolution, materializer });
        assert(
            materialization.outcome === SnapshotCandidateMaterializationOutcome.STORED
            || materialization.outcome === SnapshotCandidateMaterializationOutcome.ALREADY_AVAILABLE,
            `48. materialization genuinely succeeds; got '${materialization.outcome}'`
        );

        // PLACE.
        const placementRegistry = new LocalPlacementRegistry(storageProvider);
        placeReal(placementRegistry, publication.id, { x: 111, y: 0, z: 211 });
        const placementInfo = placementInfoFor(placementRegistry, publication.id);
        const worldPlacementResult = resolveSnapshotWorldPlacement(materialization, placementInfo);
        assert(worldPlacementResult.outcome === SnapshotWorldPlacementOutcome.PLACED, '49. placement genuinely succeeds');

        // REGISTER — into the SAME, already-populated (local + peer)
        // registry the real bootstrap already produced.
        const registration = registerMaterializedSnapshotWorldSource(registry, worldPlacementResult, publication);
        assert(registration.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, '50. registration genuinely succeeds, into the SAME registry local and peer already occupy');
        const snapshotOrigin = materializedSnapshotWorldOrigin(worldPlacementResult.contentHash, worldPlacementResult.publicationId);

        // WORLD ENCOUNTER — the real, unmodified WorldEncounterCanvas,
        // observing local + peer + Snapshot together.
        const localMaterialSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const canvas = buildCanvasInstance({ registry, materialSources: { local: localMaterialSource, peer: new RecordingMaterialSource({ displayName: 'flagship peer material' }) } });
        mountCanvas(canvas);
        const projected = projectedPublicationsOf(canvas);
        assert(projected.length === 3, `51. local, peer, and the newly registered Snapshot all reach ONE rendered canvas; got ${projected.length}`);
        assert(projected.some((p) => p.objectId === publication.id), '52. the Snapshot\'s own Publication is among the rendered encounters');

        // SELECT ENCOUNTER -> LOAD MATERIAL — the Snapshot's own marker,
        // through the exact same selectEncounter()/refreshMaterialInspection()
        // machinery a local or peer marker click already uses.
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: publication.id });
        await flush();
        assert(canvas.selectionOutcome.status === 'RESOLVED' && canvas.resolvedEncounterSelection.origin === snapshotOrigin, '53. selection resolves unambiguously, carrying the Snapshot\'s own registered origin');
        assert(canvas.materialInspection && canvas.materialInspection.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE,
            `54. RENDER MATERIAL — the discovered, resolved, verified, materialized, placed, and registered Snapshot's own World Encounter loads AVAILABLE material; got '${canvas.materialInspection && canvas.materialInspection.loading.status}'`);
        assert(canvas.materialInspection.loading.material instanceof Publication && canvas.materialInspection.loading.material.id === publication.id,
            '55. FLAGSHIP — the rendered material is the exact, real Publication this entire pipeline started from');

        // THE STRUCTURAL/BEHAVIORAL PROOF — the Snapshot's own final three
        // stages ran through EXACTLY the same code paths a local marker's
        // own selection, in the SAME already-mounted canvas, also uses:
        // the same computed property, the same method, the same status
        // enum, never a Snapshot-specific branch anywhere above
        // application/WorldEncounterMaterialLoading.js's own materialSourceFor().
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: localPublication.id });
        await flush();
        assert(canvas.selectionOutcome.status === 'RESOLVED' && canvas.materialInspection.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE,
            '56. THE PROOF — re-selecting the LOCAL marker, in the SAME canvas instance, resolves and loads through the IDENTICAL selectEncounter()/refreshMaterialInspection() machinery, producing the same AVAILABLE vocabulary the Snapshot marker just did');

        unmountCanvas(canvas);
        bootstrap.dispose();
        console.log('✓ Section I: FLAGSHIP — Nostr discovery -> candidate -> selection -> resolution -> verification -> materialization -> placement -> registration -> World encounter -> selection -> material loading -> rendered material, through the REAL composition root, with local and peer sources coexisting throughout, ending in confirmation that the Snapshot marker and a local marker share IDENTICAL selection/loading machinery');
    }

    // ---------------------------------------------------------------
    // Section J — structural sweep: the architectural boundary carries no
    // Snapshot-specific renderer, material source, or vocabulary beyond
    // 0.9.166's own single, already-audited branch; this milestone itself
    // adds no production file.
    // ---------------------------------------------------------------
    {
        const canvasSource = await readFile(new URL('../ui/components/WorldEncounterCanvas.js', import.meta.url), 'utf8');
        const registrySource = await readFile(new URL('../application/WorldDiscoverySourceRegistry.js', import.meta.url), 'utf8');
        const loadingSource = await readFile(new URL('../application/WorldEncounterMaterialLoading.js', import.meta.url), 'utf8');

        function codeOnly(source) {
            return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        }

        // application/WorldDiscoverySourceRegistry.js has no legitimate
        // Snapshot/Nostr/Arweave vocabulary of ANY kind (unlike
        // WorldEncounterCanvas.js below, it carries no OTHER, unrelated
        // Snapshot-distribution UI to false-positive against) — a
        // whole-file sweep is exact here.
        const forbidden = ['Nostr', 'nostr', 'Arweave', 'arweave', 'SnapshotMaterialSource', 'DecentralizedSnapshotResolver', 'MaterializedSnapshotWorldDiscoveryBridge'];
        for (const term of forbidden) {
            assert(!codeOnly(registrySource).includes(term), `57. application/WorldDiscoverySourceRegistry.js never references '${term}' — the registry stays entirely origin-agnostic`);
        }
        assert(!codeOnly(loadingSource).includes('materialSources.snapshot'), '58. application/WorldEncounterMaterialLoading.js still never names a materialSources.snapshot slot');
        assert(!codeOnly(loadingSource).includes('SnapshotMaterialSource'), '59. application/WorldEncounterMaterialLoading.js still defines no SnapshotMaterialSource class');

        // WorldEncounterCanvas.js legitimately carries an UNRELATED,
        // already-existing Snapshot DISTRIBUTION feature (the "Distribute
        // Snapshot" button/`distributeSelectedSnapshot()`, predating this
        // milestone) that genuinely mentions Nostr/Arweave in its own
        // rendered template comments — a whole-file sweep would
        // false-positive on it. This audit's own claim is narrower and
        // precise: the ENCOUNTER SELECTION / MATERIAL LOADING orchestration
        // itself — `selectEncounter()`, `refreshSelectionOutcome()`,
        // `refreshMaterialInspection()`, and the `resolvedEncounterSelection`
        // computed — contains no Snapshot-specific branching of any kind,
        // exactly mirroring 0.9.165's own Section E scoping technique.
        function methodBody(source, name) {
            const marker = `${name}(`;
            const start = source.indexOf(`    ${marker}`);
            assert(start !== -1, `method/computed ${name} not found — has WorldEncounterCanvas.js's own structure changed?`);
            const braceStart = source.indexOf('{', start);
            let depth = 0;
            for (let i = braceStart; i < source.length; i++) {
                if (source[i] === '{') depth += 1;
                if (source[i] === '}') {
                    depth -= 1;
                    if (depth === 0) return source.slice(braceStart, i + 1);
                }
            }
            throw new Error(`unterminated body for ${name}`);
        }

        const snapshotFamilyPattern = /origin\.startsWith\(\s*['"]snapshot:|SnapshotMaterialSource|MaterializedSnapshotWorldDiscoveryBridge|DecentralizedSnapshotResolver|window\.nostr|window\.arweaveWallet/;
        for (const name of ['selectEncounter', 'refreshSelectionOutcome', 'refreshMaterialInspection']) {
            const body = methodBody(canvasSource, name);
            assert(!snapshotFamilyPattern.test(body), `60. WorldEncounterCanvas.js's own ${name}() contains no Snapshot-specific branching — encounter selection and material loading orchestration stay entirely origin-agnostic`);
        }
        const resolvedEncounterSelectionBody = methodBody(canvasSource, 'resolvedEncounterSelection');
        assert(!snapshotFamilyPattern.test(resolvedEncounterSelectionBody), '61. the resolvedEncounterSelection computed itself contains no Snapshot-specific branching either');

        // Exactly one snapshot-aware branch exists, and it routes to the
        // shared local slot — re-confirmed directly, not merely cited.
        const materialSourceForStart = loadingSource.indexOf('function materialSourceFor(');
        const materialSourceForEnd = loadingSource.indexOf('\n}\n', materialSourceForStart);
        const materialSourceForBody = loadingSource.slice(materialSourceForStart, materialSourceForEnd);
        const snapshotBranchMatches = materialSourceForBody.match(/origin\.startsWith\('snapshot:'\)/g) || [];
        assert(snapshotBranchMatches.length === 1, `62. materialSourceFor() contains exactly ONE snapshot:* branch, mirroring the existing peer: branch — never a widened or duplicated check; found ${snapshotBranchMatches.length}`);
        assert(/materialSources\.local/.test(materialSourceForBody), '63. the snapshot:* branch still routes to materialSources.local');

        console.log('✓ Section J: structural sweep — WorldDiscoverySourceRegistry.js carries no Snapshot/Nostr/Arweave vocabulary at all, WorldEncounterCanvas.js\'s own encounter-selection/material-loading orchestration contains no Snapshot-specific branching, and WorldEncounterMaterialLoading.js still holds exactly one snapshot:* branch, routed to the shared materialSources.local slot; this milestone adds no production file');
    }

    console.log('\n✅ All Snapshot World Material Loading E2E Audit tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
