const NETWORK_NAMES = { livenet: 'mainnet', mainnet: 'mainnet', testnet: 'testnet' };

// 0.8.58 — Explicit Bitcoin Wallet Connection & Signing UX.
//
// anchoring/BitcoinWalletConnection.js (new, this milestone) deliberately
// never talks to a browser extension itself — its own header names the
// `provider` it is handed as an injection point, the identical restraint
// anchoring/BitcoinEsploraTransactionBroadcaster.js (0.8.52) already holds
// toward the `fetchImpl` it is handed rather than calling `fetch` itself.
// This class is the ONE concrete `provider` this milestone ships — never a
// "support every Bitcoin wallet" milestone, exactly as docs/Roadmap.md's
// own 0.8.58 entry named as deliberately out of scope.
//
//   window.unisat (or any object shaped like it — see tests/
//   BitcoinWalletConnectionUX.test.js for a fake one, the identical
//   fake-collaborator-over-real-network discipline every adapter test in
//   this codebase already holds)
//           │
//           ▼
//   BitcoinInjectedProviderWalletAdapter.connect()        (THIS FILE)
//           │
//           ▼
//   the exact `provider.connect()` contract anchoring/
//   BitcoinWalletConnection.js's own header already documents
//
// WHY UNISAT'S OWN, REAL, DOCUMENTED API — NOT A GUESS. This codebase has
// no package manager and installs nothing to test against a real wallet.
// Rather than invent a speculative "generic Bitcoin wallet" shape this
// class could never verify against anything real, it adapts exactly one
// wallet extension's own long-stable, publicly documented browser API
// (`requestAccounts()`, `getNetwork()`, `signPsbt(psbtHex)`) — concrete
// enough that a fake standing in for it in a test is a faithful stand-in
// for the real thing, never a fabrication of a contract nobody ships.
// Adapting a second, differently-shaped wallet extension is real,
// separately sized future work — see docs/Roadmap.md, "0.8.58 —
// Deliberately excluded."
//
// TRANSLATES, NEVER WIDENS. Every method this class calls on
// `injectedProvider` is read-then-translate: `requestAccounts()` ->
// `account`, `getNetwork()` -> `network` (mapped through
// `NETWORK_NAMES`, e.g. UniSat's own `"livenet"` becomes this codebase's
// own `"mainnet"` — anchoring/BitcoinAnchorTransactionBuilder.js's own
// vocabulary, unchanged since 0.8.47), `signPsbt(psbtHex)` -> the
// identical `{ signed, psbt, reason }` shape anchoring/
// BitcoinAnchorWalletSigner.js already requires. This class adds no new
// capability beyond what `injectedProvider` itself already offers, and
// never reads or forwards anything resembling a private key — UniSat's own
// real API exposes no such method for this class to even call.
//
// NO EXTENSION INSTALLED IS A FIRST-CLASS, EXPECTED OUTCOME — NEVER A
// THROW. `injectedProvider` may be `null`/`undefined` (the ordinary case
// for the very large share of browsers with no Bitcoin wallet extension
// installed at all) or an object missing one of the three methods this
// class needs; both are reported as the identical honest `unavailable`
// outcome anchoring/BitcoinWalletConnection.js's own header already names
// — never a constructor throw, and never a crash a person sees as a broken
// page.
//
// A THROWN/REJECTED requestAccounts() OR getNetwork() IS UNAVAILABLE,
// NEVER A DECLINE. In UniSat's own real API, `requestAccounts()` rejects
// for the same handful of reasons every injected-wallet call in this
// codebase already treats as indistinguishable from each other: the
// person explicitly clicked "Reject" in the extension's own popup, the
// wallet is locked, or the extension could not be reached at all. This
// class does not — and, from a thrown error alone, cannot — tell those
// apart, so it reports all of them as `unavailable`, mirroring exactly the
// restraint anchoring/BitcoinAnchorWalletSigner.js already holds toward a
// throwing `wallet.signPsbt()`. An EMPTY account list — UniSat's own real,
// documented shape for "the person's popup closed with no account
// selected" — is the one case this class DOES report as a definite
// decline, because it is not a thrown error at all, but a real, receivable
// answer with nothing useful in it.
export class BitcoinInjectedProviderWalletAdapter {
    constructor({ injectedProvider = null } = {}) {
        this._injectedProvider = injectedProvider;
    }

    // Matches anchoring/BitcoinWalletConnection.js's own `provider.connect()`
    // contract exactly — see this file's own header.
    async connect() {
        const provider = this._injectedProvider;
        if (!provider
            || typeof provider.requestAccounts !== 'function'
            || typeof provider.getNetwork !== 'function'
            || typeof provider.signPsbt !== 'function') {
            return { connected: false, unavailable: true, reason: 'no compatible Bitcoin wallet extension was detected in this browser' };
        }

        let accounts;
        try {
            accounts = await provider.requestAccounts();
        } catch (error) {
            return { connected: false, unavailable: true, reason: error && error.message ? error.message : 'wallet connection request could not be completed' };
        }
        if (!Array.isArray(accounts) || accounts.length === 0 || typeof accounts[0] !== 'string' || accounts[0].length === 0) {
            return { connected: false, reason: 'the wallet returned no account — the connection request was declined' };
        }

        let rawNetwork;
        try {
            rawNetwork = await provider.getNetwork();
        } catch (error) {
            return { connected: false, unavailable: true, reason: `could not read the wallet's network: ${error && error.message ? error.message : 'unknown error'}` };
        }
        const network = NETWORK_NAMES[rawNetwork];
        if (!network) {
            return { connected: false, unavailable: true, reason: `the wallet reported an unrecognized network "${rawNetwork}"` };
        }

        return {
            connected: true,
            account: accounts[0],
            network,
            wallet: {
                // Matches anchoring/BitcoinAnchorWalletSigner.js's own
                // `wallet.signPsbt(unsignedPsbt)` contract exactly. Never
                // throws — a rejection or a thrown error from
                // `provider.signPsbt()` is a definite decline (this
                // adapter's own real, documented case is the person
                // clicking "Reject" in the extension's own signing popup),
                // reported as `{ signed: false, reason }`, never
                // `unavailable` — mirroring exactly how requestSignature()
                // itself already treats a wallet's own thrown signing
                // error one layer up.
                async signPsbt(unsignedPsbt) {
                    const psbtHex = toPsbtHex(unsignedPsbt);
                    try {
                        const signedHex = await provider.signPsbt(psbtHex);
                        if (typeof signedHex !== 'string' || signedHex.length === 0) {
                            return { signed: false, reason: 'wallet returned no signed PSBT' };
                        }
                        return { signed: true, psbt: signedHex };
                    } catch (error) {
                        return { signed: false, reason: error && error.message ? error.message : 'wallet declined to sign this PSBT' };
                    }
                }
            }
        };
    }

    // Best-effort only, and only when the real extension happens to expose
    // one — UniSat's own real, documented API offers no universal
    // "revoke this site's permission" call. See anchoring/
    // BitcoinWalletConnection.js's own header, "DISCONNECT IS LOCAL-ONLY,
    // HONESTLY" — that class's own `disconnect()` clears ForkBuild's own
    // state regardless of what this method does.
    disconnect() {
        if (this._injectedProvider && typeof this._injectedProvider.disconnect === 'function') {
            this._injectedProvider.disconnect();
        }
    }
}

// anchoring/BitcoinAnchorWalletSigner.js hands `wallet.signPsbt()` exactly
// what anchoring/BitcoinAnchorPsbtSerializer.js#serialize() returns:
// `{ bytes, hex, base64 }`. UniSat's own real, documented signPsbt() takes
// a hex string — this reads `.hex` when present, and otherwise accepts a
// bare hex/base64 string or raw bytes directly, the identical trio every
// PSBT-accepting method in this codebase's anchoring/ layer already
// accepts.
function toPsbtHex(unsignedPsbt) {
    if (unsignedPsbt && typeof unsignedPsbt === 'object' && typeof unsignedPsbt.hex === 'string') {
        return unsignedPsbt.hex;
    }
    if (typeof unsignedPsbt === 'string') {
        return unsignedPsbt;
    }
    if (unsignedPsbt instanceof Uint8Array) {
        return Array.from(unsignedPsbt, (byte) => byte.toString(16).padStart(2, '0')).join('');
    }
    throw new Error('BitcoinInjectedProviderWalletAdapter: unsignedPsbt must be a serializer result ({ hex }), a hex string, or a Uint8Array');
}
