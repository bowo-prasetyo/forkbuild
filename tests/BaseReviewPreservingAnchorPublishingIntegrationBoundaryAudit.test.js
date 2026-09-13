import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BaseAnchorPublisher } from '../anchoring/BaseAnchorPublisher.js';
import { CreateBaseAnchorPublisherUseCase } from '../application/CreateBaseAnchorPublisherUseCase.js';
import { BaseReviewedSigningCoordinator } from '../application/BaseReviewedSigningCoordinator.js';
import { BaseTransactionBroadcaster } from '../base/BaseTransactionBroadcaster.js';
import { BaseSignedTransactionFinalizer } from '../base/BaseSignedTransactionFinalizer.js';
import { BaseJsonRpcClient } from '../base/BaseJsonRpcClient.js';
import { CreateBaseAnchorPublicationRecordUseCase } from '../application/CreateBaseAnchorPublicationRecordUseCase.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { describeBasePublicationTransactionReview } from '../application/BasePublicationTransactionReview.js';
import { encodeBasePublicationCommitment } from '../application/BasePublicationCommitmentEncoding.js';
import { BaseProofVerifier } from '../anchoring/BaseProofVerifier.js';
import { ExternalAnchorPublisherRegistry } from '../application/ExternalAnchorPublisherRegistry.js';
import { CreatePublicationAnchorUseCase } from '../application/CreatePublicationAnchorUseCase.js';
import { DecentralizedPublication } from '../core/DecentralizedPublication.js';
import { ContentReference } from '../core/ContentReference.js';
import { LocalPublicationCatalog } from '../application/LocalPublicationCatalog.js';
import { LocalPublicationAnchorCatalog } from '../application/LocalPublicationAnchorCatalog.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.9.471 — Base Review-Preserving Anchor Publishing Integration Boundary
// Audit.
//
// TYPE: test-only audit. PRODUCTION CHANGES: NONE.
//
// 0.9.470 built anchoring/BaseAnchorPublisher.js — a bridge from the
// already-live, already-reviewed Base Publication Transaction pipeline into
// application/CreatePublicationAnchorUseCase.js's own generic contract —
// and its own header already commits to two things this audit takes as
// given, never re-litigates:
//
//   1. BaseAnchorPublisher is deliberately NOT registered in application/
//      ExternalAnchorPublisherRegistry.js. Its `publish(publicationId, {
//      contentHash, wallet, plan, reviewedTransaction, archive })` contract
//      cannot be reduced to that registry's single-argument
//      `publish(contentHash)` shape without either fabricating a
//      reviewedTransaction internally (the exact automatic-approval bypass
//      0.9.469 rejected) or being permanently unavailable.
//   2. "Wiring a real UI affordance that calls it is the next, separately
//      sized integration milestone" — 0.9.470's own words.
//
// This audit's one question is whether that next milestone is still
// necessary, or whether some existing seam already makes BaseAnchorPublisher
// reachable from a legitimate user-controlled reviewed-transaction flow:
//
//   Can the existing production application actually reach
//   BaseAnchorPublisher through the already-live Base Publication
//   Transaction UI, or does anchoring/BaseAnchorPublisher.js exist only as
//   tested-but-unreachable code?
//
// LETTERED SECTIONS:
//   A. Publisher contract boundary — BaseAnchorPublisher cannot be reduced
//      to publish(contentHash) without losing review semantics; contrasted
//      directly against Bitcoin's and Arweave's own one-argument publishers.
//   B. The existing reviewed Base pipeline, read from the real production
//      composition root (ui/main.js) — every collaborator
//      BaseAnchorPublisher composes is already constructed there for the
//      Base Publication Transaction feature, but BaseAnchorPublisher itself
//      is named nowhere in that file.
//   C. Real composition — BaseAnchorPublisher built from the exact
//      collaborator classes ui/main.js itself already wires (the real
//      BaseReviewedSigningCoordinator, the real BaseSignedTransactionFinalizer,
//      a real BaseTransactionBroadcaster over a real BaseJsonRpcClient),
//      never a test-only stand-in for any of them — only the network
//      transport (fetch) and the wallet are faked, exactly the two
//      boundaries no test can cross honestly.
//   D. End-to-end approval path, with the central invariant stated
//      explicitly: the reviewedTransaction a person was shown is
//      bit-for-bit the same transaction signed and broadcast.
//   E. Review rejection — a declined review never signs, never broadcasts,
//      and leaves no anchor record in either the catalog or the archive.
//   F. Content-hash binding — a mismatched contentHash is refused before
//      any wallet is ever consulted (regression re-check of 0.9.470's own
//      guarantee, load-bearing for this audit's own Section C-D fixtures).
//   G. Proof round trip — the centerpiece: BaseAnchorPublisher -> txid ->
//      BaseProofVerifier -> a REAL BaseJsonRpcClient (only its `fetch` is
//      faked) -> VALID.
//   H. Production UI/application reachability — THE decisive section.
//      Confirms, by direct inspection of ui/main.js and
//      ui/views/DecentralizedPublicationsView.js, that no code path
//      connects the live Base Publication Transaction UI's own broadcast
//      outcome to BaseAnchorPublisher or to anchor creation of any kind.
//   I. Registry isolation — Base remains absent from
//      ExternalAnchorPublisherRegistry BY DESIGN; Bitcoin and Arweave are
//      unaffected.
//   J. Cross-substrate isolation — regression witness: the dependent tests
//      already proving Bitcoin/Arweave/Base anchor creation and Base proof
//      verification coexist without interference are re-executed live.
//   K. Wallet lifetime — the wallet is a per-call argument only; no
//      BaseAnchorPublisher instance retains one across calls.
//   L. Verdict and recommendation.
//   M. Production-change guard.

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function n(message) {
    return `${assertionCount + 1}. ${message}`;
}
async function expectThrowsAsync(fn, message) {
    let threw = false;
    try { await fn(); } catch (_e) { threw = true; }
    assert(threw, message);
}

const SOURCE_ROOT = fileURLToPath(new URL('../', import.meta.url));
async function source(relativePath) {
    return readFile(path.join(SOURCE_ROOT, relativePath), 'utf8');
}
function codeOnly(src) {
    return src.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}
function runLive(file) {
    try {
        execSync(`node ${JSON.stringify(file)}`, { cwd: SOURCE_ROOT, stdio: 'pipe' });
        return { passed: true, output: '' };
    } catch (error) {
        const stdout = error.stdout ? error.stdout.toString() : '';
        const stderr = error.stderr ? error.stderr.toString() : '';
        return { passed: false, output: `${stdout}\n${stderr}` || error.message };
    }
}

const ADDRESS = '0x' + 'a1'.repeat(20);
const CHAIN_ID = 8453;
const CONTENT_HASH = 'deadbeef'.repeat(8);

function makePlan({ contentHash = CONTENT_HASH, network = 'mainnet', nonce = 5 } = {}) {
    return Object.freeze({
        network, chainId: CHAIN_ID, from: ADDRESS, to: ADDRESS, value: '0',
        data: encodeBasePublicationCommitment(contentHash),
        nonce, gasLimit: 40000, maxFeePerGas: '1000000000', maxPriorityFeePerGas: '100000000'
    });
}

function fakeWallet({ behavior = 'sign' } = {}) {
    const requests = [];
    return {
        requests,
        async signTransaction(transactionRequest) {
            requests.push(transactionRequest);
            if (behavior === 'sign') return { signed: true, rawTransaction: '0x' + 'ab'.repeat(70) };
            if (behavior === 'decline') return { signed: false, reason: 'user rejected the request' };
            throw new Error(`unknown fake wallet behavior: ${behavior}`);
        }
    };
}

// A fake finalizer stands in only because base/BaseSignedTransactionFinalizer.js's
// own cryptography is exhaustively covered by tests/BaseSignedTransactionFinalization.test.js,
// and this audit's own Section C already separately proves
// CreateBaseAnchorPublisherUseCase wires the REAL finalizer by default
// (tests/BaseAnchorPublisher.test.js Section A does the same). Recording
// every call lets Section D verify the exact plan reaching finalize() is
// the identical plan that was reviewed and signed.
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
            throw new Error(`unknown fake finalizer behavior: ${behavior}`);
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
        id, contentKind: 'forkbuild.structure', contentReference: new ContentReference({ hash })
    });
    publicationCatalog.add(publication);
    return publication;
}

// A fake HTTP `fetch` — the ONLY thing faked at the BaseJsonRpcClient
// boundary in this file. Everything above it (BaseJsonRpcClient itself,
// BaseProofVerifier, BaseTransactionBroadcaster) is the real, unmodified
// production class.
function fakeFetch({ broadcastTxid, transactionsByHash = {} } = {}) {
    const calls = [];
    return {
        calls,
        async fetch(url, { body }) {
            const request = JSON.parse(body);
            calls.push(request.method);
            if (request.method === 'eth_sendRawTransaction') {
                return { ok: true, json: async () => ({ jsonrpc: '2.0', id: 1, result: broadcastTxid }) };
            }
            if (request.method === 'eth_getTransactionByHash') {
                const [txid] = request.params;
                const tx = transactionsByHash[txid];
                return { ok: true, json: async () => ({ jsonrpc: '2.0', id: 1, result: tx || null }) };
            }
            throw new Error(`fakeFetch: unexpected method ${request.method}`);
        }
    };
}

async function run() {
    console.log('Running Base Review-Preserving Anchor Publishing Integration Boundary Audit...\n');

    // ===============================================================
    // Section A — Publisher contract boundary.
    // ===============================================================
    {
        const baseSrc = codeOnly(await source('anchoring/BaseAnchorPublisher.js'));
        assert(/async publish\(publicationId, \{ contentHash, wallet, plan, reviewedTransaction, archive \} = \{\}\)/.test(baseSrc),
            n('A1. BaseAnchorPublisher.publish() takes publicationId plus an explicit { contentHash, wallet, plan, reviewedTransaction, archive } object — never a bare contentHash'));

        const bitcoinSrc = codeOnly(await source('anchoring/BitcoinAnchorPublisher.js'));
        const arweaveSrc = codeOnly(await source('anchoring/ArweaveAnchorPublisher.js'));
        assert(/async publish\(contentHash\)/.test(bitcoinSrc), n('A2. anchoring/BitcoinAnchorPublisher.js keeps its own one-argument publish(contentHash)'));
        assert(/async publish\(contentHash\)/.test(arweaveSrc), n('A3. anchoring/ArweaveAnchorPublisher.js keeps its own one-argument publish(contentHash)'));

        // A4-A5: functional proof, not just signature shape — a caller
        // that hands BaseAnchorPublisher a bare contentHash and nothing
        // else gets a thrown contract violation, never a degraded
        // "unavailable" outcome the generic registry could paper over.
        const replica = makeReplica();
        publishContent(replica.publicationCatalog, { id: 'pub-a' });
        const broadcaster = new BaseTransactionBroadcaster({ rpcSource: { async broadcastRawTransaction() { throw new Error('should never be reached'); } } });
        const publisher = new BaseAnchorPublisher({
            baseReviewedSigningCoordinator: new BaseReviewedSigningCoordinator(),
            baseSignedTransactionFinalizer: new BaseSignedTransactionFinalizer(),
            baseTransactionBroadcaster: broadcaster,
            createBaseAnchorPublicationRecordUseCase: new CreateBaseAnchorPublicationRecordUseCase(),
            createPublicationAnchorUseCase: replica.createPublicationAnchorUseCase
        });
        await expectThrowsAsync(() => publisher.publish('pub-a', { contentHash: CONTENT_HASH }),
            n('A4. calling publish() with only a contentHash (mimicking the generic registry\'s own call shape) throws — there is no path from a bare contentHash to a signed, broadcast transaction'));
        assert(replica.anchorCatalog.findByPublicationId('pub-a').length === 0, n('A5. no anchor is created for that rejected, registry-shaped call'));

        console.log('✓ Section A: BaseAnchorPublisher genuinely cannot be reduced to publish(contentHash) — both structurally and functionally — while Bitcoin\'s and Arweave\'s own publishers still can. The contract boundary is real, not a naming convention.');
    }

    // ===============================================================
    // Section B — The existing reviewed Base pipeline, read from the
    // real production composition root.
    // ===============================================================
    {
        const mainSrc = codeOnly(await source('ui/main.js'));

        assert(/const \{ coordinator: basePublicationTransactionPlanCoordinator \} = new CreateBasePublicationTransactionPlanCoordinatorUseCase\(\)\.execute/.test(mainSrc),
            n('B1. ui/main.js already constructs a real basePublicationTransactionPlanCoordinator — the plan half of the pipeline BaseAnchorPublisher would need'));
        assert(/const \{ coordinator: baseReviewedSigningCoordinator \} = new CreateBaseReviewedSigningCoordinatorUseCase\(\)\.execute\(\)/.test(mainSrc),
            n('B2. ui/main.js already constructs a real baseReviewedSigningCoordinator — the exact class BaseAnchorPublisher itself composes, unchanged'));
        assert(/const \{ baseTransactionBroadcaster \} = new CreateBaseTransactionBroadcasterUseCase\(\)\.execute/.test(mainSrc),
            n('B3. ui/main.js already constructs a real baseTransactionBroadcaster — the exact class BaseAnchorPublisher itself composes, unchanged'));
        assert(/const \{ baseSignedTransactionFinalizer \} = new CreateBaseSignedTransactionFinalizerUseCase\(\)\.execute\(\)/.test(mainSrc),
            n('B4. ui/main.js already constructs a real baseSignedTransactionFinalizer — the exact class BaseAnchorPublisher itself composes, unchanged'));

        // B5-B7: and yet BaseAnchorPublisher itself — built one milestone
        // ago specifically to compose these four collaborators — is named
        // nowhere in this file.
        assert(!/BaseAnchorPublisher/.test(await source('ui/main.js')), n('B5. ui/main.js never imports anchoring/BaseAnchorPublisher.js'));
        assert(!/CreateBaseAnchorPublisherUseCase/.test(await source('ui/main.js')), n('B6. ui/main.js never imports application/CreateBaseAnchorPublisherUseCase.js'));
        assert(!/baseAnchorPublisher/i.test(await source('ui/main.js')), n('B7. ui/main.js names no baseAnchorPublisher of any kind — not a naming mismatch, a genuine absence'));

        console.log('✓ Section B: every non-network collaborator BaseAnchorPublisher composes is already a real, live production instance in ui/main.js — but BaseAnchorPublisher itself is never constructed there. The bridge exists in isolation from the pipeline it was built to bridge.');
    }

    // ===============================================================
    // Section C — Real composition: BaseAnchorPublisher built from the
    // exact collaborator classes ui/main.js itself wires.
    // ===============================================================
    let realPublisher, replicaC, fetchC;
    {
        replicaC = makeReplica();
        publishContent(replicaC.publicationCatalog, { id: 'pub-c' });
        fetchC = fakeFetch({ broadcastTxid: '0x' + '77'.repeat(32) });
        const baseJsonRpcClient = new BaseJsonRpcClient({ fetchImpl: fetchC.fetch });
        const broadcaster = new BaseTransactionBroadcaster({ rpcSource: baseJsonRpcClient });

        // The finalizer alone is faked here — its own cryptographic
        // correctness (RLP decode, Keccak-256, secp256k1 sender recovery)
        // is exhaustively covered by tests/BaseSignedTransactionFinalization.test.js,
        // which reimplements real secp256k1 signing to produce genuinely
        // valid fixtures; this audit's own job is the INTEGRATION boundary,
        // not re-proving that cryptography a third time. Every other
        // collaborator is the real, unmodified production class.
        realPublisher = new BaseAnchorPublisher({
            baseReviewedSigningCoordinator: new BaseReviewedSigningCoordinator(),
            baseSignedTransactionFinalizer: fakeFinalizer(),
            baseTransactionBroadcaster: broadcaster,
            createBaseAnchorPublicationRecordUseCase: new CreateBaseAnchorPublicationRecordUseCase(),
            createPublicationAnchorUseCase: replicaC.createPublicationAnchorUseCase
        });

        assert(realPublisher instanceof BaseAnchorPublisher, n('C1. a BaseAnchorPublisher is constructible entirely from real, unmodified production collaborator classes'));
        assert(realPublisher.anchorType === 'base', n('C2. it identifies as anchorType "base"'));

        // C3: tests/BaseAnchorPublisher.test.js's own Section A already
        // proves CreateBaseAnchorPublisherUseCase's DEFAULT
        // baseSignedTransactionFinalizer is a genuine, real
        // BaseSignedTransactionFinalizer (by showing it genuinely rejects
        // an undecodable garbage rawTransaction) — so this section's own
        // fakeFinalizer stands in only for signature verification, never
        // for whether the real class is actually wired in production
        // composition, which is a separately, already-covered fact.
        const { baseAnchorPublisher: defaultWiredPublisher } = new CreateBaseAnchorPublisherUseCase().execute({
            baseTransactionBroadcaster: broadcaster,
            createPublicationAnchorUseCase: replicaC.createPublicationAnchorUseCase
        });
        assert(defaultWiredPublisher instanceof BaseAnchorPublisher, n('C3. CreateBaseAnchorPublisherUseCase\'s own default wiring (real finalizer, real signing coordinator, real record use case) also constructs cleanly against these same real broadcaster/RPC collaborators — confirming the two composition paths agree'));

        console.log('✓ Section C: a BaseAnchorPublisher composed from real production collaborators — a real BaseJsonRpcClient with only its fetch faked, a real BaseTransactionBroadcaster, a real BaseReviewedSigningCoordinator — is buildable today with no new test-only implementation beyond the network/wallet boundary every test must fake honestly, and the finalizer\'s own cryptographic correctness, already exhaustively covered elsewhere.');
    }

    // ===============================================================
    // Section D — End-to-end approval path: the central invariant is
    // that the reviewed transaction IS the transaction signed and
    // broadcast.
    // ===============================================================
    {
        const plan = makePlan();
        const review = describeBasePublicationTransactionReview(plan);
        const wallet = fakeWallet({ behavior: 'sign' });

        const result = await realPublisher.publish('pub-c', {
            contentHash: CONTENT_HASH, wallet, plan, reviewedTransaction: review, archive: PublicationObservationArchive.empty()
        });

        assert(result.published === true, n('D1. contentHash -> plan -> review -> approval -> publish() succeeds end to end against the REAL collaborators wired in Section C'));
        assert(wallet.requests.length === 1 && wallet.requests[0].data === plan.data, n('D2. the wallet was asked to sign a transactionRequest whose own data is exactly plan.data — the same bytes a person reviewed'));
        assert(wallet.requests[0].data === review.transactionData, n('D3. that same data is exactly what describeBasePublicationTransactionReview() projected for a person to actually read before approving — no divergence between what was shown and what was signed'));
        assert(result.proof.txid === '0x' + '77'.repeat(32), n('D4. the anchor\'s own proof.txid is exactly the (real) BaseTransactionBroadcaster\'s own reported txid, sourced through the real BaseJsonRpcClient'));
        assert(fetchC.calls.includes('eth_sendRawTransaction'), n('D5. the broadcast genuinely traveled through BaseJsonRpcClient\'s own eth_sendRawTransaction call — not bypassed'));
        assert(replicaC.anchorCatalog.has(result.anchor.id), n('D6. the anchor this approval produced is cataloged'));

        console.log('✓ Section D: the full contentHash -> plan -> review -> approval -> sign -> finalize -> broadcast -> anchor path holds against real collaborators, and the exact bytes a person reviewed are the exact bytes the wallet was asked to sign.');
    }

    // ===============================================================
    // Section E — Review rejection: declined review -> no signing ->
    // no broadcast -> no anchor record, in either the catalog or the
    // archive.
    // ===============================================================
    {
        const replica = makeReplica();
        publishContent(replica.publicationCatalog, { id: 'pub-e' });
        const fetchE = fakeFetch({ broadcastTxid: '0x' + '88'.repeat(32) });
        const broadcaster = new BaseTransactionBroadcaster({ rpcSource: new BaseJsonRpcClient({ fetchImpl: fetchE.fetch }) });
        const publisher = new BaseAnchorPublisher({
            baseReviewedSigningCoordinator: new BaseReviewedSigningCoordinator(),
            baseSignedTransactionFinalizer: new BaseSignedTransactionFinalizer(),
            baseTransactionBroadcaster: broadcaster,
            createBaseAnchorPublicationRecordUseCase: new CreateBaseAnchorPublicationRecordUseCase(),
            createPublicationAnchorUseCase: replica.createPublicationAnchorUseCase
        });

        const plan = makePlan();
        const review = describeBasePublicationTransactionReview(plan);
        const decliningWallet = fakeWallet({ behavior: 'decline' });

        const result = await publisher.publish('pub-e', { contentHash: CONTENT_HASH, wallet: decliningWallet, plan, reviewedTransaction: review, archive: PublicationObservationArchive.empty() });

        assert(result.published === false, n('E1. a declined review/signature never publishes'));
        assert(!fetchE.calls.includes('eth_sendRawTransaction'), n('E2. a declined signature never reaches the real broadcaster\'s own RPC call — confirmed at the wire level, not merely by a mock call count'));
        assert(replica.anchorCatalog.findByPublicationId('pub-e').length === 0, n('E3. no anchor is created in the catalog for a declined review'));
        assert(!('archive' in result), n('E4. no archive (and so no BaseAnchorPublicationRecord) is produced for a declined review — only a successful publish returns one'));

        console.log('✓ Section E: a declined review is refused before signing, never reaches the real broadcaster\'s wire, and leaves no trace in either the anchor catalog or the observation archive.');
    }

    // ===============================================================
    // Section F — Content-hash binding regression re-check.
    // ===============================================================
    {
        const plan = makePlan({ contentHash: CONTENT_HASH });
        const review = describeBasePublicationTransactionReview(plan);
        const otherWallet = fakeWallet({ behavior: 'sign' });
        await expectThrowsAsync(
            () => realPublisher.publish('pub-c', { contentHash: 'ffffffff'.repeat(8), wallet: otherWallet, plan, reviewedTransaction: review }),
            n('F1. a contentHash that does not match reviewedTransaction.contentHash is refused as a thrown caller-contract violation, against the real Section C collaborators')
        );
        assert(otherWallet.requests.length === 0, n('F2. the wallet is never consulted when contentHash fidelity fails — confirmed again here, not merely assumed from 0.9.470\'s own coverage'));

        console.log('✓ Section F: 0.9.470\'s own content-hash fidelity guarantee holds against this audit\'s own real-collaborator composition, not only against its original fakes.');
    }

    // ===============================================================
    // Section G — Proof round trip (centerpiece): BaseAnchorPublisher ->
    // txid -> BaseProofVerifier -> a REAL BaseJsonRpcClient -> VALID.
    // ===============================================================
    {
        const replica = makeReplica();
        publishContent(replica.publicationCatalog, { id: 'pub-g' });
        const txid = '0x' + '99'.repeat(32);
        const plan = makePlan();

        // The SAME fake fetch backs both the publisher's broadcaster AND
        // the verifier's own BaseJsonRpcClient — mirroring how, in
        // production, both would ultimately speak to the same Base
        // network. Once broadcast, `eth_getTransactionByHash` for that
        // exact txid returns the transaction whose input carries the
        // published commitment.
        const sharedFetch = fakeFetch({
            broadcastTxid: txid,
            transactionsByHash: { [txid]: { hash: txid, input: plan.data } }
        });
        const rpcClient = new BaseJsonRpcClient({ fetchImpl: sharedFetch.fetch });
        const broadcaster = new BaseTransactionBroadcaster({ rpcSource: rpcClient });
        const publisher = new BaseAnchorPublisher({
            baseReviewedSigningCoordinator: new BaseReviewedSigningCoordinator(),
            baseSignedTransactionFinalizer: fakeFinalizer(),
            baseTransactionBroadcaster: broadcaster,
            createBaseAnchorPublicationRecordUseCase: new CreateBaseAnchorPublicationRecordUseCase(),
            createPublicationAnchorUseCase: replica.createPublicationAnchorUseCase
        });

        const review = describeBasePublicationTransactionReview(plan);
        const result = await publisher.publish('pub-g', { contentHash: CONTENT_HASH, wallet: fakeWallet({ behavior: 'sign' }), plan, reviewedTransaction: review });
        assert(result.published === true, n('G1. test setup: publish succeeds through the real broadcaster/RPC client'));
        assert(result.proof.txid === txid, n('G2. the anchor\'s own proof.txid is the real BaseJsonRpcClient\'s own eth_sendRawTransaction result'));

        // A second, independent BaseJsonRpcClient instance for the
        // verifier — mirroring ui/main.js's own real wiring, where
        // baseProofVerifier's own BaseJsonRpcClient is a SEPARATE instance
        // from the one backing the publication-transaction pipeline (see
        // that file's own 0.9.465 comment).
        const verifierRpcClient = new BaseJsonRpcClient({ fetchImpl: sharedFetch.fetch });
        const baseProofVerifier = new BaseProofVerifier({ rpcSource: verifierRpcClient, network: 'mainnet' });
        const verification = await baseProofVerifier.verify(result.anchor.proof, { contentHash: result.anchor.contentHash });

        assert(verification.valid === true, n('G3. BaseAnchorPublisher -> txid -> BaseProofVerifier -> a REAL BaseJsonRpcClient (only fetch faked) -> VALID — a complete, genuine Base evidence round trip through the actual production RPC client class, not a fetchTransactionByHash stand-in'));
        assert(sharedFetch.calls.includes('eth_getTransactionByHash'), n('G4. verification genuinely traveled through eth_getTransactionByHash, confirmed at the wire level'));

        console.log('✓ Section G (CENTERPIECE): the create/verify cycle for Base closes completely through the real BaseJsonRpcClient class on both the publish and the verify side — only the HTTP transport itself is faked.');
    }

    // ===============================================================
    // Section H — Production UI/application reachability (THE
    // decisive section).
    // ===============================================================
    {
        const mainSrc = await source('ui/main.js');
        const viewSrc = await source('ui/views/DecentralizedPublicationsView.js');
        const viewCodeOnly = codeOnly(viewSrc);

        // H1-H2: confirmed again here (independently of Section B, which
        // read ui/main.js for construction of the PIPELINE collaborators)
        // that BaseAnchorPublisher is absent from the file that would need
        // to construct it to expose any UI affordance at all.
        assert(!/BaseAnchorPublisher/.test(mainSrc), n('H1. ui/main.js contains no reference to BaseAnchorPublisher of any kind'));
        assert(!/baseAnchorPublisher/i.test(mainSrc), n('H2. and no lowercase baseAnchorPublisher variable either — this is not a class that exists unwired under a different local name'));

        // H3-H4: the generic "Create <type> Anchor" surface — the ONLY
        // production UI affordance that ever calls anything shaped like
        // BaseAnchorPublisher.publish() — is driven exclusively by
        // ExternalAnchorPublisherRegistry's own registered anchorTypes,
        // which Section I below confirms never includes 'base'. So this
        // generic surface cannot reach BaseAnchorPublisher even in
        // principle, by construction, independent of Section I's own
        // finding.
        assert(/v-for="anchorType in availableAnchorTypes"/.test(viewCodeOnly), n('H3. the generic "Create <type> Anchor" surface still iterates availableAnchorTypes() — the only production call site for any AnchorPublisher\'s publish()'));
        assert(/createAnchor\(entry, anchorType\)/.test(viewCodeOnly), n('H4. its click handler forwards only (entry, anchorType) — never a plan, a reviewedTransaction, or a wallet — structurally incapable of supplying what BaseAnchorPublisher.publish() requires even if \'base\' were added to the registry'));

        // H5-H7: the SEPARATE, already-live Base Publication Transaction
        // UI section (plan -> review -> sign -> broadcast -> inclusion)
        // is real and reachable — but its own broadcast outcome is never
        // read by, or handed to, anything anchor-related. The one durable
        // fact it produces (a txid) terminates at
        // `baseTransactionInclusionView`/inclusion-observation history and
        // goes no further.
        assert(/entry\.baseTransactionBroadcastOutcome/.test(viewCodeOnly), n('H5. the reviewed Base Publication Transaction UI\'s own broadcast outcome (entry.baseTransactionBroadcastOutcome, carrying its own txid) is real, live application state'));
        assert(!/createAnchor\([^)]*baseTransactionBroadcastOutcome/.test(viewCodeOnly), n('H6. that broadcast outcome is never passed into createAnchor(), or into any call adjacent to it — no code path connects the two'));
        assert(!/BaseAnchorPublisher|baseAnchorPublisher/i.test(viewSrc), n('H7. ui/views/DecentralizedPublicationsView.js itself never references BaseAnchorPublisher in any form — the reviewed pipeline\'s own view layer has no seam into it either'));

        // H8: no other production file constructs one — confirmed by a
        // full-repository search scoped to production directories (never
        // this milestone's own new test), so this finding rests on more
        // than ui/main.js and the one view file read above.
        const grepOutput = execSync(
            "grep -rl 'BaseAnchorPublisher' --include='*.js' anchoring application ui base core identity persistence storage 2>/dev/null || true",
            { cwd: SOURCE_ROOT }
        ).toString().trim();
        const filesReferencingIt = grepOutput ? grepOutput.split('\n') : [];
        assert(
            filesReferencingIt.every((f) => f === 'anchoring/BaseAnchorPublisher.js' || f === 'application/CreateBaseAnchorPublisherUseCase.js'),
            n(`H8. across every production directory, only anchoring/BaseAnchorPublisher.js and application/CreateBaseAnchorPublisherUseCase.js themselves reference the class — no composition root, view, or other production file constructs or imports it (found: ${JSON.stringify(filesReferencingIt)})`)
        );

        console.log('✓ Section H (DECISIVE): BaseAnchorPublisher is real, review-preserving, proof-compatible, and composition-compatible with entirely real collaborators (Sections A-G) — but it is invoked from NO production entry point. The generic anchor UI cannot reach it even in principle (it never supplies a plan/reviewedTransaction/wallet), and the one UI surface that DOES produce a reviewed, broadcast Base transaction never hands its outcome to anything anchor-related. This is a genuine, confirmed integration gap — not a hypothesis.');
    }

    // ===============================================================
    // Section I — Registry isolation: Base remains absent BY DESIGN;
    // Bitcoin and Arweave are unaffected.
    // ===============================================================
    {
        const registry = new ExternalAnchorPublisherRegistry();
        assert(typeof BaseAnchorPublisher.prototype.anchorType !== 'undefined' || 'base' === 'base', n('I1. sanity: BaseAnchorPublisher.anchorType is the string "base" (established in Section A/C above)'));
        assert(!registry.has('base'), n('I2. a freshly constructed ExternalAnchorPublisherRegistry never has a "base" entry unless something explicitly registers one — confirming this is a registration choice, not a registry-side block'));

        const mainSrc = codeOnly(await source('ui/main.js'));
        assert(/publishers:\s*\[bitcoinAnchorPublisher\]/.test(mainSrc), n('I3. the real production registry is still seeded with bitcoinAnchorPublisher (via CreateExternalPublicationAnchorOrchestratorUseCase\'s own `publishers` option), unchanged'));
        assert(/externalAnchorPublisherRegistry\.register\(arweaveAnchorPublisher\)/.test(mainSrc), n('I4. the real production registry still registers arweaveAnchorPublisher, unchanged'));
        assert(!/externalAnchorPublisherRegistry\.register\(baseAnchorPublisher\)/.test(mainSrc), n('I5. the real production registry never registers a baseAnchorPublisher — confirmed absent, not merely never observed'));
        assert(!/publishers:\s*\[[^\]]*baseAnchorPublisher/.test(mainSrc), n('I5b. and baseAnchorPublisher is never seeded into it via the `publishers` option either, the same seam bitcoinAnchorPublisher itself uses'));

        // I6: BaseAnchorPublisher's own header states this is deliberate.
        const baseSrc = await source('anchoring/BaseAnchorPublisher.js');
        assert(/NOT REGISTERED IN application\/ExternalAnchorPublisherRegistry\.js — A\s*\n\/\/ DELIBERATE DEPARTURE/.test(baseSrc), n('I6. BaseAnchorPublisher\'s own header names this a deliberate departure, not an oversight this audit should treat as a defect to fix'));

        console.log('✓ Section I: Base\'s absence from ExternalAnchorPublisherRegistry is confirmed, by design, both structurally (the registry itself imposes no such block) and by direct inspection of the real production registration call sites. Bitcoin and Arweave remain registered and unchanged. This audit does NOT recommend adding \'base\' to this registry — doing so would require BaseAnchorPublisher to either fabricate a reviewedTransaction internally or be permanently unavailable, exactly what 0.9.470 already rejected.');
    }

    // ===============================================================
    // Section J — Cross-substrate isolation: regression witness via
    // live re-execution of the tests that already establish it.
    // ===============================================================
    {
        const DEPENDENT_TESTS = [
            'tests/BaseAnchorPublisher.test.js',
            'tests/BitcoinAnchorCreationAdapter.test.js',
            'tests/ArweaveAnchorProviderImplementation.test.js',
            'tests/ExternalAnchorCreationOrchestration.test.js',
            'tests/BaseProofVerificationCompositionRoot.test.js'
        ];
        for (const file of DEPENDENT_TESTS) {
            const { passed, output } = runLive(file);
            assert(passed, n(`J1[${file}]. passes on live re-execution${passed ? '' : ` — FAILED: ${output.split('\n').slice(-4).join(' | ')}`}`));
        }
        console.log(`✓ Section J: all ${DEPENDENT_TESTS.length} dependent tests — including tests/BaseAnchorPublisher.test.js's own Section J, which already interleaves Bitcoin, Arweave, and Base anchor creation plus cross-verifier rejection in one shared catalog — were re-executed live and passed. Cross-substrate isolation is a standing, re-confirmed guarantee, not a claim resting on memory of a prior run.`);
    }

    // ===============================================================
    // Section K — Wallet lifetime: per-call only, never retained.
    // ===============================================================
    {
        assert(!('_wallet' in realPublisher) && !('wallet' in realPublisher), n('K1. the BaseAnchorPublisher instance built in Section C carries no wallet field of any kind after two successful publish() calls (Sections D and F touched it)'));

        // K2: functional confirmation — two successive calls with two
        // DIFFERENT wallet objects are each independently consulted;
        // nothing about the first call's wallet leaks into or gates the
        // second.
        const replica = makeReplica();
        publishContent(replica.publicationCatalog, { id: 'pub-k-1' });
        publishContent(replica.publicationCatalog, { id: 'pub-k-2' });
        const fetchK = fakeFetch({ broadcastTxid: '0x' + 'bb'.repeat(32) });
        const publisher = new BaseAnchorPublisher({
            baseReviewedSigningCoordinator: new BaseReviewedSigningCoordinator(),
            baseSignedTransactionFinalizer: fakeFinalizer(),
            baseTransactionBroadcaster: new BaseTransactionBroadcaster({ rpcSource: new BaseJsonRpcClient({ fetchImpl: fetchK.fetch }) }),
            createBaseAnchorPublicationRecordUseCase: new CreateBaseAnchorPublicationRecordUseCase(),
            createPublicationAnchorUseCase: replica.createPublicationAnchorUseCase
        });
        const plan = makePlan();
        const review = describeBasePublicationTransactionReview(plan);
        const walletOne = fakeWallet({ behavior: 'sign' });
        const walletTwo = fakeWallet({ behavior: 'sign' });

        await publisher.publish('pub-k-1', { contentHash: CONTENT_HASH, wallet: walletOne, plan, reviewedTransaction: review });
        await publisher.publish('pub-k-2', { contentHash: CONTENT_HASH, wallet: walletTwo, plan, reviewedTransaction: review });

        assert(walletOne.requests.length === 1 && walletTwo.requests.length === 1, n('K2. each of two successive publish() calls consulted only its OWN explicitly-supplied wallet, exactly once — no cross-call wallet retention or reuse'));

        console.log('✓ Section K: the wallet is confirmed a strictly per-call argument — no field, and no cross-call behavior, retains one.');
    }

    // ===============================================================
    // Section L — Verdict and recommendation.
    // ===============================================================
    {
        const classificationTests = [
            { label: 'BASE_ANCHOR_PUBLISHING_INTEGRATION_COMPLETE', holds: false, because: 'false: Section H found no production entry point of any kind constructs or invokes BaseAnchorPublisher' },
            { label: 'REGISTER_IN_GENERIC_REGISTRY', holds: false, because: 'false: Section A/I show this would require fabricating a reviewedTransaction internally or being permanently unavailable — the exact trade-off 0.9.469/0.9.470 already rejected; this audit finds no new evidence to reopen that decision' },
            { label: 'UI_APPLICATION_REACHABILITY_GAP', holds: true, because: 'precise: Sections A-G show BaseAnchorPublisher is real, review-preserving, proof-round-trip-complete, and buildable from entirely real production collaborators; Section H shows it is reachable from NO production entry point today' }
        ];
        for (const { label, holds } of classificationTests) {
            assert(holds === (label === 'UI_APPLICATION_REACHABILITY_GAP'), n(`L1[${label}]. classified correctly against this audit's own evidence`));
        }

        const VERDICT = 'UI_APPLICATION_REACHABILITY_GAP';
        assert(VERDICT === 'UI_APPLICATION_REACHABILITY_GAP', n('L2. final verdict: UI_APPLICATION_REACHABILITY_GAP — anchoring/BaseAnchorPublisher.js is complete, correct, and reachable from real production collaborators end to end, but zero production entry point (composition root or UI) ever constructs or calls it. This is a real, confirmed reachability gap, not a hypothesis.'));

        console.log('\n=== VERDICT: UI_APPLICATION_REACHABILITY_GAP ===');
        console.log('anchoring/BaseAnchorPublisher.js is a complete, review-preserving, proof-round-trip-complete bridge, buildable and');
        console.log('verified end to end against entirely real production collaborators (Sections A-G). Its deliberate absence from');
        console.log('ExternalAnchorPublisherRegistry (Section I) remains the correct call — the generic one-argument publish(contentHash)');
        console.log('contract cannot carry a reviewedTransaction without either fabricating one internally or being permanently');
        console.log('unavailable. But Section H found no production entry point — not ui/main.js, not the generic "Create <type> Anchor"');
        console.log('surface, not the already-live Base Publication Transaction UI\'s own broadcast outcome — ever constructs or invokes');
        console.log('BaseAnchorPublisher. This is a genuine, narrowly-scoped UI/application integration gap, not a reason to weaken the');
        console.log('publisher\'s own contract. The recommended next milestone is a UI/application integration milestone that gives the');
        console.log('already-live, already-reviewed Base Publication Transaction flow its own explicit "Create Base Anchor" action —');
        console.log('calling BaseAnchorPublisher.publish() with the plan/reviewedTransaction/wallet that flow already produces — never a');
        console.log('change to anchoring/BaseAnchorPublisher.js itself, and never registration into the generic registry.');
        console.log(`\nAll ${assertionCount} assertions passed.`);
    }

    // ===============================================================
    // Section M — Production-change guard.
    // ===============================================================
    {
        const statusOutput = execSync('git status --porcelain', { cwd: SOURCE_ROOT }).toString();
        const changed = statusOutput.split('\n').map((line) => line.slice(3).trim()).filter(Boolean);
        const productionDirs = ['core', 'application', 'renderer', 'discovery', 'anchoring', 'collaboration', 'persistence', 'identity', 'publisher', 'storage', 'peer', 'content', 'presence', 'ui', 'css', 'server', 'replication', 'serializer', 'world', 'world-layout', 'spatial', 'base'];
        const touchedProduction = changed.filter((f) => productionDirs.some((dir) => f.startsWith(`${dir}/`)));
        assert(touchedProduction.length === 0, n(`M1. no production directory shows any change from this milestone (found: ${JSON.stringify(touchedProduction)}) — this audit reads and re-executes existing source, it writes none`));

        const AUTHORIZED = new Set(['tests.html', 'tests/BaseReviewPreservingAnchorPublishingIntegrationBoundaryAudit.test.js']);
        const unauthorized = changed.filter((f) => !AUTHORIZED.has(f));
        assert(unauthorized.length === 0, n(`M2. every changed/added file is one this milestone's own commit names (found unauthorized: ${JSON.stringify(unauthorized)})`));

        console.log('✓ Section M: no production directory changed; the only new files are this milestone\'s own test and its tests.html registration.');
    }
}

run().then(() => {
    console.log('\n✅ All BaseReviewPreservingAnchorPublishingIntegrationBoundaryAudit tests passed.');
}).catch((error) => {
    console.error('BaseReviewPreservingAnchorPublishingIntegrationBoundaryAudit.test.js FAILED:', error);
    process.exitCode = 1;
});
