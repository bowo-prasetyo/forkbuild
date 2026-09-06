import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { WorldDiscoverySourceRegistry } from '../application/WorldDiscoverySourceRegistry.js';
import { describeLocalWorldDiscoverySource } from '../application/WorldEncounterIntegration.js';
import {
    registerMaterializedSnapshotWorldSource,
    unregisterMaterializedSnapshotWorldSource
} from '../application/MaterializedSnapshotWorldDiscoveryBridge.js';
import { SnapshotWorldRegistrationOutcome } from '../application/SnapshotWorldRegistrationOutcome.js';
import { SnapshotWorldPlacementOutcome } from '../application/SnapshotWorldPlacementOutcome.js';
import { LocalWorldEncounterMaterialSource } from '../application/LocalWorldEncounterMaterialSource.js';
import { WorldSnapshotContentComparison } from '../application/WorldSnapshotComparison.js';
import { describeWorldSnapshotContentComparisonView } from '../application/WorldSnapshotContentComparisonView.js';
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

// 0.9.184 — World Snapshot Content Comparison View.
//
// 0.9.181/0.9.182 answered "are these two Publications the same content?"
// without ever rendering either one's own material. 0.9.183 answered "what
// IS this one Snapshot's content?" for a single selection. This milestone
// combines both, through the new, pure `application/
// WorldSnapshotContentComparisonView.js#describeWorldSnapshotContentComparisonView()`
// — a join over `compareSnapshotWorldPublications()` (0.9.181, identity)
// and TWO independent `describeWorldSnapshotContentView()` results (0.9.183,
// material) — wired into `ui/components/WorldEncounterCanvas.js`'s own new
// `comparisonSnapshotContentView`/`worldSnapshotContentComparisonView`
// computeds and `openContentComparisonView()`/`closeContentComparisonView()`
// methods.
//
//   Part One (Sections A-F): the pure descriptor, tested directly with
//              hand-built fixtures — no comparison/content-view identity
//              recomputation, matching-publicationId requirement, purity.
//   Part Two (Sections G-M): the UI wiring, through WorldEncounterCanvas.
//     Section G: explicit flow — select A, arm, select B, both materials
//                load, the comparison content view becomes available, and
//                is opened only by an explicit click.
//     Section H: SAME_CONTENT — two distinct Publications, identical hash.
//     Section I: DIFFERENT_CONTENT — two distinct Publications.
//     Section J: exact material identity — never a lookup-by-hash swap.
//     Section K: position independence.
//     Section L: selection changes never leave a stale combined view.
//     Section M: removal of either side's source collapses the view; a
//                comparison target whose material never loads (no
//                materialSources) never fabricates one either.
//     Section N: structural audit.

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

function placedResult(contentHash, publicationId, position) {
    return { outcome: SnapshotWorldPlacementOutcome.PLACED, contentHash, publicationId, placementId: `placement-${publicationId}`, position, reason: null };
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

// Mirrors tests/WorldSnapshotContentView.test.js's own buildCanvasInstance()
// exactly, extended with this milestone's own new computeds.
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
        'selectedPublicationComparisonCandidate',
        'comparisonResolvedSelection',
        'comparisonEncounterInspection',
        'comparisonEncounterPresentation',
        'comparisonEncounterSnapshotInspection',
        'comparisonSnapshotContentView',
        'comparisonPublicationComparisonCandidate',
        'worldSnapshotComparisonResult',
        'worldSnapshotContentComparisonView',
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

// Selects A, arms comparison, selects B, and awaits both materials loading.
async function compareThroughUI(canvas, objectIdA, objectIdB) {
    canvas.selectEncounter(pub(WorldEncounterKind.PUBLICATION, objectIdA));
    canvas.armComparisonSelection();
    canvas.selectEncounter(pub(WorldEncounterKind.PUBLICATION, objectIdB));
    await flush();
}

function stripLineComments(source) {
    return source
        .split('\n')
        .map((line) => line.replace(/\/\/.*$/, ''))
        .join('\n');
}

function contentView(overrides = {}) {
    return Object.freeze({
        publicationId: 'pub-a',
        contentHash: 'hash-1',
        material: Object.freeze({ id: 'pub-a', title: 'A', author: 'tester' }),
        position: Object.freeze({ x: 0, y: 0, z: 0 }),
        ...overrides
    });
}

function comparison(overrides = {}) {
    return Object.freeze({
        aPublicationId: 'pub-a',
        bPublicationId: 'pub-b',
        samePublication: false,
        contentComparison: WorldSnapshotContentComparison.SAME_CONTENT,
        ...overrides
    });
}

async function run() {
    const canvasSource = await readFile(new URL('../ui/components/WorldEncounterCanvas.js', import.meta.url), 'utf8');
    const descriptorSource = await readFile(new URL('../application/WorldSnapshotContentComparisonView.js', import.meta.url), 'utf8');

    // ---------------------------------------------------------------
    // Section A — no comparison result, no descriptor.
    // ---------------------------------------------------------------
    {
        assert(describeWorldSnapshotContentComparisonView({}) === null, '1. no arguments at all -> null');
        assert(describeWorldSnapshotContentComparisonView({ comparisonResult: null, contentViewA: contentView(), contentViewB: contentView({ publicationId: 'pub-b' }) }) === null,
            '2. no comparisonResult -> null, even with both materials genuinely available');
        assert(describeWorldSnapshotContentComparisonView({ comparisonResult: { aPublicationId: '', bPublicationId: 'pub-b' } }) === null,
            '3. an empty-string publicationId on either side -> null');

        console.log('✓ Section A: no comparison result -> no content comparison view, ever');
    }

    // ---------------------------------------------------------------
    // Section B — missing/mismatched material on either side.
    // ---------------------------------------------------------------
    {
        const result = comparison();
        assert(describeWorldSnapshotContentComparisonView({ comparisonResult: result, contentViewA: null, contentViewB: contentView({ publicationId: 'pub-b' }) }) === null,
            '1. Publication A\'s own material unavailable -> no descriptor, even though the comparison fact exists');
        assert(describeWorldSnapshotContentComparisonView({ comparisonResult: result, contentViewA: contentView({ publicationId: 'pub-a' }), contentViewB: null }) === null,
            '2. Publication B\'s own material unavailable -> no descriptor');
        assert(describeWorldSnapshotContentComparisonView({ comparisonResult: result, contentViewA: null, contentViewB: null }) === null,
            '3. neither side\'s material available -> no descriptor');

        // A Content View that is genuinely available, but for the WRONG
        // Publication (a stale view from a moment ago) — never substituted.
        const mismatched = describeWorldSnapshotContentComparisonView({
            comparisonResult: result,
            contentViewA: contentView({ publicationId: 'pub-c' }),
            contentViewB: contentView({ publicationId: 'pub-b' })
        });
        assert(mismatched === null, '4. a Content View naming a DIFFERENT Publication than the comparison\'s own aPublicationId -> null, never silently accepted');

        console.log('✓ Section B: missing or mismatched material on either side never fabricates a comparison view');
    }

    // ---------------------------------------------------------------
    // Section C — SAME_CONTENT and DIFFERENT_CONTENT are forwarded verbatim.
    // ---------------------------------------------------------------
    {
        const viewA = contentView({ publicationId: 'pub-a', contentHash: 'hash-shared' });
        const viewB = contentView({ publicationId: 'pub-b', contentHash: 'hash-shared', material: Object.freeze({ id: 'pub-b', title: 'B', author: 'tester' }) });

        const same = describeWorldSnapshotContentComparisonView({
            comparisonResult: comparison({ contentComparison: WorldSnapshotContentComparison.SAME_CONTENT }),
            contentViewA: viewA,
            contentViewB: viewB
        });
        assert(same.contentComparison === WorldSnapshotContentComparison.SAME_CONTENT, '1. SAME_CONTENT is forwarded verbatim');
        assert(same.aPublicationId === 'pub-a' && same.bPublicationId === 'pub-b', '2. both publicationIds are forwarded verbatim, never collapsed');
        assert(same.aMaterial === viewA && same.bMaterial === viewB, '3. aMaterial/bMaterial are the EXACT Content View references, never copies or re-shapes');

        const different = describeWorldSnapshotContentComparisonView({
            comparisonResult: comparison({ contentComparison: WorldSnapshotContentComparison.DIFFERENT_CONTENT }),
            contentViewA: viewA,
            contentViewB: viewB
        });
        assert(different.contentComparison === WorldSnapshotContentComparison.DIFFERENT_CONTENT, '4. DIFFERENT_CONTENT is forwarded verbatim');

        const unknown = describeWorldSnapshotContentComparisonView({
            comparisonResult: comparison({ contentComparison: null }),
            contentViewA: viewA,
            contentViewB: viewB
        });
        assert(unknown !== null, '5. an honestly-unknown contentComparison still produces a descriptor — both materials ARE available');
        assert(unknown.contentComparison === null, '6. ...with contentComparison forwarded as null, never guessed into a verdict');

        console.log('✓ Section C: contentComparison is always forwarded verbatim from compareSnapshotWorldPublications(), never recomputed');
    }

    // ---------------------------------------------------------------
    // Section D — same content does not mean one object.
    // ---------------------------------------------------------------
    {
        const viewA = contentView({ publicationId: 'pub-a', contentHash: 'hash-x', position: { x: 10, y: 20, z: 30 } });
        const viewB = contentView({ publicationId: 'pub-b', contentHash: 'hash-x', position: { x: 100, y: 200, z: 300 } });
        const result = describeWorldSnapshotContentComparisonView({
            comparisonResult: comparison({ aPublicationId: 'pub-a', bPublicationId: 'pub-b', contentComparison: WorldSnapshotContentComparison.SAME_CONTENT }),
            contentViewA: viewA,
            contentViewB: viewB
        });
        assert(result.contentComparison === WorldSnapshotContentComparison.SAME_CONTENT, '1. identical content -> SAME_CONTENT');
        assert(result.aPublicationId !== result.bPublicationId, '2. ...while the two Publications remain distinct');
        assert(result.aMaterial.position.x === 10 && result.bMaterial.position.x === 100, '3. each side keeps its own, independent World position — never merged');

        console.log('✓ Section D: SAME_CONTENT never collapses two Publications, or two World positions, into one');
    }

    // ---------------------------------------------------------------
    // Section E — purity.
    // ---------------------------------------------------------------
    {
        const viewA = contentView({ publicationId: 'pub-a' });
        const viewB = contentView({ publicationId: 'pub-b' });
        const result = comparison();

        const first = describeWorldSnapshotContentComparisonView({ comparisonResult: result, contentViewA: viewA, contentViewB: viewB });
        const second = describeWorldSnapshotContentComparisonView({ comparisonResult: result, contentViewA: viewA, contentViewB: viewB });
        assert(JSON.stringify(first) === JSON.stringify(second), '1. calling twice with byte-identical arguments returns a byte-identical result');
        assert(Object.isFrozen(first), '2. the returned descriptor is frozen');

        let threw = false;
        try { first.contentComparison = 'tampered'; } catch (e) { threw = true; }
        assert(first.contentComparison === WorldSnapshotContentComparison.SAME_CONTENT, "3. the frozen result's own contentComparison cannot be reassigned");

        console.log('✓ Section E: describeWorldSnapshotContentComparisonView() is pure and deterministic');
    }

    // ---------------------------------------------------------------
    // Section F — structural audit (application layer).
    // ---------------------------------------------------------------
    {
        const codeOnly = stripLineComments(descriptorSource);
        assert(!/fetch\(|localStorage|WebRTC|WorldDiscoverySourceRegistry|registry\.|inspectWorldEncounterMaterial|loadWorldEncounterMaterial|compareSnapshotWorldPublications\(|describeWorldSnapshotContentView\(/.test(codeOnly),
            '1. no I/O, no registry access, and no re-invocation of compareSnapshotWorldPublications()/describeWorldSnapshotContentView() — both are consumed only as already-computed arguments');
        assert(!/computeContentHash|sha256|sha1|md5|crypto\./i.test(codeOnly),
            '2. no hashing of any kind, and no recomputation of content identity from either material');
        assert(!/merge|duplicate|replace this|deduplicat/i.test(codeOnly),
            '3. no merge/deduplication/replacement vocabulary of any kind');
        assert(!/rank|trust|verified|best|preferred|reliable|freshness|quality|score/i.test(codeOnly),
            '4. no rank/trust/verified/best/preferred/reliable/freshness/quality/score vocabulary');
        assert(!/WorldEncounterKind|new.*Kind\b/.test(codeOnly), '5. no new World Encounter kind is introduced');

        console.log('✓ Section F: structural sweep — no I/O, no re-invocation of upstream comparison/content-view functions, no hashing, no merge/dedup/trust vocabulary');
    }

    // ---------------------------------------------------------------
    // Section G — explicit flow, through the UI.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const pubA = publishOwnPublication(storageProvider, 'Section G Publication A');
        const pubB = publishOwnPublication(storageProvider, 'Section G Publication B');
        const registry = new WorldDiscoverySourceRegistry();
        registerSnapshot(registry, pubA, 'hash-g-shared', { x: 1, y: 0, z: 1 });
        registerSnapshot(registry, pubB, 'hash-g-shared', { x: 2, y: 0, z: 2 });

        const canvas = buildCanvasInstance({ registry, storageProvider });
        mountCanvas(canvas);

        canvas.selectEncounter(pub(WorldEncounterKind.PUBLICATION, pubA.id));
        await flush();
        assert(canvas.worldSnapshotContentComparisonView === null, '1. no comparison target yet -> no content comparison view');

        canvas.armComparisonSelection();
        canvas.selectEncounter(pub(WorldEncounterKind.PUBLICATION, pubB.id));
        assert(canvas.contentComparisonViewOpen === false, '2. picking a comparison target never opens the panel implicitly');
        await flush();

        assert(canvas.comparisonSnapshotContentView !== null, '3. the comparison target\'s own material loads automatically, mirroring the primary selection');
        assert(canvas.worldSnapshotContentComparisonView !== null, '4. both sides\' material available + a comparison result -> the content comparison view is available');

        canvas.openContentComparisonView();
        assert(canvas.contentComparisonViewOpen === true, '5. openContentComparisonView() opens the panel');

        canvas.closeContentComparisonView();
        assert(canvas.contentComparisonViewOpen === false, '6. closeContentComparisonView() closes it');

        unmountCanvas(canvas);
        console.log('✓ Section G: select A, arm, select B, both materials load, and the Wanderer can explicitly open the combined Content Comparison view');
    }

    // ---------------------------------------------------------------
    // Section H — SAME_CONTENT.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const pubA = publishOwnPublication(storageProvider, 'Section H Publication A');
        const pubB = publishOwnPublication(storageProvider, 'Section H Publication B');
        const registry = new WorldDiscoverySourceRegistry();
        registerSnapshot(registry, pubA, 'hash-h-shared', { x: 0, y: 0, z: 0 });
        registerSnapshot(registry, pubB, 'hash-h-shared', { x: 5, y: 0, z: 5 });

        const canvas = buildCanvasInstance({ registry, storageProvider });
        mountCanvas(canvas);
        await compareThroughUI(canvas, pubA.id, pubB.id);

        const view = canvas.worldSnapshotContentComparisonView;
        assert(view !== null, '1. sanity — the content comparison view is available');
        assert(view.contentComparison === WorldSnapshotContentComparison.SAME_CONTENT, '2. identical contentHash -> SAME_CONTENT');
        assert(view.aPublicationId === pubA.id && view.bPublicationId === pubB.id, '3. both publicationIds are reported');
        assert(view.aPublicationId !== view.bPublicationId, '4. two distinct Publications, even though content is identical');

        unmountCanvas(canvas);
        console.log('✓ Section H: two distinct Publications sharing identical content report SAME_CONTENT while remaining two distinct Publications');
    }

    // ---------------------------------------------------------------
    // Section I — DIFFERENT_CONTENT.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const pubA = publishOwnPublication(storageProvider, 'Section I Publication A');
        const pubB = publishOwnPublication(storageProvider, 'Section I Publication B');
        const registry = new WorldDiscoverySourceRegistry();
        registerSnapshot(registry, pubA, 'hash-i1', { x: 0, y: 0, z: 0 });
        registerSnapshot(registry, pubB, 'hash-i2', { x: 5, y: 0, z: 5 });

        const canvas = buildCanvasInstance({ registry, storageProvider });
        mountCanvas(canvas);
        await compareThroughUI(canvas, pubA.id, pubB.id);

        assert(canvas.worldSnapshotContentComparisonView.contentComparison === WorldSnapshotContentComparison.DIFFERENT_CONTENT,
            '1. two Publications with different contentHash report DIFFERENT_CONTENT');

        unmountCanvas(canvas);
        console.log('✓ Section I: two Publications with different content report DIFFERENT_CONTENT');
    }

    // ---------------------------------------------------------------
    // Section J — exact material identity (no lookup-by-hash swap).
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const pubA = publishOwnPublication(storageProvider, 'Section J Publication A');
        const pubB = publishOwnPublication(storageProvider, 'Section J Publication B');
        const registry = new WorldDiscoverySourceRegistry();
        registerSnapshot(registry, pubA, 'hash-j-shared', { x: 0, y: 0, z: 0 });
        registerSnapshot(registry, pubB, 'hash-j-shared', { x: 5, y: 0, z: 5 });

        const canvas = buildCanvasInstance({ registry, storageProvider });
        mountCanvas(canvas);
        await compareThroughUI(canvas, pubA.id, pubB.id);

        const view = canvas.worldSnapshotContentComparisonView;
        assert(view.aMaterial.publicationId === pubA.id && view.aMaterial.material.id === pubA.id, '1. aMaterial is genuinely Publication A\'s own material');
        assert(view.bMaterial.publicationId === pubB.id && view.bMaterial.material.id === pubB.id, '2. bMaterial is genuinely Publication B\'s own material — never A\'s, despite the shared hash');
        assert(view.aMaterial.material.title === 'Section J Publication A', '3. A\'s own title, not a hash-driven substitute');
        assert(view.bMaterial.material.title === 'Section J Publication B', '4. B\'s own title, not a hash-driven substitute');
        assert(JSON.stringify(view.aMaterial) === JSON.stringify(canvas.selectedSnapshotContentView), '5. aMaterial matches selectedSnapshotContentView exactly, field for field — never a copy with any field altered');
        assert(JSON.stringify(view.bMaterial) === JSON.stringify(canvas.comparisonSnapshotContentView), '6. bMaterial matches comparisonSnapshotContentView exactly, field for field');

        unmountCanvas(canvas);
        console.log('✓ Section J: each side\'s material is exactly its own Publication\'s — never substituted via the shared contentHash');
    }

    // ---------------------------------------------------------------
    // Section K — position independence.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const pubA = publishOwnPublication(storageProvider, 'Section K Publication A');
        const pubB = publishOwnPublication(storageProvider, 'Section K Publication B');
        const registry = new WorldDiscoverySourceRegistry();
        registerSnapshot(registry, pubA, 'hash-k-shared', { x: 10, y: 0, z: 10 });
        registerSnapshot(registry, pubB, 'hash-k-shared', { x: -10, y: 0, z: -10 });

        const canvas = buildCanvasInstance({ registry, storageProvider });
        mountCanvas(canvas);
        await compareThroughUI(canvas, pubA.id, pubB.id);

        const view = canvas.worldSnapshotContentComparisonView;
        assert(view.contentComparison === WorldSnapshotContentComparison.SAME_CONTENT, '1. identical content at very different positions still reports SAME_CONTENT');
        assert(view.aMaterial.position.x === 10 && view.aMaterial.position.z === 10, '2. Publication A keeps its own, independent position');
        assert(view.bMaterial.position.x === -10 && view.bMaterial.position.z === -10, '3. Publication B keeps ITS OWN, independent position — never merged with A\'s');

        unmountCanvas(canvas);
        console.log('✓ Section K: identical content at different World positions still reports SAME_CONTENT while both positions stay independent');
    }

    // ---------------------------------------------------------------
    // Section L — selection changes never leave a stale combined view.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const pubA = publishOwnPublication(storageProvider, 'Section L Publication A');
        const pubB = publishOwnPublication(storageProvider, 'Section L Publication B');
        const pubC = publishOwnPublication(storageProvider, 'Section L Publication C');
        const registry = new WorldDiscoverySourceRegistry();
        registerSnapshot(registry, pubA, 'hash-l-1', { x: 0, y: 0, z: 0 });
        registerSnapshot(registry, pubB, 'hash-l-1', { x: 1, y: 0, z: 1 });
        registerSnapshot(registry, pubC, 'hash-l-2', { x: 2, y: 0, z: 2 });

        const canvas = buildCanvasInstance({ registry, storageProvider });
        mountCanvas(canvas);
        await compareThroughUI(canvas, pubA.id, pubB.id);
        canvas.openContentComparisonView();
        assert(canvas.worldSnapshotContentComparisonView.contentComparison === WorldSnapshotContentComparison.SAME_CONTENT,
            '1. sanity — A vs B (same hash) is SAME_CONTENT');

        // The Wanderer selects a DIFFERENT primary Publication, leaving the
        // comparison target untouched.
        canvas.selectEncounter(pub(WorldEncounterKind.PUBLICATION, pubC.id));
        assert(canvas.contentComparisonViewOpen === false, '2. a fresh primary selection closes the previously-open Content Comparison panel');
        await flush();

        const refreshed = canvas.worldSnapshotContentComparisonView;
        assert(refreshed !== null, '3. a fresh content comparison view is available for the NEW pair');
        assert(refreshed.aPublicationId === pubC.id && refreshed.bPublicationId === pubB.id, '4. the view now genuinely describes the CURRENT pair (C vs B), never the stale one (A vs B)');
        assert(refreshed.contentComparison === WorldSnapshotContentComparison.DIFFERENT_CONTENT, '5. C vs B correctly reports DIFFERENT_CONTENT — proving this is a fresh computation, not A vs B\'s stale SAME_CONTENT');

        // Now the Wanderer picks a NEW comparison target for the same primary.
        canvas.armComparisonSelection();
        canvas.selectEncounter(pub(WorldEncounterKind.PUBLICATION, pubA.id));
        assert(canvas.contentComparisonViewOpen === false, '6. a fresh comparison-target selection also closes the panel');
        await flush();
        const rePaired = canvas.worldSnapshotContentComparisonView;
        assert(rePaired.aPublicationId === pubC.id && rePaired.bPublicationId === pubA.id, '7. the view now describes C vs A, never a stale pairing');

        unmountCanvas(canvas);
        console.log('✓ Section L: changing either side never leaves a stale combined view, and closes any already-open panel');
    }

    // ---------------------------------------------------------------
    // Section M — removal, and material that never loads.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const pubA = publishOwnPublication(storageProvider, 'Section M Publication A');
        const pubB = publishOwnPublication(storageProvider, 'Section M Publication B');
        const registry = new WorldDiscoverySourceRegistry();
        registerSnapshot(registry, pubA, 'hash-m-shared', { x: 0, y: 0, z: 0 });
        registerSnapshot(registry, pubB, 'hash-m-shared', { x: 1, y: 0, z: 1 });

        const canvas = buildCanvasInstance({ registry, storageProvider });
        mountCanvas(canvas);
        await compareThroughUI(canvas, pubA.id, pubB.id);
        assert(canvas.worldSnapshotContentComparisonView !== null, 'sanity — the content comparison view is available before removal');

        unregisterMaterializedSnapshotWorldSource(registry, 'hash-m-shared', pubB.id);
        await flush();
        assert(canvas.comparisonSnapshotContentView === null, '1. removing Publication B\'s own source collapses its own Content View');
        assert(canvas.worldSnapshotContentComparisonView === null, '2. the combined view collapses too — no fallback, no substitution');

        // A comparison target whose material can never load (no
        // materialSources at all) never fabricates a combined view either,
        // even though the comparison FACT itself is still available. A
        // FRESH registry — the one above had Publication B's own source
        // removed immediately above.
        const freshRegistry = new WorldDiscoverySourceRegistry();
        registerSnapshot(freshRegistry, pubA, 'hash-m-shared-2', { x: 0, y: 0, z: 0 });
        registerSnapshot(freshRegistry, pubB, 'hash-m-shared-2', { x: 1, y: 0, z: 1 });
        const canvasNoMaterial = buildCanvasInstance({ registry: freshRegistry, storageProvider: null });
        mountCanvas(canvasNoMaterial);
        await compareThroughUI(canvasNoMaterial, pubA.id, pubB.id);
        assert(canvasNoMaterial.worldSnapshotComparisonResult !== null, '3. sanity — the comparison FACT is still available with no materialSources');
        assert(canvasNoMaterial.selectedSnapshotContentView === null && canvasNoMaterial.comparisonSnapshotContentView === null,
            '4. sanity — neither side\'s material is available with no materialSources');
        assert(canvasNoMaterial.worldSnapshotContentComparisonView === null,
            '5. the content comparison view stays unavailable — the comparison fact alone is never enough, and neither side\'s material is ever fabricated');
        canvasNoMaterial.openContentComparisonView();
        assert(canvasNoMaterial.contentComparisonViewOpen === false, '6. openContentComparisonView() is a no-op with nothing genuinely viewable');

        unmountCanvas(canvas);
        unmountCanvas(canvasNoMaterial);
        console.log('✓ Section M: removing either side\'s source collapses the combined view, and a comparison fact alone never fabricates one without genuine material on both sides');
    }

    // ---------------------------------------------------------------
    // Section N — structural audit (UI wiring).
    // ---------------------------------------------------------------
    {
        const strippedCanvas = stripLineComments(canvasSource);

        const openMethodMatch = strippedCanvas.match(/openContentComparisonView\(\)\s*\{[\s\S]*?\n\s{8}\},/);
        assert(openMethodMatch, 'sanity — openContentComparisonView() body is found');
        const openBody = openMethodMatch[0];
        assert(!/registry\./.test(openBody), '1. openContentComparisonView() never touches the registry');
        assert(!/inspectWorldEncounterMaterial|loadWorldEncounterMaterial|refreshMaterialInspection|refreshComparisonMaterialInspection/.test(openBody),
            '2. openContentComparisonView() never triggers a new material load');
        assert(!/materializ/i.test(openBody), '3. openContentComparisonView() never materializes');
        assert(!/distribut/i.test(openBody), '4. openContentComparisonView() never distributes');
        assert(!/discover/i.test(openBody), '5. openContentComparisonView() never discovers');

        const closeMethodMatch = strippedCanvas.match(/closeContentComparisonView\(\)\s*\{[\s\S]*?\n\s{8}\},/);
        assert(closeMethodMatch, 'sanity — closeContentComparisonView() body is found');
        assert(!/registry\./.test(closeMethodMatch[0]), '6. closeContentComparisonView() never touches the registry');

        const callSites = strippedCanvas.match(/describeWorldSnapshotContentComparisonView\(/g) || [];
        assert(callSites.length === 1, `7. exactly one call site of describeWorldSnapshotContentComparisonView() in WorldEncounterCanvas.js (found ${callSites.length})`);

        // refreshComparisonMaterialInspection() never supplies a
        // resolvedLead — decentralized lead resolution for the comparison
        // target remains excluded.
        const refreshComparisonMaterialMatch = strippedCanvas.match(/refreshComparisonMaterialInspection\(\)\s*\{[\s\S]*?\n\s{8}\},/);
        assert(refreshComparisonMaterialMatch, 'sanity — refreshComparisonMaterialInspection() body is found');
        assert(/resolvedLead:\s*null/.test(refreshComparisonMaterialMatch[0]),
            '8. refreshComparisonMaterialInspection() always supplies resolvedLead: null — no decentralized lead resolution for the comparison target');

        const descriptorCodeOnly = stripLineComments(descriptorSource);
        assert(!/inspectWorldEncounterMaterial|loadWorldEncounterMaterial|WorldDiscoverySourceRegistry|registerMaterializedSnapshotWorldSource/.test(descriptorCodeOnly),
            '9. application/WorldSnapshotContentComparisonView.js never imports/references any loading or registry mechanism of its own');
        assert(!/merge|duplicate|replace this/i.test(strippedCanvas.slice(strippedCanvas.indexOf('world-snapshot-content-comparison-panel'), strippedCanvas.indexOf('world-snapshot-content-comparison-panel') + 4000)),
            '10. the Content Comparison panel offers no merge/duplicate/replace action of any kind');

        console.log('✓ Section N: "View Content Comparison" performs no discovery, resolution, materialization, distribution, or registry mutation, and never resolves a decentralized lead for the comparison target');
    }

    console.log('\n✅ All World Snapshot Content Comparison View tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
