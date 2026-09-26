import {
    STEEM_CONTENT_PART_MAX_BYTES,
    describeSteemContentManifest,
    parseSteemContentLocator,
    steemContentLocator,
    steemContentManifestOperations,
    steemContentManifestPermlink
} from '../core/SteemContentManifest.js';
import { describeSteemDiscoveryThreadPost, STEEM_DISCOVERY_FAMILIES } from '../core/SteemDiscoveryThread.js';
import { SteemContentStore, SteemContentTooLargeError, decodeSteemContent, encodeSteemContent } from '../content/SteemContentStore.js';
import { ContentTooLargeError } from '../content/ContentStore.js';
import { ContentUnavailableError } from '../content/IpfsContentStore.js';
import { ContentReference } from '../core/ContentReference.js';
import { computeContentHash } from '../serializer/contentHash.js';
import { createSteemAnnouncer } from '../application/steem/SteemAnnouncer.js';
import { SteemSnapshotDiscoveryPublisher } from '../application/steem/SteemSnapshotDiscoveryPublisher.js';
import { composeSteemRuntime } from '../application/steem/SteemRuntimeComposition.js';
import { executeSnapshotDistributionCommand } from '../application/snapshot/SnapshotDistributionCommand.js';
import { DecentralizedSnapshotResolver } from '../application/snapshot/DecentralizedSnapshotResolver.js';
import { DecentralizedSnapshotResolutionOutcome } from '../application/snapshot/DecentralizedSnapshotResolutionOutcome.js';
import { SnapshotPlacementStoreRegistry } from '../application/snapshot/placement/SnapshotPlacementStoreRegistry.js';
import { composePublicationMaterialUploader } from '../application/publication/distribution/PublicationMaterialUploaderComposition.js';
import { assert } from './support/Assert.js';

// Steem content storage, inline case (docs/Protocol.md, "Proposed: Steem
// Content Storage"): the manifest format, encoding, and a Snapshot stored
// through the real announcer and read back through the real resolver.

const NOW = new Date('2026-10-05T12:00:00Z');
const CONTENT_THREAD = 'forkbuild-content-2026-10';

// A fake chain that keeps every post, as get_content would return it.
function fakeChain({ threads = [CONTENT_THREAD, 'forkbuild-snapshot-2026-10'] } = {}) {
    const posts = new Map();
    for (const permlink of threads) posts.set(`forkbuild/${permlink}`, { author: 'forkbuild', permlink, allow_replies: true });
    const broadcasts = [];
    const rpc = {
        async getContent(author, permlink) {
            return posts.get(`${author}/${permlink}`) ?? { author: '', permlink: '' };
        },
        async getContentReplies(author, permlink) {
            return [...posts.values()].filter((post) => post.parent_author === author && post.parent_permlink === permlink);
        }
    };
    const broadcaster = {
        async broadcast(account, operations) {
            broadcasts.push({ account, operations });
            const [, comment] = operations[0];
            posts.set(`${comment.author}/${comment.permlink}`, { ...comment, allow_replies: true, created: '2026-10-05T12:00:00' });
            return { transactionId: `tx${broadcasts.length}` };
        }
    };
    return { rpc, broadcaster, broadcasts, posts };
}

function fakeClock() {
    const clock = { time: NOW.getTime(), sleeps: [] };
    clock.now = () => clock.time;
    clock.sleep = async (ms) => {
        clock.sleeps.push(ms);
        clock.time += ms;
    };
    return clock;
}

function announcerFor(chain, { clock = fakeClock() } = {}) {
    let n = 0;
    return createSteemAnnouncer({
        rpc: chain.rpc,
        getBroadcaster: () => chain.broadcaster,
        getAccount: () => 'alice',
        appVersion: '1.0.0',
        now: () => NOW,
        clock: clock.now,
        sleep: clock.sleep,
        randomSuffix: () => `abcdefg${n++}`
    });
}

function storeFor(chain, options = {}) {
    return new SteemContentStore({ rpc: chain.rpc, announcer: announcerFor(chain, options), threadAccounts: ['forkbuild'] });
}

async function rejection(promise) {
    try {
        await promise;
    } catch (error) {
        return error;
    }
    return null;
}

// A snapshot-like document: canonical JSON with a lot of repetition.
function snapshotText(bricks) {
    const values = [];
    for (let i = 0; i < bricks; i++) values.push(0, i % 20, Math.floor(i / 20), 0, (i % 4) * 90, 1);
    return JSON.stringify({ schemaVersion: 2, title: 'A small house', bricks: { definitions: ['brick-2x4'], colors: ['#c0392b'], ids: values.map((_, i) => `b${i}`).filter((_, i) => i % 6 === 0), values } });
}

// Text that gzip can't shrink.
function incompressibleText(characters) {
    let seed = 12345;
    let text = '';
    while (text.length < characters) {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        text += seed.toString(36);
    }
    return text.slice(0, characters);
}

// Locators and permlinks.
{
    assert(steemContentManifestPermlink(1790000000000, 'abcd1234') === `forkbuild-c-${(1790000000000).toString(36)}-abcd1234`, 'the manifest permlink carries the time and suffix');
    const uri = steemContentLocator('alice', 'forkbuild-c-x-abcd1234');
    assert(uri === 'steem://alice/forkbuild-c-x-abcd1234', `the locator (got ${uri})`);
    assert(JSON.stringify(parseSteemContentLocator(uri)) === JSON.stringify({ author: 'alice', permlink: 'forkbuild-c-x-abcd1234' }), 'the locator parses back');
    for (const bad of ['ar://abc', 'steem://alice', 'steem://Alice/x', 'steem://alice/x/y', 'steem://alice/Bad_Permlink', null]) {
        assert(parseSteemContentLocator(bad) === null, `${bad} is not a Steem content locator`);
    }
    console.log('✓ locators and permlinks');
}

// The content thread family.
{
    assert(STEEM_DISCOVERY_FAMILIES.includes('content'), 'content is a thread family, so the operator page creates its threads');
    const post = describeSteemDiscoveryThreadPost({ family: 'content', period: '2026-10' });
    assert(post.permlink === CONTENT_THREAD && post.title === 'ForkBuild content storage, 2026-10', `the content thread's permlink and title (got ${post.title})`);
    assert(post.body.includes('stores the content of a published ForkBuild snapshot') && post.body.includes('`@forkbuild/forkbuild-content-YYYY-MM`'), 'the body says what a reply stores and names the monthly pattern');
    console.log('✓ the content thread family');
}

// The manifest's operations, and reading them back.
{
    const content = { contentHash: 'abcd0123', algorithm: 'fnv1a-32', mediaType: 'application/json', size: 5, encoding: 'utf8', encodedLength: 5, parts: [] };
    const ops = steemContentManifestOperations({ author: 'alice', threadAccount: 'forkbuild', threadPermlink: CONTENT_THREAD, permlink: 'forkbuild-c-x-abcd1234', content, body: 'hello', appVersion: '1.0.0' });
    const [[kind, comment], [optionsKind, options]] = ops;
    assert(kind === 'comment' && optionsKind === 'comment_options', 'a comment and its options');
    assert(comment.parent_author === 'forkbuild' && comment.parent_permlink === CONTENT_THREAD && comment.body === 'hello', 'a reply to the content thread whose body is the content');
    assert(options.max_accepted_payout === '0.000 SBD', 'payout is declined');
    const metadata = JSON.parse(comment.json_metadata);
    assert(metadata.app === 'forkbuild/1.0.0' && metadata.forkbuild.version === 1 && metadata.forkbuild.content.contentHash === 'abcd0123', 'the metadata describes the content');

    const threadAccounts = ['forkbuild'];
    const { manifest } = describeSteemContentManifest(comment, { threadAccounts });
    assert(manifest && manifest.inline && manifest.body === 'hello' && manifest.encoding === 'utf8' && manifest.size === 5, 'a post made from the operations reads back');

    const cases = [
        [{ author: '' }, 'does not exist'],
        [{ parent_author: 'someone' }, 'not a reply to a ForkBuild content thread'],
        [{ parent_permlink: 'forkbuild-snapshot-2026-10' }, 'not a reply to a ForkBuild content thread'],
        [{ json_metadata: 'not json' }, 'does not describe ForkBuild content'],
        [{ json_metadata: JSON.stringify({ forkbuild: { version: 1, content: { ...content, encoding: 'zip' } } }) }, 'unknown encoding'],
        [{ body: 'hello, edited' }, 'changed since the content was stored']
    ];
    for (const [override, expected] of cases) {
        const { manifest: none, problem } = describeSteemContentManifest({ ...comment, ...override }, { threadAccounts });
        assert(none === null && problem.includes(expected), `${JSON.stringify(override)} reports "${expected}" (got ${problem})`);
    }

    const parts = { ...content, parts: [{ permlink: 'forkbuild-c-x-abcd1234-p0', length: 5, sha256: 'ff' }] };
    const partsOps = steemContentManifestOperations({ author: 'alice', threadAccount: 'forkbuild', threadPermlink: CONTENT_THREAD, permlink: 'forkbuild-c-x-abcd1234', content: parts });
    const read = describeSteemContentManifest(partsOps[0][1], { threadAccounts }).manifest;
    assert(read && read.inline === false && read.body === null && read.parts.length === 1, 'a manifest with parts is described, not inline');
    console.log('✓ the manifest format');
}

// Encoding: the shorter of plain text and gzip-base64, and a bounded decode.
{
    const tiny = '{"a":1}';
    const encodedTiny = await encodeSteemContent(tiny);
    assert(encodedTiny.encoding === 'utf8' && encodedTiny.encoded === tiny, 'tiny content stays plain text');
    for (const text of ['', '@@ -1,3 +1,3 @@']) {
        const forced = await encodeSteemContent(text);
        assert(forced.encoding === 'gzip-base64' && await decodeSteemContent(forced.encoded, forced.encoding, text.length) === text,
            `${JSON.stringify(text)} is compressed, since the chain refuses an empty body and reads "@@ " as a patch`);
    }

    const text = snapshotText(2000);
    const encoded = await encodeSteemContent(text);
    assert(encoded.encoding === 'gzip-base64' && encoded.encoded.length < text.length / 2, `repetitive content is compressed (${text.length} → ${encoded.encoded.length})`);
    const size = new TextEncoder().encode(text).length;
    assert(await decodeSteemContent(encoded.encoded, encoded.encoding, size) === text, 'it decodes back to the same text');

    const bomb = await encodeSteemContent('0'.repeat(1_000_000));
    const refused = await rejection(decodeSteemContent(bomb.encoded, 'gzip-base64', 100));
    assert(refused?.message.includes('larger than the 100 bytes'), `decompression stops past the declared size (got ${refused?.message})`);
    const wrongSize = await rejection(decodeSteemContent(encoded.encoded, encoded.encoding, size + 1));
    assert(wrongSize?.message.includes('but the post says'), 'content shorter than the declared size is refused');
    assert(await rejection(decodeSteemContent('not base64!', 'gzip-base64', 10)) !== null, 'a body that is not base64 is refused');
    console.log('✓ encoding and bounded decoding');
}

// Storing and reading back a snapshot.
{
    const chain = fakeChain();
    const store = storeFor(chain);
    assert(store.storage === 'steem' && store.maxContentBytes === Infinity, 'storage is steem, and the limit is checked after compressing');
    const text = snapshotText(2000);
    const reference = await store.put(text);
    assert(chain.broadcasts.length === 1, 'one transaction, so one Keychain approval');
    const [, comment] = chain.broadcasts[0].operations[0];
    assert(comment.parent_author === 'forkbuild' && comment.parent_permlink === CONTENT_THREAD, 'the manifest replies to this month\'s content thread');
    assert(reference.storage === 'steem' && reference.uri === `steem://alice/${comment.permlink}`, `the reference points at the manifest (got ${reference.uri})`);
    assert(reference.hash === computeContentHash(text) && reference.size === new TextEncoder().encode(text).length, 'the reference carries the content hash and size');

    const loaded = await store.get(reference);
    assert(loaded === text && reference.verify(loaded), 'the content reads back and verifies');
    assert(await store.has(reference) === true, 'has() finds it');
    assert(await store.get(new ContentReference({ hash: 'x', uri: 'ar://abc' })) === null, 'a reference to another store is not this store\'s');

    const unicode = '{"title":"Rumah kecil — ☃"}';
    assert(await store.get(await store.put(unicode)) === unicode, 'non-ASCII content round-trips');
    console.log('✓ storing and reading back');
}

// Refusals when storing.
{
    const chain = fakeChain();
    const store = storeFor(chain);
    const big = await rejection(store.put(incompressibleText(STEEM_CONTENT_PART_MAX_BYTES * 2)));
    assert(big instanceof SteemContentTooLargeError && big instanceof ContentTooLargeError, 'content that does not fit one post is refused as too large');
    assert(big.message.includes('Choose IPFS or Arweave') && chain.broadcasts.length === 0, `the message points elsewhere and nothing is broadcast (got ${big.message})`);

    const noThread = fakeChain({ threads: [] });
    const missing = await rejection(storeFor(noThread).put('{}'));
    assert(missing?.message.includes(`@forkbuild/${CONTENT_THREAD} doesn't exist yet, so nothing can be stored on Steem`) && noThread.broadcasts.length === 0,
        `a missing content thread is named (got ${missing?.message})`);

    const readOnly = new SteemContentStore({ rpc: chain.rpc, threadAccounts: ['forkbuild'] });
    assert((await rejection(readOnly.put('{}')))?.message.includes('not available'), 'a store without an announcer can only read');
    console.log('✓ refusals when storing');
}

// Refusals when reading: always ContentUnavailableError, never a silent null.
{
    const chain = fakeChain();
    const store = storeFor(chain);
    const reference = await store.put(snapshotText(100));
    const expectUnavailable = async (ref, expected, label, onStore = store) => {
        const error = await rejection(onStore.get(ref));
        assert(error instanceof ContentUnavailableError && error.message.includes(expected), `${label} (got ${error?.message})`);
    };
    await expectUnavailable(new ContentReference({ hash: 'ffffffff', uri: reference.uri }), 'stores different content', 'a manifest for other content');
    await expectUnavailable(new ContentReference({ hash: reference.hash, uri: 'steem://alice/forkbuild-c-none-abcd1234' }), 'does not exist', 'a missing manifest');

    const [, comment] = chain.broadcasts[0].operations[0];
    const key = `alice/${comment.permlink}`;
    chain.posts.set(key, { ...chain.posts.get(key), body: `${comment.body}A` });
    await expectUnavailable(reference, 'changed since', 'an edited manifest');
    assert(await store.has(reference) === false, 'has() is false rather than throwing');

    const metadata = JSON.parse(comment.json_metadata);
    metadata.forkbuild.content.parts = [{ permlink: `${comment.permlink}-p0`, length: 1, sha256: 'ff' }];
    chain.posts.set(key, { ...comment, json_metadata: JSON.stringify(metadata), body: 'x' });
    await expectUnavailable(reference, "stored in parts, which this version of ForkBuild can't read yet", 'a manifest with parts');

    const otherAccounts = new SteemContentStore({ rpc: chain.rpc, threadAccounts: ['someone-else'] });
    await expectUnavailable(reference, 'not a reply to a ForkBuild content thread', 'a thread account that is not configured', otherAccounts);

    const down = new SteemContentStore({ rpc: { getContent: async () => { throw new Error('timeout'); } }, threadAccounts: ['forkbuild'] });
    await expectUnavailable(reference, "Couldn't read", 'an unreachable node', down);
    console.log('✓ refusals when reading');
}

// Distributing a snapshot to Steem storage and a Steem announcement, then
// resolving the announced candidate: content first, then the announcement,
// in one queue that waits out the reply interval.
{
    const chain = fakeChain();
    const clock = fakeClock();
    const announcer = announcerFor(chain, { clock });
    const contentStore = new SteemContentStore({ rpc: chain.rpc, announcer, threadAccounts: ['forkbuild'] });
    const discoveryPublisher = new SteemSnapshotDiscoveryPublisher({ announcer });
    const text = snapshotText(500);
    const { contentReference, announcement } = await executeSnapshotDistributionCommand({ bytes: text, contentStore, discoveryPublisher });

    assert(chain.broadcasts.length === 2, 'two transactions: the content, then its announcement');
    const [contentOps, announcementOps] = chain.broadcasts.map((b) => b.operations[0][1]);
    assert(contentOps.parent_permlink === CONTENT_THREAD && announcementOps.parent_permlink === 'forkbuild-snapshot-2026-10', 'content goes to the content thread and the announcement to the snapshot thread');
    assert(clock.sleeps.length === 1 && clock.sleeps[0] === 4500, `the announcement waits out the reply interval (sleeps ${clock.sleeps})`);
    const envelope = JSON.parse(announcementOps.json_metadata).forkbuild.envelope;
    assert(envelope.storage === 'steem' && envelope.locator === contentReference.uri && envelope.contentHash === contentReference.hash, 'the announcement names the Steem locator');
    assert(announcement.published === true, 'the announcement is reported');

    const registry = new SnapshotPlacementStoreRegistry().register(contentStore);
    const resolver = new DecentralizedSnapshotResolver({ search: async () => [] });
    const resolution = await resolver.resolveCandidate({ contentHash: envelope.contentHash, locator: envelope.locator, storage: envelope.storage }, { storeRegistry: registry });
    assert(resolution.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED && resolution.bytes === text, `the announced candidate resolves and verifies (got ${resolution.outcome}: ${resolution.reason})`);
    console.log('✓ distributing to Steem and resolving it');
}

// The runtime builds a content store, and Signed Claims are refused on Steem
// storage with a reason.
{
    const runtime = composeSteemRuntime({ fetchImpl: async () => { throw new Error('no network in tests'); } });
    assert(runtime.contentStore instanceof SteemContentStore && runtime.contentStore.storage === 'steem', 'the Steem runtime includes the content store');
    let caught = null;
    try {
        composePublicationMaterialUploader({ materialStorage: 'steem' });
    } catch (error) {
        caught = error;
    }
    assert(caught?.message === 'Steem storage holds Snapshots only for now. Choose Arweave or IPFS storage to distribute the Signed Claim.', `Signed Claim material on Steem is refused with a reason (got ${caught?.message})`);
    console.log('✓ composition, and Signed Claims stay off Steem storage');
}

console.log('\n✅ All SteemContentStore tests passed.');
