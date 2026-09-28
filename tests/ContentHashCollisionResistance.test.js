// Content hashes bind signed records to their bytes, so a forged build that
// matches a Publication's hash must never verify. 32-bit FNV-1a, the old
// content hash, can be matched by anyone in milliseconds: a legacy hash is
// honored only for this device's own data, and never for bytes from a
// peer, gateway or announcement.
import { Brick } from '../core/Brick.js';
import { Building } from '../core/Building.js';
import { ContentReference } from '../core/ContentReference.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { Position } from '../core/Position.js';
import { World } from '../core/World.js';
import { computeDeterministicGridPosition } from '../core/DeterministicGridPlacement.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import {
    computeContentHash, computeFnv1a32, contentHashAlgorithm, contentHashMatches
} from '../serializer/contentHash.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { Publication } from '../publisher/Publication.js';
import { LoadPublishedWorldSessionUseCase } from '../application/publication/LoadPublishedWorldSessionUseCase.js';
import { PublishDocumentUseCase } from '../application/publication/PublishDocumentUseCase.js';
import { DocumentManager } from '../application/document/DocumentManager.js';
import { CheckRecoveryUseCase } from '../application/document/CheckRecoveryUseCase.js';
import { StoreSnapshotContentUseCase } from '../application/snapshot/materialization/StoreSnapshotContentUseCase.js';
import { StoreSnapshotContentOutcome } from '../application/snapshot/materialization/StoreSnapshotContentOutcome.js';
import { LocalRecoveryStore } from '../persistence/LocalRecoveryStore.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

const stubIdentityProvider = {
    currentUser: () => ({ username: 'alice', displayName: 'alice', providerId: 'stub' }),
    sign: (data) => ({ signedBy: 'alice', providerId: 'stub', data })
};

function makeDocument(title, brickCount) {
    const world = new World();
    const building = new Building();
    world.addBuilding(building);
    for (let i = 0; i < brickCount; i++) {
        building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(i, 0.5, 0) }));
    }
    return new Document({ world, metadata: new DocumentMetadata({ title }) });
}

function canonical(document) {
    return JSON.stringify(document.toJSON());
}

// A different, valid document whose FNV-1a hash equals `targetHash`: three
// characters in its title join the forward state of the text before them to
// the backward state of the text after them (FNV-1a is invertible).
function forgeFnvCollision(targetHash) {
    const mark = 'EVIL@@@';
    const text = canonical(makeDocument('Totally different ' + mark, 50));
    const at = text.indexOf(mark);
    const head = text.slice(0, at + 4);
    const tail = text.slice(at + 7);
    const prime = 0x01000193;
    const inverse = 0x359c449b;
    let forward = 0x811c9dc5;
    for (let i = 0; i < head.length; i++) forward = Math.imul(forward ^ head.charCodeAt(i), prime) >>> 0;
    let backward = parseInt(targetHash, 16);
    for (let i = tail.length - 1; i >= 0; i--) backward = ((Math.imul(backward, inverse) >>> 0) ^ tail.charCodeAt(i)) >>> 0;
    for (let c3 = 0x4e00; c3 < 0x9fff; c3++) {
        const beforeC3 = ((Math.imul(backward, inverse) >>> 0) ^ c3) >>> 0;
        for (let c2 = 0x4e00; c2 < 0x9fff; c2++) {
            const beforeC2 = ((Math.imul(beforeC3, inverse) >>> 0) ^ c2) >>> 0;
            const c1 = ((Math.imul(beforeC2, inverse) >>> 0) ^ forward) >>> 0;
            if (c1 >= 0x4e00 && c1 < 0x9fff) return head + String.fromCharCode(c1, c2, c3) + tail;
        }
    }
    throw new Error('no collision found');
}

const original = canonical(makeDocument('My House', 3));
const forged = forgeFnvCollision(computeFnv1a32(original));

{
    assert(computeFnv1a32(forged) === computeFnv1a32(original), 'the forgery really collides under FNV-1a');
    assert(new DocumentSerializer().deserialize(JSON.parse(forged)).world.getBuildings()[0].getBricks().length === 50,
        'the forgery is a valid, different document');
    console.log('✓ an FNV-1a collision for a real document is found at once');
}

{
    const hash = computeContentHash(original);
    assert(/^[0-9a-f]{64}$/.test(hash) && contentHashAlgorithm(hash) === 'sha256', 'content hashes are SHA-256');
    assert(computeContentHash(forged) !== hash, 'the forgery has a different SHA-256 hash');
    const reference = new ContentReference({ hash });
    assert(reference.algorithm === 'sha256', 'a reference records its algorithm');
    assert(reference.verify(original), 'the genuine bytes verify');
    assert(!reference.verify(forged), 'the forged bytes do not');
    assert(reference.verify(new TextEncoder().encode(original)), 'genuine bytes verify as a Uint8Array too');
    console.log('✓ a SHA-256 content reference refuses the forgery');
}

{
    const legacy = new ContentReference({ hash: computeFnv1a32(original) });
    assert(legacy.algorithm === 'fnv1a-32', 'a legacy hash is recognized by its length');
    assert(!legacy.verify(original), 'a legacy hash vouches for nothing by default, not even genuine bytes');
    assert(!legacy.verify(forged), 'nor for the forgery');
    assert(legacy.verify(original, { allowLegacy: true }), 'it is honored only when the caller opts in for its own data');
    console.log('✓ a legacy FNV-1a hash is refused unless the caller trusts the source');
}

{
    const reference = new ContentReference({ hash: computeContentHash('{"a":"�"}') });
    assert(!reference.verify('{"a":"\uD800"}'), 'a lone surrogate is not accepted as the U+FFFD it encodes to');
    const invalidUtf8 = new Uint8Array([0x7b, 0x22, 0x61, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d]);
    assert(!reference.verify(invalidUtf8), 'invalid UTF-8 is not decoded leniently into U+FFFD');
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('{"a":1}')]);
    assert(!new ContentReference({ hash: computeContentHash('{"a":1}') }).verify(withBom), 'a byte-order mark is not silently dropped');
    assert(!contentHashMatches('x', 'not-a-hash'), 'an unrecognized hash matches nothing');
    console.log('✓ different bytes can never decode to the same hashed text');
}

{
    const storage = new InMemoryStorageProvider();
    const contentStore = new LocalContentStore(storage);
    const publisher = new LocalPublisherProvider(storage, contentStore);
    const manager = new DocumentManager();
    manager.load(makeDocument('My House', 3), 'doc-1');
    const publication = new PublishDocumentUseCase(publisher, stubIdentityProvider).execute(manager);
    assert(contentHashAlgorithm(publication.contentHash) === 'sha256', 'a new Publication commits to a SHA-256 hash');
    assert(publication.contentReference.algorithm === 'sha256', 'and says so in its content reference');
    const session = new LoadPublishedWorldSessionUseCase(publisher, new DocumentSerializer(), contentStore).execute(publication);
    assert(session.getDocument().metadata.title === 'My House', 'it loads in World View');
    console.log('✓ publishing hashes with SHA-256');
}

// A Publication made before this change: FNV-1a hash, bytes under content:<fnv>.
function legacyPublication(storage, { own }) {
    const fnv = computeFnv1a32(original);
    storage.save('content:' + fnv, original);
    const publication = new Publication({
        id: 'legacy-publication',
        documentId: 'doc-legacy',
        title: 'My House',
        author: 'alice',
        providerId: 'local',
        publishedAt: new Date('2026-09-20T00:00:00Z'),
        contentHash: fnv,
        schemaVersion: 2,
        contentReference: new ContentReference({ hash: fnv, algorithm: 'fnv1a-32', storage: 'local' })
    });
    if (own) storage.save('forkbuild-publications', [publication.toJSON()]);
    return publication;
}

{
    const storage = new InMemoryStorageProvider();
    const contentStore = new LocalContentStore(storage);
    const publisher = new LocalPublisherProvider(storage, contentStore);
    const publication = legacyPublication(storage, { own: true });
    assert(publisher.isOwnPublication(publication), 'the device knows it published this itself');
    const session = new LoadPublishedWorldSessionUseCase(publisher, new DocumentSerializer(), contentStore).execute(publication);
    assert(session.getDocument().metadata.title === 'My House', 'this device\'s own legacy Publication still loads');
    console.log('✓ a Publication this device made before the change still opens');
}

{
    const storage = new InMemoryStorageProvider();
    const contentStore = new LocalContentStore(storage);
    const publisher = new LocalPublisherProvider(storage, contentStore);
    const publication = legacyPublication(storage, { own: false });
    let message = null;
    try {
        new LoadPublishedWorldSessionUseCase(publisher, new DocumentSerializer(), contentStore).execute(publication);
    } catch (error) {
        message = error.message;
    }
    assert(message && message.includes('old, insecure content hash'), `someone else's legacy Publication is refused, saying why (got: ${message})`);

    const ownRecord = legacyPublication(new InMemoryStorageProvider(), { own: true }).toJSON();
    storage.save('forkbuild-publications', [{ ...ownRecord, contentHash: '0badc0de' }]);
    assert(!publisher.isOwnPublication(publication), 'a record with the same id but another hash does not make it this device\'s own');
    console.log('✓ someone else\'s legacy Publication is refused');
}

{
    const storage = new InMemoryStorageProvider();
    const useCase = new StoreSnapshotContentUseCase(new LocalContentStore(storage));
    const forgedResult = await useCase.execute({ contentHash: computeContentHash(original), bytes: forged });
    assert(forgedResult.outcome === StoreSnapshotContentOutcome.HASH_MISMATCH, 'forged Snapshot bytes are not stored');
    const legacyResult = await useCase.execute({ contentHash: computeFnv1a32(original), bytes: forged });
    assert(legacyResult.outcome === StoreSnapshotContentOutcome.HASH_MISMATCH, 'nor are bytes offered under a legacy hash');
    const genuine = await useCase.execute({ contentHash: computeContentHash(original), bytes: original });
    assert(genuine.outcome === StoreSnapshotContentOutcome.STORED, 'genuine bytes are stored');
    console.log('✓ Snapshot bytes from elsewhere must match a SHA-256 hash');
}

{
    const storage = new InMemoryStorageProvider();
    const recoveryStore = new LocalRecoveryStore(storage);
    const document = JSON.parse(original);
    recoveryStore.save('doc-1', { documentId: 'doc-1', revision: 3, savedAt: '2026-09-20T00:00:00.000Z', contentHash: computeFnv1a32(original), document });
    const result = new CheckRecoveryUseCase(recoveryStore, storage).execute('doc-1');
    assert(result.available, 'a crash-recovery checkpoint written before the change still recovers');
    console.log('✓ this device\'s own legacy recovery checkpoint still recovers');
}

{
    // Values from before the change: switching the content hash must not
    // move every build that has no placement of its own.
    const a = computeDeterministicGridPosition('publication-123');
    const b = computeDeterministicGridPosition('3f9c1a2e-0000-4000-8000-000000000001');
    assert(a.x === 1920 && a.z === 640, `grid position unchanged (got ${a.x}, ${a.z})`);
    assert(b.x === 1120 && b.z === 2320, `grid position unchanged (got ${b.x}, ${b.z})`);
    console.log('✓ deterministic layout is unchanged');
}

console.log('\n✅ All ContentHashCollisionResistance tests passed.');
