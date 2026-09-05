import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import {
    registerMaterializedSnapshotWorldSource,
    unregisterMaterializedSnapshotWorldSource,
    materializedSnapshotWorldOrigin
} from '../application/MaterializedSnapshotWorldDiscoveryBridge.js';
import { SnapshotWorldPlacementOutcome } from '../application/SnapshotWorldPlacementOutcome.js';
import { SnapshotWorldRegistrationOutcome } from '../application/SnapshotWorldRegistrationOutcome.js';
import { WorldDiscoverySourceRegistry } from '../application/WorldDiscoverySourceRegistry.js';
import { describeWorldFromDiscoveryRegistry } from '../application/WorldDiscoveryRegistryProjection.js';
import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';

// 0.9.163 — Snapshot World Origin Collision Fix.
//
// 0.9.162's own Convergence Audit (Section B) proved a genuine, narrow
// defect: `application/MaterializedSnapshotWorldDiscoveryBridge.js`'s own
// `materializedSnapshotWorldOrigin(contentHash)` (0.9.160) derived a
// registered Snapshot's registry slot from `contentHash` ALONE. Two
// DIFFERENT Publications whose Snapshot bytes merely happened to hash
// identically — an unremarkable case in a content-addressed system;
// nothing stops two independent publishers from separately publishing the
// same file — collided on that one derived slot: the second registration's
// `registry.setSource()` call silently REPLACED the first's, evicting an
// entirely unrelated Publication from the World with no error, no warning,
// and no record it was ever there.
//
//   THE FIX, AND ONLY THE FIX. `materializedSnapshotWorldOrigin()` now
// derives its registry key from `contentHash` AND `publicationId`
// together (`` `snapshot:${contentHash}:${publicationId}` ``). This file
// exists to prove exactly that fix, and nothing more:
//
//   contentHash    = what the Snapshot contains
//   publicationId  = which World Publication it represents
//   origin         = which discovery contribution is registered
//
// Those are three different identities. This milestone changes only how
// the third is DERIVED from the first two — it does not introduce a new
// identity type, and it does not touch `WorldDiscoverySourceRegistry`,
// `WorldDiscoverySourceAssembly`, `WorldEncounter`, `WorldEncounterCanvas`,
// or `WorldEncounterMarker`. Every one of those keeps its own, entirely
// unmodified "replacement, not accumulation" / assembly / rendering
// behavior; this file confirms a Snapshot registration now simply ARRIVES
// at that machinery under the correct, collision-free key.
//
//   Section A: existing single-Publication behavior is unchanged — a
//              Snapshot for one Publication still registers and renders
//              exactly as before.
//   Section B: THE FLAGSHIP — same contentHash, two DIFFERENT
//              Publications, produces TWO registry entries, never one.
//   Section C: same Publication, same contentHash — repeated registration
//              stays idempotent; one logical registry entry survives.
//   Section D: same Publication, DIFFERENT contentHash — the new key
//              never accidentally collapses genuinely distinct Snapshot
//              identities.
//   Section E: different Publications, different contentHashes — remain
//              naturally independent (sanity, unaffected by this fix).
//   Section F: locator independence — changing locator/storage never
//              changes the World registration identity (0.9.162's own
//              Section D finding, preserved).
//   Section G: position independence — the origin fix never affects the
//              authoritative Publication -> WorldPlacement -> position
//              chain.
//   Section H: rendering regression — both Publications reach the SAME,
//              entirely unmodified rendering machinery, each with its own
//              Publication id and position.
//   Section I: structural sweep — the fix touches only
//              `materializedSnapshotWorldOrigin()`'s own derivation; no
//              deduplication, reconciliation, merging, trust/ranking, or
//              new identity type was introduced anywhere.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function placedResult(contentHash, publicationId, position, placementId = 'placement-x') {
    return { outcome: SnapshotWorldPlacementOutcome.PLACED, contentHash, publicationId, placementId, position, reason: null };
}

// Reproduces ui/views/WorldView.js's own real wiring by hand — identical to
// tests/SnapshotWorldRendering.test.js's own buildCanvasInstance().
function buildCanvasInstance({ registry = null, view } = {}) {
    const ctx = {
        registry,
        view: view !== undefined ? view : WorldEncounterCanvas.props.view.default()
    };
    Object.assign(ctx, WorldEncounterCanvas.data.call(ctx));
    Object.assign(ctx, WorldEncounterCanvas.methods);
    return ctx;
}

function mountCanvas(ctx) { WorldEncounterCanvas.mounted.call(ctx); }
function unmountCanvas(ctx) { WorldEncounterCanvas.beforeUnmount.call(ctx); }

function projectedPublicationsOf(ctx) {
    ctx.effectiveView = WorldEncounterCanvas.computed.effectiveView.call(ctx);
    ctx.publicationRows = WorldEncounterCanvas.computed.publicationRows.call(ctx);
    return WorldEncounterCanvas.computed.projectedPublications.call(ctx);
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — existing single-Publication behavior, unchanged.
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        const publication = new Publication({ id: 'pub-solo', title: 'Solo Publication' });
        const result = registerMaterializedSnapshotWorldSource(
            registry, placedResult('hash-solo', 'pub-solo', { x: 1, y: 2, z: 3 }), publication
        );

        assert(result.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, '1. a single Publication\'s Snapshot still registers as REGISTERED');
        assert(result.origin === 'snapshot:hash-solo:pub-solo', '2. its origin is the deterministic snapshot:<contentHash>:<publicationId> scheme');
        assert(registry.listSources().length === 1, '3. exactly one source exists');

        const view = describeWorldFromDiscoveryRegistry(registry);
        assert(view.publications.length === 1 && view.publications[0].objectId === 'pub-solo', '4. it renders as exactly one encounter, exactly as before this milestone');
        assert(view.publications[0].x === 1 && view.publications[0].y === 2 && view.publications[0].z === 3, '5. its position is carried through unchanged');

        console.log('✓ Section A: existing single-Publication behavior is unchanged — a Snapshot for one Publication still registers and renders exactly as before');
    }

    // ---------------------------------------------------------------
    // Section B — FLAGSHIP: same contentHash, two DIFFERENT Publications
    // -> TWO registry entries, never one.
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        const publicationA = new Publication({ id: 'pub-a', title: 'Publication A' });
        const publicationB = new Publication({ id: 'pub-b', title: 'Publication B' });

        const resultA = registerMaterializedSnapshotWorldSource(
            registry, placedResult('hash-shared', 'pub-a', { x: 5, y: 0, z: 5 }), publicationA
        );
        const resultB = registerMaterializedSnapshotWorldSource(
            registry, placedResult('hash-shared', 'pub-b', { x: 9, y: 0, z: 9 }), publicationB
        );

        assert(resultA.outcome === SnapshotWorldRegistrationOutcome.REGISTERED && resultB.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, '1. both registrations succeed');
        assert(resultA.origin !== resultB.origin, `2. THE FLAGSHIP — different Publications sharing one contentHash derive DIFFERENT origins: '${resultA.origin}' !== '${resultB.origin}'`);
        assert(registry.listSources().length === 2, '3. the registry now holds TWO independent sources, not one');

        const view = describeWorldFromDiscoveryRegistry(registry);
        assert(view.publications.length === 2, `4. TWO registry entries produce TWO encounters, never collapsed; got ${view.publications.length}`);
        assert(view.publications.some((p) => p.objectId === 'pub-a') && view.publications.some((p) => p.objectId === 'pub-b'), '5. both Publications remain independently encounterable — neither evicts the other');

        console.log('✓ Section B: FLAGSHIP — same contentHash, two different Publications produce two registry entries, never one');
    }

    // ---------------------------------------------------------------
    // Section C — same Publication, same contentHash: repeated
    // registration remains idempotent.
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        const publication = new Publication({ id: 'pub-idempotent', title: 'Idempotent Publication' });
        const placed = placedResult('hash-idempotent', 'pub-idempotent', { x: 4, y: 4, z: 4 });

        registerMaterializedSnapshotWorldSource(registry, placed, publication);
        registerMaterializedSnapshotWorldSource(registry, placed, publication);
        registerMaterializedSnapshotWorldSource(registry, placed, publication);

        assert(registry.listSources().length === 1, '1. registering the identical Publication + contentHash three times leaves exactly ONE entry');
        const view = describeWorldFromDiscoveryRegistry(registry);
        assert(view.publications.length === 1 && view.publications[0].objectId === 'pub-idempotent', '2. exactly one logical registry entry/encounter survives');

        console.log('✓ Section C: same Publication, same contentHash — repeated registration remains idempotent, exactly as before this milestone');
    }

    // ---------------------------------------------------------------
    // Section D — same Publication, DIFFERENT contentHash: the new key
    // never accidentally collapses genuinely distinct Snapshot identities.
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        const publication = new Publication({ id: 'pub-revised', title: 'Revised Publication' });

        const firstVersion = registerMaterializedSnapshotWorldSource(
            registry, placedResult('hash-version-one', 'pub-revised', { x: 1, y: 1, z: 1 }), publication
        );
        const secondVersion = registerMaterializedSnapshotWorldSource(
            registry, placedResult('hash-version-two', 'pub-revised', { x: 2, y: 2, z: 2 }), publication
        );

        assert(firstVersion.origin !== secondVersion.origin, '1. the SAME Publication with two DIFFERENT contentHashes derives two DIFFERENT origins — publicationId alone never collapses distinct Snapshot identities');
        assert(registry.listSources().length === 2, '2. both versions occupy their own independent registry slots');

        const view = describeWorldFromDiscoveryRegistry(registry);
        assert(view.publications.length === 2, `3. two distinct Snapshot contents for the same Publication produce TWO encounters, never merged into one; got ${view.publications.length}`);
        assert(view.publications.every((p) => p.objectId === 'pub-revised'), '4. sanity — both encounters do name the same Publication id, they are simply not collapsed into one registry slot');

        console.log('✓ Section D: same Publication, different contentHash — the new key never accidentally collapses genuinely distinct Snapshot identities');
    }

    // ---------------------------------------------------------------
    // Section E — different Publications, different contentHashes: remain
    // naturally independent (sanity, unaffected by this fix).
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        const publicationX = new Publication({ id: 'pub-x', title: 'X' });
        const publicationY = new Publication({ id: 'pub-y', title: 'Y' });

        registerMaterializedSnapshotWorldSource(registry, placedResult('hash-x', 'pub-x', { x: -1, y: 0, z: 0 }), publicationX);
        registerMaterializedSnapshotWorldSource(registry, placedResult('hash-y', 'pub-y', { x: 1, y: 0, z: 0 }), publicationY);

        assert(registry.listSources().length === 2, '1. two entirely unrelated Publication/contentHash pairs occupy two independent slots');
        const view = describeWorldFromDiscoveryRegistry(registry);
        assert(view.publications.length === 2, '2. both remain independently encounterable');

        console.log('✓ Section E: different Publications, different contentHashes — naturally independent, unaffected by this fix');
    }

    // ---------------------------------------------------------------
    // Section F — locator independence: changing locator/storage never
    // changes the World registration identity (0.9.162's own Section D
    // finding, preserved by this fix).
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        const publicationId = 'pub-locator';
        const contentHash = 'hash-locator';

        const referenceOne = new ContentReference({ hash: contentHash, uri: 'ipfs://locator-one' });
        const referenceTwo = new ContentReference({ hash: contentHash, uri: 'ar://locator-two' });
        assert(referenceOne.uri !== referenceTwo.uri, '1. sanity — the two locators genuinely differ');

        const publicationViaLocatorOne = new Publication({ id: publicationId, title: 'Locator Test', contentReference: referenceOne });
        const publicationViaLocatorTwo = new Publication({ id: publicationId, title: 'Locator Test', contentReference: referenceTwo });

        const firstRegistration = registerMaterializedSnapshotWorldSource(
            registry, placedResult(contentHash, publicationId, { x: 6, y: 0, z: 6 }), publicationViaLocatorOne
        );
        const secondRegistration = registerMaterializedSnapshotWorldSource(
            registry, placedResult(contentHash, publicationId, { x: 6, y: 0, z: 6 }), publicationViaLocatorTwo
        );

        assert(firstRegistration.origin === secondRegistration.origin, '2. changing only the locator/storage never changes the derived origin — the locator plays no part in it, exactly as before this milestone');
        assert(registry.listSources().length === 1, '3. re-registering under a changed locator is a harmless, idempotent replacement, not a second entry');

        console.log('✓ Section F: locator independence — changing locator/storage never changes the World registration identity');
    }

    // ---------------------------------------------------------------
    // Section G — position independence: the origin fix never affects the
    // authoritative Publication -> WorldPlacement -> position chain.
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        const publicationA = new Publication({ id: 'pub-pos-a', title: 'Position A' });
        const publicationB = new Publication({ id: 'pub-pos-b', title: 'Position B' });

        const positionA = { x: 10, y: 20, z: 30 };
        const positionB = { x: -10, y: -20, z: -30 };

        registerMaterializedSnapshotWorldSource(registry, placedResult('hash-pos-shared', 'pub-pos-a', positionA), publicationA);
        registerMaterializedSnapshotWorldSource(registry, placedResult('hash-pos-shared', 'pub-pos-b', positionB), publicationB);

        const view = describeWorldFromDiscoveryRegistry(registry);
        const encounterA = view.publications.find((p) => p.objectId === 'pub-pos-a');
        const encounterB = view.publications.find((p) => p.objectId === 'pub-pos-b');

        assert(encounterA.x === 10 && encounterA.y === 20 && encounterA.z === 30, '1. Publication A\'s own placement position is carried through exactly, unaffected by sharing a contentHash with another Publication');
        assert(encounterB.x === -10 && encounterB.y === -20 && encounterB.z === -30, '2. Publication B\'s own placement position is likewise carried through exactly, unaffected by A\'s presence');

        console.log('✓ Section G: position independence — the origin fix does not affect the authoritative Publication -> WorldPlacement -> position chain');
    }

    // ---------------------------------------------------------------
    // Section H — rendering regression: both Publications reach the SAME,
    // entirely unmodified rendering machinery.
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        const publicationA = new Publication({ id: 'pub-render-a', title: 'Render A' });
        const publicationB = new Publication({ id: 'pub-render-b', title: 'Render B' });

        registerMaterializedSnapshotWorldSource(registry, placedResult('hash-render-shared', 'pub-render-a', { x: 3, y: 0, z: 3 }), publicationA);
        registerMaterializedSnapshotWorldSource(registry, placedResult('hash-render-shared', 'pub-render-b', { x: -3, y: 0, z: -3 }), publicationB);

        const canvas = buildCanvasInstance({ registry });
        mountCanvas(canvas);
        const projected = projectedPublicationsOf(canvas);

        assert(projected.length === 2, '1. both Publications, sharing one contentHash, render as TWO distinct markers through the same mounted canvas');
        const markerA = projected.find((p) => p.objectId === 'pub-render-a');
        const markerB = projected.find((p) => p.objectId === 'pub-render-b');
        assert(markerA && markerB, '2. each marker is present, named by its own Publication id');
        assert(markerA.label === 'Render A' && markerB.label === 'Render B', '3. each marker carries its own Publication\'s own title, never the other\'s');

        unmountCanvas(canvas);
        console.log('✓ Section H: rendering regression — both Publications reach the same, entirely unmodified rendering machinery, each with its own Publication id and position');
    }

    // ---------------------------------------------------------------
    // Section I — structural sweep: the fix touches only
    // materializedSnapshotWorldOrigin()'s own derivation.
    // ---------------------------------------------------------------
    {
        const { readFile } = await import('node:fs/promises');
        const bridgeSource = await readFile(new URL('../application/MaterializedSnapshotWorldDiscoveryBridge.js', import.meta.url), 'utf8');
        const codeOnly = bridgeSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(!/dedup|reconcil|merge|trust|ranking/i.test(codeOnly), '1. no deduplication/reconciliation/merging/trust/ranking vocabulary was introduced into the bridge\'s own executable code');

        for (const relativePath of ['../core/WorldDiscoverySourceAssembly.js', '../application/WorldDiscoverySourceRegistry.js', '../core/WorldEncounter.js']) {
            const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
            const untouchedCodeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
            assert(!/snapshot:/.test(untouchedCodeOnly), `2. ${relativePath} contains no Snapshot-specific origin vocabulary of its own — the fix lives entirely inside the bridge (failed for ${relativePath})`);
        }

        assert(materializedSnapshotWorldOrigin('h', 'p') === 'snapshot:h:p', '3. materializedSnapshotWorldOrigin() derives exactly the documented scheme');
        assert(materializedSnapshotWorldOrigin('h', 'p') === materializedSnapshotWorldOrigin('h', 'p'), '4. the derivation is a pure function — the same pair always derives the same origin');

        // unregisterMaterializedSnapshotWorldSource() is the symmetric undo,
        // now requiring the same pair its own registration used.
        const registry = new WorldDiscoverySourceRegistry();
        const publicationA = new Publication({ id: 'pub-a', title: 'A' });
        const publicationB = new Publication({ id: 'pub-b', title: 'B' });
        registerMaterializedSnapshotWorldSource(registry, placedResult('hash-shared', 'pub-a', { x: 0, y: 0, z: 0 }), publicationA);
        registerMaterializedSnapshotWorldSource(registry, placedResult('hash-shared', 'pub-b', { x: 1, y: 1, z: 1 }), publicationB);
        unregisterMaterializedSnapshotWorldSource(registry, 'hash-shared', 'pub-a');
        assert(registry.listSources().length === 1, '5. unregistering pub-a\'s own contentHash/publicationId pair removes exactly its own slot');
        assert(registry.listSources()[0].origin === materializedSnapshotWorldOrigin('hash-shared', 'pub-b'), '6. pub-b\'s own independent slot survives untouched');

        console.log('✓ Section I: structural sweep — this fix touches only materializedSnapshotWorldOrigin()\'s own key derivation; no deduplication, reconciliation, merging, trust/ranking, or new identity type was introduced anywhere');
    }

    console.log('\n✅ All Snapshot World Origin Collision tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
