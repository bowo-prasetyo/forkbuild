// application/publication/SimilarBuildFinder.js: which published builds by
// other people, among those on this device, look a lot like the one about to
// be published, and which it leaves out because they already credit, or are,
// the builder.
import { Brick } from '../core/Brick.js';
import { Building } from '../core/Building.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { License, LicenseId } from '../core/License.js';
import { Position } from '../core/Position.js';
import { World } from '../core/World.js';
import { addReadyMadeBricks, worldBricks } from '../core/PlacedBricks.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { Publication } from '../publisher/Publication.js';
import { SimilarBuildFinder } from '../application/publication/SimilarBuildFinder.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// A cottage of 40-odd bricks, its walls `width` long, moved by `dx`.
function cottageBricks({ width = 6, dx = 0, kind = 'core:cube' } = {}) {
    const bricks = [];
    for (let x = 0; x < width; x += 1) {
        for (let z = 0; z < 5; z += 1) {
            if (x !== 0 && x !== width - 1 && z !== 0 && z !== 4) continue;
            for (const y of [0.5, 1.5]) bricks.push(new Brick({ definitionId: kind, position: new Position(x + dx, y, z) }));
        }
    }
    bricks.push(new Brick({ definitionId: 'core:door', position: new Position(2 + dx, 1, 0) }));
    for (let x = 0; x < width; x += 1) bricks.push(new Brick({ definitionId: 'core:beam', position: new Position(x + dx, 2.5, 2) }));
    return bricks;
}

function documentOf(bricks, { id, title = 'Cottage', authorIdentityId = null, parentDocumentId = null } = {}) {
    const world = new World(id ? { id } : {});
    const building = new Building();
    for (const brick of bricks) building.addBrick(brick);
    world.addBuilding(building);
    return new Document({
        world,
        metadata: new DocumentMetadata({ title, author: 'someone', authorIdentityId, parentDocumentId, license: new License({ id: LicenseId.CC_BY_4_0 }) })
    });
}

let publicationCount = 0;
// Publishes `document` as `identityId` into `contentStore` (unless `onDevice`
// is false), as a Publication record like those discovery hands out.
function published(contentStore, document, { identityId, author = identityId, publishedAt = '2026-10-01T00:00:00Z', licenseId = LicenseId.ALL_RIGHTS_RESERVED, onDevice = true, builtWith = [] } = {}) {
    const text = JSON.stringify(document.toJSON());
    // A build not on this device is one put only in some other device's store.
    const reference = (onDevice ? contentStore : new LocalContentStore(new InMemoryStorageProvider())).put(text);
    publicationCount += 1;
    return new Publication({
        id: `publication-${publicationCount}`,
        documentId: document.world.id,
        title: document.metadata.title,
        author,
        publishedAt,
        parentDocumentId: document.metadata.parentDocumentId,
        contentHash: reference.hash,
        contentReference: reference,
        license: new License({ id: licenseId }),
        publisherIdentity: { id: identityId },
        builtWith
    });
}

function setUp() {
    const storage = new InMemoryStorageProvider();
    const contentStore = new LocalContentStore(storage);
    const publications = [];
    const finder = (options = {}) => new SimilarBuildFinder({
        listPublications: () => publications,
        contentStore,
        ownIdentityIds: () => ['me'],
        ...options
    });
    return { storage, contentStore, publications, finder };
}

async function run() {
    {
        const { contentStore, publications, finder } = setUp();
        const theirs = published(contentStore, documentOf(cottageBricks(), { title: 'Alice\'s Cottage' }), { identityId: 'alice', author: 'alice' });
        const other = published(contentStore, documentOf(cottageBricks({ width: 12, kind: 'core:block_2x2' }), { title: 'Barn' }), { identityId: 'bob' });
        publications.push(theirs, other);
        const mine = documentOf(cottageBricks({ dx: 30 }), { authorIdentityId: 'me' });
        const found = await finder().find(mine);
        assert(found.length === 1, `1. the one build like it is found (got ${found.length})`);
        assert(found[0].publication === theirs, '2. it is the publication itself, with its maker, title and license');
        assert(found[0].evidence.similarity === 1 && found[0].evidence.shared > 20, '3. with how alike they are');
    }
    console.log('✓ a build like someone else\'s');

    {
        const { contentStore, publications, finder } = setUp();
        const mine = documentOf(cottageBricks(), { id: 'mine', authorIdentityId: 'me', parentDocumentId: 'original' });
        publications.push(
            published(contentStore, documentOf(cottageBricks(), { id: 'other-of-mine' }), { identityId: 'me' }),
            published(contentStore, documentOf(cottageBricks(), { id: 'with-friend' }), { identityId: 'carol', builtWith: [{ name: 'me', identityId: 'me' }] }),
            published(contentStore, documentOf(cottageBricks(), { id: 'mine' }), { identityId: 'someone-else' }),
            published(contentStore, documentOf(cottageBricks(), { id: 'original' }), { identityId: 'alice' }),
            published(contentStore, documentOf(cottageBricks(), { id: 'sibling', parentDocumentId: 'original' }), { identityId: 'bob' }),
            published(contentStore, documentOf(cottageBricks(), { id: 'remix-of-mine', parentDocumentId: 'mine' }), { identityId: 'dave' })
        );
        const found = await finder().find(mine);
        assert(found.length === 0, `4. builds that are, or already credit, the builder are left out (found ${found.map((f) => f.publication.documentId).join(', ')})`);
        const signedByAuthor = await finder({ ownIdentityIds: () => [] }).find(documentOf(cottageBricks(), { authorIdentityId: 'me' }));
        assert(signedByAuthor.every((f) => f.publication.publisherIdentity.id !== 'me'), '5. the build\'s own author counts as the builder even when not signed in here');
    }
    console.log('✓ the builder\'s own builds and their family left out');

    {
        const { contentStore, publications, finder } = setUp();
        const mine = documentOf(cottageBricks(), { id: 'mine', authorIdentityId: 'me' });
        publications.push(
            published(contentStore, mine, { identityId: 'me', publishedAt: '2026-10-05T00:00:00Z' }),
            published(contentStore, documentOf(cottageBricks(), { title: 'Copied from mine' }), { identityId: 'mallory', publishedAt: '2026-10-07T00:00:00Z' })
        );
        assert((await finder().find(mine)).length === 0, '6. a build published after this one was first published is left out');
        publications.push(published(contentStore, documentOf(cottageBricks(), { title: 'Older' }), { identityId: 'alice', publishedAt: '2026-10-02T00:00:00Z' }));
        assert((await finder().find(mine)).length === 1, '7. one published before it is not');
    }
    console.log('✓ only builds published first');

    {
        const { storage, contentStore, publications, finder } = setUp();
        const absent = published(contentStore, documentOf(cottageBricks()), { identityId: 'alice', onDevice: false });
        const tampered = published(contentStore, documentOf(cottageBricks()), { identityId: 'bob' });
        storage.save(`content:${tampered.contentReference.hash}`, JSON.stringify(documentOf(cottageBricks({ width: 7 })).toJSON()));
        const unreadable = published(contentStore, documentOf(cottageBricks()), { identityId: 'carol' });
        storage.save(`content:${unreadable.contentReference.hash}`, 'not json');
        publications.push(absent, tampered, unreadable);
        assert((await finder().find(documentOf(cottageBricks(), { authorIdentityId: 'me' }))).length === 0,
            '8. builds whose bytes aren\'t on this device, aren\'t the ones signed, or can\'t be read are skipped');
    }
    console.log('✓ only builds whose bytes are here and verified');

    {
        const { contentStore, publications, finder } = setUp();
        publications.push(published(contentStore, documentOf(cottageBricks()), { identityId: 'alice' }));
        const small = documentOf(cottageBricks().slice(0, 12), { authorIdentityId: 'me' });
        assert((await finder().find(small)).length === 0, '9. a build too small to tell is not compared');

        const startedFromReadyMade = documentOf(cottageBricks(), { authorIdentityId: 'me' });
        const readyMade = addReadyMadeBricks(null, worldBricks(startedFromReadyMade.world));
        assert((await finder().find(startedFromReadyMade, { readyMade })).length === 0,
            '10. bricks it was started with are not the builder\'s, so a build of ready-made bricks is not compared');
    }
    console.log('✓ only the builder\'s own bricks');

    {
        const { contentStore, publications, finder } = setUp();
        for (let i = 0; i < 5; i += 1) {
            const extra = Array.from({ length: i }, (_, n) => new Brick({ definitionId: 'core:cube', position: new Position(10 + n, 0.5, 9) }));
            publications.push(published(contentStore, documentOf([...cottageBricks(), ...extra], { title: `Copy ${i}` }), { identityId: `maker-${i}` }));
        }
        const document = documentOf(cottageBricks(), { id: 'twice' });
        publications.push(
            published(contentStore, document, { identityId: 'eve', publishedAt: '2026-09-01T00:00:00Z' }),
            published(contentStore, documentOf([...cottageBricks(), new Brick({ definitionId: 'core:cube', position: new Position(30, 0.5, 30) })], { id: 'twice' }), { identityId: 'eve', publishedAt: '2026-09-02T00:00:00Z' })
        );
        const found = await finder().find(documentOf(cottageBricks(), { authorIdentityId: 'me' }));
        assert(found.length === 3, `11. at most three are given (got ${found.length})`);
        assert(found[0].evidence.similarity === 1 && found[0].evidence.similarity >= found[1].evidence.similarity && found[1].evidence.similarity >= found[2].evidence.similarity,
            '12. most alike first');
        assert(new Set(found.map((f) => f.publication.documentId)).size === found.length, '13. one per build, however often it was published');
        assert(found[0].publication.documentId === 'twice' && found[0].publication.publisherIdentity.id === 'eve',
            '14. of equally alike builds, the one published first comes first');
    }
    console.log('✓ the most alike few, one per build');

    {
        const { contentStore, publications, finder } = setUp();
        publications.push(published(contentStore, documentOf(cottageBricks()), { identityId: 'alice' }));
        let clock = 0;
        const slow = finder({ now: () => (clock += 2000), timeBudgetMs: 1500 });
        assert((await slow.find(documentOf(cottageBricks(), { authorIdentityId: 'me' }))).length === 0, '15. it stops once its time is spent');

        let reads = 0;
        const counting = { get: async (reference) => { reads += 1; return contentStore.get(reference); } };
        const cached = finder({ contentStore: counting });
        await cached.find(documentOf(cottageBricks(), { authorIdentityId: 'me' }));
        await cached.find(documentOf(cottageBricks(), { authorIdentityId: 'me' }));
        assert(reads === 1, `16. each published build is read once (read ${reads} times)`);

        const broken = new SimilarBuildFinder({ listPublications: () => { throw new Error('offline'); }, contentStore, ownIdentityIds: () => { throw new Error('locked'); } });
        assert((await broken.find(documentOf(cottageBricks()))).length === 0, '17. nothing to compare with finds nothing, without throwing');
        assert((await finder().find(null)).length === 0, '18. no document finds nothing');
    }
    console.log('✓ time, caching and failures');

    console.log('✅ All similar build finder tests passed.');
}

await run();
