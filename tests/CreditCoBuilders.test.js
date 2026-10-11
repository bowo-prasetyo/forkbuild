import worker from '../server/rendezvous-worker/worker.js';
import { normalizeBuiltWith, withBuilder, sameBuiltWith, BUILT_WITH_MAX_COUNT } from '../core/BuiltWith.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { Document } from '../core/Document.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { License, LicenseId } from '../core/License.js';
import { remixFamily } from '../core/RemixFamily.js';
import { FunnelEvent, publishedBuildEvents } from '../core/VisitorCount.js';
import { DocumentCloneService } from '../application/document/DocumentCloneService.js';
import { DocumentManager } from '../application/document/DocumentManager.js';
import { PublishDocumentUseCase } from '../application/publication/PublishDocumentUseCase.js';
import { prepareLinkOnlyShare } from '../application/publication/PublicationShareLink.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { Publication } from '../publisher/Publication.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// Credit co-builders (core/BuiltWith.js): who built a build with its author
// is kept on the build, signed onto its Publication by the author, and shown
// wherever the build is credited. The Editor recording it as friends' edits
// arrive is tested in BuildWithMe; the share page and family tree in
// CreditCoBuildersBrowser.

const ANA = 'did:key:z6MkAna';
const KIM = 'did:key:z6MkKim';
const SAM = 'did:key:z6MkSam';

// The list: named, one each, never the author, a dozen at most.
{
    const list = normalizeBuiltWith([
        { name: '  Kim  ', identityId: KIM }, { name: 'Kim again', identityId: KIM }, { name: 'Ana', identityId: ANA },
        { name: 'Lee' }, { name: 'lee' }, { identityId: SAM }, {}, null, 'x', { name: 'x'.repeat(100) }
    ], { authorIdentityId: ANA });
    assert(list.map((entry) => entry.name).join('|') === `Kim|Lee||${'x'.repeat(60)}`, `cleaned and deduplicated (${JSON.stringify(list)})`);
    assert(list[2].identityId === SAM && list[2].name === null, 'an identity with no name is kept');
    assert(Object.isFrozen(list) && Object.isFrozen(list[0]), 'frozen');
    const many = normalizeBuiltWith(Array.from({ length: 20 }, (_, i) => ({ name: `P${i}`, identityId: `did:key:p${i}` })));
    assert(many.length === BUILT_WITH_MAX_COUNT, 'at most a dozen');
    let credits = withBuilder([], { name: 'Kim', identityId: KIM });
    credits = withBuilder(credits, { name: 'Sam', identityId: SAM });
    assert(withBuilder(credits, { name: 'Kim', identityId: KIM }) === credits || sameBuiltWith(withBuilder(credits, { name: 'Kim', identityId: KIM }), credits), 'crediting again changes nothing');
    const renamed = withBuilder(credits, { name: 'Kimberly', identityId: KIM });
    assert(renamed[0].name === 'Kimberly' && renamed.length === 2, 'a newer name replaces the old, in place');
    assert(withBuilder(credits, { name: 'Ana', identityId: ANA }, { authorIdentityId: ANA }).length === 2, 'the author is never their own co-builder');
    console.log('✓ the credits are named, one each, never the author, a dozen at most');
}

// On the build: credited as friends build, stored only when there are some.
{
    const metadata = new DocumentMetadata({ title: 'Harbor', author: 'ana', authorIdentityId: ANA });
    assert(!('builtWith' in metadata.toJSON()), 'a build no one helped with stores nothing new, so its content hash is unchanged');
    assert(metadata.creditBuilder({ name: 'Kim', identityId: KIM }) === true, 'a friend is credited');
    assert(metadata.creditBuilder({ name: 'Kim', identityId: KIM }) === false, 'once');
    assert(metadata.creditBuilder({ name: 'Ana', identityId: ANA }) === false, 'never the author');
    const json = metadata.toJSON();
    assert(json.builtWith.length === 1 && json.builtWith[0].name === 'Kim', 'stored with the build');
    assert(DocumentMetadata.fromJSON(json).builtWith[0].identityId === KIM, 'and read back');
    console.log('✓ the build keeps who built it with its author');
}

function buildDocument({ author = 'ana', authorIdentityId = ANA, builtWith = [] } = {}) {
    const world = new World();
    const building = new Building({ creator: author });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    return new Document({ world, metadata: new DocumentMetadata({ title: 'Harbor', author, authorIdentityId, builtWith, license: new License({ id: LicenseId.CC_BY_4_0 }) }) });
}

// A copy someone else makes starts with no credits; the author's own copy keeps them.
{
    const source = buildDocument({ builtWith: [{ name: 'Kim', identityId: KIM }] });
    const clones = new DocumentCloneService();
    assert(clones.execute(source, { author: 'sam', authorIdentityId: SAM }).metadata.builtWith.length === 0, 'a remix by someone else credits nobody yet');
    assert(clones.execute(source).metadata.builtWith[0].name === 'Kim', 'the author\'s own copy keeps the credit');
    assert(clones.execute(buildDocument({ authorIdentityId: null, builtWith: [{ name: 'Kim' }] })).metadata.builtWith.length === 0, 'a build with no owner carries none');
    console.log('✓ credits stay with the build they built');
}

function publish(document) {
    const storage = new InMemoryStorageProvider();
    const identity = new LocalIdentityProvider(storage);
    identity.login('ana');
    const contentStore = new LocalContentStore(storage);
    const manager = new DocumentManager();
    manager.load(document, 'doc');
    return { publication: new PublishDocumentUseCase(new LocalPublisherProvider(storage, contentStore), identity).execute(manager), contentStore };
}

// Signed onto the Publication by its author; older Publications still verify.
{
    const verifier = new LocalAuthorizationVerifier();
    const { publication, contentStore } = publish(buildDocument({ builtWith: [{ name: 'Kim', identityId: KIM }, { name: 'Sam', identityId: SAM }] }));
    assert(publication.builtWith.map((entry) => entry.name).join() === 'Kim,Sam', 'the Publication credits them');
    assert(verifier.verifyPublication(publication).valid, 'under the author\'s signature');
    const json = publication.toJSON();
    assert(json.builtWith.length === 2, 'its JSON carries them');
    const reread = Publication.fromJSON(JSON.parse(JSON.stringify(json)));
    assert(reread.builtWith[1].identityId === SAM && verifier.verifyPublication(reread).valid, 'read back from anywhere, it still verifies');
    const claimed = Publication.fromJSON({ ...json, builtWith: [...json.builtWith, { name: 'Mallory', identityId: 'did:key:z6MkMallory' }] });
    assert(!verifier.verifyPublication(claimed).valid, 'a co-builder added afterwards breaks the signature');
    const removed = Publication.fromJSON({ ...json, builtWith: [] });
    assert(!verifier.verifyPublication(removed).valid, 'and so does one taken away');

    const { publication: alone } = publish(buildDocument());
    assert(!('builtWith' in alone.toJSON()) && !('builtWith' in alone.getSigningDescriptor().payload), 'a build made alone signs exactly what it always did');
    assert(verifier.verifyPublication(Publication.fromJSON(alone.toJSON())).valid, 'and verifies');

    // The link-preview worker checks the same signature.
    const url = (await prepareLinkOnlyShare({ publication, contentStore })).url;
    const html = await (await worker.fetch(new Request(url), {})).text();
    assert(html.includes('<meta property="og:title" content="Harbor"'), 'the link preview names a build made together, its signature checked');
    console.log('✓ the author signs the credits onto the Publication, and nobody can change them');
}

// The family tree credits co-builders.
{
    const parent = { id: 'p', documentId: 'parent', title: 'Harbor', author: 'ana', builtWith: [{ name: 'Kim', identityId: KIM }], publishedAt: '2026-10-01T00:00:00Z' };
    const child = { id: 'c', documentId: 'child', parentDocumentId: 'parent', title: 'Harbor II', author: 'sam', publishedAt: '2026-10-02T00:00:00Z' };
    const family = remixFamily(child, { findByDocumentId: (id) => (id === 'parent' ? [parent] : []), findByParentId: () => [] });
    assert(family.ancestors[0].builtWith[0].name === 'Kim', 'an ancestor built together says with whom');
    assert(family.build.builtWith.length === 0, 'a build made alone credits nobody');
    console.log('✓ the family tree knows who built each build');
}

// Counted once per build: the first time it is published crediting friends.
{
    const credited = { id: 'p2', documentId: 'd1', builtWith: [{ name: 'Kim' }] };
    assert(publishedBuildEvents({ publication: credited, brickCount: 12 }).includes(FunnelEvent.PUBLISH_TOGETHER), 'a first publish made together');
    const earlierAlone = [{ id: 'p1', documentId: 'd1' }];
    assert(publishedBuildEvents({ publication: credited, brickCount: 12, ownPublications: earlierAlone }).join() === FunnelEvent.PUBLISH_TOGETHER,
        'published again after friends joined it: only that');
    assert(publishedBuildEvents({ publication: credited, brickCount: 12, ownPublications: [{ id: 'p1', documentId: 'd1', builtWith: [{ name: 'Kim' }] }] }).length === 0,
        'and never twice');
    assert(!publishedBuildEvents({ publication: { id: 'p', documentId: 'd2' }, brickCount: 3 }).includes(FunnelEvent.PUBLISH_TOGETHER), 'a build made alone is not');
    console.log('✓ publishing a build made together is counted once');
}
