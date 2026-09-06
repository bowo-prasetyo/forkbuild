import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { WorldDiscoverySourceRegistry } from '../application/WorldDiscoverySourceRegistry.js';
import { describeLocalWorldDiscoverySource } from '../application/WorldEncounterIntegration.js';
import { registerPeerWorldSource } from '../peer/PeerWorldDiscoveryLifecycleBridge.js';
import {
    registerMaterializedSnapshotWorldSource,
    unregisterMaterializedSnapshotWorldSource
} from '../application/MaterializedSnapshotWorldDiscoveryBridge.js';
import { SnapshotWorldRegistrationOutcome } from '../application/SnapshotWorldRegistrationOutcome.js';
import { SnapshotWorldPlacementOutcome } from '../application/SnapshotWorldPlacementOutcome.js';
import { LocalWorldEncounterMaterialSource } from '../application/LocalWorldEncounterMaterialSource.js';
import { WorldEncounterKind } from '../core/WorldEncounter.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { readFile } from 'node:fs/promises';

// 0.9.183 — World Snapshot Content View.
//
// 0.9.181/0.9.182 answered "are these two Publications the same content?"
// without ever rendering either one's own material. This milestone answers
// the other half of that gap: given a SELECTED, ALREADY-MATERIALIZED
// Snapshot-sourced Publication, a Wanderer can explicitly open its own
// Content View — entirely by joining two already-existing, unmodified
// computeds (`selectedEncounterSnapshotInspection`, 0.9.177, and
// `materialInspection`, 0.9.39) through the new, pure
// `application/WorldSnapshotContentView.js#describeWorldSnapshotContentView()`,
// wired into `ui/components/WorldEncounterCanvas.js`'s own new
// `selectedSnapshotContentView` computed and
// `openSnapshotContentView()`/`closeSnapshotContentView()` methods.
//
//   Section A: explicit viewing — select, material loads, "View Snapshot"
//              opens the panel; selecting alone never opens it.
//   Section B: exact identity — publicationId/contentHash are preserved,
//              never replaced by another Publication's identity.
//   Section C: same content, different Publication — no deduplication.
//   Section D: different content — independent views.
//   Section E: material unavailable — never fabricated from contentHash/
//              position alone; the action stays non-actionable.
//   Section F: registry removal collapses an already-open view.
//   Section G: a fresh primary selection resets snapshotContentViewOpen —
//              no implicit view for a newly-selected Publication.
//   Section H: cross-family isolation — LOCAL/PEER never produce a Content
//              View, even with material AVAILABLE.
//   Section I: structural audit — no discovery/resolution/materialization/
//              distribution/registry-mutation from this milestone's own
//              new methods, and exactly one call site of
//              describeWorldSnapshotContentView().

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

function registerLocal(registry, publication, position) {
    registry.setSource(describeLocalWorldDiscoverySource({
        publications: [{ id: publication.id, title: publication.title }],
        placements: [{ publicationId: publication.id, position }]
    }));
}

function registerPeer(registry, publication, position, identityId) {
    const identity = peer(identityId);
    registerPeerWorldSource(registry, identity, {
        publications: [{ id: publication.id, title: `${publication.title} (peer)` }],
        placements: [{ publicationId: publication.id, position }]
    });
}

function registerSnapshot(registry, publication, contentHash, position) {
    const registration = registerMaterializedSnapshotWorldSource(
        registry,
        placedResult(contentHash, publication.id, position),
        publication
    );
    assert(registration.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, `sanity — Snapshot registration for ${publication.id} succeeds`);
    return registration;
}

// Mirrors tests/WorldSnapshotComparisonUI.test.js's own buildCanvasInstance()
// exactly, extended with materialSources (so materialInspection can
// genuinely resolve to AVAILABLE) and this milestone's own new computed.
function buildCanvasInstance({ registry = null, storageProvider = null } = {}) {
    const ctx = {
        registry,
        view: WorldEncounterCanvas.props.view.default(),
        materialSources: storageProvider ? { local: new LocalWorldEncounterMaterialSource(storageProvider) } : null,
        materialVerifier: null,
        distributionCommand: null,
        snapshotDistributionCommand: null,
        discoverSnapshotCommand: null,
        distributionLifecycleStore: null,
        discoveryCommand: null,
        worldDiscoveryLeadRegistry: null
    };
    Object.assign(ctx, WorldEncounterCanvas.data.call(ctx));
    Object.assign(ctx, WorldEncounterCanvas.methods);
    const liveGetters = [
        'effectiveView',
        'resolvedEncounterSelection',
        'resolvedLead',
        'selectedEncounterInspection',
        'selectedEncounterPresentation',
        'selectedEncounterSnapshotInspection',
        'selectedSnapshotContentView',
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

function pub(kind, objectId) {
    return { kind, objectId };
}

function stripLineComments(source) {
    return source
        .split('\n')
        .map((line) => line.replace(/\/\/.*$/, ''))
        .join('\n');
}

async function run() {
    const canvasSource = await readFile(new URL('../ui/components/WorldEncounterCanvas.js', import.meta.url), 'utf8');
    const contentViewSource = await readFile(new URL('../application/WorldSnapshotContentView.js', import.meta.url), 'utf8');

    // ---------------------------------------------------------------
    // Section A — explicit viewing.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const pubA = publishOwnPublication(storageProvider, 'Section A Publication');
        const registry = new WorldDiscoverySourceRegistry();
        registerSnapshot(registry, pubA, 'hash-a', { x: 1, y: 0, z: 1 });

        const canvas = buildCanvasInstance({ registry, storageProvider });
        mountCanvas(canvas);

        canvas.selectEncounter(pub(WorldEncounterKind.PUBLICATION, pubA.id));
        await flush();

        assert(canvas.snapshotContentViewOpen === false, '1. selecting alone never opens the Content View panel');
        assert(canvas.selectedSnapshotContentView !== null, '2. material is AVAILABLE -> a Content View is available to open');

        canvas.openSnapshotContentView();
        assert(canvas.snapshotContentViewOpen === true, '3. openSnapshotContentView() opens the panel');
        assert(canvas.selectedSnapshotContentView.publicationId === pubA.id, '4. the Content View names the selected Publication');
        assert(canvas.selectedSnapshotContentView.material.title === 'Section A Publication', '5. the Content View carries the already-loaded material verbatim');

        canvas.closeSnapshotContentView();
        assert(canvas.snapshotContentViewOpen === false, '6. closeSnapshotContentView() closes the panel');

        unmountCanvas(canvas);
        console.log('✓ Section A: a Wanderer can explicitly open a selected, materialized Snapshot\'s own Content View');
    }

    // ---------------------------------------------------------------
    // Section B — exact identity.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const pubA = publishOwnPublication(storageProvider, 'Section B Publication');
        const registry = new WorldDiscoverySourceRegistry();
        registerSnapshot(registry, pubA, 'hash-b-exact', { x: 3, y: 0, z: 3 });

        const canvas = buildCanvasInstance({ registry, storageProvider });
        mountCanvas(canvas);
        canvas.selectEncounter(pub(WorldEncounterKind.PUBLICATION, pubA.id));
        await flush();
        canvas.openSnapshotContentView();

        const view = canvas.selectedSnapshotContentView;
        assert(view.publicationId === pubA.id, '1. publicationId is preserved exactly');
        assert(view.contentHash === 'hash-b-exact', '2. contentHash is preserved exactly');
        assert(view.material.id === pubA.id, '3. the underlying material is genuinely Publication A\'s own record');

        unmountCanvas(canvas);
        console.log('✓ Section B: the Content View retains the selected Publication\'s own identity, never substituting another\'s');
    }

    // ---------------------------------------------------------------
    // Section C — same content, different Publication (no deduplication).
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const pubA = publishOwnPublication(storageProvider, 'Section C Publication A');
        const pubB = publishOwnPublication(storageProvider, 'Section C Publication B');
        const registry = new WorldDiscoverySourceRegistry();
        registerSnapshot(registry, pubA, 'hash-c-shared', { x: 0, y: 0, z: 0 });
        registerSnapshot(registry, pubB, 'hash-c-shared', { x: 5, y: 0, z: 5 });

        const canvasA = buildCanvasInstance({ registry, storageProvider });
        mountCanvas(canvasA);
        canvasA.selectEncounter(pub(WorldEncounterKind.PUBLICATION, pubA.id));
        await flush();
        canvasA.openSnapshotContentView();
        const viewA = canvasA.selectedSnapshotContentView;
        unmountCanvas(canvasA);

        const canvasB = buildCanvasInstance({ registry, storageProvider });
        mountCanvas(canvasB);
        canvasB.selectEncounter(pub(WorldEncounterKind.PUBLICATION, pubB.id));
        await flush();
        canvasB.openSnapshotContentView();
        const viewB = canvasB.selectedSnapshotContentView;
        unmountCanvas(canvasB);

        assert(viewA.contentHash === viewB.contentHash, '1. sanity — both share an identical contentHash');
        assert(viewA.publicationId === pubA.id && viewB.publicationId === pubB.id, '2. each view still names its OWN Publication');
        assert(viewA.material.id === pubA.id && viewB.material.id === pubB.id, '3. each view still carries its OWN material — never merged into one');

        console.log('✓ Section C: two Publications sharing identical content still produce two independent Content Views');
    }

    // ---------------------------------------------------------------
    // Section D — different content.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const pubA = publishOwnPublication(storageProvider, 'Section D Publication A');
        const pubB = publishOwnPublication(storageProvider, 'Section D Publication B');
        const registry = new WorldDiscoverySourceRegistry();
        registerSnapshot(registry, pubA, 'hash-d1', { x: 0, y: 0, z: 0 });
        registerSnapshot(registry, pubB, 'hash-d2', { x: 5, y: 0, z: 5 });

        const canvas = buildCanvasInstance({ registry, storageProvider });
        mountCanvas(canvas);

        canvas.selectEncounter(pub(WorldEncounterKind.PUBLICATION, pubA.id));
        await flush();
        assert(canvas.selectedSnapshotContentView.contentHash === 'hash-d1', '1. Publication A\'s own contentHash');

        canvas.selectEncounter(pub(WorldEncounterKind.PUBLICATION, pubB.id));
        await flush();
        assert(canvas.selectedSnapshotContentView.contentHash === 'hash-d2', '2. Publication B\'s own contentHash, independently');

        unmountCanvas(canvas);
        console.log('✓ Section D: differently-contented Publications each report their own Content View independently');
    }

    // ---------------------------------------------------------------
    // Section E — material unavailable.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const pubA = publishOwnPublication(storageProvider, 'Section E Publication');
        const registry = new WorldDiscoverySourceRegistry();
        registerSnapshot(registry, pubA, 'hash-e', { x: 1, y: 0, z: 1 });

        // No materialSources supplied at all -> materialInspection never
        // activates (mirrors tests/WorldEncounterMaterialInspectionUI.test.js's
        // own Section C) -> selectedSnapshotContentView must stay null even
        // though contentHash/position/publicationId are all already known.
        const canvas = buildCanvasInstance({ registry, storageProvider: null });
        mountCanvas(canvas);
        canvas.selectEncounter(pub(WorldEncounterKind.PUBLICATION, pubA.id));
        await flush();

        assert(canvas.selectedEncounterSnapshotInspection !== null, '1. sanity — the Snapshot inspection facts ARE already known');
        assert(canvas.selectedSnapshotContentView === null, '2. no fabricated Content View from contentHash/position alone');

        canvas.openSnapshotContentView();
        assert(canvas.snapshotContentViewOpen === false, '3. openSnapshotContentView() is a no-op with nothing genuinely viewable');

        unmountCanvas(canvas);
        console.log('✓ Section E: a selected Snapshot with unavailable material never fabricates a Content View, and the action stays non-actionable');
    }

    // ---------------------------------------------------------------
    // Section F — registry removal collapses an open view.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const pubA = publishOwnPublication(storageProvider, 'Section F Publication');
        const registry = new WorldDiscoverySourceRegistry();
        registerSnapshot(registry, pubA, 'hash-f', { x: 2, y: 0, z: 2 });

        const canvas = buildCanvasInstance({ registry, storageProvider });
        mountCanvas(canvas);
        canvas.selectEncounter(pub(WorldEncounterKind.PUBLICATION, pubA.id));
        await flush();
        canvas.openSnapshotContentView();
        assert(canvas.snapshotContentViewOpen === true && canvas.selectedSnapshotContentView !== null,
            '1. sanity — the Content View is open and available before removal');

        canvas.unregisterSelectedSnapshot();
        await flush();

        assert(canvas.selectedSnapshotContentView === null, '2. removal collapses the Content View back to null');
        // `snapshotContentViewOpen` itself is left untouched by
        // unregisterSelectedSnapshot() (it mutates only the registry) — the
        // panel's own v-if already gates on BOTH flags, so it stops
        // rendering regardless.
        assert(canvas.snapshotContentViewOpen === true, '3. the open flag itself is untouched — the LIVE computed is what collapses, exactly like worldSnapshotComparisonResult already does for a removed comparison target');

        unmountCanvas(canvas);
        console.log('✓ Section F: unregistering the selected Snapshot collapses its already-open Content View through the existing selection/material lifecycle');
    }

    // ---------------------------------------------------------------
    // Section G — a fresh primary selection resets snapshotContentViewOpen.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const pubA = publishOwnPublication(storageProvider, 'Section G Publication A');
        const pubB = publishOwnPublication(storageProvider, 'Section G Publication B');
        const registry = new WorldDiscoverySourceRegistry();
        registerSnapshot(registry, pubA, 'hash-g1', { x: 0, y: 0, z: 0 });
        registerSnapshot(registry, pubB, 'hash-g2', { x: 1, y: 0, z: 1 });

        const canvas = buildCanvasInstance({ registry, storageProvider });
        mountCanvas(canvas);
        canvas.selectEncounter(pub(WorldEncounterKind.PUBLICATION, pubA.id));
        await flush();
        canvas.openSnapshotContentView();
        assert(canvas.snapshotContentViewOpen === true, '1. sanity — Publication A\'s Content View is open');

        canvas.selectEncounter(pub(WorldEncounterKind.PUBLICATION, pubB.id));
        assert(canvas.snapshotContentViewOpen === false, '2. a fresh primary selection resets the open flag — no implicit view for Publication B');

        await flush();
        assert(canvas.selectedSnapshotContentView !== null, '3. sanity — Publication B does have a viewable Content View once material loads');
        assert(canvas.snapshotContentViewOpen === false, '4. ...but it is not shown until explicitly opened again');

        unmountCanvas(canvas);
        console.log('✓ Section G: selecting a new Publication never leaves a previous Content View open for it implicitly');
    }

    // ---------------------------------------------------------------
    // Section H — cross-family isolation.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const pubLocal = publishOwnPublication(storageProvider, 'Section H Local');
        const pubPeer = publishOwnPublication(storageProvider, 'Section H Peer');
        const registry = new WorldDiscoverySourceRegistry();
        registerLocal(registry, pubLocal, { x: 0, y: 0, z: 0 });
        registerPeer(registry, pubPeer, { x: 1, y: 0, z: 1 }, 'did:key:zSectionHPeer');

        const canvasLocal = buildCanvasInstance({ registry, storageProvider });
        mountCanvas(canvasLocal);
        canvasLocal.selectEncounter(pub(WorldEncounterKind.PUBLICATION, pubLocal.id));
        await flush();
        assert(canvasLocal.distributablePublication !== null, '1. sanity — LOCAL material genuinely loaded AVAILABLE');
        assert(canvasLocal.selectedEncounterSnapshotInspection === null, '2. sanity — a LOCAL selection never produces a Snapshot inspection');
        assert(canvasLocal.selectedSnapshotContentView === null, '3. a LOCAL selection never produces a Content View, even with material AVAILABLE');
        unmountCanvas(canvasLocal);

        const canvasPeer = buildCanvasInstance({ registry, storageProvider: null });
        mountCanvas(canvasPeer);
        canvasPeer.selectEncounter(pub(WorldEncounterKind.PUBLICATION, pubPeer.id));
        await flush();
        assert(canvasPeer.selectedEncounterSnapshotInspection === null, '4. sanity — a PEER selection never produces a Snapshot inspection');
        assert(canvasPeer.selectedSnapshotContentView === null, '5. a PEER selection never produces a Content View');
        unmountCanvas(canvasPeer);

        console.log('✓ Section H: "View Snapshot" stays unreachable for LOCAL/PEER encounters — Snapshot-specific, never a generic content viewer');
    }

    // ---------------------------------------------------------------
    // Section I — structural audit.
    // ---------------------------------------------------------------
    {
        const strippedCanvas = stripLineComments(canvasSource);
        const strippedContentView = stripLineComments(contentViewSource);

        const openMethodMatch = strippedCanvas.match(/openSnapshotContentView\(\)\s*\{[\s\S]*?\n\s{8}\},/);
        assert(openMethodMatch, 'sanity — openSnapshotContentView() body is found');
        const openBody = openMethodMatch[0];
        assert(!/registry\./.test(openBody), '1. openSnapshotContentView() never touches the registry');
        assert(!/inspectWorldEncounterMaterial|loadWorldEncounterMaterial|refreshMaterialInspection/.test(openBody),
            '2. openSnapshotContentView() never triggers a new material load');
        assert(!/materializ/i.test(openBody), '3. openSnapshotContentView() never materializes');
        assert(!/distribut/i.test(openBody), '4. openSnapshotContentView() never distributes');
        assert(!/discover/i.test(openBody), '5. openSnapshotContentView() never discovers');

        const closeMethodMatch = strippedCanvas.match(/closeSnapshotContentView\(\)\s*\{[\s\S]*?\n\s{8}\},/);
        assert(closeMethodMatch, 'sanity — closeSnapshotContentView() body is found');
        assert(!/registry\./.test(closeMethodMatch[0]), '6. closeSnapshotContentView() never touches the registry');

        // 0.9.184 — a second call site was added deliberately:
        // `comparisonSnapshotContentView` reuses `describeWorldSnapshotContentView()`
        // verbatim for the comparison target ("Publication B"), exactly
        // mirroring its own existing use for the primary selection
        // ("Publication A") immediately above — see tests/
        // WorldSnapshotContentComparisonView.test.js for that milestone's
        // own coverage.
        const callSites = strippedCanvas.match(/describeWorldSnapshotContentView\(/g) || [];
        assert(callSites.length === 2, `7. exactly two call sites of describeWorldSnapshotContentView() in WorldEncounterCanvas.js as of 0.9.184 — one per side of a comparison (found ${callSites.length})`);

        assert(!/inspectWorldEncounterMaterial|loadWorldEncounterMaterial|WorldDiscoverySourceRegistry|registerMaterializedSnapshotWorldSource/.test(strippedContentView),
            '8. application/WorldSnapshotContentView.js never imports/references any loading or registry mechanism of its own');

        console.log('✓ Section I: "View Snapshot" performs no discovery, resolution, materialization, distribution, or registry mutation of its own');
    }

    console.log('\n✓ All World Snapshot Content View tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
