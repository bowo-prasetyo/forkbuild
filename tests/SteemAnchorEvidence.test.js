import {
    SteemSerializationError,
    packSteemTransaction,
    steemBlockHeaderDigest,
    steemMerkleRootFromPath,
    steemMerkleTree,
    steemPublicKeyBytes,
    steemPublicKeyString,
    steemTransactionId
} from '../core/SteemBinary.js';
import { captureSteemBlockEvidence, checkSteemBlockEvidence } from '../core/SteemBlockEvidence.js';
import { STEEM_ANCHOR_MAX_BATCH, parseSteemAnchorProof, steemAnchorBatch, steemAnchorBatchRoot, steemAnchorOperations } from '../core/SteemAnchor.js';
import { SteemProofVerifier } from '../anchoring/SteemProofVerifier.js';
import { SteemAnchorPublisher } from '../anchoring/SteemAnchorPublisher.js';
import { SteemAnchorEvidenceView } from '../anchoring/SteemAnchorEvidenceView.js';
import { SteemAnchorFinalityObserver } from '../anchoring/SteemAnchorFinalityObserver.js';
import { createSteemAnnouncer } from '../application/steem/SteemAnnouncer.js';
import { composeSteemRuntime } from '../application/steem/SteemRuntimeComposition.js';
import { createSteemRpcClient } from '../steem/SteemRpcClient.js';
import { DecentralizedPublication } from '../core/DecentralizedPublication.js';
import { ContentReference } from '../core/ContentReference.js';
import { LocalPublicationCatalog } from '../application/publication/LocalPublicationCatalog.js';
import { LocalPublicationAnchorCatalog } from '../application/anchoring/LocalPublicationAnchorCatalog.js';
import { CreateExternalPublicationAnchorOrchestratorUseCase } from '../application/anchoring/CreateExternalPublicationAnchorOrchestratorUseCase.js';
import { PublicationAnchorCreationCoordinator } from '../application/anchoring/PublicationAnchorCreationCoordinator.js';
import { ExternalAnchorCreationOutcome } from '../application/anchoring/ExternalAnchorCreationOutcome.js';
import { ExternalAnchorVerifier } from '../application/anchoring/ExternalAnchorVerifier.js';
import { AnchorVerificationOutcome } from '../application/anchoring/AnchorVerificationOutcome.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { makeIdentity } from './support/TestIdentity.js';
import { WITNESS_KEY, fakeSteemChain, signSteemHeader, steemTransaction } from './support/FakeSteemChain.js';
import { assert } from './support/Assert.js';

const HASH = 'fnv1a-32:1a2b3c4d';
const HASHES = ['fnv1a-32:00000001', 'fnv1a-32:00000002', 'fnv1a-32:00000003'];

async function throwsAsync(fn) {
    try {
        await fn();
    } catch (error) {
        return error;
    }
    return null;
}

function rpcFor(chain, node = 'https://a') {
    return createSteemRpcClient({ nodes: [node], fetchImpl: chain.fetchImpl });
}

function publisherFor(chain, options = {}) {
    const announcer = createSteemAnnouncer({ rpc: rpcFor(chain), getAccount: () => 'alice', getBroadcaster: () => chain.broadcaster, sleep: async () => {} });
    return new SteemAnchorPublisher({ poster: announcer, rpc: rpcFor(chain), sleep: async () => {}, ...options });
}

// Transaction serialization matches dsteem, which signs real Steem
// transactions: these ids were computed by dsteem 0.11.3 for the same
// transactions (ref block 12345/2345678901, expiring 2026-09-26T10:00:30).
{
    const key = 'STM6dJ529NRcXQU4YRqzPef7krMzoXXV3mzy42HPF8SqHVZz9Ae3T';
    const vectors = [
        ['fa4074107cba90bf295df67d4ab7b58717dc54f5', ['vote', { voter: 'alice', author: 'bob', permlink: 'p', weight: -10000 }]],
        ['f333652e30a767d6373d869c99d2baa5595299ee', ['comment', { parent_author: '', parent_permlink: 'x', author: 'alice', permlink: 'p', title: 'T é', body: 'body ✓', json_metadata: '{}' }]],
        ['4f58e03cf3e844be9fefd34ad12d0df4c74fb99d', ['transfer', { from: 'a', to: 'b', amount: '1.234 STEEM', memo: 'hi' }]],
        ['46a4d5a9ba1a8efb0aab7a01d353312299ccfa50', ['limit_order_create', { owner: 'a', orderid: 7, amount_to_sell: '1.000 SBD', min_to_receive: '2.000 STEEM', fill_or_kill: false, expiration: '2026-09-26T10:00:00' }]],
        ['a9186c7e1a0709b7a5d1a547202a382175cf3290', ['account_update', { account: 'a', owner: undefined, active: { weight_threshold: 1, account_auths: [['bob', 1]], key_auths: [[key, 1]] }, posting: undefined, memo_key: key, json_metadata: '{"a":1}' }]],
        ['358aabccd1bc716442ea2a7db054c2a9a43c104c', ['custom_json', { required_auths: [], required_posting_auths: ['alice'], id: 'forkbuild-anchor', json: '{"version":1}' }]],
        ['e3a54e71645cad5ccd80842196ec0ca907c88609', ['comment_options', { author: 'a', permlink: 'p', max_accepted_payout: '1000000.000 SBD', percent_steem_dollars: 10000, allow_votes: true, allow_curation_rewards: true, extensions: [[0, { beneficiaries: [{ account: 'b', weight: 500 }] }]] }]],
        ['3105e335aa4d9adfaa207663dd4839cae6abca0a', ['claim_reward_balance', { account: 'a', reward_steem: '0.000 STEEM', reward_sbd: '0.001 SBD', reward_vests: '10.000000 VESTS' }]],
        ['1bfd1a92bc628dfa783d6fe82a2424e04ddf7ab8', ['witness_set_properties', { owner: 'w', props: [['account_creation_fee', 'b80b00000000000003535445454d0000'], ['key', '02' + '11'.repeat(32)]], extensions: [] }]],
        ['759609267f5255cad20131b7e6bdcde07e341944', ['update_proposal_votes', { voter: 'a', proposal_ids: [1, 2, 300], approve: true, extensions: [] }]]
    ];
    for (const [id, operation] of vectors) {
        const tx = { ref_block_num: 12345, ref_block_prefix: 2345678901, expiration: '2026-09-26T10:00:30', operations: [operation], extensions: [] };
        assert(steemTransactionId(tx) === id, `${operation[0]} serializes as dsteem does`);
    }
    const appbase = { ref_block_num: 12345, ref_block_prefix: 2345678901, expiration: '2026-09-26T10:00:30', operations: [{ type: 'vote_operation', value: vectors[0][1][1] }], extensions: [] };
    assert(steemTransactionId(appbase) === vectors[0][0], 'the appbase operation shape serializes the same');

    const unknown = { ref_block_num: 1, ref_block_prefix: 1, expiration: '2026-09-26T10:00:30', operations: [['pow2', {}]], extensions: [] };
    const caught = await throwsAsync(() => packSteemTransaction(unknown));
    assert(caught instanceof SteemSerializationError && caught.message.includes('pow2'), 'an operation without a serializer is refused, never guessed');
    const badAsset = await throwsAsync(() => packSteemTransaction({ ...unknown, operations: [['transfer', { from: 'a', to: 'b', amount: { amount: '1', precision: 3, nai: '@@000000021' }, memo: '' }]] }));
    assert(badAsset instanceof SteemSerializationError, 'an asset in another format is refused');

    assert(steemPublicKeyString(steemPublicKeyBytes(key)) === key, 'a public key round-trips');
    const tampered = key.slice(0, -1) + (key.endsWith('T') ? 'U' : 'T');
    assert((await throwsAsync(() => steemPublicKeyBytes(tampered))) instanceof SteemSerializationError, 'a key with a wrong checksum is refused');
    console.log('✓ transactions serialize exactly as dsteem does');
}

// A header signed by dsteem recovers to the signer's key.
{
    const header = { previous: '0000abcd' + '11'.repeat(16), timestamp: '2026-09-26T10:00:03', witness: 'witness-one', transaction_merkle_root: '22'.repeat(20), extensions: [] };
    const evidence = {
        version: 1,
        header: { ...header, witness_signature: '1f088379a7f25d042b8008c6cc846c099d1b51a17c77436a18e736369ef410f80e4a65c52416710a6e1a4dbcf06c09517d7c38439a74c788600b16184b1e3cdced' },
        signingKey: 'STM62Zz1BLcReJGDCv3djQDa4pY6BdBsVMaX4CnuUsp4wixVx4V1Z',
        transaction: steemTransaction([['vote', { voter: 'a', author: 'b', permlink: 'c', weight: 1 }]]),
        merklePath: []
    };
    const checked = checkSteemBlockEvidence(evidence, { blockNum: 0xabcd + 1, trxId: steemTransactionId(evidence.transaction) });
    // The header's Merkle root is made up, so only the signature and id steps pass.
    assert(!checked.ok && checked.reason.includes("isn't one the kept header commits to"), 'a dsteem signature recovers to its key, and the made-up Merkle root is caught');
    const wrongKey = checkSteemBlockEvidence({ ...evidence, signingKey: WITNESS_KEY }, { blockNum: 0xabcd + 1, trxId: steemTransactionId(evidence.transaction) });
    assert(!wrongKey.ok && wrongKey.reason.includes('STM62Zz1BLcReJGDCv3djQDa4pY6BdBsVMaX4CnuUsp4wixVx4V1Z'), 'a header signed by another key is caught, naming the real signer');
    assert(steemBlockHeaderDigest(header).length === 32, 'the header digest is SHA-256');
    console.log('✓ witness signatures recover as the chain does');
}

// Steem's transaction Merkle tree: every leaf's path leads to the root.
{
    for (let count = 1; count <= 9; count += 1) {
        const digests = Array.from({ length: count }, (_, i) => Uint8Array.from({ length: 32 }, (_, j) => (i * 31 + j) % 256));
        const { root } = steemMerkleTree(digests);
        for (let index = 0; index < count; index += 1) {
            const { root: same, path } = steemMerkleTree(digests, index);
            assert(same === root && steemMerkleRootFromPath(digests[index], path) === root, `leaf ${index} of ${count} leads to the root`);
        }
        assert(steemMerkleRootFromPath(digests[0].map((b) => b ^ 1), steemMerkleTree(digests, 0).path) !== root, 'another leaf does not');
    }
    console.log('✓ the transaction Merkle tree');
}

// Kept block evidence: captured from a real block, checked offline, and
// every tampered part is caught.
{
    const chain = fakeSteemChain();
    const { blockNum, ids } = chain.addBlock([
        [['vote', { voter: 'bob', author: 'carol', permlink: 'x', weight: 100 }]],
        steemAnchorOperations({ account: 'alice', contentHash: HASH }),
        [['comment', { parent_author: '', parent_permlink: 'p', author: 'x', permlink: 'y', title: '', body: 'b', json_metadata: '' }]],
        [['transfer', { from: 'dave', to: 'erin', amount: '1.000 STEEM', memo: '' }]],
        [['claim_reward_balance', { account: 'a', reward_steem: '0.000 STEEM', reward_sbd: '0.000 SBD', reward_vests: '1.000000 VESTS' }]]
    ]);
    const block = chain.blocks.get(blockNum);
    const evidence = captureSteemBlockEvidence(block, { blockNum, trxId: ids[1] });
    assert(evidence.signingKey === WITNESS_KEY && evidence.merklePath.length === 3, 'evidence names the signing key and a Merkle path');
    assert(!('transaction_id' in evidence.transaction) && !('block_id' in evidence), 'only what the chain signs is kept');
    const checked = checkSteemBlockEvidence(JSON.parse(JSON.stringify(evidence)), { blockNum, trxId: ids[1] });
    assert(checked.ok && checked.blockId === block.block_id && checked.timestamp === block.timestamp && checked.witness === 'witness-one', 'it checks out offline after a JSON round trip');
    assert(JSON.stringify(evidence).length < 3000, 'and stays small');

    const tamper = (change) => {
        const copy = structuredClone(evidence);
        change(copy);
        return checkSteemBlockEvidence(copy, { blockNum, trxId: ids[1] });
    };
    assert(!tamper((e) => { e.header.timestamp = '2020-01-01T00:00:00'; }).ok, 'a changed block time is caught');
    assert(!tamper((e) => { e.header.witness = 'mallory'; }).ok, 'a changed witness is caught');
    assert(!tamper((e) => { e.header.witness_signature = signSteemHeader(e.header, new Uint8Array(32).fill(9)); }).ok, 're-signing with another key is caught');
    assert(!tamper((e) => { e.transaction.operations[0][1].json = e.transaction.operations[0][1].json.replace('1a2b', 'ffff'); }).ok, 'a changed transaction is caught');
    assert(!tamper((e) => { e.transaction.signatures = ['20' + '00'.repeat(64)]; }).ok, 'changed signatures are caught (they are in the Merkle digest)');
    assert(!tamper((e) => { e.merklePath[0].hash = '00'.repeat(32); }).ok, 'a changed Merkle path is caught');
    assert(!tamper((e) => { e.version = 2; }).ok, 'an unknown version is refused');
    assert(!checkSteemBlockEvidence(evidence, { blockNum: blockNum + 1, trxId: ids[1] }).ok, 'evidence for another block number is caught');
    assert(!checkSteemBlockEvidence(evidence, { blockNum, trxId: ids[0] }).ok, 'evidence for another transaction is caught');
    assert(!checkSteemBlockEvidence(null, { blockNum, trxId: ids[1] }).ok, 'missing evidence is not ok');

    const forged = structuredClone(block);
    forged.transactions[0].operations[0][1].weight = 5;
    assert((await throwsAsync(() => captureSteemBlockEvidence(forged, { blockNum, trxId: ids[1] }))) instanceof SteemSerializationError, 'a block whose transactions don\'t match its Merkle root is never kept');
    const wrongId = { ...structuredClone(block), block_id: '00'.repeat(20) };
    assert((await throwsAsync(() => captureSteemBlockEvidence(wrongId, { blockNum, trxId: ids[1] }))) instanceof SteemSerializationError, 'nor one whose id doesn\'t match its header');
    const wrongSigner = { ...structuredClone(block), signing_key: 'STM62Zz1BLcReJGDCv3djQDa4pY6BdBsVMaX4CnuUsp4wixVx4V1Z' };
    assert((await throwsAsync(() => captureSteemBlockEvidence(wrongSigner, { blockNum, trxId: ids[1] }))) instanceof SteemSerializationError, 'nor one signed by another key than the node reports');

    console.log('✓ kept block evidence is checked offline and catches tampering');
}

// A block with an operation this code can't serialize: the anchor is still
// published, without kept evidence.
{
    const chain = fakeSteemChain();
    const original = chain.addBlock;
    chain.addBlock = (transactions) => {
        const made = original(transactions);
        // The node reports an operation this code doesn't know alongside.
        const block = chain.blocks.get(made.blockNum);
        block.transactions[0] = { ...block.transactions[0], operations: [['some_future_operation', { x: 1 }]] };
        return made;
    };
    const result = await publisherFor(chain).publish(HASH);
    assert(result.published === true && !('evidence' in result.proof), 'the anchor is published without evidence');
    console.log('✓ an unreadable block still gives an anchor, without kept evidence');
}

// Batches: one Merkle root over several contentHashes.
{
    for (let count = 2; count <= 9; count += 1) {
        const hashes = Array.from({ length: count }, (_, i) => `fnv1a-32:${String(i).padStart(8, '0')}`);
        const batch = steemAnchorBatch(hashes);
        assert(batch.count === count && /^[0-9a-f]{64}$/.test(batch.merkleRoot), `a batch of ${count} has a root`);
        for (const hash of hashes) {
            assert(steemAnchorBatchRoot(hash, batch.paths.get(hash)) === batch.merkleRoot, `each of ${count} leads to the root`);
        }
        assert(steemAnchorBatchRoot('fnv1a-32:ffffffff', batch.paths.get(hashes[0])) !== batch.merkleRoot, 'another contentHash does not');
    }
    const dup = steemAnchorBatch([HASHES[0], HASHES[1], HASHES[0]]);
    assert(dup.count === 2 && dup.paths.size === 2, 'a repeated contentHash is one leaf');
    // Leaves and inner nodes are hashed differently, so a pair's inner hash
    // can't be presented as a leaf.
    const pair = steemAnchorBatch([HASHES[0], HASHES[1]]);
    assert(steemAnchorBatchRoot(HASHES[0], []) !== pair.merkleRoot, 'a leaf alone is not the root');
    assert((await throwsAsync(() => steemAnchorBatch([HASHES[0]]))) instanceof TypeError, 'a batch has at least two');
    const tooMany = Array.from({ length: STEEM_ANCHOR_MAX_BATCH + 1 }, (_, i) => `h${i}`);
    assert((await throwsAsync(() => steemAnchorBatch(tooMany))) instanceof TypeError, `and at most ${STEEM_ANCHOR_MAX_BATCH}`);

    const [, op] = steemAnchorOperations({ account: 'alice', merkleRoot: pair.merkleRoot, count: 2 })[0];
    assert(op.json === JSON.stringify({ version: 1, merkleRoot: pair.merkleRoot, count: 2 }), 'a batch operation carries the root and count only');
    assert((await throwsAsync(() => steemAnchorOperations({ account: 'alice', merkleRoot: 'xyz', count: 2 }))) instanceof TypeError, 'a malformed root is refused');

    const proof = { blockNum: 5, trxId: '0'.repeat(40), chain: 'steem', batch: { path: pair.paths.get(HASHES[0]) } };
    assert(parseSteemAnchorProof(proof).batchPath.length === 1, 'a batch proof parses');
    assert(parseSteemAnchorProof({ ...proof, batch: { path: [] } }).error, 'an empty path is refused');
    assert(parseSteemAnchorProof({ ...proof, batch: { path: [{ position: 'up', hash: '00'.repeat(32) }] } }).error, 'a step must be left or right');
    assert(parseSteemAnchorProof({ ...proof, evidence: 'x' }).error, 'evidence must be an object');
    console.log('✓ batch Merkle roots and paths');
}

// Publishing a batch: one broadcast, one proof per contentHash, each verified.
{
    const chain = fakeSteemChain();
    const publisher = publisherFor(chain);
    const result = await publisher.publishBatch([...HASHES, HASHES[0]]);
    assert(result.published === true && chain.broadcasts.length === 1, 'one broadcast, so one Keychain approval');
    assert(result.results.length === 4 && result.results.map((r) => r.contentHash).join() === [...HASHES, HASHES[0]].join(), 'a result per contentHash, in order');
    const payload = JSON.parse(chain.broadcasts[0].operations[0][1].json);
    assert(payload.count === 3 && payload.merkleRoot === steemAnchorBatch(HASHES).merkleRoot, 'the operation carries the root of the distinct hashes');
    assert(new Set(result.results.map((r) => r.locator)).size === 1, 'all name the same transaction');
    assert(result.results.every((r) => r.proof.evidence && r.proof.batch.path.length > 0), 'each proof has its path and the kept block');
    assert(JSON.stringify(result.results[0].proof) === JSON.stringify(result.results[3].proof), 'a repeated contentHash gets the same proof');

    chain.finalize();
    const verifier = new SteemProofVerifier({ nodes: ['https://a'], fetchImpl: chain.fetchImpl });
    for (const { contentHash, proof } of result.results) {
        const verified = await verifier.verify(proof, { contentHash });
        assert(verified.valid === true && verified.details.batch === true && verified.details.evidence.ok === true, `${contentHash} verifies, with its kept evidence`);
    }
    const swapped = await verifier.verify(result.results[0].proof, { contentHash: HASHES[1] });
    assert(swapped.valid === false && !swapped.unavailable && swapped.reason.includes('batch root'), 'another publication\'s path is rejected');
    const noPath = { ...result.results[0].proof };
    delete noPath.batch;
    assert((await verifier.verify(noPath, { contentHash: HASHES[0] })).valid === false, 'a batch transaction doesn\'t verify as a single anchor');

    const single = await publisherFor(fakeSteemChain()).publishBatch([HASH, HASH]);
    assert(single.published === true && !('batch' in single.results[0].proof), 'one distinct contentHash is anchored as a single anchor');
    assert((await throwsAsync(() => publisher.publishBatch([]))) !== null, 'an empty batch is a caller error');
    assert((await throwsAsync(() => publisher.publishBatch(Array.from({ length: 65 }, (_, i) => `h${i}`)))) !== null, 'so is one over the limit');
    assert(publisher.maxBatchSize === STEEM_ANCHOR_MAX_BATCH, 'the publisher says its limit');

    const declining = fakeSteemChain();
    declining.broadcaster.broadcast = async () => { throw new Error('user_cancel'); };
    const declined = await publisherFor(declining).publishBatch(HASHES);
    assert(declined.published === false && declined.unavailable === true && declined.reason === 'user_cancel', 'a declined batch is unavailable');
    console.log('✓ a batch is one broadcast with a verifiable proof per publication');
}

// The verifier reports kept evidence, never letting it decide.
{
    const chain = fakeSteemChain();
    const { proof } = await publisherFor(chain).publish(HASH);
    const verifier = new SteemProofVerifier({ nodes: ['https://a'], fetchImpl: chain.fetchImpl });
    const early = await verifier.verify(proof, { contentHash: HASH });
    assert(early.unavailable === true && early.details.lastIrreversible === chain.lib(), 'not yet final: unavailable, with the last final block');
    chain.finalize();
    const valid = await verifier.verify(proof, { contentHash: HASH });
    assert(valid.valid === true && valid.details.evidence.ok === true && valid.details.evidence.signingKey === WITNESS_KEY, 'valid, with the evidence checked');

    const tampered = structuredClone(proof);
    tampered.evidence.header.timestamp = '2020-01-01T00:00:00';
    const stillValid = await verifier.verify(tampered, { contentHash: HASH });
    assert(stillValid.valid === true && stillValid.details.evidence.ok === false, 'evidence that doesn\'t check out is reported, and the chain still decides');

    const offline = new SteemProofVerifier({ nodes: ['https://a'], fetchImpl: async () => { throw new Error('offline'); } });
    const unreachable = await offline.verify(proof, { contentHash: HASH });
    assert(unreachable.valid === false && unreachable.unavailable === true, 'without a node it stays unavailable');
    assert(unreachable.reason.includes('kept block evidence checks out offline') && unreachable.details.evidence.ok === true, 'saying the kept evidence checks out');

    const otherHash = await verifier.verify(proof, { contentHash: 'fnv1a-32:99999999' });
    assert(otherHash.valid === false && otherHash.details.evidence.ok === false, 'evidence for another contentHash doesn\'t carry the anchor');
    console.log('✓ the verifier checks kept evidence and reports it');
}

// Finality: pending, then final; dropped; unknown.
{
    const chain = fakeSteemChain();
    const { proof } = await publisherFor(chain).publish(HASH);
    const observer = new SteemAnchorFinalityObserver({ rpc: rpcFor(chain), sleep: async () => { chain.head += 5; } });
    assert(observer.anchorType === 'steem', 'the observer is for "steem"');
    const first = await observer.check(proof);
    assert(first.state === 'pending' && first.blockNum === proof.blockNum && first.lastIrreversible === chain.lib(), 'a new block is pending');
    const updates = [];
    const final = await observer.waitUntilFinal(proof, { onUpdate: (state) => updates.push(state.state) });
    assert(final.state === 'final' && final.timestamp === chain.blocks.get(proof.blockNum).timestamp, 'it becomes final, with the block time');
    assert(updates[0] === 'pending' && updates[updates.length - 1] === 'final' && updates.length === 5, 'reporting each check until then');

    const dropped = fakeSteemChain({ overrides: { 'https://a': { 'condenser_api.get_block': (params, c) => ({ ...c.blocks.get(params[0]), transaction_ids: [] }) } } });
    dropped.addBlock([steemAnchorOperations({ account: 'alice', contentHash: HASH })]);
    dropped.finalize();
    const droppedState = await new SteemAnchorFinalityObserver({ rpc: rpcFor(dropped) }).check({ ...proof, blockNum: dropped.head - 20 });
    assert(droppedState.state === 'dropped', 'a final block without the transaction is dropped, not anchored');

    const offline = new SteemAnchorFinalityObserver({ rpc: createSteemRpcClient({ nodes: ['https://a'], fetchImpl: async () => { throw new Error('offline'); } }) });
    assert((await offline.check(proof)).state === 'unknown', 'no node answering is unknown');

    let now = 0;
    const stuck = fakeSteemChain();
    const { proof: stuckProof } = await publisherFor(stuck).publish(HASH);
    const patient = new SteemAnchorFinalityObserver({ rpc: rpcFor(stuck), clock: () => now, sleep: async (ms) => { now += ms; }, maxWaitMs: 9000 });
    const gaveUp = await patient.waitUntilFinal(stuckProof);
    assert(gaveUp.state === 'unknown' && gaveUp.reason.includes('not final yet'), 'a block that stays pending ends as unknown when the wait runs out');
    const malformed = await patient.waitUntilFinal({ chain: 'steem' });
    assert(malformed.state === 'unknown', 'a malformed proof is unknown at once');
    console.log('✓ the finality observer');
}

// The evidence view describes kept evidence, verification and finality.
{
    const view = new SteemAnchorEvidenceView();
    const chain = fakeSteemChain();
    const { results } = await publisherFor(chain).publishBatch(HASHES);
    const described = view.describe({ contentHash: HASHES[1], proof: results[1].proof });
    const field = (label) => described.fields.find((f) => f.label === label)?.value;
    assert(field('Block time') === `${chain.blocks.get(results[1].proof.blockNum).timestamp.replace('T', ' ')} UTC`, 'the block time comes from the kept evidence');
    assert(field('Witness') === 'witness-one' && field('Signing key') === WITNESS_KEY, 'with the witness and signing key');
    assert(field('Kept block evidence').startsWith('Checks out offline'), 'and says it checks out offline');
    assert(field('Batch').includes('Merkle path'), 'a batch anchor says so');
    const wrongHash = view.describe({ contentHash: 'fnv1a-32:77777777', proof: results[1].proof });
    assert(wrongHash.fields.find((f) => f.label === 'Kept block evidence').value.includes("doesn't carry"), 'evidence for another contentHash is flagged');
    const tampered = structuredClone(results[1].proof);
    tampered.evidence.header.witness = 'mallory';
    assert(view.describe({ contentHash: HASHES[1], proof: tampered }).fields.find((f) => f.label === 'Kept block evidence').value.startsWith("Doesn't check out"), 'tampered evidence is flagged');
    const none = view.describe({ contentHash: HASH, proof: { blockNum: 3, trxId: '0'.repeat(40), chain: 'steem' } });
    assert(none.fields.find((f) => f.label === 'Kept block evidence').value === 'Not kept', 'an anchor without evidence says so');

    const note = view.describeVerification({ blockNum: 7, timestamp: '2026-09-26T10:00:03', witness: 'w', nodesAgreeing: 2, nodesAsked: 2, evidence: { ok: true } });
    assert(note.includes('Recorded in Steem block 7 at 2026-09-26 10:00:03 UTC by witness w') && note.includes('2 of 2') && note.includes('checks out offline'), 'a verification says when, by whom, and how many nodes agree');
    assert(view.describeVerification({ nodesAsked: 1 }).includes('add another'), 'a single node suggests adding one');
    assert(view.describeVerification(null) === null, 'no details, no note');
    assert(view.describeFinality({ state: 'pending', blockNum: 9, lastIrreversible: 5 }).label === 'Waiting for finality', 'pending');
    assert(view.describeFinality({ state: 'final', blockNum: 9, timestamp: '2026-09-26T10:00:03' }).label === 'Anchored', 'final reads as anchored');
    assert(view.describeFinality({ state: 'dropped', blockNum: 9 }).label === 'Not anchored', 'dropped');
    assert(view.describeFinality({ state: 'unknown', blockNum: 9, reason: 'offline' }).message.includes('offline'), 'unknown, with the reason');
    console.log('✓ the evidence view');
}

// End to end: a batch through the shared creation path, each anchor signed,
// and verified VALID by another replica with the block's time passed on.
{
    const chain = fakeSteemChain();
    const runtime = composeSteemRuntime({ fetchImpl: chain.fetchImpl, getAccount: () => 'alice', getBroadcaster: () => chain.broadcaster });
    assert(runtime.anchorFinalityObserver.anchorType === 'steem', 'the runtime provides the finality observer');
    const publicationCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
    const anchorCatalog = new LocalPublicationAnchorCatalog(new InMemoryStorageProvider());
    const { createExternalPublicationAnchorUseCase, publisherRegistry } = new CreateExternalPublicationAnchorOrchestratorUseCase().execute({
        publicationCatalog, anchorCatalog, identityProvider: makeIdentity('Alice'), publishers: [runtime.anchorPublisher]
    });
    HASHES.forEach((hash, i) => publicationCatalog.add(new DecentralizedPublication({ id: `pub-${i}`, contentKind: 'forkbuild.structure', contentReference: new ContentReference({ hash }) })));
    const coordinator = new PublicationAnchorCreationCoordinator(createExternalPublicationAnchorUseCase, publisherRegistry);
    assert(JSON.stringify(coordinator.batchAnchorTypes()) === JSON.stringify([{ anchorType: 'steem', maxBatchSize: STEEM_ANCHOR_MAX_BATCH }]), 'Steem is offered for batch anchoring');

    const created = await coordinator.createBatch(['pub-0', 'pub-1', 'pub-2'], 'steem');
    assert(created.outcome === ExternalAnchorCreationOutcome.CREATED && created.anchors.length === 3, 'three anchors from one approval');
    assert(chain.broadcasts.length === 1, 'one broadcast');
    assert(created.anchors.every((anchor, i) => anchor.publicationId === `pub-${i}` && anchor.contentHash === HASHES[i] && anchor.signature), 'each signed for its own publication');

    chain.finalize();
    const bob = new ExternalAnchorVerifier(new LocalAuthorizationVerifier());
    for (const anchor of created.anchors) {
        const verified = await bob.verify(anchor.toJSON(), { expectedContentHash: anchor.contentHash, proofVerifier: runtime.proofVerifier });
        assert(verified.outcome === AnchorVerificationOutcome.VALID, `${anchor.publicationId} verifies VALID on another replica`);
        assert(verified.details.timestamp === chain.blocks.get(anchor.proof.blockNum).timestamp && verified.details.evidence.ok, 'with the block time and kept evidence passed on');
    }
    const early = await bob.verify(created.anchors[0].toJSON(), { expectedContentHash: 'fnv1a-32:00000000', proofVerifier: runtime.proofVerifier });
    assert(early.outcome === AnchorVerificationOutcome.CONTENT_MISMATCH && !('details' in early), 'a mismatch never reaches the proof verifier');

    const unavailable = await coordinator.createBatch(['pub-0'], 'steem').then(() => null, (e) => e);
    assert(unavailable === null, 'one publication is a batch of one');
    assert((await throwsAsync(() => coordinator.createBatch(['nope'], 'steem'))) !== null, 'an unknown publication throws');
    assert((await throwsAsync(() => coordinator.createBatch(['pub-0'], 'arweave'))) !== null, 'an unknown anchorType throws');
    const noBatch = new CreateExternalPublicationAnchorOrchestratorUseCase().execute({
        publicationCatalog, anchorCatalog, identityProvider: makeIdentity('Alice'), publishers: [{ anchorType: 'plain', publish: async () => ({ published: false }) }]
    });
    assert((await throwsAsync(() => noBatch.createExternalPublicationAnchorUseCase.executeBatch(['pub-0'], 'plain'))).message.includes("can't anchor several"), 'a publisher without publishBatch() is refused');
    assert(new PublicationAnchorCreationCoordinator(noBatch.createExternalPublicationAnchorUseCase, noBatch.publisherRegistry).batchAnchorTypes().length === 0, 'and not offered');

    const offline = composeSteemRuntime({ fetchImpl: chain.fetchImpl, getAccount: () => 'alice' });
    const { createExternalPublicationAnchorUseCase: withoutKeychain } = new CreateExternalPublicationAnchorOrchestratorUseCase().execute({
        publicationCatalog, anchorCatalog, identityProvider: makeIdentity('Alice'), publishers: [offline.anchorPublisher]
    });
    const noKeychain = await withoutKeychain.executeBatch(['pub-0', 'pub-1'], 'steem');
    assert(noKeychain.outcome === ExternalAnchorCreationOutcome.PUBLISH_UNAVAILABLE && noKeychain.anchors.length === 0 && noKeychain.reason.includes('Keychain'), 'without Keychain the batch is unavailable, with no anchors');
    console.log('✓ a batch is created and independently verified end to end');
}
