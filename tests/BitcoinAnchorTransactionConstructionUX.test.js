import { BitcoinWalletFundingObserver } from '../anchoring/BitcoinWalletFundingObserver.js';
import { BitcoinAnchorTransactionBuilder } from '../anchoring/BitcoinAnchorTransactionBuilder.js';
import { BitcoinAnchorFundingObservationState } from '../application/BitcoinAnchorFundingObservationState.js';
import { BitcoinAnchorTransactionConstructionCoordinator } from '../application/BitcoinAnchorTransactionConstructionCoordinator.js';
import { BitcoinAnchorTransactionConstructionState, isValidBitcoinAnchorTransactionConstructionState } from '../application/BitcoinAnchorTransactionConstructionState.js';
import {
    describeBitcoinAnchorTransactionConstruction,
    describeBitcoinAnchorTransactionConstructionStateLabel
} from '../application/BitcoinAnchorTransactionConstructionView.js';

// 0.8.61 — Explicit Bitcoin Anchor Transaction Construction UI.
//
// The flagship this milestone exists to prove: a real, OBSERVED funding
// snapshot (0.8.60) becomes a real, deterministic transaction plan (0.8.47)
// through exactly one explicit action — never automatically the moment
// funding is observed — and that plan reaches a screen's worth of facts
// (application/BitcoinAnchorTransactionConstructionView.js) unmodified,
// through the exact sequence a real person would experience —
//
//   observe funding (0.8.60, unchanged) -> explicit "Create Transaction
//     Plan" -> BitcoinAnchorTransactionConstructionCoordinator.construct()
//     (new) -> the unchanged 0.8.47 builder -> a frozen construction
//     identity -> a verdict-free UI projection
//
//   Section A: FLAGSHIP — a real funding observation's own utxos/changeAccount
//              feed directly into the REAL, unchanged 0.8.47 builder, and the
//              resulting plan matches calling that builder directly; the view
//              distinguishes "observed" from "constructed" as two separate
//              moments.
//   Section B: UTXO input order doesn't affect the resulting plan.
//   Section C: the funding observation itself is never mutated by construction.
//   Section D: construction never re-observes the wallet or contacts a
//              funding source — not on the first call, and not on a stale
//              observation reused later.
//   Section E: insufficient funding stops immediately, synchronously, with
//              no partial plan.
//   Section F: the exact plan reaches the view projection unmodified.
//   Section G: no signing or broadcasting material appears anywhere in a
//              construction outcome, and the coordinator exposes no
//              sign/broadcast capability of its own.
//   Section H: no recommendation/ranking vocabulary appears in the view.
//   Section I: reconstructing from the same observation and content hash
//              produces the byte-identical plan.
//   Section J: caller-contract violations are refused before the builder is
//              ever consulted.
//
// See docs/Principles.md, "A Transaction Plan Records What Produced It; It
// Does Not Refresh It (0.8.61)."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch (_e) { threw = true; }
    assert(threw, message);
}

const ALICE_P2WPKH = 'bc1q' + 'a'.repeat(38); // 42 chars — a real P2WPKH-length bech32 address
const TXID_A = 'a'.repeat(64);
const TXID_B = 'b'.repeat(64);

function fakeFundingSource(utxos, { calls = [] } = {}) {
    return {
        calls,
        async fetchUtxos(account) {
            calls.push(account);
            return { found: true, utxos };
        }
    };
}

async function observeAlice(utxos) {
    const calls = [];
    const fundingSource = fakeFundingSource(utxos, { calls });
    const observer = new BitcoinWalletFundingObserver({ fundingSource });
    const observation = await observer.observeFunding({ account: ALICE_P2WPKH, network: 'mainnet' });
    return { observation, fundingSourceCalls: calls };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP.
    // ---------------------------------------------------------------
    {
        const { observation } = await observeAlice([
            { txid: TXID_A, vout: 0, valueSats: 150000 },
            { txid: TXID_B, vout: 1, valueSats: 80000 }
        ]);
        assert(observation.state === BitcoinAnchorFundingObservationState.OBSERVED, '1. a real fundingSource produces a real OBSERVED observation');

        const builder = new BitcoinAnchorTransactionBuilder({ network: 'mainnet', feeRateSatsPerVByte: 1 });
        const { coordinator } = { coordinator: new BitcoinAnchorTransactionConstructionCoordinator({ bitcoinAnchorTransactionBuilder: builder }) };

        const outcome = coordinator.construct({
            publicationId: 'pub-1', contentHash: 'deadbeef', fundingObservation: observation
        });
        assert(outcome.state === BitcoinAnchorTransactionConstructionState.CONSTRUCTED, '2. a comfortably funded observation constructs successfully');
        assert(Object.isFrozen(outcome.construction), '3. the construction identity is frozen');

        // Proves this milestone's own output genuinely satisfies 0.8.47's
        // builder contract end to end: calling the SAME builder directly
        // with the observation's own utxos/changeAccount produces the
        // byte-identical plan the coordinator itself produced.
        const directPlan = builder.build({ contentHash: 'deadbeef', utxos: observation.utxos, changeAddress: observation.changeAccount });
        assert(JSON.stringify(outcome.construction.plan) === JSON.stringify(directPlan), '4. the coordinator\'s plan is byte-identical to calling the unchanged 0.8.47 builder directly with this observation\'s own facts');

        const view = describeBitcoinAnchorTransactionConstruction(outcome);
        assert(view.state === BitcoinAnchorTransactionConstructionState.CONSTRUCTED, '5. the view reports the coordinator\'s own state');
        assert(view.stateLabel === describeBitcoinAnchorTransactionConstructionStateLabel(BitcoinAnchorTransactionConstructionState.CONSTRUCTED), '6. the view\'s stateLabel matches the label vocabulary');
        assert(view.contentHash === 'deadbeef' && view.publicationId === 'pub-1', '7. the view reports the exact publicationId/contentHash construction was requested for');
        assert(view.network === 'mainnet', '8. the view reports the plan\'s own network');
        assert(view.selectedInputCount === outcome.construction.plan.inputs.length, '9. selectedInputCount reports the builder\'s own resulting selection size');
        assert(view.feeSats === outcome.construction.plan.feeSats && view.totalInputSats === outcome.construction.plan.totalInputSats, '10. the view reports the exact fee and total input value');

        // Two different moments, named separately — never collapsed into one.
        assert(view.fundingObservedAt === observation.observedAt, '11. fundingObservedAt is exactly the funding observation\'s own observedAt');
        assert(view.constructedAt instanceof Date, '12. constructedAt is the coordinator\'s own local clock read');
        assert(view.constructedAt !== view.fundingObservedAt, '13. observed-at and constructed-at are two distinct moments, never conflated');
    }
    console.log('✓ Section A (FLAGSHIP): a real funding observation constructs, through the unchanged 0.8.47 builder, a plan whose view honestly distinguishes when funding was observed from when the plan was constructed');

    // ---------------------------------------------------------------
    // Section B — UTXO input order doesn't affect the resulting plan.
    // ---------------------------------------------------------------
    {
        const builder = new BitcoinAnchorTransactionBuilder({ network: 'mainnet', feeRateSatsPerVByte: 1 });
        const coordinator = new BitcoinAnchorTransactionConstructionCoordinator({ bitcoinAnchorTransactionBuilder: builder });

        const { observation: inOrder } = await observeAlice([
            { txid: TXID_A, vout: 0, valueSats: 100 },
            { txid: TXID_B, vout: 0, valueSats: 100 }
        ]);
        const { observation: shuffled } = await observeAlice([
            { txid: TXID_B, vout: 0, valueSats: 100 },
            { txid: TXID_A, vout: 0, valueSats: 100 }
        ]);

        const outcomeInOrder = coordinator.construct({ publicationId: 'p', contentHash: 'ab', fundingObservation: inOrder });
        const outcomeShuffled = coordinator.construct({ publicationId: 'p', contentHash: 'ab', fundingObservation: shuffled });
        assert(JSON.stringify(outcomeInOrder.construction.plan) === JSON.stringify(outcomeShuffled.construction.plan), '14. the resulting plan does not depend on the order UTXOs were observed in');
    }
    console.log('✓ Section B: UTXO input order does not affect the resulting plan');

    // ---------------------------------------------------------------
    // Section C — the funding observation itself is never mutated.
    // ---------------------------------------------------------------
    {
        const { observation } = await observeAlice([{ txid: TXID_A, vout: 0, valueSats: 100000 }]);
        const before = JSON.stringify(observation);
        const builder = new BitcoinAnchorTransactionBuilder({ network: 'mainnet', feeRateSatsPerVByte: 1 });
        const coordinator = new BitcoinAnchorTransactionConstructionCoordinator({ bitcoinAnchorTransactionBuilder: builder });

        const outcome = coordinator.construct({ publicationId: 'p', contentHash: 'ab', fundingObservation: observation });
        assert(JSON.stringify(observation) === before, '15. the funding observation is byte-identical after construction — never mutated');
        assert(outcome.construction.fundingObservation === observation, '16. the construction carries the exact observation instance it was given, never a copy that could silently drift');
    }
    console.log('✓ Section C: the funding observation remains unchanged after construction');

    // ---------------------------------------------------------------
    // Section D — construction never re-observes the wallet or contacts a
    // funding source, on the first call or on a stale observation reused
    // later.
    // ---------------------------------------------------------------
    {
        const { observation, fundingSourceCalls } = await observeAlice([{ txid: TXID_A, vout: 0, valueSats: 100000 }]);
        assert(fundingSourceCalls.length === 1, '17. sanity: observing funding calls the source exactly once');

        const builder = new BitcoinAnchorTransactionBuilder({ network: 'mainnet', feeRateSatsPerVByte: 1 });
        const coordinator = new BitcoinAnchorTransactionConstructionCoordinator({ bitcoinAnchorTransactionBuilder: builder });

        coordinator.construct({ publicationId: 'p', contentHash: 'ab', fundingObservation: observation });
        assert(fundingSourceCalls.length === 1, '18. constructing a plan never contacts the funding source again');

        // A "stale" observation — nothing distinguishes it structurally
        // from a fresh one to this coordinator, which is exactly the
        // point: it is used exactly as given, never silently refreshed.
        coordinator.construct({ publicationId: 'p', contentHash: 'cd', fundingObservation: observation });
        assert(fundingSourceCalls.length === 1, '19. reusing an already-observed (possibly stale) funding observation for a second construction still never re-observes the wallet');
    }
    console.log('✓ Section D: construction never re-observes the wallet, on a first attempt or a reused observation');

    // ---------------------------------------------------------------
    // Section E — insufficient funding stops immediately, synchronously,
    // with no partial plan.
    // ---------------------------------------------------------------
    {
        const { observation } = await observeAlice([{ txid: TXID_A, vout: 0, valueSats: 50 }]);
        const builder = new BitcoinAnchorTransactionBuilder({ network: 'mainnet', feeRateSatsPerVByte: 1 });
        const coordinator = new BitcoinAnchorTransactionConstructionCoordinator({ bitcoinAnchorTransactionBuilder: builder });

        const outcome = coordinator.construct({ publicationId: 'p', contentHash: 'ab', fundingObservation: observation });
        assert(!(outcome instanceof Promise), '20. construct() is synchronous — there is nothing here for a caller to await');
        assert(outcome.state === BitcoinAnchorTransactionConstructionState.FAILED, '21. a utxo too small to cover the fee fails construction');
        assert(outcome.construction === null, '22. a failed construction carries no partial plan of any kind');
        assert(typeof outcome.reason === 'string' && outcome.reason.includes('insufficient funds'), '23. the builder\'s own reason is carried through verbatim');

        const view = describeBitcoinAnchorTransactionConstruction(outcome);
        assert(view.state === BitcoinAnchorTransactionConstructionState.FAILED, '24. the view reports FAILED');
        assert(view.reason === outcome.reason, '25. the view reports the exact failure reason, unmodified');
        assert(view.inputs.length === 0 && view.outputs.length === 0 && view.feeSats === null, '26. a failed view carries no fabricated inputs, outputs, or fee');
    }
    console.log('✓ Section E: insufficient funding fails construction immediately and synchronously, with no partial plan anywhere');

    // ---------------------------------------------------------------
    // Section F — the exact plan reaches the view projection unmodified.
    // ---------------------------------------------------------------
    {
        const { observation } = await observeAlice([{ txid: TXID_A, vout: 0, valueSats: 100000 }]);
        const builder = new BitcoinAnchorTransactionBuilder({ network: 'mainnet', feeRateSatsPerVByte: 1 });
        const coordinator = new BitcoinAnchorTransactionConstructionCoordinator({ bitcoinAnchorTransactionBuilder: builder });
        const outcome = coordinator.construct({ publicationId: 'p', contentHash: 'ab', fundingObservation: observation });
        const view = describeBitcoinAnchorTransactionConstruction(outcome);

        assert(JSON.stringify(view.inputs) === JSON.stringify(outcome.construction.plan.inputs), '27. the view\'s inputs are the plan\'s own inputs, unmodified');
        const opReturn = outcome.construction.plan.outputs.find((o) => o.type === 'op_return');
        assert(view.outputs.find((o) => o.type === 'op_return').valueSats === opReturn.valueSats, '28. the view\'s op_return output matches the plan\'s own exactly');
        assert(view.changeSats === (outcome.construction.plan.outputs.find((o) => o.type === 'change') || { valueSats: 0 }).valueSats, '29. changeSats matches the plan\'s own change output exactly');
    }
    console.log('✓ Section F: the exact plan reaches the view projection unmodified');

    // ---------------------------------------------------------------
    // Section G — no signing/broadcasting material anywhere, and the
    // coordinator exposes no sign/broadcast capability of its own.
    // ---------------------------------------------------------------
    {
        const { observation } = await observeAlice([{ txid: TXID_A, vout: 0, valueSats: 100000 }]);
        const builder = new BitcoinAnchorTransactionBuilder({ network: 'mainnet', feeRateSatsPerVByte: 1 });
        const coordinator = new BitcoinAnchorTransactionConstructionCoordinator({ bitcoinAnchorTransactionBuilder: builder });

        assert(typeof coordinator.sign !== 'function' && typeof coordinator.requestSignature !== 'function', '30. the coordinator exposes no signing capability');
        assert(typeof coordinator.broadcast !== 'function', '31. the coordinator exposes no broadcasting capability');

        const outcome = coordinator.construct({ publicationId: 'p', contentHash: 'ab', fundingObservation: observation });
        const serialized = JSON.stringify(outcome);
        const forbidden = ['privateKey', 'private_key', 'signature', 'witness', 'txHex', 'rawHex', 'seed', 'wif', 'broadcast'];
        for (const word of forbidden) {
            assert(!serialized.toLowerCase().includes(word.toLowerCase()), `32. a construction outcome never carries a "${word}" field — this coordinator never signs or broadcasts anything`);
        }
    }
    console.log('✓ Section G: no signing or broadcasting material appears anywhere, and the coordinator exposes no such capability');

    // ---------------------------------------------------------------
    // Section H — no recommendation/ranking vocabulary appears in the
    // view.
    // ---------------------------------------------------------------
    {
        const { observation } = await observeAlice([{ txid: TXID_A, vout: 0, valueSats: 100000 }]);
        const builder = new BitcoinAnchorTransactionBuilder({ network: 'mainnet', feeRateSatsPerVByte: 1 });
        const coordinator = new BitcoinAnchorTransactionConstructionCoordinator({ bitcoinAnchorTransactionBuilder: builder });
        const outcome = coordinator.construct({ publicationId: 'p', contentHash: 'ab', fundingObservation: observation });
        const view = describeBitcoinAnchorTransactionConstruction(outcome);

        assert('selectedInputCount' in view && !('bestInputCount' in view) && !('optimalInputCount' in view), '33. the selection count is named "selected," never "best" or "optimal"');
        const serialized = JSON.stringify(view).toLowerCase();
        for (const forbidden of ['best', 'optimal', 'recommended', 'safe', 'trusted', 'valid', 'score', 'confidence']) {
            assert(!serialized.includes(forbidden), `34. the view never carries "${forbidden}" — a constructed plan's own facts are never promoted to a verdict about it`);
        }
        for (const forbiddenState of ['ready', 'safe', 'valid', 'optimal', 'best', 'trusted']) {
            assert(!Object.values(BitcoinAnchorTransactionConstructionState).includes(forbiddenState), `35. the construction state vocabulary never carries a "${forbiddenState}" value`);
        }
        assert(Object.values(BitcoinAnchorTransactionConstructionState).length === 4, '36. the construction state vocabulary carries exactly its four documented values — no more, no less');
        assert(isValidBitcoinAnchorTransactionConstructionState(BitcoinAnchorTransactionConstructionState.CONSTRUCTED), '37. isValidBitcoinAnchorTransactionConstructionState() recognizes a real state value');
        assert(!isValidBitcoinAnchorTransactionConstructionState('optimal'), '38. isValidBitcoinAnchorTransactionConstructionState() rejects a value outside the vocabulary');
    }
    console.log('✓ Section H: no recommendation or ranking vocabulary appears anywhere in the view or the state vocabulary');

    // ---------------------------------------------------------------
    // Section I — reconstructing from the same observation and content
    // hash produces the byte-identical plan.
    // ---------------------------------------------------------------
    {
        const { observation } = await observeAlice([
            { txid: TXID_A, vout: 0, valueSats: 120000 },
            { txid: TXID_B, vout: 1, valueSats: 30000 }
        ]);
        const builder = new BitcoinAnchorTransactionBuilder({ network: 'mainnet', feeRateSatsPerVByte: 3 });
        const coordinator = new BitcoinAnchorTransactionConstructionCoordinator({ bitcoinAnchorTransactionBuilder: builder });

        const first = coordinator.construct({ publicationId: 'p', contentHash: 'facefeed', fundingObservation: observation });
        const second = coordinator.construct({ publicationId: 'p', contentHash: 'facefeed', fundingObservation: observation });
        assert(JSON.stringify(first.construction.plan) === JSON.stringify(second.construction.plan), '39. same observed inputs + same content hash + same policy produce the same transaction plan');
    }
    console.log('✓ Section I: reconstructing from the same observation and content hash is fully deterministic');

    // ---------------------------------------------------------------
    // Section J — caller-contract violations are refused before the
    // builder is ever consulted.
    // ---------------------------------------------------------------
    {
        const { observation } = await observeAlice([{ txid: TXID_A, vout: 0, valueSats: 100000 }]);
        let buildCalls = 0;
        const spyBuilder = {
            build(args) { buildCalls++; return new BitcoinAnchorTransactionBuilder({ network: 'mainnet', feeRateSatsPerVByte: 1 }).build(args); }
        };
        const coordinator = new BitcoinAnchorTransactionConstructionCoordinator({ bitcoinAnchorTransactionBuilder: spyBuilder });

        expectThrows(() => coordinator.construct({ publicationId: '', contentHash: 'ab', fundingObservation: observation }), '40. a missing publicationId is refused');
        expectThrows(() => coordinator.construct({ publicationId: 'p', contentHash: '', fundingObservation: observation }), '41. a missing contentHash is refused');
        expectThrows(() => coordinator.construct({ publicationId: 'p', contentHash: 'ab', fundingObservation: null }), '42. a missing fundingObservation is refused');
        expectThrows(() => coordinator.construct({
            publicationId: 'p', contentHash: 'ab',
            fundingObservation: { state: BitcoinAnchorFundingObservationState.UNAVAILABLE, utxos: [], changeAccount: null }
        }), '43. a non-OBSERVED (UNAVAILABLE) funding observation is refused — this coordinator never observes funding itself');
        expectThrows(() => coordinator.construct({
            publicationId: 'p', contentHash: 'ab',
            fundingObservation: { state: BitcoinAnchorFundingObservationState.UNSUPPORTED, utxos: [], changeAccount: null }
        }), '44. a non-OBSERVED (UNSUPPORTED) funding observation is refused');
        expectThrows(() => new BitcoinAnchorTransactionConstructionCoordinator({}), '45. constructing the coordinator without a real builder throws');

        assert(buildCalls === 0, '46. none of these caller-contract violations ever reach the builder');
    }
    console.log('✓ Section J: caller-contract violations are refused before the builder is ever consulted');

    console.log('\nAll BitcoinAnchorTransactionConstructionUX tests passed.');
}

run().catch((error) => {
    console.error('BitcoinAnchorTransactionConstructionUX.test.js FAILED:', error);
    process.exitCode = 1;
});
