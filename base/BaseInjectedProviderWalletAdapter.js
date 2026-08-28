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
export class BaseInjectedProviderWalletAdapter {
    constructor({ injectedProvider = null } = {}) {
        this._injectedProvider = injectedProvider;
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
            accounts = await provider.request({ method: 'eth_requestAccounts' });
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
