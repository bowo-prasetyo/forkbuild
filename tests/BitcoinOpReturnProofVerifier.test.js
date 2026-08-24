import { BitcoinOpReturnProofVerifier } from '../anchoring/BitcoinOpReturnProofVerifier.js';

// 0.8.1 — External Anchor Proof Adapters & Verification Registry.
//
// Deterministic, network-free coverage of anchoring/
// BitcoinOpReturnProofVerifier.js's own wire behavior — every scenario
// below runs against an injected `fetchImpl` standing in for a real
// Esplora-compatible block explorer, never a live one, the identical
// technique tests/IpfsContentStore.test.js already established for
// content/IpfsContentStore.js. tests/ExternalAnchorProofAdapters.test.js
// builds on top of this same fake-network technique for the full
// two-replica flagship, wiring this class in as one anchorType inside a
// application/ExternalProofVerifierRegistry.js.
//
//   Section A: a confirmed transaction whose OP_RETURN output carries
//              the exact contentHash — VALID, with and without a `vout`
//              hint
//   Section B: structurally invalid proof (missing/malformed txid, a
//              network mismatch) — a DEFINITE rejection, never
//              "unavailable"
//   Section C: transaction not found, not yet confirmed, or the block
//              explorer itself unreachable — every one of these reports
//              `unavailable: true`, never a rejection
//   Section D: a confirmed transaction that simply does not carry the
//              claimed contentHash in any OP_RETURN output — a DEFINITE
//              rejection, because the external system WAS reachable and
//              gave a real answer
//   Section E: `minConfirmations` — insufficient confirmations report
//              unavailable; sufficient confirmations verify
//
// See docs/Principles.md, "A Proof Verifier Reports 'Cannot Presently
// Verify' Separately From 'Proof Is Wrong' (0.8.1)."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const TXID = 'a'.repeat(64);

function opReturnOutput(hexData) {
    return {
        scriptpubkey_type: 'op_return',
        scriptpubkey_asm: `OP_RETURN OP_PUSHBYTES_${hexData.length / 2} ${hexData}`
    };
}

function makeFakeExplorer({ txs = new Map(), tipHeight = 800000, throwOnRequest = false } = {}) {
    async function fetchImpl(url) {
        if (throwOnRequest) {
            throw new Error('simulated connection failure');
        }
        const parsed = new URL(url);
        if (parsed.pathname.endsWith('/blocks/tip/height')) {
            return new Response(String(tipHeight), { status: 200 });
        }
        const match = parsed.pathname.match(/\/tx\/([0-9a-f]+)$/i);
        if (match) {
            const tx = txs.get(match[1]);
            if (!tx) return new Response('not found', { status: 404 });
            return new Response(JSON.stringify(tx), { status: 200 });
        }
        return new Response('not found', { status: 404 });
    }
    return { txs, fetchImpl };
}

async function run() {
    const contentHash = '1a2b3c4d';

    // ---------------------------------------------------------------
    // Section A — a confirmed transaction with a matching OP_RETURN
    // ---------------------------------------------------------------
    {
        const { txs, fetchImpl } = makeFakeExplorer();
        txs.set(TXID, {
            txid: TXID,
            vout: [
                { scriptpubkey_type: 'p2pkh' },
                opReturnOutput(contentHash)
            ],
            status: { confirmed: true, block_height: 799990 }
        });
        const verifier = new BitcoinOpReturnProofVerifier({ apiUrl: 'https://explorer.test/api', fetchImpl });
        assert(verifier.anchorType === 'bitcoin-op-return', '1. anchorType is bitcoin-op-return');

        const result = await verifier.verify({ txid: TXID, network: 'mainnet' }, { contentHash });
        assert(result.valid === true, '2. a confirmed tx with a matching OP_RETURN verifies');

        const hinted = await verifier.verify({ txid: TXID, network: 'mainnet', vout: 1 }, { contentHash });
        assert(hinted.valid === true, '3. a correct vout hint also verifies');

        const wrongHint = await verifier.verify({ txid: TXID, network: 'mainnet', vout: 0 }, { contentHash });
        assert(wrongHint.valid === false && !wrongHint.unavailable, '4. a vout hint pointing at the WRONG output is a definite rejection, not unavailable');
    }
    console.log('✓ Section A: a confirmed transaction whose OP_RETURN carries the contentHash verifies');

    // ---------------------------------------------------------------
    // Section B — structurally invalid proofs
    // ---------------------------------------------------------------
    {
        const { fetchImpl } = makeFakeExplorer();
        const verifier = new BitcoinOpReturnProofVerifier({ apiUrl: 'https://explorer.test/api', fetchImpl });

        const noProof = await verifier.verify(null, { contentHash });
        assert(noProof.valid === false && !noProof.unavailable, '1. a missing proof is a definite rejection');

        const noTxid = await verifier.verify({ network: 'mainnet' }, { contentHash });
        assert(noTxid.valid === false && !noTxid.unavailable, '2. a missing txid is a definite rejection');

        const badTxid = await verifier.verify({ txid: 'not-hex', network: 'mainnet' }, { contentHash });
        assert(badTxid.valid === false && !badTxid.unavailable, '3. a malformed txid is a definite rejection');

        const wrongNetwork = await verifier.verify({ txid: TXID, network: 'testnet' }, { contentHash });
        assert(wrongNetwork.valid === false && !wrongNetwork.unavailable, '4. a proof declaring a different network than this verifier checks is a definite rejection');
    }
    console.log('✓ Section B: structurally invalid proofs are definite rejections, never "unavailable"');

    // ---------------------------------------------------------------
    // Section C — cannot presently tell
    // ---------------------------------------------------------------
    {
        const { fetchImpl } = makeFakeExplorer();
        const verifier = new BitcoinOpReturnProofVerifier({ apiUrl: 'https://explorer.test/api', fetchImpl });
        const notFound = await verifier.verify({ txid: TXID, network: 'mainnet' }, { contentHash });
        assert(notFound.valid === false && notFound.unavailable === true, '1. a transaction not found by the explorer is unavailable, never a rejection');

        const { txs: unconfirmedTxs, fetchImpl: unconfirmedFetch } = makeFakeExplorer();
        unconfirmedTxs.set(TXID, { txid: TXID, vout: [opReturnOutput(contentHash)], status: { confirmed: false } });
        const unconfirmedVerifier = new BitcoinOpReturnProofVerifier({ apiUrl: 'https://explorer.test/api', fetchImpl: unconfirmedFetch });
        const unconfirmed = await unconfirmedVerifier.verify({ txid: TXID, network: 'mainnet' }, { contentHash });
        assert(unconfirmed.valid === false && unconfirmed.unavailable === true, '2. an unconfirmed transaction is unavailable, never a rejection');

        const downVerifier = new BitcoinOpReturnProofVerifier({
            apiUrl: 'https://explorer.test/api',
            fetchImpl: makeFakeExplorer({ throwOnRequest: true }).fetchImpl
        });
        const unreachable = await downVerifier.verify({ txid: TXID, network: 'mainnet' }, { contentHash });
        assert(unreachable.valid === false && unreachable.unavailable === true, '3. an unreachable explorer is unavailable, never a rejection');
    }
    console.log('✓ Section C: not found / not yet confirmed / unreachable are all "unavailable," never a rejection');

    // ---------------------------------------------------------------
    // Section D — a confirmed, reachable transaction that just does not
    // carry the claimed contentHash
    // ---------------------------------------------------------------
    {
        const { txs, fetchImpl } = makeFakeExplorer();
        txs.set(TXID, {
            txid: TXID,
            vout: [opReturnOutput('deadbeef')],
            status: { confirmed: true, block_height: 799990 }
        });
        const verifier = new BitcoinOpReturnProofVerifier({ apiUrl: 'https://explorer.test/api', fetchImpl });
        const result = await verifier.verify({ txid: TXID, network: 'mainnet' }, { contentHash });
        assert(result.valid === false && !result.unavailable, '1. a confirmed tx whose OP_RETURN does not match is a DEFINITE rejection');
        assert(typeof result.reason === 'string' && result.reason.includes(TXID), '2. the rejection reason names the transaction that was actually checked');
    }
    console.log('✓ Section D: a reachable, confirmed transaction that does not back the claim is a definite rejection');

    // ---------------------------------------------------------------
    // Section E — minConfirmations
    // ---------------------------------------------------------------
    {
        const { txs, fetchImpl } = makeFakeExplorer({ tipHeight: 800000 });
        txs.set(TXID, {
            txid: TXID,
            vout: [opReturnOutput(contentHash)],
            status: { confirmed: true, block_height: 799999 } // 2 confirmations at tip 800000
        });
        const strictVerifier = new BitcoinOpReturnProofVerifier({ apiUrl: 'https://explorer.test/api', fetchImpl, minConfirmations: 6 });
        const tooFew = await strictVerifier.verify({ txid: TXID, network: 'mainnet' }, { contentHash });
        assert(tooFew.valid === false && tooFew.unavailable === true, '1. fewer confirmations than required is unavailable, never a rejection');

        const lenientVerifier = new BitcoinOpReturnProofVerifier({ apiUrl: 'https://explorer.test/api', fetchImpl, minConfirmations: 2 });
        const enough = await lenientVerifier.verify({ txid: TXID, network: 'mainnet' }, { contentHash });
        assert(enough.valid === true, '2. meeting the required confirmation count verifies');
    }
    console.log('✓ Section E: minConfirmations gates on real chain depth, never on confirmed alone once configured above 1');

    console.log('\nAll BitcoinOpReturnProofVerifier tests passed.');
}

run().catch((error) => {
    console.error('BitcoinOpReturnProofVerifier.test.js FAILED:', error);
    process.exitCode = 1;
});
