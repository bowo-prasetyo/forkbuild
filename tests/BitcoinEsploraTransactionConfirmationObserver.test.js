import { BitcoinEsploraTransactionConfirmationObserver } from '../anchoring/BitcoinEsploraTransactionConfirmationObserver.js';

// 0.8.54 — Bitcoin Anchor Confirmation Observation.
//
// Deterministic, network-free coverage of anchoring/
// BitcoinEsploraTransactionConfirmationObserver.js's own wire behavior —
// every scenario below runs against an injected `fetchImpl` standing in
// for a real Esplora-compatible block explorer, never a live one, the
// identical technique tests/BitcoinOpReturnProofVerifier.test.js and
// tests/BitcoinEsploraTransactionBroadcaster.test.js already established.
//
//   Section A: a confirmed transaction — GET /tx/:txid reports confirmed,
//              GET /blocks/tip/height derives confirmationCount correctly
//   Section B: an unconfirmed (mempool) transaction — reported as found,
//              not confirmed; the tip-height endpoint is never queried
//   Section C: a 404 response — reported as not found, never a throw
//   Section D: a 5xx response, and the fetch itself throwing — both
//              reported as not found (this class never throws)
//   Section E: an unparseable response body — reported as not found
//   Section F: a failure while deriving confirmationCount (after the
//              transaction itself was found and confirmed) — still
//              reported as not found, never a partial/malformed CONFIRMED
//   Section G: this class's own output already matches the
//              `confirmationSource` shape anchoring/
//              BitcoinAnchorConfirmationObserver.js expects — proven
//              directly by wiring the two together, end to end
//
// See docs/Roadmap.md, "0.8.54 — Bitcoin Anchor Confirmation Observation."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const TXID = 'a'.repeat(64);

function makeFakeExplorer({ txs = new Map(), tipHeight = 800000, throwOnTx = false, throwOnTip = false } = {}) {
    const requests = [];
    async function fetchImpl(url) {
        requests.push(url);
        const parsed = new URL(url);
        if (parsed.pathname.endsWith('/blocks/tip/height')) {
            if (throwOnTip) throw new Error('simulated tip-height connection failure');
            return new Response(String(tipHeight), { status: 200 });
        }
        const match = parsed.pathname.match(/\/tx\/([0-9a-f]+)$/i);
        if (match) {
            if (throwOnTx) throw new Error('simulated connection failure');
            const tx = txs.get(match[1]);
            if (!tx) return new Response('not found', { status: 404 });
            return new Response(JSON.stringify(tx), { status: 200 });
        }
        return new Response('not found', { status: 404 });
    }
    return { txs, requests, fetchImpl };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — a confirmed transaction; confirmationCount is derived
    // from the current tip height.
    // ---------------------------------------------------------------
    {
        const { txs, fetchImpl } = makeFakeExplorer({ tipHeight: 800005 });
        txs.set(TXID, { txid: TXID, status: { confirmed: true, block_height: 800000, block_hash: 'f'.repeat(64) } });
        const observer = new BitcoinEsploraTransactionConfirmationObserver({ apiUrl: 'https://explorer.test/api', fetchImpl });

        const result = await observer.fetchConfirmation(TXID);
        assert(result.found === true && result.confirmed === true, '1. a confirmed transaction is reported as found and confirmed');
        assert(result.blockHash === 'f'.repeat(64), '2. blockHash is read from the explorer\'s own status.block_hash');
        assert(result.blockHeight === 800000, '3. blockHeight is read from the explorer\'s own status.block_height');
        assert(result.confirmationCount === 6, '4. confirmationCount is derived as tipHeight - blockHeight + 1 (800005 - 800000 + 1 = 6)');
    }
    console.log('✓ Section A: a confirmed transaction reports found/confirmed with correctly derived block metadata');

    // ---------------------------------------------------------------
    // Section B — an unconfirmed (mempool) transaction never queries the
    // tip-height endpoint.
    // ---------------------------------------------------------------
    {
        const { txs, requests, fetchImpl } = makeFakeExplorer();
        txs.set(TXID, { txid: TXID, status: { confirmed: false } });
        const observer = new BitcoinEsploraTransactionConfirmationObserver({ apiUrl: 'https://explorer.test/api', fetchImpl });

        const result = await observer.fetchConfirmation(TXID);
        assert(result.found === true && result.confirmed === false, '5. an unconfirmed transaction is reported as found, not confirmed');
        assert(!requests.some((url) => url.includes('/blocks/tip/height')), '6. the tip-height endpoint is never queried for an unconfirmed transaction');
    }
    console.log('✓ Section B: an unconfirmed transaction reports found/not-confirmed without querying tip height');

    // ---------------------------------------------------------------
    // Section C — a 404 response is reported as not found, never a
    // throw.
    // ---------------------------------------------------------------
    {
        const { fetchImpl } = makeFakeExplorer();
        const observer = new BitcoinEsploraTransactionConfirmationObserver({ apiUrl: 'https://explorer.test/api', fetchImpl });

        const result = await observer.fetchConfirmation(TXID);
        assert(result.found === false, '7. a 404 is reported as not found');
        assert(typeof result.reason === 'string' && result.reason.length > 0, '8. a not-found result carries a human-readable reason');
    }
    console.log('✓ Section C: a 404 response is reported as not found, never a throw');

    // ---------------------------------------------------------------
    // Section D — a 5xx response and a throwing fetchImpl both report
    // not found, never propagating a throw.
    // ---------------------------------------------------------------
    {
        async function fetchImpl5xx() { return new Response('internal server error', { status: 503 }); }
        const observer5xx = new BitcoinEsploraTransactionConfirmationObserver({ apiUrl: 'https://explorer.test/api', fetchImpl: fetchImpl5xx });
        const result5xx = await observer5xx.fetchConfirmation(TXID);
        assert(result5xx.found === false, '9. a 5xx response is reported as not found');

        const { fetchImpl } = makeFakeExplorer({ throwOnTx: true });
        const observer = new BitcoinEsploraTransactionConfirmationObserver({ apiUrl: 'https://explorer.test/api', fetchImpl });
        let threw = false;
        let result;
        try {
            result = await observer.fetchConfirmation(TXID);
        } catch (e) {
            threw = true;
        }
        assert(!threw, '10. a throwing fetchImpl never propagates out of fetchConfirmation()');
        assert(result.found === false, '11. a throwing fetchImpl is reported as not found');
    }
    console.log('✓ Section D: a 5xx response and a throwing fetchImpl both report not found, never propagating a throw');

    // ---------------------------------------------------------------
    // Section E — an unparseable response body is reported as not
    // found.
    // ---------------------------------------------------------------
    {
        async function fetchImpl() { return new Response('not-json{{{', { status: 200 }); }
        const observer = new BitcoinEsploraTransactionConfirmationObserver({ apiUrl: 'https://explorer.test/api', fetchImpl });

        const result = await observer.fetchConfirmation(TXID);
        assert(result.found === false, '12. an unparseable response body is reported as not found');
    }
    console.log('✓ Section E: an unparseable response body is reported as not found');

    // ---------------------------------------------------------------
    // Section F — a failure deriving confirmationCount, after the
    // transaction itself was found and confirmed, is still reported as
    // not found — never a partial or malformed CONFIRMED report.
    // ---------------------------------------------------------------
    {
        const { txs, fetchImpl } = makeFakeExplorer({ throwOnTip: true });
        txs.set(TXID, { txid: TXID, status: { confirmed: true, block_height: 800000, block_hash: 'f'.repeat(64) } });
        const observer = new BitcoinEsploraTransactionConfirmationObserver({ apiUrl: 'https://explorer.test/api', fetchImpl });

        const result = await observer.fetchConfirmation(TXID);
        assert(result.found === false, '13. a failure deriving confirmationCount is reported as not found, never a partial CONFIRMED report');
        assert(result.confirmed === undefined, '14. no partial confirmed:true is ever reported alongside a not-found result');
    }
    console.log('✓ Section F: a failure deriving confirmationCount is reported as not found, never a partial CONFIRMED report');

    // ---------------------------------------------------------------
    // Section G — this class's own output shape plugs directly into
    // anchoring/BitcoinAnchorConfirmationObserver.js's expected
    // confirmationSource contract.
    // ---------------------------------------------------------------
    {
        const { BitcoinAnchorConfirmationObserver } = await import('../anchoring/BitcoinAnchorConfirmationObserver.js');
        const { BitcoinAnchorConfirmationState } = await import('../application/BitcoinAnchorConfirmationState.js');

        const { txs, fetchImpl } = makeFakeExplorer({ tipHeight: 800000 });
        txs.set(TXID, { txid: TXID, status: { confirmed: true, block_height: 800000, block_hash: 'c'.repeat(64) } });
        const esplora = new BitcoinEsploraTransactionConfirmationObserver({ apiUrl: 'https://explorer.test/api', fetchImpl });
        const outer = new BitcoinAnchorConfirmationObserver({ confirmationSource: esplora });

        const result = await outer.observeConfirmation(TXID);
        assert(result.state === BitcoinAnchorConfirmationState.CONFIRMED, '15. the two classes compose end to end, reaching CONFIRMED');
        assert(result.blockHash === 'c'.repeat(64) && result.blockHeight === 800000 && result.confirmationCount === 1, '16. block metadata survives the composition unmodified');

        const notFoundResult = await outer.observeConfirmation('b'.repeat(64));
        assert(notFoundResult.state === BitcoinAnchorConfirmationState.UNAVAILABLE, '17. a not-found transaction composes through to UNAVAILABLE');
    }
    console.log('✓ Section G: this class\'s own output shape plugs directly into BitcoinAnchorConfirmationObserver\'s expected confirmationSource contract');

    console.log('\nAll BitcoinEsploraTransactionConfirmationObserver tests passed.');
}

run().catch((error) => {
    console.error('BitcoinEsploraTransactionConfirmationObserver.test.js FAILED:', error);
    process.exitCode = 1;
});
