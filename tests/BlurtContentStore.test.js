import { BlurtContentStore, BlurtContentTooLargeError, BlurtContentUploadIncompleteError, BlurtFeeError } from '../content/BlurtContentStore.js';
import { ContentUnavailableError } from '../content/IpfsContentStore.js';
import { createBlurtPoster } from '../application/blurt/BlurtPoster.js';
import { createBlurtFeeEstimator } from '../application/blurt/BlurtFeeEstimator.js';
import { createBlurtRpcClient } from '../blurt/BlurtRpcClient.js';
import { BlurtWorldEncounterMaterialResolver } from '../application/worldEncounter/BlurtWorldEncounterMaterialResolver.js';
import { BlurtContentUploadStore } from '../storage/BlurtContentUploadStore.js';
import { blurtSignedTransactionSize, blurtTransactionFee, blurtFeeSchedule, formatBlurtAmount, parseBlurtAmount } from '../core/BlurtFees.js';
import { computeContentHash } from '../serializer/contentHash.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { fakeBlurtChain } from './support/FakeBlurtChain.js';
import { assert } from './support/Assert.js';

let suffixes = 0;

function setup({ balances, broadcaster = null, describePublication = null } = {}) {
    const chain = fakeBlurtChain({ balances });
    const rpc = createBlurtRpcClient({ nodes: ['https://a'], fetchImpl: chain.fetchImpl });
    const poster = createBlurtPoster({
        rpc,
        getBroadcaster: () => broadcaster ?? chain.broadcaster,
        getAccount: () => 'alice',
        now: () => new Date(chain.time),
        clock: () => chain.time,
        sleep: async (ms) => { chain.time += ms; },
        randomSuffix: () => `c${String(suffixes++).padStart(7, '0')}`
    });
    const uploads = new BlurtContentUploadStore(new InMemoryStorageProvider());
    const progress = [];
    const store = new BlurtContentStore({ rpc, poster, uploads, estimator: createBlurtFeeEstimator({ rpc }), progress: { report: (state) => progress.push(state) }, describePublication });
    return { chain, rpc, poster, uploads, store, progress };
}

async function rejection(promise) {
    try {
        await promise;
        return null;
    } catch (error) {
        return error;
    }
}

// Random text doesn't compress, so it needs parts.
function randomText(bytes) {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const random = new Uint8Array(bytes);
    for (let i = 0; i < bytes; i += 65536) globalThis.crypto.getRandomValues(random.subarray(i, i + 65536));
    return JSON.stringify({ data: Array.from(random, (b) => alphabet[b % alphabet.length]).join('') });
}

// The fee formula is the chain's: flat per operation plus per KiB, each at
// least 0.001 BLURT.
{
    assert(parseBlurtAmount('1.234 BLURT') === 1234 && parseBlurtAmount('1.23 BLURT') === null && formatBlurtAmount(50) === '0.050 BLURT', 'amounts parse and print');
    const schedule = blurtFeeSchedule({ operation_flat_fee: '0.050 BLURT', bandwidth_kbytes_fee: '0.100 BLURT' });
    const small = blurtTransactionFee([['vote', { voter: 'a', author: 'b', permlink: 'c', weight: 1 }]], schedule);
    // 87 bytes signed: header 10, one 10-byte operation, extensions 1, one 66-byte signature.
    assert(blurtSignedTransactionSize([['vote', { voter: 'a', author: 'b', permlink: 'c', weight: 1 }]]) === 87, 'the packed size counts one signature');
    assert(small === 50 + Math.floor((87 * 100) / 1024), `one small operation: the flat fee and its bytes' share (got ${small})`);
    assert(blurtTransactionFee([['vote', { voter: 'a', author: 'b', permlink: 'c', weight: 1 }]], { operationFlatFee: 0, bandwidthKbytesFee: 0 }) === 2, 'never below 0.001 BLURT each');
    console.log('✓ the fee formula');
}

// Small content is one inline manifest, a reply to a new build post; it
// reads back exactly, and the fees are charged and reported.
{
    const { chain, store, progress } = setup();
    const text = JSON.stringify({ bricks: [1, 2, 3], name: 'tiny' });
    const reference = await store.put(text);
    assert(reference.storage === 'blurt' && reference.uri.startsWith('blurt://alice/forkbuild-c-') && reference.hash === computeContentHash(text), 'a blurt:// locator and the content hash');
    const manifest = chain.posts.get(reference.uri.slice('blurt://'.length));
    const root = chain.posts.get(`alice/${manifest.parent_permlink}`);
    assert(root && root.parent_author === '' && root.parent_permlink === 'forkbuild', 'the manifest replies to a build post');
    assert(await store.get(reference) === text, 'the content reads back');
    assert(await store.has(reference) === true, 'has() agrees');
    const checking = progress.find((state) => state.phase === 'checking' && state.fees);
    const charged = chain.fees.reduce((sum, fee) => sum + fee, 0);
    assert(progress.some((state) => state.phase === 'posting' && state.fees?.needed === formatBlurtAmount(charged)), `the estimate is exactly what the chain charged (${formatBlurtAmount(charged)}, estimated ${checking?.fees?.needed})`);
    assert(progress.at(-1).phase === 'stored', 'progress ends stored');
    console.log('✓ inline content');
}

// Larger content is split into parts under the manifest; a changed part
// makes the content unavailable rather than different.
{
    const { chain, store } = setup();
    const text = randomText(100 * 1024);
    const reference = await store.put(text);
    const manifestKey = reference.uri.slice('blurt://'.length);
    const manifest = JSON.parse(chain.posts.get(manifestKey).json_metadata).forkbuild.content;
    assert(manifest.encoding === 'gzip-base64' && manifest.parts.length >= 2, `parts (${manifest.parts.length})`);
    assert(chain.refusals.length === 0, 'the chain refused nothing');
    assert(await store.get(reference) === text, 'the parts read back');
    const part = chain.posts.get(`alice/${manifest.parts[0].permlink}`);
    const metadata = JSON.parse(part.json_metadata);
    metadata.forkbuild.data = metadata.forkbuild.data.replace(/^./, (c) => (c === 'A' ? 'B' : 'A'));
    part.json_metadata = JSON.stringify(metadata);
    const error = await rejection(store.get(reference));
    assert(error instanceof ContentUnavailableError && error.message.includes('changed'), `a changed part is unavailable (got ${error?.message})`);
    assert(await store.get({ uri: 'ipfs://x' }) === null, 'another store\'s locator is not this store\'s');
    console.log('✓ content in parts');
}

// An account without enough BLURT is refused before anything is posted.
{
    const { chain, store } = setup({ balances: { alice: '0.010 BLURT' } });
    const error = await rejection(store.put(JSON.stringify({ a: 1 })));
    assert(error instanceof BlurtFeeError && error.message.includes('0.010 BLURT'), `refused with the fee and the balance (got ${error?.message})`);
    assert(chain.broadcasts.length === 0, 'nothing was posted');
    console.log('✓ fees are checked first');
}

// An upload that stops part-way resumes with only what is missing.
{
    let failAt = 3;
    let calls = 0;
    const holder = {};
    const flaky = { broadcast: async (account, operations) => {
        calls += 1;
        if (calls === failAt) throw new Error('user declined');
        return holder.chain.broadcaster.broadcast(account, operations);
    } };
    const { chain, store } = setup({ broadcaster: flaky });
    holder.chain = chain;
    const text = randomText(150 * 1024);
    const error = await rejection(store.put(text));
    // The first broadcast is the build post, the second the manifest.
    assert(error instanceof BlurtContentUploadIncompleteError && error.done === 1, `an incomplete upload says what is stored (got ${error?.message})`);
    failAt = -1;
    const before = chain.broadcasts.length;
    const reference = await store.put(text);
    const total = JSON.parse(chain.posts.get(reference.uri.slice('blurt://'.length)).json_metadata).forkbuild.content.parts.length + 1;
    assert(chain.broadcasts.length - before === total - 1, `only the missing parts are posted, under the same manifest (${chain.broadcasts.length - before} of ${total})`);
    assert(await store.get(reference) === text, 'and the content reads back');
    console.log('✓ resuming');
}

// A Signed Claim links to the app's view, with its card on the manifest.
{
    const { chain, store } = setup({ describePublication: async () => ({ title: 'Tower', author: 'Ann', description: 'Tall', imageUrl: 'https://images.blurt.blog/t.png' }) });
    const reference = await store.put(JSON.stringify({ kind: 'claim', title: 'Tower' }), { kind: 'publication' });
    const [author, permlink] = reference.uri.slice('blurt://'.length).split('/');
    const manifest = chain.posts.get(`${author}/${permlink}`);
    assert(manifest.body.includes(`#/view/blurt/${author}/${permlink}`) && manifest.body.includes('**Tower**'), `the notice names the build and links to the app (got ${manifest.body})`);
    assert(!manifest.body.includes('Tall') && !manifest.body.includes('![') && manifest.body.split('\n').length === 1, 'without repeating the card, which the build post shows');
    const buildPost = chain.posts.get(`${author}/${manifest.parent_permlink}`);
    assert(buildPost.body.includes('**Tower** by Ann') && buildPost.body.includes('Tall') && buildPost.body.includes('!['), 'the build post shows the card');
    const resolver = new BlurtWorldEncounterMaterialResolver({ rpc: createBlurtRpcClient({ nodes: ['https://a'], fetchImpl: chain.fetchImpl }) });
    const material = await resolver.retrieveByUri(reference.uri);
    assert(material?.kind === 'claim', 'the material resolver reads the claim back');
    assert(await resolver.retrieveByUri('steem://alice/x') === null, 'and leaves other locators alone');
    console.log('✓ Signed Claims');
}

// Too much content is refused before anything is posted.
{
    const { chain, store } = setup();
    const error = await rejection(store.put(randomText(1400 * 1024)));
    assert(error instanceof BlurtContentTooLargeError && error.message.includes('Blurt'), `refused as too large for Blurt (got ${error?.message})`);
    assert(chain.broadcasts.length === 0, 'nothing was posted');
    console.log('✓ size limit');
}
