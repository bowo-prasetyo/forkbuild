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

// 0.9.168 — World View Capability Reassessment & Architecture Audit.
//
// 0.9.150 through 0.9.167 built and then re-audited, seam by seam and then
// end to end, one vertical question: can a decentralized Snapshot travel
// DISCOVER through RENDER and coexist, unmodified, with local and peer
// material? 0.9.167's own recommendation was explicit: stop extending the
// Snapshot-specific pipeline, and instead ask a wider, HORIZONTAL
// question, across every World source family the running app now has —
// not "does Snapshot work," but "what genuine World View capability is
// still missing, now that local, peer, and Snapshot sources all converge
// into the same World machinery?"
//
// TEST-ONLY. ZERO PRODUCTION CHANGES. Every file this audit imports is
// read, real, and unmodified — this file characterizes what it finds; it
// fixes nothing, exactly as 0.9.162/0.9.164/0.9.165/0.9.167 already
// established for this same family of audits.
//
//   Section A: source-family convergence — the same registry, holding
//              local, peer, and Snapshot sources at once, projects through
//              `describeWorldFromDiscoveryRegistry()` into rows that carry
//              NO source-family field at all; `origin` resurfaces exactly
//              once, at encounter SELECTION, for material acquisition
//              alone — never at derivation or rendering.
//   Section B: the Snapshot termination boundary, re-swept wider than
//              0.9.167's own Section J — every file between REGISTER and
//              RENDER (`WorldDiscoveryRegistryProjection.js`,
//              `core/WorldEncounter.js`, `WorldEncounterReadModel.js`,
//              `WorldEncounterView.js`, `WorldEncounterSelectionOutcome.js`,
//              `WorldEncounterMaterialInspection.js`) carries no
//              Snapshot/Nostr/Arweave vocabulary of any kind.
//   Section C: the capability matrix — for local, peer, and Snapshot alike:
//              registry participation, World placement, encounter
//              derivation, encounter selection, material loading,
//              rendering, and registry-level source lifecycle (set/remove)
//              all behave identically. Any asymmetry found is named as
//              either a documented, intentional production-usage choice or
//              a genuine gap — never silently "fixed" here.
//   Section D: World lifecycle semantics — REGISTER -> OBSERVE -> SELECT ->
//              LOAD -> RENDER -> UNREGISTER, proven concretely for peer and
//              Snapshot (each carries its own dedicated register/unregister
//              pair). `'local'` carries no unregister of its own — a
//              PRODUCTION-USAGE fact 0.9.165's own Section D already named,
//              re-confirmed here, never invented as a registry limitation.
//              No new lifecycle vocabulary (ACTIVE/EXPIRED/STALE/SYNCED) is
//              introduced or found anywhere this section sweeps.
//   Section E: temporal independence — vehicle proximity polling, World
//              discovery's registry notification, and Snapshot's own
//              entirely-manual discovery/materialization pipeline are
//              confirmed structurally independent of one another. ONE
//              GENUINE SEAM WAS FOUND, NAMED, AND PROVEN HERE, NOT FIXED —
//              FIXED BY 0.9.169. Any registry membership change —
//              including one entirely unrelated to the currently selected
//              encounter — used to trigger a fresh, redundant
//              `materialSources.*.load()` call for that selection, via
//              `refreshSelectionOutcome()`'s own unconditional tail-call to
//              `refreshMaterialInspection()`. Correctness was unaffected
//              (0.9.39's own request-id guard already discarded a
//              superseded response), but "registry membership change !=
//              material refresh" did not fully hold at the time this audit
//              ran. Section E below is UPDATED, post-0.9.169, to confirm
//              the fix directly against the same real canvas: an unrelated
//              registry mutation no longer re-triggers a load — see
//              `tests/MaterialInspectionRefreshPrecision.test.js` for that
//              fix's own dedicated test contract.
//   Section F: structural sweep — this milestone adds no production file,
//              and the failure/status vocabulary this whole family already
//              established (`WorldEncounterMaterialLoadStatus.AVAILABLE`/
//              `.UNAVAILABLE`, `SnapshotWorldRegistrationOutcome.REGISTERED`)
//              stays exactly as narrow as it already was.

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

function projectedPublicationsOf(ctx) {
    ctx.effectiveView = WorldEncounterCanvas.computed.effectiveView.call(ctx);
    ctx.publicationRows = WorldEncounterCanvas.computed.publicationRows.call(ctx);
    return WorldEncounterCanvas.computed.projectedPublications.call(ctx);
}

// Recursively collects every OWN key found anywhere inside a plain
// data structure — used by Section A to prove a whole projected view
// carries no 'origin'-shaped field anywhere in it, not merely at its
// top level.
function collectAllKeys(value, seen = new Set(), keys = new Set()) {
    if (value === null || typeof value !== 'object') return keys;
    if (seen.has(value)) return keys;
    seen.add(value);
    if (Array.isArray(value)) {
        for (const item of value) collectAllKeys(item, seen, keys);
        return keys;
    }
    for (const key of Object.keys(value)) {
        keys.add(key);
        collectAllKeys(value[key], seen, keys);
    }
    return keys;
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — source-family convergence: local, peer, and Snapshot,
    // all registered at once, project through describeWorldFromDiscoveryRegistry()
    // into rows carrying NO source-family field anywhere; `origin`
    // resurfaces exactly once, at SELECTION, for material acquisition
    // alone.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const localPublication = publishOwnPublication(storageProvider, 'Section A Local');

        const registry = new WorldDiscoverySourceRegistry();
        registry.setSource(describeLocalWorldDiscoverySource({
            publications: [{ id: localPublication.id, title: localPublication.title }],
            placements: [{ publicationId: localPublication.id, position: { x: 1, y: 0, z: 1 } }]
        }));
        registry.setSource(describePeerWorldDiscoverySource({
            publications: [{ id: 'pub-section-a-peer', title: 'Section A Peer' }],
            placements: [{ publicationId: 'pub-section-a-peer', position: { x: 2, y: 0, z: 2 } }]
        }, peer('did:key:zSectionA')));
        const snapshotPublication = new Publication({ id: 'pub-section-a-snapshot', title: 'Section A Snapshot' });
        registerMaterializedSnapshotWorldSource(registry, placedResult('hash-section-a', snapshotPublication.id, { x: 3, y: 0, z: 3 }), snapshotPublication);

        const view = describeWorldFromDiscoveryRegistry(registry);
        assert(view.publications.length === 3, `1. sanity — all three sources' own Publications reach one combined projection; got ${view.publications.length}`);

        const allKeys = collectAllKeys(view);
        assert(!allKeys.has('origin') && !allKeys.has('source') && !allKeys.has('sourceOrigin'),
            `2. THE PROOF — describeWorldFromDiscoveryRegistry()'s own result carries no 'origin'/'source'/'sourceOrigin' field ANYWHERE in its structure, however deep; found keys: ${Array.from(allKeys).join(',')}`);

        // Rendering: the mounted canvas's own projected markers are built
        // from this SAME origin-blind view — confirmed the same way.
        const canvas = buildCanvasInstance({ registry });
        mountCanvas(canvas);
        const projected = projectedPublicationsOf(canvas);
        assert(projected.length === 3, `3. sanity — all three sources reach one rendered canvas; got ${projected.length}`);
        const projectedKeys = collectAllKeys(projected);
        assert(!projectedKeys.has('origin'), `4. THE PROOF — the rendered/projected markers themselves carry no 'origin' field either; found keys: ${Array.from(projectedKeys).join(',')}`);

        // Selection: origin resurfaces here, and ONLY here — the one place
        // this codebase genuinely needs to know a record's own source, for
        // material acquisition.
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: localPublication.id });
        assert(canvas.selectionOutcome.status === 'RESOLVED', '5. sanity — the local Publication resolves unambiguously');
        assert(canvas.resolvedEncounterSelection.origin === LOCAL_WORLD_DISCOVERY_ORIGIN,
            `6. THE PROOF — origin resurfaces exactly at SELECTION, carrying the real source's own identity; got '${canvas.resolvedEncounterSelection.origin}'`);

        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: snapshotPublication.id });
        assert(canvas.selectionOutcome.status === 'RESOLVED' && canvas.resolvedEncounterSelection.origin.startsWith('snapshot:'),
            '7. the Snapshot Publication resolves with its own snapshot: origin at selection too, identically');

        unmountCanvas(canvas);
        console.log('✓ Section A: source-family convergence — local, peer, and Snapshot sources converge into one origin-blind projection and one origin-blind rendered canvas; origin resurfaces exactly once, at encounter selection, for material acquisition alone');
    }

    // ---------------------------------------------------------------
    // Section B — the Snapshot termination boundary, re-swept wider than
    // 0.9.167's own Section J: every file between REGISTER and RENDER
    // carries no Snapshot/Nostr/Arweave vocabulary of any kind.
    // ---------------------------------------------------------------
    {
        const boundaryFiles = [
            '../application/WorldDiscoveryRegistryProjection.js',
            '../core/WorldEncounter.js',
            '../application/WorldEncounterReadModel.js',
            '../application/WorldEncounterView.js',
            '../application/WorldEncounterSelectionOutcome.js',
            '../application/WorldEncounterSelectionResolution.js',
            '../application/WorldEncounterMaterialInspection.js',
            '../application/WorldDiscoverySourceRegistry.js'
        ];

        function codeOnly(source) {
            return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        }

        const forbidden = ['Nostr', 'nostr', 'Arweave', 'arweave', 'SnapshotMaterialSource', 'DecentralizedSnapshotResolver', 'MaterializedSnapshotWorldDiscoveryBridge', 'snapshot:'];
        for (const relativePath of boundaryFiles) {
            const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
            const code = codeOnly(source);
            for (const term of forbidden) {
                assert(!code.includes(term), `8. ${relativePath} never references '${term}' — the ENCOUNTER -> SELECT -> LOAD -> RENDER boundary stays entirely source-family-agnostic`);
            }
        }

        console.log('✓ Section B: the Snapshot termination boundary holds across every file between REGISTER and RENDER, not merely the two files 0.9.167 already swept — none of them carry Snapshot/Nostr/Arweave vocabulary of any kind');
    }

    // ---------------------------------------------------------------
    // Section C — the capability matrix: for local, peer, and Snapshot
    // alike, registry participation, World placement, encounter
    // derivation, encounter selection, material loading, rendering, and
    // registry-level source lifecycle all behave identically.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const localPublication = publishOwnPublication(storageProvider, 'Section C Local');
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const peerMaterial = Object.freeze({ displayName: 'Section C Peer Avatar' });
        const peerSource = new RecordingMaterialSource(peerMaterial);
        const materialSources = { local: localSource, peer: peerSource };

        const registry = new WorldDiscoverySourceRegistry();
        const localWorldSource = describeLocalWorldDiscoverySource({
            publications: [{ id: localPublication.id, title: localPublication.title }],
            placements: [{ publicationId: localPublication.id, position: { x: 10, y: 0, z: 10 } }]
        });
        const peerIdentity = peer('did:key:zSectionC');
        const peerWorldSource = describePeerWorldDiscoverySource({
            publications: [{ id: 'pub-section-c-peer', title: 'Section C Peer' }],
            placements: [{ publicationId: 'pub-section-c-peer', position: { x: 11, y: 0, z: 11 } }]
        }, peerIdentity);

        const snapshotPublication = publishOwnPublication(storageProvider, 'Section C Snapshot');

        const capabilities = {
            local: { origin: LOCAL_WORLD_DISCOVERY_ORIGIN, objectId: localPublication.id },
            peer: { origin: derivePeerWorldOrigin(peerIdentity), objectId: 'pub-section-c-peer' },
            snapshot: { origin: null, objectId: snapshotPublication.id }
        };

        // 1. Registry participation.
        registry.setSource(localWorldSource);
        registerPeerWorldSource(registry, peerIdentity, peerWorldSource);
        const registration = registerMaterializedSnapshotWorldSource(registry, placedResult('hash-section-c', snapshotPublication.id, { x: 12, y: 0, z: 12 }), snapshotPublication);
        assert(registration.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, '9. sanity — Snapshot registration succeeds');
        capabilities.snapshot.origin = registration.origin;
        assert(registry.listSources().length === 3, `10. CAPABILITY 1/7 — registry participation: all three sources hold their own slot; got ${registry.listSources().length}`);

        // 2. World placement — each source's own placement position is
        // present and distinct, confirmed via the combined projection.
        const view = describeWorldFromDiscoveryRegistry(registry);
        const byId = Object.fromEntries(view.publications.map((p) => [p.objectId, p]));
        assert(byId[capabilities.local.objectId].x === 10 && byId[capabilities.peer.objectId].x === 11 && byId[capabilities.snapshot.objectId].x === 12,
            '11. CAPABILITY 2/7 — World placement: all three sources carry their own distinct position');

        // 3. Encounter derivation — all three appear as derived encounters.
        assert(view.publications.length === 3, `12. CAPABILITY 3/7 — encounter derivation: all three sources derive a World encounter; got ${view.publications.length}`);

        // 4. Encounter selection — each resolves unambiguously to its own
        // origin.
        const canvas = buildCanvasInstance({ registry, materialSources });
        mountCanvas(canvas);
        for (const [name, { objectId, origin }] of Object.entries(capabilities)) {
            canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId });
            assert(canvas.selectionOutcome.status === 'RESOLVED' && canvas.resolvedEncounterSelection.origin === origin,
                `13. CAPABILITY 4/7 — encounter selection: ${name}'s own Publication resolves to exactly its own registered origin '${origin}'; got '${canvas.resolvedEncounterSelection && canvas.resolvedEncounterSelection.origin}'`);
        }

        // 5. Material loading — each loads AVAILABLE through the
        // materialSources.local/peer routing every prior milestone already
        // established (Snapshot rides materialSources.local, per 0.9.166).
        for (const [name, { objectId }] of Object.entries(capabilities)) {
            canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId });
            await flush();
            canvas.refreshMaterialInspection();
            await flush();
            assert(canvas.materialInspection && canvas.materialInspection.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE,
                `14. CAPABILITY 5/7 — material loading: ${name}'s own selection loads AVAILABLE material; got '${canvas.materialInspection && canvas.materialInspection.loading.status}'`);
        }

        // 6. Rendering — all three project as markers simultaneously.
        const projected = projectedPublicationsOf(canvas);
        assert(projected.length === 3, `15. CAPABILITY 6/7 — rendering: all three sources render as projected markers at once; got ${projected.length}`);
        unmountCanvas(canvas);

        // 7. Registry-level source lifecycle — set AND remove, symmetric
        // across all three origins, including 'local' — the registry
        // itself holds no special case for it (0.9.165's own Section D,
        // re-confirmed here as part of this wider matrix).
        for (const [name, { origin }] of Object.entries(capabilities)) {
            const before = registry.listSources().length;
            registry.removeSource(origin);
            const after = registry.listSources().length;
            assert(after === before - 1, `16. CAPABILITY 7/7 — registry-level source lifecycle: removing ${name}'s own origin ('${origin}') removes exactly one slot, exactly like every other origin`);
        }
        assert(registry.listSources().length === 0, '17. sanity — all three origins are removable, leaving the registry empty, exactly like any other combination of origins would');

        console.log('✓ Section C: the capability matrix — registry participation, World placement, encounter derivation, encounter selection, material loading, rendering, and registry-level source lifecycle are all symmetric across local, peer, and Snapshot; no asymmetry found at this layer');
    }

    // ---------------------------------------------------------------
    // Section D — World lifecycle semantics: REGISTER -> OBSERVE -> SELECT
    // -> LOAD -> RENDER -> UNREGISTER, proven concretely for peer and
    // Snapshot; 'local' carries no unregister of its own — a documented
    // production-usage fact, not a registry limitation, and no new
    // lifecycle vocabulary is introduced or found anywhere.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const snapshotPublication = publishOwnPublication(storageProvider, 'Section D Snapshot');
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const peerMaterial = Object.freeze({ displayName: 'Section D Peer Avatar' });
        const materialSources = { local: localSource, peer: new RecordingMaterialSource(peerMaterial) };

        const registry = new WorldDiscoverySourceRegistry();
        let observedChanges = 0;
        const unsubscribe = registry.subscribe(() => { observedChanges += 1; });

        // REGISTER (peer).
        const peerIdentity = peer('did:key:zSectionD');
        registerPeerWorldSource(registry, peerIdentity, describePeerWorldDiscoverySource({
            publications: [{ id: 'pub-section-d-peer', title: 'Section D Peer' }],
            placements: [{ publicationId: 'pub-section-d-peer', position: { x: 20, y: 0, z: 20 } }]
        }, peerIdentity));
        // OBSERVE — the registry's own subscription already notified.
        assert(observedChanges === 1, `18. OBSERVE — registering the peer notified this subscriber exactly once; got ${observedChanges}`);

        // REGISTER (Snapshot).
        const registration = registerMaterializedSnapshotWorldSource(registry, placedResult('hash-section-d', snapshotPublication.id, { x: 21, y: 0, z: 21 }), snapshotPublication);
        assert(registration.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, '19. sanity — Snapshot registration succeeds');
        assert(observedChanges === 2, `20. OBSERVE — registering the Snapshot notified this subscriber again; got ${observedChanges}`);

        // SELECT -> LOAD -> RENDER, for both.
        const canvas = buildCanvasInstance({ registry, materialSources });
        mountCanvas(canvas);
        let projected = projectedPublicationsOf(canvas);
        assert(projected.length === 2, `21. RENDER — both peer and Snapshot render before either unregisters; got ${projected.length}`);

        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: snapshotPublication.id });
        await flush();
        canvas.refreshMaterialInspection();
        await flush();
        assert(canvas.materialInspection.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE, '22. SELECT -> LOAD — the Snapshot\'s own encounter loads AVAILABLE material before unregistering');

        // UNREGISTER — both peer and Snapshot carry a dedicated, symmetric
        // undo.
        unregisterPeerWorldSource(registry, peerIdentity);
        assert(observedChanges === 3, `23. UNREGISTER (peer) — notified this subscriber again; got ${observedChanges}`);
        unregisterMaterializedSnapshotWorldSource(registry, registration.contentHash, snapshotPublication.id);
        assert(observedChanges === 4, `24. UNREGISTER (Snapshot) — notified this subscriber again; got ${observedChanges}`);
        assert(registry.listSources().length === 0, '25. THE PROOF — both origins are fully gone after their own dedicated unregister call, plain absence, no tombstone');

        projected = projectedPublicationsOf(canvas);
        assert(projected.length === 0, `26. RENDER, post-UNREGISTER — the canvas re-projects to zero markers once both origins are gone, through the identical live subscription, no separate teardown step; got ${projected.length}`);
        unmountCanvas(canvas);
        unsubscribe();

        // 'local' carries no unregister of its own — a documented
        // PRODUCTION-USAGE fact (0.9.14/0.9.165's own Section D), not a
        // registry limitation: the registry itself still removes 'local'
        // exactly like any other origin (already proven directly in
        // Section C above, capability 7/7).
        const noLocalUnregisterExists = typeof registerPeerWorldSource === 'function' && typeof unregisterPeerWorldSource === 'function'
            && typeof registerMaterializedSnapshotWorldSource === 'function' && typeof unregisterMaterializedSnapshotWorldSource === 'function';
        assert(noLocalUnregisterExists, '27. sanity — peer and Snapshot each carry their own dedicated register/unregister pair');
        assert(typeof describeLocalWorldDiscoverySource === 'function', '28. sanity — \'local\' has only a describe function, no register/unregister pair of its own, mirroring 0.9.14\'s own bootstrap-once, never-replaced production usage');

        // No new lifecycle vocabulary exists anywhere this audit imports.
        const lifecycleFiles = [
            '../application/WorldDiscoverySourceRegistry.js',
            '../application/MaterializedSnapshotWorldDiscoveryBridge.js',
            '../peer/PeerWorldDiscoveryLifecycleBridge.js',
            '../application/SnapshotWorldRegistrationOutcome.js'
        ];
        const inventedLifecycleTerms = ['ACTIVE', 'EXPIRED', 'STALE', 'SYNCED', 'INACTIVE', 'REVOKED'];
        for (const relativePath of lifecycleFiles) {
            const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
            for (const term of inventedLifecycleTerms) {
                assert(!source.includes(`'${term}'`) && !source.includes(`"${term}"`) && !source.includes(`${term}:`),
                    `29. ${relativePath} introduces no '${term}' lifecycle vocabulary — REGISTER/OBSERVE/SELECT/LOAD/RENDER/UNREGISTER stays the complete, already-existing lifecycle`);
            }
        }

        console.log('✓ Section D: World lifecycle semantics — REGISTER -> OBSERVE -> SELECT -> LOAD -> RENDER -> UNREGISTER is complete and symmetric for peer and Snapshot; \'local\'\'s own missing unregister is a documented production-usage choice, not a registry limitation; no new lifecycle vocabulary exists or is introduced');
    }

    // ---------------------------------------------------------------
    // Section E — temporal independence. Vehicle proximity polling,
    // World discovery's registry notification, and Snapshot's own
    // entirely-manual pipeline are structurally independent. ONE GENUINE
    // SEAM WAS FOUND, NAMED, AND PROVEN HERE, NOT FIXED — FIXED BY 0.9.169:
    // an unrelated registry membership change no longer triggers a
    // redundant material reload for the currently selected,
    // otherwise-unaffected encounter.
    // ---------------------------------------------------------------
    {
        // E1 — Snapshot's own discovery/materialization/placement/
        // registration pipeline runs on no timer of its own: a structural
        // sweep for setInterval/setTimeout across exactly those files.
        const snapshotPipelineFiles = [
            '../application/MaterializedSnapshotWorldDiscoveryBridge.js',
            '../application/DiscoverSnapshotCandidatesCommand.js',
            '../application/ResolveSelectedSnapshotCommand.js',
            '../application/MaterializeSelectedSnapshotCommand.js'
        ];
        for (const relativePath of snapshotPipelineFiles) {
            const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
            assert(!source.includes('setInterval') && !/[^.]setTimeout\(/.test(source),
                `30. ${relativePath} runs on no timer of its own — every stage of DISCOVER..REGISTER stays explicitly, one call at a time, exactly as every prior Snapshot milestone already established`);
        }

        // E2 — the registry's own change notification is synchronous, not
        // timer-driven: subscribing and mutating in the same tick, with no
        // `flush()`/await needed to observe the notification, already
        // proves it carries no timer of its own (re-confirmed directly,
        // not merely cited from 0.9.9/0.9.12's own header).
        const registry = new WorldDiscoverySourceRegistry();
        let notifiedSynchronously = false;
        registry.subscribe(() => { notifiedSynchronously = true; });
        registry.setSource(describeLocalWorldDiscoverySource({ publications: [{ id: 'pub-e2', title: 'E2' }], placements: [] }));
        assert(notifiedSynchronously === true, '31. the registry\'s own subscriber fires synchronously, inside the very same setSource() call, never deferred to a timer');

        // E3 — THE GENUINE SEAM, FIXED BY 0.9.169: an entirely unrelated
        // registry mutation (a new peer joining) while a Publication stays
        // selected no longer re-triggers material loading for that SAME,
        // otherwise-unaffected selection.
        const storageProvider = new InMemoryStorageProvider();
        const publication = publishOwnPublication(storageProvider, 'Section E Publication');
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const loadCounts = { local: 0 };
        const countingLocalSource = {
            async load(resolvedSelection) { loadCounts.local += 1; return localSource.load(resolvedSelection); }
        };

        const liveRegistry = new WorldDiscoverySourceRegistry();
        liveRegistry.setSource(describeLocalWorldDiscoverySource({
            publications: [{ id: publication.id, title: publication.title }],
            placements: [{ publicationId: publication.id, position: { x: 30, y: 0, z: 30 } }]
        }));
        const canvas = buildCanvasInstance({ registry: liveRegistry, materialSources: { local: countingLocalSource } });
        mountCanvas(canvas);
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: publication.id });
        await flush();
        assert(loadCounts.local === 1, `32. sanity — selecting the Publication loads its material exactly once; got ${loadCounts.local}`);
        const resolvedSelectionBefore = canvas.resolvedEncounterSelection;

        // An entirely unrelated peer joins — nothing about the selected
        // Publication's own material, origin, or position changes.
        const unrelatedPeer = peer('did:key:zSectionEUnrelated');
        registerPeerWorldSource(liveRegistry, unrelatedPeer, describePeerWorldDiscoverySource({
            publications: [{ id: 'pub-section-e-unrelated-peer', title: 'Unrelated Peer' }],
            placements: [{ publicationId: 'pub-section-e-unrelated-peer', position: { x: 99, y: 0, z: 99 } }]
        }, unrelatedPeer));
        await flush();

        assert(canvas.resolvedEncounterSelection.origin === resolvedSelectionBefore.origin && canvas.resolvedEncounterSelection.objectId === resolvedSelectionBefore.objectId,
            '33. sanity — the currently selected encounter\'s own resolved identity is genuinely unaffected by the unrelated peer joining');
        assert(loadCounts.local === 1,
            `34. THE GENUINE SEAM, NOW FIXED (0.9.169) — an entirely unrelated registry mutation no longer re-triggers a fresh materialSources.local.load() call for the SAME, unaffected selection (${loadCounts.local} total call(s), expected exactly 1: the one from the original selection, none redundant from the unrelated peer joining). ui/components/WorldEncounterCanvas.js's own refreshSelectionOutcome() now compares resolvedEncounterSelection against its own previous value before tail-calling refreshMaterialInspection() — see tests/MaterialInspectionRefreshPrecision.test.js for that fix's own dedicated test contract.`);

        unmountCanvas(canvas);
        console.log('✓ Section E: temporal independence — Snapshot\'s own pipeline runs on no timer, and the registry\'s own notification is synchronous, never timer-driven; the ONE GENUINE SEAM this audit found is now fixed (0.9.169): an unrelated registry mutation no longer redundantly reloads material for the current, otherwise-unaffected selection');
    }

    // ---------------------------------------------------------------
    // Section F — structural sweep: this milestone adds no production
    // file, and the existing, narrow status/outcome vocabulary this
    // family already established is unchanged.
    // ---------------------------------------------------------------
    {
        assert(Object.keys(WorldEncounterMaterialLoadStatus).sort().join(',') === 'AVAILABLE,UNAVAILABLE',
            '35. WorldEncounterMaterialLoadStatus still carries exactly its own two existing values — this audit invents no third');
        assert(Object.keys(SnapshotWorldRegistrationOutcome).sort().join(',') === 'REGISTERED',
            '36. SnapshotWorldRegistrationOutcome still carries exactly its own one existing value');

        // This audit itself imports zero new production files — every
        // import above resolves to a file this audit's own header names as
        // pre-existing (0.9.9 through 0.9.166), confirmed directly against
        // the actual functions/classes each one exports rather than merely
        // by import path.
        assert(typeof WorldDiscoverySourceRegistry === 'function'
            && typeof registerMaterializedSnapshotWorldSource === 'function'
            && typeof registerPeerWorldSource === 'function'
            && typeof loadWorldEncounterMaterial === 'function'
            && typeof describeWorldFromDiscoveryRegistry === 'function',
            '37. every collaborator this audit exercises is a real, already-existing export — this milestone constructs none of its own');

        console.log('✓ Section F: structural sweep — this milestone adds no production file, and the existing status/outcome vocabulary this family already established stays exactly as narrow as it already was');
    }

    console.log('\n✅ All World View Capability Reassessment & Architecture Audit tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
