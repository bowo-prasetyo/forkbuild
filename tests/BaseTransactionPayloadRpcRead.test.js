import { BaseJsonRpcClient } from '../base/BaseJsonRpcClient.js';

// 0.9.462 — Base Transaction Payload RPC Read.
//
// tests/BaseTransactionProofVerificationCapabilityAudit.test.js (0.9.461)
// found exactly one concrete, narrow gap standing between today's source
// and a future `BaseProofVerifier`: `base/BaseJsonRpcClient.js` wraps no
// method returning a transaction's own payload — `eth_getTransactionByHash`
// was named, in that very file's own header, as a deliberate prior
// exclusion. This milestone closes exactly that gap, and nothing else:
// one new wrapped RPC read, following the identical conventions the nine
// existing methods already establish (see base/BaseJsonRpcClient.js's own
// header). It does not decode a contentHash, does not know about
// `anchoring/ProofVerifier.js`, and introduces no new abstraction — see
// this file's own Section H/I below.
//
// KNOWN, DELIBERATE CONSEQUENCE FOR TWO PRIOR AUDIT FILES. This milestone
// makes two now-superseded, mechanical assertions fail on live
// re-execution: tests/BaseOnChainPublishingCapabilityBoundaryAudit.test.js
// (0.9.460) Section E3 asserted no additional RPC method existed beyond
// what the prior pipeline needed, and tests/
// BaseTransactionProofVerificationCapabilityAudit.test.js (0.9.461)
// Sections D4/D5/H3c asserted `eth_getTransactionByHash` was, and remained,
// genuinely unwrapped. Both were true, point-in-time findings when
// written; this milestone's own real change is precisely what supersedes
// them, exactly the same relationship 0.9.460's own Section L already
// documents toward `DecentralizedDistributionGuidanceProductGapAudit.test.js`
// — a later milestone's real progress obsoleting an earlier audit's
// mechanical snapshot is left as an honest historical record, not
// silently patched.
//
//   Section A: method existence and public client contract — the method
//              exists, is async, and requires no constructor change.
//   Section B: correct JSON-RPC method — exactly `eth_getTransactionByHash`,
//              never a different method name.
//   Section C: transaction-hash parameter fidelity — the exact `txid`
//              given is the exact, sole parameter sent; an unrelated hash
//              is never touched by a call for a different one.
//   Section D: returned payload fidelity — `hash`/`input` come back
//              unmodified from the endpoint's own response, no re-encoding.
//   Section E: null/not-found semantics — a genuine JSON-RPC `null` result
//              is `{ available: true, found: false }`, never `available: false`.
//   Section F: RPC failure propagation — unreachable / non-2xx / malformed
//              JSON / an incomplete transaction object are all
//              `{ available: false, reason }`, never thrown.
//   Section G: exactly one RPC request per call — no retry, no polling,
//              no second call of any kind fired by this method.
//   Section H: no transaction interpretation — the returned shape carries
//              no decoded contentHash, no ABI-decoded field, no
//              publication/proof vocabulary of any kind.
//   Section I: existing Base RPC regression — the nine pre-existing
//              methods are unchanged and still behave exactly as before.
//   Section J: cross-role isolation — this file's own code never mentions
//              ProofVerifier/PublicationAnchor/anchorType; adding this
//              method requires no change to any file outside base/BaseJsonRpcClient.js.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const TXID_A = '0x' + '11'.repeat(32);
const TXID_B = '0x' + '22'.repeat(32);
const INPUT_A = '0x' + 'ab'.repeat(32);

function jsonResponse(body) {
    return { ok: true, status: 200, json: async () => body };
}

// A fake Base JSON-RPC endpoint, shaped exactly like the real
// `https://mainnet.base.org` — never a real network call. Records every
// request made so tests can assert exactly what was sent and how many
// times.
function fakeBaseRpcFetch({ transactions = {}, throwFor = null, statusFor = null, errorFor = null, malformed = false } = {}) {
    const requests = [];
    const fetchImpl = async (_url, options) => {
        const body = JSON.parse(options.body);
        requests.push(body);
        if (throwFor === body.method) throw new Error('simulated: network unreachable');
        if (statusFor === body.method) return { ok: false, status: 503 };
        if (errorFor === body.method) return jsonResponse({ jsonrpc: '2.0', id: 1, error: { message: 'simulated RPC error' } });
        if (body.method === 'eth_getTransactionByHash') {
            const [txid] = body.params;
            if (malformed) return jsonResponse({ jsonrpc: '2.0', id: 1, result: 'not-an-object' });
            if (!Object.prototype.hasOwnProperty.call(transactions, txid)) return jsonResponse({ jsonrpc: '2.0', id: 1, result: null });
            return jsonResponse({ jsonrpc: '2.0', id: 1, result: transactions[txid] });
        }
        throw new Error(`test helper does not stub method ${body.method}`);
    };
    fetchImpl.requests = requests;
    return fetchImpl;
}

function txPayload({ hash = TXID_A, input = INPUT_A, extra = {} } = {}) {
    return { hash, input, ...extra };
}

function freshClient(fetchImpl) {
    return new BaseJsonRpcClient({ fetchImpl });
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — method existence and public client contract.
    // ---------------------------------------------------------------
    {
        const client = freshClient(fakeBaseRpcFetch());
        assert(typeof client.fetchTransactionByHash === 'function', '1. BaseJsonRpcClient exposes fetchTransactionByHash as a method');
        const result = client.fetchTransactionByHash(TXID_A);
        assert(result instanceof Promise, '2. fetchTransactionByHash returns a Promise (async)');
        await result;
        assert(client.rpcUrl === 'https://mainnet.base.org', '3. constructing a client requires no new option for this method — the default rpcUrl is unchanged');
    }
    console.log('✓ Section A: method existence and public client contract');

    // ---------------------------------------------------------------
    // Section B — correct JSON-RPC method.
    // ---------------------------------------------------------------
    {
        const fetchImpl = fakeBaseRpcFetch({ transactions: { [TXID_A]: txPayload() } });
        const client = freshClient(fetchImpl);
        await client.fetchTransactionByHash(TXID_A);
        assert(fetchImpl.requests.length === 1, '4. exactly one HTTP request was made');
        assert(fetchImpl.requests[0].method === 'eth_getTransactionByHash', '5. the JSON-RPC method sent is exactly eth_getTransactionByHash');
        assert(fetchImpl.requests[0].jsonrpc === '2.0', '6. the request is a well-formed JSON-RPC 2.0 envelope');
    }
    console.log('✓ Section B: correct JSON-RPC method');

    // ---------------------------------------------------------------
    // Section C — transaction-hash parameter fidelity.
    // ---------------------------------------------------------------
    {
        const fetchImpl = fakeBaseRpcFetch({ transactions: { [TXID_A]: txPayload({ hash: TXID_A }) } });
        const client = freshClient(fetchImpl);
        await client.fetchTransactionByHash(TXID_A);
        assert(JSON.stringify(fetchImpl.requests[0].params) === JSON.stringify([TXID_A]), '7. params is exactly [txid] — the sole parameter, nothing appended');

        // A second, unrelated hash is never touched by a call for a
        // different one.
        const fetchImpl2 = fakeBaseRpcFetch({ transactions: { [TXID_A]: txPayload({ hash: TXID_A }), [TXID_B]: txPayload({ hash: TXID_B, input: '0x' + 'cd'.repeat(32) }) } });
        const client2 = freshClient(fetchImpl2);
        const resultA = await client2.fetchTransactionByHash(TXID_A);
        assert(resultA.hash === TXID_A, '8. requesting TXID_A returns TXID_A\'s own hash');
        assert(fetchImpl2.requests.length === 1 && fetchImpl2.requests[0].params[0] === TXID_A, '9. only TXID_A was ever sent as a parameter — TXID_B was never requested');
    }
    console.log('✓ Section C: transaction-hash parameter fidelity');

    // ---------------------------------------------------------------
    // Section D — returned payload fidelity.
    // ---------------------------------------------------------------
    {
        const fetchImpl = fakeBaseRpcFetch({ transactions: { [TXID_A]: txPayload({ hash: TXID_A, input: INPUT_A }) } });
        const client = freshClient(fetchImpl);
        const result = await client.fetchTransactionByHash(TXID_A);
        assert(result.available === true, '10. a found transaction is available: true');
        assert(result.found === true, '11. a found transaction is found: true');
        assert(result.hash === TXID_A, '12. hash comes back exactly as the endpoint returned it, unmodified');
        assert(result.input === INPUT_A, '13. input comes back exactly as the endpoint returned it — raw hex, no decoding, no re-encoding');

        // Extra fields on the raw RPC object (to/from/blockHash/etc.) are
        // simply not surfaced — this method decodes only what it
        // documents, exactly like fetchTransactionReceipt() decodes only
        // blockHash/blockNumber/transactionIndex and nothing else.
        const fetchImpl2 = fakeBaseRpcFetch({ transactions: { [TXID_A]: txPayload({ extra: { to: '0x' + 'ff'.repeat(20), from: '0x' + 'ee'.repeat(20), blockNumber: '0x64' } }) } });
        const result2 = await freshClient(fetchImpl2).fetchTransactionByHash(TXID_A);
        assert(!('to' in result2) && !('from' in result2) && !('blockNumber' in result2), '14. no field beyond available/found/hash/input is ever surfaced');
    }
    console.log('✓ Section D: returned payload fidelity');

    // ---------------------------------------------------------------
    // Section E — null/not-found semantics.
    // ---------------------------------------------------------------
    {
        const fetchImpl = fakeBaseRpcFetch({ transactions: {} });
        const client = freshClient(fetchImpl);
        const result = await client.fetchTransactionByHash(TXID_A);
        assert(result.available === true, '15. a genuinely absent transaction is still available: true — the endpoint was reached and gave a real answer');
        assert(result.found === false, '16. a genuinely absent transaction is found: false');
        assert(!('reason' in result), '17. a not-found result carries no reason field — this is not a failure');
        assert(!('hash' in result) && !('input' in result), '18. a not-found result carries no hash/input fields');
    }
    console.log('✓ Section E: null/not-found semantics');

    // ---------------------------------------------------------------
    // Section F — RPC failure propagation.
    // ---------------------------------------------------------------
    {
        // Unreachable host.
        const unreachable = await freshClient(fakeBaseRpcFetch({ throwFor: 'eth_getTransactionByHash' })).fetchTransactionByHash(TXID_A);
        assert(unreachable.available === false && typeof unreachable.reason === 'string', '19. an unreachable host resolves to available: false with a reason, never throws');

        // Non-2xx response.
        const nonOk = await freshClient(fakeBaseRpcFetch({ statusFor: 'eth_getTransactionByHash' })).fetchTransactionByHash(TXID_A);
        assert(nonOk.available === false && typeof nonOk.reason === 'string', '20. a non-2xx response resolves to available: false with a reason');

        // JSON-RPC error object.
        const rpcError = await freshClient(fakeBaseRpcFetch({ errorFor: 'eth_getTransactionByHash' })).fetchTransactionByHash(TXID_A);
        assert(rpcError.available === false && typeof rpcError.reason === 'string', '21. a JSON-RPC error object resolves to available: false with a reason');

        // Malformed (non-object, non-null) result.
        const malformed = await freshClient(fakeBaseRpcFetch({ malformed: true })).fetchTransactionByHash(TXID_A);
        assert(malformed.available === false && typeof malformed.reason === 'string', '22. a malformed (non-object) result resolves to available: false with a reason');

        // Incomplete result — missing input.
        const incompleteFetch = fakeBaseRpcFetch({ transactions: { [TXID_A]: { hash: TXID_A } } });
        const incomplete = await freshClient(incompleteFetch).fetchTransactionByHash(TXID_A);
        assert(incomplete.available === false && typeof incomplete.reason === 'string', '23. a transaction object missing input resolves to available: false with a reason');

        // Incomplete result — missing hash.
        const incompleteFetch2 = fakeBaseRpcFetch({ transactions: { [TXID_A]: { input: INPUT_A } } });
        const incomplete2 = await freshClient(incompleteFetch2).fetchTransactionByHash(TXID_A);
        assert(incomplete2.available === false && typeof incomplete2.reason === 'string', '24. a transaction object missing hash resolves to available: false with a reason');

        // None of these ever throw.
        let threw = false;
        try {
            await freshClient(fakeBaseRpcFetch({ throwFor: 'eth_getTransactionByHash' })).fetchTransactionByHash(TXID_A);
        } catch (_e) { threw = true; }
        assert(!threw, '25. fetchTransactionByHash never throws, even when the transport itself throws');
    }
    console.log('✓ Section F: RPC failure propagation');

    // ---------------------------------------------------------------
    // Section G — exactly one RPC request per call.
    // ---------------------------------------------------------------
    {
        const fetchImpl = fakeBaseRpcFetch({ transactions: { [TXID_A]: txPayload() } });
        const client = freshClient(fetchImpl);
        await client.fetchTransactionByHash(TXID_A);
        assert(fetchImpl.requests.length === 1, '26. a single call to fetchTransactionByHash makes exactly one HTTP request — no retry, no polling');

        const fetchImplNotFound = fakeBaseRpcFetch({ transactions: {} });
        await freshClient(fetchImplNotFound).fetchTransactionByHash(TXID_A);
        assert(fetchImplNotFound.requests.length === 1, '27. exactly one request even for a not-found result — no automatic re-check');

        const fetchImplFail = fakeBaseRpcFetch({ throwFor: 'eth_getTransactionByHash' });
        await freshClient(fetchImplFail).fetchTransactionByHash(TXID_A);
        assert(fetchImplFail.requests.length === 1, '28. exactly one request even on failure — no automatic retry internal to this method');
    }
    console.log('✓ Section G: exactly one RPC request per call');

    // ---------------------------------------------------------------
    // Section H — no transaction interpretation: the returned shape
    // carries no decoded contentHash, no ABI-decoded field, no
    // publication/proof vocabulary of any kind.
    // ---------------------------------------------------------------
    {
        const fetchImpl = fakeBaseRpcFetch({ transactions: { [TXID_A]: txPayload({ input: '0x' + 'de'.repeat(32) }) } });
        const result = await freshClient(fetchImpl).fetchTransactionByHash(TXID_A);
        const keys = Object.keys(result).sort();
        assert(JSON.stringify(keys) === JSON.stringify(['available', 'found', 'hash', 'input']), '29. the found shape has exactly these four keys, and no more — no contentHash, no verified, no valid, no anchorType');
        assert(!('contentHash' in result), '30. no contentHash field — this method decodes no publication semantics');
        assert(!('verified' in result) && !('valid' in result), '31. no verification verdict field of any kind');

        const fs = await import('node:fs/promises');
        const path = await import('node:path');
        const { fileURLToPath } = await import('node:url');
        const src = await fs.readFile(path.join(fileURLToPath(new URL('../', import.meta.url)), 'base/BaseJsonRpcClient.js'), 'utf8');
        const methodMatch = src.match(/async fetchTransactionByHash\(txid\) \{[\s\S]*?\n    \}\n/);
        assert(methodMatch, '32. fetchTransactionByHash()\'s own method body is locatable');
        const methodBody = methodMatch[0];
        assert(!/ProofVerifier|PublicationAnchor|anchorType|contentHash|decodeBasePublicationCommitment/.test(methodBody), '33. the method\'s own source references no ProofVerifier/PublicationAnchor/anchorType/contentHash vocabulary — it is a pure RPC read, unaware of verification');
    }
    console.log('✓ Section H: no transaction interpretation');

    // ---------------------------------------------------------------
    // Section I — existing Base RPC regression: the nine pre-existing
    // methods are unchanged and still behave exactly as before.
    // ---------------------------------------------------------------
    {
        const CHAIN_ID_HEX = '0x2105';
        const BALANCE_HEX = '0xde0b6b3a7640000';
        const fetchImpl = async (_url, options) => {
            const body = JSON.parse(options.body);
            if (body.method === 'eth_chainId') return jsonResponse({ jsonrpc: '2.0', id: 1, result: CHAIN_ID_HEX });
            if (body.method === 'eth_getBalance') return jsonResponse({ jsonrpc: '2.0', id: 1, result: BALANCE_HEX });
            if (body.method === 'eth_getTransactionCount') return jsonResponse({ jsonrpc: '2.0', id: 1, result: '0x5' });
            if (body.method === 'eth_estimateGas') return jsonResponse({ jsonrpc: '2.0', id: 1, result: '0x5208' });
            if (body.method === 'eth_gasPrice') return jsonResponse({ jsonrpc: '2.0', id: 1, result: '0x3b9aca00' });
            if (body.method === 'eth_maxPriorityFeePerGas') return jsonResponse({ jsonrpc: '2.0', id: 1, result: '0x3b9aca00' });
            if (body.method === 'eth_sendRawTransaction') return jsonResponse({ jsonrpc: '2.0', id: 1, result: TXID_A });
            if (body.method === 'eth_getTransactionReceipt') return jsonResponse({ jsonrpc: '2.0', id: 1, result: { blockHash: TXID_B, blockNumber: '0x64', transactionIndex: '0x1' } });
            if (body.method === 'eth_blockNumber') return jsonResponse({ jsonrpc: '2.0', id: 1, result: '0x64' });
            throw new Error(`test helper does not stub method ${body.method}`);
        };
        const client = freshClient(fetchImpl);

        assert((await client.fetchChainId()).chainId === 8453, '34. fetchChainId unchanged');
        assert((await client.fetchBalance('0x' + 'a1'.repeat(20))).balanceWei === '1000000000000000000', '35. fetchBalance unchanged');
        assert((await client.fetchTransactionCount('0x' + 'a1'.repeat(20))).nonce === 5, '36. fetchTransactionCount unchanged');
        assert((await client.fetchGasEstimate({ from: '0x' + 'a1'.repeat(20), to: '0x' + 'a2'.repeat(20), value: '0x0', data: '0x' })).gasLimit === 21000, '37. fetchGasEstimate unchanged');
        assert((await client.fetchGasPrice()).gasPriceWei === '1000000000', '38. fetchGasPrice unchanged');
        assert((await client.fetchMaxPriorityFeePerGas()).maxPriorityFeePerGasWei === '1000000000', '39. fetchMaxPriorityFeePerGas unchanged');
        assert((await client.broadcastRawTransaction('0xraw')).txid === TXID_A, '40. broadcastRawTransaction unchanged');
        const receipt = await client.fetchTransactionReceipt(TXID_A);
        assert(receipt.available === true && receipt.found === true && receipt.blockNumber === 100, '41. fetchTransactionReceipt unchanged');
        assert((await client.fetchLatestBlockNumber()).blockNumber === 100, '42. fetchLatestBlockNumber unchanged');
    }
    console.log('✓ Section I: existing Base RPC regression — all nine pre-existing methods behave exactly as before');

    // ---------------------------------------------------------------
    // Section J — cross-role isolation: this file's own code never
    // mentions ProofVerifier/PublicationAnchor/anchorType, and this
    // milestone changes exactly one production file.
    // ---------------------------------------------------------------
    {
        const fs = await import('node:fs/promises');
        const { fileURLToPath } = await import('node:url');
        const { execSync } = await import('node:child_process');
        const SOURCE_ROOT = fileURLToPath(new URL('../', import.meta.url));

        const rpcClientSrc = await fs.readFile(SOURCE_ROOT + 'base/BaseJsonRpcClient.js', 'utf8');
        const rpcClientCode = rpcClientSrc.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
        assert(!/ProofVerifier|PublicationAnchor|anchorType|decodeBasePublicationCommitment/.test(rpcClientCode), '43. base/BaseJsonRpcClient.js\'s own code never references ProofVerifier/PublicationAnchor/anchorType/decode-commitment vocabulary — it stays a pure RPC transport, unaware of verification');

        const statusOutput = execSync('git status --porcelain', { cwd: SOURCE_ROOT }).toString();
        const changed = statusOutput.split('\n').map((line) => line.slice(3).trim()).filter(Boolean);
        const AUTHORIZED = new Set(['tests.html', 'base/BaseJsonRpcClient.js', 'tests/BaseTransactionPayloadRpcRead.test.js']);
        const unauthorized = changed.filter((f) => !AUTHORIZED.has(f));
        assert(unauthorized.length === 0, `44. every changed/added file is one this milestone's own commit names (found unauthorized: ${JSON.stringify(unauthorized)}) — no anchoring/, no application/CreateBase*ProofVerifier*, no new abstraction`);
    }
    console.log('✓ Section J: cross-role isolation — no ProofVerifier/PublicationAnchor vocabulary touched, and exactly the expected files changed');

    console.log('\n✅ All BaseTransactionPayloadRpcRead tests passed.');
}

run().catch((error) => {
    console.error('BaseTransactionPayloadRpcRead.test.js FAILED:', error);
    process.exitCode = 1;
});
