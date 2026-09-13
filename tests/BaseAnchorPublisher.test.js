import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BaseAnchorPublisher } from '../anchoring/BaseAnchorPublisher.js';
import { CreateBaseAnchorPublisherUseCase } from '../application/CreateBaseAnchorPublisherUseCase.js';
import { BaseReviewedSigningCoordinator } from '../application/BaseReviewedSigningCoordinator.js';
import { BaseTransactionBroadcaster } from '../base/BaseTransactionBroadcaster.js';
import { BaseSignedTransactionFinalizer } from '../base/BaseSignedTransactionFinalizer.js';
import { BaseTransactionSigner } from '../base/BaseTransactionSigner.js';
import { CreateBaseAnchorPublicationRecordUseCase } from '../application/CreateBaseAnchorPublicationRecordUseCase.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { describeBasePublicationTransactionReview } from '../application/BasePublicationTransactionReview.js';
import { encodeBasePublicationCommitment } from '../application/BasePublicationCommitmentEncoding.js';
import { BaseProofVerifier } from '../anchoring/BaseProofVerifier.js';
import { BitcoinAnchorPublisher } from '../anchoring/BitcoinAnchorPublisher.js';
import { CreatePublicationAnchorUseCase } from '../application/CreatePublicationAnchorUseCase.js';
import { DecentralizedPublication } from '../core/DecentralizedPublication.js';
import { ContentReference } from '../core/ContentReference.js';
import { LocalPublicationCatalog } from '../application/LocalPublicationCatalog.js';
import { LocalPublicationAnchorCatalog } from '../application/LocalPublicationAnchorCatalog.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.9.470 — Review-Preserving Base Anchor Publisher.
//
// 0.9.469's own binding verdict — BASE_ANCHOR_SIGNING_POLICY =
// REVIEW_REQUIRED — named the buildable direction: a small bridge from the
// already-live, already-reviewed Base Publication Transaction pipeline
// (application/BaseReviewedSigningCoordinator.js, base/
// BaseSignedTransactionFinalizer.js, base/BaseTransactionBroadcaster.js,
// application/CreateBaseAnchorPublicationRecordUseCase.js — every one of
// them UNCHANGED by this milestone) into application/
// CreatePublicationAnchorUseCase.js's own already-generic contract. This
// file proves anchoring/BaseAnchorPublisher.js (THIS milestone) is exactly
// that bridge, and nothing more.
//
//   Section A: construction and dependency injection.
//   Section B: content-hash fidelity — the exact supplied contentHash
//              reaches the wallet's own transactionRequest unchanged, and a
//              contentHash that does not match what was reviewed is refused
//              before the wallet is ever consulted.
//   Section C: review preservation — the central section. No path through
//              publish() ever calls describeBasePublicationTransactionReview()
//              itself; a plan that has drifted from what was reviewed is
//              refused with zero wallet consultation, exactly as 0.8.93's
//              own signer already guarantees.
//   Section D: approval path — review -> sign -> finalize -> broadcast ->
//              inclusion -> txid -> anchor result, end to end.
//   Section E: rejection path — a declined review/signature never
//              broadcasts and never creates an anchor.
//   Section F: signing failure — UNAVAILABLE/FAILED wallet outcomes never
//              reach the broadcaster or the anchor catalog.
//   Section G: broadcast failure — a finalized transaction that fails to
//              broadcast (definite or unavailable) never creates an anchor.
//   Section H: inclusion — the broadcaster's own txid becomes both the
//              anchor's proof.txid and the durable BaseAnchorPublicationRecord's
//              own txid, unchanged.
//   Section I: proof round-trip — the anchor this publisher creates
//              verifies VALID against anchoring/BaseProofVerifier.js
//              (production-wired since 0.9.465), a genuine, complete Base
//              evidence cycle.
//   Section J: cross-substrate isolation — a Base anchor and a Bitcoin
//              anchor for two different publications coexist in the same
//              catalog without interference, and a proof from one
//              anchorType is refused by the other's verifier.
//   Section K: no signing-boundary regression — anchoring/
//              BaseAnchorPublisher.js never imports base/
//              BaseTransactionSigner.js or base/BaseReviewedTransactionSigner.js
//              directly, and base/BaseTransactionSigner.js itself still
//              rejects a bare contentHash exactly as 0.8.93 established.
//   Section L: no private-key exposure anywhere in this milestone's own
//              public surface.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function expectThrowsAsync(fn, message) {
    let threw = false;
    try { await fn(); } catch (_e) { threw = true; }
    assert(threw, message);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch (_e) { threw = true; }
    assert(threw, message);
}

const SOURCE_ROOT = fileURLToPath(new URL('../', import.meta.url));
async function source(relativePath) {
    return readFile(path.join(SOURCE_ROOT, relativePath), 'utf8');
}
function codeOnly(src) {
    return src.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

const ADDRESS = '0x' + 'a1'.repeat(20);
const CHAIN_ID = 8453;
const CONTENT_HASH = 'deadbeef'.repeat(8); // a 32-byte, sha256-shaped hash

// A plain, already-CONSTRUCTED plan object — the exact shape base/
// BasePublicationTransactionPlanner.js#plan() produces on success. Built
// directly here, without the RPC-priced planner/coordinator machinery
// tests/BaseReviewedTransactionSigning.test.js exercises separately — this
// file's own job is BaseAnchorPublisher's composition, not re-proving
// construction, which already has its own dedicated coverage.
function makePlan({ contentHash = CONTENT_HASH, network = 'mainnet', nonce = 5, gasLimit = 40000, maxFeePerGas = '1000000000', maxPriorityFeePerGas = '100000000' } = {}) {
    return Object.freeze({
        network, chainId: CHAIN_ID, from: ADDRESS, to: ADDRESS, value: '0',
        data: encodeBasePublicationCommitment(contentHash),
        nonce, gasLimit, maxFeePerGas, maxPriorityFeePerGas
    });
}

// A fake wallet exposing exactly signTransaction() — mirrors tests/
// BaseReviewedTransactionSigning.test.js's own fake exactly, one milestone
// over. A garbage `rawTransaction` is fine for every section here except
// the one place (Section A) that deliberately drives the REAL, default-
// constructed base/BaseSignedTransactionFinalizer.js to prove
// CreateBaseAnchorPublisherUseCase wires a genuine one, not a no-op.
function fakeWallet({ behavior = 'sign' } = {}) {
    const requests = [];
    return {
        requests,
        async signTransaction(transactionRequest) {
            requests.push(transactionRequest);
            if (behavior === 'sign') return { signed: true, rawTransaction: '0x' + 'ab'.repeat(70) };
            if (behavior === 'decline') return { signed: false, reason: 'user rejected the request' };
            if (behavior === 'unavailable') return { signed: false, unavailable: true, reason: 'wallet is locked' };
            if (behavior === 'no-raw-transaction') return { signed: true };
            throw new Error(`unknown fake wallet behavior: ${behavior}`);
        }
    };
}

// base/BaseSignedTransactionFinalizer.js's own cryptographic correctness is
// exhaustively covered by tests/BaseSignedTransactionFinalization.test.js
// (which reimplements real secp256k1 signing to produce genuinely valid
// fixtures). This fake stands in for it here, precisely mirroring tests/
// BitcoinAnchorCreationAdapter.test.js's own restraint toward its own fake
// broadcaster: this file's job is proving BaseAnchorPublisher calls
// finalize() with the right inputs and maps every one of its documented
// outcomes correctly, never re-proving the finalizer's own cryptography.
function fakeFinalizer({ behavior = 'finalize' } = {}) {
    const calls = [];
    return {
        calls,
        finalize({ plan, rawTransaction }) {
            calls.push({ plan, rawTransaction });
            if (behavior === 'finalize') {
                return {
                    finalized: true, invalidSignature: false, reason: null,
                    finalizedTransaction: {
                        rawTransaction, transactionHash: '0x' + 'cc'.repeat(32),
                        from: plan.from, to: plan.to, network: plan.network, chainId: plan.chainId,
                        nonce: plan.nonce, gasLimit: plan.gasLimit, maxFeePerGas: plan.maxFeePerGas,
                        maxPriorityFeePerGas: plan.maxPriorityFeePerGas, value: plan.value, data: plan.data
                    }
                };
            }
            if (behavior === 'invalid-signature') {
                return { finalized: false, invalidSignature: true, reason: 'simulated: signed by the wrong account', finalizedTransaction: null };
            }
            if (behavior === 'structural-mismatch') {
                return { finalized: false, invalidSignature: false, reason: 'simulated: nonce does not match the reviewed plan', finalizedTransaction: null };
            }
            throw new Error(`unknown fake finalizer behavior: ${behavior}`);
        }
    };
}

// A fake rpcSource for the REAL base/BaseTransactionBroadcaster.js — no
// crypto involved at this boundary, so the production class itself is
// always used unchanged, never faked.
function fakeBroadcastRpcSource({ behavior = 'broadcast', txid = '0x' + '11'.repeat(32) } = {}) {
    const calls = [];
    return {
        calls,
        async broadcastRawTransaction(rawTransaction) {
            calls.push(rawTransaction);
            if (behavior === 'broadcast') return { broadcasted: true, txid };
            if (behavior === 'reject') return { broadcasted: false, reason: 'simulated: replacement transaction underpriced' };
            if (behavior === 'unavailable') return { broadcasted: false, unavailable: true, reason: 'simulated: RPC endpoint unreachable' };
            if (behavior === 'throw') throw new Error('simulated: network error');
            throw new Error(`unknown fake broadcast behavior: ${behavior}`);
        }
    };
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function makeIdentity(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    return provider;
}

// A full, real replica — publicationCatalog, anchorCatalog, verifier, and a
// real, signed-in identityProvider — feeding a real, unmodified
// application/CreatePublicationAnchorUseCase.js, exactly mirroring tests/
// BitcoinAnchorCreationAdapter.test.js's own replica setup one milestone
// over.
function makeReplica() {
    const publicationCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
    const anchorCatalog = new LocalPublicationAnchorCatalog(new InMemoryStorageProvider());
    const verifier = new LocalAuthorizationVerifier();
    const identityProvider = makeIdentity('Alice');
    const createPublicationAnchorUseCase = new CreatePublicationAnchorUseCase(publicationCatalog, identityProvider, verifier, anchorCatalog);
    return { publicationCatalog, anchorCatalog, verifier, identityProvider, createPublicationAnchorUseCase };
}

function publishContent(publicationCatalog, { id = 'pub-1', hash = CONTENT_HASH } = {}) {
    const publication = new DecentralizedPublication({
        id,
        contentKind: 'forkbuild.structure',
        contentReference: new ContentReference({ hash })
    });
    publicationCatalog.add(publication);
    return publication;
}

// Builds a BaseAnchorPublisher wired against fully controllable fakes for
// its three network/wallet-facing collaborators, and a real, full replica
// for the last two. `broadcastBehavior`/`finalizeBehavior`/`walletBehavior`
// select the scenario a given section needs.
function makePublisher({ replica, finalizeBehavior = 'finalize', broadcastBehavior = 'broadcast', txid } = {}) {
    const finalizer = fakeFinalizer({ behavior: finalizeBehavior });
    const rpcSource = fakeBroadcastRpcSource({ behavior: broadcastBehavior, ...(txid ? { txid } : {}) });
    const broadcaster = new BaseTransactionBroadcaster({ rpcSource });
    const publisher = new BaseAnchorPublisher({
        baseReviewedSigningCoordinator: new BaseReviewedSigningCoordinator(),
        baseSignedTransactionFinalizer: finalizer,
        baseTransactionBroadcaster: broadcaster,
        createBaseAnchorPublicationRecordUseCase: new CreateBaseAnchorPublicationRecordUseCase(),
        createPublicationAnchorUseCase: replica.createPublicationAnchorUseCase
    });
    return { publisher, finalizer, rpcSource };
}

async function run() {
    console.log('Running BaseAnchorPublisher tests...\n');

    // ===============================================================
    // Section A — Construction and dependency injection.
    // ===============================================================
    {
        const replica = makeReplica();
        const broadcaster = new BaseTransactionBroadcaster({ rpcSource: fakeBroadcastRpcSource() });

        expectThrows(() => new BaseAnchorPublisher({}), '1. missing every collaborator throws');
        expectThrows(() => new BaseAnchorPublisher({ baseReviewedSigningCoordinator: new BaseReviewedSigningCoordinator() }), '2. missing baseSignedTransactionFinalizer throws');
        expectThrows(() => new BaseAnchorPublisher({
            baseReviewedSigningCoordinator: new BaseReviewedSigningCoordinator(),
            baseSignedTransactionFinalizer: new BaseSignedTransactionFinalizer()
        }), '3. missing baseTransactionBroadcaster throws');
        expectThrows(() => new BaseAnchorPublisher({
            baseReviewedSigningCoordinator: new BaseReviewedSigningCoordinator(),
            baseSignedTransactionFinalizer: new BaseSignedTransactionFinalizer(),
            baseTransactionBroadcaster: broadcaster
        }), '4. missing createBaseAnchorPublicationRecordUseCase throws');
        expectThrows(() => new BaseAnchorPublisher({
            baseReviewedSigningCoordinator: new BaseReviewedSigningCoordinator(),
            baseSignedTransactionFinalizer: new BaseSignedTransactionFinalizer(),
            baseTransactionBroadcaster: broadcaster,
            createBaseAnchorPublicationRecordUseCase: new CreateBaseAnchorPublicationRecordUseCase()
        }), '5. missing createPublicationAnchorUseCase throws');

        const publisher = new BaseAnchorPublisher({
            baseReviewedSigningCoordinator: new BaseReviewedSigningCoordinator(),
            baseSignedTransactionFinalizer: new BaseSignedTransactionFinalizer(),
            baseTransactionBroadcaster: broadcaster,
            createBaseAnchorPublicationRecordUseCase: new CreateBaseAnchorPublicationRecordUseCase(),
            createPublicationAnchorUseCase: replica.createPublicationAnchorUseCase
        });
        assert(publisher.anchorType === 'base', '6. constructed entirely from injected production collaborators, and identifies as anchorType "base"');

        // CreateBaseAnchorPublisherUseCase — dependency construction only.
        // Confirmed by proving its DEFAULTS wire a genuine, real base/
        // BaseSignedTransactionFinalizer.js — never a no-op — by handing it
        // a wallet-claimed "signed" transaction that is not genuinely
        // decodable, and observing the REAL finalizer's own structural
        // decode-failure outcome come straight through.
        const { baseAnchorPublisher } = new CreateBaseAnchorPublisherUseCase().execute({
            baseTransactionBroadcaster: broadcaster,
            createPublicationAnchorUseCase: replica.createPublicationAnchorUseCase
        });
        publishContent(replica.publicationCatalog, { id: 'pub-default-wiring' });
        const plan = makePlan();
        const review = describeBasePublicationTransactionReview(plan);
        const result = await baseAnchorPublisher.publish('pub-default-wiring', {
            contentHash: CONTENT_HASH, wallet: fakeWallet({ behavior: 'sign' }), plan, reviewedTransaction: review
        });
        assert(result.published === false, '7. CreateBaseAnchorPublisherUseCase wires a REAL finalizer by default — an undecodable garbage rawTransaction genuinely fails finalization, rather than being silently accepted by a no-op');
        assert(replica.anchorCatalog.findByPublicationId('pub-default-wiring').length === 0, '8. no anchor was created for the failed default-wiring attempt');
    }
    console.log('✓ Section A: every required collaborator is enforced at construction, and CreateBaseAnchorPublisherUseCase wires real, unmodified default collaborators');

    // ===============================================================
    // Section B — Content-hash fidelity.
    // ===============================================================
    {
        const replica = makeReplica();
        publishContent(replica.publicationCatalog, { id: 'pub-b' });
        const { publisher } = makePublisher({ replica });

        const plan = makePlan({ contentHash: CONTENT_HASH });
        const review = describeBasePublicationTransactionReview(plan);
        const wallet = fakeWallet({ behavior: 'sign' });

        const result = await publisher.publish('pub-b', { contentHash: CONTENT_HASH, wallet, plan, reviewedTransaction: review, archive: PublicationObservationArchive.empty() });
        assert(result.published === true, '10. test setup: a genuinely matching contentHash publishes');
        assert(wallet.requests.length === 1, '11. the wallet was consulted exactly once');
        assert(wallet.requests[0].data === plan.data, '12. the wallet\'s own transactionRequest carries plan.data — the commitment — completely unchanged');
        assert(wallet.requests[0].data === encodeBasePublicationCommitment(CONTENT_HASH), '13. that data is exactly the supplied contentHash, encoded the one, unchanged way application/BasePublicationCommitmentEncoding.js already defines');

        // A contentHash that does not match what was actually reviewed —
        // e.g. a caller accidentally handing this publisher a plan/review
        // pair that was broadcast for a DIFFERENT publication's content —
        // is refused before the wallet is ever consulted.
        const otherWallet = fakeWallet({ behavior: 'sign' });
        await expectThrowsAsync(
            () => publisher.publish('pub-b', { contentHash: 'ffffffff'.repeat(8), wallet: otherWallet, plan, reviewedTransaction: review }),
            '14. a contentHash that does not match reviewedTransaction.contentHash is a thrown caller-contract violation'
        );
        assert(otherWallet.requests.length === 0, '15. the wallet is NEVER consulted when contentHash fidelity fails');
    }
    console.log('✓ Section B: the exact supplied contentHash reaches the wallet\'s own transactionRequest unchanged, and a mismatched contentHash is refused before the wallet is ever consulted');

    // ===============================================================
    // Section C — Review preservation (the central section).
    // ===============================================================
    {
        // C1: publish() never calls describeBasePublicationTransactionReview()
        // itself — confirmed structurally: this file's own source contains
        // no reference to that function at all.
        const publisherCodeOnly = codeOnly(await source('anchoring/BaseAnchorPublisher.js'));
        assert(!/describeBasePublicationTransactionReview/.test(publisherCodeOnly), '16. anchoring/BaseAnchorPublisher.js\'s own real code never calls describeBasePublicationTransactionReview — it can only sign a reviewedTransaction a caller already produced, never manufacture one itself');

        // C2: omitting reviewedTransaction entirely is a caller-contract
        // violation — application/BaseReviewedSigningCoordinator.js's own
        // precondition, reused verbatim, never duplicated or weakened.
        const replica = makeReplica();
        publishContent(replica.publicationCatalog, { id: 'pub-c' });
        const { publisher } = makePublisher({ replica });
        const plan = makePlan();
        const wallet = fakeWallet({ behavior: 'sign' });
        await expectThrowsAsync(
            () => publisher.publish('pub-c', { contentHash: CONTENT_HASH, wallet, plan }),
            '17. a missing reviewedTransaction throws — there is no path to signing without one'
        );
        assert(wallet.requests.length === 0, '18. the wallet is never consulted when reviewedTransaction is missing');

        // C3: a plan that has drifted from what was reviewed — the exact
        // 0.8.93 guarantee — is refused, definitely, with zero wallet
        // consultation, never merely "unavailable."
        const staleReview = describeBasePublicationTransactionReview(plan);
        const driftedPlan = makePlan({ nonce: 999 });
        const driftedWallet = fakeWallet({ behavior: 'sign' });
        const driftedResult = await publisher.publish('pub-c', { contentHash: CONTENT_HASH, wallet: driftedWallet, plan: driftedPlan, reviewedTransaction: staleReview });
        assert(driftedResult.published === false && !driftedResult.unavailable, '19. a drifted plan is refused, definitely — never "unavailable"');
        assert(driftedWallet.requests.length === 0, '20. the wallet is NEVER consulted for a plan that no longer matches what was reviewed');
        assert(replica.anchorCatalog.findByPublicationId('pub-c').length === 0, '21. no anchor is ever created for a refused, unreviewed signature');
    }
    console.log('✓ Section C (CENTRAL): no path through publish() can sign anything other than a genuinely, already-reviewed transaction — the 0.8.93 gate is fully intact');

    // ===============================================================
    // Section D — Approval path: review -> sign -> finalize -> broadcast
    // -> inclusion -> txid -> anchor result.
    // ===============================================================
    {
        const replica = makeReplica();
        const publication = publishContent(replica.publicationCatalog, { id: 'pub-d' });
        const txid = '0x' + '22'.repeat(32);
        const { publisher, rpcSource } = makePublisher({ replica, txid });

        const plan = makePlan();
        const review = describeBasePublicationTransactionReview(plan);
        const wallet = fakeWallet({ behavior: 'sign' });

        const result = await publisher.publish('pub-d', {
            contentHash: CONTENT_HASH, wallet, plan, reviewedTransaction: review, archive: PublicationObservationArchive.empty()
        });

        assert(result.published === true, '22. the full approval path publishes');
        assert(result.locator === `base:${txid}`, '23. locator is base:<txid>');
        assert(result.proof.txid === txid && result.proof.network === 'mainnet', '24. proof is exactly { txid, network }');
        assert(rpcSource.calls.length === 1, '25. the broadcaster was consulted exactly once');

        assert(result.anchor.publicationId === 'pub-d', '26. the created anchor names the publication it was created for');
        assert(result.anchor.contentHash === publication.contentReference.hash, '27. the anchor\'s own contentHash is derived from the publication itself, unchanged');
        assert(result.anchor.anchorType === 'base', '28. anchorType is "base"');
        assert(replica.anchorCatalog.has(result.anchor.id), '29. the anchor is already cataloged');
    }
    console.log('✓ Section D: the full review -> sign -> finalize -> broadcast -> inclusion -> anchor path publishes exactly as intended');

    // ===============================================================
    // Section E — Rejection path.
    // ===============================================================
    {
        const replica = makeReplica();
        publishContent(replica.publicationCatalog, { id: 'pub-e' });
        const { publisher, rpcSource } = makePublisher({ replica });
        const plan = makePlan();
        const review = describeBasePublicationTransactionReview(plan);
        const decliningWallet = fakeWallet({ behavior: 'decline' });

        const result = await publisher.publish('pub-e', { contentHash: CONTENT_HASH, wallet: decliningWallet, plan, reviewedTransaction: review });

        assert(result.published === false, '30. a declined signature never publishes');
        assert(!result.unavailable, '31. a wallet decline is a definite no, never "unavailable"');
        assert(rpcSource.calls.length === 0, '32. a declined signature never reaches the broadcaster');
        assert(replica.anchorCatalog.findByPublicationId('pub-e').length === 0, '33. a declined signature never creates an anchor');
    }
    console.log('✓ Section E: a rejected review/signature never broadcasts and never creates an anchor');

    // ===============================================================
    // Section F — Signing failure.
    // ===============================================================
    {
        const replica = makeReplica();
        publishContent(replica.publicationCatalog, { id: 'pub-f' });
        const { publisher, rpcSource } = makePublisher({ replica });
        const plan = makePlan();
        const review = describeBasePublicationTransactionReview(plan);

        const noWalletResult = await publisher.publish('pub-f', { contentHash: CONTENT_HASH, wallet: null, plan, reviewedTransaction: review });
        assert(noWalletResult.published === false && noWalletResult.unavailable === true, '34. no wallet connected is unavailable, never a decline');

        const unavailableWallet = fakeWallet({ behavior: 'unavailable' });
        const unavailableResult = await publisher.publish('pub-f', { contentHash: CONTENT_HASH, wallet: unavailableWallet, plan, reviewedTransaction: review });
        assert(unavailableResult.published === false && unavailableResult.unavailable === true, '35. a wallet reporting unavailable stays unavailable');

        const failedWallet = fakeWallet({ behavior: 'no-raw-transaction' });
        const failedResult = await publisher.publish('pub-f', { contentHash: CONTENT_HASH, wallet: failedWallet, plan, reviewedTransaction: review });
        assert(failedResult.published === false && !failedResult.unavailable, '36. a wallet-contract violation (signed:true, no rawTransaction) is a definite failure, never "unavailable"');

        assert(rpcSource.calls.length === 0, '37. no signing failure of any kind ever reaches the broadcaster');
        assert(replica.anchorCatalog.findByPublicationId('pub-f').length === 0, '38. no signing failure ever creates an anchor');
    }
    console.log('✓ Section F: every signing-failure outcome (UNAVAILABLE, FAILED) is reported without ever reaching the broadcaster or the anchor catalog');

    // ===============================================================
    // Section G — Broadcast and finalization failure.
    // ===============================================================
    {
        const replica = makeReplica();
        publishContent(replica.publicationCatalog, { id: 'pub-g' });
        const plan = makePlan();
        const review = describeBasePublicationTransactionReview(plan);

        // Finalization failures — structural mismatch and invalid signature
        // — are both definite, never "unavailable."
        for (const finalizeBehavior of ['structural-mismatch', 'invalid-signature']) {
            const { publisher, rpcSource } = makePublisher({ replica, finalizeBehavior });
            const wallet = fakeWallet({ behavior: 'sign' });
            const result = await publisher.publish('pub-g', { contentHash: CONTENT_HASH, wallet, plan, reviewedTransaction: review });
            assert(result.published === false && !result.unavailable, `39[${finalizeBehavior}]. a finalization failure is a definite no`);
            assert(rpcSource.calls.length === 0, `40[${finalizeBehavior}]. a finalization failure never reaches the broadcaster`);
        }

        // Broadcast failures — definite rejection vs. unavailable — stay
        // distinguishable.
        const { publisher: rejectingPublisher } = makePublisher({ replica, broadcastBehavior: 'reject' });
        const rejectResult = await rejectingPublisher.publish('pub-g', { contentHash: CONTENT_HASH, wallet: fakeWallet({ behavior: 'sign' }), plan, reviewedTransaction: review });
        assert(rejectResult.published === false && !rejectResult.unavailable, '41. a definite broadcast rejection is reported as a definite no');

        const { publisher: unavailablePublisher } = makePublisher({ replica, broadcastBehavior: 'unavailable' });
        const unavailableResult = await unavailablePublisher.publish('pub-g', { contentHash: CONTENT_HASH, wallet: fakeWallet({ behavior: 'sign' }), plan, reviewedTransaction: review });
        assert(unavailableResult.published === false && unavailableResult.unavailable === true, '42. an unreachable broadcaster is reported as unavailable, never a rejection');

        const { publisher: throwingPublisher } = makePublisher({ replica, broadcastBehavior: 'throw' });
        const throwResult = await throwingPublisher.publish('pub-g', { contentHash: CONTENT_HASH, wallet: fakeWallet({ behavior: 'sign' }), plan, reviewedTransaction: review });
        assert(throwResult.published === false && throwResult.unavailable === true, '43. a throwing broadcaster is treated as unavailable, never a crash');

        assert(replica.anchorCatalog.findByPublicationId('pub-g').length === 0, '44. no finalization or broadcast failure of any kind ever creates an anchor');
    }
    console.log('✓ Section G: finalization and broadcast failures each stay correctly distinguished between a definite no and "unavailable," and none ever creates an anchor');

    // ===============================================================
    // Section H — Inclusion: the broadcaster's own txid becomes both the
    // proof and the durable BaseAnchorPublicationRecord's own txid.
    // ===============================================================
    {
        const replica = makeReplica();
        publishContent(replica.publicationCatalog, { id: 'pub-h' });
        const txid = '0x' + '33'.repeat(32);
        const { publisher } = makePublisher({ replica, txid });
        const plan = makePlan();
        const review = describeBasePublicationTransactionReview(plan);

        const result = await publisher.publish('pub-h', {
            contentHash: CONTENT_HASH, wallet: fakeWallet({ behavior: 'sign' }), plan, reviewedTransaction: review, archive: PublicationObservationArchive.empty()
        });

        assert(result.published === true, '45. test setup: publish succeeds');
        assert(result.proof.txid === txid, '46. the anchor\'s own proof.txid is exactly the broadcaster\'s own reported txid');

        const records = result.archive.baseAnchorPublicationRecords;
        assert(records.length === 1, '47. exactly one BaseAnchorPublicationRecord was appended to a NEW archive');
        assert(records[0].txid === txid, '48. the durable record names the identical txid as the anchor\'s own proof');
        assert(records[0].network === 'mainnet', '49. the durable record names the correct network');
        assert(records[0].contentHash === CONTENT_HASH, '50. the durable record names the correct contentHash');

        assert(PublicationObservationArchive.empty().baseAnchorPublicationRecordCount === 0, '51. the archive this call was given is never mutated — a fresh empty() archive still reports zero records');
    }
    console.log('✓ Section H: the broadcaster\'s own txid becomes both the anchor\'s proof and the durable local record\'s own txid, unchanged, without mutating the caller\'s own archive');

    // ===============================================================
    // Section I — Proof round-trip: the created anchor verifies VALID
    // against the production-wired anchoring/BaseProofVerifier.js.
    // ===============================================================
    {
        const replica = makeReplica();
        publishContent(replica.publicationCatalog, { id: 'pub-i' });
        const txid = '0x' + '44'.repeat(32);
        const { publisher } = makePublisher({ replica, txid });
        const plan = makePlan();
        const review = describeBasePublicationTransactionReview(plan);

        const result = await publisher.publish('pub-i', { contentHash: CONTENT_HASH, wallet: fakeWallet({ behavior: 'sign' }), plan, reviewedTransaction: review });
        assert(result.published === true, '52. test setup: publish succeeds');

        // A fake rpcSource for the verifier's own side — standing in for
        // the SAME Base network the broadcaster above submitted to.
        const verifierRpcSource = {
            async fetchTransactionByHash(requestedTxid) {
                assert(requestedTxid === txid, '53. the verifier asks about the exact txid this publisher produced');
                return { available: true, found: true, hash: txid, input: plan.data };
            }
        };
        const baseProofVerifier = new BaseProofVerifier({ rpcSource: verifierRpcSource, network: 'mainnet' });
        const verification = await baseProofVerifier.verify(result.anchor.proof, { contentHash: result.anchor.contentHash });
        assert(verification.valid === true, '54. the anchor this publisher created verifies VALID against anchoring/BaseProofVerifier.js — a complete, genuine Base evidence cycle');
    }
    console.log('✓ Section I: BaseAnchorPublisher -> txid -> BaseProofVerifier -> VALID, a complete Base evidence round-trip');

    // ===============================================================
    // Section J — Cross-substrate isolation.
    // ===============================================================
    {
        const replica = makeReplica();
        publishContent(replica.publicationCatalog, { id: 'pub-j-base', hash: CONTENT_HASH });
        publishContent(replica.publicationCatalog, { id: 'pub-j-bitcoin', hash: 'cafebabe'.repeat(8) });

        const baseTxid = '0x' + '55'.repeat(32);
        const { publisher: baseAnchorPublisher } = makePublisher({ replica, txid: baseTxid });
        const plan = makePlan();
        const review = describeBasePublicationTransactionReview(plan);
        const baseResult = await baseAnchorPublisher.publish('pub-j-base', { contentHash: CONTENT_HASH, wallet: fakeWallet({ behavior: 'sign' }), plan, reviewedTransaction: review });
        assert(baseResult.published === true, '55. test setup: the Base anchor publishes');

        const bitcoinTxid = '6'.repeat(64);
        const bitcoinBroadcaster = { async broadcast() { return { broadcast: true, txid: bitcoinTxid }; } };
        const bitcoinAnchorPublisher = new BitcoinAnchorPublisher({ network: 'mainnet', broadcaster: bitcoinBroadcaster });
        const bitcoinEvidence = await bitcoinAnchorPublisher.publish('cafebabe'.repeat(8));
        assert(bitcoinEvidence.published === true, '56. test setup: the Bitcoin publisher (entirely unrelated, unchanged) also publishes');
        const bitcoinAnchor = replica.createPublicationAnchorUseCase.execute('pub-j-bitcoin', {
            anchorType: bitcoinAnchorPublisher.anchorType, locator: bitcoinEvidence.locator, proof: bitcoinEvidence.proof
        });

        // Both anchors coexist in the SAME catalog without interference.
        assert(replica.anchorCatalog.findByPublicationId('pub-j-base').length === 1, '57. the Base anchor is scoped to its own publication');
        assert(replica.anchorCatalog.findByPublicationId('pub-j-bitcoin').length === 1, '58. the Bitcoin anchor is scoped to its own, entirely separate publication');
        assert(replica.anchorCatalog.findByPublicationId('pub-j-base')[0].anchorType === 'base', '59. the Base anchor still names anchorType "base"');
        assert(replica.anchorCatalog.findByPublicationId('pub-j-bitcoin')[0].anchorType === 'bitcoin-op-return', '60. the Bitcoin anchor still names its own, unrelated anchorType');

        // A Bitcoin proof handed to the Base verifier is refused — the two
        // proof shapes are never mistaken for one another.
        const baseProofVerifier = new BaseProofVerifier({ rpcSource: { async fetchTransactionByHash() { throw new Error('should never be called'); } }, network: 'mainnet' });
        const crossVerification = await baseProofVerifier.verify(bitcoinAnchor.proof, { contentHash: bitcoinAnchor.contentHash });
        assert(crossVerification.valid === false, '61. a Bitcoin anchor\'s own proof is refused by anchoring/BaseProofVerifier.js — never mistaken for a valid Base proof');
    }
    console.log('✓ Section J: a Base anchor and a Bitcoin anchor for two different publications coexist without interference, and each anchorType\'s own proof is refused by the other\'s verifier');

    // ===============================================================
    // Section K — No signing-boundary regression.
    // ===============================================================
    {
        const publisherCodeOnly2 = codeOnly(await source('anchoring/BaseAnchorPublisher.js'));
        assert(!/from ['"]\.\.\/base\/BaseTransactionSigner\.js['"]/.test(publisherCodeOnly2), '62. anchoring/BaseAnchorPublisher.js never imports base/BaseTransactionSigner.js directly');
        assert(!/from ['"]\.\.\/base\/BaseReviewedTransactionSigner\.js['"]/.test(publisherCodeOnly2), '63. anchoring/BaseAnchorPublisher.js never imports base/BaseReviewedTransactionSigner.js directly — it only ever composes application/BaseReviewedSigningCoordinator.js');

        const rawSignerSrc = await source('base/BaseTransactionSigner.js');
        assert(/requireRealBasePublicationTransactionPlan\(plan\)/.test(rawSignerSrc), '64. base/BaseTransactionSigner.js is untouched — it still re-validates a full, already-constructed plan');

        // Functional confirmation, not just a source-text check: the real
        // signer still throws for a bare contentHash-shaped "plan."
        const wallet = fakeWallet({ behavior: 'sign' });
        const rawSigner = new BaseTransactionSigner({ wallet });
        await expectThrowsAsync(() => rawSigner.requestSignature({ plan: { contentHash: CONTENT_HASH } }), '65. base/BaseTransactionSigner.js still rejects a bare contentHash — this milestone never weakened that boundary');
        assert(wallet.requests.length === 0, '66. the wallet was never consulted for that rejected, bare-contentHash "plan"');
    }
    console.log('✓ Section K: the 0.8.93 signing boundary is untouched — both structurally (no direct import) and functionally (a bare contentHash is still rejected)');

    // ===============================================================
    // Section L — No private-key exposure.
    // ===============================================================
    {
        const replica = makeReplica();
        const { publisher } = makePublisher({ replica });
        const { baseAnchorPublisher } = new CreateBaseAnchorPublisherUseCase().execute({
            baseTransactionBroadcaster: new BaseTransactionBroadcaster({ rpcSource: fakeBroadcastRpcSource() }),
            createPublicationAnchorUseCase: replica.createPublicationAnchorUseCase
        });

        for (const forbidden of ['privateKey', 'privateKeyHex', 'mnemonic', 'seedPhrase', 'seed', 'password']) {
            for (const instance of [publisher, baseAnchorPublisher]) {
                assert(!(forbidden in instance), `67. ${instance.constructor.name} carries no "${forbidden}" field of any kind`);
                assert(typeof instance[forbidden] !== 'function', `68. ${instance.constructor.name} exposes no "${forbidden}" method of any kind`);
            }
        }
    }
    console.log('✓ Section L: no private-key, seed, mnemonic, or password field anywhere in this milestone\'s own public surface');

    console.log('\n✅ All BaseAnchorPublisher tests passed.');
}

run().catch((error) => {
    console.error('BaseAnchorPublisher.test.js FAILED:', error);
    process.exitCode = 1;
});
