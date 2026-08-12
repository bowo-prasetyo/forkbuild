import { Brick } from '../core/Brick.js';
import { Building } from '../core/Building.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { Position } from '../core/Position.js';
import { World } from '../core/World.js';
import { WorldPlacement } from '../core/WorldPlacement.js';
import { SpatialBounds } from '../core/SpatialBounds.js';
import { CommandHistory } from '../application/CommandHistory.js';
import { DocumentManager } from '../application/DocumentManager.js';
import { PlaceBrickCommand } from '../application/commands/PlaceBrickCommand.js';
import { MoveBrickCommand } from '../application/commands/MoveBrickCommand.js';
import { SaveDocumentUseCase } from '../application/SaveDocumentUseCase.js';
import { PublishDocumentUseCase } from '../application/PublishDocumentUseCase.js';
import { LoadPublishedSnapshotUseCase } from '../application/LoadPublishedSnapshotUseCase.js';
import { ForkPublishedWorldUseCase } from '../application/ForkPublishedWorldUseCase.js';
import { DocumentCloneService } from '../application/DocumentCloneService.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';

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
    currentUser: () => ({ username: 'bob', displayName: 'bob', providerId: 'stub' }),
    sign: (data) => ({ signedBy: 'bob', providerId: 'stub', data })
};

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function assertThrows(fn, expectedMessage, message) {
    try { fn(); assert(false, message); }
    catch (e) { assert(e.message.includes(expectedMessage), `${message}: ${e.message}`); }
}

function createTestDocument(brickCount = 3, title = 'Alice Castle') {
    const world = new World();
    const building = new Building({ creator: 'alice' });
    for (let i = 0; i < brickCount; i++) {
        building.addBrick(new Brick({
            definitionId: 'core:cube',
            position: new Position(i * 2, 0.5, 0)
        }));
    }
    world.addBuilding(building);
    return new Document({
        world,
        metadata: new DocumentMetadata({ title, author: 'alice' })
    });
}

// ---------------------------------------------------------------------
// 1. ForkPublishedWorldUseCase: basic operation
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const publisher = new LocalPublisherProvider(storage);
    const serializer = new DocumentSerializer();

    // Create and publish a document.
    const doc = createTestDocument(5, 'Alice Castle');
    const manager = new DocumentManager();
    manager.load(doc, doc.world.id);
    const publication = new PublishDocumentUseCase(publisher, {
        currentUser: () => ({ username: 'alice', providerId: 'stub' }),
        sign: (d) => ({ signedBy: 'alice', providerId: 'stub', data: d })
    }).execute(manager);

    // Fork it.
    const forkUseCase = new ForkPublishedWorldUseCase(publisher, serializer);
    const forked = forkUseCase.execute(publication, stubIdentityProvider);

    // Verify the fork is a new document.
    assert(forked.world.id !== doc.world.id, 'fork has new documentId');
    assert(forked.metadata.title === 'Fork of Alice Castle', 'fork title');
    assert(forked.metadata.author === 'bob', 'fork attributed to forker');
    assert(forked.metadata.parentDocumentId === doc.world.id, 'fork lineage');

    // Verify brick count matches.
    const forkBricks = forked.world.getBuildings()[0].getBricks();
    assert(forkBricks.length === 5, 'fork has same brick count');

    // Verify brick IDs are fresh.
    const sourceBrickIds = doc.world.getBuildings()[0].getBricks().map(b => b.id);
    for (const brick of forkBricks) {
        assert(!sourceBrickIds.includes(brick.id), 'fork brick IDs are fresh');
    }

    console.log('✓ ForkPublishedWorldUseCase: basic operation');
}

// ---------------------------------------------------------------------
// 2. Forking does NOT modify the source Publication or snapshot
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const publisher = new LocalPublisherProvider(storage);
    const serializer = new DocumentSerializer();

    const doc = createTestDocument(3);
    const manager = new DocumentManager();
    manager.load(doc, doc.world.id);
    const publication = new PublishDocumentUseCase(publisher, {
        currentUser: () => ({ username: 'alice', providerId: 'stub' }),
        sign: (d) => ({ signedBy: 'alice', providerId: 'stub', data: d })
    }).execute(manager);

    const snapshotBefore = JSON.stringify(storage.load(`snapshot:${publication.id}`));
    const hashBefore = publication.contentHash;

    // Fork.
    const forkUseCase = new ForkPublishedWorldUseCase(publisher, serializer);
    forkUseCase.execute(publication, stubIdentityProvider);

    // Verify snapshot unchanged.
    const snapshotAfter = JSON.stringify(storage.load(`snapshot:${publication.id}`));
    assert(snapshotBefore === snapshotAfter, 'snapshot unchanged after fork');
    assert(publication.contentHash === hashBefore, 'contentHash unchanged');

    console.log('✓ Forking does NOT modify source Publication or snapshot');
}

// ---------------------------------------------------------------------
// 3. Editing the fork does NOT affect the source
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const publisher = new LocalPublisherProvider(storage);
    const serializer = new DocumentSerializer();

    const doc = createTestDocument(3);
    const manager = new DocumentManager();
    manager.load(doc, doc.world.id);
    const publication = new PublishDocumentUseCase(publisher, {
        currentUser: () => ({ username: 'alice', providerId: 'stub' }),
        sign: (d) => ({ signedBy: 'alice', providerId: 'stub', data: d })
    }).execute(manager);

    const snapshotBefore = JSON.stringify(storage.load(`snapshot:${publication.id}`));

    // Fork and edit.
    const forkUseCase = new ForkPublishedWorldUseCase(publisher, serializer);
    const forked = forkUseCase.execute(publication, stubIdentityProvider);

    // Edit the fork: add a brick.
    const forkBuildingId = forked.world.getBuildings()[0].id;
    forked.world.addBrickToBuilding(forkBuildingId, new Brick({
        definitionId: 'core:plate_2x4',
        position: new Position(10, 0.125, 0)
    }));

    // Verify source snapshot is STILL unchanged.
    const snapshotAfterEdit = JSON.stringify(storage.load(`snapshot:${publication.id}`));
    assert(snapshotBefore === snapshotAfterEdit, 'source snapshot unchanged after fork edit');

    // Verify fork has more bricks.
    assert(forked.world.getBuildings()[0].getBricks().length === 4, 'fork has 4 bricks after edit');

    console.log('✓ Editing the fork does NOT affect the source');
}

// ---------------------------------------------------------------------
// 4. Saving the fork does NOT modify the source document
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const publisher = new LocalPublisherProvider(storage);
    const serializer = new DocumentSerializer();

    const doc = createTestDocument(3);
    const manager = new DocumentManager();
    manager.load(doc, doc.world.id);
    const publication = new PublishDocumentUseCase(publisher, {
        currentUser: () => ({ username: 'alice', providerId: 'stub' }),
        sign: (d) => ({ signedBy: 'alice', providerId: 'stub', data: d })
    }).execute(manager);

    // Save the source document.
    new SaveDocumentUseCase(storage).execute(manager);
    const sourceDocBefore = JSON.stringify(storage.load(doc.world.id));

    // Fork, edit, and save the fork.
    const forkUseCase = new ForkPublishedWorldUseCase(publisher, serializer);
    const forked = forkUseCase.execute(publication, stubIdentityProvider);

    const forkManager = new DocumentManager();
    forkManager.load(forked, forked.world.id);
    const forkHistory = new CommandHistory({ world: forked.world });
    forkManager.trackCommandHistory(forkHistory);

    const forkBuildingId = forked.world.getBuildings()[0].id;
    forkHistory.execute(new PlaceBrickCommand({
        worldId: forked.world.id,
        buildingId: forkBuildingId,
        definitionId: 'core:cube',
        position: new Position(20, 0.5, 0)
    }));

    new SaveDocumentUseCase(storage).execute(forkManager);

    // Verify source document is unchanged.
    const sourceDocAfter = JSON.stringify(storage.load(doc.world.id));
    assert(sourceDocBefore === sourceDocAfter, 'source document unchanged after fork save');

    // Verify fork document was saved at its own key.
    const forkDocStored = storage.load(forked.world.id);
    assert(forkDocStored !== null, 'fork document saved at its own key');
    assert(forkDocStored.world.buildings[0].bricks.length === 4, 'fork has 4 bricks');

    console.log('✓ Saving the fork does NOT modify the source document');
}

// ---------------------------------------------------------------------
// 5. Publishing the fork creates a NEW Publication
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const publisher = new LocalPublisherProvider(storage);
    const serializer = new DocumentSerializer();

    const doc = createTestDocument(3, 'Original');
    const manager = new DocumentManager();
    manager.load(doc, doc.world.id);
    const pub1 = new PublishDocumentUseCase(publisher, {
        currentUser: () => ({ username: 'alice', providerId: 'stub' }),
        sign: (d) => ({ signedBy: 'alice', providerId: 'stub', data: d })
    }).execute(manager);

    // Fork, edit, and publish.
    const forkUseCase = new ForkPublishedWorldUseCase(publisher, serializer);
    const forked = forkUseCase.execute(publication, stubIdentityProvider);

    const forkManager = new DocumentManager();
    forkManager.load(forked, forked.world.id);
    const forkHistory = new CommandHistory({ world: forked.world });
    forkManager.trackCommandHistory(forkHistory);

    // Add a brick to the fork.
    const forkBuildingId = forked.world.getBuildings()[0].id;
    forkHistory.execute(new PlaceBrickCommand({
        worldId: forked.world.id,
        buildingId: forkBuildingId,
        definitionId: 'core:cube',
        position: new Position(30, 0.5, 0)
    }));
    forkManager.markSaved();

    const pub2 = new PublishDocumentUseCase(publisher, stubIdentityProvider).execute(forkManager);

    // Verify P1 and P2 are distinct.
    assert(pub1.id !== pub2.id, 'P1 and P2 have different publicationIds');
    assert(pub1.documentId !== pub2.documentId, 'P1 and P2 reference different documents');
    assert(pub1.contentHash !== pub2.contentHash, 'P1 and P2 have different contentHashes');

    // Verify both snapshots exist independently.
    const snap1 = storage.load(`snapshot:${pub1.id}`);
    const snap2 = storage.load(`snapshot:${pub2.id}`);
    assert(snap1 !== null && snap2 !== null, 'both snapshots exist');
    assert(JSON.stringify(snap1) !== JSON.stringify(snap2), 'snapshots differ');

    // Verify both publications are in the catalog.
    const records = storage.load('forkbuild-publications') || [];
    assert(records.length === 2, 'two publications in catalog');

    console.log('✓ Publishing the fork creates a NEW Publication');
}

// ---------------------------------------------------------------------
// 6. WorldPlacement remains unchanged after fork
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const publisher = new LocalPublisherProvider(storage);
    const serializer = new DocumentSerializer();
    const spatialIndex = new LocalSpatialIndexProvider(storage);

    // Publish.
    const doc = createTestDocument(3);
    const manager = new DocumentManager();
    manager.load(doc, doc.world.id);
    const publication = new PublishDocumentUseCase(publisher, {
        currentUser: () => ({ username: 'alice', providerId: 'stub' }),
        sign: (d) => ({ signedBy: 'alice', providerId: 'stub', data: d })
    }).execute(manager);

    // Place in "Tokyo".
    const placement = new WorldPlacement({
        publicationId: publication.id,
        position: new Position(100, 0, 50),
        bounds: SpatialBounds.fromWorld(doc.world, null)
    });
    spatialIndex.add(placement);

    const placementBefore = JSON.stringify(spatialIndex.get(placement.id).toJSON());

    // Fork.
    const forkUseCase = new ForkPublishedWorldUseCase(publisher, serializer);
    forkUseCase.execute(publication, stubIdentityProvider);

    // Verify placement unchanged.
    const placementAfter = JSON.stringify(spatialIndex.get(placement.id).toJSON());
    assert(placementBefore === placementAfter, 'WorldPlacement unchanged after fork');

    // Verify no new placement was created.
    assert(spatialIndex.list().length === 1, 'only one placement exists');

    console.log('✓ WorldPlacement remains unchanged after fork');
}

// ---------------------------------------------------------------------
// 7. Forking does NOT automatically create a WorldPlacement
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const publisher = new LocalPublisherProvider(storage);
    const serializer = new DocumentSerializer();
    const spatialIndex = new LocalSpatialIndexProvider(storage);

    const doc = createTestDocument(3);
    const manager = new DocumentManager();
    manager.load(doc, doc.world.id);
    const publication = new PublishDocumentUseCase(publisher, {
        currentUser: () => ({ username: 'alice', providerId: 'stub' }),
        sign: (d) => ({ signedBy: 'alice', providerId: 'stub', data: d })
    }).execute(manager);

    // Fork.
    const forkUseCase = new ForkPublishedWorldUseCase(publisher, serializer);
    const forked = forkUseCase.execute(publication, stubIdentityProvider);

    // Verify no placement was created for the fork.
    const forkPlacements = spatialIndex.findByPublicationId(forked.world.id);
    assert(forkPlacements.length === 0, 'forking does not auto-create a placement');

    console.log('✓ Forking does NOT automatically create a WorldPlacement');
}

// ---------------------------------------------------------------------
// 8. Integrity check: corrupted snapshot rejects fork
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const publisher = new LocalPublisherProvider(storage);
    const serializer = new DocumentSerializer();

    const doc = createTestDocument(3);
    const manager = new DocumentManager();
    manager.load(doc, doc.world.id);
    const publication = new PublishDocumentUseCase(publisher, {
        currentUser: () => ({ username: 'alice', providerId: 'stub' }),
        sign: (d) => ({ signedBy: 'alice', providerId: 'stub', data: d })
    }).execute(manager);

    // Tamper with the snapshot.
    const snapshotKey = `snapshot:${publication.id}`;
    const tampered = storage.load(snapshotKey);
    tampered.metadata.title = 'Tampered';
    storage.save(snapshotKey, tampered);

    // Fork should fail.
    const forkUseCase = new ForkPublishedWorldUseCase(publisher, serializer);
    assertThrows(
        () => forkUseCase.execute(publication, stubIdentityProvider),
        'integrity check failed',
        'corrupted snapshot rejects fork'
    );

    console.log('✓ Integrity check: corrupted snapshot rejects fork');
}

// ---------------------------------------------------------------------
// 9. PublishedWorldSession has no editing capability
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const publisher = new LocalPublisherProvider(storage);

    const doc = createTestDocument(3);
    const manager = new DocumentManager();
    manager.load(doc, doc.world.id);
    const publication = new PublishDocumentUseCase(publisher, {
        currentUser: () => ({ username: 'alice', providerId: 'stub' }),
        sign: (d) => ({ signedBy: 'alice', providerId: 'stub', data: d })
    }).execute(manager);

    // Load as PublishedWorldSession.
    const { LoadPublishedWorldSessionUseCase } = await import('../application/LoadPublishedWorldSessionUseCase.js');
    const loadUseCase = new LoadPublishedWorldSessionUseCase(publisher);
    const session = loadUseCase.execute(publication);

    // Verify no editing methods exist.
    const mutationMethods = [
        'moveSelection', 'rotateSelection', 'deleteSelection',
        'alignSelection', 'distributeSelection', 'applyNumericTransform',
        'createGroupFromSelection', 'renameSelectedGroup',
        'duplicateSelectedGroup', 'deleteSelectedGroup',
        'addSelectionToSelectedGroup', 'removeSelectionFromSelectedGroup',
        'copySelection', 'paste', 'undo', 'redo',
        'saveDocument', 'publishDocument', 'forkDocument'
    ];
    for (const method of mutationMethods) {
        assert(typeof session[method] !== 'function',
            `PublishedWorldSession lacks ${method}`);
    }

    // Verify read-only capabilities.
    assert(session.capabilities.canEdit === false, 'canEdit is false');
    assert(session.capabilities.canSave === false, 'canSave is false');
    assert(session.capabilities.canPublish === false, 'canPublish is false');
    assert(session.capabilities.canNavigate === true, 'canNavigate is true');
    assert(session.capabilities.canSelect === true, 'canSelect is true');

    console.log('✓ PublishedWorldSession has no editing capability');
}

// ---------------------------------------------------------------------
// 10. FLAGSHIP: full lifecycle
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const publisher = new LocalPublisherProvider(storage);
    const serializer = new DocumentSerializer();
    const spatialIndex = new LocalSpatialIndexProvider(storage);

    // 1. Alice creates and publishes a castle.
    const castleDoc = createTestDocument(5, 'Alice Castle');
    const aliceManager = new DocumentManager();
    aliceManager.load(castleDoc, castleDoc.world.id);
    const aliceIdentity = {
        currentUser: () => ({ username: 'alice', providerId: 'stub' }),
        sign: (d) => ({ signedBy: 'alice', providerId: 'stub', data: d })
    };
    const P1 = new PublishDocumentUseCase(publisher, aliceIdentity).execute(aliceManager);
    const P1Hash = P1.contentHash;
    const P1SnapshotBefore = JSON.stringify(storage.load(`snapshot:${P1.id}`));

    // 2. Alice places P1 in Tokyo.
    const tokyoPlacement = new WorldPlacement({
        publicationId: P1.id,
        position: new Position(100, 0, 50),
        bounds: SpatialBounds.fromWorld(castleDoc.world, null)
    });
    spatialIndex.add(tokyoPlacement);
    const tokyoBefore = JSON.stringify(spatialIndex.get(tokyoPlacement.id).toJSON());

    // 3. Bob discovers and inspects P1.
    const { LoadPublishedWorldSessionUseCase } = await import('../application/LoadPublishedWorldSessionUseCase.js');
    const inspectUseCase = new LoadPublishedWorldSessionUseCase(publisher);
    const inspectedSession = inspectUseCase.execute(P1);
    assert(inspectedSession.capabilities.canEdit === false, 'inspect is read-only');

    // 4. Bob forks P1 → D2.
    const bobIdentity = stubIdentityProvider;
    const forkUseCase = new ForkPublishedWorldUseCase(publisher, serializer);
    const D2 = forkUseCase.execute(P1, bobIdentity);
    assert(D2.world.id !== castleDoc.world.id, 'D2 has new documentId');
    assert(D2.metadata.parentDocumentId === castleDoc.world.id, 'D2 lineage');
    assert(D2.metadata.author === 'bob', 'D2 attributed to Bob');
    assert(D2.metadata.title === 'Fork of Alice Castle', 'D2 title');

    // 5. Bob edits D2.
    const bobManager = new DocumentManager();
    bobManager.load(D2, D2.world.id);
    const bobHistory = new CommandHistory({ world: D2.world });
    bobManager.trackCommandHistory(bobHistory);

    const D2BuildingId = D2.world.getBuildings()[0].id;
    bobHistory.execute(new PlaceBrickCommand({
        worldId: D2.world.id, buildingId: D2BuildingId,
        definitionId: 'core:plate_2x4', position: new Position(20, 0.125, 0)
    }));
    bobHistory.execute(new MoveBrickCommand({
        worldId: D2.world.id, buildingId: D2BuildingId,
        brickId: D2.world.getBuildings()[0].getBricks()[0].id,
        delta: { x: 5, y: 0, z: 0 }
    }));
    bobManager.markSaved();

    // 6. Verify P1 unchanged.
    const P1SnapshotAfter = JSON.stringify(storage.load(`snapshot:${P1.id}`));
    assert(P1SnapshotBefore === P1SnapshotAfter, 'P1 snapshot unchanged');
    assert(P1.contentHash === P1Hash, 'P1 contentHash unchanged');

    // 7. Verify Tokyo placement still points to P1.
    const tokyoAfter = JSON.stringify(spatialIndex.get(tokyoPlacement.id).toJSON());
    assert(tokyoBefore === tokyoAfter, 'Tokyo placement unchanged');
    assert(spatialIndex.list().length === 1, 'only one placement exists');

    // 8. Bob saves and publishes D2 → P2.
    new SaveDocumentUseCase(storage).execute(bobManager);
    const P2 = new PublishDocumentUseCase(publisher, bobIdentity).execute(bobManager);

    // 9. Verify P2 differs from P1.
    assert(P1.id !== P2.id, 'P1 and P2 have different publicationIds');
    assert(P1.documentId !== P2.documentId, 'P1 and P2 reference different documents');
    assert(P1.contentHash !== P2.contentHash, 'P1 and P2 have different hashes');

    // 10. Verify P1 and P2 can coexist.
    const records = storage.load('forkbuild-publications') || [];
    assert(records.length === 2, 'two publications coexist');
    const snap1 = storage.load(`snapshot:${P1.id}`);
    const snap2 = storage.load(`snapshot:${P2.id}`);
    assert(snap1 !== null && snap2 !== null, 'both snapshots exist');
    assert(JSON.stringify(snap1) !== JSON.stringify(snap2), 'snapshots differ');

    // Verify P2 has more bricks than P1.
    const p1Bricks = snap1.world.buildings[0].bricks.length;
    const p2Bricks = snap2.world.buildings[0].bricks.length;
    assert(p2Bricks === p1Bricks + 1, 'P2 has one more brick than P1');

    console.log('✓ FLAGSHIP: full lifecycle (publish → place → inspect → fork → edit → verify → publish → coexist)');
}

console.log('\nAll fork published world tests passed.');
