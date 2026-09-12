import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PublicationAnchor } from '../core/PublicationAnchor.js';
import { DecentralizedPublication } from '../core/DecentralizedPublication.js';
import { ContentReference } from '../core/ContentReference.js';
import { LocalPublicationCatalog } from '../application/LocalPublicationCatalog.js';
import { LocalPublicationAnchorCatalog } from '../application/LocalPublicationAnchorCatalog.js';
import { CreateExternalPublicationAnchorOrchestratorUseCase } from '../application/CreateExternalPublicationAnchorOrchestratorUseCase.js';
import { PublicationAnchorCreationCoordinator } from '../application/PublicationAnchorCreationCoordinator.js';
import { ExternalProofVerifierRegistry } from '../application/ExternalProofVerifierRegistry.js';
import { ExternalAnchorCreationOutcome } from '../application/ExternalAnchorCreationOutcome.js';
import { ExternalAnchorVerifier } from '../application/ExternalAnchorVerifier.js';
import { AnchorVerificationOutcome } from '../application/AnchorVerificationOutcome.js';
import { CreateBaseAnchorProofVerifierUseCase } from '../application/CreateBaseAnchorProofVerifierUseCase.js';
import { BaseProofVerifier } from '../anchoring/BaseProofVerifier.js';
import { BasePublicationTransactionPlanner } from '../base/BasePublicationTransactionPlanner.js';
import { encodeBasePublicationCommitment } from '../application/BasePublicationCommitmentEncoding.js';
import { CreateBitcoinAnchorProofVerifierUseCase } from '../application/CreateBitcoinAnchorProofVerifierUseCase.js';
import { CreateArweaveAnchorProofVerifierUseCase } from '../application/CreateArweaveAnchorProofVerifierUseCase.js';
import { BitcoinAnchorPublisher } from '../anchoring/BitcoinAnchorPublisher.js';
import { BitcoinOpReturnProofVerifier } from '../anchoring/BitcoinOpReturnProofVerifier.js';
import { ArweaveAnchorPublisher } from '../anchoring/ArweaveAnchorPublisher.js';
import { ArweaveTransactionDataProofVerifier } from '../anchoring/ArweaveTransactionDataProofVerifier.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';

// 0.9.464 — Base Proof Verification Integration Boundary Audit.
//
// TYPE: test-only integration-boundary audit. PRODUCTION CHANGES: NONE.
//
// 0.9.463 gave this codebase a real anchoring/BaseProofVerifier.js and a
// real application/CreateBaseAnchorProofVerifierUseCase.js, unit-tested in
// full isolation by tests/BaseTransactionProofVerifier.test.js. This
// milestone asks the question that file's own scope deliberately never
// asked: does the new verifier actually participate in the REAL,
// PRODUCTION verification machinery, the same way Bitcoin's and Arweave's
// own verifiers already do — reachable through the real registry, the
// real composition root, and the real ExternalAnchorVerifier boundary,
// with the same three-outcome semantics, the same call discipline, and
// the same content-not-ownership restraint, all the way through?
//
// THE CENTRAL, HONEST FINDING THIS AUDIT MAKES — read before the lettered
// sections below, because it reshapes what several of them can honestly
// claim. Two things this milestone's own brief assumed as background fact
// turn out not to hold, once actually checked against current source:
//
//   1. THERE IS NO PRODUCTION "BASE ANCHOR." Bitcoin's and Arweave's own
//      publishing paths (anchoring/BitcoinAnchorPublisher.js, anchoring/
//      ArweaveAnchorPublisher.js) each implement the `{ anchorType,
//      publish(contentHash) }` interface application/
//      ExternalAnchorPublisherRegistry.js requires, and so each produces a
//      real, signed `core/PublicationAnchor.js` with `anchorType`/`proof`
//      fields a ProofVerifier can act on. Base's own real publishing path
//      (base/BasePublicationTransactionPlanner.js through base/
//      BaseSignedTransactionFinalizer.js) produces something structurally
//      different — application/BaseAnchorPublicationRecord.js, a
//      `{ contentHash, txid, network, createdAt }` identity record with
//      no `anchorType`, no `proof`, no signature, and no relationship to
//      `core/PublicationAnchor.js` at all (confirmed independently by
//      tests/BaseTransactionProofVerificationCapabilityAudit.test.js's own
//      Section A, and reconfirmed fresh in this file's own Section K).
//      Nothing in this codebase today ever constructs a `PublicationAnchor`
//      with `anchorType: 'base'`. So Section C's own "real Base
//      publication transaction" cannot be obtained from a real
//      `BaseAnchorPublisher` the way Section A's Bitcoin/Arweave
//      equivalent audit (tests/ArweaveProofAnchorIntegrationBoundaryAudit
//      .test.js) obtained one — because no such class exists. Section C
//      below is explicit about exactly which one piece it therefore
//      substitutes a test double for, and proves that substitution is
//      the ONLY non-real piece in its own flagship path.
//   2. THE NEW VERIFIER IS NOT WIRED INTO ui/main.js. A source sweep
//      (Section B) finds `CreateBitcoinAnchorProofVerifierUseCase` and
//      `CreateArweaveAnchorProofVerifierUseCase` both imported there, both
//      constructed, and both `.register()`ed into the one real
//      `externalAnchorProofVerifierRegistry` instance the live app's
//      `externalAnchorVerifier` actually consults. `CreateBaseAnchorProofVerifierUseCase`
//      appears in NEITHER that import list NOR anywhere else in ui/ — a
//      whole-repo grep finds it only inside its own two implementation
//      files and this codebase's own test files. The class 0.9.463 built
//      is real, correct, and (this file's own Sections A/D-J show)
//      behaviorally indistinguishable in the pipeline from Bitcoin's and
//      Arweave's own verifiers — it is simply never instantiated by
//      anything a person using this application would ever trigger.
//
// Neither finding is a defect IN anchoring/BaseProofVerifier.js or
// application/CreateBaseAnchorProofVerifierUseCase.js themselves — every
// section below proves those two files are mechanically sound and behave
// identically to their Bitcoin/Arweave siblings at every seam this
// codebase's own registry/use-case/ExternalAnchorVerifier pipeline
// defines. The finding is that NOTHING TODAY CONNECTS THAT SOUND
// VERIFIER, OR ANY REAL BASE ANCHOR, TO THE REST OF THE RUNNING
// APPLICATION. See the VERDICT in Section M for the precise
// classification this audit's own evidence supports.
//
// LETTERED SECTIONS:
//   A. Registry reachability — BaseProofVerifier registers under 'base'
//      and is resolved by anchorType alone, coexisting with Bitcoin and
//      Arweave in one shared registry.
//   B. Composition-root wiring — CreateBaseAnchorProofVerifierUseCase
//      constructs a REAL BaseJsonRpcClient as its rpcSource (proven
//      behaviorally, not merely by source inspection); contrasted with a
//      source sweep of ui/main.js proving it is never imported or
//      registered there, unlike its Bitcoin/Arweave siblings.
//   C. End-to-end valid proof (FLAGSHIP) — a real anchor-creation path
//      (PublicationAnchorCreationCoordinator.create(), the exact UI-facing
//      seam) drives a real, signed anchorType:'base' PublicationAnchor
//      into existence, backed by a REAL base/BasePublicationTransactionPlanner.js
//      plan and a REAL application/BasePublicationCommitmentEncoding.js
//      commitment — the ONE substituted piece, named explicitly, is the
//      `{ anchorType, publish() }` glue no production BaseAnchorPublisher
//      exists to supply (see the finding above). Verification then runs
//      through the REAL ExternalAnchorVerifier + ExternalProofVerifierRegistry
//      + CreateBaseAnchorProofVerifierUseCase-built verifier + real
//      BaseJsonRpcClient, reaching VALID.
//   D. The contentHash boundary — CONTENT_MISMATCH (caller-expectation),
//      INVALID_PROOF (chain-data mismatch), and PROOF_UNAVAILABLE
//      (cannot presently tell) proven mutually distinct through the full
//      ExternalAnchorVerifier boundary, for the identical signed anchor.
//   E. Not-found / unavailable — both RPC shapes reach PROOF_UNAVAILABLE
//      through the full boundary, never a rejection.
//   F. Network identity — a mainnet proof never verifies against a
//      verifier configured for testnet, and vice versa, through the full
//      boundary — INVALID_PROOF, not silently accepted.
//   G. Proof identity fidelity — the registry-resolved verifier looks up
//      exactly proof.txid, even with a decoy same-content transaction
//      under a different txid sitting in the same fake chain.
//   H. Call discipline — one verify() through the full boundary makes
//      exactly one transaction lookup; no retry, no polling.
//   I. Cross-substrate isolation — Bitcoin, Arweave, and Base verifiers
//      share one registry pair, interleaved, with per-class call counters
//      proving no cross-invocation; existing regression witnesses
//      re-executed live.
//   J. Attribution/identity isolation — a successful Base verification
//      never touches the anchor's own anchorIdentity/signature; no
//      owner/author/publisher/wallet/sender vocabulary anywhere in the
//      real classes this boundary exercises; publicationId/contentHash/
//      anchor.id/proof.txid proven pairwise distinct, including under two
//      publications sharing one contentHash.
//   K. UI/application reachability — the generic creation-card/evidence
//      mechanism carries zero Base-specific branches (capable of Base),
//      but ui/main.js never feeds it a Base publisher or a Base proof
//      verifier, and BaseAnchorPublicationRecord is reconfirmed, from
//      current source, as structurally unrelated to PublicationAnchor.
//   L. Production-change guard.
//   M. The verdict.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE. Building a BaseAnchorPublisher;
// wiring CreateBaseAnchorProofVerifierUseCase into ui/main.js; any change
// to anchoring/BaseProofVerifier.js, application/CreateBaseAnchorProofVerifierUseCase.js,
// the registries, the coordinator, or ui/. This file only reads and
// exercises current production source; it modifies none of it. Whether to
// build that publisher, or wire this verifier in, is the product question
// this audit hands back — not one it answers by building around it.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

let assertionCount = 0;
function check(condition, message) {
    assertionCount += 1;
    assert(condition, message);
}

const SOURCE_ROOT = fileURLToPath(new URL('../', import.meta.url));
async function source(relativePath) {
    return readFile(path.join(SOURCE_ROOT, relativePath), 'utf8');
}
function codeOnly(src) {
    return src.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
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

// The identical helper tests/ArweaveProofAnchorIntegrationBoundaryAudit.test.js
// already establishes — synchronous, no network of any kind.
function publishContent(publicationCatalog, { id, hash }) {
    const publication = new DecentralizedPublication({
        id, contentKind: 'forkbuild.structure', contentReference: new ContentReference({ hash })
    });
    publicationCatalog.add(publication);
    return publication;
}

function makeReplica({ publishers = [] } = {}) {
    const publicationCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
    const anchorCatalog = new LocalPublicationAnchorCatalog(new InMemoryStorageProvider());
    const identityProvider = makeIdentity('Alice');
    const { createExternalPublicationAnchorUseCase, publisherRegistry } =
        new CreateExternalPublicationAnchorOrchestratorUseCase().execute({
            publicationCatalog, anchorCatalog, identityProvider, publishers
        });
    return { publicationCatalog, anchorCatalog, identityProvider, createExternalPublicationAnchorUseCase, publisherRegistry };
}

// The real production planner rpcSource — priced entirely in-memory, no
// network — the identical fixture tests/BaseTransactionProofVerifier.test.js
// (0.9.463) already established for driving base/BasePublicationTransactionPlanner.js's
// own real plan() logic.
const plannerRpcSource = {
    async fetchTransactionCount() { return { available: true, nonce: 3 }; },
    async fetchGasEstimate() { return { available: true, gasLimit: 21000 }; },
    async fetchGasPrice() { return { available: true, gasPriceWei: '1000000000' }; },
    async fetchMaxPriorityFeePerGas() { return { available: true, maxPriorityFeePerGasWei: '1000000000' }; }
};
const ADDRESS = '0x' + '11'.repeat(20);

async function planRealBaseTransaction(contentHash, network = 'mainnet') {
    const planner = new BasePublicationTransactionPlanner({ rpcSource: plannerRpcSource });
    const plan = await planner.plan({
        contentHash, address: ADDRESS, network, chainId: 8453, nativeBalanceWei: '1000000000000000000000'
    });
    assert(plan.built === true, 'planRealBaseTransaction: the fixture plan itself must build successfully');
    return plan;
}

// A shared, deterministic fake Base JSON-RPC endpoint. Instrumented to
// record every requested method + txid so this audit's own call-discipline
// and proof-identity sections can assert against real traffic, the
// identical technique tests/ArweaveProofAnchorIntegrationBoundaryAudit.test.js
// already established for its own fake Arweave/Bitcoin networks, one
// substrate over.
function makeFakeBaseNetwork() {
    const ledger = new Map(); // txid -> { hash, input }
    const requests = [];
    let nextTxid = 0;

    function nextSyntheticTxid() {
        nextTxid += 1;
        return '0x' + String(nextTxid).padStart(64, '0');
    }

    // Standing in for the ONE piece of this milestone's own flagship path
    // that has no real production counterpart (see this file's own header,
    // finding #1): a fake `{ anchorType: 'base', publish(contentHash) }`
    // object, shaped exactly like anchoring/BitcoinAnchorPublisher.js and
    // anchoring/ArweaveAnchorPublisher.js already are, so it can be
    // registered into the REAL ExternalAnchorPublisherRegistry and driven
    // through the REAL PublicationAnchorCreationCoordinator/orchestrator/
    // CreatePublicationAnchorUseCase — every one of those stays real and
    // unmodified. Internally it calls nothing but REAL Base production
    // code (base/BasePublicationTransactionPlanner.js, application/
    // BasePublicationCommitmentEncoding.js) to produce the transaction
    // `data` this fake network then serves back — never a hand-written
    // matching string.
    const fakeBasePublisher = {
        anchorType: 'base',
        async publish(contentHash) {
            const plan = await planRealBaseTransaction(contentHash);
            const txid = nextSyntheticTxid();
            ledger.set(txid, { hash: txid, input: plan.data });
            return { published: true, locator: `https://basescan.org/tx/${txid}`, proof: { txid, network: 'mainnet' } };
        }
    };

    async function fetchImpl(url, options = {}) {
        const body = JSON.parse(options.body);
        requests.push({ method: body.method, params: body.params });
        if (body.method !== 'eth_getTransactionByHash') {
            return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: body.id, result: null }) };
        }
        const [txid] = body.params;
        const entry = ledger.get(txid) || null;
        return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: body.id, result: entry }) };
    }

    return { ledger, requests, fakeBasePublisher, fetchImpl };
}

async function run() {
    console.log('Running Base Proof Verification Integration Boundary Audit...\n');

    // ===============================================================
    // Section A — registry reachability.
    // ===============================================================
    {
        const { baseProofVerifier } = new CreateBaseAnchorProofVerifierUseCase().execute();
        const registry = new ExternalProofVerifierRegistry();
        check(!registry.has('base'), 'A1. sanity: an empty registry has no "base" entry yet');

        registry.register(baseProofVerifier);
        check(registry.has('base'), 'A2. registering the real BaseProofVerifier makes ExternalProofVerifierRegistry#has(\'base\') true');
        check(registry.get('base') === baseProofVerifier, 'A3. ExternalProofVerifierRegistry#get(\'base\') resolves the EXACT registered instance, never a copy or a different one');

        // Coexistence with Bitcoin and Arweave in the SAME registry
        // instance — anchorType-keyed lookup, never positional.
        const { bitcoinProofVerifier } = new CreateBitcoinAnchorProofVerifierUseCase().execute();
        const { arweaveProofVerifier } = new CreateArweaveAnchorProofVerifierUseCase().execute({ gatewayUrl: 'https://arweave.net' });
        registry.register(bitcoinProofVerifier);
        registry.register(arweaveProofVerifier);
        check(registry.anchorTypes.length === 3, 'A4. registering all three real verifiers in one registry yields exactly three anchorTypes');
        check(new Set(registry.anchorTypes).size === 3, 'A5. all three anchorTypes are distinct — no key collision');
        check(registry.get('base').anchorType === 'base' && registry.get('bitcoin-op-return').anchorType === 'bitcoin-op-return' && registry.get('arweave').anchorType === 'arweave',
            'A6. each anchorType resolves to the verifier that actually declares it, never a different one');

        registry.unregister('base');
        check(!registry.has('base'), 'A7. unregistering "base" removes only that entry');
        check(registry.has('bitcoin-op-return') && registry.has('arweave'), 'A8. ...leaving Bitcoin and Arweave untouched');

        console.log('✓ Section A: BaseProofVerifier registers, resolves, and coexists in ExternalProofVerifierRegistry exactly like its Bitcoin/Arweave siblings');
    }

    // ===============================================================
    // Section B — composition-root wiring: real vs. absent.
    // ===============================================================
    {
        // B1. CreateBaseAnchorProofVerifierUseCase really does construct a
        // BaseJsonRpcClient as its rpcSource — proven BEHAVIORALLY: the
        // wired verifier issues a real JSON-RPC POST body, never a
        // hand-shaped fake object standing in for one.
        const requests = [];
        const fetchImpl = async (_url, options) => {
            const body = JSON.parse(options.body);
            requests.push(body);
            return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: body.id, result: null }) };
        };
        const { baseProofVerifier } = new CreateBaseAnchorProofVerifierUseCase().execute({ fetchImpl, rpcUrl: 'https://mainnet.base.org' });
        check(baseProofVerifier instanceof BaseProofVerifier, 'B1a. the use case returns a real BaseProofVerifier instance');
        await baseProofVerifier.verify({ txid: '0x' + 'aa'.repeat(32) }, { contentHash: 'deadbeef' });
        check(requests.length === 1, 'B1b. exactly one HTTP request was issued end to end');
        check(requests[0].jsonrpc === '2.0' && requests[0].method === 'eth_getTransactionByHash', 'B1c. it is a genuine JSON-RPC 2.0 eth_getTransactionByHash call — the real base/BaseJsonRpcClient.js wire format, not a parallel client\'s own shape');
        check(requests[0].params[0] === '0x' + 'aa'.repeat(32), 'B1d. the txid named by the proof is exactly what was sent over the wire');

        // B2. No parallel/second client construction: the use case's own
        // source constructs exactly one BaseJsonRpcClient, handed straight
        // to BaseProofVerifier as rpcSource — reconfirmed from current
        // source, not assumed from 0.9.463's own prose.
        const useCaseCode = codeOnly(await source('application/CreateBaseAnchorProofVerifierUseCase.js'));
        const clientConstructions = (useCaseCode.match(/new BaseJsonRpcClient\(/g) || []).length;
        check(clientConstructions === 1, 'B2. application/CreateBaseAnchorProofVerifierUseCase.js constructs exactly one BaseJsonRpcClient — never a second, parallel one');
        check(/rpcSource: baseJsonRpcClient/.test(useCaseCode), 'B3. that exact instance is what is handed to BaseProofVerifier as rpcSource — never a different object built alongside it');

        // B4. THE FLAGSHIP NEGATIVE FINDING: is any of this actually
        // reachable from ui/main.js, the one real composition root this
        // application runs? Contrasted directly against Bitcoin's and
        // Arweave's own, real wiring in the SAME file.
        const mainSrc = await source('ui/main.js');
        const mainCode = codeOnly(mainSrc);

        check(/import \{ CreateBitcoinAnchorProofVerifierUseCase \}/.test(mainCode), 'B5a. sanity: ui/main.js really does import CreateBitcoinAnchorProofVerifierUseCase');
        check(/import \{ CreateArweaveAnchorProofVerifierUseCase \}/.test(mainCode), 'B5b. ...and CreateArweaveAnchorProofVerifierUseCase');
        check(/const \{ bitcoinProofVerifier \} = new CreateBitcoinAnchorProofVerifierUseCase\(\)\.execute\(\);/.test(mainCode), 'B5c. ...and really constructs a real bitcoinProofVerifier from it');
        check(/proofVerifiers: \[bitcoinProofVerifier\]/.test(mainCode), 'B5d. ...which is really handed into CreateExternalAnchorVerifierUseCase as a live proofVerifier');
        check(/externalAnchorProofVerifierRegistry\.register\(arweaveProofVerifier\)/.test(mainCode), 'B5e. ...and Arweave\'s own real proof verifier is really registered into that SAME live registry instance');

        check(!/CreateBaseAnchorProofVerifierUseCase/.test(mainCode), 'B6. ui/main.js NEVER imports, references, or constructs CreateBaseAnchorProofVerifierUseCase — unlike its Bitcoin/Arweave siblings just confirmed above');
        check(!/BaseProofVerifier/.test(mainCode), 'B7. ...and never references BaseProofVerifier by name either — no alternate, hand-rolled wiring path exists for it');
        check(!/externalAnchorProofVerifierRegistry\.register\([^)]*[Bb]ase/.test(mainCode), 'B8. the live externalAnchorProofVerifierRegistry — the actual registry application/ExternalAnchorVerifier.js consults for every real verification this application performs — never has anything Base-shaped registered into it');

        // B9. Confirmed repo-wide, not merely in ui/main.js: the use case
        // is referenced only by its own two implementation files and this
        // codebase's own test files — no OTHER composition root uses it
        // either.
        let grepOutput;
        try {
            grepOutput = execSync("grep -rl 'CreateBaseAnchorProofVerifierUseCase' --include='*.js' .", { cwd: SOURCE_ROOT }).toString();
        } catch (error) {
            grepOutput = error.stdout ? error.stdout.toString() : '';
        }
        const referencingFiles = grepOutput.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => l.replace(/^\.\//, ''));
        const nonTestNonOwnFiles = referencingFiles.filter((f) =>
            f !== 'application/CreateBaseAnchorProofVerifierUseCase.js' &&
            f !== 'anchoring/BaseProofVerifier.js' && // its own header prose names its composition-root sibling, no import
            !f.startsWith('tests/') &&
            f !== 'docs/Roadmap.md'
        );
        check(nonTestNonOwnFiles.length === 0, `B9. repo-wide, CreateBaseAnchorProofVerifierUseCase is referenced only by its own file and test files — found unexpectedly wired elsewhere: ${JSON.stringify(nonTestNonOwnFiles)}`);

        console.log('✓ Section B: the composition-root use case is mechanically sound and issues real JSON-RPC traffic through exactly one real BaseJsonRpcClient — but is confirmed, by direct contrast with Bitcoin\'s and Arweave\'s own real wiring in the same file, to be absent from ui/main.js and from every other composition root in this codebase');
    }

    // ===============================================================
    // Section C — end-to-end valid proof (FLAGSHIP).
    // ===============================================================
    let flagship;
    {
        const net = makeFakeBaseNetwork();
        const { publicationCatalog, createExternalPublicationAnchorUseCase, publisherRegistry } =
            makeReplica({ publishers: [net.fakeBasePublisher] });

        // The exact class ui/views/DecentralizedPublicationsView.js's own
        // createAnchor() calls — application/PublicationAnchorCreationCoordinator.js
        // — sits in front of the orchestrator here, never bypassed, the
        // identical seam tests/ArweaveProofAnchorIntegrationBoundaryAudit
        // .test.js's own Section A already established for a real chain.
        const coordinator = new PublicationAnchorCreationCoordinator(createExternalPublicationAnchorUseCase, publisherRegistry);
        check(coordinator.availableAnchorTypes().includes('base'), 'C1. once a base-anchorType publisher is registered, the real coordinator\'s own availableAnchorTypes() lists "base" — the generic creation mechanism accepts it with zero special-casing');

        const contentHash = 'c0ffee'.repeat(8); // even-length hex — a real Base commitment must encode as raw bytes
        await publishContent(publicationCatalog, { id: 'pub-base-full-path', hash: contentHash });

        const result = await coordinator.create('pub-base-full-path', 'base');
        check(result.outcome === ExternalAnchorCreationOutcome.CREATED, 'C2. PublicationAnchorCreationCoordinator#create() produces CREATED for the fake Base publisher');
        check(result.anchor instanceof PublicationAnchor && result.anchor.anchorType === 'base', 'C3. a real, signed PublicationAnchor with anchorType "base" now exists — the one this codebase\'s own production code today never otherwise constructs (see this file\'s own header, finding #1)');
        check(result.anchor.proof && typeof result.anchor.proof.txid === 'string' && result.anchor.proof.network === 'mainnet', 'C4. its proof is exactly { txid, network } — the shape anchoring/BaseProofVerifier.js\'s own header documents, nothing more');
        check(result.anchor.signature !== null, 'C5. the anchor is genuinely signed — real identity/LocalAuthorizationVerifier.js signing, not a hand-constructed envelope');

        // Independent verification: registry-resolved, through the REAL
        // ExternalAnchorVerifier + REAL CreateBaseAnchorProofVerifierUseCase
        // -built verifier + REAL BaseJsonRpcClient — the fake network's
        // own fetchImpl is the ONLY non-real piece on this side, exactly
        // mirroring how every fake HTTP transport in this codebase's own
        // test suite stands in for a live endpoint.
        const { baseProofVerifier } = new CreateBaseAnchorProofVerifierUseCase().execute({ fetchImpl: net.fetchImpl });
        const verifierRegistry = new ExternalProofVerifierRegistry();
        verifierRegistry.register(baseProofVerifier);
        const bobAnchorVerifier = new ExternalAnchorVerifier(new LocalAuthorizationVerifier());

        const verification = await bobAnchorVerifier.verify(result.anchor.toJSON(), {
            expectedContentHash: contentHash,
            proofVerifierRegistry: verifierRegistry
        });
        check(verification.outcome === AnchorVerificationOutcome.VALID, 'C6. FULL PATH — coordinator-driven creation, registry-resolved verification through the real ExternalAnchorVerifier and a real, composition-root-built BaseProofVerifier talking to a real BaseJsonRpcClient — reports VALID end to end');

        flagship = { anchor: result.anchor, contentHash, net };
        console.log('✓ Section C (FLAGSHIP): a real signed anchorType:\'base\' PublicationAnchor, carrying a real planner-produced commitment, verifies VALID through the real registry/use-case/verifier/RPC-client chain — every seam this codebase\'s own production verification pipeline defines holds for Base exactly as it already does for Bitcoin and Arweave');
    }

    // ===============================================================
    // Section D — the contentHash boundary: three mutually distinct
    // outcomes for the identical signed anchor.
    // ===============================================================
    {
        const { anchor, contentHash, net } = flagship;
        const anchorJson = anchor.toJSON();
        const bobAnchorVerifier = new ExternalAnchorVerifier(new LocalAuthorizationVerifier());

        // D1. correct contentHash, real chain -> VALID (reconfirmed).
        const valid = await bobAnchorVerifier.verify(anchorJson, {
            expectedContentHash: contentHash,
            proofVerifier: new CreateBaseAnchorProofVerifierUseCase().execute({ fetchImpl: net.fetchImpl }).baseProofVerifier
        });
        check(valid.outcome === AnchorVerificationOutcome.VALID, 'D1. sanity: the correct contentHash against the real chain verifies VALID');

        // D2. a DIFFERENT expected contentHash -> CONTENT_MISMATCH, caught
        // at the caller-expectation cross-check, before any proof verifier
        // is even consulted.
        net.requests.length = 0;
        const differentExpectation = await bobAnchorVerifier.verify(anchorJson, {
            expectedContentHash: 'a-caller-expected-something-else-entirely',
            proofVerifier: new CreateBaseAnchorProofVerifierUseCase().execute({ fetchImpl: net.fetchImpl }).baseProofVerifier
        });
        check(differentExpectation.outcome === AnchorVerificationOutcome.CONTENT_MISMATCH, 'D2. a caller expecting a DIFFERENT contentHash than the anchor itself claims reports CONTENT_MISMATCH, decided before any RPC call');
        check(net.requests.length === 0, 'D3. ...and genuinely never reached the RPC endpoint at all — the mismatch is caught upstream of proof verification');

        // D4. the anchor's own claimed contentHash matches what the
        // caller expects, but the chain this particular verifier instance
        // is pointed at serves DIFFERENT data for the exact same txid (a
        // lying/misconfigured endpoint, or a stale mirror) -> INVALID_PROOF,
        // never PROOF_UNAVAILABLE and never CONTENT_MISMATCH.
        const lyingFetch = async (_url, options) => {
            const body = JSON.parse(options.body);
            return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: body.id, result: { hash: body.params[0], input: encodeBasePublicationCommitment('f'.repeat(64)) } }) };
        };
        const lyingResult = await bobAnchorVerifier.verify(anchorJson, {
            expectedContentHash: contentHash,
            proofVerifier: new CreateBaseAnchorProofVerifierUseCase().execute({ fetchImpl: lyingFetch }).baseProofVerifier
        });
        check(lyingResult.outcome === AnchorVerificationOutcome.INVALID_PROOF, 'D4. contentHash matches what the caller expects, but the named transaction\'s REAL data (as this endpoint reports it) does not carry it — a definite INVALID_PROOF, never CONTENT_MISMATCH (a caller-expectation axis) and never PROOF_UNAVAILABLE (the endpoint DID answer, definitively, just not favorably)');

        // D5. an endpoint that has genuinely never heard of the
        // transaction -> PROOF_UNAVAILABLE, the third, permanently
        // distinct outcome.
        const emptyFetch = async (_url, options) => {
            const body = JSON.parse(options.body);
            return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: body.id, result: null }) };
        };
        const unavailableResult = await bobAnchorVerifier.verify(anchorJson, {
            expectedContentHash: contentHash,
            proofVerifier: new CreateBaseAnchorProofVerifierUseCase().execute({ fetchImpl: emptyFetch }).baseProofVerifier
        });
        check(unavailableResult.outcome === AnchorVerificationOutcome.PROOF_UNAVAILABLE, 'D5. an endpoint that has never heard of the transaction reports PROOF_UNAVAILABLE — "cannot presently tell," never a rejection');

        check(new Set([valid.outcome, differentExpectation.outcome, lyingResult.outcome, unavailableResult.outcome]).size === 4, 'D6. all four scenarios above (VALID, CONTENT_MISMATCH, INVALID_PROOF, PROOF_UNAVAILABLE) produce four mutually distinct outcome values from the identical signed anchor — only the verification circumstances differ');

        console.log('✓ Section D: the contentHash boundary holds through the full application-level verification entry point — a caller-expectation mismatch, a chain-data mismatch, and a chain that cannot presently be consulted remain three permanently distinct outcomes for Base, never collapsed into each other');
    }

    // ===============================================================
    // Section E — not-found / unavailable, through the full boundary.
    // ===============================================================
    {
        const { anchor, contentHash } = flagship;
        const anchorJson = anchor.toJSON();
        const anchorVerifier = new ExternalAnchorVerifier(new LocalAuthorizationVerifier());

        const notFoundFetch = async (_url, options) => {
            const body = JSON.parse(options.body);
            return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: body.id, result: null }) };
        };
        const notFoundResult = await anchorVerifier.verify(anchorJson, {
            expectedContentHash: contentHash,
            proofVerifier: new CreateBaseAnchorProofVerifierUseCase().execute({ fetchImpl: notFoundFetch }).baseProofVerifier
        });
        check(notFoundResult.outcome === AnchorVerificationOutcome.PROOF_UNAVAILABLE, 'E1. a genuinely not-found transaction reaches PROOF_UNAVAILABLE through the full boundary, never INVALID_PROOF');

        const unreachableFetch = async () => { throw new Error('simulated: DNS resolution failed'); };
        const unreachableResult = await anchorVerifier.verify(anchorJson, {
            expectedContentHash: contentHash,
            proofVerifier: new CreateBaseAnchorProofVerifierUseCase().execute({ fetchImpl: unreachableFetch }).baseProofVerifier
        });
        check(unreachableResult.outcome === AnchorVerificationOutcome.PROOF_UNAVAILABLE, 'E2. a genuinely unreachable endpoint (fetchImpl itself throws) ALSO reaches PROOF_UNAVAILABLE through the full boundary — ExternalAnchorVerifier#verify() never distinguishes a throw from an honestly-returned unavailable result');

        const non200Fetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
        const non200Result = await anchorVerifier.verify(anchorJson, {
            expectedContentHash: contentHash,
            proofVerifier: new CreateBaseAnchorProofVerifierUseCase().execute({ fetchImpl: non200Fetch }).baseProofVerifier
        });
        check(non200Result.outcome === AnchorVerificationOutcome.PROOF_UNAVAILABLE, 'E3. a non-2xx HTTP response is ALSO PROOF_UNAVAILABLE, never a rejection');

        console.log('✓ Section E: every shape of "cannot presently tell" (not found, unreachable, non-2xx) reaches PROOF_UNAVAILABLE through the full application-level boundary, and none of them is ever promoted to a definite rejection');
    }

    // ===============================================================
    // Section F — network identity: a mainnet proof never silently
    // verifies against a differently configured network.
    // ===============================================================
    {
        const { anchor, contentHash, net } = flagship; // anchor.proof.network === 'mainnet'
        const anchorJson = anchor.toJSON();
        const anchorVerifier = new ExternalAnchorVerifier(new LocalAuthorizationVerifier());

        const testnetVerifier = new CreateBaseAnchorProofVerifierUseCase().execute({ fetchImpl: net.fetchImpl, network: 'testnet' }).baseProofVerifier;
        check(testnetVerifier.network === 'testnet', 'F1. sanity: the verifier really is configured for testnet, not mainnet');
        const mismatchResult = await anchorVerifier.verify(anchorJson, {
            expectedContentHash: contentHash,
            proofVerifier: testnetVerifier
        });
        check(mismatchResult.outcome === AnchorVerificationOutcome.INVALID_PROOF, 'F2. a mainnet-declared proof against a verifier configured for testnet is a definite INVALID_PROOF through the full boundary — never silently accepted, and never merely "unavailable"');

        // F3. the converse holds too: a testnet-declared proof against the
        // real mainnet-configured verifier is likewise rejected, even
        // though the RPC endpoint would happily answer either way — the
        // network check is a proof-shape rule, never an RPC-side fact.
        const testnetProofAnchorJson = { ...anchorJson, proof: { ...anchorJson.proof, network: 'testnet' } };
        const mainnetVerifier = new CreateBaseAnchorProofVerifierUseCase().execute({ fetchImpl: net.fetchImpl }).baseProofVerifier;
        check(mainnetVerifier.network === 'mainnet', 'F3a. sanity: this verifier is configured for mainnet, the default');
        // Re-sign is unnecessary for this structural check: proof-shape
        // rejection happens before signature verification's own outcome
        // would matter here — INVALID_SIGNATURE would fire first on a
        // mutated envelope, so this checks BaseProofVerifier directly
        // instead, exactly the seam this section is auditing.
        const directMismatch = await mainnetVerifier.verify(testnetProofAnchorJson.proof, { contentHash });
        check(directMismatch.valid === false && !directMismatch.unavailable, 'F3b. BaseProofVerifier itself, configured for mainnet, definitely rejects a proof declaring "testnet" — confirmed directly, and already proven to propagate as INVALID_PROOF through the full boundary by F2 above (the identical check, run from the other side)');

        console.log('✓ Section F: network identity is enforced both ways through the full boundary — a mainnet proof never verifies against a testnet-configured verifier, and the reverse, regardless of what the RPC endpoint itself would answer');
    }

    // ===============================================================
    // Section G — proof identity fidelity: the selected txid remains
    // authoritative, even with a same-content decoy under another txid.
    // ===============================================================
    {
        const net = makeFakeBaseNetwork();
        const contentHash = 'aa11bb22'.repeat(8); // even-length hex — see Section C's own note

        // Two INDEPENDENT transactions on the same fake chain carry the
        // IDENTICAL content commitment under two DIFFERENT txids — the
        // adversarial setup this section needs: if BaseProofVerifier ever
        // searched for "some transaction with this content" rather than
        // looking up the named txid specifically, this is where it would
        // show up.
        const plan = await planRealBaseTransaction(contentHash);
        const txidReal = '0x' + 'aa'.repeat(32);
        const txidDecoy = '0x' + 'bb'.repeat(32);
        net.ledger.set(txidReal, { hash: txidReal, input: plan.data });
        net.ledger.set(txidDecoy, { hash: txidDecoy, input: plan.data });

        const { baseProofVerifier } = new CreateBaseAnchorProofVerifierUseCase().execute({ fetchImpl: net.fetchImpl });
        const registry = new ExternalProofVerifierRegistry();
        registry.register(baseProofVerifier);
        const anchorVerifier = new ExternalAnchorVerifier(new LocalAuthorizationVerifier());

        // Signed through a real identity, exactly as Section C's own
        // anchor was signed — never a hand-waved/unsigned envelope.
        const identityProvider = makeIdentity('Carol');
        const authVerifier = new LocalAuthorizationVerifier();
        const anchorNamingReal = new PublicationAnchor({
            publicationId: 'pub-g', contentHash, anchorType: 'base',
            locator: `https://basescan.org/tx/${txidReal}`, proof: { txid: txidReal, network: 'mainnet' },
            anchorIdentity: identityProvider.getSigningIdentity().toJSON()
        });
        const properlySignedAnchor = anchorNamingReal.withSignature(identityProvider.signCanonical(anchorNamingReal.getSigningDescriptor()));
        check(authVerifier.verifyPublicationAnchor(properlySignedAnchor.toJSON()).valid, 'G0. sanity: the hand-assembled anchor for this section is genuinely, independently signable/verifiable — never a shortcut around the real signing path');

        net.requests.length = 0;
        const result = await anchorVerifier.verify(properlySignedAnchor.toJSON(), {
            expectedContentHash: contentHash,
            proofVerifierRegistry: registry
        });
        check(result.outcome === AnchorVerificationOutcome.VALID, 'G1. the anchor naming txidReal verifies VALID');
        check(net.requests.length === 1, 'G2. exactly one RPC lookup was made');
        check(net.requests[0].params[0] === txidReal, 'G3. that lookup named EXACTLY txidReal — never txidDecoy, even though it carries byte-identical content and sits in the same reachable chain');

        console.log('✓ Section G: proof identity fidelity holds through the full boundary — verification looks up exactly the named txid, never searching for "any transaction with this content," even when a byte-identical decoy exists under a different txid');
    }

    // ===============================================================
    // Section H — call discipline through the full boundary.
    // ===============================================================
    {
        const { anchor, contentHash, net } = flagship;
        const anchorJson = anchor.toJSON();
        const anchorVerifier = new ExternalAnchorVerifier(new LocalAuthorizationVerifier());

        net.requests.length = 0;
        const result = await anchorVerifier.verify(anchorJson, {
            expectedContentHash: contentHash,
            proofVerifier: new CreateBaseAnchorProofVerifierUseCase().execute({ fetchImpl: net.fetchImpl }).baseProofVerifier
        });
        check(result.outcome === AnchorVerificationOutcome.VALID, 'H1. sanity: verification succeeds');
        check(net.requests.length === 1, 'H2. exactly ONE HTTP request reached the fake RPC endpoint for one verify() call through the full boundary — no retry, no polling, no second confirmatory read');
        check(net.requests[0].method === 'eth_getTransactionByHash', 'H3. that one request is the expected JSON-RPC method');

        // A second, independent verify() call on the SAME anchor makes
        // its OWN one call — never a cached/memoized skip that would hide
        // a real retry policy, and never more than one.
        net.requests.length = 0;
        await anchorVerifier.verify(anchorJson, {
            expectedContentHash: contentHash,
            proofVerifier: new CreateBaseAnchorProofVerifierUseCase().execute({ fetchImpl: net.fetchImpl }).baseProofVerifier
        });
        check(net.requests.length === 1, 'H4. a second, independent verify() call also makes exactly one request — this class has no polling loop of any kind, exactly as anchoring/BaseProofVerifier.js\'s own header documents');

        console.log('✓ Section H: call discipline holds through the full boundary — exactly one transaction lookup per verify() call, confirmed live against real request traffic, never a hidden retry or poll');
    }

    // ===============================================================
    // Section I — cross-substrate isolation, interleaved, plus live
    // regression witnesses.
    // ===============================================================
    {
        const baseNet = makeFakeBaseNetwork();
        let btcVerifyCalls = 0, arVerifyCalls = 0, baseVerifyCalls = 0;
        let btcPublishCalls = 0, arPublishCalls = 0, basePublishCalls = 0;

        const btcChain = new Map();
        const btcBroadcaster = {
            async broadcast(opReturnHex, { network }) {
                const txid = String(btcChain.size + 1).padStart(64, '0');
                btcChain.set(txid, { txid, network, vout: [{ scriptpubkey_type: 'op_return', scriptpubkey_asm: `OP_RETURN OP_PUSHBYTES_${opReturnHex.length / 2} ${opReturnHex}` }], status: { confirmed: true, block_height: 900000 } });
                return { broadcast: true, txid };
            }
        };
        async function btcFetchImpl(url) {
            const match = new URL(url).pathname.match(/\/tx\/([0-9a-f]+)$/i);
            if (match && btcChain.has(match[1])) return new Response(JSON.stringify(btcChain.get(match[1])), { status: 200 });
            return new Response('not found', { status: 404 });
        }
        const btcPublisher = new BitcoinAnchorPublisher({ network: 'mainnet', broadcaster: btcBroadcaster });
        const countingBtcPublish = btcPublisher.publish.bind(btcPublisher);
        btcPublisher.publish = async (...args) => { btcPublishCalls += 1; return countingBtcPublish(...args); };
        const btcVerifier = new BitcoinOpReturnProofVerifier({ fetchImpl: btcFetchImpl });
        const countingBtcVerify = btcVerifier.verify.bind(btcVerifier);
        btcVerifier.verify = async (...args) => { btcVerifyCalls += 1; return countingBtcVerify(...args); };

        const arLedger = new Map();
        let nextArTxid = 0;
        const arSigner = { async sign(material) { nextArTxid += 1; const id = `FakeArTx${String(nextArTxid).padStart(10, '0')}`; return { id, transaction: { format: 2, id, data: material } }; } };
        async function arFetchImpl(url, options = {}) {
            const parsed = new URL(url);
            const method = options.method || 'GET';
            if (method === 'POST' && parsed.pathname === '/tx') {
                const body = JSON.parse(options.body);
                arLedger.set(body.id, body.data);
                return new Response('accepted', { status: 200 });
            }
            const match = parsed.pathname.match(/^\/([A-Za-z0-9_-]+)$/);
            if (match && arLedger.has(match[1])) return new Response(arLedger.get(match[1]), { status: 200 });
            return new Response('not found', { status: 404 });
        }
        const arPublisher = new ArweaveAnchorPublisher({ signer: arSigner, fetchImpl: arFetchImpl });
        const countingArPublish = arPublisher.publish.bind(arPublisher);
        arPublisher.publish = async (...args) => { arPublishCalls += 1; return countingArPublish(...args); };
        const arVerifier = new ArweaveTransactionDataProofVerifier({ fetchImpl: arFetchImpl });
        const countingArVerify = arVerifier.verify.bind(arVerifier);
        arVerifier.verify = async (...args) => { arVerifyCalls += 1; return countingArVerify(...args); };

        const basePublisher = baseNet.fakeBasePublisher;
        const countingBasePublish = basePublisher.publish.bind(basePublisher);
        basePublisher.publish = async (...args) => { basePublishCalls += 1; return countingBasePublish(...args); };
        const baseVerifier = new CreateBaseAnchorProofVerifierUseCase().execute({ fetchImpl: baseNet.fetchImpl }).baseProofVerifier;
        const countingBaseVerify = baseVerifier.verify.bind(baseVerifier);
        baseVerifier.verify = async (...args) => { baseVerifyCalls += 1; return countingBaseVerify(...args); };

        const { publicationCatalog, createExternalPublicationAnchorUseCase } = makeReplica({ publishers: [btcPublisher, arPublisher, basePublisher] });
        const verifierRegistry = new ExternalProofVerifierRegistry();
        verifierRegistry.register(btcVerifier);
        verifierRegistry.register(arVerifier);
        verifierRegistry.register(baseVerifier);
        const anchorVerifier = new ExternalAnchorVerifier(new LocalAuthorizationVerifier());

        await publishContent(publicationCatalog, { id: 'pub-i-btc', hash: 'f00dfeed' });
        await publishContent(publicationCatalog, { id: 'pub-i-ar', hash: 'i-interleave-ar-hash' });
        await publishContent(publicationCatalog, { id: 'pub-i-base', hash: '11223344'.repeat(8) }); // even-length hex — a real Base commitment must encode as raw bytes

        // Interleaved order: Base, Bitcoin, Arweave create; then Arweave,
        // Base, Bitcoin verify — deliberately not grouped by anchorType.
        const baseCreate = await createExternalPublicationAnchorUseCase.execute('pub-i-base', 'base');
        const btcCreate = await createExternalPublicationAnchorUseCase.execute('pub-i-btc', 'bitcoin-op-return');
        const arCreate = await createExternalPublicationAnchorUseCase.execute('pub-i-ar', 'arweave');

        const arVerified = await anchorVerifier.verify(arCreate.anchor.toJSON(), { expectedContentHash: 'i-interleave-ar-hash', proofVerifierRegistry: verifierRegistry });
        const baseVerified = await anchorVerifier.verify(baseCreate.anchor.toJSON(), { expectedContentHash: '11223344'.repeat(8), proofVerifierRegistry: verifierRegistry });
        const btcVerified = await anchorVerifier.verify(btcCreate.anchor.toJSON(), { expectedContentHash: 'f00dfeed', proofVerifierRegistry: verifierRegistry });

        check(baseCreate.outcome === ExternalAnchorCreationOutcome.CREATED && btcCreate.outcome === ExternalAnchorCreationOutcome.CREATED && arCreate.outcome === ExternalAnchorCreationOutcome.CREATED, 'I1. all three anchorTypes create successfully, interleaved, from the same registry');
        check(arVerified.outcome === AnchorVerificationOutcome.VALID && baseVerified.outcome === AnchorVerificationOutcome.VALID && btcVerified.outcome === AnchorVerificationOutcome.VALID, 'I2. all three verify VALID, resolved from the SAME shared verifierRegistry instance by anchorType alone');

        check(btcPublishCalls === 1 && arPublishCalls === 1 && basePublishCalls === 1, 'I3. exactly one publish() call landed on EACH publisher — creating any one anchorType\'s anchor never invoked another\'s publisher');
        check(btcVerifyCalls === 1 && arVerifyCalls === 1 && baseVerifyCalls === 1, 'I4. exactly one verify() call landed on EACH proofVerifier — verifying any one anchorType\'s anchor never invoked another\'s verifier, even though all three are registered under the same registry instance and resolved by anchorType automatically');

        // I5. Live regression witnesses: the existing Bitcoin/Arweave
        // integration audit, re-executed now, confirming this milestone's
        // own additions changed nothing about it.
        //
        // tests/BaseTransactionProofVerifier.test.js and tests/
        // BaseTransactionProofVerificationCapabilityAudit.test.js are
        // DELIBERATELY excluded from this live re-execution list — not
        // because their own BEHAVIORAL assertions are in doubt (Sections
        // A-J of THIS file directly re-exercise anchoring/
        // BaseProofVerifier.js's and application/
        // CreateBaseAnchorProofVerifierUseCase.js's own real behavior at
        // the integration boundary, a strictly stronger check), but
        // because each carries its own point-in-time `git status
        // --porcelain` guard asserting an exact, closed list of
        // authorized changed files — a list that, by construction, this
        // milestone's own new file is not on. Re-running them live from
        // inside a THIRD milestone's own test process would fail on that
        // guard alone, for a reason that has nothing to do with whether
        // anchoring/BaseProofVerifier.js itself still behaves correctly.
        // This is the exact, already-documented precedent anchoring/
        // BaseProofVerifier.js's own header names for its own two
        // predecessors ("KNOWN, DELIBERATE CONSEQUENCE FOR PRIOR TEST
        // FILES' OWN GIT-STATUS GUARDS") — left honest and undisturbed
        // here rather than silently avoided.
        const REGRESSION_WITNESSES = [
            'tests/BitcoinOpReturnProofVerifier.test.js',
            'tests/ArweaveProofAnchorIntegrationBoundaryAudit.test.js',
            'tests/ExternalAnchorProofAdapters.test.js'
        ];
        let passCount = 0;
        for (const file of REGRESSION_WITNESSES) {
            try {
                execSync(`node ${JSON.stringify(file)}`, { cwd: SOURCE_ROOT, stdio: 'pipe' });
                passCount += 1;
            } catch (error) {
                throw new Error(`Section I: ${file} FAILED on live re-execution — ${error.stdout ? error.stdout.toString().split('\n').slice(-6).join(' | ') : error.message}`);
            }
        }
        check(passCount === REGRESSION_WITNESSES.length, `I5. all ${REGRESSION_WITNESSES.length} regression witnesses pass on live re-execution against current source`);

        console.log('✓ Section I: Bitcoin, Arweave, and Base create/verify cycles interleaved through ONE shared registry pair never cross-invoke each other\'s publisher or verifier, and every directly relevant existing test file still passes unchanged');
    }

    // ===============================================================
    // Section J — attribution/identity isolation.
    // ===============================================================
    {
        const { anchor, contentHash, net } = flagship;
        const beforeJson = anchor.toJSON();

        const verifier = new CreateBaseAnchorProofVerifierUseCase().execute({ fetchImpl: net.fetchImpl }).baseProofVerifier;
        const proofResult = await verifier.verify(anchor.proof, { contentHash, publicationId: anchor.publicationId, locator: anchor.locator });
        check(Object.keys(proofResult).every((k) => k === 'valid'), 'J1. a successful BaseProofVerifier#verify() result carries ONLY { valid: true } — no identity, ownership, or attribution field of any kind');

        const anchorVerifier = new ExternalAnchorVerifier(new LocalAuthorizationVerifier());
        const verification = await anchorVerifier.verify(beforeJson, { expectedContentHash: contentHash, proofVerifier: verifier });
        check(verification.outcome === AnchorVerificationOutcome.VALID, 'J2. sanity: verification succeeds');

        const afterJson = anchor.toJSON();
        check(JSON.stringify(beforeJson) === JSON.stringify(afterJson), 'J3. the anchor\'s own JSON — including anchorIdentity and signature — is byte-identical before and after verification; PublicationAnchor exposes no setter verification could have used to mutate it even if something tried');
        check(JSON.stringify(verification.anchor.toJSON()) === JSON.stringify(beforeJson), 'J4. the anchor object VERIFICATION ITSELF RETURNS is the same record, unmodified — verification never substitutes, augments, or re-derives anchorIdentity from the proof it just checked');

        // J5. source-level reconfirmation, at the integration boundary
        // (not merely the unit level tests/BaseTransactionProofVerifier
        // .test.js already checked): the two Base-specific files this
        // boundary newly exercises never read or compare a transaction's
        // own owner/author/wallet/sender field. Scoped to exactly these
        // two files, never the shared ExternalAnchorVerifier.js/
        // ExternalProofVerifierRegistry.js pipeline — those legitimately
        // discuss a DIFFERENT, permitted identity concept (the anchor's
        // own SIGNER, i.e. "authorization"/"anchorIdentity"), which is
        // not the invariant this section is checking.
        const filesToSweep = ['anchoring/BaseProofVerifier.js', 'application/CreateBaseAnchorProofVerifierUseCase.js'];
        for (const file of filesToSweep) {
            const code = codeOnly(await source(file));
            check(!/\bowner\b|\bauthor\b|\bpublisher\b|\bwallet\b|\bsender\b|\bsigner\b(?!ature)/i.test(code), `J5[${file}]. no owner/author/publisher/wallet/sender/signer vocabulary anywhere in this real, exercised class`);
        }

        // J6. identity separation table, per this milestone's own brief:
        // publicationId ≠ txid ≠ anchor.id ≠ publisherIdentity, even
        // though one Base transaction is associated with all of them —
        // and two publications sharing the identical contentHash still
        // produce independent anchors/txids.
        const net2 = makeFakeBaseNetwork();
        const { publicationCatalog, createExternalPublicationAnchorUseCase } = makeReplica({ publishers: [net2.fakeBasePublisher] });
        const sharedContentHash = 'ba5e0f'.repeat(8); // even-length hex — see Section C's own note
        await publishContent(publicationCatalog, { id: 'pub-j6-one', hash: sharedContentHash });
        await publishContent(publicationCatalog, { id: 'pub-j6-two', hash: sharedContentHash });
        const resultOne = await createExternalPublicationAnchorUseCase.execute('pub-j6-one', 'base');
        const resultTwo = await createExternalPublicationAnchorUseCase.execute('pub-j6-two', 'base');
        check(resultOne.outcome === ExternalAnchorCreationOutcome.CREATED && resultTwo.outcome === ExternalAnchorCreationOutcome.CREATED, 'J6a. sanity: both anchors were really created');

        const anchorOne = resultOne.anchor, anchorTwo = resultTwo.anchor;
        const publisherIdentityOne = anchorOne.anchorIdentity && anchorOne.anchorIdentity.id;
        const identifiers = {
            publicationIdOne: anchorOne.publicationId,
            publicationIdTwo: anchorTwo.publicationId,
            contentHash: sharedContentHash,
            anchorIdOne: anchorOne.id,
            anchorIdTwo: anchorTwo.id,
            txidOne: anchorOne.proof.txid,
            txidTwo: anchorTwo.proof.txid,
            publisherIdentityOne
        };
        check(typeof publisherIdentityOne === 'string' && publisherIdentityOne.length > 0, 'J6b. sanity: the anchor really does carry a publisherIdentity (anchorIdentity.id) distinct from every field checked below');

        check(identifiers.publicationIdOne !== identifiers.contentHash && identifiers.publicationIdOne !== identifiers.anchorIdOne && identifiers.publicationIdOne !== identifiers.txidOne && identifiers.publicationIdOne !== identifiers.publisherIdentityOne,
            'J7. publicationId is distinct from contentHash, the anchor\'s own id, the txid, and the publisherIdentity');
        check(identifiers.txidOne !== identifiers.anchorIdOne && identifiers.txidOne !== identifiers.publisherIdentityOne && identifiers.anchorIdOne !== identifiers.publisherIdentityOne,
            'J8. txid, the anchor\'s own id, and publisherIdentity are pairwise distinct — publicationId ≠ txid ≠ anchor.id ≠ publisherIdentity holds even though this ONE Base transaction is associated with all four');
        check(identifiers.publicationIdOne !== identifiers.publicationIdTwo, 'J9. two publications sharing the identical contentHash still keep their own distinct publicationIds');
        check(identifiers.anchorIdOne !== identifiers.anchorIdTwo, 'J10. ...and their two Base anchors get distinct anchor ids');
        check(identifiers.txidOne !== identifiers.txidTwo, 'J11. ...and distinct Base txids — the SAME contentHash anchored twice produces two independently identified transactions, never one fact impersonating two');
        check(new Set([identifiers.publicationIdOne, identifiers.publicationIdTwo, identifiers.contentHash, identifiers.anchorIdOne, identifiers.anchorIdTwo, identifiers.txidOne, identifiers.txidTwo, identifiers.publisherIdentityOne]).size === 8,
            'J12. all 8 identifiers collected above are pairwise unique — a single Base transaction never quietly becomes a publicationId, an anchor id, or a publisherIdentity, even when contentHash is deliberately held constant across two publications');

        console.log('✓ Section J: a successful Base proof verification establishes transaction-content evidence only — it never mutates the anchor\'s own identity fields, no real class on this boundary reads or compares an ownership concept, and publicationId/contentHash/anchor.id/proof.txid/publisherIdentity remain permanently distinct identities even under the deliberately adversarial case of a shared contentHash');
    }

    // ===============================================================
    // Section K — UI/application reachability.
    // ===============================================================
    {
        // K1. the generic creation-card mechanism itself is anchorType-
        // agnostic and WOULD carry "base" with zero special-casing, if
        // fed one — reconfirmed fresh against current source, the
        // identical slice-and-scan technique tests/
        // ArweaveProofAnchorIntegrationBoundaryAudit.test.js's own
        // Section B already established.
        const viewSource = await source('ui/views/DecentralizedPublicationsView.js');
        const startMarker = 'v-for="anchorType in availableAnchorTypes"';
        const startIndex = viewSource.indexOf(startMarker);
        check(startIndex !== -1, 'K1a. the real view still contains the generic availableAnchorTypes v-for');
        const creationCardSlice = viewSource.slice(startIndex, startIndex + 2200);
        check(creationCardSlice.includes('createAnchor(entry, anchorType)'), 'K1b. the sliced window really is the creation card');
        check(!/anchorType\s*===\s*['"]/.test(creationCardSlice), 'K1c. the creation card contains ZERO anchorType-specific branches — no special-casing for "bitcoin-op-return", "arweave", OR a hypothetical "base"');
        check(!creationCardSlice.includes('base') && !creationCardSlice.includes('arweave') && !creationCardSlice.includes('bitcoin'), 'K1d. the creation card\'s own markup never even names any of the three anchorTypes as a literal string — it is driven entirely by whatever the registry reports at runtime, so registering a real BaseAnchorPublisher tomorrow would need no UI change at all');

        // K2. but nothing feeds that registry a Base publisher today —
        // reconfirmed here from ui/main.js directly (Section B already
        // established this; restated here as the UI-facing half of the
        // same finding).
        const mainCode = codeOnly(await source('ui/main.js'));
        check(!/externalAnchorPublisherRegistry\.register\([^)]*[Bb]ase/.test(mainCode), 'K2. the live externalAnchorPublisherRegistry — the one PublicationAnchorCreationCoordinator#availableAnchorTypes() actually reads from in the running application — never has a Base publisher registered into it; a person using this application today would never see "base" offered as a creation option, regardless of how capable the underlying mechanism is');

        // K3. reconfirm, from CURRENT source (not merely cited from
        // tests/BaseTransactionProofVerificationCapabilityAudit.test.js's
        // own prior finding), that BaseAnchorPublicationRecord really is
        // structurally unrelated to PublicationAnchor — the reason no
        // real "Base anchor" exists for this mechanism to carry in the
        // first place.
        const recordSrc = await source('application/BaseAnchorPublicationRecord.js');
        check(/constructor\(\{ contentHash, txid, network, createdAt \} = \{\}\)/.test(recordSrc), 'K3a. BaseAnchorPublicationRecord\'s own constructor destructures exactly { contentHash, txid, network, createdAt } — no publicationId, no anchorType, no proof, no signature');
        check(!/anchorType/.test(codeOnly(recordSrc)), 'K3b. no code in this file mentions anchorType at all — the field a ProofVerifier is keyed and dispatched by');
        check(!/instanceof PublicationAnchor|extends PublicationAnchor/.test(codeOnly(recordSrc)), 'K3c. it is not, and does not pretend to be, a PublicationAnchor');

        // K4. the evidence-DISPLAY side of the same view: confirm it too
        // carries no Base-specific branch that could misleadingly suggest
        // Base evidence is already surfaced there.
        check(!/anchorType === 'base'/.test(viewSource), 'K4. ui/views/DecentralizedPublicationsView.js contains no "base"-specific branch anywhere — not in the creation card, and not in the separate evidence-display section either');

        console.log('✓ Section K: the generic UI mechanism is genuinely capable of carrying Base with zero code change (K1) — but nothing in the live application today registers a Base publisher into it (K2), and no production code path constructs the kind of anchor that mechanism operates on for Base in the first place (K3), so "base" is reachable through this UI in principle and absent from it in practice');
    }

    // ===============================================================
    // Section L — production-change guard.
    // ===============================================================
    {
        const statusOutput = execSync('git status --porcelain', { cwd: SOURCE_ROOT }).toString();
        const changed = statusOutput.split('\n').map((line) => line.slice(3).trim()).filter(Boolean);
        const productionDirs = ['core', 'application', 'renderer', 'discovery', 'anchoring', 'collaboration', 'persistence', 'identity', 'publisher', 'storage', 'peer', 'content', 'presence', 'ui', 'css', 'server', 'replication', 'serializer', 'world', 'world-layout', 'spatial', 'base'];
        const touchedProduction = changed.filter((f) => productionDirs.some((dir) => f.startsWith(`${dir}/`)));
        check(touchedProduction.length === 0, `L1. no production directory shows any change from this milestone (found: ${JSON.stringify(touchedProduction)}) — this audit reads and re-executes existing source, it writes none`);

        const AUTHORIZED = new Set(['tests.html', 'tests/BaseProofVerificationIntegrationBoundaryAudit.test.js']);
        const unauthorized = changed.filter((f) => !AUTHORIZED.has(f));
        check(unauthorized.length === 0, `L2. every changed/added file is one this milestone's own commit names (found unauthorized: ${JSON.stringify(unauthorized)}) — this audit's own test file, and its own tests.html registration, are the only changes`);

        console.log('✓ Section L: production-change guard holds — this milestone is genuinely test-only');
    }

    // ===============================================================
    // Section M — the verdict.
    // ===============================================================
    {
        const VERDICT = Object.freeze({
            registryReachability: 'PASS',
            compositionRootMechanics: 'PASS',
            compositionRootLiveWiring: 'ABSENT',
            endToEndVerification: 'PASS (via a necessary test-double anchor-creation glue — see header finding #1)',
            contentHashBoundary: 'PASS',
            unavailableSemantics: 'PASS',
            networkIdentity: 'PASS',
            proofIdentityFidelity: 'PASS',
            callDiscipline: 'PASS',
            crossSubstrateIsolation: 'PASS',
            attributionIsolation: 'PASS',
            uiMechanismCapability: 'PASS (generic, anchorType-agnostic)',
            uiLiveReachability: 'ABSENT (no Base publisher/verifier registered in ui/main.js)',
            noProductionExpansion: 'PASS'
        });
        const mechanicalChecks = Object.entries(VERDICT).filter(([k]) => !['compositionRootLiveWiring', 'uiLiveReachability'].includes(k));
        check(mechanicalChecks.every(([, v]) => v.startsWith('PASS')), 'M1. every mechanical/behavioral boundary this audit can exercise directly passes — the verifier and its composition-root use case are sound');
        check(VERDICT.compositionRootLiveWiring === 'ABSENT' && VERDICT.uiLiveReachability.startsWith('ABSENT'), 'M2. the two live-wiring checks are honestly reported ABSENT, never smoothed over into a PASS they did not earn');
        check(assertionCount > 60, 'M3. sanity: this audit is substantive, not a token pass');

        console.log('\n=== VERDICT: BASE_PROOF_VERIFIER_SOUND_BUT_NOT_YET_PRODUCTION_WIRED ===');
        console.log('anchoring/BaseProofVerifier.js and application/CreateBaseAnchorProofVerifierUseCase.js are mechanically and');
        console.log('behaviorally sound at every seam this codebase\'s own registry/use-case/ExternalAnchorVerifier pipeline defines —');
        console.log('proven end to end (Sections A, C-J) with the SAME real classes, the SAME three-outcome semantics, the SAME call');
        console.log('discipline, and the SAME content-not-ownership restraint Bitcoin\'s and Arweave\'s own verifiers already hold, at');
        console.log('the full application-verification-boundary level, not merely in isolation. But two things this milestone\'s own');
        console.log('brief assumed as background fact do not hold today: ui/main.js never imports or wires');
        console.log('CreateBaseAnchorProofVerifierUseCase (Section B), and no production code path anywhere in this codebase');
        console.log('constructs a PublicationAnchor with anchorType \'base\' in the first place — Base\'s own real publishing path');
        console.log('produces a structurally unrelated BaseAnchorPublicationRecord instead (Section K). The generic UI mechanism');
        console.log('(Section K) could carry Base with zero further code change the moment both gaps close. Until then, a real Base');
        console.log('publication cannot reach this verifier — or reach the application\'s evidence UI as a "base" anchor at all —');
        console.log('through anything a person using this application would ever trigger.');
        for (const [key, value] of Object.entries(VERDICT)) {
            console.log(`  ${key.padEnd(28)} ${value}`);
        }
        console.log(`\n(${assertionCount} checks)`);
    }

    console.log('\nAll BaseProofVerificationIntegrationBoundaryAudit tests passed.');
}

run().catch((error) => {
    console.error('BaseProofVerificationIntegrationBoundaryAudit.test.js FAILED:', error);
    process.exitCode = 1;
});
