import {
    BitcoinOpReturnProofVerifierFailover,
    BitcoinEsploraTransactionBroadcasterFailover,
    BitcoinEsploraTransactionConfirmationObserverFailover,
    BitcoinEsploraWalletFundingSourceFailover
} from '../anchoring/BitcoinEsploraFailover.js';
import { BitcoinOpReturnProofVerifier } from '../anchoring/BitcoinOpReturnProofVerifier.js';
import { BitcoinEsploraTransactionBroadcaster } from '../anchoring/BitcoinEsploraTransactionBroadcaster.js';
import { CreateBitcoinAnchorProofVerifierUseCase } from '../application/anchoring/bitcoin/CreateBitcoinAnchorProofVerifierUseCase.js';
import { CreateBitcoinEsploraTransactionBroadcasterUseCase } from '../application/anchoring/bitcoin/CreateBitcoinEsploraTransactionBroadcasterUseCase.js';
import { CreateBitcoinEsploraTransactionConfirmationObserverUseCase } from '../application/anchoring/bitcoin/CreateBitcoinEsploraTransactionConfirmationObserverUseCase.js';
import { CreateBitcoinEsploraWalletFundingSourceUseCase } from '../application/anchoring/bitcoin/CreateBitcoinEsploraWalletFundingSourceUseCase.js';
import { assert } from './support/Assert.js';

// anchoring/BitcoinEsploraFailover.js: each wrapper asks its endpoints in
// order and stops at the first real answer; an unreachable endpoint moves
// on to the next. The application use cases build a wrapper only for two
// or more endpoints.

const A = 'https://a.example/api';
const B = 'https://b.example/api';
const TXID = 'c'.repeat(64);
const CONTENT_HASH = 'd'.repeat(64);

// Routes each request by host: `hosts[host]` is a function (url, options)
// returning a Response, or 'down' to throw like an unreachable server.
function makeFetch(hosts) {
    const requests = [];
    async function fetchImpl(url, options) {
        requests.push(url);
        const route = hosts[new URL(url).host];
        if (!route || route === 'down') throw new TypeError('fetch failed');
        return route(url, options);
    }
    fetchImpl.requests = requests;
    return fetchImpl;
}

function confirmedTx({ carries }) {
    return {
        status: { confirmed: true, block_height: 100, block_hash: 'e'.repeat(64) },
        vout: [{ scriptpubkey_type: 'op_return', scriptpubkey_asm: `OP_RETURN OP_PUSHBYTES_32 ${carries}` }]
    };
}

const json = (body) => new Response(JSON.stringify(body), { status: 200 });

async function run() {
    // Proof verifier.
    {
        const fetchImpl = makeFetch({ 'a.example': 'down', 'b.example': () => json(confirmedTx({ carries: CONTENT_HASH })) });
        const verifier = new BitcoinOpReturnProofVerifierFailover({ apiUrls: [A, B], fetchImpl });
        assert(verifier.anchorType === 'bitcoin-op-return', 'A1. keeps the wrapped verifier\'s anchorType');
        const result = await verifier.verify({ txid: TXID }, { contentHash: CONTENT_HASH });
        assert(result.valid === true, 'A2. an unreachable first endpoint falls over to the second, which verifies');

        const rejecting = makeFetch({ 'a.example': () => json(confirmedTx({ carries: 'f'.repeat(64) })), 'b.example': () => json(confirmedTx({ carries: CONTENT_HASH })) });
        const definite = await new BitcoinOpReturnProofVerifierFailover({ apiUrls: [A, B], fetchImpl: rejecting }).verify({ txid: TXID }, { contentHash: CONTENT_HASH });
        assert(definite.valid === false && !definite.unavailable, 'A3. a definite rejection from the first endpoint is the answer');
        assert(rejecting.requests.every((url) => url.startsWith(A)), 'A4. ...and the second endpoint is never asked');

        const allDown = await new BitcoinOpReturnProofVerifierFailover({ apiUrls: [A, B], fetchImpl: makeFetch({}) }).verify({ txid: TXID }, { contentHash: CONTENT_HASH });
        assert(allDown.valid === false && allDown.unavailable === true, 'A5. every endpoint down is unavailable, never a rejection');
        assert(allDown.reason.includes('a.example') && allDown.reason.includes('b.example'), 'A6. the reason names every endpoint tried');

        const notFoundThenFound = makeFetch({ 'a.example': () => new Response('', { status: 404 }), 'b.example': () => json(confirmedTx({ carries: CONTENT_HASH })) });
        const propagated = await new BitcoinOpReturnProofVerifierFailover({ apiUrls: [A, B], fetchImpl: notFoundThenFound }).verify({ txid: TXID }, { contentHash: CONTENT_HASH });
        assert(propagated.valid === true, 'A7. a transaction the first endpoint has not seen yet is looked up on the next');
    }
    console.log('✓ Proof verifier: falls over on unavailable, stops at a definite answer');

    // Broadcaster.
    {
        const fetchImpl = makeFetch({ 'a.example': () => new Response('overloaded', { status: 503 }), 'b.example': () => new Response(TXID, { status: 200 }) });
        const result = await new BitcoinEsploraTransactionBroadcasterFailover({ apiUrls: [A, B], fetchImpl }).broadcast('00');
        assert(result.broadcast === true && result.txid === TXID, 'B1. a 5xx from the first endpoint falls over to the second, which accepts');

        const rejecting = makeFetch({ 'a.example': () => new Response('bad-txns-inputs-missingorspent', { status: 400 }), 'b.example': () => new Response(TXID, { status: 200 }) });
        const rejected = await new BitcoinEsploraTransactionBroadcasterFailover({ apiUrls: [A, B], fetchImpl: rejecting }).broadcast('00');
        assert(rejected.broadcast === false && !rejected.unavailable, 'B2. a 4xx rejection is the answer');
        assert(rejecting.requests.length === 1, 'B3. ...and the transaction is not sent to the second endpoint');

        const allDown = await new BitcoinEsploraTransactionBroadcasterFailover({ apiUrls: [A, B], fetchImpl: makeFetch({}) }).broadcast('00');
        assert(allDown.broadcast === false && allDown.unavailable === true, 'B4. every endpoint down is unavailable');
    }
    console.log('✓ Broadcaster: falls over on unavailable, never resends a rejected transaction');

    // Confirmation observer.
    {
        const fetchImpl = makeFetch({
            'a.example': 'down',
            'b.example': (url) => (url.endsWith('/blocks/tip/height') ? new Response('105', { status: 200 }) : json(confirmedTx({ carries: CONTENT_HASH })))
        });
        const result = await new BitcoinEsploraTransactionConfirmationObserverFailover({ apiUrls: [A, B], fetchImpl }).fetchConfirmation(TXID);
        assert(result.found === true && result.confirmed === true && result.confirmationCount === 6, 'C1. falls over to the second endpoint and reports its confirmation');

        const allDown = await new BitcoinEsploraTransactionConfirmationObserverFailover({ apiUrls: [A, B], fetchImpl: makeFetch({}) }).fetchConfirmation(TXID);
        assert(allDown.found === false && allDown.reason.includes('b.example'), 'C2. every endpoint down is not found, with every reason');
    }
    console.log('✓ Confirmation observer: the first endpoint that finds the transaction answers');

    // Wallet funding source.
    {
        const fetchImpl = makeFetch({ 'a.example': () => new Response('', { status: 500 }), 'b.example': () => json([]) });
        const result = await new BitcoinEsploraWalletFundingSourceFailover({ apiUrls: [A, B], fetchImpl }).fetchUtxos('bc1qexample');
        assert(result.found === true && result.utxos.length === 0, 'D1. falls over to the second endpoint; an empty wallet is a real answer');
    }
    console.log('✓ Wallet funding source: the first endpoint that answers wins');

    // The use cases build a wrapper only for two or more endpoints.
    {
        const fetchImpl = makeFetch({});
        const { bitcoinProofVerifier: many } = new CreateBitcoinAnchorProofVerifierUseCase().execute({ apiUrls: [A, B], fetchImpl });
        assert(many instanceof BitcoinOpReturnProofVerifierFailover && many.apiUrls.join() === [A, B].join(), 'E1. two endpoints build the failover verifier, in order');
        const { bitcoinProofVerifier: one } = new CreateBitcoinAnchorProofVerifierUseCase().execute({ apiUrls: [A], fetchImpl });
        assert(one instanceof BitcoinOpReturnProofVerifier && one.apiUrl === A, 'E2. one endpoint builds the plain verifier');
        const { bitcoinProofVerifier: legacy } = new CreateBitcoinAnchorProofVerifierUseCase().execute({ apiUrl: B, fetchImpl });
        assert(legacy instanceof BitcoinOpReturnProofVerifier && legacy.apiUrl === B, 'E3. a single apiUrl still works');
        const { bitcoinEsploraTransactionBroadcaster } = new CreateBitcoinEsploraTransactionBroadcasterUseCase().execute({ apiUrls: [A], fetchImpl });
        assert(bitcoinEsploraTransactionBroadcaster instanceof BitcoinEsploraTransactionBroadcaster, 'E4. one endpoint builds the plain broadcaster');
        const { bitcoinEsploraTransactionConfirmationObserver } = new CreateBitcoinEsploraTransactionConfirmationObserverUseCase().execute({ apiUrls: [A, B], fetchImpl });
        assert(bitcoinEsploraTransactionConfirmationObserver instanceof BitcoinEsploraTransactionConfirmationObserverFailover, 'E5. two endpoints build the failover observer');
        const { bitcoinEsploraWalletFundingSource } = new CreateBitcoinEsploraWalletFundingSourceUseCase().execute({ apiUrls: [A, B], fetchImpl });
        assert(bitcoinEsploraWalletFundingSource instanceof BitcoinEsploraWalletFundingSourceFailover, 'E6. two endpoints build the failover funding source');
        let threw = false;
        try { new BitcoinEsploraTransactionBroadcasterFailover({ apiUrls: [], fetchImpl }); } catch { threw = true; }
        assert(threw, 'E7. an empty endpoint list is refused');
    }
    console.log('✓ Use cases: a failover wrapper for two or more endpoints, the plain adapter for one');

    console.log('\n✅ All Bitcoin Esplora failover tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
