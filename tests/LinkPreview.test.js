import { inflateSync } from 'node:zlib';
import worker from '../server/rendezvous-worker/worker.js';
import { BRICK_SHAPES, PREVIEW_HEIGHT, PREVIEW_WIDTH, bricksOf, renderPreviewPng } from '../server/rendezvous-worker/buildPreview.js';
import { CoreLibrary } from '../core/library/CoreLibrary.js';
import { ShowcaseLibrary } from '../core/library/ShowcaseLibrary.js';
import { FORKBUILD_APP_URL, FORKBUILD_LINK_PREVIEW_URL, payloadFromLinkPreviewUrl } from '../core/ForkBuildAppLinks.js';
import { prepareLinkOnlyShare } from '../application/publication/PublicationShareLink.js';
import { decodePublicationLinkPayload, encodePublicationLinkPayload } from '../application/publication/sharing/PublicationLinkPayload.js';
import { PublishDocumentUseCase } from '../application/publication/PublishDocumentUseCase.js';
import { DocumentManager } from '../application/document/DocumentManager.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { License, LicenseId } from '../core/License.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// Link previews for builds shared in a link: the rendezvous worker's
// /b/<payload> page names a build whose signature checks out and shows a
// picture of it, drawn without a browser, and sends people on to the app.
// Anything that doesn't check out gets a plain preview.

const CASTLE = ShowcaseLibrary.structures.find((structure) => structure.id === 'showcase:castle');

function publish({ title = 'Castle on the hill', author = 'alice', bricks = CASTLE.bricks } = {}) {
    const storage = new InMemoryStorageProvider();
    const identity = new LocalIdentityProvider(storage);
    identity.login(author);
    const contentStore = new LocalContentStore(storage);
    const world = new World();
    const building = new Building({ creator: author });
    for (const brick of bricks) building.addBrick(new Brick({ definitionId: brick.definitionId, position: brick.position, rotation: brick.rotation, color: brick.color }));
    world.addBuilding(building);
    const manager = new DocumentManager();
    manager.load(new Document({ world, metadata: new DocumentMetadata({ title, author, license: new License({ id: LicenseId.CC_BY_4_0 }) }) }), 'doc');
    return { publication: new PublishDocumentUseCase(new LocalPublisherProvider(storage, contentStore), identity).execute(manager), contentStore };
}

async function shareUrl(options) {
    const { publication, contentStore } = publish(options);
    return (await prepareLinkOnlyShare({ publication, contentStore })).url;
}

const get = (url, env = {}) => worker.fetch(new Request(url), env);
const meta = (html, name) => {
    const match = new RegExp(`<meta (?:property|name)="${name}" content="([^"]*)"`).exec(html);
    return match ? match[1] : null;
};

// The PNG's pixel at (x, y), as 0xRRGGBB (indexed or truecolor, 8-bit).
function pixelAt(png, x, y) {
    let offset = 8, width = 0, colorType = 0, palette = null;
    const idat = [];
    while (offset < png.length) {
        const length = png.readUInt32BE(offset);
        const type = png.toString('latin1', offset + 4, offset + 8);
        const data = png.subarray(offset + 8, offset + 8 + length);
        if (type === 'IHDR') { width = data.readUInt32BE(0); colorType = data[9]; }
        if (type === 'PLTE') palette = data;
        if (type === 'IDAT') idat.push(data);
        offset += 12 + length;
    }
    const raw = inflateSync(Buffer.concat(idat));
    const channels = colorType === 3 ? 1 : 3;
    const start = y * (width * channels + 1) + 1 + x * channels;
    if (colorType === 3) {
        const i = raw[start] * 3;
        return (palette[i] << 16) | (palette[i + 1] << 8) | palette[i + 2];
    }
    return (raw[start] << 16) | (raw[start + 1] << 8) | raw[start + 2];
}

// The worker's shapes are the app's bricks.
{
    for (const definition of CoreLibrary.definitions) {
        const shape = BRICK_SHAPES[definition.id];
        assert(shape, `${definition.id} has a shape`);
        assert(shape[0] === definition.width && shape[1] === definition.height && shape[2] === definition.depth && shape[3] === definition.color,
            `${definition.id}'s size and color match the Core library (${shape.slice(0, 4)})`);
    }
    assert(Object.keys(BRICK_SHAPES).length === CoreLibrary.definitions.length, 'and nothing else');
    console.log('✓ the worker knows every core brick');
}

// A signed castle: a page naming it, with its picture, sending people on.
{
    const url = await shareUrl();
    assert(url.startsWith(`${FORKBUILD_LINK_PREVIEW_URL}b/1`), 'the share link is the worker\'s /b/<payload>');
    const payload = payloadFromLinkPreviewUrl(url);
    const page = await get(url);
    const html = await page.text();
    assert(page.status === 200 && page.headers.get('content-type').startsWith('text/html'), 'an HTML page');
    assert(meta(html, 'og:title') === 'Castle on the hill' && html.includes('<title>Castle on the hill · ForkBuild</title>'), 'named after the build');
    assert(meta(html, 'og:description').includes('A build by alice on ForkBuild, 127 bricks'), `with its author and size (${meta(html, 'og:description')})`);
    assert(meta(html, 'og:image') === `${url}/preview.png` && meta(html, 'twitter:card') === 'summary_large_image', 'and its own picture, as a large card');
    assert(meta(html, 'og:image:width') === String(PREVIEW_WIDTH) && meta(html, 'og:image:height') === String(PREVIEW_HEIGHT), 'of the picture\'s size');
    assert(html.includes(`<meta http-equiv="refresh" content="0; url=${FORKBUILD_APP_URL}#/s/${payload}">`), 'people go straight on to the app, with the same payload');
    assert(page.headers.get('content-security-policy').includes("default-src 'none'"), 'the page runs nothing');

    const picture = await get(`${url}/preview.png`);
    const png = Buffer.from(await picture.arrayBuffer());
    assert(picture.status === 200 && picture.headers.get('content-type') === 'image/png' && picture.headers.get('cache-control').includes('immutable'), 'the picture is a PNG, cached for good');
    assert(png.subarray(1, 4).toString() === 'PNG' && png.readUInt32BE(16) === PREVIEW_WIDTH && png.readUInt32BE(20) === PREVIEW_HEIGHT, `at ${PREVIEW_WIDTH} × ${PREVIEW_HEIGHT}`);
    const sky = pixelAt(png, 5, 5);
    const middle = pixelAt(png, PREVIEW_WIDTH / 2, PREVIEW_HEIGHT / 2);
    const [r, g, b] = [middle >> 16, (middle >> 8) & 255, middle & 255];
    assert(sky === 0x87ceeb && Math.abs(r - g) < 12 && Math.abs(g - b) < 12 && r < 160, `sky at the corner, grey castle stone in the middle (#${middle.toString(16)})`);
    assert(png.length < 40_000, `small (${png.length} bytes)`);
    console.log('✓ a signed build gets its own title, description and picture, and people go on to the app');
}

// Escaped, and the app address can be changed.
{
    const url = await shareUrl({ title: 'Tower "><script>alert(1)</script>', author: 'bob<b>', bricks: CASTLE.bricks.slice(0, 5) });
    const html = await (await get(url, { APP_URL: 'https://example.org/forkbuild/' })).text();
    assert(!html.includes('<script>') && html.includes('Tower &quot;&gt;&lt;script&gt;'), 'a title can\'t inject markup');
    assert(html.includes('A build by bob&lt;b&gt;'), 'nor an author');
    assert(html.includes('url=https://example.org/forkbuild/#/s/'), 'APP_URL sends people to another copy of the app');
    console.log('✓ titles are escaped, and APP_URL is followed');
}

// What doesn't check out gets the plain preview, and still opens the app.
{
    const { publication, contentStore } = publish();
    const genuine = await decodePublicationLinkPayload(payloadFromLinkPreviewUrl((await prepareLinkOnlyShare({ publication, contentStore })).url));
    const forged = await encodePublicationLinkPayload({ claim: { ...genuine.claim, title: 'Free money, click here' }, snapshotText: genuine.snapshotText });
    const swapped = await encodePublicationLinkPayload({ claim: genuine.claim, snapshotText: genuine.snapshotText.replace('"Castle on the hill"', '"Other"') });
    const unsigned = await encodePublicationLinkPayload({ claim: { ...genuine.claim, signature: null }, snapshotText: genuine.snapshotText });
    for (const [label, payload] of [['a changed title', forged], ['a changed build', swapped], ['an unsigned claim', unsigned], ['a damaged payload', '1AAAA'], ['another version', `2${forged.slice(1)}`]]) {
        const base = `${FORKBUILD_LINK_PREVIEW_URL}b/${payload}`;
        const page = await get(base);
        const html = await page.text();
        assert(page.status === 200 && meta(html, 'og:title') === 'A shared build', `${label}: the plain title`);
        assert(meta(html, 'og:image') === `${FORKBUILD_APP_URL}assets/social/forkbuild-card.png`, `${label}: the site's card for a picture`);
        assert(!html.includes('Free money'), `${label}: nothing from the claim is shown`);
        assert(html.includes(`url=${FORKBUILD_APP_URL}#/s/${payload}`), `${label}: still sent on to the app, which says what is wrong`);
        const picture = await get(`${base}/preview.png`);
        assert(picture.status === 302 && picture.headers.get('location').endsWith('assets/social/forkbuild-card.png'), `${label}: no picture is drawn`);
    }
    const other = await get(`${FORKBUILD_LINK_PREVIEW_URL}b/bad/path/here`);
    assert(other.status === 200 && (await other.text()).includes('rendezvous worker is running'), 'other paths are left to the rendezvous worker');
    console.log('✓ a forged, changed, unsigned or damaged link gets the plain preview');
}

// The picture: unknown bricks and old documents are drawn too; an empty build draws only the sky.
{
    const bricks = [
        { definitionId: 'someone:custom', x: 0, y: 0.5, z: 0, rotation: 0, color: null },
        { definitionId: 'core:slope_45', x: 1, y: 0.5, z: 0, rotation: 90, color: '#ff0000' },
        { definitionId: 'core:roof_hip', x: 0, y: 1.75, z: 0, rotation: 0, color: 0x123456 }
    ];
    const png = Buffer.from(await renderPreviewPng(bricks));
    assert(png.readUInt32BE(16) === PREVIEW_WIDTH, 'a mix of shapes draws');
    const oldDocument = JSON.stringify({ world: { buildings: [{ bricks: [{ definitionId: 'core:cube', position: { x: 1, y: 0.5, z: 2 }, rotation: 0 }] }] } });
    assert(bricksOf(oldDocument).length === 1 && bricksOf('not json').length === 0, 'schema 1 brick lists are read, and nonsense reads as nothing');
    const empty = Buffer.from(await renderPreviewPng([]));
    assert(pixelAt(empty, PREVIEW_WIDTH / 2, 5) === 0x87ceeb, 'nothing to draw is just sky');
    console.log('✓ the picture draws any bricks');
}
