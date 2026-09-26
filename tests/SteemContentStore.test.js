import {
    STEEM_CONTENT_PART_MAX_BYTES,
    describeSteemContentManifest,
    parseSteemContentLocator,
    steemContentLocator,
    steemContentManifestOperations,
    steemContentManifestPermlink,
    STEEM_CONTENT_MAX_PARTS
} from '../core/SteemContentManifest.js';
import { describeSteemDiscoveryThreadPost, STEEM_DISCOVERY_FAMILIES } from '../core/SteemDiscoveryThread.js';
import {
    SteemContentStore,
    SteemContentTooLargeError,
    SteemContentUploadIncompleteError,
    SteemResourceCreditsError,
    decodeSteemContent,
    encodeSteemContent
} from '../content/SteemContentStore.js';
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
import { SteemContentUploadStore } from '../storage/SteemContentUploadStore.js';
import { describeSteemContentUploadProgress } from '../application/steem/SteemContentUploadProgressText.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// Steem content storage (docs/Protocol.md, "Proposed: Steem Content
// Storage"): the manifest and part formats, encoding, a Snapshot stored in
// one post or in parts through the real announcer, resuming an unfinished
// upload, the Resource Credits check, progress, and reading back through the
// real resolver.

const NOW = new Date('2026-10-05T12:00:00Z');
const CONTENT_THREAD = 'forkbuild-content-2026-10';

// A fake chain that keeps every post, as get_content would return it.
// `fail(attempt, operations)` may return an Error to refuse a broadcast.
function fakeChain({ threads = [CONTENT_THREAD, 'forkbuild-snapshot-2026-10'], fail = () => null } = {}) {
    const posts = new Map();
    let attempts = 0;
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
            const refusal = fail(++attempts, operations);
            if (refusal) throw refusal;
            broadcasts.push({ account, operations });
            const [, comment] = operations[0];
            posts.set(`${comment.author}/${comment.permlink}`, { ...(posts.get(`${comment.author}/${comment.permlink}`) ?? {}), ...comment, allow_replies: true, created: '2026-10-05T12:00:00' });
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

function storeFor(chain, { clock, uploads = null, estimator = null, progress = null } = {}) {
    return new SteemContentStore({ rpc: chain.rpc, announcer: announcerFor(chain, { clock }), threadAccounts: ['forkbuild'], uploads, estimator, progress });
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

    const sha = 'a'.repeat(64);
    const withParts = (parts, extra = {}) => steemContentManifestOperations({
        author: 'alice', threadAccount: 'forkbuild', threadPermlink: CONTENT_THREAD, permlink: 'forkbuild-c-x-abcd1234',
        content: { ...content, encoding: 'gzip-base64', encodedLength: parts.reduce((n, p) => n + p.length, 0), parts, ...extra }
    })[0][1];
    const twoParts = [{ permlink: 'forkbuild-c-x-abcd1234-p0', length: 3, sha256: sha }, { permlink: 'forkbuild-c-x-abcd1234-p1', length: 2, sha256: sha }];
    const partsComment = withParts(twoParts);
    assert(partsComment.body.includes('continued in the replies'), 'a manifest with parts says so in its body');
    const read = describeSteemContentManifest(partsComment, { threadAccounts }).manifest;
    assert(read && read.inline === false && read.body === null && read.parts.length === 2, 'a manifest with parts is described, not inline');
    const partCases = [
        [withParts([{ ...twoParts[0], permlink: 'forkbuild-c-x-abcd1234-p9' }, twoParts[1]]), 'not replies ForkBuild would have made'],
        [withParts(twoParts, { encodedLength: 6 }), "don't add up"],
        [withParts(Array.from({ length: 21 }, (_, i) => ({ permlink: `forkbuild-c-x-abcd1234-p${i}`, length: 1, sha256: sha }))), 'more than the 20 ForkBuild reads'],
        [{ ...partsComment, json_metadata: partsComment.json_metadata.replace(sha, 'ff') }, 'a part is malformed']
    ];
    for (const [post, expected] of partCases) {
        const { problem } = describeSteemContentManifest(post, { threadAccounts });
        assert(problem?.includes(expected), `a manifest reports "${expected}" (got ${problem})`);
    }
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
    const big = await rejection(store.put(incompressibleText(STEEM_CONTENT_PART_MAX_BYTES * 25)));
    assert(big instanceof SteemContentTooLargeError && big instanceof ContentTooLargeError, 'content that needs more than 20 parts is refused as too large');
    assert(big.message.includes('(20 posts)'), `the message names the limit (got ${big.message})`);
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

    const otherAccounts = new SteemContentStore({ rpc: chain.rpc, threadAccounts: ['someone-else'] });
    await expectUnavailable(reference, 'not a reply to a ForkBuild content thread', 'a thread account that is not configured', otherAccounts);

    const down = new SteemContentStore({ rpc: { getContent: async () => { throw new Error('timeout'); } }, threadAccounts: ['forkbuild'] });
    await expectUnavailable(reference, "Couldn't read", 'an unreachable node', down);
    console.log('✓ refusals when reading');
}

// Storing a build that needs parts: the manifest first, then each part as a
// reply to it, with progress after each post.
{
    const chain = fakeChain();
    const clock = fakeClock();
    const events = [];
    const store = storeFor(chain, { clock });
    const text = incompressibleText(STEEM_CONTENT_PART_MAX_BYTES * 3);
    const reference = await store.put(text, { onProgress: (state) => events.push(state) });

    const comments = chain.broadcasts.map((b) => b.operations[0][1]);
    const [manifest, ...parts] = comments;
    assert(parts.length >= 2 && parts.length <= STEEM_CONTENT_MAX_PARTS, `the build needs several parts (got ${parts.length})`);
    assert(manifest.parent_permlink === CONTENT_THREAD && parts.every((p, i) => p.parent_author === 'alice' && p.parent_permlink === manifest.permlink && p.permlink === `${manifest.permlink}-p${i}`),
        'the manifest replies to the content thread and each part replies to the manifest');
    const listed = JSON.parse(manifest.json_metadata).forkbuild.content;
    assert(listed.encoding === 'gzip-base64' && listed.parts.length === parts.length && listed.parts.every((p, i) => p.permlink === parts[i].permlink && p.length === parts[i].body.length),
        'the manifest lists every part before they are posted');
    assert(chain.broadcasts.every((b) => b.operations.length === 2 && b.operations[1][1].max_accepted_payout === '0.000 SBD'), 'every post declines payout');
    assert(clock.sleeps.length === parts.length && clock.sleeps.every((ms) => ms === 4500), `each post waits out the reply interval (sleeps ${clock.sleeps})`);

    const total = parts.length + 1;
    assert(JSON.stringify(events.map((e) => `${e.phase}:${e.done}`)) === JSON.stringify(['checking:0', 'posting:0', ...Array.from({ length: total }, (_, i) => `posting:${i + 1}`), `stored:${total}`]),
        `progress is reported after each post (got ${events.map((e) => `${e.phase}:${e.done}`)})`);
    assert(events.every((e) => e.total === total && e.resumed === false), 'every event carries the total');

    assert(await store.get(reference) === text && reference.verify(text), 'the parts read back, joined, into the same content');
    console.log('✓ storing in parts, with progress');

    const expectUnavailable = async (expected, label) => {
        const error = await rejection(store.get(reference));
        assert(error instanceof ContentUnavailableError && error.message.includes(expected), `${label} (got ${error?.message})`);
    };
    const partKey = `alice/${parts[1].permlink}`;
    const original = chain.posts.get(partKey);
    const flipped = original.body.slice(0, -1) + (original.body.endsWith('A') ? 'B' : 'A');
    chain.posts.set(partKey, { ...original, body: flipped });
    await expectUnavailable(`part 2 of ${parts.length} has been changed`, 'an edited part of the same length fails its hash');
    chain.posts.set(partKey, { ...original, body: `${original.body}x` });
    await expectUnavailable(`part 2 of ${parts.length} has been changed`, 'an edited part of another length fails its length');
    chain.posts.delete(partKey);
    await expectUnavailable(`part 2 of ${parts.length} is missing. The upload may not have finished`, 'a missing part');
    chain.posts.set('mallory/' + parts[1].permlink, { ...original, author: 'mallory' });
    await expectUnavailable(`part 2 of ${parts.length} is missing`, "someone else's post at a part's permlink is not the part");
    chain.posts.set(partKey, original);
    assert(await store.get(reference) === text, 'restoring the part makes the content readable again');
    console.log('✓ reading parts, and refusing missing or changed ones');
}

// Resuming: a failed part leaves a record, and storing the same content
// again with the same account posts only what is missing or changed.
{
    let refuseAttempt = 3;
    const chain = fakeChain({ fail: (attempt) => (attempt === refuseAttempt ? new Error('The user declined the transaction.') : null) });
    const uploads = new SteemContentUploadStore(new InMemoryStorageProvider());
    const store = storeFor(chain, { uploads });
    const text = incompressibleText(STEEM_CONTENT_PART_MAX_BYTES * 3);

    const failed = await rejection(store.put(text));
    assert(failed instanceof SteemContentUploadIncompleteError && failed.done === 2 && failed.message.startsWith(`Post 3 of ${failed.total} on Steem failed: The user declined the transaction. 2 of ${failed.total} posts are stored`),
        `a failed part names what is stored and how to finish (got ${failed?.message})`);
    const manifest = chain.broadcasts[0].operations[0][1];
    const hash = computeContentHash(text);
    assert(uploads.get('alice', hash)?.permlink === manifest.permlink, 'the unfinished upload is remembered');

    refuseAttempt = -1;
    const events = [];
    const before = chain.broadcasts.length;
    const reference = await store.put(text, { onProgress: (state) => events.push(state) });
    const resumedPosts = chain.broadcasts.slice(before).map((b) => b.operations[0][1]);
    assert(resumedPosts.length === failed.total - 2 && resumedPosts.every((p) => p.parent_permlink === manifest.permlink), `only the missing parts are posted (got ${resumedPosts.length})`);
    assert(reference.uri === `steem://alice/${manifest.permlink}`, 'the resumed upload keeps its manifest');
    assert(events.every((e) => e.resumed) && events[0].done === 2 && events.at(-1).phase === 'stored', 'progress says it resumed, starting from what was already stored');
    assert(uploads.get('alice', hash) === null, 'the record is cleared once every part is stored');
    assert(await store.get(reference) === text, 'the resumed upload reads back');

    // A changed part is fixed with an edit, without options.
    uploads.save({ author: 'alice', permlink: manifest.permlink, contentHash: hash });
    const partKey = `alice/${manifest.permlink}-p1`;
    chain.posts.set(partKey, { ...chain.posts.get(partKey), body: 'changed' });
    const beforeEdit = chain.broadcasts.length;
    await store.put(text);
    const edits = chain.broadcasts.slice(beforeEdit);
    assert(edits.length === 1 && edits[0].operations.length === 1 && edits[0].operations[0][1].permlink === `${manifest.permlink}-p1`, 'a changed part is edited in place, and nothing else is posted');
    assert(await store.get(reference) === text, 'the edited part reads back');

    // A record whose manifest is gone starts a fresh upload.
    uploads.save({ author: 'alice', permlink: 'forkbuild-c-gone-abcd1234', contentHash: hash });
    const beforeFresh = chain.broadcasts.length;
    const fresh = await store.put(text);
    assert(fresh.uri !== reference.uri && chain.broadcasts.length - beforeFresh === failed.total, 'a record that no longer matches the chain starts over');
    console.log('✓ resuming an unfinished upload');
}

// Resource Credits: refused before posting when the estimate says the
// account can't afford it; a refusal from the chain gets its own message.
{
    const estimates = [];
    const estimatorSaying = (result) => ({ async estimate(account, transactions) { estimates.push({ account, transactions }); return result; } });
    const text = incompressibleText(STEEM_CONTENT_PART_MAX_BYTES * 2);

    const poor = fakeChain();
    const events = [];
    const refused = await rejection(storeFor(poor, { estimator: estimatorSaying({ enough: false, neededPercent: 40, availablePercent: 12 }) }).put(text, { onProgress: (e) => events.push(e) }));
    assert(refused instanceof SteemResourceCreditsError && poor.broadcasts.length === 0, 'too few Resource Credits stops the upload before anything is posted');
    assert(refused.message.startsWith("Storing this build on Steem needs about 40% of your account's Resource Credits, and it has 12% right now."), `the message gives both shares (got ${refused.message})`);
    assert(events.at(-1).phase === 'failed', 'progress reports the failure');
    const [{ account, transactions }] = estimates;
    assert(account === 'alice' && transactions.length === 3 && transactions[0][0][1].parent_permlink.startsWith('forkbuild-content-') && transactions[1][0][1].permlink.endsWith('-p0'),
        'the estimate covers the manifest and every part');

    const rich = fakeChain();
    const richEvents = [];
    await storeFor(rich, { estimator: estimatorSaying({ enough: true, neededPercent: 3, availablePercent: 90 }) }).put(text, { onProgress: (e) => richEvents.push(e) });
    assert(rich.broadcasts.length === 3 && richEvents.at(-1).resourceCredits?.neededPercent === 3, 'enough Resource Credits: the upload goes ahead and progress carries the estimate');

    const unknown = fakeChain();
    await storeFor(unknown, { estimator: estimatorSaying(null) }).put(text);
    assert(unknown.broadcasts.length === 3, 'no estimate (the node could not say): the upload goes ahead');

    const rcRefusal = new Error('Account: alice has 10 RC, needs 999 RC. Please wait to transact, or power up STEEM.');
    const first = await rejection(storeFor(fakeChain({ fail: () => rcRefusal })).put(text));
    assert(first?.message.startsWith('Steem refused the post: your Steem account ran out of Resource Credits.'), `a refusal on the first post (got ${first?.message})`);
    const middle = await rejection(storeFor(fakeChain({ fail: (attempt) => (attempt === 2 ? rcRefusal : null) })).put(text));
    assert(middle instanceof SteemContentUploadIncompleteError && middle.message.includes('your Steem account ran out of Resource Credits. 1 of 3 posts are stored'),
        `a refusal part-way (got ${middle?.message})`);
    console.log('✓ the Resource Credits check');
}

// The progress line, and the upload record.
{
    assert(describeSteemContentUploadProgress(null) === null && describeSteemContentUploadProgress({ phase: 'stored', done: 3, total: 3 }) === null, 'nothing to show when idle or finished');
    assert(describeSteemContentUploadProgress({ phase: 'checking', done: 0, total: 3 }) === 'Storing on Steem: checking your Resource Credits…', 'checking');
    const line = describeSteemContentUploadProgress({ phase: 'posting', done: 2, total: 5, resumed: true, resourceCredits: { neededPercent: 7, availablePercent: 80 } });
    assert(line === 'Storing on Steem: 2 of 5 posts made. Approve each post in Steem Keychain. Resuming an earlier upload of this build. Uses about 7% of your Resource Credits (80% available).', `posting (got ${line})`);
    assert(describeSteemContentUploadProgress({ phase: 'posting', done: 0, total: 1 }).includes('0 of 1 post made'), 'one post is singular');

    const uploads = new SteemContentUploadStore(new InMemoryStorageProvider());
    uploads.save({ author: 'alice', permlink: 'forkbuild-c-x-abcd1234', contentHash: 'abcd0123' });
    assert(uploads.get('alice', 'abcd0123')?.permlink === 'forkbuild-c-x-abcd1234' && uploads.get('bob', 'abcd0123') === null, 'records are per account and content');
    uploads.remove('alice', 'abcd0123');
    assert(uploads.get('alice', 'abcd0123') === null, 'a record can be removed');
    console.log('✓ the progress line and the upload record');
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
