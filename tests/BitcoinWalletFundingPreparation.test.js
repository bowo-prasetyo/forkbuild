import { BitcoinWalletFundingObserver } from '../anchoring/BitcoinWalletFundingObserver.js';
import { BitcoinEsploraWalletFundingSource } from '../anchoring/BitcoinEsploraWalletFundingSource.js';
import { BitcoinAnchorTransactionBuilder } from '../anchoring/BitcoinAnchorTransactionBuilder.js';
import { BitcoinAnchorFundingObservationState } from '../application/BitcoinAnchorFundingObservationState.js';
import { describeBitcoinAnchorFundingStateLabel, describeBitcoinAnchorFunding } from '../application/BitcoinAnchorFundingView.js';

// 0.8.60 — Explicit Bitcoin Anchor Funding & Address Preparation.
//
// anchoring/BitcoinAnchorTransactionBuilder.js's own header (0.8.47) named
// this exact gap: "real funding information is always the CALLER's own,"
// and docs/Roadmap.md's own "Deliberately excluded" list for that milestone
// named it directly — "Fetching real UTXOs for a real address is a future
// concern." This milestone closes that gap, and nothing more:
//
//   Section A: FLAGSHIP — a real Esplora-shaped `GET /address/:a/utxo`
//              response, through BitcoinEsploraWalletFundingSource, through
//              BitcoinWalletFundingObserver.observeFunding(), produces a
//              real, OBSERVED funding snapshot whose own `utxos` and
//              `changeAccount` feed DIRECTLY into a REAL, unchanged
//              BitcoinAnchorTransactionBuilder.build() — proving this
//              milestone's own output genuinely satisfies 0.8.47's builder
//              contract, end to end.
//   Section B: every address format anchoring/
//              BitcoinAnchorTransactionBuilder.js can estimate a fee for
//              (p2wpkh, p2tr, p2pkh) is recognized; one it cannot (p2sh) is
//              honestly UNSUPPORTED, never guessed at — and the funding
//              source is never even consulted for it.
//   Section C: a source that cannot presently answer — a thrown fetch, a
//              non-array response, or one malformed UTXO entry among
//              otherwise good ones — reports the WHOLE observation as
//              UNAVAILABLE, never a partial result.
//   Section D: an address with genuinely zero spendable outputs is a real,
//              honest OBSERVED result with an empty utxo list — never
//              UNAVAILABLE.
//   Section E: the label vocabulary, the view's own fixed field set with no
//              verdict field, and `networkMismatch` naming a wallet
//              reconnected to a different network since this funding was
//              observed.
//   Section F: the ONE concrete adapter this milestone ships translates a
//              real Esplora response faithfully, and never throws for any
//              wire-level failure.
//   Section G: every observation is a fresh, independently frozen record —
//              never cached, never mutated in place.
//
// See docs/Principles.md, "A Funding Observation Is Not A Funding
// Commitment (0.8.60)."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function expectThrowsAsync(fn, message) {
    let threw = false;
    try { await fn(); } catch (_e) { threw = true; }
    assert(threw, message);
}

const ALICE_P2WPKH = 'bc1q' + 'a'.repeat(38); // 42 chars total — a real P2WPKH-length bech32 address
const ALICE_P2TR = 'bc1p' + 'a'.repeat(58); // 62 chars total — a real P2TR-length bech32m address
const ALICE_P2PKH = '1' + 'a'.repeat(33); // a legacy-prefixed address
const ALICE_P2SH = '3' + 'a'.repeat(33); // a real, but unsupported, P2SH-prefixed address
const TXID_A = 'a'.repeat(64);
const TXID_B = 'b'.repeat(64);

function esploraUtxoEntry(txid, vout, value, confirmed = true) {
    return { txid, vout, value, status: { confirmed } };
}

function makeFakeEsploraFetch({ utxosByAddress = new Map(), status = 200, throwOnFetch = false, malformedBody = false } = {}) {
    const requestedAddresses = [];
    async function fetchImpl(url) {
        const parsed = new URL(url);
        const match = parsed.pathname.match(/\/address\/([^/]+)\/utxo$/);
        const address = match ? decodeURIComponent(match[1]) : null;
        requestedAddresses.push(address);
        if (throwOnFetch) throw new Error('simulated connection failure');
        if (status !== 200) return new Response('error', { status });
        if (malformedBody) return new Response('not-json{{{', { status: 200 });
        const utxos = utxosByAddress.get(address) || [];
        return new Response(JSON.stringify(utxos), { status: 200 });
    }
    return { requestedAddresses, fetchImpl };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP
    // ---------------------------------------------------------------
    {
        const utxosByAddress = new Map([
            [ALICE_P2WPKH, [esploraUtxoEntry(TXID_A, 0, 150000), esploraUtxoEntry(TXID_B, 1, 80000, false)]]
        ]);
        const { fetchImpl } = makeFakeEsploraFetch({ utxosByAddress });
        const fundingSource = new BitcoinEsploraWalletFundingSource({ apiUrl: 'https://explorer.test/api', fetchImpl });
        const observer = new BitcoinWalletFundingObserver({ fundingSource });

        const observation = await observer.observeFunding({ account: ALICE_P2WPKH, network: 'mainnet' });
        assert(observation.state === BitcoinAnchorFundingObservationState.OBSERVED, '1. a real address with real UTXOs is OBSERVED');
        assert(observation.utxos.length === 2, '2. both UTXOs the explorer reports are present');
        assert(observation.scriptType === 'p2wpkh', '3. a bc1q... address of the right length is recognized as p2wpkh');
        assert(observation.utxos.every((u) => u.scriptType === 'p2wpkh'), '4. every UTXO carries the observation\'s own scriptType');
        assert(observation.totalValueSats === 230000, '5. totalValueSats sums every observed UTXO\'s own valueSats');
        assert(observation.changeAccount === ALICE_P2WPKH, '6. changeAccount is exactly the account this funding was observed for — no separate wallet capability was consulted');
        assert(observation.account === ALICE_P2WPKH && observation.network === 'mainnet', '7. account and network are carried through as supplied');
        assert(observation.observedAt instanceof Date, '8. observedAt is this call\'s own local clock');

        // This milestone's own promise: the observation's own utxos and
        // changeAccount plug DIRECTLY into the REAL, unchanged 0.8.47
        // builder — no translation layer, no second shape.
        const transactionBuilder = new BitcoinAnchorTransactionBuilder({ network: 'mainnet', feeRateSatsPerVByte: 1 });
        const plan = transactionBuilder.build({
            contentHash: 'deadbeef',
            utxos: observation.utxos,
            changeAddress: observation.changeAccount
        });
        assert(plan.built === true, '9. a real BitcoinAnchorTransactionBuilder accepts this milestone\'s own observation utxos/changeAccount unmodified');
        assert(plan.totalInputSats > 0 && plan.totalInputSats <= observation.totalValueSats, '10. the builder\'s own deterministic selection draws from, and never exceeds, the observation\'s own totalValueSats');
    }
    console.log('✓ Section A (FLAGSHIP): a real Esplora UTXO response becomes an OBSERVED funding snapshot that plugs directly into the real 0.8.47 transaction builder');

    // ---------------------------------------------------------------
    // Section B — every script type the builder supports is recognized;
    // one it does not is honestly UNSUPPORTED, source never consulted.
    // ---------------------------------------------------------------
    {
        const { fetchImpl, requestedAddresses } = makeFakeEsploraFetch({
            utxosByAddress: new Map([
                [ALICE_P2TR, [esploraUtxoEntry(TXID_A, 0, 50000)]],
                [ALICE_P2PKH, [esploraUtxoEntry(TXID_A, 0, 60000)]]
            ])
        });
        const observer = new BitcoinWalletFundingObserver({
            fundingSource: new BitcoinEsploraWalletFundingSource({ apiUrl: 'https://explorer.test/api', fetchImpl })
        });

        const p2tr = await observer.observeFunding({ account: ALICE_P2TR, network: 'mainnet' });
        assert(p2tr.state === BitcoinAnchorFundingObservationState.OBSERVED && p2tr.scriptType === 'p2tr', '11. a bc1p... address is recognized as p2tr');

        const p2pkh = await observer.observeFunding({ account: ALICE_P2PKH, network: 'mainnet' });
        assert(p2pkh.state === BitcoinAnchorFundingObservationState.OBSERVED && p2pkh.scriptType === 'p2pkh', '12. a legacy "1..." address is recognized as p2pkh');

        const p2sh = await observer.observeFunding({ account: ALICE_P2SH, network: 'mainnet' });
        assert(p2sh.state === BitcoinAnchorFundingObservationState.UNSUPPORTED, '13. a real P2SH address is honestly UNSUPPORTED, never guessed at as p2wpkh');
        assert(p2sh.scriptType === null && p2sh.utxos.length === 0 && p2sh.changeAccount === null, '14. an UNSUPPORTED observation carries no scriptType, utxos, or changeAccount');
        assert(typeof p2sh.reason === 'string' && p2sh.reason.length > 0, '15. UNSUPPORTED carries a human-readable reason');
        assert(!requestedAddresses.includes(ALICE_P2SH), '16. the funding source is never even consulted for an unsupported address format');

        const p2wsh = await observer.observeFunding({ account: 'bc1q' + 'a'.repeat(58), network: 'mainnet' }); // 62 chars — P2WSH length
        assert(p2wsh.state === BitcoinAnchorFundingObservationState.UNSUPPORTED, '17. a bc1q... address of P2WSH length is also UNSUPPORTED, not silently treated as p2wpkh');
    }
    console.log('✓ Section B: p2wpkh/p2tr/p2pkh are recognized from the address\'s own real prefix; p2sh (and mis-lengthed bc1q) are honestly UNSUPPORTED without ever consulting the funding source');

    // ---------------------------------------------------------------
    // Section C — a source that cannot presently answer reports the
    // WHOLE observation as UNAVAILABLE, never a partial result.
    // ---------------------------------------------------------------
    {
        const throwingSource = { fetchUtxos: async () => { throw new Error('simulated: explorer unreachable'); } };
        const throwingObserver = new BitcoinWalletFundingObserver({ fundingSource: throwingSource });
        const throwingResult = await throwingObserver.observeFunding({ account: ALICE_P2WPKH, network: 'mainnet' });
        assert(throwingResult.state === BitcoinAnchorFundingObservationState.UNAVAILABLE, '18. a throwing fundingSource is reported as UNAVAILABLE, never propagated');
        assert(throwingResult.reason.includes('unreachable'), '19. the underlying reason is preserved');

        const noAnswerSource = { fetchUtxos: async () => ({ found: false, reason: 'explorer returned 503' }) };
        const noAnswerObserver = new BitcoinWalletFundingObserver({ fundingSource: noAnswerSource });
        const noAnswerResult = await noAnswerObserver.observeFunding({ account: ALICE_P2WPKH, network: 'mainnet' });
        assert(noAnswerResult.state === BitcoinAnchorFundingObservationState.UNAVAILABLE, '20. a { found: false } source result is UNAVAILABLE');

        // One malformed UTXO among otherwise good ones fails the WHOLE
        // observation — never a silently-dropped bad entry.
        const partiallyMalformedSource = {
            fetchUtxos: async () => ({
                found: true,
                utxos: [{ txid: TXID_A, vout: 0, valueSats: 10000, confirmed: true }, { txid: 'not-a-real-txid', vout: 0, valueSats: 5000, confirmed: true }]
            })
        };
        const malformedObserver = new BitcoinWalletFundingObserver({ fundingSource: partiallyMalformedSource });
        const malformedResult = await malformedObserver.observeFunding({ account: ALICE_P2WPKH, network: 'mainnet' });
        assert(malformedResult.state === BitcoinAnchorFundingObservationState.UNAVAILABLE, '21. one malformed UTXO entry fails the whole observation, never a partial success');
    }
    console.log('✓ Section C: an unreachable source, a definite { found: false }, and even one malformed UTXO entry all report the whole observation as UNAVAILABLE, never a partial or fabricated result');

    // ---------------------------------------------------------------
    // Section D — genuinely zero funds is OBSERVED, never UNAVAILABLE.
    // ---------------------------------------------------------------
    {
        const { fetchImpl } = makeFakeEsploraFetch({ utxosByAddress: new Map() });
        const observer = new BitcoinWalletFundingObserver({
            fundingSource: new BitcoinEsploraWalletFundingSource({ apiUrl: 'https://explorer.test/api', fetchImpl })
        });
        const result = await observer.observeFunding({ account: ALICE_P2WPKH, network: 'mainnet' });
        assert(result.state === BitcoinAnchorFundingObservationState.OBSERVED, '22. an address with no reported UTXOs is a real OBSERVED outcome, never UNAVAILABLE');
        assert(result.utxos.length === 0 && result.totalValueSats === 0, '23. zero funds is reported honestly as an empty list and a zero total');
    }
    console.log('✓ Section D: an address the explorer reports as genuinely empty is OBSERVED with zero UTXOs, never confused with UNAVAILABLE');

    // ---------------------------------------------------------------
    // Section E — label vocabulary, the view's own fixed field set, and
    // staleness against the wallet's current network.
    // ---------------------------------------------------------------
    {
        assert(describeBitcoinAnchorFundingStateLabel(BitcoinAnchorFundingObservationState.OBSERVED) === 'Funding observed', '24. OBSERVED label');
        assert(describeBitcoinAnchorFundingStateLabel(BitcoinAnchorFundingObservationState.UNSUPPORTED) === 'Unsupported address format', '25. UNSUPPORTED label');
        assert(describeBitcoinAnchorFundingStateLabel(BitcoinAnchorFundingObservationState.UNAVAILABLE) === 'Funding unavailable', '26. UNAVAILABLE label');
        assert(describeBitcoinAnchorFundingStateLabel('not-a-real-state') === null, '27. an unrecognized state names nothing, rather than guessing');

        const { fetchImpl } = makeFakeEsploraFetch({ utxosByAddress: new Map([[ALICE_P2WPKH, [esploraUtxoEntry(TXID_A, 0, 20000)]]]) });
        const observer = new BitcoinWalletFundingObserver({
            fundingSource: new BitcoinEsploraWalletFundingSource({ apiUrl: 'https://explorer.test/api', fetchImpl })
        });
        const observation = await observer.observeFunding({ account: ALICE_P2WPKH, network: 'mainnet' });
        const sameNetworkView = describeBitcoinAnchorFunding(observation, { expectedNetwork: 'mainnet' });
        assert(Object.keys(sameNetworkView).sort().join(',') ===
            ['state', 'stateLabel', 'account', 'network', 'expectedNetwork', 'networkMismatch', 'scriptType', 'utxos', 'utxoCount', 'totalValueSats', 'changeAccount', 'reason', 'observedAt'].sort().join(','),
            '28. describeBitcoinAnchorFunding() carries exactly this fixed field set — no more, no less');
        assert(Object.isFrozen(sameNetworkView), '29. the projected result is frozen');
        assert(sameNetworkView.networkMismatch === false, '30. the wallet\'s current network matches the network this funding was observed under — no mismatch');
        for (const forbidden of ['valid', 'safe', 'best', 'recommended', 'confidence', 'score']) {
            assert(!(forbidden in sameNetworkView), `31. describeBitcoinAnchorFunding() never carries a "${forbidden}" field — an observation is never promoted to a verdict`);
        }

        // The person switches their connected wallet to testnet after this
        // funding was already observed on mainnet — a real staleness fact,
        // reported, never auto-refreshed.
        const staleView = describeBitcoinAnchorFunding(observation, { expectedNetwork: 'testnet' });
        assert(staleView.networkMismatch === true, '32. a wallet reconnected to a different network than this funding was observed under is reported as a mismatch');
        assert(staleView.network === 'mainnet' && staleView.expectedNetwork === 'testnet', '33. neither network is silently substituted for the other');

        const unavailableView = describeBitcoinAnchorFunding(
            { state: BitcoinAnchorFundingObservationState.UNAVAILABLE, account: ALICE_P2WPKH, network: null, scriptType: null, utxos: [], totalValueSats: null, changeAccount: null, reason: 'unreachable', observedAt: new Date() },
            { expectedNetwork: 'mainnet' }
        );
        assert(unavailableView.networkMismatch === false, '34. an UNAVAILABLE observation never reports a mismatch — there is nothing real to compare');
    }
    console.log('✓ Section E: the label vocabulary names all three states honestly, describeBitcoinAnchorFunding() adds no field beyond its own fixed set, and a stale observation against the wallet\'s current network is named, never silently ignored');

    // ---------------------------------------------------------------
    // Section F — the concrete Esplora adapter's own wire behavior.
    // ---------------------------------------------------------------
    {
        const { fetchImpl } = makeFakeEsploraFetch({
            utxosByAddress: new Map([[ALICE_P2WPKH, [esploraUtxoEntry(TXID_A, 2, 12345, true), esploraUtxoEntry(TXID_B, 0, 6789, false)]]])
        });
        const source = new BitcoinEsploraWalletFundingSource({ apiUrl: 'https://explorer.test/api', fetchImpl });
        const result = await source.fetchUtxos(ALICE_P2WPKH);
        assert(result.found === true, '35. a 200 response with a real UTXO array is found');
        assert(result.utxos[0].valueSats === 12345 && result.utxos[0].confirmed === true, '36. Esplora\'s own "value" and "status.confirmed" are translated to valueSats/confirmed');
        assert(result.utxos[1].confirmed === false, '37. an unconfirmed UTXO is reported honestly, never assumed confirmed');

        const { fetchImpl: throwingFetch } = makeFakeEsploraFetch({ throwOnFetch: true });
        const throwingSource = new BitcoinEsploraWalletFundingSource({ apiUrl: 'https://explorer.test/api', fetchImpl: throwingFetch });
        let threw = false;
        let throwingResult;
        try { throwingResult = await throwingSource.fetchUtxos(ALICE_P2WPKH); } catch (_e) { threw = true; }
        assert(!threw, '38. a throwing fetchImpl never propagates out of fetchUtxos()');
        assert(throwingResult.found === false, '39. a throwing fetchImpl is reported as found: false');

        const { fetchImpl: serverErrorFetch } = makeFakeEsploraFetch({ status: 503 });
        const serverErrorSource = new BitcoinEsploraWalletFundingSource({ apiUrl: 'https://explorer.test/api', fetchImpl: serverErrorFetch });
        const serverErrorResult = await serverErrorSource.fetchUtxos(ALICE_P2WPKH);
        assert(serverErrorResult.found === false, '40. a non-2xx response is reported as found: false');

        const { fetchImpl: malformedFetch } = makeFakeEsploraFetch({ malformedBody: true });
        const malformedSource = new BitcoinEsploraWalletFundingSource({ apiUrl: 'https://explorer.test/api', fetchImpl: malformedFetch });
        const malformedResult = await malformedSource.fetchUtxos(ALICE_P2WPKH);
        assert(malformedResult.found === false, '41. an unparseable response body is reported as found: false');

        async function nonArrayFetch() { return new Response(JSON.stringify({ not: 'an array' }), { status: 200 }); }
        const nonArraySource = new BitcoinEsploraWalletFundingSource({ apiUrl: 'https://explorer.test/api', fetchImpl: nonArrayFetch });
        const nonArrayResult = await nonArraySource.fetchUtxos(ALICE_P2WPKH);
        assert(nonArrayResult.found === false, '42. a non-array JSON body is reported as found: false');

        // An address with genuinely no UTXOs is a real, empty 200 — never
        // treated as an error.
        const { fetchImpl: emptyFetch } = makeFakeEsploraFetch({ utxosByAddress: new Map() });
        const emptySource = new BitcoinEsploraWalletFundingSource({ apiUrl: 'https://explorer.test/api', fetchImpl: emptyFetch });
        const emptyResult = await emptySource.fetchUtxos(ALICE_P2WPKH);
        assert(emptyResult.found === true && emptyResult.utxos.length === 0, '43. a genuinely empty address is found: true with zero utxos, never a failure');
    }
    console.log('✓ Section F: BitcoinEsploraWalletFundingSource faithfully translates a real Esplora UTXO response, and never throws for any wire-level failure');

    // ---------------------------------------------------------------
    // Section G — every observation is fresh and independently frozen.
    // ---------------------------------------------------------------
    {
        const { fetchImpl } = makeFakeEsploraFetch({ utxosByAddress: new Map([[ALICE_P2WPKH, [esploraUtxoEntry(TXID_A, 0, 1000)]]]) });
        const observer = new BitcoinWalletFundingObserver({
            fundingSource: new BitcoinEsploraWalletFundingSource({ apiUrl: 'https://explorer.test/api', fetchImpl })
        });
        const first = await observer.observeFunding({ account: ALICE_P2WPKH, network: 'mainnet' });
        const second = await observer.observeFunding({ account: ALICE_P2WPKH, network: 'mainnet' });
        assert(first !== second, '44. two calls return two distinct record instances, never a cached one');
        assert(Object.isFrozen(first) && Object.isFrozen(first.utxos), '45. every observation, and its own utxos array, is frozen');

        await expectThrowsAsync(() => observer.observeFunding({ account: '', network: 'mainnet' }), '46. an empty account is a caller-contract violation and throws');
        await expectThrowsAsync(() => observer.observeFunding({ account: ALICE_P2WPKH, network: '' }), '47. an empty network is a caller-contract violation and throws');
    }
    console.log('✓ Section G: every observation is a fresh, independently frozen record — never cached, never mutated in place');

    console.log('\nAll BitcoinWalletFundingPreparation tests passed.');
}

run().catch((error) => {
    console.error('BitcoinWalletFundingPreparation.test.js FAILED:', error);
    process.exitCode = 1;
});
