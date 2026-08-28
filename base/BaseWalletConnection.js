import { BaseWalletConnectionState } from '../application/BaseWalletConnectionState.js';

// 0.8.90 — Explicit Base Network & Account Observation.
//
// anchoring/BitcoinWalletConnection.js (0.8.58) obtains a signing
// capability from a connected wallet. This class obtains something
// deliberately narrower: an ACCOUNT ADDRESS, and nothing else.
//
//   injected `provider`
//   (window.ethereum-shaped, real or fake — see
//    base/BaseInjectedProviderWalletAdapter.js)
//           │
//           ▼
//   BaseWalletConnection.connect()                (THIS FILE — new)
//           │
//           ├─ definite decline ──► { connected: false, reason }
//           ├─ cannot presently tell ──► { connected: false,
//           │                             unavailable: true, reason }
//           ▼
//   { connected: true, account }
//
// NO `.wallet` GETTER. NO SIGNING METHOD OF ANY KIND. This is the load-
// bearing difference from anchoring/BitcoinWalletConnection.js: that class
// exists specifically to hand a `.wallet.signPsbt()` capability to
// anchoring/BitcoinAnchorWalletSigner.js. Nothing in this milestone signs a
// Base transaction, so this class exposes nothing that could be mistaken
// for that capability — only `.status` and `.account`. See docs/
// Principles.md, "Account Identity Is Not Signing Capability (0.8.90)."
//
// NO CHAIN ID, NO NETWORK. Deliberately absent — see application/
// BaseWalletConnectionView.js's own header on why chain identity is
// entirely base/BaseNetworkObserver.js's own job, established via a real
// RPC call, never taken on a connected provider's own self-report.
//
// A DEFINITE DECLINE IS NEVER CONFUSED WITH AN UNAVAILABLE WALLET —
// mirrors anchoring/BitcoinWalletConnection.js's own provider contract
// exactly:
//
//   provider.connect() -> Promise resolving to
//       { connected: true, account }
//     | { connected: false, reason }
//           — a DEFINITE no: the person declined the connection request.
//     | { connected: false, unavailable: true, reason }
//           — cannot PRESENTLY tell: no extension installed, the wallet is
//             locked, or it is otherwise unreachable. NEVER treated as a
//             decline.
//     (sync return or Promise — connect() always awaits it)
//
// Throwing is tolerated as a last resort — caught and reported as the
// `unavailable` form, mirroring anchoring/BitcoinWalletConnection.js's own
// identical restraint.
//
// NEVER AUTOMATIC. No auto-connect on construction, no reconnect-on-page-
// load, no retry loop, and no polling. Every connection and disconnection
// is the result of exactly one explicit call a caller already chose to
// make.
//
// DISCONNECT IS LOCAL-ONLY, HONESTLY — the identical, unconditional
// restraint anchoring/BitcoinWalletConnection.js's own header already
// holds: this instance's own reference to the account is discarded every
// time, regardless of what (if anything) the provider's own `disconnect()`
// does.
export class BaseWalletConnection {
    constructor({ provider } = {}) {
        if (!provider || typeof provider.connect !== 'function') {
            throw new Error('BaseWalletConnection: a provider capable of connect() is required');
        }
        this._provider = provider;
        this._status = BaseWalletConnectionState.DISCONNECTED;
        this._account = null;
    }

    get status() { return this._status; }
    get account() { return this._account; }

    // Resolves to exactly one of:
    //
    //   { connected: true, account }
    //   { connected: false, reason }
    //   { connected: false, unavailable: true, reason }
    //
    // Throws only for a provider-contract violation this class cannot make
    // sense of — a `connected: true` result missing `account` — mirroring
    // anchoring/BitcoinWalletConnection.js's own identical restraint. Never
    // throws for an operational connection failure.
    async connect() {
        this._status = BaseWalletConnectionState.CONNECTING;

        let result;
        try {
            result = await this._provider.connect();
        } catch (error) {
            this._reset(BaseWalletConnectionState.UNAVAILABLE);
            return { connected: false, unavailable: true, reason: error.message };
        }

        if (!result || result.connected !== true) {
            const unavailable = !!(result && result.unavailable);
            this._reset(unavailable ? BaseWalletConnectionState.UNAVAILABLE : BaseWalletConnectionState.DISCONNECTED);
            return {
                connected: false,
                unavailable,
                reason: (result && result.reason) || 'wallet declined to connect'
            };
        }

        if (typeof result.account !== 'string' || !result.account) {
            this._reset(BaseWalletConnectionState.DISCONNECTED);
            throw new Error('BaseWalletConnection: provider reported connected: true but did not supply an account');
        }

        this._status = BaseWalletConnectionState.CONNECTED;
        this._account = result.account;

        return { connected: true, account: this._account };
    }

    // Discards this instance's own reference to the account, unconditionally.
    // See this file's own header, "DISCONNECT IS LOCAL-ONLY, HONESTLY."
    disconnect() {
        if (typeof this._provider.disconnect === 'function') {
            try {
                this._provider.disconnect();
            } catch (_error) {
                // Best-effort only.
            }
        }
        this._reset(BaseWalletConnectionState.DISCONNECTED);
    }

    _reset(status) {
        this._status = status;
        this._account = null;
    }
}
