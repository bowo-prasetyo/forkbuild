import { readFile } from 'node:fs/promises';

import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { WorldDiscoverySourceRegistry } from '../application/WorldDiscoverySourceRegistry.js';
import {
    registerMaterializedSnapshotWorldSource,
    unregisterMaterializedSnapshotWorldSource
} from '../application/MaterializedSnapshotWorldDiscoveryBridge.js';
import { SnapshotWorldPlacementOutcome } from '../application/SnapshotWorldPlacementOutcome.js';
import { SnapshotWorldRegistrationOutcome } from '../application/SnapshotWorldRegistrationOutcome.js';
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

// 0.9.185 — World Snapshot Content Actionability Audit.
//
// 0.9.183/0.9.184 answered "what IS this Snapshot's content" and "what do
// two Snapshots' contents look like together" — both stopped at
// OBSERVATION, on purpose (see each one's own header, "a read-only
// descriptor," "never an action"). 0.9.184's own "Recommendation" named
// the open question this audit answers, deliberately without predefining
// the answer:
//
//   Once a Wanderer has viewed a Snapshot's content, alone or alongside
//   another's, what can they ALREADY, LEGITIMATELY do with it — using
//   only actions that exist in the running application today? And which
//   candidate actions would require NEW authority this application does
//   not yet grant?
//
// TEST-ONLY, EXACTLY LIKE 0.9.178 BEFORE IT. This file adds no production
// code and changes no existing file. Every collaborator this audit drives
// — `WorldEncounterCanvas.js`, `WorldSnapshotContentView.js`,
// `WorldSnapshotContentComparisonView.js`, `WorldSnapshotInspection.js`,
// `MaterializedSnapshotWorldDiscoveryBridge.js` — is read, real, and
// unmodified as of 0.9.185.
//
//   Section A: existing action inventory — the complete, real set of
//              Wanderer-reachable actions on `WorldEncounterCanvas.js`;
//              exactly four of them are Content-View/Content-Comparison-
//              View-shaped (open/close each panel), and no
//              accept/merge/replace/adopt/apply/download/export/
//              reposition/relocate-shaped action exists anywhere.
//   Section B: observation vs. action — opening/closing either panel,
//              repeatedly, triggers no registry mutation and no
//              additional material load.
//   Section C: viewing never gates or ungates anything else — the
//              distribute/discover/unregister action gates read
//              identically whether or not either panel is open.
//   Section D: the comparison target (Publication B) is never itself
//              actionable — every mutating action reads the PRIMARY
//              selection alone; `comparisonEncounter`/
//              `comparisonMaterialInspection`/`comparisonSnapshotContentView`
//              are referenced by no action method.
//   Section E: material availability — opening either panel never
//              triggers a new material load; both panels only ever
//              render material already loaded by the ordinary pipeline.
//   Section F: Publication identity preservation — what is being VIEWED
//              and what would be ACTED ON are provably the same
//              Publication, even with the Content Comparison panel open
//              alongside a different Publication B.
//   Section G: position actionability — unchanged from 0.9.178: no
//              method moves/relocates/repositions anything, and neither
//              new panel's template carries a `v-model` or any `@click`
//              beyond its own open/close pair.
//   Section H: registry mutation requirements — structural sweep: none
//              of the four panel actions (open/close × 2) ever touches
//              `registry`.
//   Section I: the LOCAL/PEER/SNAPSHOT distribute/discover truth table
//              (0.9.178's own finding) still holds, unaffected by whether
//              either Content View panel is open.
//   Section J: candidate World-mutating actions — a structural sweep
//              proving no accept/merge/deduplicate/replace/adopt/use-this/
//              materialize-from-comparison vocabulary exists anywhere in
//              the two Content-View descriptor modules or their own
//              rendered panels — the audit's own record that no action
//              semantics were invented in advance of a real need.

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

// Mirrors tests/WorldSnapshotContentComparisonView.test.js's own
// buildCanvasInstance() exactly.
function buildCanvasInstance({ registry = null, storageProvider = null, materialSources = null, distributionCommand = null, snapshotDistributionCommand = null, discoverSnapshotCommand = null } = {}) {
    const ctx = {
        registry,
        view: WorldEncounterCanvas.props.view.default(),
        materialSources: materialSources || (storageProvider ? { local: new LocalWorldEncounterMaterialSource(storageProvider) } : null),
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

// Extracts one named method's own body text out of `WorldEncounterCanvas.js`'s
// own source — from its own declaration line up to the next `,\n        }`
// boundary a method/computed of this file's own indentation style always
// closes on. Mirrors tests/WorldSnapshotInspectionActionabilityAudit.test.js's
// own `extractComputedBody()`, generalized to accept either an explicit next
// marker or fall back to matching the method's own closing brace.
function extractMethodBody(source, name) {
    const marker = `        ${name}(`;
    const startIndex = source.indexOf(marker);
    assert(startIndex !== -1, `sanity — ${name}() is found verbatim in WorldEncounterCanvas.js`);
    const braceOpen = source.indexOf('{', startIndex);
    let depth = 0;
    let index = braceOpen;
    for (; index < source.length; index++) {
        if (source[index] === '{') depth++;
        else if (source[index] === '}') {
            depth--;
            if (depth === 0) break;
        }
    }
    assert(depth === 0, `sanity — ${name}()'s own closing brace is found`);
    return source.slice(startIndex, index + 1);
}

async function run() {
    const canvasSource = await readFile(new URL('../ui/components/WorldEncounterCanvas.js', import.meta.url), 'utf8');
    const canvasCodeOnly = stripLineComments(canvasSource);
    const contentViewSource = await readFile(new URL('../application/WorldSnapshotContentView.js', import.meta.url), 'utf8');
    const contentComparisonViewSource = await readFile(new URL('../application/WorldSnapshotContentComparisonView.js', import.meta.url), 'utf8');

    // ---------------------------------------------------------------
    // Section A — existing action inventory.
    // ---------------------------------------------------------------
    {
        const methodNames = Object.keys(WorldEncounterCanvas.methods);

        const expectedActions = [
            'selectEncounter', 'chooseSelectionOrigin', 'chooseDecentralizedLead',
            'distributeSelectedPublication', 'distributeSelectedSnapshot',
            'discoverSelectedSnapshot', 'discoverPublication', 'selectDiscoveredPublication',
            'unregisterSelectedSnapshot',
            'openSnapshotContentView', 'closeSnapshotContentView',
            'openContentComparisonView', 'closeContentComparisonView',
            'armComparisonSelection', 'selectComparisonEncounter', 'clearComparisonSelection'
        ];
        for (const action of expectedActions) {
            assert(methodNames.includes(action), `1. ${action}() already exists as a Wanderer-reachable action`);
        }

        // Exactly four Content-View/Content-Comparison-shaped methods
        // exist: open/close for each of the two panels. No fifth one
        // (a "use," "accept," or "apply" for either panel) exists.
        const contentPanelMethods = methodNames.filter((name) => /ContentView|ContentComparison/i.test(name));
        assert(contentPanelMethods.length === 4
            && contentPanelMethods.includes('openSnapshotContentView')
            && contentPanelMethods.includes('closeSnapshotContentView')
            && contentPanelMethods.includes('openContentComparisonView')
            && contentPanelMethods.includes('closeContentComparisonView'),
            `2. exactly the four open/close Content-View/Content-Comparison methods exist — found: ${contentPanelMethods.join(', ')}`);

        // No action anywhere on this component is shaped like a
        // World-mutating command over viewed content — this is the
        // audit's own structural proof that nothing beyond open/close was
        // quietly added alongside 0.9.183/0.9.184.
        const candidateActionNames = methodNames.filter((name) => /accept|merge|adopt|^apply[A-Z]|download|export|replace|reposition|relocate|^move[A-Z]|materializeFromComparison|useSnapshot|useContent/i.test(name));
        assert(candidateActionNames.length === 0,
            `3. no accept/merge/adopt/apply/download/export/replace/reposition/relocate/materialize-from-comparison-shaped action exists — found: ${candidateActionNames.join(', ')}`);

        console.log('✓ Section A: the only Content-View/Content-Comparison-shaped actions are the four open/close pairs; no accept/merge/adopt/apply/download/export/reposition-shaped action exists anywhere on WorldEncounterCanvas.js');
    }

    // ---------------------------------------------------------------
    // Section B — observation vs. action: opening/closing either panel,
    // repeatedly, triggers no registry mutation and no additional load.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const pubA = publishOwnPublication(storageProvider, 'Section B Publication A');
        const pubB = publishOwnPublication(storageProvider, 'Section B Publication B');
        const registry = new WorldDiscoverySourceRegistry();
        registerSnapshot(registry, pubA, 'hash-section-b', { x: 0, y: 0, z: 0 });
        registerSnapshot(registry, pubB, 'hash-section-b', { x: 1, y: 0, z: 1 });

        const canvas = buildCanvasInstance({ registry, storageProvider });
        mountCanvas(canvas);
        await compareThroughUI(canvas, pubA.id, pubB.id);
        assert(canvas.selectedSnapshotContentView !== null, 'sanity — Publication A\'s own Content View is genuinely available');
        assert(canvas.worldSnapshotContentComparisonView !== null, 'sanity — the Content Comparison view is genuinely available');

        let setSourceCalls = 0;
        let removeSourceCalls = 0;
        const originalSetSource = registry.setSource.bind(registry);
        const originalRemoveSource = registry.removeSource.bind(registry);
        registry.setSource = (...args) => { setSourceCalls += 1; return originalSetSource(...args); };
        registry.removeSource = (...args) => { removeSourceCalls += 1; return originalRemoveSource(...args); };

        for (let i = 0; i < 5; i++) {
            canvas.openSnapshotContentView();
            canvas.closeSnapshotContentView();
            canvas.openContentComparisonView();
            canvas.closeContentComparisonView();
        }
        await flush();

        assert(setSourceCalls === 0, '1. opening/closing either panel (five times over) never calls registry.setSource()');
        assert(removeSourceCalls === 0, '2. opening/closing either panel (five times over) never calls registry.removeSource()');
        assert(canvas.selectedSnapshotContentView !== null && canvas.worldSnapshotContentComparisonView !== null,
            '3. both views remain exactly as available afterward — opening/closing observed them, never invalidated them');

        unmountCanvas(canvas);
        console.log('✓ Section B: opening/closing either Content-View panel, repeatedly, never mutates the registry');
    }

    // ---------------------------------------------------------------
    // Section C — viewing never gates or ungates anything else.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const publication = publishOwnPublication(storageProvider, 'Section C Publication');
        const registry = new WorldDiscoverySourceRegistry();
        registerSnapshot(registry, publication, 'hash-section-c', { x: 2, y: 0, z: 2 });

        const distributeCalls = [];
        const discoverCalls = [];
        const canvas = buildCanvasInstance({
            registry,
            storageProvider,
            distributionCommand: async (p) => { distributeCalls.push(p); return { outcome: 'DISTRIBUTED' }; },
            snapshotDistributionCommand: async (p) => { distributeCalls.push(p); return { contentReference: { hash: 'h', uri: 'u' }, announcement: null }; },
            discoverSnapshotCommand: async (p) => { discoverCalls.push(p); return { outcome: 'MATCH', bytes: null, candidates: [], locator: null, storage: null, reason: null }; }
        });
        mountCanvas(canvas);
        canvas.selectEncounter(pub(WorldEncounterKind.PUBLICATION, publication.id));
        await flush();

        const gateBefore = {
            distribute: canvas.distributablePublication !== null,
            unregisterInspection: canvas.selectedEncounterSnapshotInspection !== null
        };

        canvas.openSnapshotContentView();
        await flush();
        assert(canvas.distributablePublication !== null, '1. distribute/discover stay reachable with the Content View panel open');
        assert(canvas.selectedEncounterSnapshotInspection !== null, '2. unregisterSelectedSnapshot() stays reachable with the Content View panel open');

        canvas.distributeSelectedPublication();
        canvas.distributeSelectedSnapshot();
        canvas.discoverSelectedSnapshot();
        await flush();
        assert(distributeCalls.length === 2 && discoverCalls.length === 1, '3. every action genuinely executes while the panel is open, exactly as it would while closed');

        canvas.closeSnapshotContentView();
        await flush();
        assert(canvas.distributablePublication !== null, `4. closing the panel doesn't disable distribute either — gate unchanged (${gateBefore.distribute})`);
        assert(canvas.selectedEncounterSnapshotInspection !== null, '5. closing the panel doesn\'t disable unregisterSelectedSnapshot() either');

        unmountCanvas(canvas);
        console.log('✓ Section C: opening or closing the Content View panel neither gates nor ungates distribute/discover/unregister — those actions read the same, already-existing facts regardless');
    }

    // ---------------------------------------------------------------
    // Section D — the comparison target (Publication B) is never itself
    // actionable.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const pubA = publishOwnPublication(storageProvider, 'Section D Publication A');
        const pubB = publishOwnPublication(storageProvider, 'Section D Publication B');
        const registry = new WorldDiscoverySourceRegistry();
        registerSnapshot(registry, pubA, 'hash-section-d-a', { x: 0, y: 0, z: 0 });
        registerSnapshot(registry, pubB, 'hash-section-d-b', { x: 1, y: 0, z: 1 });

        const distributeCalls = [];
        const canvas = buildCanvasInstance({
            registry,
            storageProvider,
            distributionCommand: async (p) => { distributeCalls.push(p); return { outcome: 'DISTRIBUTED' }; },
            snapshotDistributionCommand: async (p) => { distributeCalls.push(p); return { contentReference: null, announcement: null }; }
        });
        mountCanvas(canvas);
        await compareThroughUI(canvas, pubA.id, pubB.id);
        canvas.openContentComparisonView();
        await flush();
        assert(canvas.worldSnapshotContentComparisonView !== null, 'sanity — the content comparison view is genuinely available');

        canvas.distributeSelectedPublication();
        canvas.distributeSelectedSnapshot();
        await flush();
        assert(distributeCalls.length === 2, 'sanity — both distribute actions genuinely executed');
        assert(distributeCalls.every((p) => p.id === pubA.id), '1. every distribute call carries Publication A (the PRIMARY selection) — never Publication B, the comparison target, even with its own Content View visible alongside');

        const inspection = canvas.selectedEncounterSnapshotInspection;
        assert(inspection.publicationId === pubA.id, '2. unregisterSelectedSnapshot() would act on Publication A\'s own contentHash/publicationId, never B\'s');
        canvas.unregisterSelectedSnapshot();
        await flush();
        assert(canvas.selectedSnapshotContentView === null, '3. Publication A\'s own Content View collapses — its source was genuinely removed');
        assert(canvas.comparisonSnapshotContentView !== null && canvas.comparisonSnapshotContentView.publicationId === pubB.id,
            '4. Publication B\'s own Content View survives untouched — unregisterSelectedSnapshot() removed only Publication A\'s source, never the comparison target\'s');

        // Structural confirmation: no action method on this component ever
        // reads `comparisonEncounter`/`comparisonMaterialInspection`/
        // `comparisonSnapshotContentView` — the comparison target's own
        // material is observed, never acted on, by any existing method.
        for (const name of ['distributeSelectedPublication', 'distributeSelectedSnapshot', 'discoverSelectedSnapshot', 'unregisterSelectedSnapshot']) {
            const body = stripLineComments(extractMethodBody(canvasSource, name));
            assert(!/comparisonEncounter|comparisonMaterialInspection|comparisonSnapshotContentView|comparisonResolvedSelection/.test(body),
                `5. [${name}] never reads any comparison-target field — it acts on the primary selection alone`);
        }

        unmountCanvas(canvas);
        console.log('✓ Section D: the comparison target (Publication B) is never itself actionable — every mutating action reads the primary selection alone, even with its own Content View open alongside');
    }

    // ---------------------------------------------------------------
    // Section E — material availability: opening either panel never
    // triggers a new material load.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const pubA = publishOwnPublication(storageProvider, 'Section E Publication A');
        const pubB = publishOwnPublication(storageProvider, 'Section E Publication B');
        const registry = new WorldDiscoverySourceRegistry();
        registerSnapshot(registry, pubA, 'hash-section-e', { x: 0, y: 0, z: 0 });
        registerSnapshot(registry, pubB, 'hash-section-e', { x: 1, y: 0, z: 1 });

        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const loadCalls = [];
        const originalLoad = localSource.load.bind(localSource);
        localSource.load = async (...args) => { loadCalls.push(args); return originalLoad(...args); };

        const ctx = buildCanvasInstance({ registry, materialSources: { local: localSource } });
        mountCanvas(ctx);
        await compareThroughUI(ctx, pubA.id, pubB.id);
        assert(ctx.worldSnapshotContentComparisonView !== null, 'sanity — the content comparison view is genuinely available');

        const loadCountBeforeOpen = loadCalls.length;
        ctx.openSnapshotContentView();
        ctx.openContentComparisonView();
        await flush();
        assert(loadCalls.length === loadCountBeforeOpen, '1. opening either panel triggers zero additional material-source load calls — both panels only ever render what the ordinary selection/comparison pipeline already loaded');

        ctx.closeSnapshotContentView();
        ctx.closeContentComparisonView();
        await flush();
        assert(loadCalls.length === loadCountBeforeOpen, '2. closing either panel triggers zero additional load calls either');

        unmountCanvas(ctx);
        console.log('✓ Section E: opening or closing either Content-View panel never triggers a new material-source load — both only render already-loaded material');
    }

    // ---------------------------------------------------------------
    // Section F — Publication identity preservation: what is VIEWED and
    // what would be ACTED ON are the same Publication.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const pubA = publishOwnPublication(storageProvider, 'Section F Publication A');
        const pubB = publishOwnPublication(storageProvider, 'Section F Publication B');
        const registry = new WorldDiscoverySourceRegistry();
        registerSnapshot(registry, pubA, 'hash-section-f-shared', { x: 0, y: 0, z: 0 });
        registerSnapshot(registry, pubB, 'hash-section-f-shared', { x: 1, y: 0, z: 1 });

        const canvas = buildCanvasInstance({ registry, storageProvider });
        mountCanvas(canvas);
        await compareThroughUI(canvas, pubA.id, pubB.id);
        canvas.openSnapshotContentView();
        canvas.openContentComparisonView();
        await flush();

        assert(canvas.selectedSnapshotContentView.publicationId === canvas.distributablePublication.id,
            '1. the Publication being VIEWED (selectedSnapshotContentView.publicationId) is exactly the Publication that WOULD be acted on (distributablePublication.id)');
        assert(canvas.worldSnapshotContentComparisonView.aPublicationId === canvas.distributablePublication.id,
            '2. the Content Comparison view\'s own "A" side is exactly that same actionable Publication — never B, even though both share identical content');
        assert(canvas.worldSnapshotContentComparisonView.bPublicationId === pubB.id
            && canvas.worldSnapshotContentComparisonView.bPublicationId !== canvas.distributablePublication.id,
            '3. the comparison\'s own "B" side names Publication B, which is never the actionable one');

        unmountCanvas(canvas);
        console.log('✓ Section F: what is being viewed and what would be acted on are provably the same Publication, even with two identical-content Publications shown side by side');
    }

    // ---------------------------------------------------------------
    // Section G — position actionability: unchanged from 0.9.178.
    // ---------------------------------------------------------------
    {
        const methodNames = Object.keys(WorldEncounterCanvas.methods);
        assert(!methodNames.some((name) => /^(move|reposition|relocate|setPosition|updatePosition)/i.test(name)),
            '1. no move/reposition/relocate/setPosition/updatePosition method exists on WorldEncounterCanvas.js');

        const contentViewPanelMatch = canvasSource.match(/<div v-if="selectedEncounterSnapshotInspection" class="world-snapshot-content-view-panel">[\s\S]*?\n            <\/div>/);
        assert(contentViewPanelMatch, 'sanity — the Snapshot Content panel template block is found');
        assert(!/v-model/.test(contentViewPanelMatch[0]), '2. the Snapshot Content panel contains no v-model binding — it is read-only');
        const contentViewClicks = (contentViewPanelMatch[0].match(/@click="([^"]+)"/g) || []).sort();
        assert(JSON.stringify(contentViewClicks) === JSON.stringify(['@click="closeSnapshotContentView"', '@click="openSnapshotContentView"']),
            `3. the Snapshot Content panel contains exactly its own open/close pair — found: ${contentViewClicks.join(', ')}`);

        const comparisonViewPanelMatch = canvasSource.match(/<div v-if="comparisonEncounter" class="world-snapshot-content-comparison-panel">[\s\S]*?\n            <\/div>/);
        assert(comparisonViewPanelMatch, 'sanity — the Content Comparison panel template block is found');
        assert(!/v-model/.test(comparisonViewPanelMatch[0]), '4. the Content Comparison panel contains no v-model binding either');
        const comparisonViewClicks = (comparisonViewPanelMatch[0].match(/@click="([^"]+)"/g) || []).sort();
        assert(JSON.stringify(comparisonViewClicks) === JSON.stringify(['@click="closeContentComparisonView"', '@click="openContentComparisonView"']),
            `5. the Content Comparison panel contains exactly its own open/close pair — found: ${comparisonViewClicks.join(', ')}`);

        console.log('✓ Section G: no move/reposition/relocate method exists anywhere, and neither Content-View panel\'s template carries a v-model or any @click beyond its own open/close pair');
    }

    // ---------------------------------------------------------------
    // Section H — registry mutation requirements: structural sweep of
    // all four panel actions.
    // ---------------------------------------------------------------
    {
        for (const name of ['openSnapshotContentView', 'closeSnapshotContentView', 'openContentComparisonView', 'closeContentComparisonView']) {
            const body = stripLineComments(extractMethodBody(canvasSource, name));
            assert(!/this\.registry/.test(body), `1. [${name}] never touches this.registry`);
            assert(!/inspectWorldEncounterMaterial|loadWorldEncounterMaterial|refreshMaterialInspection|refreshComparisonMaterialInspection/.test(body),
                `2. [${name}] never triggers a new material load`);
            assert(!/materializ|distribut|discover/i.test(body), `3. [${name}] never materializes, distributes, or discovers`);
        }

        console.log('✓ Section H: none of the four Content-View panel actions (open/close × 2) ever touches the registry, triggers a new material load, materializes, distributes, or discovers');
    }

    // ---------------------------------------------------------------
    // Section I — the LOCAL/PEER/SNAPSHOT truth table still holds,
    // unaffected by whether either Content View panel is open.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const publication = publishOwnPublication(storageProvider, 'Section I Publication');
        const registry = new WorldDiscoverySourceRegistry();
        registerSnapshot(registry, publication, 'hash-section-i', { x: 3, y: 0, z: 3 });

        const distributeCalls = [];
        const canvas = buildCanvasInstance({
            registry,
            storageProvider,
            distributionCommand: async (p) => { distributeCalls.push(p); return { outcome: 'DISTRIBUTED' }; },
            snapshotDistributionCommand: async (p) => { distributeCalls.push(p); return { contentReference: null, announcement: null }; }
        });
        mountCanvas(canvas);
        canvas.selectEncounter(pub(WorldEncounterKind.PUBLICATION, publication.id));
        await flush();

        const rowClosed = { distribute: canvas.distributablePublication !== null, inspect: canvas.selectedEncounterSnapshotInspection !== null };
        canvas.openSnapshotContentView();
        await flush();
        const rowOpen = { distribute: canvas.distributablePublication !== null, inspect: canvas.selectedEncounterSnapshotInspection !== null };

        assert(JSON.stringify(rowClosed) === JSON.stringify(rowOpen), '1. the actionability row is byte-identical whether the Content View panel is open or closed');
        assert(rowOpen.distribute && rowOpen.inspect, '2. sanity — both remain reachable');

        canvas.distributeSelectedPublication();
        canvas.distributeSelectedSnapshot();
        await flush();
        assert(distributeCalls.length === 2, '3. distribute genuinely executes with the panel open, exactly as 0.9.178 already proved it does with no panel concept at all');

        unmountCanvas(canvas);
        console.log('✓ Section I: the distribute/discover/unregister actionability row is unaffected by whether the Content View panel is open — 0.9.178\'s own finding still holds, one milestone later');
    }

    // ---------------------------------------------------------------
    // Section J — candidate World-mutating actions: a structural sweep
    // proving no premature action semantics exist anywhere.
    // ---------------------------------------------------------------
    {
        const forbiddenVocabulary = /merge|duplicat|replace this|deduplicat|\baccept\b|\badopt\b|use this snapshot|materialize.{0,20}comparison/i;

        assert(!forbiddenVocabulary.test(stripLineComments(contentViewSource)),
            '1. application/WorldSnapshotContentView.js carries no accept/merge/adopt/replace/deduplicate vocabulary');
        assert(!forbiddenVocabulary.test(stripLineComments(contentComparisonViewSource)),
            '2. application/WorldSnapshotContentComparisonView.js carries no accept/merge/adopt/replace/deduplicate vocabulary either');

        const contentViewPanelMatch = canvasSource.match(/<div v-if="selectedEncounterSnapshotInspection" class="world-snapshot-content-view-panel">[\s\S]*?\n            <\/div>/);
        const comparisonViewPanelMatch = canvasSource.match(/<div v-if="comparisonEncounter" class="world-snapshot-content-comparison-panel">[\s\S]*?\n            <\/div>/);
        assert(!forbiddenVocabulary.test(contentViewPanelMatch[0]), '3. the rendered Snapshot Content panel offers no accept/merge/adopt/replace action of any kind');
        assert(!forbiddenVocabulary.test(comparisonViewPanelMatch[0]), '4. the rendered Content Comparison panel offers no accept/merge/adopt/replace action of any kind either');

        // Neither descriptor module gained a new World Encounter kind, a
        // new registry identity, or any rank/trust/freshness vocabulary —
        // inherited unchanged from every file in this chain.
        assert(WorldEncounterKind.PUBLICATION === 'PUBLICATION' && WorldEncounterKind.AVATAR === 'AVATAR' && Object.keys(WorldEncounterKind).length === 2,
            '5. WorldEncounterKind still carries exactly PUBLICATION and AVATAR');
        assert(!/rank|trust|freshness|quality|score|preferred|reliable/i.test(canvasCodeOnly.slice(canvasCodeOnly.indexOf('world-snapshot-content-view-panel'), canvasCodeOnly.indexOf('world-snapshot-content-comparison-panel') + 4000)),
            '6. neither Content-View panel introduces rank/trust/freshness/quality/score/preferred/reliable vocabulary');

        console.log('✓ Section J: no accept/merge/adopt/replace/deduplicate vocabulary exists anywhere in either Content-View descriptor module or its own rendered panel — no action semantics were invented in advance of a real need');
        console.log('\n✅ All World Snapshot Content Actionability Audit checks passed.');
    }
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
