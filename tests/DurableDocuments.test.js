import { Brick } from '../core/Brick.js';
import { Building } from '../core/Building.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { Position } from '../core/Position.js';
import { World } from '../core/World.js';
import { Group } from '../core/Group.js';
import { DOCUMENT_SCHEMA_VERSION } from '../core/documentSchema.js';
import { PROTOCOL_VERSION } from '../core/protocolVersion.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { DocumentValidator } from '../serializer/DocumentValidator.js';
import { DocumentSchemaMigrator } from '../serializer/DocumentSchemaMigrator.js';
import { computeContentHash } from '../serializer/contentHash.js';
import { CommandHistory } from '../application/CommandHistory.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { PlaceBrickCommand } from '../application/commands/PlaceBrickCommand.js';
import { MoveBrickCommand } from '../application/commands/MoveBrickCommand.js';
import { RotateBrickCommand } from '../application/commands/RotateBrickCommand.js';
import { DeleteBrickCommand } from '../application/commands/DeleteBrickCommand.js';
import { CompositeCommand } from '../application/commands/CompositeCommand.js';
import { CreateGroupCommand } from '../application/commands/CreateGroupCommand.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { Publication } from '../publisher/Publication.js';
import { PublishDocumentUseCase } from '../application/PublishDocumentUseCase.js';
import { DocumentManager } from '../application/DocumentManager.js';
import { LocalContentStore } from '../content/LocalContentStore.js'; // Add import at top
import { LoadPublishedSnapshotUseCase } from '../application/LoadPublishedSnapshotUseCase.js';

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
function createTestDocument(brickCount = 3) {
    const world = new World();
    const building = new Building({ creator: 'tester' });
    for (let i = 0; i < brickCount; i++) {
        building.addBrick(new Brick({
            definitionId: 'core:cube',
            position: new Position(i * 2, 0.5, 0),
            rotation: i * 15
        }));
    }
    world.addBuilding(building);
    return new Document({
        world,
        metadata: new DocumentMetadata({ title: 'Durable Test', author: 'tester' })
    });
}
// ---------------------------------------------------------------------
// 1. Schema version in serialized envelope
// ---------------------------------------------------------------------
{
    const doc = createTestDocument();
    const json = doc.toJSON();
    assert(json.schemaVersion === DOCUMENT_SCHEMA_VERSION, 'schemaVersion present in envelope');
    assert(json.schemaVersion === 1, 'schemaVersion is 1');
    assert(json.world !== undefined, 'world present');
    assert(json.metadata !== undefined, 'metadata present');
    console.log('✓ schema version in serialized envelope');
}
// ---------------------------------------------------------------------
// 2. DocumentValidator: valid document passes
// ---------------------------------------------------------------------
{
    const doc = createTestDocument();
    const json = doc.toJSON();
    const result = DocumentValidator.validate(json);
    assert(result.valid === true, 'valid document passes validation');
    assert(result.errors.length === 0, 'no errors');
    console.log('✓ DocumentValidator accepts valid document');
}
// ---------------------------------------------------------------------
// 3. DocumentValidator: malformed documents fail cleanly
// ---------------------------------------------------------------------
{
    assert(DocumentValidator.validate(null).valid === false, 'null rejected');
    assert(DocumentValidator.validate(42).valid === false, 'number rejected');
    assert(DocumentValidator.validate([]).valid === false, 'array rejected');
    assert(DocumentValidator.validate({}).valid === false, 'empty object rejected');
    assert(DocumentValidator.validate({ world: {} }).valid === false, 'missing metadata rejected');
    const noBuildings = {
        schemaVersion: 1,
        metadata: { title: 'X', protocolVersion: PROTOCOL_VERSION, engineVersion: '0.1.0' },
        world: { id: 'w1' }
    };
    assert(DocumentValidator.validate(noBuildings).valid === false, 'world without buildings rejected');
    const badBrick = {
        schemaVersion: 1,
        metadata: { title: 'X', protocolVersion: PROTOCOL_VERSION, engineVersion: '0.1.0' },
        world: {
            id: 'w1',
            buildings: [{
                id: 'b1',
                bricks: [{ id: 'br1', definitionId: 'core:cube', position: { x: 'bad' } }]
            }]
        }
    };
    assert(DocumentValidator.validate(badBrick).valid === false, 'brick with non-numeric position rejected');
    console.log('✓ DocumentValidator rejects malformed documents');
}
// ---------------------------------------------------------------------
// 4. Migration: pre-0.2.0 format (no schemaVersion)
// ---------------------------------------------------------------------
{
    const doc = createTestDocument();
    const json = doc.toJSON();
    // Simulate a pre-0.2.0 document by removing schemaVersion.
    const { schemaVersion, ...legacyJson } = json;
    assert(legacyJson.schemaVersion === undefined, 'legacy has no schemaVersion');
    const migrated = DocumentSchemaMigrator.migrate(legacyJson);
    assert(migrated.schemaVersion === DOCUMENT_SCHEMA_VERSION, 'migration adds schemaVersion');
    assert(migrated.world !== undefined, 'migration preserves world');
    assert(migrated.metadata !== undefined, 'migration preserves metadata');
    // The migrated document should deserialize successfully.
    const serializer = new DocumentSerializer();
    const restored = serializer.deserialize(migrated);
    assert(restored.world.id === doc.world.id, 'migrated document deserializes correctly');
    console.log('✓ migration from pre-0.2.0 format');
}
// ---------------------------------------------------------------------
// 5. Canonical serialization: byte-identical round-trip
// ---------------------------------------------------------------------
{
    const serializer = new DocumentSerializer();
    const doc = createTestDocument(5);
    // Add a group for completeness.
    const brickIds = doc.world.getBuildings()[0].getBricks().slice(0, 3).map(b => b.id);
    doc.world.addGroup(new Group({ name: 'TestGroup', brickIds }));
    const serialized1 = JSON.stringify(serializer.serialize(doc));
    const restored = serializer.deserialize(JSON.parse(serialized1));
    const serialized2 = JSON.stringify(serializer.serialize(restored));
    assert(serialized1 === serialized2, 'canonical serialization is byte-identical');
    console.log('✓ canonical serialization round-trip');
}
// ---------------------------------------------------------------------
// 6. Content hash determinism
// ---------------------------------------------------------------------
{
    const doc = createTestDocument();
    const json = JSON.stringify(doc.toJSON());
    const hash1 = computeContentHash(json);
    const hash2 = computeContentHash(json);
    assert(hash1 === hash2, 'same input produces same hash');
    assert(typeof hash1 === 'string' && hash1.length === 8, 'hash is 8-char hex');
    const differentJson = JSON.stringify({ ...doc.toJSON(), metadata: { ...doc.metadata.toJSON(), title: 'Different' } });
    const hash3 = computeContentHash(differentJson);
    assert(hash3 !== hash1, 'different content produces different hash');
    console.log('✓ content hash determinism');
}
// ---------------------------------------------------------------------
// 7. Publish creates immutable snapshot with hash
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const contentStore = new LocalContentStore(storage);
    const publisher = new LocalPublisherProvider(storage, contentStore);
    const publishUseCase = new PublishDocumentUseCase(publisher, stubIdentityProvider);
    const doc = createTestDocument();
    const manager = new DocumentManager();
    manager.load(doc, 'test-doc');
    const publication = publishUseCase.execute(manager);
    assert(publication.id !== null, 'snapshot has an id');
    assert(publication.documentId === doc.world.id, 'snapshot references the document');
    assert(publication.contentHash !== null, 'snapshot has a content hash');
    assert(publication.schemaVersion === DOCUMENT_SCHEMA_VERSION, 'snapshot records schema version');
    assert(publication.author === 'alice', 'snapshot attributed via identity provider');
    // Verify the snapshot is stored at its own key.
    const snapshotJson = storage.load(`snapshot:${publication.id}`);
    assert(snapshotJson !== null, 'snapshot stored at snapshot key');
    assert(snapshotJson.schemaVersion === DOCUMENT_SCHEMA_VERSION, 'stored snapshot has schemaVersion');
    // Verify integrity.
    assert(publisher.verifySnapshot(publication.id, publication.contentHash) === true,
        'snapshot integrity verified');
    console.log('✓ publish creates immutable snapshot with hash');
}
// ---------------------------------------------------------------------
// 8. Mutation isolation: editing after publish doesn't affect snapshot
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const publisher = new LocalPublisherProvider(storage, new LocalContentStore(storage));
    const publishUseCase = new PublishDocumentUseCase(publisher, stubIdentityProvider);
    const doc = createTestDocument();
    const manager = new DocumentManager();
    manager.load(doc, 'test-doc');
    const history = new CommandHistory({ world: doc.world });
    manager.trackCommandHistory(history);
    // Publish the initial state.
    const publication = publishUseCase.execute(manager);
    const snapshotBefore = JSON.stringify(storage.load(`snapshot:${publication.id}`));
    // Now edit the document.
    const buildingId = doc.world.getBuildings()[0].id;
    const brickId = doc.world.getBuildings()[0].getBricks()[0].id;
    history.execute(new MoveBrickCommand({
        worldId: doc.world.id, buildingId, brickId, delta: { x: 10, y: 0, z: 0 }
    }));
    manager.markSaved(); // simulate a save
    // The published snapshot must be unchanged.
    const snapshotAfter = JSON.stringify(storage.load(`snapshot:${publication.id}`));
    assert(snapshotBefore === snapshotAfter, 'published snapshot unchanged after editing');
    // Verify integrity still holds.
    assert(publisher.verifySnapshot(publication.id, publication.contentHash) === true,
        'snapshot integrity still valid after editing');
    console.log('✓ mutation isolation: editing does not affect published snapshot');
}
// ---------------------------------------------------------------------
// 9. Loading published snapshot independently
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const serializer = new DocumentSerializer();
    const publisher = new LocalPublisherProvider(storage, new LocalContentStore(storage));
    const publishUseCase = new PublishDocumentUseCase(publisher, stubIdentityProvider);
    const doc = createTestDocument(4);
    const manager = new DocumentManager();
    manager.load(doc, 'test-doc');
    const publication = publishUseCase.execute(manager);
    // Load the snapshot independently.
    const loadedDoc = serializer.deserialize(publisher.loadSnapshot(publication.id)); // <-- Fixed
    assert(loadedDoc.world.id === doc.world.id, 'loaded snapshot has same world id');
    assert(loadedDoc.world.getBuildings()[0].getBricks().length === 4, 'loaded snapshot has all bricks');
    assert(loadedDoc.metadata.title === 'Durable Test', 'loaded snapshot has metadata');
    // Verify byte-identical serialization.
    const originalJson = JSON.stringify(serializer.serialize(doc));
    const loadedJson = JSON.stringify(serializer.serialize(loadedDoc));
    assert(originalJson === loadedJson, 'loaded snapshot serializes identically');
    console.log('✓ loading published snapshot independently');
}
// ---------------------------------------------------------------------
// 10. Validation rejects publishing corrupt documents
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const publisher = new LocalPublisherProvider(storage, new LocalContentStore(storage));
    // Create a document with invalid structure by manually corrupting it.
    const doc = createTestDocument();
    const json = doc.toJSON();
    json.world.buildings[0].bricks[0].definitionId = ''; // corrupt
    // Try to publish the corrupted version.
    const corruptDoc = Document.fromJSON(json);
    const manager = new DocumentManager();
    manager.load(corruptDoc, 'corrupt-doc');
    let threw = false;
    try {
        publisher.publish(corruptDoc, stubIdentityProvider);
    } catch (e) {
        threw = true;
        assert(e.message.includes('refusing to publish'), 'error message is clear');
    }
    assert(threw === true, 'publishing corrupt document throws');
    console.log('✓ validation rejects publishing corrupt documents');
}
// ---------------------------------------------------------------------
// 11. Multiple publishes create independent snapshots
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const serializer = new DocumentSerializer(); // <--- ADD THIS LINE
    const publisher = new LocalPublisherProvider(storage, new LocalContentStore(storage));
    const publishUseCase = new PublishDocumentUseCase(publisher, stubIdentityProvider);
    const doc = createTestDocument();
    const manager = new DocumentManager();
    manager.load(doc, 'test-doc');
    const history = new CommandHistory({ world: doc.world });
    manager.trackCommandHistory(history);
    // First publish.
    const pub1 = publishUseCase.execute(manager);
    // Edit.
    const buildingId = doc.world.getBuildings()[0].id;
    const brickId = doc.world.getBuildings()[0].getBricks()[0].id;
    history.execute(new MoveBrickCommand({
        worldId: doc.world.id, buildingId, brickId, delta: { x: 5, y: 0, z: 0 }
    }));
    // Second publish.
    const pub2 = publishUseCase.execute(manager);
    assert(pub1.id !== pub2.id, 'each publish creates a new snapshot');
    assert(pub1.contentHash !== pub2.contentHash, 'different content produces different hash');
    // Both snapshots are independently loadable.
    const loadSnapshotUseCase = new LoadPublishedSnapshotUseCase(publisher, serializer);
    const loaded1 = loadSnapshotUseCase.execute(pub1.id);
    const loaded2 = loadSnapshotUseCase.execute(pub2.id);
    
    // Ensure they are Document instances before serializing
    const d1 = loaded1 instanceof Document ? loaded1 : new Document({ world: loaded1.world, metadata: loaded1.metadata });
    const d2 = loaded2 instanceof Document ? loaded2 : new Document({ world: loaded2.world, metadata: loaded2.metadata });
    
    const pos1 = d1.world.getBuildings()[0].getBricks()[0].position.x;
    const pos2 = d2.world.getBuildings()[0].getBricks()[0].position.x;
    assert(pos1 !== pos2, 'snapshots capture different states');
    console.log('✓ multiple publishes create independent snapshots');
}
// ---------------------------------------------------------------------
// 12. FLAGSHIP: build → edit → serialize → publish → load → serialize
//     → byte-identical; then edit → snapshot unchanged
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const serializer = new DocumentSerializer();
    const publisher = new LocalPublisherProvider(storage, new LocalContentStore(storage));
    const publishUseCase = new PublishDocumentUseCase(publisher, stubIdentityProvider);
    // Build a document with multiple operations.
    const doc = createTestDocument(0); // start empty
    const manager = new DocumentManager();
    manager.load(doc, 'flagship-doc');
    const history = new CommandHistory({ world: doc.world });
    manager.trackCommandHistory(history);
    const buildingId = doc.world.getBuildings()[0].id;
    // Place bricks.
    for (const x of [0, 2, 4, 6]) {
        history.execute(new PlaceBrickCommand({
            worldId: doc.world.id, buildingId,
            definitionId: 'core:cube', position: new Position(x, 0.5, 0)
        }));
    }
    // Move some.
    const brickIds = doc.world.getBuildings()[0].getBricks().map(b => b.id);
    history.execute(new MoveBrickCommand({
        worldId: doc.world.id, buildingId, brickId: brickIds[1],
        delta: { x: 0, y: 1, z: 0 }
    }));
    // Rotate one.
    history.execute(new RotateBrickCommand({
        worldId: doc.world.id, buildingId, brickId: brickIds[2],
        deltaRotation: 45
    }));
    // Create a group.
    history.execute(new CreateGroupCommand({
        worldId: doc.world.id, brickIds: brickIds.slice(0, 3), name: 'Walls'
    }));
    // Serialize the current state.
    const serializedBeforePublish = JSON.stringify(serializer.serialize(doc));
    // Publish.
    const publication = publishUseCase.execute(manager);
    assert(publication.id !== null, 'flagship: snapshot created');
    assert(publication.contentHash !== null, 'flagship: content hash present');
// tests/DurableDocuments.test.js
// ... inside test 12 "FLAGSHIP: build → edit → serialize → publish ..."

    // Load the published snapshot into a fresh runtime.
    const loadedSnapshot = new LoadPublishedSnapshotUseCase(publisher, serializer).execute(publication.id);
    // Ensure we pass a Document instance to the serializer
    const docToSerialize = loadedSnapshot instanceof Document ? loadedSnapshot : Document.fromJSON(loadedSnapshot);
    // Serialize the loaded snapshot.
    const serializedAfterLoad = JSON.stringify(serializer.serialize(loadedSnapshot));    
    // Byte-identical.
    assert(serializedBeforePublish === serializedAfterLoad,
        'FLAGSHIP: published snapshot serializes byte-identically');
    // Verify integrity.
    assert(publisher.verifySnapshot(publication.id, publication.contentHash) === true,
        'FLAGSHIP: snapshot integrity verified');
    // Now edit the original document.
    history.execute(new MoveBrickCommand({
        worldId: doc.world.id, buildingId, brickId: brickIds[0],
        delta: { x: 100, y: 0, z: 0 }
    }));
    history.execute(new DeleteBrickCommand({
        worldId: doc.world.id, buildingId, brickId: brickIds[3]
    }));
    // The published snapshot must be unchanged.
    const snapshotAfterEdit = JSON.stringify(storage.load(`snapshot:${publication.id}`));
    const snapshotBeforeEdit = serializedBeforePublish;
    assert(snapshotAfterEdit === snapshotBeforeEdit,
        'FLAGSHIP: published snapshot unchanged after editing');
    // The loaded snapshot still matches.
    const reloadedSnapshot = publisher.loadSnapshot(publication.id);
    const reserializedSnapshot = JSON.stringify(serializer.serialize(reloadedSnapshot));
    assert(reserializedSnapshot === serializedBeforePublish,
        'FLAGSHIP: reloaded snapshot still byte-identical');
    console.log('✓ FLAGSHIP: build → edit → publish → load → byte-identical → edit → snapshot unchanged');
}
// ---------------------------------------------------------------------
// 13. Publication serialization round-trip
// ---------------------------------------------------------------------
{
    const pub = new Publication({
        id: 'pub-1',
        documentId: 'doc-1',
        title: 'Test',
        author: 'alice',
        providerId: 'local',
        publishedAt: new Date('2026-01-01T00:00:00Z'),
        snapshotId: 'snap-1',
        contentHash: 'abcd1234',
        schemaVersion: 1
    });
    const json = pub.toJSON();
    const restored = Publication.fromJSON(json);
    assert(restored.snapshotId === 'snap-1', 'snapshotId round-trips');
    assert(restored.contentHash === 'abcd1234', 'contentHash round-trips');
    assert(restored.schemaVersion === 1, 'schemaVersion round-trips');
    assert(restored.id === 'pub-1', 'id round-trips');
    assert(restored.documentId === 'doc-1', 'documentId round-trips');
    console.log('✓ Publication serialization round-trip');
}
// ---------------------------------------------------------------------
// 14. Editor / World parity: same snapshot → same state
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const serializer = new DocumentSerializer();
    const publisher = new LocalPublisherProvider(storage, new LocalContentStore(storage));
    const publishUseCase = new PublishDocumentUseCase(publisher, stubIdentityProvider);
    const doc = createTestDocument(3);
    const manager = new DocumentManager();
    manager.load(doc, 'parity-doc');
    const publication = publishUseCase.execute(manager);
    
    // Load the same snapshot twice (simulating Editor and World View).
    // In Test 14 (Editor / World parity: same snapshot → same state)
    const loadSnapshotUseCase = new LoadPublishedSnapshotUseCase(publisher, serializer);
    const loaded1 = loadSnapshotUseCase.execute(publication.id);
    const loaded2 = loadSnapshotUseCase.execute(publication.id);
        
    const d1 = loaded1 instanceof Document ? loaded1 : new Document({ world: loaded1.world, metadata: loaded1.metadata });
    const d2 = loaded2 instanceof Document ? loaded2 : new Document({ world: loaded2.world, metadata: loaded2.metadata });
    
    const json1 = JSON.stringify(d1.world.toJSON());
    const json2 = JSON.stringify(d2.world.toJSON());
    assert(json1 === json2, 'same snapshot produces identical world state in both loads');
    
    // And identical document state.

    // Ensure we pass Document instances to the serializer
    const doc1 = loaded1 instanceof Document ? loaded1 : Document.fromJSON(loaded1);
    const doc2 = loaded2 instanceof Document ? loaded2 : Document.fromJSON(loaded2);
    
    const docJson1 = JSON.stringify(serializer.serialize(doc1));
    const docJson2 = JSON.stringify(serializer.serialize(doc2));
    assert(docJson1 === docJson2, 'same snapshot produces identical document state');
    console.log('✓ Editor/World parity with published snapshots');
}
console.log('\nAll durable documents tests passed.');
