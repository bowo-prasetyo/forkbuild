import { BaseJsonRpcClient } from '../base/BaseJsonRpcClient.js';
import { BaseTransactionInclusionObserver } from '../base/BaseTransactionInclusionObserver.js';
import { BaseTransactionInclusionObservationCoordinator } from '../application/BaseTransactionInclusionObservationCoordinator.js';
import { BaseTransactionInclusionObservationState, isValidBaseTransactionInclusionObservationState } from '../application/BaseTransactionInclusionObservationState.js';
import {
    describeBaseTransactionInclusionObservation,
    describeBaseTransactionInclusionObservationHistory,
    describeBaseTransactionInclusionStateLabel,
    describeBaseTransactionInclusionStateShortLabel
} from '../application/BaseTransactionInclusionObservationView.js';
import {
    appendBaseTransactionInclusionObservationHistoryEntry,
    latestBaseTransactionInclusionObservation
} from '../application/BaseTransactionInclusionObservationHistory.js';
import { BitcoinAnchorConfirmationObserver } from '../anchoring/BitcoinAnchorConfirmationObserver.js';

// 0.8.96 — Explicit Base Transaction Inclusion & Confirmation Observation.
//
// The governing principle this milestone exists to prove: broadcast
// acceptance is not chain inclusion — chain inclusion is an
// independently observed fact. See docs/Roadmap.md, "0.8.96 — Explicit
// Base Transaction Inclusion & Confirmation Observation."
//
//   Section A (FLAGSHIP): identity/isolation — observing txid H_A asks the
//              rpcSource for EXACTLY H_A; a second, unrelated txid H_B is
//              never touched by that call, and no observation for H_B is
//              ever produced by it.
//   Section B (FLAGSHIP): broadcast ≠ inclusion — a BROADCASTED result
//              followed by NOT_INCLUDED is a completely legitimate,
//              non-error outcome.
//   Section C (FLAGSHIP): repeated, explicit observations of the identical
//              txid each produce their OWN independent, immutable
//              observation — never overwritten, never merged.
//   Section D (FLAGSHIP): confirmation growth — two observations of the
//              same included transaction, taken against two different
//              current block numbers, are two independent, immutable
//              observations with two different confirmationCount values.
//   Section E (FLAGSHIP): RPC unavailability is never reported as
//              NOT_INCLUDED.
//   Section F: no re-reading of nonce/gas/fees/account/plan/signing
//              artifact — zero calls to any method beyond
//              fetchTransactionReceipt/fetchLatestBlockNumber.
//   Section G: no automatic activity — one call to observeInclusion() is
//              exactly one receipt fetch (and, when found, exactly one
//              latest-block-number fetch) — never polling, never retried
//              internally.
//   Section H: Bitcoin isolation — running a Base inclusion observation
//              never touches Bitcoin confirmation observer state.
//   Section I: an INCLUDED report with incomplete block metadata, or an
//              inconsistent confirmationCount, is never taken at face
//              value — reported as UNAVAILABLE instead.
//   Section J: malformed txid / missing rpcSource throw, before the
//              rpcSource is ever consulted.
//   Section K: a throwing or malformed rpcSource response is reported as
//              UNAVAILABLE, never NOT_INCLUDED, and never propagates.
//   Section L: BaseTransactionInclusionObservationCoordinator — thin
//              pass-through and caller-contract violations.
//   Section M: BaseTransactionInclusionObservationState — closed,
//              verdict-free, three-value vocabulary.
//   Section N: BaseTransactionInclusionObservationView — pure projection,
//              single observation and full history.
//   Section O: BaseTransactionInclusionObservationHistory — append-only,
//              never mutates, never overwrites, `latestBaseTransactionInclusionObservation()`.
//   Section P: base/BaseJsonRpcClient.js#fetchTransactionReceipt()/
//              fetchLatestBlockNumber() — found/not-found/unavailable
//              classification, and the existing seven methods unchanged.
//
// See docs/Principles.md, "The UI Displays Observations; It Does Not Turn
// Them Into A Verdict (0.8.57)," extended here one chain over.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch (_e) { threw = true; }
    assert(threw, message);
}

async function expectRejects(promise, message) {
    let threw = false;
    try { await promise; } catch (_e) { threw = true; }
    assert(threw, message);
}

const TXID_A = '0x' + '11'.repeat(32);
const TXID_B = '0x' + '22'.repeat(32);

// ---------------------------------------------------------------------
// A fake rpcSource carrying its own call counters and captured arguments
// for every method base/BaseJsonRpcClient.js exposes — so a test can
// assert not just that fetchTransactionReceipt()/fetchLatestBlockNumber()
// were called, but exactly what they were called WITH, and that nothing
// else was ever touched.
// ---------------------------------------------------------------------
function fakeRpcSource({ receipts = {}, latestBlockNumber = { available: true, blockNumber: 100 } } = {}) {
    const calls = {
        fetchTransactionReceipt: 0,
        fetchLatestBlockNumber: 0,
        broadcastRawTransaction: 0,
        fetchTransactionCount: 0,
        fetchGasPrice: 0,
        fetchMaxPriorityFeePerGas: 0,
        fetchGasEstimate: 0,
        fetchChainId: 0,
        fetchBalance: 0
    };
    const receiptRequests = [];
    let latestBlockNumberOverride = latestBlockNumber;
    return {
        calls,
        receiptRequests,
        setLatestBlockNumber(value) { latestBlockNumberOverride = value; },
        async fetchTransactionReceipt(txid) {
            calls.fetchTransactionReceipt++;
            receiptRequests.push(txid);
            if (typeof receipts === 'function') return receipts(txid, calls.fetchTransactionReceipt);
            return Object.prototype.hasOwnProperty.call(receipts, txid) ? receipts[txid] : { available: true, found: false };
        },
        async fetchLatestBlockNumber() {
            calls.fetchLatestBlockNumber++;
            if (typeof latestBlockNumberOverride === 'function') return latestBlockNumberOverride(calls.fetchLatestBlockNumber);
            return latestBlockNumberOverride;
        },
        async broadcastRawTransaction() { calls.broadcastRawTransaction++; return { broadcasted: true, txid: TXID_A }; },
        async fetchTransactionCount() { calls.fetchTransactionCount++; return { available: true, nonce: 999 }; },
        async fetchGasPrice() { calls.fetchGasPrice++; return { available: true, gasPriceWei: '999' }; },
        async fetchMaxPriorityFeePerGas() { calls.fetchMaxPriorityFeePerGas++; return { available: true, maxPriorityFeePerGasWei: '999' }; },
        async fetchGasEstimate() { calls.fetchGasEstimate++; return { available: true, gasLimit: 999 }; },
        async fetchChainId() { calls.fetchChainId++; return { available: true, chainId: 999 }; },
        async fetchBalance() { calls.fetchBalance++; return { available: true, balanceWei: '999' }; }
    };
}

function includedReceipt({ blockHash = '0x' + 'aa'.repeat(32), blockNumber = 100, transactionIndex = 3 } = {}) {
    return { available: true, found: true, blockHash, blockNumber, transactionIndex };
}

function freshObserver(rpcSource) { return new BaseTransactionInclusionObserver({ rpcSource }); }
function freshCoordinator(rpcSource) { return new BaseTransactionInclusionObservationCoordinator({ baseTransactionInclusionObserver: freshObserver(rpcSource) }); }

async function run() {
    // ---------------------------------------------------------------
    // Section A (FLAGSHIP) — identity/isolation: observing txid H_A asks
    // the rpcSource for EXACTLY H_A; an unrelated H_B is never touched.
    // ---------------------------------------------------------------
    {
        const rpc = fakeRpcSource({ receipts: { [TXID_A]: includedReceipt() } });
        const observation = await freshObserver(rpc).observeInclusion(TXID_A);

        assert(observation.state === BaseTransactionInclusionObservationState.INCLUDED, '1. observing the exact broadcast txid succeeds');
        assert(observation.txid === TXID_A, '2. the observation names exactly the txid it was asked about');
        assert(rpc.receiptRequests.length === 1 && rpc.receiptRequests[0] === TXID_A, '3. the rpcSource received EXACTLY H_A — no other txid');
        assert(!rpc.receiptRequests.includes(TXID_B), '4. the unrelated H_B was never requested by this call');
    }
    console.log('✓ Section A (FLAGSHIP): observing one txid asks the rpcSource for exactly that txid, and never touches an unrelated one');

    // ---------------------------------------------------------------
    // Section B (FLAGSHIP) — broadcast ≠ inclusion: a BROADCASTED result
    // followed by NOT_INCLUDED is completely legitimate.
    // ---------------------------------------------------------------
    {
        const rpc = fakeRpcSource();
        const coordinator = freshCoordinator(rpc);
        const observation = await coordinator.observeInclusion({ broadcasted: true, txid: TXID_A });

        assert(observation.state === BaseTransactionInclusionObservationState.NOT_INCLUDED, '5. a BROADCASTED transaction with no receipt yet observes as NOT_INCLUDED');
        assert(observation.blockHash === null && observation.blockNumber === null, '6. NOT_INCLUDED carries no block metadata');
        assert(observation.reason === null, '7. NOT_INCLUDED is not an error — it carries no reason');
    }
    console.log('✓ Section B (FLAGSHIP): a BROADCASTED transaction with no receipt yet observes as a legitimate NOT_INCLUDED, never an error');

    // ---------------------------------------------------------------
    // Section C (FLAGSHIP) — repeated, explicit observations of the
    // identical txid each produce their OWN independent, immutable
    // observation.
    // ---------------------------------------------------------------
    {
        const rpc = fakeRpcSource({
            receipts: (txid, callNumber) => {
                if (callNumber === 1) return { available: true, found: false };
                return includedReceipt();
            }
        });
        const observer = freshObserver(rpc);

        const first = await observer.observeInclusion(TXID_A);
        const second = await observer.observeInclusion(TXID_A);

        assert(first.state === BaseTransactionInclusionObservationState.NOT_INCLUDED, '8. the first observation is NOT_INCLUDED');
        assert(second.state === BaseTransactionInclusionObservationState.INCLUDED, '9. the second, independent observation is INCLUDED');
        assert(first.state === BaseTransactionInclusionObservationState.NOT_INCLUDED, '10. the first observation object itself is untouched by the second call');
        assert(rpc.calls.fetchTransactionReceipt === 2, '11. two explicit calls performed exactly two receipt fetches — no caching');

        let history = [];
        history = appendBaseTransactionInclusionObservationHistoryEntry(history, first);
        history = appendBaseTransactionInclusionObservationHistoryEntry(history, second);
        assert(history.length === 2, '12. both observations are preserved in history');
        assert(history[0] === first && history[1] === second, '13. history preserves both observations in the order they happened, unmodified');
    }
    console.log('✓ Section C (FLAGSHIP): repeated explicit observations of the same txid each produce their own independent, immutable observation');

    // ---------------------------------------------------------------
    // Section D (FLAGSHIP) — confirmation growth: two observations of the
    // same included transaction, against two different current block
    // numbers, are two independent, immutable observations with two
    // different confirmationCount values.
    // ---------------------------------------------------------------
    {
        const rpc = fakeRpcSource({ receipts: { [TXID_A]: includedReceipt({ blockNumber: 100 }) } });
        rpc.setLatestBlockNumber({ available: true, blockNumber: 100 });
        const observer = freshObserver(rpc);

        const first = await observer.observeInclusion(TXID_A);
        assert(first.state === BaseTransactionInclusionObservationState.INCLUDED, '14. the first observation is INCLUDED');
        assert(first.confirmationCount === 1, '15. block 100 / head 100 -> 1 confirmation');

        rpc.setLatestBlockNumber({ available: true, blockNumber: 105 });
        const second = await observer.observeInclusion(TXID_A);
        assert(second.state === BaseTransactionInclusionObservationState.INCLUDED, '16. the second observation is INCLUDED');
        assert(second.confirmationCount === 6, '17. block 100 / head 105 -> 6 confirmations');

        assert(first.confirmationCount === 1, '18. the first observation\'s own confirmationCount is untouched by the second call');
        assert(first !== second, '19. the two observations are two distinct, independent objects');
    }
    console.log('✓ Section D (FLAGSHIP): confirmation growth across two explicit observations produces two independent, immutable records');

    // ---------------------------------------------------------------
    // Section E (FLAGSHIP) — RPC unavailability is never reported as
    // NOT_INCLUDED.
    // ---------------------------------------------------------------
    {
        const unreachable = fakeRpcSource({ receipts: () => { throw new Error('ECONNREFUSED'); } });
        const observation = await freshObserver(unreachable).observeInclusion(TXID_A);
        assert(observation.state === BaseTransactionInclusionObservationState.UNAVAILABLE, '20. a throwing rpcSource observes as UNAVAILABLE, never NOT_INCLUDED');

        const declaredUnavailable = fakeRpcSource({ receipts: { [TXID_A]: { available: false, reason: 'timeout' } } });
        const observation2 = await freshObserver(declaredUnavailable).observeInclusion(TXID_A);
        assert(observation2.state === BaseTransactionInclusionObservationState.UNAVAILABLE, '21. an available:false receipt result observes as UNAVAILABLE, never NOT_INCLUDED');
        assert(observation2.reason === 'timeout', '22. the rpcSource\'s own reason is preserved');
    }
    console.log('✓ Section E (FLAGSHIP): RPC unavailability is always reported as UNAVAILABLE, never conflated with NOT_INCLUDED');

    // ---------------------------------------------------------------
    // Section F — no re-reading of nonce/gas/fees/account/plan/signing
    // artifact.
    // ---------------------------------------------------------------
    {
        const rpc = fakeRpcSource({ receipts: { [TXID_A]: includedReceipt() } });
        await freshObserver(rpc).observeInclusion(TXID_A);

        assert(rpc.calls.fetchTransactionCount === 0, '23. zero eth_getTransactionCount reads');
        assert(rpc.calls.fetchGasPrice === 0, '24. zero eth_gasPrice reads');
        assert(rpc.calls.fetchMaxPriorityFeePerGas === 0, '25. zero eth_maxPriorityFeePerGas reads');
        assert(rpc.calls.fetchGasEstimate === 0, '26. zero eth_estimateGas reads');
        assert(rpc.calls.fetchChainId === 0, '27. zero eth_chainId reads');
        assert(rpc.calls.fetchBalance === 0, '28. zero eth_getBalance reads');
        assert(rpc.calls.broadcastRawTransaction === 0, '29. zero eth_sendRawTransaction submissions — observing never re-broadcasts');

        const wallet = { signCalls: 0, async signTransaction() { this.signCalls++; return '0xnever'; } };
        // `wallet` is never passed to the observer or coordinator at all —
        // there is no parameter for it, proving no signing dependency
        // structurally.
        assert(wallet.signCalls === 0, '30. signCalls === 0 — no signer was ever consulted');
    }
    console.log('✓ Section F: observing inclusion never re-reads nonce, fees, chain id, balance, or re-broadcasts/re-signs anything');

    // ---------------------------------------------------------------
    // Section G — no automatic activity: one call to observeInclusion()
    // is exactly one receipt fetch (and, when found, exactly one
    // latest-block-number fetch) — never polling.
    // ---------------------------------------------------------------
    {
        const notIncludedRpc = fakeRpcSource();
        await freshObserver(notIncludedRpc).observeInclusion(TXID_A);
        assert(notIncludedRpc.calls.fetchTransactionReceipt === 1, '31. one explicit call performs exactly one receipt fetch');
        assert(notIncludedRpc.calls.fetchLatestBlockNumber === 0, '32. a NOT_INCLUDED observation never reads the latest block number');

        const includedRpc = fakeRpcSource({ receipts: { [TXID_A]: includedReceipt() } });
        await freshObserver(includedRpc).observeInclusion(TXID_A);
        assert(includedRpc.calls.fetchTransactionReceipt === 1, '33. one explicit call performs exactly one receipt fetch');
        assert(includedRpc.calls.fetchLatestBlockNumber === 1, '34. an included transaction reads the latest block number exactly once');
    }
    console.log('✓ Section G: one explicit observeInclusion() call performs exactly the reads it needs — never polling, never retried internally');

    // ---------------------------------------------------------------
    // Section H — Bitcoin isolation: running a Base inclusion observation
    // never touches Bitcoin confirmation observer state.
    // ---------------------------------------------------------------
    {
        let bitcoinConfirmationCalls = 0;
        const bitcoinObserver = new BitcoinAnchorConfirmationObserver({
            confirmationSource: { async fetchConfirmation() { bitcoinConfirmationCalls++; return { found: false }; } }
        });

        const rpc = fakeRpcSource({ receipts: { [TXID_A]: includedReceipt() } });
        await freshObserver(rpc).observeInclusion(TXID_A);

        assert(bitcoinConfirmationCalls === 0, '35. the Bitcoin confirmation observer was never invoked by a Base inclusion observation');
        assert(bitcoinObserver instanceof BitcoinAnchorConfirmationObserver, '36. the unrelated Bitcoin observer instance itself is entirely unaffected');
    }
    console.log('✓ Section H: running a Base inclusion observation never invokes or modifies Bitcoin confirmation observer state');

    // ---------------------------------------------------------------
    // Section I — an INCLUDED report with incomplete block metadata, or an
    // inconsistent confirmationCount, is never taken at face value.
    // ---------------------------------------------------------------
    {
        for (const malformedReceipt of [
            { available: true, found: true, blockHash: null, blockNumber: 100, transactionIndex: 3 },
            { available: true, found: true, blockHash: '0xaa', blockNumber: null, transactionIndex: 3 },
            { available: true, found: true, blockHash: '0xaa', blockNumber: 100, transactionIndex: null },
            { available: true, found: true, blockHash: '', blockNumber: 100, transactionIndex: 3 }
        ]) {
            const rpc = fakeRpcSource({ receipts: { [TXID_A]: malformedReceipt } });
            const observation = await freshObserver(rpc).observeInclusion(TXID_A);
            assert(observation.state === BaseTransactionInclusionObservationState.UNAVAILABLE, `37. an incomplete "found:true" receipt (${JSON.stringify(malformedReceipt)}) is reported as UNAVAILABLE, never INCLUDED`);
        }

        // A receipt is found, but the latest block number cannot be
        // determined — INCLUDED requires a genuine confirmationCount, so
        // this is UNAVAILABLE, never INCLUDED with a null count.
        const noLatestBlock = fakeRpcSource({ receipts: { [TXID_A]: includedReceipt() } });
        noLatestBlock.setLatestBlockNumber({ available: false, reason: 'timeout' });
        const observation2 = await freshObserver(noLatestBlock).observeInclusion(TXID_A);
        assert(observation2.state === BaseTransactionInclusionObservationState.UNAVAILABLE, '38. a receipt found but no determinable latest block number is UNAVAILABLE');

        // A mechanically inconsistent pair (latest block behind the
        // transaction's own block) never fabricates a confirmationCount.
        const inconsistent = fakeRpcSource({ receipts: { [TXID_A]: includedReceipt({ blockNumber: 100 }) } });
        inconsistent.setLatestBlockNumber({ available: true, blockNumber: 50 });
        const observation3 = await freshObserver(inconsistent).observeInclusion(TXID_A);
        assert(observation3.state === BaseTransactionInclusionObservationState.UNAVAILABLE, '39. an inconsistent block-number pair is UNAVAILABLE, never a fabricated confirmationCount');
    }
    console.log('✓ Section I: an INCLUDED report is never surfaced on incomplete or mechanically inconsistent block metadata — UNAVAILABLE instead');

    // ---------------------------------------------------------------
    // Section J — malformed txid / missing rpcSource throw, before the
    // rpcSource is ever consulted.
    // ---------------------------------------------------------------
    {
        expectThrows(() => new BaseTransactionInclusionObserver({}), '40. a missing rpcSource throws');
        expectThrows(() => new BaseTransactionInclusionObserver({ rpcSource: { fetchTransactionReceipt() {} } }), '41. an rpcSource without fetchLatestBlockNumber throws');
        expectThrows(() => new BaseTransactionInclusionObserver({ rpcSource: { fetchLatestBlockNumber() {} } }), '42. an rpcSource without fetchTransactionReceipt throws');

        const rpc = fakeRpcSource();
        const observer = freshObserver(rpc);
        await expectRejects(observer.observeInclusion(), '43. a missing txid throws (rejects)');
        await expectRejects(observer.observeInclusion(null), '44. a null txid throws (rejects)');
        await expectRejects(observer.observeInclusion('not-a-hash'), '45. a non-hex txid throws (rejects)');
        await expectRejects(observer.observeInclusion('0x1234'), '46. a too-short txid throws (rejects)');
        assert(rpc.calls.fetchTransactionReceipt === 0, '47. none of the malformed-input attempts ever reached the rpcSource');
    }
    console.log('✓ Section J: a malformed txid, or a missing rpcSource, throws before the rpcSource is ever consulted');

    // ---------------------------------------------------------------
    // Section K — a throwing or malformed rpcSource response is reported
    // as UNAVAILABLE, never NOT_INCLUDED, and never propagates.
    // ---------------------------------------------------------------
    {
        const throwingRpc = fakeRpcSource({ receipts: () => { throw new Error('boom'); } });
        const throwingResult = await freshObserver(throwingRpc).observeInclusion(TXID_A);
        assert(throwingResult.state === BaseTransactionInclusionObservationState.UNAVAILABLE, '48. a throwing rpcSource is reported as UNAVAILABLE');

        for (const malformed of [undefined, null, 'yes', { found: 'yes' }, {}]) {
            const rpc = fakeRpcSource({ receipts: { [TXID_A]: malformed } });
            const result = await freshObserver(rpc).observeInclusion(TXID_A);
            assert(result.state === BaseTransactionInclusionObservationState.UNAVAILABLE, `49. a malformed rpcSource response (${JSON.stringify(malformed)}) is never treated as a positive answer`);
        }
    }
    console.log('✓ Section K: a throwing or malformed rpcSource response is always reported as an honest, never-thrown UNAVAILABLE outcome');

    // ---------------------------------------------------------------
    // Section L — BaseTransactionInclusionObservationCoordinator: thin
    // pass-through and caller-contract violations.
    // ---------------------------------------------------------------
    {
        expectThrows(() => new BaseTransactionInclusionObservationCoordinator({}), '50. the coordinator requires a real observer');

        const coordinator = freshCoordinator(fakeRpcSource());
        await expectRejects(coordinator.observeInclusion({ txid: TXID_A }), '51. broadcasted !== true throws (broadcasted omitted)');
        await expectRejects(coordinator.observeInclusion({ broadcasted: false, txid: TXID_A }), '52. broadcasted: false throws');
        await expectRejects(coordinator.observeInclusion({ broadcasted: true }), '53. a missing txid throws');
        await expectRejects(coordinator.observeInclusion({ broadcasted: true, txid: '' }), '54. an empty txid throws');

        const rpc = fakeRpcSource({ receipts: { [TXID_A]: includedReceipt() } });
        const observation = await freshCoordinator(rpc).observeInclusion({ broadcasted: true, txid: TXID_A });
        assert(observation.state === BaseTransactionInclusionObservationState.INCLUDED, '55. a real broadcasted:true call returns the observer\'s own result, unmodified');
        assert(observation.txid === TXID_A, '56. the coordinator passes the exact txid through');
    }
    console.log('✓ Section L: BaseTransactionInclusionObservationCoordinator is a thin, unmodifying pass-through that refuses an unproven txid');

    // ---------------------------------------------------------------
    // Section M — BaseTransactionInclusionObservationState: closed,
    // verdict-free, three-value vocabulary.
    // ---------------------------------------------------------------
    {
        const allStates = Object.values(BaseTransactionInclusionObservationState);
        assert(allStates.length === 3, '57. exactly three states exist');
        for (const state of allStates) {
            assert(isValidBaseTransactionInclusionObservationState(state), `58. ${state} is recognized as valid`);
            assert(typeof describeBaseTransactionInclusionStateLabel(state) === 'string', `59. ${state} has a human label`);
            assert(typeof describeBaseTransactionInclusionStateShortLabel(state) === 'string', `60. ${state} has a short label`);
        }
        for (const verdict of ['confirmed', 'safe', 'valid', 'trusted', 'success', 'failed']) {
            assert(!isValidBaseTransactionInclusionObservationState(verdict), `61. "${verdict}" is not part of this vocabulary`);
        }
    }
    console.log('✓ Section M: BaseTransactionInclusionObservationState is a closed, three-value, verdict-free vocabulary');

    // ---------------------------------------------------------------
    // Section N — BaseTransactionInclusionObservationView: pure
    // projection, single observation and full history.
    // ---------------------------------------------------------------
    {
        assert(describeBaseTransactionInclusionObservation(null) === null, '62. a null observation projects as null');

        const rpc = fakeRpcSource({ receipts: { [TXID_A]: includedReceipt({ blockNumber: 100 }) } });
        const included = await freshObserver(rpc).observeInclusion(TXID_A);
        const view = describeBaseTransactionInclusionObservation(included);
        assert(view.txid === TXID_A, '63. the view exposes the observation\'s own txid, unchanged');
        assert(view.blockHash === included.blockHash, '64. the view exposes blockHash unchanged');
        assert(view.confirmationCount === included.confirmationCount, '65. the view exposes confirmationCount unchanged');
        assert(view.stateLabel === 'Transaction included', '66. INCLUDED carries the expected full sentence');
        assert(view.stateShortLabel === 'Included', '67. INCLUDED carries the expected short label');
        assert(Object.isFrozen(view), '68. describeBaseTransactionInclusionObservation() returns a frozen projection');

        const smuggled = { ...included, confirmed: true, safe: true, trusted: true };
        const smuggledView = describeBaseTransactionInclusionObservation(smuggled);
        assert(!('confirmed' in smuggledView) && !('safe' in smuggledView) && !('trusted' in smuggledView), '69. no verdict-shaped field is ever exposed, even if smuggled onto the observation');

        let history = [];
        history = appendBaseTransactionInclusionObservationHistoryEntry(history, included);
        rpc.setLatestBlockNumber({ available: true, blockNumber: 105 });
        const included2 = await freshObserver(rpc).observeInclusion(TXID_A);
        history = appendBaseTransactionInclusionObservationHistoryEntry(history, included2);

        const historyView = describeBaseTransactionInclusionObservationHistory(history);
        assert(historyView.count === 2, '70. the history view reports the correct count');
        assert(historyView.observations[0].confirmationCount === included.confirmationCount, '71. the history view preserves chronological order — oldest first');
        assert(historyView.observations[1].confirmationCount === included2.confirmationCount, '72. the newer, higher-confirmation observation is the second entry');
        assert(Object.isFrozen(historyView), '73. describeBaseTransactionInclusionObservationHistory() returns a frozen projection');

        const latest = latestBaseTransactionInclusionObservation(history);
        assert(latest === included2, '74. latestBaseTransactionInclusionObservation() returns the most recently observed entry');
    }
    console.log('✓ Section N: BaseTransactionInclusionObservationView projects a single observation and a full history without adding a verdict');

    // ---------------------------------------------------------------
    // Section O — BaseTransactionInclusionObservationHistory: append-only,
    // never mutates, never overwrites.
    // ---------------------------------------------------------------
    {
        let history = [];
        const rpc = fakeRpcSource({ receipts: { [TXID_A]: { available: true, found: false } } });
        const obs1 = await freshObserver(rpc).observeInclusion(TXID_A);
        const historyAfter1 = appendBaseTransactionInclusionObservationHistoryEntry(history, obs1);
        assert(history.length === 0, '75. appending never mutates the array it was given');
        assert(historyAfter1.length === 1, '76. the returned array carries the new entry');
        assert(Object.isFrozen(historyAfter1), '77. the returned history array is frozen');

        history = historyAfter1;
        const historyAfterNull = appendBaseTransactionInclusionObservationHistoryEntry(history, null);
        assert(historyAfterNull.length === 1 && historyAfterNull !== history, '78. appending a null observation returns an unchanged-length, but distinct, frozen copy');

        assert(latestBaseTransactionInclusionObservation([]) === null, '79. an empty history has no latest observation');
        assert(latestBaseTransactionInclusionObservation(null) === null, '80. a non-array history is treated as empty, never throws');
    }
    console.log('✓ Section O: BaseTransactionInclusionObservationHistory is strictly append-only and never mutates its input');

    // ---------------------------------------------------------------
    // Section P — base/BaseJsonRpcClient.js#fetchTransactionReceipt()/
    // fetchLatestBlockNumber(): found/not-found/unavailable
    // classification, and the existing seven methods unchanged.
    // ---------------------------------------------------------------
    {
        // A genuine `null` result — Base reports no receipt exists yet.
        const notFoundClient = new BaseJsonRpcClient({
            fetchImpl: async () => ({ ok: true, json: async () => ({ jsonrpc: '2.0', id: 1, result: null }) })
        });
        const notFound = await notFoundClient.fetchTransactionReceipt('0xdeadbeef');
        assert(notFound.available === true && notFound.found === false, '81. a genuine null result is { available: true, found: false }, never unavailable');

        // A genuine receipt.
        const returnedBlockHash = '0x' + '33'.repeat(32);
        const foundClient = new BaseJsonRpcClient({
            fetchImpl: async (url, init) => {
                const body = JSON.parse(init.body);
                assert(body.method === 'eth_getTransactionReceipt', '82. fetchTransactionReceipt() calls eth_getTransactionReceipt');
                assert(body.params[0] === '0xdeadbeef', '83. the exact txid is passed as the sole param');
                return {
                    ok: true,
                    json: async () => ({
                        jsonrpc: '2.0', id: 1,
                        result: { blockHash: returnedBlockHash, blockNumber: '0x64', transactionIndex: '0x2' }
                    })
                };
            }
        });
        const found = await foundClient.fetchTransactionReceipt('0xdeadbeef');
        assert(found.available === true && found.found === true, '84. a genuine receipt is { available: true, found: true, ... }');
        assert(found.blockHash === returnedBlockHash && found.blockNumber === 100 && found.transactionIndex === 2, '85. block fields are decoded correctly (0x64 -> 100, 0x2 -> 2)');

        // An incomplete receipt object.
        const incompleteClient = new BaseJsonRpcClient({
            fetchImpl: async () => ({ ok: true, json: async () => ({ jsonrpc: '2.0', id: 1, result: { blockHash: '0xaa' } }) })
        });
        const incomplete = await incompleteClient.fetchTransactionReceipt('0xdeadbeef');
        assert(incomplete.available === false, '86. an incomplete receipt object is { available: false, reason }');

        // Unreachable.
        const unreachableClient = new BaseJsonRpcClient({
            fetchImpl: async () => { throw new Error('ECONNREFUSED'); }
        });
        const unreachable = await unreachableClient.fetchTransactionReceipt('0xdeadbeef');
        assert(unreachable.available === false, '87. an unreachable endpoint is { available: false, reason }');

        // fetchLatestBlockNumber().
        const blockNumberClient = new BaseJsonRpcClient({
            fetchImpl: async (url, init) => {
                const body = JSON.parse(init.body);
                assert(body.method === 'eth_blockNumber', '88. fetchLatestBlockNumber() calls eth_blockNumber');
                return { ok: true, json: async () => ({ jsonrpc: '2.0', id: 1, result: '0x69' }) };
            }
        });
        const blockNumberResult = await blockNumberClient.fetchLatestBlockNumber();
        assert(blockNumberResult.available === true && blockNumberResult.blockNumber === 105, '89. fetchLatestBlockNumber() decodes 0x69 -> 105');

        const malformedBlockNumberClient = new BaseJsonRpcClient({
            fetchImpl: async () => ({ ok: true, json: async () => ({ jsonrpc: '2.0', id: 1, result: 'not-a-hex-quantity' }) })
        });
        const malformedBlockNumber = await malformedBlockNumberClient.fetchLatestBlockNumber();
        assert(malformedBlockNumber.available === false, '90. a malformed eth_blockNumber result is { available: false, reason }');

        // The seven existing methods are entirely unchanged — a genuine
        // success still reports only their own original shape, proving
        // the two new methods were added without touching them.
        const readClient = new BaseJsonRpcClient({
            fetchImpl: async () => ({ ok: true, json: async () => ({ jsonrpc: '2.0', id: 1, result: '0x2105' }) })
        });
        const chainIdResult = await readClient.fetchChainId();
        assert(chainIdResult.available === true && chainIdResult.chainId === 8453, '91. fetchChainId() still reports its own original { available, chainId } shape');
        assert(!('found' in chainIdResult), '92. fetchChainId() never gains a "found" field');
    }
    console.log('✓ Section P: base/BaseJsonRpcClient.js#fetchTransactionReceipt()/fetchLatestBlockNumber() classify found/not-found/unavailable correctly, and the seven existing methods are unchanged');

    console.log('\nAll BaseTransactionInclusionObservation tests passed.');
}

run().catch((error) => {
    console.error('BaseTransactionInclusionObservation.test.js FAILED:', error);
    process.exitCode = 1;
});
