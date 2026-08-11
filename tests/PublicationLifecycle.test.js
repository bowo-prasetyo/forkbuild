import { Brick } from '../core/Brick.js';
import { Building } from '../core/Building.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { Position } from '../core/Position.js';
import { World } from '../core/World.js';
import { DOCUMENT_SCHEMA_VERSION } from '../core/documentSchema.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { DocumentValidator } from '../serializer/DocumentValidator.js';
import { computeContentHash } from '../serializer/contentHash.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { Publication } from '../publisher/Publication.js';
import { PublishDocumentUseCase } from '../application/PublishDocumentUseCase.js';
import { UnpublishDocumentUseCase } from '../application/UnpublishDocumentUseCase.js';
import { LoadPublishedSnapshotUseCase } from '../application/LoadPublishedSnapshotUseCase.js';
import { DocumentManager } from '../application/DocumentManager.js';
import { CommandHistory } from '../application/CommandHistory.js';
import { MoveBrickCommand } from '../application/commands/MoveBrickCommand.js';

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
        metadata: new DocumentMetadata({ title: 'Publication Test', author: 'tester' })
    });
}

// ---------------------------------------------------------------------
// 1. Publishing never mutates the editable Document
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const publisher = new LocalPublisherProvider(storage);
    const publishUseCase = new PublishDocumentUseCase(publisher, stubIdentityProvider);
    const doc = createTestDocument();
    const manager = new DocumentManager();
    manager.load(doc, 'test-doc');

    const worldJsonBefore = JSON.stringify(doc.world.toJSON());
    const metadataTitleBefore = doc.metadata.title;

    publishUseCase.execute(manager);

    assert(JSON.stringify(doc.world.toJSON()) === worldJsonBefore,
        'publishing does not mutate the document world');
    assert(doc.metadata.title === metadataTitleBefore,
        'publishing does not mutate document metadata');

    console.log('✓ invariant 1: publishing never mutates the editable Document');
}

// ---------------------------------------------------------------------
// 2. A publication represents a specific snapshot
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const publisher = new LocalPublisherProvider(storage);
    const publishUseCase = new PublishDocumentUseCase(publisher, stubIdentityProvider);
    const doc = createTestDocument();
    const manager = new DocumentManager();
    manager.load(doc, 'test-doc');

    const publication = publishUseCase.execute(manager);

    assert(publication.id !== null, 'publication has an id');
    assert(publication.documentId === doc.world.id, 'publication references the document');
    assert(publication.contentHash !== null, 'publication has a content hash');
    assert(publication.schemaVersion === DOCUMENT_SCHEMA_VERSION, 'publication records schema version');
    assert(publication.author === 'alice', 'publication attributed via identity provider');

    // Verify the snapshot is stored and matches.
    const snapshotJson = publisher.loadSnapshot(publication.id);
    assert(snapshotJson !== null, 'snapshot is stored');
    assert(snapshotJson.schemaVersion === DOCUMENT_SCHEMA_VERSION, 'snapshot has schemaVersion');
    assert(snapshotJson.world.id === doc.world.id, 'snapshot world id matches');

    // Verify integrity.
    assert(publisher.verifySnapshot(publication.id, publication.contentHash) === true,
        'snapshot integrity verified');

    console.log('✓ invariant 2: a publication represents a specific snapshot');
}

// ---------------------------------------------------------------------
// 3. Subsequent edits do not modify an existing publication
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const publisher = new LocalPublisherProvider(storage);
    const publishUseCase = new PublishDocumentUseCase(publisher, stubIdentityProvider);
    const doc = createTestDocument();
    const manager = new DocumentManager();
    manager.load(doc, 'test-doc');
    const history = new CommandHistory({ world: doc.world });
    manager.trackCommandHistory(history);

    const publication = publishUseCase.execute(manager);
    const snapshotBefore = JSON.stringify(publisher.loadSnapshot(publication.id));

    // Edit the document.
    const buildingId = doc.world.getBuildings()[0].id;
    const brickId = doc.world.getBuildings()[0].getBricks()[0].id;
    history.execute(new MoveBrickCommand({
        worldId: doc.world.id, buildingId, brickId, delta: { x: 10, y: 0, z: 0 }
    }));
    manager.markSaved();

    // The published snapshot must be unchanged.
    const snapshotAfter = JSON.stringify(publisher.loadSnapshot(publication.id));
    assert(snapshotBefore === snapshotAfter,
        'published snapshot unchanged after editing');
    assert(publisher.verifySnapshot(publication.id, publication.contentHash) === true,
        'snapshot integrity still valid after editing');

    console.log('✓ invariant 3: subsequent edits do not modify an existing publication');
}

// ---------------------------------------------------------------------
// 4. Publishing again creates a new publication
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const publisher = new LocalPublisherProvider(storage);
    const publishUseCase = new PublishDocumentUseCase(publisher, stubIdentityProvider);
    const doc = createTestDocument();
    const manager = new DocumentManager();
    manager.load(doc, 'test-doc');
    const history = new CommandHistory({ world: doc.world });
    manager.trackCommandHistory(history);

    const pub1 = publishUseCase.execute(manager);

    // Edit.
    const buildingId = doc.world.getBuildings()[0].id;
    const brickId = doc.world.getBuildings()[0].getBricks()[0].id;
    history.execute(new MoveBrickCommand({
        worldId: doc.world.id, buildingId, brickId, delta: { x: 5, y: 0, z: 0 }
    }));

    const pub2 = publishUseCase.execute(manager);

    assert(pub1.id !== pub2.id, 'each publish creates a new publication');
    assert(pub1.contentHash !== pub2.contentHash, 'different content produces different hash');

    // Both snapshots are independently loadable.
    const snap1 = publisher.loadSnapshot(pub1.id);
    const snap2 = publisher.loadSnapshot(pub2.id);
    assert(snap1.world.id === snap2.world.id, 'both reference the same document');
    assert(JSON.stringify(snap1) !== JSON.stringify(snap2), 'snapshots capture different states');

    console.log('✓ invariant 4: publishing again creates a new publication');
}

// ---------------------------------------------------------------------
// 5. Unpublishing does not delete the editable Document
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const serializer = new DocumentSerializer();
    const publisher = new LocalPublisherProvider(storage);
    const publishUseCase = new PublishDocumentUseCase(publisher, stubIdentityProvider);
    const unpublishUseCase = new UnpublishDocumentUseCase(publisher);
    const doc = createTestDocument();
    const manager = new DocumentManager();
    manager.load(doc, 'test-doc');

    // Save the document first.
    storage.save(doc.world.id, serializer.serialize(doc));

    const publication = publishUseCase.execute(manager);
    assert(storage.load(doc.world.id) !== null, 'document exists before unpublish');

    unpublishUseCase.execute(publication.id);

    // The editable document must still exist.
    assert(storage.load(doc.world.id) !== null, 'editable document survives unpublish');

    // The publication record and snapshot are gone.
    const records = storage.load('forkbuild-publications') || [];
    assert(!records.some((r) => r.id === publication.id), 'publication record removed');
    let snapshotGone = false;
    try {
        publisher.loadSnapshot(publication.id);
    } catch (e) {
        snapshotGone = true;
    }
    assert(snapshotGone === true, 'snapshot removed after unpublish');

    console.log('✓ invariant 5: unpublishing does not delete the editable Document');
}

// ---------------------------------------------------------------------
// 6. An unpublished document has no active publication
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const publisher = new LocalPublisherProvider(storage);
    const doc = createTestDocument();
    const manager = new DocumentManager();
    manager.load(doc, 'test-doc');

    const records = storage.load('forkbuild-publications') || [];
    const docPublications = records.filter((r) => r.documentId === doc.world.id);
    assert(docPublications.length === 0, 'unpublished document has no publications');

    console.log('✓ invariant 6: an unpublished document has no active publication');
}

// ---------------------------------------------------------------------
// 7. A publication can be reconstructed from serialized data
// ---------------------------------------------------------------------
{
    const pub = new Publication({
        id: 'pub-1',
        documentId: 'doc-1',
        title: 'Test',
        author: 'alice',
        providerId: 'local',
        publishedAt: new Date('2026-01-01T00:00:00Z'),
        contentHash: 'abcd1234',
        schemaVersion: 1
    });
    const json = pub.toJSON();
    const restored = Publication.fromJSON(json);

    assert(restored.id === 'pub-1', 'id round-trips');
    assert(restored.documentId === 'doc-1', 'documentId round-trips');
    assert(restored.contentHash === 'abcd1234', 'contentHash round-trips');
    assert(restored.schemaVersion === 1, 'schemaVersion round-trips');
    assert(restored.title === 'Test', 'title round-trips');
    assert(restored.author === 'alice', 'author round-trips');

    console.log('✓ invariant 7: a publication can be reconstructed from serialized data');
}

// ---------------------------------------------------------------------
// 8. Publication metadata is distinct from document metadata
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const publisher = new LocalPublisherProvider(storage);
    const publishUseCase = new PublishDocumentUseCase(publisher, stubIdentityProvider);
    const doc = createTestDocument();
    const manager = new DocumentManager();
    manager.load(doc, 'test-doc');

    const publication = publishUseCase.execute(manager);

    // Publication has its own identity fields.
    assert(publication.id !== doc.world.id, 'publication id ≠ document id');
    assert(publication.publishedAt instanceof Date, 'publication has its own timestamp');
    assert(publication.providerId === 'local', 'publication has provider identity');

    // Document metadata is separate.
    assert(doc.metadata.protocolVersion !== undefined, 'document has protocolVersion');
    assert(publication.schemaVersion !== undefined, 'publication has schemaVersion');

    console.log('✓ invariant 8: publication metadata is distinct from document metadata');
}

// ---------------------------------------------------------------------
// 9. Published data passes through schema migration/validation pipeline
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const publisher = new LocalPublisherProvider(storage);
    const publishUseCase = new PublishDocumentUseCase(publisher, stubIdentityProvider);
    const loadSnapshotUseCase = new LoadPublishedSnapshotUseCase(publisher);
    const doc = createTestDocument();
    const manager = new DocumentManager();
    manager.load(doc, 'test-doc');

    const publication = publishUseCase.execute(manager);

    // The snapshot should pass validation.
    const snapshotJson = publisher.loadSnapshot(publication.id);
    const validation = DocumentValidator.validate(snapshotJson);
    assert(validation.valid === true, 'published snapshot passes validation');

    // Loading through the serializer pipeline works.
    const loadedDoc = loadSnapshotUseCase.execute(publication.id);
    assert(loadedDoc.world.id === doc.world.id, 'loaded snapshot has correct world id');
    assert(loadedDoc.metadata.title === doc.metadata.title, 'loaded snapshot has correct title');

    console.log('✓ invariant 9: published data passes through migration/validation pipeline');
}

// ---------------------------------------------------------------------
// 10. There is no editing capability hidden inside Publication
// ---------------------------------------------------------------------
{
    const pub = new Publication({
        id: 'pub-1',
        documentId: 'doc-1',
        title: 'Test',
        author: 'alice',
        providerId: 'local',
        publishedAt: new Date()
    });

    // Publication is pure data: only getters and serialization.
    const pubKeys = Object.getOwnPropertyNames(Object.getPrototypeOf(pub));
    const methodKeys = pubKeys.filter((k) => typeof pub[k] === 'function' && k !== 'constructor');
    const allowedMethods = ['toJSON'];
    for (const method of methodKeys) {
        assert(allowedMethods.includes(method) || method.startsWith('get ') || method === 'toJSON',
            `Publication method "${method}" is read-only`);
    }

    // No execute, no mutate, no command creation.
    assert(typeof pub.execute !== 'function', 'Publication has no execute method');
    assert(typeof pub.mutate !== 'function', 'Publication has no mutate method');

    console.log('✓ invariant 10: no editing capability hidden inside Publication');
}

// ---------------------------------------------------------------------
// 11. FLAGSHIP: publish → edit → verify snapshot unchanged → unpublish
//     → verify document intact → republish → verify new snapshot
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const serializer = new DocumentSerializer();
    const publisher = new LocalPublisherProvider(storage);
    const publishUseCase = new PublishDocumentUseCase(publisher, stubIdentityProvider);
    const unpublishUseCase = new UnpublishDocumentUseCase(publisher);
    const loadSnapshotUseCase = new LoadPublishedSnapshotUseCase(publisher);
    const doc = createTestDocument(4);
    const manager = new DocumentManager();
    manager.load(doc, 'flagship-doc');
    const history = new CommandHistory({ world: doc.world });
    manager.trackCommandHistory(history);

    // Save the document.
    storage.save(doc.world.id, serializer.serialize(doc));

    // Publish.
    const pub1 = publishUseCase.execute(manager);
    const snapshot1 = JSON.stringify(publisher.loadSnapshot(pub1.id));

    // Edit.
    const buildingId = doc.world.getBuildings()[0].id;
    const brickId = doc.world.getBuildings()[0].getBricks()[0].id;
    history.execute(new MoveBrickCommand({
        worldId: doc.world.id, buildingId, brickId, delta: { x: 100, y: 0, z: 0 }
    }));
    history.execute(new MoveBrickCommand({
        worldId: doc.world.id, buildingId, brickId, delta: { x: 0, y: 5, z: 0 }
    }));

    // Snapshot unchanged.
    const snapshot1AfterEdit = JSON.stringify(publisher.loadSnapshot(pub1.id));
    assert(snapshot1 === snapshot1AfterEdit, 'flagship: snapshot unchanged after editing');

    // Unpublish.
    assert(unpublishUseCase.execute(pub1.id) === true, 'flagship: unpublish succeeds');
    assert(storage.load(doc.world.id) !== null, 'flagship: document survives unpublish');

    // Republish (new snapshot reflecting the edits).
    const pub2 = publishUseCase.execute(manager);
    const snapshot2 = JSON.stringify(publisher.loadSnapshot(pub2.id));
    assert(snapshot2 !== snapshot1, 'flagship: new snapshot differs from original');
    assert(pub2.id !== pub1.id, 'flagship: new publication has new id');

    // Load the new snapshot and verify it reflects the edits.
    const loadedDoc = loadSnapshotUseCase.execute(pub2.id);
    const loadedBrick = loadedDoc.world.getBuildings()[0].getBricks()[0];
    assert(loadedBrick.position.x === 100, 'flagship: loaded snapshot reflects edit');
    assert(loadedBrick.position.y === 5.5, 'flagship: loaded snapshot reflects second edit');

    console.log('✓ FLAGSHIP: publish → edit → verify → unpublish → republish → verify');
}

// ---------------------------------------------------------------------
// 12. Content hash determinism
// ---------------------------------------------------------------------
{
    const json = JSON.stringify({ a: 1, b: 2 });
    const hash1 = computeContentHash(json);
    const hash2 = computeContentHash(json);
    assert(hash1 === hash2, 'same input produces same hash');
    assert(typeof hash1 === 'string' && hash1.length === 8, 'hash is 8-char hex');

    const differentJson = JSON.stringify({ a: 1, b: 3 });
    const hash3 = computeContentHash(differentJson);
    assert(hash3 !== hash1, 'different content produces different hash');

    console.log('✓ content hash determinism');
}

// ---------------------------------------------------------------------
// 13. Unpublish returns false for non-existent publication
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const publisher = new LocalPublisherProvider(storage);
    const unpublishUseCase = new UnpublishDocumentUseCase(publisher);

    assert(unpublishUseCase.execute('non-existent-id') === false,
        'unpublishing non-existent publication returns false');

    console.log('✓ unpublish returns false for non-existent publication');
}

console.log('\nAll publication lifecycle tests passed.');
