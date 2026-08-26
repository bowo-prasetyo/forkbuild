import { BitcoinEsploraTransactionBroadcaster } from '../anchoring/BitcoinEsploraTransactionBroadcaster.js';

// 0.8.52 — Bitcoin Anchor Transaction Broadcasting.
//
// Deterministic, network-free coverage of anchoring/
// BitcoinEsploraTransactionBroadcaster.js's own wire behavior — every
// scenario below runs against an injected `fetchImpl` standing in for a
// real Esplora-compatible block explorer, never a live one, the identical
// technique tests/BitcoinOpReturnProofVerifier.test.js already established
// for the read-side counterpart of this exact class.
//
//   Section A: a 2xx response — the transaction is accepted, and the raw
//              hex is submitted to POST /tx exactly as given
//   Section B: a 4xx response — a definite rejection, never `unavailable`
//   Section C: a 5xx response — `unavailable`, never a rejection
//   Section D: the fetch itself throws (no connectivity, a timeout) —
//              `unavailable`, never a rejection, never a throw out of
//              broadcast()
//   Section E: the response body cannot be read — `unavailable`
//   Section F: this class's own output already matches the `broadcaster`
//              shape anchoring/BitcoinAnchorTransactionBroadcaster.js
//              expects — proven directly by wiring the two together
//
// See docs/Principles.md, "Broadcasting Submits; It Does Not Decide
// (0.8.52)."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function makeFakeExplorer({ handler }) {
    const requests = [];
    async function fetchImpl(url, options) {
        requests.push({ url, options });
        return handler(url, options);
    }
    return { requests, fetchImpl };
}

async function run() {
    const rawTxHex = '02000000000101' + 'aa'.repeat(100);

    // ---------------------------------------------------------------
    // Section A — a 2xx response is acceptance; the exact raw hex is
    // submitted to POST /tx.
    // ---------------------------------------------------------------
    {
        const txid = 'b'.repeat(64);
        const explorer = makeFakeExplorer({
            handler: () => new Response(txid, { status: 200 })
        });
        const broadcaster = new BitcoinEsploraTransactionBroadcaster({ fetchImpl: explorer.fetchImpl });

        const result = await broadcaster.broadcast(rawTxHex);
        assert(result.broadcast === true && result.txid === txid, '1. a 2xx response is reported as accepted, with the response body as txid');
        assert(explorer.requests.length === 1, '2. exactly one request is made');
        const { url, options } = explorer.requests[0];
        assert(url.endsWith('/tx'), '3. the request targets the POST /tx endpoint');
        assert(options.method === 'POST', '4. the request uses POST');
        assert(options.body === rawTxHex, '5. the exact raw transaction hex is submitted as the request body, unmodified');
    }
    console.log('✓ Section A: a 2xx response is acceptance, and the raw hex is submitted to POST /tx exactly as given');

    // ---------------------------------------------------------------
    // Section B — a 4xx response is a definite rejection.
    // ---------------------------------------------------------------
    {
        const explorer = makeFakeExplorer({
            handler: () => new Response('sendrawtransaction RPC error: min relay fee not met', { status: 400 })
        });
        const broadcaster = new BitcoinEsploraTransactionBroadcaster({ fetchImpl: explorer.fetchImpl });

        const result = await broadcaster.broadcast(rawTxHex);
        assert(result.broadcast === false, '6. a 4xx response is reported as declined');
        assert(!result.unavailable, '7. a 4xx response is never reported as unavailable');
        assert(/min relay fee not met/.test(result.reason), '8. the rejection reason includes the endpoint\'s own error text');
    }
    console.log('✓ Section B: a 4xx response is reported as a definite rejection, never unavailable');

    // ---------------------------------------------------------------
    // Section C — a 5xx response is unavailable, never a rejection.
    // ---------------------------------------------------------------
    {
        const explorer = makeFakeExplorer({
            handler: () => new Response('internal server error', { status: 503 })
        });
        const broadcaster = new BitcoinEsploraTransactionBroadcaster({ fetchImpl: explorer.fetchImpl });

        const result = await broadcaster.broadcast(rawTxHex);
        assert(result.broadcast === false && result.unavailable === true, '9. a 5xx response is reported as unavailable, never a rejection');
    }
    console.log('✓ Section C: a 5xx response is reported as unavailable, never a rejection');

    // ---------------------------------------------------------------
    // Section D — the fetch itself throwing (no connectivity, a timeout)
    // is unavailable, never propagating the throw.
    // ---------------------------------------------------------------
    {
        const explorer = makeFakeExplorer({
            handler: () => { throw new Error('simulated connection failure'); }
        });
        const broadcaster = new BitcoinEsploraTransactionBroadcaster({ fetchImpl: explorer.fetchImpl });

        let threw = false;
        let result;
        try {
            result = await broadcaster.broadcast(rawTxHex);
        } catch (e) {
            threw = true;
        }
        assert(!threw, '10. a throwing fetchImpl never propagates out of broadcast()');
        assert(result.broadcast === false && result.unavailable === true, '11. a throwing fetchImpl is reported as unavailable');
    }
    console.log('✓ Section D: the fetch itself throwing is reported as unavailable, never propagating');

    // ---------------------------------------------------------------
    // Section E — a response whose body cannot be read is unavailable.
    // ---------------------------------------------------------------
    {
        const explorer = makeFakeExplorer({
            handler: () => ({
                ok: true,
                status: 200,
                text: async () => { throw new Error('stream already consumed'); }
            })
        });
        const broadcaster = new BitcoinEsploraTransactionBroadcaster({ fetchImpl: explorer.fetchImpl });

        const result = await broadcaster.broadcast(rawTxHex);
        assert(result.broadcast === false && result.unavailable === true, '12. an unreadable response body is reported as unavailable');
    }
    console.log('✓ Section E: a response body that cannot be read is reported as unavailable');

    // ---------------------------------------------------------------
    // Section F — this class's own output shape plugs directly into
    // anchoring/BitcoinAnchorTransactionBroadcaster.js's own expected
    // `broadcaster` contract.
    // ---------------------------------------------------------------
    {
        const { BitcoinAnchorTransactionBroadcaster } = await import('../anchoring/BitcoinAnchorTransactionBroadcaster.js');
        const txid = 'c'.repeat(64);
        const bytes = Uint8Array.from(Buffer.from(rawTxHex, 'hex'));
        const explorer = makeFakeExplorer({
            handler: () => new Response('some-other-txid-the-outer-class-must-ignore', { status: 200 })
        });
        const esplora = new BitcoinEsploraTransactionBroadcaster({ fetchImpl: explorer.fetchImpl });
        const outer = new BitcoinAnchorTransactionBroadcaster({ broadcaster: esplora });

        const result = await outer.broadcast({ txid, rawTransaction: { bytes, hex: rawTxHex } });
        assert(result.broadcasted === true && result.txid === txid, '13. the two classes compose end to end, and the outer class reports its own caller-supplied txid, not the adapter\'s echoed one');
    }
    console.log('✓ Section F: this class\'s own output shape plugs directly into BitcoinAnchorTransactionBroadcaster\'s expected broadcaster contract');

    console.log('\nAll BitcoinEsploraTransactionBroadcaster tests passed.');
}

run().catch((error) => {
    console.error('BitcoinEsploraTransactionBroadcaster.test.js FAILED:', error);
    process.exitCode = 1;
});
