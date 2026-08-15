import { Position } from '../core/Position.js';
import { SpatialBounds } from '../core/SpatialBounds.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
import { SpatialCell } from '../core/SpatialCell.js';
import { SpatialIndexManifest } from '../core/SpatialIndexManifest.js';
import { SpatialIndexRoot } from '../core/SpatialIndexRoot.js';
import { ContentReference } from '../core/ContentReference.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { LocalSpatialIndexStore } from '../spatial/LocalSpatialIndexStore.js';
import { SpatialIndexBuilder } from '../spatial/SpatialIndexBuilder.js';
import { DecentralizedSpatialDiscoveryProvider } from '../spatial/DecentralizedSpatialDiscoveryProvider.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalContentResolver } from '../discovery/LocalContentResolver.js';
import { MoveWorldPlacementUseCase } from '../application/MoveWorldPlacementUseCase.js';
import { RebuildSpatialIndexUseCase } from '../application/RebuildSpatialIndexUseCase.js';
import { PublishDocumentUseCase } from '../application/PublishDocumentUseCase.js';
import { DiscoverWorldAreaUseCase } from '../application/DiscoverWorldAreaUseCase.js';
import { ResolvePublicationUseCase } from '../application/ResolvePublicationUseCase.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { PublicationContentCache } from '../world/PublicationContentCache.js';
import { WorldViewStreamingSession } from '../world/WorldViewStreamingSession.js';

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------
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

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function assertThrows(fn, expectedMessage, message) {
    try {
        fn();
        assert(false, message);
    } catch (e) {
        assert(e.message.includes(expectedMessage), `${message}: ${e.message}`);
    }
}

function buildStack(cellSize = 100) {
    const storage = new InMemoryStorageProvider();
    const spatialIndexProvider = new LocalSpatialIndexProvider(storage);
    const placementRegistry = new LocalPlacementRegistry(storage, spatialIndexProvider);
    const spatialIndexStore = new LocalSpatialIndexStore(storage);
    const builder = new SpatialIndexBuilder(spatialIndexStore, { cellSize });
    const provider = new DecentralizedSpatialDiscoveryProvider({
        spatialIndexStore,
        placementRegistry
    });
    return { storage, spatialIndexProvider, placementRegistry, spatialIndexStore, builder, provider };
}

// Non-negative unit bounds keep every fixture placement inside
// exactly one cell of a >= 1-sized grid.
function makeRecord({ placementId, publicationId, x, y = 0, z = 0, revision = 1, owner = 'alice' }) {
    const record = new PlacementRecord({
        placementId,
        publicationId,
        owner,
        position: new Position(x, y, z),
        bounds: new SpatialBounds({ min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } }),
        revision
    });
    const hash = record.computeContentHash();
    return new PlacementRecord({ ...record.toJSON(), contentHash: hash });
}

function createTestDocument(title = 'Test World') {
    const world = new World();
    const building = new Building({ creator: 'tester' });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(2, 0.5, 0) }));
    world.addBuilding(building);
    return new Document({
        world,
        metadata: new DocumentMetadata({ title, author: 'tester' })
    });
}

// ---------------------------------------------------------------------
// 1. Deterministic cell calculation
// ---------------------------------------------------------------------
{
    const a = SpatialCell.fromPosition(new Position(125, 40, -73), 100);
    assert(a.x === 1 && a.y === 0 && a.z === -1, 'cell coordinates from position');
    assert(a.key === '1/0/-1', 'cell key format');

    const b = SpatialCell.fromPosition({ x: 125, y: 40, z: -73 }, 100);
    assert(a.key === b.key, 'same position always produces the same cell');

    const negative = SpatialCell.fromPosition(new Position(-1, 0, -100), 100);
    assert(negative.x === -1 && negative.z === -1, 'floor division handles negatives');

    const boundary = SpatialCell.fromPosition(new Position(100, 0, 0), 100);
    assert(boundary.x === 1, 'boundary position belongs to the upper cell');

    const parsed = SpatialCell.fromKey('12/-4/7', 100);
    assert(parsed.key === '12/-4/7', 'key round-trips');
    assertThrows(() => SpatialCell.fromKey('1//3', 100), 'invalid cell key', 'empty coordinate rejected');

    const bounds = a.getBounds();
    assert(bounds.min.x === 100 && bounds.max.x === 200, 'cell bounds span one cell size');
    assert(bounds.min.z === -100 && bounds.max.z === 0, 'negative cell bounds correct');
    assert(a.contains(new Position(150, 50, -50)), 'contains() inside');
    assert(!a.contains(new Position(200, 50, -50)), 'contains() is half-open');
    assert(a.intersectsSphere(new Position(150, 50, -50), 10), 'sphere inside intersects');
    assert(!a.intersectsSphere(new Position(500, 500, 500), 10), 'distant sphere does not intersect');

    const single = SpatialCell.cellsForSphere(new Position(50, 50, 50), 10, 100);
    assert(single.length === 1 && single[0].key === '0/0/0', 'small sphere touches exactly one cell');
    console.log('✓ deterministic cell calculation');
}

// ---------------------------------------------------------------------
// 2. Placements distributed across cells
// ---------------------------------------------------------------------
{
    const stack = buildStack(100);
    const records = [];
    for (let i = 0; i < 100; i++) {
        records.push(makeRecord({
            placementId: `p-${i}`,
            publicationId: `pub-${i % 10}`,
            x: i * 200 + 50
        }));
    }
    const result = stack.builder.build(records);
    assert(result.recordCount === 100, 'all records built');
    assert(result.manifestCount === 100, 'one manifest per occupied cell');
    assert(stack.spatialIndexStore.getRootReference() !== null, 'root pointer published');

    for (const i of [0, 25, 50, 75]) {
        const found = stack.provider.discover(new Position(i * 200 + 50, 0, 0), 30);
        assert(found.length === 1 && found[0].placementId === `p-${i}`, `placement ${i} discoverable in its cell`);
    }

    const rebuild = stack.builder.build(records);
    assert(rebuild.rootReference.hash === result.rootReference.hash, 'idempotent rebuild reproduces the identical root');
    console.log('✓ placements distributed across cells');
}

// ---------------------------------------------------------------------
// 3. Viewport queries only relevant cells
// ---------------------------------------------------------------------
{
    const stack = buildStack(100);
    const records = [];
    for (let i = 0; i < 1000; i++) {
        records.push(makeRecord({ placementId: `p-${i}`, publicationId: 'pub-x', x: i * 1000 }));
    }
    stack.builder.build(records);

    const found = stack.provider.discover(new Position(500 * 1000, 0, 0), 20);
    assert(found.length === 1 && found[0].placementId === 'p-500', 'needle found among 1000 cells');

    const stats = stack.provider.lastQueryStats;
    assert(stats.manifestsRetrieved === 1, 'exactly ONE manifest retrieved');
    assert(stats.cellsConsidered === 1, 'only the occupied query cell considered');
    console.log('✓ viewport queries only relevant cells');
}

// ---------------------------------------------------------------------
// 4. Placement resolution: manifest -> reference -> PlacementRecord
// ---------------------------------------------------------------------
{
    const stack = buildStack();
    const record = makeRecord({ placementId: 'p-res', publicationId: 'pub-res', x: 50, z: 50 });
    stack.placementRegistry.add(record);
    stack.builder.build(stack.placementRegistry.list());

    const found = stack.provider.discover(new Position(50, 0, 50), 60);
    assert(found.length === 1, 'one record resolved');
    assert(found[0] instanceof PlacementRecord, 'resolves to a PlacementRecord');
    assert(found[0].placementId === 'p-res', 'placementId resolved');
    assert(found[0].publicationId === 'pub-res', 'publicationId resolved');
    assert(found[0].owner === 'alice', 'owner resolved');
    assert(found[0].verifyIntegrity() === true, 'resolved record passes integrity');
    console.log('✓ placement resolution chain');
}

// ---------------------------------------------------------------------
// 5. Stale index tolerance — newer revision wins, both directions
// ---------------------------------------------------------------------
{
    // 5a: index points at revision 4, registry holds revision 5.
    const stack = buildStack();
    const original = makeRecord({ placementId: 'p-stale', publicationId: 'pub-s', x: 10, z: 10, revision: 4 });
    stack.placementRegistry.add(original);
    stack.builder.build(stack.placementRegistry.list());

    const moved = stack.placementRegistry.get('p-stale').withPosition(new Position(20, 0, 10));
    stack.placementRegistry.update(moved); // registry now revision 5, index still says 4

    const found = stack.provider.discover(new Position(20, 0, 10), 60);
    assert(found.length === 1, 'stale entry still resolves');
    assert(found[0].revision === 5, 'newer registry revision wins over stale index');

    // 5b: index holds revision 2 (from another replica), registry only revision 1.
    const stack2 = buildStack();
    const regRecord = makeRecord({ placementId: 'p-b', publicationId: 'pub-b', x: 30, z: 30, revision: 1 });
    stack2.placementRegistry.add(regRecord);
    const newer = makeRecord({ placementId: 'p-b', publicationId: 'pub-b', x: 30, z: 30, revision: 2 });
    stack2.builder.build([newer]);

    const found2 = stack2.provider.discover(new Position(30, 0, 30), 60);
    assert(found2.length === 1 && found2[0].revision === 2, 'newer stored revision wins over older registry');
    console.log('✓ stale index tolerance (newer revision wins)');
}

// ---------------------------------------------------------------------
// 6. Immutable placement revisions
// ---------------------------------------------------------------------
{
    const stack = buildStack();
    const record = makeRecord({ placementId: 'p-imm', publicationId: 'pub-i', x: 50, z: 50, revision: 1 });
    stack.placementRegistry.add(record);
    stack.builder.build(stack.placementRegistry.list());

    const readCellManifest = (cellKey) => {
        const root = SpatialIndexRoot.fromJSON(stack.spatialIndexStore.get(stack.spatialIndexStore.getRootReference()));
        const ref = ContentReference.fromJSON(root.getManifestReference(cellKey));
        return { root, ref, manifest: SpatialIndexManifest.fromJSON(stack.spatialIndexStore.get(ref)) };
    };

    const before = readCellManifest('0/0/0');
    const rev1Entry = before.manifest.placements.find((p) => p.placementId === 'p-imm');
    assert(rev1Entry.revision === 1, 'index references revision 1');
    const rev1Reference = ContentReference.fromJSON(rev1Entry.recordReference);
    const rev1Content = JSON.stringify(stack.spatialIndexStore.get(rev1Reference));

    // Move -> revision 2 -> rebuild.
    const moved = stack.placementRegistry.get('p-imm').withPosition(new Position(60, 0, 50));
    stack.placementRegistry.update(moved);
    stack.builder.build(stack.placementRegistry.list());

    const after = readCellManifest('0/0/0');
    const rev2Entry = after.manifest.placements.find((p) => p.placementId === 'p-imm');
    assert(rev2Entry.revision === 2, 'index now references revision 2');
    const rev2Reference = ContentReference.fromJSON(rev2Entry.recordReference);

    assert(rev2Reference.hash !== rev1Reference.hash, 'revision 2 has its own content identity');
    assert(JSON.stringify(stack.spatialIndexStore.get(rev1Reference)) === rev1Content,
        'revision 1 content was never mutated');
    console.log('✓ immutable placement revisions');
}

// ---------------------------------------------------------------------
// 7. Moving between cells (incremental revision publishing)
// ---------------------------------------------------------------------
{
    const stack = buildStack(100);
    const record = makeRecord({ placementId: 'p-move', publicationId: 'pub-m', x: 50, z: 50, revision: 1 });
    stack.placementRegistry.add(record);
    stack.builder.build(stack.placementRegistry.list());

    const moveUseCase = new MoveWorldPlacementUseCase(
        stack.spatialIndexProvider,
        stack.placementRegistry,
        stack.builder
    );
    moveUseCase.execute('p-move', new Position(550, 0, 550)); // cell 0/0/0 -> cell 5/0/5

    assert(stack.placementRegistry.get('p-move').revision === 2, 'registry revision incremented');

    const root = SpatialIndexRoot.fromJSON(stack.spatialIndexStore.get(stack.spatialIndexStore.getRootReference()));
    const oldManifest = SpatialIndexManifest.fromJSON(
        stack.spatialIndexStore.get(ContentReference.fromJSON(root.getManifestReference('0/0/0'))));
    const newManifest = SpatialIndexManifest.fromJSON(
        stack.spatialIndexStore.get(ContentReference.fromJSON(root.getManifestReference('5/0/5'))));

    const oldEntry = oldManifest.placements.find((p) => p.placementId === 'p-move');
    const newEntry = newManifest.placements.find((p) => p.placementId === 'p-move');
    assert(oldEntry.revision === 1, 'old cell keeps the revision 1 reference');
    assert(newEntry.revision === 2, 'new cell references revision 2');

    // Discovery: old area resolves to nothing (live record moved away),
    // new area discovers revision 2.
    const oldArea = stack.provider.discover(new Position(50, 0, 50), 30);
    assert(oldArea.length === 0, 'stale old-cell entry resolves away in the old area');
    const newArea = stack.provider.discover(new Position(550, 0, 550), 30);
    assert(newArea.length === 1 && newArea[0].revision === 2, 'new area discovers revision 2');
    console.log('✓ moving between cells (eventual consistency)');
}

// ---------------------------------------------------------------------
// 8. Multiple placements in the same cell
// ---------------------------------------------------------------------
{
    const stack = buildStack(1000);
    const records = [
        makeRecord({ placementId: 'p-a', publicationId: 'pub-1', x: 10, z: 10 }),
        makeRecord({ placementId: 'p-b', publicationId: 'pub-2', x: 20, z: 20 }),
        makeRecord({ placementId: 'p-c', publicationId: 'pub-3', x: 30, z: 30 })
    ];
    const result = stack.builder.build(records);
    assert(result.manifestCount === 1, 'one shared cell manifest');

    const root = SpatialIndexRoot.fromJSON(stack.spatialIndexStore.get(stack.spatialIndexStore.getRootReference()));
    const manifest = SpatialIndexManifest.fromJSON(
        stack.spatialIndexStore.get(ContentReference.fromJSON(root.getManifestReference('0/0/0'))));
    assert(manifest.placementCount === 3, 'manifest carries all three placements');

    const found = stack.provider.discover(new Position(20, 0, 20), 100);
    assert(found.length === 3, 'all same-cell placements discoverable');
    console.log('✓ multiple placements in the same cell');
}

// ---------------------------------------------------------------------
// 9. Multiple placements of the same publication + content dedup
// ---------------------------------------------------------------------
{
    const stack = buildStack();
    const publisher = new LocalPublisherProvider(stack.storage);
    const publication = new PublishDocumentUseCase(publisher, stubIdentityProvider)
        .execute({ document: createTestDocument('Castle') });

    stack.placementRegistry.add(makeRecord({ placementId: 'pl-1', publicationId: publication.id, x: 50, z: 50 }));
    stack.placementRegistry.add(makeRecord({ placementId: 'pl-2', publicationId: publication.id, x: 550, z: 50 }));
    stack.builder.build(stack.placementRegistry.list());

    const placements = [
        ...stack.provider.discover(new Position(50, 0, 50), 40),
        ...stack.provider.discover(new Position(550, 0, 50), 40)
    ];
    assert(placements.length === 2, 'two placements discovered');
    assert(placements[0].publicationId === placements[1].publicationId, 'both reference the same publication');

    // Resolution deduplicates through the 0.2.12 content cache.
    let resolveCalls = 0;
    const innerResolver = new LocalContentResolver(publisher);
    const countingResolver = {
        resolve: (id) => { resolveCalls += 1; return innerResolver.resolve(id); },
        verify: (id, hash) => innerResolver.verify(id, hash)
    };
    const cache = new PublicationContentCache();
    const resolveUseCase = new ResolvePublicationUseCase(
        countingResolver,
        new LocalDiscoveryProvider(stack.storage),
        new DocumentSerializer(),
        cache
    );

    const session1 = resolveUseCase.executeFromPlacement(placements[0]);
    const session2 = resolveUseCase.executeFromPlacement(placements[1]);
    assert(resolveCalls === 1, 'publication content resolved exactly once');
    assert(session1.getPublication().id === session2.getPublication().id, 'both instances share the publication');
    console.log('✓ multiple placements of one publication (content dedup intact)');
}

// ---------------------------------------------------------------------
// 10. Tampered spatial manifest rejected; tampered root rejected hard
// ---------------------------------------------------------------------
{
    const stack = buildStack();
    stack.placementRegistry.add(makeRecord({ placementId: 'p-a', publicationId: 'pub-a', x: 10, z: 10 }));
    stack.placementRegistry.add(makeRecord({ placementId: 'p-b', publicationId: 'pub-b', x: 150, z: 10 }));
    stack.builder.build(stack.placementRegistry.list());

    const root = SpatialIndexRoot.fromJSON(stack.spatialIndexStore.get(stack.spatialIndexStore.getRootReference()));
    const refA = ContentReference.fromJSON(root.getManifestReference('0/0/0'));
    const manifestKey = 'spatial-index-content:' + refA.hash;
    const tampered = stack.storage.load(manifestKey);
    tampered.placements[0].revision = 999;
    stack.storage.save(manifestKey, tampered);

    const nearA = stack.provider.discover(new Position(10, 0, 10), 30);
    assert(nearA.length === 0, 'tampered cell yields nothing');
    assert(stack.provider.lastQueryStats.manifestsRejected >= 1, 'rejection recorded in stats');

    const nearB = stack.provider.discover(new Position(150, 0, 10), 30);
    assert(nearB.length === 1 && nearB[0].placementId === 'p-b', 'untouched cell unaffected');

    // Tampered root is a systemic integrity failure -> hard reject.
    const rootRef = stack.spatialIndexStore.getRootReference();
    const rootContentKey = 'spatial-index-content:' + rootRef.hash;
    const tamperedRoot = stack.storage.load(rootContentKey);
    tamperedRoot.cellSize = 999;
    stack.storage.save(rootContentKey, tamperedRoot);
    assertThrows(
        () => stack.provider.discover(new Position(10, 0, 10), 30),
        'integrity',
        'tampered root is rejected outright'
    );
    console.log('✓ tampered manifest rejected, tampered root rejected hard');
}

// ---------------------------------------------------------------------
// 11. Missing cell manifest does not destroy other cells
// ---------------------------------------------------------------------
{
    const stack = buildStack();
    stack.placementRegistry.add(makeRecord({ placementId: 'p-a', publicationId: 'pub-a', x: 10, z: 10 }));
    stack.placementRegistry.add(makeRecord({ placementId: 'p-b', publicationId: 'pub-b', x: 150, z: 10 }));
    stack.builder.build(stack.placementRegistry.list());

    const root = SpatialIndexRoot.fromJSON(stack.spatialIndexStore.get(stack.spatialIndexStore.getRootReference()));
    const refB = ContentReference.fromJSON(root.getManifestReference('1/0/0'));
    stack.storage.remove('spatial-index-content:' + refB.hash); // manifest becomes unavailable

    const found = stack.provider.discover(new Position(80, 0, 10), 120); // covers both cells
    assert(found.length === 1 && found[0].placementId === 'p-a', 'available cell still discovered');
    assert(stack.provider.lastQueryStats.manifestsRejected === 1, 'missing manifest counted, not fatal');
    console.log('✓ missing cell manifest isolated');
}

// ---------------------------------------------------------------------
// 12. FLAGSHIP: publish -> place -> revision -> build index -> publish
//     manifest -> viewport query -> discover -> resolve -> stream
// ---------------------------------------------------------------------
{
    const stack = buildStack(100);
    const publisher = new LocalPublisherProvider(stack.storage);
    const discoveryProvider = new LocalDiscoveryProvider(stack.storage);
    const publishUseCase = new PublishDocumentUseCase(publisher, stubIdentityProvider);

    // Publish two worlds.
    const castlePub = publishUseCase.execute({ document: createTestDocument('Castle') });
    const villagePub = publishUseCase.execute({ document: createTestDocument('Village') });

    // Place them three cells apart.
    stack.placementRegistry.add(makeRecord({ placementId: 'castle-placement', publicationId: castlePub.id, x: 50, z: 50 }));
    stack.placementRegistry.add(makeRecord({ placementId: 'village-placement', publicationId: villagePub.id, x: 350, z: 50 }));

    // Create a placement revision: move the castle within its cell.
    const moveUseCase = new MoveWorldPlacementUseCase(
        stack.spatialIndexProvider, stack.placementRegistry, stack.builder);
    moveUseCase.execute('castle-placement', new Position(60, 0, 50));
    assert(stack.placementRegistry.get('castle-placement').revision === 2, 'placement revision created');

    // Build + publish the spatial index.
    const rebuild = new RebuildSpatialIndexUseCase(stack.builder, stack.placementRegistry);
    const built = rebuild.execute();
    assert(built.rootReference !== null, 'index manifest published');
    assert(built.manifestCount === 2, 'one manifest per occupied cell');

    // World View queries the viewport — through the unchanged
    // DiscoverWorldAreaUseCase over the DECENTRALIZED provider.
    const discoverArea = new DiscoverWorldAreaUseCase(stack.provider);
    const found = discoverArea.execute(new Position(60, 0, 50), 120);
    assert(found.length === 1, 'viewport discovers exactly the nearby placement');
    assert(found[0].publicationId === castlePub.id, 'the castle placement');
    assert(found[0].revision === 2, 'the latest revision');

    // Resolve the publication — ContentResolver, unchanged from 0.2.11.
    const cache = new PublicationContentCache();
    const resolveUseCase = new ResolvePublicationUseCase(
        new LocalContentResolver(publisher),
        discoveryProvider,
        new DocumentSerializer(),
        cache
    );
    const session = resolveUseCase.executeFromPlacement(found[0]);
    assert(session.capabilities.canEdit === false, 'resolved session is read-only');
    assert(session.getDocument().metadata.title === 'Castle', 'snapshot loaded and deserialized');

    // Streaming runtime integration — unchanged from 0.2.12.
    const streaming = new WorldViewStreamingSession({
        discoverWorldAreaUseCase: discoverArea,
        resolvePublicationUseCase: resolveUseCase,
        loadRadius: 200,
        unloadRadius: 300
    });
    streaming.updateView(new Position(60, 0, 50));
    const loadedAtCastle = streaming.getLoadedWorlds();
    assert(loadedAtCastle.length === 1 && loadedAtCastle[0].publicationId === castlePub.id,
        'streaming loads the castle at the origin viewport');

    streaming.updateView(new Position(360, 0, 50));
    const loadedAtVillage = streaming.getLoadedWorlds();
    assert(loadedAtVillage.length === 1 && loadedAtVillage[0].publicationId === villagePub.id,
        'moving loads the village');
    assert(streaming.getRuntimeWorlds().length === 2,
        'castle retained as metadata within the unload radius (hysteresis)');

    console.log('✓ FLAGSHIP: publish -> place -> revise -> index -> discover -> resolve -> stream');
}

console.log('\nAll decentralized spatial discovery tests passed.');
