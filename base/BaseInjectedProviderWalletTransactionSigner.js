const HEX_QUANTITY_INT_FIELDS = ['chainId', 'nonce', 'gas'];
const HEX_QUANTITY_DECIMAL_STRING_FIELDS = ['maxFeePerGas', 'maxPriorityFeePerGas', 'value'];

// 0.8.93 — Explicit Base Reviewed Transaction Signing.
//
// The ONE concrete `wallet` this milestone ships for `base/
// BaseTransactionSigner.js`/`base/BaseReviewedTransactionSigner.js` —
// mirroring `base/BaseInjectedProviderWalletAdapter.js`'s own role exactly
// (0.8.90), one signing capability over: EIP-1193
// (https://eips.ethereum.org/EIPS/eip-1193)'s `request({ method, params })`,
// this time calling `eth_signTransaction` — the standard Ethereum JSON-RPC
// method that returns a signed, serialized transaction WITHOUT
// broadcasting it, exactly the capability this milestone needs and no
// more.
//
//   window.ethereum (or any object shaped like it — see tests/
//   BaseReviewedTransactionSigning.test.js for a fake one)
//           │
//           ▼
//   BaseInjectedProviderWalletTransactionSigner.signTransaction()  (THIS
//           │                                                       FILE)
//           ▼
//   the exact `wallet.signTransaction()` contract `base/
//   BaseTransactionSigner.js`'s own header already documents
//
// TRANSLATES, NEVER WIDENS. The only method this class calls on
// `injectedProvider` is `request({ method: 'eth_signTransaction', params:
// [...] })` — never `eth_sendTransaction` (which would broadcast),
// `eth_sign`, or `personal_sign`. This class adds no capability beyond
// turning an already-built `transactionRequest` into the hex-quantity
// shape EIP-1193's own JSON-RPC parameter encoding expects, and never
// reads or forwards anything resembling a private key.
//
// A PURE FORMAT TRANSLATION, NEVER A DECISION. Every field on the
// outgoing RPC parameter object is copied from `transactionRequest`
// unchanged in VALUE — `chainId`/`nonce`/`gas` (already plain integers)
// and `maxFeePerGas`/`maxPriorityFeePerGas`/`value` (already decimal-digit
// strings, per `base/BaseTransactionSigner.js`'s own contract) are each
// re-expressed as a "0x"-prefixed hex quantity, the wire shape EIP-1193's
// own JSON-RPC methods require for a numeric parameter — no field is
// recomputed, re-estimated, or substituted. `type`/`from`/`to`/`data` are
// passed through byte-for-byte, exactly as `transactionRequest` already
// carries them.
//
// A THROWN/REJECTED eth_signTransaction, OR NO EXTENSION INSTALLED AT
// ALL, IS UNAVAILABLE, NEVER A DECLINE — mirrors `base/
// BaseInjectedProviderWalletAdapter.js`'s own identical restraint toward
// `eth_requestAccounts`: EIP-1193's own documented error code 4001 ("User
// Rejected Request"), a wallet that simply does not implement
// `eth_signTransaction` at all (a real, common limitation — many wallets
// only ever expose `eth_sendTransaction`), and every other failure this
// class cannot further distinguish are all reported as `unavailable`. An
// EMPTY signing result — a real, receivable answer with nothing useful in
// it — is the one case this class DOES report as a definite decline,
// because it is not a thrown error at all.
export class BaseInjectedProviderWalletTransactionSigner {
    constructor({ injectedProvider = null } = {}) {
        this._injectedProvider = injectedProvider;
    }

    // Matches `base/BaseTransactionSigner.js`'s own `wallet.signTransaction()`
    // contract exactly — see this file's own header.
    async signTransaction(transactionRequest) {
        const provider = this._injectedProvider;
        if (!provider || typeof provider.request !== 'function') {
            return { signed: false, unavailable: true, reason: 'no compatible Base-capable wallet extension was detected in this browser' };
        }

        const params = toEip1193TransactionParams(transactionRequest);

        let rawTransaction;
        try {
            rawTransaction = await provider.request({ method: 'eth_signTransaction', params: [params] });
        } catch (error) {
            return { signed: false, unavailable: true, reason: error && error.message ? error.message : 'wallet signing request could not be completed' };
        }
        if (typeof rawTransaction !== 'string' || rawTransaction.length === 0) {
            return { signed: false, reason: 'the wallet returned no signed transaction — the signing request was declined' };
        }

        return { signed: true, rawTransaction };
    }
}

function toEip1193TransactionParams(transactionRequest) {
    const params = { type: transactionRequest.type, from: transactionRequest.from, to: transactionRequest.to, data: transactionRequest.data };
    for (const field of HEX_QUANTITY_INT_FIELDS) {
        params[field] = '0x' + BigInt(transactionRequest[field]).toString(16);
    }
    for (const field of HEX_QUANTITY_DECIMAL_STRING_FIELDS) {
        params[field] = '0x' + BigInt(transactionRequest[field]).toString(16);
    }
    return Object.freeze(params);
}
