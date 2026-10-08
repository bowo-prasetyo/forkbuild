import { openEmbeddedBuild, EmbeddedBuildOutcome } from '../application/publication/sharing/OpenEmbeddedBuild.js';
import { copyEmbedCode, prepareLinkOnlyShare } from '../application/publication/PublicationShareLink.js';
import { encodePublicationLinkPayload } from '../application/publication/sharing/PublicationLinkPayload.js';
import { bricksOfDocument } from '../application/publication/sharing/ReadSharedBuild.js';
import { composeWorldEncounterMaterialVerifier } from '../application/worldEncounter/WorldEncounterMaterialVerifierRuntimeComposition.js';
import { EMBED_HEIGHT, EMBED_WIDTH, FORKBUILD_APP_URL, embedCode, embedUrl, payloadFromEmbedHash } from '../core/ForkBuildAppLinks.js';
import { PublishDocumentUseCase } from '../application/publication/PublishDocumentUseCase.js';
import { DocumentManager } from '../application/document/DocumentManager.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { ShowcaseLibrary } from '../core/library/ShowcaseLibrary.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { License, LicenseId } from '../core/License.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// A build embedded on another site (embed.html#<payload>): the embed code the
// app copies, and the check the embed page makes before showing the build,
// the same as opening its link, signature and hash, keeping nothing.

const CASTLE = ShowcaseLibrary.structures.find((structure) => structure.id === 'showcase:castle');

function publish({ title = 'Castle on the hill', signedIn = true, license = LicenseId.CC_BY_4_0 } = {}) {
    const storage = new InMemoryStorageProvider();
    const identity = new LocalIdentityProvider(storage);
    if (signedIn) identity.login('embed-alice');
    const contentStore = new LocalContentStore(storage);
    const world = new World();
    const building = new Building({ creator: 'alice' });
    for (const brick of CASTLE.bricks) building.addBrick(new Brick({ definitionId: brick.definitionId, position: brick.position, rotation: brick.rotation, color: brick.color }));
    world.addBuilding(building);
    const manager = new DocumentManager();
    manager.load(new Document({ world, metadata: new DocumentMetadata({ title, author: 'alice', license: new License({ id: license }) }) }), 'doc-embed');
    const publication = new PublishDocumentUseCase(new LocalPublisherProvider(storage, contentStore), identity).execute(manager);
    return { publication, contentStore, snapshotText: contentStore.getSync(publication.contentReference) };
}

const { verifier } = composeWorldEncounterMaterialVerifier();

// The embed code: an <iframe> of embed.html with the payload in its fragment.
{
    const castle = publish();
    const share = await prepareLinkOnlyShare({ publication: castle.publication, contentStore: castle.contentStore });
    assert(typeof share.payload === 'string' && share.url.endsWith(`/b/${share.payload}`), 'a link-only share hands over its payload too');
    assert(embedUrl(share.payload) === `${FORKBUILD_APP_URL}embed.html#${share.payload}`, 'the embed is embed.html, the build in its fragment');
    assert(payloadFromEmbedHash(`#${share.payload}`) === share.payload, 'which the embed page reads back');
    assert(payloadFromEmbedHash('#/s/abc') === null && payloadFromEmbedHash('') === null && payloadFromEmbedHash(undefined) === null, 'and nothing else');

    const code = embedCode({ payload: share.payload, frameTitle: 'Tom\'s <castle> & "keep"' });
    assert(code.startsWith(`<iframe src="${FORKBUILD_APP_URL}embed.html#${share.payload}" width="${EMBED_WIDTH}" height="${EMBED_HEIGHT}" `), `an iframe of the embed (${code.slice(0, 80)})`);
    assert(code.includes('title="Tom&#39;s &lt;castle&gt; &amp; &quot;keep&quot;"'), 'whose title is escaped');
    assert(code.includes('referrerpolicy="no-referrer"') && code.includes('loading="lazy"') && code.endsWith('></iframe>'), 'sending no referrer, loading when scrolled to');
    assert(embedCode({ payload: share.payload, frameTitle: 'x', appUrl: 'http://localhost:8000/' }).includes('src="http://localhost:8000/embed.html#'), 'from another copy of the app too');
    let refused = false;
    try {
        embedCode({ payload: 'not a payload!', frameTitle: 'x' });
    } catch {
        refused = true;
    }
    assert(refused, 'never for something that is not a payload');
    console.log('✓ the embed code');

    // Copying it, as copying a link.
    const copied = [];
    assert(await copyEmbedCode(code, { clipboard: { writeText: async (text) => { copied.push(text); } } }) === 'copied' && copied[0] === code, 'Copy embed code puts it on the clipboard');
    assert(await copyEmbedCode(code, {}) === 'unavailable', 'or says to copy it by hand');
    assert(await copyEmbedCode(code, { clipboard: { writeText: async () => { throw new Error('denied'); } } }) === 'unavailable', 'also when the browser refuses');
    console.log('✓ Copy embed code');

    // The embed opens the build: verified, its bricks all there.
    const opened = await openEmbeddedBuild({ payload: share.payload, verifier });
    assert(opened.outcome === EmbeddedBuildOutcome.OPENED && opened.message === null, `a signed build opens (${opened.outcome})`);
    assert(opened.publication.id === castle.publication.id && opened.publication.title === 'Castle on the hill', 'as the publication its maker signed');
    assert(bricksOfDocument(opened.document).length === CASTLE.bricks.length, `with every brick (${bricksOfDocument(opened.document).length})`);
    console.log('✓ a signed build opens');
}

// Anything that doesn't check out is not shown, and says why.
{
    const castle = publish();
    const claim = castle.publication.toJSON();
    const changedBuild = await encodePublicationLinkPayload({ claim, snapshotText: castle.snapshotText.replace('"Castle on the hill"', '"Someone else\'s castle"') });
    const mismatch = await openEmbeddedBuild({ payload: changedBuild, verifier });
    assert(mismatch.outcome === EmbeddedBuildOutcome.BUILD_MISMATCH && mismatch.message.key === 'embed.mismatch' && mismatch.document === null,
        `a build changed after signing is not shown (${mismatch.outcome})`);

    const forged = await encodePublicationLinkPayload({ claim: { ...claim, title: 'Forged title' }, snapshotText: castle.snapshotText });
    const notVerified = await openEmbeddedBuild({ payload: forged, verifier });
    assert(notVerified.outcome === EmbeddedBuildOutcome.NOT_VERIFIED && notVerified.message.key === 'embed.notVerified', `nor a claim changed after signing (${notVerified.outcome})`);

    const unsigned = publish({ signedIn: false });
    const unsignedPayload = await encodePublicationLinkPayload({ claim: unsigned.publication.toJSON(), snapshotText: unsigned.snapshotText });
    assert((await openEmbeddedBuild({ payload: unsignedPayload, verifier })).outcome === EmbeddedBuildOutcome.NOT_VERIFIED, 'nor an unsigned one');

    for (const payload of [null, '', '1', '1AAAA', '2abc', 'not a payload', await encodePublicationLinkPayload({ claim: { title: 'no id' }, snapshotText: '{}' })]) {
        const result = await openEmbeddedBuild({ payload, verifier });
        assert(result.outcome === EmbeddedBuildOutcome.INVALID_LINK && result.message.key === 'embed.invalid', `a damaged payload is refused (${String(payload).slice(0, 12)}: ${result.outcome})`);
    }
    console.log('✓ a changed, forged, unsigned or damaged build is not shown');
}
