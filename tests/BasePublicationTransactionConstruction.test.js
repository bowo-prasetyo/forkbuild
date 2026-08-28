import {
    encodeBasePublicationCommitment,
    decodeBasePublicationCommitment
} from '../application/BasePublicationCommitmentEncoding.js';
import { BaseJsonRpcClient } from '../base/BaseJsonRpcClient.js';
import { BasePublicationTransactionPlanner } from '../base/BasePublicationTransactionPlanner.js';
import {
    BasePublicationTransactionPlanState,
    isValidBasePublicationTransactionPlanState
} from '../application/BasePublicationTransactionPlanState.js';
import { BasePublicationTransactionPlanCoordinator } from '../application/BasePublicationTransactionPlanCoordinator.js';
import {
    describeBasePublicationTransactionPlanStateLabel,
    describeBasePublicationTransactionPlan
} from '../application/BasePublicationTransactionPlanView.js';
import { BaseNetworkObservationState } from '../application/BaseNetworkObservationState.js';
import { BaseAccountObservation } from '../application/BaseAccountObservation.js';
import { BitcoinAnchorTransactionBuilder } from '../anchoring/BitcoinAnchorTransactionBuilder.js';
import { BitcoinAnchorTransactionConstructionCoordinator } from '../application/BitcoinAnchorTransactionConstructionCoordinator.js';
import { BitcoinAnchorTransactionConstructionState } from '../application/BitcoinAnchorTransactionConstructionState.js';

// 0.8.91 — Explicit Base Publication Transaction Construction.
//
// Turns an already-OBSERVED Base account and a content hash into an
// immutable, reviewable transaction PLAN — never signed, never
// broadcast. See docs/Roadmap.md, "0.8.91 — Explicit Base Publication
// Transaction Construction."
//
//   Section A: BasePublicationCommitmentEncoding — the raw-bytes
//              commitment encoding, symmetric, no ABI wrapping
//   Section B: BaseJsonRpcClient's four new RPC methods — real wire
//              behavior against a fake transport
//   Section C: BasePublicationTransactionPlanner — CONSTRUCTED /
//              unavailable / insufficient-balance, self-transfer
//              semantics, caller-contract violations
//   Section D: BasePublicationTransactionPlanState — closed vocabulary
//   Section E: BasePublicationTransactionPlanCoordinator — caller-contract
//              violations, state mapping, immutable construction
//   Section F: the label vocabulary and describe*() view — every
//              wei-denominated figure stays a string, end to end
//   Section G: FLAGSHIP — Bitcoin/Base isolation: constructing a Base
//              plan never touches a real Bitcoin construction coordinator
//              sitting right beside it, and never signs or broadcasts
//              anything
//   Section H: FLAGSHIP — a constructed plan is frozen; an unrelated,
//              later Base construction never mutates an earlier one

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function expectThrowsAsync(fn, message) {
    let threw = false;
    try { await fn(); } catch (_e) { threw = true; }
    assert(threw, message);
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
// construction-facing surface — never a real network call.
function fakeConstructionRpcSource({
    nonce = 5, gasLimit = 40000, gasPriceWei = '1000000000', maxPriorityFeePerGasWei = '100000000',
    unavailableFor = null
} = {}) {
    const calls = [];
    return {
        calls,
        async fetchTransactionCount(address) {
            calls.push('fetchTransactionCount');
            if (unavailableFor === 'fetchTransactionCount') return { available: false, reason: 'simulated: nonce unavailable' };
            return { available: true, nonce };
        },
        async fetchGasEstimate(params) {
            calls.push('fetchGasEstimate');
            this.lastGasEstimateParams = params;
            if (unavailableFor === 'fetchGasEstimate') return { available: false, reason: 'simulated: gas estimate unavailable' };
            return { available: true, gasLimit };
        },
        async fetchGasPrice() {
            calls.push('fetchGasPrice');
            if (unavailableFor === 'fetchGasPrice') return { available: false, reason: 'simulated: gas price unavailable' };
            return { available: true, gasPriceWei };
        },
        async fetchMaxPriorityFeePerGas() {
            calls.push('fetchMaxPriorityFeePerGas');
            if (unavailableFor === 'fetchMaxPriorityFeePerGas') return { available: false, reason: 'simulated: priority fee unavailable' };
            return { available: true, maxPriorityFeePerGasWei };
        }
    };
}

function jsonResponse(body) {
    return { ok: true, status: 200, json: async () => body };
}

// A fake Base JSON-RPC endpoint speaking the four NEW methods this
// milestone wraps — never a real network call.
function fakeConstructionRpcFetch({
    nonceHex = '0x5', gasLimitHex = '0x9c40', gasPriceHex = '0x3b9aca00', priorityFeeHex = '0x5f5e100',
    throwFor = null, malformedMethod = null
} = {}) {
    return async (_url, options) => {
        const body = JSON.parse(options.body);
        if (throwFor === body.method) throw new Error('simulated: network unreachable');
        if (malformedMethod === body.method) return jsonResponse({ jsonrpc: '2.0', id: 1, result: 'not-a-hex-quantity' });
        if (body.method === 'eth_getTransactionCount') return jsonResponse({ jsonrpc: '2.0', id: 1, result: nonceHex });
        if (body.method === 'eth_estimateGas') return jsonResponse({ jsonrpc: '2.0', id: 1, result: gasLimitHex });
        if (body.method === 'eth_gasPrice') return jsonResponse({ jsonrpc: '2.0', id: 1, result: gasPriceHex });
        if (body.method === 'eth_maxPriorityFeePerGas') return jsonResponse({ jsonrpc: '2.0', id: 1, result: priorityFeeHex });
        throw new Error(`test helper does not stub method ${body.method}`);
    };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — BasePublicationCommitmentEncoding.
    // ---------------------------------------------------------------
    {
        const data = encodeBasePublicationCommitment(CONTENT_HASH);
        assert(data === '0x' + CONTENT_HASH, '1. encoding is the raw contentHash bytes, "0x"-prefixed, nothing wrapped around them');
        assert(decodeBasePublicationCommitment(data) === CONTENT_HASH, '2. decoding is the exact inverse of encoding');

        // No ABI encoding, no function selector, no ForkBuild-specific
        // tag: the data is EXACTLY 2 ("0x") + contentHash.length characters
        // long — never longer.
        assert(data.length === 2 + CONTENT_HASH.length, '3. no bytes are added beyond the "0x" prefix and the contentHash itself');

        assert(encodeBasePublicationCommitment(CONTENT_HASH.toUpperCase()) === '0x' + CONTENT_HASH, '4. case-normalized to lowercase');
        assert(decodeBasePublicationCommitment('0x' + CONTENT_HASH.toUpperCase()) === CONTENT_HASH, '5. decoding is also case-normalized');

        expectThrows(() => encodeBasePublicationCommitment('abc'), '6. an odd-length hex string is refused — a transaction data field is whole bytes');
        expectThrows(() => encodeBasePublicationCommitment('not-hex'), '7. a non-hex string is refused');
        expectThrows(() => encodeBasePublicationCommitment(''), '8. an empty contentHash is refused');
        expectThrows(() => decodeBasePublicationCommitment('deadbeef'), '9. data missing its "0x" prefix is refused');
        expectThrows(() => decodeBasePublicationCommitment('0xabc'), '10. odd-length data is refused');
    }
    console.log('✓ Section A: BasePublicationCommitmentEncoding — symmetric, raw-bytes, no ABI wrapping');

    // ---------------------------------------------------------------
    // Section B — BaseJsonRpcClient's four new RPC methods.
    // ---------------------------------------------------------------
    {
        const client = new BaseJsonRpcClient({ fetchImpl: fakeConstructionRpcFetch() });

        const nonceResult = await client.fetchTransactionCount(ALICE_ADDRESS);
        assert(nonceResult.available === true && nonceResult.nonce === 5, '11. fetchTransactionCount decodes a plain integer nonce');

        const gasResult = await client.fetchGasEstimate({ from: ALICE_ADDRESS, to: ALICE_ADDRESS, value: '0x0', data: '0x' + CONTENT_HASH });
        assert(gasResult.available === true && gasResult.gasLimit === 40000, '12. fetchGasEstimate decodes a plain integer gas limit');

        const gasPriceResult = await client.fetchGasPrice();
        assert(gasPriceResult.available === true && gasPriceResult.gasPriceWei === '1000000000', '13. fetchGasPrice decodes a decimal-digit STRING');
        assert(typeof gasPriceResult.gasPriceWei === 'string', '14. gasPriceWei is never a Number');

        const priorityFeeResult = await client.fetchMaxPriorityFeePerGas();
        assert(priorityFeeResult.available === true && priorityFeeResult.maxPriorityFeePerGasWei === '100000000', '15. fetchMaxPriorityFeePerGas decodes a decimal-digit STRING');

        // Never throws — every failure mode is reported honestly.
        const throwingClient = new BaseJsonRpcClient({ fetchImpl: fakeConstructionRpcFetch({ throwFor: 'eth_getTransactionCount' }) });
        const unreachable = await throwingClient.fetchTransactionCount(ALICE_ADDRESS);
        assert(unreachable.available === false && typeof unreachable.reason === 'string', '16. an unreachable host is reported unavailable, never thrown');

        const malformedClient = new BaseJsonRpcClient({ fetchImpl: fakeConstructionRpcFetch({ malformedMethod: 'eth_gasPrice' }) });
        const malformed = await malformedClient.fetchGasPrice();
        assert(malformed.available === false, '17. a malformed eth_gasPrice result is reported unavailable, never thrown');
    }
    console.log('✓ Section B: BaseJsonRpcClient — fetchTransactionCount/fetchGasEstimate/fetchGasPrice/fetchMaxPriorityFeePerGas, real wire behavior, never throwing');

    // ---------------------------------------------------------------
    // Section C — BasePublicationTransactionPlanner.
    // ---------------------------------------------------------------
    {
        // Flagship: a well-funded account produces a real, self-transfer
        // CONSTRUCTED plan.
        const rpcSource = fakeConstructionRpcSource();
        const planner = new BasePublicationTransactionPlanner({ rpcSource });
        const result = await planner.plan({
            contentHash: CONTENT_HASH, address: ALICE_ADDRESS, network: 'mainnet', chainId: MAINNET_CHAIN_ID,
            nativeBalanceWei: '100000000000000000'
        });
        assert(result.built === true, '18. a well-funded account produces a built plan');
        assert(result.from === ALICE_ADDRESS && result.to === ALICE_ADDRESS, '19. SELF-TRANSFER: to is always the identical address as from');
        assert(result.value === '0', '20. value is always "0" — no ETH moves');
        assert(result.data === '0x' + CONTENT_HASH, '21. data carries the raw content hash commitment, unchanged');
        assert(result.nonce === 5 && result.gasLimit === 40000, '22. nonce/gasLimit are read straight through from the rpcSource');
        assert(result.maxFeePerGas === '1000000000' && result.maxPriorityFeePerGas === '100000000', '23. fee figures are read straight through, as strings');
        assert(result.network === 'mainnet' && result.chainId === MAINNET_CHAIN_ID, '24. network/chainId are carried through from the caller-supplied account facts, unchanged');

        // The gas estimate call itself receives the self-transfer shape.
        assert(rpcSource.lastGasEstimateParams.from === ALICE_ADDRESS && rpcSource.lastGasEstimateParams.to === ALICE_ADDRESS, '25. the gas estimate is priced against the real self-transfer shape, not a placeholder');
        assert(rpcSource.lastGasEstimateParams.value === '0x0', '26. the gas estimate is priced with a zero value');
        assert(rpcSource.lastGasEstimateParams.data === '0x' + CONTENT_HASH, '27. the gas estimate is priced with the real commitment data');

        // Insufficient balance — a REAL, positive fact, never confused
        // with an RPC failure.
        const poorResult = await planner.plan({
            contentHash: CONTENT_HASH, address: ALICE_ADDRESS, network: 'mainnet', chainId: MAINNET_CHAIN_ID,
            nativeBalanceWei: '1000000000000' // far below gasLimit(40000) * maxFeePerGas(1e9) = 4e13
        });
        assert(poorResult.built === false && poorResult.unavailable === false, '28. insufficient balance reports built:false, unavailable:false');
        assert(typeof poorResult.reason === 'string' && poorResult.reason.includes('insufficient balance'), '29. the reason names the shortfall honestly');

        // Exact boundary: balance identical to the estimated cost is
        // sufficient (the check is strictly-less-than).
        const exactCost = (40000n * 1000000000n).toString(10);
        const boundaryResult = await planner.plan({
            contentHash: CONTENT_HASH, address: ALICE_ADDRESS, network: 'mainnet', chainId: MAINNET_CHAIN_ID,
            nativeBalanceWei: exactCost
        });
        assert(boundaryResult.built === true, '30. a balance exactly equal to the estimated cost is sufficient');

        // UNAVAILABLE — each of the four reads, failing independently.
        for (const method of ['fetchTransactionCount', 'fetchGasEstimate', 'fetchGasPrice', 'fetchMaxPriorityFeePerGas']) {
            const unavailableSource = fakeConstructionRpcSource({ unavailableFor: method });
            const unavailablePlanner = new BasePublicationTransactionPlanner({ rpcSource: unavailableSource });
            const unavailableResult = await unavailablePlanner.plan({
                contentHash: CONTENT_HASH, address: ALICE_ADDRESS, network: 'mainnet', chainId: MAINNET_CHAIN_ID,
                nativeBalanceWei: '100000000000000000'
            });
            assert(unavailableResult.built === false && unavailableResult.unavailable === true, `31. a failing ${method} reports built:false, unavailable:true`);
        }

        // A throwing rpcSource is tolerated as a last resort, reported
        // unavailable — never thrown out of plan() itself.
        const throwingSource = {
            fetchTransactionCount: () => { throw new Error('simulated throw'); },
            fetchGasEstimate: async () => ({ available: true, gasLimit: 40000 }),
            fetchGasPrice: async () => ({ available: true, gasPriceWei: '1000000000' }),
            fetchMaxPriorityFeePerGas: async () => ({ available: true, maxPriorityFeePerGasWei: '100000000' })
        };
        const throwingPlanner = new BasePublicationTransactionPlanner({ rpcSource: throwingSource });
        const throwingResult = await throwingPlanner.plan({
            contentHash: CONTENT_HASH, address: ALICE_ADDRESS, network: 'mainnet', chainId: MAINNET_CHAIN_ID,
            nativeBalanceWei: '100000000000000000'
        });
        assert(throwingResult.built === false && throwingResult.unavailable === true, '32. a throwing rpcSource is caught and reported unavailable');

        // Caller-contract violations — checked before the rpcSource is
        // ever consulted.
        await expectThrowsAsync(() => planner.plan({ contentHash: 'not-hex', address: ALICE_ADDRESS, network: 'mainnet', chainId: MAINNET_CHAIN_ID, nativeBalanceWei: '0' }), '33. a malformed contentHash is refused');
        await expectThrowsAsync(() => planner.plan({ contentHash: CONTENT_HASH, address: 'not-an-address', network: 'mainnet', chainId: MAINNET_CHAIN_ID, nativeBalanceWei: '0' }), '34. a malformed address is refused');
        await expectThrowsAsync(() => planner.plan({ contentHash: CONTENT_HASH, address: ALICE_ADDRESS, network: 'ethereum', chainId: MAINNET_CHAIN_ID, nativeBalanceWei: '0' }), '35. a network other than "mainnet"/"testnet" is refused');
        await expectThrowsAsync(() => planner.plan({ contentHash: CONTENT_HASH, address: ALICE_ADDRESS, network: 'mainnet', chainId: -1, nativeBalanceWei: '0' }), '36. a non-positive chainId is refused');
        await expectThrowsAsync(() => planner.plan({ contentHash: CONTENT_HASH, address: ALICE_ADDRESS, network: 'mainnet', chainId: MAINNET_CHAIN_ID, nativeBalanceWei: 'not-a-number' }), '37. a malformed nativeBalanceWei is refused');
        expectThrows(() => new BasePublicationTransactionPlanner({}), '38. a missing rpcSource is refused at construction');
        expectThrows(() => new BasePublicationTransactionPlanner({ rpcSource: { fetchTransactionCount: () => {} } }), '39. a partially-shaped rpcSource is refused at construction');
    }
    console.log('✓ Section C: BasePublicationTransactionPlanner — self-transfer, insufficient-balance vs. unavailable, caller-contract violations');

    // ---------------------------------------------------------------
    // Section D — BasePublicationTransactionPlanState.
    // ---------------------------------------------------------------
    {
        assert(isValidBasePublicationTransactionPlanState(BasePublicationTransactionPlanState.IDLE), '40. IDLE is a known state');
        assert(isValidBasePublicationTransactionPlanState(BasePublicationTransactionPlanState.CONSTRUCTING), '41. CONSTRUCTING is a known state');
        assert(isValidBasePublicationTransactionPlanState(BasePublicationTransactionPlanState.CONSTRUCTED), '42. CONSTRUCTED is a known state');
        assert(isValidBasePublicationTransactionPlanState(BasePublicationTransactionPlanState.UNAVAILABLE), '43. UNAVAILABLE is a known state');
        assert(isValidBasePublicationTransactionPlanState(BasePublicationTransactionPlanState.FAILED), '44. FAILED is a known state');
        assert(!isValidBasePublicationTransactionPlanState('optimal'), '45. no sixth, judgment-shaped value is ever recognized');
        assert(Object.keys(BasePublicationTransactionPlanState).length === 5, '46. exactly five states, no more');
    }
    console.log('✓ Section D: BasePublicationTransactionPlanState — closed vocabulary');

    // ---------------------------------------------------------------
    // Section E — BasePublicationTransactionPlanCoordinator.
    // ---------------------------------------------------------------
    {
        const rpcSource = fakeConstructionRpcSource();
        const planner = new BasePublicationTransactionPlanner({ rpcSource });
        const coordinator = new BasePublicationTransactionPlanCoordinator({ basePublicationTransactionPlanner: planner });
        const account = observedAccount();

        await expectThrowsAsync(() => coordinator.construct({ publicationId: '', contentHash: CONTENT_HASH, accountObservation: account }), '47. an empty publicationId is refused');
        await expectThrowsAsync(() => coordinator.construct({ publicationId: 'pub-1', contentHash: '', accountObservation: account }), '48. an empty contentHash is refused');
        await expectThrowsAsync(() => coordinator.construct({ publicationId: 'pub-1', contentHash: CONTENT_HASH, accountObservation: null }), '49. a missing accountObservation is refused');
        const unavailableAccount = new BaseAccountObservation({ state: BaseNetworkObservationState.UNAVAILABLE, address: ALICE_ADDRESS, reason: 'simulated', observedAt: new Date() });
        await expectThrowsAsync(() => coordinator.construct({ publicationId: 'pub-1', contentHash: CONTENT_HASH, accountObservation: unavailableAccount }), '50. a non-OBSERVED accountObservation is refused — this coordinator never observes an account itself');
        expectThrows(() => new BasePublicationTransactionPlanCoordinator({}), '51. a missing planner is refused at construction');

        const outcome = await coordinator.construct({ publicationId: 'pub-1', contentHash: CONTENT_HASH, accountObservation: account });
        assert(outcome.state === BasePublicationTransactionPlanState.CONSTRUCTED, '52. a well-formed request against a well-funded account CONSTRUCTs');
        assert(outcome.construction.publicationId === 'pub-1' && outcome.construction.contentHash === CONTENT_HASH, '53. the construction carries the caller-supplied publicationId/contentHash unchanged');
        assert(outcome.construction.accountObservation === account, '54. the construction carries the EXACT accountObservation instance used, never a copy');
        assert(Object.isFrozen(outcome.construction), '55. a successful construction is frozen');
        assert(Object.isFrozen(outcome.construction.plan), '56. the plan itself is frozen');
        expectThrows(() => { outcome.construction.plan.gasLimit = 999; }, '57. mutating a frozen plan field is refused (strict mode) or silently ignored — checked via a subsequent read');
        assert(outcome.construction.plan.gasLimit === 40000, '58. the frozen plan value is unchanged after an attempted mutation');

        const poorAccount = observedAccount({ nativeBalanceWei: '1' });
        const failedOutcome = await coordinator.construct({ publicationId: 'pub-1', contentHash: CONTENT_HASH, accountObservation: poorAccount });
        assert(failedOutcome.state === BasePublicationTransactionPlanState.FAILED && failedOutcome.construction === null, '59. insufficient balance maps to FAILED, with no construction');
        assert(typeof failedOutcome.reason === 'string' && failedOutcome.reason.length > 0, '60. the planner\'s own reason is forwarded verbatim');

        const unavailablePlanner = new BasePublicationTransactionPlanner({ rpcSource: fakeConstructionRpcSource({ unavailableFor: 'fetchGasPrice' }) });
        const unavailableCoordinator = new BasePublicationTransactionPlanCoordinator({ basePublicationTransactionPlanner: unavailablePlanner });
        const unavailableOutcome = await unavailableCoordinator.construct({ publicationId: 'pub-1', contentHash: CONTENT_HASH, accountObservation: account });
        assert(unavailableOutcome.state === BasePublicationTransactionPlanState.UNAVAILABLE && unavailableOutcome.construction === null, '61. an unreachable RPC read maps to UNAVAILABLE, with no construction');
    }
    console.log('✓ Section E: BasePublicationTransactionPlanCoordinator — caller-contract violations, state mapping, immutable construction');

    // ---------------------------------------------------------------
    // Section F — labels and the describe*() view.
    // ---------------------------------------------------------------
    {
        assert(describeBasePublicationTransactionPlanStateLabel(BasePublicationTransactionPlanState.IDLE) === 'Not yet constructed', '62. IDLE label');
        assert(describeBasePublicationTransactionPlanStateLabel(BasePublicationTransactionPlanState.CONSTRUCTING) === 'Constructing…', '63. CONSTRUCTING label');
        assert(describeBasePublicationTransactionPlanStateLabel(BasePublicationTransactionPlanState.CONSTRUCTED) === 'Transaction plan constructed', '64. CONSTRUCTED label');
        assert(describeBasePublicationTransactionPlanStateLabel(BasePublicationTransactionPlanState.UNAVAILABLE) === 'Base network unavailable', '65. UNAVAILABLE label');
        assert(describeBasePublicationTransactionPlanStateLabel(BasePublicationTransactionPlanState.FAILED) === 'Unable to construct transaction', '66. FAILED label');

        assert(describeBasePublicationTransactionPlan(null).state === BasePublicationTransactionPlanState.IDLE, '67. a null outcome projects to IDLE');

        // Every wei-denominated figure survives end to end as a STRING,
        // even one well past Number.MAX_SAFE_INTEGER — the exact
        // regression this milestone's own review named directly.
        const hugeGasPriceWei = '123456789012345678901234567890'; // far past Number.MAX_SAFE_INTEGER
        const rpcSource = fakeConstructionRpcSource({ gasPriceWei: hugeGasPriceWei });
        const planner = new BasePublicationTransactionPlanner({ rpcSource });
        const coordinator = new BasePublicationTransactionPlanCoordinator({ basePublicationTransactionPlanner: planner });
        const richAccount = observedAccount({ nativeBalanceWei: '999999999999999999999999999999999999999' });
        const outcome = await coordinator.construct({ publicationId: 'pub-1', contentHash: CONTENT_HASH, accountObservation: richAccount });
        assert(outcome.state === BasePublicationTransactionPlanState.CONSTRUCTED, '68. a huge but sufficient balance still constructs');

        const view = describeBasePublicationTransactionPlan(outcome);
        assert(typeof view.maxFeePerGas === 'string' && view.maxFeePerGas === hugeGasPriceWei, '69. maxFeePerGas is preserved EXACTLY, as a string — never rounded through Number');
        assert(typeof view.value === 'string' && view.value === '0', '70. value is a string');
        assert(typeof view.maxPriorityFeePerGas === 'string', '71. maxPriorityFeePerGas is a string');
        assert(typeof view.nonce === 'number' && typeof view.gasLimit === 'number', '72. nonce/gasLimit stay plain, safe integers — never wei-scale values');

        const fixedFieldSet = ['state', 'stateLabel', 'reason', 'publicationId', 'contentHash', 'network', 'chainId', 'from', 'to', 'value', 'data', 'nonce', 'gasLimit', 'maxFeePerGas', 'maxPriorityFeePerGas', 'accountObservedAt', 'constructedAt'];
        assert(fixedFieldSet.every((key) => key in view), '73. the view carries exactly its documented field set');
        assert(Object.keys(view).length === fixedFieldSet.length, '74. the view carries no extra, undocumented field');
        assert(!('valid' in view) && !('safe' in view) && !('recommended' in view) && !('optimal' in view) && !('trusted' in view), '75. never a verdict field of any kind');
    }
    console.log('✓ Section F: labels and the describe*() view — every wei-denominated figure stays a string, end to end');

    // ---------------------------------------------------------------
    // Section G — FLAGSHIP: Bitcoin/Base isolation, and no signing or
    // broadcast of any kind.
    // ---------------------------------------------------------------
    {
        // A real Bitcoin construction pipeline, sitting right beside a
        // real Base one, sharing no state.
        const bitcoinBuilder = new BitcoinAnchorTransactionBuilder({ network: 'mainnet', feeRateSatsPerVByte: 1 });
        const bitcoinCoordinator = new BitcoinAnchorTransactionConstructionCoordinator({ bitcoinAnchorTransactionBuilder: bitcoinBuilder });
        const bitcoinFunding = {
            state: 'observed', // BitcoinAnchorFundingObservationState.OBSERVED's own value
            utxos: [{ txid: 'a'.repeat(64), vout: 0, valueSats: 100000, scriptType: 'p2wpkh' }],
            changeAccount: 'bc1qexampleaddressxxxxxxxxxxxxxxxxxxxxxx',
            observedAt: new Date()
        };
        const bitcoinOutcome = bitcoinCoordinator.construct({ publicationId: 'pub-1', contentHash: CONTENT_HASH, fundingObservation: bitcoinFunding });
        assert(bitcoinOutcome.state === BitcoinAnchorTransactionConstructionState.CONSTRUCTED, '76. the real Bitcoin construction pipeline, unchanged, still works exactly as before');

        const rpcSource = fakeConstructionRpcSource();
        const basePlanner = new BasePublicationTransactionPlanner({ rpcSource });
        const baseCoordinator = new BasePublicationTransactionPlanCoordinator({ basePublicationTransactionPlanner: basePlanner });
        const baseOutcome = await baseCoordinator.construct({ publicationId: 'pub-1', contentHash: CONTENT_HASH, accountObservation: observedAccount() });
        assert(baseOutcome.state === BasePublicationTransactionPlanState.CONSTRUCTED, '77. the SAME contentHash also constructs a real Base plan');

        assert(bitcoinOutcome.construction.plan !== baseOutcome.construction.plan, '78. Bitcoin plan !== Base plan — never the same object');
        assert('inputs' in bitcoinOutcome.construction.plan && 'outputs' in bitcoinOutcome.construction.plan, '79. the Bitcoin plan keeps its own UTXO-shaped vocabulary, untouched by this milestone');
        assert(!('inputs' in baseOutcome.construction.plan) && !('outputs' in baseOutcome.construction.plan), '80. the Base plan never adopts Bitcoin\'s UTXO-shaped vocabulary');
        assert('nonce' in baseOutcome.construction.plan && 'gasLimit' in baseOutcome.construction.plan, '81. the Base plan uses its own account/gas-shaped vocabulary');
        assert(!('nonce' in bitcoinOutcome.construction.plan), '82. the Bitcoin plan never adopts Base\'s account/gas-shaped vocabulary — no generic BlockchainTransactionPlan exists');

        // No signing, ever — scans the entire successful Base result for
        // any vocabulary a signature, private key, or raw signed
        // transaction would use. Mirrors tests/
        // BitcoinAnchorTransactionConstruction.test.js's own Section F
        // exactly, one chain over.
        const serializedBasePlan = JSON.stringify(baseOutcome.construction.plan).toLowerCase();
        for (const forbidden of ['privatekey', 'signature', 'witness', 'txhex', 'seed', 'wif', 'signed', 'rawtransaction']) {
            assert(!serializedBasePlan.includes(forbidden), `83. a constructed Base plan never carries "${forbidden}"`);
        }

        // No broadcast, ever — the fake rpcSource this construction ran
        // against exposes exactly the four read methods this milestone
        // wraps, and nothing shaped like a send/broadcast call was ever
        // made.
        assert(rpcSource.calls.every((call) => ['fetchTransactionCount', 'fetchGasEstimate', 'fetchGasPrice', 'fetchMaxPriorityFeePerGas'].includes(call)), '84. only the four documented read calls were ever made — nothing resembling a broadcast');
        assert(typeof rpcSource.sendRawTransaction === 'undefined' && typeof basePlanner.broadcast === 'undefined', '85. no broadcast capability exists anywhere in this milestone\'s own classes');
    }
    console.log('✓ Section G (FLAGSHIP): Bitcoin/Base isolation — separate plan vocabularies, no signing, no broadcast');

    // ---------------------------------------------------------------
    // Section H — FLAGSHIP: a constructed plan is frozen, and a later,
    // unrelated Base construction never mutates an earlier one.
    // ---------------------------------------------------------------
    {
        const rpcSource = fakeConstructionRpcSource();
        const planner = new BasePublicationTransactionPlanner({ rpcSource });
        const coordinator = new BasePublicationTransactionPlanCoordinator({ basePublicationTransactionPlanner: planner });
        const account = observedAccount();

        const firstOutcome = await coordinator.construct({ publicationId: 'pub-1', contentHash: CONTENT_HASH, accountObservation: account });
        const snapshot = JSON.parse(JSON.stringify(firstOutcome.construction.plan));

        // A second, unrelated construction — against a DIFFERENT
        // rpcSource reporting a materially different network state
        // (a different nonce and fee figures) — never mutates the first.
        const secondRpcSource = fakeConstructionRpcSource({ nonce: 99, gasPriceWei: '9999999999' });
        const secondPlanner = new BasePublicationTransactionPlanner({ rpcSource: secondRpcSource });
        const secondCoordinator = new BasePublicationTransactionPlanCoordinator({ basePublicationTransactionPlanner: secondPlanner });
        await secondCoordinator.construct({ publicationId: 'pub-2', contentHash: CONTENT_HASH, accountObservation: account });

        assert(JSON.stringify(firstOutcome.construction.plan) === JSON.stringify(snapshot), '86. the first construction is byte-identical to its own snapshot after an unrelated, later construction elsewhere');
        assert(firstOutcome.construction.plan.nonce === 5, '87. the first plan\'s own nonce is untouched by the second construction\'s different nonce');
        assert(firstOutcome.construction.plan.maxFeePerGas === '1000000000', '88. the first plan\'s own fee figures are untouched by the second construction\'s different fee figures');
    }
    console.log('✓ Section H (FLAGSHIP): a constructed plan is frozen, and an unrelated later construction never mutates an earlier one');

    console.log('\nAll BasePublicationTransactionConstruction tests passed.');
}

run().catch((error) => {
    console.error('BasePublicationTransactionConstruction.test.js FAILED:', error);
    process.exitCode = 1;
});
