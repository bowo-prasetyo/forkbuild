import {
    BlurtSerializationError,
    blurtPublicKeyBytes,
    blurtPublicKeyString,
    blurtTransactionId,
    packBlurtTransaction
} from '../core/BlurtBinary.js';
import { captureBlurtBlockEvidence, checkBlurtBlockEvidence } from '../core/BlurtBlockEvidence.js';
import { blurtAnchorBatch, blurtTransactionAnchors, parseBlurtAnchorProof } from '../core/BlurtAnchor.js';
import { createBlurtPoster } from '../application/blurt/BlurtPoster.js';
import { createBlurtRpcClient } from '../blurt/BlurtRpcClient.js';
import { BlurtAnchorPublisher } from '../anchoring/BlurtAnchorPublisher.js';
import { BlurtProofVerifier } from '../anchoring/BlurtProofVerifier.js';
import { BlurtAnchorEvidenceView } from '../anchoring/BlurtAnchorEvidenceView.js';
import { BlurtAnchorFinalityObserver } from '../anchoring/BlurtAnchorFinalityObserver.js';
import { composeBlurtRuntime } from '../application/blurt/BlurtRuntimeComposition.js';
import { BlurtReadingConfiguration } from '../core/BlurtReadingConfiguration.js';
import { BLURT_WITNESS_KEY, fakeBlurtChain } from './support/FakeBlurtChain.js';
import { assert } from './support/Assert.js';

const HASH = 'sha256:' + 'cd'.repeat(32);
const HASHES = ['sha256:' + '01'.repeat(32), 'sha256:' + '02'.repeat(32), 'sha256:' + '03'.repeat(32)];
let suffixes = 0;

async function throwsAsync(fn) {
    try {
        await fn();
    } catch (error) {
        return error;
    }
    return null;
}

function rpcFor(chain, node = 'https://a') {
    return createBlurtRpcClient({ nodes: [node], fetchImpl: chain.fetchImpl });
}

function setup(options = {}) {
    const chain = fakeBlurtChain(options);
    const poster = createBlurtPoster({
        rpc: rpcFor(chain),
        getBroadcaster: () => chain.broadcaster,
        getAccount: () => 'alice',
        now: () => new Date(chain.time),
        clock: () => chain.time,
        sleep: async (ms) => { chain.time += ms; },
        randomSuffix: () => `a${String(suffixes++).padStart(7, '0')}`
    });
    const publisher = new BlurtAnchorPublisher({ poster, rpc: rpcFor(chain), sleep: async () => {} });
    const verifier = new BlurtProofVerifier({ nodes: ['https://a', 'https://b'], fetchImpl: chain.fetchImpl });
    return { chain, poster, publisher, verifier };
}

// Transaction serialization matches dblurt, which signs real Blurt
// transactions: these ids were computed by @beblurt/dblurt 0.17.0 for the
// same transactions (ref block 12345/2345678901, expiring
// 2026-09-26T10:00:30). Blurt numbers its operations differently from
// Steem, so the same comment has a different id there.
{
    const key = 'BLT6dJ529NRcXQU4YRqzPef7krMzoXXV3mzy42HPF8SqHVZz9Ae3T';
    const vectors = [
        ['fa4074107cba90bf295df67d4ab7b58717dc54f5', ['vote', { voter: 'alice', author: 'bob', permlink: 'p', weight: -10000 }]],
        ['898963f0fe3904c29eafc888aedd110fd01d5c96', ['comment', { parent_author: '', parent_permlink: 'forkbuild', author: 'alice', permlink: 'p', title: 'T é', body: 'body ✓', json_metadata: '{}' }]],
        ['e17c49c146c40721949956dd4789a35597ecca82', ['transfer', { from: 'a', to: 'b', amount: '1.234 BLURT', memo: 'hi' }]],
        ['d89cacf021aa18f57ed859d167c7bf7a18b0245d', ['account_update', { account: 'a', owner: undefined, active: { weight_threshold: 1, account_auths: [['bob', 1]], key_auths: [[key, 1]] }, posting: undefined, memo_key: key, json_metadata: '{"a":1}', posting_json_metadata: '', extensions: [] }]],
        ['cdb47f0443d8717e6d1efbc5e2ab2153030bc6e2', ['custom_json', { required_auths: [], required_posting_auths: ['alice'], id: 'forkbuild-anchor', json: '{"version":1}' }]],
        ['cf70ceddaa5cb60770023e301de4c6d8b9080d51', ['comment_options', { author: 'a', permlink: 'p', max_accepted_payout: '1000000.000 BLURT', allow_votes: true, allow_curation_rewards: true, extensions: [[0, { beneficiaries: [{ account: 'b', weight: 500 }] }]] }]],
        ['950aa64b0d47a31345658b91c9d629c02bffac5e', ['claim_reward_balance', { account: 'a', reward_blurt: '0.001 BLURT', reward_vests: '10.000000 VESTS' }]],
        ['3dcda5bad07e9ab3de829b5e4a7aa0f348f0807f', ['escrow_transfer', { from: 'a', to: 'b', agent: 'c', escrow_id: 7, blurt_amount: '1.000 BLURT', fee: '0.001 BLURT', ratification_deadline: '2026-09-26T10:00:00', escrow_expiration: '2026-09-27T10:00:00', json_meta: '{}' }]],
        ['d9e21e65270b371708608e3bd90b60e67c649922', ['witness_update', { owner: 'w', url: 'u', block_signing_key: key, props: { account_creation_fee: '10.000 BLURT', maximum_block_size: 131072 }, fee: '0.000 BLURT' }]],
        ['f0a2ad54b4cd637730cb4a0eb1db34c3a44c60c8', ['update_proposal_votes', { voter: 'a', proposal_ids: [1, 2, 300], approve: true, extensions: [] }]],
        ['3bc407a39efb0bd5e57cd245b092a8cd747deefb', ['delegate_vesting_shares', { delegator: 'a', delegatee: 'b', vesting_shares: '1.000000 VESTS' }]]
    ];
    for (const [id, operation] of vectors) {
        const tx = { ref_block_num: 12345, ref_block_prefix: 2345678901, expiration: '2026-09-26T10:00:30', operations: [operation], extensions: [] };
        assert(blurtTransactionId(tx) === id, `${operation[0]} serializes as dblurt does`);
    }
    const steemOnly = { ref_block_num: 1, ref_block_prefix: 1, expiration: '2026-09-26T10:00:30', operations: [['limit_order_create', {}]], extensions: [] };
    const caught = await throwsAsync(() => packBlurtTransaction(steemOnly));
    assert(caught instanceof BlurtSerializationError && caught.message.includes('limit_order_create'), 'an operation Blurt doesn\'t have is refused, never guessed');
    assert(blurtPublicKeyString(blurtPublicKeyBytes(key)) === key, 'a BLT key round-trips');
    assert((await throwsAsync(() => blurtPublicKeyBytes(key.replace('BLT', 'STM')))) instanceof BlurtSerializationError, 'a Steem key is not a Blurt key');
    console.log('✓ transactions serialize exactly as dblurt does');
}

// The announcement post is the anchor: anchoring a Snapshot this device
// announced posts nothing, and the proof checks out on the chain and offline.
{
    const { chain, poster, publisher, verifier } = setup();
    const announced = await poster.announce('snapshot', { contentHash: HASH, locator: 'blurt://alice/x', storage: 'blurt' });
    const broadcasts = chain.broadcasts.length;
    const result = await publisher.publish(HASH);
    assert(result.published && chain.broadcasts.length === broadcasts, 'nothing new is posted');
    assert(result.locator === `blurt:${announced.transactionId}` && result.proof.post.permlink === announced.permlink, 'the anchor is the announcement\'s transaction');
    assert(checkBlurtBlockEvidence(result.proof.evidence, result.proof).ok, 'the kept block evidence checks out offline');
    const early = await verifier.verify(result.proof, { contentHash: HASH });
    assert(early.unavailable && early.reason.includes('not irreversible'), 'not final yet is unavailable');
    chain.finalize();
    const verified = await verifier.verify(result.proof, { contentHash: HASH });
    assert(verified.valid && verified.details.nodesAgreeing === 2 && verified.details.evidence.ok, `valid on both nodes (${verified.reason})`);
    assert((await verifier.verify(result.proof, { contentHash: 'sha256:' + 'ef'.repeat(32) })).valid === false, 'another contentHash is rejected');

    // An edit later doesn't change what was anchored.
    await poster.announce('commentary', { commentaryId: 'c1' });
    assert((await verifier.verify(result.proof, { contentHash: HASH })).valid, 'still valid after the post is edited');
    console.log('✓ the announcement post is the anchor');
}

// With nothing to reuse, the contentHash goes into a build post's anchors.
{
    const { chain, publisher, verifier } = setup();
    const result = await publisher.publish(HASH);
    const [name, op] = chain.broadcasts.at(-1).operations[0];
    assert(result.published && name === 'comment' && op.parent_author === '' && JSON.parse(op.json_metadata).forkbuild.anchors[0] === HASH, 'a build post carrying the anchor');
    assert(op.title === 'A ForkBuild anchor', 'titled for what it carries');
    chain.finalize();
    assert((await verifier.verify(result.proof, { contentHash: HASH })).valid, 'and it verifies');
    const second = await publisher.publish(HASHES[0]);
    assert(chain.posts.size === 1 && second.published, 'a second anchor edits the same post');
    chain.finalize();
    assert((await verifier.verify(second.proof, { contentHash: HASHES[0] })).valid, 'and verifies by its own transaction');
    console.log('✓ anchoring in a build post');
}

// A batch is one custom_json; each Publication gets its own path.
{
    const { chain, publisher, verifier } = setup();
    const result = await publisher.publishBatch(HASHES);
    const [[name, op]] = chain.broadcasts.at(-1).operations;
    assert(name === 'custom_json' && op.id === 'forkbuild-anchor' && JSON.parse(op.json).merkleRoot === blurtAnchorBatch(HASHES).merkleRoot, 'one custom_json with the root');
    chain.finalize();
    for (const { contentHash, proof } of result.results) {
        assert((await verifier.verify(proof, { contentHash })).valid, `${contentHash} verifies through its path`);
    }
    const swapped = { ...result.results[0].proof, batch: result.results[1].proof.batch };
    assert((await verifier.verify(swapped, { contentHash: HASHES[0] })).valid === false, 'another Publication\'s path is rejected');
    const transaction = chain.blocks.get(result.results[0].proof.blockNum).transactions[1];
    assert(!blurtTransactionAnchors(transaction, { contentHash: HASHES[0] }), 'a batch root is never a single anchor');
    console.log('✓ batches');
}

// The verifier: a missing transaction is rejected; nodes that disagree, or
// none that answer, are unavailable.
{
    const { chain, publisher } = setup();
    const result = await publisher.publish(HASH);
    chain.finalize();
    const verifier = new BlurtProofVerifier({ nodes: ['https://a'], fetchImpl: chain.fetchImpl });
    const wrongTrx = await verifier.verify({ ...result.proof, trxId: 'f'.repeat(40) }, { contentHash: HASH });
    assert(wrongTrx.valid === false && !wrongTrx.unavailable, 'a block without the transaction is a rejection');
    assert((await verifier.verify({ ...result.proof, chain: 'steem' }, { contentHash: HASH })).reason.includes('"blurt"'), 'a Steem proof is not a Blurt proof');
    const lying = fakeBlurtChain();
    Object.assign(lying, { head: chain.head });
    const split = new BlurtProofVerifier({
        nodes: ['https://a', 'https://b'],
        fetchImpl: (url, init) => (url === 'https://b' ? lying.fetchImpl(url, init) : chain.fetchImpl(url, init))
    });
    assert((await split.verify(result.proof, { contentHash: HASH })).unavailable, 'a node that disagrees makes the result unavailable');
    const offline = new BlurtProofVerifier({ nodes: ['https://a'], fetchImpl: async () => { throw new Error('offline'); } });
    const unreachable = await offline.verify(result.proof, { contentHash: HASH });
    assert(unreachable.unavailable && unreachable.reason.includes('evidence checks out offline'), 'unreachable, with the offline evidence noted');
    console.log('✓ verifying');
}

// Evidence is kept only when the block checks out, including Blurt's
// fee_info header extension.
{
    const { chain, publisher } = setup();
    const result = await publisher.publish(HASH);
    const block = chain.blocks.get(result.proof.blockNum);
    assert(block.extensions[0][0] === 3, 'the fake chain\'s headers carry fee_info');
    assert(result.proof.evidence.signingKey === BLURT_WITNESS_KEY && result.proof.evidence.signingKey.startsWith('BLT'), 'the witness key reads BLT…');
    const forged = { ...block, transaction_merkle_root: '00'.repeat(20) };
    assert((await throwsAsync(() => captureBlurtBlockEvidence(forged, result.proof))) instanceof BlurtSerializationError, 'a block that doesn\'t hash right is never kept');
    console.log('✓ kept evidence');
}

// Finality, the evidence view, and the runtime.
{
    const { chain, publisher } = setup();
    const result = await publisher.publish(HASH);
    const observer = new BlurtAnchorFinalityObserver({ rpc: rpcFor(chain), sleep: async () => { chain.finalize(); } });
    assert(observer.anchorType === 'blurt', 'the observer is for blurt anchors');
    assert((await observer.check(result.proof)).state === 'pending', 'pending before finality');
    assert((await observer.waitUntilFinal(result.proof)).state === 'final', 'final after');
    assert((await observer.check({ ...result.proof, chain: 'steem' })).state === 'unknown', 'a Steem proof is not watched');

    const view = new BlurtAnchorEvidenceView();
    const described = view.describe({ proof: result.proof, contentHash: HASH });
    assert(described.summary === 'Blurt' && described.fields.some((f) => f.label === 'Attested by' && f.value.startsWith('Blurt witnesses')), 'says what backs the anchor');
    assert(described.externalLocator.url === `https://blurt.blog/@alice/${result.proof.post.permlink}`, 'links to the post');
    assert(described.fields.some((f) => f.label === 'Kept block evidence' && f.value.startsWith('Checks out offline')), 'checks the kept evidence offline');
    assert(view.describeFinality({ state: 'final', blockNum: 7 }).message.includes('Blurt block 7'), 'finality in Blurt words');
    assert(parseBlurtAnchorProof({ ...result.proof, post: { author: 'BAD', permlink: 'x' } }).post === null, 'a malformed post name is dropped');

    const runtime = composeBlurtRuntime({ configuration: new BlurtReadingConfiguration(), fetchImpl: chain.fetchImpl });
    assert(runtime.anchorPublisher.anchorType === 'blurt' && runtime.proofVerifier.anchorType === 'blurt' && runtime.contentStore.storage === 'blurt', 'the runtime offers the blurt anchor type and storage');
    assert(runtime.proofVerifier.nodes.join() === 'https://rpc.blurt.blog,https://rpc.beblurt.com', 'the verifier asks the default nodes');
    console.log('✓ finality, evidence view and runtime');
}
