import { BaseNetworkObservationState, isValidBaseNetworkObservationState } from './BaseNetworkObservationState.js';

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const DECIMAL_PATTERN = /^\d+$/;

// 0.8.90 — Explicit Base Network & Account Observation.
//
// The first-class fact record base/BaseNetworkObserver.js's own
// `observeAccount()` returns — never a loose, ad hoc object a coordinator
// assembles by hand. Carries exactly the facts 0.8.90's own proposal named
// as genuinely needed to reason about a future Base publication, and
// nothing else:
//
//   BaseAccountObservation
//       │
//       ├── address           the account this observation is about
//       ├── network            "mainnet" | "testnet" | null (never set on
//       │                      a CHAIN_MISMATCH — see below)
//       ├── chainId             the RPC-reported chain id, ALWAYS carried
//       │                      when the RPC answered at all — even on a
//       │                      mismatch, so a caller can see exactly what
//       │                      chain a person's wallet was actually on
//       ├── nativeBalanceWei    a decimal-digit STRING (never a Number —
//       │                      see this file's own "WHY A STRING" note),
//       │                      present only when state is OBSERVED
//       ├── reason              present only when state is not OBSERVED
//       └── observedAt          THIS observation's own local clock
//
// THIS IS AN OBSERVATION, NOT A PUBLICATION IDENTITY. Nothing about
// observing an account manufactures a `BlockchainPublicationIdentity`
// (application/BlockchainPublicationIdentity.js, 0.8.89) — there is no
// publication yet, and this class carries no `contentHash` or
// `chainReference` field for one to be confused with. See docs/
// Principles.md, "Network Observation Does Not Establish Publication
// Authority (0.8.90)."
//
// WHY A STRING, NEVER A NUMBER, FOR `nativeBalanceWei`. A native ETH
// balance on Base is reported in wei — up to 2^256-1 in the general EVM
// case, and routinely large enough in ordinary use to sit well past
// `Number.MAX_SAFE_INTEGER` once a balance carries even a modest amount of
// ETH. Silently rounding that through a JS `Number` would corrupt the very
// fact this class exists to carry faithfully — so `nativeBalanceWei` is
// always the RPC's own quantity, decoded into a base-10 digit string,
// never coerced into a floating-point number anywhere in this file, base/
// BaseJsonRpcClient.js, or base/BaseNetworkObserver.js.
//
// NEVER LABELED BASE ON A MISMATCH — see application/
// BaseNetworkObservationState.js's own header. A CHAIN_MISMATCH
// observation's `network` is always `null`; its `chainId` is always the
// actually-observed value, carried honestly rather than discarded.
//
// IMMUTABLE, AND NEVER GIVEN A SECOND CONSTRUCTOR PATH — the identical
// discipline application/BlockchainPublicationIdentity.js's own header
// already holds: every field is validated once, at construction, and
// frozen; there is no setter, no wither, and no way to produce a
// "corrected" observation other than observing again.
//
// A FRESH READ, NEVER A CACHED OR REMEMBERED ONE. base/
// BaseNetworkObserver.js mints a new instance on every call to
// `observeAccount()` — this class itself holds no history and compares
// nothing to a previous observation; a caller that wants a HISTORY keeps
// one itself, exactly as application/BitcoinAnchorConfirmationObserver.js's
// own header already establishes one chain over.
export class BaseAccountObservation {
    constructor({ state, address, network = null, chainId = null, nativeBalanceWei = null, reason = null, observedAt } = {}) {
        if (!isValidBaseNetworkObservationState(state)) {
            throw new Error('BaseAccountObservation requires a known BaseNetworkObservationState value for state');
        }
        if (typeof address !== 'string' || !ADDRESS_PATTERN.test(address)) {
            throw new Error('BaseAccountObservation requires address to be a 20-byte hex EVM address');
        }
        const observedAtDate = observedAt instanceof Date ? observedAt : new Date(observedAt);
        if (Number.isNaN(observedAtDate.getTime())) {
            throw new Error('BaseAccountObservation: observedAt must be a valid date');
        }

        if (state === BaseNetworkObservationState.OBSERVED) {
            if (network !== 'mainnet' && network !== 'testnet') {
                throw new Error('BaseAccountObservation: an OBSERVED observation requires network to be "mainnet" or "testnet"');
            }
            if (!Number.isInteger(chainId) || chainId <= 0) {
                throw new Error('BaseAccountObservation: an OBSERVED observation requires a positive integer chainId');
            }
            if (typeof nativeBalanceWei !== 'string' || !DECIMAL_PATTERN.test(nativeBalanceWei)) {
                throw new Error('BaseAccountObservation: an OBSERVED observation requires nativeBalanceWei as a decimal-digit string');
            }
            if (reason !== null) {
                throw new Error('BaseAccountObservation: an OBSERVED observation never carries a reason');
            }
        } else {
            if (network !== null) {
                throw new Error(`BaseAccountObservation: a ${state} observation never names a network`);
            }
            if (nativeBalanceWei !== null) {
                throw new Error(`BaseAccountObservation: a ${state} observation never carries a native balance`);
            }
            if (typeof reason !== 'string' || !reason.trim()) {
                throw new Error(`BaseAccountObservation: a ${state} observation requires a non-empty reason`);
            }
            if (state === BaseNetworkObservationState.CHAIN_MISMATCH && (!Number.isInteger(chainId) || chainId <= 0)) {
                throw new Error('BaseAccountObservation: a CHAIN_MISMATCH observation requires the positive integer chainId actually observed');
            }
            if (state === BaseNetworkObservationState.UNAVAILABLE && chainId !== null) {
                throw new Error('BaseAccountObservation: an UNAVAILABLE observation never carries a chainId — the RPC source was never reached far enough to report one');
            }
        }

        this._state = state;
        this._address = address;
        this._network = network;
        this._chainId = chainId;
        this._nativeBalanceWei = nativeBalanceWei;
        this._reason = reason;
        this._observedAt = observedAtDate;
        Object.freeze(this);
    }

    get state() { return this._state; }
    get address() { return this._address; }
    get network() { return this._network; }
    get chainId() { return this._chainId; }
    get nativeBalanceWei() { return this._nativeBalanceWei; }
    get reason() { return this._reason; }
    get observedAt() { return this._observedAt; }

    toJSON() {
        return {
            state: this._state,
            address: this._address,
            network: this._network,
            chainId: this._chainId,
            nativeBalanceWei: this._nativeBalanceWei,
            reason: this._reason,
            observedAt: this._observedAt.toISOString()
        };
    }

    static fromJSON(json) {
        if (!json) return null;
        return new BaseAccountObservation({
            state: json.state,
            address: json.address,
            network: json.network,
            chainId: json.chainId,
            nativeBalanceWei: json.nativeBalanceWei,
            reason: json.reason,
            observedAt: json.observedAt
        });
    }
}
