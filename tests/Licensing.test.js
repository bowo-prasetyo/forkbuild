import { License, LicenseId } from '../core/License.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Publication } from '../publisher/Publication.js';
import { ForkDocumentUseCase } from '../application/ForkDocumentUseCase.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { StorageProvider } from '../storage/StorageProvider.js';

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function assertThrows(fn, expectedMessage, message) {
    try { fn(); assert(false, message); }
    catch (e) { assert(e.message.includes(expectedMessage), `${message}: ${e.message}`); }
}

function createDoc(title, author) {
    const w = new World(); w.addBuilding(new Building());
    return new Document({ world: w, metadata: new DocumentMetadata({ title, author }) });
}

// 1. License Permissions Matrix
{
    assert(new License({ id: LicenseId.CC0_1_0 }).forkAllowed === true, 'CC0 allows fork');
    assert(new License({ id: LicenseId.CC_BY_4_0 }).forkAllowed === true, 'CC BY allows fork');
    assert(new License({ id: LicenseId.CC_BY_ND_4_0 }).forkAllowed === false, 'CC BY-ND prohibits fork');
    assert(new License({ id: LicenseId.ALL_RIGHTS_RESERVED }).forkAllowed === false, 'ARR prohibits fork');
    assert(new License({ id: LicenseId.UNSPECIFIED }).forkAllowed === false, 'Unspecified prohibits fork');
    console.log('✓ License permissions matrix');
}

// 2. Publication Serialization includes License
{
    const pub = new Publication({
        id: 'p1', documentId: 'd1', title: 'T', author: 'A', providerId: 'local', publishedAt: new Date(),
        license: new License({ id: LicenseId.CC_BY_4_0, attribution: { author: 'Orig', title: 'OrigT' } })
    });
    const json = pub.toJSON();
    const restored = Publication.fromJSON(json);
    assert(restored.license.id === LicenseId.CC_BY_4_0, 'License ID survives round-trip');
    assert(restored.license.attribution.author === 'Orig', 'Attribution survives round-trip');
    console.log('✓ Publication serialization includes License');
}

// 3. Forking prohibited licenses throws
{
    const storage = new InMemoryStorageProvider();
    const serializer = new DocumentSerializer();
    const forkUseCase = new ForkDocumentUseCase(storage, serializer);
    
    const doc = createDoc('ND Work', 'Alice');
    storage.save(doc.world.id, serializer.serialize(doc));
    
    const ndPub = new Publication({
        id: 'p-nd', documentId: doc.world.id, title: 'ND Work', author: 'Alice',
        providerId: 'local', publishedAt: new Date(),
        license: new License({ id: LicenseId.CC_BY_ND_4_0 })
    });
    
    assertThrows(
        () => forkUseCase.execute(doc.world.id, null, ndPub),
        'not permitted under license CC-BY-ND-4.0',
        'Forking ND work rejected'
    );
    console.log('✓ Forking prohibited licenses throws');
}

// 4. Forking permitted licenses stamps attribution
{
    const storage = new InMemoryStorageProvider();
    const serializer = new DocumentSerializer();
    const forkUseCase = new ForkDocumentUseCase(storage, serializer);
    
    const doc = createDoc('Open Work', 'Alice');
    storage.save(doc.world.id, serializer.serialize(doc));
    
    const byPub = new Publication({
        id: 'p-by', documentId: doc.world.id, title: 'Open Work', author: 'Alice',
        providerId: 'local', publishedAt: new Date(),
        license: new License({ id: LicenseId.CC_BY_4_0 })
    });
    
    const stubIdentity = { currentUser: () => ({ username: 'Bob' }) };
    const forkedDoc = forkUseCase.execute(doc.world.id, stubIdentity, byPub);
    
    assert(forkedDoc.metadata.title === 'Fork of Open Work', 'Fork title applied');
    assert(forkedDoc.metadata.author === 'Bob', 'Fork author applied');
    assert(forkedDoc.metadata.license.id === LicenseId.CC_BY_4_0, 'License inherited');
    assert(forkedDoc.metadata.license.attribution.author === 'Alice', 'Attribution author stamped');
    assert(forkedDoc.metadata.license.attribution.sourcePublicationId === 'p-by', 'Attribution source stamped');
    console.log('✓ Forking permitted licenses stamps attribution');
}

// 5. Unspecified legacy documents default to prohibited
{
    const storage = new InMemoryStorageProvider();
    const serializer = new DocumentSerializer();
    const forkUseCase = new ForkDocumentUseCase(storage, serializer);
    
    const doc = createDoc('Legacy', 'Alice');
    // Simulate legacy document without license metadata
    const json = serializer.serialize(doc);
    delete json.metadata.license; 
    storage.save(doc.world.id, json);
    
    const legacyPub = new Publication({
        id: 'p-leg', documentId: doc.world.id, title: 'Legacy', author: 'Alice',
        providerId: 'local', publishedAt: new Date()
        // No license provided, defaults to UNSPECIFIED
    });
    
    assertThrows(
        () => forkUseCase.execute(doc.world.id, null, legacyPub),
        'not permitted',
        'Legacy unspecified license rejected'
    );
    console.log('✓ Unspecified legacy documents default to prohibited');
}

console.log('\nAll licensing tests passed.');
