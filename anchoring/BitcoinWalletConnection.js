import { BitcoinWalletConnectionState } from '../application/BitcoinWalletConnectionState.js';

// 0.8.58 — Explicit Bitcoin Wallet Connection & Signing UX.
//
// anchoring/BitcoinAnchorWalletSigner.js (0.8.50) already drew the line
// this milestone builds the missing approach to: "FORKBUILD NEVER RECEIVES
// A PRIVATE KEY, NEVER GENERATES ONE, NEVER DERIVES A SEED, NEVER STORES A
// WALLET SECRET" — but that class has always required a `wallet` to be
// handed to it already-connected, by whatever caller constructed it. No
// class anywhere in this codebase has ever OBTAINED that `wallet` from a
// real person's own browser extension. This class is that missing piece,
// and nothing more than it:
//
//   an injected `provider`             a browser wallet extension's own
//   (never this codebase's             capability, real or fake — see
//    own wallet logic)                 this file's own "the provider
//           │                          contract" below
//           ▼
//   BitcoinWalletConnection.connect()          (THIS FILE — new)
//           │
//           ├─ definite decline ──► { connected: false, reason }
//           ├─ cannot presently tell ──► { connected: false,
//           │                             unavailable: true, reason }
//           ▼
//   { connected: true, account, network }
//           │
//           ▼
//   .wallet  →  { signPsbt(unsignedPsbt) -> ... }   — the EXACT, narrow
//                shape anchoring/BitcoinAnchorWalletSigner.js already
//                requires, and nothing wider — see this file's own
//                "a capability, never a secret" below.
//
// ForkBuild requests a signature; the wallet decides whether to provide
// it. ForkBuild never becomes the wallet. See docs/Principles.md, "A
// Connection Grants A Capability; It Does Not Grant Trust (0.8.58)."
//
// A CAPABILITY, NEVER A SECRET. This class never receives, generates,
// stores, or even asks for a private key, a seed phrase, a WIF, or a
// wallet encryption password — an injected `provider`'s own `connect()`
// result carries an `account` (a public address) and a `wallet` object
// exposing exactly `signPsbt()`, structurally incapable of carrying
// anything else this class would even know how to read. `.wallet` — the
// one thing this class ever hands to anchoring/BitcoinAnchorWalletSigner.js
// — is never persisted anywhere, never written to storage, and exists only
// as long as this instance's own connected state does; `disconnect()`, and
// nothing else in this codebase, discards it.
//
// A NARROW, EXPLICIT CONNECTION LIFECYCLE — NOTHING GUESSED AT. See
// application/BitcoinWalletConnectionState.js for the full vocabulary
// (DISCONNECTED / CONNECTING / CONNECTED / UNAVAILABLE) this class reports
// its own `.status` through.
//
// CONNECTED IS NEVER TRUSTED. A connected wallet tells this class it has
// an available signing capability and an account — never that the wallet,
// the account, or the person behind it is trustworthy. Nothing in this
// class or anchoring/BitcoinAnchorWalletSigner.js treats `status ===
// CONNECTED` as authorization for anything; every actual signature is
// still independently inspected by anchoring/BitcoinAnchorSignedPsbtInspector.js
// exactly as 0.8.50 already established, entirely unchanged by this file.
//
// A DEFINITE DECLINE IS NEVER CONFUSED WITH AN UNAVAILABLE WALLET. Mirrors
// anchoring/BitcoinAnchorWalletSigner.js's own `wallet.signPsbt()` contract
// precisely, one step earlier in the same handshake:
//
//   provider.connect() -> Promise resolving to
//       { connected: true, account, network,
//         wallet: { signPsbt(unsignedPsbt) -> ... } }
//     | { connected: false, reason }
//           — a DEFINITE no: the user declined the connection request, or
//             the provider refused outright.
//     | { connected: false, unavailable: true, reason }
//           — cannot PRESENTLY tell: no extension installed, the wallet is
//             locked, or it is otherwise unreachable. NEVER treated as a
//             decline.
//     (sync return or Promise — connect() always awaits it)
//
// Throwing is tolerated as a last resort — caught and reported as the
// `unavailable` form, never the definite-decline form — mirroring exactly
// how anchoring/BitcoinAnchorWalletSigner.js already treats a throwing
// wallet.signPsbt().
//
// NEVER AUTOMATIC. Nothing in this class calls connect() on its own —
// there is no auto-connect on construction, no reconnect-on-page-load, no
// retry loop, and no polling for a newly installed extension. Every
// connection and every disconnection is the result of exactly one explicit
// call a caller (eventually a person clicking a button) already chose to
// make.
//
// DISCONNECT IS LOCAL-ONLY, HONESTLY. Most browser wallet extensions offer
// no real way for a website to revoke a permission grant it was given —
// `disconnect()` calls the provider's own `disconnect()` when the provider
// happens to expose one (best effort, any failure ignored), but its own
// guarantee is narrower and unconditional: THIS instance's own reference to
// the wallet's signing capability is discarded, every time, regardless of
// what the provider does or does not support. It never claims to revoke a
// browser extension's own permission grant, which this class has no way to
// control.
export class BitcoinWalletConnection {
    constructor({ provider } = {}) {
        if (!provider || typeof provider.connect !== 'function') {
            throw new Error('BitcoinWalletConnection: a provider capable of connect() is required');
        }
        this._provider = provider;
        this._status = BitcoinWalletConnectionState.DISCONNECTED;
        this._account = null;
        this._network = null;
        this._wallet = null;
    }

    get status() { return this._status; }
    get account() { return this._account; }
    get network() { return this._network; }

    // The one thing this class ever hands to
    // anchoring/BitcoinAnchorWalletSigner.js — null unless CONNECTED, and
    // never anything wider than `{ signPsbt }`. See this file's own header,
    // "A CAPABILITY, NEVER A SECRET."
    get wallet() { return this._status === BitcoinWalletConnectionState.CONNECTED ? this._wallet : null; }

    // Resolves to exactly one of:
    //
    //   { connected: true, account, network }
    //   { connected: false, reason }
    //       — the provider reached a definite no.
    //   { connected: false, unavailable: true, reason }
    //       — cannot presently obtain a connection; retrying later may
    //         succeed.
    //
    // Throws only for a provider-contract violation this class cannot make
    // sense of at all — a `connected: true` result missing `account`,
    // `network`, or a `signPsbt`-capable `wallet` — mirroring exactly how
    // anchoring/BitcoinAnchorWalletSigner.js#requestSignature() already
    // throws for a `signed: true` result carrying no `psbt`. Never throws
    // for an operational connection failure, which is always reported via
    // the return value above.
    async connect() {
        this._status = BitcoinWalletConnectionState.CONNECTING;

        let result;
        try {
            result = await this._provider.connect();
        } catch (error) {
            this._reset(BitcoinWalletConnectionState.UNAVAILABLE);
            return { connected: false, unavailable: true, reason: error.message };
        }

        if (!result || result.connected !== true) {
            const unavailable = !!(result && result.unavailable);
            this._reset(unavailable ? BitcoinWalletConnectionState.UNAVAILABLE : BitcoinWalletConnectionState.DISCONNECTED);
            return {
                connected: false,
                unavailable,
                reason: (result && result.reason) || 'wallet declined to connect'
            };
        }

        if (!result.account || !result.network || !result.wallet || typeof result.wallet.signPsbt !== 'function') {
            this._reset(BitcoinWalletConnectionState.DISCONNECTED);
            throw new Error('BitcoinWalletConnection: provider reported connected: true but did not supply account, network, and a signPsbt-capable wallet');
        }

        this._status = BitcoinWalletConnectionState.CONNECTED;
        this._account = result.account;
        this._network = result.network;
        this._wallet = { signPsbt: (unsignedPsbt) => result.wallet.signPsbt(unsignedPsbt) };

        return { connected: true, account: this._account, network: this._network };
    }

    // Discards this instance's own reference to the wallet's signing
    // capability, unconditionally. See this file's own header, "DISCONNECT
    // IS LOCAL-ONLY, HONESTLY."
    disconnect() {
        if (typeof this._provider.disconnect === 'function') {
            try {
                this._provider.disconnect();
            } catch (_error) {
                // Best-effort only — this instance's own state is cleared
                // below regardless of whether the provider's own disconnect
                // succeeds, fails, or does not exist at all.
            }
        }
        this._reset(BitcoinWalletConnectionState.DISCONNECTED);
    }

    _reset(status) {
        this._status = status;
        this._account = null;
        this._network = null;
        this._wallet = null;
    }
}
