// 0.8.90 — Explicit Base Network & Account Observation.
//
// A narrow, explicit connection lifecycle for identifying a Base account —
// mirroring application/BitcoinWalletConnectionState.js's own vocabulary
// (0.8.58) exactly, and deliberately NOT importing or reusing it: a Base
// connection and a Bitcoin connection are two independent facts about two
// independent capabilities, and this codebase never lets one chain's
// connection state double as another's, even when the string values would
// coincide. See docs/Principles.md, "Blockchain Identity Is Explicit; A
// Shared Reference Is Never Evidence Of A Shared Publication (0.8.89)."
//
//   DISCONNECTED — no account identity is currently available.
//   CONNECTING   — a connection request is in flight.
//   CONNECTED    — the provider reports an account address.
//   UNAVAILABLE  — no compatible wallet extension was found, or the
//                  extension could not presently be reached (locked,
//                  crashed, or the request threw). Never confused with a
//                  DEFINITE decline — see base/BaseWalletConnection.js's
//                  own header.
//
// A CONNECTED BASE WALLET GRANTS NO SIGNING CAPABILITY. Unlike application/
// BitcoinWalletConnectionState.js's own CONNECTED (which anchoring/
// BitcoinWalletConnection.js pairs with a real `.wallet.signPsbt()`
// capability), CONNECTED here names only that an account ADDRESS is known
// — base/BaseWalletConnection.js exposes no `.wallet` getter and no
// signing method of any kind. See docs/Roadmap.md, "0.8.90 — Explicit Base
// Network & Account Observation," "Why this should be a separate
// milestone."
export const BaseWalletConnectionState = Object.freeze({
    DISCONNECTED: 'disconnected',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    UNAVAILABLE: 'unavailable'
});

export function isValidBaseWalletConnectionState(value) {
    return Object.values(BaseWalletConnectionState).includes(value);
}
