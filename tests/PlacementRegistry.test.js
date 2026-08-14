import { Brick } from '../core/Brick.js';
import { Building } from '../core/Building.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { Position } from '../core/Position.js';
import { World } from '../core/World.js';
import { WorldPlacement } from '../core/WorldPlacement.js';
import { SpatialBounds } from '../core/SpatialBounds.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { PublishDocumentUseCase } from '../application/PublishDocumentUseCase.js';
import { PlacePublicationUseCase } from '../application/PlacePublicationUseCase.js';
import { MoveWorldPlacementUseCase } from '../application/MoveWorldPlacementUseCase.js';
import { RemoveWorldPlacementUseCase } from '../application/RemoveWorldPlacementUseCase.js';
import { DiscoverPlacementsUseCase } from '../application/DiscoverPlacementsUseCase.js';
import { DiscoverWorldsUseCase } from '../application/DiscoverWorldsUseCase.js';
import { LoadPublicationDocumentUseCase } from '../application/LoadPublicationDocumentUseCase.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { DocumentManager } from '../application/DocumentManager.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { computeContentHash } from '../serializer/contentHash.js';

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
    try { fn(); assert(false, message); }
    catch (e) { assert(e.message.includes(expectedMessage), `${message}: ${e.message}`); }
}

function createTestDocument(brickCount = 3) {
    const world = new World();
    const building = new Building({ creator: 'tester' });
    for (let i = 0; i < brickCount; i++) {
        building.addBrick(new Brick({
            definitionId: 'core:cube',
            position: new Position(i * 2, 0.5, 0)
        }));
    }
    world.addBuilding(building);
    return new Document({
        world,
        metadata: new DocumentMetadata({ title: 'Placement Test', author: 'tester' })
    });
}

// ---------------------------------------------------------------------
// 1. PlacementRecord: creation, serialization, integrity
// ---------------------------------------------------------------------
{
    const record = new PlacementRecord({
        publicationId: 'pub-123',
        owner: 'alice',
        position: new Position(100, 0, 50),
        bounds: new SpatialBounds({ min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 5, z: 10 } })
    });

    assert(record.placementId !== null, 'has a placement id');
    assert(record.publicationId === 'pub-123', 'references publication');
    assert(record.owner === 'alice', 'has an owner');
    assert(record.revision === 1, 'initial revision is 1');
    assert(record.position.x === 100, 'position set');

    // Compute and verify content hash.
    const hash = record.computeContentHash();
    assert(typeof hash === 'string' && hash.length === 8, 'content hash is 8-char hex');

    // Serialization round-trip.
    const json = record.toJSON();
    const restored = PlacementRecord.fromJSON(json);
    assert(restored.placementId === record.placementId, 'placementId round-trips');
    assert(restored.owner === 'alice', 'owner round-trips');
    assert(restored.revision === 1, 'revision round-trips');

    // Integrity verification.
    const recordWithHash = new PlacementRecord({
        ...record.toJSON(),
        contentHash: hash
    });
    assert(recordWithHash.verifyIntegrity() === true, 'integrity verified');

    // Tamper detection.
    const tampered = new PlacementRecord({
        ...record.toJSON(),
        contentHash: hash,
        position: new Position(999, 0, 0) // tampered position
    });
    assert(tampered.verifyIntegrity() === false, 'tampered record fails integrity');

    console.log('✓ PlacementRecord: creation, serialization, integrity');
}

// ---------------------------------------------------------------------
// 2. PlacementRecord: revision on move
// ---------------------------------------------------------------------
{
    const record = new PlacementRecord({
        publicationId: 'pub-123',
        owner: 'alice',
        position: new Position(100, 0, 50)
    });

    const moved = record.withPosition(new Position(200, 0, 50));
    assert(moved.placementId === record.placementId, 'same placement id');
    assert(moved.publicationId === record.publicationId, 'same publication');
    assert(moved.owner === record.owner, 'same owner');
    assert(moved.revision === 2, 'revision incremented');
    assert(moved.position.x === 200, 'position updated');
    assert(record.position.x === 100, 'original unchanged');

    console.log('✓ PlacementRecord: revision on move');
}

// ---------------------------------------------------------------------
// 3. LocalPlacementRegistry: add, get, list, remove
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const spatialIndex = new LocalSpatialIndexProvider(storage);
    const registry = new LocalPlacementRegistry(storage, spatialIndex);

    const record = new PlacementRecord({
        publicationId: 'pub-1',
        owner: 'alice',
        position: new Position(0, 0, 0),
        bounds: new SpatialBounds({ min: { x: -5, y: 0, z: -5 }, max: { x: 5, y: 10, z: 5 } })
    });

    const added = registry.add(record);
    assert(added.contentHash !== null, 'content hash computed on add');
    assert(registry.list().length === 1, 'registry contains one record');

    const retrieved = registry.get(record.placementId);
    assert(retrieved !== null, 'record retrieved');
    assert(retrieved.publicationId === 'pub-1', 'correct publication');
    assert(retrieved.owner === 'alice', 'correct owner');

    // Verify integrity.
    assert(registry.verifyIntegrity(record.placementId) === true, 'integrity verified');

    // Remove.
    registry.remove(record.placementId);
    assert(registry.list().length === 0, 'registry empty after remove');
    assert(registry.get(record.placementId) === null, 'record gone after remove');

    console.log('✓ LocalPlacementRegistry: add, get, list, remove');
}

// ---------------------------------------------------------------------
// 4. LocalPlacementRegistry: spatial index integration
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const spatialIndex = new LocalSpatialIndexProvider(storage);
    const registry = new LocalPlacementRegistry(storage, spatialIndex);

    const record = new PlacementRecord({
        publicationId: 'pub-1',
        owner: 'alice',
        position: new Position(0, 0, 0),
        bounds: new SpatialBounds({ min: { x: -5, y: 0, z: -5 }, max: { x: 5, y: 10, z: 5 } })
    });

    registry.add(record);

    // The SpatialIndexProvider should also have the placement.
    assert(spatialIndex.list().length === 1, 'spatial index has the placement');

    // Spatial discovery should work.
    const discovered = spatialIndex.discover(new Position(0, 0, 0), 50);
    assert(discovered.length === 1, 'spatial discovery finds the placement');

    // Registry discovery should also work.
    const registryDiscovered = registry.discover(new Position(0, 0, 0), 50);
    assert(registryDiscovered.length === 1, 'registry discovery finds the placement');

    console.log('✓ LocalPlacementRegistry: spatial index integration');
}

// ---------------------------------------------------------------------
// 5. LocalPlacementRegistry: update creates new revision
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const spatialIndex = new LocalSpatialIndexProvider(storage);
    const registry = new LocalPlacementRegistry(storage, spatialIndex);

    const record = new PlacementRecord({
        publicationId: 'pub-1',
        owner: 'alice',
        position: new Position(0, 0, 0)
    });

    registry.add(record);
    assert(registry.get(record.placementId).revision === 1, 'initial revision');

    const moved = registry.get(record.placementId).withPosition(new Position(100, 0, 0));
    registry.update(moved);

    const updated = registry.get(record.placementId);
    assert(updated.revision === 2, 'revision incremented');
    assert(updated.position.x === 100, 'position updated');
    assert(updated.contentHash !== null, 'new content hash computed');
    assert(registry.verifyIntegrity(record.placementId) === true, 'integrity verified after update');

    console.log('✓ LocalPlacementRegistry: update creates new revision');
}

// ---------------------------------------------------------------------
// 6. LocalPlacementRegistry: findByPublicationId, findByOwner
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const spatialIndex = new LocalSpatialIndexProvider(storage);
    const registry = new LocalPlacementRegistry(storage, spatialIndex);

    // Alice places pub-1 in two locations.
    registry.add(new PlacementRecord({
        publicationId: 'pub-1', owner: 'alice',
        position: new Position(0, 0, 0)
    }));
    registry.add(new PlacementRecord({
        publicationId: 'pub-1', owner: 'alice',
        position: new Position(100, 0, 0)
    }));

    // Bob places pub-2.
    registry.add(new PlacementRecord({
        publicationId: 'pub-2', owner: 'bob',
        position: new Position(200, 0, 0)
    }));

    assert(registry.findByPublicationId('pub-1').length === 2, 'two placements for pub-1');
    assert(registry.findByPublicationId('pub-2').length === 1, 'one placement for pub-2');
    assert(registry.findByOwner('alice').length === 2, 'two placements by alice');
    assert(registry.findByOwner('bob').length === 1, 'one placement by bob');

    console.log('✓ LocalPlacementRegistry: findByPublicationId, findByOwner');
}

// ---------------------------------------------------------------------
// 7. PlacePublicationUseCase: creates PlacementRecord with owner
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const serializer = new DocumentSerializer();
    const publisher = new LocalPublisherProvider(storage);
    const discovery = new LocalDiscoveryProvider(storage);
    const spatialIndex = new LocalSpatialIndexProvider(storage);
    const placementRegistry = new LocalPlacementRegistry(storage, spatialIndex);
    const loadDoc = new LoadPublicationDocumentUseCase(storage);
    const brickRegistry = new CreateBrickRegistryUseCase().execute();

    // Publish a document.
    const doc = createTestDocument();
    const manager = new DocumentManager();
    manager.load(doc, 'test-doc');
    const publication = new PublishDocumentUseCase(publisher, stubIdentityProvider).execute(manager);

    // Place it.
    const placeUseCase = new PlacePublicationUseCase(
        spatialIndex, discovery, loadDoc, brickRegistry,
        placementRegistry, stubIdentityProvider
    );
    const placement = placeUseCase.execute(publication.id, new Position(100, 0, 50));

    // Verify WorldPlacement was created.
    assert(placement.publicationId === publication.id, 'WorldPlacement references publication');
    assert(spatialIndex.list().length === 1, 'spatial index has the placement');

    // Verify PlacementRecord was created.
    const records = placementRegistry.findByPublicationId(publication.id);
    assert(records.length === 1, 'PlacementRecord created');
    assert(records[0].owner === 'alice', 'PlacementRecord has owner from identity provider');
    assert(records[0].revision === 1, 'initial revision');
    assert(records[0].contentHash !== null, 'content hash computed');
    assert(records[0].position.x === 100, 'position set');

    console.log('✓ PlacePublicationUseCase: creates PlacementRecord with owner');
}

// ---------------------------------------------------------------------
// 8. MoveWorldPlacementUseCase: creates new revision
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const serializer = new DocumentSerializer();
    const publisher = new LocalPublisherProvider(storage);
    const discovery = new LocalDiscoveryProvider(storage);
    const spatialIndex = new LocalSpatialIndexProvider(storage);
    const placementRegistry = new LocalPlacementRegistry(storage, spatialIndex);
    const loadDoc = new LoadPublicationDocumentUseCase(storage);
    const brickRegistry = new CreateBrickRegistryUseCase().execute();

    // Publish and place.
    const doc = createTestDocument();
    const manager = new DocumentManager();
    manager.load(doc, 'test-doc');
    const publication = new PublishDocumentUseCase(publisher, stubIdentityProvider).execute(manager);

    const placeUseCase = new PlacePublicationUseCase(
        spatialIndex, discovery, loadDoc, brickRegistry,
        placementRegistry, stubIdentityProvider
    );
    const placement = placeUseCase.execute(publication.id, new Position(100, 0, 50));

    // Move it.
    const moveUseCase = new MoveWorldPlacementUseCase(spatialIndex, placementRegistry);
    moveUseCase.execute(placement.id, new Position(500, 0, -200));

    // Verify WorldPlacement was moved.
    const movedPlacement = spatialIndex.get(placement.id);
    assert(movedPlacement.position.x === 500, 'WorldPlacement moved');

    // Verify PlacementRecord revision incremented.
    const record = placementRegistry.get(placement.id);
    assert(record.revision === 2, 'revision incremented');
    assert(record.position.x === 500, 'PlacementRecord position updated');
    assert(record.owner === 'alice', 'owner unchanged');
    assert(record.publicationId === publication.id, 'publication unchanged');
    assert(placementRegistry.verifyIntegrity(placement.id) === true, 'integrity verified');

    console.log('✓ MoveWorldPlacementUseCase: creates new revision');
}

// ---------------------------------------------------------------------
// 9. RemoveWorldPlacementUseCase: removes from both registries
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const serializer = new DocumentSerializer();
    const publisher = new LocalPublisherProvider(storage);
    const discovery = new LocalDiscoveryProvider(storage);
    const spatialIndex = new LocalSpatialIndexProvider(storage);
    const placementRegistry = new LocalPlacementRegistry(storage, spatialIndex);
    const loadDoc = new LoadPublicationDocumentUseCase(storage);
    const brickRegistry = new CreateBrickRegistryUseCase().execute();

    // Publish and place.
    const doc = createTestDocument();
    const manager = new DocumentManager();
    manager.load(doc, 'test-doc');
    const publication = new PublishDocumentUseCase(publisher, stubIdentityProvider).execute(manager);

    const placeUseCase = new PlacePublicationUseCase(
        spatialIndex, discovery, loadDoc, brickRegistry,
        placementRegistry, stubIdentityProvider
    );
    const placement = placeUseCase.execute(publication.id, new Position(100, 0, 50));

    assert(spatialIndex.list().length === 1, 'spatial index has placement');
    assert(placementRegistry.list().length === 1, 'registry has record');

    // Remove.
    const removeUseCase = new RemoveWorldPlacementUseCase(spatialIndex, placementRegistry);
    removeUseCase.execute(placement.id);

    assert(spatialIndex.list().length === 0, 'spatial index empty');
    assert(placementRegistry.list().length === 0, 'registry empty');

    // Publication still exists.
    const pubAfter = discovery.findById(publication.id);
    assert(pubAfter !== null, 'publication still exists after placement removal');

    console.log('✓ RemoveWorldPlacementUseCase: removes from both registries');
}

// ---------------------------------------------------------------------
// 10. DiscoverPlacementsUseCase: richer queries
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const spatialIndex = new LocalSpatialIndexProvider(storage);
    const placementRegistry = new LocalPlacementRegistry(storage, spatialIndex);
    const discoverUseCase = new DiscoverPlacementsUseCase(placementRegistry);

    // Add some placements.
    placementRegistry.add(new PlacementRecord({
        publicationId: 'pub-1', owner: 'alice',
        position: new Position(0, 0, 0)
    }));
    placementRegistry.add(new PlacementRecord({
        publicationId: 'pub-1', owner: 'alice',
        position: new Position(100, 0, 0)
    }));
    placementRegistry.add(new PlacementRecord({
        publicationId: 'pub-2', owner: 'bob',
        position: new Position(200, 0, 0)
    }));

    // Spatial discovery.
    const nearby = discoverUseCase.execute(new Position(0, 0, 0), 150);
    assert(nearby.length === 2, 'spatial discovery finds two placements');

    // By publication.
    const pub1Placements = discoverUseCase.findByPublicationId('pub-1');
    assert(pub1Placements.length === 2, 'two placements for pub-1');

    // By owner.
    const alicePlacements = discoverUseCase.findByOwner('alice');
    assert(alicePlacements.length === 2, 'two placements by alice');

    // Integrity.
    const allRecords = discoverUseCase.list();
    for (const record of allRecords) {
        assert(discoverUseCase.verifyIntegrity(record.placementId) === true,
            `integrity verified for ${record.placementId}`);
    }

    console.log('✓ DiscoverPlacementsUseCase: richer queries');
}

// ---------------------------------------------------------------------
// 11. FLAGSHIP: publish → place → move → verify → remove → verify
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const serializer = new DocumentSerializer();
    const publisher = new LocalPublisherProvider(storage);
    const discovery = new LocalDiscoveryProvider(storage);
    const spatialIndex = new LocalSpatialIndexProvider(storage);
    const placementRegistry = new LocalPlacementRegistry(storage, spatialIndex);
    const loadDoc = new LoadPublicationDocumentUseCase(storage);
    const brickRegistry = new CreateBrickRegistryUseCase().execute();

    // 1. Publish.
    const doc = createTestDocument(5);
    const manager = new DocumentManager();
    manager.load(doc, 'flagship-doc');
    const publication = new PublishDocumentUseCase(publisher, stubIdentityProvider).execute(manager);
    const originalHash = publication.contentHash;
    const originalDocJson = JSON.stringify(serializer.serialize(doc));

    // 2. Place at virtual coordinates (100, 0, 50).
    const placeUseCase = new PlacePublicationUseCase(
        spatialIndex, discovery, loadDoc, brickRegistry,
        placementRegistry, stubIdentityProvider
    );
    const placement = placeUseCase.execute(publication.id, new Position(100, 0, 50));

    // 3. Verify PlacementRecord created with owner.
    const record = placementRegistry.get(placement.id);
    assert(record !== null, 'PlacementRecord exists');
    assert(record.owner === 'alice', 'owner is alice');
    assert(record.revision === 1, 'initial revision');
    assert(record.contentHash !== null, 'content hash present');
    assert(record.position.x === 100, 'virtual position set');
    assert(record.position.y === 0, 'virtual position y');
    assert(record.position.z === 50, 'virtual position z');

    // 4. Verify Publication unchanged.
    const pubAfterPlace = discovery.findById(publication.id);
    assert(pubAfterPlace.contentHash === originalHash, 'publication hash unchanged after place');

    // 5. Verify Document unchanged.
    const loadedDoc = loadDoc.execute(publication.id);
    assert(JSON.stringify(serializer.serialize(loadedDoc)) === originalDocJson,
        'document unchanged after place');

    // 6. Move placement to (500, 0, -200).
    const moveUseCase = new MoveWorldPlacementUseCase(spatialIndex, placementRegistry);
    moveUseCase.execute(placement.id, new Position(500, 0, -200));

    // 7. Verify new revision created.
    const movedRecord = placementRegistry.get(placement.id);
    assert(movedRecord.revision === 2, 'revision incremented after move');
    assert(movedRecord.position.x === 500, 'position updated after move');
    assert(movedRecord.owner === 'alice', 'owner unchanged after move');
    assert(placementRegistry.verifyIntegrity(placement.id) === true, 'integrity verified after move');

    // 8. Verify Publication still unchanged.
    const pubAfterMove = discovery.findById(publication.id);
    assert(pubAfterMove.contentHash === originalHash, 'publication hash unchanged after move');

    // 9. Verify Document still unchanged.
    const loadedDocAfterMove = loadDoc.execute(publication.id);
    assert(JSON.stringify(serializer.serialize(loadedDocAfterMove)) === originalDocJson,
        'document unchanged after move');

    // 10. Remove placement.
    const removeUseCase = new RemoveWorldPlacementUseCase(spatialIndex, placementRegistry);
    removeUseCase.execute(placement.id);

    // 11. Verify PlacementRecord removed.
    assert(placementRegistry.get(placement.id) === null, 'PlacementRecord removed');
    assert(placementRegistry.list().length === 0, 'registry empty');
    assert(spatialIndex.list().length === 0, 'spatial index empty');

    // 12. Verify Publication still exists.
    const pubAfterRemove = discovery.findById(publication.id);
    assert(pubAfterRemove !== null, 'publication still exists after placement removal');
    assert(pubAfterRemove.contentHash === originalHash, 'publication hash unchanged after removal');

    // 13. Verify Document still exists and unchanged.
    const loadedDocAfterRemove = loadDoc.execute(publication.id);
    assert(JSON.stringify(serializer.serialize(loadedDocAfterRemove)) === originalDocJson,
        'document unchanged after placement removal');

    console.log('✓ FLAGSHIP: publish → place → move → verify → remove → verify');
}

// ---------------------------------------------------------------------
// 12. Multiple placements for same publication
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const spatialIndex = new LocalSpatialIndexProvider(storage);
    const placementRegistry = new LocalPlacementRegistry(storage, spatialIndex);

    // Alice places pub-1 in three locations.
    const p1 = placementRegistry.add(new PlacementRecord({
        publicationId: 'pub-1', owner: 'alice',
        position: new Position(0, 0, 0)
    }));
    const p2 = placementRegistry.add(new PlacementRecord({
        publicationId: 'pub-1', owner: 'alice',
        position: new Position(100, 0, 0)
    }));
    const p3 = placementRegistry.add(new PlacementRecord({
        publicationId: 'pub-1', owner: 'alice',
        position: new Position(200, 0, 0)
    }));

    assert(p1.placementId !== p2.placementId, 'unique placement ids');
    assert(p1.publicationId === p2.publicationId, 'same publication');

    const byPub = placementRegistry.findByPublicationId('pub-1');
    assert(byPub.length === 3, 'three placements for pub-1');

    // All three are independently movable.
    const moveUseCase = new MoveWorldPlacementUseCase(spatialIndex, placementRegistry);
    moveUseCase.execute(p1.placementId, new Position(-100, 0, 0));

    const movedP1 = placementRegistry.get(p1.placementId);
    assert(movedP1.position.x === -100, 'p1 moved');
    assert(movedP1.revision === 2, 'p1 revision incremented');

    const p2After = placementRegistry.get(p2.placementId);
    assert(p2After.position.x === 100, 'p2 unchanged');
    assert(p2After.revision === 1, 'p2 revision unchanged');

    console.log('✓ Multiple placements for same publication');
}

// ---------------------------------------------------------------------
// 13. Virtual coordinate system (not geographic)
// ---------------------------------------------------------------------
{
    // Verify that positions are virtual, not geographic.
    // Tokyo, London, New York are NOT automatically thousands of
    // kilometers apart. They are just labels for virtual positions.
    const tokyoPos = new Position(0, 0, 0);
    const londonPos = new Position(1000, 0, 0);
    const newYorkPos = new Position(-500, 0, 300);

    // These are arbitrary virtual coordinates, not lat/long.
    assert(tokyoPos.x === 0, 'Tokyo is at virtual (0, 0, 0)');
    assert(londonPos.x === 1000, 'London is at virtual (1000, 0, 0)');
    assert(newYorkPos.x === -500, 'New York is at virtual (-500, 0, 300)');

    // The distance between them is just Euclidean distance in virtual space.
    const dx = londonPos.x - tokyoPos.x;
    const dy = londonPos.y - tokyoPos.y;
    const dz = londonPos.z - tokyoPos.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    assert(distance === 1000, 'distance is 1000 virtual units, not 9560 km');

    console.log('✓ Virtual coordinate system (not geographic)');
}

// ---------------------------------------------------------------------
// 14. Ownership hierarchy: Document ≠ Publication ≠ Placement
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const serializer = new DocumentSerializer();
    const publisher = new LocalPublisherProvider(storage);
    const discovery = new LocalDiscoveryProvider(storage);
    const spatialIndex = new LocalSpatialIndexProvider(storage);
    const placementRegistry = new LocalPlacementRegistry(storage, spatialIndex);
    const loadDoc = new LoadPublicationDocumentUseCase(storage);
    const brickRegistry = new CreateBrickRegistryUseCase().execute();

    // Alice creates and publishes.
    const doc = createTestDocument();
    const manager = new DocumentManager();
    manager.load(doc, 'test-doc');
    const publication = new PublishDocumentUseCase(publisher, stubIdentityProvider).execute(manager);

    // Bob places it (different identity provider).
    const bobIdentity = {
        currentUser: () => ({ username: 'bob', displayName: 'bob', providerId: 'stub' }),
        sign: (data) => ({ signedBy: 'bob', providerId: 'stub', data })
    };

    const placeUseCase = new PlacePublicationUseCase(
        spatialIndex, discovery, loadDoc, brickRegistry,
        placementRegistry, bobIdentity
    );
    const placement = placeUseCase.execute(publication.id, new Position(100, 0, 50));

    // Verify the three ownership layers are distinct.
    const docAuthor = doc.metadata.author;
    const pubAuthor = publication.author;
    const placementOwner = placementRegistry.get(placement.id).owner;

    assert(docAuthor === 'tester', 'Document author is tester');
    assert(pubAuthor === 'alice', 'Publication author is alice');
    assert(placementOwner === 'bob', 'Placement owner is bob');

    // All three are different.
    assert(docAuthor !== pubAuthor, 'Document author ≠ Publication author');
    assert(pubAuthor !== placementOwner, 'Publication author ≠ Placement owner');
    assert(docAuthor !== placementOwner, 'Document author ≠ Placement owner');

    console.log('✓ Ownership hierarchy: Document ≠ Publication ≠ Placement');
}

console.log('\nAll placement registry tests passed.');
