import { BitcoinWalletConnectionState } from './BitcoinWalletConnectionState.js';

const STATE_LABELS = {
    [BitcoinWalletConnectionState.DISCONNECTED]: 'Disconnected',
    [BitcoinWalletConnectionState.CONNECTING]: 'Connecting…',
    [BitcoinWalletConnectionState.CONNECTED]: 'Connected',
    [BitcoinWalletConnectionState.UNAVAILABLE]: 'Wallet unavailable'
};

// 0.8.58 — Explicit Bitcoin Wallet Connection & Signing UX.
//
// The label vocabulary for application/BitcoinWalletConnectionState.js,
// mirroring exactly how application/BitcoinAnchorContentProofView.js
// (0.8.57) turns application/BitcoinAnchorContentProofState.js's own
// vocabulary into a factual sentence, one domain over.
//
//   describeBitcoinWalletConnectionStateLabel(state)
//     DISCONNECTED -> "Disconnected"
//     CONNECTING   -> "Connecting…"
//     CONNECTED    -> "Connected"
//     UNAVAILABLE  -> "Wallet unavailable"
//
//   describeBitcoinWalletConnection(connection, { expectedNetwork })
//     -> { state, stateLabel, account, network, expectedNetwork,
//          networkMismatch }
//
// THE ONE FACT THIS FILE ADDS THAT NO OTHER "describe*" FUNCTION IN THIS
// CODEBASE HAS NEEDED BEFORE: `networkMismatch`. It is `true` only when
// `connection.status === CONNECTED` AND the wallet's own reported
// `network` differs from `expectedNetwork` (which a caller supplies —
// this file never invents a default opinion about what network a
// publication "should" use; see anchoring/BitcoinAnchorTransactionBuilder.js's
// own `network` option for where that opinion actually lives). It is
// deliberately `false`, never `null` or "unknown," while DISCONNECTED,
// CONNECTING, or UNAVAILABLE — there is no meaningful mismatch to report
// about a wallet that is not currently connected.
//
// A MISMATCH IS REPORTED, NEVER RESOLVED. This function does not switch
// networks, does not disconnect the wallet, and does not pick a
// different one — it only names the disagreement so a caller (eventually
// a person looking at a screen) can decide what to do about it. See
// docs/Principles.md, "A Connection Grants A Capability; It Does Not
// Grant Trust (0.8.58)."
//
// Pure and stateless: no constructor, no network access, no history of its
// own. `connection` is read only through its own `status`/`account`/
// `network` — any object shaped that way (a real
// anchoring/BitcoinWalletConnection.js instance, or a plain object a test
// or a UI's own reactive state constructs) works identically.
export function describeBitcoinWalletConnectionStateLabel(state) {
    return STATE_LABELS[state] || null;
}

export function describeBitcoinWalletConnection(connection, { expectedNetwork = 'mainnet' } = {}) {
    const state = connection ? connection.status : BitcoinWalletConnectionState.DISCONNECTED;
    const account = connection ? connection.account : null;
    const network = connection ? connection.network : null;
    const networkMismatch = state === BitcoinWalletConnectionState.CONNECTED && network !== expectedNetwork;

    return Object.freeze({
        state,
        stateLabel: describeBitcoinWalletConnectionStateLabel(state),
        account,
        network,
        expectedNetwork,
        networkMismatch
    });
}
