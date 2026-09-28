// Which of this device's own Worlds an old, legacy-hash catalog entry shares:
// the entry's bytes only name a Publication, and the answer comes from this
// device's own record of it, so bytes from anyone else can at most point at
// one of this device's own Worlds. Real LocalPublisherProvider and
// LocalContentStore over in-memory storage.
import { FindOwnSharedPublicationUseCase } from '../application/publication/sharing/FindOwnSharedPublicationUseCase.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { computeFnv1a32 } from '../serializer/contentHash.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// A World this device published before SHA-256, as its own record.
function ownRecord() {
    return new Publication({
        id: 'pub-castle',
        documentId: 'doc-castle',
        title: 'My Castle',
        author: 'alice',
        publishedAt: new Date('2026-08-01T00:00:00Z'),
        contentHash: '1234abcd',
        schemaVersion: 2,
        contentReference: new ContentReference({ hash: '1234abcd', algorithm: 'fnv1a-32', storage: 'local' })
    });
}

// A catalog entry whose wrapped bytes, as this device's content store holds
// them under their old hash, are `json`.
function entryWrapping(storage, json) {
    const text = typeof json === 'string' ? json : JSON.stringify(json);
    const hash = computeFnv1a32(text);
    storage.save(`content:${hash}`, text);
    return { id: 'entry-1', contentReference: new ContentReference({ hash, algorithm: 'fnv1a-32', storage: 'local' }) };
}

function setUp() {
    const storage = new InMemoryStorageProvider();
    storage.save('forkbuild-publications', [ownRecord().toJSON()]);
    const publisherProvider = new LocalPublisherProvider(storage);
    const useCase = new FindOwnSharedPublicationUseCase({ contentStore: new LocalContentStore(storage), publisherProvider });
    return { storage, publisherProvider, useCase };
}

// The entry's World, from this device's own record.
{
    const { storage, useCase } = setUp();
    const found = await useCase.find(entryWrapping(storage, ownRecord().toJSON()));
    assert(JSON.stringify(found) === JSON.stringify({ publicationId: 'pub-castle', documentId: 'doc-castle', title: 'My Castle' }),
        `an entry sharing this device's own World finds it (got ${JSON.stringify(found)})`);
    console.log("✓ an old entry sharing one of this device's Worlds finds that World");
}

// The bytes only name the Publication: whatever else they claim is ignored.
{
    const { storage, useCase } = setUp();
    const tampered = { ...ownRecord().toJSON(), documentId: 'doc-somewhere-else', title: 'Click me' };
    const found = await useCase.find(entryWrapping(storage, tampered));
    assert(found && found.documentId === 'doc-castle' && found.title === 'My Castle',
        'the World and title come from the own record, never from the bytes');
    console.log('✓ nothing but the Publication id and hash is read from the bytes');
}

// No match, no answer.
{
    const { storage, useCase } = setUp();
    const cases = [
        ['another snapshot hash', { ...ownRecord().toJSON(), contentHash: '0badc0de' }],
        ['another Publication id', { ...ownRecord().toJSON(), id: 'pub-other' }],
        ['not a Publication', { fingerprint: 'bp:1', authorIdentityId: 'did:key:zme' }],
        ['not JSON', 'not json at all'],
        ['JSON null', 'null']
    ];
    for (const [label, json] of cases) {
        assert(await useCase.find(entryWrapping(storage, json)) === null, `${label}: nothing is found`);
    }
    const missing = { contentReference: new ContentReference({ hash: 'ffffffff', algorithm: 'fnv1a-32', storage: 'local' }) };
    assert(await useCase.find(missing) === null, 'bytes not on this device: nothing is found');
    assert(await useCase.find({}) === null && await useCase.find(null) === null, 'an envelope without a content reference: nothing is found');
    console.log('✓ anything else finds nothing, without throwing');
}

// findOwnPublication() is the same check isOwnPublication() always made.
{
    const { publisherProvider } = setUp();
    const own = publisherProvider.findOwnPublication({ id: 'pub-castle', contentHash: '1234abcd' });
    assert(own instanceof Publication && own.documentId === 'doc-castle', 'the own record comes back as a Publication');
    assert(publisherProvider.isOwnPublication({ id: 'pub-castle', contentHash: '1234abcd' }), 'and isOwnPublication() agrees');
    assert(publisherProvider.findOwnPublication({ id: 'pub-castle', contentHash: '0badc0de' }) === null
        && !publisherProvider.isOwnPublication({ id: 'pub-castle', contentHash: '0badc0de' }), 'the id alone is not enough');
    assert(publisherProvider.findOwnPublication(null) === null && publisherProvider.findOwnPublication({ id: 'pub-castle' }) === null,
        'nor a missing publication or hash');
    console.log('✓ findOwnPublication() matches on id and content hash together');
}
