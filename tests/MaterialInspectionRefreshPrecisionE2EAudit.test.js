import { readFile } from 'node:fs/promises';

import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import {
    WorldEncounterMaterialLoadStatus,
    WorldEncounterMaterialSource
} from '../application/WorldEncounterMaterialLoading.js';
import { LocalWorldEncounterMaterialSource } from '../application/LocalWorldEncounterMaterialSource.js';
import { WorldEncounterKind } from '../core/WorldEncounter.js';
import { WorldDiscoverySourceRegistry } from '../application/WorldDiscoverySourceRegistry.js';
import { bootstrapWorldDiscoveryRuntime } from '../application/WorldDiscoveryRuntimeBootstrap.js';
import { describeLocalWorldDiscoverySource, LOCAL_WORLD_DISCOVERY_ORIGIN } from '../application/WorldEncounterIntegration.js';
import {
    describePeerWorldDiscoverySource,
    derivePeerWorldOrigin
} from '../peer/PeerWorldDataIngress.js';
import {
    registerPeerWorldSource,
    unregisterPeerWorldSource
} from '../peer/PeerWorldDiscoveryLifecycleBridge.js';
import {
    registerMaterializedSnapshotWorldSource,
    unregisterMaterializedSnapshotWorldSource,
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
import { DecentralizedWorldDiscoveryLeadRegistry } from '../application/DecentralizedWorldDiscoveryLeadRegistry.js';
import { describeDecentralizedWorldDiscoveryLead } from '../core/DecentralizedWorldDiscoveryLead.js';
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

// 0.9.170 — Material Inspection Refresh Precision E2E Audit.
//
// 0.9.169's own dedicated test contract
// (`tests/MaterialInspectionRefreshPrecision.test.js`) proved its fix one
// seam at a time — a hand-built registry, one source family per scenario,
// `WorldEncounterCanvas`'s own methods/computed called directly off a
// fake `ctx`. That file is correct and stays exactly as it is. This
// milestone is the wider, HORIZONTAL reassessment 0.9.169's own
// recommendation named (mirroring 0.9.162 → 0.9.163's later convergence
// sweeps and 0.9.166 → 0.9.167 exactly): does the fix hold up against the
// REAL running World View pipeline — the actual `bootstrapWorldDiscoveryRuntime()`
// composition root, genuine peer/Snapshot lifecycle bridges, and, for the
// Snapshot family, the full decentralized DISCOVER → MATERIALIZE →
// REGISTER pipeline — under realistic local/peer/Snapshot churn
// interleaved with genuine selection changes, rather than the more
// surgical, one-seam-at-a-time scenarios 0.9.169's own file already
// exercises?
//
// TEST-ONLY. THIS FILE ADDS NO PRODUCTION CODE AND CHANGES NO EXISTING
// FILE. Every collaborator this audit drives — `WorldEncounterCanvas.js`,
// `WorldDiscoverySourceRegistry.js`, `WorldDiscoveryRuntimeBootstrap.js`,
// `PeerWorldDiscoveryLifecycleBridge.js`,
// `MaterializedSnapshotWorldDiscoveryBridge.js`, the Nostr/Arweave
// Snapshot pipeline — is read, real, and unmodified.
//
// THE CENTRAL INVARIANT THIS AUDIT EXISTS TO PROVE:
//
//   Same resolved selection + any number of unrelated registry mutations
//   = the SAME materialInspection (by reference, not merely by status).
//
//   A registry mutation that genuinely changes the selected encounter's
//   own resolved selection MAY still refresh it.
//
//   Section A: complete runtime baseline — the real
//              `bootstrapWorldDiscoveryRuntime()` composition root, a
//              mounted canvas, initial encounter selection loads material
//              normally.
//   Section B: an unrelated registry REGISTRATION, through the real
//              runtime — selection identical, materialInspection retained
//              BY REFERENCE, load count unchanged.
//   Section C: an unrelated registry UNREGISTRATION — mirrors Section B.
//   Section D: THE POSITIVE CASE — a mutation that genuinely changes the
//              selected encounter's own resolved origin still reloads,
//              through the real runtime.
//   Section E: all three source families (LOCAL/PEER/SNAPSHOT) as the
//              selected encounter, each surviving an unrelated mutation
//              with zero reload, plus a structural read-back confirming
//              `resolvedEncounterSelectionsEqual()`/`refreshSelectionOutcome()`
//              contain no `if snapshot`/`if peer`/`if local` branch.
//   Section F: Snapshot full-path regression — the REAL decentralized
//              pipeline (Nostr candidate → resolution → verification →
//              materialization → placement → registration → encounter
//              selection → material loading), then an unrelated registry
//              mutation: Nostr calls, Arweave calls, materialization
//              calls, and material-load calls all stay unchanged.
//   Section G: UNAVAILABLE retention — an already-UNAVAILABLE selection
//              stays UNAVAILABLE across an unrelated mutation; no
//              implicit retry.
//   Section H: in-flight request safety — an unrelated notification
//              arriving while a genuine load is still pending never bumps
//              `materialInspectionRequestId`, never generates a second
//              request, and the eventual correct result is still
//              accepted.
//   Section I: selection-driven refresh remains independent —
//              `selectEncounter()`, `chooseSelectionOrigin()`, and
//              `chooseDecentralizedLead()` still trigger their own
//              existing refresh behavior; the optimization is confined to
//              the registry-notification path alone.
//   Section J: concurrent source activity — a burst of unrelated
//              local/peer/Snapshot registrations and removals, with a
//              selected encounter held stable throughout, produces zero
//              reloads: World activity is not selected-material activity.
//   Section K: structural audit — 0.9.169/0.9.170 introduced no registry
//              event taxonomy, no material cache, no Snapshot-specific
//              refresh code, no source-family branching, no new lifecycle
//              state, no retry behavior, no automatic rediscovery, no new
//              material identity, and no renderer change.

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

function peer(identityId) {
    return { remoteIdentity: { identityId } };
}

function placedResult(contentHash, publicationId, position, placementId = `placement-${publicationId}`) {
    return { outcome: SnapshotWorldPlacementOutcome.PLACED, contentHash, publicationId, placementId, position, reason: null };
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

// A material source that counts every real load() call it receives — the
// one instrument this whole audit reads to tell "reload happened" from
// "reload was correctly skipped," exactly as 0.9.169's own test contract
// already established.
function countingMaterialSource(counts, key, underlying) {
    return {
        async load(resolvedSelection, resolvedLead) {
            counts[key] = (counts[key] || 0) + 1;
            return underlying.load(resolvedSelection, resolvedLead);
        }
    };
}

class RecordingMaterialSource extends WorldEncounterMaterialSource {
    constructor(material) { super(); this.material = material; this.calls = []; }
    async load(resolvedSelection) { this.calls.push(resolvedSelection); return this.material; }
}

// A call-counting wrapper around a real network/transport function —
// mirrors tests/SnapshotWorldMaterialLoadingE2EAudit.test.js's own
// countingWrap() exactly, used in Section F to prove the REAL Nostr/Arweave
// collaborators are never re-invoked.
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
        return { id: `fake-0-9-170-tx-${counter}`, transaction: { id: `fake-0-9-170-tx-${counter}`, data: material } };
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

function buildCanvasInstance({ registry = null, view, materialSources = null, materialVerifier = null, worldDiscoveryLeadRegistry = null, decentralizedLeadAssociations = [] } = {}) {
    const ctx = {
        registry,
        view: view !== undefined ? view : WorldEncounterCanvas.props.view.default(),
        materialSources,
        materialVerifier,
        worldDiscoveryLeadRegistry,
        decentralizedLeadAssociations
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

function leadOf(overrides = {}) {
    return describeDecentralizedWorldDiscoveryLead({
        origin: 'dweb:some-search-service',
        discoveryTag: 'forkbuild_0_9_170',
        uri: 'ar://ABC123',
        storage: 'ar',
        ...overrides
    });
}

function associationFor(lead, material) {
    return { origin: lead.origin, discoveryTag: lead.discoveryTag, uri: lead.uri, ...material };
}

function leadRegistryOf(leads) {
    const registry = new DecentralizedWorldDiscoveryLeadRegistry();
    for (const lead of leads) {
        registry.setLead(lead);
    }
    return registry;
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — complete runtime baseline: the REAL
    // bootstrapWorldDiscoveryRuntime() composition root, a mounted
    // canvas, initial encounter selection loads material normally.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const publication = publishOwnPublication(storageProvider, 'Section A Publication');
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const counts = {};
        const materialSources = { local: countingMaterialSource(counts, 'local', localSource) };

        const bootstrap = bootstrapWorldDiscoveryRuntime({
            localWorldDiscoveryRecords: {
                publications: [{ id: publication.id, title: publication.title }],
                placements: [{ publicationId: publication.id, position: { x: 1, y: 0, z: 1 } }]
            }
        });
        const { registry } = bootstrap;

        const canvas = buildCanvasInstance({ registry, materialSources });
        mountCanvas(canvas);
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: publication.id });
        await flush();

        assert(counts.local === 1, `1. through the real composition root, selecting an encounter performs exactly one normal material load; got ${counts.local}`);
        assert(canvas.materialInspection && canvas.materialInspection.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE,
            `2. that load resolves AVAILABLE; got '${canvas.materialInspection && canvas.materialInspection.loading.status}'`);
        assert(canvas.materialInspection.loading.material.id === publication.id, '3. the loaded material is the real, selected Publication');

        unmountCanvas(canvas);
        bootstrap.dispose();
        console.log('✓ Section A: complete runtime baseline — through the real bootstrapWorldDiscoveryRuntime() composition root, initial encounter selection still loads material normally');
    }

    // ---------------------------------------------------------------
    // Section B — an unrelated registry REGISTRATION, through the real
    // runtime: selection identical, materialInspection retained BY
    // REFERENCE (not merely by status), load count unchanged.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const publication = publishOwnPublication(storageProvider, 'Section B Publication');
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const counts = {};
        const materialSources = { local: countingMaterialSource(counts, 'local', localSource) };

        const bootstrap = bootstrapWorldDiscoveryRuntime({
            localWorldDiscoveryRecords: {
                publications: [{ id: publication.id, title: publication.title }],
                placements: [{ publicationId: publication.id, position: { x: 2, y: 0, z: 2 } }]
            }
        });
        const { registry } = bootstrap;

        const canvas = buildCanvasInstance({ registry, materialSources });
        mountCanvas(canvas);
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: publication.id });
        await flush();
        assert(counts.local === 1, `4. sanity — selecting the Publication loads its material exactly once; got ${counts.local}`);
        const selectionBefore = canvas.resolvedEncounterSelection;
        const inspectionBefore = canvas.materialInspection;

        const unrelatedPeer = peer('did:key:zE2ESectionBUnrelated');
        registerPeerWorldSource(registry, unrelatedPeer, describePeerWorldDiscoverySource({
            publications: [{ id: 'pub-e2e-b-unrelated', title: 'Unrelated' }],
            placements: [{ publicationId: 'pub-e2e-b-unrelated', position: { x: 99, y: 0, z: 99 } }]
        }, unrelatedPeer));
        await flush();

        assert(canvas.resolvedEncounterSelection.origin === selectionBefore.origin && canvas.resolvedEncounterSelection.objectId === selectionBefore.objectId,
            '5. the selected encounter\'s own resolved identity is unaffected by the unrelated registration');
        assert(counts.local === 1, `6. THE PROOF — an unrelated registration triggers NO redundant material reload under the real runtime; got ${counts.local} total load(s), expected exactly 1`);
        assert(canvas.materialInspection === inspectionBefore, '7. THE INVARIANT — materialInspection is retained BY REFERENCE, not merely by equivalent status: same resolved selection + an unrelated mutation = the exact same result object');

        unmountCanvas(canvas);
        bootstrap.dispose();
        console.log('✓ Section B: an unrelated registry registration, through the real runtime, leaves the selected encounter\'s own material inspection untouched — same object, by reference');
    }

    // ---------------------------------------------------------------
    // Section C — an unrelated registry UNREGISTRATION, mirroring
    // Section B, for removal instead of registration.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const publication = publishOwnPublication(storageProvider, 'Section C Publication');
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const counts = {};
        const materialSources = { local: countingMaterialSource(counts, 'local', localSource) };

        const bootstrap = bootstrapWorldDiscoveryRuntime({
            localWorldDiscoveryRecords: {
                publications: [{ id: publication.id, title: publication.title }],
                placements: [{ publicationId: publication.id, position: { x: 3, y: 0, z: 3 } }]
            }
        });
        const { registry } = bootstrap;
        const unrelatedPeer = peer('did:key:zE2ESectionCUnrelated');
        registerPeerWorldSource(registry, unrelatedPeer, describePeerWorldDiscoverySource({
            publications: [{ id: 'pub-e2e-c-unrelated', title: 'Unrelated' }],
            placements: [{ publicationId: 'pub-e2e-c-unrelated', position: { x: 98, y: 0, z: 98 } }]
        }, unrelatedPeer));

        const canvas = buildCanvasInstance({ registry, materialSources });
        mountCanvas(canvas);
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: publication.id });
        await flush();
        assert(counts.local === 1, `8. sanity — selecting the Publication loads its material exactly once; got ${counts.local}`);
        const selectionBefore = canvas.resolvedEncounterSelection;
        const inspectionBefore = canvas.materialInspection;

        unregisterPeerWorldSource(registry, unrelatedPeer);
        await flush();

        assert(canvas.resolvedEncounterSelection.origin === selectionBefore.origin && canvas.resolvedEncounterSelection.objectId === selectionBefore.objectId,
            '9. the selected encounter\'s own resolved identity is unaffected by the unrelated unregistration');
        assert(counts.local === 1, `10. THE PROOF — an unrelated unregistration triggers NO redundant material reload under the real runtime; got ${counts.local} total load(s), expected exactly 1`);
        assert(canvas.materialInspection === inspectionBefore, '11. materialInspection is retained by reference across the unrelated unregistration too');

        unmountCanvas(canvas);
        bootstrap.dispose();
        console.log('✓ Section C: an unrelated registry unregistration, through the real runtime, leaves the selected encounter\'s own material inspection untouched');
    }

    // ---------------------------------------------------------------
    // Section D — THE POSITIVE CASE: a registry mutation that genuinely
    // changes the selected encounter's own resolved origin still reloads
    // material, through the real runtime. This audit narrows WHEN a
    // reload happens; it never suppresses one that is genuinely owed.
    // ---------------------------------------------------------------
    {
        const sharedObjectId = 'pub-e2e-d-handoff';
        const materialByPeer = {
            firstPeer: Object.freeze({ displayName: 'E2E Section D First Peer Material' }),
            secondPeer: Object.freeze({ displayName: 'E2E Section D Second Peer Material' })
        };
        const counts = {};
        const peerSource = countingMaterialSource(counts, 'peer', {
            async load() { return materialByPeer.secondPeerServing ? materialByPeer.secondPeer : materialByPeer.firstPeer; }
        });

        const bootstrap = bootstrapWorldDiscoveryRuntime({ localWorldDiscoveryRecords: {} });
        const { registry } = bootstrap;
        const firstPeerIdentity = peer('did:key:zE2ESectionDFirst');
        registerPeerWorldSource(registry, firstPeerIdentity, describePeerWorldDiscoverySource({
            publications: [{ id: sharedObjectId, title: 'E2E Section D Handoff' }],
            placements: [{ publicationId: sharedObjectId, position: { x: 4, y: 0, z: 4 } }]
        }, firstPeerIdentity));

        const canvas = buildCanvasInstance({ registry, materialSources: { peer: peerSource } });
        mountCanvas(canvas);
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: sharedObjectId });
        await flush();
        assert(counts.peer === 1, `12. sanity — selecting the handed-off Publication loads its material exactly once; got ${counts.peer}`);
        const firstOrigin = canvas.resolvedEncounterSelection.origin;
        assert(firstOrigin === derivePeerWorldOrigin(firstPeerIdentity), '13. sanity — the selection is initially served by the first peer\'s own origin');
        const inspectionBefore = canvas.materialInspection;

        unregisterPeerWorldSource(registry, firstPeerIdentity);
        await flush();
        materialByPeer.secondPeerServing = true;
        const secondPeerIdentity = peer('did:key:zE2ESectionDSecond');
        registerPeerWorldSource(registry, secondPeerIdentity, describePeerWorldDiscoverySource({
            publications: [{ id: sharedObjectId, title: 'E2E Section D Handoff' }],
            placements: [{ publicationId: sharedObjectId, position: { x: 4, y: 0, z: 4 } }]
        }, secondPeerIdentity));
        await flush();

        const secondOrigin = canvas.resolvedEncounterSelection.origin;
        assert(secondOrigin === derivePeerWorldOrigin(secondPeerIdentity) && secondOrigin !== firstOrigin,
            `14. sanity — the SAME selected objectId is now served by a genuinely different origin; got '${secondOrigin}'`);
        assert(counts.peer > 1, `15. THE POSITIVE CASE — a registry mutation that genuinely changes the selected encounter's own resolved origin DOES reload material, through the real runtime; got ${counts.peer} total load(s)`);
        assert(canvas.materialInspection !== inspectionBefore, '16. the reloaded materialInspection is a genuinely NEW object, never the retained previous one');
        assert(canvas.materialInspection.loading.material.displayName === materialByPeer.secondPeer.displayName,
            '17. the reloaded material genuinely reflects the NEW serving peer\'s own material, not the stale first peer\'s');

        unmountCanvas(canvas);
        bootstrap.dispose();
        console.log('✓ Section D: a registry mutation that genuinely changes the selected encounter\'s own resolved origin still reloads material, through the real runtime — the optimization never suppresses a legitimate refresh');
    }

    // ---------------------------------------------------------------
    // Section E — all three source families (LOCAL/PEER/SNAPSHOT) as the
    // selected encounter, each surviving an unrelated registry mutation
    // with zero reload, plus a structural read-back confirming
    // resolvedEncounterSelectionsEqual()/refreshSelectionOutcome() contain
    // no `if snapshot`/`if peer`/`if local` branch of any kind.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const localPublication = publishOwnPublication(storageProvider, 'E2E Section E Local');
        const snapshotPublication = publishOwnPublication(storageProvider, 'E2E Section E Snapshot');
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const peerMaterial = Object.freeze({ displayName: 'E2E Section E Peer Avatar' });
        const counts = {};
        const materialSources = {
            local: countingMaterialSource(counts, 'local', localSource),
            peer: countingMaterialSource(counts, 'peer', new RecordingMaterialSource(peerMaterial))
        };

        const bootstrap = bootstrapWorldDiscoveryRuntime({
            localWorldDiscoveryRecords: {
                publications: [{ id: localPublication.id, title: localPublication.title }],
                placements: [{ publicationId: localPublication.id, position: { x: 7, y: 0, z: 7 } }]
            }
        });
        const { registry } = bootstrap;
        const peerIdentity = peer('did:key:zE2ESectionEPeer');
        registerPeerWorldSource(registry, peerIdentity, describePeerWorldDiscoverySource({
            publications: [{ id: 'pub-e2e-e-peer', title: 'E2E Section E Peer' }],
            placements: [{ publicationId: 'pub-e2e-e-peer', position: { x: 8, y: 0, z: 8 } }]
        }, peerIdentity));
        const registration = registerMaterializedSnapshotWorldSource(registry, placedResult('hash-e2e-section-e', snapshotPublication.id, { x: 9, y: 0, z: 9 }), snapshotPublication);
        assert(registration.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, '18. sanity — Snapshot registration succeeds');

        const scenarios = {
            local: { objectId: localPublication.id, countKey: 'local' },
            peer: { objectId: 'pub-e2e-e-peer', countKey: 'peer' },
            snapshot: { objectId: snapshotPublication.id, countKey: 'local' } // Snapshot rides materialSources.local, per 0.9.166.
        };

        const canvas = buildCanvasInstance({ registry, materialSources });
        mountCanvas(canvas);

        for (const [name, { objectId, countKey }] of Object.entries(scenarios)) {
            canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId });
            await flush();
            const before = counts[countKey] || 0;
            const inspectionBefore = canvas.materialInspection;

            const oneOffPeer = peer(`did:key:zE2ESectionE-${name}-unrelated`);
            registerPeerWorldSource(registry, oneOffPeer, describePeerWorldDiscoverySource({
                publications: [{ id: `pub-e2e-e-${name}-unrelated`, title: 'Unrelated' }],
                placements: [{ publicationId: `pub-e2e-e-${name}-unrelated`, position: { x: 50, y: 0, z: 50 } }]
            }, oneOffPeer));
            await flush();
            unregisterPeerWorldSource(registry, oneOffPeer);
            await flush();

            const after = counts[countKey] || 0;
            assert(after === before, `19. CAPABILITY — ${name}'s own selection sees NO redundant reload from an unrelated registry mutation, under the real runtime, exactly like every other source family; got ${after - before} extra load(s)`);
            assert(canvas.materialInspection === inspectionBefore, `20. ${name}'s own materialInspection is retained by reference across the unrelated mutation`);
        }

        unmountCanvas(canvas);
        bootstrap.dispose();
        unregisterPeerWorldSource(registry, peerIdentity);
        unregisterMaterializedSnapshotWorldSource(registry, registration.contentHash, snapshotPublication.id);

        // Structural confirmation, re-read directly rather than merely
        // cited: neither function this fix touches branches on a
        // source-family string.
        const source = await readFile(new URL('../ui/components/WorldEncounterCanvas.js', import.meta.url), 'utf8');
        const equalityFunctionMatch = source.match(/function resolvedEncounterSelectionsEqual\([^)]*\)\s*\{[\s\S]*?\n\}/);
        const refreshSelectionOutcomeMatch = source.match(/refreshSelectionOutcome\(\)\s*\{[\s\S]*?\n {8}\},/);
        assert(equalityFunctionMatch && refreshSelectionOutcomeMatch, '21. sanity — both functions this milestone reads are found in the production file');
        const branchPattern = /if\s*\(\s*(origin\s*===\s*['"]local['"]|origin\s*\.startsWith\(\s*['"]peer:|origin\s*\.startsWith\(\s*['"]snapshot:)/;
        for (const body of [equalityFunctionMatch[0], refreshSelectionOutcomeMatch[0]]) {
            assert(!branchPattern.test(body), '22. neither function contains an `if (origin === \'local\')`/`if (origin.startsWith(\'peer:\'))`/`if (origin.startsWith(\'snapshot:\'))`-shaped branch — no hidden per-source-family logic exists');
            for (const forbidden of ['\'local\'', '\'peer:', '\'snapshot:', 'startsWith(\'peer', 'startsWith(\'snapshot']) {
                assert(!body.includes(forbidden), `23. neither function references '${forbidden}' at all — the optimization stays source-family blind`);
            }
        }

        console.log('✓ Section E: LOCAL/PEER/SNAPSHOT symmetry, under the real runtime — an unrelated registry mutation causes no redundant reload for any of the three source families, and resolvedEncounterSelectionsEqual()/refreshSelectionOutcome() contain no source-family branch of any kind');
    }

    // ---------------------------------------------------------------
    // Section F — Snapshot full-path regression: the REAL decentralized
    // pipeline (Nostr candidate -> resolution -> verification ->
    // materialization -> placement -> registration -> encounter selection
    // -> material loading), then an unrelated registry mutation: Nostr
    // calls, Arweave calls, materialization calls, and material-load calls
    // all stay unchanged.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const publication = publishOwnPublication(storageProvider, 'E2E Section F Publication');

        const gateway = makeFakeArweaveGateway();
        const countingFetch = countingWrap(gateway.fetchImpl);
        const store = new ArweaveContentStore({ signer: makeFakeArweaveSigner(), fetchImpl: countingFetch });
        const network = makeNostrNetwork();
        const countingQuery = countingWrap(network.queryImpl);
        const countingPublish = countingWrap(network.publishImpl);
        const discoveryTag = 'e2e-section-f-0-9-170';
        const snapshotBytes = JSON.stringify({ world: { note: 'section F snapshot content' } });
        const reference = await store.put(snapshotBytes);

        const discoveryPublisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag, publishImpl: countingPublish });
        await discoveryPublisher.publish({ contentHash: reference.hash, locator: reference.uri, storage: reference.storage });

        const discoveryQueryService = new NostrSnapshotDiscoveryQueryService({ queryImpl: countingQuery });
        const candidates = await executeDiscoverSnapshotCandidatesCommand({ discoveryTag, discoveryQueryService });
        const resolver = new DecentralizedSnapshotResolver(discoveryQueryService);
        const resolution = await executeResolveSelectedSnapshotCommand({ candidate: candidates[0], resolver, contentStore: store });
        assert(resolution.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, '24. sanity — resolution genuinely succeeds');
        assert(computeContentHash(resolution.bytes) === reference.hash, '25. sanity — VERIFY: the resolved bytes still hash to the originally placed contentHash');

        const localContentStore = new LocalContentStore(storageProvider);
        const storeSnapshotContentUseCase = new StoreSnapshotContentUseCase(localContentStore);
        const materializer = new MaterializeSnapshotFromSelectedCandidateUseCase(storeSnapshotContentUseCase);
        let materializeCalls = 0;
        const countingMaterializer = { async execute(...args) { materializeCalls += 1; return materializer.execute(...args); } };
        const materialization = await executeMaterializeSelectedSnapshotCommand({ resolution, materializer: countingMaterializer });
        assert(
            materialization.outcome === SnapshotCandidateMaterializationOutcome.STORED
            || materialization.outcome === SnapshotCandidateMaterializationOutcome.ALREADY_AVAILABLE,
            `26. materialization genuinely succeeds; got '${materialization.outcome}'`
        );

        const placementRegistry = new LocalPlacementRegistry(storageProvider);
        placeReal(placementRegistry, publication.id, { x: 20, y: 0, z: 30 });
        const placementInfo = placementInfoFor(placementRegistry, publication.id);
        const worldPlacementResult = resolveSnapshotWorldPlacement(materialization, placementInfo);
        assert(worldPlacementResult.outcome === SnapshotWorldPlacementOutcome.PLACED, '27. sanity — placement succeeds');

        const bootstrap = bootstrapWorldDiscoveryRuntime({ localWorldDiscoveryRecords: {} });
        const { registry } = bootstrap;
        const registration = registerMaterializedSnapshotWorldSource(registry, worldPlacementResult, publication);
        assert(registration.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, '28. sanity — registration succeeds');

        const counts = {};
        const canvas = buildCanvasInstance({ registry, materialSources: { local: countingMaterialSource(counts, 'local', new LocalWorldEncounterMaterialSource(storageProvider)) } });
        mountCanvas(canvas);
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: publication.id });
        await flush();

        assert(canvas.materialInspection && canvas.materialInspection.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE, '29. sanity — selecting the fully decentralized Snapshot encounter loads its material AVAILABLE');
        assert(counts.local === 1, `30. sanity — selection loads material exactly once before the unrelated mutation; got ${counts.local}`);
        const inspectionBefore = canvas.materialInspection;
        const fetchCallsBefore = countingFetch.calls;
        const queryCallsBefore = countingQuery.calls;
        const publishCallsBefore = countingPublish.calls;
        const materializeCallsBefore = materializeCalls;
        assert(fetchCallsBefore > 0 && queryCallsBefore > 0 && publishCallsBefore > 0 && materializeCallsBefore > 0, '31. sanity — the network and materializer were genuinely used to get this far');

        const unrelatedPeer = peer('did:key:zE2ESectionFUnrelated');
        registerPeerWorldSource(registry, unrelatedPeer, describePeerWorldDiscoverySource({
            publications: [{ id: 'pub-e2e-f-unrelated', title: 'Unrelated' }],
            placements: [{ publicationId: 'pub-e2e-f-unrelated', position: { x: 96, y: 0, z: 96 } }]
        }, unrelatedPeer));
        await flush();
        unregisterPeerWorldSource(registry, unrelatedPeer);
        await flush();

        assert(countingFetch.calls === fetchCallsBefore, `32. THE PROOF — Arweave calls stay unchanged across the unrelated registry mutation; before ${fetchCallsBefore}, after ${countingFetch.calls}`);
        assert(countingQuery.calls === queryCallsBefore && countingPublish.calls === publishCallsBefore,
            `33. THE PROOF — Nostr calls stay unchanged across the unrelated registry mutation; query before ${queryCallsBefore}/after ${countingQuery.calls}, publish before ${publishCallsBefore}/after ${countingPublish.calls}`);
        assert(materializeCalls === materializeCallsBefore, `34. THE PROOF — materialization calls stay unchanged (no automatic re-materialization); before ${materializeCallsBefore}, after ${materializeCalls}`);
        assert(counts.local === 1, `35. THE PROOF — material loading stays unchanged (no redundant reload); got ${counts.local} total load(s), expected exactly 1`);
        assert(canvas.materialInspection === inspectionBefore, '36. materialInspection is retained by reference — this fix has not accidentally coupled Snapshot behavior to registry notifications');

        unmountCanvas(canvas);
        bootstrap.dispose();
        console.log('✓ Section F: Snapshot full-path regression — through the REAL decentralized pipeline, an unrelated registry mutation leaves Nostr calls, Arweave calls, materialization calls, and material-load calls all unchanged');
    }

    // ---------------------------------------------------------------
    // Section G — UNAVAILABLE retention: an already-UNAVAILABLE selection
    // stays UNAVAILABLE across an unrelated registry mutation; no implicit
    // retry.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const counts = {};
        const materialSources = { local: countingMaterialSource(counts, 'local', localSource) };

        // A registry advertising a Publication id that was never actually
        // published into local storage — a genuine, pre-existing
        // UNAVAILABLE case, entirely unrelated to this milestone.
        const bootstrap = bootstrapWorldDiscoveryRuntime({
            localWorldDiscoveryRecords: {
                publications: [{ id: 'pub-e2e-g-ghost', title: 'Ghost Publication' }],
                placements: [{ publicationId: 'pub-e2e-g-ghost', position: { x: 11, y: 0, z: 11 } }]
            }
        });
        const { registry } = bootstrap;

        const canvas = buildCanvasInstance({ registry, materialSources });
        mountCanvas(canvas);
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-e2e-g-ghost' });
        await flush();
        assert(counts.local === 1, `37. sanity — selecting the ghost Publication attempts its own material load exactly once; got ${counts.local}`);
        assert(canvas.materialInspection.loading.status === WorldEncounterMaterialLoadStatus.UNAVAILABLE,
            `38. sanity — UNAVAILABLE reproduces exactly as before; got '${canvas.materialInspection.loading.status}'`);
        const inspectionBefore = canvas.materialInspection;

        for (let i = 0; i < 3; i += 1) {
            const unrelatedPeer = peer(`did:key:zE2ESectionGUnrelated${i}`);
            registerPeerWorldSource(registry, unrelatedPeer, describePeerWorldDiscoverySource({
                publications: [{ id: `pub-e2e-g-unrelated-${i}`, title: 'Unrelated' }],
                placements: [{ publicationId: `pub-e2e-g-unrelated-${i}`, position: { x: 90 + i, y: 0, z: 90 + i } }]
            }, unrelatedPeer));
            await flush();
        }

        assert(counts.local === 1, `39. THE PROOF — NO IMPLICIT RETRY: three separate unrelated registry mutations trigger no reload attempt of any kind for an already-UNAVAILABLE selection; got ${counts.local} total load(s)`);
        assert(canvas.materialInspection === inspectionBefore, '40. the retained UNAVAILABLE materialInspection is the exact same object across all three unrelated mutations');
        assert(canvas.materialInspection.loading.status === WorldEncounterMaterialLoadStatus.UNAVAILABLE,
            `41. UNAVAILABLE is preserved, unconverted into any other status; got '${canvas.materialInspection.loading.status}'`);
        assert(Object.keys(WorldEncounterMaterialLoadStatus).sort().join(',') === 'AVAILABLE,UNAVAILABLE', '42. no third status value exists for an implicit retry to have invented');

        unmountCanvas(canvas);
        bootstrap.dispose();
        console.log('✓ Section G: UNAVAILABLE retention — an already-UNAVAILABLE selection stays UNAVAILABLE across repeated, unrelated registry mutations, with no implicit retry');
    }

    // ---------------------------------------------------------------
    // Section H — in-flight request safety: an unrelated registry
    // notification arriving WHILE a genuine load is still pending never
    // bumps materialInspectionRequestId, never generates a second request,
    // and the eventual correct result is still accepted.
    // ---------------------------------------------------------------
    {
        let releaseLoad = null;
        let loadCallCount = 0;
        const material = Object.freeze({ displayName: 'E2E Section H Material' });
        const deferredSource = {
            load() {
                loadCallCount += 1;
                return new Promise((resolve) => { releaseLoad = () => resolve(material); });
            }
        };

        const bootstrap = bootstrapWorldDiscoveryRuntime({
            localWorldDiscoveryRecords: {
                publications: [{ id: 'pub-e2e-h', title: 'E2E Section H' }],
                placements: [{ publicationId: 'pub-e2e-h', position: { x: 12, y: 0, z: 12 } }]
            }
        });
        const { registry } = bootstrap;

        const canvas = buildCanvasInstance({ registry, materialSources: { local: deferredSource } });
        mountCanvas(canvas);
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-e2e-h' });
        await flush();
        assert(typeof releaseLoad === 'function', '43. sanity — the material load is genuinely in flight, not yet resolved');
        assert(loadCallCount === 1, `44. sanity — exactly one load is in flight; got ${loadCallCount}`);
        const requestIdWhileInFlight = canvas.materialInspectionRequestId;

        // Two separate unrelated registry mutations arrive WHILE that load
        // is still pending.
        const unrelatedPeerOne = peer('did:key:zE2ESectionHUnrelatedOne');
        registerPeerWorldSource(registry, unrelatedPeerOne, describePeerWorldDiscoverySource({
            publications: [{ id: 'pub-e2e-h-unrelated-1', title: 'Unrelated One' }],
            placements: [{ publicationId: 'pub-e2e-h-unrelated-1', position: { x: 95, y: 0, z: 95 } }]
        }, unrelatedPeerOne));
        await flush();
        const unrelatedPeerTwo = peer('did:key:zE2ESectionHUnrelatedTwo');
        registerPeerWorldSource(registry, unrelatedPeerTwo, describePeerWorldDiscoverySource({
            publications: [{ id: 'pub-e2e-h-unrelated-2', title: 'Unrelated Two' }],
            placements: [{ publicationId: 'pub-e2e-h-unrelated-2', position: { x: 94, y: 0, z: 94 } }]
        }, unrelatedPeerTwo));
        await flush();

        assert(canvas.materialInspectionRequestId === requestIdWhileInFlight,
            `45. THE PROOF — repeated unrelated registry notifications never bump materialInspectionRequestId while a relevant load is in flight; expected ${requestIdWhileInFlight}, got ${canvas.materialInspectionRequestId}`);
        assert(loadCallCount === 1, `46. THE PROOF — no second request was ever generated by the unrelated mutations; got ${loadCallCount} total load() call(s), expected exactly 1`);
        assert(canvas.materialInspection === null, '47. sanity — the in-flight request has not resolved yet, so materialInspection is still null');

        releaseLoad();
        await flush();

        assert(canvas.materialInspection && canvas.materialInspection.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE
            && canvas.materialInspection.loading.material.displayName === material.displayName,
            '48. THE PROOF — the in-flight request\'s own correct, eventual response is written, never discarded as stale by the unrelated notifications that arrived mid-flight');

        unmountCanvas(canvas);
        bootstrap.dispose();
        console.log('✓ Section H: in-flight request safety — repeated unrelated registry notifications arriving mid-flight never bump the request counter, never generate a second request, and never invalidate the eventual correct result');
    }

    // ---------------------------------------------------------------
    // Section I — selection-driven refresh remains independent:
    // selectEncounter(), chooseSelectionOrigin(), and
    // chooseDecentralizedLead() still trigger their own existing refresh
    // behavior; the optimization is confined to the registry-notification
    // path alone.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const publicationOne = publishOwnPublication(storageProvider, 'E2E Section I Publication One');
        const publicationTwo = publishOwnPublication(storageProvider, 'E2E Section I Publication Two');
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const counts = {};
        const materialSources = { local: countingMaterialSource(counts, 'local', localSource) };

        const bootstrap = bootstrapWorldDiscoveryRuntime({
            localWorldDiscoveryRecords: {
                publications: [
                    { id: publicationOne.id, title: publicationOne.title },
                    { id: publicationTwo.id, title: publicationTwo.title }
                ],
                placements: [
                    { publicationId: publicationOne.id, position: { x: 5, y: 0, z: 5 } },
                    { publicationId: publicationTwo.id, position: { x: 6, y: 0, z: 6 } }
                ]
            }
        });
        const { registry } = bootstrap;

        const canvas = buildCanvasInstance({ registry, materialSources });
        mountCanvas(canvas);

        // selectEncounter() — a fresh selection always reloads.
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: publicationOne.id });
        await flush();
        assert(counts.local === 1, `49. selectEncounter() still triggers its own normal material load; got ${counts.local}`);
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: publicationTwo.id });
        await flush();
        assert(counts.local === 2, `50. selecting a DIFFERENT encounter still reloads material for it, unaffected by this milestone's own optimization; got ${counts.local}`);
        assert(canvas.materialInspection.loading.material.id === publicationTwo.id, '51. the reloaded material genuinely reflects the newly selected Publication');

        unmountCanvas(canvas);
        bootstrap.dispose();

        // chooseSelectionOrigin() — an explicit Wanderer choice among
        // ambiguous candidates still reloads, independent of the registry-
        // notification path this milestone touches.
        {
            const sharedObjectId = 'pub-e2e-i-ambiguous';
            const ambiguousCounts = {};
            const peerIdentityOne = peer('did:key:zE2ESectionIAmbiguousOne');
            const peerIdentityTwo = peer('did:key:zE2ESectionIAmbiguousTwo');
            const registry = new WorldDiscoverySourceRegistry();
            registerPeerWorldSource(registry, peerIdentityOne, describePeerWorldDiscoverySource({
                publications: [{ id: sharedObjectId, title: 'Ambiguous' }],
                placements: [{ publicationId: sharedObjectId, position: { x: 1, y: 0, z: 1 } }]
            }, peerIdentityOne));
            registerPeerWorldSource(registry, peerIdentityTwo, describePeerWorldDiscoverySource({
                publications: [{ id: sharedObjectId, title: 'Ambiguous' }],
                placements: [{ publicationId: sharedObjectId, position: { x: 1, y: 0, z: 1 } }]
            }, peerIdentityTwo));

            const materialByOrigin = {
                [derivePeerWorldOrigin(peerIdentityOne)]: Object.freeze({ displayName: 'First Candidate Material' }),
                [derivePeerWorldOrigin(peerIdentityTwo)]: Object.freeze({ displayName: 'Second Candidate Material' })
            };
            const ambiguousPeerSource = countingMaterialSource(ambiguousCounts, 'peer', {
                async load(resolvedSelection) { return materialByOrigin[resolvedSelection.origin]; }
            });

            const canvas = buildCanvasInstance({ registry, materialSources: { peer: ambiguousPeerSource } });
            mountCanvas(canvas);
            canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: sharedObjectId });
            await flush();
            assert(canvas.selectionOutcome.status === 'AMBIGUOUS', '52. sanity — two peers advertising the same Publication id genuinely produce an AMBIGUOUS outcome');
            assert(!ambiguousCounts.peer, '53. sanity — no material loads while the selection is still ambiguous');

            const chosenCandidate = canvas.selectionOutcome.candidates.find((c) => c.origin === derivePeerWorldOrigin(peerIdentityTwo));
            canvas.chooseSelectionOrigin(chosenCandidate);
            await flush();
            assert(ambiguousCounts.peer === 1, `54. chooseSelectionOrigin() still triggers its own material load once the Wanderer explicitly resolves an ambiguous selection; got ${ambiguousCounts.peer || 0}`);
            assert(canvas.materialInspection.loading.material.displayName === materialByOrigin[derivePeerWorldOrigin(peerIdentityTwo)].displayName,
                '55. the loaded material reflects the Wanderer\'s own explicit choice');

            unmountCanvas(canvas);
        }

        // chooseDecentralizedLead() — an explicit lead choice still
        // reloads, independent of the registry-notification path.
        {
            const decentralizedCounts = {};
            const material = { kind: 'PUBLICATION', objectId: 'pub-e2e-i-lead' };
            const registry = new WorldDiscoverySourceRegistry();
            registry.setSource(describeLocalWorldDiscoverySource({
                publications: [{ id: 'pub-e2e-i-lead' }],
                placements: [{ publicationId: 'pub-e2e-i-lead', position: { x: 0, y: 0, z: 0 } }]
            }));
            const leadA = leadOf();
            const leadB = leadOf({ origin: 'dweb:another-service', uri: 'ar://DEF456' });
            const leadRegistry = leadRegistryOf([leadA, leadB]);
            const decentralizedSource = countingMaterialSource(decentralizedCounts, 'decentralized', {
                async load() { return { displayName: 'lead material' }; }
            });

            const canvas = buildCanvasInstance({
                registry,
                materialSources: { decentralized: decentralizedSource },
                worldDiscoveryLeadRegistry: leadRegistry,
                decentralizedLeadAssociations: [associationFor(leadA, material), associationFor(leadB, material)]
            });
            mountCanvas(canvas);
            canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-e2e-i-lead' });
            await flush();
            assert(canvas.decentralizedLeadOutcome.status === 'AMBIGUOUS', '56. sanity — two independently-evidenced leads classify as AMBIGUOUS');
            assert(canvas.resolvedLead === null, '57. sanity — resolvedLead stays null while ambiguous, so no decentralized load has an actual lead to run against yet');

            const chosenLead = canvas.decentralizedLeadOutcome.candidates.find((c) => c.uri === leadB.uri);
            canvas.chooseDecentralizedLead(chosenLead);
            await flush();
            assert(canvas.resolvedLead === chosenLead, '58. sanity — the Wanderer\'s explicit lead choice is reflected exactly');
            assert(decentralizedCounts.decentralized === 1, `59. chooseDecentralizedLead() still triggers its own material load once the Wanderer explicitly picks a lead; got ${decentralizedCounts.decentralized || 0}`);

            unmountCanvas(canvas);
        }

        console.log('✓ Section I: selection-driven refresh remains independent — selectEncounter(), chooseSelectionOrigin(), and chooseDecentralizedLead() all still trigger their own existing refresh behavior; this milestone\'s optimization is confined to the registry-notification path alone');
    }

    // ---------------------------------------------------------------
    // Section J — concurrent source activity: a burst of unrelated
    // local/peer/Snapshot registrations and removals, with a selected
    // encounter held stable throughout, produces zero reloads — World
    // activity is not selected-material activity.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const publication = publishOwnPublication(storageProvider, 'E2E Section J Publication');
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const counts = {};
        const materialSources = { local: countingMaterialSource(counts, 'local', localSource) };

        const bootstrap = bootstrapWorldDiscoveryRuntime({
            localWorldDiscoveryRecords: {
                publications: [{ id: publication.id, title: publication.title }],
                placements: [{ publicationId: publication.id, position: { x: 13, y: 0, z: 13 } }]
            }
        });
        const { registry } = bootstrap;

        const canvas = buildCanvasInstance({ registry, materialSources });
        mountCanvas(canvas);
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: publication.id });
        await flush();
        assert(counts.local === 1, `60. sanity — the held selection loads its material exactly once; got ${counts.local}`);
        const inspectionBefore = canvas.materialInspection;

        // A deliberately scrambled burst: peers joining and leaving,
        // Snapshots registering and unregistering, none of them touching
        // the held selection's own Publication id.
        const activePeers = [];
        const activeSnapshotRegistrations = [];
        for (let i = 0; i < 5; i += 1) {
            const identity = peer(`did:key:zE2ESectionJPeer${i}`);
            registerPeerWorldSource(registry, identity, describePeerWorldDiscoverySource({
                publications: [{ id: `pub-e2e-j-peer-${i}`, title: `Concurrent Peer ${i}` }],
                placements: [{ publicationId: `pub-e2e-j-peer-${i}`, position: { x: i, y: 0, z: i } }]
            }, identity));
            activePeers.push(identity);

            const snapshotPublication = new Publication({ id: `pub-e2e-j-snapshot-${i}`, title: `Concurrent Snapshot ${i}` });
            const snapshotRegistration = registerMaterializedSnapshotWorldSource(registry, placedResult(`hash-e2e-j-${i}`, snapshotPublication.id, { x: -i, y: 0, z: -i }), snapshotPublication);
            assert(snapshotRegistration.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, `61. sanity — concurrent Snapshot registration ${i} succeeds`);
            activeSnapshotRegistrations.push({ contentHash: snapshotRegistration.contentHash, publicationId: snapshotPublication.id });

            if (i % 2 === 0 && activePeers.length > 1) {
                unregisterPeerWorldSource(registry, activePeers.shift());
            }
        }
        await flush();
        for (const identity of activePeers) unregisterPeerWorldSource(registry, identity);
        for (const registration of activeSnapshotRegistrations) unregisterMaterializedSnapshotWorldSource(registry, registration.contentHash, registration.publicationId);
        await flush();

        assert(counts.local === 1, `62. THE PROOF — WORLD ACTIVITY IS NOT SELECTED-MATERIAL ACTIVITY: a burst of five concurrent, unrelated peer/Snapshot registrations and removals produces ZERO redundant reloads for the held selection; got ${counts.local} total load(s), expected exactly 1`);
        assert(canvas.materialInspection === inspectionBefore, '63. the held selection\'s own materialInspection is the exact same object throughout the entire burst of unrelated concurrent source activity');
        assert(canvas.resolvedEncounterSelection.objectId === publication.id && canvas.resolvedEncounterSelection.origin === LOCAL_WORLD_DISCOVERY_ORIGIN,
            '64. the held selection\'s own resolved identity is entirely unaffected by the concurrent, unrelated churn');

        unmountCanvas(canvas);
        bootstrap.dispose();
        console.log('✓ Section J: concurrent source activity — a burst of unrelated local/peer/Snapshot registrations and removals produces zero reloads for a held selection: World activity is not selected-material activity, without requiring finer-grained registry notifications');
    }

    // ---------------------------------------------------------------
    // Section K — structural audit: 0.9.169/0.9.170 introduced no
    // registry event taxonomy, no material cache, no Snapshot-specific
    // refresh code, no source-family branching, no new lifecycle state,
    // no retry behavior, no automatic rediscovery, no new material
    // identity, and no renderer change.
    // ---------------------------------------------------------------
    {
        const canvasSource = await readFile(new URL('../ui/components/WorldEncounterCanvas.js', import.meta.url), 'utf8');
        const registrySource = await readFile(new URL('../application/WorldDiscoverySourceRegistry.js', import.meta.url), 'utf8');
        const loadingSource = await readFile(new URL('../application/WorldEncounterMaterialLoading.js', import.meta.url), 'utf8');
        const bridgeSource = await readFile(new URL('../application/MaterializedSnapshotWorldDiscoveryBridge.js', import.meta.url), 'utf8');

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

        // No registry event taxonomy: the registry's own notification stays
        // exactly as coarse and argument-less as 0.9.12 already left it —
        // it carries no event name/type/payload vocabulary of any kind.
        assert(!/\bnotify\w*\(\s*['"`]\w+['"`]/.test(registrySource), '65. NO REGISTRY EVENT TAXONOMY — WorldDiscoverySourceRegistry.js\'s own notification call carries no named event-type argument');
        assert(!registrySource.includes('resolvedEncounterSelectionsEqual') && !registrySource.includes('MaterialInspection'),
            '66. WorldDiscoverySourceRegistry.js carries no reference to this fix\'s own helper or to material inspection — the registry itself was not redesigned');

        // No material cache: neither this fix's own two functions, nor
        // WorldEncounterMaterialLoading.js, hold a cache/memoization
        // structure keyed on resolved selection. Comments are stripped
        // first — this file's own header already disclaims memoization in
        // prose ("never memoized"), which would otherwise false-positive
        // against a plain substring sweep.
        function codeOnly(source) {
            return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        }
        const forbiddenCacheVocabulary = ['Cache', 'cache', 'memoiz', 'Memoiz'];
        for (const term of forbiddenCacheVocabulary) {
            assert(!codeOnly(loadingSource).includes(term), `67. NO MATERIAL CACHE — application/WorldEncounterMaterialLoading.js's own CODE contains no '${term}' vocabulary; material is still always freshly loaded via materialSourceFor().load(), never served from a stored cache`);
        }

        // No Snapshot-specific refresh code, no source-family branching:
        // re-read directly, mirroring 0.9.169's own Section J/F.
        const equalityFunctionMatch = canvasSource.match(/function resolvedEncounterSelectionsEqual\([^)]*\)\s*\{[\s\S]*?\n\}/);
        const refreshSelectionOutcomeMatch = canvasSource.match(/refreshSelectionOutcome\(\)\s*\{[\s\S]*?\n {8}\},/);
        assert(equalityFunctionMatch && refreshSelectionOutcomeMatch, '68. sanity — both functions this fix touches are found in the production file');
        const forbiddenInFix = ['Nostr', 'nostr', 'Arweave', 'arweave', 'materialize', 'Materialize', 'ACTIVE', 'EXPIRED', 'STALE', 'SYNCED', 'INACTIVE', 'REVOKED', 'retry', 'Retry', 'rediscover', 'Rediscover'];
        for (const term of forbiddenInFix) {
            assert(!equalityFunctionMatch[0].includes(term) && !refreshSelectionOutcomeMatch[0].includes(term),
                `69. neither resolvedEncounterSelectionsEqual() nor refreshSelectionOutcome() references '${term}' — no Snapshot-specific branch, materialization logic, new lifecycle vocabulary, or retry/rediscovery behavior was introduced`);
        }

        // No new lifecycle state: WorldEncounterMaterialLoadStatus still
        // carries exactly its own two pre-existing values.
        assert(Object.keys(WorldEncounterMaterialLoadStatus).sort().join(',') === 'AVAILABLE,UNAVAILABLE', '70. WorldEncounterMaterialLoadStatus still carries exactly its own two pre-existing values — no new lifecycle state was introduced');

        // No new material identity: MaterializedSnapshotWorldDiscoveryBridge.js
        // still derives origin from exactly contentHash + publicationId,
        // unchanged since 0.9.163 — this audit adds no new identity
        // vocabulary of its own.
        assert(bridgeSource.includes('materializedSnapshotWorldOrigin(contentHash, publicationId)'), '71. MaterializedSnapshotWorldDiscoveryBridge.js still derives origin from exactly contentHash and publicationId — no new material identity concept was introduced');

        // No renderer changes: WorldEncounterMarker.js/WandererMarker.js
        // (the two rendering collaborators this canvas imports) are
        // untouched by this milestone's own scope — this fix lives
        // entirely inside selection/material-inspection orchestration.
        assert(canvasSource.includes("import WorldEncounterMarker from './WorldEncounterMarker.js';") && canvasSource.includes("import WandererMarker from './WandererMarker.js';"),
            '72. sanity — the same two renderer components this canvas has always imported are still the only ones it imports; this audit and 0.9.169 touch selection/material-inspection orchestration alone');

        console.log('✓ Section K: structural audit — 0.9.169/0.9.170 introduced no registry event taxonomy, no material cache, no Snapshot-specific refresh code, no source-family branching, no new lifecycle state, no retry/rediscovery behavior, no new material identity concept, and no renderer change');
    }

    console.log('\n✅ All Material Inspection Refresh Precision E2E Audit tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
