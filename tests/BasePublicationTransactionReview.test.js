import { BasePublicationTransactionPlanner } from '../base/BasePublicationTransactionPlanner.js';
import { BasePublicationTransactionPlanCoordinator } from '../application/BasePublicationTransactionPlanCoordinator.js';
import { BasePublicationTransactionPlanState } from '../application/BasePublicationTransactionPlanState.js';
import { BaseNetworkObservationState } from '../application/BaseNetworkObservationState.js';
import { BaseAccountObservation } from '../application/BaseAccountObservation.js';
import { describeBasePublicationTransactionReview } from '../application/BasePublicationTransactionReview.js';

// 0.8.92 — Explicit Base Transaction Review.
//
// The flagship this milestone exists to prove: review is a presentation
// boundary over an already-CONSTRUCTED plan, never another transaction-
// processing stage. See docs/Roadmap.md, "0.8.92 — Explicit Base
// Transaction Review."
//
//   Section A: FLAGSHIP — reviewing the identical plan twice returns a
//              byte-identical result; the plan itself is never mutated;
//              constructing a SECOND, later plan against a fresher
//              observation never mutates the first plan or its own,
//              already-produced review.
//   Section B: FLAGSHIP — a plan freezes the fee figures it was built
//              with; reviewing it after the network reports DIFFERENT
//              figures still shows the frozen ones, never the new ones.
//   Section C: the commitment is made visible — contentHash is the exact
//              inverse decode of the plan's own data, and transactionData
//              is that data verbatim.
//   Section D: from/to/value are shown as plain, uninterpreted facts —
//              this file computes no isSelfTransfer boolean of its own.
//   Section E: describeBasePublicationTransactionReview()'s own fixed
//              field set, frozen result, and "never a verdict" restraint.
//   Section F: zero RPC/wallet/signing/broadcast calls — reviewing a plan
//              makes no call of any kind against the injected rpc source.
//   Section G: caller-contract violations — a missing plan, and every
//              individually malformed field, all throw before anything
//              is decoded.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch (_e) { threw = true; }
    assert(threw, message);
}

const ALICE_ADDRESS = '0x' + 'a1'.repeat(20);
const CONTENT_HASH = 'deadbeef'.repeat(8); // a 32-byte, sha256-shaped hash
const MAINNET_CHAIN_ID = 8453;

function observedAccount({ address = ALICE_ADDRESS, network = 'mainnet', chainId = MAINNET_CHAIN_ID, nativeBalanceWei = '100000000000000000' } = {}) {
    return new BaseAccountObservation({
        state: BaseNetworkObservationState.OBSERVED,
        address, network, chainId, nativeBalanceWei, observedAt: new Date()
    });
}

// A fake rpcSource shaped exactly like base/BaseJsonRpcClient.js's own
// construction-facing surface — never a real network call. Duplicated
// here, not imported from tests/BasePublicationTransactionConstruction.test.js,
// mirroring the identical self-containment every test file in this
// codebase already holds toward its own fixtures.
function fakeConstructionRpcSource({
    nonce = 5, gasLimit = 40000, gasPriceWei = '1000000000', maxPriorityFeePerGasWei = '100000000'
} = {}) {
    const calls = [];
    return {
        calls,
        async fetchTransactionCount() {
            calls.push('fetchTransactionCount');
            return { available: true, nonce };
        },
        async fetchGasEstimate() {
            calls.push('fetchGasEstimate');
            return { available: true, gasLimit };
        },
        async fetchGasPrice() {
            calls.push('fetchGasPrice');
            return { available: true, gasPriceWei };
        },
        async fetchMaxPriorityFeePerGas() {
            calls.push('fetchMaxPriorityFeePerGas');
            return { available: true, maxPriorityFeePerGasWei };
        }
    };
}

async function constructPlan(rpcSourceOptions = {}, accountOptions = {}) {
    const rpcSource = fakeConstructionRpcSource(rpcSourceOptions);
    const planner = new BasePublicationTransactionPlanner({ rpcSource });
    const coordinator = new BasePublicationTransactionPlanCoordinator({ basePublicationTransactionPlanner: planner });
    const outcome = await coordinator.construct({
        publicationId: 'pub-1',
        contentHash: CONTENT_HASH,
        accountObservation: observedAccount(accountOptions)
    });
    assert(outcome.state === BasePublicationTransactionPlanState.CONSTRUCTED, 'test setup: construction must reach CONSTRUCTED');
    return { outcome, rpcSource };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP: reviewing the identical plan twice is
    // byte-identical; the plan is never mutated; a later, unrelated
    // construction never mutates an earlier plan or its review.
    // ---------------------------------------------------------------
    {
        const { outcome } = await constructPlan();
        const plan = outcome.construction.plan;

        const review1 = describeBasePublicationTransactionReview(plan);
        const review2 = describeBasePublicationTransactionReview(plan);
        assert(JSON.stringify(review1) === JSON.stringify(review2), '1. reviewing the identical plan twice returns a byte-identical result');
        assert(review1 !== review2, '2. each call still returns its own, distinct frozen object — never a cached reference');
        assert(Object.isFrozen(plan), '3. the plan itself remains frozen throughout');

        // A second, later construction — against a genuinely DIFFERENT
        // observed nonce and fee figures — must never mutate the first
        // plan or the review already taken from it.
        const { outcome: laterOutcome } = await constructPlan({ nonce: 99, gasLimit: 55000, gasPriceWei: '9999999999', maxPriorityFeePerGasWei: '8888888888' });
        assert(laterOutcome.construction.plan.nonce === 99, '4. the later, unrelated construction reports its own, different nonce');
        assert(plan.nonce === 5 && review1.nonce === 5, '5. the EARLIER plan and its already-taken review are entirely unaffected by the later construction');

        const review1Again = describeBasePublicationTransactionReview(plan);
        assert(JSON.stringify(review1Again) === JSON.stringify(review1), '6. reviewing the earlier plan again, after the later construction, still returns the identical result');
    }
    console.log('✓ Section A (FLAGSHIP): review(plan) is pure and byte-identical; an unrelated later construction never mutates an earlier plan or its review');

    // ---------------------------------------------------------------
    // Section B — FLAGSHIP: a plan freezes the fee figures it was built
    // with; review shows those frozen figures, never a fresher network
    // reading.
    // ---------------------------------------------------------------
    {
        const { outcome } = await constructPlan({ gasPriceWei: '1000000000', maxPriorityFeePerGasWei: '100000000' });
        const plan = outcome.construction.plan;
        const review = describeBasePublicationTransactionReview(plan);
        assert(review.maxFeePerGas === '1000000000', '7. the review reports the plan\'s own frozen maxFeePerGas');
        assert(review.maxPriorityFeePerGas === '100000000', '8. the review reports the plan\'s own frozen maxPriorityFeePerGas');

        // A fake network that would now report entirely DIFFERENT fee
        // figures for a FRESH construction — reviewing the ORIGINAL plan
        // must still show the original figures, never these.
        const { outcome: freshOutcome } = await constructPlan({ gasPriceWei: '7000000000', maxPriorityFeePerGasWei: '600000000' });
        assert(freshOutcome.construction.plan.maxFeePerGas === '7000000000', '9. a fresh construction genuinely observes the new, different fee figures');

        const reviewAgain = describeBasePublicationTransactionReview(plan);
        assert(reviewAgain.maxFeePerGas === '1000000000' && reviewAgain.maxPriorityFeePerGas === '100000000',
            '10. reviewing the ORIGINAL plan still reports its own frozen fee figures, never the network\'s newer opinion');
    }
    console.log('✓ Section B (FLAGSHIP): a plan\'s frozen fee figures survive review untouched by a later, fresher network reading');

    // ---------------------------------------------------------------
    // Section C — the commitment is made visible, not just carried
    // through.
    // ---------------------------------------------------------------
    {
        const { outcome } = await constructPlan();
        const plan = outcome.construction.plan;
        const review = describeBasePublicationTransactionReview(plan);
        assert(plan.data === '0x' + CONTENT_HASH, '11. test setup: the plan\'s own data is the raw, "0x"-prefixed commitment');
        assert(review.contentHash === CONTENT_HASH, '12. the review decodes the exact content hash back out of the plan\'s own data');
        assert(review.transactionData === plan.data, '13. the review also reports the raw transaction data verbatim, alongside the decoded hash');
    }
    console.log('✓ Section C: contentHash and transactionData both surface, factually, from the plan\'s own commitment bytes');

    // ---------------------------------------------------------------
    // Section D — from/to/value are shown as plain, uninterpreted facts.
    // ---------------------------------------------------------------
    {
        const { outcome } = await constructPlan();
        const review = describeBasePublicationTransactionReview(outcome.construction.plan);
        assert(review.from === ALICE_ADDRESS && review.to === ALICE_ADDRESS, '14. from and to are both reported, and happen to be identical (self-transfer) — a fact the review shows, never labels');
        assert(review.value === '0', '15. value is reported as the plan\'s own decimal-digit string');
        assert(!('isSelfTransfer' in review), '16. the review computes no isSelfTransfer boolean of its own — from === to is left for the reader to notice');
    }
    console.log('✓ Section D: from/to/value are plain facts — no computed self-transfer interpretation');

    // ---------------------------------------------------------------
    // Section E — fixed field set, frozen result, never a verdict.
    // ---------------------------------------------------------------
    {
        const { outcome } = await constructPlan();
        const review = describeBasePublicationTransactionReview(outcome.construction.plan);
        assert(Object.isFrozen(review), '17. the review result is frozen');
        assert(Object.keys(review).sort().join(',') ===
            ['chainId', 'contentHash', 'from', 'gasLimit', 'maxFeePerGas', 'maxPriorityFeePerGas', 'network', 'nonce', 'to', 'transactionData', 'value'].sort().join(','),
            '18. describeBasePublicationTransactionReview() carries exactly this fixed field set — no more, no less');
        for (const forbidden of ['valid', 'safe', 'ready', 'validated', 'recommended', 'confidence', 'score', 'trusted', 'authorized', 'isSelfTransfer']) {
            assert(!(forbidden in review), `19. the review never carries a "${forbidden}" field — reviewing a plan's own facts is never promoted to a verdict about it`);
        }
    }
    console.log('✓ Section E: describeBasePublicationTransactionReview() carries exactly its documented, frozen, verdict-free field set');

    // ---------------------------------------------------------------
    // Section F — zero RPC/wallet/signing/broadcast calls.
    // ---------------------------------------------------------------
    {
        const { outcome, rpcSource } = await constructPlan();
        const callsAfterConstruction = rpcSource.calls.length;
        assert(callsAfterConstruction === 4, '20. test setup: construction itself makes exactly the four expected reads');

        describeBasePublicationTransactionReview(outcome.construction.plan);
        describeBasePublicationTransactionReview(outcome.construction.plan);
        describeBasePublicationTransactionReview(outcome.construction.plan);
        assert(rpcSource.calls.length === callsAfterConstruction, '21. reviewing the plan — even three times — makes zero further calls of any kind against the rpc source');
    }
    console.log('✓ Section F: review(plan) makes 0 RPC calls, 0 wallet calls, 0 signing calls, 0 broadcast calls');

    // ---------------------------------------------------------------
    // Section G — caller-contract violations throw before anything is
    // decoded.
    // ---------------------------------------------------------------
    {
        const { outcome } = await constructPlan();
        const realPlan = outcome.construction.plan;

        expectThrows(() => describeBasePublicationTransactionReview(null), '22. a null plan throws');
        expectThrows(() => describeBasePublicationTransactionReview(undefined), '23. an undefined plan throws');
        expectThrows(() => describeBasePublicationTransactionReview({ not: 'a real plan' }), '24. an arbitrary object throws — this is a caller-contract violation, never an operational "review unavailable" outcome');
        expectThrows(() => describeBasePublicationTransactionReview({ ...realPlan, network: 'testnet-typo' }), '25. an invalid network throws');
        expectThrows(() => describeBasePublicationTransactionReview({ ...realPlan, chainId: 'not-a-number' }), '26. a non-integer chainId throws');
        expectThrows(() => describeBasePublicationTransactionReview({ ...realPlan, from: '0xnotanaddress' }), '27. a malformed from address throws');
        expectThrows(() => describeBasePublicationTransactionReview({ ...realPlan, to: 'not-even-hex-shaped' }), '28. a malformed to address throws');
        expectThrows(() => describeBasePublicationTransactionReview({ ...realPlan, value: 123 }), '29. a value that is not a decimal-digit string throws');
        expectThrows(() => describeBasePublicationTransactionReview({ ...realPlan, nonce: -1 }), '30. a negative nonce throws');
        expectThrows(() => describeBasePublicationTransactionReview({ ...realPlan, gasLimit: 0 }), '31. a zero gasLimit throws');
        expectThrows(() => describeBasePublicationTransactionReview({ ...realPlan, maxFeePerGas: '1.5' }), '32. a non-decimal-digit maxFeePerGas throws');
        expectThrows(() => describeBasePublicationTransactionReview({ ...realPlan, maxPriorityFeePerGas: null }), '33. a missing maxPriorityFeePerGas throws');
        expectThrows(() => describeBasePublicationTransactionReview({ ...realPlan, data: 'not-0x-prefixed' }), '34. malformed transaction data throws — independently re-validated by decodeBasePublicationCommitment()');

        // The genuinely well-formed plan, unchanged, still reviews cleanly.
        const review = describeBasePublicationTransactionReview(realPlan);
        assert(review.contentHash === CONTENT_HASH, '35. the real, unmodified plan still reviews correctly after every rejected variant above');
    }
    console.log('✓ Section G: every individually malformed plan field throws as a caller-contract violation, before anything is decoded');

    console.log('\nAll BasePublicationTransactionReview tests passed.');
}

run().catch((error) => {
    console.error('BasePublicationTransactionReview.test.js FAILED:', error);
    process.exitCode = 1;
});
