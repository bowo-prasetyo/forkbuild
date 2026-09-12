import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BaseProofVerifier } from '../anchoring/BaseProofVerifier.js';
import { CreateBaseAnchorProofVerifierUseCase } from '../application/CreateBaseAnchorProofVerifierUseCase.js';
import { BasePublicationTransactionPlanner } from '../base/BasePublicationTransactionPlanner.js';
import { encodeBasePublicationCommitment } from '../application/BasePublicationCommitmentEncoding.js';
import { BitcoinOpReturnProofVerifier } from '../anchoring/BitcoinOpReturnProofVerifier.js';
import { ArweaveTransactionDataProofVerifier } from '../anchoring/ArweaveTransactionDataProofVerifier.js';

// 0.9.463 — Base Transaction Proof Verifier.
//
// Deterministic, network-free coverage of anchoring/BaseProofVerifier.js's
// own verification behavior — every scenario below runs against an
// injected fake `rpcSource`, never a live Base RPC endpoint, the identical
// technique tests/BitcoinOpReturnProofVerifier.test.js and tests/
// ArweaveAnchorProviderImplementation.test.js already establish for their
// own chains. tests/BaseTransactionProofVerificationCapabilityAudit.test.js
// (0.9.461) found every non-network seam this class needs already existed;
// tests/BaseTransactionPayloadRpcRead.test.js (0.9.462) closed the one
// concrete gap it named (`fetchTransactionByHash()`). This file exercises
// the class both milestones were building toward.
//
//   Section A: verifier construction — an injected rpcSource is required;
//              this class never constructs its own transport
//   Section B: structural proof validation — a missing/malformed proof,
//              txid, network mismatch, or missing contentHash is a
//              DEFINITE rejection, never "unavailable"
//   Section C: valid proof — a REAL production publisher→verifier round
//              trip through base/BasePublicationTransactionPlanner.js's
//              own plan() and application/
//              BasePublicationCommitmentEncoding.js's own encoder, never a
//              hand-constructed matching string
//   Section D: content mismatch — a found transaction whose decoded
//              content hash does not match the expected one
//   Section E: transaction not found — `{ available: true, found: false }`
//              maps to the established unavailable/invalid-proof
//              semantics, never a rejection
//   Section F: endpoint unavailable — `{ available: false }` (and a
//              throwing rpcSource) propagate as the established
//              unavailable result
//   Section G: malformed transaction input — a found transaction whose
//              `input` cannot decode as a Base publication commitment is a
//              DEFINITE rejection, never an unhandled throw
//   Section H: proof identity & call discipline — verify() requests
//              exactly the txid named by the proof, and makes exactly one
//              rpcSource call, with no retry/polling of any kind
//   Section I: the content-not-ownership invariant, and cross-substrate
//              isolation from Bitcoin/Arweave
//   Section J: architectural guard (no wallet/signing/broadcast/gas/
//              persistence/provider-selection/retry code) and the
//              composition-root use case, application/
//              CreateBaseAnchorProofVerifierUseCase.js
//
// See docs/Principles.md, "A Proof Verifier Reports 'Cannot Presently
// Verify' Separately From 'Proof Is Wrong' (0.8.1)."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = fileURLToPath(new URL('../', import.meta.url));
async function source(relativePath) {
    return readFile(path.join(SOURCE_ROOT, relativePath), 'utf8');
}
function codeOnly(src) {
    return src.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

const ADDRESS = '0x' + '11'.repeat(20);
const CONTENT_HASH = 'deadbeef'.repeat(8); // 64 hex chars, even length
const OTHER_CONTENT_HASH = 'cafebabe'.repeat(8);
const TXID_A = '0x' + 'aa'.repeat(32);
const TXID_B = '0x' + 'bb'.repeat(32);

// A fake rpcSource shaped exactly like base/BaseJsonRpcClient.js's own
// fetchTransactionByHash() contract — never a real network call. Records
// every txid requested so tests can assert call discipline.
function fakeRpcSource({ transactions = {}, available = true, reason = 'simulated: endpoint unreachable', throwError = null } = {}) {
    const calls = [];
    return {
        calls,
        async fetchTransactionByHash(txid) {
            calls.push(txid);
            if (throwError) throw throwError;
            if (!available) return { available: false, reason };
            if (!Object.prototype.hasOwnProperty.call(transactions, txid)) return { available: true, found: false };
            return { available: true, found: true, hash: txid, ...transactions[txid] };
        }
    };
}

// The real production planner rpcSource — priced entirely in-memory, no
// network — used only to drive base/BasePublicationTransactionPlanner.js's
// own real plan() logic for Section C's flagship round trip.
const plannerRpcSource = {
    async fetchTransactionCount() { return { available: true, nonce: 3 }; },
    async fetchGasEstimate() { return { available: true, gasLimit: 21000 }; },
    async fetchGasPrice() { return { available: true, gasPriceWei: '1000000000' }; },
    async fetchMaxPriorityFeePerGas() { return { available: true, maxPriorityFeePerGasWei: '1000000000' }; }
};

async function planRealBaseTransaction(contentHash) {
    const planner = new BasePublicationTransactionPlanner({ rpcSource: plannerRpcSource });
    const plan = await planner.plan({
        contentHash, address: ADDRESS, network: 'mainnet', chainId: 8453, nativeBalanceWei: '1000000000000000000000'
    });
    assert(plan.built === true, 'planRealBaseTransaction: the fixture plan itself must build successfully');
    return plan;
}

async function run() {
    console.log('Running Base Transaction Proof Verifier tests...\n');

    // ---------------------------------------------------------------
    // Section A — verifier construction.
    // ---------------------------------------------------------------
    {
        let threw = false;
        try { new BaseProofVerifier(); } catch (_e) { threw = true; }
        assert(threw, '1. constructing without an rpcSource throws');

        let threw2 = false;
        try { new BaseProofVerifier({ rpcSource: { fetchTransactionByHash: 'not a function' } }); } catch (_e) { threw2 = true; }
        assert(threw2, '2. constructing with a malformed rpcSource (no callable fetchTransactionByHash) throws');

        const rpcSource = fakeRpcSource();
        const verifier = new BaseProofVerifier({ rpcSource });
        assert(verifier.anchorType === 'base', '3. anchorType is the fixed, self-declared string "base"');
        assert(verifier.network === 'mainnet', '4. network defaults to "mainnet"');
        assert(verifier instanceof BitcoinOpReturnProofVerifier === false, '5. BaseProofVerifier is not a BitcoinOpReturnProofVerifier');

        const verifierCode = codeOnly(await source('anchoring/BaseProofVerifier.js'));
        assert(!/new BaseJsonRpcClient/.test(verifierCode), '6. BaseProofVerifier itself never constructs a BaseJsonRpcClient — the rpcSource is always injected');
        assert(/extends ProofVerifier/.test(verifierCode), '7. extends ProofVerifier directly, the identical base class Bitcoin\'s and Arweave\'s own verifiers extend');
    }
    console.log('✓ Section A: verifier construction');

    // ---------------------------------------------------------------
    // Section B — structural proof validation: definite rejections,
    // never "unavailable."
    // ---------------------------------------------------------------
    {
        const rpcSource = fakeRpcSource({ transactions: { [TXID_A]: { input: encodeBasePublicationCommitment(CONTENT_HASH) } } });
        const verifier = new BaseProofVerifier({ rpcSource });

        const r1 = await verifier.verify(null, { contentHash: CONTENT_HASH });
        assert(r1.valid === false && !r1.unavailable, '8. a null proof is a definite rejection');

        const r2 = await verifier.verify({}, { contentHash: CONTENT_HASH });
        assert(r2.valid === false && !r2.unavailable, '9. a proof missing txid is a definite rejection');

        const r3 = await verifier.verify({ txid: 'not-a-hash' }, { contentHash: CONTENT_HASH });
        assert(r3.valid === false && !r3.unavailable, '10. a malformed txid is a definite rejection');

        const r4 = await verifier.verify({ txid: TXID_A, network: 'testnet' }, { contentHash: CONTENT_HASH });
        assert(r4.valid === false && !r4.unavailable, '11. a proof declaring a network this verifier does not check is a definite rejection');
        assert(rpcSource.calls.length === 0, '12. a network mismatch never even reaches the rpcSource — rejected before any RPC call');

        const r5 = await verifier.verify({ txid: TXID_A }, {});
        assert(r5.valid === false && !r5.unavailable, '13. no contentHash supplied to verify against is a definite rejection');

        assert(rpcSource.calls.length === 0, '14. none of the structurally-invalid proofs above ever reached the rpcSource');
    }
    console.log('✓ Section B: structural proof validation');

    // ---------------------------------------------------------------
    // Section C — valid proof: a REAL production publisher→verifier
    // round trip, never a hand-constructed matching string.
    // ---------------------------------------------------------------
    {
        // The publisher side: base/BasePublicationTransactionPlanner.js's
        // own real plan() logic, calling application/
        // BasePublicationCommitmentEncoding.js's own real encoder — this
        // test never writes '0x' + CONTENT_HASH itself.
        const plan = await planRealBaseTransaction(CONTENT_HASH);
        assert(plan.data === encodeBasePublicationCommitment(CONTENT_HASH), '15. sanity: the planner\'s own data field is the production encoder\'s own output');

        // The verifier side: a fake rpcSource standing in only for the
        // network transport — everything else (encode, decode, compare)
        // is the real production code path.
        const rpcSource = fakeRpcSource({ transactions: { [TXID_A]: { input: plan.data } } });
        const verifier = new BaseProofVerifier({ rpcSource });

        const result = await verifier.verify({ txid: TXID_A }, { contentHash: CONTENT_HASH });
        assert(result.valid === true, '16. a transaction whose real, planner-produced input decodes to the expected contentHash verifies successfully');
        assert(!('reason' in result) && !('unavailable' in result), '17. a successful verification carries no reason/unavailable field');

        // Explicit default network, and explicit matching network, both
        // succeed identically.
        const resultDefault = await verifier.verify({ txid: TXID_A }, { contentHash: CONTENT_HASH });
        const resultExplicit = await verifier.verify({ txid: TXID_A, network: 'mainnet' }, { contentHash: CONTENT_HASH });
        assert(resultDefault.valid === true && resultExplicit.valid === true, '18. omitting proof.network (default "mainnet") and stating it explicitly both verify identically');

        // A second, independently-planned publication with a different
        // contentHash round-trips correctly too — not a coincidence of
        // one fixture.
        const plan2 = await planRealBaseTransaction(OTHER_CONTENT_HASH);
        const rpcSource2 = fakeRpcSource({ transactions: { [TXID_B]: { input: plan2.data } } });
        const result2 = await new BaseProofVerifier({ rpcSource: rpcSource2 }).verify({ txid: TXID_B }, { contentHash: OTHER_CONTENT_HASH });
        assert(result2.valid === true, '19. a second, independently-produced publication/contentHash pair also round-trips correctly');
    }
    console.log('✓ Section C: valid proof (real production round trip)');

    // ---------------------------------------------------------------
    // Section D — content mismatch.
    // ---------------------------------------------------------------
    {
        const plan = await planRealBaseTransaction(CONTENT_HASH);
        const rpcSource = fakeRpcSource({ transactions: { [TXID_A]: { input: plan.data } } });
        const verifier = new BaseProofVerifier({ rpcSource });

        const result = await verifier.verify({ txid: TXID_A }, { contentHash: OTHER_CONTENT_HASH });
        assert(result.valid === false, '20. a transaction carrying a different contentHash than expected is rejected');
        assert(!result.unavailable, '21. a content mismatch is a DEFINITE rejection — the transaction WAS reachable and gave a real answer');
        assert(typeof result.reason === 'string' && result.reason.length > 0, '22. a content mismatch carries a human-readable reason');
    }
    console.log('✓ Section D: content mismatch');

    // ---------------------------------------------------------------
    // Section E — transaction not found.
    // ---------------------------------------------------------------
    {
        const rpcSource = fakeRpcSource({ transactions: {} });
        const verifier = new BaseProofVerifier({ rpcSource });
        const result = await verifier.verify({ txid: TXID_A }, { contentHash: CONTENT_HASH });
        assert(result.valid === false && result.unavailable === true, '23. a not-found transaction (available:true, found:false) maps to unavailable, never a rejection');
        assert(typeof result.reason === 'string', '24. an unavailable result carries a reason');
    }
    console.log('✓ Section E: transaction not found');

    // ---------------------------------------------------------------
    // Section F — endpoint unavailable / transport failure.
    // ---------------------------------------------------------------
    {
        const rpcSource = fakeRpcSource({ available: false, reason: 'simulated: 503 from endpoint' });
        const verifier = new BaseProofVerifier({ rpcSource });
        const result = await verifier.verify({ txid: TXID_A }, { contentHash: CONTENT_HASH });
        assert(result.valid === false && result.unavailable === true, '25. { available: false } from the rpcSource maps to unavailable');
        assert(result.reason === 'simulated: 503 from endpoint', '26. the rpcSource\'s own reason is carried through');

        const throwingSource = fakeRpcSource({ throwError: new Error('simulated: rpcSource itself threw') });
        const verifier2 = new BaseProofVerifier({ rpcSource: throwingSource });
        let threw = false;
        let thrownResult = null;
        try { thrownResult = await verifier2.verify({ txid: TXID_A }, { contentHash: CONTENT_HASH }); } catch (_e) { threw = true; }
        assert(!threw, '27. verify() never throws even when the injected rpcSource itself throws');
        assert(thrownResult.valid === false && thrownResult.unavailable === true, '28. a throwing rpcSource is treated as unavailable, not a rejection');
    }
    console.log('✓ Section F: endpoint unavailable / transport failure');

    // ---------------------------------------------------------------
    // Section G — malformed transaction input: a definite rejection,
    // never an unhandled throw.
    // ---------------------------------------------------------------
    {
        const rpcSource = fakeRpcSource({ transactions: { [TXID_A]: { input: 'not-hex-at-all' } } });
        const verifier = new BaseProofVerifier({ rpcSource });
        let threw = false;
        let result = null;
        try { result = await verifier.verify({ txid: TXID_A }, { contentHash: CONTENT_HASH }); } catch (_e) { threw = true; }
        assert(!threw, '29. a malformed (non-hex) input never causes verify() to throw');
        assert(result.valid === false && !result.unavailable, '30. a malformed input is a DEFINITE rejection — the transaction WAS found, it simply does not carry a valid commitment');

        // Odd-length hex — decodeBasePublicationCommitment's own even-
        // length requirement.
        const rpcSource2 = fakeRpcSource({ transactions: { [TXID_A]: { input: '0xabc' } } });
        const result2 = await new BaseProofVerifier({ rpcSource: rpcSource2 }).verify({ txid: TXID_A }, { contentHash: CONTENT_HASH });
        assert(result2.valid === false && !result2.unavailable, '31. odd-length hex input is likewise a definite rejection, not a throw');

        // Missing 0x prefix entirely.
        const rpcSource3 = fakeRpcSource({ transactions: { [TXID_A]: { input: CONTENT_HASH } } });
        const result3 = await new BaseProofVerifier({ rpcSource: rpcSource3 }).verify({ txid: TXID_A }, { contentHash: CONTENT_HASH });
        assert(result3.valid === false && !result3.unavailable, '32. an input missing its 0x prefix is a definite rejection');
    }
    console.log('✓ Section G: malformed transaction input');

    // ---------------------------------------------------------------
    // Section H — proof identity & call discipline: exactly the named
    // txid, exactly one RPC call, no retry/polling/search.
    // ---------------------------------------------------------------
    {
        const plan = await planRealBaseTransaction(CONTENT_HASH);
        const otherPlan = await planRealBaseTransaction(OTHER_CONTENT_HASH);
        const rpcSource = fakeRpcSource({
            transactions: {
                [TXID_A]: { input: plan.data },
                [TXID_B]: { input: otherPlan.data }
            }
        });
        const verifier = new BaseProofVerifier({ rpcSource });

        await verifier.verify({ txid: TXID_A }, { contentHash: CONTENT_HASH });
        assert(rpcSource.calls.length === 1, '33. exactly one rpcSource call was made for one verify() call');
        assert(rpcSource.calls[0] === TXID_A, '34. the exact txid named by the proof was requested — never TXID_B, never any other transaction');

        rpcSource.calls.length = 0;
        await verifier.verify({ txid: TXID_B }, { contentHash: OTHER_CONTENT_HASH });
        assert(rpcSource.calls.length === 1 && rpcSource.calls[0] === TXID_B, '35. requesting a different proof requests exactly that proof\'s own txid — no memory of the previous call, no fallback search');

        // Not-found and unavailable paths are likewise exactly one call.
        rpcSource.calls.length = 0;
        await verifier.verify({ txid: '0x' + 'ff'.repeat(32) }, { contentHash: CONTENT_HASH });
        assert(rpcSource.calls.length === 1, '36. a not-found transaction still makes exactly one call — no automatic re-check or polling');
    }
    console.log('✓ Section H: proof identity & call discipline');

    // ---------------------------------------------------------------
    // Section I — the content-not-ownership invariant, and
    // cross-substrate isolation.
    // ---------------------------------------------------------------
    {
        // I1. Even when a (deliberately non-conformant) rpcSource result
        // carries extra sender/ownership-shaped fields, verify() ignores
        // them entirely — only input/hash ever factor into the verdict.
        const plan = await planRealBaseTransaction(CONTENT_HASH);
        const rpcSourceWithSender = fakeRpcSource({
            transactions: {
                [TXID_A]: { input: plan.data, from: '0x' + 'ee'.repeat(20), sender: 'someone-else', publisherAddress: '0x' + 'ff'.repeat(20) }
            }
        });
        const result = await new BaseProofVerifier({ rpcSource: rpcSourceWithSender }).verify({ txid: TXID_A }, { contentHash: CONTENT_HASH });
        assert(result.valid === true, '37. a transaction verifies purely on its decoded contentHash — an unrelated sender/publisherAddress field never affects the verdict');

        // I2. Static confirmation: the verifier's own source never reads
        // or compares any authorship/ownership concept.
        const verifierCode = codeOnly(await source('anchoring/BaseProofVerifier.js'));
        assert(!/owner|author|publisher|wallet|sender|signer(?!ature)/i.test(verifierCode), '38. BaseProofVerifier\'s own code never references an owner/author/publisher/wallet/sender concept of any kind — content-hash matching only, the identical discipline Bitcoin\'s and Arweave\'s own verifiers already hold');

        // I3. Cross-substrate isolation, both directions.
        const bitcoinCode = codeOnly(await source('anchoring/BitcoinOpReturnProofVerifier.js'));
        const arweaveCode = codeOnly(await source('anchoring/ArweaveTransactionDataProofVerifier.js'));
        assert(!/\bBase\b|eth_|BaseJsonRpcClient|BaseChainId|decodeBasePublicationCommitment/.test(bitcoinCode), '39. anchoring/BitcoinOpReturnProofVerifier.js references nothing Base-specific');
        assert(!/\bBase\b|eth_|BaseJsonRpcClient|BaseChainId|decodeBasePublicationCommitment/.test(arweaveCode), '40. anchoring/ArweaveTransactionDataProofVerifier.js references nothing Base-specific');
        assert(!/Bitcoin|Arweave|OP_RETURN|blockstream|arweave\.net/i.test(verifierCode), '41. anchoring/BaseProofVerifier.js references nothing Bitcoin- or Arweave-specific');

        // I4. Live regression witness: Bitcoin/Arweave verification is
        // genuinely unaffected — a real Bitcoin verify() call still
        // behaves exactly as its own contract documents.
        const bitcoinVerifier = new BitcoinOpReturnProofVerifier({ fetchImpl: async () => new Response('not found', { status: 404 }) });
        const bitcoinResult = await bitcoinVerifier.verify({ txid: 'a'.repeat(64) }, { contentHash: 'aa' });
        assert(bitcoinResult.valid === false && bitcoinResult.unavailable === true, '42. BitcoinOpReturnProofVerifier still behaves exactly as before — a not-found transaction is unavailable, unaffected by anything added in this milestone');

        const arweaveVerifier = new ArweaveTransactionDataProofVerifier({ fetchImpl: async () => new Response('not found', { status: 404 }) });
        const arweaveResult = await arweaveVerifier.verify({ txid: 'abc123' }, { contentHash: 'aa' });
        assert(arweaveResult.valid === false && arweaveResult.unavailable === true, '43. ArweaveTransactionDataProofVerifier still behaves exactly as before, unaffected by anything added in this milestone');
    }
    console.log('✓ Section I: content-not-ownership invariant & cross-substrate isolation');

    // ---------------------------------------------------------------
    // Section J — architectural guard, and the composition-root use
    // case.
    // ---------------------------------------------------------------
    {
        const verifierCode = codeOnly(await source('anchoring/BaseProofVerifier.js'));
        const forbidden = [
            /sendTransaction|signTransaction|\.sign\(/i,
            /Broadcaster|broadcastRawTransaction|\.broadcast\(/i,
            /estimateGas|gasLimit\s*=|gasPrice/i,
            /PublicationAnchor\.set|persist|\.save\(|localStorage|indexedDB/i,
            /providerList|selectProvider|fallbackProvider/i,
            /setTimeout.*retry|retryCount|maxRetries|backoff/i
        ];
        for (const pattern of forbidden) {
            assert(!pattern.test(verifierCode), `44[${pattern}]. anchoring/BaseProofVerifier.js contains no wallet/signing/broadcast/gas-estimation/persistence/provider-selection/retry code`);
        }
        assert(!/import.*BaseWalletConnection|import.*BaseTransactionBroadcaster|import.*BaseSignedTransactionFinalizer/.test(verifierCode), '45. BaseProofVerifier.js imports no wallet/broadcast/signing class of any kind');

        // The composition-root use case: mirrors CreateBitcoinAnchorProofVerifierUseCase's
        // and CreateArweaveAnchorProofVerifierUseCase's own shape, and
        // actually produces a working, wired verifier end to end.
        const requests = [];
        const fetchImpl = async (_url, options) => {
            const body = JSON.parse(options.body);
            requests.push(body.method);
            const plan = await planRealBaseTransaction(CONTENT_HASH);
            return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, result: { hash: TXID_A, input: plan.data } }) };
        };
        const { baseProofVerifier } = new CreateBaseAnchorProofVerifierUseCase().execute({ fetchImpl });
        assert(baseProofVerifier instanceof BaseProofVerifier, '46. CreateBaseAnchorProofVerifierUseCase#execute() returns a real BaseProofVerifier instance');
        assert(baseProofVerifier.anchorType === 'base', '47. the wired verifier reports anchorType "base"');
        const wiredResult = await baseProofVerifier.verify({ txid: TXID_A }, { contentHash: CONTENT_HASH });
        assert(wiredResult.valid === true, '48. the composition-root-wired verifier, driven only by an injected fetchImpl, correctly verifies a real transaction end to end');
        assert(requests[0] === 'eth_getTransactionByHash', '49. the wired BaseJsonRpcClient issued exactly the expected JSON-RPC method');

        const useCaseCode = codeOnly(await source('application/CreateBaseAnchorProofVerifierUseCase.js'));
        assert(/export class CreateBaseAnchorProofVerifierUseCase/.test(useCaseCode), '50. the use case follows the identical Create*AnchorProofVerifierUseCase naming and export shape as its Bitcoin/Arweave siblings');
    }
    console.log('✓ Section J: architectural guard & composition-root use case');

    // ---------------------------------------------------------------
    // Production guard — only this milestone's own new files exist as
    // changes, mirroring tests/BaseTransactionPayloadRpcRead.test.js's
    // own Section J discipline.
    // ---------------------------------------------------------------
    {
        const statusOutput = execSync('git status --porcelain', { cwd: SOURCE_ROOT }).toString();
        const changed = statusOutput.split('\n').map((line) => line.slice(3).trim()).filter(Boolean);
        const AUTHORIZED = new Set([
            'tests.html',
            'anchoring/BaseProofVerifier.js',
            'application/CreateBaseAnchorProofVerifierUseCase.js',
            'tests/BaseTransactionProofVerifier.test.js'
        ]);
        const unauthorized = changed.filter((f) => !AUTHORIZED.has(f));
        assert(unauthorized.length === 0, `51. every changed/added file is one this milestone's own commit names (found unauthorized: ${JSON.stringify(unauthorized)}) — no registry wiring, no UI change, no generic EVM abstraction`);
    }
    console.log('✓ Production guard: only this milestone\'s own files changed');

    console.log('\n✅ All BaseTransactionProofVerifier tests passed.');
}

run().catch((error) => {
    console.error('BaseTransactionProofVerifier.test.js FAILED:', error);
    process.exitCode = 1;
});
