import { BaseNetworkObservationState } from '../application/BaseNetworkObservationState.js';
import { BaseAccountObservation } from '../application/BaseAccountObservation.js';
import { baseNetworkForBaseChainId } from '../application/BaseChainId.js';

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

// 0.8.90 — Explicit Base Network & Account Observation.
//
// docs/Roadmap.md, 0.8.89's own "What's left, and deliberately unbuilt,"
// anticipated exactly this milestone: the first concrete Base capability,
// scoped to observation alone. This class is that capability, and nothing
// more than it:
//
//   an address (a connected base/BaseWalletConnection.js's own `.account`,
//   or any address a caller already holds)
//        │
//        ▼
//   BaseNetworkObserver.observeAccount({ address })     (THIS FILE — new)
//        │
//        ▼
//   injected `rpcSource`
//   (base/BaseJsonRpcClient.js, or a fake in every test)
//        │
//   ┌────┴───────────────┬────────────────┐
//   ▼                     ▼                ▼
// OBSERVED          CHAIN_MISMATCH    UNAVAILABLE
//
// A SEPARATE, EXPLICITLY-TRIGGERED OBSERVATION — NEVER AUTOMATIC. Nothing
// calls this class on wallet connection, on page load, or on a timer —
// mirrors anchoring/BitcoinWalletFundingObserver.js's own identical
// restraint (0.8.60) exactly, one chain over. A caller decides when to
// ask, and asks again, explicitly, whenever it wants a fresher answer.
//
// READ-ONLY, DELIBERATELY. This class never constructs, signs, estimates
// gas for, or broadcasts anything — `rpcSource` is never asked for
// anything beyond `fetchChainId()`/`fetchBalance()`, and this class has no
// method that could do otherwise. See docs/Principles.md, "Network
// Observation Does Not Establish Publication Authority (0.8.90)."
//
// A SINGLE EXPLICIT OPERATION, NOT TWO. 0.8.90's own proposal sketched a
// separate `observeChain()` alongside `observeAccount()`. This class
// builds only the latter: every field the proposal's own UI mockup shows
// — network, chain id, account, balance, observed-at — belongs to ONE
// observation of ONE address, made by ONE explicit action, mirroring
// exactly how anchoring/BitcoinWalletFundingObserver.js's own
// `observeFunding()` and anchoring/BitcoinAnchorConfirmationObserver.js's
// own `observeConfirmation()` are each a single call, never a pair a
// caller must sequence and reconcile itself.
//
// THE CHAIN CHECK ALWAYS RUNS FIRST, AND GATES THE BALANCE READ. Reading a
// balance from the wrong chain would silently attach a real number to a
// network fact nobody asked to observe. `observeAccount()` never calls
// `rpcSource.fetchBalance()` unless `rpcSource.fetchChainId()` already
// reported a chain id `application/BaseChainId.js` recognizes as Base — a
// CHAIN_MISMATCH observation carries the actual chain id observed, but
// never a balance, and never a `network` label. See application/
// BaseNetworkObservationState.js's own header.
//
// A `rpcSource` has exactly this shape — the identical injected-capability
// discipline anchoring/BitcoinAnchorConfirmationObserver.js already holds
// for `confirmationSource`, sized for what THIS class reads instead:
//
//   { fetchChainId() ->
//       { available: true, chainId }
//     | { available: false [, reason] }
//     fetchBalance(address) ->
//       { available: true, balanceWei }
//     | { available: false [, reason] }
//     (sync return or Promise — observeAccount() always awaits both) }
//
// Throwing is tolerated as a last resort — observeAccount() catches it and
// reports the UNAVAILABLE form — mirroring exactly how anchoring/
// BitcoinAnchorConfirmationObserver.js already treats a throwing
// confirmationSource.
export class BaseNetworkObserver {
    constructor({ rpcSource } = {}) {
        if (!rpcSource || typeof rpcSource.fetchChainId !== 'function' || typeof rpcSource.fetchBalance !== 'function') {
            throw new Error('BaseNetworkObserver: an rpc source is required');
        }
        this._rpcSource = rpcSource;
    }

    // Resolves to exactly one, frozen BaseAccountObservation
    // (application/BaseAccountObservation.js):
    //
    //   { state: OBSERVED, address, network, chainId, nativeBalanceWei,
    //     reason: null, observedAt }
    //   { state: CHAIN_MISMATCH, address, network: null, chainId, // the
    //     actually-observed chain id
    //     nativeBalanceWei: null, reason, observedAt }
    //   { state: UNAVAILABLE, address, network: null, chainId: null,
    //     nativeBalanceWei: null, reason, observedAt }
    //
    // `observedAt` is THIS call's own local clock, never a timestamp the
    // rpc source itself reports — the identical restraint anchoring/
    // BitcoinAnchorConfirmationObserver.js's own header already draws.
    //
    // Throws only for a caller-contract violation — a missing/malformed
    // `address` — checked before the injected rpcSource is ever consulted.
    // Never throws for the source's own operational failure.
    async observeAccount({ address } = {}) {
        if (typeof address !== 'string' || !ADDRESS_PATTERN.test(address)) {
            throw new Error('BaseNetworkObserver: address must be a 20-byte hex EVM address');
        }
        const observedAt = new Date();

        let chainResult;
        try {
            chainResult = await this._rpcSource.fetchChainId();
        } catch (error) {
            chainResult = { available: false, reason: error.message };
        }
        if (!chainResult || chainResult.available !== true || !Number.isInteger(chainResult.chainId) || chainResult.chainId <= 0) {
            return unavailable({
                address, observedAt,
                reason: (chainResult && chainResult.reason) || 'Base RPC did not report a chain id'
            });
        }

        const network = baseNetworkForBaseChainId(chainResult.chainId);
        if (!network) {
            return new BaseAccountObservation({
                state: BaseNetworkObservationState.CHAIN_MISMATCH,
                address,
                chainId: chainResult.chainId,
                reason: `connected network reports chain id ${chainResult.chainId}, which is not a known Base network`,
                observedAt
            });
        }

        let balanceResult;
        try {
            balanceResult = await this._rpcSource.fetchBalance(address);
        } catch (error) {
            balanceResult = { available: false, reason: error.message };
        }
        if (!balanceResult || balanceResult.available !== true || typeof balanceResult.balanceWei !== 'string' || !/^\d+$/.test(balanceResult.balanceWei)) {
            return unavailable({
                address, observedAt,
                reason: (balanceResult && balanceResult.reason) || `could not read the native balance for ${address}`
            });
        }

        return new BaseAccountObservation({
            state: BaseNetworkObservationState.OBSERVED,
            address,
            network,
            chainId: chainResult.chainId,
            nativeBalanceWei: balanceResult.balanceWei,
            observedAt
        });
    }
}

function unavailable({ address, observedAt, reason }) {
    return new BaseAccountObservation({
        state: BaseNetworkObservationState.UNAVAILABLE,
        address, reason, observedAt
    });
}
