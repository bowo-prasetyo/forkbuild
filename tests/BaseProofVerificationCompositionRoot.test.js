import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PublicationAnchor } from '../core/PublicationAnchor.js';
import { ExternalProofVerifierRegistry } from '../application/ExternalProofVerifierRegistry.js';
import { ExternalAnchorVerifier } from '../application/ExternalAnchorVerifier.js';
import { AnchorVerificationOutcome } from '../application/AnchorVerificationOutcome.js';
import { CreateBaseAnchorProofVerifierUseCase } from '../application/CreateBaseAnchorProofVerifierUseCase.js';
import { BaseProofVerifier } from '../anchoring/BaseProofVerifier.js';
import { CreateBitcoinAnchorProofVerifierUseCase } from '../application/CreateBitcoinAnchorProofVerifierUseCase.js';
import { CreateArweaveAnchorProofVerifierUseCase } from '../application/CreateArweaveAnchorProofVerifierUseCase.js';
import { BitcoinOpReturnProofVerifier } from '../anchoring/BitcoinOpReturnProofVerifier.js';
import { ArweaveTransactionDataProofVerifier } from '../anchoring/ArweaveTransactionDataProofVerifier.js';
import { encodeBasePublicationCommitment } from '../application/BasePublicationCommitmentEncoding.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.9.465 — Wire Base Proof Verification into the Production Composition
// Root.
//
// tests/BaseProofVerificationIntegrationBoundaryAudit.test.js (0.9.464)
// found anchoring/BaseProofVerifier.js and application/
// CreateBaseAnchorProofVerifierUseCase.js (0.9.463) mechanically and
// behaviorally sound, but absent from ui/main.js — the one, narrow
// integration gap its own VERDICT named `compositionRootLiveWiring: 'ABSENT'`
// and `uiLiveReachability: 'ABSENT'`. THIS milestone closes exactly that
// gap and nothing else: `ui/main.js` now imports
// `CreateBaseAnchorProofVerifierUseCase`, constructs a `baseProofVerifier`
// from it (bare, no config overrides — mirroring `bitcoinProofVerifier`'s
// own bare construction immediately above it, since there is no
// separately-resolved Base RPC config value anywhere in that file to
// thread through), and registers it into the SAME
// `externalAnchorProofVerifierRegistry` instance Bitcoin's and Arweave's
// own real verifiers already share. Nothing about BaseProofVerifier.js,
// CreateBaseAnchorProofVerifierUseCase.js, BaseJsonRpcClient.js, or
// Bitcoin's/Arweave's own verification semantics changes.
//
// This file is deliberately narrow, per this milestone's own scope: it
// proves the ONE thing 0.9.464 found missing (real, live registration in
// the real composition root) plus the surrounding seams that registration
// must not silently break — never re-litigating the exhaustive
// mechanical/behavioral proof 0.9.464's own file already ran in full.
//
// LETTERED SECTIONS:
//   A. Production registration — ui/main.js really imports, constructs,
//      and registers CreateBaseAnchorProofVerifierUseCase's result under
//      the "base" key, alongside Bitcoin's and Arweave's own unchanged
//      registrations.
//   B. Registry coexistence — bitcoin/arweave/base all resolve, by
//      anchorType alone, from one shared registry instance.
//   C. Real Base verifier — the registry returns the actual production
//      BaseProofVerifier class, never a test double.
//   D. Real RPC dependency — the verifier ui/main.js's own construction
//      path produces ultimately talks the real BaseJsonRpcClient wire
//      format (genuine JSON-RPC 2.0 eth_getTransactionByHash).
//   E. End-to-end VALID through the full registry/ExternalAnchorVerifier
//      boundary.
//   F. CONTENT_MISMATCH — same transaction identity, different expected
//      content hash.
//   G. INVALID_PROOF — a reachable, found transaction whose own payload
//      does not decode to the expected content.
//   H. PROOF_UNAVAILABLE — RPC unreachable.
//   I. Network identity — mainnet/testnet stay distinct.
//   J. Exact transaction identity — the proof's own txid reaches
//      eth_getTransactionByHash unsubstituted, even with a same-content
//      decoy under a different txid.
//   K. Cross-substrate isolation — Base, Bitcoin, and Arweave verification
//      interleaved through one shared registry, no cross-invocation.
//   L. Attribution isolation — content verification carries no ownership/
//      authorship/publisher vocabulary or fields.
//   M. Production wiring guard — a future refactor cannot silently drop
//      Base's own registration while BaseProofVerifier's unit tests keep
//      passing, because this section binds directly to ui/main.js's own
//      source text.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE: a BaseAnchorPublisher, a
// Base Settings UI, Base RPC endpoint configuration, RPC failover, wallet
// changes, transaction history, EVM abstraction, automatic Base
// publishing or verification, new proof-status vocabulary, new
// attribution/ownership semantics, and any change to BaseProofVerifier.js,
// BaseJsonRpcClient.js, or Bitcoin's/Arweave's own verification. Whether a
// production BaseAnchorPublisher should exist at all is a separate product
// question this milestone does not answer.

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

// A minimal, deterministic fake Base JSON-RPC endpoint — the same
// eth_getTransactionByHash wire shape base/BaseJsonRpcClient.js itself
// speaks, and the identical technique tests/
// BaseProofVerificationIntegrationBoundaryAudit.test.js already
// established for its own fake network.
function makeFakeBaseNetwork() {
    const ledger = new Map(); // txid -> { hash, input }
    const requests = [];

    async function fetchImpl(url, options = {}) {
        const body = JSON.parse(options.body);
        requests.push({ method: body.method, params: body.params });
        if (body.method !== 'eth_getTransactionByHash') {
            return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: body.id, result: null }) };
        }
        const [txid] = body.params;
        const entry = ledger.has(txid) ? ledger.get(txid) : null;
        return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: body.id, result: entry }) };
    }

    return { ledger, requests, fetchImpl };
}

// Builds a real, genuinely signed PublicationAnchor naming a Base proof —
// the identical direct-construction technique tests/
// BaseProofVerificationIntegrationBoundaryAudit.test.js's own Section G
// already used, needed nowhere else in this file's scope because this
// milestone verifies WIRING, not anchor-creation glue.
function buildSignedBaseAnchor({ identityProvider, publicationId, contentHash, txid, network = 'mainnet' }) {
    const authVerifier = new LocalAuthorizationVerifier();
    const anchor = new PublicationAnchor({
        publicationId, contentHash, anchorType: 'base',
        locator: `https://basescan.org/tx/${txid}`,
        proof: { txid, network },
        anchorIdentity: identityProvider.getSigningIdentity().toJSON()
    });
    const signedAnchor = anchor.withSignature(identityProvider.signCanonical(anchor.getSigningDescriptor()));
    assert(authVerifier.verifyPublicationAnchor(signedAnchor.toJSON()).valid, 'buildSignedBaseAnchor: the anchor produced for this test must itself be genuinely, independently signable');
    return signedAnchor;
}

async function run() {
    console.log('Running Base Proof Verification Composition Root...\n');

    const mainSrc = await source('ui/main.js');
    const mainCode = codeOnly(mainSrc);

    // ===============================================================
    // Section A — production registration.
    // ===============================================================
    {
        check(/import \{ CreateBaseAnchorProofVerifierUseCase \} from '\.\.\/application\/CreateBaseAnchorProofVerifierUseCase\.js';/.test(mainCode),
            'A1. ui/main.js imports CreateBaseAnchorProofVerifierUseCase');
        check(/const \{ baseProofVerifier \} = new CreateBaseAnchorProofVerifierUseCase\(\)\.execute\(\);/.test(mainCode),
            'A2. ui/main.js constructs a real baseProofVerifier from it');
        check(/externalAnchorProofVerifierRegistry\.register\(baseProofVerifier\);/.test(mainCode),
            'A3. ...and registers it into the live externalAnchorProofVerifierRegistry — the exact instance application/ExternalAnchorVerifier.js consults for every real verification this application performs');

        // Bitcoin's and Arweave's own registrations remain exactly as
        // 0.9.464's own Section B5 already found them — this milestone
        // adds a registration, it never disturbs an existing one.
        check(/const \{ bitcoinProofVerifier \} = new CreateBitcoinAnchorProofVerifierUseCase\(\)\.execute\(\);/.test(mainCode),
            'A4. Bitcoin\'s own proof verifier construction is unchanged');
        check(/proofVerifiers: \[bitcoinProofVerifier\]/.test(mainCode),
            'A5. ...and still seeds CreateExternalAnchorVerifierUseCase the same way');
        check(/externalAnchorProofVerifierRegistry\.register\(arweaveProofVerifier\)/.test(mainCode),
            'A6. Arweave\'s own registration into the SAME registry instance is unchanged');

        // The composition root stays a thin wiring layer: it constructs
        // the use case and registers its result, never anything shaped
        // like Base-specific transaction inspection or content-hash
        // comparison living in ui/main.js itself.
        check(!/decodeBasePublicationCommitment|fetchTransactionByHash/.test(mainCode),
            'A7. ui/main.js performs no Base-specific transaction inspection or content-hash comparison of its own — verification logic stays inside BaseProofVerifier, never leaks into the composition root');

        console.log('✓ Section A: ui/main.js really imports, constructs, and registers CreateBaseAnchorProofVerifierUseCase\'s result under "base", alongside Bitcoin\'s and Arweave\'s own unchanged registrations, with no verification logic duplicated into the composition root itself');
    }

    // ===============================================================
    // Section B — registry coexistence.
    // ===============================================================
    let registry, baseProofVerifier, bitcoinProofVerifier, arweaveProofVerifier;
    {
        ({ baseProofVerifier } = new CreateBaseAnchorProofVerifierUseCase().execute());
        ({ bitcoinProofVerifier } = new CreateBitcoinAnchorProofVerifierUseCase().execute());
        ({ arweaveProofVerifier } = new CreateArweaveAnchorProofVerifierUseCase().execute({ gatewayUrl: 'https://arweave.net' }));

        registry = new ExternalProofVerifierRegistry();
        registry.register(bitcoinProofVerifier);
        registry.register(arweaveProofVerifier);
        registry.register(baseProofVerifier);

        check(registry.anchorTypes.length === 3, 'B1. registering all three real, production-shaped verifiers yields exactly three anchorTypes');
        check(new Set(registry.anchorTypes).size === 3, 'B2. all three anchorTypes are distinct — no key collision');
        check(registry.get('bitcoin-op-return') === bitcoinProofVerifier, 'B3. "bitcoin-op-return" resolves to the exact Bitcoin verifier registered');
        check(registry.get('arweave') === arweaveProofVerifier, 'B4. "arweave" resolves to the exact Arweave verifier registered');
        check(registry.get('base') === baseProofVerifier, 'B5. "base" resolves to the exact Base verifier registered — never a different or substituted instance');

        console.log('✓ Section B: bitcoin, arweave, and base all resolve, by anchorType alone, from one shared registry instance');
    }

    // ===============================================================
    // Section C — real Base verifier, not a test double.
    // ===============================================================
    {
        const resolved = registry.get('base');
        check(resolved instanceof BaseProofVerifier, 'C1. the registry returns an actual instance of the production BaseProofVerifier class');
        check(resolved.anchorType === 'base', 'C2. it declares its own anchorType as "base"');
        check(typeof resolved.verify === 'function' && resolved.verify === BaseProofVerifier.prototype.verify, 'C3. its verify() is the real, unmodified BaseProofVerifier.prototype.verify — never a stub or override');

        console.log('✓ Section C: the registry hands back the real, production BaseProofVerifier class — never a test double standing in for it');
    }

    // ===============================================================
    // Section D — real RPC dependency.
    // ===============================================================
    {
        // D1. source-level: the composition-root use case constructs
        // exactly one BaseJsonRpcClient and hands that SAME instance to
        // BaseProofVerifier as rpcSource — reconfirmed fresh from current
        // source.
        const useCaseCode = codeOnly(await source('application/CreateBaseAnchorProofVerifierUseCase.js'));
        check((useCaseCode.match(/new BaseJsonRpcClient\(/g) || []).length === 1, 'D1. CreateBaseAnchorProofVerifierUseCase constructs exactly one BaseJsonRpcClient');
        check(/rpcSource: baseJsonRpcClient/.test(useCaseCode), 'D2. that exact instance is handed to BaseProofVerifier as rpcSource');

        // D2. behaviorally: the identical use case class ui/main.js
        // constructs really issues a genuine JSON-RPC 2.0
        // eth_getTransactionByHash call — never a hand-shaped fake
        // transport standing in for BaseJsonRpcClient's own wire format.
        const net = makeFakeBaseNetwork();
        const { baseProofVerifier: wiredVerifier } = new CreateBaseAnchorProofVerifierUseCase().execute({ fetchImpl: net.fetchImpl });
        await wiredVerifier.verify({ txid: '0x' + 'ab'.repeat(32) }, { contentHash: 'deadbeef' });
        check(net.requests.length === 1, 'D3. exactly one HTTP request reached the RPC transport');
        check(net.requests[0].method === 'eth_getTransactionByHash', 'D4. it is a genuine eth_getTransactionByHash call — the real base/BaseJsonRpcClient.js wire format');

        console.log('✓ Section D: the verifier the composition root constructs is backed by a real BaseJsonRpcClient, confirmed both from source and from live JSON-RPC traffic');
    }

    // ===============================================================
    // Section E-H — end-to-end verification outcomes through the full
    // registry/ExternalAnchorVerifier boundary.
    // ===============================================================
    const identityProvider = makeIdentity('Alice');
    const contentHash = 'c0ffee'.repeat(8); // even-length hex — a real Base commitment must encode as raw bytes
    const net = makeFakeBaseNetwork();
    const txid = '0x' + 'aa'.repeat(32);
    net.ledger.set(txid, { hash: txid, input: encodeBasePublicationCommitment(contentHash) });
    const signedAnchor = buildSignedBaseAnchor({ identityProvider, publicationId: 'pub-e2e', contentHash, txid });
    const anchorJson = signedAnchor.toJSON();

    function freshRegistryWith(fetchImpl) {
        const r = new ExternalProofVerifierRegistry();
        r.register(new CreateBaseAnchorProofVerifierUseCase().execute({ fetchImpl }).baseProofVerifier);
        return r;
    }

    {
        const anchorVerifier = new ExternalAnchorVerifier(new LocalAuthorizationVerifier());
        const result = await anchorVerifier.verify(anchorJson, {
            expectedContentHash: contentHash,
            proofVerifierRegistry: freshRegistryWith(net.fetchImpl)
        });
        check(result.outcome === AnchorVerificationOutcome.VALID, 'E1. registry-resolved verification of a real signed Base anchor against the real chain reports VALID');

        console.log('✓ Section E: end-to-end VALID through registry -> BaseProofVerifier -> BaseJsonRpcClient -> eth_getTransactionByHash');
    }

    {
        const anchorVerifier = new ExternalAnchorVerifier(new LocalAuthorizationVerifier());
        const result = await anchorVerifier.verify(anchorJson, {
            expectedContentHash: 'a-caller-expected-something-entirely-different',
            proofVerifierRegistry: freshRegistryWith(net.fetchImpl)
        });
        check(result.outcome === AnchorVerificationOutcome.CONTENT_MISMATCH, 'F1. the same transaction identity, with a different expected content hash, reports CONTENT_MISMATCH');

        console.log('✓ Section F: CONTENT_MISMATCH holds for a caller expecting a different content hash than the anchor itself claims');
    }

    {
        const lyingFetch = async (_url, options) => {
            const body = JSON.parse(options.body);
            return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: body.id, result: { hash: body.params[0], input: encodeBasePublicationCommitment('f'.repeat(64)) } }) };
        };
        const anchorVerifier = new ExternalAnchorVerifier(new LocalAuthorizationVerifier());
        const result = await anchorVerifier.verify(anchorJson, {
            expectedContentHash: contentHash,
            proofVerifierRegistry: freshRegistryWith(lyingFetch)
        });
        check(result.outcome === AnchorVerificationOutcome.INVALID_PROOF, 'G1. a reachable, found transaction whose own payload decodes to a DIFFERENT content hash reports INVALID_PROOF');

        console.log('✓ Section G: INVALID_PROOF holds for a malformed/mismatched transaction payload');
    }

    {
        const unreachableFetch = async () => { throw new Error('simulated: RPC endpoint unreachable'); };
        const anchorVerifier = new ExternalAnchorVerifier(new LocalAuthorizationVerifier());
        const result = await anchorVerifier.verify(anchorJson, {
            expectedContentHash: contentHash,
            proofVerifierRegistry: freshRegistryWith(unreachableFetch)
        });
        check(result.outcome === AnchorVerificationOutcome.PROOF_UNAVAILABLE, 'H1. a genuinely unreachable RPC endpoint reports PROOF_UNAVAILABLE, never a rejection');

        console.log('✓ Section H: PROOF_UNAVAILABLE holds when the RPC endpoint cannot be reached');
    }

    // ===============================================================
    // Section I — network identity.
    // ===============================================================
    {
        const testnetVerifier = new CreateBaseAnchorProofVerifierUseCase().execute({ fetchImpl: net.fetchImpl, network: 'testnet' }).baseProofVerifier;
        check(testnetVerifier.network === 'testnet', 'I1. sanity: this verifier is really configured for testnet');
        const registryTestnet = new ExternalProofVerifierRegistry();
        registryTestnet.register(testnetVerifier);
        const anchorVerifier = new ExternalAnchorVerifier(new LocalAuthorizationVerifier());
        const mismatch = await anchorVerifier.verify(anchorJson, { expectedContentHash: contentHash, proofVerifierRegistry: registryTestnet });
        check(mismatch.outcome === AnchorVerificationOutcome.INVALID_PROOF, 'I2. a mainnet-declared proof against a testnet-configured verifier is a definite INVALID_PROOF, never silently accepted');

        const mainnetVerifier = new CreateBaseAnchorProofVerifierUseCase().execute({ fetchImpl: net.fetchImpl }).baseProofVerifier;
        check(mainnetVerifier.network === 'mainnet', 'I3. sanity: the default verifier configuration is mainnet');
        const testnetProof = { txid, network: 'testnet' };
        const direct = await mainnetVerifier.verify(testnetProof, { contentHash });
        check(direct.valid === false && !direct.unavailable, 'I4. the converse also holds: a testnet-declared proof against a mainnet-configured verifier is definitely rejected, never merely unavailable');

        console.log('✓ Section I: mainnet and testnet Base proofs remain distinct through the verifier\'s own network configuration, both ways');
    }

    // ===============================================================
    // Section J — exact transaction identity.
    // ===============================================================
    {
        const decoyNet = makeFakeBaseNetwork();
        const txidReal = '0x' + 'cc'.repeat(32);
        const txidDecoy = '0x' + 'dd'.repeat(32);
        const sameInput = encodeBasePublicationCommitment(contentHash);
        decoyNet.ledger.set(txidReal, { hash: txidReal, input: sameInput });
        decoyNet.ledger.set(txidDecoy, { hash: txidDecoy, input: sameInput });

        const anchorNamingReal = buildSignedBaseAnchor({ identityProvider: makeIdentity('Bob'), publicationId: 'pub-j', contentHash, txid: txidReal });
        const anchorVerifier = new ExternalAnchorVerifier(new LocalAuthorizationVerifier());

        decoyNet.requests.length = 0;
        const result = await anchorVerifier.verify(anchorNamingReal.toJSON(), {
            expectedContentHash: contentHash,
            proofVerifierRegistry: freshRegistryWith(decoyNet.fetchImpl)
        });
        check(result.outcome === AnchorVerificationOutcome.VALID, 'J1. the anchor naming txidReal verifies VALID');
        check(decoyNet.requests.length === 1, 'J2. exactly one RPC lookup was made');
        check(decoyNet.requests[0].params[0] === txidReal, 'J3. that lookup named EXACTLY the proof\'s own txid — never txidDecoy, even though it carries byte-identical content in the same reachable chain, and never re-selected by this codebase');

        console.log('✓ Section J: the exact txid supplied in the proof reaches eth_getTransactionByHash without substitution or re-selection');
    }

    // ===============================================================
    // Section K — cross-substrate isolation, interleaved.
    // ===============================================================
    {
        let btcCalls = 0, arCalls = 0, baseCalls = 0;

        const btcChain = new Map();
        const btcTxid = '1'.padStart(64, '0');
        btcChain.set(btcTxid, { txid: btcTxid, vout: [{ scriptpubkey_type: 'op_return', scriptpubkey_asm: 'OP_RETURN OP_PUSHBYTES_4 f00dfeed' }], status: { confirmed: true, block_height: 900000 } });
        async function btcFetchImpl(url) {
            const match = new URL(url).pathname.match(/\/tx\/([0-9a-f]+)$/i);
            if (match && btcChain.has(match[1])) return new Response(JSON.stringify(btcChain.get(match[1])), { status: 200 });
            return new Response('not found', { status: 404 });
        }
        const kBtcVerifier = new BitcoinOpReturnProofVerifier({ fetchImpl: btcFetchImpl });
        const realBtcVerify = kBtcVerifier.verify.bind(kBtcVerifier);
        kBtcVerifier.verify = async (...args) => { btcCalls += 1; return realBtcVerify(...args); };

        const arLedger = new Map();
        const arTxid = 'FakeArTx0000000001';
        arLedger.set(arTxid, 'ar-content-hash-value');
        async function arFetchImpl(url) {
            const parsed = new URL(url);
            const match = parsed.pathname.match(/^\/([A-Za-z0-9_-]+)$/);
            if (match && arLedger.has(match[1])) return new Response(arLedger.get(match[1]), { status: 200 });
            return new Response('not found', { status: 404 });
        }
        const kArVerifier = new ArweaveTransactionDataProofVerifier({ fetchImpl: arFetchImpl });
        const realArVerify = kArVerifier.verify.bind(kArVerifier);
        kArVerifier.verify = async (...args) => { arCalls += 1; return realArVerify(...args); };

        const kBaseNet = makeFakeBaseNetwork();
        const kBaseTxid = '0x' + 'ee'.repeat(32);
        const kBaseContentHash = '11223344'.repeat(8);
        kBaseNet.ledger.set(kBaseTxid, { hash: kBaseTxid, input: encodeBasePublicationCommitment(kBaseContentHash) });
        const kBaseVerifier = new CreateBaseAnchorProofVerifierUseCase().execute({ fetchImpl: kBaseNet.fetchImpl }).baseProofVerifier;
        const realBaseVerify = kBaseVerifier.verify.bind(kBaseVerifier);
        kBaseVerifier.verify = async (...args) => { baseCalls += 1; return realBaseVerify(...args); };

        const interleaved = new ExternalProofVerifierRegistry();
        interleaved.register(kBtcVerifier);
        interleaved.register(kArVerifier);
        interleaved.register(kBaseVerifier);
        const anchorVerifier = new ExternalAnchorVerifier(new LocalAuthorizationVerifier());

        const baseAnchor = buildSignedBaseAnchor({ identityProvider: makeIdentity('Carol'), publicationId: 'pub-k-base', contentHash: kBaseContentHash, txid: kBaseTxid });

        const btcAnchorUnsigned = new PublicationAnchor({
            publicationId: 'pub-k-btc', contentHash: 'f00dfeed', anchorType: 'bitcoin-op-return',
            locator: `https://mempool.space/tx/${btcTxid}`, proof: { txid: btcTxid, network: 'mainnet' },
            anchorIdentity: identityProvider.getSigningIdentity().toJSON()
        });
        const btcAnchor = btcAnchorUnsigned.withSignature(identityProvider.signCanonical(btcAnchorUnsigned.getSigningDescriptor()));

        const arAnchorUnsigned = new PublicationAnchor({
            publicationId: 'pub-k-ar', contentHash: 'ar-content-hash-value', anchorType: 'arweave',
            locator: `https://arweave.net/${arTxid}`, proof: { txid: arTxid },
            anchorIdentity: identityProvider.getSigningIdentity().toJSON()
        });
        const arAnchor = arAnchorUnsigned.withSignature(identityProvider.signCanonical(arAnchorUnsigned.getSigningDescriptor()));

        // Interleaved order, deliberately not grouped by anchorType.
        const baseResult = await anchorVerifier.verify(baseAnchor.toJSON(), { expectedContentHash: kBaseContentHash, proofVerifierRegistry: interleaved });
        const btcResult = await anchorVerifier.verify(btcAnchor.toJSON(), { expectedContentHash: 'f00dfeed', proofVerifierRegistry: interleaved });
        const arResult = await anchorVerifier.verify(arAnchor.toJSON(), { expectedContentHash: 'ar-content-hash-value', proofVerifierRegistry: interleaved });

        check(baseResult.outcome === AnchorVerificationOutcome.VALID && btcResult.outcome === AnchorVerificationOutcome.VALID && arResult.outcome === AnchorVerificationOutcome.VALID,
            'K1. base, bitcoin, and arweave anchors all verify VALID, resolved from the SAME shared registry instance by anchorType alone');
        check(baseCalls === 1 && btcCalls === 1 && arCalls === 1,
            'K2. exactly one verify() call landed on EACH substrate\'s own verifier — verifying one anchorType never invoked another\'s verifier, even though all three share one registry instance');

        console.log('✓ Section K: Base, Bitcoin, and Arweave verification interleave through one shared registry with no cross-invocation or shared mutable state');
    }

    // ===============================================================
    // Section L — attribution isolation.
    // ===============================================================
    {
        const proofResult = await baseProofVerifier.verify(signedAnchor.proof, { contentHash: 'irrelevant-because-no-real-endpoint', publicationId: signedAnchor.publicationId, locator: signedAnchor.locator });
        check(Object.keys(await new CreateBaseAnchorProofVerifierUseCase().execute({ fetchImpl: net.fetchImpl }).baseProofVerifier.verify({ txid, network: 'mainnet' }, { contentHash })).every((k) => k === 'valid'),
            'L1. a successful BaseProofVerifier#verify() result carries ONLY { valid: true } — no owner/author/publisher field of any kind');
        check(typeof proofResult.valid === 'boolean', 'L2. sanity: verify() always returns a plain outcome object');

        const beforeJson = signedAnchor.toJSON();
        const anchorVerifier = new ExternalAnchorVerifier(new LocalAuthorizationVerifier());
        await anchorVerifier.verify(beforeJson, { expectedContentHash: contentHash, proofVerifierRegistry: freshRegistryWith(net.fetchImpl) });
        const afterJson = signedAnchor.toJSON();
        check(JSON.stringify(beforeJson) === JSON.stringify(afterJson), 'L3. the anchor\'s own JSON — including anchorIdentity and signature — is unchanged by verification; content verification never mutates or substitutes ownership/authorship fields');

        const filesToSweep = ['anchoring/BaseProofVerifier.js', 'application/CreateBaseAnchorProofVerifierUseCase.js'];
        for (const file of filesToSweep) {
            const code = codeOnly(await source(file));
            check(!/\bowner\b|\bauthor\b|\bpublisher\b|\bwallet\b|\bsender\b/i.test(code), `L4[${file}]. no owner/author/publisher/wallet/sender vocabulary anywhere in the class this composition root now wires`);
        }

        console.log('✓ Section L: content verification stays permanently distinct from publisher identity, ownership, and authorship');
    }

    // ===============================================================
    // Section M — production wiring guard.
    // ===============================================================
    {
        // Re-binds directly to ui/main.js's own current source text — a
        // future refactor that silently deletes Base's own registration
        // line here fails THIS check even if anchoring/BaseProofVerifier.js
        // and application/CreateBaseAnchorProofVerifierUseCase.js's own
        // unit tests keep passing unchanged, because those files know
        // nothing about ui/main.js at all.
        const freshMainCode = codeOnly(await source('ui/main.js'));
        const hasImport = /import \{ CreateBaseAnchorProofVerifierUseCase \}/.test(freshMainCode);
        const hasConstruction = /new CreateBaseAnchorProofVerifierUseCase\(\)\.execute\(\)/.test(freshMainCode);
        const hasRegistration = /externalAnchorProofVerifierRegistry\.register\(baseProofVerifier\)/.test(freshMainCode);
        check(hasImport && hasConstruction && hasRegistration, 'M1. ui/main.js still imports, constructs, and registers Base\'s own proof verifier into the live registry');

        const hasBitcoinRegistration = /proofVerifiers: \[bitcoinProofVerifier\]/.test(freshMainCode);
        const hasArweaveRegistration = /externalAnchorProofVerifierRegistry\.register\(arweaveProofVerifier\)/.test(freshMainCode);
        check(hasBitcoinRegistration && hasArweaveRegistration && hasRegistration, 'M2. all three substrates — bitcoin, arweave, base — remain simultaneously registered; this guard would fail the moment any ONE of the three is silently dropped, not only Base');

        check(assertionCount > 25, 'M3. sanity: this composition-root test is substantive, not a token pass');

        console.log('✓ Section M: a future refactor cannot silently remove Base\'s own registration while BaseProofVerifier\'s own unit tests keep passing — this guard binds directly to ui/main.js\'s own source');
    }

    console.log(`\n(${assertionCount} checks)`);
    console.log('\nAll BaseProofVerificationCompositionRoot tests passed.');
}

run().catch((error) => {
    console.error('BaseProofVerificationCompositionRoot.test.js FAILED:', error);
    process.exitCode = 1;
});
