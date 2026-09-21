// 0.8.90 — Explicit Base Network & Account Observation.
//
// The ONE concrete `provider` this milestone ships for base/
// BaseWalletConnection.js — mirroring anchoring/
// BitcoinInjectedProviderWalletAdapter.js's own role exactly (0.8.58), one
// chain over, adapted against a REAL, publicly documented API rather than
// a guess: EIP-1193 (https://eips.ethereum.org/EIPS/eip-1193), the
// standard every Base-capable browser wallet extension (Coinbase Wallet,
// MetaMask, and any other injected `window.ethereum`) already implements
// for `request({ method, params })`.
//
//   window.ethereum (or any object shaped like it — see tests/
//   BaseNetworkObservation.test.js for a fake one)
//           │
//           ▼
//   BaseInjectedProviderWalletAdapter.connect()          (THIS FILE)
//           │
//           ▼
//   the exact `provider.connect()` contract base/BaseWalletConnection.js's
//   own header already documents
//
// TRANSLATES, NEVER WIDENS. The only method this class calls on
// `injectedProvider` is `request({ method: 'eth_requestAccounts' })` — the
// standard EIP-1193 permission request that returns the array of
// addresses the person has approved sharing. It never calls
// `eth_sendTransaction`, `eth_sign`, `personal_sign`, or any other method
// capable of moving funds or producing a signature — this class adds no
// capability beyond the one address it reads, and never reads or forwards
// anything resembling a private key.
//
// NO EXTENSION INSTALLED IS A FIRST-CLASS, EXPECTED OUTCOME — NEVER A
// THROW. `injectedProvider` may be `null`/`undefined` (the ordinary case
// for a browser with no Base-capable wallet extension installed) or an
// object missing `request`; both are reported as the identical honest
// `unavailable` outcome base/BaseWalletConnection.js's own header already
// names — never a constructor throw, and never a crash a person sees as a
// broken page.
//
// A THROWN/REJECTED eth_requestAccounts IS UNAVAILABLE, NEVER A DECLINE —
// mirrors anchoring/BitcoinInjectedProviderWalletAdapter.js's own
// identical restraint: EIP-1193's own documented error code 4001 ("User
// Rejected Request") and every other failure this class cannot further
// distinguish are both reported as `unavailable`. An EMPTY address array —
// a real, receivable EIP-1193 answer with nothing useful in it — is the
// one case this class DOES report as a definite decline, because it is
// not a thrown error at all.
// Bug fix — mirrors nostr/NostrInjectedProviderPublisher.js's own
// DEFAULT_SIGNING_TIMEOUT_MS exactly, one substrate over.
// `request({ method: 'eth_requestAccounts' })` was never bounded by any
// timeout at all, so a real wallet extension whose own response never
// reaches the page (the same "extension background context recycled
// mid-request" failure mode the Nostr fix addressed) left `connect()`
// awaiting forever, with no way to recover, even though the wallet's own
// popup may already have been resolved on its own side.
const DEFAULT_SIGNING_TIMEOUT_MS = 120000;

export class BaseInjectedProviderWalletAdapter {
    constructor({ injectedProvider = null, signingTimeoutMs = DEFAULT_SIGNING_TIMEOUT_MS } = {}) {
        this._injectedProvider = injectedProvider;
        this._signingTimeoutMs = signingTimeoutMs;
    }

    // Matches base/BaseWalletConnection.js's own `provider.connect()`
    // contract exactly — see this file's own header.
    async connect() {
        const provider = this._injectedProvider;
        if (!provider || typeof provider.request !== 'function') {
            return { connected: false, unavailable: true, reason: 'no compatible Base-capable wallet extension was detected in this browser' };
        }

        let accounts;
        try {
            accounts = await withSigningTimeout(provider.request({ method: 'eth_requestAccounts' }), this._signingTimeoutMs, 'eth_requestAccounts');
        } catch (error) {
            return { connected: false, unavailable: true, reason: error && error.message ? error.message : 'wallet connection request could not be completed' };
        }
        if (!Array.isArray(accounts) || accounts.length === 0 || typeof accounts[0] !== 'string' || accounts[0].length === 0) {
            return { connected: false, reason: 'the wallet returned no account — the connection request was declined' };
        }

        return { connected: true, account: accounts[0] };
    }

    // Best-effort only. EIP-1193 defines no standard "revoke this site's
    // permission" call — mirrors anchoring/
    // BitcoinInjectedProviderWalletAdapter.js's own identical restraint;
    // base/BaseWalletConnection.js's own `disconnect()` clears ForkBuild's
    // own state regardless of what this method does.
    disconnect() {
        if (this._injectedProvider && typeof this._injectedProvider.disconnect === 'function') {
            this._injectedProvider.disconnect();
        }
    }
}

// withSigningTimeout(promise, ms, method) -> Promise. Resolves/rejects
// exactly as `promise` does, unless `ms` elapses first, in which case it
// rejects with an Error naming which RPC call never answered — mirrors
// nostr/NostrInjectedProviderPublisher.js's own identically-shaped helper,
// adapted to this file's own convention of folding every thrown error into
// a plain `reason` string rather than a dedicated timeout subclass, since
// this file's own caller already reads `error.message` alone.
function withSigningTimeout(promise, ms, method) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`${method} did not respond within ${ms}ms — check for a pending approval popup from your Base-capable wallet`));
        }, ms);
        Promise.resolve(promise).then(
            (value) => { clearTimeout(timer); resolve(value); },
            (error) => { clearTimeout(timer); reject(error); }
        );
    });
}
