import { readFile } from 'node:fs/promises';

import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { WorldDiscoverySourceRegistry } from '../application/WorldDiscoverySourceRegistry.js';
import { describeLocalWorldDiscoverySource, LOCAL_WORLD_DISCOVERY_ORIGIN } from '../application/WorldEncounterIntegration.js';
import { registerPeerWorldSource, unregisterPeerWorldSource } from '../peer/PeerWorldDiscoveryLifecycleBridge.js';
import { derivePeerWorldOrigin } from '../peer/PeerWorldDataIngress.js';
import {
    registerMaterializedSnapshotWorldSource,
    unregisterMaterializedSnapshotWorldSource,
    materializedSnapshotWorldOrigin
} from '../application/MaterializedSnapshotWorldDiscoveryBridge.js';
import { SnapshotWorldPlacementOutcome } from '../application/SnapshotWorldPlacementOutcome.js';
import { SnapshotWorldRegistrationOutcome } from '../application/SnapshotWorldRegistrationOutcome.js';
import { WorldEncounterKind } from '../core/WorldEncounter.js';
import { WorldEncounterMaterialLoadStatus } from '../application/WorldEncounterMaterialLoading.js';
import { WorldEncounterSelectionOutcomeStatus } from '../application/WorldEncounterSelectionOutcome.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';

// 0.9.179 — Snapshot World Source Unregistration.
//
// 0.9.178's own audit found exactly one concrete, unwired capability:
// `unregisterMaterializedSnapshotWorldSource()` (0.9.160/0.9.163) already
// existed at the application layer, as the deliberate, symmetric undo of
// `registerMaterializedSnapshotWorldSource()`, but no UI action anywhere
// invoked it. This milestone closes exactly that seam — one new
// Wanderer-reachable action, `WorldEncounterCanvas.js#unregisterSelectedSnapshot()`
// — invoking the SAME existing bridge function, unmodified, for a
// resolved, SNAPSHOT-sourced selection alone.
//
//   World View
//       │
//       ▼
//   explicit Snapshot removal action (unregisterSelectedSnapshot(), NEW)
//       │
//       ▼
//   unregisterMaterializedSnapshotWorldSource()   (0.9.160/0.9.163, UNCHANGED)
//       │
//       ▼
//   WorldDiscoverySourceRegistry#removeSource()   (0.9.9, UNCHANGED)
//       │
//       ▼
//   existing projections — encounter disappears, selection resolves to
//   null (never a fallback), material inspection follows existing rules
//
// NO NEW LIFECYCLE VOCABULARY. No `SnapshotLifecycleState`, no `STALE`/
// `EXPIRED`/`REMOVED`/`DELETED` enum, no new registry, no new Snapshot
// identity. The existing registry's own "plain absence, never a
// tombstone" semantics (0.9.9) are the entire lifecycle this milestone
// needs — see Section J's own structural audit.
//
// THIS IS NOT "DELETE SNAPSHOT." Unregistering removes exactly the World
// discovery CONTRIBUTION — the World stops observing that source. It
// never implies deleting the materialized bytes, the Publication, a Nostr
// announcement, or an Arweave transaction — see Section J.
//
//   Section A: direct bridge behavior — removes the exact origin, leaves
//              others intact, stays Publication-specific for a shared
//              contentHash.
//   Section B: exact identity — snapshot:H:A / snapshot:H:B (same hash,
//              different Publications) and snapshot:H:A / snapshot:K:A
//              (same Publication, different hash) each stay independent.
//   Section C: the explicit UI action invokes ONLY the existing unregister
//              capability — no rediscovery, no material deletion, no
//              re-resolution, no Publication mutation.
//   Section D: rendering propagation — REGISTER -> RENDER -> UNREGISTER ->
//              no Snapshot encounter, through the existing, unmodified
//              WorldEncounterCanvas machinery.
//   Section E: selected-Snapshot removal — resolves to null, never a
//              fallback to another candidate or another family (0.9.175).
//   Section F: material inspection collapses with the selection — no new
//              "material invalidated" state.
//   Section G: cross-family isolation — LOCAL A / PEER A / SNAPSHOT A,
//              unregistering Snapshot A affects Snapshot A alone.
//   Section H: position independence — no other source's position, and no
//              position-related collaborator (LocalPlacementRegistry,
//              claimed position), is ever touched by this action.
//   Section I: re-registration — REGISTER -> UNREGISTER -> REGISTER
//              reaches the same World state as the original registration.
//   Section J: structural audit — no new lifecycle enum, no new registry,
//              no new Snapshot identity, no automatic unregister, no
//              material/Publication deletion, no Nostr/Arweave action, no
//              fallback/ranking/deduplication.

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

function placedResult(contentHash, publicationId, position) {
    return { outcome: SnapshotWorldPlacementOutcome.PLACED, contentHash, publicationId, placementId: `placement-${publicationId}`, position, reason: null };
}

function capturingMaterialSource(material) {
    const calls = [];
    return {
        calls,
        async load(resolvedSelection) {
            calls.push(resolvedSelection);
            return material;
        }
    };
}

function neverCalledMaterialSource(label) {
    return { async load() { throw new Error(`${label} must never be consulted for this selection`); } };
}

// Mirrors tests/WorldSnapshotInspectionActionabilityAudit.test.js's own
// buildCanvasInstance() exactly, reproducing ui/views/WorldView.js's real
// wiring by hand.
function buildCanvasInstance({
    registry = null,
    materialSources = null,
    distributionCommand = null,
    snapshotDistributionCommand = null,
    discoverSnapshotCommand = null
} = {}) {
    const ctx = {
        registry,
        view: WorldEncounterCanvas.props.view.default(),
        materialSources,
        materialVerifier: null,
        distributionCommand,
        snapshotDistributionCommand,
        discoverSnapshotCommand,
        distributionLifecycleStore: null,
        discoveryCommand: null,
        worldDiscoveryLeadRegistry: null
    };
    Object.assign(ctx, WorldEncounterCanvas.data.call(ctx));
    Object.assign(ctx, WorldEncounterCanvas.methods);
    const liveGetters = [
        'effectiveView',
        'publicationRows',
        'avatarRows',
        'projectedPublications',
        'resolvedEncounterSelection',
        'resolvedLead',
        'selectedEncounterInspection',
        'selectedEncounterInspectionPublisherIdentityLabel',
        'selectedEncounterPresentation',
        'selectedEncounterPresentationSourceLabel',
        'selectedEncounterSnapshotInspection',
        'distributablePublication'
    ];
    for (const name of liveGetters) {
        Object.defineProperty(ctx, name, {
            get() { return WorldEncounterCanvas.computed[name].call(ctx); }
        });
    }
    return ctx;
}

function mountCanvas(ctx) { WorldEncounterCanvas.mounted.call(ctx); }
function unmountCanvas(ctx) { WorldEncounterCanvas.beforeUnmount.call(ctx); }

async function run() {
    const canvasSource = await readFile(new URL('../ui/components/WorldEncounterCanvas.js', import.meta.url), 'utf8');
    const bridgeSource = await readFile(new URL('../application/MaterializedSnapshotWorldDiscoveryBridge.js', import.meta.url), 'utf8');

    // ---------------------------------------------------------------
    // Section A — direct bridge behavior.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const pubA = publishOwnPublication(storageProvider, 'Section A Publication A');
        const pubB = publishOwnPublication(storageProvider, 'Section A Publication B');
        const registry = new WorldDiscoverySourceRegistry();

        const regA = registerMaterializedSnapshotWorldSource(registry, placedResult('hash-section-a-1', pubA.id, { x: 1, y: 0, z: 1 }), pubA);
        const regB = registerMaterializedSnapshotWorldSource(registry, placedResult('hash-section-a-2', pubB.id, { x: 2, y: 0, z: 2 }), pubB);
        assert(regA.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, 'sanity — A registers');
        assert(regB.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, 'sanity — B registers');
        assert(registry.listSources().length === 2, 'sanity — two independent sources exist');

        unregisterMaterializedSnapshotWorldSource(registry, 'hash-section-a-1', pubA.id);

        assert(registry.listSources().length === 1, '1. removing A leaves exactly one source');
        assert(registry.listSources().find((s) => s.origin === regA.origin) === undefined, '2. A\'s own exact origin is gone');
        const remaining = registry.listSources().find((s) => s.origin === regB.origin);
        assert(remaining !== undefined, '3. B\'s own origin survives, completely untouched');
        assert(remaining.publications[0] === pubB, '4. B\'s own registered Publication reference is unchanged');
        assert(remaining.placements[0].position.x === 2 && remaining.placements[0].position.z === 2, '5. B\'s own registered position is unchanged');

        // Same contentHash, two different Publications — 0.9.163's own
        // collision fix stays honored by the undo: removing one leaves the
        // other's own slot alone.
        const pubC = publishOwnPublication(storageProvider, 'Section A Publication C');
        const pubD = publishOwnPublication(storageProvider, 'Section A Publication D');
        const sharedHash = 'hash-section-a-shared';
        const regC = registerMaterializedSnapshotWorldSource(registry, placedResult(sharedHash, pubC.id, { x: 3, y: 0, z: 3 }), pubC);
        const regD = registerMaterializedSnapshotWorldSource(registry, placedResult(sharedHash, pubD.id, { x: 4, y: 0, z: 4 }), pubD);
        assert(regC.origin !== regD.origin, 'sanity — sharing a contentHash still derives two distinct origins (0.9.163)');
        assert(registry.listSources().length === 3, 'sanity — B, C, and D all coexist');

        unregisterMaterializedSnapshotWorldSource(registry, sharedHash, pubC.id);
        assert(registry.listSources().find((s) => s.origin === regC.origin) === undefined, '6. C\'s own slot (contentHash shared with D) is gone');
        assert(registry.listSources().find((s) => s.origin === regD.origin) !== undefined, '7. D\'s own slot, sharing the SAME contentHash, survives completely untouched');
        assert(registry.listSources().length === 2, '8. exactly B and D remain');

        console.log('✓ Section A: unregisterMaterializedSnapshotWorldSource() removes exactly the targeted origin, leaves every other origin (including one sharing the same contentHash) completely untouched');
    }

    // ---------------------------------------------------------------
    // Section B — exact identity.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();

        // snapshot:H:A / snapshot:H:B — same contentHash, different
        // Publications.
        {
            const pubA = publishOwnPublication(storageProvider, 'Section B Publication A');
            const pubB = publishOwnPublication(storageProvider, 'Section B Publication B');
            const registry = new WorldDiscoverySourceRegistry();
            const hash = 'H';
            const regA = registerMaterializedSnapshotWorldSource(registry, placedResult(hash, pubA.id, { x: 1, y: 0, z: 1 }), pubA);
            const regB = registerMaterializedSnapshotWorldSource(registry, placedResult(hash, pubB.id, { x: 2, y: 0, z: 2 }), pubB);
            assert(regA.origin === `snapshot:${hash}:${pubA.id}`, 'sanity — A\'s own origin is snapshot:H:A');
            assert(regB.origin === `snapshot:${hash}:${pubB.id}`, 'sanity — B\'s own origin is snapshot:H:B');

            unregisterMaterializedSnapshotWorldSource(registry, hash, pubA.id);
            assert(registry.listSources().find((s) => s.origin === regA.origin) === undefined, '1. removing snapshot:H:A removes exactly that slot');
            assert(registry.listSources().find((s) => s.origin === regB.origin) !== undefined, '2. snapshot:H:B is completely untouched');
        }

        // snapshot:H:A / snapshot:K:A — same Publication, different
        // contentHash (e.g. two independently discovered revisions of the
        // same Snapshot bytes-identity would never collide, but this
        // proves the origin key folds BOTH facts, not contentHash alone).
        {
            const pubA = publishOwnPublication(storageProvider, 'Section B Publication A2');
            const registry = new WorldDiscoverySourceRegistry();
            const regH = registerMaterializedSnapshotWorldSource(registry, placedResult('H2', pubA.id, { x: 5, y: 0, z: 5 }), pubA);
            const regK = registerMaterializedSnapshotWorldSource(registry, placedResult('K2', pubA.id, { x: 6, y: 0, z: 6 }), pubA);
            assert(regH.origin !== regK.origin, 'sanity — H and K derive two distinct origins for the same Publication');
            assert(registry.listSources().length === 2, 'sanity — both coexist (0.9.9\'s own per-origin slotting)');

            unregisterMaterializedSnapshotWorldSource(registry, 'H2', pubA.id);
            assert(registry.listSources().find((s) => s.origin === regH.origin) === undefined, '3. removing snapshot:H:A removes exactly that slot');
            assert(registry.listSources().find((s) => s.origin === regK.origin) !== undefined, '4. snapshot:K:A is completely untouched');
        }

        console.log('✓ Section B: exact identity — snapshot:H:A/snapshot:H:B and snapshot:H:A/snapshot:K:A each stay pairwise independent under removal, exactly mirroring 0.9.163/0.9.164\'s own identity model');
    }

    // ---------------------------------------------------------------
    // Section C — the explicit UI action invokes ONLY the existing
    // unregister capability.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const publication = publishOwnPublication(storageProvider, 'Section C Snapshot Publication');
        const publicationSnapshotBefore = JSON.stringify(publication);
        const registry = new WorldDiscoverySourceRegistry();
        const registration = registerMaterializedSnapshotWorldSource(
            registry,
            placedResult('hash-section-c', publication.id, { x: 7, y: 0, z: 7 }),
            publication
        );
        assert(registration.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, 'sanity — Section C registration succeeds');

        const material = Object.freeze({ id: publication.id, title: publication.title });
        const localSource = capturingMaterialSource(material);
        let discoverCalls = 0;
        const canvas = buildCanvasInstance({
            registry,
            materialSources: { local: localSource },
            discoverSnapshotCommand: async () => { discoverCalls += 1; return { outcome: 'MATCH', bytes: null, candidates: [], locator: null, storage: null, reason: null }; }
        });
        mountCanvas(canvas);
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: publication.id });
        await flush();
        assert(canvas.selectedEncounterSnapshotInspection !== null, 'sanity — a Snapshot inspection descriptor is available before removal');

        // Spy on registry.setSource — a rediscovery/re-registration would
        // call it; the unregister action must not.
        let setSourceCalls = 0;
        const originalSetSource = registry.setSource.bind(registry);
        registry.setSource = (...args) => { setSourceCalls += 1; return originalSetSource(...args); };

        const loadCallsBefore = localSource.calls.length;
        canvas.unregisterSelectedSnapshot();
        await flush();

        assert(setSourceCalls === 0, '1. no rediscovery — registry.setSource() is never called by the unregister action');
        assert(discoverCalls === 0, '2. no re-resolution — discoverSnapshotCommand is never called by the unregister action');
        assert(localSource.calls.length === loadCallsBefore, '3. no additional material load is triggered by the unregister action');
        assert(JSON.stringify(publication) === publicationSnapshotBefore, '4. no modification of the Publication — byte-identical before and after');
        assert(registry.listSources().length === 0, '5. the ONE effect: the registered source is gone');

        unmountCanvas(canvas);
        console.log('✓ Section C: the explicit UI action invokes exactly the existing unregister capability — no rediscovery, no re-resolution, no additional material load, and no Publication mutation of any kind');
    }

    // ---------------------------------------------------------------
    // Section D — rendering propagation: REGISTER -> RENDER -> UNREGISTER
    // -> no Snapshot encounter, through the existing WorldEncounterCanvas
    // machinery, unchanged.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const publication = publishOwnPublication(storageProvider, 'Section D Snapshot Publication');
        const registry = new WorldDiscoverySourceRegistry();
        const registration = registerMaterializedSnapshotWorldSource(
            registry,
            placedResult('hash-section-d', publication.id, { x: 9, y: 0, z: 9 }),
            publication
        );
        assert(registration.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, 'sanity — Section D registration succeeds');

        const canvas = buildCanvasInstance({ registry, materialSources: { local: capturingMaterialSource(Object.freeze({ id: publication.id })) } });
        mountCanvas(canvas);

        // RENDER — the registered Snapshot already projects as a genuine
        // marker, through the entirely unmodified rendering pipeline
        // (0.9.161's own flagship).
        const markerBefore = canvas.projectedPublications.find((m) => m.objectId === publication.id);
        assert(markerBefore !== undefined, '1. REGISTER -> RENDER: the Snapshot renders as a marker before removal');

        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: publication.id });
        await flush();
        assert(canvas.selectedEncounterSnapshotInspection !== null, 'sanity — selectable and inspectable before removal');

        // UNREGISTER — via the new explicit action.
        canvas.unregisterSelectedSnapshot();
        await flush();

        const markerAfter = canvas.projectedPublications.find((m) => m.objectId === publication.id);
        assert(markerAfter === undefined, '2. UNREGISTER -> no Snapshot encounter: the marker is gone from the rendered projection');

        unmountCanvas(canvas);
        console.log('✓ Section D: REGISTER -> RENDER -> UNREGISTER -> no Snapshot encounter, using the existing, entirely unmodified WorldEncounterCanvas rendering machinery');
    }

    // ---------------------------------------------------------------
    // Section E — selected-Snapshot removal resolves to null, never a
    // fallback (0.9.175's own rule, held here for the explicit action).
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const publicationA = publishOwnPublication(storageProvider, 'Section E Publication A');
        const publicationB = publishOwnPublication(storageProvider, 'Section E Publication B');
        const registry = new WorldDiscoverySourceRegistry();

        const regA = registerMaterializedSnapshotWorldSource(registry, placedResult('hash-section-e-a', publicationA.id, { x: 10, y: 0, z: 10 }), publicationA);
        registerMaterializedSnapshotWorldSource(registry, placedResult('hash-section-e-b', publicationB.id, { x: 11, y: 0, z: 11 }), publicationB);
        assert(regA.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, 'sanity — A registers');

        const canvas = buildCanvasInstance({
            registry,
            materialSources: { local: capturingMaterialSource(Object.freeze({ id: publicationA.id })) }
        });
        mountCanvas(canvas);
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: publicationA.id });
        await flush();

        assert(canvas.resolvedEncounterSelection !== null && canvas.resolvedEncounterSelection.origin === regA.origin, 'sanity — A is the selected, resolved source');

        canvas.unregisterSelectedSnapshot();
        await flush();

        assert(canvas.selectionOutcome.status === WorldEncounterSelectionOutcomeStatus.UNAVAILABLE, '1. the selection outcome collapses to UNAVAILABLE, never AMBIGUOUS/RESOLVED against a different candidate');
        assert(canvas.resolvedEncounterSelection === null, '2. resolvedEncounterSelection becomes null — never silently falling back to B, or to any other family');
        assert(canvas.selectedEncounterSnapshotInspection === null, '3. Snapshot inspection detail is gone, not substituted with B\'s own facts');

        // B, an entirely different objectId, remains completely selectable
        // and untouched — proving "no fallback" is not "nothing works
        // anymore," merely that THIS selection does not silently resolve
        // to a DIFFERENT encounter.
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: publicationB.id });
        await flush();
        assert(canvas.resolvedEncounterSelection !== null, '4. B, a completely independent Snapshot, is still normally selectable');

        unmountCanvas(canvas);
        console.log('✓ Section E: unregistering the currently-selected Snapshot resolves selection to null — never a silent fallback to another candidate or another source family, exactly mirroring 0.9.175\'s own rule');
    }

    // ---------------------------------------------------------------
    // Section F — material inspection collapses with the selection; no
    // new "material invalidated" state is ever introduced.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const publication = publishOwnPublication(storageProvider, 'Section F Snapshot Publication');
        const registry = new WorldDiscoverySourceRegistry();
        const registration = registerMaterializedSnapshotWorldSource(
            registry,
            placedResult('hash-section-f', publication.id, { x: 12, y: 0, z: 12 }),
            publication
        );
        assert(registration.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, 'sanity — Section F registration succeeds');

        const canvas = buildCanvasInstance({ registry, materialSources: { local: capturingMaterialSource(Object.freeze({ id: publication.id })) } });
        mountCanvas(canvas);
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: publication.id });
        await flush();

        assert(canvas.materialInspection !== null && canvas.materialInspection.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE, 'sanity — material is loaded and AVAILABLE before removal');

        canvas.unregisterSelectedSnapshot();
        await flush();

        assert(canvas.materialInspection === null, '1. materialInspection is cleared to null — the SAME "no current selection" value used everywhere else, never a new distinct value');
        assert(canvas.distributablePublication === null, '2. distributablePublication follows, unreachable again');

        // Structural confirmation: no NEW "material invalidated" STATE
        // VALUE (as opposed to the ordinary English verb, used elsewhere
        // in prose comments) was introduced by this milestone's own one
        // touched production file.
        const canvasCodeOnlyForF = canvasSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(!/materialInvalid|staleMaterial|MATERIAL_INVALID/i.test(canvasCodeOnlyForF),
            '3. no new "material invalidated" (or equivalent) state value exists anywhere in WorldEncounterCanvas.js\'s own executable code');

        unmountCanvas(canvas);
        console.log('✓ Section F: unregistering the selected Snapshot collapses materialInspection to the SAME null every other "nothing selected" case already uses — no new "material invalidated" state was introduced');
    }

    // ---------------------------------------------------------------
    // Section G — cross-family isolation: LOCAL A / PEER A / SNAPSHOT A,
    // unregistering Snapshot A affects Snapshot A alone.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const publication = publishOwnPublication(storageProvider, 'Section G Publication');
        const objectId = publication.id;
        const registry = new WorldDiscoverySourceRegistry();

        registry.setSource(describeLocalWorldDiscoverySource({
            publications: [{ id: objectId, title: publication.title }],
            placements: [{ publicationId: objectId, position: { x: 20, y: 0, z: 20 } }]
        }));
        const peerIdentity = peer('did:key:zSectionGPeer');
        registerPeerWorldSource(registry, peerIdentity, {
            publications: [{ id: objectId, title: 'Peer Copy' }],
            placements: [{ publicationId: objectId, position: { x: 21, y: 0, z: 21 } }]
        });
        const peerOrigin = derivePeerWorldOrigin(peerIdentity);
        const registration = registerMaterializedSnapshotWorldSource(
            registry,
            placedResult('hash-section-g', objectId, { x: 22, y: 0, z: 22 }),
            publication
        );
        assert(registration.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, 'sanity — Snapshot A registers');
        assert(registry.listSources().length === 3, 'sanity — LOCAL A, PEER A, and SNAPSHOT A all coexist for the same objectId');

        const localSourceBefore = registry.listSources().find((s) => s.origin === LOCAL_WORLD_DISCOVERY_ORIGIN);
        const peerSourceBefore = registry.listSources().find((s) => s.origin === peerOrigin);

        unregisterMaterializedSnapshotWorldSource(registry, 'hash-section-g', objectId);

        assert(registry.listSources().length === 2, '1. exactly one source was removed');
        assert(registry.listSources().find((s) => s.origin === registration.origin) === undefined, '2. the Snapshot\'s own origin is gone');
        const localSourceAfter = registry.listSources().find((s) => s.origin === LOCAL_WORLD_DISCOVERY_ORIGIN);
        const peerSourceAfter = registry.listSources().find((s) => s.origin === peerOrigin);
        assert(localSourceAfter === localSourceBefore, '3. LOCAL A\'s own source is the SAME object reference — completely untouched');
        assert(peerSourceAfter === peerSourceBefore, '4. PEER A\'s own source is the SAME object reference — completely untouched');

        unregisterPeerWorldSource(registry, peerIdentity);
        assert(registry.listSources().length === 1, '5. sanity — PEER A can still be independently unregistered afterward, proving no lingering coupling');
        assert(registry.listSources()[0].origin === LOCAL_WORLD_DISCOVERY_ORIGIN, '6. only LOCAL A remains');

        console.log('✓ Section G: with LOCAL A / PEER A / SNAPSHOT A all registered for the SAME objectId, unregistering Snapshot A removes exactly that one source — LOCAL A and PEER A survive as the exact same object references, provably untouched');
    }

    // ---------------------------------------------------------------
    // Section H — position independence: no other source's position, and
    // no position-related collaborator, is ever touched.
    // ---------------------------------------------------------------
    {
        // Structural confirmation first: the bridge itself never
        // references any position-storage collaborator beyond the
        // placement it was directly handed at registration time.
        const bridgeCodeOnly = bridgeSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(!/LocalPlacementRegistry|PlacementRegistry|claimedPosition|SpatialIndexProvider/.test(bridgeCodeOnly),
            '1. MaterializedSnapshotWorldDiscoveryBridge.js never references LocalPlacementRegistry, PlacementRegistry, claimedPosition, or a spatial index of any kind — removal cannot touch what registration itself never touched');

        const storageProvider = new InMemoryStorageProvider();
        const publicationA = publishOwnPublication(storageProvider, 'Section H Publication A');
        const publicationB = publishOwnPublication(storageProvider, 'Section H Publication B');
        const registry = new WorldDiscoverySourceRegistry();

        registry.setSource(describeLocalWorldDiscoverySource({
            publications: [{ id: publicationB.id, title: publicationB.title }],
            placements: [{ publicationId: publicationB.id, position: { x: 30, y: 0, z: 30 } }]
        }));
        const localPositionBefore = registry.listSources().find((s) => s.origin === LOCAL_WORLD_DISCOVERY_ORIGIN).placements[0].position;

        const establishedPosition = { x: 40, y: 5, z: 40 };
        const registration = registerMaterializedSnapshotWorldSource(
            registry,
            placedResult('hash-section-h', publicationA.id, establishedPosition),
            publicationA
        );
        assert(registration.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, 'sanity — Snapshot A registers at its own established position');
        const publicationAPositionRef = registry.listSources().find((s) => s.origin === registration.origin).placements[0].position;
        assert(publicationAPositionRef === establishedPosition, 'sanity — the registered position is the exact SAME object reference handed in, never recomputed');

        unregisterMaterializedSnapshotWorldSource(registry, 'hash-section-h', publicationA.id);

        const localAfter = registry.listSources().find((s) => s.origin === LOCAL_WORLD_DISCOVERY_ORIGIN);
        assert(localAfter.placements[0].position === localPositionBefore, '2. LOCAL\'s own position object reference is completely unchanged after an unrelated Snapshot is removed');
        assert(localAfter.placements[0].position.x === 30 && localAfter.placements[0].position.z === 30, '3. LOCAL\'s own position VALUE is unchanged');

        // The removed Snapshot's own established position object was never
        // mutated by removal either — it is simply no longer part of any
        // registered source.
        assert(establishedPosition.x === 40 && establishedPosition.y === 5 && establishedPosition.z === 40, '4. the removed Snapshot\'s own establishedPosition object was never mutated by unregistration');

        console.log('✓ Section H: unregistering a Snapshot never modifies any other source\'s position (same object reference, same values), never touches a LocalPlacementRegistry/claimed-position collaborator (structurally absent from the bridge), and never mutates the removed Snapshot\'s own position object');
    }

    // ---------------------------------------------------------------
    // Section I — re-registration: REGISTER -> UNREGISTER -> REGISTER
    // reaches the same World state as the original registration.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const publication = publishOwnPublication(storageProvider, 'Section I Snapshot Publication');
        const registry = new WorldDiscoverySourceRegistry();
        const position = { x: 50, y: 0, z: 50 };

        const firstRegistration = registerMaterializedSnapshotWorldSource(
            registry,
            placedResult('hash-section-i', publication.id, position),
            publication
        );
        assert(firstRegistration.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, 'sanity — first registration succeeds');
        const firstSource = registry.listSources().find((s) => s.origin === firstRegistration.origin);

        unregisterMaterializedSnapshotWorldSource(registry, 'hash-section-i', publication.id);
        assert(registry.listSources().length === 0, 'sanity — the World is empty again after unregistration');

        const secondRegistration = registerMaterializedSnapshotWorldSource(
            registry,
            placedResult('hash-section-i', publication.id, position),
            publication
        );
        assert(secondRegistration.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, 'sanity — the SAME contentHash/publicationId pair registers again cleanly');

        assert(secondRegistration.origin === firstRegistration.origin, '1. re-registration derives the exact SAME origin — 0.9.163\'s own pure derivation, unchanged by the round trip');
        const secondSource = registry.listSources().find((s) => s.origin === secondRegistration.origin);
        assert(secondSource.publications[0] === firstSource.publications[0], '2. the same Publication reference is registered again — no new Publication identity was invented');
        assert(secondSource.placements[0].position.x === firstSource.placements[0].position.x
            && secondSource.placements[0].position.y === firstSource.placements[0].position.y
            && secondSource.placements[0].position.z === firstSource.placements[0].position.z,
            '3. the resulting position is identical to the original registration\'s own position');
        assert(registry.listSources().length === 1, '4. exactly one source exists — the round trip left no ghost/duplicate entry behind (0.9.9\'s own "a removed origin that returns is a fresh slot, not a revived one")');

        // The full round trip is also reachable through the real UI path:
        // select, unregister via the action, re-register, re-select.
        const canvas = buildCanvasInstance({ registry, materialSources: { local: capturingMaterialSource(Object.freeze({ id: publication.id })) } });
        mountCanvas(canvas);
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: publication.id });
        await flush();
        assert(canvas.selectedEncounterSnapshotInspection !== null, '5. the re-registered Snapshot is selectable and inspectable again, exactly as before the round trip');
        unmountCanvas(canvas);

        console.log('✓ Section I: REGISTER -> UNREGISTER -> REGISTER reaches a World state equivalent to the original registration — same origin, same Publication reference, same position, exactly one entry, using only the existing registry semantics');
    }

    // ---------------------------------------------------------------
    // Section J — structural audit.
    // ---------------------------------------------------------------
    {
        const canvasCodeOnly = canvasSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        const bridgeCodeOnly = bridgeSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        // No new lifecycle enum of any kind.
        assert(!/SnapshotLifecycle|STALE\b|EXPIRED\b|\bREMOVED\b|\bDELETED\b/.test(canvasCodeOnly + bridgeCodeOnly),
            '1. no SnapshotLifecycle/STALE/EXPIRED/REMOVED/DELETED vocabulary exists anywhere in WorldEncounterCanvas.js or MaterializedSnapshotWorldDiscoveryBridge.js');

        // No new registry — the ONE existing WorldDiscoverySourceRegistry
        // import in WorldEncounterCanvas.js is still the projection module
        // alone; the canvas itself never imports the registry class.
        assert(!canvasCodeOnly.includes("from '../../application/WorldDiscoverySourceRegistry.js'"),
            '2. WorldEncounterCanvas.js still never imports the WorldDiscoverySourceRegistry class itself — it depends only on the registry instance it is handed as a prop');

        // No new Snapshot identity — materializedSnapshotWorldOrigin() is
        // still the one, pure, contentHash+publicationId derivation, and
        // this milestone introduced no second one.
        const originDerivationCount = (bridgeCodeOnly.match(/export function materializedSnapshotWorldOrigin/g) || []).length;
        assert(originDerivationCount === 1, '3. exactly one origin-derivation function exists — no second, competing Snapshot identity scheme');

        // No automatic unregister — unregisterSelectedSnapshot() is called
        // from nowhere except the template's own explicit @click.
        const methodCallCount = (canvasCodeOnly.match(/this\.unregisterSelectedSnapshot\(\)|unregisterSelectedSnapshot\(\)/g) || []).length;
        // One method DEFINITION site plus one template @click reference —
        // never a second, internal, automatic call site (e.g. from a
        // watcher, a lifecycle hook, or another method).
        assert(methodCallCount <= 2,
            `4. unregisterSelectedSnapshot() is referenced only by its own definition and the template's @click — found ${methodCallCount} textual reference(s), never invoked from a watcher/lifecycle hook/another method`);
        assert(!/watch:\s*\{[^}]*unregisterSelectedSnapshot/s.test(canvasCodeOnly),
            '4b. unregisterSelectedSnapshot() is never called from a watcher');
        assert(!/(mounted|beforeUnmount|created|updated)\s*\([^)]*\)\s*\{[^}]*unregisterSelectedSnapshot/s.test(canvasCodeOnly),
            '4c. unregisterSelectedSnapshot() is never called from a lifecycle hook — always an explicit Wanderer click');

        // No material/Publication deletion, no Nostr withdrawal, no
        // Arweave deletion — this family's own vocabulary never appears in
        // either touched file.
        assert(!/deleteMaterial|deletePublication|withdrawNostr|deleteArweave|arweave.*delete|nostr.*withdraw/i.test(canvasCodeOnly + bridgeCodeOnly),
            '5. no material deletion, Publication deletion, Nostr withdrawal, or Arweave deletion vocabulary exists in either touched file');

        // No fallback/ranking/deduplication vocabulary.
        assert(!/\brank\b|\btrust\b|\bfreshness\b|\bpreferred\b|\breliable\b|fallback|dedup/i.test(canvasCodeOnly + bridgeCodeOnly),
            '6. no fallback/ranking/deduplication/trust/freshness vocabulary exists in either touched file');

        // The registry itself was not modified by this milestone (its own
        // "plain absence, never a tombstone" semantics are reused
        // verbatim, unchanged).
        const registrySource = await readFile(new URL('../application/WorldDiscoverySourceRegistry.js', import.meta.url), 'utf8');
        assert(!/SnapshotLifecycle|STALE\b|EXPIRED\b|unregisterSelectedSnapshot/.test(registrySource),
            '7. application/WorldDiscoverySourceRegistry.js carries no reference to this milestone\'s own UI action or any new lifecycle vocabulary — its existing setSource()/removeSource() semantics are reused verbatim');

        console.log('✓ Section J: no new lifecycle enum, no new registry, no new Snapshot identity, no automatic unregister (explicit Wanderer click alone), no material/Publication deletion, no Nostr/Arweave action, and no fallback/ranking/deduplication vocabulary exists anywhere in this milestone\'s own two touched files');
        console.log('\n✅ All Snapshot World Source Unregistration checks passed.');
    }
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
