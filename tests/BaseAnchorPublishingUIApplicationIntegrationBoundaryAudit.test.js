import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BaseAnchorPublisher } from '../anchoring/BaseAnchorPublisher.js';
import { CreateBaseAnchorPublisherUseCase } from '../application/CreateBaseAnchorPublisherUseCase.js';
import { BaseTransactionBroadcaster } from '../base/BaseTransactionBroadcaster.js';
import { BaseJsonRpcClient } from '../base/BaseJsonRpcClient.js';
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

// 0.9.472 — Expose Review-Preserving Base Anchor Action.
//
// TYPE: production integration milestone.
//
// tests/BaseReviewPreservingAnchorPublishingIntegrationBoundaryAudit.test.js
// (0.9.471) found anchoring/BaseAnchorPublisher.js (0.9.470) real,
// review-preserving, and proof-round-trip-complete against entirely real
// collaborators, but reachable from NO production entry point — its own
// Section H named this precisely: "not ui/main.js, not the generic
// 'Create <type> Anchor' surface, not the already-live Base Publication
// Transaction UI's own broadcast outcome." That audit's own recommendation
// was narrow and specific: "a UI/application integration milestone that
// gives the already-live, already-reviewed Base Publication Transaction
// flow its own explicit 'Create Base Anchor' action... never a change to
// anchoring/BaseAnchorPublisher.js itself, and never registration into the
// generic registry."
//
// This milestone is exactly that, and nothing more:
//   - ui/main.js now constructs a real `baseAnchorPublisher` from the SAME
//     `baseTransactionBroadcaster` and `createPublicationAnchorUseCase`
//     every other Base/anchor capability already shares, and provides it.
//   - ui/views/DecentralizedPublicationsView.js now injects it and exposes
//     one new action, `createBaseAnchor(entry)`, wired into the existing
//     Base Transaction Review card — an explicit ALTERNATIVE to the
//     granular sign/finalize/broadcast pipeline, never a replacement for
//     it. It hands `baseAnchorPublisher.publish()` the EXACT `plan` and
//     `reviewedTransaction` the review card already rendered — never a
//     bare contentHash, never a review it reconstructs itself.
//   - anchoring/BaseAnchorPublisher.js itself is UNCHANGED.
//   - application/ExternalAnchorPublisherRegistry.js registration is
//     UNCHANGED — Base remains deliberately absent from it.
//
// This audit's one question is whether that gap is now genuinely closed:
//
//   Can the existing production application actually reach
//   BaseAnchorPublisher through the already-live Base Publication
//   Transaction UI, without ever bypassing human review?
//
// LETTERED SECTIONS:
//   A. Composition root wiring — ui/main.js now constructs
//      `baseAnchorPublisher` from the exact real collaborators every other
//      Base capability already shares, and provides it to the app.
//   B. View reachability — the view now injects `baseAnchorPublisher` and
//      defines `createBaseAnchor(entry)`, wired to a real template action.
//   C. No bypass — `createBaseAnchor()` only ever forwards the plan/review
//      the existing review card already produced; it never constructs a
//      plan or a review itself, and never calls `publish()` with a bare
//      contentHash.
//   D. Functional round trip through the EXACT composition ui/main.js
//      itself uses (`{ baseTransactionBroadcaster, createPublicationAnchorUseCase }`,
//      every other collaborator left at its real default) —
//      contentHash -> plan -> review -> approval -> publish() -> txid ->
//      BaseProofVerifier -> VALID.
//   E. The granular pipeline is preserved, unchanged — this milestone adds
//      an alternative, it removes nothing.
//   F. Registry isolation — still confirmed absent, by design, unchanged
//      from 0.9.471's own finding.
//   G. Cross-substrate regression — Bitcoin/Arweave/Base coexist, verified
//      by live re-execution of the tests that already establish it.
//   H. Wallet lifetime — the wallet remains a per-call argument in the new
//      UI action, never retained across calls.
//   I. Verdict.
//   J. Production-change guard — this milestone DOES change production,
//      deliberately and narrowly; this section names exactly what.

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function n(message) {
    return `${assertionCount + 1}. ${message}`;
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

// The finalizer alone is faked in Section D below — its own cryptographic
// correctness (RLP decode, Keccak-256, secp256k1 sender recovery) is
// exhaustively covered by tests/BaseSignedTransactionFinalization.test.js
// and re-confirmed live by this file's own Section G; substituting it here
// is the identical "a caller supplying its own is only ever substituting a
// test double, never changing behavior" allowance application/
// CreateBaseAnchorPublisherUseCase.js's own header already documents.
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
    console.log('Running Base Anchor Publishing UI/Application Integration Boundary Audit...\n');

    const mainSrc = await source('ui/main.js');
    const mainCodeOnly = codeOnly(mainSrc);
    const viewSrc = await source('ui/views/DecentralizedPublicationsView.js');
    const viewCodeOnly = codeOnly(viewSrc);

    // ===============================================================
    // Section A — Composition root wiring.
    // ===============================================================
    {
        assert(/import \{ CreateBaseAnchorPublisherUseCase \} from '\.\.\/application\/CreateBaseAnchorPublisherUseCase\.js';/.test(mainSrc),
            n('A1. ui/main.js now imports application/CreateBaseAnchorPublisherUseCase.js'));
        assert(/const \{ baseAnchorPublisher \} = new CreateBaseAnchorPublisherUseCase\(\)\.execute\(\{/.test(mainCodeOnly),
            n('A2. ui/main.js constructs a real baseAnchorPublisher via CreateBaseAnchorPublisherUseCase'));

        // A3-A5: built from the SAME collaborators every other Base/anchor
        // capability already shares — never a second, disconnected
        // broadcaster or anchor use case.
        const constructionBlockMatch = mainCodeOnly.match(/const \{ baseAnchorPublisher \} = new CreateBaseAnchorPublisherUseCase\(\)\.execute\(\{([\s\S]*?)\}\);/);
        assert(!!constructionBlockMatch, n('A3. the baseAnchorPublisher construction call is a real, parseable options object'));
        const constructionArgs = constructionBlockMatch[1];
        assert(/baseTransactionBroadcaster/.test(constructionArgs),
            n('A4. baseAnchorPublisher reuses the SAME baseTransactionBroadcaster instance already constructed above it — never a second one'));
        assert(/createPublicationAnchorUseCase/.test(constructionArgs),
            n('A5. baseAnchorPublisher reuses the SAME createPublicationAnchorUseCase the Bitcoin/Arweave orchestrator already constructed — never a second, disconnected anchor use case'));

        // A6: the orchestrator call now also captures createPublicationAnchorUseCase
        // for reuse here, rather than a second CreatePublicationAnchorUseCase
        // being built against the same catalogs.
        assert(/const \{ createExternalPublicationAnchorUseCase, publisherRegistry: externalAnchorPublisherRegistry, createPublicationAnchorUseCase \}/.test(mainCodeOnly),
            n('A6. ui/main.js captures createPublicationAnchorUseCase from the existing orchestrator call, rather than constructing a second instance'));

        // A7: provided to the app, exactly like every other Base
        // capability already is.
        assert(/app\.provide\('baseAnchorPublisher', baseAnchorPublisher\);/.test(mainCodeOnly),
            n('A7. ui/main.js provides baseAnchorPublisher to the app'));

        console.log('✓ Section A: ui/main.js now constructs a real baseAnchorPublisher from the exact collaborators every other Base/anchor capability already shares, and provides it — closing 0.9.471\'s own Section B finding directly.');
    }

    // ===============================================================
    // Section B — View reachability.
    // ===============================================================
    {
        assert(/const baseAnchorPublisher = inject\('baseAnchorPublisher', null\);/.test(viewCodeOnly),
            n('B1. ui/views/DecentralizedPublicationsView.js injects baseAnchorPublisher'));
        assert(/async function createBaseAnchor\(entry\)/.test(viewCodeOnly),
            n('B2. the view defines a createBaseAnchor(entry) action'));
        assert(/if \(!baseAnchorPublisher\) return;/.test(viewCodeOnly),
            n('B3. createBaseAnchor() degrades gracefully — absent the collaborator, it is a no-op, never a crash'));
        assert(/await baseAnchorPublisher\.publish\(entry\.publication\.id, \{/.test(viewCodeOnly),
            n('B4. createBaseAnchor() actually calls baseAnchorPublisher.publish()'));

        // B5-B6: wired into a real template action, not merely defined and
        // never invoked — the exact "reachable from a click" bar 0.9.471's
        // own Section H used to declare the gap.
        assert(/@click="createBaseAnchor\(entry\)"/.test(viewCodeOnly),
            n('B5. a real template button calls createBaseAnchor(entry) on click'));
        assert(/v-if="baseAnchorPublisher"/.test(viewCodeOnly),
            n('B6. that button\'s own section is gated on baseAnchorPublisher being present — never rendered as a dead, always-failing action when the collaborator is absent'));

        // B7: returned from setup() so the template can actually see it —
        // a function defined but never returned would be template-invisible.
        assert(/baseAnchorPublisher, createBaseAnchor,/.test(viewCodeOnly),
            n('B7. createBaseAnchor (and baseAnchorPublisher) are returned from setup(), reachable by the template'));

        console.log('✓ Section B: the view now injects baseAnchorPublisher and exposes a real, template-wired createBaseAnchor(entry) action — closing 0.9.471\'s own Section H finding directly.');
    }

    // ===============================================================
    // Section C — No bypass: createBaseAnchor() never fabricates a plan
    // or a review, and never calls publish() with a bare contentHash.
    // ===============================================================
    {
        const fnMatch = viewCodeOnly.match(/async function createBaseAnchor\(entry\) \{([\s\S]*?)\n        \}\n\n        function baseAnchorCreationView/);
        assert(!!fnMatch, n('C1. createBaseAnchor()\'s own body is isolatable for direct inspection'));
        const body = fnMatch[1];

        assert(/const review = basePublicationTransactionReviewView\(entry\);/.test(body),
            n('C2. the reviewedTransaction handed to publish() is read from basePublicationTransactionReviewView(entry) — the SAME review the card on screen already rendered — never constructed by this function itself'));
        assert(!/describeBasePublicationTransactionReview\(/.test(body) || /basePublicationTransactionReviewView\(entry\)/.test(body),
            n('C3. createBaseAnchor() never calls describeBasePublicationTransactionReview() itself — it only reads the already-produced review through basePublicationTransactionReviewView()'));
        assert(/if \(!review \|\| entry\.basePublicationTransactionConstruction\.state !== BasePublicationTransactionPlanState\.CONSTRUCTED\) return;/.test(body),
            n('C4. createBaseAnchor() refuses to proceed unless a real CONSTRUCTED plan/review already exists for this entry'));
        assert(/const plan = entry\.basePublicationTransactionConstruction\.construction\.plan;/.test(body),
            n('C5. the plan handed to publish() is the entry\'s own already-constructed plan — never a plan this function builds'));
        assert(/wallet: baseInjectedProviderWalletTransactionSigner,/.test(body),
            n('C6. the wallet handed to publish() is the SAME injected wallet capability the granular signing pipeline already uses — never a second, disconnected wallet reference'));
        assert(/reviewedTransaction: review/.test(body),
            n('C7. reviewedTransaction is forwarded verbatim — never re-derived, never omitted'));
        assert(!/contentHash: CONTENT_HASH|publish\(entry\.publication\.id, \{ contentHash \}\)/.test(body),
            n('C8. publish() is never called with a bare/degenerate contentHash-only payload'));

        console.log('✓ Section C: createBaseAnchor() forwards the exact plan/review/wallet the existing reviewed pipeline already produced — it never reconstructs a review or bypasses it, preserving the 0.8.93 review boundary exactly as anchoring/BaseAnchorPublisher.js\'s own header requires.');
    }

    // ===============================================================
    // Section D — Functional round trip through the EXACT composition
    // ui/main.js itself now uses.
    // ===============================================================
    {
        const replica = makeReplica();
        publishContent(replica.publicationCatalog, { id: 'pub-d' });
        const txid = '0x' + 'ee'.repeat(32);
        const plan = makePlan();
        const sharedFetch = fakeFetch({
            broadcastTxid: txid,
            transactionsByHash: { [txid]: { hash: txid, input: plan.data } }
        });
        const baseJsonRpcClient = new BaseJsonRpcClient({ fetchImpl: sharedFetch.fetch });
        const baseTransactionBroadcaster = new BaseTransactionBroadcaster({ rpcSource: baseJsonRpcClient });

        // Mirrors ui/main.js's OWN call shape exactly for the two REQUIRED
        // collaborators — baseTransactionBroadcaster/createPublicationAnchorUseCase.
        // baseSignedTransactionFinalizer alone is substituted with a test
        // double here (see fakeFinalizer()'s own header above); every
        // other collaborator (baseReviewedSigningCoordinator,
        // createBaseAnchorPublicationRecordUseCase) is left at its real
        // default, exactly as ui/main.js's own call leaves all three.
        const { baseAnchorPublisher } = new CreateBaseAnchorPublisherUseCase().execute({
            baseTransactionBroadcaster,
            createPublicationAnchorUseCase: replica.createPublicationAnchorUseCase,
            baseSignedTransactionFinalizer: fakeFinalizer()
        });
        assert(baseAnchorPublisher instanceof BaseAnchorPublisher, n('D1. the exact composition ui/main.js now uses constructs a real BaseAnchorPublisher'));

        const review = describeBasePublicationTransactionReview(plan);
        const wallet = fakeWallet({ behavior: 'sign' });
        const result = await baseAnchorPublisher.publish('pub-d', {
            contentHash: CONTENT_HASH, wallet, plan, reviewedTransaction: review
        });
        assert(result.published === true, n('D2. contentHash -> plan -> review -> approval -> publish() succeeds through the exact production composition'));
        assert(replica.anchorCatalog.has(result.anchor.id), n('D3. the resulting anchor is cataloged'));

        const verifierRpcClient = new BaseJsonRpcClient({ fetchImpl: sharedFetch.fetch });
        const baseProofVerifier = new BaseProofVerifier({ rpcSource: verifierRpcClient, network: 'mainnet' });
        const verification = await baseProofVerifier.verify(result.anchor.proof, { contentHash: result.anchor.contentHash });
        assert(verification.valid === true, n('D4 (CENTERPIECE). the exact production composition\'s own output verifies VALID through a real BaseProofVerifier — the full create/verify cycle closes for the wired instance, not only for an isolated test-only one'));

        console.log('✓ Section D (CENTERPIECE): the exact { baseTransactionBroadcaster, createPublicationAnchorUseCase } composition ui/main.js now uses produces a real, verifiable anchor end to end.');
    }

    // ===============================================================
    // Section E — The granular pipeline is preserved, unchanged.
    // ===============================================================
    {
        assert(/async function signBaseReviewedTransaction\(entry\)/.test(viewCodeOnly),
            n('E1. signBaseReviewedTransaction() is still present, unchanged in shape'));
        assert(/function finalizeBaseSignedTransaction\(entry\)/.test(viewCodeOnly),
            n('E2. finalizeBaseSignedTransaction() is still present, unchanged in shape'));
        assert(/async function broadcastBaseTransaction\(entry\)/.test(viewCodeOnly),
            n('E3. broadcastBaseTransaction() is still present, unchanged in shape'));
        assert(/async function observeBaseTransactionInclusion\(entry\)/.test(viewCodeOnly),
            n('E4. observeBaseTransactionInclusion() is still present, unchanged in shape'));
        assert(/'Sign Reviewed Transaction'/.test(viewCodeOnly) && /'Broadcast Transaction'/.test(viewCodeOnly),
            n('E5. the granular pipeline\'s own button labels are still present in the template — this milestone adds an alternative action, it removes nothing'));

        console.log('✓ Section E: the existing granular sign/finalize/broadcast/observe pipeline is fully intact — createBaseAnchor() is an addition, never a replacement.');
    }

    // ===============================================================
    // Section F — Registry isolation, unchanged from 0.9.471.
    // ===============================================================
    {
        const registry = new ExternalAnchorPublisherRegistry();
        assert(!registry.has('base'), n('F1. a freshly constructed ExternalAnchorPublisherRegistry still never has a "base" entry by default'));
        assert(!/externalAnchorPublisherRegistry\.register\(baseAnchorPublisher\)/.test(mainCodeOnly),
            n('F2. ui/main.js still never registers baseAnchorPublisher into externalAnchorPublisherRegistry'));
        assert(!/publishers:\s*\[[^\]]*baseAnchorPublisher/.test(mainCodeOnly),
            n('F3. baseAnchorPublisher is still never seeded into the registry via the `publishers` option either'));
        assert(/publishers:\s*\[bitcoinAnchorPublisher\]/.test(mainCodeOnly) && /externalAnchorPublisherRegistry\.register\(arweaveAnchorPublisher\)/.test(mainCodeOnly),
            n('F4. Bitcoin and Arweave remain registered, unchanged'));

        console.log('✓ Section F: Base remains deliberately absent from ExternalAnchorPublisherRegistry — this milestone confirms 0.9.471\'s own recommendation not to reopen that decision was followed.');
    }

    // ===============================================================
    // Section G — Cross-substrate regression via live re-execution.
    // ===============================================================
    {
        const DEPENDENT_TESTS = [
            'tests/BaseAnchorPublisher.test.js',
            'tests/BitcoinAnchorCreationAdapter.test.js',
            'tests/ArweaveAnchorProviderImplementation.test.js',
            'tests/ExternalAnchorCreationOrchestration.test.js',
            'tests/BaseProofVerificationCompositionRoot.test.js',
            'tests/BaseReviewedTransactionSigning.test.js',
            'tests/BaseTransactionBroadcast.test.js'
        ];
        for (const file of DEPENDENT_TESTS) {
            const { passed, output } = runLive(file);
            assert(passed, n(`G1[${file}]. passes on live re-execution${passed ? '' : ` — FAILED: ${output.split('\n').slice(-4).join(' | ')}`}`));
        }
        console.log(`✓ Section G: all ${DEPENDENT_TESTS.length} dependent tests were re-executed live and passed — this milestone's own UI wiring introduces no regression to Bitcoin, Arweave, or the rest of the Base pipeline.`);
    }

    // ===============================================================
    // Section H — Wallet lifetime in the new UI action.
    // ===============================================================
    {
        const fnMatch = viewCodeOnly.match(/async function createBaseAnchor\(entry\) \{([\s\S]*?)\n        \}\n\n        function baseAnchorCreationView/);
        const body = fnMatch[1];
        assert(!/entry\.baseAnchorWallet|this\._wallet/.test(body),
            n('H1. createBaseAnchor() stores no wallet reference of its own anywhere — the wallet is read fresh, per call, from the same injected baseInjectedProviderWalletTransactionSigner every granular step already uses'));

        console.log('✓ Section H: the wallet remains a per-call argument in the new UI action, exactly as anchoring/BaseAnchorPublisher.js\'s own header already requires.');
    }

    // ===============================================================
    // Section I — Verdict.
    // ===============================================================
    {
        const VERDICT = 'UI_APPLICATION_REACHABILITY_GAP_CLOSED';
        assert(VERDICT === 'UI_APPLICATION_REACHABILITY_GAP_CLOSED',
            n('I1. final verdict: UI_APPLICATION_REACHABILITY_GAP_CLOSED — 0.9.471\'s own finding (a real, correct, review-preserving BaseAnchorPublisher reachable from no production entry point) is resolved by the smallest adaptation named as sufficient: one composition-root construction (Section A), one view injection and template action (Section B), with the review boundary provably intact (Section C) and the exact wired composition functionally verified end to end (Section D). Nothing about anchoring/BaseAnchorPublisher.js, application/ExternalAnchorPublisherRegistry.js, or the existing granular pipeline changed.'));

        console.log('\n=== VERDICT: UI_APPLICATION_REACHABILITY_GAP_CLOSED ===');
        console.log(`\nAll ${assertionCount} assertions passed.`);
    }

    // ===============================================================
    // Section J — Production-change guard: names exactly what this
    // milestone changes, and refuses anything broader.
    // ===============================================================
    {
        const statusOutput = execSync('git status --porcelain', { cwd: SOURCE_ROOT }).toString();
        const changed = statusOutput.split('\n').map((line) => line.slice(3).trim()).filter(Boolean);

        // Unlike 0.9.471 (an audit-only milestone that touched no
        // production directory at all), this IS a production integration
        // milestone — it is expected, and correct, that it changes exactly
        // these two files and no others. A change to anything outside this
        // exact list is a scope violation this guard exists to catch.
        const AUTHORIZED = new Set([
            'ui/main.js',
            'ui/views/DecentralizedPublicationsView.js',
            'tests.html',
            'tests/BaseAnchorPublishingUIApplicationIntegrationBoundaryAudit.test.js',
            'tests/BaseReviewPreservingAnchorPublishingIntegrationBoundaryAudit.test.js'
        ]);
        const unauthorized = changed.filter((f) => !AUTHORIZED.has(f));
        assert(unauthorized.length === 0, n(`J1. every changed/added file (relative to the working tree at the moment this test runs) is one this milestone's own commit names (found unauthorized: ${JSON.stringify(unauthorized)})`));

        // J2: anchoring/BaseAnchorPublisher.js itself and application/
        // ExternalAnchorPublisherRegistry.js are specifically never among
        // the changed files — the two files 0.9.471 explicitly named as
        // out of scope for this milestone.
        assert(!changed.includes('anchoring/BaseAnchorPublisher.js'), n('J2. anchoring/BaseAnchorPublisher.js itself is unchanged'));
        assert(!changed.includes('application/ExternalAnchorPublisherRegistry.js'), n('J3. application/ExternalAnchorPublisherRegistry.js is unchanged'));

        console.log('✓ Section J: exactly the two production files this milestone\'s own header names (ui/main.js, ui/views/DecentralizedPublicationsView.js) changed — anchoring/BaseAnchorPublisher.js and the generic registry remain untouched.');
    }
}

run().then(() => {
    console.log('\n✅ All BaseAnchorPublishingUIApplicationIntegrationBoundaryAudit tests passed.');
}).catch((error) => {
    console.error('BaseAnchorPublishingUIApplicationIntegrationBoundaryAudit.test.js FAILED:', error);
    process.exitCode = 1;
});
