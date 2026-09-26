import {
    STEEM_ANCHOR_CUSTOM_JSON_ID,
    parseSteemAnchorProof,
    steemAnchorLocator,
    steemAnchorOperations,
    steemBlockNumberOfId,
    steemTransactionAnchors
} from '../core/SteemAnchor.js';
import { SteemProofVerifier } from '../anchoring/SteemProofVerifier.js';
import { SteemAnchorPublisher } from '../anchoring/SteemAnchorPublisher.js';
import { SteemAnchorEvidenceView } from '../anchoring/SteemAnchorEvidenceView.js';
import { createSteemAnnouncer } from '../application/steem/SteemAnnouncer.js';
import { composeSteemRuntime } from '../application/steem/SteemRuntimeComposition.js';
import { SteemReadingConfiguration } from '../core/SteemReadingConfiguration.js';
import { createSteemRpcClient } from '../steem/SteemRpcClient.js';
import { DecentralizedPublication } from '../core/DecentralizedPublication.js';
import { ContentReference } from '../core/ContentReference.js';
import { LocalPublicationCatalog } from '../application/publication/LocalPublicationCatalog.js';
import { LocalPublicationAnchorCatalog } from '../application/anchoring/LocalPublicationAnchorCatalog.js';
import { CreateExternalPublicationAnchorOrchestratorUseCase } from '../application/anchoring/CreateExternalPublicationAnchorOrchestratorUseCase.js';
import { ExternalAnchorCreationOutcome } from '../application/anchoring/ExternalAnchorCreationOutcome.js';
import { ExternalAnchorVerifier } from '../application/anchoring/ExternalAnchorVerifier.js';
import { AnchorVerificationOutcome } from '../application/anchoring/AnchorVerificationOutcome.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { makeIdentity } from './support/TestIdentity.js';
import { assert } from './support/Assert.js';
import { fakeSteemChain } from './support/FakeSteemChain.js';

const HASH = 'fnv1a-32:1a2b3c4d';

function blockIdOf(blockNum, salt = 'a') {
    return blockNum.toString(16).padStart(8, '0') + salt.repeat(32);
}

function trxIdOf(n) {
    return n.toString(16).padStart(40, '0');
}

const fakeChain = fakeSteemChain;

function anchoredChain(options) {
    const chain = fakeChain(options);
    const { blockNum, ids } = chain.addBlock([steemAnchorOperations({ account: 'alice', contentHash: HASH })]);
    chain.finalize();
    return { chain, proof: { blockNum, trxId: ids[0], chain: 'steem' } };
}

function announcerFor(chain, { account = 'alice', broadcaster = chain.broadcaster } = {}) {
    return createSteemAnnouncer({
        rpc: createSteemRpcClient({ nodes: ['https://a'], fetchImpl: chain.fetchImpl }),
        getAccount: () => account,
        getBroadcaster: () => broadcaster,
        sleep: async () => {}
    });
}

function publisherFor(chain, options = {}) {
    const rpc = createSteemRpcClient({ nodes: ['https://a'], fetchImpl: chain.fetchImpl });
    return new SteemAnchorPublisher({ poster: announcerFor(chain, options), rpc, sleep: async () => {}, ...options.publisher });
}

// The format: one custom_json carrying the contentHash as it is.
{
    const operations = steemAnchorOperations({ account: 'alice', contentHash: HASH });
    assert(operations.length === 1 && operations[0][0] === 'custom_json', 'an anchor is one custom_json operation');
    const [, op] = operations[0];
    assert(op.id === STEEM_ANCHOR_CUSTOM_JSON_ID && op.id === 'forkbuild-anchor', 'with id forkbuild-anchor');
    assert(JSON.stringify(op.required_posting_auths) === '["alice"]' && op.required_auths.length === 0, 'signed with the posting key');
    assert(op.json === JSON.stringify({ version: 1, contentHash: HASH }), 'carrying only the version and the contentHash, unchanged');
    let caught = 0;
    for (const bad of [{ account: 'Alice!', contentHash: HASH }, { account: 'alice', contentHash: '' }, { account: 'alice', contentHash: ` ${HASH}` }]) {
        try { steemAnchorOperations(bad); } catch { caught += 1; }
    }
    assert(caught === 3, 'a bad account or contentHash is refused');
    assert(steemAnchorLocator(trxIdOf(7)) === `steem:${trxIdOf(7)}`, 'the locator names the transaction');
    assert(steemBlockNumberOfId(blockIdOf(123456)) === 123456, 'a block id starts with its block number');
    assert(Number.isNaN(steemBlockNumberOfId('nope')), 'a malformed block id has no number');

    const good = { blockNum: 5, trxId: trxIdOf(1), chain: 'steem' };
    assert(parseSteemAnchorProof(good).blockNum === 5, 'a well-formed proof parses');
    assert(parseSteemAnchorProof({ ...good, chain: 'hive' }).error.includes('hive'), 'another chain is refused');
    assert(parseSteemAnchorProof({ ...good, chain: undefined }).error, 'a proof must name its chain');
    assert(parseSteemAnchorProof({ ...good, blockNum: 0 }).error, 'block numbers start at 1');
    assert(parseSteemAnchorProof({ ...good, blockNum: '5' }).error, 'a block number is a number');
    assert(parseSteemAnchorProof({ ...good, trxId: 'ABC' }).error, 'a transaction id is 40 lowercase hex characters');
    assert(parseSteemAnchorProof(null).error, 'a missing proof is refused');

    const tx = { operations };
    assert(steemTransactionAnchors(tx, HASH), 'the transaction anchors its contentHash');
    assert(steemTransactionAnchors(tx, HASH, { account: 'alice' }), 'for the signing account');
    assert(!steemTransactionAnchors(tx, HASH, { account: 'bob' }), 'and not for another');
    assert(!steemTransactionAnchors(tx, 'fnv1a-32:00000000'), 'nor for another contentHash');
    assert(!steemTransactionAnchors(tx, HASH.toUpperCase()), 'the contentHash is compared exactly');
    const appbase = { operations: [{ type: 'custom_json_operation', value: operations[0][1] }] };
    assert(steemTransactionAnchors(appbase, HASH), 'the appbase operation shape is read too');
    const otherId = { operations: [['custom_json', { ...operations[0][1], id: 'follow' }]] };
    assert(!steemTransactionAnchors(otherId, HASH), 'another custom_json id is not an anchor');
    const badJson = { operations: [['custom_json', { ...operations[0][1], json: '{' }]] };
    assert(!steemTransactionAnchors(badJson, HASH), 'unreadable json is not an anchor');
    const otherVersion = { operations: [['custom_json', { ...operations[0][1], json: JSON.stringify({ version: 2, contentHash: HASH }) }]] };
    assert(!steemTransactionAnchors(otherVersion, HASH), 'another version is not read');
    console.log('✓ the anchor format');
}

// The verifier accepts an anchor in an irreversible block.
{
    const { chain, proof } = anchoredChain();
    const verifier = new SteemProofVerifier({ nodes: ['https://a'], fetchImpl: chain.fetchImpl });
    assert(verifier.anchorType === 'steem', 'the anchor type is "steem"');
    const result = await verifier.verify(proof, { contentHash: HASH });
    assert(result.valid === true, 'the anchor is valid');
    const block = chain.blocks.get(proof.blockNum);
    assert(result.details.blockId === block.block_id && result.details.timestamp === block.timestamp && result.details.witness === 'witness-one', 'with the block\'s id, time and witness');
    assert(result.details.nodesAgreeing === 1 && result.details.nodesAsked === 1, 'and how many nodes were asked');
    assert(result.details.blockNum === proof.blockNum && result.details.batch === false && result.details.evidence === null, 'a single anchor without kept evidence');
    const methods = chain.calls.map((call) => call.method);
    assert(!methods.includes('condenser_api.get_content'), 'the operation is read from the block, never from get_content');
    console.log('✓ the verifier accepts an anchor in an irreversible block');
}

// Definite rejections: only for an irreversible block the nodes agree on.
{
    const { chain, proof } = anchoredChain();
    const verifier = new SteemProofVerifier({ nodes: ['https://a'], fetchImpl: chain.fetchImpl });
    const wrongHash = await verifier.verify(proof, { contentHash: 'fnv1a-32:ffffffff' });
    assert(wrongHash.valid === false && !wrongHash.unavailable && wrongHash.reason.includes('no ForkBuild anchor'), 'another contentHash is rejected');

    const vote = chain.addBlock([[['vote', { voter: 'bob', author: 'carol', permlink: 'x', weight: 1 }]]]);
    chain.finalize();
    const notAnchor = await verifier.verify({ blockNum: vote.blockNum, trxId: vote.ids[0], chain: 'steem' }, { contentHash: HASH });
    assert(notAnchor.valid === false && !notAnchor.unavailable, 'a transaction without an anchor is rejected');

    const elsewhere = await verifier.verify({ ...proof, blockNum: vote.blockNum }, { contentHash: HASH });
    assert(elsewhere.valid === false && !elsewhere.unavailable && elsewhere.reason.includes('does not contain transaction'), 'a block without the transaction is rejected');

    const malformed = await verifier.verify({ ...proof, trxId: 'x' }, { contentHash: HASH });
    assert(malformed.valid === false && !malformed.unavailable, 'a malformed proof is rejected');
    const hive = await verifier.verify({ ...proof, chain: 'hive' }, { contentHash: HASH });
    assert(hive.valid === false && !hive.unavailable, 'a Hive proof is not checked on Steem');
    const noHash = await verifier.verify(proof, {});
    assert(noHash.valid === false && !noHash.unavailable, 'no contentHash to check against is rejected');
    console.log('✓ the verifier rejects what the chain doesn\'t back');
}

// "Unavailable", never a rejection: not yet irreversible, no node, disagreement.
{
    const chain = fakeChain();
    const { blockNum, ids } = chain.addBlock([steemAnchorOperations({ account: 'alice', contentHash: HASH })]);
    const proof = { blockNum, trxId: ids[0], chain: 'steem' };
    const verifier = new SteemProofVerifier({ nodes: ['https://a'], fetchImpl: chain.fetchImpl });
    const early = await verifier.verify(proof, { contentHash: HASH });
    assert(early.valid === false && early.unavailable === true && early.reason.includes('not irreversible yet'), 'a block that isn\'t irreversible yet is unavailable');
    assert(!chain.calls.some((call) => call.method === 'condenser_api.get_block'), 'and its block is not even read');
    chain.finalize();
    assert((await verifier.verify(proof, { contentHash: HASH })).valid === true, 'once irreversible, the same proof is valid');

    const down = new SteemProofVerifier({ nodes: ['https://a', 'https://b'], fetchImpl: async () => { throw new Error('connection refused'); } });
    const none = await down.verify(proof, { contentHash: HASH });
    assert(none.valid === false && none.unavailable === true && none.reason.includes('connection refused'), 'no node answering is unavailable');

    const missing = fakeChain({ overrides: { 'https://a': { 'condenser_api.get_block': () => null } } });
    missing.blocks = chain.blocks;
    missing.head = chain.head;
    const missingResult = await new SteemProofVerifier({ nodes: ['https://a'], fetchImpl: missing.fetchImpl }).verify(proof, { contentHash: HASH });
    assert(missingResult.valid === false && missingResult.unavailable === true, 'a node without the block is unavailable, not a rejection');
    console.log('✓ the verifier reports what it can\'t tell as unavailable');
}

// Several nodes: each is asked, and all that answer must agree.
{
    const { chain, proof } = anchoredChain();
    const both = new SteemProofVerifier({ nodes: ['https://a', 'https://b'], fetchImpl: chain.fetchImpl });
    const agreed = await both.verify(proof, { contentHash: HASH });
    assert(agreed.valid === true && agreed.details.nodesAgreeing === 2, 'two agreeing nodes make a valid anchor');
    const asked = new Set(chain.calls.filter((call) => call.method === 'condenser_api.get_block').map((call) => call.url));
    assert(asked.has('https://a') && asked.has('https://b'), 'each node is asked separately');

    // Node b serves a different history, with no anchor in that block.
    const forked = (params, c) => {
        const block = c.blocks.get(params[0]);
        return block ? { ...block, block_id: blockIdOf(params[0], 'b'), transactions: block.transactions.map(() => ({ operations: [] })) } : null;
    };
    const { chain: split, proof: splitProof } = anchoredChain({ overrides: { 'https://b': { 'condenser_api.get_block': forked } } });
    const disagreement = await new SteemProofVerifier({ nodes: ['https://a', 'https://b'], fetchImpl: split.fetchImpl }).verify(splitProof, { contentHash: HASH });
    assert(disagreement.valid === false && disagreement.unavailable === true && disagreement.reason.includes('disagree'), 'nodes that disagree make it unavailable, never valid or rejected');
    assert(disagreement.reason.includes('https://b'), 'naming the nodes');

    const { chain: halfDown, proof: halfDownProof } = anchoredChain({ overrides: { 'https://b': new Error('timeout') } });
    const oneAnswered = await new SteemProofVerifier({ nodes: ['https://a', 'https://b'], fetchImpl: halfDown.fetchImpl }).verify(halfDownProof, { contentHash: HASH });
    assert(oneAnswered.valid === true && oneAnswered.details.nodesAgreeing === 1 && oneAnswered.details.nodesAsked === 2, 'an unreachable node is left out, and the result says one node answered');

    // A node that returns the wrong block is not believed.
    const liar = { 'condenser_api.get_block': (params, c) => ({ ...c.blocks.get(params[0]), block_id: blockIdOf(params[0] + 1) }) };
    const { chain: lying, proof: lyingProof } = anchoredChain({ overrides: { 'https://b': liar } });
    const skipped = await new SteemProofVerifier({ nodes: ['https://a', 'https://b'], fetchImpl: lying.fetchImpl }).verify(lyingProof, { contentHash: HASH });
    assert(skipped.valid === true && skipped.details.nodesAgreeing === 1, 'a node returning another block number is treated as not answering');

    // One node still sees the block as reversible.
    const lagging = { 'condenser_api.get_dynamic_global_properties': (params, c) => ({ head_block_number: c.head, last_irreversible_block_num: proof.blockNum - 1 }) };
    const { chain: behind, proof: behindProof } = anchoredChain({ overrides: { 'https://b': lagging } });
    const notYet = await new SteemProofVerifier({ nodes: ['https://a', 'https://b'], fetchImpl: behind.fetchImpl }).verify(behindProof, { contentHash: HASH });
    assert(notYet.valid === false && notYet.unavailable === true, 'if any answering node doesn\'t see the block as irreversible, it is unavailable');

    const capped = new SteemProofVerifier({ nodes: ['https://a', 'https://b', 'https://c', 'https://d'], fetchImpl: chain.fetchImpl });
    assert(capped.nodes.length === 3, 'at most three nodes are asked by default');
    console.log('✓ the verifier asks every node and needs them to agree');
}

// The publisher: broadcast through the announcer, then name the block.
{
    const chain = fakeChain();
    const publisher = publisherFor(chain);
    assert(publisher.anchorType === 'steem', 'the publisher\'s anchor type is "steem"');
    const result = await publisher.publish(HASH);
    assert(result.published === true, 'the anchor is published');
    const [broadcast] = chain.broadcasts;
    assert(broadcast.account === 'alice' && JSON.stringify(broadcast.operations) === JSON.stringify(steemAnchorOperations({ account: 'alice', contentHash: HASH })), 'as one custom_json signed by the configured account');
    const block = chain.blocks.get(chain.head);
    assert(result.proof.blockNum === chain.head && result.proof.trxId === block.transaction_ids[1] && result.proof.chain === 'steem', 'the proof names the block and transaction');
    assert(Object.keys(result.proof).sort().join() === 'blockNum,chain,evidence,trxId', 'and the kept block evidence, nothing else');
    assert(result.locator === `steem:${block.transaction_ids[1]}`, 'the locator names the transaction');
    assert(!('anchoredAt' in result), 'no anchoredAt is invented');

    chain.finalize();
    const verified = await new SteemProofVerifier({ nodes: ['https://a'], fetchImpl: chain.fetchImpl }).verify(result.proof, { contentHash: HASH });
    assert(verified.valid === true, 'what the publisher produces, the verifier accepts once irreversible');
    console.log('✓ the publisher broadcasts and names the block');
}

// Finding the block when the broadcast result doesn't name it.
{
    const noBlock = fakeChain({ reportBlockNum: false });
    const found = await publisherFor(noBlock).publish(HASH);
    assert(found.published === true && found.proof.blockNum === noBlock.head, 'without a block number, the blocks since the broadcast are read');

    const nothing = fakeChain({ reportBlockNum: false, reportTransactionId: false });
    const foundById = await publisherFor(nothing).publish(HASH);
    assert(foundById.published === true && foundById.proof.trxId === nothing.blocks.get(nothing.head).transaction_ids[1], 'without either, the anchor is found by account and contentHash');

    // Keychain names a block that doesn't hold it.
    const wrong = fakeChain();
    const original = wrong.broadcaster.broadcast;
    wrong.broadcaster.broadcast = async (...args) => ({ ...(await original(...args)), blockNum: 3 });
    const recovered = await publisherFor(wrong).publish(HASH);
    assert(recovered.published === true && recovered.proof.blockNum === wrong.head, 'a wrong block number from Keychain is recovered by scanning');

    // Another account's anchor for the same hash doesn't count.
    const impostor = fakeChain({ reportBlockNum: false, reportTransactionId: false });
    impostor.broadcaster.broadcast = async (account, operations) => {
        impostor.broadcasts.push({ account, operations });
        impostor.addBlock([steemAnchorOperations({ account: 'mallory', contentHash: HASH })]);
        return { transactionId: null, blockNum: null };
    };
    const lost = await publisherFor(impostor, { publisher: { maxLocateAttempts: 3 } }).publish(HASH);
    assert(lost.published === false && lost.unavailable === true && lost.reason.includes("couldn't be found"), 'an anchor that can\'t be found is unavailable, with a reason');
    console.log('✓ the publisher finds the block when Keychain doesn\'t say');
}

// Operational failures are "unavailable", never thrown.
{
    const chain = fakeChain();
    const declining = { broadcast: async () => { throw new Error('user_cancel'); } };
    const declined = await publisherFor(chain, { broadcaster: declining }).publish(HASH);
    assert(declined.published === false && declined.unavailable === true && declined.reason === 'user_cancel', 'a declined signature is unavailable');
    const noAccount = await publisherFor(chain, { account: null }).publish(HASH);
    assert(noAccount.published === false && noAccount.unavailable === true && noAccount.reason.includes('Steem account'), 'no account is unavailable, saying what to set');
    const noKeychain = await publisherFor(chain, { broadcaster: null }).publish(HASH);
    assert(noKeychain.published === false && noKeychain.unavailable === true && noKeychain.reason.includes('Keychain'), 'no Keychain is unavailable');
    let threw = false;
    try { await publisherFor(chain).publish(''); } catch { threw = true; }
    assert(threw, 'an empty contentHash is a caller error and throws');
    let constructorThrew = 0;
    try { new SteemAnchorPublisher({}); } catch { constructorThrew += 1; }
    try { new SteemAnchorPublisher({ poster: { postAnchor() {} } }); } catch { constructorThrew += 1; }
    assert(constructorThrew === 2, 'a poster and an RPC client are required');

    // The announcer doesn't wait for the comment reply interval.
    const sleeps = [];
    const paced = fakeChain();
    const announcer = createSteemAnnouncer({
        rpc: createSteemRpcClient({ nodes: ['https://a'], fetchImpl: paced.fetchImpl }),
        getAccount: () => 'alice',
        getBroadcaster: () => paced.broadcaster,
        sleep: async (ms) => { sleeps.push(ms); }
    });
    await announcer.postAnchor(HASH);
    await announcer.postAnchor(HASH);
    assert(sleeps.length === 0 && paced.broadcasts.length === 2, 'anchors don\'t wait for the reply interval');
    console.log('✓ the publisher reports failures as unavailable');
}

// The evidence view says what backs a Steem anchor.
{
    const view = new SteemAnchorEvidenceView();
    assert(view.anchorType === 'steem', 'the evidence view is for "steem"');
    const described = view.describe({ proof: { blockNum: 42, trxId: trxIdOf(9), chain: 'steem' } });
    assert(described.summary === 'Steem', 'summarized as Steem');
    assert(described.fields.find((f) => f.label === 'Block').value === '42', 'shows the block');
    assert(described.fields.find((f) => f.label === 'Transaction ID').value === trxIdOf(9), 'and the transaction');
    assert(described.fields.find((f) => f.label === 'Attested by').value.includes('not proof of work'), 'and that witnesses, not proof of work, back it');
    assert(described.externalLocator.url === 'https://steemworld.org/block/42', 'linking to the block');
    const broken = view.describe({ proof: { trxId: 'x' } });
    assert(broken.externalLocator === null && broken.fields[0].value === 'not available', 'a malformed proof is described as not available');
    console.log('✓ the evidence view');
}

// End to end: the runtime's publisher creates a signed anchor another
// replica verifies VALID with the runtime's verifier.
{
    const chain = fakeChain();
    const runtime = composeSteemRuntime({
        configuration: new SteemReadingConfiguration({ apiNodes: ['https://a', 'https://b'] }),
        fetchImpl: chain.fetchImpl,
        getAccount: () => 'alice',
        getBroadcaster: () => chain.broadcaster
    });
    assert(runtime.anchorPublisher.anchorType === 'steem' && runtime.proofVerifier.anchorType === 'steem' && runtime.anchorEvidenceView.anchorType === 'steem', 'the runtime provides the Steem anchor services');
    assert(runtime.proofVerifier.nodes.join() === 'https://a,https://b', 'the verifier asks the configured API nodes');

    const publicationCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
    const anchorCatalog = new LocalPublicationAnchorCatalog(new InMemoryStorageProvider());
    const { createExternalPublicationAnchorUseCase } = new CreateExternalPublicationAnchorOrchestratorUseCase().execute({
        publicationCatalog, anchorCatalog, identityProvider: makeIdentity('Alice'), publishers: [runtime.anchorPublisher]
    });
    publicationCatalog.add(new DecentralizedPublication({ id: 'pub-steem', contentKind: 'forkbuild.structure', contentReference: new ContentReference({ hash: HASH }) }));

    const created = await createExternalPublicationAnchorUseCase.execute('pub-steem', 'steem');
    assert(created.outcome === ExternalAnchorCreationOutcome.CREATED, 'a Steem anchor is created through the shared orchestration');
    assert(created.anchor.anchorType === 'steem' && created.anchor.contentHash === HASH, 'bound to the publication\'s contentHash');

    const bob = new ExternalAnchorVerifier(new LocalAuthorizationVerifier());
    const early = await bob.verify(created.anchor.toJSON(), { expectedContentHash: HASH, proofVerifier: runtime.proofVerifier });
    assert(early.outcome === AnchorVerificationOutcome.PROOF_UNAVAILABLE, 'before the block is irreversible, the proof is unavailable');
    chain.finalize();
    const later = await bob.verify(created.anchor.toJSON(), { expectedContentHash: HASH, proofVerifier: runtime.proofVerifier });
    assert(later.outcome === AnchorVerificationOutcome.VALID, 'once irreversible, another replica verifies it VALID');
    const mismatch = await bob.verify(created.anchor.toJSON(), { expectedContentHash: 'fnv1a-32:00000000', proofVerifier: runtime.proofVerifier });
    assert(mismatch.outcome === AnchorVerificationOutcome.CONTENT_MISMATCH, 'and against another contentHash it is a mismatch');

    const noKeychain = composeSteemRuntime({ fetchImpl: chain.fetchImpl, getAccount: () => 'alice' });
    const { createExternalPublicationAnchorUseCase: withoutKeychain } = new CreateExternalPublicationAnchorOrchestratorUseCase().execute({
        publicationCatalog, anchorCatalog, identityProvider: makeIdentity('Alice'), publishers: [noKeychain.anchorPublisher]
    });
    const unavailable = await withoutKeychain.execute('pub-steem', 'steem');
    assert(unavailable.outcome === ExternalAnchorCreationOutcome.PUBLISH_UNAVAILABLE, 'without Keychain, creating reports PUBLISH_UNAVAILABLE');
    console.log('✓ a Steem anchor is created and independently verified end to end');
}
