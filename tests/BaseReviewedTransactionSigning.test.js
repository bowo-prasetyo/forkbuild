import { BasePublicationTransactionPlanner } from '../base/BasePublicationTransactionPlanner.js';
import { BasePublicationTransactionPlanCoordinator } from '../application/BasePublicationTransactionPlanCoordinator.js';
import { BasePublicationTransactionPlanState } from '../application/BasePublicationTransactionPlanState.js';
import { BaseNetworkObservationState } from '../application/BaseNetworkObservationState.js';
import { BaseAccountObservation } from '../application/BaseAccountObservation.js';
import { describeBasePublicationTransactionReview } from '../application/BasePublicationTransactionReview.js';
import { BaseTransactionSigner } from '../base/BaseTransactionSigner.js';
import { BaseReviewedTransactionSigner } from '../base/BaseReviewedTransactionSigner.js';
import { BaseInjectedProviderWalletTransactionSigner } from '../base/BaseInjectedProviderWalletTransactionSigner.js';
import { BaseReviewedSigningCoordinator } from '../application/BaseReviewedSigningCoordinator.js';
import { BaseReviewedSigningState, isValidBaseReviewedSigningState } from '../application/BaseReviewedSigningState.js';
import { describeBaseReviewedSigning, describeBaseReviewedSigningStateLabel } from '../application/BaseReviewedSigningView.js';

// 0.8.93 — Explicit Base Reviewed Transaction Signing.
//
// The flagship this milestone exists to prove: signing authorizes the
// EXACT reviewed transaction plan — it never reconstructs or modifies
// that plan, and it never broadcasts anything. See docs/Roadmap.md,
// "0.8.93 — Explicit Base Reviewed Transaction Signing."
//
//   Section A: FLAGSHIP — exact-plan binding: the wallet receives a
//              transactionRequest built ONLY from the exact reviewed
//              plan's own fields, byte for byte, including an explicit
//              EIP-1559 transaction type.
//   Section B: FLAGSHIP — no reconstruction: a later, unrelated
//              construction against fresh nonce/gas/fee figures never
//              changes what an EARLIER plan signs with.
//   Section C: FLAGSHIP — no broadcast: signing calls no broadcast-shaped
//              method of any kind.
//   Section D: FLAGSHIP — declined attempt, no retry: a DECLINED attempt
//              stays DECLINED; a second, explicit click is its own fresh
//              attempt.
//   Section E: FLAGSHIP — plan isolation: signing one plan never mutates
//              it, or any other, unrelated plan.
//   Section F: FLAGSHIP — no private-key ownership anywhere in this
//              milestone's own public surface.
//   Section G: review-mismatch refusal — a plan that no longer matches
//              what was reviewed is refused before the wallet is ever
//              consulted.
//   Section H: BaseReviewedSigningCoordinator — UNAVAILABLE/FAILED/state
//              mapping, caller-contract violations.
//   Section I: BaseReviewedSigningState/View — closed vocabulary, no raw
//              artifact ever exposed by the view.
//   Section J: BaseInjectedProviderWalletTransactionSigner — the one
//              concrete EIP-1193 adapter this milestone ships.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch (_e) { threw = true; }
    assert(threw, message);
}

async function expectThrowsAsync(fn, message) {
    let threw = false;
    try { await fn(); } catch (_e) { threw = true; }
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
// here, not imported from tests/BasePublicationTransactionReview.test.js,
// mirroring the identical self-containment every test file in this
// codebase already holds toward its own fixtures.
function fakeConstructionRpcSource({
    nonce = 5, gasLimit = 40000, gasPriceWei = '1000000000', maxPriorityFeePerGasWei = '100000000'
} = {}) {
    return {
        async fetchTransactionCount() { return { available: true, nonce }; },
        async fetchGasEstimate() { return { available: true, gasLimit }; },
        async fetchGasPrice() { return { available: true, gasPriceWei }; },
        async fetchMaxPriorityFeePerGas() { return { available: true, maxPriorityFeePerGasWei }; }
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
    return outcome.construction.plan;
}

// A fake wallet exposing exactly `signTransaction()`, and nothing that
// could be mistaken for a broadcaster — `sendTransactionCalls`/
// `broadcastCalls` exist ONLY so a test can prove they are never
// incremented, never because this fake actually implements either
// capability for real.
function fakeWallet({ behavior = 'sign' } = {}) {
    const requests = [];
    const wallet = {
        requests,
        sendTransactionCalls: 0,
        broadcastCalls: 0,
        async signTransaction(transactionRequest) {
            requests.push(transactionRequest);
            if (behavior === 'sign') return { signed: true, rawTransaction: '0x' + 'ab'.repeat(70) };
            if (behavior === 'decline') return { signed: false, reason: 'user rejected the request' };
            if (behavior === 'unavailable') return { signed: false, unavailable: true, reason: 'wallet is locked' };
            if (behavior === 'throw') throw new Error('simulated: provider disconnected mid-request');
            if (behavior === 'no-raw-transaction') return { signed: true };
            throw new Error(`unknown fake wallet behavior: ${behavior}`);
        },
        // Deliberately present so Section C can prove signing never calls
        // either of these — never because this fake wallet is meant to be
        // a real broadcaster.
        async sendTransaction() { wallet.sendTransactionCalls++; },
        async broadcast() { wallet.broadcastCalls++; }
    };
    return wallet;
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP: exact-plan binding. The wallet receives a
    // transactionRequest built ONLY from the exact reviewed plan's own
    // fields.
    // ---------------------------------------------------------------
    {
        const plan = await constructPlan();
        const review = describeBasePublicationTransactionReview(plan);
        const wallet = fakeWallet();
        const signer = new BaseReviewedTransactionSigner({ wallet });

        const result = await signer.requestSignature({ plan, reviewedTransaction: review });
        assert(result.signed === true, '1. signing a genuinely reviewed plan succeeds');
        assert(typeof result.rawTransaction === 'string' && result.rawTransaction.length > 0, '2. a successful result carries the wallet\'s own rawTransaction');

        assert(wallet.requests.length === 1, '3. the wallet was consulted exactly once');
        const request = wallet.requests[0];
        assert(request.type === '0x2', '4. the transaction type is explicit — EIP-1559, never left for the wallet to infer');
        assert(request.chainId === plan.chainId, '5. chainId is read straight off the plan');
        assert(request.nonce === plan.nonce, '6. nonce is read straight off the plan — never re-derived');
        assert(request.gas === plan.gasLimit, '7. gas is read straight off the plan\'s own gasLimit — never re-estimated');
        assert(request.maxFeePerGas === plan.maxFeePerGas, '8. maxFeePerGas is read straight off the plan — never re-priced');
        assert(request.maxPriorityFeePerGas === plan.maxPriorityFeePerGas, '9. maxPriorityFeePerGas is read straight off the plan');
        assert(request.from === plan.from, '10. from is read straight off the plan');
        assert(request.to === plan.to, '11. to is read straight off the plan');
        assert(request.value === plan.value, '12. value is read straight off the plan');
        assert(request.data === plan.data, '13. data (the content-hash commitment) is read straight off the plan, verbatim');
        assert(Object.isFrozen(request), '14. the transactionRequest handed to the wallet is itself frozen');
    }
    console.log('✓ Section A (FLAGSHIP): the wallet receives a transactionRequest built ONLY from the exact reviewed plan\'s own fields');

    // ---------------------------------------------------------------
    // Section B — FLAGSHIP: no reconstruction. A later, unrelated
    // construction against fresh nonce/gas/fee figures never changes what
    // an EARLIER plan signs with.
    // ---------------------------------------------------------------
    {
        const earlierPlan = await constructPlan({ nonce: 5, gasLimit: 40000, gasPriceWei: '1000000000', maxPriorityFeePerGasWei: '100000000' });
        const earlierReview = describeBasePublicationTransactionReview(earlierPlan);

        // A genuinely different, LATER construction — the fake network now
        // reports entirely different figures.
        const laterPlan = await constructPlan({ nonce: 99, gasLimit: 999999, gasPriceWei: '9999999999', maxPriorityFeePerGasWei: '8888888888' });
        assert(laterPlan.nonce === 99 && laterPlan.gasLimit === 999999, '15. test setup: the later construction genuinely observed different figures');

        const wallet = fakeWallet();
        const signer = new BaseReviewedTransactionSigner({ wallet });
        const result = await signer.requestSignature({ plan: earlierPlan, reviewedTransaction: earlierReview });
        assert(result.signed === true, '16. signing the EARLIER, still-valid plan still succeeds');

        const request = wallet.requests[0];
        assert(request.nonce === 5, '17. the wallet was asked to sign the EARLIER plan\'s own nonce, never the later construction\'s');
        assert(request.gas === 40000, '18. the wallet was asked to sign the EARLIER plan\'s own gasLimit');
        assert(request.maxFeePerGas === '1000000000', '19. the wallet was asked to sign the EARLIER plan\'s own maxFeePerGas');
        assert(request.maxPriorityFeePerGas === '100000000', '20. the wallet was asked to sign the EARLIER plan\'s own maxPriorityFeePerGas');
    }
    console.log('✓ Section B (FLAGSHIP): signing never re-observes the network — it uses only the exact figures the plan was already frozen with');

    // ---------------------------------------------------------------
    // Section C — FLAGSHIP: no broadcast. Signing calls no
    // broadcast-shaped method of any kind.
    // ---------------------------------------------------------------
    {
        const plan = await constructPlan();
        const review = describeBasePublicationTransactionReview(plan);
        const wallet = fakeWallet();
        const coordinator = new BaseReviewedSigningCoordinator();

        const outcome = await coordinator.sign({ wallet, plan, reviewedTransaction: review });
        assert(outcome.state === BaseReviewedSigningState.SIGNED, '21. test setup: signing succeeds');
        assert(wallet.sendTransactionCalls === 0, '22. signing never calls sendTransaction — broadcastCalls stays 0');
        assert(wallet.broadcastCalls === 0, '23. signing never calls broadcast — broadcastCalls stays 0');
    }
    console.log('✓ Section C (FLAGSHIP): signing produces a signed artifact only — 0 broadcast calls of any kind');

    // ---------------------------------------------------------------
    // Section D — FLAGSHIP: declined attempt, no retry. A DECLINED
    // attempt stays DECLINED; a second, explicit click is its own fresh
    // attempt.
    // ---------------------------------------------------------------
    {
        const plan = await constructPlan();
        const review = describeBasePublicationTransactionReview(plan);
        const decliningWallet = fakeWallet({ behavior: 'decline' });
        const coordinator = new BaseReviewedSigningCoordinator();

        const attempt1 = await coordinator.sign({ wallet: decliningWallet, plan, reviewedTransaction: review });
        assert(attempt1.state === BaseReviewedSigningState.DECLINED, '24. a wallet decline reaches the coordinator as DECLINED');
        // The coordinator itself performs no retry — attempt1 is exactly
        // what it is, forever, unless a caller explicitly asks again.
        const attempt1Again = await coordinator.sign({ wallet: decliningWallet, plan, reviewedTransaction: review });
        assert(attempt1Again.state === BaseReviewedSigningState.DECLINED, '25. re-asking the SAME declining wallet reaches the identical DECLINED outcome — no hidden retry loop changed anything');

        // A genuinely NEW, explicit attempt — a different wallet outcome —
        // is its own distinct SIGNING -> SIGNED, never blocked by the
        // earlier DECLINED.
        const signingWallet = fakeWallet({ behavior: 'sign' });
        const attempt2 = await coordinator.sign({ wallet: signingWallet, plan, reviewedTransaction: review });
        assert(attempt2.state === BaseReviewedSigningState.SIGNED, '26. a fresh, explicit attempt against a different wallet reaches SIGNED — entirely independent of attempt 1');
    }
    console.log('✓ Section D (FLAGSHIP): a DECLINED attempt never auto-retries; each explicit call is its own, fresh attempt');

    // ---------------------------------------------------------------
    // Section E — FLAGSHIP: plan isolation. Signing one plan never
    // mutates it, or any other, unrelated plan.
    // ---------------------------------------------------------------
    {
        const plan1 = await constructPlan({ nonce: 5 });
        const plan2 = await constructPlan({ nonce: 6 });
        const review1Before = JSON.stringify(describeBasePublicationTransactionReview(plan1));
        const review2Before = JSON.stringify(describeBasePublicationTransactionReview(plan2));
        const plan1KeysBefore = Object.keys(plan1).sort().join(',');
        const plan2KeysBefore = Object.keys(plan2).sort().join(',');

        const wallet = fakeWallet();
        const signer = new BaseReviewedTransactionSigner({ wallet });
        const review1 = describeBasePublicationTransactionReview(plan1);
        await signer.requestSignature({ plan: plan1, reviewedTransaction: review1 });

        assert(Object.isFrozen(plan1) && Object.isFrozen(plan2), '27. both plans remain frozen after signing plan1');
        assert(Object.keys(plan1).sort().join(',') === plan1KeysBefore, '28. plan1 gains no signedTransaction/signature/rawTransaction field of its own');
        assert(JSON.stringify(describeBasePublicationTransactionReview(plan1)) === review1Before, '29. plan1 reviews identically before and after signing it');
        assert(JSON.stringify(describeBasePublicationTransactionReview(plan2)) === review2Before, '30. plan2 — a wholly unrelated plan — is entirely untouched by signing plan1');
        assert(Object.keys(plan2).sort().join(',') === plan2KeysBefore, '31. plan2 gains no field of its own either');
    }
    console.log('✓ Section E (FLAGSHIP): signing mutates neither the signed plan nor any other, unrelated plan');

    // ---------------------------------------------------------------
    // Section F — FLAGSHIP: no private-key ownership anywhere in this
    // milestone's own public surface.
    // ---------------------------------------------------------------
    {
        const plan = await constructPlan();
        const wallet = fakeWallet();
        const narrowSigner = new BaseTransactionSigner({ wallet });
        const reviewedSigner = new BaseReviewedTransactionSigner({ wallet });
        const coordinator = new BaseReviewedSigningCoordinator();
        const injectedAdapter = new BaseInjectedProviderWalletTransactionSigner({ injectedProvider: null });

        for (const forbidden of ['privateKey', 'privateKeyHex', 'mnemonic', 'seedPhrase', 'seed', 'password']) {
            for (const instance of [narrowSigner, reviewedSigner, coordinator, injectedAdapter]) {
                assert(!(forbidden in instance), `32. ${instance.constructor.name} carries no "${forbidden}" field of any kind`);
                assert(typeof instance[forbidden] !== 'function', `33. ${instance.constructor.name} exposes no "${forbidden}" method of any kind`);
            }
        }
        // And no class in this milestone accepts one either.
        expectThrows(() => new BaseTransactionSigner({ wallet: { privateKey: 'not-a-real-key' } }), '34. a "wallet" offering only a privateKey, and no signTransaction(), is refused at construction');
    }
    console.log('✓ Section F (FLAGSHIP): no private-key, seed, mnemonic, or password field anywhere in this milestone\'s own public surface');

    // ---------------------------------------------------------------
    // Section G — review-mismatch refusal: a plan that no longer matches
    // what was reviewed is refused before the wallet is ever consulted.
    // ---------------------------------------------------------------
    {
        const plan = await constructPlan({ nonce: 5 });
        const staleReview = describeBasePublicationTransactionReview(plan);

        // A genuinely different plan — never actually reviewed by whoever
        // is about to click "Sign."
        const driftedPlan = await constructPlan({ nonce: 6 });

        const wallet = fakeWallet();
        const signer = new BaseReviewedTransactionSigner({ wallet });
        const result = await signer.requestSignature({ plan: driftedPlan, reviewedTransaction: staleReview });

        assert(result.signed === false, '35. a plan that no longer matches its own stale review is refused');
        assert(result.unavailable !== true, '36. the refusal is a definite decline, never "unavailable"');
        assert(wallet.requests.length === 0, '37. the wallet is NEVER consulted for a review mismatch');

        // Via the coordinator, this reaches DECLINED — the identical state
        // a wallet's own decline reaches.
        const coordinator = new BaseReviewedSigningCoordinator();
        const outcome = await coordinator.sign({ wallet, plan: driftedPlan, reviewedTransaction: staleReview });
        assert(outcome.state === BaseReviewedSigningState.DECLINED, '38. a review mismatch reaches the coordinator as DECLINED, the same vocabulary a wallet\'s own refusal uses');
    }
    console.log('✓ Section G: a plan that has drifted from what was reviewed is refused before the wallet is ever asked');

    // ---------------------------------------------------------------
    // Section H — BaseReviewedSigningCoordinator: UNAVAILABLE/FAILED/state
    // mapping, caller-contract violations.
    // ---------------------------------------------------------------
    {
        const plan = await constructPlan();
        const review = describeBasePublicationTransactionReview(plan);
        const coordinator = new BaseReviewedSigningCoordinator();

        const noWalletOutcome = await coordinator.sign({ wallet: null, plan, reviewedTransaction: review });
        assert(noWalletOutcome.state === BaseReviewedSigningState.UNAVAILABLE, '39. no wallet connected reaches UNAVAILABLE');

        const incapableWalletOutcome = await coordinator.sign({ wallet: {}, plan, reviewedTransaction: review });
        assert(incapableWalletOutcome.state === BaseReviewedSigningState.UNAVAILABLE, '40. a wallet-shaped object with no signTransaction() also reaches UNAVAILABLE');

        const unavailableWallet = fakeWallet({ behavior: 'unavailable' });
        const unavailableOutcome = await coordinator.sign({ wallet: unavailableWallet, plan, reviewedTransaction: review });
        assert(unavailableOutcome.state === BaseReviewedSigningState.UNAVAILABLE, '41. a wallet reporting unavailable: true reaches UNAVAILABLE');

        const throwingWallet = fakeWallet({ behavior: 'throw' });
        const throwOutcome = await coordinator.sign({ wallet: throwingWallet, plan, reviewedTransaction: review });
        assert(throwOutcome.state === BaseReviewedSigningState.UNAVAILABLE, '42. a throwing wallet is treated as unavailable, never a decline and never a crash');

        const noRawTransactionWallet = fakeWallet({ behavior: 'no-raw-transaction' });
        const failedOutcome = await coordinator.sign({ wallet: noRawTransactionWallet, plan, reviewedTransaction: review });
        assert(failedOutcome.state === BaseReviewedSigningState.FAILED, '43. a wallet claiming signed: true with no rawTransaction is FAILED, never silently accepted');

        await expectThrowsAsync(() => coordinator.sign({ wallet: fakeWallet(), plan: null, reviewedTransaction: review }), '44. a missing plan is a caller-contract violation and throws, before any wallet is consulted');
        await expectThrowsAsync(() => coordinator.sign({ wallet: fakeWallet(), plan, reviewedTransaction: null }), '45. a missing reviewedTransaction is a caller-contract violation and throws');

        for (const outcome of [noWalletOutcome, incapableWalletOutcome, unavailableOutcome, throwOutcome, failedOutcome]) {
            assert(outcome.rawTransaction === null, '46. every non-SIGNED outcome carries rawTransaction: null');
            assert(Object.isFrozen(outcome), '47. every outcome is frozen');
        }
    }
    console.log('✓ Section H: BaseReviewedSigningCoordinator maps every outcome onto its documented vocabulary, and throws only for its own caller-contract violations');

    // ---------------------------------------------------------------
    // Section I — BaseReviewedSigningState/View: closed vocabulary, no
    // raw artifact ever exposed by the view.
    // ---------------------------------------------------------------
    {
        for (const state of Object.values(BaseReviewedSigningState)) {
            assert(isValidBaseReviewedSigningState(state), `48. ${state} is a recognized BaseReviewedSigningState`);
            assert(typeof describeBaseReviewedSigningStateLabel(state) === 'string', `49. ${state} has a real label`);
        }
        assert(!isValidBaseReviewedSigningState('ready'), '50. "ready" is never a recognized state — no sixth value for "will definitely sign"');

        const idleView = describeBaseReviewedSigning(null);
        assert(idleView.state === BaseReviewedSigningState.IDLE, '51. a null outcome projects as IDLE');
        assert(idleView.hasRawTransaction === false, '52. IDLE carries hasRawTransaction: false');

        const signedOutcome = { state: BaseReviewedSigningState.SIGNED, rawTransaction: '0x' + 'ab'.repeat(70), reason: null };
        const signedView = describeBaseReviewedSigning(signedOutcome);
        assert(signedView.hasRawTransaction === true, '53. a SIGNED outcome carries hasRawTransaction: true');
        assert(!('rawTransaction' in signedView), '54. the view never exposes the raw signed transaction itself');
        for (const forbidden of ['valid', 'safe', 'verified', 'recommended', 'trusted', 'ready']) {
            assert(!(forbidden in signedView), `55. the view never carries a "${forbidden}" field — signing is never promoted to a verdict`);
        }
        assert(Object.isFrozen(signedView), '56. the view result is frozen');
    }
    console.log('✓ Section I: BaseReviewedSigningState/View form a closed, verdict-free vocabulary that never exposes the raw signed artifact');

    // ---------------------------------------------------------------
    // Section J — BaseInjectedProviderWalletTransactionSigner: the one
    // concrete EIP-1193 adapter this milestone ships.
    // ---------------------------------------------------------------
    {
        const plan = await constructPlan();
        const transactionRequest = Object.freeze({
            type: '0x2', chainId: plan.chainId, nonce: plan.nonce, gas: plan.gasLimit,
            maxFeePerGas: plan.maxFeePerGas, maxPriorityFeePerGas: plan.maxPriorityFeePerGas,
            from: plan.from, to: plan.to, value: plan.value, data: plan.data
        });

        const noProviderAdapter = new BaseInjectedProviderWalletTransactionSigner({ injectedProvider: null });
        const noProviderResult = await noProviderAdapter.signTransaction(transactionRequest);
        assert(noProviderResult.signed === false && noProviderResult.unavailable === true, '57. no injected provider at all reports unavailable, never a throw');

        const throwingProvider = { async request() { throw new Error('simulated: eth_signTransaction not supported'); } };
        const throwingAdapter = new BaseInjectedProviderWalletTransactionSigner({ injectedProvider: throwingProvider });
        const throwingResult = await throwingAdapter.signTransaction(transactionRequest);
        assert(throwingResult.signed === false && throwingResult.unavailable === true, '58. a provider that throws (e.g. an unsupported method) reports unavailable, never a decline');

        const emptyProvider = { async request() { return ''; } };
        const emptyAdapter = new BaseInjectedProviderWalletTransactionSigner({ injectedProvider: emptyProvider });
        const emptyResult = await emptyAdapter.signTransaction(transactionRequest);
        assert(emptyResult.signed === false && !emptyResult.unavailable, '59. an empty signing result is a definite decline, never "unavailable"');

        let capturedCall = null;
        const signingProvider = {
            async request(call) {
                capturedCall = call;
                return '0x02f8...signed';
            }
        };
        const signingAdapter = new BaseInjectedProviderWalletTransactionSigner({ injectedProvider: signingProvider });
        const signingResult = await signingAdapter.signTransaction(transactionRequest);
        assert(signingResult.signed === true && signingResult.rawTransaction === '0x02f8...signed', '60. a provider returning a real signed transaction reports signed: true');
        assert(capturedCall.method === 'eth_signTransaction', '61. the adapter calls eth_signTransaction, never eth_sendTransaction (which would broadcast)');
        const params = capturedCall.params[0];
        assert(params.type === '0x2', '62. the type field is passed through unchanged');
        assert(params.from === plan.from && params.to === plan.to && params.data === plan.data, '63. from/to/data are passed through unchanged');
        assert(params.chainId === '0x' + plan.chainId.toString(16), '64. chainId is translated to a hex quantity, same value');
        assert(params.nonce === '0x' + plan.nonce.toString(16), '65. nonce is translated to a hex quantity, same value');
        assert(params.gas === '0x' + plan.gasLimit.toString(16), '66. gas is translated to a hex quantity, same value');
        assert(params.maxFeePerGas === '0x' + BigInt(plan.maxFeePerGas).toString(16), '67. maxFeePerGas is translated to a hex quantity, same value');
        assert(params.maxPriorityFeePerGas === '0x' + BigInt(plan.maxPriorityFeePerGas).toString(16), '68. maxPriorityFeePerGas is translated to a hex quantity, same value');
        assert(params.value === '0x' + BigInt(plan.value).toString(16), '69. value is translated to a hex quantity, same value');
    }
    console.log('✓ Section J: BaseInjectedProviderWalletTransactionSigner translates format only, never widens capability beyond eth_signTransaction');

    console.log('\nAll BaseReviewedTransactionSigning tests passed.');
}

run().catch((error) => {
    console.error('BaseReviewedTransactionSigning.test.js FAILED:', error);
    process.exitCode = 1;
});
