import { encodeBasePublicationCommitment } from '../application/BasePublicationCommitmentEncoding.js';

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const DECIMAL_PATTERN = /^\d+$/;
const NATIVE_VALUE_WEI = '0';
const NATIVE_VALUE_HEX = '0x0';

// 0.8.91 — Explicit Base Publication Transaction Construction.
//
// 0.8.90's own `base/BaseNetworkObserver.js` answers "what does Base's
// network currently say about this account?" This class answers the
// next, separate question: "what would an EXPLICIT Base publication
// transaction for this content hash, from this account, actually look
// like?" — and stops exactly there. Never signs, never broadcasts.
//
//   { contentHash, address, network, chainId, nativeBalanceWei }
//   (a caller's own, already-OBSERVED BaseAccountObservation, unpacked)
//           │
//           ▼
//   BasePublicationTransactionPlanner.plan()          (THIS FILE — new)
//           │
//           ├── nonce                 injected rpcSource.fetchTransactionCount()
//           ├── gas limit             injected rpcSource.fetchGasEstimate()
//           ├── max fee per gas       injected rpcSource.fetchGasPrice()
//           ├── priority fee          injected rpcSource.fetchMaxPriorityFeePerGas()
//           │
//   ┌───────┴────────────────┬─────────────────────────┐
//   ▼                        ▼                          ▼
// { built: true, ... }   { built: false,          { built: false,
//   an UNSIGNED PLAN,       unavailable: true }      unavailable: false }
//   not a transaction       an RPC read failed        the account cannot
//                                                      afford this plan
//
// THE ONE ARCHITECTURAL DECISION THIS FILE MAKES: SELF-TRANSFER. `to` is
// always the SAME address as `from` — never a ForkBuild-maintained
// "publication address" (rejected: introduces an address-management
// problem this codebase would then own forever) and never a smart
// contract (rejected outright for this milestone — see docs/Roadmap.md,
// 0.8.91, "The key architectural decision"). A self-transfer needs no
// second party this codebase must generate, store, rotate, or explain,
// while still putting the commitment into a real Base transaction with a
// real, spendable `to` address. `value` is always `"0"` — no ETH moves;
// only `data` carries anything.
//
// THE COMMITMENT ENCODING IS `application/
// BasePublicationCommitmentEncoding.js`'S, UNCHANGED. This class never
// encodes `contentHash` itself — see that file's own header for why the
// encoding is the raw contentHash bytes, nothing wrapped around them.
//
// NEVER SIGNING, NEVER BROADCASTING, NEVER WIRED TO ANY BROADCASTER.
// `plan()` returns a PLAN — an address, a value, a data payload, a nonce,
// a gas limit, and fee figures — never signed bytes, never a raw
// transaction hex string, never anything handed to a network beyond the
// READ calls this class itself makes to price the plan. This class
// imports no signer and no broadcaster of any kind. Connecting "here is a
// plan" to "here is that plan, signed" to "here is that signed plan,
// broadcast" remains three separate, explicit, separately sized future
// milestones — exactly as `anchoring/BitcoinAnchorTransactionBuilder.js`'s
// own header (0.8.47) already reserved that identical sequencing for
// Bitcoin.
//
// NO WALLET MANAGEMENT. This class never generates keys, never derives or
// validates an address beyond the caller-supplied `address`'s own shape,
// and never holds custody of anything. `address`/`network`/`chainId`/
// `nativeBalanceWei` always arrive from a caller's own, already-OBSERVED
// `application/BaseAccountObservation.js` — real account facts are always
// the CALLER's own, exactly as `anchoring/
// BitcoinAnchorTransactionBuilder.js`'s own header already holds toward
// its own caller-supplied `utxos`/`changeAddress`.
//
// FEE FIGURES ARE A READ, NEVER A COMMITMENT, AND NEVER "OPTIMAL."
// `maxFeePerGas` is set directly from the RPC's own `eth_gasPrice`
// reading — a "current price" quote every Base-compatible JSON-RPC
// provider already computes from its own view of the base fee plus a
// reasonable tip, NOT a from-scratch `(baseFeePerGas * 2 +
// maxPriorityFeePerGas)` computation this class deliberately does not
// attempt. `maxPriorityFeePerGas` is carried through from the RPC's own
// `eth_maxPriorityFeePerGas` reading, independently, and this class never
// reconciles the two into a "better" single number — a person reviewing
// the plan sees both values exactly as observed and judges for
// themselves whether they look reasonable. See docs/Roadmap.md, 0.8.91:
// "the UI should avoid pretending that a single observed gas value is
// necessarily the final network cost." Every fee figure this class
// returns describes the moment `plan()` was called — a later network
// change never mutates an already-returned plan; a caller who wants a
// fresher price calls `plan()` again, explicitly.
//
// EVERY WEI-DENOMINATED FIGURE STAYS A DECIMAL-DIGIT STRING, END TO END.
// `nativeBalanceWei` arrives as a string (see `application/
// BaseAccountObservation.js`'s own "WHY A STRING, NEVER A NUMBER"),
// `maxFeePerGas`/`maxPriorityFeePerGas` are returned as strings by
// `base/BaseJsonRpcClient.js` itself, and the affordability check below
// is performed entirely in `BigInt` — `value`, at no point in this file,
// passes through a floating-point `Number`. `nonce` and `gasLimit` are
// the two genuine exceptions, returned as plain integers exactly as
// `base/BaseJsonRpcClient.js`'s own header explains why that is safe.
//
// AN UNAVAILABLE RPC READ IS NEVER THE SAME FACT AS AN UNAFFORDABLE PLAN.
// `built: false, unavailable: true` means this attempt could not
// presently tell what the network reports — retrying later may reach a
// different, more informative answer. `built: false, unavailable: false`
// means the network answered every read and the resulting, fully-priced
// plan genuinely costs more than this account holds — a REAL, positive
// fact about the account, mirroring exactly how `anchoring/
// BitcoinAnchorTransactionBuilder.js#build()`'s own `built: false`
// "insufficient funds" outcome is never confused with an unreachable
// Esplora endpoint one layer below it.
//
// A rpcSource has exactly this shape — sized for what THIS class reads,
// the narrower cousin of the shape base/BaseNetworkObserver.js's own
// header already documents for its own, unrelated two reads:
//
//   { fetchTransactionCount(address) ->
//       { available: true, nonce } | { available: false [, reason] }
//     fetchGasEstimate({ from, to, value, data }) ->
//       { available: true, gasLimit } | { available: false [, reason] }
//     fetchGasPrice() ->
//       { available: true, gasPriceWei } | { available: false [, reason] }
//     fetchMaxPriorityFeePerGas() ->
//       { available: true, maxPriorityFeePerGasWei } | { available: false [, reason] }
//     (sync return or Promise — plan() always awaits all four) }
//
// Throwing is tolerated as a last resort — plan() catches it and reports
// the `unavailable: true` form — mirroring exactly how `base/
// BaseNetworkObserver.js#observeAccount()` already treats a throwing
// rpcSource.
export class BasePublicationTransactionPlanner {
    constructor({ rpcSource } = {}) {
        if (!rpcSource
            || typeof rpcSource.fetchTransactionCount !== 'function'
            || typeof rpcSource.fetchGasEstimate !== 'function'
            || typeof rpcSource.fetchGasPrice !== 'function'
            || typeof rpcSource.fetchMaxPriorityFeePerGas !== 'function') {
            throw new Error('BasePublicationTransactionPlanner: an rpc source is required');
        }
        this._rpcSource = rpcSource;
    }

    // Resolves to exactly one of:
    //
    //   { built: true, network, chainId, from, to, value, data, nonce,
    //     gasLimit, maxFeePerGas, maxPriorityFeePerGas }
    //   { built: false, unavailable: true, reason }
    //       — a nonce/gas-estimate/fee read failed or returned something
    //         malformed.
    //   { built: false, unavailable: false, reason }
    //       — every read succeeded, but the observed native balance
    //         cannot cover the estimated worst-case transaction cost.
    //
    // Throws only for a caller-contract violation — a malformed
    // contentHash, address, network, chainId, or nativeBalanceWei —
    // checked before the injected rpcSource is ever consulted. Never
    // throws for the source's own operational failure.
    async plan({ contentHash, address, network, chainId, nativeBalanceWei } = {}) {
        const data = encodeBasePublicationCommitment(contentHash);
        if (typeof address !== 'string' || !ADDRESS_PATTERN.test(address)) {
            throw new Error('BasePublicationTransactionPlanner: address must be a 20-byte hex EVM address');
        }
        if (network !== 'mainnet' && network !== 'testnet') {
            throw new Error('BasePublicationTransactionPlanner: network must be "mainnet" or "testnet"');
        }
        if (!Number.isInteger(chainId) || chainId <= 0) {
            throw new Error('BasePublicationTransactionPlanner: chainId must be a positive integer');
        }
        if (typeof nativeBalanceWei !== 'string' || !DECIMAL_PATTERN.test(nativeBalanceWei)) {
            throw new Error('BasePublicationTransactionPlanner: nativeBalanceWei must be a decimal-digit string');
        }

        // Self-transfer — see this file's own header on why `to` is
        // always the identical address as `from`.
        const to = address;

        let nonceResult, gasEstimateResult, gasPriceResult, priorityFeeResult;
        try {
            [nonceResult, gasEstimateResult, gasPriceResult, priorityFeeResult] = await Promise.all([
                this._rpcSource.fetchTransactionCount(address),
                this._rpcSource.fetchGasEstimate({ from: address, to, value: NATIVE_VALUE_HEX, data }),
                this._rpcSource.fetchGasPrice(),
                this._rpcSource.fetchMaxPriorityFeePerGas()
            ]);
        } catch (error) {
            return unavailable(error.message);
        }

        if (!nonceResult || nonceResult.available !== true || !Number.isInteger(nonceResult.nonce) || nonceResult.nonce < 0) {
            return unavailable((nonceResult && nonceResult.reason) || `could not read the transaction count for ${address}`);
        }
        if (!gasEstimateResult || gasEstimateResult.available !== true || !Number.isInteger(gasEstimateResult.gasLimit) || gasEstimateResult.gasLimit <= 0) {
            return unavailable((gasEstimateResult && gasEstimateResult.reason) || 'could not estimate gas for this plan');
        }
        if (!gasPriceResult || gasPriceResult.available !== true || typeof gasPriceResult.gasPriceWei !== 'string' || !DECIMAL_PATTERN.test(gasPriceResult.gasPriceWei)) {
            return unavailable((gasPriceResult && gasPriceResult.reason) || 'could not read the current gas price');
        }
        if (!priorityFeeResult || priorityFeeResult.available !== true || typeof priorityFeeResult.maxPriorityFeePerGasWei !== 'string' || !DECIMAL_PATTERN.test(priorityFeeResult.maxPriorityFeePerGasWei)) {
            return unavailable((priorityFeeResult && priorityFeeResult.reason) || 'could not read the current priority fee');
        }

        const nonce = nonceResult.nonce;
        const gasLimit = gasEstimateResult.gasLimit;
        const maxFeePerGas = gasPriceResult.gasPriceWei;
        const maxPriorityFeePerGas = priorityFeeResult.maxPriorityFeePerGasWei;

        // Worst-case cost, entirely in BigInt — see this file's own
        // header, "EVERY WEI-DENOMINATED FIGURE STAYS A DECIMAL-DIGIT
        // STRING, END TO END."
        const estimatedCostWei = BigInt(gasLimit) * BigInt(maxFeePerGas) + BigInt(NATIVE_VALUE_WEI);
        if (BigInt(nativeBalanceWei) < estimatedCostWei) {
            return {
                built: false,
                unavailable: false,
                reason: `insufficient balance: account holds ${nativeBalanceWei} wei, which cannot cover the estimated worst-case cost of ${estimatedCostWei.toString(10)} wei (gas limit ${gasLimit} × max fee per gas ${maxFeePerGas} wei)`
            };
        }

        return {
            built: true,
            network,
            chainId,
            from: address,
            to,
            value: NATIVE_VALUE_WEI,
            data,
            nonce,
            gasLimit,
            maxFeePerGas,
            maxPriorityFeePerGas
        };
    }
}

function unavailable(reason) {
    return { built: false, unavailable: true, reason };
}
