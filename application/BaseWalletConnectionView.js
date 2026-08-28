import { BaseWalletConnectionState } from './BaseWalletConnectionState.js';

const STATE_LABELS = {
    [BaseWalletConnectionState.DISCONNECTED]: 'Disconnected',
    [BaseWalletConnectionState.CONNECTING]: 'Connecting…',
    [BaseWalletConnectionState.CONNECTED]: 'Connected',
    [BaseWalletConnectionState.UNAVAILABLE]: 'Wallet unavailable'
};

// 0.8.90 — Explicit Base Network & Account Observation.
//
// The label vocabulary for application/BaseWalletConnectionState.js,
// mirroring application/BitcoinWalletConnectionView.js (0.8.58) exactly,
// one chain over, minus the field that vocabulary has no equivalent for
// here.
//
//   describeBaseWalletConnectionStateLabel(state)
//     DISCONNECTED -> "Disconnected"
//     CONNECTING   -> "Connecting…"
//     CONNECTED    -> "Connected"
//     UNAVAILABLE  -> "Wallet unavailable"
//
//   describeBaseWalletConnection(connection)
//     -> { state, stateLabel, address }
//
// NO `networkMismatch` FIELD, DELIBERATELY. application/
// BitcoinWalletConnectionView.js's own `networkMismatch` compares a
// CONNECTED wallet's own self-reported network against an expectation,
// because anchoring/BitcoinWalletConnection.js exposes that network
// directly. base/BaseWalletConnection.js exposes no chain id or network at
// all — see that file's own header on why chain identity is entirely
// base/BaseNetworkObserver.js's own job, established independently via a
// real RPC call, never taken on a wallet's own say-so. Comparing a
// connection's network here would mean trusting exactly the kind of
// unverified, resemblance-based claim docs/Principles.md, "Correlate
// Evidence By Explicit Identity, Never By Resemblance (0.8.78)," already
// warns against — so this view carries no such field for a caller to
// reach for by habit.
//
// Pure and stateless: no constructor, no network access, no history of its
// own. `connection` is read only through its own `status`/`account` — any
// object shaped that way (a real base/BaseWalletConnection.js instance, or
// a plain object a test or a UI's own reactive state constructs) works
// identically.
export function describeBaseWalletConnectionStateLabel(state) {
    return STATE_LABELS[state] || null;
}

export function describeBaseWalletConnection(connection) {
    const state = connection ? connection.status : BaseWalletConnectionState.DISCONNECTED;
    return Object.freeze({
        state,
        stateLabel: describeBaseWalletConnectionStateLabel(state),
        address: connection ? connection.account : null
    });
}
