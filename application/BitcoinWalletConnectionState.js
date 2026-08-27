// 0.8.58 — Explicit Bitcoin Wallet Connection & Signing UX.
//
// The vocabulary anchoring/BitcoinWalletConnection.js reports its own
// connection lifecycle in, mirroring exactly how application/
// BitcoinAnchorConfirmationState.js already names the vocabulary
// anchoring/BitcoinAnchorConfirmationObserver.js reports through — an
// anchoring/ domain class imports its own state names from application/,
// never the other way around, the same layering held everywhere else in
// this codebase.
//
//   DISCONNECTED — the state before connect() is ever called, and the
//                  state disconnect() always returns to. No account, no
//                  network, and no signing capability are held.
//   CONNECTING   — a connect() call is in flight.
//   CONNECTED    — a provider reported a real account, network, and
//                  signing capability, all currently held.
//   UNAVAILABLE  — the last connect() attempt could not presently tell
//                  whether a connection was possible — no extension
//                  installed, the wallet is locked, or it could not be
//                  reached. Retrying later may reach a different answer.
//
// CONNECTED IS NEVER TRUSTED. Nothing in this codebase treats `CONNECTED`
// as authorization for anything — it names only that a signing capability
// is currently available, never that the wallet, the account, or the
// person behind it is trustworthy. See anchoring/BitcoinWalletConnection.js's
// own header, and docs/Principles.md, "A Connection Grants A Capability;
// It Does Not Grant Trust (0.8.58)."
//
// A DEFINITE DECLINE IS NOT A FIFTH STATE. A person explicitly declining a
// connection request, or a provider refusing outright, is reported by
// `connect()`'s own return value (`{ connected: false, reason }`) — the
// resulting STATE is simply DISCONNECTED again, exactly as
// anchoring/BitcoinAnchorWalletSigner.js's own `requestSignature()` never
// invented a persisted "declined" state either, only an outcome.
export const BitcoinWalletConnectionState = Object.freeze({
    DISCONNECTED: 'disconnected',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    UNAVAILABLE: 'unavailable'
});

export function isValidBitcoinWalletConnectionState(value) {
    return Object.values(BitcoinWalletConnectionState).includes(value);
}
