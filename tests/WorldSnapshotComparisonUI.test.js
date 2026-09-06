import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import WorldEncounterMarker from '../ui/components/WorldEncounterMarker.js';
import { WorldDiscoverySourceRegistry } from '../application/WorldDiscoverySourceRegistry.js';
import { describeLocalWorldDiscoverySource } from '../application/WorldEncounterIntegration.js';
import { registerPeerWorldSource } from '../peer/PeerWorldDiscoveryLifecycleBridge.js';
import {
    registerMaterializedSnapshotWorldSource,
    unregisterMaterializedSnapshotWorldSource
} from '../application/MaterializedSnapshotWorldDiscoveryBridge.js';
import { SnapshotWorldRegistrationOutcome } from '../application/SnapshotWorldRegistrationOutcome.js';
import { SnapshotWorldPlacementOutcome } from '../application/SnapshotWorldPlacementOutcome.js';
import { WorldSnapshotContentComparison } from '../application/WorldSnapshotComparison.js';
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

// 0.9.182 — World Snapshot Comparison UI.
//
// 0.9.181 built `compareSnapshotWorldPublications(a, b)` and deliberately
// left it unwired from any UI. This is that wiring: a Wanderer who has
// selected one World Publication can explicitly compare it against a
// second, separately-selected World Publication and see whether their
// content is the same — entirely through `ui/components/WorldEncounterCanvas.js`'s
// own new `armComparisonSelection()` / `selectComparisonEncounter()` /
// `worldSnapshotComparisonResult` seam and `application/
// WorldEncounterComparisonCandidate.js` (new).
//
//   Section A: explicit comparison — arming, picking a second Publication
//              via the SAME marker-click path, and reading the result.
//   Section B: two different Publications, same contentHash -> SAME_CONTENT.
//   Section C: two different Publications, different contentHash ->
//              DIFFERENT_CONTENT.
//   Section D: cross-family — LOCAL/PEER/SNAPSHOT combinations never crash
//              and never refuse to compare; contentComparison is null only
//              where contentHash is honestly unknown.
//   Section E: position independence — the "particularly important case."
//   Section F: identity preservation — aPublicationId/bPublicationId are
//              always reported, never replaced by a content hash.
//   Section G: no implicit comparison — selecting one Publication alone,
//              a registry change, or material loading never produces a
//              comparison on their own.
//   Section H: changing the primary selection never leaves a stale result
//              describing the old pair.
//   Section I: removing either side's source makes the comparison
//              unavailable again.
//   Section J: structural audit — the marker-click path is reused (no
//              second click handler), exactly one call site of
//              `compareSnapshotWorldPublications()`, and no registry
//              mutation from any of this milestone's own new methods.

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

// Mirrors tests/WorldSnapshotInspectionActionabilityAudit.test.js's own
// buildCanvasInstance() exactly, extended with this milestone's own new
// computeds — every getter below already exists on WorldEncounterCanvas.js
// itself; nothing here is invented for testing purposes.
function buildCanvasInstance({ registry = null } = {}) {
    const ctx = {
        registry,
        view: WorldEncounterCanvas.props.view.default(),
        materialSources: null,
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
        'selectedPublicationComparisonCandidate',
        'comparisonResolvedSelection',
        'comparisonEncounterInspection',
        'comparisonEncounterPresentation',
        'comparisonPublicationComparisonCandidate',
        'worldSnapshotComparisonResult',
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
    const candidateSource = await readFile(new URL('../application/WorldEncounterComparisonCandidate.js', import.meta.url), 'utf8');

    // ---------------------------------------------------------------
    // Section A — explicit comparison, through the UI.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const pubA = publishOwnPublication(storageProvider, 'Section A Publication A');
        const pubB = publishOwnPublication(storageProvider, 'Section A Publication B');
        const registry = new WorldDiscoverySourceRegistry();
        registerSnapshot(registry, pubA, 'hash-shared', { x: 1, y: 0, z: 1 });
        registerSnapshot(registry, pubB, 'hash-shared', { x: 2, y: 0, z: 2 });

        const canvas = buildCanvasInstance({ registry });
        mountCanvas(canvas);

        canvas.selectEncounter(pub(WorldEncounterKind.PUBLICATION, pubA.id));
        assert(canvas.armedForComparisonSelection === false, '1. a fresh primary selection never arms comparison selection on its own');
        assert(canvas.comparisonEncounter === null, '2. a fresh primary selection alone never sets a comparison target');
        assert(canvas.worldSnapshotComparisonResult === null, '3. no comparison target yet -> no result yet');
        assert(canvas.selectedPublicationComparisonCandidate !== null, '4. sanity — Publication A is a valid comparison candidate');

        canvas.armComparisonSelection();
        assert(canvas.armedForComparisonSelection === true, '5. armComparisonSelection() arms comparison selection');

        // The SAME marker-click path, reused — see this milestone's own
        // header, "reuses the existing marker-click path."
        canvas.selectEncounter(pub(WorldEncounterKind.PUBLICATION, pubB.id));
        assert(canvas.armedForComparisonSelection === false, '6. picking a second Publication un-arms comparison selection');
        assert(canvas.selectedEncounter.objectId === pubA.id, '7. the PRIMARY selection is untouched by the armed marker click');
        assert(canvas.comparisonEncounter.objectId === pubB.id, '8. the comparison target is now Publication B');

        const result = canvas.worldSnapshotComparisonResult;
        assert(result !== null, '9. a comparison result is now available');
        assert(result.aPublicationId === pubA.id && result.bPublicationId === pubB.id, '10. both publicationIds are reported');
        assert(result.samePublication === false, '11. two distinct Publications -> samePublication false');
        assert(result.contentComparison === WorldSnapshotContentComparison.SAME_CONTENT, '12. identical contentHash -> SAME_CONTENT');

        canvas.clearComparisonSelection();
        assert(canvas.comparisonEncounter === null, '13. clearComparisonSelection() clears the comparison target');
        assert(canvas.worldSnapshotComparisonResult === null, '14. no comparison target -> no result');

        unmountCanvas(canvas);
        console.log('✓ Section A: a Wanderer can explicitly compare two selected World Publications through the UI, using the same marker-click path');
    }

    // ---------------------------------------------------------------
    // Section B — same content.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const pubA = publishOwnPublication(storageProvider, 'Section B Publication A');
        const pubB = publishOwnPublication(storageProvider, 'Section B Publication B');
        const registry = new WorldDiscoverySourceRegistry();
        registerSnapshot(registry, pubA, 'hash-b', { x: 0, y: 0, z: 0 });
        registerSnapshot(registry, pubB, 'hash-b', { x: 5, y: 0, z: 5 });

        const canvas = buildCanvasInstance({ registry });
        mountCanvas(canvas);
        canvas.selectEncounter(pub(WorldEncounterKind.PUBLICATION, pubA.id));
        canvas.armComparisonSelection();
        canvas.selectEncounter(pub(WorldEncounterKind.PUBLICATION, pubB.id));

        assert(canvas.worldSnapshotComparisonResult.contentComparison === WorldSnapshotContentComparison.SAME_CONTENT,
            '1. two different Publications sharing an identical contentHash compare as SAME_CONTENT');
        assert(canvas.worldSnapshotComparisonResult.samePublication === false,
            '2. ...while remaining two distinct Publications');

        unmountCanvas(canvas);
        console.log('✓ Section B: two different Publications sharing an identical contentHash report SAME_CONTENT');
    }

    // ---------------------------------------------------------------
    // Section C — different content.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const pubA = publishOwnPublication(storageProvider, 'Section C Publication A');
        const pubB = publishOwnPublication(storageProvider, 'Section C Publication B');
        const registry = new WorldDiscoverySourceRegistry();
        registerSnapshot(registry, pubA, 'hash-c1', { x: 0, y: 0, z: 0 });
        registerSnapshot(registry, pubB, 'hash-c2', { x: 5, y: 0, z: 5 });

        const canvas = buildCanvasInstance({ registry });
        mountCanvas(canvas);
        canvas.selectEncounter(pub(WorldEncounterKind.PUBLICATION, pubA.id));
        canvas.armComparisonSelection();
        canvas.selectEncounter(pub(WorldEncounterKind.PUBLICATION, pubB.id));

        assert(canvas.worldSnapshotComparisonResult.contentComparison === WorldSnapshotContentComparison.DIFFERENT_CONTENT,
            '1. two Publications with different contentHash compare as DIFFERENT_CONTENT');

        unmountCanvas(canvas);
        console.log('✓ Section C: two Publications with different contentHash report DIFFERENT_CONTENT');
    }

    // ---------------------------------------------------------------
    // Section D — cross-family, source-family agnosticism.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const pubLocal = publishOwnPublication(storageProvider, 'Section D Local');
        const pubPeer = publishOwnPublication(storageProvider, 'Section D Peer');
        const pubSnap1 = publishOwnPublication(storageProvider, 'Section D Snapshot 1');
        const pubSnap2 = publishOwnPublication(storageProvider, 'Section D Snapshot 2');
        const registry = new WorldDiscoverySourceRegistry();
        registerLocal(registry, pubLocal, { x: 0, y: 0, z: 0 });
        registerPeer(registry, pubPeer, { x: 1, y: 0, z: 1 }, 'did:key:zSectionDPeer');
        registerSnapshot(registry, pubSnap1, 'hash-d-shared', { x: 2, y: 0, z: 2 });
        registerSnapshot(registry, pubSnap2, 'hash-d-shared', { x: 3, y: 0, z: 3 });

        function compare(objectIdA, objectIdB) {
            const canvas = buildCanvasInstance({ registry });
            mountCanvas(canvas);
            canvas.selectEncounter(pub(WorldEncounterKind.PUBLICATION, objectIdA));
            canvas.armComparisonSelection();
            canvas.selectEncounter(pub(WorldEncounterKind.PUBLICATION, objectIdB));
            const result = canvas.worldSnapshotComparisonResult;
            unmountCanvas(canvas);
            return result;
        }

        const localVsSnapshot = compare(pubLocal.id, pubSnap1.id);
        assert(localVsSnapshot !== null, '1. LOCAL vs SNAPSHOT still produces a comparison result — never refused for crossing families');
        assert(localVsSnapshot.contentComparison === null, '2. LOCAL\'s own contentHash is not reachable today -> honestly null, never guessed');

        const peerVsSnapshot = compare(pubPeer.id, pubSnap1.id);
        assert(peerVsSnapshot !== null, '3. PEER vs SNAPSHOT still produces a comparison result');
        assert(peerVsSnapshot.contentComparison === null, '4. PEER\'s own contentHash is not reachable today -> honestly null');

        const localVsPeer = compare(pubLocal.id, pubPeer.id);
        assert(localVsPeer !== null, '5. LOCAL vs PEER still produces a comparison result');
        assert(localVsPeer.contentComparison === null, '6. neither side\'s contentHash is reachable -> honestly null');

        const snapshotVsSnapshot = compare(pubSnap1.id, pubSnap2.id);
        assert(snapshotVsSnapshot !== null, '7. SNAPSHOT vs SNAPSHOT produces a comparison result');
        assert(snapshotVsSnapshot.contentComparison === WorldSnapshotContentComparison.SAME_CONTENT,
            '8. both sides\' contentHash genuinely known and identical -> SAME_CONTENT');

        console.log('✓ Section D: LOCAL/PEER/SNAPSHOT combinations all compare without refusal — contentComparison is null only where contentHash is honestly unknown');
    }

    // ---------------------------------------------------------------
    // Section E — position independence (the "particularly important case").
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const pubA = publishOwnPublication(storageProvider, 'Section E Publication A');
        const pubB = publishOwnPublication(storageProvider, 'Section E Publication B');
        const registry = new WorldDiscoverySourceRegistry();
        registerSnapshot(registry, pubA, 'hash-e-shared', { x: 10, y: 0, z: 10 });
        registerSnapshot(registry, pubB, 'hash-e-shared', { x: -10, y: 0, z: -10 });

        const canvas = buildCanvasInstance({ registry });
        mountCanvas(canvas);
        canvas.selectEncounter(pub(WorldEncounterKind.PUBLICATION, pubA.id));
        canvas.armComparisonSelection();
        canvas.selectEncounter(pub(WorldEncounterKind.PUBLICATION, pubB.id));

        assert(canvas.worldSnapshotComparisonResult.contentComparison === WorldSnapshotContentComparison.SAME_CONTENT,
            '1. two Publications with an identical contentHash at very different World positions still report SAME_CONTENT');
        assert(canvas.selectedEncounterInspection.x === 10 && canvas.selectedEncounterInspection.z === 10,
            '2. Publication A still renders at its own, independent World position');
        assert(canvas.comparisonEncounterInspection.x === -10 && canvas.comparisonEncounterInspection.z === -10,
            '3. Publication B still renders at ITS OWN, independent World position — never merged with A\'s');

        unmountCanvas(canvas);
        console.log('✓ Section E: identical content at very different World positions still reports SAME_CONTENT, while both Publications keep rendering as two independent World objects');
    }

    // ---------------------------------------------------------------
    // Section F — identity preservation.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const pubA = publishOwnPublication(storageProvider, 'Section F Publication A');
        const pubB = publishOwnPublication(storageProvider, 'Section F Publication B');
        const registry = new WorldDiscoverySourceRegistry();
        registerSnapshot(registry, pubA, 'hash-f-shared', { x: 0, y: 0, z: 0 });
        registerSnapshot(registry, pubB, 'hash-f-shared', { x: 1, y: 0, z: 1 });

        const canvas = buildCanvasInstance({ registry });
        mountCanvas(canvas);
        canvas.selectEncounter(pub(WorldEncounterKind.PUBLICATION, pubA.id));
        canvas.armComparisonSelection();
        canvas.selectEncounter(pub(WorldEncounterKind.PUBLICATION, pubB.id));

        const result = canvas.worldSnapshotComparisonResult;
        assert(result.aPublicationId === pubA.id, '1. Publication A\'s own identity is reported, verbatim');
        assert(result.bPublicationId === pubB.id, '2. Publication B\'s own identity is reported, verbatim');
        assert(result.aPublicationId !== result.contentComparison && result.bPublicationId !== result.contentComparison,
            '3. neither publicationId is ever replaced by, or collapsed into, the content hash/verdict');
        assert(pubA.id !== pubB.id, '4. sanity — the two Publications genuinely have distinct identities');

        unmountCanvas(canvas);
        console.log('✓ Section F: aPublicationId/bPublicationId are always reported, never replaced by a content hash');
    }

    // ---------------------------------------------------------------
    // Section G — no implicit comparison.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const pubA = publishOwnPublication(storageProvider, 'Section G Publication A');
        const pubB = publishOwnPublication(storageProvider, 'Section G Publication B');
        const registry = new WorldDiscoverySourceRegistry();
        registerSnapshot(registry, pubA, 'hash-g-shared', { x: 0, y: 0, z: 0 });

        const canvas = buildCanvasInstance({ registry });
        mountCanvas(canvas);

        // Selecting one Publication alone never triggers a comparison.
        canvas.selectEncounter(pub(WorldEncounterKind.PUBLICATION, pubA.id));
        assert(canvas.worldSnapshotComparisonResult === null, '1. selecting one Publication alone produces no comparison');

        // A registry change (a second Snapshot appearing) never triggers one
        // either — only an explicit `selectComparisonEncounter()` call does.
        registerSnapshot(registry, pubB, 'hash-g-shared', { x: 1, y: 0, z: 1 });
        assert(canvas.worldSnapshotComparisonResult === null, '2. a registry change alone still produces no comparison');
        assert(canvas.comparisonEncounter === null, '3. a registry change never sets a comparison target on its own');

        unmountCanvas(canvas);
        console.log('✓ Section G: selecting one Publication, and registry changes, never trigger a comparison on their own — only an explicit second pick does');
    }

    // ---------------------------------------------------------------
    // Section H — selection changes never leave a stale result.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const pubA = publishOwnPublication(storageProvider, 'Section H Publication A');
        const pubB = publishOwnPublication(storageProvider, 'Section H Publication B');
        const pubC = publishOwnPublication(storageProvider, 'Section H Publication C');
        const registry = new WorldDiscoverySourceRegistry();
        registerSnapshot(registry, pubA, 'hash-h-1', { x: 0, y: 0, z: 0 });
        registerSnapshot(registry, pubB, 'hash-h-1', { x: 1, y: 0, z: 1 });
        registerSnapshot(registry, pubC, 'hash-h-2', { x: 2, y: 0, z: 2 });

        const canvas = buildCanvasInstance({ registry });
        mountCanvas(canvas);
        canvas.selectEncounter(pub(WorldEncounterKind.PUBLICATION, pubA.id));
        canvas.armComparisonSelection();
        canvas.selectEncounter(pub(WorldEncounterKind.PUBLICATION, pubB.id));
        assert(canvas.worldSnapshotComparisonResult.contentComparison === WorldSnapshotContentComparison.SAME_CONTENT,
            '1. sanity — A vs B (same hash) is SAME_CONTENT');

        // The Wanderer now selects a DIFFERENT primary Publication, without
        // touching the comparison target.
        canvas.selectEncounter(pub(WorldEncounterKind.PUBLICATION, pubC.id));
        assert(canvas.comparisonEncounter.objectId === pubB.id, '2. the comparison target itself is left untouched by a fresh primary selection');
        const refreshed = canvas.worldSnapshotComparisonResult;
        assert(refreshed !== null, '3. a fresh comparison result is available for the NEW pair');
        assert(refreshed.aPublicationId === pubC.id && refreshed.bPublicationId === pubB.id,
            '4. the result now genuinely describes the CURRENT pair (C vs B), never the stale one (A vs B)');
        assert(refreshed.contentComparison === WorldSnapshotContentComparison.DIFFERENT_CONTENT,
            '5. C vs B (different hash) correctly reports DIFFERENT_CONTENT — proving this is a fresh computation, not A vs B\'s stale SAME_CONTENT');

        unmountCanvas(canvas);
        console.log('✓ Section H: changing the primary selection never presents a stale result — the comparison always describes the CURRENT pair');
    }

    // ---------------------------------------------------------------
    // Section I — removal makes the comparison unavailable.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const pubA = publishOwnPublication(storageProvider, 'Section I Publication A');
        const pubB = publishOwnPublication(storageProvider, 'Section I Publication B');
        const registry = new WorldDiscoverySourceRegistry();
        registerSnapshot(registry, pubA, 'hash-i-shared', { x: 0, y: 0, z: 0 });
        registerSnapshot(registry, pubB, 'hash-i-shared', { x: 1, y: 0, z: 1 });

        const canvas = buildCanvasInstance({ registry });
        mountCanvas(canvas);
        canvas.selectEncounter(pub(WorldEncounterKind.PUBLICATION, pubA.id));
        canvas.armComparisonSelection();
        canvas.selectEncounter(pub(WorldEncounterKind.PUBLICATION, pubB.id));
        assert(canvas.worldSnapshotComparisonResult !== null, 'sanity — a comparison result is available before removal');

        // Removing Publication B's own Snapshot source from the registry.
        unregisterMaterializedSnapshotWorldSource(registry, 'hash-i-shared', pubB.id);
        assert(canvas.comparisonPublicationComparisonCandidate === null, '1. Publication B is no longer a valid comparison candidate once its source is removed');
        assert(canvas.worldSnapshotComparisonResult === null, '2. the comparison is no longer actionable once one side disappears from the registry');

        unmountCanvas(canvas);
        console.log('✓ Section I: removing either side\'s source from the World registry makes the comparison unavailable again — no stale result survives');
    }

    // ---------------------------------------------------------------
    // Section J — structural audit.
    // ---------------------------------------------------------------
    {
        const canvasCodeOnly = stripLineComments(canvasSource);

        // Exactly one call site of compareSnapshotWorldPublications() in
        // WorldEncounterCanvas.js — the one new computed this milestone adds.
        const compareCallCount = (canvasCodeOnly.match(/compareSnapshotWorldPublications\(/g) || []).length;
        assert(compareCallCount === 1, `1. compareSnapshotWorldPublications() is called from exactly one place — found ${compareCallCount}`);

        // The marker-click path is reused, never duplicated: WorldEncounterMarker.js
        // itself is untouched by this milestone (no second `select`-like emit).
        const markerSource = await readFile(new URL('../ui/components/WorldEncounterMarker.js', import.meta.url), 'utf8');
        assert(markerSource.includes("this.\$emit('select'"), '2. WorldEncounterMarker.js still emits exactly the one `select` event this milestone reuses');
        assert(!/compare/i.test(markerSource), '3. WorldEncounterMarker.js carries no comparison-specific vocabulary of any kind — this milestone added no second click handler');

        // None of this milestone's own new methods mutate the registry.
        const newMethodNames = ['armComparisonSelection', 'selectComparisonEncounter', 'refreshComparisonSelectionOutcome', 'clearComparisonSelection'];
        for (const name of newMethodNames) {
            assert(typeof WorldEncounterCanvas.methods[name] === 'function', `4. ${name}() exists on WorldEncounterCanvas.js`);
        }
        const startMarker = '        armComparisonSelection() {';
        const startIndex = canvasSource.indexOf(startMarker);
        assert(startIndex !== -1, 'sanity — armComparisonSelection() is found verbatim');
        const endMarker = '        discoverPublication() {';
        const endIndex = canvasSource.indexOf(endMarker, startIndex);
        assert(endIndex !== -1, 'sanity — the next existing method is found after this milestone\'s own new methods');
        const newMethodsBody = stripLineComments(canvasSource.slice(startIndex, endIndex));
        assert(!/\.setSource\(|\.removeSource\(|\.clear\(\)/.test(newMethodsBody),
            '5. none of this milestone\'s own new methods ever mutates registry membership directly');
        assert(!/registerMaterializedSnapshotWorldSource\(|unregisterMaterializedSnapshotWorldSource\(/.test(newMethodsBody),
            '6. none of this milestone\'s own new methods calls a Snapshot registration/unregistration function');

        // application/WorldEncounterComparisonCandidate.js performs no I/O,
        // no registry access, and no hashing of its own.
        const candidateCodeOnly = stripLineComments(candidateSource);
        assert(!/registry|Registry/.test(candidateCodeOnly), '7. WorldEncounterComparisonCandidate.js never references a registry of any kind');
        assert(!/createHash|sha256|sha1|md5/i.test(candidateCodeOnly), '8. WorldEncounterComparisonCandidate.js performs no hashing of its own');
        assert(candidateSource.includes('describeWorldSnapshotInspection'),
            '9. WorldEncounterComparisonCandidate.js reuses describeWorldSnapshotInspection() rather than re-deriving contentHash itself');

        // No implicit/automatic comparison vocabulary of any kind.
        assert(!/setInterval|automatic[A-Z]/i.test(newMethodsBody), '10. no polling or automatic-comparison mechanism of any kind');
        assert(!/duplicate/i.test(newMethodsBody), '11. no "duplicate detection" vocabulary in this milestone\'s own new methods');

        console.log('✓ Section J: structural audit — the marker-click path is reused with no second handler, compareSnapshotWorldPublications() is called from exactly one place, and none of this milestone\'s own new code mutates the registry or re-derives a content hash');
    }

    console.log('\n✅ All World Snapshot Comparison UI tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
