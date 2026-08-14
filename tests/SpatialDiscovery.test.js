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
import { LocalSpatialDiscoveryProvider } from '../discovery/LocalSpatialDiscoveryProvider.js';
import { LocalContentResolver } from '../discovery/LocalContentResolver.js';
import { DiscoverWorldAreaUseCase } from '../application/DiscoverWorldAreaUseCase.js';
import { ResolvePublicationUseCase } from '../application/ResolvePublicationUseCase.js';
import { PlacePublicationUseCase } from '../application/PlacePublicationUseCase.js';
import { PublishDocumentUseCase } from '../application/PublishDocumentUseCase.js';
import { LoadPublicationDocumentUseCase } from '../application/LoadPublicationDocumentUseCase.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { DocumentManager } from '../application/DocumentManager.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { PublishedWorldSession } from '../application/PublishedWorldSession.js';

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

function createTestDocument(brickCount = 3, title = 'Discovery Test') {
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
        metadata: new DocumentMetadata({ title, author: 'tester' })
    });
}

function buildStack(storage) {
    const spatialIndex = new LocalSpatialIndexProvider(storage);
    const placementRegistry = new LocalPlacementRegistry(storage, spatialIndex);
    const publisher = new LocalPublisherProvider(storage);
    const discovery = new LocalDiscoveryProvider(storage);
    const spatialDiscovery = new LocalSpatialDiscoveryProvider(spatialIndex, placementRegistry);
    const contentResolver = new LocalContentResolver(publisher);
    const serializer = new DocumentSerializer();
    const loadDoc = new LoadPublicationDocumentUseCase(storage);
    const brickRegistry = new CreateBrickRegistryUseCase().execute();

    return {
        storage,
        spatialIndex,
        placementRegistry,
        publisher,
        discovery,
        spatialDiscovery,
        contentResolver,
        serializer,
        loadDoc,
        brickRegistry,
        placeUseCase: new PlacePublicationUseCase(
            spatialIndex, discovery, loadDoc, brickRegistry,
            placementRegistry, stubIdentityProvider
        ),
        publishUseCase: new PublishDocumentUseCase(publisher, stubIdentityProvider),
        discoverAreaUseCase: new DiscoverWorldAreaUseCase(spatialDiscovery),
        resolveUseCase: new ResolvePublicationUseCase(contentResolver, discovery, serializer)
    };
}

// ---------------------------------------------------------------------
// 1. SpatialDiscoveryProvider: discover placements
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const stack = buildStack(storage);

    // Publish and place two documents at different locations.
    const doc1 = createTestDocument(3, 'Castle');
    const mgr1 = new DocumentManager();
    mgr1.load(doc1, doc1.world.id);
    const pub1 = stack.publishUseCase.execute(mgr1);
    stack.placeUseCase.execute(pub1.id, new Position(0, 0, 0));

    const doc2 = createTestDocument(2, 'Village');
    const mgr2 = new DocumentManager();
    mgr2.load(doc2, doc2.world.id);
    const pub2 = stack.publishUseCase.execute(mgr2);
    stack.placeUseCase.execute(pub2.id, new Position(100, 0, 0));

    // Discover near origin — should find only Castle.
    const nearOrigin = stack.spatialDiscovery.discover(new Position(0, 0, 0), 50);
    assert(nearOrigin.length === 1, 'discovers one placement near origin');
    assert(nearOrigin[0].publicationId === pub1.id, 'correct publication discovered');

    // Discover with larger radius — should find both.
    const wideArea = stack.spatialDiscovery.discover(new Position(50, 0, 0), 100);
    assert(wideArea.length === 2, 'discovers both placements in wide area');

    console.log('✓ SpatialDiscoveryProvider: discover placements');
}

// ---------------------------------------------------------------------
// 2. SpatialDiscoveryProvider: findByPublicationId (reverse lookup)
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const stack = buildStack(storage);

    const doc = createTestDocument();
    const mgr = new DocumentManager();
    mgr.load(doc, doc.world.id);
    const pub = stack.publishUseCase.execute(mgr);

    // Place the same publication in three locations.
    stack.placeUseCase.execute(pub.id, new Position(0, 0, 0));
    stack.placeUseCase.execute(pub.id, new Position(100, 0, 0));
    stack.placeUseCase.execute(pub.id, new Position(200, 0, 0));

    const placements = stack.spatialDiscovery.findByPublicationId(pub.id);
    assert(placements.length === 3, 'three placements for one publication');
    assert(placements.every(p => p.publicationId === pub.id), 'all reference same publication');

    console.log('✓ SpatialDiscoveryProvider: findByPublicationId');
}

// ---------------------------------------------------------------------
// 3. ContentResolver: resolve and verify
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const stack = buildStack(storage);

    const doc = createTestDocument(4, 'Content Test');
    const mgr = new DocumentManager();
    mgr.load(doc, doc.world.id);
    const pub = stack.publishUseCase.execute(mgr);

    // Resolve content.
    const snapshotJson = stack.contentResolver.resolve(pub.id);
    assert(snapshotJson !== null, 'snapshot resolved');
    assert(snapshotJson.world.id === doc.world.id, 'correct world in snapshot');

    // Verify integrity.
    const isValid = stack.contentResolver.verify(pub.id, pub.contentHash);
    assert(isValid === true, 'integrity verified');

    // Verify with wrong hash.
    const isInvalid = stack.contentResolver.verify(pub.id, 'wrong-hash');
    assert(isInvalid === false, 'wrong hash rejected');

    console.log('✓ ContentResolver: resolve and verify');
}

// ---------------------------------------------------------------------
// 4. DiscoverWorldAreaUseCase: returns PlacementRecords
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const stack = buildStack(storage);

    const doc = createTestDocument();
    const mgr = new DocumentManager();
    mgr.load(doc, doc.world.id);
    const pub = stack.publishUseCase.execute(mgr);
    stack.placeUseCase.execute(pub.id, new Position(50, 0, 50));

    const records = stack.discoverAreaUseCase.execute(new Position(50, 0, 50), 100);
    assert(records.length === 1, 'one placement record found');
    assert(records[0] instanceof PlacementRecord, 'returns PlacementRecord');
    assert(records[0].publicationId === pub.id, 'correct publication reference');
    assert(records[0].position.x === 50, 'position preserved');

    console.log('✓ DiscoverWorldAreaUseCase: returns PlacementRecords');
}

// ---------------------------------------------------------------------
// 5. DiscoverWorldAreaUseCase: progressive loading tiers
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const stack = buildStack(storage);

    // Place three documents at different distances.
    const positions = [
        new Position(10, 0, 0),   // nearby
        new Position(50, 0, 0),   // nearby
        new Position(200, 0, 0)   // distant
    ];

    for (let i = 0; i < 3; i++) {
        const doc = createTestDocument(2, `World ${i}`);
        const mgr = new DocumentManager();
        mgr.load(doc, doc.world.id);
        const pub = stack.publishUseCase.execute(mgr);
        stack.placeUseCase.execute(pub.id, positions[i]);
    }

    // Discover with radius 300, nearby threshold 100.
    const { nearby, distant, all } = stack.discoverAreaUseCase.executeWithDistanceTiers(
        new Position(0, 0, 0), 300, 100
    );

    assert(all.length === 3, 'all three placements found');
    assert(nearby.length === 2, 'two placements are nearby');
    assert(distant.length === 1, 'one placement is distant');
    assert(distant[0].position.x === 200, 'distant placement is at x=200');

    console.log('✓ DiscoverWorldAreaUseCase: progressive loading tiers');
}

// ---------------------------------------------------------------------
// 6. ResolvePublicationUseCase: produces PublishedWorldSession
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const stack = buildStack(storage);

    const doc = createTestDocument(5, 'Resolve Test');
    const mgr = new DocumentManager();
    mgr.load(doc, doc.world.id);
    const pub = stack.publishUseCase.execute(mgr);

    const session = stack.resolveUseCase.execute(pub.id);
    assert(session instanceof PublishedWorldSession, 'returns PublishedWorldSession');
    assert(session.capabilities.canEdit === false, 'session is read-only');
    assert(session.capabilities.canNavigate === true, 'session can navigate');
    assert(session.getDocument().world.id === doc.world.id, 'correct document loaded');
    assert(session.getPublication().id === pub.id, 'correct publication attached');

    console.log('✓ ResolvePublicationUseCase: produces PublishedWorldSession');
}

// ---------------------------------------------------------------------
// 7. ResolvePublicationUseCase: from PlacementRecord
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const stack = buildStack(storage);

    const doc = createTestDocument();
    const mgr = new DocumentManager();
    mgr.load(doc, doc.world.id);
    const pub = stack.publishUseCase.execute(mgr);
    const placement = stack.placeUseCase.execute(pub.id, new Position(0, 0, 0));

    // Get the PlacementRecord.
    const records = stack.discoverAreaUseCase.execute(new Position(0, 0, 0), 100);
    assert(records.length === 1, 'placement found');

    // Resolve from the PlacementRecord.
    const session = stack.resolveUseCase.executeFromPlacement(records[0]);
    assert(session instanceof PublishedWorldSession, 'resolved from placement');
    assert(session.getDocument().world.id === doc.world.id, 'correct document');

    console.log('✓ ResolvePublicationUseCase: from PlacementRecord');
}

// ---------------------------------------------------------------------
// 8. Integrity: tampered snapshot rejected
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const stack = buildStack(storage);

    const doc = createTestDocument();
    const mgr = new DocumentManager();
    mgr.load(doc, doc.world.id);
    const pub = stack.publishUseCase.execute(mgr);

    // Tamper with the snapshot.
    const snapshotKey = `snapshot:${pub.id}`;
    const tampered = storage.load(snapshotKey);
    tampered.metadata.title = 'Tampered';
    storage.save(snapshotKey, tampered);

    assertThrows(
        () => stack.resolveUseCase.execute(pub.id),
        'integrity check failed',
        'tampered snapshot rejected'
    );

    console.log('✓ Integrity: tampered snapshot rejected');
}

// ---------------------------------------------------------------------
// 9. Publication unchanged after discovery and resolution
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const stack = buildStack(storage);

    const doc = createTestDocument(4);
    const mgr = new DocumentManager();
    mgr.load(doc, doc.world.id);
    const pub = stack.publishUseCase.execute(mgr);
    const originalHash = pub.contentHash;
    const originalDocJson = JSON.stringify(stack.serializer.serialize(doc));

    stack.placeUseCase.execute(pub.id, new Position(0, 0, 0));

    // Discover and resolve.
    const records = stack.discoverAreaUseCase.execute(new Position(0, 0, 0), 100);
    const session = stack.resolveUseCase.executeFromPlacement(records[0]);

    // Verify publication unchanged.
    const pubAfter = stack.discovery.findById(pub.id);
    assert(pubAfter.contentHash === originalHash, 'publication hash unchanged');

    // Verify document unchanged.
    const loadedDoc = stack.loadDoc.execute(pub.documentId); // was pub.id
    assert(JSON.stringify(stack.serializer.serialize(loadedDoc)) === originalDocJson,
        'document unchanged after discovery and resolution');

    console.log('✓ Publication unchanged after discovery and resolution');
}

// ---------------------------------------------------------------------
// 10. FLAGSHIP: publish → place → discover → resolve → session
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const stack = buildStack(storage);

    // 1. Publish three documents.
    const docs = [];
    const pubs = [];
    for (let i = 0; i < 3; i++) {
        const doc = createTestDocument(3 + i, `World ${i}`);
        const mgr = new DocumentManager();
        mgr.load(doc, doc.world.id);
        const pub = stack.publishUseCase.execute(mgr);
        docs.push(doc);
        pubs.push(pub);
    }

    // 2. Place them at different virtual coordinates.
    const positions = [
        new Position(0, 0, 0),      // Tokyo (virtual)
        new Position(1000, 0, 0),   // London (virtual)
        new Position(-500, 0, 300)  // New York (virtual)
    ];
    for (let i = 0; i < 3; i++) {
        stack.placeUseCase.execute(pubs[i].id, positions[i]);
    }

    // 3. Discover near origin — should find only World 0.
    const nearOrigin = stack.discoverAreaUseCase.execute(new Position(0, 0, 0), 100);
    assert(nearOrigin.length === 1, 'one placement near origin');
    assert(nearOrigin[0].publicationId === pubs[0].id, 'World 0 discovered');

    // 4. Discover with wide radius — should find all three.
    const wideArea = stack.discoverAreaUseCase.execute(new Position(0, 0, 0), 2000);
    assert(wideArea.length === 3, 'all three placements found');

    // 5. Progressive loading: nearby vs distant.
    const { nearby, distant } = stack.discoverAreaUseCase.executeWithDistanceTiers(
        new Position(0, 0, 0), 2000, 500
    );
    assert(nearby.length === 1, 'one nearby placement');
    assert(distant.length === 2, 'two distant placements');

    // 6. Resolve only the nearby placement.
    const session = stack.resolveUseCase.executeFromPlacement(nearby[0]);
    assert(session instanceof PublishedWorldSession, 'nearby placement resolved');
    assert(session.capabilities.canEdit === false, 'session is read-only');
    assert(session.getDocument().metadata.title === 'World 0', 'correct document');

    // 7. Distant placements are NOT resolved (metadata only).
    // The caller would render them as placeholders or skip them.
    for (const distantRecord of distant) {
        assert(distantRecord.publicationId !== pubs[0].id, 'distant is not World 0');
    }

    // 8. Reverse lookup: "Where is World 1 placed?"
    const world1Placements = stack.discoverAreaUseCase.findByPublicationId(pubs[1].id);
    assert(world1Placements.length === 1, 'World 1 has one placement');
    assert(world1Placements[0].position.x === 1000, 'World 1 is at virtual London');

    // 9. Verify no snapshot was loaded for distant placements.
    // (In a real implementation, we'd check network requests. Here we
    // verify that only the nearby publication was resolved.)
    assert(session.getPublication().id === pubs[0].id, 'only nearby publication resolved');

    // 10. Virtual coordinates, not geographic.
    assert(positions[0].x === 0, 'Tokyo is at virtual (0, 0, 0)');
    assert(positions[1].x === 1000, 'London is at virtual (1000, 0, 0)');
    assert(positions[2].x === -500, 'New York is at virtual (-500, 0, 300)');

    console.log('✓ FLAGSHIP: publish → place → discover → resolve → session');
}

// ---------------------------------------------------------------------
// 11. Multiple placements for same publication
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const stack = buildStack(storage);

    const doc = createTestDocument();
    const mgr = new DocumentManager();
    mgr.load(doc, doc.world.id);
    const pub = stack.publishUseCase.execute(mgr);

    // Place in three locations.
    stack.placeUseCase.execute(pub.id, new Position(0, 0, 0));
    stack.placeUseCase.execute(pub.id, new Position(100, 0, 0));
    stack.placeUseCase.execute(pub.id, new Position(200, 0, 0));

    // Discover near each location.
    const near0 = stack.discoverAreaUseCase.execute(new Position(0, 0, 0), 50);
    const near100 = stack.discoverAreaUseCase.execute(new Position(100, 0, 0), 50);
    const near200 = stack.discoverAreaUseCase.execute(new Position(200, 0, 0), 50);

    assert(near0.length === 1, 'one placement near x=0');
    assert(near100.length === 1, 'one placement near x=100');
    assert(near200.length === 1, 'one placement near x=200');

    // All resolve to the same publication.
    const session0 = stack.resolveUseCase.executeFromPlacement(near0[0]);
    const session100 = stack.resolveUseCase.executeFromPlacement(near100[0]);
    assert(session0.getPublication().id === session100.getPublication().id,
        'same publication from different placements');

    console.log('✓ Multiple placements for same publication');
}

// ---------------------------------------------------------------------
// 12. Empty area discovery
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const stack = buildStack(storage);

    const empty = stack.discoverAreaUseCase.execute(new Position(9999, 0, 9999), 100);
    assert(empty.length === 0, 'empty area returns no placements');

    const { nearby, distant, all } = stack.discoverAreaUseCase.executeWithDistanceTiers(
        new Position(9999, 0, 9999), 100, 50
    );
    assert(nearby.length === 0, 'no nearby placements');
    assert(distant.length === 0, 'no distant placements');
    assert(all.length === 0, 'no placements at all');

    console.log('✓ Empty area discovery');
}

console.log('\nAll spatial discovery tests passed.');
