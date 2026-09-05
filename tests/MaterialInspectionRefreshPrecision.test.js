import { readFile } from 'node:fs/promises';

import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import {
    WorldEncounterMaterialLoadStatus,
    WorldEncounterMaterialSource
} from '../application/WorldEncounterMaterialLoading.js';
import { LocalWorldEncounterMaterialSource } from '../application/LocalWorldEncounterMaterialSource.js';
import { WorldEncounterKind } from '../core/WorldEncounter.js';
import { WorldDiscoverySourceRegistry } from '../application/WorldDiscoverySourceRegistry.js';
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
    unregisterMaterializedSnapshotWorldSource
} from '../application/MaterializedSnapshotWorldDiscoveryBridge.js';
import { SnapshotWorldPlacementOutcome } from '../application/SnapshotWorldPlacementOutcome.js';
import { SnapshotWorldRegistrationOutcome } from '../application/SnapshotWorldRegistrationOutcome.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { Publication } from '../publisher/Publication.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.9.169 — Material Inspection Refresh Precision.
//
// 0.9.168's own Section E found, proved, and deliberately did not fix one
// genuine seam: `ui/components/WorldEncounterCanvas.js`'s own
// `refreshSelectionOutcome()` unconditionally tail-called
// `refreshMaterialInspection()` on every one of its own triggers —
// including the World discovery registry's own change listener — so an
// entirely unrelated registry mutation (an unrelated peer joining or
// leaving, an unrelated Snapshot registering) redundantly re-triggered a
// fresh `materialSources.*.load()` call for whatever encounter happened to
// stay selected. This file is the dedicated test contract for the fix that
// closes exactly that seam: `refreshSelectionOutcome()` now compares
// `resolvedEncounterSelection` against its own value immediately before
// the triggering registry notification, and only tail-calls
// `refreshMaterialInspection()` when that comparison actually differs.
//
// TEST-ONLY CONTRACT FOR A REAL, SMALL PRODUCTION CHANGE — not another
// audit that proves and declines to fix. The one production file this
// milestone touches is `ui/components/WorldEncounterCanvas.js`
// (`refreshSelectionOutcome()`, plus one new pure helper,
// `resolvedEncounterSelectionsEqual()`); nothing else was edited to
// produce this file's own passing assertions.
//
//   Section A: existing initial inspection — selecting an encounter still
//              performs its normal material load, exactly as before.
//   Section B: an unrelated registry REGISTRATION — while a Publication
//              stays selected, a completely unrelated World source
//              registers. The selected encounter's own resolved identity
//              is unaffected, and NO redundant material reload occurs.
//   Section C: an unrelated registry UNREGISTRATION — mirrors Section B,
//              for removal instead of registration.
//   Section D: THE CRUCIAL POSITIVE CASE — a registry mutation that
//              actually changes which origin serves the selected
//              encounter's own identity DOES still reload material. This
//              milestone narrows WHEN a reload happens; it never
//              suppresses one that is genuinely owed.
//   Section E: selecting a DIFFERENT encounter still loads that new
//              encounter's own material normally — the optimization never
//              interferes with an actual selection change.
//   Section F: local/peer/Snapshot symmetry — Section B's own scenario,
//              repeated identically for all three source families as the
//              SELECTED encounter, proving the optimization is keyed on
//              `resolvedEncounterSelection`'s own fields, never on
//              `origin === 'local'`/`.startsWith('peer:')`/
//              `.startsWith('snapshot:')` branching.
//   Section G: Snapshot regression — a selected, already-loaded Snapshot
//              encounter survives an unrelated registry mutation with no
//              redundant reload, no automatic Snapshot rediscovery, and no
//              automatic Snapshot materialization.
//   Section H: existing failure semantics — an already-`UNAVAILABLE`
//              selection stays `UNAVAILABLE`, untouched, across an
//              unrelated registry mutation; no new failure vocabulary is
//              introduced.
//   Section I: race/staleness — an unrelated registry notification
//              arriving WHILE a genuinely relevant material load is still
//              in flight never bumps `materialInspectionRequestId`, so it
//              cannot invalidate that in-flight request's own eventual,
//              correct response.
//   Section J: structural boundary — the fix introduces no Snapshot-
//              specific branch, no Nostr/Arweave vocabulary, no
//              materialization logic, no registry redesign, and no new
//              lifecycle state.

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

// A material source that counts every `load()` call it actually receives
// — the one instrument every section in this file reads to tell "reload
// happened" from "reload was correctly skipped."
function countingMaterialSource(counts, key, underlying) {
    return {
        async load(resolvedSelection) {
            counts[key] = (counts[key] || 0) + 1;
            return underlying.load(resolvedSelection);
        }
    };
}

class RecordingMaterialSource extends WorldEncounterMaterialSource {
    constructor(material) { super(); this.material = material; this.calls = []; }
    async load(resolvedSelection) { this.calls.push(resolvedSelection); return this.material; }
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

async function run() {
    // ---------------------------------------------------------------
    // Section A — existing initial inspection: selecting an encounter
    // still performs its normal material inspection/loading, unchanged.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const publication = publishOwnPublication(storageProvider, 'Section A Publication');
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const counts = {};
        const materialSources = { local: countingMaterialSource(counts, 'local', localSource) };

        const registry = new WorldDiscoverySourceRegistry();
        registry.setSource(describeLocalWorldDiscoverySource({
            publications: [{ id: publication.id, title: publication.title }],
            placements: [{ publicationId: publication.id, position: { x: 1, y: 0, z: 1 } }]
        }));

        const canvas = buildCanvasInstance({ registry, materialSources });
        mountCanvas(canvas);
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: publication.id });
        await flush();

        assert(counts.local === 1, `1. selecting an encounter performs exactly one normal material load; got ${counts.local}`);
        assert(canvas.materialInspection && canvas.materialInspection.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE,
            `2. that load resolves AVAILABLE, exactly as before this milestone; got '${canvas.materialInspection && canvas.materialInspection.loading.status}'`);

        unmountCanvas(canvas);
        console.log('✓ Section A: existing initial inspection — selecting an encounter still performs its normal material load, unchanged');
    }

    // ---------------------------------------------------------------
    // Section B — an unrelated registry REGISTRATION never reloads
    // material for the selected, otherwise-unaffected encounter.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const publication = publishOwnPublication(storageProvider, 'Section B Publication');
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const counts = {};
        const materialSources = { local: countingMaterialSource(counts, 'local', localSource) };

        const registry = new WorldDiscoverySourceRegistry();
        registry.setSource(describeLocalWorldDiscoverySource({
            publications: [{ id: publication.id, title: publication.title }],
            placements: [{ publicationId: publication.id, position: { x: 2, y: 0, z: 2 } }]
        }));

        const canvas = buildCanvasInstance({ registry, materialSources });
        mountCanvas(canvas);
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: publication.id });
        await flush();
        assert(counts.local === 1, `3. sanity — selecting the Publication loads its material exactly once; got ${counts.local}`);
        const selectionBefore = canvas.resolvedEncounterSelection;

        const unrelatedPeer = peer('did:key:zSectionBUnrelated');
        registerPeerWorldSource(registry, unrelatedPeer, describePeerWorldDiscoverySource({
            publications: [{ id: 'pub-section-b-unrelated', title: 'Unrelated' }],
            placements: [{ publicationId: 'pub-section-b-unrelated', position: { x: 99, y: 0, z: 99 } }]
        }, unrelatedPeer));
        await flush();

        assert(canvas.resolvedEncounterSelection.origin === selectionBefore.origin && canvas.resolvedEncounterSelection.objectId === selectionBefore.objectId,
            '4. sanity — the selected encounter\'s own resolved identity is unaffected by the unrelated registration');
        assert(counts.local === 1, `5. THE PROOF — an unrelated registry registration triggers NO redundant material reload; got ${counts.local} total load(s), expected exactly 1`);
        assert(canvas.materialInspection.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE,
            '6. the retained materialInspection is still exactly the same AVAILABLE result, never cleared or recomputed for no reason');

        unmountCanvas(canvas);
        console.log('✓ Section B: an unrelated registry registration leaves the selected encounter\'s own material inspection untouched — material reload count = 0');
    }

    // ---------------------------------------------------------------
    // Section C — an unrelated registry UNREGISTRATION, mirroring
    // Section B exactly, for removal instead of registration.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const publication = publishOwnPublication(storageProvider, 'Section C Publication');
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const counts = {};
        const materialSources = { local: countingMaterialSource(counts, 'local', localSource) };

        const registry = new WorldDiscoverySourceRegistry();
        registry.setSource(describeLocalWorldDiscoverySource({
            publications: [{ id: publication.id, title: publication.title }],
            placements: [{ publicationId: publication.id, position: { x: 3, y: 0, z: 3 } }]
        }));
        const unrelatedPeer = peer('did:key:zSectionCUnrelated');
        registerPeerWorldSource(registry, unrelatedPeer, describePeerWorldDiscoverySource({
            publications: [{ id: 'pub-section-c-unrelated', title: 'Unrelated' }],
            placements: [{ publicationId: 'pub-section-c-unrelated', position: { x: 98, y: 0, z: 98 } }]
        }, unrelatedPeer));

        const canvas = buildCanvasInstance({ registry, materialSources });
        mountCanvas(canvas);
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: publication.id });
        await flush();
        assert(counts.local === 1, `7. sanity — selecting the Publication loads its material exactly once; got ${counts.local}`);
        const selectionBefore = canvas.resolvedEncounterSelection;

        unregisterPeerWorldSource(registry, unrelatedPeer);
        await flush();

        assert(canvas.resolvedEncounterSelection.origin === selectionBefore.origin && canvas.resolvedEncounterSelection.objectId === selectionBefore.objectId,
            '8. sanity — the selected encounter\'s own resolved identity is unaffected by the unrelated unregistration');
        assert(counts.local === 1, `9. THE PROOF — an unrelated registry unregistration triggers NO redundant material reload; got ${counts.local} total load(s), expected exactly 1`);

        unmountCanvas(canvas);
        console.log('✓ Section C: an unrelated registry unregistration leaves the selected encounter\'s own material inspection untouched — material reload count = 0');
    }

    // ---------------------------------------------------------------
    // Section D — THE CRUCIAL POSITIVE CASE: a registry mutation that
    // actually changes which origin serves the selected encounter's own
    // identity still reloads material. This milestone narrows WHEN a
    // reload happens; it never suppresses one that is genuinely owed.
    // ---------------------------------------------------------------
    {
        const sharedObjectId = 'pub-section-d-handoff';
        const materialByPeer = {
            firstPeer: Object.freeze({ displayName: 'Section D First Peer Material' }),
            secondPeer: Object.freeze({ displayName: 'Section D Second Peer Material' })
        };
        const counts = {};
        const peerSource = countingMaterialSource(counts, 'peer', {
            async load() { return materialByPeer.secondPeerServing ? materialByPeer.secondPeer : materialByPeer.firstPeer; }
        });

        const registry = new WorldDiscoverySourceRegistry();
        const firstPeerIdentity = peer('did:key:zSectionDFirst');
        registerPeerWorldSource(registry, firstPeerIdentity, describePeerWorldDiscoverySource({
            publications: [{ id: sharedObjectId, title: 'Section D Handoff' }],
            placements: [{ publicationId: sharedObjectId, position: { x: 4, y: 0, z: 4 } }]
        }, firstPeerIdentity));

        const canvas = buildCanvasInstance({ registry, materialSources: { peer: peerSource } });
        mountCanvas(canvas);
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: sharedObjectId });
        await flush();
        assert(counts.peer === 1, `10. sanity — selecting the handed-off Publication loads its material exactly once; got ${counts.peer}`);
        const firstOrigin = canvas.resolvedEncounterSelection.origin;
        assert(firstOrigin === derivePeerWorldOrigin(firstPeerIdentity), '11. sanity — the selection is initially served by the first peer\'s own origin');

        // The registry contribution that actually determines the
        // selected encounter genuinely changes: the first peer leaves,
        // and a second peer takes over serving the SAME Publication id —
        // `resolvedEncounterSelection.origin` itself changes as a direct
        // result.
        unregisterPeerWorldSource(registry, firstPeerIdentity);
        await flush();
        materialByPeer.secondPeerServing = true;
        const secondPeerIdentity = peer('did:key:zSectionDSecond');
        registerPeerWorldSource(registry, secondPeerIdentity, describePeerWorldDiscoverySource({
            publications: [{ id: sharedObjectId, title: 'Section D Handoff' }],
            placements: [{ publicationId: sharedObjectId, position: { x: 4, y: 0, z: 4 } }]
        }, secondPeerIdentity));
        await flush();

        const secondOrigin = canvas.resolvedEncounterSelection.origin;
        assert(secondOrigin === derivePeerWorldOrigin(secondPeerIdentity) && secondOrigin !== firstOrigin,
            `12. sanity — the SAME selected objectId is now served by a genuinely different origin; got '${secondOrigin}'`);
        assert(counts.peer > 1, `13. THE CRUCIAL POSITIVE CASE — a registry mutation that changes the selected encounter's own resolved origin DOES reload material; got ${counts.peer} total load(s), expected more than 1`);
        assert(canvas.materialInspection.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE
            && canvas.materialInspection.loading.material.displayName === materialByPeer.secondPeer.displayName,
            '14. the reloaded material inspection genuinely reflects the NEW serving peer\'s own material, not the stale first peer\'s');

        unmountCanvas(canvas);
        console.log('✓ Section D: a registry mutation that genuinely changes the selected encounter\'s own resolved origin still reloads material — the optimization never suppresses a legitimate refresh');
    }

    // ---------------------------------------------------------------
    // Section E — selecting a DIFFERENT encounter still loads that new
    // encounter's own material normally.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const publicationOne = publishOwnPublication(storageProvider, 'Section E Publication One');
        const publicationTwo = publishOwnPublication(storageProvider, 'Section E Publication Two');
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const counts = {};
        const materialSources = { local: countingMaterialSource(counts, 'local', localSource) };

        const registry = new WorldDiscoverySourceRegistry();
        registry.setSource(describeLocalWorldDiscoverySource({
            publications: [
                { id: publicationOne.id, title: publicationOne.title },
                { id: publicationTwo.id, title: publicationTwo.title }
            ],
            placements: [
                { publicationId: publicationOne.id, position: { x: 5, y: 0, z: 5 } },
                { publicationId: publicationTwo.id, position: { x: 6, y: 0, z: 6 } }
            ]
        }));

        const canvas = buildCanvasInstance({ registry, materialSources });
        mountCanvas(canvas);
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: publicationOne.id });
        await flush();
        assert(counts.local === 1, `15. sanity — selecting the first Publication loads its own material; got ${counts.local}`);
        assert(canvas.materialInspection.loading.material.id === publicationOne.id, '16. sanity — the loaded material is the first Publication\'s own');

        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: publicationTwo.id });
        await flush();
        assert(counts.local === 2, `17. THE PROOF — selecting a DIFFERENT encounter still reloads material for it, unaffected by this milestone's own optimization; got ${counts.local} total load(s), expected exactly 2`);
        assert(canvas.materialInspection.loading.material.id === publicationTwo.id, '18. the reloaded material genuinely reflects the newly selected, second Publication');

        unmountCanvas(canvas);
        console.log('✓ Section E: selecting a different encounter still loads its own material normally');
    }

    // ---------------------------------------------------------------
    // Section F — local/peer/Snapshot symmetry: Section B's own scenario,
    // repeated identically for all three source families as the SELECTED
    // encounter — the optimization is keyed on resolvedEncounterSelection
    // alone, never on which source family the selection happens to be.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const localPublication = publishOwnPublication(storageProvider, 'Section F Local');
        const snapshotPublication = publishOwnPublication(storageProvider, 'Section F Snapshot');
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const peerMaterial = Object.freeze({ displayName: 'Section F Peer Avatar' });
        const counts = {};
        const materialSources = {
            local: countingMaterialSource(counts, 'local', localSource),
            peer: countingMaterialSource(counts, 'peer', new RecordingMaterialSource(peerMaterial))
        };

        const registry = new WorldDiscoverySourceRegistry();
        registry.setSource(describeLocalWorldDiscoverySource({
            publications: [{ id: localPublication.id, title: localPublication.title }],
            placements: [{ publicationId: localPublication.id, position: { x: 7, y: 0, z: 7 } }]
        }));
        const peerIdentity = peer('did:key:zSectionFPeer');
        registerPeerWorldSource(registry, peerIdentity, describePeerWorldDiscoverySource({
            publications: [{ id: 'pub-section-f-peer', title: 'Section F Peer' }],
            placements: [{ publicationId: 'pub-section-f-peer', position: { x: 8, y: 0, z: 8 } }]
        }, peerIdentity));
        const registration = registerMaterializedSnapshotWorldSource(registry, placedResult('hash-section-f', snapshotPublication.id, { x: 9, y: 0, z: 9 }), snapshotPublication);
        assert(registration.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, '19. sanity — Snapshot registration succeeds');

        const scenarios = {
            local: { objectId: localPublication.id, countKey: 'local' },
            peer: { objectId: 'pub-section-f-peer', countKey: 'peer' },
            snapshot: { objectId: snapshotPublication.id, countKey: 'local' } // Snapshot rides materialSources.local, per 0.9.166.
        };

        const canvas = buildCanvasInstance({ registry, materialSources });
        mountCanvas(canvas);

        for (const [name, { objectId, countKey }] of Object.entries(scenarios)) {
            canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId });
            await flush();
            const before = counts[countKey] || 0;

            const oneOffPeer = peer(`did:key:zSectionF-${name}-unrelated`);
            registerPeerWorldSource(registry, oneOffPeer, describePeerWorldDiscoverySource({
                publications: [{ id: `pub-section-f-${name}-unrelated`, title: 'Unrelated' }],
                placements: [{ publicationId: `pub-section-f-${name}-unrelated`, position: { x: 50, y: 0, z: 50 } }]
            }, oneOffPeer));
            await flush();
            unregisterPeerWorldSource(registry, oneOffPeer);
            await flush();

            const after = counts[countKey] || 0;
            assert(after === before, `20. CAPABILITY — ${name}'s own selection sees NO redundant reload from an unrelated registry mutation, exactly like every other source family; got ${after - before} extra load(s)`);
        }

        unmountCanvas(canvas);
        registry.removeSource(LOCAL_WORLD_DISCOVERY_ORIGIN);
        unregisterPeerWorldSource(registry, peerIdentity);
        unregisterMaterializedSnapshotWorldSource(registry, registration.contentHash, snapshotPublication.id);

        // Structural confirmation: the fix itself never branches on a
        // source-family string. `resolvedEncounterSelectionsEqual()` and
        // `refreshSelectionOutcome()` are read directly, and neither
        // references 'local'/'peer:'/'snapshot:' — the same source-family
        // blindness every other seam in this file already holds.
        const source = await readFile(new URL('../ui/components/WorldEncounterCanvas.js', import.meta.url), 'utf8');
        const equalityFunctionMatch = source.match(/function resolvedEncounterSelectionsEqual\([^)]*\)\s*\{[\s\S]*?\n\}/);
        const refreshSelectionOutcomeMatch = source.match(/refreshSelectionOutcome\(\)\s*\{[\s\S]*?\n {8}\},/);
        assert(equalityFunctionMatch && refreshSelectionOutcomeMatch, '21. sanity — both functions this milestone touches are found in the production file');
        for (const forbidden of ['\'local\'', '\'peer:', '\'snapshot:', 'startsWith(\'peer', 'startsWith(\'snapshot']) {
            assert(!equalityFunctionMatch[0].includes(forbidden) && !refreshSelectionOutcomeMatch[0].includes(forbidden),
                `22. neither resolvedEncounterSelectionsEqual() nor refreshSelectionOutcome() references '${forbidden}' — the optimization stays source-family blind`);
        }

        console.log('✓ Section F: local/peer/Snapshot symmetry — an unrelated registry mutation causes no redundant reload for any of the three source families, and the fix itself contains no source-family branch');
    }

    // ---------------------------------------------------------------
    // Section G — Snapshot regression: a selected, already-loaded
    // Snapshot encounter survives an unrelated registry mutation with no
    // redundant reload, no automatic rediscovery, and no automatic
    // materialization.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const snapshotPublication = publishOwnPublication(storageProvider, 'Section G Snapshot');
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const counts = {};
        const materialSources = { local: countingMaterialSource(counts, 'local', localSource) };

        const registry = new WorldDiscoverySourceRegistry();
        const registration = registerMaterializedSnapshotWorldSource(registry, placedResult('hash-section-g', snapshotPublication.id, { x: 10, y: 0, z: 10 }), snapshotPublication);
        assert(registration.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, '23. sanity — Snapshot registration succeeds');

        let discoverSnapshotCalls = 0;
        let snapshotDistributionCalls = 0;
        const discoverSnapshotCommand = async () => { discoverSnapshotCalls += 1; return null; };
        const snapshotDistributionCommand = async () => { snapshotDistributionCalls += 1; return null; };

        const canvas = buildCanvasInstance({ registry, materialSources });
        canvas.discoverSnapshotCommand = discoverSnapshotCommand;
        canvas.snapshotDistributionCommand = snapshotDistributionCommand;
        mountCanvas(canvas);
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: snapshotPublication.id });
        await flush();
        assert(counts.local === 1, `24. sanity — selecting the Snapshot Publication loads its material exactly once; got ${counts.local}`);
        assert(canvas.materialInspection.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE, '25. sanity — the Snapshot Publication\'s own material loads AVAILABLE (0.9.166\'s own local-storage-backed routing)');

        const unrelatedPeer = peer('did:key:zSectionGUnrelated');
        registerPeerWorldSource(registry, unrelatedPeer, describePeerWorldDiscoverySource({
            publications: [{ id: 'pub-section-g-unrelated', title: 'Unrelated' }],
            placements: [{ publicationId: 'pub-section-g-unrelated', position: { x: 97, y: 0, z: 97 } }]
        }, unrelatedPeer));
        await flush();
        unregisterPeerWorldSource(registry, unrelatedPeer);
        await flush();

        assert(counts.local === 1, `26. NO REDUNDANT MATERIAL RELOAD — got ${counts.local} total load(s), expected exactly 1`);
        assert(discoverSnapshotCalls === 0, `27. NO SNAPSHOT REDISCOVERY — discoverSnapshotCommand was never called automatically; got ${discoverSnapshotCalls} call(s)`);
        assert(snapshotDistributionCalls === 0, `28. NO SNAPSHOT MATERIALIZATION — snapshotDistributionCommand was never called automatically; got ${snapshotDistributionCalls} call(s)`);
        assert(canvas.materialInspection.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE, '29. the retained Snapshot material inspection is untouched');

        unmountCanvas(canvas);
        console.log('✓ Section G: Snapshot regression — a selected, already-loaded Snapshot encounter survives an unrelated registry mutation with no redundant reload, no rediscovery, and no materialization');
    }

    // ---------------------------------------------------------------
    // Section H — existing failure semantics: an already-UNAVAILABLE
    // selection stays UNAVAILABLE, untouched, across an unrelated
    // registry mutation; no new failure vocabulary is introduced.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const counts = {};
        const materialSources = { local: countingMaterialSource(counts, 'local', localSource) };

        // The registry advertises a Publication id that was never actually
        // published into local storage — a genuine, pre-existing
        // UNAVAILABLE case (application/LocalWorldEncounterMaterialSource.js's
        // own "not found in local storage" boundary), entirely unrelated to
        // this milestone's own optimization.
        const registry = new WorldDiscoverySourceRegistry();
        registry.setSource(describeLocalWorldDiscoverySource({
            publications: [{ id: 'pub-section-h-ghost', title: 'Ghost Publication' }],
            placements: [{ publicationId: 'pub-section-h-ghost', position: { x: 11, y: 0, z: 11 } }]
        }));

        const canvas = buildCanvasInstance({ registry, materialSources });
        mountCanvas(canvas);
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-section-h-ghost' });
        await flush();
        assert(counts.local === 1, `30. sanity — selecting the ghost Publication attempts its own material load exactly once; got ${counts.local}`);
        assert(canvas.materialInspection.loading.status === WorldEncounterMaterialLoadStatus.UNAVAILABLE,
            `31. sanity — the pre-existing UNAVAILABLE case reproduces exactly as before; got '${canvas.materialInspection.loading.status}'`);

        const unrelatedPeer = peer('did:key:zSectionHUnrelated');
        registerPeerWorldSource(registry, unrelatedPeer, describePeerWorldDiscoverySource({
            publications: [{ id: 'pub-section-h-unrelated', title: 'Unrelated' }],
            placements: [{ publicationId: 'pub-section-h-unrelated', position: { x: 96, y: 0, z: 96 } }]
        }, unrelatedPeer));
        await flush();

        assert(counts.local === 1, `32. THE PROOF — an unrelated registry mutation triggers no redundant reload attempt even for an already-UNAVAILABLE selection; got ${counts.local} total load(s)`);
        assert(canvas.materialInspection.loading.status === WorldEncounterMaterialLoadStatus.UNAVAILABLE,
            `33. UNAVAILABLE is preserved, unconverted into any other status; got '${canvas.materialInspection.loading.status}'`);
        assert(Object.keys(WorldEncounterMaterialLoadStatus).sort().join(',') === 'AVAILABLE,UNAVAILABLE',
            '34. this milestone introduces no third status value');

        unmountCanvas(canvas);
        console.log('✓ Section H: existing failure semantics — an already-UNAVAILABLE selection stays UNAVAILABLE across an unrelated registry mutation, with no new failure vocabulary');
    }

    // ---------------------------------------------------------------
    // Section I — race/staleness: an unrelated registry notification
    // arriving WHILE a genuinely relevant material load is still in
    // flight never bumps materialInspectionRequestId, so it cannot
    // invalidate that in-flight request's own eventual, correct response.
    // ---------------------------------------------------------------
    {
        let releaseLoad = null;
        const material = Object.freeze({ displayName: 'Section I Material' });
        const deferredSource = {
            load() {
                return new Promise((resolve) => { releaseLoad = () => resolve(material); });
            }
        };

        const registry = new WorldDiscoverySourceRegistry();
        registry.setSource(describeLocalWorldDiscoverySource({
            publications: [{ id: 'pub-section-i', title: 'Section I' }],
            placements: [{ publicationId: 'pub-section-i', position: { x: 12, y: 0, z: 12 } }]
        }));

        const canvas = buildCanvasInstance({ registry, materialSources: { local: deferredSource } });
        mountCanvas(canvas);
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-section-i' });
        await flush();
        assert(typeof releaseLoad === 'function', '35. sanity — the material load is genuinely in flight, not yet resolved');
        const requestIdWhileInFlight = canvas.materialInspectionRequestId;

        // An entirely unrelated registry mutation arrives WHILE that load
        // is still pending.
        const unrelatedPeer = peer('did:key:zSectionIUnrelated');
        registerPeerWorldSource(registry, unrelatedPeer, describePeerWorldDiscoverySource({
            publications: [{ id: 'pub-section-i-unrelated', title: 'Unrelated' }],
            placements: [{ publicationId: 'pub-section-i-unrelated', position: { x: 95, y: 0, z: 95 } }]
        }, unrelatedPeer));
        await flush();

        assert(canvas.materialInspectionRequestId === requestIdWhileInFlight,
            `36. THE PROOF — an unrelated registry notification never bumps materialInspectionRequestId while a relevant load is in flight; expected ${requestIdWhileInFlight}, got ${canvas.materialInspectionRequestId}`);
        assert(canvas.materialInspection === null, '37. sanity — the in-flight request has not resolved yet, so materialInspection is still null');

        // Now let the original, still-relevant request resolve.
        releaseLoad();
        await flush();

        assert(canvas.materialInspection && canvas.materialInspection.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE
            && canvas.materialInspection.loading.material.displayName === material.displayName,
            '38. THE PROOF — the in-flight request\'s own correct response is written, never discarded as stale by the unrelated notification that arrived mid-flight');

        unmountCanvas(canvas);
        console.log('✓ Section I: an unrelated registry notification arriving mid-flight never invalidates a genuinely relevant, in-flight material inspection request');
    }

    // ---------------------------------------------------------------
    // Section J — structural boundary: the fix introduces no
    // Snapshot-specific branch, no Nostr/Arweave vocabulary, no
    // materialization logic, no registry redesign, and no new lifecycle
    // state.
    // ---------------------------------------------------------------
    {
        const canvasSource = await readFile(new URL('../ui/components/WorldEncounterCanvas.js', import.meta.url), 'utf8');
        const registrySource = await readFile(new URL('../application/WorldDiscoverySourceRegistry.js', import.meta.url), 'utf8');

        const forbiddenInFix = ['Nostr', 'nostr', 'Arweave', 'arweave', 'materialize', 'Materialize', 'ACTIVE', 'EXPIRED', 'STALE', 'SYNCED', 'INACTIVE', 'REVOKED'];
        const equalityFunctionMatch = canvasSource.match(/function resolvedEncounterSelectionsEqual\([^)]*\)\s*\{[\s\S]*?\n\}/);
        const refreshSelectionOutcomeMatch = canvasSource.match(/refreshSelectionOutcome\(\)\s*\{[\s\S]*?\n {8}\},/);
        assert(equalityFunctionMatch && refreshSelectionOutcomeMatch, '39. sanity — both functions this milestone touches are found in the production file');
        for (const term of forbiddenInFix) {
            assert(!equalityFunctionMatch[0].includes(term) && !refreshSelectionOutcomeMatch[0].includes(term),
                `40. neither resolvedEncounterSelectionsEqual() nor refreshSelectionOutcome() references '${term}' — no Snapshot-specific branch, materialization logic, or new lifecycle vocabulary was introduced`);
        }

        // The registry itself is untouched by this milestone — still the
        // same coarse, argument-less notification 0.9.12 already
        // established; the observer became more selective, never the
        // registry more granular.
        assert(!registrySource.includes('resolvedEncounterSelectionsEqual') && !registrySource.includes('MaterialInspection'),
            '41. WorldDiscoverySourceRegistry.js carries no reference to this fix\'s own new helper or to material inspection — the registry was not redesigned');

        console.log('✓ Section J: structural boundary — no Snapshot-specific branch, no Nostr/Arweave vocabulary, no materialization logic, no registry redesign, and no new lifecycle state');
    }

    console.log('\n✅ All Material Inspection Refresh Precision tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
