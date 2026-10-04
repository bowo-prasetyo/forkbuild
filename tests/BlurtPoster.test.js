import { createBlurtPoster, BlurtPostingError, BLURT_BUILD_POST_GROUPING_MS, BLURT_MIN_ROOT_POST_INTERVAL_MS } from '../application/blurt/BlurtPoster.js';
import { createBlurtRpcClient } from '../blurt/BlurtRpcClient.js';
import { createBlurtDiscoveryReader } from '../application/blurt/BlurtDiscoveryReader.js';
import { BlurtPublicationDiscoveryPublisher } from '../application/blurt/BlurtPublicationDiscoveryPublisher.js';
import { BlurtSnapshotDiscoveryPublisher } from '../application/blurt/BlurtSnapshotDiscoveryPublisher.js';
import { BlurtPlaceNamingDiscoveryPublisher } from '../application/blurt/BlurtPlaceNamingDiscoveryPublisher.js';
import { BlurtPublicationDiscoveryQueryService } from '../application/blurt/BlurtPublicationDiscoveryQueryService.js';
import { BlurtSnapshotDiscoveryQueryService } from '../application/blurt/BlurtSnapshotDiscoveryQueryService.js';
import { BlurtPlaceNamingDiscoverySource } from '../application/blurt/BlurtPlaceNamingDiscoverySource.js';
import { PublicationCommentaryBlurtDistribution } from '../application/blurt/PublicationCommentaryBlurtDistribution.js';
import { describeBlurtAnnouncingUnreadiness } from '../application/blurt/BlurtAnnouncingReadiness.js';
import {
    BLURT_BUILD_POST_MAX_ANNOUNCEMENTS,
    blurtBuildPostOperation,
    blurtPostCommitments,
    emptyBlurtBuildPost,
    parseBlurtBuildPost
} from '../core/BlurtPost.js';
import { PlaceNamingClaim } from '../core/PlaceNamingClaim.js';
import { WorldEncounterKind } from '../core/WorldEncounter.js';
import { derivePlaceNamingDiscoveryTag } from '../core/PlaceNamingDiscoveryEnvelope.js';
import { BlurtPostRecordStore } from '../storage/BlurtPostRecordStore.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { fakeBlurtChain } from './support/FakeBlurtChain.js';
import { assert } from './support/Assert.js';

const HASH = 'sha256:' + 'ab'.repeat(32);
const CLAIM_URI = 'blurt://alice/forkbuild-c-claim-aaaaaaaa';

let suffixes = 0;

function posterFor(chain, { account = 'alice', broadcaster = chain.broadcaster, records = null, onWaiting = null } = {}) {
    const sleeps = [];
    const poster = createBlurtPoster({
        rpc: createBlurtRpcClient({ nodes: ['https://a'], fetchImpl: chain.fetchImpl }),
        getBroadcaster: () => broadcaster,
        getAccount: () => account,
        appVersion: '1.3.0',
        records,
        onWaiting,
        now: () => new Date(chain.time),
        clock: () => chain.time,
        sleep: async (ms) => {
            sleeps.push(ms);
            chain.time += ms;
        },
        randomSuffix: () => `s${String(suffixes++).padStart(7, '0')}`
    });
    return { ...poster, sleeps };
}

function readerFor(chain, options = {}) {
    return createBlurtDiscoveryReader({ rpc: createBlurtRpcClient({ nodes: ['https://a'], fetchImpl: chain.fetchImpl }), clock: () => chain.time, ...options });
}

function rootPostsOf(chain) {
    return [...chain.posts.values()].filter((post) => post.parent_author === '');
}

async function rejection(promise) {
    try {
        await promise;
        return null;
    } catch (error) {
        return error;
    }
}

// A build post is a top-level post in the forkbuild category that keeps its
// payout: one comment operation, no comment_options.
{
    const state = { ...emptyBlurtBuildPost(), announcements: [{ family: 'snapshot', envelope: { contentHash: HASH } }, { family: 'publication', envelope: { uri: CLAIM_URI } }], anchors: ['h2'] };
    const [name, op] = blurtBuildPostOperation({ author: 'alice', permlink: 'forkbuild-x-abcdefgh', state, appVersion: '1.3.0' });
    assert(name === 'comment' && op.parent_author === '' && op.parent_permlink === 'forkbuild', 'a top-level post in the forkbuild category');
    const metadata = JSON.parse(op.json_metadata);
    assert(JSON.stringify(metadata.tags) === JSON.stringify(['forkbuild', 'forkbuild-snapshot', 'forkbuild-publication']), `forkbuild, then each family announced (got ${metadata.tags})`);
    assert(metadata.forkbuild.version === 1 && metadata.forkbuild.announcements.length === 2 && metadata.forkbuild.anchors[0] === 'h2', 'the announcements and anchors are in the metadata');
    assert(op.title === 'A build made with ForkBuild' && op.body.includes('json') === false && op.body.includes('[What this is]'), 'a title and a body for people');
    const commitments = blurtPostCommitments(op.json_metadata);
    assert(commitments.has(HASH) && commitments.has('h2') && commitments.size === 2, 'it commits to its Snapshot\'s contentHash and its anchors');
    const parsed = parseBlurtBuildPost({ ...op, created: '2026-10-05T12:00:00' });
    assert(parsed.announcements.length === 2 && parsed.anchors[0] === 'h2', 'a build post reads back');
    assert(parseBlurtBuildPost({ ...op, parent_permlink: 'other' }) === null && parseBlurtBuildPost({ ...op, parent_author: 'bob' }) === null, 'a post elsewhere, or a reply, is not a build post');
    assert(parseBlurtBuildPost({ ...op, json_metadata: '{bad' }) === null, 'unreadable metadata is skipped, never an error');

    const carded = blurtBuildPostOperation({ author: 'alice', permlink: 'p-1', state: { ...state, viewUrl: 'https://example.org/#/view/blurt/alice/x', card: { title: 'Tower @bob #tag', author: 'Ann', description: 'Tall', imageUrl: 'https://images.blurt.blog/x.png' } } })[1];
    assert(carded.title === 'Tower @bob #tag', 'the build\'s own title, as plain text');
    assert(carded.body.startsWith('[![Tower') && carded.body.includes('See it in 3D') && carded.body.includes('@​bob'), 'the card leads the body, with mentions broken');
    assert(JSON.parse(carded.json_metadata).image[0] === 'https://images.blurt.blog/x.png', 'the picture is listed for front ends');
    console.log('✓ build post operations');
}

// One Distribute is one top-level post: later announcements edit it, and
// content goes in replies under it. Nothing waits for the 5-minute interval.
{
    const chain = fakeBlurtChain();
    const poster = posterFor(chain);
    const manifest = await poster.postContent({ content: { contentHash: HASH, algorithm: 'sha256', mediaType: 'application/json', size: 3, encoding: 'utf8', encodedLength: 3, parts: [] }, data: '{a}' });
    const snapshot = await new BlurtSnapshotDiscoveryPublisher({ poster }).publish({ contentHash: HASH, locator: `blurt://alice/${manifest.permlink}`, storage: 'blurt', publicationId: 'pub-1', claimedPosition: { x: 1, y: 0, z: 2 } });
    const publication = await new BlurtPublicationDiscoveryPublisher({ poster }).publish({ protocol: 'forkbuild', version: 1, kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-1', uri: CLAIM_URI });
    assert(chain.refusals.length === 0, `the chain refused nothing (${chain.refusals.map((r) => r.reason)})`);
    const roots = rootPostsOf(chain);
    assert(roots.length === 1, `one top-level post (got ${roots.length})`);
    const [root] = roots;
    assert(chain.posts.get(`alice/${manifest.permlink}`).parent_permlink === root.permlink, 'the content is a reply to the build post');
    assert(snapshot.id === `@alice/${root.permlink}` && publication.id === snapshot.id, 'both announcements are the build post');
    assert(snapshot.relayUrl === 'https://blurt.blog/created/forkbuild-snapshot' && snapshot.url === `https://blurt.blog/@alice/${root.permlink}`, 'links to the tag and the post');
    const metadata = JSON.parse(root.json_metadata);
    assert(metadata.forkbuild.announcements.map((a) => a.family).join() === 'snapshot,publication', 'the edits added both announcements');
    assert(metadata.tags.includes('forkbuild-snapshot') && metadata.tags.includes('forkbuild-publication'), 'and their tags');
    assert(root.body.includes('See it in 3D') && root.body.includes('the reply below'), 'the body links to the build and mentions the stored data');
    assert(Math.max(0, ...poster.sleeps) < BLURT_MIN_ROOT_POST_INTERVAL_MS, `nothing waited out the top-level interval (slept ${poster.sleeps})`);
    assert(chain.broadcasts.every(({ operations }) => operations.every(([name]) => name !== 'comment_options')), 'no post declines its payout');

    // Readers find both announcements in the one post.
    const reader = readerFor(chain);
    const snapshots = await new BlurtSnapshotDiscoveryQueryService({ reader }).searchWithOutcome('forkbuild-snapshot');
    assert(snapshots.outcome === 'found' && snapshots.candidates[0].contentHash === HASH, 'the Snapshot is found by tag');
    const leads = await new BlurtPublicationDiscoveryQueryService({ reader }).search('forkbuild-publication');
    assert(leads.length === 1 && leads[0].uri === CLAIM_URI && leads[0].storage === 'blurt', 'the Publication lead is found');
    console.log('✓ one build post per Distribute');
}

// A build post groups for 30 minutes; after that a new one starts. A post
// that is full starts a new one too.
{
    const chain = fakeBlurtChain();
    const poster = posterFor(chain);
    await poster.announce('commentary', { commentaryId: 'c1' });
    chain.time += BLURT_BUILD_POST_GROUPING_MS + 1000;
    await poster.announce('commentary', { commentaryId: 'c2' });
    assert(rootPostsOf(chain).length === 2, 'an old build post is left alone');

    const full = fakeBlurtChain();
    const fullPoster = posterFor(full);
    for (let i = 0; i < BLURT_BUILD_POST_MAX_ANNOUNCEMENTS + 1; i += 1) await fullPoster.announce('commentary', { commentaryId: `c${i}` });
    assert(rootPostsOf(full).length === 2 && full.refusals.length === 0, 'a full build post makes way for a new one, after the interval');
    assert(fullPoster.sleeps.some((ms) => ms > 60000), 'which waited out the top-level interval');
    console.log('✓ grouping window and full posts');
}

// A top-level post made elsewhere is waited out, and the wait is reported.
{
    const chain = fakeBlurtChain();
    const other = posterFor(chain);
    await other.announce('commentary', { commentaryId: 'elsewhere' });
    const waits = [];
    const poster = posterFor(chain, { onWaiting: (wait) => waits.push(wait) });
    await poster.announce('snapshot', { contentHash: HASH });
    assert(chain.refusals.length === 0 && rootPostsOf(chain).length === 2, 'the second device posts after the interval');
    assert(waits.length === 1 && waits[0].reason === 'root-interval', 'and says it is waiting');
    console.log('✓ the top-level interval');
}

// Refusals come with reasons a person can act on.
{
    const chain = fakeBlurtChain();
    assert((await rejection(posterFor(chain, { account: null }).announce('snapshot', {}))) instanceof BlurtPostingError, 'no account');
    assert((await rejection(posterFor(chain, { broadcaster: null }).announce('snapshot', {})))?.message.includes('Blurt Keychain'), 'no Keychain');
    const poor = fakeBlurtChain({ balances: { alice: '0.001 BLURT' } });
    const error = await rejection(posterFor(poor).announce('snapshot', { contentHash: HASH }));
    assert(error instanceof BlurtPostingError && error.message.includes("doesn't have enough BLURT"), `too little BLURT for the fee (got ${error?.message})`);
    assert(describeBlurtAnnouncingUnreadiness({ account: 'alice', keychain: { requestBroadcast() {} } }) === null, 'ready with an account and Keychain');
    assert(describeBlurtAnnouncingUnreadiness({ account: '', keychain: null }).includes('Network Settings'), 'not ready without an account');
    console.log('✓ refusals');
}

// Accepted posts remember what they commit to, for anchoring later.
{
    const chain = fakeBlurtChain();
    const records = new BlurtPostRecordStore(new InMemoryStorageProvider());
    const poster = posterFor(chain, { records });
    const posted = await poster.announce('snapshot', { contentHash: HASH });
    const record = poster.findCommitment(HASH);
    assert(record && record.permlink === posted.permlink && record.trxId === posted.transactionId && record.blockNum === posted.blockNum, 'the post that committed is found');
    assert(records.get('alice', HASH)?.trxId === posted.transactionId, 'and kept on the device');
    assert(poster.findCommitment('other') === null, 'nothing else is');
    console.log('✓ commitments are recorded');
}

// Place naming and commentary read back by family.
{
    const chain = fakeBlurtChain();
    const poster = posterFor(chain);
    const claim = PlaceNamingClaim.fromJSON({
        id: 'claim-1', worldId: 'world-1', regionId: 'region-1', name: 'Harbor', authorIdentityId: 'did:key:zAlice', createdAt: '2026-10-05T12:00:00.000Z',
        signature: { algorithm: 'ed25519', signer: 'did:key:zAlice', signature: 'sig', signedHash: 'hash', domain: 'forkbuild.place-naming-claim' }
    });
    const named = await new BlurtPlaceNamingDiscoveryPublisher({ poster }).publish(claim);
    assert(named.discoveryTag === derivePlaceNamingDiscoveryTag('world-1', 'region-1'), 'the region tag is reported back');
    const commentary = new PublicationCommentaryBlurtDistribution({ reader: readerFor(chain), poster });
    await commentary.publish({ commentaryId: 'c-1', publicationId: 'pub-1' });
    const found = await new BlurtPlaceNamingDiscoverySource({ reader: readerFor(chain) }).search(named.discoveryTag);
    assert(found.length === 1 && found[0].worldId === 'world-1', 'the place name is found for its region');
    assert((await new BlurtPlaceNamingDiscoverySource({ reader: readerFor(chain) }).search('other')).length === 0, 'and not for another');
    const comments = await commentary.discover();
    assert(comments.length === 1 && comments[0].commentaryId === 'c-1', 'the comment is found');
    console.log('✓ place naming and commentary');
}
