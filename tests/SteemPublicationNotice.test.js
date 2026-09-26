import {
    STEEM_NOTICE_DESCRIPTION_MAX, STEEM_NOTICE_TITLE_MAX,
    isSteemNoticeImageUrl, steemContentManifestOperations, steemContentNotice, steemNoticeText
} from '../core/SteemContentManifest.js';
import { createSteemPublicationNoticeDescriber } from '../application/steem/SteemPublicationNoticeCard.js';
import { describeSteemContentUploadProgress } from '../application/steem/SteemContentUploadProgressText.js';
import { SteemContentStore } from '../content/SteemContentStore.js';
import { createSteemAnnouncer } from '../application/steem/SteemAnnouncer.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { assert } from './support/Assert.js';

// The card on a Signed Claim's Steem notice: user-written text made safe for
// Markdown, the notice's layout, the describer that finds the description and
// the picture, and the store asking for it before posting.

const ZWSP = '​';
const VIEW_URL = 'https://bowo-prasetyo.github.io/forkbuild/#/view/steem/alice/forkbuild-c-x-abcd1234';
const IMAGE_URL = 'https://cdn.steemitimages.com/DQmTest/forkbuild-build.png';

// User-written text.
{
    const cases = [
        ['Great Pyramid of Giza', 'Great Pyramid of Giza'],
        ['Stair (Double Height)', 'Stair \\(Double Height\\)'],
        ['Thanks @bob and @alice!', `Thanks @${ZWSP}bob and @${ZWSP}alice\\!`],
        ['#forkbuild #steem', `\\#${ZWSP}forkbuild \\#${ZWSP}steem`],
        ['[click](https://evil.example/x) now', '\\[click\\]\\( now'],
        ['visit www.evil.example today', 'visit today'],
        ['javascript://alert(1) done', 'done'],
        ['<img src=x onerror=alert(1)>', '&lt;img src\\=x onerror\\=alert\\(1\\)&gt;'],
        ['**bold** _em_ `code` ~~s~~ | table', '\\*\\*bold\\*\\* \\_em\\_ \\`code\\` \\~\\~s\\~\\~ \\| table'],
        ['![image](x)', '\\!\\[image\\]\\(x\\)'],
        ['1. first', '1\\. first'],
        ['- item', '\\- item'],
        ['line one\n\n# heading\r\nline two', `line one \\#${ZWSP} heading line two`],
        ['right‮to left​ hidden', 'right to left hidden'],
        ['a & b', 'a &amp; b'],
        [42, ''],
        [null, '']
    ];
    for (const [input, expected] of cases) {
        const got = steemNoticeText(input, 100);
        assert(got === expected, `${JSON.stringify(input)} becomes ${JSON.stringify(expected)} (got ${JSON.stringify(got)})`);
    }
    const long = steemNoticeText('x'.repeat(250), STEEM_NOTICE_TITLE_MAX);
    assert(Array.from(long).length === STEEM_NOTICE_TITLE_MAX && long.endsWith('…'), 'long text is cut to the limit, ending in …');
    assert(Array.from(steemNoticeText('🏛'.repeat(150), 100)).length === 100, 'the limit counts characters, not UTF-16 units');
    console.log('✓ user-written text is made safe');
}

// Picture addresses.
{
    assert(isSteemNoticeImageUrl(IMAGE_URL), 'an https image address is accepted');
    for (const bad of ['http://steemitimages.com/x.png', 'https://x.example/a b.png', 'https://x.example/a).png', 'javascript:alert(1)', 'https://x.example/"onload', null, 42]) {
        assert(!isSteemNoticeImageUrl(bad), `${JSON.stringify(bad)} is refused`);
    }
    console.log('✓ picture addresses');
}

// The notice.
{
    const full = steemContentNotice({ viewUrl: VIEW_URL, card: { title: 'Great Pyramid', author: 'forkbuild', description: 'A pyramid with a staircase to the top.', imageUrl: IMAGE_URL } });
    const lines = full.split('\n\n');
    assert(lines[0] === `[![Great Pyramid](${IMAGE_URL})](${VIEW_URL})`, `the picture comes first and opens the build (got ${lines[0]})`);
    assert(lines[1] === '**Great Pyramid** by forkbuild' && lines[2] === 'A pyramid with a staircase to the top.', 'then the title, author and description');
    assert(lines[3].startsWith(`[See it in 3D](${VIEW_URL}) · A build published with ForkBuild.`) && lines[3].includes('[What this is](https://github.com/bowo-prasetyo/forkbuild/'), 'then the link and what the post is');

    const plain = steemContentNotice({ viewUrl: VIEW_URL, card: { title: null, author: null, description: null, imageUrl: 'http://not-https.example/x.png' } });
    assert(plain.split('\n\n')[0] === '**An untitled build**' && !plain.includes('!['), `without a title or a usable picture it still reads well (got ${plain})`);
    const noCard = steemContentNotice({ viewUrl: VIEW_URL });
    assert(noCard.startsWith('A build published with ForkBuild: [see it in 3D]'), 'without a card the notice is the plain link');

    const hostile = steemContentNotice({ viewUrl: VIEW_URL, card: { title: 'x](https://evil.example) [y', description: `@everyone ${'z'.repeat(400)}`, imageUrl: IMAGE_URL } });
    assert(!hostile.includes('evil.example') && !hostile.includes('@everyone') && hostile.includes(`@${ZWSP}everyone`), 'a title or description can\'t add a link or notify anyone');
    const description = hostile.split('\n\n')[2];
    assert(Array.from(description.replace(new RegExp(ZWSP, 'g'), '')).length <= STEEM_NOTICE_DESCRIPTION_MAX + 1, 'the description is capped');

    const content = { contentHash: 'abcd0123', algorithm: 'fnv1a-32', mediaType: 'application/json', size: 5, encoding: 'utf8', encodedLength: 5, parts: [] };
    const operations = (card) => steemContentManifestOperations({ author: 'alice', threadAccount: 'forkbuild', threadPermlink: 'forkbuild-content-2026-10', permlink: 'forkbuild-c-x-abcd1234', content, data: 'hello', viewUrl: VIEW_URL, card })[0][1];
    const withImage = operations({ title: 'T', imageUrl: IMAGE_URL });
    assert(JSON.stringify(JSON.parse(withImage.json_metadata).image) === JSON.stringify([IMAGE_URL]), 'the picture is also in json_metadata.image, for front-end previews');
    assert(!('image' in JSON.parse(operations({ title: 'T', imageUrl: 'javascript:x' }).json_metadata)) && !('image' in JSON.parse(operations(null).json_metadata)), 'but only a usable one');
    assert(JSON.parse(withImage.json_metadata).forkbuild.data === 'hello', 'the stored data is unchanged');
    console.log('✓ the notice');
}

// Finding the card: description from the build, picture drawn and uploaded.
{
    const world = new World();
    const building = new Building({ creator: 'alice' });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    const snapshotText = JSON.stringify(new DocumentSerializer().serialize(new Document({ world, metadata: new DocumentMetadata({ title: 'Tower', author: 'alice', description: 'A tall tower.' }) })));
    const claim = { title: 'Tower', author: 'alice', contentHash: 'h1', contentReference: { hash: 'h1' } };
    const warnings = [];
    const png = new Uint8Array([137, 80, 78, 71]);
    const make = (overrides = {}) => createSteemPublicationNoticeDescriber({
        loadSnapshotText: async (hash) => (hash === 'h1' ? snapshotText : null),
        renderThumbnail: async (document) => (document.metadata.title === 'Tower' ? png : null),
        uploadImage: async (bytes) => (bytes === png ? IMAGE_URL : null),
        warn: (...args) => warnings.push(args.join(' ')),
        ...overrides
    });

    const card = await make()(claim);
    assert(card.title === 'Tower' && card.author === 'alice' && card.description === 'A tall tower.' && card.imageUrl === IMAGE_URL, `the full card (got ${JSON.stringify(card)})`);
    const declined = await make({ uploadImage: async () => { throw new Error('Request was canceled by the user.'); } })(claim);
    assert(declined.imageUrl === null && declined.description === 'A tall tower.' && warnings.at(-1).includes('canceled'), 'declining the picture keeps the rest');
    const noGl = await make({ renderThumbnail: async () => { throw new Error('WebGL is not available'); } })(claim);
    assert(noGl.imageUrl === null && noGl.description === 'A tall tower.', 'a picture that can\'t be drawn keeps the rest');
    const missing = await make()({ ...claim, contentReference: { hash: 'other' }, contentHash: 'other' });
    assert(missing.title === 'Tower' && missing.description === null && missing.imageUrl === null, 'a build not on this device leaves the title');
    const broken = await make({ loadSnapshotText: async () => '{not json' })(claim);
    assert(broken.title === 'Tower' && broken.description === null, 'a build that can\'t be read leaves the title');
    const textOnly = await createSteemPublicationNoticeDescriber({ loadSnapshotText: async () => snapshotText })(claim);
    assert(textOnly.description === 'A tall tower.' && textOnly.imageUrl === null, 'without a renderer or uploader there is no picture');
    console.log('✓ finding the card');
}

// The store asks for the card before posting a Signed Claim, and only then.
{
    const NOW = new Date('2026-10-05T12:00:00Z');
    const posts = new Map([['forkbuild/forkbuild-content-2026-10', { author: 'forkbuild', permlink: 'forkbuild-content-2026-10', allow_replies: true }]]);
    const rpc = { getContent: async (a, p) => posts.get(`${a}/${p}`) ?? { author: '', permlink: '' } };
    let n = 0;
    const announcer = createSteemAnnouncer({
        rpc, getAccount: () => 'alice', now: () => NOW, clock: () => NOW.getTime() + n * 10000, sleep: async () => {}, randomSuffix: () => `abcdefg${n++}`,
        getBroadcaster: () => ({ async broadcast(account, operations) { const [, c] = operations[0]; posts.set(`${c.author}/${c.permlink}`, c); return { transactionId: 'tx' }; } })
    });
    const asked = [];
    const events = [];
    const store = new SteemContentStore({
        rpc, announcer, threadAccounts: ['forkbuild'],
        progress: { report: (state) => events.push(state.phase) },
        describePublication: async (claim) => {
            asked.push(claim.title);
            return { title: claim.title, author: claim.author, description: 'Described.', imageUrl: IMAGE_URL };
        }
    });
    const claim = JSON.stringify({ id: 'p1', title: 'Tower', author: 'alice', contentHash: 'h1' });
    const reference = await store.put(claim, { kind: 'publication' });
    const post = posts.get(reference.uri.replace('steem://', ''));
    assert(asked.length === 1 && asked[0] === 'Tower', 'the store asks for the claim\'s card');
    assert(post.body.startsWith(`[![Tower](${IMAGE_URL})](https://bowo-prasetyo.github.io/forkbuild/#/view/steem/alice/`) && post.body.includes('**Tower** by alice\n\nDescribed.'), `the post shows the card (got ${post.body.slice(0, 160)})`);
    assert(events[0] === 'describing' && events.includes('stored'), `progress says it is adding a picture first (got ${events})`);
    assert(await store.get(reference) === claim, 'the stored claim reads back unchanged');

    await store.put('{"just":"a snapshot"}');
    assert(asked.length === 1, 'content that isn\'t a Signed Claim is posted without asking');

    const failing = new SteemContentStore({ rpc, announcer, threadAccounts: ['forkbuild'], describePublication: async () => { throw new Error('no WebGL'); } });
    const plain = await failing.put(claim, { kind: 'publication' });
    assert(posts.get(plain.uri.replace('steem://', '')).body.startsWith('A build published with ForkBuild: [see it in 3D]'), 'a card that fails leaves the plain notice, and the claim is still posted');
    console.log('✓ the store asks for the card');
}

// The progress line while the picture is being added.
{
    assert(describeSteemContentUploadProgress({ phase: 'describing', done: 0, total: 1 }) === 'Storing on Steem: adding a picture of the build. Approve signing the picture in Steem Keychain.', 'the progress line');
    console.log('✓ the progress line');
}

console.log('\n✅ All SteemPublicationNotice tests passed.');
