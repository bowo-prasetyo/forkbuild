// application/publication/SimilarBuildFinder.js: which published builds by
// other people, among those on this device, look a lot like the one about to
// be published, and which it leaves out because they already credit, or are,
// the builder.
import { Brick } from '../core/building/Brick.js';
import { Building } from '../core/building/Building.js';
import { Document } from '../core/document/Document.js';
import { DocumentMetadata } from '../core/document/DocumentMetadata.js';
import { License, LicenseId } from '../core/document/License.js';
import { Position } from '../core/document/Position.js';
import { World } from '../core/document/World.js';
import { addReadyMadeBricks, worldBricks } from '../core/building/PlacedBricks.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { Publication } from '../publisher/Publication.js';
import { SimilarBuildFinder } from '../application/publication/SimilarBuildFinder.js';
import { VillageLibrary } from '../core/library/VillageLibrary.js';
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

    {
        const { contentStore, publications, finder } = setUp();
        // A whole family: an original, its remix, a remix of that, and a
        // cousin through another remix of the original.
        const mine = documentOf(cottageBricks(), { id: 'mine', authorIdentityId: 'me', parentDocumentId: 'child' });
        publications.push(
            published(contentStore, documentOf(cottageBricks(), { id: 'root' }), { identityId: 'alice' }),
            published(contentStore, documentOf(cottageBricks(), { id: 'child', parentDocumentId: 'root' }), { identityId: 'bob' }),
            published(contentStore, documentOf(cottageBricks(), { id: 'uncle', parentDocumentId: 'root' }), { identityId: 'carol' }),
            published(contentStore, documentOf(cottageBricks(), { id: 'cousin', parentDocumentId: 'uncle' }), { identityId: 'dave' }),
            published(contentStore, documentOf(cottageBricks(), { id: 'grandchild', parentDocumentId: 'mine' }), { identityId: 'erin' })
        );
        assert((await finder().find(mine)).length === 0, '19. every build in the remix family, however distant, is left out');
    }
    console.log('✓ the whole remix family left out');

    {
        const { contentStore, publications, finder } = setUp();
        const original = published(contentStore, documentOf(cottageBricks({ dx: 4 }), { id: 'original', title: 'Original' }), { identityId: 'alice', publishedAt: '2026-10-01T00:00:00Z' });
        const copy = published(contentStore, documentOf(cottageBricks(), { id: 'copy', title: 'Copy' }), { identityId: 'mallory', publishedAt: '2026-10-05T00:00:00Z' });
        const later = published(contentStore, documentOf(cottageBricks(), { id: 'later' }), { identityId: 'zoe', publishedAt: '2026-10-09T00:00:00Z' });
        const sameBuilder = published(contentStore, documentOf(cottageBricks(), { id: 'mallory-older' }), { identityId: 'mallory', publishedAt: '2026-09-01T00:00:00Z' });
        const credited = published(contentStore, documentOf(cottageBricks(), { id: 'helped' }), { identityId: 'yan', publishedAt: '2026-09-02T00:00:00Z', builtWith: [{ name: 'mallory', identityId: 'mallory' }] });
        publications.push(original, copy, later, sameBuilder, credited);

        // The viewer is alice, the original's builder: her own build is
        // listed on the copy's page all the same.
        const found = await finder({ ownIdentityIds: () => ['alice'] }).findEarlier(copy);
        assert(found.length === 1 && found[0].publication === original, `20. a build's page lists the build published before it that looks like it (got ${found.map((f) => f.publication.documentId).join(', ')})`);
        assert(found[0].evidence.similarity === 1, '21. with how alike they are');
        const beforeOriginal = (await finder().findEarlier(original)).map((f) => f.publication.documentId).sort().join();
        assert(beforeOriginal === 'helped,mallory-older', `22. only builds published before it are listed, never later ones (got ${beforeOriginal})`);
        assert((await finder({ limit: 10 }).findEarlier(later)).map((f) => f.publication.documentId).sort().join() === 'copy,helped,mallory-older,original',
            '23. a later build lists every earlier look-alike, its own builder\'s excepted');

        const afterOriginal = await finder({ limit: 10 }).findLater(original);
        assert(afterOriginal.map((f) => f.publication.documentId).sort().join() === 'copy,later',
            `23b. findLater() lists the look-alikes published after it, for its builder (${afterOriginal.map((f) => f.publication.documentId).join()})`);
        assert((await finder().findLater(later)).length === 0, '23c. none for the newest');
        const both = finder({ limit: 10 });
        const [one, two] = await Promise.all([both.findLater(original), both.findEarlier(later)]);
        assert(one.length === 2 && two.length === 4, '23d. looks asked at once each get their own answer');

        const byAlice = await finder({ limit: 10 }).findEarlier(later, { by: ['alice'] });
        assert(byAlice.length === 1 && byAlice[0].publication === original, '23a. with `by`, only those builders\' builds are compared');

        const undated = new Publication({ ...copy.toJSON(), id: 'undated', publishedAt: 'not a date' });
        assert((await finder().findEarlier(undated)).length === 0, '24. a build with no date has nothing earlier');
        const absent = published(contentStore, documentOf(cottageBricks(), { id: 'absent' }), { identityId: 'quinn', publishedAt: '2026-10-07T00:00:00Z', onDevice: false });
        assert((await finder().findEarlier(absent)).length === 0, '25. a build whose bytes aren\'t on this device is not compared');
        assert(await finder().canCompare(absent) === false && await finder().canCompare(copy) === true, '25a. canCompare() says which builds\' bytes are here to compare');
        const arrivingDocument = documentOf(cottageBricks(), { id: 'arriving' });
        const arrivingBuild = published(contentStore, arrivingDocument, { identityId: 'quinn', publishedAt: '2026-10-07T00:00:00Z', onDevice: false });
        const arriving = finder();
        assert(await arriving.canCompare(arrivingBuild) === false, 'not yet');
        contentStore.put(JSON.stringify(arrivingDocument.toJSON()));
        assert(await arriving.canCompare(arrivingBuild) === true, '25b. and changes its answer once they arrive');
        const small = published(contentStore, documentOf(cottageBricks().slice(0, 12), { id: 'small' }), { identityId: 'quinn', publishedAt: '2026-10-07T00:00:00Z' });
        assert((await finder().findEarlier(small)).length === 0, '26. nor is one too small to tell');
    }
    console.log('✓ a build\'s page: builds published earlier that look like it');

    {
        // Two builds that are a ready-made house and a few bricks of their own.
        const { contentStore, publications, finder } = setUp();
        const house = VillageLibrary.structures.find((structure) => structure.id === 'village:house').bricks;
        const moved = (dx) => house.map((b) => new Brick({ definitionId: b.definitionId, position: new Position(b.position.x + dx, b.position.y, b.position.z), rotation: b.rotation }));
        const own = (kind, n) => Array.from({ length: n }, (_, i) => new Brick({ definitionId: kind, position: new Position(60 + i, 0.5, 60) }));
        const theirs = published(contentStore, documentOf([...moved(30), ...own('core:cube', 8)], { title: 'Their house' }), { identityId: 'alice', publishedAt: '2026-09-01T00:00:00Z' });
        publications.push(theirs);
        const mine = documentOf([...moved(-30), ...own('core:plate_2x4', 8)], { authorIdentityId: 'me' });
        assert((await finder().find(mine)).length === 1, '28. without the Build Library, two builds of the same ready-made house look alike');
        const loads = [];
        const knowing = finder({ readyMadeStructures: async () => { loads.push(1); return VillageLibrary.structures; } });
        assert((await knowing.find(mine)).length === 0, '29. with it, they don\'t: the house is no one\'s own');
        const later = published(contentStore, documentOf([...moved(90), ...own('core:plate_2x4', 8)], { title: 'Later house' }), { identityId: 'bob', publishedAt: '2026-10-01T00:00:00Z' });
        assert((await knowing.findEarlier(later)).length === 0, '30. on a build\'s page too');
        assert(loads.length === 1, `31. the structures are loaded once (${loads.length})`);

        const copy = published(contentStore, documentOf([...moved(-90), ...cottageBricks({ dx: 200 })], { title: 'Copy' }), { identityId: 'bob', publishedAt: '2026-10-02T00:00:00Z' });
        const original = published(contentStore, documentOf([...cottageBricks({ dx: -200 })], { title: 'Original' }), { identityId: 'carol', publishedAt: '2026-09-02T00:00:00Z' });
        publications.push(copy, original);
        const found = await knowing.findEarlier(copy);
        assert(found.length === 1 && found[0].publication === original && found[0].evidence.similarity === 1,
            `32. a copy with a ready-made house added beside it still looks like what it copied (${found.map((f) => f.evidence.similarity).join()})`);

        const untouched = finder({ readyMadeStructures: async () => { loads.push('untouched'); return VillageLibrary.structures; } });
        assert((await untouched.find(documentOf(moved(0), { authorIdentityId: 'me' }), { readyMade: addReadyMadeBricks(null, moved(0)) })).length === 0
            && !loads.includes('untouched'), '32a. a build with too few bricks of its own never loads the library');

        const failing = finder({ readyMadeStructures: async () => { throw new Error('offline'); } });
        assert((await failing.find(mine)).length === 1, '33. when the structures can\'t be loaded, builds are compared as before');
    }
    console.log('✓ ready-made structures don\'t make builds look alike');

    console.log('✅ All similar build finder tests passed.');
}

await run();
