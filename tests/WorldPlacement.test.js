import { Brick } from '../core/Brick.js';
import { Building } from '../core/Building.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { Position } from '../core/Position.js';
import { World } from '../core/World.js';
import { WorldPosition } from '../core/WorldPosition.js';
import { WorldPlacement } from '../core/WorldPlacement.js';
import { SpatialBounds } from '../core/SpatialBounds.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { PlacePublicationUseCase } from '../application/PlacePublicationUseCase.js';
import { MoveWorldPlacementUseCase } from '../application/MoveWorldPlacementUseCase.js';
import { RemoveWorldPlacementUseCase } from '../application/RemoveWorldPlacementUseCase.js';
import { DiscoverWorldsUseCase } from '../application/DiscoverWorldsUseCase.js';
import { LoadPublicationDocumentUseCase } from '../application/LoadPublicationDocumentUseCase.js';
import { PublishDocumentUseCase } from '../application/PublishDocumentUseCase.js';
import { DocumentManager } from '../application/DocumentManager.js';

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
// 1. SpatialBounds calculation from World
// ---------------------------------------------------------------------
{
    const doc = createTestDocument(3); // bricks at x=0, 2, 4
    const registry = new CreateBrickRegistryUseCase().execute();
    const bounds = SpatialBounds.fromWorld(doc.world, registry);
    
    assert(bounds.min.x === -0.5, 'min x accounts for brick width');
    assert(bounds.max.x === 4.5, 'max x accounts for brick width');
    assert(bounds.min.y === 0, 'min y accounts for brick height');
    assert(bounds.max.y === 1, 'max y accounts for brick height');
    assert(bounds.center.x === 2, 'center x is correct');
    
    const global = bounds.getGlobalBounds(new Position(100, 0, 50));
    assert(global.min.x === 99.5, 'global bounds translated correctly');
    assert(global.max.z === 50.5, 'global bounds translated correctly');
    
    console.log('✓ SpatialBounds calculation from World');
}

// ---------------------------------------------------------------------
// 2. WorldPlacement serialization and immutability
// ---------------------------------------------------------------------
{
    const bounds = new SpatialBounds({ min: {x:0,y:0,z:0}, max: {x:10,y:5,z:10} });
    const placement = new WorldPlacement({
        publicationId: 'pub-123',
        position: new Position(100, 0, 50),
        bounds
    });
    
    assert(placement.id !== null, 'placement has an id');
    assert(placement.publicationId === 'pub-123', 'references publication');
    
    const moved = placement.withPosition(new Position(200, 0, 50));
    assert(moved.id === placement.id, 'withPosition preserves identity');
    assert(moved.position.x === 200, 'withPosition updates position');
    assert(placement.position.x === 100, 'original placement unchanged');
    
    const json = placement.toJSON();
    const restored = WorldPlacement.fromJSON(json);
    assert(restored.publicationId === 'pub-123', 'round-trip preserves publicationId');
    assert(restored.bounds.max.x === 10, 'round-trip preserves bounds');
    
    console.log('✓ WorldPlacement serialization and immutability');
}

// ---------------------------------------------------------------------
// 3. LocalSpatialIndexProvider: add, discover, remove
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const index = new LocalSpatialIndexProvider(storage);
    
    const p1 = new WorldPlacement({
        publicationId: 'pub-1',
        position: new Position(0, 0, 0),
        bounds: new SpatialBounds({ min: {x:-5,y:0,z:-5}, max: {x:5,y:10,z:5} })
    });
    const p2 = new WorldPlacement({
        publicationId: 'pub-2',
        position: new Position(100, 0, 0),
        bounds: new SpatialBounds({ min: {x:-5,y:0,z:-5}, max: {x:5,y:10,z:5} })
    });
    
    index.add(p1);
    index.add(p2);
    
    assert(index.list().length === 2, 'index contains both placements');
    
    // Discover near origin
    const nearOrigin = index.discover(new Position(0, 0, 0), 50);
    assert(nearOrigin.length === 1, 'discovers only p1 near origin');
    assert(nearOrigin[0].publicationId === 'pub-1', 'correct placement discovered');
    
    // Discover near p2
    const nearP2 = index.discover(new Position(100, 0, 0), 50);
    assert(nearP2.length === 1, 'discovers only p2 near p2');
    
    // Bounds-based discovery: query at (8, 0, 0) with radius 5.
    // Origin distance to p1 is 8 (outside radius 5).
    // But p1's global bounds max.x is 5. Distance from (8,0,0) to AABB is 3 (inside radius 5).
    const boundsHit = index.discover(new Position(8, 0, 0), 5);
    assert(boundsHit.length === 1, 'bounds-based discovery intersects AABB');
    assert(boundsHit[0].publicationId === 'pub-1', 'correct placement via bounds intersection');
    
    index.remove(p1.id);
    assert(index.list().length === 1, 'remove deletes placement');
    assert(index.findByPublicationId('pub-1').length === 0, 'findByPublicationId returns empty');
    
    console.log('✓ LocalSpatialIndexProvider: add, discover, remove');
}

// ---------------------------------------------------------------------
// 4. Use Cases: Place, Move, Discover, Remove
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const serializer = new DocumentSerializer();
    const publisher = new LocalPublisherProvider(storage);
    const discovery = new LocalDiscoveryProvider(storage);
    const spatialIndex = new LocalSpatialIndexProvider(storage);
    const loadDoc = new LoadPublicationDocumentUseCase(storage);
    const registry = new CreateBrickRegistryUseCase().execute();
    
    const placeUseCase = new PlacePublicationUseCase(spatialIndex, discovery, loadDoc, registry);
    const moveUseCase = new MoveWorldPlacementUseCase(spatialIndex);
    const removeUseCase = new RemoveWorldPlacementUseCase(spatialIndex);
    const discoverUseCase = new DiscoverWorldsUseCase(spatialIndex);
    
    // Publish a document
    const doc = createTestDocument();
    const manager = new DocumentManager();
    manager.load(doc, 'test-doc');
    const publication = new PublishDocumentUseCase(publisher, stubIdentityProvider).execute(manager);
    
    // Place it
    const placement = placeUseCase.execute(publication.id, new Position(50, 0, 50));
    assert(placement.publicationId === publication.id, 'placement references publication');
    assert(placement.bounds !== null, 'bounds calculated from document');
    
    // Discover it
    const found = discoverUseCase.execute(new Position(50, 0, 50), 100);
    assert(found.length === 1, 'discovery finds the placed world');
    
    // Move it
    const moved = moveUseCase.execute(placement.id, new Position(500, 0, -200));
    assert(moved.position.x === 500, 'placement moved');
    
    // Verify publication unchanged
    const pubAfterMove = discovery.findById(publication.id);
    assert(pubAfterMove.contentHash === publication.contentHash, 'publication content hash unchanged');
    
    // Discover at old location (should be empty)
    const oldLoc = discoverUseCase.execute(new Position(50, 0, 50), 100);
    assert(oldLoc.length === 0, 'not found at old location');
    
    // Discover at new location
    const newLoc = discoverUseCase.execute(new Position(500, 0, -200), 100);
    assert(newLoc.length === 1, 'found at new location');
    
    // Remove placement
    removeUseCase.execute(placement.id);
    assert(spatialIndex.list().length === 0, 'placement removed from index');
    
    // Verify publication still exists in discovery
    const pubAfterRemove = discovery.findById(publication.id);
    assert(pubAfterRemove !== null, 'publication still exists after placement removal');
    
    console.log('✓ Use Cases: Place, Move, Discover, Remove');
}

// ---------------------------------------------------------------------
// 5. Multiple placements for same publication
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const publisher = new LocalPublisherProvider(storage);
    const discovery = new LocalDiscoveryProvider(storage);
    const spatialIndex = new LocalSpatialIndexProvider(storage);
    const loadDoc = new LoadPublicationDocumentUseCase(storage);
    const registry = new CreateBrickRegistryUseCase().execute();
    
    const placeUseCase = new PlacePublicationUseCase(spatialIndex, discovery, loadDoc, registry);
    
    const doc = createTestDocument();
    const manager = new DocumentManager();
    manager.load(doc, 'test-doc');
    const publication = new PublishDocumentUseCase(publisher, stubIdentityProvider).execute(manager);
    
    const p1 = placeUseCase.execute(publication.id, new Position(0, 0, 0));
    const p2 = placeUseCase.execute(publication.id, new Position(100, 0, 0));
    const p3 = placeUseCase.execute(publication.id, new Position(200, 0, 0));
    
    assert(p1.id !== p2.id && p2.id !== p3.id, 'each placement has unique id');
    assert(p1.publicationId === p2.publicationId, 'all reference same publication');
    
    const byPub = spatialIndex.findByPublicationId(publication.id);
    assert(byPub.length === 3, 'findByPublicationId returns all placements');
    
    console.log('✓ Multiple placements for same publication');
}

// ---------------------------------------------------------------------
// 6. FLAGSHIP: publish → place → discover → move → verify unchanged
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const serializer = new DocumentSerializer();
    const publisher = new LocalPublisherProvider(storage);
    const discovery = new LocalDiscoveryProvider(storage);
    const spatialIndex = new LocalSpatialIndexProvider(storage);
    const loadDoc = new LoadPublicationDocumentUseCase(storage);
    const registry = new CreateBrickRegistryUseCase().execute();
    
    const placeUseCase = new PlacePublicationUseCase(spatialIndex, discovery, loadDoc, registry);
    const moveUseCase = new MoveWorldPlacementUseCase(spatialIndex);
    const discoverUseCase = new DiscoverWorldsUseCase(spatialIndex);
    
    // 1. Publish
    const doc = createTestDocument(5);
    const manager = new DocumentManager();
    manager.load(doc, 'flagship-doc');
    const publication = new PublishDocumentUseCase(publisher, stubIdentityProvider).execute(manager);
    const originalHash = publication.contentHash;
    
    // 2. Place at A
    const placement = placeUseCase.execute(publication.id, new Position(100, 0, 50));
    
    // 3. Discover A
    const foundA = discoverUseCase.execute(new Position(100, 0, 50), 200);
    assert(foundA.length === 1, 'discovered at A');
    
    // 4. Move to B
    moveUseCase.execute(placement.id, new Position(500, 0, -200));
    
    // 5. Discover B
    const foundB = discoverUseCase.execute(new Position(500, 0, -200), 200);
    assert(foundB.length === 1, 'discovered at B');
    
    // 6. Verify publication unchanged
    const pubAfter = discovery.findById(publication.id);
    assert(pubAfter.contentHash === originalHash, 'FLAGSHIP: content hash unchanged after move');
    
    // 7. Load published world and verify document unchanged
    const loadedDoc = loadDoc.execute(publication.id);
    assert(loadedDoc.world.getBuildings()[0].getBricks().length === 5, 'FLAGSHIP: document content intact');
    assert(loadedDoc.world.getBuildings()[0].getBricks()[0].position.x === 0, 'FLAGSHIP: local coordinates untouched');
    
    console.log('✓ FLAGSHIP: publish → place → discover → move → verify unchanged');
}

console.log('\nAll world placement tests passed.');
