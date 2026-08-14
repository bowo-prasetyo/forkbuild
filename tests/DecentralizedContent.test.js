import { ContentReference } from '../core/ContentReference.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { Publication } from '../publisher/Publication.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { License, LicenseId } from '../core/License.js';
import { PublishDocumentUseCase } from '../application/PublishDocumentUseCase.js';
import { DocumentManager } from '../application/DocumentManager.js';
import { LoadPublishedWorldSessionUseCase } from '../application/LoadPublishedWorldSessionUseCase.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { computeContentHash } from '../serializer/contentHash.js';

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

function createTestDocument(title = 'Test') {
    const world = new World();
    const building = new Building({ creator: 'tester' });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    return new Document({
        world,
        metadata: new DocumentMetadata({ title, author: 'tester', license: new License({ id: LicenseId.CC_BY_4_0 }) })
    });
}

// 1. ContentReference serialization
{
    const ref = new ContentReference({ hash: 'abc', algorithm: 'sha256', size: 100, uri: 'ipfs://xyz' });
    const json = ref.toJSON();
    const restored = ContentReference.fromJSON(json);
    assert(restored.hash === 'abc', 'hash preserved');
    assert(restored.algorithm === 'sha256', 'algorithm preserved');
    assert(restored.uri === 'ipfs://xyz', 'uri preserved');
    console.log('✓ ContentReference serialization');
}

// 2. LocalContentStore stores by hash
{
    const storage = new InMemoryStorageProvider();
    const store = new LocalContentStore(storage);
    const bytes = JSON.stringify({ hello: 'world' });
    const ref = store.put(bytes);
    assert(store.has(ref), 'store has content');
    const retrieved = store.get(ref);
    assert(retrieved === bytes, 'retrieved bytes match');
    console.log('✓ LocalContentStore stores by hash');
}

// 3. Content integrity
{
    const ref = new ContentReference({ hash: 'expected' });
    assert(!ref.verify('actual'), 'mismatched hash fails verification');
    const actualBytes = JSON.stringify({ a: 1 });
    const actualHash = computeContentHash(actualBytes);
    const validRef = new ContentReference({ hash: actualHash });
    assert(validRef.verify(actualBytes), 'matched hash passes verification');
    console.log('✓ Content integrity verification');
}

// 4. Publication contains ContentReference
{
    const storage = new InMemoryStorageProvider();
    const contentStore = new LocalContentStore(storage);
    const publisher = new LocalPublisherProvider(storage, contentStore);
    const publishUseCase = new PublishDocumentUseCase(publisher, stubIdentityProvider);
    const doc = createTestDocument();
    const manager = new DocumentManager();
    manager.load(doc, 'test-doc');
    const pub = publishUseCase.execute(manager);
    
    assert(pub.contentReference !== null, 'publication has contentReference');
    assert(pub.contentReference.hash === pub.contentHash, 'contentHash derived from reference');
    assert(storage.load(`content:${pub.contentReference.hash}`) !== null, 'content stored by hash');
    console.log('✓ Publication contains ContentReference');
}

// 5. Publication bytes are immutable
{
    const storage = new InMemoryStorageProvider();
    const contentStore = new LocalContentStore(storage);
    const publisher = new LocalPublisherProvider(storage, contentStore);
    const publishUseCase = new PublishDocumentUseCase(publisher, stubIdentityProvider);
    const doc = createTestDocument();
    const manager = new DocumentManager();
    manager.load(doc, 'test-doc');
    const pub1 = publishUseCase.execute(manager);
    
    // Modify document and publish again
    doc.world.addBuilding(new Building({ creator: 'tester2' }));
    const pub2 = publishUseCase.execute(manager);
    
    assert(pub1.contentReference.hash !== pub2.contentReference.hash, 'different content produces different hash');
    assert(storage.load(`content:${pub1.contentReference.hash}`) !== null, 'original content remains intact');
    console.log('✓ Publication bytes are immutable');
}

// 6. ResolvePublicationUseCase retrieves through ContentStore
{
    const storage = new InMemoryStorageProvider();
    const contentStore = new LocalContentStore(storage);
    const publisher = new LocalPublisherProvider(storage, contentStore);
    const publishUseCase = new PublishDocumentUseCase(publisher, stubIdentityProvider);
    const doc = createTestDocument();
    const manager = new DocumentManager();
    manager.load(doc, 'test-doc');
    const pub = publishUseCase.execute(manager);
    
    const loadUseCase = new LoadPublishedWorldSessionUseCase(publisher, new DocumentSerializer(), contentStore);
    const session = loadUseCase.execute(pub);
    assert(session.getDocument().world.id === doc.world.id, 'resolved document matches original');
    console.log('✓ Resolution retrieves through ContentStore');
}

// 7. Tampered decentralized content fails
{
    const storage = new InMemoryStorageProvider();
    const contentStore = new LocalContentStore(storage);
    const publisher = new LocalPublisherProvider(storage, contentStore);
    const publishUseCase = new PublishDocumentUseCase(publisher, stubIdentityProvider);
    const doc = createTestDocument();
    const manager = new DocumentManager();
    manager.load(doc, 'test-doc');
    const pub = publishUseCase.execute(manager);
    
    // Tamper with the content in the store
    const contentKey = `content:${pub.contentReference.hash}`;
    const tamperedJson = JSON.parse(storage.load(contentKey));
    tamperedJson.metadata.title = 'Tampered';
    storage.save(contentKey, JSON.stringify(tamperedJson));
    
    const loadUseCase = new LoadPublishedWorldSessionUseCase(publisher, new DocumentSerializer(), contentStore);
    let threw = false;
    try {
        loadUseCase.execute(pub);
    } catch (e) {
        threw = true;
        assert(e.message.includes('integrity check failed'), 'Tampered content rejected');
    }
    assert(threw, 'Tampered content must throw');
    console.log('✓ Tampered decentralized content fails');
}

// 8. Same content produces same hash
{
    const storage = new InMemoryStorageProvider();
    const contentStore = new LocalContentStore(storage);
    const bytes = JSON.stringify({ a: 1 });
    const ref1 = contentStore.put(bytes);
    const ref2 = contentStore.put(bytes);
    assert(ref1.hash === ref2.hash, 'Same content produces same hash');
    console.log('✓ Same content produces same hash');
}

// 9. Different content produces different hash
{
    const storage = new InMemoryStorageProvider();
    const contentStore = new LocalContentStore(storage);
    const ref1 = contentStore.put(JSON.stringify({ a: 1 }));
    const ref2 = contentStore.put(JSON.stringify({ a: 2 }));
    assert(ref1.hash !== ref2.hash, 'Different content produces different hash');
    console.log('✓ Different content produces different hash');
}

// 10. License survives decentralized resolution
{
    const storage = new InMemoryStorageProvider();
    const contentStore = new LocalContentStore(storage);
    const publisher = new LocalPublisherProvider(storage, contentStore);
    const publishUseCase = new PublishDocumentUseCase(publisher, stubIdentityProvider);
    const doc = createTestDocument();
    const manager = new DocumentManager();
    manager.load(doc, 'test-doc');
    const pub = publishUseCase.execute(manager);
    
    const loadUseCase = new LoadPublishedWorldSessionUseCase(publisher, new DocumentSerializer(), contentStore);
    const session = loadUseCase.execute(pub);
    assert(session.getPublication().license.id === LicenseId.CC_BY_4_0, 'License survives resolution');
    console.log('✓ License survives decentralized resolution');
}

// 11. Multiple placements share content
{
    const storage = new InMemoryStorageProvider();
    const contentStore = new LocalContentStore(storage);
    const bytes = JSON.stringify({ a: 1 });
    contentStore.put(bytes);
    contentStore.put(bytes);
    contentStore.put(bytes);
    
    // In a real IPFS store, this would be deduplicated. LocalContentStore just overwrites the same key.
    const keys = storage.list().filter(k => k.startsWith('content:'));
    assert(keys.length === 1, 'Multiple placements share the same content key');
    console.log('✓ Multiple placements share content');
}

// 12. FLAGSHIP: Publish -> Store -> Resolve -> Verify -> Session
{
    const storage = new InMemoryStorageProvider();
    const contentStore = new LocalContentStore(storage);
    const publisher = new LocalPublisherProvider(storage, contentStore);
    const publishUseCase = new PublishDocumentUseCase(publisher, stubIdentityProvider);
    const doc = createTestDocument('Flagship');
    const manager = new DocumentManager();
    manager.load(doc, 'flagship-doc');
    
    const pub = publishUseCase.execute(manager);
    assert(pub.contentReference.storage === 'local', 'Content stored locally');
    
    // Simulate decentralized retrieval via ContentStore
    const loadUseCase = new LoadPublishedWorldSessionUseCase(publisher, new DocumentSerializer(), contentStore);
    const session = loadUseCase.execute(pub);
    
    assert(session.getDocument().metadata.title === 'Flagship', 'Document resolved successfully');
    assert(session.getPublication().contentReference.hash === pub.contentReference.hash, 'Hash matches');
    console.log('✓ FLAGSHIP: Publish -> Store -> Resolve -> Verify -> Session');
}

console.log('\nAll decentralized content tests passed.');
